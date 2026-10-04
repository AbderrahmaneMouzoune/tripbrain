'use client'

import { MobileScreen } from '@/components/mobile/mobile-screen'
import type { ScreenProps } from '@/components/app/screen-props'

/** Import d'un fichier JSON, Excel ou CSV. (ébauche, remplacée par l'implémentation) */
export function ImportFileScreen({ onClose }: ScreenProps<'import-file'>) {
  return (
    <MobileScreen onBack={onClose} title="Import d'un fichier JSON, Excel ou CSV.">
      <p className="text-muted-foreground text-sm">À venir.</p>
    </MobileScreen>
  )
}
