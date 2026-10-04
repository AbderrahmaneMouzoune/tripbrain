'use client'

import { useEffect, useState } from 'react'
import type { IncomingShare } from '@/lib/share'
import { parseShareInput } from '@/components/receive/share-input'

/**
 * Un code ou un lien de partage déjà copié (depuis tripbrain.fr, le plus
 * souvent) : on le propose sans rien demander.
 *
 * Le presse-papiers n'est lu que si le navigateur l'a déjà autorisé
 * (`clipboard-read` à `granted`). Jamais de demande d'autorisation au
 * chargement : ce serait une question posée avant que l'app ait rendu le
 * moindre service. Le bouton « Coller » de la saisie du code, lui, lit le
 * presse-papiers au clic.
 */
export function useClipboardShare(): IncomingShare | null {
  const [found, setFound] = useState<IncomingShare | null>(null)

  useEffect(() => {
    let cancelled = false
    async function check() {
      if (
        typeof navigator.permissions?.query !== 'function' ||
        typeof navigator.clipboard?.readText !== 'function'
      ) {
        return
      }
      try {
        const status = await navigator.permissions.query({
          // Nom de permission inconnu de certains navigateurs (Firefox) : la
          // requête échoue alors, et on ne propose rien.
          name: 'clipboard-read' as PermissionName,
        })
        if (status.state !== 'granted') return
        const text = await navigator.clipboard.readText()
        const incoming = parseShareInput(text, window.location.host)
        if (!cancelled && incoming) setFound(incoming)
      } catch {
        // Lecture refusée ou page sans focus : rien à proposer.
      }
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [])

  return found
}
