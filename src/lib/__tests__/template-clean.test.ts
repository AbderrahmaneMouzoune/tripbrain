import type {
  Accommodation,
  Activity,
  DayItinerary,
  Transport,
} from '@/lib/itinerary-data'
import { itinerary as demoItinerary } from '@/lib/itinerary-data'
import {
  NOTE_EXCERPT_LENGTH,
  cleanForTemplate,
  isPrivateBookingUrl,
  noteExcerpts,
  sensitiveSpans,
  summarizeTemplateCleaning,
  templateKnownPlaces,
  templateNoteStats,
  type SensitiveSpan,
} from '@/lib/template-clean'
import {
  DEFAULT_TEMPLATE_OPTIONS,
  type TemplateOptions,
} from '@/lib/template-model'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ALL_OPTIONS: TemplateOptions[] = [
  { includeNotes: false, includePrices: true },
  { includeNotes: false, includePrices: false },
  { includeNotes: true, includePrices: true },
  { includeNotes: true, includePrices: false },
]

const CONFIRMATION_URL =
  'https://secure.booking.com/confirmation.fr.html?aid=2311236'

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'act-1',
    name: 'Sanctuaire Meiji-jingu',
    type: 'visit',
    ...overrides,
  }
}

function transport(overrides: Partial<Transport> = {}): Transport {
  return {
    id: 'tr-1',
    type: 'train',
    from: 'Tokyo',
    to: 'Kyoto',
    ...overrides,
  }
}

function hotel(overrides: Partial<Accommodation> = {}): Accommodation {
  return {
    id: 'acc-1',
    name: 'Hotel Gracery Shinjuku',
    address: '1-19-1 Kabukicho, Shinjuku, Tokyo',
    bookingUrl: 'https://gracery.com/shinjuku/',
    checkIn: '2026-04-01T15:00',
    checkOut: '2026-04-03T11:00',
    ...overrides,
  }
}

function day(
  dayNumber: number,
  overrides: Partial<DayItinerary> = {},
): DayItinerary {
  return {
    id: `day-${dayNumber}`,
    date: `2026-04-0${dayNumber}`,
    dayNumber,
    city: 'Tokyo',
    title: `Jour ${dayNumber}`,
    activities: [],
    coordinates: [35.6762, 139.6503],
    ...overrides,
  }
}

/**
 * Trois jours au Japon, avec tout ce qu'un vrai voyage accumule : réservations,
 * sièges, statuts, notes personnelles, photos de l'appareil, liens de
 * confirmation. Le même hôtel revient deux nuits (nom en minuscules la
 * seconde fois).
 */
function japanTrip(): DayItinerary[] {
  return [
    day(1, {
      title: 'Arrivée à Tokyo',
      dayType: 'arrival',
      walkingDistance: '6 km',
      source: 'ai',
      priority: 'must',
      highlights: ['Carrefour de Shibuya', 'Golden Gai'],
      foodRecommendations: ['Ramen chez Fuunji'],
      packingTips: ['Adaptateur type A'],
      tips: ['Acheter une Suica à l’aéroport', 'Retirer des yens au 7-Eleven'],
      notes:
        'Kenji nous attend à la sortie, appeler le 080-3312-4471 en cas de retard.',
      images: [
        {
          url: 'https://images.pexels.com/photos/1/tokyo.jpeg',
          caption: 'Shinjuku de nuit',
        },
        { url: 'blob:https://app.tripbrain.fr/6f1c', caption: 'Selfie' },
      ],
      accommodation: hotel({
        id: 'acc-gracery-1',
        bookingUrl: CONFIRMATION_URL,
        bookingReference: '4021553117',
        price: 540,
        currency: 'EUR',
        status: 'booked',
        source: 'import',
        images: [
          'https://images.pexels.com/photos/2/gracery.jpeg',
          'data:image/jpeg;base64,/9j/4AAQ',
        ],
      }),
      activities: [
        activity({
          id: 'act-meiji',
          description: 'Grand sanctuaire shinto au milieu d’une forêt.',
          duration: '1h30',
          coordinates: [35.6764, 139.6993],
          openAt: '05:00–18:00',
          address: '1-1 Yoyogikamizonocho, Shibuya, Tokyo',
          reservationRequired: false,
          rating: 4.7,
          tags: ['temple', 'nature'],
          tips: 'Arriver avant 9 h pour éviter la foule',
          priority: 'must',
          source: 'ai',
          status: 'done',
        }),
        activity({
          id: 'act-teamlab',
          name: 'teamLab Planets',
          type: 'experience',
          price: 3800,
          currency: 'JPY',
          bookingUrl: 'https://www.teamlab.art/fr/e/planets/',
          reservationRequired: true,
          status: 'done',
          images: ['blob:https://app.tripbrain.fr/9a2b'],
        }),
      ],
      transport: transport({
        id: 'tr-af276',
        type: 'plane',
        from: 'Paris CDG',
        to: 'Tokyo Haneda',
        details: 'Air France AF276',
        departureAddress: 'Aéroport Paris-Charles de Gaulle, Terminal 2E',
        departureTime: '2026-03-31T13:20',
        arrivalTime: '2026-04-01T08:45',
        duration: '13h25',
        provider: 'Air France',
        bookingUrl: 'https://wwws.airfrance.fr/trip/manage?pnr=XK7P2Q',
        bookingReference: 'XK7P2Q',
        seat: '34A',
        gate: 'K42',
        terminal: '2E',
        status: 'completed',
        price: 890,
        currency: 'EUR',
        notes: 'Repas végétarien demandé, siège côté hublot.',
      }),
    }),
    day(2, {
      title: 'Tsukiji et Shibuya',
      tips: ['Pass 72 h du métro rentable dès 4 trajets'],
      notes:
        'Code de la consigne : 4471. Le guide Akira répond sur akira@guides.jp.',
      accommodation: hotel({
        id: 'acc-gracery-2',
        name: 'hotel gracery shinjuku',
        bookingUrl: CONFIRMATION_URL,
        bookingReference: '4021553117',
        price: 540,
        currency: 'EUR',
        status: 'booked',
      }),
      activities: [
        activity({
          id: 'act-tsukiji',
          name: 'Marché de Tsukiji',
          type: 'food',
          price: 2500,
          currency: 'JPY',
          tips: 'Y aller affamé',
          status: 'skipped',
        }),
        activity({
          id: 'act-shibuya-sky',
          name: 'Shibuya Sky',
          bookingUrl: 'https://www.shibuya-scramble-square.com/sky/',
          price: 2200,
          currency: 'JPY',
          status: 'planned',
        }),
      ],
    }),
    day(3, {
      city: 'Kyoto',
      title: 'Kyoto, les torii',
      coordinates: [35.0116, 135.7681],
      notes: 'Journée plus calme, on a pris notre temps au Fushimi Inari.',
      accommodation: hotel({
        id: 'acc-yachiyo',
        name: 'Ryokan Yachiyo',
        address: '34 Fukuchi-cho, Nanzenji, Sakyo-ku, Kyoto',
        bookingUrl: 'https://www.ryokan-yachiyo.com/stay?ref=RY88231',
        bookingReference: 'RY88231',
        checkIn: '2026-04-03',
        checkOut: '2026-04-04',
        price: 320,
        currency: 'EUR',
        status: 'planned',
      }),
      activities: [
        activity({
          id: 'act-inari',
          name: 'Fushimi Inari-taisha',
          coordinates: [34.9671, 135.7727],
          tips: '',
          status: 'planned',
        }),
        activity({
          id: 'act-kaiseki',
          name: 'Dîner kaiseki',
          type: 'food',
          price: 12000,
          currency: 'JPY',
          bookingUrl: 'https://www.tablecheck.com/fr/shops/kikunoi/reserve',
          status: 'done',
        }),
      ],
      transport: transport({
        id: 'tr-nozomi',
        provider: 'JR Central',
        details: 'Shinkansen Nozomi 21',
        departureTime: '08:00',
        arrivalTime: '10:15',
        seat: 'Voiture 7, place 12D',
        status: 'booked',
        price: 13970,
        currency: 'JPY',
        bookingUrl: 'https://smart-ex.jp/en/',
        bookingReference: 'EX-55120',
        notes: 'Prendre des bentos à la gare.',
      }),
    }),
  ]
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}

