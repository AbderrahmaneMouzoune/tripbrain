import { describe, expect, it } from 'vitest'
import type { DayItinerary, Transport } from '@/lib/itinerary-data'
import {
  TRANSPORT_TYPES,
  isTransportType,
  normalizeItineraryTransports,
  normalizeTransportType,
} from '@/lib/transport-type'
import {
  TRANSPORT_BOARDING_LABELS,
  TRANSPORT_PLACE_WORDS,
  TRANSPORT_TYPE_LABELS,
} from '@/components/day/day-logic'
import { TRANSPORT_ICONS } from '@/components/day/day-ui'
import { FIELD_ICONS } from '@/components/edit/field-icons'
import { transportForm } from '@/lib/edit-fields'
import { transportLabel as showcaseLabel } from '@/components/onboarding/showcase'
import { transportLabel as documentLabel } from '@/lib/document-organize'
import { transportSummary } from '@/lib/calendar-export'

describe('normalizeTransportType', () => {
  it.each(TRANSPORT_TYPES)('garde le type de l’app « %s » tel quel', (type) => {
    expect(normalizeTransportType(type)).toBe(type)
  })

  it.each([
    // Types de l'app, casse et espaces ignorés
    [' Car ', 'car'],
    ['PLANE', 'plane'],
    ['Other', 'other'],
    // Bateau
    ['ferry', 'boat'],
    ['Ferry', 'boat'],
    ['FERRY BOAT', 'boat'],
    ['ferry-boat', 'boat'],
    ['Bateau', 'boat'],
    ['bateaux', 'boat'],
    ['ship', 'boat'],
    ['Navette maritime', 'boat'],
    ['navette fluviale', 'boat'],
    ['Croisière', 'boat'],
    ['cruise', 'boat'],
    ['vaporetto', 'boat'],
    ['Water taxi', 'boat'],
    ['taxi-bateau', 'boat'],
    ['Ferry de nuit Marseille → Ajaccio', 'boat'],
    // Avion
    ['avion', 'plane'],
    ['Vol', 'plane'],
    ['vols intérieurs', 'plane'],
    ['flight', 'plane'],
    ['Airplane', 'plane'],
    // Train
    ['TGV', 'train'],
    ['TER', 'train'],
    ['Shinkansen', 'train'],
    ['rail', 'train'],
    ['Métro', 'train'],
    ['metro', 'train'],
    ['subway', 'train'],
    ['tram', 'train'],
    ['RER B', 'train'],
    ['Eurostar', 'train'],
    ['Train de nuit', 'train'],
    // Bus
    ['bus', 'bus'],
    ['Autocar', 'bus'],
    ['coach', 'bus'],
    ['Navette routière', 'bus'],
    ['Bus de nuit', 'bus'],
    // Voiture
    ['voiture', 'car'],
    ['Auto', 'car'],
    ['taxi', 'car'],
    ['VTC', 'car'],
    ['Uber', 'car'],
    ['location', 'car'],
    ['Voiture de location', 'car'],
    ['rental car', 'car'],
    ['drive', 'car'],
    ['moto', 'car'],
    ['camping-car', 'car'],
    // Plusieurs modes : le plus spécifique l'emporte
    ['voiture + ferry', 'boat'],
    ['car ferry', 'boat'],
    ['vol puis train', 'plane'],
    ['taxi puis TGV', 'train'],
    ['location de vélo', 'other'],
    // « car » seul est la voiture de l'app ; en phrase, c'est aussi l'autocar
    ['car de nuit', 'other'],
    // Le reste
    ['navette', 'other'],
    ['téléphérique', 'other'],
    ['à pied', 'other'],
    ['vélo', 'other'],
    ['teleporter', 'other'],
    ['', 'other'],
    ['   ', 'other'],
    ['新幹線', 'other'],
  ] as const)('« %s » → %s', (raw, expected) => {
    expect(normalizeTransportType(raw)).toBe(expected)
  })

  it.each([undefined, null, 42, true, {}, ['ferry'], { type: 'ferry' }])(
    'une valeur qui n’est pas un texte devient other (%s)',
    (raw) => {
      expect(normalizeTransportType(raw)).toBe('other')
    },
  )

  it('est idempotente', () => {
    for (const raw of ['Ferry', 'TGV', 'taxi', 'teleporter', '', 42]) {
      const once = normalizeTransportType(raw)
      expect(normalizeTransportType(once)).toBe(once)
    }
  })

  it('ne reconnaît que les types de l’app comme types', () => {
    expect(TRANSPORT_TYPES.every(isTransportType)).toBe(true)
    expect(isTransportType('ferry')).toBe(false)
    expect(isTransportType('Car')).toBe(false)
    expect(isTransportType(undefined)).toBe(false)
  })
})

