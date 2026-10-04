import type { DayItinerary } from '@/lib/itinerary-data'
import {
  buildDepartureChecklist,
  buildProgramRows,
  closingMinutes,
  collectPackingTips,
  countLinkedTickets,
  dayEyebrow,
  directionsUrl,
  findNextActivity,
  findStay,
  formatDateRange,
  formatDuration,
  isApplePlatform,
  moveActivityTo,
  moveItem,
  parseFood,
  reorderTarget,
  splitPlace,
  transportNumber,
  tripRecap,
} from '@/components/day/day-logic'

function day(
  index: number,
  overrides: Partial<DayItinerary> = {},
): DayItinerary {
  const date = new Date(2026, 4, 10 + index)
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return {
    id: `day-${index + 1}`,
    date: iso,
    dayNumber: index + 1,
    city: 'Shanghai',
    title: `Jour ${index + 1}`,
    coordinates: [0, 0],
    activities: [],
    ...overrides,
  }
}

describe('formatDuration', () => {
  it('ramène les durées à la typographie de l’app', () => {
    expect(formatDuration('1h30')).toBe('1 h 30')
    expect(formatDuration('2h 10m')).toBe('2 h 10')
    expect(formatDuration('2h 5m')).toBe('2 h 05')
    expect(formatDuration('3h')).toBe('3 h')
    expect(formatDuration('45m')).toBe('45 min')
    expect(formatDuration('13h20 (escale 2h20 à Pékin)')).toBe(
      '13 h 20 (escale 2h20 à Pékin)',
    )
    expect(formatDuration(undefined)).toBeUndefined()
    expect(formatDuration('une matinée')).toBe('une matinée')
  })
})

describe('dates', () => {
  it('compose le sourcil du jour', () => {
    expect(dayEyebrow(day(4), 4, 20)).toBe('JEUDI 14 MAI · JOUR 5 SUR 20')
  })

  it('compacte les plages de dates', () => {
    expect(formatDateRange('2026-05-12', '2026-05-12')).toBe('12 mai')
    expect(formatDateRange('2026-05-10', '2026-05-11')).toBe('10 – 11 mai')
    expect(formatDateRange('2026-04-30', '2026-05-02')).toMatch(
      /^30 avr\. – 2 mai$/,
    )
    expect(formatDateRange('2026-05-10', '2026-05-29', '→')).toBe(
      '10 → 29 mai',
    )
  })
})

describe('findNextActivity', () => {
  const today = day(0, {
    activities: [
      { id: 'a', name: 'Fait', type: 'visit', status: 'done' },
      { id: 'b', name: 'Fermé', type: 'visit', openAt: '08:00–10:00' },
      { id: 'c', name: 'Ouvert', type: 'visit', openAt: '08:30–17:00' },
      { id: 'd', name: 'Ensuite', type: 'food' },
    ],
  })

  it('saute ce qui est fait, annulé ou déjà fermé aujourd’hui', () => {
    const now = new Date(2026, 4, 10, 11, 0)
    expect(findNextActivity(today, now)?.activity.id).toBe('c')
    expect(findNextActivity(today, now)?.index).toBe(2)
  })

  it('garde les horaires d’un jour à venir', () => {
    const before = new Date(2026, 4, 9, 22, 0)
    expect(findNextActivity(today, before)?.activity.id).toBe('b')
  })

  it('ne propose rien pour une journée passée ou terminée', () => {
    expect(findNextActivity(today, new Date(2026, 4, 11, 9))).toBeNull()
    const done = day(0, {
      activities: [{ id: 'x', name: 'X', type: 'visit', status: 'skipped' }],
    })
    expect(findNextActivity(done, new Date(2026, 4, 10, 9))).toBeNull()
  })

  it('lit la dernière heure de fermeture', () => {
    expect(closingMinutes('09:00–12:00, 14:00–17:30')).toBe(17 * 60 + 30)
    expect(closingMinutes('toute la journée')).toBeNull()
  })
})

describe('findStay', () => {
  const hotel = {
    id: 'h',
    name: 'Hôtel',
    address: 'Rue',
    bookingUrl: '',
    checkIn: '2026-05-13',
    checkOut: '2026-05-16',
  }
  const itinerary = [
    day(0),
    day(1),
    day(2),
    day(3, { accommodation: hotel }),
    day(4),
    day(5),
    day(6),
  ]

  it('compte la nuit en cours sur les dates du séjour', () => {
    expect(findStay(itinerary, 3)).toMatchObject({
      ownerIndex: 3,
      night: 1,
      nights: 3,
    })
    expect(findStay(itinerary, 4)).toMatchObject({
      ownerIndex: 3,
      night: 2,
      nights: 3,
    })
    expect(findStay(itinerary, 5)?.night).toBe(3)
  })

  it('ne prolonge pas un séjour au-delà du départ', () => {
    expect(findStay(itinerary, 6)).toBeNull()
    expect(findStay(itinerary, 1)).toBeNull()
  })

  it('reste prudent sans dates exploitables', () => {
    const undated = [day(0, { accommodation: { ...hotel, checkIn: '' } })]
    expect(findStay(undated, 0)).toMatchObject({ night: null, nights: null })
  })
})

