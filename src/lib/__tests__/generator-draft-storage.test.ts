import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, todayIso } from '@/lib/generator/itinerary-quality'
import { EMPTY_BRIEF } from '@/lib/generator/trip-brief'

/** Un stockage local minimal : l'environnement de test n'a pas de navigateur. */
function fakeStorage() {
  const items = new Map<string, string>()
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    items,
  }
}

let storage: ReturnType<typeof fakeStorage>

/** Le brouillon est relu au chargement du module : on le recharge à chaque test. */
async function loadStore() {
  vi.resetModules()
  return import('@/lib/generator/generation-store')
}

beforeEach(() => {
  storage = fakeStorage()
  vi.stubGlobal('window', {
    localStorage: storage,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('brouillon du générateur gardé sur l’appareil', () => {
  it('survit à un rechargement', async () => {
    const first = await loadStore()
    const startDate = addDays(todayIso(), 20)
    first.updateGeneratorDraft({
      startDate,
      durationDays: 5,
      brief: { ...EMPTY_BRIEF, destination: 'Lisbonne', diets: ['vegan'] },
    })

    const second = await loadStore()
    const draft = second.getGeneratorDraft()
    expect(draft.startDate).toBe(startDate)
    expect(draft.durationDays).toBe(5)
    expect(draft.brief.destination).toBe('Lisbonne')
    expect(draft.brief.diets).toEqual(['vegan'])
  })

  it('ne reprend pas une date déjà passée', async () => {
    storage.setItem(
      'tripbrain:generateur:brouillon',
      JSON.stringify({
        startDate: '2020-01-01',
        brief: { destination: 'Rome' },
      }),
    )
    const store = await loadStore()
    expect(store.getGeneratorDraft().startDate).toBe('')
    expect(store.getGeneratorDraft().brief.destination).toBe('Rome')
  })

  it('ignore un brouillon illisible', async () => {
    storage.setItem('tripbrain:generateur:brouillon', '{pas du json')
    const store = await loadStore()
    expect(store.getGeneratorDraft().brief).toEqual(EMPTY_BRIEF)
  })

  it('« Recommencer à zéro » efface brouillon et progression', async () => {
    const store = await loadStore()
    store.updateGeneratorDraft({
      brief: { ...EMPTY_BRIEF, destination: 'Rome' },
    })
    storage.setItem(store.PROGRESS_STORAGE_KEY, '{"screen":"hub"}')
    store.clearGeneratorDraft()
    expect(storage.items.size).toBe(0)
    expect(store.getGeneratorDraft().brief.destination).toBe('')
  })
})
