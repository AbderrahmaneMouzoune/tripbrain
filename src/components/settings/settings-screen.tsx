'use client'

import { useEffect, useState, type ComponentType, type SVGProps } from 'react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import {
  BarChart3,
  BedDouble,
  BookOpen,
  ChevronRight,
  CloudDownload,
  Lightbulb,
  Mail,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  Sunrise,
  TrainFront,
} from 'lucide-react'
import type { ScreenProps } from '@/components/app/screen-props'
import { useAppNav } from '@/components/app/navigation'
import { MobileScreen } from '@/components/mobile/mobile-screen'
import { IconBadge, type BadgeTone } from '@/components/mobile/icon-badge'
import { SectionTitle } from '@/components/mobile/section-title'
import { ToggleSwitch } from '@/components/mobile/toggle-switch'
import { AppIcon } from '@/components/app-icon'
import { Button } from '@/components/ui/button'
import { useImageCacheStats } from '@/components/image-cache-provider'
import { useAnalytics } from '@/hooks/use-analytics'
import { usePreferences } from '@/hooks/use-preferences'
import { trackEvent } from '@/lib/analytics/client'
import { formatFileSize } from '@/lib/document-organize'
import { legalConfig } from '@/lib/legal-config'
import type { Preferences } from '@/lib/preferences'
import { REMINDER_TIMES } from '@/lib/reminders'
import { cn } from '@/lib/utils'
import packageInfo from '../../../package.json'
import { useStorageEstimate } from './offline-screen'

type ThemeChoice = 'light' | 'dark' | 'system'

const THEMES: {
  value: ThemeChoice
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}[] = [
  { value: 'light', label: 'Clair', icon: Sun },
  { value: 'dark', label: 'Sombre', icon: Moon },
  { value: 'system', label: 'Auto', icon: Monitor },
]

type NotificationKey = keyof Pick<
  Preferences,
  'notifyTransportEve' | 'notifyMorning' | 'notifyCheckIn'
>

const pad = (value: number) => String(value).padStart(2, '0')

const NOTIFICATIONS: {
  key: NotificationKey
  setting: 'notify_transport_eve' | 'notify_morning' | 'notify_check_in'
  label: string
  /** Heure d'envoi affichée sous le libellé. */
  time?: string
  timeLabel?: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  tone: BadgeTone
}[] = [
  {
    key: 'notifyTransportEve',
    setting: 'notify_transport_eve',
    label: 'La veille de chaque train ou vol',
    timeLabel: 'À',
    time: `${pad(REMINDER_TIMES.transportEve.hour)}:${pad(REMINDER_TIMES.transportEve.minute)}`,
    icon: TrainFront,
    tone: 'primary',
  },
  {
    key: 'notifyMorning',
    setting: 'notify_morning',
    label: 'Le programme du jour',
    timeLabel: 'Chaque matin à',
    time: `${pad(REMINDER_TIMES.morning.hour)}:${pad(REMINDER_TIMES.morning.minute)}`,
    icon: Sunrise,
    tone: 'secondary',
  },
  {
    key: 'notifyCheckIn',
    setting: 'notify_check_in',
    label: 'Rappel de check-in hôtel',
    timeLabel: 'Le jour d’arrivée à',
    time: `${pad(REMINDER_TIMES.checkIn.hour)}:${pad(REMINDER_TIMES.checkIn.minute)}`,
    icon: BedDouble,
    tone: 'accent',
  },
]

type PermissionState = NotificationPermission | 'unsupported'

/** Autorisation des notifications du navigateur, relue à chaque retour sur l'app. */
function useNotificationPermission() {
  const [permission, setPermission] = useState<PermissionState>('default')
  useEffect(() => {
    const read = () =>
      setPermission(
        typeof Notification === 'undefined'
          ? 'unsupported'
          : Notification.permission,
      )
    read()
    document.addEventListener('visibilitychange', read)
    return () => document.removeEventListener('visibilitychange', read)
  }, [])

  const request = async () => {
    if (typeof Notification === 'undefined') return
    const result = await Notification.requestPermission()
    setPermission(result)
    trackEvent('notification_permission_requested', { result })
  }
  return { permission, request }
}

function RowLink({
  href,
  icon,
  label,
  external,
}: {
  href: string
  icon?: ComponentType<SVGProps<SVGSVGElement>>
  label: string
  external?: boolean
}) {
  const Icon = icon
  const className =
    'focus-visible:ring-ring/50 flex min-h-14 items-center gap-3 rounded-xl outline-none focus-visible:ring-[3px]'
  const content = (
    <>
      {Icon && (
        <Icon aria-hidden className="text-muted-foreground size-5 shrink-0" />
      )}
      <span className="flex-1 text-[15px] font-extrabold">{label}</span>
      <ChevronRight
        aria-hidden
        className="text-muted-foreground size-[18px] shrink-0"
      />
    </>
  )
  return external ? (
    <a href={href} className={className}>
      {content}
    </a>
  ) : (
    <Link href={href} className={className}>
      {content}
    </Link>
  )
}

