import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PROMPT_STATE,
  SNOOZE_DURATIONS_MS,
  canAutoPrompt,
  detectInstallPlatform,
  markInstalledState,
  optOutPromptState,
  parsePromptState,
  resolveInstallGuide,
  serializePromptState,
  snoozePromptState,
  type AutoPromptContext,
  type InstallPromptState,
} from '../pwa-install'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.0.0 Mobile/15E148 Safari/604.1'
const IPHONE_INSTAGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.0'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36'
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
const IPAD_OS =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'

describe('detectInstallPlatform', () => {
  it('recognises Safari on iPhone', () => {
    expect(detectInstallPlatform(IPHONE_SAFARI)).toBe('ios-safari')
  })

  it('recognises other browsers on iOS', () => {
    expect(detectInstallPlatform(IPHONE_CHROME)).toBe('ios-browser')
    expect(detectInstallPlatform(IPHONE_INSTAGRAM)).toBe('ios-browser')
  })

  it('recognises Android', () => {
    expect(detectInstallPlatform(ANDROID_CHROME)).toBe('android')
  })

  it('treats a desktop Mac as desktop', () => {
    expect(detectInstallPlatform(MAC_SAFARI, { maxTouchPoints: 0 })).toBe(
      'desktop',
    )
  })

  it('treats a touch "Macintosh" as an iPad', () => {
    expect(detectInstallPlatform(IPAD_OS, { maxTouchPoints: 5 })).toBe(
      'ios-safari',
    )
  })

  it('falls back to desktop on an empty user agent', () => {
    expect(detectInstallPlatform('')).toBe('desktop')
  })
})

describe('parsePromptState', () => {
  it('returns the default state when nothing is stored', () => {
    expect(parsePromptState(null)).toEqual(DEFAULT_PROMPT_STATE)
  })

  it('returns the default state on corrupted JSON', () => {
    expect(parsePromptState('{not json')).toEqual(DEFAULT_PROMPT_STATE)
  })

  it('returns the default state on a non-object payload', () => {
    expect(parsePromptState('"nope"')).toEqual(DEFAULT_PROMPT_STATE)
    expect(parsePromptState('null')).toEqual(DEFAULT_PROMPT_STATE)
  })

  it('reads back what it wrote', () => {
    const state: InstallPromptState = {
      dismissCount: 2,
      snoozedUntil: 1_700_000_000_000,
      optedOut: false,
      installed: true,
    }
    expect(parsePromptState(serializePromptState(state))).toEqual(state)
  })

  it('sanitises out-of-range or wrongly typed fields', () => {
    const parsed = parsePromptState(
      JSON.stringify({
        dismissCount: -3,
        snoozedUntil: 'demain',
        optedOut: 'oui',
        installed: 1,
      }),
    )
    expect(parsed).toEqual(DEFAULT_PROMPT_STATE)
  })
})

describe('snoozePromptState', () => {
  const now = 1_700_000_000_000

  it('pushes the first snooze back by the first delay', () => {
    const next = snoozePromptState(DEFAULT_PROMPT_STATE, now)
    expect(next.dismissCount).toBe(1)
    expect(next.snoozedUntil).toBe(now + SNOOZE_DURATIONS_MS[0])
    expect(next.optedOut).toBe(false)
  })

  it('uses a longer delay on the second snooze', () => {
    const first = snoozePromptState(DEFAULT_PROMPT_STATE, now)
    const second = snoozePromptState(first, now)
    expect(second.dismissCount).toBe(2)
    expect(second.snoozedUntil).toBe(now + SNOOZE_DURATIONS_MS[1])
    expect(second.optedOut).toBe(false)
  })

  it('stops proposing after the last delay is used up', () => {
    let state = DEFAULT_PROMPT_STATE
    for (let i = 0; i <= SNOOZE_DURATIONS_MS.length; i++) {
      state = snoozePromptState(state, now)
    }
    expect(state.optedOut).toBe(true)
    expect(state.snoozedUntil).toBe(0)
  })

  it('does not mutate the state it is given', () => {
    const state = { ...DEFAULT_PROMPT_STATE }
    snoozePromptState(state, now)
    expect(state).toEqual(DEFAULT_PROMPT_STATE)
  })
})

describe('optOutPromptState / markInstalledState', () => {
  it('opts out for good', () => {
    expect(optOutPromptState(DEFAULT_PROMPT_STATE)).toMatchObject({
      optedOut: true,
      snoozedUntil: 0,
    })
  })

  it('records the installation', () => {
    expect(markInstalledState(DEFAULT_PROMPT_STATE)).toMatchObject({
      installed: true,
    })
  })
})

describe('canAutoPrompt', () => {
  const base: AutoPromptContext = {
    state: DEFAULT_PROMPT_STATE,
    now: 1_700_000_000_000,
    isMobile: true,
    isStandalone: false,
    platform: 'ios-safari',
    hasNativePrompt: false,
    isEngaged: true,
  }

  it('proposes on Safari iOS once a trip is loaded', () => {
    expect(canAutoPrompt(base)).toBe(true)
  })

  it('waits for the native event on Android', () => {
    expect(canAutoPrompt({ ...base, platform: 'android' })).toBe(false)
    expect(
      canAutoPrompt({ ...base, platform: 'android', hasNativePrompt: true }),
    ).toBe(true)
  })

  it('never proposes in standalone mode', () => {
    expect(canAutoPrompt({ ...base, isStandalone: true })).toBe(false)
  })

  it('never proposes on desktop or in an iOS in-app browser', () => {
    expect(canAutoPrompt({ ...base, platform: 'desktop' })).toBe(false)
    expect(canAutoPrompt({ ...base, platform: 'ios-browser' })).toBe(false)
  })

  it('stays quiet outside mobile screens', () => {
    expect(canAutoPrompt({ ...base, isMobile: false })).toBe(false)
  })

  it('stays quiet until the user has data', () => {
    expect(canAutoPrompt({ ...base, isEngaged: false })).toBe(false)
  })

  it('respects an opt-out and a past installation', () => {
    expect(
      canAutoPrompt({ ...base, state: optOutPromptState(base.state) }),
    ).toBe(false)
    expect(
      canAutoPrompt({ ...base, state: markInstalledState(base.state) }),
    ).toBe(false)
  })

  it('respects a snooze, then proposes again once it expires', () => {
    const snoozed = snoozePromptState(DEFAULT_PROMPT_STATE, base.now)
    expect(canAutoPrompt({ ...base, state: snoozed })).toBe(false)
    expect(
      canAutoPrompt({
        ...base,
        state: snoozed,
        now: snoozed.snoozedUntil + 1,
      }),
    ).toBe(true)
  })
})

describe('resolveInstallGuide', () => {
  it('prefers the native prompt whenever it is available', () => {
    expect(resolveInstallGuide('android', true)).toBe('native')
    expect(resolveInstallGuide('desktop', true)).toBe('native')
  })

  it('falls back to the platform instructions', () => {
    expect(resolveInstallGuide('ios-safari', false)).toBe('ios-safari')
    expect(resolveInstallGuide('ios-browser', false)).toBe('ios-browser')
    expect(resolveInstallGuide('android', false)).toBe('manual')
    expect(resolveInstallGuide('desktop', false)).toBe('manual')
  })
})
