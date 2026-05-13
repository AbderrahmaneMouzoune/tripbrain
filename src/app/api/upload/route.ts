// Stub API route for large-itinerary uploads.
// Required env vars: UPLOAD_API_KEY, UPLOAD_BUCKET_URL
// Status codes: 503 = not configured (env vars missing), 501 = configured but not yet implemented.
// Configure these env vars to enable actual R2/S3 storage for large itineraries.

import { NextResponse } from 'next/server'

export async function POST(_request: Request) {
  // Check if upload is configured
  if (!process.env.UPLOAD_API_KEY || !process.env.UPLOAD_BUCKET_URL) {
    return NextResponse.json(
      {
        error:
          "L'itinéraire est trop volumineux pour un QR code inline et l'upload n'est pas configuré. " +
          'Configurez UPLOAD_API_KEY et UPLOAD_BUCKET_URL pour activer cette fonctionnalité.',
      },
      { status: 503 },
    )
  }

  // TODO: implement actual R2/S3 upload when env vars are set
  return NextResponse.json(
    { error: 'Upload non implémenté côté serveur.' },
    { status: 501 },
  )
}
