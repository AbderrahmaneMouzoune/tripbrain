'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  BedDouble,
  Bus,
  Car,
  ClipboardCheck,
  FileText,
  PlayCircle,
  Plane,
  Route,
  TrainFront,
} from 'lucide-react'
import { MobileScreen } from '@/components/mobile/mobile-screen'
import { Button } from '@/components/ui/button'
import { useTrip } from '@/components/app/trip-provider'
import { useAppNav } from '@/components/app/navigation'
import { trackEvent } from '@/lib/analytics/client'
import { itinerary as demoItinerary } from '@/lib/itinerary-data'
import type { Transport } from '@/lib/itinerary-data'
import type { IncomingShare } from '@/lib/share'
import {
  ReceiveFlow,
  type ReceiveStart,
} from '@/components/receive/receive-flow'
import { TripPreviewStep } from '@/components/receive/trip-preview-step'
import type { ReceivedTrip } from '@/components/receive/received-trip'
import { groupCodeDigits } from '@/components/receive/share-input'
import { ImportFilePanel } from '@/components/onboarding/import-file-screen'
import { IntentionOptions } from '@/components/onboarding/intention-options'
import { useClipboardShare } from '@/components/onboarding/use-clipboard-share'
import { buildShowcase, transportLabel } from '@/components/onboarding/showcase'

type Step =
  | { kind: 'welcome' }
  | { kind: 'intention' }
  | { kind: 'receive'; start: ReceiveStart }
  | { kind: 'file' }
  | { kind: 'file-preview'; received: ReceivedTrip }

const TRANSPORT_ICONS: Record<Transport['type'], typeof Plane> = {
  plane: Plane,
  train: TrainFront,
  bus: Bus,
  car: Car,
}

/**
 * Parcours d'accueil quand aucun voyage n'est enregistré : bienvenue, « où en
 * est votre voyage ? », puis code, QR code, fichier ou générateur, et l'aperçu
 * avant d'enregistrer. Une fois le voyage enregistré, l'écran « voyage prêt »
 * prend le relais au-dessus des onglets.
 */
export function OnboardingFlow(_props: {}) {
  const { push } = useAppNav()
  const [step, setStep] = useState<Step>({ kind: 'welcome' })

  // Première chose vue quand aucun voyage n'est enregistré : savoir combien de
  // visites s'arrêtent là dit si l'arrivée est assez claire.
  useEffect(() => {
    trackEvent('onboarding_viewed')
  }, [])

  const toIntention = () => setStep({ kind: 'intention' })
  const onSaved = () => push({ kind: 'trip-ready' })

  switch (step.kind) {
    case 'welcome':
      return <WelcomeStep onStart={toIntention} />
    case 'intention':
      return (
        <IntentionStep
          onBack={() => setStep({ kind: 'welcome' })}
          onChoose={(choice) => {
            if (choice === 'generator') push({ kind: 'generator' })
            else if (choice === 'file') setStep({ kind: 'file' })
            else setStep({ kind: 'receive', start: { method: choice } })
          }}
          onUseClipboard={(incoming) =>
            setStep({
              kind: 'receive',
              start: { incoming, via: 'clipboard' },
            })
          }
        />
      )
    case 'receive':
      return (
        <ReceiveFlow
          start={step.start}
          presentation="onboarding"
          onExit={toIntention}
          onSaved={onSaved}
        />
      )
    case 'file':
      return (
        <ImportFilePanel
          onBack={toIntention}
          progress={{ step: 2, total: 4 }}
          onParsed={(received) => setStep({ kind: 'file-preview', received })}
        />
      )
    case 'file-preview':
      return (
        <TripPreviewStep
          received={step.received}
          onBack={() => setStep({ kind: 'file' })}
          progress={{ step: 3, total: 4 }}
          onSaved={onSaved}
        />
      )
  }
}

// ── Bienvenue ─────────────────────────────────────────────────────────────────

