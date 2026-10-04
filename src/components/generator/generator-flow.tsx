'use client'

import { MobileScreen } from '@/components/mobile/mobile-screen'
import type { ScreenProps } from '@/components/app/screen-props'

/** Générateur d'itinéraire dans l'app. (ébauche, remplacée par l'implémentation) */
export function GeneratorScreen({ onClose }: ScreenProps<'generator'>) {
  return (
    <MobileScreen onBack={onClose} title="Générateur d'itinéraire dans l'app.">
      <p className="text-muted-foreground text-sm">À venir.</p>
    </MobileScreen>
  )
}