/** Toutes les clés d'une structure, à toute profondeur. */
function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(allKeys)
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => [
      key,
      ...allKeys(item),
    ])
  }
  return []
}

function idsOf(days: readonly DayItinerary[]): string[] {
  return days.flatMap((d) => [
    d.id,
    ...d.activities.map((a) => a.id),
    ...(d.accommodation ? [d.accommodation.id] : []),
    ...(d.transport ? [d.transport.id] : []),
  ])
}

/** `[genre, texte surligné]`, plus lisible qu'un couple d'indices. */
/** Passages triés, sans chevauchement, dans le texte. */
function expectWellFormed(text: string, spans: readonly SensitiveSpan[]) {
  let previousEnd = 0
  for (const span of spans) {
    expect(span.start).toBeGreaterThanOrEqual(previousEnd)
    expect(span.end).toBeGreaterThan(span.start)
    expect(span.end).toBeLessThanOrEqual(text.length)
    previousEnd = span.end
  }
}

function highlighted(text: string, spans: readonly SensitiveSpan[]) {
  return spans.map((span) => [span.kind, text.slice(span.start, span.end)])
}

// ── cleanForTemplate ──────────────────────────────────────────────────────────

describe('cleanForTemplate', () => {
  it('retire toujours références, sièges, portes, terminaux et statuts', () => {
    for (const options of ALL_OPTIONS) {
      const keys = allKeys(cleanForTemplate(japanTrip(), options))
      for (const key of [
        'bookingReference',
        'seat',
        'gate',
        'terminal',
        'status',
      ]) {
        expect(keys).not.toContain(key)
      }
    }
  })

  it('retire les notes de journée et de transport par défaut', () => {
    const [first, , third] = cleanForTemplate(
      japanTrip(),
      DEFAULT_TEMPLATE_OPTIONS,
    )
    expect(first).not.toHaveProperty('notes')
    expect(first.transport).not.toHaveProperty('notes')
    expect(third.transport).not.toHaveProperty('notes')
  })

  it('garde les notes quand l’auteur les inclut', () => {
    const [first, , third] = cleanForTemplate(japanTrip(), {
      includeNotes: true,
      includePrices: true,
    })
    expect(first.notes).toBe(
      'Kenji nous attend à la sortie, appeler le 080-3312-4471 en cas de retard.',
    )
    expect(first.transport?.notes).toBe(
      'Repas végétarien demandé, siège côté hublot.',
    )
    expect(third.transport?.notes).toBe('Prendre des bentos à la gare.')
  })

  it('garde prix et devises par défaut', () => {
    const [first] = cleanForTemplate(japanTrip(), DEFAULT_TEMPLATE_OPTIONS)
    expect(first.accommodation).toMatchObject({ price: 540, currency: 'EUR' })
    expect(first.transport).toMatchObject({ price: 890, currency: 'EUR' })
    expect(first.activities[1]).toMatchObject({ price: 3800, currency: 'JPY' })
  })

  it('retire prix et devises de partout quand l’auteur les exclut', () => {
    const cleaned = cleanForTemplate(japanTrip(), {
      includeNotes: true,
      includePrices: false,
    })
    const keys = allKeys(cleaned)
    expect(keys).not.toContain('price')
    expect(keys).not.toContain('currency')
  })

  it('vide le lien privé d’un hébergement (champ requis) et garde un lien public', () => {
    const [first, second, third] = cleanForTemplate(
      japanTrip(),
      DEFAULT_TEMPLATE_OPTIONS,
    )
    expect(first.accommodation?.bookingUrl).toBe('')
    expect(second.accommodation?.bookingUrl).toBe('')
    // La référence de réservation apparaît dans l'URL du ryokan.
    expect(third.accommodation?.bookingUrl).toBe('')

    const [publicStay] = cleanForTemplate(
      [day(1, { accommodation: hotel() })],
      DEFAULT_TEMPLATE_OPTIONS,
    )
    expect(publicStay.accommodation?.bookingUrl).toBe(
      'https://gracery.com/shinjuku/',
    )
  })

  it('vide le lien d’un hébergement qui contient sa référence, même saisie avec des espaces', () => {
    const [stay] = cleanForTemplate(
      [
        day(1, {
          accommodation: hotel({
            bookingUrl: 'https://hotel.example/stay/4021553117',
            bookingReference: '4021 553 117',
          }),
        }),
      ],
      DEFAULT_TEMPLATE_OPTIONS,
    )
    expect(stay.accommodation?.bookingUrl).toBe('')
    expect(stay.accommodation).not.toHaveProperty('bookingReference')
  })

  it('retire un lien de gestion de billet, même sans référence saisie', () => {
    const [flight] = cleanForTemplate(
      [
        day(1, {
          transport: transport({
            type: 'plane',
            bookingUrl:
              'https://www.easyjet.com/en/secure/MyEasyJet.mvc/ViewBooking?bookingReference=K7X2PQ1&lastName=Dupont',
          }),
        }),
      ],
      DEFAULT_TEMPLATE_OPTIONS,
    )
    expect(flight.transport).not.toHaveProperty('bookingUrl')
  })

  it('retire la clé d’un lien privé de transport ou d’activité, garde les liens publics', () => {
    const [first, second, third] = cleanForTemplate(
      japanTrip(),
      DEFAULT_TEMPLATE_OPTIONS,
    )
    expect(first.transport).not.toHaveProperty('bookingUrl')
    expect(first.activities[1].bookingUrl).toBe(
      'https://www.teamlab.art/fr/e/planets/',
    )
    expect(second.activities[1].bookingUrl).toBe(
      'https://www.shibuya-scramble-square.com/sky/',
    )
    // `EX-55120` n'apparaît pas dans l'URL : le lien est public.
    expect(third.transport?.bookingUrl).toBe('https://smart-ex.jp/en/')

    const [privateActivity] = cleanForTemplate(
      [
        day(1, {
          activities: [
            activity({
              bookingUrl: 'https://www.klook.com/fr/mybooking/987654/',
            }),
          ],
        }),
      ],
      DEFAULT_TEMPLATE_OPTIONS,
    )
    expect(privateActivity.activities[0]).not.toHaveProperty('bookingUrl')
  })

  it('retire les images qui ne vivent que sur l’appareil, et le tableau s’il est vide', () => {
    const [first] = cleanForTemplate(japanTrip(), DEFAULT_TEMPLATE_OPTIONS)
    expect(first.images).toEqual([
      {
        url: 'https://images.pexels.com/photos/1/tokyo.jpeg',
        caption: 'Shinjuku de nuit',
      },
    ])
    expect(first.accommodation?.images).toEqual([
      'https://images.pexels.com/photos/2/gracery.jpeg',
    ])
    expect(first.activities[1]).not.toHaveProperty('images')

    const [onlyLocal] = cleanForTemplate(
      [
        day(1, {
          images: [{ url: 'data:image/png;base64,iVBOR', caption: 'Plan' }],
        }),
      ],
      DEFAULT_TEMPLATE_OPTIONS,
    )
    expect(onlyLocal).not.toHaveProperty('images')
  })

  it('garde tout le reste à l’identique', () => {
    const [first] = cleanForTemplate(japanTrip(), DEFAULT_TEMPLATE_OPTIONS)
    expect(first).toStrictEqual({
      id: 'day-1',
      date: '2026-04-01',
      dayNumber: 1,
      city: 'Tokyo',
      title: 'Arrivée à Tokyo',
      activities: [
        {
          id: 'act-meiji',
          name: 'Sanctuaire Meiji-jingu',
          type: 'visit',
          description: 'Grand sanctuaire shinto au milieu d’une forêt.',
          duration: '1h30',
          coordinates: [35.6764, 139.6993],
          openAt: '05:00–18:00',
          address: '1-1 Yoyogikamizonocho, Shibuya, Tokyo',
          reservationRequired: false,
          rating: 4.7,
          tags: ['temple', 'nature'],
          tips: 'Arriver avant 9 h pour éviter la foule',
          priority: 'must',
          source: 'ai',
        },
        {
          id: 'act-teamlab',
          name: 'teamLab Planets',
          type: 'experience',
          price: 3800,
          currency: 'JPY',
          bookingUrl: 'https://www.teamlab.art/fr/e/planets/',
          reservationRequired: true,
        },
      ],
      coordinates: [35.6762, 139.6503],
      dayType: 'arrival',
      walkingDistance: '6 km',
      source: 'ai',
      priority: 'must',
      highlights: ['Carrefour de Shibuya', 'Golden Gai'],
      foodRecommendations: ['Ramen chez Fuunji'],
      packingTips: ['Adaptateur type A'],
      tips: ['Acheter une Suica à l’aéroport', 'Retirer des yens au 7-Eleven'],
      images: [
        {
          url: 'https://images.pexels.com/photos/1/tokyo.jpeg',
          caption: 'Shinjuku de nuit',
        },
      ],
      accommodation: {
        id: 'acc-gracery-1',
        name: 'Hotel Gracery Shinjuku',
        address: '1-19-1 Kabukicho, Shinjuku, Tokyo',
        bookingUrl: '',
        checkIn: '2026-04-01T15:00',
        checkOut: '2026-04-03T11:00',
        price: 540,
        currency: 'EUR',
        source: 'import',
        images: ['https://images.pexels.com/photos/2/gracery.jpeg'],
      },
      transport: {
        id: 'tr-af276',
        type: 'plane',
        from: 'Paris CDG',
        to: 'Tokyo Haneda',
        details: 'Air France AF276',
        departureAddress: 'Aéroport Paris-Charles de Gaulle, Terminal 2E',
        departureTime: '2026-03-31T13:20',
        arrivalTime: '2026-04-01T08:45',
        duration: '13h25',
        provider: 'Air France',
        price: 890,
        currency: 'EUR',
      },
    })
  })

  it('conserve tous les ids et l’ordre des journées et des activités', () => {
    const trip = japanTrip()
    for (const options of ALL_OPTIONS) {
      expect(idsOf(cleanForTemplate(trip, options))).toEqual(idsOf(trip))
    }
  })

  it('ne modifie jamais l’itinéraire reçu', () => {
    const trip = deepFreeze(japanTrip())
    const before = structuredClone(trip)
    for (const options of ALL_OPTIONS) {
      expect(() => cleanForTemplate(trip, options)).not.toThrow()
    }
    expect(trip).toStrictEqual(before)
  })

  it('est idempotente : nettoyer deux fois revient à nettoyer une fois', () => {
    for (const options of ALL_OPTIONS) {
      const once = cleanForTemplate(japanTrip(), options)
      const twice = cleanForTemplate(once, options)
      expect(twice).toStrictEqual(once)
      // Même JSON, à l'octet près : l'ordre des clés ne bouge pas non plus.
      expect(JSON.stringify(twice)).toBe(JSON.stringify(once))
    }
  })

  it('ne laisse aucune valeur undefined derrière lui', () => {
    const trip = [
      day(1, {
        notes: undefined,
        transport: transport({ price: undefined, notes: 'Quai 14' }),
        activities: [activity({ description: undefined, status: 'done' })],
      }),
    ]
    for (const options of ALL_OPTIONS) {
      const cleaned = cleanForTemplate(trip, options)
      expect(JSON.parse(JSON.stringify(cleaned))).toStrictEqual(cleaned)
    }
  })

  it('ne laisse partir aucune clé inconnue du type', () => {
    // Un voyage importé d'un JSON peut porter des champs que l'app ignore.
    const imported = { ...activity(), confirmationCode: 'HX-2231' }
    const stay = { ...hotel(), guestPhone: '+33 6 12 34 56 78' }
    const leg = { ...transport(), ticketNumber: '057-2231' }
    const withTravellers = {
      ...day(1, {
        activities: [imported],
        accommodation: stay,
        transport: leg,
      }),
      travellers: ['Kenji Tanaka'],
    }
    const [cleaned] = cleanForTemplate(
      [withTravellers],
      DEFAULT_TEMPLATE_OPTIONS,
    )
    const keys = allKeys(cleaned)
    for (const key of [
      'confirmationCode',
      'guestPhone',
      'ticketNumber',
      'travellers',
    ]) {
      expect(keys).not.toContain(key)
    }
  })

  it('nettoie le voyage de démo : plus aucune référence ni lien de commande', () => {
    const cleaned = cleanForTemplate(demoItinerary, DEFAULT_TEMPLATE_OPTIONS)
    expect(cleaned).toHaveLength(demoItinerary.length)
    const keys = allKeys(cleaned)
    for (const key of ['bookingReference', 'terminal', 'status', 'notes']) {
      expect(keys).not.toContain(key)
    }
    const urls = cleaned.flatMap((d) => [
      d.accommodation?.bookingUrl,
      d.transport?.bookingUrl,
      ...d.activities.map((a) => a.bookingUrl),
    ])
    expect(urls.filter((url) => url && /confirm|orderid/i.test(url))).toEqual(
      [],
    )
    expect(urls).toContain('https://www.dpm.org.cn/visit/buyTicket.html')
    expect(urls).toContain('https://www.trip.com/w/ruzj63ZWsT2')
  })

  it('accepte un itinéraire vide', () => {
    expect(cleanForTemplate([], DEFAULT_TEMPLATE_OPTIONS)).toEqual([])
  })
})

