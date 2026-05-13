// Pipeline d'export : données → msgpack → deflate → base64url
// Si base64url ≤ QR_INLINE_LIMIT : URL inline compatible PWA (origin/?import=<données>)
// Sinon : upload via @better-upload/client vers R2 et retour de l'URL publique

import { encode } from '@msgpack/msgpack'
import { deflateSync } from 'fflate'
import { uploadFile } from '@better-upload/client'
import type { DayItinerary } from '@/lib/itinerary-data'

export const QR_INLINE_LIMIT = 2000

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export async function compressItinerary(
  itinerary: DayItinerary[],
): Promise<string> {
  const packed = encode(itinerary)
  const compressed = deflateSync(packed, { level: 9 })
  return toBase64Url(compressed)
}

/**
 * Retourne l'URL inline compatible PWA pour un itinéraire compressé.
 * Format : <origin>/?import=<compressed> — utilisable directement dans un QR code.
 */
export function getInlineQrUrl(compressed: string): string {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/?import=${compressed}`
}

/**
 * Uploade l'itinéraire vers R2 via better-upload et retourne l'URL publique.
 * L'URL est valide tant que le fichier est présent dans le bucket.
 */
export async function uploadItinerary(
  itinerary: DayItinerary[],
): Promise<string> {
  const json = JSON.stringify(itinerary)
  const blob = new Blob([json], { type: 'application/json' })
  const file = new File([blob], 'itinerary.json', {
    type: 'application/json',
  })

  const result = await uploadFile({ route: 'json', file })

  const url = result.metadata.url
  if (typeof url !== 'string') {
    throw new Error('URL de partage invalide')
  }
  return url
}

/**
 * Exporte l'itinéraire en valeur QR code :
 * - inline si les données compressées tiennent sous QR_INLINE_LIMIT chars
 * - sinon, upload vers R2 et retour de l'URL publique
 */
export async function exportItineraryQR(
  itinerary: DayItinerary[],
): Promise<string> {
  const compressed = await compressItinerary(itinerary)

  if (compressed.length <= QR_INLINE_LIMIT) {
    return getInlineQrUrl(compressed)
  }

  return uploadItinerary(itinerary)
}
