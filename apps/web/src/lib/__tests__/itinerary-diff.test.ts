import { describe, it, expect } from 'vitest'
import type { Activity, DayItinerary } from '../itinerary-data'
import {
  countChanges,
  summarizeItineraryChanges,
  type EntityChange,
} from '../itinerary-diff'

function makeActivity(id: string, overrides: Partial<Activity> = {}): Activity {
  return { id, name: id, type: 'visit', ...overrides }
}

function makeDay(overrides: Partial<DayItinerary> = {}): DayItinerary {
  return {
    id: 'day-1',
    date: '2026-05-10',
    dayNumber: 1,
    city: 'Shanghai',
    title: 'Arrivée',
    coordinates: [31.2304, 121.4737],
    activities: [makeActivity('act-1'), makeActivity('act-2')],
    ...overrides,
  }
}

/** Raccourci : les modifications d'un itinéraire à une seule journée. */
function changesOf(before: DayItinerary, after: DayItinerary): EntityChange[] {
  return summarizeItineraryChanges([before], [after]).flatMap(
    (summary) => summary.changes,
  )
}

describe('summarizeItineraryChanges', () => {
  it('ne signale rien quand les deux états sont identiques', () => {
    const itinerary = [makeDay()]

    expect(summarizeItineraryChanges(itinerary, itinerary)).toEqual([])
  })

  it('ignore une clé vidée devenue absente', () => {
    const before = makeDay({ notes: '' })
    const { notes: _removed, ...after } = before

    expect(changesOf(before, after as DayItinerary)).toEqual([])
  })

  it('intitule la journée avec son numéro et sa ville', () => {
    const summaries = summarizeItineraryChanges(
      [makeDay()],
      [makeDay({ title: 'Nouveau titre' })],
    )

    expect(summaries).toHaveLength(1)
    expect(summaries[0].dayId).toBe('day-1')
    expect(summaries[0].title).toBe('Jour 1 · Shanghai')
  })

  it('donne la valeur avant et après de chaque champ de journée', () => {
    const before = makeDay()
    const after = makeDay({ city: 'Pékin', notes: 'Nuit sur place' })

    expect(changesOf(before, after)).toEqual([
      {
        id: 'day',
        kind: 'updated',
        scope: 'Journée',
        name: undefined,
        fields: [
          { label: 'Ville', before: 'Shanghai', after: 'Pékin' },
          { label: 'Note', before: '', after: 'Nuit sur place' },
        ],
      },
    ])
  })
})

describe('summarizeItineraryChanges — mise en forme des valeurs', () => {
  it('traduit un choix par le libellé de son option', () => {
    const before = makeDay({
      activities: [makeActivity('act-1', { status: 'planned' })],
    })
    const after = makeDay({
      activities: [makeActivity('act-1', { status: 'skipped' })],
    })

    expect(changesOf(before, after)[0].fields).toEqual([
      { label: 'Statut', before: 'Prévu', after: 'Passé' },
    ])
  })

  it('affiche un prix avec sa devise', () => {
    const before = makeDay({
      activities: [makeActivity('act-1', { price: 20, currency: 'EUR' })],
    })
    const after = makeDay({
      activities: [makeActivity('act-1', { price: 20, currency: 'CNY' })],
    })

    expect(changesOf(before, after)[0].fields).toEqual([
      { label: 'Prix', before: '20 EUR', after: '20 CNY' },
    ])
  })

  it('affiche une note sur cinq et une liste séparée par des points', () => {
    const before = makeDay({ highlights: ['Le Bund'] })
    const after = makeDay({ highlights: ['Le Bund', 'Jing’an'] })

    expect(changesOf(before, after)[0].fields).toEqual([
      { label: 'Points forts', before: 'Le Bund', after: 'Le Bund · Jing’an' },
    ])

    const rated = changesOf(
      makeDay({ activities: [makeActivity('act-1')] }),
      makeDay({ activities: [makeActivity('act-1', { rating: 4 })] }),
    )
    expect(rated[0].fields).toEqual([
      { label: 'Appréciation', before: '', after: '4/5' },
    ])
  })

  it('rend un booléen en oui / non', () => {
    const before = makeDay({ activities: [makeActivity('act-1')] })
    const after = makeDay({
      activities: [makeActivity('act-1', { reservationRequired: true })],
    })

    expect(changesOf(before, after)[0].fields).toEqual([
      { label: 'Réservation requise', before: 'Non', after: 'Oui' },
    ])
  })
})

