import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { collectBranchSources } from '../src/branch-sources.mjs';
import { discoverOwnedDocuments } from '../src/ownership.mjs';
import { extractDocumentCandidates } from '../src/document-candidates.mjs';
const exec = promisify(execFile);
async function git(root, ...args) { return exec('git', ['-C', root, ...args], { windowsHide: true }); }

test('authored version tables outrank many asset READMEs and preserve coverage/gap context', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-owned-version-'));
  try {
    await git(root, 'init', '-q', '-b', 'main');
    for (const [dir, slug, action] of [['inventory','inventory-sync','真实来源库存验收'], ['commerce','oms-fulfillment','逆向物流联调'], ['operations','task-scheduling','库存周期任务复验']]) {
      const folder = join(root, 'docs', 'modules', dir); await mkdir(folder, { recursive: true });
      await writeFile(join(folder, `${slug}.v0.1.md`), `---\nowner: "黄耀弘"\nversion: "v0.1"\n---\n# ${action} v0.1\n| 功能 | 当前覆盖 | 目标差距及验收 | 负责人 |\n|---|---|---|---|\n| ${action} | 本地工程已完成 | 真实业务联合验收仍待完成 | 黄耀弘 |\n`);
    }
    await mkdir(join(root,'docs','assets'),{recursive:true});
    for(let i=0;i<55;i++) { const dir=join(root,'docs','assets','case-'+i);await mkdir(dir);await writeFile(join(dir,'README.md'),'historical evidence'); }
    await git(root,'add','.'); await git(root,'-c','user.name=yaohong.huang','-c','user.email=huanglihome@hotmail.com','commit','-qm','version plans');
    await git(root,'update-ref','refs/remotes/origin/main',(await git(root,'rev-parse','HEAD')).stdout.trim());
    await git(root,'symbolic-ref','refs/remotes/origin/HEAD','refs/remotes/origin/main');
    const ids=['huanglihome@hotmail.com'];
    const author=await discoverOwnedDocuments(root,[],ids);
    const docs=await collectBranchSources(root,{identities:ids,preferredPaths:author.paths});
    const ownership=await discoverOwnedDocuments(root,docs.mainFiles,ids);
    const rows=extractDocumentCandidates(docs.mainFiles,[...ids,...ownership.aliases]);
    assert.deepEqual(ownership.aliases,['黄耀弘']);
    for (const word of ['inventory-sync','oms-fulfillment','task-scheduling']) {
      const row=rows.slice(0,60).find(item=>item.source.includes(word));
      assert.ok(row,`${word} missing from first 60 candidates`);
      assert.match(row.context,/本地工程已完成/);
      assert.match(row.context,/真实业务联合验收仍待完成/);
    }
  } finally { await rm(root,{recursive:true,force:true}); }
});
