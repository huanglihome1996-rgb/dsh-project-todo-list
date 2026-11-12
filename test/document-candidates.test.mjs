import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractDocumentCandidates } from '../src/document-candidates.mjs';

test('version plan and feature ownership become context-rich candidates without checkbox', () => {
  const file = { path: 'docs/版本规划.md', text: `# v2.4 功能版本\n负责人：小王\n## 商品同步\n已实现：商品列表和基础同步。\n剩余：异常重试、失败告警和回滚验证。\n- 异常重试需支持幂等及退避。\n## 订单系统\n由小李负责，验收已完成。\n` };
  const rows = extractDocumentCandidates([file], ['小王']);
  assert.ok(rows.some(row => row.title.includes('商品同步')));
  const feature = rows.find(row => row.title.includes('商品同步'));
  assert.match(feature.context, /负责人：小王/);
  assert.match(feature.context, /已实现：商品列表/);
  assert.match(feature.context, /剩余：异常重试/);
  assert.ok(!rows.some(row => row.title.includes('验收已完成')));
});

test('finished checkboxes do not become next-action candidates', () => {
  const rows = extractDocumentCandidates([{ path: 'docs/PLAN.md', text: '# v1.0\n- [x] 已交付支付功能\n- [ ] 补充支付回归测试\n' }], []);
  assert.ok(rows.some(row => row.title.includes('回归测试')));
  assert.ok(!rows.some(row => row.title.includes('已交付支付')));
});
