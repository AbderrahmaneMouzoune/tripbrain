import { createPwaIconImageResponse } from '@/lib/pwa-icon-image-response'

const size = 512
export const runtime = 'edge'

export function GET() {
  return createPwaIconImageResponse(size)
}