describe('préparation du départ', () => {
  const base = {
    dayCount: 20,
    offline: { total: 10, cached: 10 },
    notifications: 'granted' as const,
    remindersEnabled: true,
    transports: ['train', 'plane', 'train'] as ('train' | 'plane')[],
    ticketsLinked: 1,
  }

  it('ne coche que ce qui est vérifié, et le met en tête', () => {
    const items = buildDepartureChecklist(base)
    expect(items.map((i) => [i.id, i.done])).toEqual([
      ['saved', true],
      ['offline', true],
      ['notifications', true],
      ['tickets', false],
      ['share', false],
      ['calendar', false],
    ])
    const tickets = items.find((i) => i.id === 'tickets')
    expect(tickets?.detail).toBe('3 trajets en train et en avion · 1 déjà rangé')
    expect(items.find((i) => i.id === 'calendar')?.detail).toBe(
      'Les 20 jours et les horaires des trajets',
    )
  })

  it('transforme les étapes incomplètes en actions', () => {
    const items = buildDepartureChecklist({
      ...base,
      offline: { total: 10, cached: 4 },
      notifications: 'denied',
      transports: [],
    })
    expect(items.find((i) => i.id === 'offline')).toMatchObject({
      done: false,
      detail: '4 sur 10 photos enregistrées',
    })
    expect(items.find((i) => i.id === 'notifications')?.done).toBe(false)
    expect(items.some((i) => i.id === 'tickets')).toBe(false)
  })

  it('omet les rappels là où le navigateur ne les connaît pas', () => {
    const items = buildDepartureChecklist({
      ...base,
      notifications: 'unsupported',
    })
    expect(items.some((i) => i.id === 'notifications')).toBe(false)
  })

  it('compte chaque trajet couvert par un billet une seule fois', () => {
    const itinerary = [
      day(0, { transport: { id: 't1', type: 'train' } }),
      day(1),
      day(2, { transport: { id: 't2', type: 'plane' } }),
    ]
    const docs = [
      { tripId: 'trip', dayId: 'day-1', linkedTo: 'transport' },
      { tripId: 'trip', dayId: 'day-1', linkedTo: 'transport' },
      { tripId: 'other', dayId: 'day-3', linkedTo: 'transport' },
      { dayId: 'day-2', linkedTo: 'transport' },
      { tripId: 'trip', dayId: 'day-3', linkedTo: 'accommodation' },
    ]
    expect(countLinkedTickets(itinerary, docs, 'trip')).toBe(1)
  })

  it('rassemble les conseils de bagages par journée', () => {
    const itinerary = [
      day(0, { packingTips: ['Adaptateur'] }),
      day(1, { packingTips: ['Chaussures de marche'], city: 'Pékin' }),
      day(2, { packingTips: ['chaussures de marche'], city: 'Pékin' }),
    ]
    expect(collectPackingTips(itinerary)).toEqual({
      source: 'packing',
      items: [
        { text: 'Adaptateur', context: 'Jour 1 · Shanghai' },
        { text: 'Chaussures de marche', context: 'Jours 2 à 3 · Pékin' },
      ],
    })
  })

  it('se rabat sur les conseils du premier jour, sans rien inventer', () => {
    expect(
      collectPackingTips([day(0, { tips: ['Installer Alipay'] })]),
    ).toEqual({
      source: 'first-day-tips',
      items: [{ text: 'Installer Alipay', context: 'Jour 1 · Shanghai' }],
    })
    expect(collectPackingTips([day(0)]).source).toBe('none')
  })
})

