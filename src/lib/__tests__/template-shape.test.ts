import type { DayItinerary } from '@/lib/itinerary-data'
import { cleanForTemplate } from '@/lib/template-clean'
import { normalizeItineraryShape } from '@/lib/template-shape'
import {
  activity,
  day,
  hotel,
  japanTrip,
  transport,
} from './helpers/template-fixtures'

/** Ce que msgpack laisse passer et qu'aucun vrai téléphone n'enverrait. */
function hostile(value: Record<string, unknown>): DayItinerary {
  return value as unknown as DayItinerary
}

function normalizeDay(value: unknown): DayItinerary | undefined {
  return normalizeItineraryShape([value])?.[0]
}

describe('normalizeItineraryShape', () => {
  it('rend à l’identique un voyage bien formé', () => {
    expect(normalizeItineraryShape(japanTrip())).toEqual(japanTrip())
  })

  it('est idempotente, avant comme après le nettoyage', () => {
    const once = normalizeItineraryShape(japanTrip())
    expect(normalizeItineraryShape(once)).toEqual(once)
    const cleaned = cleanForTemplate(once ?? [], {
      includeNotes: true,
      includePrices: true,
    })
    expect(normalizeItineraryShape(cleaned)).toEqual(cleaned)
  })

  it('refuse ce qui n’est pas une liste de journées', () => {
    expect(normalizeItineraryShape(null)).toBeNull()
    expect(normalizeItineraryShape({ jours: 3 })).toBeNull()
    expect(normalizeItineraryShape([day(1), 'jour 2'])).toBeNull()
    expect(normalizeItineraryShape([])).toEqual([])
  })

  it.each([
    ['un id numérique', { id: 7 }],
    ['une date objet', { date: { y: 2026 } }],
    ['un numéro de jour NaN', { dayNumber: Number.NaN }],
    ['un numéro de jour infini', { dayNumber: Number.POSITIVE_INFINITY }],
    ['un numéro de jour en texte', { dayNumber: '1' }],
    ['une ville absente', { city: undefined }],
    ['un titre tableau', { title: ['Jour 1'] }],
    ['des activités objet', { activities: { 0: activity() } }],
    ['des coordonnées en texte', { coordinates: ['35.6', '139.6'] }],
    ['des coordonnées NaN', { coordinates: [Number.NaN, 139.6] }],
    ['trois coordonnées', { coordinates: [35.6, 139.6, 0] }],
  ])('refuse tout l’itinéraire pour une journée avec %s', (_label, change) => {
    const broken = hostile({ ...day(2), ...change })
    expect(normalizeItineraryShape([day(1), broken])).toBeNull()
  })

  it('retire les champs facultatifs mal typés d’une journée', () => {
    const normalized = normalizeDay(
      hostile({
        ...day(1),
        notes: { texte: 'Kenji' },
        walkingDistance: 12,
        dayType: null,
        highlights: ['Shibuya', 42, { nom: 'Harajuku' }, 'Meiji'],
        tips: 'Y aller tôt',
        source: 'pirate',
        priority: 'must',
      }),
    )
    expect(normalized).toEqual({
      ...day(1),
      highlights: ['Shibuya', 'Meiji'],
      priority: 'must',
    })
  })

  it('ne garde que les images de journée en http(s), avec une légende en texte', () => {
    const normalized = normalizeDay(
      hostile({
        ...day(1),
        images: [
          { url: 'javascript:alert(1)', caption: 'piège' },
          { url: 'https://example.com/tokyo.jpg', caption: { html: '<b>' } },
          { url: 'data:image/png;base64,AAAA', caption: '' },
          'https://example.com/nue.jpg',
          { url: 'http://example.com/kyoto.jpg', caption: 'Kyoto' },
        ],
      }),
    )
    expect(normalized?.images).toEqual([
      { url: 'https://example.com/tokyo.jpg', caption: '' },
      { url: 'http://example.com/kyoto.jpg', caption: 'Kyoto' },
    ])
  })

  it('ne recopie pas les clés inconnues', () => {
    const normalized = normalizeDay(
      hostile({ ...day(1), confirmationCode: 'K7X2PQ', __html: '<script>' }),
    )
    expect(normalized).toEqual(day(1))
  })

  it('ne lit pas une clé héritée du prototype', () => {
    const inherited = Object.assign(Object.create({ name: 'Hérité' }), {
      id: 'act-1',
      type: 'visit',
    })
    expect(
      normalizeDay({ ...day(1), activities: [inherited] })?.activities,
    ).toEqual([])
  })
})

