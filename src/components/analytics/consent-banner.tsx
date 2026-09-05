'use client'

/**
 * Bandeau de consentement.
 *
 * Accepter et refuser sont au même niveau, en un clic chacun : le RGPD et les
 * recommandations de la CNIL demandent que refuser soit aussi simple
 * qu'accepter. Le bandeau ne bloque pas l'écran — l'application reste
 * utilisable même sans répondre, puisque sans réponse rien n'est mesuré.
 */

import { Button } from '@/components/ui/button'
import type { ConsentStatus } from '@/lib/analytics/consent'
import { IconChartBar, IconX } from '@tabler/icons-react'
import Link from 'next/link'

interface ConsentBannerProps {
  /** Choix déjà exprimé, quand le bandeau est rouvert depuis les réglages. */
  currentStatus: ConsentStatus | null
  onDecide: (status: ConsentStatus) => void
  /** Présent uniquement en réouverture : on peut alors partir sans rien changer. */
  onDismiss?: () => void
}

export function ConsentBanner({
  currentStatus,
  onDecide,
  onDismiss,
}: ConsentBannerProps) {
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
      aria-describedby="consent-description"
      className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] md:pb-4"
    >
      <div className="bg-card/97 border-border mx-auto max-w-2xl rounded-2xl border p-4 shadow-lg backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <span className="bg-primary/10 text-primary hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:inline-flex">
            <IconChartBar className="h-5 w-5" />
          </span>

          <div className="min-w-0 flex-1">
            <p
              id="consent-title"
              className="text-foreground text-sm font-semibold"
            >
              Aider à améliorer TripBrain ?
            </p>
            <p
              id="consent-description"
              className="text-muted-foreground mt-1 text-xs leading-relaxed"
            >
              Avec ton accord, on mesure de façon anonyme quels écrans servent
              et où ça coince, pour améliorer l’application. Rien de ton voyage
              n’est envoyé : ni destinations, ni documents, ni notes, ni codes
              de partage. Sans accord, aucune mesure n’a lieu.{' '}
              <Link
                href="/politique-de-confidentialite"
                className="text-foreground underline underline-offset-4"
              >
                Politique de confidentialité
              </Link>
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="min-w-28 flex-1 sm:flex-none"
                onClick={() => onDecide('denied')}
                aria-pressed={currentStatus === 'denied'}
              >
                Refuser
              </Button>
              <Button
                size="sm"
                className="min-w-28 flex-1 sm:flex-none"
                onClick={() => onDecide('granted')}
                aria-pressed={currentStatus === 'granted'}
              >
                Accepter
              </Button>
            </div>
          </div>

          {onDismiss && (
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={onDismiss}
              aria-label="Fermer sans changer mon choix"
            >
              <IconX className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
