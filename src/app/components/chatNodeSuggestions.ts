import type { Node } from '../store/canvasStore';

export type NodeChatSuggestion = {
  id: string;
  nodeId: string;
  kind: 'recent' | 'rich';
  /** Compact line for dropdown (may truncate) */
  label: string;
  /** Full prompt inserted into composer */
  insertText: string;
};

function asDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

function truncate(s: string, n: number): string {
  const t = s.trim();
  if (t.length <= n) return t;
  return `${t.slice(0, Math.max(0, n - 1))}\u2026`;
}

function normalizeQuestionText(input: string): string {
  const cleaned = stripHtml(input)
    .replace(/^[\s"'`([{<]+/, '')
    .replace(/[\s"'`)\]}>]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  const withoutSlashPrefix = cleaned.startsWith('/') ? cleaned.replace(/^\/+/, '') : cleaned;
  const trimmed = truncate(withoutSlashPrefix, 190);
  return trimmed;
}

function stripHtml(input: string): string {
  return input
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Short label for UI (node title / text / link / browser). */
export function getNodeLabel(node: Node): string {
  const title = node.content.title?.trim();
  if (title) return truncate(stripHtml(title), 48);

  const val = typeof node.content.value === 'string' ? stripHtml(node.content.value) : '';
  if (val) return truncate(val, 48);

  if (node.content.links?.length) {
    const t = node.content.links[0]?.title?.trim();
    if (t) return truncate(t, 48);
    const url = node.content.links[0]?.url;
    if (url) return truncate(url.replace(/^https?:\/\//i, ''), 48);
  }
  if (node.content.type === 'browser') {
    const p = node.content.pageTitle?.trim();
    if (p) return truncate(p, 48);
    const u = node.content.url?.trim();
    if (u) return truncate(u.replace(/^https?:\/\//i, ''), 48);
  }
  return truncate(`${node.content.type} node`, 48);
}

export function richnessScore(node: Node): number {
  let score = 0;
  const val = typeof node.content.value === 'string' ? node.content.value : '';
  score += Math.min(600, val.length);
  if (node.content.title?.trim()) score += 50;
  if (node.comment?.trim()) score += Math.min(250, node.comment.length);
  if (node.content.links?.length) score += 40 + 15 * node.content.links.length;
  if (node.content.images?.length) score += 20;
  if (node.content.type === 'browser' && (node.content.url || node.content.pageTitle)) score += 45;
  if (node.tags?.length) score += 12 * node.tags.length;
  return score;
}

/**
 * Prefer title; otherwise extract readable topical snippet from body/links/browser —
 * used so suggestion wording echoes what's actually on the note (e.g. photosynthesis).
 */
export function extractTopicPhrase(node: Node): string {
  const title = node.content.title?.trim();
  if (title && title.length > 2) return truncate(stripHtml(title), 96);

  const val = typeof node.content.value === 'string' ? stripHtml(node.content.value) : '';
  if (val.length > 0) {
    const parts = val.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    const sentence =
      parts.find((s) => s.length >= 22 && /\w/.test(s)) ?? parts[0] ?? val.slice(0, Math.min(val.length, 320)).trim();
    return truncate(sentence.trim(), 96);
  }

  if (node.content.links?.length) {
    const lt = node.content.links[0]?.title?.trim();
    if (lt && lt.length > 2) return truncate(lt, 96);
    const url = node.content.links[0]?.url?.replace(/^https?:\/\//i, '').trim();
    if (url) return truncate(url.split(/[/?#]/)[0] ?? url, 96);
  }

  if (node.content.type === 'browser') {
    const p = node.content.pageTitle?.trim();
    if (p && p.length > 2) return truncate(p, 96);
    const u = node.content.url?.trim().replace(/^https?:\/\//i, '');
    if (u) return truncate(u.split(/[/?#]/)[0] ?? u, 96);
  }

  return getNodeLabel(node);
}

/** Rotate these so each “recent” slot feels like a natural next question about the topic. */
const LIKELY_RECENT_QUESTIONS: Array<(topic: string) => string> = [
  (t) =>
    `What should I clarify first about "${t}" — especially how the main parts fit together?`,
  (t) =>
    `Explain "${t}" simply: what people usually get wrong, and what I'd want to remember.`,
  (t) =>
    `What's the most useful single takeaway about "${t}" for what I'm doing on this canvas?`,
  (t) =>
    `How could "${t}" relate to other ideas on my board — strongest connection worth naming?`,
  (t) =>
    `If I had to teach "${t}" in two minutes, what must I include and what can I drop?`,
];

/** Slightly deeper “likely asks” for richer notes. */
const LIKELY_RICH_QUESTIONS: Array<(topic: string) => string> = [
  (t) =>
    `I've got a lot on "${t}" — what's the next question that would move my understanding forward most?`,
  (t) =>
    `What nuances or edge cases around "${t}" am I most likely to underestimate from my notes alone?`,
];

/**
 * Builds up to 7 “likely to ask” prompts from node topics: five from newest nodes, two from
 * richest content (preferring nodes outside the top-five when possible).
 */
export function buildNodeChatSuggestions(nodes: Node[]): NodeChatSuggestion[] {
  if (!nodes.length) return [];

  const sortedByCreated = [...nodes].sort(
    (a, b) => asDate(b.createdAt).getTime() - asDate(a.createdAt).getTime(),
  );
  const recentFive = sortedByCreated.slice(0, 5);
  const recentIds = new Set(recentFive.map((n) => n.id));

  const notInRecent = sortedByCreated.filter((n) => !recentIds.has(n.id));
  const byRich = [...nodes].sort((a, b) => richnessScore(b) - richnessScore(a));
  const richTwo: Node[] = [];

  for (const n of notInRecent) {
    if (richnessScore(n) < 8) continue;
    richTwo.push(n);
    if (richTwo.length >= 2) break;
  }
  if (richTwo.length < 2) {
    for (const n of byRich) {
      if (richTwo.some((r) => r.id === n.id)) continue;
      richTwo.push(n);
      if (richTwo.length >= 2) break;
    }
  }

  const out: NodeChatSuggestion[] = [];

  recentFive.forEach((n, index) => {
    const topic = extractTopicPhrase(n);
    const full = LIKELY_RECENT_QUESTIONS[index % LIKELY_RECENT_QUESTIONS.length](topic);
    const label = full.length > 118 ? `${full.slice(0, 115)}\u2026` : full;
    out.push({
      id: `recent-${n.id}`,
      nodeId: n.id,
      kind: 'recent',
      label,
      insertText: full,
    });
  });

  richTwo.slice(0, 2).forEach((n, index) => {
    const topic = extractTopicPhrase(n);
    const full = LIKELY_RICH_QUESTIONS[index % LIKELY_RICH_QUESTIONS.length](topic);
    const label = full.length > 118 ? `${full.slice(0, 115)}\u2026` : full;
    out.push({
      id: `rich-${n.id}`,
      nodeId: n.id,
      kind: 'rich',
      label,
      insertText: full,
    });
  });

  return out;
}

export function buildAiQuestionSuggestions(nodes: Node[], questions: string[]): NodeChatSuggestion[] {
  const normalizedQuestions = questions
    .map((q) => normalizeQuestionText(q))
    .filter((q) => q.length > 0);
  if (!normalizedQuestions.length) return [];
  if (!nodes.length) {
    return normalizedQuestions.map((q, index) => ({
      id: `ai-q-${index}`,
      nodeId: `ai-${index}`,
      kind: index < 5 ? 'recent' : 'rich',
      label: q.length > 118 ? `${q.slice(0, 115)}\u2026` : q,
      insertText: q,
    }));
  }

  const sortedByCreated = [...nodes].sort(
    (a, b) => asDate(b.createdAt).getTime() - asDate(a.createdAt).getTime(),
  );

  return normalizedQuestions.map((q, index) => {
    const mappedNode = sortedByCreated[index % sortedByCreated.length];
    return {
      id: `ai-${mappedNode.id}-${index}`,
      nodeId: mappedNode.id,
      kind: index < 5 ? 'recent' : 'rich',
      label: q.length > 118 ? `${q.slice(0, 115)}\u2026` : q,
      insertText: q,
    };
  });
}
