import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectBranchSources } from '../src/branch-sources.mjs';

const exec = promisify(execFile);
async function git(root, ...args) { return (await exec('git', ['-C', root, ...args], { windowsHide: true })).stdout.trim(); }
async function commit(root, name, email, message) {
  await git(root, '-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '-am', message);
}

test('reads default-branch docs from Git, filters branches by recent author, and never checks out', async () => {
  const root = await mkdtemp(join(tmpdir(), 'branch-sources-'));
  try {
    await git(root, 'init', '-q', '-b', 'trunk');
    await mkdir(join(root, 'docs'));
    await writeFile(join(root, 'README.md'), '# Trunk tasks\n- [ ] main work\n');
    await writeFile(join(root, 'docs', 'PLAN.md'), 'Project plan from trunk');
    await git(root, 'add', '.');
    await commit(root, 'Maintainer', 'maintainer@example.com', 'Initial docs');
    await git(root, 'branch', 'main');
    await git(root, 'update-ref', 'refs/remotes/origin/trunk', await git(root, 'rev-parse', 'HEAD'));
    await git(root, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');
    await git(root, 'switch', '-q', '-c', 'personal');
    await writeFile(join(root, 'README.md'), '# Personal work\n');
    await commit(root, 'My Person', 'mine@example.com', 'Implement personal feature');
    await git(root, 'switch', '-q', '-c', 'other', 'trunk');
    await writeFile(join(root, 'README.md'), '# Someone else\n');
    await commit(root, 'Another Person', 'other@example.com', 'Unrelated changes');
    await git(root, 'switch', '-q', 'personal');
    const before = await git(root, 'status', '--porcelain');
    await writeFile(join(root, 'docs', 'PLAN.md'), 'Uncommitted plan must not leak');
    const result = await collectBranchSources(root, { identities: ['MINE@example.com'], maxFiles: 2 });
    assert.equal(result.mainBranch, 'trunk');
    assert.equal(result.currentBranch, 'personal');
    assert.deepEqual(result.mainFiles.map(file => file.path), ['README.md', 'docs/PLAN.md']);
    assert.match(result.mainFiles[0].text, /Trunk tasks/);
    assert.equal(result.mainFiles[1].text, 'Project plan from trunk');
    assert.deepEqual(result.auxiliary.map(item => item.branch), ['personal']);
    assert.equal(result.auxiliary[0].authorMatch, true);
    assert.match(result.auxiliary[0].summary, /personal feature/);
    assert.ok(result.auxiliary[0].paths.includes('README.md'));
    assert.match(result.auxiliary[0].context, /Personal work/);
    assert.equal(result.branchHints[0].branch, 'personal');
    const inheritedAuthor = await collectBranchSources(root, { identities: ['maintainer@example.com'], maxFiles: 0 });
    assert.deepEqual(inheritedAuthor.auxiliary, []);
    assert.equal(await git(root, 'branch', '--show-current'), 'personal');
    assert.equal(await readFile(join(root, 'docs', 'PLAN.md'), 'utf8'), 'Uncommitted plan must not leak');
    assert.equal(await git(root, 'status', '--porcelain'), `${before ? `${before}\n` : ''} M docs/PLAN.md`.trim());
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('finds version, feature and release docs including Chinese names beyond 16 defaults', async () => {
  const root = await mkdtemp(join(tmpdir(), 'branch-sources-wide-'));
  try {
    await git(root, 'init', '-q', '-b', 'main');
    for (const dir of ['versions', 'features', 'release', 'milestone', 'notes']) await mkdir(join(root, dir));
    for (let i = 1; i <= 20; i++) await writeFile(join(root, 'versions', `v${String(i).padStart(2, '0')}.md`), `Version ${i}`);
    await writeFile(join(root, 'features', 'new-ui.md'), 'Feature work');
    await writeFile(join(root, 'release', '2027.md'), 'Release plan');
    await writeFile(join(root, 'milestone', 'Q1.md'), 'Milestone work');
    await writeFile(join(root, 'notes', '需求.md'), 'Chinese requirement');
    await writeFile(join(root, 'ignore.md'), 'Not named or in document directory');
    await writeFile(join(root, 'README.md'), '# Main');
    await git(root, 'add', '.');
    await commit(root, 'Main Author', 'main@example.com', 'Document planned features');
    const result = await collectBranchSources(root);
    assert.equal(result.mainFiles.length, 25);
    assert.equal(result.mainFiles[0].path, 'README.md');
    for (const path of ['features/new-ui.md', 'release/2027.md', 'milestone/Q1.md', 'notes/需求.md', 'versions/v20.md']) {
      assert.ok(result.mainFiles.some(file => file.path === path), path);
    }
    assert.ok(!result.mainFiles.some(file => file.path === 'ignore.md'));
    assert.match(result.branchHints.at(-1).context, /Document planned features/);
    assert.ok((await collectBranchSources(root, { maxFiles: 100 })).mainFiles.length <= 40);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('falls back to current branch; tolerates non-repositories and limits documents', async () => {
  const root = await mkdtemp(join(tmpdir(), 'branch-sources-'));
  try {
    assert.deepEqual(await collectBranchSources(root), {
      mainBranch: null, currentBranch: null, mainFiles: [], auxiliary: [], branchHints: []
    });
    await git(root, 'init', '-q', '-b', 'feature');
    await writeFile(join(root, 'README.md'), 'Only committed version');
    await git(root, 'add', '.');
    await commit(root, 'One', 'one@example.com', 'Initial');
    const value = await collectBranchSources(root, { identities: [], maxFiles: 0 });
    assert.equal(value.mainBranch, 'feature');
    assert.equal(value.currentBranch, 'feature');
    assert.deepEqual(value.mainFiles, []);
    assert.deepEqual(value.auxiliary, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});
