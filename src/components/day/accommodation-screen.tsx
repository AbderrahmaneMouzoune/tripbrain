'use client'

import { MobileScreen } from '@/components/mobile/mobile-screen'
import type { ScreenProps } from '@/components/app/screen-props'

/** Fiche de l'hébergement. (ébauche, remplacée par l'implémentation) */
export function AccommodationScreen({ onClose }: ScreenProps<'accommodation'>) {
  return (
    <MobileScreen onBack={onClose} title="Fiche de l'hébergement.">
      <p className="text-muted-foreground text-sm">À venir.</p>
    </MobileScreen>
  )
}
