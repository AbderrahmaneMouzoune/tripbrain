'use client'

import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Bell,
  CalendarPlus,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Navigation,
  Pencil,
  Plus,
  Ticket,
} from 'lucide-react'
import type { ScreenProps } from '@/components/app/screen-props'
import { useTrip } from '@/components/app/trip-provider'
import { useAppNav } from '@/components/app/navigation'
import { MobileScreen } from '@/components/mobile/mobile-screen'
import { Button } from '@/components/ui/button'
import { useDocuments } from '@/hooks/use-documents'
import { usePreferences } from '@/hooks/use-preferences'
import { setTransport } from '@/lib/itinerary-edit'
import { cn } from '@/lib/utils'
import { useDayEditor } from '@/components/day/use-day-editor'
import {
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_STEPS,
  directionsUrl,
  formatDuration,
  formatPrice,
  longDate,
  splitPlace,
  transportExtras,
  transportNumber,
  TRANSPORT_TYPE_LABELS,
} from '@/components/day/day-logic'
import {
  TRANSPORT_ICONS,
  trackDirections,
  useApplePlatform,
} from '@/components/day/day-ui'

const PLACE_WORDS = {
  plane: 'l’aéroport',
  train: 'la gare',
  bus: 'l’arrêt',
  car: 'l’arrivée',
} as const

