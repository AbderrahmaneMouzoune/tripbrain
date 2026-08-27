import { describe, it, expect } from 'vitest'
import type { EditField } from '../edit-fields'
import {
  countFilledFields,
  fromDraft,
  toDraft,
  validateDraft,
} from '../entity-draft'

const fields: readonly EditField[] = [
  { key: 'name', label: 'Nom', type: 'text', required: true },
  { key: 'notes', label: 'Note', type: 'textarea' },
  { key: 'price', label: 'Prix', type: 'price', currencyKey: 'currency' },
  { key: 'rating', label: 'Note', type: 'rating' },
  { key: 'bookingUrl', label: 'Lien', type: 'url', allowEmpty: true },
  { key: 'reservationRequired', label: 'Réservation', type: 'switch' },
  { key: 'tags', label: 'Tags', type: 'chips' },
  { key: 'highlights', label: 'Points forts', type: 'lines' },
  { key: 'coordinates', label: 'Coordonnées', type: 'coordinates' },
]

describe('toDraft', () => {
  it('turns every field into an editable value', () => {
    const draft = toDraft(
      {
        name: 'Temple',
        price: 25,
        currency: 'CNY',
        rating: 4.5,
        reservationRequired: true,
        tags: ['art', 'musée'],
        highlights: ['Vue sur le Bund'],
        coordinates: [31.2, 121.4],
      },
      fields,
    )

    expect(draft).toEqual({
      name: 'Temple',
      notes: '',
      price: '25',
      currency: 'CNY',
      rating: '4.5',
      bookingUrl: '',
      reservationRequired: true,
      tags: ['art', 'musée'],
      highlights: ['Vue sur le Bund'],
      coordinates: ['31.2', '121.4'],
    })
  })

  it('falls back to empty values for missing or mistyped data', () => {
    const draft = toDraft({ price: 'gratuit', coordinates: [1] }, fields)

    expect(draft.price).toBe('')
    expect(draft.currency).toBe('')
    expect(draft.tags).toEqual([])
    expect(draft.coordinates).toEqual(['', ''])
    expect(draft.reservationRequired).toBe(false)
  })
})

describe('fromDraft', () => {
  it('keeps the properties the form does not cover', () => {
    const entity = { id: 'act-1', name: 'Temple', images: ['a.jpg'] }

    const next = fromDraft(entity, fields, toDraft(entity, fields))

    expect(next.id).toBe('act-1')
    expect(next.images).toEqual(['a.jpg'])
  })

  it('removes emptied optional fields instead of storing empty values', () => {
    const entity = {
      id: 'act-1',
      name: 'Temple',
      notes: 'à voir',
      price: 25,
      currency: 'CNY',
      rating: 4,
      reservationRequired: true,
      tags: ['art'],
      highlights: ['Vue'],
      coordinates: [31.2, 121.4],
    }

    const next = fromDraft(entity, fields, {
      name: 'Temple',
      notes: '   ',
      price: '',
      currency: 'CNY',
      rating: '',
      bookingUrl: '',
      reservationRequired: false,
      tags: ['', '  '],
      highlights: [],
      coordinates: ['', ''],
    })

    expect(next).toEqual({ id: 'act-1', name: 'Temple', bookingUrl: '' })
  })

  it('trims text, parses numbers and coordinates', () => {
    const next = fromDraft({ id: 'act-1' }, fields, {
      name: '  Temple  ',
      notes: '',
      price: ' 12,5 ',
      currency: ' cny ',
      rating: '4',
      bookingUrl: 'https://exemple.fr',
      reservationRequired: true,
      tags: [' art ', ''],
      highlights: ['  Vue sur le Bund '],
      coordinates: [' 31.2 ', '121.4'],
    })

    expect(next).toEqual({
      id: 'act-1',
      name: 'Temple',
      price: 12.5,
      currency: 'CNY',
      rating: 4,
      bookingUrl: 'https://exemple.fr',
      reservationRequired: true,
      tags: ['art'],
      highlights: ['Vue sur le Bund'],
      coordinates: [31.2, 121.4],
    })
  })

  it('drops the currency when the amount is removed', () => {
    const next = fromDraft(
      { id: 'act-1', price: 25, currency: 'CNY' },
      fields,
      {
        name: 'Temple',
        price: '',
        currency: 'CNY',
      },
    )

    expect('price' in next).toBe(false)
    expect('currency' in next).toBe(false)
  })

  it('falls back to [0, 0] for required coordinates left empty', () => {
    const requiredCoordinates: readonly EditField[] = [
      {
        key: 'coordinates',
        label: 'Coordonnées',
        type: 'coordinates',
        required: true,
      },
    ]

    const next = fromDraft({ id: 'day-1' }, requiredCoordinates, {
      coordinates: ['', ''],
    })

    expect(next.coordinates).toEqual([0, 0])
  })

  it('keeps required text fields even when the value is empty', () => {
    const next = fromDraft({ id: 'act-1', name: 'Temple' }, fields, {
      name: '',
    })

    expect(next.name).toBe('')
  })
})

describe('validateDraft', () => {
  it('accepts a complete draft', () => {
    expect(
      validateDraft(fields, {
        name: 'Temple',
        price: '25',
        rating: '4',
        coordinates: ['31.2', '121.4'],
      }),
    ).toEqual({})
  })

  it('reports empty required fields', () => {
    expect(validateDraft(fields, { name: '   ' })).toHaveProperty('name')
  })

  it('reports non-numeric amounts', () => {
    expect(
      validateDraft(fields, { name: 'Temple', price: 'douze' }),
    ).toHaveProperty('price')
  })

  it('reports a negative amount', () => {
    expect(
      validateDraft(fields, { name: 'Temple', price: '-4' }),
    ).toHaveProperty('price')
  })

  it('reports a rating outside 0 to 5', () => {
    expect(
      validateDraft(fields, { name: 'Temple', rating: '7' }),
    ).toHaveProperty('rating')
  })

  it('reports half-filled coordinates', () => {
    expect(
      validateDraft(fields, { name: 'Temple', coordinates: ['31.2', ''] }),
    ).toHaveProperty('coordinates')
  })

  it('accepts optional coordinates left empty', () => {
    expect(
      validateDraft(fields, { name: 'Temple', coordinates: ['', ''] }),
    ).toEqual({})
  })

  it('reports an empty required list', () => {
    const requiredList: readonly EditField[] = [
      { key: 'tags', label: 'Tags', type: 'chips', required: true },
    ]

    expect(validateDraft(requiredList, { tags: ['  '] })).toHaveProperty('tags')
  })
})

describe('countFilledFields', () => {
  it('counts text, lists, switches and coordinates that carry a value', () => {
    const filled = countFilledFields(fields, {
      name: 'Temple',
      notes: '   ',
      price: '25',
      rating: '',
      bookingUrl: '',
      reservationRequired: true,
      tags: ['art'],
      highlights: [''],
      coordinates: ['31.2', '121.4'],
    })

    expect(filled).toBe(5)
  })
})