// ── isPrivateBookingUrl ───────────────────────────────────────────────────────

describe('isPrivateBookingUrl', () => {
  it.each([
    // Voyage de démo
    CONFIRMATION_URL,
    'https://secure.booking.com/confirmation.fr.html?aid=2369322',
    'https://fr.trip.com/hotels/ctorderdetail?orderid=1306267683942772',
    // Espaces clients et confirmations
    'https://wwws.airfrance.fr/trip/manage?pnr=XK7P2Q',
    'https://www.airbnb.fr/reservation/itinerary?code=HMX4T2',
    'https://www.klook.com/fr/mybooking/987654/',
    'https://www.hotel-okura.jp/my-booking/123',
    'https://www.example.com/booking?booking_id=991',
    'https://www.example.com/b?BookingId=991',
    'https://www.ana.co.jp/check?PNR=XK7P2Q',
    'https://www.example.com/view?token=d41d8cd9',
    'https://www.example.com/auth/callback',
    'https://www.example.com/?secret=1',
    'https://www.expedia.fr/trips?bn=4021553117',
    'https://www.example.com/res?conf=ABC123',
    'https://www.example.com/trip?itinerary_id=77',
    'https://www.example.com/hotels/order_id/88',
    'https://www.example.com/r#confirmed',
    'https://www.example.com/r?q=bn%3D4021553117',
    // Gestion d'un billet : code de réservation et nom de famille
    'https://www.easyjet.com/en/secure/MyEasyJet.mvc/ViewBooking?bookingReference=K7X2PQ1&lastName=Dupont',
    'https://wwws.airfrance.fr/trip?bookingCode=K7X2PQ&lastName=DUPONT',
    'https://www.sncf-connect.com/app/trips/details?reference=QWERTY&name=DUPONT',
    'https://www.example.com/check-in?recordLocator=K7X2PQ',
    'https://www.example.com/trip?booking_reference=K7X2PQ',
    'https://www.example.com/trip?surname=Dupont&ref=K7X2PQ',
    'https://www.example.com/trip?email=yanis%40example.com',
    // Numéros de réservation et de commande, espaces client
    'https://www.expedia.fr/trips/72118734123456',
    'https://fr.hotels.com/booking/details?itineraryId=72118734123456',
    'https://www.viator.com/fr-FR/account/booking/BR-1078812345',
    'https://www.klook.com/fr/order/detail/?orderNo=KLK123456789',
    'https://www.thetrainline.com/my-account/bookings/7f3c2a91-0b5e-4d4e',
    'https://www.hotel-exemple.fr/sejour?bookingNumber=88123456',
    'https://secure.booking.com/help/booking?pincode=7731&id=4021553117',
    // Accents ignorés
    'https://www.hotel-exemple.fr/ma-réservation/88123456',
    'https://www.hotel-exemple.fr/ma-r%C3%A9servation/88123456',
    // Adresse e-mail ou téléphone, quel que soit le paramètre
    'https://www.hotel-exemple.fr/sejour?mail=yanis.dupont%40gmail.com',
    'https://www.hotel-exemple.fr/sejour?e=yanis.dupont@gmail.com',
    'https://www.hotel-exemple.fr/clients/yanis.dupont@gmail.com/sejour',
    'https://www.hotel-exemple.fr/sejour?tel=%2B33612345678',
    'https://www.hotel-exemple.fr/sejour?contact=06%2012%2034%2056%2078',
    // Pas en http(s), ou avec des identifiants
    'http://kenji:motdepasse@www.example.com/',
    'blob:https://app.tripbrain.fr/6f1c',
    'data:text/html,bonjour',
    'mailto:kenji@example.com',
    'tel:+33612345678',
    'javascript:alert(1)',
    'www.hotel-okura.jp',
    'pas une adresse',
    '',
  ])('« %s » est privé', (url) => {
    expect(isPrivateBookingUrl(url)).toBe(true)
  })

  it.each([
    'https://www.hotelokura.co.jp/tokyo/',
    'https://www.booking.com/hotel/jp/gracery-shinjuku.html',
    'https://www.booking.com/hotel/jp/gracery-shinjuku.fr.html?aid=304142&label=gen173nr',
    'http://www.ryokan-yachiyo.com/',
    'https://www.teamlab.art/fr/e/planets/',
    // Voyage de démo
    'https://www.dpm.org.cn/visit/buyTicket.html',
    'https://www.mutianyugreatwall.com',
    'https://www.bmy.com.cn/ticket',
    'https://www.trip.com/w/ruzj63ZWsT2',
    // Le domaine n'est pas inspecté, seulement le chemin et la requête.
    'https://secure.booking.com/',
    '  https://www.yugarden.com.cn  ',
    // Ni coordonnées, ni dates, ni identifiants publics ne passent pour un
    // téléphone ou une réservation.
    'https://www.booking.com/hotel/jp/gracery.fr.html',
    'https://gracery.com/shinjuku/',
    'https://www.google.com/maps/place/Kiyomizu-dera/@34.9948561,135.7850463,17z',
    'https://www.hotel-exemple.fr/chambres?arrivee=2026-04-01&depart=2026-04-05',
    'https://www.airbnb.fr/rooms/12345678901234',
    'https://www.tablecheck.com/fr/shops/sushi-saito/reserve',
    'https://medium.com/@kenji/kyoto-en-3-jours',
    'https://www.expedia.fr/trips',
  ])('« %s » est public', (url) => {
    expect(isPrivateBookingUrl(url)).toBe(false)
  })

  it('reconnaît la référence de réservation de l’entité dans l’URL, sans casse', () => {
    const url = 'https://www.ryokan-yachiyo.com/stay?ref=ry88231'
    expect(isPrivateBookingUrl(url)).toBe(false)
    expect(isPrivateBookingUrl(url, 'RY88231')).toBe(true)
    expect(isPrivateBookingUrl(url, '  RY88231 ')).toBe(true)
  })

  it('reconnaît la référence même écrite avec d’autres séparateurs', () => {
    expect(
      isPrivateBookingUrl(
        'https://hotel.example/stay/4021553117',
        '4021 553 117',
      ),
    ).toBe(true)
    expect(
      isPrivateBookingUrl(
        'https://hotel.example/stay/4021-553-117',
        '4021553117',
      ),
    ).toBe(true)
    expect(
      isPrivateBookingUrl('https://www.example.com/r?id=K7X2PQ', 'k7x-2pq'),
    ).toBe(true)
    expect(
      isPrivateBookingUrl('https://hotel.example/stay/', '4021 553 117'),
    ).toBe(false)
  })

  it('accepte toutes les références du voyage à la fois', () => {
    const url = 'https://hotel.example/spa?ref=4021553117'
    expect(isPrivateBookingUrl(url, ['K7X2PQ', '4021 553 117'])).toBe(true)
    expect(isPrivateBookingUrl(url, new Set(['k7x2pq', '12']))).toBe(false)
  })

  it('ignore une référence trop courte pour être significative', () => {
    expect(isPrivateBookingUrl('https://www.example.com/rooms/12', '12')).toBe(
      false,
    )
    expect(isPrivateBookingUrl('https://www.example.com/rooms/12', '')).toBe(
      false,
    )
    // Les séparateurs ne comptent pas dans la longueur.
    expect(
      isPrivateBookingUrl('https://www.example.com/rooms/123', '1-2-3'),
    ).toBe(false)
  })
})

