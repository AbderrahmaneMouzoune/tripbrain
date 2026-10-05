'use client'

import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Car,
  Check,
  Copy,
  ExternalLink,
  MapPin,
  Navigation,
  Pencil,
  Plus,
} from 'lucide-react'
import type { ScreenProps } from '@/components/app/screen-props'
import { useAppNav } from '@/components/app/navigation'
import { MobileScreen } from '@/components/mobile/mobile-screen'
import { Button } from '@/components/ui/button'
import { CachedImage } from '@/components/cached-image'
import { Lightbox } from '@/components/lightbox'
import { cn } from '@/lib/utils'
import { useDayEditor } from '@/components/day/use-day-editor'
import {
  BOOKING_STATUS_LABELS,
  bookingHost,
  directionsUrl,
  formatPrice,
  shortDate,
} from '@/components/day/day-logic'
import { trackDirections, useApplePlatform } from '@/components/day/day-ui'

/** « Hôtel (Succursale) » → le nom et sa précision entre parenthèses. */
function splitName(name: string): { title: string; subtitle?: string } {
  const match = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  if (!match || !match[1]) return { title: name }
  return { title: match[1], subtitle: match[2] }
}

/** Fiche de l'hébergement du soir. */
export function AccommodationScreen({
  screen,
  onClose,
}: ScreenProps<'accommodation'>) {
  const { push } = useAppNav()
  const apple = useApplePlatform()
  const editor = useDayEditor(screen.dayIndex)
  const day = editor.day
  const stay = editor.stay
  const [galleryOpen, setGalleryOpen] = useState(false)

  if (!day || !stay) {
    return (
      <MobileScreen onBack={onClose} title="Pas d’hébergement">
        <p className="text-muted-foreground text-sm">
          Aucun hébergement n’est prévu pour ce soir.
        </p>
        <Button
          size="xl"
          className="mt-6 w-full"
          onClick={editor.editAccommodation}
        >
          <Plus />
          Ajouter un hébergement
        </Button>
        {editor.sheets}
      </MobileScreen>
    )
  }

  const { accommodation } = stay
  const { title, subtitle } = splitName(accommodation.name || 'Hébergement')
  const images = accommodation.images ?? []
  const status = accommodation.status
  const price = formatPrice(accommodation.price, accommodation.currency)
  const host = bookingHost(accommodation.bookingUrl)
  const directions = directionsUrl(
    {
      address: [accommodation.name, accommodation.address]
        .filter(Boolean)
        .join(' '),
    },
    apple,
  )
  const hasDates = Boolean(accommodation.checkIn && accommodation.checkOut)
  const backButton = (
    <Button
      variant="outline"
      size="icon-round"
      onClick={onClose}
      aria-label="Retour"
      className="border-border bg-card shadow-none"
    >
      <ArrowLeft />
    </Button>
  )
  const editButton = (
    <Button
      variant="outline"
      size="icon-round"
      onClick={editor.editAccommodation}
      aria-label="Modifier l’hébergement"
      className="border-border bg-card shadow-none"
    >
      <Pencil />
    </Button>
  )

  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col pb-[calc(env(safe-area-inset-bottom)+24px)]">
        {images.length > 0 ? (
          <section
            aria-label="Photos de l’hébergement"
            className="relative grid h-[200px] shrink-0 grid-cols-[2fr_1fr] grid-rows-2 gap-[3px]"
          >
            <Lightbox
              images={images.map((url, index) => ({
                url,
                alt: `${title} – photo ${index + 1}`,
              }))}
              isOpen={galleryOpen}
              onClose={() => setGalleryOpen(false)}
            />
            {images.slice(0, 3).map((url, index) => (
              <button
                key={`${url}-${index}`}
                type="button"
                onClick={() => setGalleryOpen(true)}
                aria-label={
                  index === 2 || images.length === 1
                    ? 'Voir la galerie'
                    : `Agrandir la photo ${index + 1}`
                }
                className={cn(
                  'bg-primary-soft relative overflow-hidden',
                  index === 0 && 'row-span-2',
                  images.length === 1 && 'col-span-2',
                  images.length === 2 && index === 1 && 'row-span-2',
                )}
              >
                <CachedImage
                  src={url}
                  alt=""
                  className="h-full w-full object-cover"
                  fallbackClassName="h-full w-full"
                />
                {index === 2 && images.length > 3 && (
                  <span className="bg-ink/50 text-ink-foreground absolute inset-0 flex items-center justify-center text-[13px] font-black">
                    Voir la galerie
                  </span>
                )}
              </button>
            ))}
            <div className="absolute top-[calc(env(safe-area-inset-top)+12px)] left-4">
              {backButton}
            </div>
            <div className="absolute top-[calc(env(safe-area-inset-top)+12px)] right-4">
              {editButton}
            </div>
          </section>
        ) : (
          <div className="flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+12px)]">
            {backButton}
            {editButton}
          </div>
        )}

        <div className="px-5 pt-4">
          <div className="flex items-center gap-2">
            <p className="text-secondary-strong flex-1 text-xs leading-4 font-black tracking-[0.08em]">
              HÉBERGEMENT · {day.city.toUpperCase()}
            </p>
            {status && (
              <span
                className={cn(
                  'flex items-center gap-1 rounded-full px-2.5 py-[3px] text-xs font-extrabold',
                  status === 'planned'
                    ? 'border-border-strong text-muted-foreground border'
                    : 'bg-success-soft text-success',
                )}
              >
                {status !== 'planned' && (
                  <Check className="size-3.5" aria-hidden />
                )}
                {BOOKING_STATUS_LABELS[status]}
              </span>
            )}
          </div>
          <h1 className="font-display mt-1 text-[23px] leading-7">{title}</h1>
          {subtitle && (
            <p className="text-muted-foreground mt-0.5 text-sm font-extrabold">
              {subtitle}
            </p>
          )}
          {accommodation.address && (
            <p className="text-muted-foreground mt-2 flex gap-1.5 text-[13px] leading-[18px]">
              <MapPin className="mt-px size-4 shrink-0" aria-hidden />
              <span>{accommodation.address}</span>
            </p>
          )}
        </div>

        {hasDates && (
          <section
            aria-label="Séjour"
            className="bg-card border-border mx-5 mt-3.5 rounded-[20px] border p-3.5"
          >
            <div className="flex items-center gap-2">
              <div className="flex flex-col">
                <span className="text-muted-foreground text-[11px] font-black tracking-[0.08em]">
                  ARRIVÉE
                </span>
                <span className="text-[17px] font-black">
                  {shortDate(accommodation.checkIn)}
                </span>
              </div>
              <div className="text-muted-foreground flex flex-1 flex-col items-center gap-0.5">
                {stay.nights && (
                  <span className="text-xs font-extrabold">
                    {stay.nights} nuit{stay.nights > 1 ? 's' : ''}
                  </span>
                )}
                <ArrowRight className="size-4" aria-hidden />
              </div>
              <div className="flex flex-col items-end">
                <span className="text-muted-foreground text-[11px] font-black tracking-[0.08em]">
                  DÉPART
                </span>
                <span className="text-[17px] font-black">
                  {shortDate(accommodation.checkOut)}
                </span>
              </div>
            </div>
            {stay.nights && stay.night && (
              <>
                <div aria-hidden className="mt-3 flex gap-1">
                  {Array.from({ length: stay.nights }, (_, night) => (
                    <span
                      key={night}
                      className={cn(
                        'h-1.5 flex-1 rounded-full',
                        night + 1 < (stay.night ?? 0)
                          ? 'bg-primary'
                          : night + 1 === stay.night
                            ? 'bg-secondary'
                            : 'bg-border',
                      )}
                    />
                  ))}
                </div>
                <p className="text-secondary-strong mt-2 text-sm font-extrabold">
                  Ce soir : nuit {stay.night} sur {stay.nights}
                </p>
              </>
            )}
          </section>
        )}

        <section
          aria-label="Réservation"
          className="bg-card border-border divide-border/70 mx-5 mt-2.5 divide-y rounded-[20px] border"
        >
          {(price || accommodation.bookingUrl) && (
            <div className="flex items-center gap-2.5 px-3.5 py-3">
              <span className="flex flex-1 flex-col">
                <span className="text-muted-foreground text-xs font-extrabold">
                  {host ? `Réservation sur ${host}` : 'Réservation'}
                </span>
                {price && <span className="text-xl font-black">{price}</span>}
              </span>
              {accommodation.bookingUrl && (
                <a
                  href={accommodation.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-primary-soft text-primary-strong pressable flex h-11 items-center gap-1.5 rounded-xl px-3.5 text-sm font-extrabold"
                >
                  Ouvrir la réservation
                  <ExternalLink className="size-4" aria-hidden />
                </a>
              )}
            </div>
          )}
          <div className="flex items-center gap-2.5 py-1 pr-1.5 pl-3.5">
            <span className="text-muted-foreground flex-1 text-[11px] font-black tracking-[0.08em]">
              RÉFÉRENCE
            </span>
            {accommodation.bookingReference ? (
              <>
                <span className="font-mono text-sm font-semibold">
                  {accommodation.bookingReference}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void editor.copyText(
                      accommodation.bookingReference ?? '',
                      'Référence copiée',
                    )
                  }
                  aria-label="Copier la référence"
                  className="text-primary pressable flex size-11 items-center justify-center rounded-xl"
                >
                  <Copy className="size-[18px]" aria-hidden />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={editor.editAccommodation}
                className="text-primary flex min-h-11 items-center gap-1 px-2 text-sm font-extrabold"
              >
                <Plus className="size-4" aria-hidden />
                Ajouter la référence
              </button>
            )}
          </div>
        </section>

        <span className="min-h-6 flex-1" />

        <div className="flex flex-col gap-2.5 px-5">
          <div className="grid grid-cols-2 gap-2.5">
            {directions && (
              <a
                href={directions}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  trackDirections('accommodation', 'accommodation')
                }
                className="border-border-strong bg-card pressable flex h-[52px] items-center justify-center gap-2 rounded-[14px] border-[1.5px] px-2.5 text-left text-sm leading-[17px] font-extrabold"
              >
                <Navigation className="size-5 shrink-0" aria-hidden />
                Itinéraire vers le logement
              </a>
            )}
            {accommodation.address && (
              <button
                type="button"
                onClick={() =>
                  void editor.copyText(accommodation.address, 'Adresse copiée')
                }
                className="border-border-strong bg-card pressable flex h-[52px] items-center justify-center gap-2 rounded-[14px] border-[1.5px] px-2.5 text-sm font-extrabold"
              >
                <Copy className="size-5 shrink-0" aria-hidden />
                Copier l’adresse
              </button>
            )}
          </div>
          {accommodation.address && (
            <Button
              size="xl"
              className="w-full"
              onClick={() =>
                push({ kind: 'driver', dayIndex: screen.dayIndex })
              }
            >
              <Car />
              Montrer au chauffeur
            </Button>
          )}
        </div>
      </div>
      {editor.sheets}
    </div>
  )
}
