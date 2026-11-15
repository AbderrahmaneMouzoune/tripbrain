import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import type { DayItinerary } from '../itinerary-data'
import {
  categoryFromContent,
  categoryOfKind,
  classifyDocument,
  extractDates,
  mentionsName,
  mentionsPlace,
  flattenText,
} from '../document-classify'
import { extractPdfText, textFromContentStream } from '../document-text'

function day(
  id: string,
  date: string,
  extra: Partial<DayItinerary> = {},
): DayItinerary {
  return {
    id,
    date,
    dayNumber: 1,
    city: 'Pékin',
    title: `Journée ${id}`,
    activities: [],
    coordinates: [0, 0],
    ...extra,
  }
}

const hotel = (id: string, name: string, checkIn: string) => ({
  id,
  name,
  address: '',
  bookingUrl: '',
  checkIn,
  checkOut: '',
})

const itinerary: DayItinerary[] = [
  day('d1', '2026-05-10', {
    city: 'Shanghai',
    transport: {
      id: 't1',
      type: 'plane',
      from: 'Paris (CDG)',
      to: 'Shanghai (PVG)',
    },
    accommodation: hotel('h1', 'Hôtel Jing’an Shangri-La', '2026-05-10'),
  }),
  day('d2', '2026-05-11', {
    city: 'Shanghai',
    accommodation: hotel('h1', 'Hôtel Jing’an Shangri-La', '2026-05-10'),
    activities: [
      { id: 'a1', name: 'Musée de Shanghai', type: 'visit' },
      {
        id: 'a2',
        name: 'Croisière sur le Huangpu',
        type: 'experience',
        reservationRequired: true,
      },
    ],
  }),
  day('d3', '2026-05-12', {
    city: 'Pékin',
    transport: {
      id: 't2',
      type: 'train',
      from: 'Shanghai',
      to: 'Pékin',
      provider: 'China Railway',
      bookingReference: 'E123456789',
    },
    accommodation: hotel('h2', 'Peninsula Beijing', '2026-05-12'),
  }),
  day('d4', '2026-05-15', {
    city: 'Xi’an',
    transport: {
      id: 't3',
      type: 'plane',
      from: 'Pékin (PKX)',
      to: 'Xi’an (XIY)',
    },
  }),
]

describe('extractDates', () => {
  it('reconnaît les formats courants', () => {
    const dates = extractDates(
      'Départ 2026-05-10, retour 15/05/2026, vol 12 mai, check-in May 11, 2026, 15MAY',
      [2026],
    )
    expect([...dates].sort()).toEqual([
      '2026-05-10',
      '2026-05-11',
      '2026-05-12',
      '2026-05-15',
    ])
  })

  it('ignore les dates impossibles', () => {
    expect(extractDates('32/13/2026', [2026]).size).toBe(0)
  })
})

describe('mentions', () => {
  it('trouve un lieu par son nom ou son code', () => {
    const flat = flattenText('Vol AF112 CDG → PVG')
    expect(mentionsPlace(flat, 'Paris (CDG)')).toBe(true)
    expect(mentionsPlace(flat, 'Pékin (PKX)')).toBe(false)
  })

  it('trouve un nom par ses mots marquants', () => {
    const flat = flattenText('Your stay at Jing An Shangri-La, West Shanghai')
    expect(mentionsName(flat, 'Hôtel Jing’an Shangri-La')).toBe(true)
    expect(mentionsName(flat, 'Peninsula Beijing')).toBe(false)
  })
})

describe('categoryFromContent', () => {
  it('reconnaît un billet, un hôtel, un passeport', () => {
    expect(categoryFromContent('Boarding pass · Flight AF112 · Seat 23A')).toBe(
      'ticket',
    )
    expect(categoryFromContent('Your room · 3 nights · check-in 15:00')).toBe(
      'hotel',
    )
    expect(categoryFromContent('Visa application · passport number')).toBe(
      'identity',
    )
    expect(categoryFromContent('Facture')).toBe('other')
  })
})

describe('categoryOfKind', () => {
  it('range une activité avec les billets', () => {
    expect(categoryOfKind('activity')).toBe('ticket')
    expect(categoryOfKind('unknown')).toBeNull()
  })
})

