import { describe, it, expect } from 'vitest'
import type { EditField } from '../edit-fields'
import { fromDraft, toDraft, validateDraft } from '../entity-draft'

const fields: readonly EditField[] = [
  { key: 'name', label: 'Nom', type: 'text', required: true },
  { key: 'notes', label: 'Note', type: 'textarea' },
  { key: 'price', label: 'Prix', type: 'number' },
  { key: 'bookingUrl', label: 'Lien', type: 'text', allowEmpty: true },
  { key: 'reservationRequired', label: 'Réservation', type: 'switch' },
  { key: 'tags', label: 'Tags', type: 'list' },
  { key: 'coordinates', label: 'Coordonnées', type: 'coordinates' },
]

describe('toDraft', () => {
  it('turns every field into an editable value', () => {
    const draft = toDraft(
      {
        name: 'Temple',
        price: 25,
        reservationRequired: true,
        tags: ['art', 'musée'],
        coordinates: [31.2, 121.4],
      },
      fields,
    )

    expect(draft).toEqual({
      name: 'Temple',
      notes: '',
      price: '25',
      bookingUrl: '',
      reservationRequired: true,
      tags: ['art', 'musée'],
      coordinates: ['31.2', '121.4'],
    })
  })

  it('falls back to empty values for missing or mistyped data', () => {
    const draft = toDraft({ price: 'gratuit', coordinates: [1] }, fields)

    expect(draft.price).toBe('')
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
      reservationRequired: true,
      tags: ['art'],
      coordinates: [31.2, 121.4],
    }

    const next = fromDraft(entity, fields, {
      name: 'Temple',
      notes: '   ',
      price: '',
      bookingUrl: '',
      reservationRequired: false,
      tags: ['', '  '],
      coordinates: ['', ''],
    })

    expect(next).toEqual({ id: 'act-1', name: 'Temple', bookingUrl: '' })
  })

  it('trims text, parses numbers and coordinates', () => {
    const next = fromDraft({ id: 'act-1' }, fields, {
      name: '  Temple  ',
      notes: '',
      price: ' 12.5 ',
      bookingUrl: 'https://exemple.fr',
      reservationRequired: true,
      tags: [' art ', ''],
      coordinates: [' 31.2 ', '121.4'],
    })

    expect(next).toEqual({
      id: 'act-1',
      name: 'Temple',
      price: 12.5,
      bookingUrl: 'https://exemple.fr',
      reservationRequired: true,
      tags: ['art'],
      coordinates: [31.2, 121.4],
    })
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
        coordinates: ['31.2', '121.4'],
      }),
    ).toEqual({})
  })

  it('reports empty required fields', () => {
    expect(validateDraft(fields, { name: '   ' })).toHaveProperty('name')
  })

  it('reports non-numeric values', () => {
    expect(
      validateDraft(fields, { name: 'Temple', price: 'douze' }),
    ).toHaveProperty('price')
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
      { key: 'tags', label: 'Tags', type: 'list', required: true },
    ]

    expect(validateDraft(requiredList, { tags: ['  '] })).toHaveProperty('tags')
  })
})
