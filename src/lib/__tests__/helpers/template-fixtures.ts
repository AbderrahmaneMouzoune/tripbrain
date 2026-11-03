// Voyages de test pour les modèles : ce qu'un vrai voyage accumule
// (réservations, sièges, statuts, notes, prix), pour vérifier ce que le
// serveur garde et ce qu'il retire.

import { deflateRawSync } from 'node:zlib'
import type {
  Accommodation,
  Activity,
  DayItinerary,
  Transport,
} from '@/lib/itinerary-data'

/**
 * `data` d'une écriture, au format de `compressItinerary` (DEFLATE brut,
 * base64url), pour des octets arbitraires : de quoi fabriquer ce qu'aucun
 * vrai téléphone n'enverrait.
 */
export function compressedBytes(bytes: Uint8Array): string {
  return deflateRawSync(bytes, { level: 9 }).toString('base64url')
}

/** Bombe de décompression : `size` octets nuls, quelques dizaines de Ko une fois compressés. */
export function compressedZeros(size: number): string {
  return compressedBytes(new Uint8Array(size))
}

export function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'act-1',
    name: 'Sanctuaire Meiji-jingu',
    type: 'visit',
    ...overrides,
  }
}

export function transport(overrides: Partial<Transport> = {}): Transport {
  return {
    id: 'tr-1',
    type: 'train',
    from: 'Tokyo',
    to: 'Kyoto',
    ...overrides,
  }
}

export function hotel(overrides: Partial<Accommodation> = {}): Accommodation {
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

export function day(
  dayNumber: number,
  overrides: Partial<DayItinerary> = {},
): DayItinerary {
  return {
    id: `day-${dayNumber}`,
    date: `2026-04-${String(dayNumber).padStart(2, '0')}`,
    dayNumber,
    city: 'Tokyo',
    title: `Jour ${dayNumber}`,
    activities: [],
    coordinates: [35.6762, 139.6503],
    ...overrides,
  }
}

/** Trois jours au Japon, Tokyo puis Kyoto, avec tout ce qui ne doit pas partir. */
export function japanTrip(): DayItinerary[] {
  return [
    day(1, {
      title: 'Arrivée à Tokyo',
      notes: 'Kenji nous attend, appeler le 080-3312-4471 en cas de retard.',
      accommodation: hotel({
        bookingReference: '4021553117',
        price: 540,
        currency: 'EUR',
        status: 'booked',
      }),
      activities: [
        activity({
          price: 12,
          currency: 'EUR',
          status: 'done',
          tips: 'Y aller tôt le matin.',
        }),
      ],
    }),
    day(2, {
      title: 'Shibuya et Harajuku',
      activities: [
        activity({
          id: 'act-2',
          name: 'Carrefour de Shibuya',
          type: 'experience',
        }),
      ],
    }),
    day(3, {
      city: 'Kyoto',
      title: 'Départ pour Kyoto',
      coordinates: [35.0116, 135.7681],
      transport: transport({
        bookingReference: 'PNR8XK',
        seat: '12A',
        departureTime: '2026-04-03T09:12',
        price: 95,
        currency: 'EUR',
        notes: 'Billets dans le mail de Léa.',
      }),
      activities: [
        activity({ id: 'act-3', name: 'Fushimi Inari', type: 'visit' }),
      ],
    }),
  ]
}

/** Une seule journée à Lisbonne : jamais listée, même visible. */
export function lisbonDay(): DayItinerary[] {
  return [
    day(1, {
      date: '2026-06-12',
      city: 'Lisbonne',
      title: 'Alfama et Belém',
      coordinates: [38.7223, -9.1393],
      activities: [activity({ id: 'act-belem', name: 'Tour de Belém' })],
    }),
  ]
}
