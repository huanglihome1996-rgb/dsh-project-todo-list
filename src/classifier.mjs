const MAX_DECISIONS = 60;

/** Treat model output as untrusted, requiring two independent, non-empty citations. */
export function parseDecisions(output, candidates, identity = {}) {
  let value = output;
  if (typeof value === 'string') {
    try { value = JSON.parse(value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
    catch { return []; }
  }
  if (!Array.isArray(value?.decisions)) return [];
  const known = new Map(candidates.map(item => [item.id, item]));
  const used = new Set();
  const accepted = [];
  for (const item of value.decisions.slice(0, MAX_DECISIONS)) {
    if (!item || item.include !== true || !known.has(item.id) || used.has(item.id)) continue;
    if (typeof item.ownerEvidence !== 'string' || !item.ownerEvidence.trim() || typeof item.actionEvidence !== 'string' || !item.actionEvidence.trim()) continue;
    const candidate = known.get(item.id);
    // Model must quote verbatim from this candidate's actual, bounded source context.
    if (!candidate.context?.includes(item.ownerEvidence.trim()) || !candidate.context?.includes(item.actionEvidence.trim())) continue;
    // The model assesses personal responsibility from context; require grounded evidence,
    // not a literal username in one owner line. Reject uncertainty and incidental mentions.
    if (!['high', 'medium'].includes(item.ownershipConfidence) || item.isActionable !== true) continue;
    if (/(?:已完成|已关闭|done|closed|cancelled|canceled)/i.test(item.actionEvidence)) continue;
    if (typeof item.reason !== 'string' || !item.reason.trim()) continue;
    used.add(item.id);
    const title = typeof item.title === 'string' ? item.title.trim().replace(/[\r\n<>]/g, '').slice(0, 32) : '';
    const priority = ['urgent', 'high', 'normal', 'low'].includes(item.priority) ? item.priority : 'normal';
    const effort = ['small', 'medium', 'large', 'very_large'].includes(item.effort) ? item.effort : 'medium';
    accepted.push({ ...candidate, title: title || candidate.title, progress: item.progress === 'in_progress' ? 'in_progress' : 'not_started', priority, effort,
      ownershipConfidence: item.ownershipConfidence, ownerEvidence: item.ownerEvidence.trim(), actionEvidence: item.actionEvidence.trim(), reason: item.reason.trim().slice(0, 200) });
  }
  return accepted;
}

/** No model or a failed/incomplete classification never turns a mention into a task. */
export async function classifyCandidates({ identity, candidates, classify, branchContext }) {
  if (typeof classify !== 'function' || !identity || candidates.length === 0) return [];
  try {
    const accepted = [];
    for (let i = 0; i < candidates.length; i += 8) {
      const batch = candidates.slice(i, i + 8);
      try { accepted.push(...parseDecisions(await classify({ identity, candidates: batch, branchContext }), batch, identity)); }
      catch { /* one failed batch must not discard unrelated verified tasks */ }
    }
    const ranks = { urgent: 0, high: 1, normal: 2, low: 3 };
    return accepted.sort((a, b) => ranks[a.priority] - ranks[b.priority] || (a.progress === 'in_progress' ? -1 : 1) - (b.progress === 'in_progress' ? -1 : 1));
  } catch { return []; }
}
