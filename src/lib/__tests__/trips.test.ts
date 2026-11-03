import type { DayItinerary } from '@/lib/itinerary-data'
import type {
  PublishedTemplateInfo,
  TemplateOrigin,
} from '@/lib/template-model'
import {
  currentDayIndex,
  daysUntil,
  deriveTripTitle,
  pickDefaultTrip,
  sortTripSummaries,
  summarizeTrip,
  tripCities,
  msUntilNextMidnight,
  tripDateRange,
  tripStatus,
  type StoredTrip,
} from '@/lib/trips'

function day(date: string, city: string): DayItinerary {
  return {
    id: `day-${date}`,
    date,
    dayNumber: 1,
    city,
    title: city,
    activities: [],
    coordinates: [0, 0],
  }
}

function trip(id: string, days: DayItinerary[]): StoredTrip {
  return {
    id,
    title: id,
    itinerary: days,
    source: 'json',
    createdAt: 0,
    updatedAt: 0,
  }
}

/** Côté auteur : un voyage au Japon publié comme modèle, jeton compris. */
function publishedTemplate(
  partial: Partial<PublishedTemplateInfo> = {},
): PublishedTemplateInfo {
  return {
    id: 'k3v9x2mq8r7t4wza',
    slug: 'japon-14-jours-tokyo-kyoto-osaka',
    ownerToken: 'q8Zl1yM3n0Vb7cXk2Rj5Hs9Pf4Tw6Ue1Ga0Ld8Ky3Ni',
    version: 2,
    indexable: true,
    includesNotes: false,
    includesPrices: true,
    authorName: 'Yanis',
    country: 'JP',
    publishedAt: '2026-10-02T09:15:00.000Z',
    updatedAt: '2026-10-20T18:40:00.000Z',
    ...partial,
  }
}

/** Côté repreneur : le même modèle, repris à ses dates en gardant 2 journées. */
function templateOrigin(
  base: DayItinerary[],
  partial: Partial<TemplateOrigin> = {},
): TemplateOrigin {
  return {
    templateId: 'k3v9x2mq8r7t4wza',
    version: 2,
    title: 'Japon en 14 jours',
    authorName: 'Yanis',
    startDate: base[0]?.date ?? '2026-06-01',
    keptDayIds: base.map((item) => item.id),
    base,
    takenAt: Date.UTC(2026, 9, 28, 20, 5),
    ...partial,
  }
}

const today = new Date(2026, 4, 14)

describe('tripCities', () => {
  it('garde l’ordre du voyage sans répéter une ville', () => {
    const days = [
      day('2026-05-10', 'Shanghai'),
      day('2026-05-11', 'Shanghai'),
      day('2026-05-12', 'Pékin'),
      day('2026-05-13', 'Shanghai'),
    ]
    expect(tripCities(days)).toEqual(['Shanghai', 'Pékin'])
  })
})

describe('deriveTripTitle', () => {
  it('nomme le voyage d’après ses étapes', () => {
    expect(deriveTripTitle([])).toBe('Mon voyage')
    expect(deriveTripTitle([day('2026-05-10', 'Lisbonne')])).toBe('Lisbonne')
    expect(
      deriveTripTitle([day('2026-05-10', 'Tokyo'), day('2026-05-11', 'Kyoto')]),
    ).toBe('Tokyo et Kyoto')
    expect(
      deriveTripTitle(
        ['A', 'B', 'C', 'D', 'E'].map((city, index) =>
          day(`2026-05-1${index}`, city),
        ),
      ),
    ).toBe('A, B et 3 autres villes')
  })
})

describe('tripStatus', () => {
  const days = [day('2026-05-10', 'A'), day('2026-05-29', 'B')]
  it('distingue avant, pendant et après', () => {
    expect(tripStatus(days, new Date(2026, 4, 1))).toBe('upcoming')
    expect(tripStatus(days, today)).toBe('ongoing')
    expect(tripStatus(days, new Date(2026, 4, 29))).toBe('ongoing')
    expect(tripStatus(days, new Date(2026, 5, 2))).toBe('past')
  })
})

describe('tripDateRange', () => {
  it('prend les extrêmes, même dans le désordre', () => {
    const days = [
      day('2026-05-12', 'B'),
      day('2026-05-10', 'A'),
      day('2026-05-29', 'C'),
      day('2026-05-20', 'D'),
    ]
    expect(tripDateRange(days)).toEqual({
      start: '2026-05-10',
      end: '2026-05-29',
    })
    // Le dernier jour du tableau n'est pas la fin : le voyage est bien en cours.
    expect(tripStatus(days, new Date(2026, 4, 25))).toBe('ongoing')
    expect(summarizeTrip(trip('x', days), today)).toMatchObject({
      startDate: '2026-05-10',
      endDate: '2026-05-29',
    })
  })

  it('ignore les dates illisibles', () => {
    const days = [day('', 'A'), day('bientôt', 'B'), day('2026-05-10', 'C')]
    expect(tripDateRange(days)).toEqual({
      start: '2026-05-10',
      end: '2026-05-10',
    })
    expect(tripDateRange([day('', 'A')])).toBeNull()
    expect(tripStatus([day('', 'A')], today)).toBe('upcoming')
  })
})

