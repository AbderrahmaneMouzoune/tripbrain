'use client'

import {
  ArrowLeft,
  CalendarCheck,
  Check,
  Copy,
  ExternalLink,
  Lightbulb,
  Link as LinkIcon,
  Map as MapIcon,
  MapPin,
  Navigation,
  Pencil,
  Star,
  X,
  Clock,
} from 'lucide-react'
import type { ScreenProps } from '@/components/app/screen-props'
import { useTrip } from '@/components/app/trip-provider'
import { useAppNav } from '@/components/app/navigation'
import { MobileScreen } from '@/components/mobile/mobile-screen'
import { Button } from '@/components/ui/button'
import { CachedImage } from '@/components/cached-image'
import type { ActivityStatus } from '@/lib/itinerary-edit'
import { cn } from '@/lib/utils'
import { useDayEditor } from '@/components/day/use-day-editor'
import {
  ACTIVITY_TYPE_LABELS,
  bookingHost,
  directionsUrl,
  formatDuration,
  formatPrice,
  longDate,
} from '@/components/day/day-logic'
import {
  ACTIVITY_ICONS,
  Pill,
  trackDirections,
  useApplePlatform,
} from '@/components/day/day-ui'
import { focusActivityOnMap } from '@/components/map/map-view'

const STATUS_OPTIONS: {
  value: ActivityStatus
  label: string
  icon: typeof Check
}[] = [
  { value: 'planned', label: 'Prévu', icon: Clock },
  { value: 'done', label: 'Fait', icon: Check },
  { value: 'skipped', label: 'Annulé', icon: X },
]

