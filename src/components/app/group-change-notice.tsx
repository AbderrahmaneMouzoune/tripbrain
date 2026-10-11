'use client'

import { useEffect } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { useAppNav } from '@/components/app/navigation'
import { useTrip } from '@/components/app/trip-provider'

/** Durée d'affichage avant que l'avis ne s'efface de lui-même. */
const VISIBLE_MS = 7_000

/**
 * Avis discret quand un autre voyageur a modifié le voyage consulté : sans
 * lui, le programme changerait sous les yeux sans qu'on sache pourquoi.
 */
export function GroupChangeNotice() {
  const { remoteChange, dismissRemoteChange, activeTripId } = useTrip()
  const { push } = useAppNav()
  const visible = remoteChange && remoteChange.tripId === activeTripId

  useEffect(() => {
    if (!remoteChange) return
    const timer = setTimeout(dismissRemoteChange, VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [remoteChange, dismissRemoteChange])

  if (!visible) return null

  return (
    <div
      role="status"
      className="animate-pop bg-ink text-ink-foreground fixed inset-x-0 top-[calc(env(safe-area-inset-top)+10px)] z-40 mx-auto flex w-[min(100%-24px,420px)] items-center gap-2 rounded-2xl py-2 pr-1.5 pl-3.5 shadow-[0_12px_30px_rgba(14,26,58,0.25)]"
    >
      <RefreshCw className="size-4 shrink-0 opacity-80" aria-hidden />
      <button
        type="button"
        onClick={() => {
          dismissRemoteChange()
          push({ kind: 'group' })
        }}
        className="min-h-9 flex-1 text-left text-sm font-extrabold"
      >
        {remoteChange.author
          ? `${remoteChange.author} a mis le programme à jour`
          : 'Le programme a été mis à jour par le groupe'}
      </button>
      <button
        type="button"
        onClick={dismissRemoteChange}
        aria-label="Masquer"
        className="flex size-9 shrink-0 items-center justify-center rounded-full"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  )
}
