'use client'

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type SVGProps,
} from 'react'
import Link from 'next/link'
import {
  BarChart3,
  BedDouble,
  BookOpen,
  ChevronRight,
  CloudDownload,
  Lightbulb,
  Mail,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Star,
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
import {
  NATIVE_PERMISSION_EVENT,
  getNativeApp,
  getNativeNotificationPermission,
  hasNativeCapability,
  isNativeAppOutdated,
  openNativeSettings,
  requestNativeReview,
  type NativeAppInfo,
} from '@/lib/native-app'
import { useIsNativeApp } from '@/hooks/use-native-app'
import {
  useNotificationPermission,
  type NotificationPermissionState,
} from '@/hooks/use-notification-permission'
import { cn } from '@/lib/utils'
import packageInfo from '../../../package.json'
import { useStorageEstimate } from './offline-screen'

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

type PermissionState = NotificationPermissionState

/** Fiches de l'app sur les stores : mise à jour et avis. */
const STORE_URLS = {
  ios: 'https://apps.apple.com/app/id6828478079',
  android: 'https://play.google.com/store/apps/details?id=fr.tripbrain.mobile',
} as const

function storeUrl(platform: string): string | null {
  return platform === 'ios' || platform === 'android'
    ? STORE_URLS[platform]
    : null
}

function platformLabel(platform: string): string {
  if (platform === 'ios') return 'iOS'
  if (platform === 'android') return 'Android'
  return platform
}

const noSubscribe = () => () => {}

/**
 * L'app native qui héberge la page, lue après l'hydratation (`null` au rendu
 * serveur et dans un navigateur) : de quoi afficher sa version et ses gestes.
 */
function useNativeAppInfo(): NativeAppInfo | null {
  return useSyncExternalStore(noSubscribe, getNativeApp, () => null)
}

/**
 * Dans l'app, l'autorisation n'est connue qu'après une première
 * synchronisation des rappels : tant qu'elle ne l'est pas, mieux vaut ne rien
 * afficher qu'un « Autoriser » qui disparaîtrait aussitôt.
 */
function useNativePermissionKnown(native: boolean): boolean {
  const [known, setKnown] = useState(true)
  useEffect(() => {
    if (!native) return
    const read = () => setKnown(getNativeNotificationPermission() !== null)
    read()
    window.addEventListener(NATIVE_PERMISSION_EVENT, read)
    return () => window.removeEventListener(NATIVE_PERMISSION_EVENT, read)
  }, [native])
  return known
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

function RowButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-visible:ring-ring/50 flex min-h-14 w-full items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-[3px]"
    >
      <Icon aria-hidden className="text-muted-foreground size-5 shrink-0" />
      <span className="flex-1 text-[15px] font-extrabold">{label}</span>
      <ChevronRight
        aria-hidden
        className="text-muted-foreground size-[18px] shrink-0"
      />
    </button>
  )
}

