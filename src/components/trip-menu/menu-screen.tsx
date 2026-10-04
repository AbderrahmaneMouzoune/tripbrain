'use client'

import { MobileScreen } from '@/components/mobile/mobile-screen'
import type { ScreenProps } from '@/components/app/screen-props'

/** Menu « Voyage ». (ébauche, remplacée par l'implémentation) */
export function MenuScreen({ onClose }: ScreenProps<'menu'>) {
  return (
    <MobileScreen onBack={onClose} title="Menu « Voyage ».">
      <p className="text-muted-foreground text-sm">À venir.</p>
    </MobileScreen>
  )
}
