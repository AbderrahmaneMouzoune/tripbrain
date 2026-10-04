'use client'

import { MobileScreen } from '@/components/mobile/mobile-screen'
import type { ScreenProps } from '@/components/app/screen-props'

/** Voyage enregistré : hors ligne et rappels (ébauche, remplacée par l'implémentation) */
export function TripReadyScreen({ onClose }: ScreenProps<'trip-ready'>) {
  return (
    <MobileScreen onBack={onClose} title="Emportez-le partout">
      <p className="text-muted-foreground text-sm">À venir.</p>
    </MobileScreen>
  )
}
