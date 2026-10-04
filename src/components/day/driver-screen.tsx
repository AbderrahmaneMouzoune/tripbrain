'use client'

import { MobileScreen } from '@/components/mobile/mobile-screen'
import type { ScreenProps } from '@/components/app/screen-props'

/** Adresse en très grand, à montrer au chauffeur. (ébauche, remplacée par l'implémentation) */
export function DriverScreen({ onClose }: ScreenProps<'driver'>) {
  return (
    <MobileScreen onBack={onClose} title="Adresse en très grand, à montrer au chauffeur.">
      <p className="text-muted-foreground text-sm">À venir.</p>
    </MobileScreen>
  )
}
