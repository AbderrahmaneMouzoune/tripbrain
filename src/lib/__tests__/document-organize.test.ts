import type { DayItinerary } from '@/lib/itinerary-data'
import type { StoredFile } from '@/lib/documents-db'
import {
  describeLink,
  documentCategory,
  documentCategoryLabel,
  fileFormatLabel,
  filterDocuments,
  formatFileSize,
  groupDocumentsByDay,
  isDocumentInTrip,
  missingDocuments,
  normalizeLink,
  sortDocuments,
} from '../document-organize'
import { DEMO_DOCUMENT_ID_PREFIX } from '../demo-documents'

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

const itinerary: DayItinerary[] = [
  day('d1', '2026-05-10', {
    accommodation: {
      id: 'acc-1',
      name: 'Hôtel du Bund',
      address: 'Shanghai',
      bookingUrl: '',
      checkIn: '2026-05-10',
      checkOut: '2026-05-12',
    },
  }),
  day('d2', '2026-05-11', {
    transport: { id: 't-2', type: 'train', from: 'Shanghai', to: 'Qingdao' },
  }),
  day('d3', '2026-05-12', {
    transport: { id: 't-3', type: 'plane', from: 'PKX', to: 'XIY' },
    accommodation: {
      id: 'acc-3',
      name: 'Xi’an Hotel',
      address: 'Xi’an',
      bookingUrl: '',
      checkIn: '2026-05-12',
      checkOut: '2026-05-14',
    },
    activities: [{ id: 'a-3', name: 'Armée de terre cuite', type: 'visit' }],
  }),
]

function file(partial: Partial<StoredFile> & { id: string }): StoredFile {
  return {
    name: `${partial.id}.pdf`,
    size: 1000,
    type: 'application/pdf',
    lastModified: 0,
    addedAt: 0,
    blob: new Blob(['x']),
    ...partial,
  }
}

describe('isDocumentInTrip', () => {
  it('keeps documents without a trip visible in every trip', () => {
    expect(isDocumentInTrip({ id: 'old' }, 'trip-a', false)).toBe(true)
  })

  it('shows a trip document only in its own trip', () => {
    expect(isDocumentInTrip({ id: 'x', tripId: 'a' }, 'a', false)).toBe(true)
    expect(isDocumentInTrip({ id: 'x', tripId: 'a' }, 'b', false)).toBe(false)
  })

  it('reserves demo documents to the demo trip', () => {
    const demo = { id: `${DEMO_DOCUMENT_ID_PREFIX}1` }
    expect(isDocumentInTrip(demo, 'demo', true)).toBe(true)
    expect(isDocumentInTrip(demo, 'real', false)).toBe(false)
  })
})

describe('documentCategory', () => {
  it('trusts the link first', () => {
    expect(documentCategory({ name: 'scan.jpg', linkedTo: 'transport' })).toBe(
      'ticket',
    )
    expect(
      documentCategory({ name: 'scan.jpg', linkedTo: 'accommodation' }),
    ).toBe('hotel')
    expect(documentCategory({ name: 'entrée.png', linkedTo: 'activity' })).toBe(
      'ticket',
    )
  })

  it('falls back on words of the file name, accents ignored', () => {
    expect(documentCategory({ name: 'Billet-train-Shanghai.pdf' })).toBe(
      'ticket',
    )
    expect(documentCategory({ name: 'Carte-embarquement-PVG.svg' })).toBe(
      'ticket',
    )
    expect(documentCategory({ name: 'Confirmation-Hôtel-Pékin.pdf' })).toBe(
      'hotel',
    )
    expect(documentCategory({ name: 'airbnb_receipt.pdf' })).toBe('hotel')
    expect(documentCategory({ name: 'Visa Chine.pdf' })).toBe('identity')
    expect(documentCategory({ name: 'PASSEPORT.jpg' })).toBe('identity')
    expect(documentCategory({ name: 'Attestation-assurance.pdf' })).toBe(
      'other',
    )
  })

  it('matches whole words only', () => {
    // « vol » ne doit pas se cacher dans « volume »
    expect(documentCategory({ name: 'volume-2.pdf' })).toBe('other')
    // « pass » n'est pas un passeport
    expect(documentCategory({ name: 'passe-partout.pdf' })).toBe('other')
  })

  it('puts identity papers before tickets', () => {
    expect(documentCategory({ name: 'visa-billet.pdf' })).toBe('identity')
  })

  it('names the identity paper precisely', () => {
    expect(documentCategoryLabel({ name: 'passport-scan.jpg' })).toBe(
      'Passeport',
    )
    expect(documentCategoryLabel({ name: 'e-visa.pdf' })).toBe('Visa')
    expect(documentCategoryLabel({ name: 'notes.txt' })).toBe('Autre')
  })
})

