'use client'

import { useEffect, useRef, useState } from 'react'
import { Copy, Sun, SunDim, X } from 'lucide-react'
import type { ScreenProps } from '@/components/app/screen-props'
import { useTrip } from '@/components/app/trip-provider'
import { MobileScreen } from '@/components/mobile/mobile-screen'
import { Button } from '@/components/ui/button'
import { trackEvent } from '@/lib/analytics/client'
import { findStay } from '@/components/day/day-logic'
import { useCopyToast } from '@/components/day/day-ui'

type WakeLockState = 'pending' | 'active' | 'unavailable'

/**
 * Garde l'écran allumé tant que le mode chauffeur est ouvert, là où le
 * navigateur le permet (API Wake Lock). Le verrou tombe tout seul quand la
 * page passe en arrière-plan : on le reprend au retour, et on le rend à la
 * fermeture.
 */
function useScreenWakeLock(): WakeLockState {
  const [state, setState] = useState<WakeLockState>('pending')
  const sentinel = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    let disposed = false
    const request = async () => {
      if (!('wakeLock' in navigator)) {
        setState('unavailable')
        return
      }
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (disposed) {
          void lock.release()
          return
        }
        sentinel.current = lock
        setState('active')
        lock.addEventListener('release', () => {
          if (!disposed) setState('pending')
        })
      } catch {
        // Refusé (économie d'énergie, page non visible…) : on le dit.
        if (!disposed) setState('unavailable')
      }
    }
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      if (sentinel.current && !sentinel.current.released) return
      void request()
    }
    void request()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibility)
      void sentinel.current?.release()
      sentinel.current = null
    }
  }, [])

  return state
}

/** Adresse de l'hébergement en très grand, à montrer au chauffeur. */
export function DriverScreen({ screen, onClose }: ScreenProps<'driver'>) {
  const { itinerary } = useTrip()
  const stay = findStay(itinerary, screen.dayIndex)
  const wakeLock = useScreenWakeLock()
  const { copyText, toast } = useCopyToast()

  const tracked = useRef(false)
  useEffect(() => {
    if (tracked.current || wakeLock === 'pending') return
    tracked.current = true
    trackEvent('driver_mode_opened', { wake_lock: wakeLock === 'active' })
  }, [wakeLock])

  const accommodation = stay?.accommodation
  if (!accommodation?.address) {
    return (
      <MobileScreen onBack={onClose} backIcon="close" title="Pas d’adresse">
        <p className="text-muted-foreground text-sm">
          L’adresse de l’hébergement n’est pas renseignée.
        </p>
      </MobileScreen>
    )
  }

  return (
    <div className="bg-ink text-ink-foreground flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <p
          role="status"
          className="flex items-center gap-2 px-5 pt-[calc(env(safe-area-inset-top)+20px)] text-[13px] font-extrabold opacity-75"
        >
          {wakeLock === 'unavailable' ? (
            <>
              <SunDim className="size-5 shrink-0" aria-hidden />
              Pensez à monter la luminosité : ce navigateur ne peut pas garder
              l’écran allumé.
            </>
          ) : (
            <>
              <Sun className="size-5 shrink-0" aria-hidden />
              L’écran reste allumé tant que cette page est ouverte.
            </>
          )}
        </p>

        <div className="bg-card text-card-foreground mx-5 mt-5 rounded-[26px] px-5 pt-5 pb-6">
          <p className="text-secondary-strong text-[13px] font-black tracking-[0.08em]">
            ADRESSE
          </p>
          <p className="mt-2 text-[34px] leading-[1.15] font-black break-words">
            {accommodation.address}
          </p>
        </div>

        <div className="mx-5 mt-5">
          <p className="text-[11px] font-black tracking-[0.1em] opacity-75">
            HÉBERGEMENT
          </p>
          <p className="mt-1 text-lg leading-6 font-black">
            {accommodation.name || 'Hébergement'}
          </p>
        </div>

        <span className="min-h-6 flex-1" />

        <div className="flex flex-col gap-2.5 px-5">
          <Button
            variant="outline"
            size="xl"
            className="border-ink-foreground/40 text-ink-foreground hover:bg-ink-foreground/10 w-full border-[1.5px] bg-transparent dark:bg-transparent"
            onClick={() =>
              void copyText(accommodation.address, 'Adresse copiée')
            }
          >
            <Copy />
            Copier l’adresse
          </Button>
          <Button
            size="xl"
            className="bg-card text-card-foreground hover:bg-card/90 w-full"
            onClick={onClose}
          >
            <X />
            Fermer
          </Button>
        </div>
      </div>
      {toast}
    </div>
  )
}
