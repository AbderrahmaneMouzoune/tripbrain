import {
  classifyFiles,
  parseItineraryJson,
} from '@/components/onboarding/import-files'
import { buildShowcase } from '@/components/onboarding/showcase'
import { itinerary as demo } from '@/lib/itinerary-data'

describe('classifyFiles', () => {
  it('reconnaît un JSON ou un Excel seul', () => {
    expect(classifyFiles(['voyage.JSON'])).toEqual({ ok: true, format: 'json' })
    expect(classifyFiles(['voyage.xlsx'])).toEqual({ ok: true, format: 'xlsx' })
  })

  it('accepte les trois CSV ensemble, quelle que soit la casse', () => {
    expect(
      classifyFiles(['Days.csv', 'activities.csv', 'TRANSPORTS.csv']),
    ).toEqual({ ok: true, format: 'csv' })
  })

  it('liste les CSV reconnus et manquants', () => {
    const result = classifyFiles(['days.csv', 'activities.csv'])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/3 fichiers en même temps/)
    expect(result.csvChecklist).toEqual([
      { name: 'days.csv', found: true },
      { name: 'activities.csv', found: true },
      { name: 'transports.csv', found: false },
    ])
  })

  it('signale des CSV mal nommés', () => {
    const result = classifyFiles(['a.csv', 'b.csv', 'c.csv'])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/doivent s’appeler/)
  })

  it('refuse une sélection multiple mélangée et les formats inconnus', () => {
    expect(classifyFiles(['a.json', 'b.csv']).ok).toBe(false)
    expect(classifyFiles(['photo.png']).ok).toBe(false)
    expect(classifyFiles([]).ok).toBe(false)
  })
})

describe('parseItineraryJson', () => {
  it('lit un export TripBrain, titre compris', () => {
    const parsed = parseItineraryJson(
      JSON.stringify({ title: ' Japon ', itinerary: demo.slice(0, 2) }),
    )
    expect(parsed.title).toBe('Japon')
    expect(parsed.itinerary).toHaveLength(2)
  })

  it('refuse un fichier sans itinéraire ou vide', () => {
    expect(() => parseItineraryJson('{}')).toThrow(/itinerary manquant/)
    expect(() => parseItineraryJson('{"itinerary":[]}')).toThrow(
      /aucune journée/,
    )
    expect(() => parseItineraryJson('{oups')).toThrow(SyntaxError)
  })
})

describe('buildShowcase', () => {
  it('tire les cartes d’accueil du voyage d’exemple', () => {
    const showcase = buildShowcase(demo)
    expect(showcase.day?.stepCount).toBeGreaterThan(0)
    expect(showcase.transport).toMatchObject({ type: 'plane' })
    expect(showcase.transport!.from.length).toBeLessThanOrEqual(14)
    expect(showcase.stay?.address).not.toContain(',')
  })

  it('n’invente rien quand le voyage est vide', () => {
    expect(buildShowcase([])).toEqual({
      day: null,
      transport: null,
      stay: null,
    })
  })
})
