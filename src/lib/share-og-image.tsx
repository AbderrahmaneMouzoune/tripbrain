// Aperçu d'un lien de partage, tel qu'il apparaît dans une messagerie.
//
// L'image ne dit rien du contenu partagé : ni ville, ni dates, ni nom de
// fichier, ni code. Le serveur ne déchiffre pas le partage pour fabriquer un
// aperçu — ce qui est déposé chez lui reste opaque. Seule l'annonce change
// selon la nature du lien : un voyage ou des documents.
//
// NOT a React component for the browser — only used server-side by the
// `opengraph-image` routes.

import { ImageResponse } from 'next/og'
import { AppIconImage } from '@/lib/app-icon-image'

export const SHARE_OG_SIZE = { width: 1200, height: 630 }
export const SHARE_OG_CONTENT_TYPE = 'image/png'

interface ShareOpenGraphImageProps {
  title: string
  subtitle: string
  /** Pastille de réassurance, en bas de la carte. */
  badge: string
}

export function shareOpenGraphImage({
  title,
  subtitle,
  badge,
}: ShareOpenGraphImageProps): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: SHARE_OG_SIZE.width,
        height: SHARE_OG_SIZE.height,
        background: '#f3f7fd',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'sans-serif',
      }}
    >
      {/* Taches décoratives, comme sur l'aperçu de l'accueil */}
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

      {/* Grille discrète */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(34,104,199,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(34,104,199,0.04) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 32,
          padding: '0 100px',
          zIndex: 1,
        }}
      >
        {/* Signature de l'application */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <AppIconImage size={64} shadow="0 14px 40px rgba(34,104,199,0.3)" />
          <span
            style={{
              fontSize: 40,
              fontWeight: 900,
              color: '#0f2d60',
              letterSpacing: '-1px',
            }}
          >
            TripBrain
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 20,
          }}
        >
          <div
            style={{
              fontSize: 64,
              fontWeight: 900,
              color: '#0f2d60',
              letterSpacing: '-1.5px',
              lineHeight: 1.1,
              textAlign: 'center',
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 28,
              color: '#4a6fa5',
              fontWeight: 400,
              textAlign: 'center',
              lineHeight: 1.4,
            }}
          >
            {subtitle}
          </div>
        </div>

        {/* Pastille de réassurance */}
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
            {badge}
          </span>
        </div>
      </div>
    </div>,
    { ...SHARE_OG_SIZE },
  )
}
