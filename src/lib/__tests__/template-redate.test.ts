import { daysBetween } from '@/lib/iso-date'
import {
  itinerary as demoItinerary,
  type Accommodation,
  type Activity,
  type DayItinerary,
  type Transport,
} from '@/lib/itinerary-data'
import {
  durationChoice,
  groupDaysByCity,
  looksLikeRestDay,
  retimeTemplate,
  suggestKeptDayIds,
  templateTodo,
} from '@/lib/template-redate'

// ── Fabriques ─────────────────────────────────────────────────────────────────

const COORDINATES: Record<string, [number, number]> = {
  Tokyo: [35.6762, 139.6503],
  Hakone: [35.2324, 139.1069],
  Kyoto: [35.0116, 135.7681],
  Nara: [34.6851, 135.8048],
  Osaka: [34.6937, 135.5023],
  Lisbonne: [38.7223, -9.1393],
  Sintra: [38.8029, -9.3817],
}

function activity(
  id: string,
  name: string,
  extra: Partial<Activity> = {},
): Activity {
  return { id, name, type: 'visit', duration: '2h', ...extra }
}

function hotel(
  id: string,
  name: string,
  checkIn: string,
  checkOut: string,
  extra: Partial<Accommodation> = {},
): Accommodation {
  return {
    id,
    name,
    address: `${name}, Japon`,
    bookingUrl: '',
    checkIn,
    checkOut,
    ...extra,
  }
}

function train(
  id: string,
  from: string,
  to: string,
  extra: Partial<Transport> = {},
): Transport {
  return { id, type: 'train', from, to, ...extra }
}

function day(
  id: string,
  date: string,
  city: string,
  title: string,
  extra: Partial<DayItinerary> = {},
): DayItinerary {
  return {
    id,
    date,
    dayNumber: 0,
    city,
    title,
    activities: [],
    coordinates: COORDINATES[city] ?? [0, 0],
    ...extra,
  }
}

function numbered(days: DayItinerary[]): DayItinerary[] {
  return days.map((entry, index) => ({ ...entry, dayNumber: index + 1 }))
}

const gracery = () =>
  hotel(
    'acc-gracery',
    'Hotel Gracery Shinjuku',
    '2025-03-28T15:00:00',
    '2025-04-01T11:00:00',
    { bookingReference: 'GRC-55821', price: 720, currency: 'EUR' },
  )

const kanra = (id: string, name = 'Hotel Kanra Kyoto') =>
  hotel(id, name, '2025-04-02', '2025-04-07', { price: 900, currency: 'EUR' })

const crossHotel = () =>
  hotel('acc-cross', 'Cross Hotel Osaka', '2025-04-08', '2025-04-11')

/**
 * 14 jours au Japon, tels qu'un auteur les publierait : Tokyo ×4, Hakone,
 * Kyoto ×5, Nara, Osaka ×3. Hébergements répétés sur chaque nuit, en dates
 * nues comme en dates-heures ; trajets en dates-heures ou en heures seules,
 * l'un rangé au jour d'arrivée, l'autre au jour de départ.
 */
