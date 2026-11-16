'use client'

import { Car, ChevronRight, Copy, Hotel, Navigation, Plus } from 'lucide-react'
import { useTrip } from '@/components/app/trip-provider'
import { useAppNav } from '@/components/app/navigation'
import { QuickActionsTarget } from '@/components/quick-actions'
import type { DayEditor } from '@/components/day/use-day-editor'
import {
  directionsUrl,
  findDepartingStay,
  stayEmphasis,
} from '@/components/day/day-logic'
import { openDirections, useApplePlatform } from '@/components/day/day-ui'
import { trackEvent } from '@/lib/analytics/client'
import { cn } from '@/lib/utils'

/**
 * « Ce soir » en tête de journée : où l'on dort, adresse comprise, sans avoir
 * à chercher. En grand le soir venu et le jour d'arrivée, avec les trois
 * gestes utiles (copier, y aller, montrer au chauffeur) ; sinon une ligne qui
 * garde l'adresse lisible. Le matin d'un transfert, le logement qu'on quitte
 * reste à un geste.
 */
export function TonightCard({
  dayIndex,
  editor,
  now,
}: {
  dayIndex: number
  editor: DayEditor
  /** Présente sur l'onglet Aujourd'hui : décide de la mise en avant. */
  now?: Date
}) {
  const { itinerary } = useTrip()
  const { push } = useAppNav()
  const apple = useApplePlatform()
  const day = editor.day
  const stay = editor.stay
  const departing = findDepartingStay(itinerary, dayIndex)
  if (!day || (!stay && !departing)) return null

  const leaving = departing && (
    <button
      type="button"
      onClick={() => push({ kind: 'accommodation', dayIndex: dayIndex - 1 })}
      className="pressable text-muted-foreground flex min-h-11 w-full items-center gap-2 text-left text-[13px] font-bold"
    >
      <Hotel className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        Ce matin, on quitte ·{' '}
        <span className="text-foreground">
          {departing.accommodation.name || 'Hébergement'}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0" aria-hidden />
    </button>
  )

  if (!stay) return <div className="mx-5 mt-3">{leaving}</div>

  const { accommodation } = stay
  const name = accommodation.name || 'Hébergement'
  const address = accommodation.address.trim()
  const localAddress = accommodation.localAddress?.trim() ?? ''
  const hasAddress = Boolean(address || localAddress)
  const emphasis = stayEmphasis(day, stay, now)
  const open = () => push({ kind: 'accommodation', dayIndex })
  const nightLabel =
    stay.night && stay.nights
      ? `Nuit ${stay.night} sur ${stay.nights}`
      : undefined
  const directions = directionsUrl(
    {
      address: [accommodation.name, accommodation.address]
        .filter(Boolean)
        .join(' '),
      coordinates: accommodation.coordinates,
    },
    apple,
  )
  const copyAddress = () => {
    trackEvent('accommodation_address_copied', {
      surface: 'today',
      local: !address,
    })
    void editor.copyText(address || localAddress, 'Adresse copiée')
  }

  const missingAddress = (
    <button
      type="button"
      onClick={editor.editAccommodation}
      className="text-primary pressable flex min-h-11 items-center gap-1 text-sm font-extrabold"
    >
      <Plus className="size-4" aria-hidden />
      Ajouter l’adresse
    </button>
  )

  return (
    <div className="mx-5 mt-4 flex flex-col gap-1">
      {leaving}
      <QuickActionsTarget
        entity="accommodation"
        title={name}
        description={nightLabel ? `Ce soir · ${nightLabel}` : 'Ce soir'}
        icon={Hotel}
        actions={editor.accommodationActions()}
      >
        <section
          aria-label="Où dormir ce soir"
          className={cn(
            'bg-card rounded-[18px] border',
            emphasis === 'full'
              ? 'border-secondary border-[1.5px] p-3.5'
              : 'border-border px-3.5 py-2.5',
          )}
        >
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={open}
              className="pressable focus-visible:ring-ring/50 flex min-w-0 flex-1 flex-col rounded-lg text-left outline-none focus-visible:ring-[3px]"
            >
              <span className="text-secondary-strong text-[11px] leading-4 font-black tracking-[0.08em] uppercase">
                Ce soir{nightLabel ? ` · ${nightLabel}` : ''}
              </span>
              <span
                className={cn(
                  'font-black',
                  emphasis === 'full'
                    ? 'mt-0.5 text-[17px] leading-[22px]'
                    : 'truncate text-[15px] leading-5',
                )}
              >
                {name}
              </span>
              {address && (
                <span
                  className={cn(
                    'text-foreground font-bold',
                    emphasis === 'full'
                      ? 'mt-1 text-[15px] leading-5'
                      : 'text-muted-foreground truncate text-[13px] leading-[18px]',
                  )}
                >
                  {address}
                </span>
              )}
              {localAddress && emphasis === 'full' && (
                <span className="text-muted-foreground mt-0.5 text-[15px] leading-5 font-bold">
                  {localAddress}
                </span>
              )}
            </button>
            {emphasis === 'compact' && hasAddress && (
              <button
                type="button"
                onClick={copyAddress}
                aria-label="Copier l’adresse"
                className="text-primary pressable flex size-11 shrink-0 items-center justify-center rounded-xl"
              >
                <Copy className="size-[18px]" aria-hidden />
              </button>
            )}
            {emphasis === 'compact' && !hasAddress && (
              <ChevronRight
                className="text-muted-foreground mt-3 size-5 shrink-0"
                aria-hidden
              />
            )}
          </div>

          {!hasAddress && missingAddress}

          {emphasis === 'full' && hasAddress && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={copyAddress}
                className="bg-primary-soft text-primary-strong pressable flex h-11 items-center justify-center gap-1.5 rounded-xl text-[13px] font-extrabold"
              >
                <Copy className="size-4" aria-hidden />
                Copier
              </button>
              {directions ? (
                <a
                  href={directions}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) =>
                    openDirections(event, 'accommodation', 'today', {
                      name: accommodation.name,
                      address: accommodation.address,
                      coordinates: accommodation.coordinates,
                    })
                  }
                  className="bg-primary-soft text-primary-strong pressable flex h-11 items-center justify-center gap-1.5 rounded-xl text-[13px] font-extrabold"
                >
                  <Navigation className="size-4" aria-hidden />Y aller
                </a>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => push({ kind: 'driver', dayIndex })}
                className="bg-primary text-primary-foreground pressable flex h-11 items-center justify-center gap-1.5 rounded-xl text-[13px] font-extrabold"
              >
                <Car className="size-4" aria-hidden />
                Chauffeur
              </button>
            </div>
          )}
        </section>
      </QuickActionsTarget>
    </div>
  )
}
