import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const exec = promisify(execFile);
const MAX_BRANCHES = 20;
const MAX_DOC_BYTES = 48 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024;
const DEFAULT_FILES = 16;
const MAX_FILES = 40;
const TEXT_FILE = /\.(?:md|mdx|txt|rst|adoc|ya?ml)$/i;
const ROOT_DOC = /^(?:readme|contributing|roadmap|plan|todo|tasks?|design|spec|architecture)(?:[._-]|$)/i;

// All calls are argument-vector based; neither branch names nor tree paths enter a shell.
async function git(root, args, maxBuffer = 512 * 1024) {
  try {
    const { stdout } = await exec('git', ['-C', root, ...args], {
      encoding: 'buffer', timeout: 5000, maxBuffer, windowsHide: true,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat' }
    });
    return stdout;
  } catch { return null; }
}
function utf8(buffer) {
  if (!buffer) return null;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { return null; }
}
function clean(buffer) { return (utf8(buffer) ?? '').trim(); }
function docRank(path) {
  if (!TEXT_FILE.test(path)) return -1;
  const parts = path.split('/');
  const name = parts.at(-1);
  if (parts.length === 1 && /^readme(?:[._-]|$)/i.test(name)) return 0;
  if (parts.length === 1 && ROOT_DOC.test(name)) return 1;
  if (/^(?:docs?|documentation|planning)$/i.test(parts[0])) return /^readme(?:[._-]|$)/i.test(name) ? 2 : 3;
  return -1;
}
function limitedFiles(value) {
  if (value === undefined) return DEFAULT_FILES;
  if (!Number.isFinite(value)) return DEFAULT_FILES;
  return Math.max(0, Math.min(MAX_FILES, Math.floor(value)));
}
async function readDocs(root, ref, maxFiles) {
  if (!maxFiles) return [];
  const listing = utf8(await git(root, ['ls-tree', '-rlz', ref], 2 * 1024 * 1024));
  if (listing === null) return [];
  const candidates = [];
  for (const entry of listing.split('\0')) {
    const tab = entry.indexOf('\t');
    if (tab < 0) continue;
    const match = /^(100644|100755) blob [0-9a-f]+\s+(\d+)$/.exec(entry.slice(0, tab));
    if (!match || Number(match[2]) > MAX_DOC_BYTES) continue; // Excludes symlinks, submodules, oversized blobs.
    const path = entry.slice(tab + 1);
    const rank = docRank(path);
    if (rank >= 0) candidates.push({ path, rank });
  }
  candidates.sort((a, b) => a.rank - b.rank || a.path.localeCompare(b.path));
  const files = [];
  let remaining = MAX_TOTAL_BYTES;
  for (const { path } of candidates) {
    if (files.length >= maxFiles || remaining <= 0) break;
    // Git's object spec is derived only from git-generated refs and paths; no checkout.
    const bytes = await git(root, ['show', '--no-ext-diff', `${ref}:${path}`], MAX_DOC_BYTES + 1024);
    if (!bytes || bytes.length > MAX_DOC_BYTES || bytes.length > remaining) continue;
    const text = utf8(bytes);
    if (text === null || text.includes('\0')) continue;
    files.push({ path, text });
    remaining -= bytes.length;
  }
  return files;
}
function normalIdentities(identities) {
  const values = Array.isArray(identities) ? identities : [];
  return new Set(values.filter(value => typeof value === 'string').map(value => value.trim().toLowerCase()).filter(Boolean));
}
async function authoredRecently(root, mainRef, ref, identities) {
  if (!identities.size) return false;
  // Inspect branch-only history: inherited default-branch commits do not establish authorship.
  const log = utf8(await git(root, ['log', '-12', '--format=%an%x00%ae%x00', `${mainRef}..${ref}`, '--'], 16 * 1024));
  if (!log) return false;
  const parts = log.split('\0');
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const name = parts[i].trim().toLowerCase();
    const email = parts[i + 1].trim().toLowerCase();
    if (identities.has(name) || identities.has(email) || identities.has(`${name} <${email}>`)) return true;
  }
  return false;
}
async function getPaths(root, mainRef, ref) {
  const changed = utf8(await git(root, ['diff', '--name-only', '-z', mainRef, ref, '--'], 128 * 1024));
  return changed === null ? [] : changed.split('\0').filter(Boolean).slice(0, 40);
}

/** Inspect tracked documents in Git without changing the working tree or repository refs. */
export async function collectBranchSources(root, { identities = [], maxFiles } = {}) {
  const empty = { mainBranch: null, currentBranch: null, mainFiles: [], auxiliary: [], branchHints: [] };
  if (typeof root !== 'string' || !root.trim()) return empty;
  root = resolve(root);
  if (!clean(await git(root, ['rev-parse', '--is-inside-work-tree'])).includes('true')) return empty;
  const current = clean(await git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'])) || null;
  const originHead = clean(await git(root, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']));
  let mainRef = null;
  let mainBranch = null;
  if (/^refs\/remotes\/origin\/[^\s:]+$/.test(originHead) &&
      clean(await git(root, ['rev-parse', '--verify', `${originHead}^{commit}`]))) {
    mainRef = originHead;
    mainBranch = originHead.slice('refs/remotes/origin/'.length);
  }
  if (!mainRef) {
    for (const name of ['main', 'master', 'trunk']) {
      for (const ref of [`refs/heads/${name}`, `refs/remotes/origin/${name}`]) {
        if (clean(await git(root, ['rev-parse', '--verify', `${ref}^{commit}`]))) {
          mainRef = ref;
          mainBranch = name;
          break;
        }
      }
      if (mainRef) break;
    }
  }
  if (!mainRef) {
    mainRef = current ? `refs/heads/${current}` : 'HEAD';
    mainBranch = current;
  }
  const currentBranch = current || mainBranch; // Detached HEAD still has usable main/default documentation.
  const cap = limitedFiles(maxFiles);
  const mainFiles = await readDocs(root, mainRef, cap);
  const refs = clean(await git(root, ['for-each-ref', '--sort=-committerdate', `--count=${MAX_BRANCHES}`, '--format=%(refname)', 'refs/heads'], 32 * 1024));
  const allowed = normalIdentities(identities);
  const auxiliary = [];
  for (const ref of refs.split('\n').map(s => s.trim())) {
    if (!/^refs\/heads\/[^\s:]+$/.test(ref) || ref === mainRef || ref === `refs/heads/${mainBranch}`) continue;
    if (!await authoredRecently(root, mainRef, ref, allowed)) continue;
    const branch = ref.slice('refs/heads/'.length);
    const summary = clean(await git(root, ['log', '-1', '--format=%s', ref, '--'], 8 * 1024)).slice(0, 300);
    const paths = await getPaths(root, mainRef, ref);
    const docs = await readDocs(root, ref, Math.min(cap, 3));
    const context = [summary, ...docs.map(file => `${file.path}:\n${file.text.slice(0, 1600)}`)].filter(Boolean).join('\n\n').slice(0, 6000);
    auxiliary.push({ branch, authorMatch: true, summary, paths, context });
  }
  const branchHints = auxiliary.filter(source => source.branch === currentBranch).map(({ branch, summary, paths, context }) => ({ branch, summary, paths, context }));
  return { mainBranch, currentBranch, mainFiles, auxiliary, branchHints };
}
