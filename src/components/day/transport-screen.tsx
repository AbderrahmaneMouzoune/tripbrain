'use client'

import { MobileScreen } from '@/components/mobile/mobile-screen'
import type { ScreenProps } from '@/components/app/screen-props'

/** Billet de transport de la journée. (ébauche, remplacée par l'implémentation) */
export function TransportScreen({ onClose }: ScreenProps<'transport'>) {
  return (
    <MobileScreen onBack={onClose} title="Billet de transport de la journée.">
      <p className="text-muted-foreground text-sm">À venir.</p>
    </MobileScreen>
  )
}
