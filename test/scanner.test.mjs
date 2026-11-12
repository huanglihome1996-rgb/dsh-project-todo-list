import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanProject } from '../src/scanner.mjs';
import { getProjectTodos, refreshProjectTodos, setTodoStatus } from '../src/store.mjs';

test('recognizes assigned and unassigned document tasks without writing project files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-project-todo-test-'));
  try {
    await mkdir(join(root, 'docs'));
    const file = join(root, 'docs', 'PLAN.md');
    const original = '# 迭代计划\n- [ ] 修复会话缓存 owner: test-owner\n- [ ] 编写单元测试\n- [x] 已完成事项\n- [ ] 别人任务 owner: another-person\n';
    await writeFile(file, original);
    const options = { name: 'test-owner', classify: async ({ candidates }) => ({ decisions: candidates.map(row => ({
      id: row.id, include: row.title === '修复会话缓存', ownerEvidence: 'owner: test-owner',
      actionEvidence: '- [ ] 修复会话缓存', reason: '明确负责且未完成'
    })) }) };
    const result = await scanProject(root, options);
    assert.deepEqual(result.todos.map(todo => todo.title), ['修复会话缓存']);
    assert.equal(result.todos[0].confidence, 'high');
    assert.match(result.todos[0].recommendedPrompt, /docs\/PLAN.md:2/);
    await refreshProjectTodos(root, options);
    const stored = await getProjectTodos(root);
    const changed = await setTodoStatus(root, stored.todos[0].id, 'done');
    assert.equal(changed.todos[0].status, 'done');
    const refreshed = await refreshProjectTodos(root, options);
    assert.equal(refreshed.todos[0].status, 'done');
    assert.equal(await readFile(file, 'utf8'), original);
  } finally { await rm(root, { recursive: true, force: true }); }
});
