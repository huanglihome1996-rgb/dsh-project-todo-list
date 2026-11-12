const HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const OPEN_TASK = /^\s*(?:[-*+]\s*)?\[\s\]\s+(.+)$/;
const DONE_TASK = /^\s*(?:[-*+]\s*)?\[[xX]\]\s+(.+)$/;
const LIST_ITEM = /^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+)$/;
const PLAN_HINT = /(?:版本|迭代|里程碑|阶段|功能|模块|需求|实现|开发|交付|规划|计划|进度|剩余|待做|未完成|进行中|负责|下一步|验收|发布|v\d+(?:\.\d+)+|release|sprint|milestone|roadmap|feature|owner|assignee|scope|pending|remaining|in progress|not started|implementation|todo)/i;
const DONE_HINT = /(?:已完成|已实现|已上线|已交付|已验收|完成于|merged|released|shipped|implemented|delivered|done|complete)/i;
const TOTAL_LIMIT = 90;
function normalize(text) { return text.replace(/\s+/g, ' ').trim().slice(0, 150); }
function sectionContext(lines, start, end, headingLine, focus) {
  const rows = [];
  if (headingLine !== undefined && headingLine < start) rows.push(lines[headingLine]);
  for (let i = start; i < end; i++) {
    if (i < focus - 8 || i > focus + 16) continue;
    rows.push(lines[i]);
  }
  return rows.join('\n').slice(0, 2800);
}
/** Candidate discovery only: never marks work owned or unfinished without later AI review. */
export function extractDocumentCandidates(files, identities = []) {
  const result = [];
  for (const file of files) {
    if (result.length >= TOTAL_LIMIT) break;
    const lines = file.text.split(/\r?\n/);
    const headings = [];
    for (let i = 0; i < lines.length; i++) {
      const match = HEADING.exec(lines[i]);
      if (match) headings.push({ line: i, depth: match[1].length, title: match[2] });
    }
    for (let i = 0; i < lines.length && result.length < TOTAL_LIMIT; i++) {
      const line = lines[i].trim();
      if (!line || line.length > 500 || DONE_TASK.test(line)) continue;
      const openTask = OPEN_TASK.exec(line);
      const list = LIST_ITEM.exec(line);
      const heading = HEADING.exec(line);
      const explicit = /^\s*(?:todo|待办|下一步|未完成|进行中|负责人|owner|assignee|issue)\s*[:：\-]\s*(.+)/i.exec(line);
      const relevantHeading = headings.filter(item => item.line <= i).at(-1);
      const nearOwner = identities.some(identity => identity && lines.slice(Math.max(0, i - 4), i + 5).join('\n').toLowerCase().includes(identity.toLowerCase()));
      const nearPlan = relevantHeading && PLAN_HINT.test(relevantHeading.title);
      // A heading or a section's planned feature can imply a next action even
      // without a checkbox; generic release notes/completed bullets cannot.
      const featureHeading = heading && (PLAN_HINT.test(heading[2]) || Boolean(nearPlan) || Boolean(nearOwner) || PLAN_HINT.test(lines.slice(i + 1, i + 5).join(' ')));
      if (!openTask && !explicit && !(list && (PLAN_HINT.test(line) || nearPlan || nearOwner)) && !featureHeading) continue;
      if (!openTask && !explicit && DONE_HINT.test(line)) continue;
      let title = normalize(openTask?.[1] ?? explicit?.[1] ?? list?.[1] ?? heading?.[2] ?? '').replace(/(?:owner|负责人|assignee)\s*[:：]\s*[^\s,，;；]+/gi, '').trim();
      if (title.length < 4) continue;
      let anchor = relevantHeading;
      if (heading) anchor = { line: i, depth: heading[1].length, title: heading[2] };
      const sectionStart = anchor?.line ?? Math.max(0, i - 8);
      const nextHeading = headings.find(item => item.line > i && (!anchor || item.depth <= anchor.depth));
      const sectionEnd = Math.min(nextHeading?.line ?? lines.length, i + 17);
      const parents = headings.filter(item => item.line < sectionStart && (!anchor || item.depth < anchor.depth)).slice(-3);
      const context = [...parents.map(parent => {
        const next = Math.min(sectionStart, parent.line + 5);
        return lines.slice(parent.line, next).filter(value => !HEADING.test(value) || value === lines[parent.line]).join('\n');
      }), sectionContext(lines, sectionStart, sectionEnd, anchor?.line, i)].join('\n').slice(0, 3200);
      const owner = /(?:owner|负责人|assignee)\s*[:：]\s*([^\s,，;；]+)/i.exec(line)?.[1]?.toLowerCase();
      result.push({ title, source: `${file.path}:${i + 1}`, context,
        explicitAssignee: Boolean(owner && identities.some(identity => identity.toLowerCase() === owner)),
        kind: openTask || explicit ? 'task' : 'feature', heading: anchor?.title ?? null });
    }
  }
  return result;
}