describe('summarizeItineraryChanges — activités', () => {
  it('signale les ajouts et les suppressions par leur nom', () => {
    const before = makeDay({ activities: [makeActivity('act-1')] })
    const after = makeDay({
      activities: [makeActivity('act-2', { name: 'Le Bund' })],
    })

    expect(changesOf(before, after)).toEqual([
      {
        id: 'act-2',
        kind: 'added',
        scope: 'Activité',
        name: 'Le Bund',
        fields: [],
      },
      {
        id: 'act-1',
        kind: 'removed',
        scope: 'Activité',
        name: 'act-1',
        fields: [],
      },
    ])
  })

  it('nomme une activité vide plutôt que de laisser un blanc', () => {
    const before = makeDay({ activities: [] })
    const after = makeDay({
      activities: [makeActivity('act-1', { name: ' ' })],
    })

    expect(changesOf(before, after)[0].name).toBe('Activité sans nom')
  })

  it('signale un réordonnancement sans autre modification', () => {
    const before = makeDay()
    const after = makeDay({
      activities: [makeActivity('act-2'), makeActivity('act-1')],
    })

    expect(changesOf(before, after)).toEqual([
      {
        id: 'order',
        kind: 'moved',
        scope: 'Programme réordonné',
        name: undefined,
        fields: [],
      },
    ])
  })

  it('ne voit pas de réordonnancement dans un simple ajout en fin de liste', () => {
    const before = makeDay()
    const after = makeDay({
      activities: [...before.activities, makeActivity('act-3')],
    })

    expect(changesOf(before, after).map((change) => change.kind)).toEqual([
      'added',
    ])
  })
})

describe('summarizeItineraryChanges — transport et hébergement', () => {
  it("signale l'ajout puis le retrait d'un transport", () => {
    const withoutTransport = makeDay()
    const withTransport = makeDay({ transport: { id: 'tr-1', type: 'train' } })

    expect(changesOf(withoutTransport, withTransport)).toEqual([
      {
        id: 'transport',
        kind: 'added',
        scope: 'Transport',
        name: undefined,
        fields: [],
      },
    ])
    expect(changesOf(withTransport, withoutTransport)[0].kind).toBe('removed')
  })

  it("détaille les champs modifiés d'un hébergement", () => {
    const accommodation = {
      id: 'acc-1',
      name: 'B&B',
      address: '1 rue',
      bookingUrl: '',
      checkIn: '2026-05-10',
      checkOut: '2026-05-11',
    }
    const before = makeDay({ accommodation })
    const after = makeDay({
      accommodation: { ...accommodation, name: 'Hôtel', status: 'booked' },
    })

    expect(changesOf(before, after)).toEqual([
      {
        id: 'accommodation',
        kind: 'updated',
        scope: 'Hébergement',
        name: undefined,
        fields: [
          { label: 'Nom', before: 'B&B', after: 'Hôtel' },
          { label: 'Statut', before: '', after: 'Réservé' },
        ],
      },
    ])
  })
})

describe('summarizeItineraryChanges — journées', () => {
  it('regroupe les modifications par journée et garde leur ordre', () => {
    const before = [
      makeDay({ id: 'day-1', dayNumber: 1 }),
      makeDay({ id: 'day-2', dayNumber: 2, city: 'Pékin' }),
    ]
    const after = [
      before[0],
      { ...before[1], title: 'Grande Muraille', notes: 'Départ tôt' },
    ]

    const summaries = summarizeItineraryChanges(before, after)

    expect(summaries).toHaveLength(1)
    expect(summaries[0].title).toBe('Jour 2 · Pékin')
    // Deux champs retouchés sur la même entité comptent pour deux lignes.
    expect(countChanges(summaries)).toBe(2)
  })

  it('signale une journée ajoutée ou retirée', () => {
    const day = makeDay()

    expect(summarizeItineraryChanges([], [day])[0].changes[0]).toMatchObject({
      kind: 'added',
      scope: 'Journée',
      name: 'Arrivée',
    })
    expect(summarizeItineraryChanges([day], [])[0].changes[0]).toMatchObject({
      kind: 'removed',
      scope: 'Journée',
    })
  })
})

describe('countChanges', () => {
  it('compte une ligne par champ retouché', () => {
    const summaries = summarizeItineraryChanges(
      [makeDay()],
      [makeDay({ title: 'Autre titre', city: 'Pékin', notes: 'Note' })],
    )

    expect(countChanges(summaries)).toBe(3)
  })

  it('compte une ligne par ajout ou suppression', () => {
    const before = [
      makeDay({ id: 'day-1' }),
      makeDay({ id: 'day-2', dayNumber: 2 }),
    ]
    const after = [
      { ...before[0], title: 'Autre titre', activities: [] },
      { ...before[1], city: 'Pékin' },
    ]

    // Jour 1 : un champ de journée + deux suppressions ; jour 2 : un champ.
    expect(countChanges(summarizeItineraryChanges(before, after))).toBe(4)
  })

  it('vaut zéro sans modification', () => {
    expect(countChanges([])).toBe(0)
  })
})