function japanTemplate(): DayItinerary[] {
  return numbered([
    day('jp-01', '2025-03-28', 'Tokyo', 'Arrivée à Tokyo', {
      dayType: 'arrival',
      transport: {
        id: 'tr-paris-tokyo',
        type: 'plane',
        from: 'Paris CDG',
        to: 'Tokyo Haneda (HND)',
        departureTime: '2025-03-27T19:40',
        arrivalTime: '2025-03-28T15:05',
        duration: '13h25',
        provider: 'Air France',
        bookingReference: 'AF8KX2',
      },
      accommodation: gracery(),
      activities: [activity('act-omoide', 'Omoide Yokocho', { type: 'food' })],
    }),
    day('jp-02', '2025-03-29', 'Tokyo', 'Asakusa et Ueno', {
      accommodation: gracery(),
      activities: [
        activity('act-sensoji', 'Temple Senso-ji', { openAt: '06:00–17:00' }),
        activity('act-teamlab', 'teamLab Planets', {
          type: 'experience',
          reservationRequired: true,
          price: 32,
          currency: 'EUR',
        }),
      ],
    }),
    day('jp-03', '2025-03-30', 'Tokyo', 'Shibuya et Harajuku', {
      accommodation: gracery(),
      activities: [
        activity('act-meiji', 'Sanctuaire Meiji-jingu'),
        activity('act-shibuya-sky', 'Shibuya Sky', {
          reservationRequired: true,
        }),
      ],
    }),
    day('jp-04', '2025-03-31', 'Tokyo', 'Journée libre à Tokyo', {
      dayType: 'free',
      accommodation: gracery(),
      activities: [
        activity('act-ghibli', 'Musée Ghibli', { reservationRequired: true }),
      ],
    }),
    day('jp-05', '2025-04-01', 'Hakone', 'Onsen à Hakone', {
      transport: train('tr-tokyo-hakone', 'Tokyo', 'Hakone-Yumoto', {
        departureTime: '09:10',
        arrivalTime: '10:45',
        duration: '1h35',
        provider: 'Odakyu',
        details: 'Romancecar Hakone 5',
        departureAddress: 'Gare de Shinjuku',
      }),
      accommodation: hotel(
        'acc-ginyu',
        'Ryokan Hakone Ginyu',
        '2025-04-01',
        '2025-04-02',
      ),
      activities: [
        activity('act-ropeway', 'Hakone Ropeway', { type: 'transport' }),
        activity('act-kaiseki', 'Dîner kaiseki', {
          type: 'food',
          reservationRequired: true,
        }),
      ],
    }),
    day('jp-06', '2025-04-02', 'Kyoto', 'Arrivée à Kyoto', {
      transport: train('tr-hakone-kyoto', 'Hakone', 'Kyoto', {
        departureTime: '2025-04-02T10:12',
        arrivalTime: '2025-04-02T12:20',
        duration: '2h08',
        provider: 'JR Central',
        details: 'Shinkansen Hikari 637 depuis Odawara',
        departureAddress: 'Gare d’Odawara',
        bookingUrl: 'https://www.eki-net.com',
        price: 11000,
        currency: 'JPY',
      }),
      accommodation: kanra('acc-kanra-1'),
      activities: [activity('act-gion', 'Balade à Gion')],
    }),
    day('jp-07', '2025-04-03', 'Kyoto', 'Fushimi Inari', {
      accommodation: kanra('acc-kanra-2'),
      activities: [
        activity('act-inari', 'Fushimi Inari-taisha', { openAt: '24h/24' }),
        activity('act-the', 'Cérémonie du thé', {
          type: 'experience',
          reservationRequired: true,
        }),
      ],
    }),
    day(
      'jp-08',
      '2025-04-04',
      'Kyoto',
      'Matinée de repos, Kurama l’après-midi',
      {
        dayType: 'nature',
        transport: {
          id: 'tr-kurama',
          type: 'bus',
          from: 'Kyoto',
          to: 'Kurama',
          departureTime: '13:30',
        },
        accommodation: kanra('acc-kanra-3'),
      },
    ),
    day('jp-09', '2025-04-05', 'Kyoto', 'Arashiyama', {
      // Même hôtel, saisi autrement : la casse et les espaces ne comptent pas.
      accommodation: kanra('acc-kanra-4', ' hotel kanra  KYOTO'),
      activities: [
        activity('act-bambous', 'Forêt de bambous', {
          reservationRequired: false,
        }),
      ],
    }),
    day('jp-10', '2025-04-06', 'Kyoto', 'Kinkaku-ji et Nishiki', {
      accommodation: kanra('acc-kanra-5'),
      activities: [activity('act-kinkaku', 'Kinkaku-ji')],
    }),
    day('jp-11', '2025-04-07', 'Nara', 'Nara et ses daims', {
      accommodation: hotel(
        'acc-nara',
        'Nara Hotel',
        '2025-04-07T14:00',
        '2025-04-08T09:00',
      ),
      // Rangé au jour du départ : le train du lendemain matin.
      transport: train('tr-nara-osaka', 'Nara', 'Osaka (Namba)', {
        departureTime: '2025-04-08T09:15',
        arrivalTime: '2025-04-08T09:50',
        provider: 'Kintetsu',
      }),
      activities: [activity('act-todaiji', 'Tōdai-ji')],
    }),
    day('jp-12', '2025-04-08', 'Osaka', 'Dotonbori', {
      accommodation: crossHotel(),
      activities: [activity('act-takoyaki', 'Takoyaki', { type: 'food' })],
    }),
    day('jp-13', '2025-04-09', 'Osaka', 'Château d’Osaka', {
      accommodation: crossHotel(),
      transport: {
        id: 'tr-kobe',
        type: 'car',
        from: 'Osaka',
        to: 'Kobe',
        departureTime: '16:00',
      },
      activities: [
        activity('act-usj', 'Universal Studios Japan', {
          reservationRequired: true,
        }),
      ],
    }),
    day('jp-14', '2025-04-10', 'Osaka', 'Dernier jour à Osaka', {
      dayType: 'departure',
      accommodation: crossHotel(),
      transport: {
        id: 'tr-osaka-paris',
        type: 'plane',
        from: 'Osaka Kansai (KIX)',
        to: 'Paris CDG',
        departureTime: '2025-04-11T10:25',
        arrivalTime: '2025-04-11T17:50',
        provider: 'Air France',
        bookingReference: 'AF8KX2',
      },
    }),
  ])
}

const ALL_IDS = japanTemplate().map((entry) => entry.id)

function idsWithout(...removed: string[]): string[] {
  return ALL_IDS.filter((id) => !removed.includes(id))
}

function byId(days: DayItinerary[], id: string): DayItinerary {
  const found = days.find((entry) => entry.id === id)
  if (!found) throw new Error(`Journée ${id} absente`)
  return found
}

function idsOf(days: readonly DayItinerary[]): string[] {
  return days.flatMap((entry) => [
    entry.id,
    ...entry.activities.map((item) => item.id),
    ...(entry.accommodation ? [entry.accommodation.id] : []),
    ...(entry.transport ? [entry.transport.id] : []),
  ])
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}

