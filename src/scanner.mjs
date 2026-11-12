import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { homedir, userInfo } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { classifyCandidates } from './classifier.mjs';
import { buildTodoPrompt } from './prompt.mjs';
import { collectBranchSources } from './branch-sources.mjs';
import { extractDocumentCandidates } from './document-candidates.mjs';

const exec = promisify(execFile);
const DOC_NAMES = /^(readme|contributing|roadmap|plan|tasks?|todo|issues?|changelog|design|spec|architecture|project|项目|计划|任务|待办|需求|分工|进度)(\.|$|-|_)/i;
const TEXT_EXT = /\.(md|mdx|txt|rst|adoc|yaml|yml)$/i;
const SKIP = new Set(['.git', 'node_modules', '.next', 'dist', 'build', 'coverage', '.venv', 'vendor', '.dsh', '.idea']);
const MAX_FILES = 100;
const MAX_BYTES = 128 * 1024;
const DEFAULT_DEPTH = 3;

export function normalizedIdentity(config = {}) {
  return [...new Set([config.name, ...(config.aliases ?? []), process.env.GIT_AUTHOR_NAME, process.env.USERNAME, process.env.USER, (() => { try { return userInfo().username; } catch { return ''; } })()].filter(Boolean).map(x => String(x).trim().toLowerCase()))];
}

async function git(projectPath, ...args) {
  try { const { stdout } = await exec('git', ['-C', projectPath, ...args], { timeout: 3500, windowsHide: true, maxBuffer: 256 * 1024 }); return stdout.trim(); }
  catch { return ''; }
}

async function docs(root) {
  const found = [];
  async function walk(dir, depth) {
    if (depth > DEFAULT_DEPTH || found.length >= MAX_FILES) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => (DOC_NAMES.test(b.name) ? 1 : 0) - (DOC_NAMES.test(a.name) ? 1 : 0));
    for (const entry of entries) {
      if (found.length >= MAX_FILES) break;
      if (entry.isSymbolicLink()) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { if (!SKIP.has(entry.name) && !entry.name.startsWith('.')) await walk(path, depth + 1); }
      else if (entry.isFile() && TEXT_EXT.test(entry.name) && (DOC_NAMES.test(entry.name) || /^(docs?|\.github|planning|project|项目|计划|任务|需求)/i.test(relative(root, dir)))) {
        try { if ((await stat(path)).size <= MAX_BYTES) found.push({ path: relative(root, path).replaceAll('\\', '/'), text: await readFile(path, 'utf8') }); } catch {}
      }
    }
  }
  await walk(root, 0);
  return found;
}

