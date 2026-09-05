import { createPwaIconImageResponse } from '@/lib/pwa-icon-image-response'

const size = 180
export const runtime = 'edge'

export function GET() {
  return createPwaIconImageResponse(size, 0.72)
}
