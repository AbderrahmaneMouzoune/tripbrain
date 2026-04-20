import { ImageResponse } from 'next/og'
import { AppIconImage } from '@/lib/app-icon-image'

export const runtime = 'edge'

export function GET() {
  return new ImageResponse(<AppIconImage size={192} />, {
    width: 192,
    height: 192,
  })
}
