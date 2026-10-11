'use client'

/**
 * Demande de consentement, en feuille du bas.
 *
 * Accepter et refuser sont au même niveau — même taille, même style, côte à
 * côte, en un clic chacun : le RGPD et les recommandations de la CNIL demandent
 * que refuser soit aussi simple qu'accepter. Sans réponse, rien n'est mesuré.
 *
 * La feuille ne se ferme pas d'un geste à la première demande : un balayage ne
 * dit ni oui ni non. Rouverte depuis les réglages (`onDismiss`), elle se
 * referme sans rien changer.
 */

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowRight, ChartColumn, CheckCircle2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ConsentStatus } from '@/lib/analytics/consent'
import { cn } from '@/lib/utils'

interface ConsentBannerProps {
  /** Choix déjà exprimé, quand le bandeau est rouvert depuis les réglages. */
  currentStatus: ConsentStatus | null
  onDecide: (status: ConsentStatus) => void
  /** Présent uniquement en réouverture : on peut alors partir sans rien changer. */
  onDismiss?: () => void
}

/**
 * Pages où la demande se fait discrète : on y vient justement pour lire avant
 * de choisir, la feuille ne doit donc ni voiler ni couvrir le texte.
 */
const READING_PAGES = ['/politique-de-confidentialite', '/mentions-legales']

const GUARANTEES = [
  {
    title: 'Aucune donnée de voyage envoyée',
    text: ' : ni destinations, ni documents, ni notes, ni codes de partage.',
  },
  {
    title: 'Anonyme',
    text: ' : pas de profil, pas de publicité, pas de revente.',
  },
  { title: 'Modifiable à tout moment', text: ' dans Réglages.' },
]

export function ConsentBanner({
  currentStatus,
  onDecide,
  onDismiss,
}: ConsentBannerProps) {
  const sheetRef = useRef<HTMLElement>(null)
  const pathname = usePathname()
  const compact = READING_PAGES.includes(pathname ?? '')

  // Le focus va dans la feuille, pour qu'un lecteur d'écran l'annonce ;
  // Échap ne referme qu'en réouverture.
  useEffect(() => {
    if (!compact) sheetRef.current?.focus()
    if (!onDismiss) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss, compact])

  return (
    <div
      className={cn(
        'fixed inset-0 z-[60] flex items-end justify-center',
        compact && 'pointer-events-none',
      )}
    >
      {!compact && (
        <div
          aria-hidden
          className="animate-fade absolute inset-0 bg-black/55"
          onClick={onDismiss}
        />
      )}
      <section
        ref={sheetRef}
        tabIndex={-1}
        role="dialog"
        aria-modal={!compact}
        aria-labelledby="consent-title"
        aria-describedby="consent-description"
        className="bg-card text-foreground animate-sheet pointer-events-auto relative max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-[28px] px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+24px)] shadow-[0_-12px_40px_rgba(11,18,38,0.3)] outline-none"
      >
        <span
          aria-hidden
          className="bg-border-strong mx-auto block h-[5px] w-10 rounded-full"
        />
        {onDismiss && (
          <Button
            variant="ghost"
            size="icon-round"
            className="absolute top-3 right-3"
            onClick={onDismiss}
            aria-label="Fermer sans changer mon choix"
          >
            <X />
          </Button>
        )}

        {!compact && (
          <span
            aria-hidden
            className="bg-primary-soft text-primary mt-[18px] flex size-[52px] items-center justify-center rounded-2xl"
          >
            <ChartColumn className="size-6" />
          </span>
        )}
        <p className="text-secondary-strong mt-3.5 text-xs font-black tracking-[0.1em] uppercase">
          Mesure d’audience · facultative
        </p>
        <h2
          id="consent-title"
          className="font-display mt-1 text-[26px] leading-[1.15]"
        >
          Nous aider à améliorer TripBrain ?
        </h2>
        <p
          id="consent-description"
          className="text-muted-foreground mt-2 text-[15px] leading-relaxed"
        >
          Avec votre accord, nous comptons de façon anonyme quels écrans servent
          et où ça coince. Sans accord, rien n’est mesuré.
        </p>

        {!compact && (
          <ul className="bg-background mt-3.5 flex flex-col gap-2.5 rounded-2xl px-3.5 py-3">
            {GUARANTEES.map((item) => (
              <li
                key={item.title}
                className="flex gap-2.5 text-sm leading-snug"
              >
                <CheckCircle2
                  className="text-success mt-px size-[18px] shrink-0"
                  aria-hidden
                />
                <span>
                  <strong className="font-extrabold">{item.title}</strong>
                  {item.text}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-[18px] grid grid-cols-2 gap-2.5">
          <Button
            variant="outline"
            className="border-primary text-primary-strong h-[54px] rounded-2xl border-[1.5px] text-[17px] font-extrabold shadow-none"
            onClick={() => onDecide('denied')}
            aria-pressed={currentStatus === 'denied'}
          >
            Refuser
          </Button>
          <Button
            variant="outline"
            className="border-primary text-primary-strong h-[54px] rounded-2xl border-[1.5px] text-[17px] font-extrabold shadow-none"
            onClick={() => onDecide('granted')}
            aria-pressed={currentStatus === 'granted'}
          >
            Accepter
          </Button>
        </div>

        {!compact && (
          <Link
            href="/politique-de-confidentialite"
            className="text-muted-foreground hover:text-foreground mt-1.5 flex min-h-11 items-center justify-center gap-1.5 text-sm font-extrabold"
          >
            En savoir plus
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </section>
    </div>
  )
}
