import { describe, expect, it } from 'vitest';
import { FLAVOR_STATUS_VERBS, pickFlavorStatus, shouldShowActiveStatus } from './ChatDialogStatus';

describe('ChatDialog status helpers', () => {
  it('exposes IdeaScape-flavored status verbs', () => {
    expect(FLAVOR_STATUS_VERBS).toEqual(
      expect.arrayContaining([
        'Synthesizing',
        'Architecting',
        'Refactoring',
        'Navigating the canvas',
        'Mapping connections',
        'Indexing thoughts',
        'Consulting the LLM',
        'Optimizing nodes',
      ]),
    );
  });

  it('selects a stable verb from the bank for a provided random value', () => {
    expect(pickFlavorStatus(() => 0)).toBe('Synthesizing');
    expect(pickFlavorStatus(() => 0.999)).toBe('Optimizing nodes');
  });

  it('only shows the active status for the active generated AI message', () => {
    expect(shouldShowActiveStatus({
      activeMessageId: 'ai-1',
      messageId: 'ai-1',
      currentStatus: 'Generating...',
      isUserMessage: false,
    })).toBe(true);

    expect(shouldShowActiveStatus({
      activeMessageId: 'ai-1',
      messageId: 'ai-2',
      currentStatus: 'Generating...',
      isUserMessage: false,
    })).toBe(false);

    expect(shouldShowActiveStatus({
      activeMessageId: 'ai-1',
      messageId: 'ai-1',
      currentStatus: 'Generating...',
      isUserMessage: true,
    })).toBe(false);
  });
});