/** Réglages de l'appareil : apparence, rappels, hors ligne, confidentialité. */
export function SettingsScreen({ onClose }: ScreenProps<'settings'>) {
  const { push } = useAppNav()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const { preferences, update } = usePreferences()
  const { permission, request } = useNotificationPermission()
  const { isConfigured, consent, decide } = useAnalytics()
  const { stats, state } = useImageCacheStats()
  const { usage } = useStorageEstimate()
  const [tipsReset, setTipsReset] = useState(false)

  const anyReminder =
    preferences.notifyTransportEve ||
    preferences.notifyMorning ||
    preferences.notifyCheckIn

  const offlineSummary = [
    state === 'complete' || state === 'empty'
      ? 'Complet'
      : state === 'downloading'
        ? 'En cours'
        : 'Partiel',
    stats.total > 0 ? `${stats.cached}/${stats.total} images` : null,
    typeof usage === 'number' ? formatFileSize(usage) : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const offlineComplete = state === 'complete' || state === 'empty'

  return (
    <MobileScreen onBack={onClose} title="Réglages">
      <SectionTitle className="mb-2">Apparence</SectionTitle>
      <div className="bg-card border-border rounded-[20px] border p-3">
        <div
          role="radiogroup"
          aria-label="Thème"
          className="bg-muted grid grid-cols-3 gap-1 rounded-[14px] p-1"
        >
          {THEMES.map(({ value, label, icon: Icon }) => {
            const active = mounted && (theme ?? 'system') === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setTheme(value)
                  trackEvent('preference_changed', {
                    setting: `theme_${value}`,
                    enabled: true,
                  })
                }}
                className={cn(
                  'pressable focus-visible:ring-ring/50 flex h-11 items-center justify-center gap-1.5 rounded-[11px] text-sm outline-none focus-visible:ring-[3px]',
                  active
                    ? 'bg-card text-primary-strong font-black shadow-[0_1px_3px_rgba(14,26,58,0.14)]'
                    : 'text-muted-foreground font-extrabold',
                )}
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </button>
            )
          })}
        </div>
        <p className="text-muted-foreground mx-1 mt-2 text-[13px]">
          Auto suit le réglage de votre téléphone.
        </p>
      </div>

      <SectionTitle className="mt-6 mb-2">Notifications</SectionTitle>
      <ul className="bg-card border-border divide-border/70 divide-y rounded-[20px] border px-4">
        {NOTIFICATIONS.map(
          ({ key, setting, label, time, timeLabel, icon, tone }) => (
            <li key={key} className="flex items-center gap-3 py-2.5">
              <IconBadge
                icon={icon}
                tone={tone}
                className="size-9 rounded-[10px]"
              />
              <span className="min-w-0 flex-1">
                <span
                  id={`notif-${key}`}
                  className="block text-[15px] leading-snug font-extrabold"
                >
                  {label}
                </span>
                {time && (
                  <span className="text-muted-foreground block text-[13px]">
                    {timeLabel}{' '}
                    <span className="text-foreground font-mono font-semibold">
                      {time}
                    </span>
                  </span>
                )}
              </span>
              <ToggleSwitch
                labelledBy={`notif-${key}`}
                checked={preferences[key]}
                onCheckedChange={(checked) => {
                  update({ [key]: checked })
                  trackEvent('preference_changed', {
                    setting,
                    enabled: checked,
                  })
                }}
              />
            </li>
          ),
        )}
      </ul>
      <NotificationPermissionNote
        permission={permission}
        anyReminder={anyReminder}
        onRequest={request}
      />

      <SectionTitle className="mt-6 mb-2">Hors ligne</SectionTitle>
      <button
        type="button"
        onClick={() => push({ kind: 'offline' })}
        className="pressable bg-card border-border focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-[20px] border px-4 py-3.5 text-left outline-none focus-visible:ring-[3px]"
      >
        <IconBadge
          icon={CloudDownload}
          tone="secondary"
          className="size-9 rounded-[10px]"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-extrabold">
            Disponible hors ligne
          </span>
          <span
            className={cn(
              'flex items-center gap-1.5 text-[13px] font-bold',
              offlineComplete ? 'text-success' : 'text-secondary-strong',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'size-2 rounded-full',
                offlineComplete ? 'bg-success' : 'bg-secondary',
              )}
            />
            {offlineSummary}
          </span>
        </span>
        <ChevronRight
          aria-hidden
          className="text-muted-foreground size-[18px] shrink-0"
        />
      </button>

      <SectionTitle className="mt-6 mb-2">Confidentialité</SectionTitle>
      <div className="bg-card border-border divide-border/70 divide-y rounded-[20px] border px-4">
        {/* Sans clé de mesure, il n'y a rien à accepter ni à refuser. */}
        {isConfigured && (
          <div className="flex items-start gap-3 py-3.5">
            <IconBadge
              icon={BarChart3}
              tone="primary"
              className="size-9 rounded-[10px]"
            />
            <span className="min-w-0 flex-1">
              <span
                id="analytics-label"
                className="block text-[15px] leading-snug font-extrabold"
              >
                Mesure d’audience anonyme
              </span>
              <span className="text-muted-foreground mt-0.5 block text-[13px] leading-snug">
                Quels écrans servent et où ça coince. Rien de votre voyage n’est
                envoyé.
              </span>
            </span>
            <ToggleSwitch
              labelledBy="analytics-label"
              checked={consent?.status === 'granted'}
              onCheckedChange={(checked) =>
                decide(checked ? 'granted' : 'denied', 'settings')
              }
              className="-mt-1.5"
            />
          </div>
        )}
        <Link
          href="/politique-de-confidentialite"
          className="focus-visible:ring-ring/50 flex min-h-[52px] items-center gap-3 rounded-xl outline-none focus-visible:ring-[3px]"
        >
          <IconBadge
            icon={ShieldCheck}
            tone="success"
            className="size-9 rounded-[10px]"
          />
          <span className="flex-1 text-[15px] font-extrabold">
            Ce qui reste sur l’appareil
          </span>
          <ChevronRight
            aria-hidden
            className="text-muted-foreground size-[18px] shrink-0"
          />
        </Link>
      </div>

      <SectionTitle className="mt-6 mb-2">Aide</SectionTitle>
      <ul className="bg-card border-border divide-border/70 divide-y rounded-[20px] border px-4">
        <li>
          <RowLink href="/guide" icon={BookOpen} label="Guide d’import" />
        </li>
        <li>
          <button
            type="button"
            onClick={() => {
              update({ tipsSeen: [], tipsDismissed: false })
              setTipsReset(true)
              trackEvent('preference_changed', {
                setting: 'tips_reset',
                enabled: true,
              })
            }}
            className="focus-visible:ring-ring/50 flex min-h-14 w-full items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-[3px]"
          >
            <Lightbulb
              aria-hidden
              className="text-muted-foreground size-5 shrink-0"
            />
            <span className="flex-1 text-[15px] font-extrabold">
              Revoir les astuces
            </span>
            <span
              role="status"
              className="text-muted-foreground text-[13px] font-bold"
            >
              {tipsReset
                ? 'Elles réapparaîtront'
                : preferences.tipsDismissed
                  ? 'Masquées'
                  : preferences.tipsSeen.length > 0
                    ? `${preferences.tipsSeen.length} déjà vue${preferences.tipsSeen.length > 1 ? 's' : ''}`
                    : ''}
            </span>
          </button>
        </li>
        {legalConfig.publisher.email && (
          <li>
            <RowLink
              href={`mailto:${legalConfig.publisher.email}`}
              icon={Mail}
              label="Contacter"
              external
            />
          </li>
        )}
      </ul>

      <SectionTitle className="mt-6 mb-2">Légal</SectionTitle>
      <ul className="bg-card border-border divide-border/70 divide-y rounded-[20px] border px-4">
        <li>
          <RowLink href="/mentions-legales" label="Mentions légales" />
        </li>
        <li>
          <RowLink
            href="/politique-de-confidentialite"
            label="Politique de confidentialité"
          />
        </li>
      </ul>

      <div className="mt-7 flex flex-col items-center gap-2">
        <AppIcon size="sm" />
        <p className="text-muted-foreground text-[13px] font-extrabold">
          TripBrain{' '}
          <span className="font-mono font-semibold">{packageInfo.version}</span>
        </p>
      </div>
    </MobileScreen>
  )
}