function inTimeZone<T>(timeZone: string, run: () => T): T {
  const previous = process.env.TZ
  process.env.TZ = timeZone
  try {
    return run()
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
}

const stays = (days: DayItinerary[]) =>
  days.map((entry) =>
    entry.accommodation
      ? `${entry.accommodation.checkIn} → ${entry.accommodation.checkOut}`
      : null,
  )

// ── retimeTemplate ────────────────────────────────────────────────────────────

describe('retimeTemplate', () => {
  describe('avec toutes les journées', () => {
    const result = retimeTemplate(japanTemplate(), {
      startDate: '2026-07-14',
      keptDayIds: ALL_IDS,
    })

    it('fait partir le voyage à la date choisie, sans trou', () => {
      expect(result.map((entry) => entry.date)).toEqual([
        '2026-07-14',
        '2026-07-15',
        '2026-07-16',
        '2026-07-17',
        '2026-07-18',
        '2026-07-19',
        '2026-07-20',
        '2026-07-21',
        '2026-07-22',
        '2026-07-23',
        '2026-07-24',
        '2026-07-25',
        '2026-07-26',
        '2026-07-27',
      ])
      expect(result.map((entry) => entry.dayNumber)).toEqual(
        Array.from({ length: 14 }, (_, index) => index + 1),
      )
    })

    it('décale les horaires de transport avec leur journée, sans toucher aux heures', () => {
      expect(byId(result, 'jp-01').transport).toMatchObject({
        departureTime: '2026-07-13T19:40',
        arrivalTime: '2026-07-14T15:05',
      })
      expect(byId(result, 'jp-05').transport).toMatchObject({
        departureTime: '09:10',
        arrivalTime: '10:45',
      })
      expect(byId(result, 'jp-06').transport).toMatchObject({
        departureTime: '2026-07-19T10:12',
        arrivalTime: '2026-07-19T12:20',
      })
      // Le train du lendemain matin reste le lendemain matin.
      expect(byId(result, 'jp-11').transport).toMatchObject({
        departureTime: '2026-07-25T09:15',
        arrivalTime: '2026-07-25T09:50',
      })
      expect(byId(result, 'jp-14').transport?.departureTime).toBe(
        '2026-07-28T10:25',
      )
    })

    it('recale chaque séjour sur ses nuits, à l’heure d’origine', () => {
      expect(stays(result)).toEqual([
        ...Array(4).fill('2026-07-14T15:00:00 → 2026-07-18T11:00:00'),
        '2026-07-18 → 2026-07-19',
        ...Array(5).fill('2026-07-19 → 2026-07-24'),
        '2026-07-24T14:00 → 2026-07-25T09:00',
        ...Array(3).fill('2026-07-25 → 2026-07-28'),
      ])
    })

    it('garde tout le reste à l’identique', () => {
      const template = japanTemplate()
      result.forEach((entry, index) => {
        const original = template[index]
        expect(entry.title).toBe(original.title)
        expect(entry.city).toBe(original.city)
        expect(entry.activities).toEqual(original.activities)
        expect(entry.coordinates).toEqual(original.coordinates)
        expect(entry.accommodation?.name).toBe(original.accommodation?.name)
        expect(entry.transport?.bookingReference).toBe(
          original.transport?.bookingReference,
        )
      })
    })

    it('conserve tous les ids', () => {
      expect(idsOf(result)).toEqual(idsOf(japanTemplate()))
    })
  })

  it('passe les fins de mois', () => {
    const result = retimeTemplate(japanTemplate(), {
      startDate: '2026-01-25',
      keptDayIds: ALL_IDS,
    })
    expect(result.map((entry) => entry.date).slice(5, 9)).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ])
    expect(byId(result, 'jp-08').accommodation).toMatchObject({
      checkIn: '2026-01-30',
      checkOut: '2026-02-04',
    })
    expect(byId(result, 'jp-11').transport?.departureTime).toBe(
      '2026-02-05T09:15',
    )
    expect(byId(result, 'jp-01').transport?.departureTime).toBe(
      '2026-01-24T19:40',
    )
  })

  it('passe le Nouvel An', () => {
    const result = retimeTemplate(japanTemplate(), {
      startDate: '2026-12-25',
      keptDayIds: ALL_IDS,
    })
    expect(byId(result, 'jp-07').date).toBe('2026-12-31')
    expect(byId(result, 'jp-08').date).toBe('2027-01-01')
    expect(byId(result, 'jp-14').date).toBe('2027-01-07')
    expect(byId(result, 'jp-06').accommodation).toMatchObject({
      checkIn: '2026-12-30',
      checkOut: '2027-01-04',
    })
    expect(byId(result, 'jp-01').accommodation).toMatchObject({
      checkIn: '2026-12-25T15:00:00',
      checkOut: '2026-12-29T11:00:00',
    })
    expect(byId(result, 'jp-14').transport?.departureTime).toBe(
      '2027-01-08T10:25',
    )
  })

  it('passe le 29 février des années bissextiles, et lui seul', () => {
    const leap = retimeTemplate(japanTemplate(), {
      startDate: '2028-02-25',
      keptDayIds: ALL_IDS,
    })
    expect(byId(leap, 'jp-05').date).toBe('2028-02-29')
    expect(byId(leap, 'jp-05').accommodation).toMatchObject({
      checkIn: '2028-02-29',
      checkOut: '2028-03-01',
    })
    expect(byId(leap, 'jp-04').accommodation?.checkOut).toBe(
      '2028-02-29T11:00:00',
    )

    const common = retimeTemplate(japanTemplate(), {
      startDate: '2027-02-25',
      keptDayIds: ALL_IDS,
    })
    expect(byId(common, 'jp-05').date).toBe('2027-03-01')
    expect(byId(common, 'jp-04').accommodation?.checkOut).toBe(
      '2027-03-01T11:00:00',
    )
  })

  it('ne dépend pas du fuseau de l’appareil, heure d’été comprise', () => {
    // Le 29 mars 2026, l'Europe passe à l'heure d'été au milieu du séjour.
    const options = { startDate: '2026-03-27', keptDayIds: idsWithout('jp-05') }
    const reference = inTimeZone('UTC', () =>
      retimeTemplate(japanTemplate(), options),
    )
    for (const timeZone of [
      'Europe/Paris',
      'America/Sao_Paulo',
      'Pacific/Kiritimati',
      'Pacific/Pago_Pago',
    ]) {
      expect(
        inTimeZone(timeZone, () => retimeTemplate(japanTemplate(), options)),
      ).toEqual(reference)
    }
    expect(reference.map((entry) => entry.date).slice(0, 4)).toEqual([
      '2026-03-27',
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
    ])
  })

  describe('quand le repreneur retire des journées', () => {
    it('retire une ville du milieu : le trajet suivant repart de l’étape précédente', () => {
      const result = retimeTemplate(japanTemplate(), {
        startDate: '2026-07-14',
        keptDayIds: idsWithout('jp-05'),
      })
      expect(result).toHaveLength(13)
      expect(result.some((entry) => entry.city === 'Hakone')).toBe(false)
      // Plus d'horaire ni d'opérateur : ils décrivaient Hakone → Kyoto.
      expect(byId(result, 'jp-06').transport).toEqual({
        id: 'tr-hakone-kyoto',
        type: 'train',
        from: 'Tokyo',
        to: 'Kyoto',
        bookingUrl: 'https://www.eki-net.com',
        price: 11000,
        currency: 'JPY',
      })
      expect(byId(result, 'jp-06')).toMatchObject({
        date: '2026-07-18',
        dayNumber: 5,
      })
      expect(byId(result, 'jp-04').accommodation?.checkOut).toBe(
        '2026-07-18T11:00:00',
      )
      expect(byId(result, 'jp-06').accommodation).toMatchObject({
        checkIn: '2026-07-18',
        checkOut: '2026-07-23',
      })
    })

    it('retire la dernière ville : le trajet qui y menait disparaît', () => {
      const result = retimeTemplate(japanTemplate(), {
        startDate: '2026-07-14',
        keptDayIds: idsWithout('jp-12', 'jp-13', 'jp-14'),
      })
      expect(result).toHaveLength(11)
      const nara = result[10]
      expect(nara.id).toBe('jp-11')
      expect(nara).not.toHaveProperty('transport')
      expect(nara.accommodation).toMatchObject({
        checkIn: '2026-07-24T14:00',
        checkOut: '2026-07-25T09:00',
      })
      // Kurama ou Kobe ne sont pas des étapes du voyage : rien n'y touche.
      expect(byId(result, 'jp-08').transport?.to).toBe('Kurama')
    })

    it('retire le jour 1 : le séjour à Tokyo commence au nouveau départ', () => {
      const result = retimeTemplate(japanTemplate(), {
        startDate: '2026-07-14',
        keptDayIds: idsWithout('jp-01'),
      })
      expect(result[0]).toMatchObject({
        id: 'jp-02',
        date: '2026-07-14',
        dayNumber: 1,
      })
      expect(stays(result).slice(0, 3)).toEqual(
        Array(3).fill('2026-07-14T15:00:00 → 2026-07-17T11:00:00'),
      )
      expect(
        result.some((entry) => entry.transport?.id === 'tr-paris-tokyo'),
      ).toBe(false)
    })

    it('retire toute la première ville : le trajet suivant perd son départ', () => {
      const result = retimeTemplate(japanTemplate(), {
        startDate: '2026-07-14',
        keptDayIds: idsWithout('jp-01', 'jp-02', 'jp-03', 'jp-04'),
      })
      expect(result[0]).toMatchObject({ id: 'jp-05', date: '2026-07-14' })
      expect(result[0].transport).toEqual({
        id: 'tr-tokyo-hakone',
        type: 'train',
        to: 'Hakone-Yumoto',
      })
    })

    it('retire une journée au milieu d’un séjour : l’hôtel garde les nuits restantes', () => {
      const result = retimeTemplate(japanTemplate(), {
        startDate: '2026-07-14',
        keptDayIds: idsWithout('jp-08'),
      })
      for (const id of ['jp-06', 'jp-07', 'jp-09', 'jp-10']) {
        expect(byId(result, id).accommodation).toMatchObject({
          checkIn: '2026-07-19',
          checkOut: '2026-07-23',
        })
      }
      expect(byId(result, 'jp-11').accommodation).toMatchObject({
        checkIn: '2026-07-23T14:00',
        checkOut: '2026-07-24T09:00',
      })
      expect(byId(result, 'jp-11').transport?.departureTime).toBe(
        '2026-07-24T09:15',
      )
    })

    it('recolle un séjour coupé par une ville retirée, et oublie le trajet devenu inutile', () => {
      const memmo = (id: string, name: string) => ({
        ...hotel(id, name, '2025-09-01', '2025-09-02'),
        address: 'Travessa das Merceeiras 27, Lisbonne',
      })
      const template = numbered([
        day('pt-1', '2025-09-01', 'Lisbonne', 'Alfama', {
          accommodation: memmo('acc-memmo-1', 'Memmo Alfama'),
        }),
        day('pt-2', '2025-09-02', 'Sintra', 'Palais de Pena', {
          transport: train('tr-sintra', 'Lisbonne', 'Sintra'),
          accommodation: hotel(
            'acc-quinta',
            'Quinta da Regaleira',
            '2025-09-02',
            '2025-09-03',
          ),
        }),
        day('pt-3', '2025-09-03', 'Lisbonne', 'Belém', {
          transport: train('tr-retour', 'Sintra', 'Lisbonne', {
            departureTime: '18:10',
          }),
          accommodation: memmo('acc-memmo-2', 'MEMMO  alfama'),
        }),
      ])
      const result = retimeTemplate(template, {
        startDate: '2026-05-01',
        keptDayIds: ['pt-1', 'pt-3'],
      })
      expect(stays(result)).toEqual([
        '2026-05-01 → 2026-05-03',
        '2026-05-01 → 2026-05-03',
      ])
      // Il repartirait de Lisbonne pour Lisbonne.
      expect(result[1]).not.toHaveProperty('transport')
    })

    it('ignore l’ordre et les ids inconnus de keptDayIds', () => {
      const kept = idsWithout('jp-05', 'jp-11')
      const ordered = retimeTemplate(japanTemplate(), {
        startDate: '2026-07-14',
        keptDayIds: kept,
      })
      const shuffled = retimeTemplate(japanTemplate(), {
        startDate: '2026-07-14',
        keptDayIds: ['inconnu', ...[...kept].reverse(), 'jp-02'],
      })
      expect(shuffled).toEqual(ordered)
    })
  })

  describe('avec des dates manquantes', () => {
    it('fait du jour 1 la date choisie quand le modèle n’a aucune date', () => {
      const template = japanTemplate().map((entry) => ({
        ...entry,
        date: '',
        ...(entry.accommodation && {
          accommodation: { ...entry.accommodation, checkIn: '', checkOut: '' },
        }),
      }))
      const result = retimeTemplate(template, {
        startDate: '2026-07-14',
        keptDayIds: idsWithout('jp-05'),
      })
      expect(result[0].date).toBe('2026-07-14')
      expect(result[12].date).toBe('2026-07-26')
      expect(result.map((entry) => entry.dayNumber)).toEqual(
        Array.from({ length: 13 }, (_, index) => index + 1),
      )
      // Un champ vide reste vide ; sans date de référence, rien ne glisse.
      expect(stays(result)[0]).toBe(' → ')
      expect(byId(result, 'jp-14').transport?.departureTime).toBe(
        '2025-04-11T10:25',
      )
    })

    it('situe une journée sans date d’après la première journée datée', () => {
      const template = japanTemplate().map((entry) =>
        entry.id === 'jp-01' || entry.id === 'jp-06'
          ? { ...entry, date: '' }
          : entry,
      )
      const result = retimeTemplate(template, {
        startDate: '2026-07-14',
        keptDayIds: ALL_IDS,
      })
      expect(byId(result, 'jp-01')).toMatchObject({ date: '2026-07-14' })
      expect(byId(result, 'jp-01').transport?.departureTime).toBe(
        '2026-07-13T19:40',
      )
      expect(byId(result, 'jp-06').transport?.departureTime).toBe(
        '2026-07-19T10:12',
      )
    })

    it('comble les trous du modèle, chaque journée glissant de son propre écart', () => {
      const template = numbered([
        day('gap-1', '2025-06-01', 'Tokyo', 'Arrivée'),
        day('gap-2', '2025-06-05', 'Kyoto', 'Kyoto', {
          transport: train('tr-gap', 'Tokyo', 'Kyoto', {
            departureTime: '2025-06-05T09:00',
          }),
        }),
      ])
      const result = retimeTemplate(template, {
        startDate: '2026-01-10',
        keptDayIds: ['gap-1', 'gap-2'],
      })
      expect(result.map((entry) => entry.date)).toEqual([
        '2026-01-10',
        '2026-01-11',
      ])
      expect(result[1].transport?.departureTime).toBe('2026-01-11T09:00')
    })
  })

  describe('pour la fusion de la V1.1', () => {
    it('garde les ids, même ceux qui ont la forme d’une date', () => {
      const template = numbered([
        day('2025-03-28', '2025-03-28', 'Tokyo', 'Arrivée', {
          accommodation: hotel(
            '2025-03-28',
            'Gracery',
            '2025-03-28',
            '2025-03-29',
          ),
          transport: train('2025-03-28', 'Narita', 'Tokyo'),
          activities: [activity('2025-03-28T09:00', 'Senso-ji')],
        }),
      ])
      const result = retimeTemplate(template, {
        startDate: '2026-07-14',
        keptDayIds: ['2025-03-28'],
      })
      expect(idsOf(result)).toEqual([
        '2025-03-28',
        '2025-03-28T09:00',
        '2025-03-28',
        '2025-03-28',
      ])
      expect(result[0].accommodation?.checkIn).toBe('2026-07-14')
    })

    it('rend toujours le même résultat pour la même entrée', () => {
      const options = {
        startDate: '2026-10-30',
        keptDayIds: idsWithout('jp-04', 'jp-05', 'jp-08', 'jp-14'),
      }
      const first = retimeTemplate(japanTemplate(), options)
      const second = retimeTemplate(japanTemplate(), options)
      expect(second).toStrictEqual(first)
      expect(JSON.stringify(second)).toBe(JSON.stringify(first))
    })

    it('ne modifie jamais le modèle, et n’en partage aucun objet', () => {
      const template = deepFreeze(japanTemplate())
      const result = retimeTemplate(template, {
        startDate: '2026-07-14',
        keptDayIds: idsWithout('jp-01', 'jp-05', 'jp-12'),
      })
      expect(template).toEqual(japanTemplate())
      const original = template[1]
      const copy = byId(result, original.id)
      expect(copy).not.toBe(original)
      expect(copy.activities).not.toBe(original.activities)
      expect(copy.activities[0]).not.toBe(original.activities[0])
      expect(copy.accommodation).not.toBe(original.accommodation)
      expect(copy.coordinates).not.toBe(original.coordinates)
    })
  })

  describe('erreurs', () => {
    it('refuse une date de départ qui n’en est pas une', () => {
      for (const startDate of [
        '2026-02-30',
        '14/07/2026',
        '',
        '2026-07-14T10:00',
      ]) {
        expect(() =>
          retimeTemplate(japanTemplate(), { startDate, keptDayIds: ALL_IDS }),
        ).toThrow(/date de départ/i)
      }
    })

    it('refuse de ne garder aucune journée', () => {
      expect(() =>
        retimeTemplate(japanTemplate(), {
          startDate: '2026-07-14',
          keptDayIds: [],
        }),
      ).toThrow(/au moins une journée/)
      expect(() =>
        retimeTemplate(japanTemplate(), {
          startDate: '2026-07-14',
          keptDayIds: ['inconnu'],
        }),
      ).toThrow(/au moins une journée/)
    })
  })

  describe('avec l’hébergement porté par la seule journée d’arrivée (voyage de démonstration)', () => {
    const ids = demoItinerary.map((entry) => entry.id)
    const without = (...indexes: number[]) =>
      ids.filter((_, index) => !indexes.includes(index))
    const nights = (accommodation: Accommodation | undefined) =>
      accommodation
        ? daysBetween(accommodation.checkIn, accommodation.checkOut)
        : null

    it('garde la durée de chaque séjour', () => {
      const result = retimeTemplate(demoItinerary, {
        startDate: '2026-11-20',
        keptDayIds: ids,
      })
      result.forEach((entry, index) => {
        const original = demoItinerary[index]
        expect(nights(entry.accommodation)).toBe(nights(original.accommodation))
        if (entry.accommodation) {
          expect(entry.accommodation.checkIn).toBe(entry.date)
        }
      })
      expect(result[19].date).toBe('2026-12-09')
    })

    it('reporte l’hôtel sur la première nuit gardée quand la journée d’arrivée part', () => {
      // Jour 4, arrivée à Pékin : l'hôtel couvre aussi les jours 5 et 6.
      const beijing = demoItinerary[3].accommodation
      const result = retimeTemplate(demoItinerary, {
        startDate: '2026-11-20',
        keptDayIds: without(3),
      })
      expect(result[3].id).toBe(demoItinerary[4].id)
      expect(result[3].accommodation).toEqual({
        ...beijing,
        checkIn: '2026-11-23',
        checkOut: '2026-11-25',
      })
      expect(result[4]).not.toHaveProperty('accommodation')
    })

    it('raccourcit un séjour dont une nuit est retirée', () => {
      const result = retimeTemplate(demoItinerary, {
        startDate: '2026-11-20',
        keptDayIds: without(1),
      })
      expect(result[0].accommodation).toMatchObject({
        checkIn: '2026-11-20',
        checkOut: '2026-11-21',
      })
    })

    it('reconnaît une ville dans un nom d’aéroport ou de gare', () => {
      // Sans Pékin : le train de Qingdao vers Pékin disparaît, le vol
      // « PKX Beijing Daxing Intl. » → Xi'an repart de Qingdao.
      const result = retimeTemplate(demoItinerary, {
        startDate: '2026-11-20',
        keptDayIds: without(3, 4, 5),
      })
      expect(result[2].city).toBe('Qingdao')
      expect(result[2]).not.toHaveProperty('transport')
      const flight = result[3].transport
      expect(flight).toMatchObject({
        id: demoItinerary[6].transport?.id,
        type: 'plane',
        from: 'Qingdao',
        to: 'XIY Xi’an Xianyang Intl.',
      })
      for (const field of [
        'departureTime',
        'arrivalTime',
        'duration',
        'provider',
        'departureAddress',
        'details',
      ]) {
        expect(flight).not.toHaveProperty(field)
      }
    })

    it('supprime le trajet qui repartirait de là où il arrive', () => {
      // Sans Taipei : le vol Taipei → Shanghai partirait de Shanghai.
      const result = retimeTemplate(demoItinerary, {
        startDate: '2026-11-20',
        keptDayIds: without(15, 16, 17),
      })
      const back = byId(result, demoItinerary[18].id)
      expect(back.city).toBe('Shanghai')
      expect(back).not.toHaveProperty('transport')
      expect(byId(result, demoItinerary[19].id).transport?.to).toBe(
        demoItinerary[19].transport?.to,
      )
    })

    it('supprime le trajet vers une ville retirée, même rangé au jour du départ', () => {
      const result = retimeTemplate(demoItinerary, {
        startDate: '2026-11-20',
        keptDayIds: without(8, 9),
      })
      expect(byId(result, demoItinerary[7].id)).not.toHaveProperty('transport')
    })
  })
})