function WelcomeStep({ onStart }: { onStart: () => void }) {
  const { loadMockData } = useTrip()
  const [loadingDemo, setLoadingDemo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Les cartes montrent le voyage d'exemple, celui qu'ouvre le second bouton.
  const showcase = useMemo(() => buildShowcase(demoItinerary), [])
  const TransportIcon = showcase.transport
    ? TRANSPORT_ICONS[showcase.transport.type]
    : Plane

  const exploreDemo = async () => {
    setError(null)
    setLoadingDemo(true)
    try {
      await loadMockData()
    } catch {
      setError('Le voyage exemple n’a pas pu s’ouvrir. Réessayez.')
      setLoadingDemo(false)
    }
  }

  return (
    <div className="bg-primary relative flex min-h-dvh flex-col overflow-hidden">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col">
        <div className="animate-rise flex items-center gap-2.5 px-6 pt-[calc(env(safe-area-inset-top)+16px)]">
          <span className="bg-card text-primary flex size-10 items-center justify-center rounded-xl">
            <Route className="size-[22px]" aria-hidden />
          </span>
          <span className="font-display text-primary-foreground text-xl tracking-[0.08em]">
            TRIPBRAIN
          </span>
        </div>

        {/* Vitrine : décorative, le texte de la feuille dit déjà tout. */}
        <div aria-hidden className="relative min-h-[300px] flex-1">
          {showcase.day && (
            <div className="animate-rise absolute top-7 left-[26px] [animation-delay:0.08s]">
              <div className="animate-float bg-card text-foreground flex w-[272px] -rotate-3 flex-col gap-2 rounded-[20px] p-4 shadow-[0_14px_32px_rgba(6,20,60,0.28)]">
                <span className="text-secondary-strong text-[11px] font-black tracking-[0.1em] uppercase">
                  Aujourd’hui · Jour {showcase.day.dayNumber}
                </span>
                <span className="text-[19px] leading-tight font-extrabold">
                  {showcase.day.title}
                </span>
                <span className="flex gap-1.5">
                  <span className="bg-primary-soft text-primary-strong rounded-full px-2.5 py-1 text-xs font-extrabold">
                    {showcase.day.stepCount} étapes
                  </span>
                  {showcase.day.walkingDistance && (
                    <span className="bg-primary-soft text-primary-strong rounded-full px-2.5 py-1 text-xs font-extrabold">
                      {showcase.day.walkingDistance} à pied
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}

          {showcase.transport && (
            <div className="animate-rise absolute top-[144px] right-5 [animation-delay:0.16s]">
              <div className="animate-float bg-ink text-ink-foreground flex w-[232px] rotate-[4deg] items-center gap-3 rounded-[20px] px-4 py-3.5 shadow-[0_14px_32px_rgba(6,20,60,0.35)] [animation-delay:-1.6s]">
                <span className="bg-secondary text-secondary-foreground flex size-10 shrink-0 items-center justify-center rounded-xl">
                  <TransportIcon className="size-5" />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-extrabold">
                    {transportLabel(showcase.transport.type)} ·{' '}
                    {showcase.transport.from} → {showcase.transport.to}
                  </span>
                  <span className="text-ink-foreground/70 text-xs font-bold">
                    Billets · hors ligne
                  </span>
                </span>
              </div>
            </div>
          )}

          {showcase.stay && (
            <div className="animate-rise absolute top-[236px] left-[38px] [animation-delay:0.24s]">
              <div className="animate-float bg-secondary-soft text-foreground flex w-[252px] -rotate-[1.5deg] items-center gap-3 rounded-[20px] px-4 py-3.5 shadow-[0_14px_32px_rgba(6,20,60,0.25)] [animation-delay:-3.2s]">
                <span className="bg-card text-secondary-strong flex size-10 shrink-0 items-center justify-center rounded-xl">
                  <BedDouble className="size-5" />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-secondary-strong text-xs font-black uppercase">
                    Ce soir · à montrer au chauffeur
                  </span>
                  <span className="truncate text-sm font-extrabold">
                    {showcase.stay.address}
                  </span>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-background text-foreground animate-sheet relative z-10 mx-auto flex w-full max-w-xl flex-col gap-3.5 rounded-t-[28px] px-6 pt-8 pb-[calc(env(safe-area-inset-bottom)+28px)] [animation-delay:0.1s]">
        <h1 className="font-display text-[31px] leading-[1.12]">
          Tout votre voyage, même sans réseau.
        </h1>
        <p className="text-muted-foreground text-base leading-relaxed">
          Programme, billets et adresses réunis dans un roadbook qui tient dans
          la poche — et qui marche en avion.
        </p>
        {error && (
          <p role="alert" className="text-destructive text-sm font-bold">
            {error}
          </p>
        )}
        <Button size="xl" className="mt-3 w-full" onClick={onStart}>
          Commencer
          <ArrowRight aria-hidden />
        </Button>
        <Button
          variant="outline"
          className="h-[52px] w-full rounded-2xl border-[1.5px] text-base font-extrabold"
          onClick={exploreDemo}
          disabled={loadingDemo}
        >
          <PlayCircle className="size-[18px]" aria-hidden />
          {loadingDemo ? 'Ouverture…' : 'Explorer un voyage exemple'}
        </Button>
        <p className="text-muted-foreground mt-0.5 text-center text-xs leading-relaxed">
          Vos voyages restent sur ce téléphone.{' '}
          <Link
            href="/politique-de-confidentialite"
            className="text-primary font-bold underline-offset-4 hover:underline"
          >
            Confidentialité
          </Link>
          {' · '}
          <Link
            href="/mentions-legales"
            className="text-primary font-bold underline-offset-4 hover:underline"
          >
            Mentions légales
          </Link>
        </p>
      </div>
    </div>
  )
}

// ── D'où vient le voyage ? ────────────────────────────────────────────────────

function IntentionStep({
  onBack,
  onChoose,
  onUseClipboard,
}: {
  onBack: () => void
  onChoose: (choice: 'code' | 'scan' | 'generator' | 'file') => void
  onUseClipboard: (incoming: IncomingShare) => void
}) {
  const clipboard = useClipboardShare()

  return (
    <MobileScreen
      onBack={onBack}
      progress={{ step: 1, total: 4 }}
      title="Où en est votre voyage ?"
      description="Choisissez votre point de départ, on s’occupe du reste."
      footer={
        <div className="flex flex-col items-center gap-0.5">
          <Button
            variant="link"
            className="min-h-11 text-[15px] font-extrabold no-underline"
            onClick={() => onChoose('file')}
          >
            <FileText className="size-[18px]" aria-hidden />
            J’ai un fichier (JSON, Excel ou CSV)
          </Button>
          <Link
            href="/guide"
            className="text-muted-foreground hover:text-foreground flex min-h-11 items-center text-[13px] font-bold underline-offset-4 hover:underline"
          >
            Quel format utiliser ?
          </Link>
        </div>
      }
    >
      {clipboard && (
        <div className="bg-secondary-soft border-secondary/30 animate-pop mb-4 flex items-center gap-3 rounded-[18px] border py-3 pr-3 pl-3.5">
          <ClipboardCheck
            className="text-secondary-strong size-[22px] shrink-0"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-secondary-strong text-xs font-extrabold">
              {clipboard.code && !clipboard.payload
                ? 'Code copié depuis tripbrain.fr'
                : 'Lien de partage copié'}
            </p>
            {clipboard.code && !clipboard.payload ? (
              <p className="mt-0.5 truncate font-mono text-lg font-semibold tracking-[0.06em]">
                {groupCodeDigits(clipboard.code)}
              </p>
            ) : (
              <p className="mt-0.5 truncate text-base font-extrabold">
                {clipboard.origin === 'generator'
                  ? 'Itinéraire généré'
                  : 'Voyage partagé'}
              </p>
            )}
          </div>
          <Button
            variant="ink"
            className="h-11 rounded-xl px-[18px] text-sm font-extrabold"
            onClick={() => onUseClipboard(clipboard)}
          >
            Utiliser
          </Button>
        </div>
      )}
      <IntentionOptions onChoose={onChoose} />
    </MobileScreen>
  )
}
