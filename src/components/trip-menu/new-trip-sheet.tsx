'use client'

import type { ScreenProps } from '@/components/app/screen-props'
import { useAppNav } from '@/components/app/navigation'
import { BottomSheet } from '@/components/mobile/bottom-sheet'
import { IntentionOptions } from '@/components/onboarding/intention-options'

/**
 * « Nouveau voyage » depuis la liste des voyages : les mêmes points de départ
 * qu'à la première ouverture (code, partage reçu, programme existant,
 * générateur), pour qu'un second voyage s'ajoute comme le premier.
 */
export function NewTripSheet({ onClose }: ScreenProps<'new-trip'>) {
  const { replace } = useAppNav()
  return (
    <BottomSheet
      open
      onOpenChange={(next) => !next && onClose()}
      title="Nouveau voyage"
      description="D’où vient ce voyage ?"
    >
      <div className="pt-2 pb-1">
        <IntentionOptions
          onChoose={(choice) => {
            if (choice === 'generator') replace({ kind: 'generator' })
            else if (choice === 'program') replace({ kind: 'import-program' })
            else replace({ kind: 'receive', method: choice })
          }}
        />
      </div>
    </BottomSheet>
  )
}