// ── templateTodo ──────────────────────────────────────────────────────────────

describe('templateTodo', () => {
  it('liste ce qui reste à réserver dans le modèle', () => {
    expect(templateTodo(japanTemplate())).toEqual({
      // Gracery a sa référence ; Kanra n'apparaît qu'une fois malgré sa graphie.
      accommodations: [
        'Ryokan Hakone Ginyu',
        'Hotel Kanra Kyoto',
        'Nara Hotel',
        'Cross Hotel Osaka',
      ],
      // Trois trains et un bus ; les vols ont leur référence, la voiture ne compte pas.
      transports: 4,
      bookableActivities: 6,
    })
  })

  it('suit les journées gardées', () => {
    const result = retimeTemplate(japanTemplate(), {
      startDate: '2026-07-14',
      keptDayIds: idsWithout('jp-05', 'jp-12', 'jp-13', 'jp-14'),
    })
    expect(templateTodo(result)).toEqual({
      accommodations: ['Hotel Kanra Kyoto', 'Nara Hotel'],
      // Hakone → Kyoto (devenu Tokyo → Kyoto) et le bus de Kurama.
      transports: 2,
      bookableActivities: 4,
    })
  })

  it('compte un hôtel dès qu’une de ses nuits n’a pas de référence', () => {
    const days = numbered([
      day('a', '2026-05-10', 'Tokyo', 'A', {
        accommodation: hotel('h1', 'Gracery', '2026-05-10', '2026-05-12', {
          bookingReference: 'GRC-1',
        }),
      }),
      day('b', '2026-05-11', 'Tokyo', 'B', {
        accommodation: hotel('h2', 'Gracery', '2026-05-10', '2026-05-12', {
          bookingReference: '  ',
        }),
      }),
      day('c', '2026-05-12', 'Tokyo', 'C', {
        accommodation: hotel('h3', '', '2026-05-12', '2026-05-13'),
      }),
    ])
    expect(templateTodo(days).accommodations).toEqual(['Gracery'])
  })

  it('ne trouve rien dans un voyage vide', () => {
    expect(templateTodo([])).toEqual({
      accommodations: [],
      transports: 0,
      bookableActivities: 0,
    })
  })
})

