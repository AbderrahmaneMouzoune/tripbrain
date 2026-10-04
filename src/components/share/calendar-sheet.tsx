'use client'

import { MobileScreen } from '@/components/mobile/mobile-screen'
import type { ScreenProps } from '@/components/app/screen-props'

/** Ajouter au calendrier. (ébauche, remplacée par l'implémentation) */
export function CalendarSheet({ onClose }: ScreenProps<'calendar'>) {
  return (
    <MobileScreen onBack={onClose} title="Ajouter au calendrier.">
      <p className="text-muted-foreground text-sm">À venir.</p>
    </MobileScreen>
  )
}