async function githubIssues(root, remote, identities) {
  if (!/github\.com[:/]/i.test(remote)) return [];
  try {
    // gh uses the user's existing authentication; no token is saved in this plugin.
    const { stdout } = await exec('gh', ['issue', 'list', '--state', 'open', '--limit', '60', '--json', 'number,title,assignees,url,body'], {
      cwd: root, timeout: 7000, windowsHide: true, maxBuffer: 512 * 1024
    });
    return JSON.parse(stdout).map(issue => ({
      title: issue.title.slice(0, 150), source: issue.url, issue: issue.number,
      assigned: issue.assignees?.some(person => identities.includes(person.login.toLowerCase())) ?? false,
      others: false,
      context: `Issue: ${issue.title}\nAssignees: ${(issue.assignees ?? []).map(person => person.login).join(', ')}\nStatus: open\n${issue.body?.slice(0, 1600) ?? ''}`
    }));
  } catch { return []; }
}
function issueNumber(line) { return line.match(/(?:issue\s*#|#)(\d+)/i)?.[1]; }
function taskLines(files, identities) {
  const rows = [];
  for (const file of files) {
    const lines = file.text.split(/\r?\n/);
    for (let n = 0; n < lines.length; n++) {
      const line = lines[n].trim();
      if (!line || line.length > 450) continue;
      const checkbox = line.match(/^\s*(?:[-*+]\s*)?\[([ xX])\]\s*(.+)/);
      const planned = line.match(/^(?:[-*+]\s*)?(?:TODO|待办|下一步|未完成|进行中|负责人|owner|assignee|issue)\s*[:：\-]\s*(.+)/i);
      if (!checkbox && !planned) continue;
      if (checkbox?.[1]?.toLowerCase() === 'x') continue;
      const raw = (checkbox?.[2] ?? planned?.[1] ?? '').trim();
      if (raw.length < 4) continue;
      const owner = (raw.match(/(?:@([\w.-]+))|(?:负责人|owner|assignee)\s*[:：]\s*([^\s,，;；]+)/i)?.[1] ?? raw.match(/(?:负责人|owner|assignee)\s*[:：]\s*([^\s,，;；]+)/i)?.[1] ?? '').toLowerCase();
      const assigned = identities.some(identity => identity && owner === identity);
      const others = Boolean(owner) && !assigned;
      const context = lines.slice(Math.max(0, n - 5), Math.min(lines.length, n + 6)).join('\n').slice(0, 2200);
      rows.push({ title: raw.replace(/(?:负责人|owner|assignee)\s*[:：]\s*[^\s,，;；]+/gi, '').trim().slice(0, 150), source: `${file.path}:${n + 1}`, assigned, others, issue: issueNumber(raw), context });
    }
  }
  return rows;
}

function guessIdentity(files, gitName, gitEmail, aliases) {
  const names = [...new Set([gitName, gitEmail, ...aliases].filter(Boolean))];
  const evidence = [];
  for (const file of files) {
    for (const name of names) {
      const matched = file.text.split(/\r?\n/).find(line => line.toLowerCase().includes(name.toLowerCase()) && /负责|owner|assignee|maintain|开发|贡献|author/i.test(line));
      if (matched) evidence.push(`${file.path}: ${matched.trim().slice(0, 120)}`);
      if (evidence.length >= 5) break;
    }
    if (evidence.length >= 5) break;
  }
  return { name: gitName || aliases[0] || null, email: gitEmail || null, aliases, confidence: evidence.length ? 'high' : gitName ? 'medium' : 'low', evidence };
}

export async function scanProject(projectPath, options = {}) {
  if (typeof projectPath !== 'string' || !projectPath.trim()) throw new Error('请选择项目目录');
  const root = resolve(projectPath);
  if (!(await stat(root)).isDirectory()) throw new Error('项目路径不是目录');
  // Only read project files. Persistent data is stored by store.mjs under DSH_HOME.
  const [gitName, gitEmail, remote, ghLogin, branch] = await Promise.all([
    git(root, 'config', 'user.name'), git(root, 'config', 'user.email'), git(root, 'remote', 'get-url', 'origin'),
    exec('gh', ['api', 'user', '--jq', '.login'], { timeout: 2000, windowsHide: true }).then(result => result.stdout.trim()).catch(() => ''),
    git(root, 'branch', '--show-current')
  ]);
  const aliases = [...normalizedIdentity(options), ghLogin.toLowerCase()].filter(Boolean);
  const identities = [...aliases, gitName?.toLowerCase(), gitEmail?.toLowerCase()].filter(Boolean);
  const branches = await collectBranchSources(root, { identities });
  const files = branches.mainFiles.length ? [] : await docs(root);
  const primaryFiles = branches.mainFiles.length ? branches.mainFiles : files;
  const identity = guessIdentity(primaryFiles, gitName, gitEmail, aliases);
  if (ghLogin) identity.githubLogin = ghLogin;
  // Prefer committed default-branch docs; working-tree documents are fallback.
  const documentRows = extractDocumentCandidates(primaryFiles, identities);
  const issuesPromise = githubIssues(root, remote, identities);
  const candidatesFrom = rows => rows.slice(0, 60).map(row => ({
    id: createHash('sha256').update(`${root}\n${row.source}\n${row.title}`).digest('hex').slice(0, 20),
    title: row.title, source: row.source,
    context: [row.context, ...branches.auxiliary.filter(branch => branch.context.toLowerCase().includes(row.title.toLowerCase().slice(0, 8)))
      .slice(0, 2).map(branch => `辅助分支 ${branch.branch}（本人提交）：${branch.summary}`)].join('\n').slice(0, 2500),
    explicitAssignee: row.explicitAssignee ?? row.assigned, issue: row.issue, kind: row.kind ?? 'issue', heading: row.heading
  }));
  const branchContext = { mainBranch: branches.mainBranch, currentBranch: branches.currentBranch,
    mainProgress: branches.branchHints.filter(item => item.branch === branches.mainBranch).slice(0, 1),
    auxiliary: branches.auxiliary.slice(0, 4).map(({ branch, summary, paths, context }) => ({ branch, summary, paths: paths.slice(0, 10), context: context.slice(0, 300) })) };
  const makeTodos = relevant => relevant.map(row => {
    const todo = { id: row.id, title: row.title,
      summary: `${row.kind === 'feature' ? '功能版本' : row.kind === 'task' ? '项目文档' : 'Issue'} · ${row.source} · ${row.reason}`,
      source: row.issue ? `${row.source} · issue #${row.issue}` : row.source,
      status: 'open', progress: row.progress, priority: row.priority, effort: row.effort,
      confidence: row.ownershipConfidence, ownerEvidence: row.ownerEvidence, actionEvidence: row.actionEvidence };
    return { ...todo, recommendedPrompt: buildTodoPrompt(todo, { branch }) };
  });
  const ranks = { urgent: 0, high: 1, normal: 2, low: 3 };
  const accepted = [];
  // Prioritize short document batches before waiting for the Issue CLI/network.
  // Every displayed slice has been verified by AI; raw candidates never leak.
  const analyze = async rows => {
    for (let i = 0; i < rows.length; i += 6) {
      const batch = candidatesFrom(rows.slice(i, i + 6));
      const verified = await classifyCandidates({ identity, candidates: batch, classify: options.classify, branchContext });
      accepted.push(...verified);
      if (verified.length && typeof options.onPartial === 'function') await options.onPartial(makeTodos(accepted).sort((a, b) => ranks[a.priority] - ranks[b.priority]));
    }
  };
  await analyze(documentRows.slice(0, 60));
  const issues = await issuesPromise;
  await analyze(issues.slice(0, 15));
  const todos = makeTodos(accepted).sort((a, b) => ranks[a.priority] - ranks[b.priority]);
  return { projectPath: root, projectName: basename(root), branch: branch || null, mainBranch: branches.mainBranch,
    identity, todos, scannedAt: new Date().toISOString(), sources: primaryFiles.map(file => file.path), remote: remote || null };
}

export const LOCAL_DATA_DIR = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'project-todo');