/** Fiche d'une activité : tout ce qu'on sait, et y aller. */
export function ActivityScreen({ screen, onClose }: ScreenProps<'activity'>) {
  const { itinerary } = useTrip()
  const { selectDay, setTab } = useAppNav()
  const apple = useApplePlatform()
  const editor = useDayEditor(screen.dayIndex)
  const day = editor.day
  const index = day?.activities.findIndex((a) => a.id === screen.activityId) ?? -1
  const activity = index >= 0 ? day?.activities[index] : undefined

  if (!day || !activity) {
    return (
      <MobileScreen onBack={onClose} title="Activité introuvable">
        <p className="text-muted-foreground text-sm">
          Cette activité a été supprimée ou déplacée.
        </p>
      </MobileScreen>
    )
  }

  const status = activity.status ?? 'planned'
  const Icon = ACTIVITY_ICONS[activity.type]
  const url = directionsUrl(activity, apple)
  const host = bookingHost(activity.bookingUrl)
  const photo = activity.images?.[0]
  const facts = [
    { label: 'DURÉE', value: formatDuration(activity.duration) },
    { label: 'HORAIRES', value: activity.openAt },
    { label: 'PRIX', value: formatPrice(activity.price, activity.currency) },
  ].filter((fact): fact is { label: string; value: string } =>
    Boolean(fact.value),
  )

  const showOnMap = () => {
    focusActivityOnMap(screen.dayIndex, activity.id)
    selectDay(screen.dayIndex, 'map')
    // Changer d'onglet ferme les écrans empilés : la carte s'ouvre seule.
    setTab('map')
  }

  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col">
        <div className="bg-primary-soft relative h-[206px] shrink-0 overflow-hidden">
          {photo ? (
            <CachedImage
              src={photo}
              alt={activity.name}
              className="h-full w-full object-cover"
              fallbackClassName="h-full w-full"
            />
          ) : (
            <span
              aria-hidden
              className="text-primary/40 flex h-full items-center justify-center"
            >
              <Icon className="size-16" strokeWidth={1.5} />
            </span>
          )}
          <Button
            variant="outline"
            size="icon-round"
            onClick={onClose}
            aria-label={`Retour au jour ${screen.dayIndex + 1}`}
            className="border-border bg-card absolute top-[calc(env(safe-area-inset-top)+12px)] left-4 shadow-none"
          >
            <ArrowLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-round"
            onClick={() => editor.editActivity(activity)}
            aria-label="Modifier l’activité"
            className="border-border bg-card absolute top-[calc(env(safe-area-inset-top)+12px)] right-4 shadow-none"
          >
            <Pencil />
          </Button>
        </div>

        <div className="bg-background relative -mt-[22px] flex flex-1 flex-col rounded-t-[26px] px-5 pt-[18px] pb-[calc(env(safe-area-inset-bottom)+24px)]">
          <p className="text-secondary-strong text-xs leading-4 font-black tracking-[0.08em]">
            {[
              ACTIVITY_TYPE_LABELS[activity.type],
              longDate(day.date),
              `Étape ${index + 1} sur ${day.activities.length}`,
            ]
              .join(' · ')
              .toUpperCase()}
          </p>
          <div className="mt-0.5 flex items-center gap-2.5">
            <h1 className="font-display flex-1 text-[30px] leading-9">
              {activity.name || 'Activité sans nom'}
            </h1>
            {activity.rating !== undefined && (
              <span className="bg-secondary-soft text-secondary-strong flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[15px] font-black">
                <Star className="size-4 fill-current" aria-hidden />
                <span className="sr-only">Note </span>
                {activity.rating}
              </span>
            )}
          </div>

          {activity.tags && activity.tags.length > 0 && (
            <ul aria-label="Étiquettes" className="mt-2 flex flex-wrap gap-1.5">
              {activity.tags.map((tag, position) => (
                <li key={tag}>
                  <Pill tone={position === 0 ? 'accent' : 'primary'}>{tag}</Pill>
                </li>
              ))}
            </ul>
          )}

          {activity.description && (
            <p className="text-muted-foreground mt-2.5 text-[15px] leading-[21px]">
              {activity.description}
            </p>
          )}

          <div
            role="radiogroup"
            aria-label="Statut de l’activité"
            className="bg-muted mt-3.5 flex gap-1 rounded-[14px] p-1"
          >
            {STATUS_OPTIONS.map((option) => {
              const active = option.value === status
              const OptionIcon = option.icon
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => editor.setStatus(activity.id, option.value)}
                  className={cn(
                    'pressable flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[11px] text-sm outline-none',
                    'focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                    active
                      ? 'bg-card text-primary-strong font-black shadow-[0_1px_3px_rgb(14_26_58/0.16)]'
                      : 'text-muted-foreground font-extrabold',
                  )}
                >
                  <OptionIcon className="size-4" aria-hidden />
                  {option.label}
                </button>
              )
            })}
          </div>

          {facts.length > 0 && (
            <dl
              className="mt-3 grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${facts.length}, minmax(0, 1fr))`,
              }}
            >
              {facts.map((fact) => (
                <div
                  key={fact.label}
                  className="bg-card border-border rounded-2xl border px-3 py-2.5"
                >
                  <dt className="text-muted-foreground text-[11px] font-black tracking-[0.06em]">
                    {fact.label}
                  </dt>
                  <dd className="mt-0.5 text-base font-black break-words">
                    {fact.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {(activity.reservationRequired ||
            activity.bookingUrl ||
            activity.address ||
            activity.tips) && (
            <div className="bg-card border-border divide-border/70 mt-2 divide-y rounded-[18px] border">
              {(activity.reservationRequired || activity.bookingUrl) && (
                <div className="flex items-center gap-3 px-3.5 py-3">
                  <span
                    aria-hidden
                    className="bg-secondary-soft text-secondary-strong flex size-9 shrink-0 items-center justify-center rounded-xl"
                  >
                    {activity.reservationRequired ? (
                      <CalendarCheck className="size-[18px]" />
                    ) : (
                      <LinkIcon className="size-[18px]" />
                    )}
                  </span>
                  <span className="flex flex-1 flex-col">
                    <span className="text-secondary-strong text-[15px] font-black">
                      {activity.reservationRequired
                        ? 'Réservation requise'
                        : 'Réservation possible'}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {host
                        ? `Lien de réservation enregistré · ${host}`
                        : 'Aucun lien de réservation enregistré'}
                    </span>
                  </span>
                </div>
              )}
              {activity.address && (
                <div className="flex items-center gap-3 px-3.5 py-3">
                  <span
                    aria-hidden
                    className="bg-primary-soft text-primary flex size-9 shrink-0 items-center justify-center rounded-xl"
                  >
                    <MapPin className="size-[18px]" />
                  </span>
                  <span className="flex-1 text-sm leading-[19px] font-bold">
                    {activity.address}
                  </span>
                </div>
              )}
              {activity.tips && (
                <div className="flex items-start gap-3 px-3.5 py-3">
                  <span
                    aria-hidden
                    className="bg-accent-soft text-accent flex size-9 shrink-0 items-center justify-center rounded-xl"
                  >
                    <Lightbulb className="size-[18px]" />
                  </span>
                  <span className="flex-1 text-sm leading-[19px] font-bold">
                    {activity.tips}
                  </span>
                </div>
              )}
            </div>
          )}

          <span className="min-h-6 flex-1" />

          {(url || activity.bookingUrl) && (
            <div className="flex gap-2.5">
              {url && (
                <Button asChild size="xl" className="flex-1 px-3">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackDirections('activity', 'activity')}
                  >
                    <Navigation />Y aller
                  </a>
                </Button>
              )}
              {activity.bookingUrl && (
                <Button
                  asChild
                  size="xl"
                  variant="outline"
                  className="border-border-strong flex-1 border-[1.5px] px-3"
                >
                  <a
                    href={activity.bookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Réserver
                    <ExternalLink />
                  </a>
                </Button>
              )}
            </div>
          )}
          <div className="mt-1 flex justify-between">
            {activity.address ? (
              <button
                type="button"
                onClick={() =>
                  void editor.copyText(activity.address ?? '', 'Adresse copiée')
                }
                className="text-primary flex min-h-11 items-center gap-1.5 px-2 text-[15px] font-extrabold"
              >
                <Copy className="size-[18px]" aria-hidden />
                Copier l’adresse
              </button>
            ) : (
              <span />
            )}
            {activity.coordinates && itinerary.length > 0 && (
              <button
                type="button"
                onClick={showOnMap}
                className="text-primary flex min-h-11 items-center gap-1.5 px-2 text-[15px] font-extrabold"
              >
                <MapIcon className="size-[18px]" aria-hidden />
                Voir sur la carte
              </button>
            )}
          </div>
        </div>
      </div>
      {editor.sheets}
    </div>
  )
}
