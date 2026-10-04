'use client'

import type { ScreenProps } from '@/components/app/screen-props'
import { useAppNav } from '@/components/app/navigation'
import { ReceiveFlow } from '@/components/receive/receive-flow'

/**
 * Recevoir un partage alors qu'un voyage est déjà ouvert (menu « Voyage ») :
 * code à saisir ou QR code à scanner selon `screen.method`, puis l'aperçu avec
 * le choix d'ajouter ou de remplacer.
 */
export function ReceiveScreen({ screen, onClose }: ScreenProps<'receive'>) {
  const { replace } = useAppNav()
  return (
    <ReceiveFlow
      start={{ method: screen.method ?? 'code' }}
      presentation="screen"
      onExit={onClose}
      // Pas de retour vers la saisie une fois le voyage enregistré.
      onSaved={() => replace({ kind: 'trip-ready' })}
    />
  )
}
