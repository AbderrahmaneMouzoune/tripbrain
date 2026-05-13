// Use @msgpack/msgpack for encoding and fflate for deflate compression
// Flow: data → msgpack encode → deflate compress → base64url
// If base64url length <= 2000: return as inline tripbrain://v1/<data> URI
// Else: try to upload to /api/upload, if fails throw error with message

import { encode } from '@msgpack/msgpack'
import { deflateSync } from 'fflate'
import type { DayItinerary } from '@/lib/itinerary-data'

const QR_INLINE_LIMIT = 2000

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

export async function compressItinerary(itinerary: DayItinerary[]): Promise<string> {
  const packed = encode(itinerary)
  const compressed = deflateSync(packed, { level: 9 })
  return toBase64Url(compressed)
}

export async function exportItineraryQR(itinerary: DayItinerary[]): Promise<string> {
  const compressed = await compressItinerary(itinerary)

  if (compressed.length <= QR_INLINE_LIMIT) {
    // Inline mode: embed data directly in QR
    return `tripbrain://v1/${compressed}`
  }

  // Upload mode: too large for inline QR
  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: compressed }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Erreur inconnue' }))
    throw new Error(err.error || 'Téléversement échoué')
  }

  const result = await response.json()
  return result.url
}