function NotificationPermissionNote({
  permission,
  anyReminder,
  onRequest,
}: {
  permission: PermissionState
  anyReminder: boolean
  onRequest: () => void
}) {
  if (!anyReminder) return null
  if (permission === 'granted') {
    return (
      <p className="text-muted-foreground mx-1 mt-2 text-[13px] leading-snug">
        Les rappels partent tant que TripBrain est ouvert ou utilisé depuis peu
        : sans application native, le téléphone ne réveille pas l’app.
      </p>
    )
  }
  if (permission === 'unsupported') {
    return (
      <p className="text-muted-foreground mx-1 mt-2 text-[13px] leading-snug">
        Ce navigateur n’affiche pas de notifications. Sur iPhone, ajoutez
        TripBrain à l’écran d’accueil pour recevoir les rappels.
      </p>
    )
  }
  if (permission === 'denied') {
    return (
      <p className="bg-destructive-soft text-destructive mt-2 rounded-2xl px-4 py-3 text-[13px] leading-snug font-bold">
        Les notifications sont bloquées pour TripBrain. Réactivez-les dans les
        réglages du navigateur (cadenas à côté de l’adresse) ou du téléphone.
      </p>
    )
  }
  return (
    <div className="bg-primary-soft mt-2 flex items-center gap-3 rounded-2xl px-4 py-3">
      <p className="text-primary-strong flex-1 text-[13px] leading-snug font-bold">
        Autorisez les notifications pour recevoir ces rappels.
      </p>
      <Button size="lg2" className="h-11 rounded-xl" onClick={onRequest}>
        Autoriser
      </Button>
    </div>
  )
}
