import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../src/index.mjs';

test('authenticated connection route implements local project todo API', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-project-todo-route-'));
  try {
    await writeFile(join(root, 'TODO.md'), '- [ ] 整理发布流程 owner: test-owner\n');
    const routes = new Map();
    apply({
      on() {}, sessions: { get(id) { return { id, header: { cwd: root } }; } },
      connection: { fetch: { register(value) { routes.set(value.path, value); } } }, logger: { warn() {} },
      agentDefaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      llm: { async prepareCall(config) { return { config, async *stream(request) {
        const candidates = JSON.parse(request.messages[0].content[0].text).candidates;
        yield { type: 'text-delta', index: 0, text: JSON.stringify({ decisions: candidates.map(item => ({ id: item.id, include: true, ownerEvidence: 'owner: test-owner', actionEvidence: '- [ ] 整理发布流程', reason: 'assigned', ownershipConfidence: 'high', isActionable: true, priority: 'high', effort: 'medium' })) }) };
        yield { type: 'finish', reason: { kind: 'stop' } };
      } }; } }
    }, { name: 'test-owner' });
    const route = routes.get('/api/project-todo');
    assert.equal(route.path, '/api/project-todo');
    assert.ok(routes.has('/api/project-todo/activate'));
    assert.deepEqual(route.methods, ['GET', 'POST', 'PATCH']);
    const url = 'http://localhost/api/project-todo?projectPath=' + encodeURIComponent(root);
    const initial = await route.fetch(new Request(url));
    assert.equal(initial.status, 200);
    const todos = (await initial.json()).todos;
    assert.equal(todos.length, 1);
    const activation = await routes.get('/api/project-todo/activate').fetch(new Request('http://localhost/api/project-todo/activate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectPath: root, id: todos[0].id, sessionId: 'test-session' }) }));
    assert.equal(activation.status, 200);
    assert.equal((await activation.json()).todos[0].progress, 'in_progress');
    const changed = await route.fetch(new Request('http://localhost/api/project-todo', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectPath: root, id: todos[0].id, status: 'done' }) }));
    assert.equal((await changed.json()).todos[0].status, 'done');
    const missing = await route.fetch(new Request('http://localhost/api/project-todo'));
    assert.equal(missing.status, 400);
  } finally { await rm(root, { recursive: true, force: true }); }
});
