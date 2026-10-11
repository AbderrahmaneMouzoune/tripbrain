'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTrip } from '@/components/app/trip-provider'
import { useAppNav } from '@/components/app/navigation'
import { readIncomingShare, type IncomingShare } from '@/lib/share'
import {
  ReceiveFlow,
  type ReceiveStart,
} from '@/components/receive/receive-flow'

/**
 * Partage arrivé par l'URL : `?import=` embarque l'itinéraire complet (QR code
 * autonome), `?code=` pointe vers un partage déposé sur le serveur (lien
 * `/s/<code>`), et `#import=` ramène celui qu'on vient de générer sur le site.
 *
 * L'URL est nettoyée aussitôt pour qu'un rechargement ne repropose pas le même
 * import, et le drapeau garantit qu'on ne le traite qu'une fois par visite. La
 * lecture se fait sur `window.location` : `useSearchParams` ne voit pas le
 * fragment ; il reste suivi pour qu'un changement de query soit relu.
 *
 * L'aperçu s'ouvre en plein écran au-dessus de tout, avec ou sans voyage déjà
 * enregistré.
 */
export function IncomingShareGate() {
  const { isLoading } = useTrip()
  const { push } = useAppNav()
  const searchParams = useSearchParams()
  const [incoming, setIncoming] = useState<IncomingShare | null>(null)
  const handledRef = useRef(false)

  useEffect(() => {
    if (isLoading || handledRef.current) return
    const found = readIncomingShare(
      window.location.search,
      window.location.hash,
    )
    if (!found) return
    handledRef.current = true
    setIncoming(found)
    // L'état d'historique porte la profondeur des écrans empilés : on le garde.
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname,
    )
  }, [isLoading, searchParams])

  // La page dessous ne défile pas pendant l'aperçu.
  useEffect(() => {
    if (!incoming) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [incoming])

  const start = useMemo<ReceiveStart | null>(
    () =>
      incoming
        ? {
            incoming,
            via: incoming.origin === 'generator' ? 'generator' : 'link',
          }
        : null,
    [incoming],
  )

  if (!start) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={
        incoming?.origin === 'generator'
          ? 'Récupérer votre itinéraire'
          : 'Importer un partage'
      }
      className="bg-background animate-screen fixed inset-0 z-50 overflow-y-auto overscroll-contain"
    >
      <ReceiveFlow
        start={start}
        presentation="overlay"
        onExit={() => setIncoming(null)}
        onSaved={() => {
          setIncoming(null)
          push({ kind: 'trip-ready' })
        }}
      />
    </div>
  )
}
