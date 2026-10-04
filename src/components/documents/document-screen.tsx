'use client'

import { MobileScreen } from '@/components/mobile/mobile-screen'
import type { ScreenProps } from '@/components/app/screen-props'

/** Aperçu d'un document. (ébauche, remplacée par l'implémentation) */
export function DocumentScreen({ onClose }: ScreenProps<'document'>) {
  return (
    <MobileScreen onBack={onClose} title="Aperçu d'un document.">
      <p className="text-muted-foreground text-sm">À venir.</p>
    </MobileScreen>
  )
}
