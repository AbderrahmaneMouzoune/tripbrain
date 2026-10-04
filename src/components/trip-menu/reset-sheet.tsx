'use client'

import { MobileScreen } from '@/components/mobile/mobile-screen'
import type { ScreenProps } from '@/components/app/screen-props'

/** Réinitialiser. (ébauche, remplacée par l'implémentation) */
export function ResetSheet({ onClose }: ScreenProps<'reset'>) {
  return (
    <MobileScreen onBack={onClose} title="Réinitialiser.">
      <p className="text-muted-foreground text-sm">À venir.</p>
    </MobileScreen>
  )
}
