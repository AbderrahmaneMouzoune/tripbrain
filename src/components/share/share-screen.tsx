'use client'

import { MobileScreen } from '@/components/mobile/mobile-screen'
import type { ScreenProps } from '@/components/app/screen-props'

/** Partager l'itinéraire. (ébauche, remplacée par l'implémentation) */
export function ShareScreen({ onClose }: ScreenProps<'share'>) {
  return (
    <MobileScreen onBack={onClose} title="Partager l'itinéraire.">
      <p className="text-muted-foreground text-sm">À venir.</p>
    </MobileScreen>
  )
}