/** Réglages de l'appareil : rappels, hors ligne, confidentialité. */
export function SettingsScreen({ onClose }: ScreenProps<'settings'>) {
  const { push } = useAppNav()
  const { preferences, update } = usePreferences()
  const { permission, request } = useNotificationPermission()
  const { isConfigured, consent, decide } = useAnalytics()
  const { stats, state } = useImageCacheStats()
  const { usage } = useStorageEstimate()
  const [tipsReset, setTipsReset] = useState(false)
  const isNative = useIsNativeApp()
  const nativeApp = useNativeAppInfo()
  const permissionKnown = useNativePermissionKnown(nativeApp !== null)
  const nativeStoreUrl = nativeApp ? storeUrl(nativeApp.platform) : null
  const canRate = nativeApp !== null && hasNativeCapability('app/requestReview')
  const nativeOutdated = nativeApp !== null && isNativeAppOutdated()

  // Dans l'app, le message au support dit d'emblée sur quoi tourne TripBrain.
  const contactHref = legalConfig.publisher.email
    ? nativeApp
      ? `mailto:${legalConfig.publisher.email}?${new URLSearchParams({
          subject: 'TripBrain',
          body: `\n\n—\nTripBrain ${packageInfo.version} · app ${nativeApp.appVersion} (${platformLabel(nativeApp.platform)})`,
        })
          .toString()
          .replaceAll('+', '%20')}`
      : `mailto:${legalConfig.publisher.email}`
    : null

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
      {nativeOutdated && nativeStoreUrl && (
        <a
          href={nativeStoreUrl}
          className="pressable bg-primary-soft focus-visible:ring-ring/50 mb-5 flex items-center gap-3 rounded-[20px] px-4 py-3.5 outline-none focus-visible:ring-[3px]"
        >
          <IconBadge
            icon={RefreshCw}
            tone="primary"
            className="size-9 rounded-[10px]"
          />
          <span className="min-w-0 flex-1">
            <span className="text-primary-strong block text-[15px] font-extrabold">
              Une mise à jour de l’app est disponible
            </span>
            <span className="text-primary-strong/80 block text-[13px] leading-snug font-bold">
              Certaines fonctions en ont besoin.
            </span>
          </span>
          <ChevronRight
            aria-hidden
            className="text-primary-strong size-[18px] shrink-0"
          />
        </a>
      )}

      <SectionTitle className="mb-2">Notifications</SectionTitle>
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
      {permissionKnown && (
        <NotificationPermissionNote
          permission={permission}
          anyReminder={anyReminder}
          isNative={isNative}
          canOpenSettings={
            nativeApp !== null && hasNativeCapability('app/openSettings')
          }
          onRequest={request}
        />
      )}

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

      {nativeApp && (
        <>
          <SectionTitle className="mt-6 mb-2">Application</SectionTitle>
          <ul className="bg-card border-border divide-border/70 divide-y rounded-[20px] border px-4">
            {hasNativeCapability('app/openSettings') && (
              <li>
                <RowButton
                  icon={Smartphone}
                  label="Autorisations du téléphone"
                  onClick={openNativeSettings}
                />
              </li>
            )}
            {canRate && (
              <li>
                <RowButton
                  icon={Star}
                  label="Noter TripBrain"
                  onClick={requestNativeReview}
                />
              </li>
            )}
          </ul>
        </>
      )}

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
        {contactHref && (
          <li>
            <RowLink
              href={contactHref}
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
          {nativeApp && (
            <>
              {' · app '}
              <span className="font-mono font-semibold">
                {nativeApp.appVersion}
              </span>{' '}
              ({platformLabel(nativeApp.platform)})
            </>
          )}
        </p>
      </div>
    </MobileScreen>
  )
}

function NotificationPermissionNote({
  permission,
  anyReminder,
  isNative,
  canOpenSettings,
  onRequest,
}: {
  permission: PermissionState
  anyReminder: boolean
  isNative: boolean
  /** Le natif sait ouvrir la page Réglages de l'app. */
  canOpenSettings: boolean
  onRequest: () => void
}) {
  if (!anyReminder) return null
  if (permission === 'granted') {
    return (
      <p className="text-muted-foreground mx-1 mt-2 text-[13px] leading-snug">
        {isNative
          ? 'Le téléphone vous prévient à l’heure dite, même application fermée.'
          : 'Les rappels partent tant que TripBrain est ouvert ou utilisé depuis peu : sans application native, le téléphone ne réveille pas l’app.'}
      </p>
    )
  }
  if (permission === 'unsupported') {
    return (
      <p className="text-muted-foreground mx-1 mt-2 text-[13px] leading-snug">
        {isNative
          ? 'Les rappels ne sont pas disponibles sur cet appareil.'
          : 'Ce navigateur n’affiche pas de notifications. Sur iPhone, ajoutez TripBrain à l’écran d’accueil pour recevoir les rappels.'}
      </p>
    )
  }
  if (permission === 'denied') {
    if (isNative && canOpenSettings) {
      return (
        <div className="bg-destructive-soft mt-2 flex items-center gap-3 rounded-2xl px-4 py-3">
          <p className="text-destructive flex-1 text-[13px] leading-snug font-bold">
            Les notifications sont désactivées pour TripBrain sur ce téléphone.
          </p>
          <Button
            size="lg2"
            variant="outline"
            className="h-11 rounded-xl"
            onClick={openNativeSettings}
          >
            Ouvrir les réglages
          </Button>
        </div>
      )
    }
    return (
      <p className="bg-destructive-soft text-destructive mt-2 rounded-2xl px-4 py-3 text-[13px] leading-snug font-bold">
        {isNative
          ? 'Les notifications sont désactivées pour TripBrain. Réactivez-les dans les réglages du téléphone.'
          : 'Les notifications sont bloquées pour TripBrain. Réactivez-les dans les réglages du navigateur (cadenas à côté de l’adresse) ou du téléphone.'}
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
