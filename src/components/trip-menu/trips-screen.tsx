'use client'

import { MobileScreen } from '@/components/mobile/mobile-screen'
import type { ScreenProps } from '@/components/app/screen-props'

/** Mes voyages. (ébauche, remplacée par l'implémentation) */
export function TripsScreen({ onClose }: ScreenProps<'trips'>) {
  return (
    <MobileScreen onBack={onClose} title="Mes voyages.">
      <p className="text-muted-foreground text-sm">À venir.</p>
    </MobileScreen>
  )
}
