import { describe, expect, it } from 'vitest'
import { FLAVOR_STATUS_VERBS, pickFlavorStatus, shouldShowActiveStatus } from './ChatDialogStatus'

describe('chat status helpers', () => {
  it('exposes IdeaScape-flavored status verbs', () => {
    expect(FLAVOR_STATUS_VERBS.length).toBeGreaterThan(3)
    expect(FLAVOR_STATUS_VERBS).toContain('Mapping connections')
  })

  it('picks a status string with an IdeaScape verb', () => {
    const status = pickFlavorStatus()
    expect(FLAVOR_STATUS_VERBS.some((verb) => status.startsWith(verb))).toBe(true)
  })

  it('only shows active status for the streaming assistant message', () => {
    expect(
      shouldShowActiveStatus({
        activeMessageId: 'ai-1',
        messageId: 'ai-1',
        currentStatus: 'Mapping',
        isUserMessage: false,
      }),
    ).toBe(true)

    expect(
      shouldShowActiveStatus({
        activeMessageId: 'ai-1',
        messageId: 'user-1',
        currentStatus: 'Mapping',
        isUserMessage: true,
      }),
    ).toBe(false)
  })
})
