'use client'

import { MobileScreen } from '@/components/mobile/mobile-screen'
import type { ScreenProps } from '@/components/app/screen-props'

/** Fiche d'une activité. (ébauche, remplacée par l'implémentation) */
export function ActivityScreen({ onClose }: ScreenProps<'activity'>) {
  return (
    <MobileScreen onBack={onClose} title="Fiche d'une activité.">
      <p className="text-muted-foreground text-sm">À venir.</p>
    </MobileScreen>
  )
}