describe('formatting helpers', () => {
  it('formats sizes the French way', () => {
    expect(formatFileSize(512)).toBe('512 o')
    expect(formatFileSize(214 * 1024)).toBe('214 Ko')
    expect(formatFileSize(1.2 * 1024 * 1024)).toBe('1,2 Mo')
  })

  it('reads the format from the extension, then the MIME type', () => {
    expect(fileFormatLabel({ name: 'a.jpeg', type: 'image/jpeg' })).toBe('JPEG')
    expect(fileFormatLabel({ name: 'scan', type: 'application/pdf' })).toBe(
      'PDF',
    )
    expect(fileFormatLabel({ name: 'scan', type: '' })).toBe('FICHIER')
  })
})

describe('filterDocuments and sortDocuments', () => {
  const files = [
    file({ id: 'a', name: 'Billet Pékin.pdf', size: 30, addedAt: 2 }),
    file({ id: 'b', name: 'Visa.pdf', size: 10, addedAt: 3 }),
    file({ id: 'c', name: 'assurance.pdf', size: 20, addedAt: 1 }),
  ]

  it('searches without accents and filters by category', () => {
    expect(filterDocuments(files, { query: 'pekin' }).map((f) => f.id)).toEqual(
      ['a'],
    )
    expect(
      filterDocuments(files, { category: 'identity' }).map((f) => f.id),
    ).toEqual(['b'])
    expect(filterDocuments(files, {})).toHaveLength(3)
  })

  it('sorts by name, size or date added', () => {
    expect(sortDocuments(files, 'name').map((f) => f.id)).toEqual([
      'c',
      'a',
      'b',
    ])
    expect(sortDocuments(files, 'size').map((f) => f.id)).toEqual([
      'a',
      'c',
      'b',
    ])
    expect(sortDocuments(files, 'added').map((f) => f.id)).toEqual([
      'b',
      'a',
      'c',
    ])
  })
})

describe('groupDocumentsByDay', () => {
  it('orders day groups by the trip, then the whole-trip group', () => {
    const groups = groupDocumentsByDay(
      [
        file({ id: 'trip' }),
        file({ id: 'd3-old', dayId: 'd3', addedAt: 1 }),
        file({ id: 'd1', dayId: 'd1' }),
        file({ id: 'd3-new', dayId: 'd3', addedAt: 5 }),
        file({ id: 'ghost', dayId: 'deleted-day' }),
      ],
      itinerary,
    )
    expect(groups.map((g) => g.dayIndex)).toEqual([0, 2, null])
    expect(groups[1].files.map((f) => f.id)).toEqual(['d3-new', 'd3-old'])
    expect(groups[2].files.map((f) => f.id).sort()).toEqual(['ghost', 'trip'])
  })

  it('returns nothing for no documents', () => {
    expect(groupDocumentsByDay([], itinerary)).toEqual([])
  })
})

describe('links', () => {
  it('falls back to the day when the transport is gone', () => {
    expect(
      normalizeLink({ dayId: 'd1', linkedTo: 'transport' }, itinerary),
    ).toEqual({ dayId: 'd1' })
    expect(normalizeLink({ dayId: 'nope' }, itinerary)).toEqual({})
    expect(
      normalizeLink(
        { dayId: 'd3', linkedTo: 'activity', activityId: 'a-3' },
        itinerary,
      ),
    ).toEqual({ dayId: 'd3', linkedTo: 'activity', activityId: 'a-3' })
  })

  it('describes the link with the day number', () => {
    expect(
      describeLink({ dayId: 'd3', linkedTo: 'transport' }, itinerary),
    ).toEqual({ dayIndex: 2, short: 'J3', long: 'J3 · Vol PKX → XIY' })
    expect(describeLink({}, itinerary).long).toBe('Tout le voyage')
  })
})

describe('missingDocuments', () => {
  it('counts every transport and stay when nothing is attached', () => {
    const result = missingDocuments(itinerary, [])
    expect(result.transports).toEqual({
      total: 2,
      missing: 2,
      firstDayIndex: 1,
    })
    expect(result.accommodations).toEqual({
      total: 2,
      missing: 2,
      firstDayIndex: 0,
    })
  })

  it('ignores what already has a document', () => {
    const result = missingDocuments(itinerary, [
      { dayId: 'd2', linkedTo: 'transport' },
      { dayId: 'd1', linkedTo: 'accommodation' },
      // Rattaché à la journée seulement : ne couvre ni trajet ni hôtel.
      { dayId: 'd3' },
    ])
    expect(result.transports).toEqual({
      total: 2,
      missing: 1,
      firstDayIndex: 2,
    })
    expect(result.accommodations).toEqual({
      total: 2,
      missing: 1,
      firstDayIndex: 2,
    })
  })

  it('counts a multi-day stay once', () => {
    const stay = itinerary[0].accommodation!
    const repeated = [
      day('x1', '2026-05-10', { accommodation: stay }),
      day('x2', '2026-05-11', { accommodation: stay }),
    ]
    const covered = missingDocuments(repeated, [
      { dayId: 'x2', linkedTo: 'accommodation' },
    ])
    expect(covered.accommodations).toEqual({
      total: 1,
      missing: 0,
      firstDayIndex: -1,
    })
  })
})
