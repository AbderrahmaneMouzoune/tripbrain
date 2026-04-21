import { ImageResponse } from 'next/og'
import { AppIconImage } from '@/lib/app-icon-image'

const PWA_ICON_BACKGROUND = '#f3f7fd'
const PWA_ICON_SHADOW = '0 20px 60px rgba(34,104,199,0.35)'

export function createPwaIconImageResponse(size: number, iconRatio = 0.7) {
  return new ImageResponse(
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: PWA_ICON_BACKGROUND,
      }}
    >
      <AppIconImage size={Math.round(size * iconRatio)} shadow={PWA_ICON_SHADOW} />
    </div>,
    {
      width: size,
      height: size,
    },
  )
}
