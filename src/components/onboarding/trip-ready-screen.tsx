'use client'

import { useEffect, useState } from 'react'
import { BellRing, Check, FileText, Images, WifiOff } from 'lucide-react'
import { MobileScreen } from '@/components/mobile/mobile-screen'
import { IconBadge } from '@/components/mobile/icon-badge'
import { Button } from '@/components/ui/button'
import type { ScreenProps } from '@/components/app/screen-props'
import { useAppNav } from '@/components/app/navigation'
import { useTrip } from '@/components/app/trip-provider'
import { usePreferences } from '@/hooks/use-preferences'
import { ToggleSwitch } from '@/components/mobile/toggle-switch'
import { useOfflineImageProgress } from '@/components/onboarding/use-offline-progress'

type NotificationState = 'unsupported' | NotificationPermission

function readNotificationState(): NotificationState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported'
  }
  return Notification.permission
}

/** Suit l'état du réseau : une photo ne se télécharge pas hors connexion. */
function useOnline(): boolean {
  const [online, setOnline] = useState(true)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

/**
 * Fin d'arrivée d'un voyage (import, partage, générateur) : ce qui est déjà
 * disponible hors ligne, et les rappels à activer avant d'ouvrir le voyage.
 */
export function TripReadyScreen(_props: ScreenProps<'trip-ready'>) {
  const { itinerary } = useTrip()
  const { setTab } = useAppNav()
  const { preferences, update } = usePreferences()
  const photos = useOfflineImageProgress(itinerary)
  const online = useOnline()
  const [notification, setNotification] =
    useState<NotificationState>('unsupported')
  const [opening, setOpening] = useState(false)

  useEffect(() => {
    setNotification(readNotificationState())
  }, [])

  const remindersOn =
    preferences.notifyTransportEve || preferences.notifyMorning
  const willAsk = remindersOn && notification === 'default'

  const percent =
    photos.total > 0 ? Math.round((photos.cached / photos.total) * 100) : 100

  const openTrip = async () => {
    setOpening(true)
    // La demande d'autorisation n'a lieu qu'ici, en réponse au geste, et
    // seulement si un rappel est voulu : jamais au chargement.
    if (willAsk) {
      try {
        setNotification(await Notification.requestPermission())
      } catch {
        // Ancien Safari (rappel par callback) ou refus du navigateur : on passe.
      }
    }
    // `setTab` referme aussi tous les écrans empilés : appeler `closeAll`
    // en plus reculerait deux fois dans l'historique.
    setTab('today')
  }

  return (
    <MobileScreen
      progress={{ step: 4, total: 4 }}
      footer={
        <>
          <Button
            size="xl"
            className="w-full"
            onClick={openTrip}
            disabled={opening}
          >
            Ouvrir mon voyage
          </Button>
          {willAsk && (
            <p className="text-muted-foreground text-center text-xs leading-relaxed">
              Votre téléphone vous demandera ensuite d’autoriser les
              notifications.
            </p>
          )}
          {remindersOn && notification === 'denied' && (
            <p className="text-muted-foreground text-center text-xs leading-relaxed">
              Les notifications sont bloquées pour ce site : autorisez-les dans
              les réglages du navigateur pour recevoir les rappels.
            </p>
          )}
        </>
      }
    >
      <header className="mb-5 flex flex-col items-start gap-2">
        <span className="bg-success-soft text-success animate-pop flex items-center gap-1.5 rounded-full py-1.5 pr-2.5 pl-2 text-xs font-extrabold">
          <Check className="size-4" strokeWidth={3} aria-hidden />
          Voyage enregistré
        </span>
        <h1 className="font-display text-[28px] leading-[1.15]">
          Emportez-le partout
        </h1>
        <p className="text-muted-foreground text-[15px] leading-relaxed">
          {photos.total > 0
            ? 'On télécharge le nécessaire pour que tout reste lisible en avion ou sans données mobiles.'
            : 'Tout est déjà sur ce téléphone : le voyage reste lisible en avion ou sans données mobiles.'}
        </p>
      </header>

      <section
        aria-label="Disponible hors ligne"
        className="bg-card border-border divide-border/70 flex flex-col divide-y rounded-[20px] border px-4 py-1.5"
      >
        <div className="flex items-center gap-3 py-3">
          <IconBadge icon={FileText} tone="success" size="sm" />
          <span className="flex-1 text-[15px] font-extrabold">
            Programme et adresses
          </span>
          <span className="text-success text-[13px] font-bold">Prêt</span>
        </div>

        {photos.total > 0 && (
          <div className="flex flex-col gap-2 py-3">
            <div className="flex items-center gap-3">
              <IconBadge
                icon={photos.ready ? Check : online ? Images : WifiOff}
                tone={photos.ready ? 'success' : online ? 'primary' : 'muted'}
                size="sm"
              />
              <span className="flex-1 text-[15px] font-extrabold">
                {photos.total > 1
                  ? `Les ${photos.total} photos du voyage`
                  : 'La photo du voyage'}
              </span>
              <span
                className={
                  photos.ready
                    ? 'text-success text-[13px] font-bold'
                    : online
                      ? 'text-primary-strong text-[13px] font-bold tabular-nums'
                      : 'text-muted-foreground text-[13px] font-bold'
                }
              >
                {photos.ready === null
                  ? '…'
                  : photos.ready
                    ? 'Prêt'
                    : !online
                      ? 'En attente du réseau'
                      : photos.waitingForWifi
                        ? 'En attente du Wi-Fi'
                        : `${percent} %`}
              </span>
            </div>
            {!photos.ready && photos.ready !== null && (
              <div
                role="progressbar"
                aria-label="Téléchargement des photos"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                className="bg-primary-soft ml-10 h-1.5 overflow-hidden rounded-full"
              >
                <div
                  className="bg-primary h-full rounded-full transition-[width] duration-700"
                  style={{ width: `${percent}%` }}
                />
              </div>
            )}
          </div>
        )}
      </section>

      <section
        aria-labelledby="trip-ready-reminders"
        className="bg-card border-border mt-3.5 flex flex-col gap-3 rounded-[20px] border p-4"
      >
        <div className="flex items-center gap-3">
          <IconBadge icon={BellRing} tone="secondary" />
          <div className="flex-1">
            <h2 id="trip-ready-reminders" className="text-base font-extrabold">
              Des rappels au bon moment
            </h2>
            <p className="text-muted-foreground text-[13px]">
              Jamais de publicité. Modifiable à tout moment.
            </p>
          </div>
        </div>
        <ReminderRow
          label="La veille de chaque train ou vol"
          checked={preferences.notifyTransportEve}
          onChange={(value) => update({ notifyTransportEve: value })}
        />
        <ReminderRow
          label="Le programme du jour, chaque matin"
          checked={preferences.notifyMorning}
          onChange={(value) => update({ notifyMorning: value })}
        />
        {notification === 'unsupported' && remindersOn && (
          <p className="text-muted-foreground text-xs leading-relaxed">
            Ce navigateur n’affiche pas de notifications : installez l’app sur
            l’écran d’accueil pour recevoir les rappels.
          </p>
        )}
      </section>
    </MobileScreen>
  )
}

function ReminderRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex min-h-11 items-center gap-3">
      <span className="flex-1 text-sm font-bold">{label}</span>
      <ToggleSwitch label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
