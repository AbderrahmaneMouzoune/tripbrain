'use client'

import { MobileScreen } from '@/components/mobile/mobile-screen'
import type { ScreenProps } from '@/components/app/screen-props'

/** Roadbook complet d'une journée. (ébauche, remplacée par l'implémentation) */
export function DayScreen({ onClose }: ScreenProps<'day'>) {
  return (
    <MobileScreen onBack={onClose} title="Roadbook complet d'une journée.">
      <p className="text-muted-foreground text-sm">À venir.</p>
    </MobileScreen>
  )
}