// ── summarizeTemplateCleaning ─────────────────────────────────────────────────

describe('liens qui portent une référence d’ailleurs dans le voyage', () => {
  it('retire le lien d’une activité qui contient la référence d’un hôtel', () => {
    const itinerary = [
      day(1, {
        accommodation: hotel({
          bookingUrl: 'https://www.ryokan-yachiyo.com/',
          bookingReference: '4021 553 117',
        }),
        activities: [
          activity({ bookingUrl: 'https://hotel.example/spa?ref=4021553117' }),
          activity({
            id: 'act-2',
            bookingUrl: 'https://www.teamlab.art/fr/e/planets/',
          }),
        ],
      }),
    ]
    const [cleaned] = cleanForTemplate(itinerary, DEFAULT_TEMPLATE_OPTIONS)
    expect(cleaned.activities[0]).not.toHaveProperty('bookingUrl')
    expect(cleaned.activities[1].bookingUrl).toBe(
      'https://www.teamlab.art/fr/e/planets/',
    )
    // Le lien public de l'hôtel, lui, reste.
    expect(cleaned.accommodation?.bookingUrl).toBe(
      'https://www.ryokan-yachiyo.com/',
    )
    // L'écran A2 compte ce qui est réellement retiré.
    expect(
      summarizeTemplateCleaning(itinerary, DEFAULT_TEMPLATE_OPTIONS).stays
        .privateLinks,
    ).toBe(1)
  })

  it('retire le lien de chaque nuit quand la référence n’est saisie que sur la première', () => {
    const url = 'https://hotel.example/stay/4021553117'
    const itinerary = [
      day(1, {
        accommodation: hotel({
          bookingUrl: url,
          bookingReference: '4021553117',
        }),
      }),
      day(2, { accommodation: hotel({ id: 'acc-2', bookingUrl: url }) }),
      day(3, {
        transport: transport({ bookingUrl: `${url}?step=2` }),
      }),
    ]
    const cleaned = cleanForTemplate(itinerary, DEFAULT_TEMPLATE_OPTIONS)
    expect(JSON.stringify(cleaned)).not.toContain('4021553117')
    expect(cleaned[1].accommodation?.bookingUrl).toBe('')
    // Idempotent : le second passage n'a plus de référence, ni de lien à retirer.
    expect(cleanForTemplate(cleaned, DEFAULT_TEMPLATE_OPTIONS)).toEqual(cleaned)
  })
})