describe('programme groupé par ville', () => {
  it('intercale les trajets entre les étapes', () => {
    const itinerary = [
      day(0, { title: 'Arrivée' }),
      day(1, {
        transport: { id: 't', type: 'train', from: 'Shanghai', to: 'Qingdao' },
      }),
      day(2, { city: 'Qingdao' }),
      day(3, {
        city: 'Taipei',
        transport: {
          id: 'f',
          type: 'plane',
          from: 'PVG Shanghai Pudong',
          to: 'Taipei',
        },
      }),
    ]
    const rows = buildProgramRows(itinerary).map((row) =>
      row.kind === 'city'
        ? `# ${row.city} (${row.range})`
        : row.kind === 'day'
          ? `${row.index}`
          : `> ${row.label}`,
    )
    expect(rows).toEqual([
      '# Shanghai (10 – 11 mai)',
      '0',
      '1',
      '> Train · Shanghai → Qingdao',
      '# Qingdao (12 mai)',
      '2',
      '> Vol · Shanghai Pudong → Taipei',
      '# Taipei (13 mai)',
      '3',
    ])
  })

  it('résume le voyage terminé', () => {
    const recap = tripRecap([
      day(0, {
        walkingDistance: '6 km',
        activities: [
          { id: 'a', name: 'A', type: 'visit', status: 'done' },
          { id: 'b', name: 'B', type: 'visit' },
        ],
      }),
      day(1, { walkingDistance: '8,5 km', city: 'Pékin' }),
    ])
    expect(recap).toEqual({
      days: 2,
      cities: ['Shanghai', 'Pékin'],
      activitiesDone: 1,
      activities: 2,
      walkedKm: 15,
    })
  })
})

describe('réordonnancement', () => {
  it('déplace sans muter', () => {
    const list = ['a', 'b', 'c', 'd']
    expect(moveItem(list, 2, 1)).toEqual(['a', 'c', 'b', 'd'])
    expect(moveItem(list, 0, 9)).toEqual(['b', 'c', 'd', 'a'])
    expect(list).toEqual(['a', 'b', 'c', 'd'])
  })

  it('calcule la position d’arrivée depuis les milieux', () => {
    const midpoints = [25, 75, 125, 175]
    expect(reorderTarget(midpoints, 2, 60)).toBe(1)
    expect(reorderTarget(midpoints, 0, 160)).toBe(2)
    expect(reorderTarget(midpoints, 3, 10)).toBe(0)
    expect(reorderTarget(midpoints, 1, 75)).toBe(1)
  })

  it('place une activité à une position', () => {
    const d = day(0, {
      activities: [
        { id: 'a', name: 'A', type: 'visit' },
        { id: 'b', name: 'B', type: 'visit' },
        { id: 'c', name: 'C', type: 'visit' },
      ],
    })
    expect(moveActivityTo(d, 'c', 0).activities.map((a) => a.id)).toEqual([
      'c',
      'a',
      'b',
    ])
    expect(moveActivityTo(d, 'zz', 0)).toBe(d)
  })
})

describe('itinéraires et transports', () => {
  it('préfère les coordonnées, puis l’adresse', () => {
    expect(directionsUrl({ coordinates: [39.9, 116.39] })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=39.9%2C116.39',
    )
    expect(directionsUrl({ address: '4 Jingshan' }, true)).toBe(
      'https://maps.apple.com/?daddr=4%20Jingshan',
    )
    expect(directionsUrl({})).toBeNull()
  })

  it('reconnaît les appareils Apple', () => {
    expect(isApplePlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe(
      true,
    )
    expect(isApplePlatform('Mozilla/5.0 (Macintosh)', 5)).toBe(true)
    expect(isApplePlatform('Mozilla/5.0 (Linux; Android 14)')).toBe(false)
  })

  it('lit les codes d’aéroport et les numéros', () => {
    expect(splitPlace('PKX Beijing Daxing Intl.')).toEqual({
      code: 'PKX',
      name: 'Beijing Daxing Intl.',
    })
    expect(splitPlace('Shanghai')).toEqual({ name: 'Shanghai' })
    expect(
      transportNumber({
        id: 't',
        type: 'plane',
        details: 'China Southern Airlines CZ8823 | Meal',
      }),
    ).toBe('CZ8823')
    expect(
      transportNumber({ id: 't', type: 'train', details: 'Train G195' }),
    ).toBe('G195')
    expect(
      transportNumber({ id: 't', type: 'plane', details: 'Vol 9C8951' }),
    ).toBe('9C8951')
    expect(transportNumber({ id: 't', type: 'car' })).toBeUndefined()
  })

  it('sépare le plat, son écriture locale et la précision', () => {
    expect(
      parseFood('Canard laqué de Pékin (北京烤鸭) — chez Quanjude ou Da Dong'),
    ).toEqual({
      name: 'Canard laqué de Pékin',
      native: '北京烤鸭',
      detail: 'chez Quanjude ou Da Dong',
    })
    expect(parseFood('Thé au lait perlé (bubble tea)')).toEqual({
      name: 'Thé au lait perlé (bubble tea)',
      detail: undefined,
    })
  })
})