describe('normalizeItineraryTransports', () => {
  const day = (transport?: unknown): DayItinerary =>
    ({
      id: 'd1',
      date: '2026-05-10',
      dayNumber: 1,
      city: 'Marseille',
      title: 'Traversée',
      activities: [],
      coordinates: [43.3, 5.4],
      transport,
    }) as DayItinerary

  it('ramène un type inconnu à un type de l’app, sans toucher au reste', () => {
    const input = day({ id: 't1', type: 'Ferry', from: 'Marseille' })
    const [output] = normalizeItineraryTransports([input])
    expect(output.transport).toEqual({
      id: 't1',
      type: 'boat',
      from: 'Marseille',
    })
    // L'entrée n'est pas modifiée.
    expect((input.transport as Transport).type).toBe('Ferry')
  })

  it('rend telle quelle une journée sans trajet ou bien typée', () => {
    const typed = day({ id: 't1', type: 'train' })
    const none = day()
    const output = normalizeItineraryTransports([typed, none])
    expect(output[0]).toBe(typed)
    expect(output[1]).toBe(none)
  })

  it('tolère une journée ou un trajet qui n’est pas un objet', () => {
    const junk = [
      null,
      'texte',
      day('pas un objet'),
    ] as unknown as DayItinerary[]
    expect(normalizeItineraryTransports(junk)).toEqual(junk)
  })
})

describe('chaque type de trajet a son icône et ses libellés', () => {
  it.each(TRANSPORT_TYPES)('%s', (type) => {
    expect(TRANSPORT_TYPE_LABELS[type]).toBeTruthy()
    expect(TRANSPORT_PLACE_WORDS[type]).toBeTruthy()
    expect(TRANSPORT_BOARDING_LABELS[type]).toBeTruthy()
    expect(TRANSPORT_ICONS[type]).toBeTruthy()
    expect(showcaseLabel(type)).toBeTruthy()
    expect(documentLabel({ id: 't', type })).toBeTruthy()
    expect(transportSummary({ id: 't', type })).toBeTruthy()
  })

  it('le bateau et le trajet non classé se lisent en français', () => {
    expect(TRANSPORT_TYPE_LABELS.boat).toBe('Bateau')
    expect(TRANSPORT_TYPE_LABELS.other).toBe('Autre trajet')
    expect(TRANSPORT_PLACE_WORDS.boat).toBe('le port')
    expect(TRANSPORT_BOARDING_LABELS.boat).toBe('Quai')
    expect(TRANSPORT_BOARDING_LABELS.plane).toBe('Porte')
    expect(showcaseLabel('boat')).toBe('Bateau')
    expect(
      documentLabel({ id: 't', type: 'boat', from: 'Nice', to: 'Bastia' }),
    ).toBe('Bateau Nice → Bastia')
  })

  it('l’édition propose chaque type, avec une icône connue', () => {
    const field = transportForm.fields.find((f) => f.key === 'type')
    const options = field?.options ?? []
    expect(options.map((option) => option.value).sort()).toEqual(
      [...TRANSPORT_TYPES].sort(),
    )
    for (const option of options) {
      expect(option.icon && FIELD_ICONS[option.icon]).toBeTruthy()
    }
    expect(options.find((option) => option.value === 'boat')?.label).toBe(
      'Bateau ou ferry',
    )
    expect(options.find((option) => option.value === 'other')?.label).toBe(
      'Autre trajet',
    )
  })
})