describe('summarizeTemplateCleaning', () => {
  it('compte ce qui part et ce qui reste sur un vrai voyage', () => {
    expect(
      summarizeTemplateCleaning(japanTrip(), DEFAULT_TEMPLATE_OPTIONS),
    ).toEqual({
      goes: {
        days: 3,
        activities: 6,
        // « Hotel Gracery Shinjuku » et « hotel gracery shinjuku » : un hôtel.
        accommodations: 2,
        transports: 2,
        // 3 conseils de journée + 2 d'activité (un conseil vide ne compte pas).
        tips: 5,
      },
      stays: {
        // 4021553117 (deux nuits), XK7P2Q, EX-55120, RY88231
        bookingReferences: 4,
        // 34A, K42, 2E, puis « Voiture 7, place 12D »
        seats: 4,
        // 3 « fait » et 1 « sauté » + 2 trajets + l'hôtel « réservé » deux nuits
        statuses: 7,
        notes: 5,
        prices: 0,
        // confirmation Booking (deux nuits), espace Air France, URL du ryokan
        privateLinks: 3,
        // blob: d'une journée et d'une activité, data: d'un hébergement
        deviceImages: 3,
      },
    })
  })

  it('compte les prix retirés quand l’auteur les exclut, un hôtel une fois', () => {
    const { stays } = summarizeTemplateCleaning(japanTrip(), {
      includeNotes: false,
      includePrices: false,
    })
    // 4 activités + 2 trajets + 2 hébergements distincts
    expect(stays.prices).toBe(8)
  })

  it('ne compte plus les notes quand l’auteur les inclut', () => {
    const { stays } = summarizeTemplateCleaning(japanTrip(), {
      includeNotes: true,
      includePrices: true,
    })
    expect(stays.notes).toBe(0)
  })

  it('ne compte pas « prévu » comme un statut qui reste', () => {
    const trip = [
      day(1, {
        activities: [activity({ status: 'planned' })],
        transport: transport({ status: 'planned' }),
        accommodation: hotel({ status: 'planned' }),
      }),
    ]
    expect(
      summarizeTemplateCleaning(trip, DEFAULT_TEMPLATE_OPTIONS).stays.statuses,
    ).toBe(0)
  })

  it('renvoie des zéros pour un voyage vide', () => {
    expect(summarizeTemplateCleaning([], DEFAULT_TEMPLATE_OPTIONS)).toEqual({
      goes: {
        days: 0,
        activities: 0,
        accommodations: 0,
        transports: 0,
        tips: 0,
      },
      stays: {
        bookingReferences: 0,
        seats: 0,
        statuses: 0,
        notes: 0,
        prices: 0,
        privateLinks: 0,
        deviceImages: 0,
      },
    })
  })

  it('reste cohérent avec le nettoyage : ce qui « reste » a bien disparu', () => {
    const cleaned = cleanForTemplate(japanTrip(), DEFAULT_TEMPLATE_OPTIONS)
    const { stays } = summarizeTemplateCleaning(
      cleaned,
      DEFAULT_TEMPLATE_OPTIONS,
    )
    expect(stays).toEqual({
      bookingReferences: 0,
      seats: 0,
      statuses: 0,
      notes: 0,
      prices: 0,
      privateLinks: 0,
      deviceImages: 0,
    })
  })
})

// ── sensitiveSpans ────────────────────────────────────────────────────────────

