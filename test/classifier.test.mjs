import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyCandidates } from '../src/classifier.mjs';
import { buildTodoPrompt } from '../src/prompt.mjs';
import { parseCompletion } from '../src/completion.mjs';

const identity = { name: '小王', email: 'wang@example.com', githubLogin: 'wang' };
const candidates = [
  { id: 'owned', title: '完成 API', context: '负责人: 小王\n- [ ] 下一步完成 API 并测试', explicitAssignee: true },
  { id: 'mention', title: '接口测试', context: '讨论时 @小王 了解接口\n- [ ] 接口测试由小李完成', explicitAssignee: false },
  { id: 'other', title: '设计稿', context: '负责人: 小李\n- [ ] 设计稿', explicitAssignee: false },
  { id: 'complete', title: '验收', context: '负责人: 小王\n- [x] 验收已完成', explicitAssignee: true }
];

test('AI must cite ownership and actionable next step, mere mentions cannot qualify', async () => {
  const result = await classifyCandidates({ identity, candidates, classify: async () => ({ decisions: [
    { id: 'owned', include: true, ownerEvidence: '负责人: 小王', actionEvidence: '- [ ] 下一步完成 API 并测试', reason: '用户负责且待办' },
    { id: 'mention', include: true, ownerEvidence: '@小王', actionEvidence: '- [ ] 接口测试由小李完成', reason: '提及用户' },
    { id: 'other', include: true, ownerEvidence: '负责人: 小李', actionEvidence: '- [ ] 设计稿', reason: '他人负责' },
    { id: 'complete', include: true, ownerEvidence: '负责人: 小王', actionEvidence: '验收已完成', reason: '已完成' }
  ] }) });
  assert.deepEqual(result.map(item => item.id), ['owned']);
});

test('concise title, progress and detailed prompt mention branch/docs/blockers', async () => {
  const result = await classifyCandidates({ identity, candidates: [candidates[0]], classify: async () => ({ decisions: [
    { id: 'owned', include: true, title: '完善 API', progress: 'in_progress', ownerEvidence: '负责人: 小王', actionEvidence: '- [ ] 下一步完成 API 并测试', reason: '进行中' }
  ] }) });
  assert.equal(result[0].title, '完善 API');
  assert.equal(result[0].progress, 'in_progress');
  const prompt = buildTodoPrompt({ ...result[0], source: 'docs/PLAN.md:8' }, { branch: 'feature/api' });
  for (const marker of ['feature/api', '项目文档', '测试', '先问我', '验收标准']) assert.match(prompt, new RegExp(marker));
});

test('completion decision rejects malformed responses and preserves blockers', () => {
  assert.equal(parseCompletion('{"result":"done","reason":"tests passed"}').result, 'done');
  assert.equal(parseCompletion('{"result":"blocked","reason":"awaiting decision"}').result, 'blocked');
  assert.equal(parseCompletion('{oops').result, 'unknown');
});

test('missing model, model error, malformed JSON and fabricated evidence all fail closed', async () => {
  for (const classify of [undefined, async () => { throw new Error('offline'); }, async () => '{no', async () => ({ decisions: [{ id: 'owned', include: true, ownerEvidence: '负责人: 小王', actionEvidence: '编造的下一步', reason: 'ok' }] })]) {
    assert.deepEqual(await classifyCandidates({ identity, candidates, classify }), []);
  }
});
