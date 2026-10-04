import {
  IncrementalItineraryParser,
  STREAM_ERROR_MARKER,
  describePartialDay,
  splitStreamError,
} from '@/lib/generator/stream-parser'

const DAYS = [
  {
    date: '2027-04-12',
    city: 'Tokyo',
    title: 'Arrivée {et} [Shinjuku]',
    activities: [
      { name: 'Shinjuku Gyoen', type: 'visit' },
      { name: 'Omoide "Yokocho"', type: 'food' },
    ],
  },
  {
    date: '2027-04-13',
    city: 'Tokyo',
    title: 'Asakusa et Ueno',
    coordinates: { lat: 35.71, lng: 139.79 },
    activities: [{ name: 'Senso-ji', type: 'visit', tags: ['a', 'b'] }],
  },
  {
    date: '2027-04-14',
    city: 'Kyoto',
    title: 'Fushimi Inari',
    activities: [],
  },
]

const FULL = JSON.stringify({
  tripTitle: 'Japon \\ printemps',
  summary: 'Deux villes, trois jours.',
  days: DAYS,
})

/** Découpe un texte en morceaux de taille fixe, comme un flux réseau. */
function chunks(text: string, size: number): string[] {
  const parts: string[] = []
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size))
  return parts
}

describe('IncrementalItineraryParser', () => {
  it.each([1, 3, 7, 50, 10_000])(
    'retrouve toutes les journées quel que soit le découpage (%i)',
    (size) => {
      const parser = new IncrementalItineraryParser()
      let snapshot = parser.snapshot()
      for (const part of chunks(FULL, size)) snapshot = parser.push(part)
      expect(snapshot.days).toEqual(DAYS)
      expect(snapshot.daysComplete).toBe(true)
      expect(snapshot.current).toBeNull()
      expect(snapshot.tripTitle).toBe('Japon \\ printemps')
      expect(snapshot.summary).toBe('Deux villes, trois jours.')
      expect(parser.text).toBe(FULL)
    },
  )

  it('ne rend une journée qu’une fois refermée', () => {
    const parser = new IncrementalItineraryParser()
    const secondDayStart = FULL.indexOf('{"date":"2027-04-13"')
    const snapshot = parser.push(FULL.slice(0, secondDayStart + 40))
    expect(snapshot.days).toHaveLength(1)
    expect(snapshot.days[0]).toEqual(DAYS[0])
    expect(snapshot.daysComplete).toBe(false)
    expect(snapshot.current).toEqual({
      city: 'Tokyo',
      title: undefined,
      activityNames: [],
    })
  })

  it('décrit la journée en cours avec ses premières activités', () => {
    const parser = new IncrementalItineraryParser()
    const cut = FULL.indexOf('"type":"food"')
    const snapshot = parser.push(FULL.slice(0, cut))
    expect(snapshot.days).toHaveLength(0)
    expect(snapshot.current).toEqual({
      city: 'Tokyo',
      title: 'Arrivée {et} [Shinjuku]',
      activityNames: ['Shinjuku Gyoen', 'Omoide "Yokocho"'],
    })
  })

  it('lit le titre du voyage avant la première journée', () => {
    const parser = new IncrementalItineraryParser()
    const snapshot = parser.push(FULL.slice(0, FULL.indexOf('"days"')))
    expect(snapshot.tripTitle).toBe('Japon \\ printemps')
    expect(snapshot.summary).toBe('Deux villes, trois jours.')
    expect(snapshot.days).toEqual([])
  })

  it('ignore ce qui précède le JSON (bloc de code malgré la consigne)', () => {
    const parser = new IncrementalItineraryParser()
    parser.push('```json\n')
    const snapshot = parser.push(`${FULL}\n\`\`\``)
    expect(snapshot.days).toHaveLength(3)
  })

  it('ne confond pas un tableau imbriqué avec la liste des journées', () => {
    const parser = new IncrementalItineraryParser()
    const text = JSON.stringify({
      tripTitle: 'x',
      summary: 'y',
      extra: { days: [{ nope: true }] },
      days: [{ city: 'Lyon' }],
    })
    expect(parser.push(text).days).toEqual([{ city: 'Lyon' }])
  })
})

describe('describePartialDay', () => {
  it('rend un libellé vide tant que la ville n’est pas écrite en entier', () => {
    expect(describePartialDay('{"date":"2027-04-12","city":"Tok')).toEqual({
      city: undefined,
      title: undefined,
      activityNames: [],
    })
  })
})

describe('splitStreamError', () => {
  it('sépare la réponse du code d’erreur ajouté par le serveur', () => {
    expect(splitStreamError(`{"a":1${STREAM_ERROR_MARKER}overloaded`)).toEqual({
      body: '{"a":1',
      error: 'overloaded',
    })
  })

  it('laisse une réponse sans erreur intacte', () => {
    expect(splitStreamError(FULL)).toEqual({ body: FULL })
  })

  it('le marqueur ne peut pas apparaître dans un JSON sérialisé', () => {
    expect(JSON.stringify({ text: STREAM_ERROR_MARKER })).not.toContain(
      STREAM_ERROR_MARKER,
    )
  })
})