describe('sensitiveSpans', () => {
  it('repère les suites de 4 chiffres ou plus', () => {
    const text = 'Digicode 4521B, chambre 12, casier 1306267683'
    expect(highlighted(text, sensitiveSpans(text))).toEqual([
      ['digits', '4521'],
      ['digits', '1306267683'],
    ])
  })

  it.each([
    ['Appeler Kenji au 080-3312-4471 demain', '080-3312-4471'],
    ['Joignable au +33 6 12 34 56 78 le soir', '+33 6 12 34 56 78'],
    ['ou au 06 12 34 56 78 sinon', '06 12 34 56 78'],
    ['Tél. 06.12.34.56.78', '06.12.34.56.78'],
    ['portable 0612345678', '0612345678'],
    ['réception +81 3-3344-0111', '+81 3-3344-0111'],
    ['standard 03-1234-5678 (anglais)', '03-1234-5678'],
    ['US +1 (212) 555-1234', '+1 (212) 555-1234'],
  ])('repère le téléphone dans « %s »', (text, phone) => {
    expect(highlighted(text, sensitiveSpans(text))).toContainEqual([
      'phone',
      phone,
    ])
  })

  it.each([
    ['Chambre 104 06 12 34 56 78', '06 12 34 56 78'],
    ['Urgences : 06 12 34 56 78 06 98 76 54 32', '06 98 76 54 32'],
    ['Urgences : 06 12 34 56 78 06 98 76 54 32', '06 12 34 56 78'],
    ['Arrivée 2026-05-10 06 12 34 56 78 merci', '06 12 34 56 78'],
    ['0312345678 080-3312-4471', '080-3312-4471'],
    ['Code postal 20480 06 12 34 56 78', '06 12 34 56 78'],
    ['+1 (212) 555-1234 555-1234 li_wei@qq.com', '+1 (212) 555-1234'],
  ])(
    'surligne chaque chiffre d’un numéro qui suit un autre nombre : « %s »',
    (text, phone) => {
      const spans = sensitiveSpans(text)
      const from = text.indexOf(phone)
      for (let k = 0; k < phone.length; k++) {
        if (!/\d/.test(phone[k])) continue
        expect(
          spans.some((span) => span.start <= from + k && from + k < span.end),
        ).toBe(true)
      }
      expectWellFormed(text, spans)
    },
  )

  it('garde l’e-mail entier après un numéro qui en avalait le début', () => {
    const text = '+1 (212) 555-1234 555-1234 li_wei@qq.com'
    expect(highlighted(text, sensitiveSpans(text))).toContainEqual([
      'email',
      'li_wei@qq.com',
    ])
  })

  it('préfère le téléphone aux chiffres qu’il contient', () => {
    const text = 'Taxi : 080-3312-4471'
    expect(highlighted(text, sensitiveSpans(text))).toEqual([
      ['phone', '080-3312-4471'],
    ])
  })

  it('ne prend pas une date ou une heure pour un téléphone', () => {
    const text = 'Départ le 2026-05-10 à 08:55, retour 05-12-2026'
    expect(
      sensitiveSpans(text).filter((span) => span.kind === 'phone'),
    ).toEqual([])
  })

  it('préfère l’e-mail aux chiffres et aux noms qu’il contient', () => {
    const text = 'Écrire à Kenji.Tanaka1984@gmail.com pour la clé'
    expect(highlighted(text, sensitiveSpans(text))).toEqual([
      ['email', 'Kenji.Tanaka1984@gmail.com'],
    ])
  })

  it('surligne les noms propres qui ne sont pas des lieux du voyage', () => {
    const text = 'Dîner avec Kenji à Kyoto, puis verre chez Yuki près de Gion.'
    expect(
      highlighted(text, sensitiveSpans(text, ['Kyoto', 'Gion Corner'])),
    ).toEqual([
      ['name', 'Kenji'],
      ['name', 'Yuki'],
    ])
  })

  it('ne surligne pas un mot en début de phrase ou de ligne', () => {
    const text = 'Kenji nous attend. Ensuite Yuki arrive !\nMarie aussi.'
    expect(highlighted(text, sensitiveSpans(text))).toEqual([['name', 'Yuki']])
  })

  it('compare les lieux sans casse ni accents, apostrophes comprises', () => {
    expect(
      sensitiveSpans('Retour à Tokyo puis Pekin', ['Tōkyō', 'Pékin']),
    ).toEqual([])
    const text = 'Train de nuit pour Xi’an avec Wei'
    expect(highlighted(text, sensitiveSpans(text, ["Xi'an"]))).toEqual([
      ['name', 'Wei'],
    ])
  })

  it('reconnaît un mot qui fait partie d’un lieu à plusieurs mots', () => {
    const text = 'On atterrit à Taoyuan vers midi, puis Daxing le lendemain.'
    expect(
      sensitiveSpans(text, [
        'Taiwan Taoyuan International Airport',
        'PKX Beijing Daxing Intl.',
      ]),
    ).toEqual([])
  })

  it('ignore jours, mois, mots de voyage, marques et sigles', () => {
    const text =
      'Rendez-vous Lundi avec Akira, départ en Mai. Payer avec Alipay, JR Pass validé, vol AF276.'
    expect(highlighted(text, sensitiveSpans(text))).toEqual([['name', 'Akira']])
  })

  it('ne surligne pas les noms de lieux, même hors du voyage', () => {
    const text =
      'Photo devant le Musée Ghibli, puis la Gare de Lyon, le restaurant Sukiyabashi Jiro et le meilleur ramen du Japon.'
    expect(sensitiveSpans(text)).toEqual([])
  })

  it('repère un nom après une civilité et regroupe prénom et nom', () => {
    const text = 'Accueil par M. Watanabe, logés chez Marie Dupont ce soir.'
    expect(highlighted(text, sensitiveSpans(text))).toEqual([
      ['name', 'Watanabe'],
      ['name', 'Marie Dupont'],
    ])
  })

  it('ne cherche pas de nom dans une URL', () => {
    const text = 'Plan sur https://maps.app.goo.gl/AbCdEf, Kenji connaît'
    expect(highlighted(text, sensitiveSpans(text))).toEqual([['name', 'Kenji']])
  })

  it('renvoie des passages triés et sans chevauchement', () => {
    const text =
      'Le 4 mai, Yuki (yuki.sato@example.jp, +81 90-1234-5678) donne le code 77421 à Kenji.'
    const spans = sensitiveSpans(text)
    expect(highlighted(text, spans)).toEqual([
      ['name', 'Yuki'],
      ['email', 'yuki.sato@example.jp'],
      ['phone', '+81 90-1234-5678'],
      ['digits', '77421'],
      ['name', 'Kenji'],
    ])
    for (let i = 1; i < spans.length; i += 1) {
      expect(spans[i].start).toBeGreaterThanOrEqual(spans[i - 1].end)
    }
  })

  it('ne trouve rien dans une note ordinaire', () => {
    expect(
      sensitiveSpans(
        'Première journée tranquille pour gérer le décalage horaire.',
      ),
    ).toEqual([])
  })
  it.each([
    'Escale, CA1590 SHA→PEK puis CA933.',
    'Vol 9C8951 — Mon, May 25',
    'TGV 6231 voiture 12, puis ICE 578 depuis Francfort.',
    'Air France AF 274, retour TP433.',
  ])('ne surligne pas un numéro de vol ou de train : « %s »', (text) => {
    expect(sensitiveSpans(text)).toEqual([])
  })

  it('surligne toujours un code, même près d’un numéro de vol', () => {
    const text = 'Vol CA1590, PIN 4471, casier 778812.'
    expect(highlighted(text, sensitiveSpans(text))).toEqual([
      ['digits', '4471'],
      ['digits', '778812'],
    ])
  })

  it.each([
    ['Hôte : Rui, très sympa.', [['name', 'Rui']]],
    [
      'Contact : Kenji (gérant) 080-3312-4471',
      [
        ['name', 'Kenji'],
        ['phone', '080-3312-4471'],
      ],
    ],
    [
      'Guide : Kaori Tanaka, rdv 9h devant la gare.',
      [['name', 'Kaori Tanaka']],
    ],
    ['Rdv : Kaori Tanaka à 9h', [['name', 'Kaori Tanaka']]],
    ['Hôte: Rui', [['name', 'Rui']]],
  ])('surligne un prénom après « : » : « %s »', (text, expected) => {
    expect(highlighted(text, sensitiveSpans(text))).toEqual(expected)
  })

  it.each([
    'Note : Penser à réserver.',
    'Matin : Visite du château.',
    'Transport : Prendre le train de 9h.',
    'Repas : Ramen à volonté.',
    'Check-in : Après 15h.',
    'Bon plan : Le marché du matin.',
    'Météo : Pluie annoncée.',
    'Dîner : Excellent !',
  ])('ne prend pas la valeur d’un libellé pour un prénom : « %s »', (text) => {
    expect(sensitiveSpans(text)).toEqual([])
  })

  it('ne prend ni une marque, ni un mot de deux lettres pour un prénom', () => {
    for (const text of [
      'Assurance refusée (couverte par la Visa Premier).',
      'Menu traduit avec Google Traduction, payé en Apple Pay.',
      'Prendre le Tobu Limited Express, puis le Shinkansen Hikari.',
      'On a vu Mo et Li au marché.',
    ]) {
      expect(sensitiveSpans(text)).toEqual([])
    }
    const text = 'Rendez-vous avec Li Wei au marché.'
    expect(highlighted(text, sensitiveSpans(text))).toEqual([['name', 'Wei']])
  })
})

