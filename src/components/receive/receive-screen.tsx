'use client'

import { MobileScreen } from '@/components/mobile/mobile-screen'
import type { ScreenProps } from '@/components/app/screen-props'

/** Recevoir un partage : code à saisir ou QR code à scanner. (ébauche, remplacée par l'implémentation) */
export function ReceiveScreen({ onClose }: ScreenProps<'receive'>) {
  return (
    <MobileScreen onBack={onClose} title="Recevoir un partage : code à saisir ou QR code à scanner.">
      <p className="text-muted-foreground text-sm">À venir.</p>
    </MobileScreen>
  )
}
