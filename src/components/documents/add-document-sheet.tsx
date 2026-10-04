'use client'

import { MobileScreen } from '@/components/mobile/mobile-screen'
import type { ScreenProps } from '@/components/app/screen-props'

/** Ajouter un document. (ébauche, remplacée par l'implémentation) */
export function AddDocumentSheet({ onClose }: ScreenProps<'add-document'>) {
  return (
    <MobileScreen onBack={onClose} title="Ajouter un document.">
      <p className="text-muted-foreground text-sm">À venir.</p>
    </MobileScreen>
  )
}