// ── templateKnownPlaces ───────────────────────────────────────────────────────

describe('templateKnownPlaces', () => {
  it('rassemble titres, villes, activités, hébergements et trajets, sans doublon', () => {
    const places = templateKnownPlaces(japanTrip())
    expect(places.slice(0, 4)).toEqual([
      'Arrivée à Tokyo',
      'Tokyo',
      'Sanctuaire Meiji-jingu',
      '1-1 Yoyogikamizonocho, Shibuya, Tokyo',
    ])
    for (const place of [
      'Kyoto',
      'teamLab Planets',
      'Hotel Gracery Shinjuku',
      'Ryokan Yachiyo',
      'Paris CDG',
      'Tokyo Haneda',
      'Fushimi Inari-taisha',
    ]) {
      expect(places).toContain(place)
    }
    // Deux nuits au même hôtel, la seconde en minuscules : une seule entrée.
    expect(places).not.toContain('hotel gracery shinjuku')
    expect(places.filter((place) => place === 'Tokyo')).toHaveLength(1)
  })
  it('compte le titre du voyage et des journées, et les compagnies, comme des lieux', () => {
    const trip = [
      day(1, {
        title: 'Asakusa et Ueno',
        transport: transport({ provider: 'Hertz', type: 'car' }),
      }),
    ]
    const places = templateKnownPlaces(trip, '  Japon en famille ')
    expect(places.slice(0, 2)).toEqual(['Japon en famille', 'Asakusa et Ueno'])
    expect(places).toContain('Hertz')
    const note = 'Clés chez Hertz à Asakusa, voir Ueno avec Kenji.'
    expect(highlighted(note, sensitiveSpans(note, places))).toEqual([
      ['name', 'Kenji'],
    ])
  })
})

// ── templateNoteStats ─────────────────────────────────────────────────────────

describe('templateNoteStats', () => {
  it('compte les notes de journée et de trajet, non vides', () => {
    const trip = [
      day(1, {
        notes: 'Arrivée tard.',
        transport: transport({ notes: 'Quai 3' }),
      }),
      day(2, { notes: '  ', transport: transport({ notes: 'Quai 3' }) }),
      day(3, { notes: 'Arrivée tard.' }),
      day(4, { transport: transport({ notes: '' }) }),
    ]
    expect(templateNoteStats(trip)).toEqual({ total: 4, onTransports: 2 })
    expect(templateNoteStats([])).toEqual({ total: 0, onTransports: 0 })
  })

  it('annonce « 25 notes, dont 5 sur des trajets » pour la démo', () => {
    expect(templateNoteStats(demoItinerary)).toEqual({
      total: 25,
      onTransports: 5,
    })
  })
})

// ── noteExcerpts ──────────────────────────────────────────────────────────────

