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
    const ownerQuote = item.ownerEvidence.trim();
    const personNames = [identity.name, identity.email, identity.githubLogin, ...(identity.aliases ?? [])].filter(Boolean).map(value => value.toLowerCase());
    if (!personNames.some(name => ownerQuote.toLowerCase().includes(name))) continue;
    if (!candidate.explicitAssignee && !/(?:owner|负责人|assignee|由|交给|负责)/i.test(ownerQuote)) continue;
    if (/(?:已完成|已关闭|done|closed|cancelled|canceled)/i.test(item.actionEvidence)) continue;
    if (typeof item.reason !== 'string' || !item.reason.trim()) continue;
    used.add(item.id);
    accepted.push({ ...candidate, ownerEvidence: item.ownerEvidence.trim(), actionEvidence: item.actionEvidence.trim(), reason: item.reason.trim().slice(0, 200) });
  }
  return accepted;
}

/** No model or a failed/incomplete classification never turns a mention into a task. */
export async function classifyCandidates({ identity, candidates, classify }) {
  if (typeof classify !== 'function' || !identity || candidates.length === 0) return [];
  try {
    const accepted = [];
    for (let i = 0; i < candidates.length; i += 8) {
      const batch = candidates.slice(i, i + 8);
      accepted.push(...parseDecisions(await classify({ identity, candidates: batch }), batch, identity));
    }
    return accepted;
  } catch { return []; }
}
