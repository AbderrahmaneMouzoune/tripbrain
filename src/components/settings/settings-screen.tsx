'use client'

import { MobileScreen } from '@/components/mobile/mobile-screen'
import type { ScreenProps } from '@/components/app/screen-props'

/** Réglages. (ébauche, remplacée par l'implémentation) */
export function SettingsScreen({ onClose }: ScreenProps<'settings'>) {
  return (
    <MobileScreen onBack={onClose} title="Réglages.">
      <p className="text-muted-foreground text-sm">À venir.</p>
    </MobileScreen>
  )
}