// ── groupDaysByCity ───────────────────────────────────────────────────────────

describe('groupDaysByCity', () => {
  it('regroupe les journées par étape, avec leurs nouvelles dates', () => {
    const groups = groupDaysByCity(japanTemplate(), ALL_IDS, '2026-07-14')
    expect(
      groups.map(({ city, nights, range }) => ({ city, nights, range })),
    ).toEqual([
      {
        city: 'Tokyo',
        nights: 4,
        range: { start: '2026-07-14', end: '2026-07-17' },
      },
      {
        city: 'Hakone',
        nights: 1,
        range: { start: '2026-07-18', end: '2026-07-18' },
      },
      {
        city: 'Kyoto',
        nights: 5,
        range: { start: '2026-07-19', end: '2026-07-23' },
      },
      {
        city: 'Nara',
        nights: 1,
        range: { start: '2026-07-24', end: '2026-07-24' },
      },
      {
        city: 'Osaka',
        nights: 3,
        range: { start: '2026-07-25', end: '2026-07-27' },
      },
    ])
    expect(groups[1].days).toEqual([
      {
        id: 'jp-05',
        dayNumber: 5,
        title: 'Onsen à Hakone',
        kept: true,
        date: '2026-07-18',
      },
    ])
  })

  it('resserre les dates quand une journée est décochée', () => {
    const groups = groupDaysByCity(
      japanTemplate(),
      idsWithout('jp-05', 'jp-08'),
      '2026-07-14',
    )
    expect(groups[1]).toEqual({
      city: 'Hakone',
      days: [
        {
          id: 'jp-05',
          dayNumber: 5,
          title: 'Onsen à Hakone',
          kept: false,
          date: null,
        },
      ],
      nights: 0,
      range: null,
    })
    expect(groups[2].nights).toBe(4)
    expect(groups[2].range).toEqual({ start: '2026-07-18', end: '2026-07-21' })
    expect(groups[2].days.map((entry) => entry.date)).toEqual([
      '2026-07-18',
      '2026-07-19',
      null,
      '2026-07-20',
      '2026-07-21',
    ])
  })

  it('annonce les dates que retimeTemplate donnera', () => {
    const kept = idsWithout('jp-01', 'jp-04', 'jp-09', 'jp-11', 'jp-14')
    const retimed = retimeTemplate(japanTemplate(), {
      startDate: '2026-12-29',
      keptDayIds: kept,
    })
    const announced = groupDaysByCity(japanTemplate(), kept, '2026-12-29')
      .flatMap((group) => group.days)
      .filter((entry) => entry.kept)
    expect(announced.map(({ id, date }) => ({ id, date }))).toEqual(
      retimed.map(({ id, date }) => ({ id, date })),
    )
  })

  it('sépare deux passages dans la même ville, mais pas deux graphies', () => {
    const days = numbered([
      day('a', '2026-05-10', 'Tokyo', 'Arrivée'),
      day('b', '2026-05-11', 'tokyo ', 'Akihabara'),
      day('c', '2026-05-12', 'Kyoto', 'Gion'),
      day('d', '2026-05-13', 'Tokyo', 'Retour'),
    ])
    const groups = groupDaysByCity(days, ['a', 'b', 'c', 'd'], '2026-05-10')
    expect(groups.map((group) => [group.city, group.nights])).toEqual([
      ['Tokyo', 2],
      ['Kyoto', 1],
      ['Tokyo', 1],
    ])
  })

  it('ne lève pas d’erreur sans date de départ valide', () => {
    const groups = groupDaysByCity(japanTemplate(), ALL_IDS, '')
    expect(groups.map((group) => group.nights)).toEqual([4, 1, 5, 1, 3])
    expect(groups.every((group) => group.range === null)).toBe(true)
    expect(
      groups
        .flatMap((group) => group.days)
        .every((entry) => entry.date === null),
    ).toBe(true)
  })
})

