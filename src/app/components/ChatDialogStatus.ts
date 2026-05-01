export const FLAVOR_STATUS_VERBS = [
  'Synthesizing',
  'Architecting',
  'Refactoring',
  'Navigating the canvas',
  'Mapping connections',
  'Indexing thoughts',
  'Consulting the LLM',
  'Optimizing nodes',
] as const;

export function pickFlavorStatus(random: () => number = Math.random): string {
  const index = Math.min(Math.floor(random() * FLAVOR_STATUS_VERBS.length), FLAVOR_STATUS_VERBS.length - 1);
  return FLAVOR_STATUS_VERBS[index];
}

export function shouldShowActiveStatus({
  activeMessageId,
  messageId,
  currentStatus,
  isUserMessage,
}: {
  activeMessageId: string | null;
  messageId: string;
  currentStatus: string;
  isUserMessage: boolean;
}) {
  return !isUserMessage && Boolean(currentStatus) && activeMessageId === messageId;
}
