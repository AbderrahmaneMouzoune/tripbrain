import { describe, expect, it } from 'vitest'
import { splitPhoneNumbers, telHref } from '@/lib/phone-links'

const phones = (text: string) =>
  splitPhoneNumbers(text)
    .filter((part) => part.kind === 'phone')
    .map((part) => (part.kind === 'phone' ? part.href : ''))

describe('splitPhoneNumbers', () => {
  it('repère les numéros internationaux et nationaux', () => {
    expect(phones('Assistance : +33 1 00 00 00 00 (fictif)')).toEqual([
      'tel:+33100000000',
    ])
    expect(phones('Hôtel 01.23.45.67.89, réception 24h/24')).toEqual([
      'tel:0123456789',
    ])
    expect(phones('Appeler le +44 (0)20 7946 0958')).toEqual([
      'tel:+442079460958',
    ])
    expect(phones('Taxi +86-21-6888-8888')).toEqual(['tel:+862168888888'])
  })

  it('laisse les dates, heures, références et numéros courts', () => {
    expect(phones('Police 110, pompiers 119')).toEqual([])
    expect(phones('Contrat NA-2026-004712')).toEqual([])
    expect(phones('Du 10-12 mai, ouvert 09:00–17:00')).toEqual([])
    expect(phones('Réservation 2026-05-12')).toEqual([])
    expect(phones('Code 0123')).toEqual([])
    expect(phones('Arrivée le 01.02.2025 à 14h')).toEqual([])
    expect(phones('Départ le 02.05.2025')).toEqual([])
    expect(phones('du 05-06-2025 au 10-06-2025')).toEqual([])
    expect(phones('du 01-02 au 03-04-2025')).toEqual([])
    expect(phones('Le 03 04 2025')).toEqual([])
    expect(phones('IBAN FR76 3000 6000 0112 3456 7890 189')).toEqual([])
  })

  it('garde le texte autour intact', () => {
    const text = 'Réception : 06 12 34 56 78 (WhatsApp).'
    expect(
      splitPhoneNumbers(text)
        .map((part) => part.text)
        .join(''),
    ).toBe(text)
  })
})

describe('telHref', () => {
  it('ne garde que les chiffres et le + initial', () => {
    expect(telHref('+33 (0)6 12 34 56 78')).toBe('tel:+33612345678')
    expect(telHref('06.12.34.56.78')).toBe('tel:0612345678')
  })
})
