import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getProjectTodos, refreshProjectTodos } from '../src/store.mjs';

const valid = row => ({ decisions: [{ id: row.id, include: true, ownershipConfidence: 'high', isActionable: true,
  ownerEvidence: 'owner: fast-test', actionEvidence: '- [ ] 第一项', reason: 'owner', priority: 'urgent', effort: 'small' }] });

test('first GET returns quickly, then partial verified tasks appear while later AI batches continue', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-fast-todo-'));
  try {
    await writeFile(join(root, 'TODO.md'), ['- [ ] 第一项 owner: fast-test', ...Array.from({ length: 7 }, (_, n) => `- [ ] 后续任务${n} owner: fast-test`)].join('\n'));
    let release; const second = new Promise(resolve => { release = resolve; });
    let batches = 0;
    const options = { name: 'fast-test', classify: async ({ candidates }) => {
      batches++;
      if (batches === 2) await second;
      return batches === 1 ? valid(candidates[0]) : { decisions: [] };
    } };
    const first = await getProjectTodos(root, options);
    assert.equal(first.refreshing, true);
    assert.equal(first.todos.length, 0);
    let partial;
    for (let n = 0; n < 100; n++) {
      partial = await getProjectTodos(root, options);
      if (partial.todos.length) break;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    assert.equal(partial.refreshing, true);
    assert.equal(partial.todos[0].priority, 'urgent');
    release();
    const final = await refreshProjectTodos(root, options);
    assert.equal(final.todos.length, 1);
    const cached = await getProjectTodos(root, options);
    assert.equal(cached.refreshing, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