// ── suggestKeptDayIds ─────────────────────────────────────────────────────────

describe('suggestKeptDayIds', () => {
  it('garde tout quand la reprise dure au moins autant que le modèle', () => {
    expect(suggestKeptDayIds(japanTemplate(), 14)).toEqual(ALL_IDS)
    expect(suggestKeptDayIds(japanTemplate(), 20)).toEqual(ALL_IDS)
  })

  it('retire d’abord les journées libres, en partant de la fin', () => {
    expect(suggestKeptDayIds(japanTemplate(), 13)).toEqual(idsWithout('jp-08'))
    expect(suggestKeptDayIds(japanTemplate(), 12)).toEqual(
      idsWithout('jp-04', 'jp-08'),
    )
  })

  it('retire ensuite les dernières journées', () => {
    expect(suggestKeptDayIds(japanTemplate(), 10)).toEqual(
      idsWithout('jp-04', 'jp-08', 'jp-13', 'jp-14'),
    )
    expect(suggestKeptDayIds(japanTemplate(), 3)).toEqual([
      'jp-01',
      'jp-02',
      'jp-03',
    ])
  })

  it('ne retire jamais le jour 1, même libre', () => {
    const days = numbered([
      day('a', '2026-05-10', 'Lisbonne', 'Journée libre', { dayType: 'free' }),
      day('b', '2026-05-11', 'Lisbonne', 'Alfama'),
      day('c', '2026-05-12', 'Sintra', 'Pena'),
    ])
    expect(suggestKeptDayIds(days, 1)).toEqual(['a'])
    expect(suggestKeptDayIds(japanTemplate(), 1)).toEqual(['jp-01'])
  })

  it('refuse une durée de moins d’un jour', () => {
    for (const count of [0, -2, 2.5, Number.NaN]) {
      expect(() => suggestKeptDayIds(japanTemplate(), count)).toThrow(
        /au moins une journée/,
      )
    }
  })
})

describe('looksLikeRestDay', () => {
  it('reconnaît une journée libre à son type ou à son titre', () => {
    expect(looksLikeRestDay({ dayType: 'rest', title: 'Onsen' })).toBe(true)
    expect(looksLikeRestDay({ dayType: ' Libre ', title: 'Kyoto' })).toBe(true)
    expect(looksLikeRestDay({ title: 'JOURNÉE LIBRE à Kyoto' })).toBe(true)
    expect(looksLikeRestDay({ title: 'Repos au ryokan' })).toBe(true)
    expect(looksLikeRestDay({ title: 'Après-midi libres' })).toBe(true)
  })

  it('ne se laisse pas tromper par un mot qui contient « libre »', () => {
    expect(looksLikeRestDay({ title: 'Escale à Libreville' })).toBe(false)
    expect(looksLikeRestDay({ dayType: 'culture', title: 'Kinkaku-ji' })).toBe(
      false,
    )
  })
})

describe('durationChoice', () => {
  it('compare la reprise au modèle', () => {
    expect(durationChoice(14, 14)).toBe('same')
    expect(durationChoice(14, 10)).toBe('shorter')
    expect(durationChoice(7, 10)).toBe('longer')
  })
})
