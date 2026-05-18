// Pipeline d'import inverse : base64url → inflate → msgpack decode → DayItinerary[]

import { decode } from '@msgpack/msgpack'
import { inflateSync } from 'fflate'
import type { DayItinerary } from '@/lib/itinerary-data'

/** Reconstitue les octets depuis une chaîne base64url. */
function fromBase64Url(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    '=',
  )
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Décompresse un itinéraire précédemment produit par compressItinerary.
 * Lève une erreur si les données sont invalides ou ne forment pas un tableau.
 */
export function decompressItinerary(compressed: string): DayItinerary[] {
  const bytes = fromBase64Url(compressed)
  const inflated = inflateSync(bytes)
  const data = decode(inflated)
  if (!Array.isArray(data)) {
    throw new Error(
      'Format invalide\u00a0: les données QR ne contiennent pas un itinéraire valide.',
    )
  }
  return data as DayItinerary[]
}