describe('activités', () => {
  it('retire une activité sans nom en texte, ou sans id', () => {
    const normalized = normalizeDay(
      hostile({
        ...day(1),
        activities: [
          activity({ id: 'act-ok' }),
          { ...activity({ id: 'act-objet' }), name: { fr: 'Temple' } },
          { ...activity({ id: 'act-vide' }), name: undefined },
          { ...activity(), id: 3 },
          'Temple Senso-ji',
          null,
        ],
      }),
    )
    expect(normalized?.activities.map((a) => a.id)).toEqual(['act-ok'])
  })

  it('remet un type inconnu à « visit »', () => {
    const normalized = normalizeDay(
      hostile({
        ...day(1),
        activities: [
          { ...activity(), type: 'museum' },
          { ...activity({ id: 'b' }), type: 4 },
        ],
      }),
    )
    expect(normalized?.activities.map((a) => a.type)).toEqual([
      'visit',
      'visit',
    ])
  })

  it('retire les valeurs mal typées et garde les autres', () => {
    const [normalized] =
      normalizeDay(
        hostile({
          ...day(1),
          activities: [
            {
              ...activity(),
              description: 'Grand sanctuaire',
              price: Number.NaN,
              rating: Number.POSITIVE_INFINITY,
              currency: 7,
              coordinates: ['35.67', '139.69'],
              reservationRequired: 'oui',
              tags: ['shinto', 1, 'parc'],
              images: [
                'javascript:alert(1)',
                'https://example.com/meiji.jpg',
                42,
              ],
              bookingUrl: { href: 'https://example.com' },
              openAt: '09:00–17:00',
              status: 'annulé',
              tips: ['tôt'],
            },
          ],
        }),
      )?.activities ?? []
    expect(normalized).toEqual({
      ...activity(),
      description: 'Grand sanctuaire',
      tags: ['shinto', 'parc'],
      images: ['https://example.com/meiji.jpg'],
      openAt: '09:00–17:00',
    })
  })

  it('garde des coordonnées d’activité à deux nombres finis', () => {
    const [kept] =
      normalizeDay({
        ...day(1),
        activities: [
          activity({ coordinates: [35.67, 139.69], price: 0, rating: 4.5 }),
        ],
      })?.activities ?? []
    expect(kept).toMatchObject({
      coordinates: [35.67, 139.69],
      price: 0,
      rating: 4.5,
    })
  })
})

describe('transport', () => {
  it.each([
    ['n’est pas un objet', 'Shinkansen'],
    ['est une liste', [transport()]],
    ['n’a pas d’id', { ...transport(), id: undefined }],
    ['a un id numérique', { ...transport(), id: 12 }],
    ['a un type inconnu', { ...transport(), type: 'ferry' }],
    ['n’a pas de type', { ...transport(), type: undefined }],
  ])('retire un transport qui %s', (_label, value) => {
    const normalized = normalizeDay(hostile({ ...day(1), transport: value }))
    expect(normalized).toBeDefined()
    expect(normalized).not.toHaveProperty('transport')
  })

  it('garde un transport valide en retirant ses valeurs mal typées', () => {
    const normalized = normalizeDay(
      hostile({
        ...day(1),
        transport: {
          ...transport(),
          departureTime: { h: 9 },
          price: Number.NaN,
          provider: 'JR',
          bookingReference: 'PNR8XK',
          seat: 12,
          notes: ['mail de Léa'],
        },
      }),
    )
    expect(normalized?.transport).toEqual({
      ...transport(),
      provider: 'JR',
      bookingReference: 'PNR8XK',
    })
  })
})

describe('hébergement', () => {
  it.each([
    ['n’est pas un objet', 'Hotel Gracery'],
    ['n’a pas de nom', { ...hotel(), name: undefined }],
    ['a un nom objet', { ...hotel(), name: { fr: 'Gracery' } }],
    ['n’a pas d’id', { ...hotel(), id: null }],
  ])('retire un hébergement qui %s', (_label, value) => {
    const normalized = normalizeDay(
      hostile({ ...day(1), accommodation: value }),
    )
    expect(normalized).toBeDefined()
    expect(normalized).not.toHaveProperty('accommodation')
  })

  it('garde un hébergement nommé, adresse, lien et horaires manquants remis à vide', () => {
    const normalized = normalizeDay(
      hostile({
        ...day(1),
        accommodation: {
          id: 'acc-1',
          name: 'Ryokan Sawanoya',
          bookingUrl: { href: 'https://sawanoya.com' },
          checkIn: 1712000000,
          price: '120',
          images: ['javascript:alert(1)', 'https://sawanoya.com/chambre.jpg'],
        },
      }),
    )
    expect(normalized?.accommodation).toEqual({
      id: 'acc-1',
      name: 'Ryokan Sawanoya',
      address: '',
      bookingUrl: '',
      checkIn: '',
      checkOut: '',
      images: ['https://sawanoya.com/chambre.jpg'],
    })
  })

  it('garde la référence en texte : le nettoyage s’en sert pour reconnaître un lien privé', () => {
    const shaped = normalizeItineraryShape([
      day(1, {
        accommodation: hotel({
          bookingUrl: 'https://gracery.com/stay/4021553117',
          bookingReference: '4021 553 117',
        }),
      }),
    ])
    const [cleaned] = cleanForTemplate(shaped ?? [], {
      includeNotes: false,
      includePrices: true,
    })
    expect(cleaned.accommodation?.bookingUrl).toBe('')
    expect(cleaned.accommodation).not.toHaveProperty('bookingReference')
  })
})
