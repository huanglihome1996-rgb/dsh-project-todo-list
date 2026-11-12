const HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const OPEN_TASK = /^\s*(?:[-*+]\s*)?\[\s\]\s+(.+)$/;
const DONE_TASK = /^\s*(?:[-*+]\s*)?\[[xX]\]\s+(.+)$/;
const LIST_ITEM = /^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+)$/;
const PLAN_HINT = /(?:版本|迭代|里程碑|阶段|功能|模块|需求|实现|开发|交付|规划|计划|进度|剩余|待做|未完成|进行中|负责|下一步|验收|发布|v\d+(?:\.\d+)+|release|sprint|milestone|roadmap|feature|owner|assignee|scope|pending|remaining|in progress|not started|implementation|todo)/i;
const DONE_HINT = /(?:已完成|已实现|已上线|已交付|已验收|完成于|merged|released|shipped|implemented|delivered|done|complete)/i;
const TOTAL_LIMIT = 100;
function normalize(text) { return text.replace(/\s+/g, ' ').trim().slice(0, 150); }
function source(file, line) { return `${file.path}:${line + 1}`; }
function ownerAlias(file, identities) {
  const named = /^owner:\s*["']?([^\r\n"']+)/mi.exec(file.text)?.[1]?.trim();
  return named && identities.some(id => id && id.toLowerCase() === named.toLowerCase()) ? named : null;
}
function isVersionFile(path) { return /(?:^|\/)modules\/[^/]+\/[^/]+\.v\d+(?:\.\d+)*\.md$/i.test(path); }
function rowsForVersion(file, identities) {
  const lines = file.text.split(/\r?\n/);
  const person = ownerAlias(file, identities);
  const rows = [];
  const intro = lines.slice(0, 20).filter(line => /^(?:owner:|version:|title:|\s*模块及子模块负责人|\s*子模块负责人|# )/i.test(line)).slice(0, 8);
  for (let n = 0; n < lines.length && rows.length < 24; n++) {
    const line = lines[n];
    if (!line.trim().startsWith('|') || !/^\s*\|/.test(line) || /^\s*\|\s*[-: ]+\|/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    if (cells.length < 4 || cells[0].length < 4 || cells[0] === '功能' || cells[0] === '层次') continue;
    // Version feature tables commonly pair current coverage with target gap.
    const header = lines.slice(Math.max(0, n - 16), n).reverse().find(row => /^\s*\|\s*(?:功能|层次)\s*\|/.test(row));
    if (!header) continue;
    const headerCells = header.split('|').slice(1, -1).map(cell => cell.trim());
    const gap = cells.find((cell, index) => /差距|尚未完成|剩余|验收条件|目标|本版预期/i.test(headerCells[index] ?? ''));
    if (!gap || gap.length < 8) continue;
    const coverage = cells.find((cell, index) => /当前覆盖|已核对|现有事实|已交付/i.test(headerCells[index] ?? '')) ?? '';
    const context = [...intro, header, line, `当前覆盖：${coverage}`, `剩余/验收：${gap}`].join('\n').slice(0, 3000);
    rows.push({ title: normalize(cells[0]), source: source(file, n), context,
      explicitAssignee: Boolean(person), kind: 'feature', heading: intro.find(text => /^# /.test(text))?.slice(2) ?? null });
  }
  return rows;
}
function rowsForText(file, identities) {
  const lines = file.text.split(/\r?\n/);
  const headings = [];
  for (let i = 0; i < lines.length; i++) { const m = HEADING.exec(lines[i]); if (m) headings.push({ line: i, depth: m[1].length, title: m[2] }); }
  const rows = [];
  for (let i = 0; i < lines.length && rows.length < 18; i++) {
    const line = lines[i].trim();
    if (!line || line.length > 450 || DONE_TASK.test(line)) continue;
    const open = OPEN_TASK.exec(line), list = LIST_ITEM.exec(line), heading = HEADING.exec(line);
    const explicit = /^\s*(?:todo|待办|下一步|未完成|进行中|负责人|owner|assignee|issue)\s*[:：\-]\s*(.+)/i.exec(line);
    const anchor = headings.filter(h => h.line <= i).at(-1);
    const nearOwner = identities.some(id => id && lines.slice(Math.max(0, i - 4), i + 5).join('\n').toLowerCase().includes(id.toLowerCase()));
    const nearPlan = anchor && PLAN_HINT.test(anchor.title);
    const feature = heading && (PLAN_HINT.test(heading[2]) || nearPlan || nearOwner || PLAN_HINT.test(lines.slice(i + 1, i + 5).join(' ')));
    if (!open && !explicit && !(list && (PLAN_HINT.test(line) || nearPlan || nearOwner)) && !feature) continue;
    if (!open && !explicit && DONE_HINT.test(line)) continue;
    const title = normalize(open?.[1] ?? explicit?.[1] ?? list?.[1] ?? heading?.[2] ?? '').replace(/(?:owner|负责人|assignee)\s*[:：]\s*[^\s,，;；]+/gi, '').trim();
    if (title.length < 4) continue;
    const start = anchor?.line ?? Math.max(0, i - 5);
    const parents = headings.filter(h => h.line < start && (!anchor || h.depth < anchor.depth)).slice(-2);
    const context = [...parents.map(p => lines.slice(p.line, Math.min(start, p.line + 4)).join('\n')),
      lines.slice(Math.max(start, i - 6), Math.min(lines.length, i + 13)).join('\n')].join('\n').slice(0, 2900);
    const owner = /(?:owner|负责人|assignee)\s*[:：]\s*([^\s,，;；]+)/i.exec(line)?.[1]?.toLowerCase();
    rows.push({ title, source: source(file, i), context, explicitAssignee: Boolean(owner && identities.some(id => id.toLowerCase() === owner)),
      kind: open || explicit ? 'task' : 'feature', heading: anchor?.title ?? null });
  }
  return rows;
}
/** Reverse-search owned version tables before generic headings and issue references. */
export function extractDocumentCandidates(files, identities = []) {
  const versions = files.filter(file => isVersionFile(file.path));
  const others = files.filter(file => !isVersionFile(file.path));
  const owned = versions.filter(file => ownerAlias(file, identities));
  const preferred = [...owned, ...versions.filter(file => !ownerAlias(file, identities))];
  const result = [];
  const tableRows = new Map(preferred.map(file => [file.path, rowsForVersion(file, identities)]));
  // Round-robin owned version files: a large OMS table cannot consume the
  // entire budget before inventory, fulfillment and scheduling are sampled.
  for (let round = 0; round < 24 && result.length < TOTAL_LIMIT; round++) {
    for (const file of preferred) {
      const row = tableRows.get(file.path)?.[round];
      if (row) result.push(row);
      if (result.length >= TOTAL_LIMIT) break;
    }
  }
  const textFiles = [...preferred, ...others];
  const textRows = new Map(textFiles.map(file => [file.path, rowsForText(file, identities)]));
  for (let round = 0; round < 18 && result.length < TOTAL_LIMIT; round++) {
    for (const file of textFiles) {
      const row = textRows.get(file.path)?.[round];
      if (row) result.push(row);
      if (result.length >= TOTAL_LIMIT) break;
    }
  }
  return result.slice(0, TOTAL_LIMIT);
}
