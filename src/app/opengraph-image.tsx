import { ImageResponse } from 'next/og'
import { AppIconImage } from '@/lib/app-icon-image'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: 1200,
        height: 630,
        background: '#f3f7fd',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'sans-serif',
      }}
    >
      {/* Background decorative blobs */}
      <div
        style={{
          position: 'absolute',
          top: -120,
          right: -120,
          width: 480,
          height: 480,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(34,104,199,0.18) 0%, rgba(34,104,199,0) 70%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: -100,
          left: -80,
          width: 360,
          height: 360,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(224,120,32,0.15) 0%, rgba(224,120,32,0) 70%)',
        }}
      />

      {/* Subtle grid lines */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(34,104,199,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(34,104,199,0.04) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Card */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 36,
          zIndex: 1,
        }}
      >
        {/* App icon */}
        <AppIconImage size={100} shadow="0 20px 60px rgba(34,104,199,0.35)" />

        {/* Title */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div
            style={{
              fontSize: 80,
              fontWeight: 900,
              color: '#0f2d60',
              letterSpacing: '-2px',
              lineHeight: 1,
            }}
          >
            TripBrain
          </div>
          <div
            style={{
              fontSize: 26,
              color: '#4a6fa5',
              fontWeight: 400,
              letterSpacing: '0.5px',
            }}
          >
            Planifiez et consultez votre itinéraire de voyage
          </div>
        </div>

        {/* Pill badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(34,104,199,0.08)',
            border: '1.5px solid rgba(34,104,199,0.2)',
            borderRadius: 999,
            padding: '10px 24px',
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#e07820',
            }}
          />
          <span
            style={{
              fontSize: 18,
              color: '#2268c7',
              fontWeight: 600,
              letterSpacing: '0.3px',
            }}
          >
            Votre compagnon de voyage intelligent
          </span>
        </div>
      </div>
    </div>,
    { ...size },
  )
}
