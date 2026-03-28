import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DayItinerary } from '../itinerary-data'

// ─── Helpers that mirror the hook logic ──────────────────────────────────────
// We test the pure functional parts of the editor logic directly since the
// hook itself requires a React environment.

const MAX_VERSIONS = 10

interface VersionEntry {
  value: unknown
  timestamp: string
}

function pushVersion(
  history: Record<string, VersionEntry[]>,
  dayIndex: number,
  fieldKey: string,
  previousValue: unknown,
): Record<string, VersionEntry[]> {
  const key = `${dayIndex}|${fieldKey}`
  const existing = history[key] ?? []
  return {
    ...history,
    [key]: [
      { value: previousValue, timestamp: new Date().toISOString() },
      ...existing,
    ].slice(0, MAX_VERSIONS),
  }
}

function applyFieldChange(
  itinerary: DayItinerary[],
  dayIndex: number,
  updatedDay: DayItinerary,
): DayItinerary[] {
  return itinerary.map((d, i) => (i === dayIndex ? updatedDay : d))
}

// ─── Minimal mock day ─────────────────────────────────────────────────────────

const makeDay = (overrides?: Partial<DayItinerary>): DayItinerary => ({
  date: '2026-05-10',
  dayNumber: 1,
  city: 'Shanghai',
  title: 'Arrivée à Shanghai',
  coordinates: [31.23, 121.47],
  activities: [],
  ...overrides,
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('pushVersion', () => {
  it('adds a new entry to an empty history', () => {
    const result = pushVersion({}, 0, 'title', 'Old title')
    expect(result['0|title']).toHaveLength(1)
    expect(result['0|title'][0].value).toBe('Old title')
  })

  it('prepends new entries (newest first)', () => {
    let history = pushVersion({}, 0, 'title', 'Version 1')
    history = pushVersion(history, 0, 'title', 'Version 2')
    history = pushVersion(history, 0, 'title', 'Version 3')

    const entries = history['0|title']
    expect(entries[0].value).toBe('Version 3')
    expect(entries[1].value).toBe('Version 2')
    expect(entries[2].value).toBe('Version 1')
  })

  it('caps history at MAX_VERSIONS (10)', () => {
    let history: Record<string, VersionEntry[]> = {}
    for (let i = 0; i < 15; i++) {
      history = pushVersion(history, 0, 'notes', `value-${i}`)
    }
    expect(history['0|notes']).toHaveLength(MAX_VERSIONS)
    // Most recent should be value-14
    expect(history['0|notes'][0].value).toBe('value-14')
  })

  it('uses separate keys for different fields', () => {
    let history = pushVersion({}, 0, 'title', 'old title')
    history = pushVersion(history, 0, 'notes', 'old notes')
    history = pushVersion(history, 1, 'title', 'day 2 old title')

    expect(history['0|title']).toHaveLength(1)
    expect(history['0|notes']).toHaveLength(1)
    expect(history['1|title']).toHaveLength(1)
  })

  it('entry includes a valid ISO timestamp', () => {
    const before = Date.now()
    const result = pushVersion({}, 0, 'title', 'v')
    const after = Date.now()

    const ts = new Date(result['0|title'][0].timestamp).getTime()
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })
})

describe('applyFieldChange', () => {
  it('replaces the correct day and leaves others unchanged', () => {
    const day0 = makeDay({ dayNumber: 1, title: 'Day 1' })
    const day1 = makeDay({ dayNumber: 2, title: 'Day 2' })
    const updatedDay1 = { ...day1, title: 'Day 2 edited' }

    const result = applyFieldChange([day0, day1], 1, updatedDay1)

    expect(result[0].title).toBe('Day 1')
    expect(result[1].title).toBe('Day 2 edited')
    expect(result).toHaveLength(2)
  })

  it('does not mutate the original array', () => {
    const original = [makeDay({ title: 'Original' })]
    const updated = { ...original[0], title: 'Updated' }

    applyFieldChange(original, 0, updated)

    expect(original[0].title).toBe('Original')
  })

  it('handles single-element itinerary', () => {
    const day = makeDay({ title: 'Solo day' })
    const updated = { ...day, title: 'Edited solo day' }

    const result = applyFieldChange([day], 0, updated)

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Edited solo day')
  })
})

describe('version restore logic', () => {
  it('removes the restored entry from history', () => {
    let history: Record<string, VersionEntry[]> = {}
    history = pushVersion(history, 0, 'title', 'v1')
    history = pushVersion(history, 0, 'title', 'v2')
    // Restore index 0 (v2) — remove it from history
    const key = '0|title'
    const restored = history[key][0]
    const remaining = history[key].filter((_, i) => i !== 0)
    history = { ...history, [key]: remaining }

    expect(history[key]).toHaveLength(1)
    expect(history[key][0].value).toBe('v1')
    expect(restored.value).toBe('v2')
  })

  it('pushes current value before restoring so undo is possible', () => {
    let history: Record<string, VersionEntry[]> = {}
    history = pushVersion(history, 0, 'title', 'v1') // original stored as history

    // Simulate restore: push current ('v2') before restoring 'v1'
    history = pushVersion(history, 0, 'title', 'v2')

    const key = '0|title'
    // Remove restored entry (index 1, which is 'v1')
    const remaining = history[key].filter((_, i) => i !== 1)
    history = { ...history, [key]: remaining }

    // History should now contain 'v2' (so we can undo the restore)
    expect(history[key]).toHaveLength(1)
    expect(history[key][0].value).toBe('v2')
  })
})
