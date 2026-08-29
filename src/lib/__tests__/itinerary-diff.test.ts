import { describe, it, expect } from 'vitest'
import type { Activity, DayItinerary } from '../itinerary-data'
import { countChanges, summarizeItineraryChanges } from '../itinerary-diff'

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

/** Raccourci : les lignes de récap d'un itinéraire à une seule journée. */
function changesOf(before: DayItinerary, after: DayItinerary): string[] {
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
    const before = makeDay()
    const after = makeDay({ title: 'Nouveau titre' })

    expect(summarizeItineraryChanges([before], [after])).toEqual([
      {
        dayId: 'day-1',
        title: 'Jour 1 · Shanghai',
        changes: ['Journée modifiée : Titre du jour'],
      },
    ])
  })

  it('liste les libellés des champs de journée modifiés', () => {
    const before = makeDay()
    const after = makeDay({ city: 'Pékin', notes: 'Nuit sur place' })

    expect(changesOf(before, after)).toEqual(['Journée modifiée : Ville, Note'])
  })
})

describe('summarizeItineraryChanges — activités', () => {
  it('signale les ajouts et les suppressions par leur nom', () => {
    const before = makeDay({ activities: [makeActivity('act-1')] })
    const after = makeDay({
      activities: [makeActivity('act-2', { name: 'Le Bund' })],
    })

    expect(changesOf(before, after)).toEqual([
      'Activité ajoutée : Le Bund',
      'Activité supprimée : act-1',
    ])
  })

  it('formule à part une bascule de statut seule', () => {
    const before = makeDay({
      activities: [makeActivity('act-1', { name: 'Le Bund' })],
    })
    const after = makeDay({
      activities: [
        makeActivity('act-1', { name: 'Le Bund', status: 'skipped' }),
      ],
    })

    expect(changesOf(before, after)).toEqual(['Le Bund : marquée « Annulé »'])
  })

  it('détaille les champs modifiés au-delà du seul statut', () => {
    const before = makeDay({
      activities: [makeActivity('act-1', { name: 'Le Bund' })],
    })
    const after = makeDay({
      activities: [
        makeActivity('act-1', {
          name: 'Le Bund',
          status: 'done',
          duration: '2h',
        }),
      ],
    })

    expect(changesOf(before, after)).toEqual([
      'Activité modifiée : Le Bund (Statut, Durée)',
    ])
  })

  it('détecte un changement de devise à montant constant', () => {
    const before = makeDay({
      activities: [makeActivity('act-1', { price: 20, currency: 'EUR' })],
    })
    const after = makeDay({
      activities: [makeActivity('act-1', { price: 20, currency: 'CNY' })],
    })

    expect(changesOf(before, after)).toEqual([
      'Activité modifiée : act-1 (Prix)',
    ])
  })

  it('signale un réordonnancement sans autre modification', () => {
    const before = makeDay()
    const after = makeDay({
      activities: [makeActivity('act-2'), makeActivity('act-1')],
    })

    expect(changesOf(before, after)).toEqual(['Programme réordonné'])
  })

  it('ne voit pas de réordonnancement dans un simple ajout en fin de liste', () => {
    const before = makeDay()
    const after = makeDay({
      activities: [...before.activities, makeActivity('act-3')],
    })

    expect(changesOf(before, after)).toEqual(['Activité ajoutée : act-3'])
  })
})

describe('summarizeItineraryChanges — transport et hébergement', () => {
  it("signale l'ajout puis le retrait d'un transport", () => {
    const withoutTransport = makeDay()
    const withTransport = makeDay({
      transport: { id: 'tr-1', type: 'train' },
    })

    expect(changesOf(withoutTransport, withTransport)).toEqual([
      'Transport ajouté',
    ])
    expect(changesOf(withTransport, withoutTransport)).toEqual([
      'Transport supprimé',
    ])
  })

  it("liste les champs modifiés d'un hébergement", () => {
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
      'Hébergement modifié : Nom, Statut',
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
    expect(countChanges(summaries)).toBe(1)
  })

  it('signale une journée ajoutée ou retirée', () => {
    const day = makeDay()

    expect(summarizeItineraryChanges([], [day])[0].changes).toEqual([
      'Journée ajoutée',
    ])
    expect(summarizeItineraryChanges([day], [])[0].changes).toEqual([
      'Journée supprimée',
    ])
  })
})

describe('countChanges', () => {
  it('additionne les lignes de toutes les journées', () => {
    expect(
      countChanges([
        { dayId: 'day-1', title: 'Jour 1', changes: ['a', 'b'] },
        { dayId: 'day-2', title: 'Jour 2', changes: ['c'] },
      ]),
    ).toBe(3)
  })

  it('vaut zéro sans modification', () => {
    expect(countChanges([])).toBe(0)
  })
})