/** Billet du jour, façon carte d'embarquement. */
export function TransportScreen({ screen, onClose }: ScreenProps<'transport'>) {
  const { activeTrip } = useTrip()
  const { push } = useAppNav()
  const apple = useApplePlatform()
  const { files } = useDocuments()
  const { preferences } = usePreferences()
  const editor = useDayEditor(screen.dayIndex)
  const day = editor.day
  const transport = day?.transport

  const [notificationsGranted, setNotificationsGranted] = useState(false)
  useEffect(() => {
    setNotificationsGranted(
      'Notification' in window && Notification.permission === 'granted',
    )
  }, [])

  if (!day || !transport) {
    return (
      <MobileScreen onBack={onClose} title="Trajet introuvable">
        <p className="text-muted-foreground text-sm">
          Cette journée n’a plus de trajet.
        </p>
      </MobileScreen>
    )
  }

  const Icon = TRANSPORT_ICONS[transport.type]
  const from = splitPlace(transport.from)
  const to = splitPlace(transport.to)
  const number = transportNumber(transport)
  const extras = [
    ...transportExtras(transport),
    formatPrice(transport.price, transport.currency),
  ].filter(Boolean)
  const isCar = transport.type === 'car'
  const directions = directionsUrl(
    {
      address: isCar
        ? transport.to
        : (transport.departureAddress ?? transport.from),
    },
    apple,
  )
  const ticket = files.find(
    (file) =>
      (!file.tripId || !activeTrip || file.tripId === activeTrip.id) &&
      file.dayId === day.id &&
      file.linkedTo === 'transport',
  )
  const status = transport.status ?? 'planned'
  const statusIndex = BOOKING_STATUS_STEPS.indexOf(status)

  const edit = () => editor.editTransport(transport)
  const toComplete = (label: string) => (
    <button
      type="button"
      onClick={edit}
      aria-label={`${label} : à compléter`}
      className="text-secondary-strong min-h-8 text-[13px] font-extrabold underline-offset-2 hover:underline"
    >
      À compléter
    </button>
  )

  const title = to.name
    ? `${TRANSPORT_TYPE_LABELS[transport.type]} vers ${to.name}`
    : TRANSPORT_TYPE_LABELS[transport.type]

  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <header className="px-5 pt-[calc(env(safe-area-inset-top)+12px)]">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-round"
              onClick={onClose}
              aria-label="Retour"
              className="border-border bg-card shadow-none"
            >
              <ArrowLeft />
            </Button>
            <span className="flex-1" />
            <Button
              variant="outline"
              size="icon-round"
              onClick={edit}
              aria-label="Modifier le transport"
              className="border-border bg-card shadow-none"
            >
              <Pencil />
            </Button>
          </div>
          <p className="text-secondary-strong mt-2.5 text-xs leading-4 font-black tracking-[0.08em]">
            {`${longDate(day.date)} · Jour ${screen.dayIndex + 1}`.toUpperCase()}
          </p>
          <h1 className="font-display mt-0.5 text-[28px] leading-[34px]">
            {title}
          </h1>
        </header>

        <article
          aria-label="Carte d’embarquement"
          className="mx-5 mt-3.5 drop-shadow-[0_6px_16px_rgb(14_26_58/0.12)]"
        >
          <div className="bg-ink text-ink-foreground rounded-t-[22px] px-[18px] pt-4 pb-3.5">
            <div className="flex items-center gap-2">
              <Icon className="size-5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-extrabold opacity-75">
                {transport.provider ?? TRANSPORT_TYPE_LABELS[transport.type]}
              </span>
              {number && (
                <span className="bg-ink-foreground/10 rounded-lg px-2 py-0.5 font-mono text-[13px] font-semibold tracking-[0.04em]">
                  {number}
                </span>
              )}
            </div>
            <div className="mt-3.5 flex items-end gap-2.5">
              <div className="flex min-w-0 flex-col">
                <span
                  className={cn(
                    'font-display truncate',
                    from.code
                      ? 'text-[42px] leading-[44px]'
                      : 'text-2xl leading-8',
                  )}
                >
                  {from.code ?? (from.name || '—')}
                </span>
                {from.code && (
                  <span className="truncate text-[13px] font-bold opacity-75">
                    {from.name}
                  </span>
                )}
              </div>
              <div className="flex min-w-12 flex-1 flex-col items-center gap-1 pb-6">
                {transport.duration && (
                  <span className="text-xs font-extrabold opacity-75">
                    {formatDuration(transport.duration)}
                  </span>
                )}
                <span className="text-secondary flex w-full items-center gap-1">
                  <span className="border-ink-foreground/40 h-0 flex-1 border-t-2 border-dashed" />
                  <Icon className="size-4" aria-hidden />
                  <span className="border-ink-foreground/40 h-0 flex-1 border-t-2 border-dashed" />
                </span>
              </div>
              <div className="flex min-w-0 flex-col items-end text-right">
                <span
                  className={cn(
                    'font-display truncate',
                    to.code
                      ? 'text-[42px] leading-[44px]'
                      : 'text-2xl leading-8',
                  )}
                >
                  {to.code ?? (to.name || '—')}
                </span>
                {to.code && (
                  <span className="truncate text-[13px] font-bold opacity-75">
                    {to.name}
                  </span>
                )}
              </div>
            </div>
            {(transport.departureTime || transport.arrivalTime) && (
              <div className="mt-2.5 flex items-baseline justify-between">
                <span className="text-[26px] font-black">
                  {transport.departureTime ?? '—'}
                </span>
                <span className="text-xs font-bold opacity-75">
                  heures locales
                </span>
                <span className="text-[26px] font-black">
                  {transport.arrivalTime ?? '—'}
                </span>
              </div>
            )}
            {extras.length > 0 && (
              <p className="mt-1 text-xs font-bold opacity-75">
                {extras.join(' · ')}
              </p>
            )}
          </div>
          <div
            aria-hidden
            className="bg-card relative flex h-5 items-center px-4"
          >
            <span className="bg-background absolute top-0 -left-2.5 size-5 rounded-full" />
            <span className="border-border h-0 flex-1 border-t-2 border-dashed" />
            <span className="bg-background absolute top-0 -right-2.5 size-5 rounded-full" />
          </div>
          <div className="bg-card rounded-b-[22px] px-[18px] pt-1 pb-4">
            <dl className="grid grid-cols-3 gap-2">
              {(
                [
                  ['TERMINAL', transport.terminal, 'Terminal'],
                  [
                    transport.type === 'train' ? 'QUAI' : 'PORTE',
                    transport.gate,
                    transport.type === 'train' ? 'Quai' : 'Porte',
                  ],
                  ['SIÈGE', transport.seat, 'Siège'],
                ] as const
              ).map(([label, value, name]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-muted-foreground text-[11px] font-black tracking-[0.08em]">
                    {label}
                  </dt>
                  <dd className="mt-0.5">
                    {value ? (
                      <span className="block truncate text-xl font-black">
                        {value}
                      </span>
                    ) : (
                      toComplete(name)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="border-border/70 mt-3 flex gap-2 border-t pt-2.5">
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <div className="min-w-0 flex-1">
                  <p className="text-muted-foreground text-[11px] font-black tracking-[0.08em]">
                    {transport.type === 'plane' ? 'N° DE VOL' : 'N° DE TRAJET'}
                  </p>
                  {number ? (
                    <p className="mt-0.5 truncate font-mono text-lg font-semibold tracking-[0.04em]">
                      {number}
                    </p>
                  ) : (
                    toComplete('Numéro')
                  )}
                </div>
                {number && (
                  <button
                    type="button"
                    onClick={() => void editor.copyText(number, 'Numéro copié')}
                    aria-label="Copier le numéro"
                    className="border-border bg-background text-primary pressable flex size-11 shrink-0 items-center justify-center rounded-xl border"
                  >
                    <Copy className="size-[18px]" aria-hidden />
                  </button>
                )}
              </div>
              <span aria-hidden className="bg-border/70 w-px" />
              <div className="flex min-w-0 flex-1 items-center gap-1 pl-1">
                <div className="min-w-0 flex-1">
                  <p className="text-muted-foreground text-[11px] font-black tracking-[0.08em]">
                    RÉFÉRENCE
                  </p>
                  {transport.bookingReference ? (
                    <p className="mt-0.5 truncate font-mono text-base font-semibold">
                      {transport.bookingReference}
                    </p>
                  ) : (
                    toComplete('Référence')
                  )}
                </div>
                {transport.bookingReference && (
                  <button
                    type="button"
                    onClick={() =>
                      void editor.copyText(
                        transport.bookingReference ?? '',
                        'Référence copiée',
                      )
                    }
                    aria-label="Copier la référence"
                    className="border-border bg-background text-primary pressable flex size-11 shrink-0 items-center justify-center rounded-xl border"
                  >
                    <Copy className="size-[18px]" aria-hidden />
                  </button>
                )}
              </div>
            </div>
          </div>
        </article>

        <div
          role="radiogroup"
          aria-label="Statut du trajet"
          className="bg-muted mx-5 mt-3.5 flex gap-1 rounded-[14px] p-1"
        >
          {BOOKING_STATUS_STEPS.map((step, position) => {
            const active = step === status
            const passed = position < statusIndex
            return (
              <button
                key={step}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() =>
                  editor.save(setTransport(day, { ...transport, status: step }))
                }
                className={cn(
                  'pressable flex h-9 flex-1 items-center justify-center gap-1 rounded-[11px] px-1 text-[13px] outline-none',
                  'focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                  active
                    ? 'bg-card text-primary-strong font-black shadow-[0_1px_3px_rgb(14_26_58/0.16)]'
                    : passed
                      ? 'text-success font-extrabold'
                      : 'text-muted-foreground font-extrabold',
                )}
              >
                {passed && <Check className="size-3.5" aria-hidden />}
                {BOOKING_STATUS_LABELS[step]}
              </button>
            )
          })}
        </div>

        {preferences.notifyTransportEve && notificationsGranted && (
          <div className="bg-secondary-soft border-secondary/30 text-secondary-strong mx-5 mt-3 flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5">
            <Bell className="size-5 shrink-0" aria-hidden />
            <p className="text-sm leading-[19px] font-bold">
              Rappel prévu la veille du départ
            </p>
          </div>
        )}

        {transport.notes && (
          <p className="text-muted-foreground mx-5 mt-3 text-[13px] leading-relaxed">
            {transport.notes}
          </p>
        )}

        <span className="min-h-6 flex-1" />

        <div className="grid grid-cols-2 gap-2.5 px-5">
          {directions ? (
            <a
              href={directions}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackDirections('transport', 'transport')}
              className="border-border-strong bg-card pressable flex h-[52px] items-center justify-center gap-2 rounded-[14px] border-[1.5px] px-2.5 text-left text-sm leading-[17px] font-extrabold"
            >
              <Navigation className="size-5 shrink-0" aria-hidden />
              Itinéraire vers {PLACE_WORDS[transport.type]}
            </a>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() =>
              push({ kind: 'calendar', dayIndex: screen.dayIndex })
            }
            className="border-border-strong bg-card pressable flex h-[52px] items-center justify-center gap-2 rounded-[14px] border-[1.5px] px-2.5 text-left text-sm leading-[17px] font-extrabold"
          >
            <CalendarPlus className="size-5 shrink-0" aria-hidden />
            Ajouter au calendrier
          </button>
        </div>
        <div className="px-5 pt-2.5">
          {transport.bookingUrl ? (
            <Button asChild size="xl" className="w-full">
              <a
                href={transport.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Ticket />
                Ouvrir le billet
                <ExternalLink className="size-4" />
              </a>
            </Button>
          ) : ticket ? (
            <Button
              size="xl"
              className="w-full"
              onClick={() => push({ kind: 'document', documentId: ticket.id })}
            >
              <FileText />
              Ouvrir le billet
            </Button>
          ) : (
            <Button
              size="xl"
              variant="soft"
              className="w-full"
              onClick={() =>
                push({ kind: 'add-document', dayIndex: screen.dayIndex })
              }
            >
              <Plus />
              Ranger le billet
            </Button>
          )}
        </div>
      </div>
      {editor.sheets}
    </div>
  )
}
