// Pipeline d'export : données → msgpack → deflate → base64url
// Si base64url ≤ QR_INLINE_LIMIT : URL inline compatible PWA (origin/?import=<données>)
// Sinon : upload via @better-upload/client vers R2 et retour de l'URL publique
//
// Pipeline d'import inverse : base64url → inflate → msgpack decode → DayItinerary[]

import { encode, decode } from '@msgpack/msgpack'
import { deflateSync, inflateSync } from 'fflate'
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

/** Inverse de toBase64Url — reconstitue les octets depuis une chaîne base64url. */
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
 * Uploade les données compressées vers R2 via better-upload et retourne l'URL publique.
 * Accepte le même paramètre que getInlineQrUrl — la compression n'est faite qu'une seule fois.
 */
export async function uploadItinerary(compressed: string): Promise<string> {
  const payload = JSON.stringify({ data: compressed })
  const blob = new Blob([payload], { type: 'application/json' })
  const file = new File([blob], 'itinerary.json', {
    type: 'application/json',
  })

  const result = await uploadFile({ route: 'itinerary-export', file })

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
 * La compression n'est effectuée qu'une seule fois dans les deux cas.
 */
export async function exportItineraryQR(
  itinerary: DayItinerary[],
): Promise<string> {
  const compressed = await compressItinerary(itinerary)

  if (compressed.length <= QR_INLINE_LIMIT) {
    return getInlineQrUrl(compressed)
  }

  return uploadItinerary(compressed)
}