describe('msUntilNextMidnight', () => {
  it('compte jusqu’au prochain minuit local', () => {
    expect(msUntilNextMidnight(new Date(2026, 4, 14, 23, 0))).toBe(3_600_000)
  })
})

describe('currentDayIndex', () => {
  const days = [
    day('2026-05-13', 'A'),
    day('2026-05-14', 'B'),
    day('2026-05-15', 'C'),
  ]
  it('se place sur la journée du jour, sinon sur un bord', () => {
    expect(currentDayIndex(days, today)).toBe(1)
    expect(currentDayIndex(days, new Date(2026, 4, 1))).toBe(0)
    expect(currentDayIndex(days, new Date(2026, 5, 1))).toBe(2)
    expect(currentDayIndex([], today)).toBe(0)
  })
})

describe('daysUntil', () => {
  it('compte les jours entiers sans se soucier de l’heure', () => {
    expect(daysUntil('2026-05-26', new Date(2026, 4, 14, 23, 30))).toBe(12)
    expect(daysUntil('2026-05-10', today)).toBe(-4)
  })
})

describe('sortTripSummaries / pickDefaultTrip', () => {
  const past = summarizeTrip(
    trip('past', [day('2025-10-01', 'Lisbonne')]),
    today,
  )
  const soon = summarizeTrip(trip('soon', [day('2026-06-01', 'Rome')]), today)
  const later = summarizeTrip(
    trip('later', [day('2027-04-12', 'Tokyo')]),
    today,
  )
  const now = summarizeTrip(
    trip('now', [day('2026-05-10', 'Shanghai'), day('2026-05-29', 'Paris')]),
    today,
  )

  it('met le voyage en cours d’abord, puis les prochains, puis les passés', () => {
    expect(
      sortTripSummaries([past, later, now, soon]).map((t) => t.id),
    ).toEqual(['now', 'soon', 'later', 'past'])
  })

  it('ouvre le voyage en cours, sinon le prochain', () => {
    expect(pickDefaultTrip([past, later, now])).toBe('now')
    expect(pickDefaultTrip([past, later])).toBe('later')
    expect(pickDefaultTrip([past])).toBe('past')
    expect(pickDefaultTrip([])).toBeNull()
  })
})

describe('summarizeTrip — itinéraires modèles', () => {
  const japan = [day('2026-06-01', 'Tokyo'), day('2026-06-02', 'Kyoto')]

  it('signale un voyage repris d’un modèle', () => {
    const taken: StoredTrip = {
      ...trip('repris', japan),
      source: 'template',
      origin: templateOrigin(japan),
    }
    expect(summarizeTrip(taken, today)).toMatchObject({
      source: 'template',
      fromTemplate: true,
      isPublishedTemplate: false,
    })
  })

  it('signale un voyage publié comme modèle depuis ce téléphone', () => {
    const published: StoredTrip = {
      ...trip('publie', japan),
      publishedTemplate: publishedTemplate(),
    }
    expect(summarizeTrip(published, today)).toMatchObject({
      fromTemplate: false,
      isPublishedTemplate: true,
    })
  })

  it('ne voit ni reprise ni publication sur un voyage ordinaire', () => {
    expect(summarizeTrip(trip('ordinaire', japan), today)).toMatchObject({
      fromTemplate: false,
      isPublishedTemplate: false,
    })
  })

  it('s’appuie sur le lien au modèle, pas sur la provenance', () => {
    // Une copie d'un voyage repris garde la provenance, pas le modèle.
    const copy: StoredTrip = { ...trip('copie', japan), source: 'template' }
    expect(summarizeTrip(copy, today).fromTemplate).toBe(false)
  })

  it('ne fait jamais voyager le jeton propriétaire dans le résumé', () => {
    const published: StoredTrip = {
      ...trip('publie', japan),
      publishedTemplate: publishedTemplate(),
      origin: templateOrigin(japan),
    }
    const summary = JSON.stringify(summarizeTrip(published, today))
    expect(summary).not.toContain(publishedTemplate().ownerToken)
    expect(summary).not.toContain('k3v9x2mq8r7t4wza')
  })
})
