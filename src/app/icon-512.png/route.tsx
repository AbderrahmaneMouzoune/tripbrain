import { ImageResponse } from 'next/og'
import { AppIconImage } from '@/lib/app-icon-image'

export const runtime = 'edge'

export function GET() {
  return new ImageResponse(<AppIconImage size={512} />, {
    width: 512,
    height: 512,
  })
}
