'use client'

import { cn } from '@/lib/utils'
import { type Transport } from '@/lib/itinerary-data'
import { Button } from '@/components/ui/button'
import {
  Train,
  Car,
  Plane,
  Bus,
  Clock,
  Navigation,
  Banknote,
  Hash,
  Armchair,
  Ticket,
  ExternalLink,
} from 'lucide-react'

function getTransportIcon(type: string) {
  switch (type) {
    case 'train':
      return Train
    case 'car':
      return Car
    case 'plane':
      return Plane
    case 'bus':
      return Bus
    default:
      return Train
  }
}

function getStatusBadgeClass(status: Transport['status']) {
  switch (status) {
    case 'booked':
      return 'border-blue-200 bg-blue-500/10 text-blue-600 dark:border-blue-800 dark:text-blue-400'
    case 'checked-in':
      return 'border-green-200 bg-green-500/10 text-green-600 dark:border-green-800 dark:text-green-400'
    case 'completed':
      return 'bg-muted text-muted-foreground border-border/60'
    default:
      return 'bg-muted/60 text-muted-foreground border-border/40'
  }
}

function formatPrice(value: number, currency?: string) {
  return [value.toLocaleString('fr-FR'), currency].filter(Boolean).join(' ')
}

interface TransportCardProps {
  transport: Transport
}

export function TransportCard({ transport }: TransportCardProps) {
  const Icon = getTransportIcon(transport.type)
  const hasRoute = Boolean(transport.from && transport.to)

  // Prefer departureAddress over from-name for the pickup map link
  const pickupQuery = transport.departureAddress ?? transport.from
  const transportPickupUrl = pickupQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pickupQuery)}`
    : null

  return (
    <div className="border-border/60 bg-card/80 rounded-xl border px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="bg-primary/10 mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
          <Icon className="text-primary h-4 w-4" strokeWidth={1.75} />
        </div>

        <div className="min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.14em] uppercase">
              Transport
            </p>
            {transport.status && (
              <span
                className={cn(
                  'rounded-full border px-1.5 py-0.5 text-[10px] font-medium capitalize',
                  getStatusBadgeClass(transport.status),
                )}
              >
                {transport.status}
              </span>
            )}
          </div>

          <div className="mt-1 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-foreground text-sm leading-snug font-semibold">
                {hasRoute
                  ? `${transport.from} → ${transport.to}`
                  : transport.details}
              </p>
              {transport.details && hasRoute && (
                <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                  {transport.details}
                </p>
              )}
            </div>

            {transportPickupUrl && (
              <Button
                asChild
                size="sm"
                className="h-7 shrink-0 rounded-full px-2.5 text-[11px]"
              >
                <a
                  href={transportPickupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Navigation className="h-3 w-3" strokeWidth={1.5} />
                  Point de départ
                </a>
              </Button>
            )}
          </div>

          <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            {(transport.departureTime ||
              transport.arrivalTime ||
              transport.duration) && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                {transport.departureTime && transport.arrivalTime ? (
                  <>
                    {transport.departureTime} → {transport.arrivalTime}
                  </>
                ) : (
                  <>{transport.departureTime ?? transport.arrivalTime}</>
                )}
                {transport.duration && (
                  <span className="text-muted-foreground/70">
                    ({transport.duration})
                  </span>
                )}
              </span>
            )}

            {transport.provider && <span>{transport.provider}</span>}

            {transport.seat && (
              <span className="inline-flex items-center gap-1">
                <Armchair className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                {transport.seat}
              </span>
            )}

            {transport.gate && <span>Gate {transport.gate}</span>}

            {transport.terminal && <span>Terminal {transport.terminal}</span>}

            {transport.bookingReference && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <Hash className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                <span className="truncate font-mono">
                  {transport.bookingReference}
                </span>
              </span>
            )}

            {transport.price !== undefined && (
              <span className="inline-flex items-center gap-1">
                <Banknote className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                {formatPrice(transport.price, transport.currency)}
              </span>
            )}

            {transport.bookingUrl && (
              <a
                href={transport.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 inline-flex items-center gap-1 font-medium transition-colors hover:underline"
              >
                <Ticket className="h-3 w-3" strokeWidth={1.5} />
                Billet
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {transport.notes && (
            <p className="text-muted-foreground/70 mt-1 text-[11px] leading-relaxed italic">
              {transport.notes}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
