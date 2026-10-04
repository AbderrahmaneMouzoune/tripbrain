'use client'

import { MobileScreen } from '@/components/mobile/mobile-screen'
import type { ScreenProps } from '@/components/app/screen-props'

/** Disponible hors ligne. (ébauche, remplacée par l'implémentation) */
export function OfflineScreen({ onClose }: ScreenProps<'offline'>) {
  return (
    <MobileScreen onBack={onClose} title="Disponible hors ligne.">
      <p className="text-muted-foreground text-sm">À venir.</p>
    </MobileScreen>
  )
}