describe('noteExcerpts', () => {
  it('montre d’abord les notes sensibles, dans l’ordre du voyage', () => {
    const excerpts = noteExcerpts(japanTrip())
    expect(excerpts.map((e) => [e.dayId, e.source])).toEqual([
      ['day-1', 'day'],
      ['day-2', 'day'],
    ])
    const [first, second] = excerpts
    expect(first.dayNumber).toBe(1)
    expect(highlighted(first.text, first.spans)).toEqual([
      ['phone', '080-3312-4471'],
    ])
    expect(highlighted(second.text, second.spans)).toEqual([
      ['digits', '4471'],
      ['name', 'Akira'],
      ['email', 'akira@guides.jp'],
    ])
  })

  it('préfère ensuite les notes les plus longues, et respecte la limite', () => {
    const trip = [
      day(1, { notes: 'Courte.' }),
      day(2, {
        notes: 'Une note nettement plus longue, sans rien de personnel dedans.',
        transport: transport({ notes: 'Moyenne, quai 3.' }),
      }),
      day(3, { notes: 'Le guide Hiroshi parle très bien français.' }),
    ]
    expect(noteExcerpts(trip).map((e) => e.dayId)).toEqual(['day-2', 'day-3'])
    expect(noteExcerpts(trip, 3).map((e) => [e.dayId, e.source])).toEqual([
      ['day-2', 'day'],
      ['day-2', 'transport'],
      ['day-3', 'day'],
    ])
    expect(noteExcerpts(trip, 0)).toEqual([])
  })

  it('classe par gravité : contact, 6 chiffres ou plus, nom, puis 4–5 chiffres', () => {
    const trip = [
      day(1, {
        notes:
          'Franchise 1200 €, assurance refusée, caution 3500 € à la remise des clés du véhicule.',
      }),
      day(2, { notes: 'Dîner chez Marco.' }),
      day(3, { notes: 'Casier 778812.' }),
      day(4, { notes: 'Taxi : 080-3312-4471' }),
      day(5, {
        notes: 'Vol CA1590 puis CA933, escale de deux heures.',
      }),
    ]
    const ranked = [1, 2, 3, 4].map((limit) =>
      noteExcerpts(trip, limit)
        .map((excerpt) => excerpt.dayId)
        .sort(),
    )
    expect(ranked).toEqual([
      ['day-4'],
      ['day-3', 'day-4'],
      ['day-2', 'day-3', 'day-4'],
      ['day-1', 'day-2', 'day-3', 'day-4'],
    ])
  })

  it('à gravité égale, préfère la note qui a le plus de passages', () => {
    const trip = [
      day(1, {
        notes:
          'Dîner chez Marco, une adresse que je recommande à tous les amis de passage.',
      }),
      day(2, { notes: 'Avec Marco et Giulia.' }),
    ]
    expect(noteExcerpts(trip, 1).map((excerpt) => excerpt.dayId)).toEqual([
      'day-2',
    ])
  })

  it('ne prend pas les mots du titre du voyage pour des prénoms', () => {
    const trip = [day(1, { notes: 'Toute la tribu Mouzoune est du voyage.' })]
    expect(noteExcerpts(trip)[0].spans).toHaveLength(1)
    expect(
      noteExcerpts(trip, 2, { tripTitle: 'La tribu Mouzoune au Japon' })[0]
        .spans,
    ).toEqual([])
  })

  it('ne prend pas les lieux du voyage pour des noms', () => {
    const [excerpt] = noteExcerpts(japanTrip(), 5).filter(
      (e) => e.dayId === 'day-3' && e.source === 'day',
    )
    expect(excerpt.text).toBe(
      'Journée plus calme, on a pris notre temps au Fushimi Inari.',
    )
    expect(excerpt.spans).toEqual([])
  })

  it('montre une note répétée une seule fois et ignore les notes vides', () => {
    const trip = [
      day(1, { notes: 'Check in online.' }),
      day(2, {
        notes: '   ',
        transport: transport({ notes: 'Check in online.' }),
      }),
    ]
    expect(noteExcerpts(trip, 5)).toEqual([
      {
        dayId: 'day-1',
        dayNumber: 1,
        source: 'day',
        text: 'Check in online.',
        spans: [],
      },
    ])
    expect(noteExcerpts([day(1)])).toEqual([])
  })

  it('met la note sur une ligne sans décaler les passages', () => {
    const [excerpt] = noteExcerpts([
      day(1, { notes: 'Arrivée tard.\nKenji garde la clé :\t4471' }),
    ])
    expect(excerpt.text).toBe('Arrivée tard. Kenji garde la clé : 4471')
    expect(highlighted(excerpt.text, excerpt.spans)).toEqual([
      ['digits', '4471'],
    ])
  })

  it('coupe une note longue sur un mot, avec « … », et rogne les passages', () => {
    const notes =
      'Écrire à kenji@example.jp ! ' +
      'Le matin, longue marche le long de la rivière jusqu’au sanctuaire, ' +
      'puis retour par les ruelles. ' +
      'Numéro de la maison +33 6 12 34 56 78 si besoin, ' +
      'et le code de la boîte à clés est 4471.'
    const [excerpt] = noteExcerpts([day(1, { notes })])

    expect(excerpt.text.endsWith('…')).toBe(true)
    expect(excerpt.text.length).toBeLessThanOrEqual(NOTE_EXCERPT_LENGTH + 1)
    const kept = excerpt.text.slice(0, -1)
    expect(notes.startsWith(kept)).toBe(true)
    // Coupé entre deux mots, pas au milieu d'un.
    expect(notes[kept.length]).toBe(' ')

    const spans = highlighted(excerpt.text, excerpt.spans)
    expect(spans[0]).toEqual(['email', 'kenji@example.jp'])
    // L'e-mail, aussi grave et premier, est visible : l'extrait part du début.
    // Le téléphone traverse la coupe : il est rogné, le code au-delà disparaît.
    expect(spans).toHaveLength(2)
    expect(spans[1][0]).toBe('phone')
    expect('+33 6 12 34 56 78'.startsWith(spans[1][1])).toBe(true)
    for (const span of excerpt.spans) {
      expect(span.end).toBeLessThanOrEqual(kept.length)
    }
  })

  it('centre l’extrait sur la donnée la plus grave, même après un prénom', () => {
    // Choisie pour son téléphone, la note doit le montrer : le prénom du
    // début, moins grave, sort de l'extrait (UX A3, revue n° 6).
    const notes =
      'Arrivée chez Rui en fin de journée, ' +
      'on pose les sacs puis on file dîner dans le quartier, les ruelles ' +
      'sont calmes et les restaurants ferment assez tôt le soir alors mieux ' +
      'vaut ne pas traîner en route, ' +
      'appeler le +33 6 12 34 56 78 avant 22 h.'
    expect(notes.indexOf('+33')).toBeGreaterThan(NOTE_EXCERPT_LENGTH)
    const [excerpt] = noteExcerpts(
      [day(1, { notes: 'Dîner chez Marco.' }), day(2, { notes })],
      1,
    )

    expect(excerpt.dayId).toBe('day-2')
    expect(excerpt.text.startsWith('…')).toBe(true)
    expect(excerpt.spans.map((span) => span.kind)).toContain('phone')
    expect(highlighted(excerpt.text, excerpt.spans)).toEqual([
      ['phone', '+33 6 12 34 56 78'],
    ])
    expect(notes.includes(excerpt.text.slice(1).replace(/…$/, ''))).toBe(true)
  })

  it('à gravité égale, centre l’extrait sur la première donnée du texte', () => {
    const filler =
      'longue route de montagne avec de nombreux arrêts photo, un pique-nique ' +
      'au bord du lac et une baignade rapide avant de reprendre la voiture, '
    const notes =
      `${filler}${filler}écrire à yuki@example.jp ou ` +
      'appeler le 080-3312-4471 pour la clé.'
    const [excerpt] = noteExcerpts([day(1, { notes })])
    expect(excerpt.text.startsWith('…')).toBe(true)
    expect(highlighted(excerpt.text, excerpt.spans)).toEqual([
      ['email', 'yuki@example.jp'],
      ['phone', '080-3312-4471'],
    ])
  })

  it.each([
    ['japonais sans espace', `${'駅'.repeat(200)} 0612345678`, '0612345678'],
    [
      'lien long avant un code',
      `Voir https://www.example.com/${'a'.repeat(200)} code 4821`,
      '4821',
    ],
    [
      'note d’hôtel en chinois',
      `${'酒店在地铁站出口右转直走大约五分钟就到了'.repeat(8)} 电话 13812345678`,
      '13812345678',
    ],
  ])(
    'montre et surligne la donnée sensible d’une note sans espace proche (%s)',
    (_label, notes, secret) => {
      const [excerpt] = noteExcerpts([day(1, { notes })])
      expect(excerpt.spans.length).toBeGreaterThan(0)
      expect(excerpt.text.length).toBeLessThanOrEqual(NOTE_EXCERPT_LENGTH + 2)
      expect(
        highlighted(excerpt.text, excerpt.spans).some(([, value]) =>
          secret.startsWith(value),
        ),
      ).toBe(true)
    },
  )

  it.each([
    ['japonais', `${'駅'.repeat(159)}🍣${'駅'.repeat(10)}`],
    ['français', `Super journée! ${'🍣'.repeat(100)}`],
  ])('ne coupe jamais un emoji en deux (%s)', (_label, notes) => {
    const [excerpt] = noteExcerpts([day(1, { notes })])
    expect(excerpt.text.isWellFormed()).toBe(true)
    expect(() => encodeURIComponent(excerpt.text)).not.toThrow()
    expect(excerpt.text.length).toBeLessThanOrEqual(NOTE_EXCERPT_LENGTH + 1)
  })

  it('ne commence jamais l’extrait au milieu d’un emoji', () => {
    const notes = `${'🍣'.repeat(120)}0612345678`
    const [excerpt] = noteExcerpts([day(1, { notes })])
    expect(excerpt.text.isWellFormed()).toBe(true)
    expect(excerpt.spans.length).toBeGreaterThan(0)
  })

  it('recentre l’extrait sur la donnée sensible quand elle est loin du début', () => {
    const notes =
      'Très belle journée au bord du lac, avec une lumière magnifique en fin d’après-midi et des reflets superbes sur l’eau. ' +
      'Nous avons marché longtemps, pique-niqué au soleil, puis fait une sieste à l’ombre des pins. ' +
      'Pour la location du bateau, appeler le 080-3312-4471 avant 17 h.'
    const [excerpt] = noteExcerpts([day(1, { notes })])

    expect(excerpt.text.startsWith('…')).toBe(true)
    expect(highlighted(excerpt.text, excerpt.spans)).toEqual([
      ['phone', '080-3312-4471'],
    ])
    expect(notes.includes(excerpt.text.slice(1).replace(/…$/, ''))).toBe(true)
  })
})
