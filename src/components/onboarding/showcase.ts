/**
 * Les trois cartes flottantes de l'écran d'accueil.
 *
 * Elles montrent ce que l'app fait d'un vrai voyage : plutôt que d'inventer un
 * programme, on les tire du voyage d'exemple — celui-là même que « Explorer un
 * voyage exemple » ouvre. Quand une information manque, la carte disparaît.
 */

import type { DayItinerary, Transport } from '@/lib/itinerary-data'

export interface ShowcaseDay {
  dayNumber: number
  title: string
  stepCount: number
  walkingDistance?: string
}

export interface ShowcaseTransport {
  type: Transport['type']
  from: string
  to: string
}

export interface ShowcaseStay {
  /** Première partie de l'adresse : ce qu'on montre au chauffeur en premier. */
  address: string
}

export interface Showcase {
  day: ShowcaseDay | null
  transport: ShowcaseTransport | null
  stay: ShowcaseStay | null
}

/** Au-delà, un lieu ne tient plus sur la carte flottante. */
const MAX_PLACE_LENGTH = 14

export function buildShowcase(itinerary: readonly DayItinerary[]): Showcase {
  // La journée la plus remplie : c'est elle qui donne envie.
  const richest = [...itinerary].sort(
    (a, b) => (b.activities?.length ?? 0) - (a.activities?.length ?? 0),
  )[0]
  const day: ShowcaseDay | null =
    richest && richest.activities?.length
      ? {
          dayNumber: richest.dayNumber,
          title: `${richest.city} — ${richest.title}`,
          stepCount: richest.activities.length,
          walkingDistance: richest.walkingDistance,
        }
      : null

  // Un trajet aux extrémités lisibles d'un coup d'œil (« Shanghai → Taipei »
  // plutôt qu'un nom d'aéroport complet), un vol de préférence.
  const legs = itinerary
    .map((d) => d.transport)
    .filter((t): t is Transport & { from: string; to: string } =>
      Boolean(t?.from?.trim() && t?.to?.trim()),
    )
  const short = (t: { from: string; to: string }) =>
    t.from.length <= MAX_PLACE_LENGTH && t.to.length <= MAX_PLACE_LENGTH
  const leg =
    legs.find((t) => t.type === 'plane' && short(t)) ??
    legs.find(short) ??
    legs[0]
  const transport: ShowcaseTransport | null = leg
    ? { type: leg.type, from: leg.from.trim(), to: leg.to.trim() }
    : null

  const withAddress = itinerary.find((d) => d.accommodation?.address?.trim())
  const stay: ShowcaseStay | null = withAddress?.accommodation
    ? {
        address: withAddress.accommodation.address.split(',')[0].trim(),
      }
    : null

  return { day, transport, stay }
}

/** Libellé court d'un mode de transport. */
export function transportLabel(type: Transport['type']): string {
  switch (type) {
    case 'plane':
      return 'Vol'
    case 'train':
      return 'Train'
    case 'bus':
      return 'Bus'
    case 'car':
      return 'Voiture'
  }
}