describe('classifyDocument', () => {
  it('range un billet par la date et les villes', () => {
    const result = classifyDocument({
      kind: 'ticket',
      names: ['confirmation.pdf'],
      text: 'Vol MU 2104 · PKX → XIY · 15 mai 2026',
      itinerary,
    })
    expect(result).toMatchObject({
      category: 'ticket',
      link: { dayId: 'd4', linkedTo: 'transport' },
      confident: true,
    })
  })

  it('range un billet par son numéro de réservation', () => {
    const result = classifyDocument({
      kind: 'ticket',
      names: ['billet.pdf'],
      text: 'Commande E 123 456 789',
      itinerary,
    })
    expect(result.link).toEqual({ dayId: 'd3', linkedTo: 'transport' })
    expect(result.confident).toBe(true)
  })

  it('suit la journée d’où l’on vient', () => {
    const result = classifyDocument({
      kind: 'ticket',
      names: ['IMG_0042.jpg'],
      text: '',
      itinerary,
      focusDayIndex: 2,
    })
    expect(result.link).toEqual({ dayId: 'd3', linkedTo: 'transport' })
    expect(result.confident).toBe(true)
  })

  it('demande quand rien ne permet de choisir', () => {
    const result = classifyDocument({
      kind: 'ticket',
      names: ['IMG_0042.jpg'],
      text: '',
      itinerary,
    })
    expect(result.confident).toBe(false)
    expect(result.choices).toHaveLength(4)
    expect(result.choices.at(-1)).toEqual({})
  })

  it('préfère un trajet qui n’a pas encore de billet', () => {
    const result = classifyDocument({
      kind: 'ticket',
      names: ['IMG_0042.jpg'],
      text: '',
      itinerary,
      existing: [{ dayId: 'd1', linkedTo: 'transport' }],
    })
    expect(result.choices[0]).not.toEqual({
      dayId: 'd1',
      linkedTo: 'transport',
    })
  })

  it('range un hôtel à la première nuit du séjour', () => {
    const result = classifyDocument({
      kind: 'hotel',
      names: ['booking.pdf'],
      text: 'Jing An Shangri-La · arrivée 10 mai 2026 · 2 nuits',
      itinerary,
    })
    expect(result.link).toEqual({ dayId: 'd1', linkedTo: 'accommodation' })
    expect(result.confident).toBe(true)
  })

  it('range une activité par son nom', () => {
    const result = classifyDocument({
      kind: 'activity',
      names: ['croisiere-huangpu.pdf'],
      text: '',
      itinerary,
    })
    expect(result).toMatchObject({
      category: 'ticket',
      link: { dayId: 'd2', linkedTo: 'activity', activityId: 'a2' },
      confident: true,
    })
  })

  it('range un passeport dans tout le voyage', () => {
    expect(
      classifyDocument({
        kind: 'identity',
        names: ['scan.jpg'],
        text: '',
        itinerary,
      }),
    ).toEqual({ category: 'identity', link: {}, confident: true, choices: [] })
  })

  it('devine le type quand on ne sait pas', () => {
    const result = classifyDocument({
      kind: 'unknown',
      names: ['document.pdf'],
      text: 'Boarding pass · Flight MU2104 · Gate 12 · PKX XIY · 15 mai 2026',
      itinerary,
    })
    expect(result.category).toBe('ticket')
    expect(result.link).toEqual({ dayId: 'd4', linkedTo: 'transport' })
  })

  it('range un document inconnu au jour qu’il cite, sinon au voyage', () => {
    expect(
      classifyDocument({
        kind: 'unknown',
        names: ['recu.pdf'],
        text: 'Reçu du 11/05/2026',
        itinerary,
      }),
    ).toMatchObject({ category: 'other', link: { dayId: 'd2' } })
    expect(
      classifyDocument({
        kind: 'unknown',
        names: ['notes.txt'],
        text: '',
        itinerary,
      }).link,
    ).toEqual({})
  })
})

describe('extractPdfText', () => {
  function pdf(content: string, compressed: boolean): Blob {
    const body = compressed
      ? deflateSync(Buffer.from(content, 'latin1'))
      : Buffer.from(content, 'latin1')
    const dict = compressed
      ? `<< /Length ${body.length} /Filter /FlateDecode >>`
      : `<< /Length ${body.length} >>`
    return new Blob([
      Buffer.concat([
        Buffer.from(`%PDF-1.4\n1 0 obj\n${dict}\nstream\n`, 'latin1'),
        body,
        Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1'),
      ]),
    ])
  }

  const content =
    'BT /F1 12 Tf (Vol AF 112 \\(CDG\\)) Tj [(Pa) -20 (ris)] TJ (10 mai 2026) Tj ET'

  it('lit un flux compressé', async () => {
    const text = await extractPdfText(pdf(content, true))
    expect(text).toContain('Vol AF 112 (CDG)')
    expect(text).toContain('Paris')
    expect(text).toContain('10 mai 2026')
  })

  it('lit un flux non compressé', async () => {
    expect(await extractPdfText(pdf(content, false))).toContain('Paris')
  })

  it('ne lève jamais d’erreur', async () => {
    expect(await extractPdfText(new Blob(['pas un pdf']))).toBe('')
  })

  it('décode les échappements octaux', () => {
    expect(textFromContentStream('(Caf\\351) Tj')).toBe('Café')
  })
})

describe('mentionsPlace', () => {
  it('trouve un aéroport par son code ou ses mots marquants', () => {
    const place = 'PKX Beijing Daxing Intl.'
    expect(mentionsPlace(flattenText('Departure PKX 08:10'), place)).toBe(true)
    expect(
      mentionsPlace(flattenText('From Beijing Daxing airport'), place),
    ).toBe(true)
    expect(mentionsPlace(flattenText('From Shanghai Hongqiao'), place)).toBe(
      false,
    )
  })
})

describe('trajets qui partagent une ville', () => {
  it('reconnaît le trajet aux deux bouts même s’il a déjà un billet', () => {
    const result = classifyDocument({
      kind: 'ticket',
      names: ['confirmation.pdf'],
      text: 'Boarding pass · PKX Beijing Daxing → XIY Xi’an',
      itinerary: [
        day('a', '2026-05-12', {
          transport: { id: 'x', type: 'train', from: 'Qingdao', to: 'Beijing' },
        }),
        day('b', '2026-05-16', {
          transport: {
            id: 'y',
            type: 'plane',
            from: 'PKX Beijing Daxing Intl.',
            to: 'XIY Xi’an Xianyang Intl.',
          },
        }),
        day('c', '2026-05-17', {
          transport: { id: 'z', type: 'train', from: 'Xi’an', to: 'Chongqing' },
        }),
      ],
      existing: [{ dayId: 'b', linkedTo: 'transport' }],
    })
    expect(result.link).toEqual({ dayId: 'b', linkedTo: 'transport' })
    expect(result.confident).toBe(true)
  })
})
