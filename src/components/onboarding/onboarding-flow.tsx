'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  BedDouble,
  Bus,
  CalendarDays,
  Car,
  ClipboardCheck,
  FileText,
  PlayCircle,
  Plane,
  Route,
  Ticket,
  TrainFront,
  WifiOff,
} from 'lucide-react'
import { IconBadge } from '@/components/mobile/icon-badge'
import { MobileScreen } from '@/components/mobile/mobile-screen'
import { Button } from '@/components/ui/button'
import { useTrip } from '@/components/app/trip-provider'
import { useAppNav } from '@/components/app/navigation'
import {
  ScreenStatusBarContext,
  type ScreenStatusBarRequest,
} from '@/components/app/screen-props'
import {
  setNativeStatusBarStyle,
  type NativeStatusBarStyle,
} from '@/lib/native-app'
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
import {
  IntentionOptions,
  type IntentionChoice,
} from '@/components/onboarding/intention-options'
import { useClipboardShare } from '@/components/onboarding/use-clipboard-share'
import { buildShowcase } from '@/components/onboarding/showcase'

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
  const { push, stack } = useAppNav()
  const [step, setStep] = useState<Step>({ kind: 'welcome' })
  // Demande d'une étape enfant au fond particulier (caméra du scan) : même
  // API que dans `ScreenHost`, l'onboarding n'étant pas un écran empilé.
  const [childStatusBar, setChildStatusBar] =
    useState<ScreenStatusBarRequest | null>(null)

  // Barre d'état de l'app native : icônes foncées, toutes les étapes ayant un
  // fond clair, sauf demande d'une étape enfant (caméra du scan). Seule source
  // de vérité tant qu'aucun écran n'est ouvert par-dessus (`ScreenHost` gère
  // alors la sienne) : on la réaffirme quand la pile se vide.
  const statusBar: NativeStatusBarStyle = childStatusBar?.style ?? 'dark'
  const stackEmpty = stack.length === 0
  useEffect(() => {
    if (stackEmpty) setNativeStatusBarStyle(statusBar)
  }, [statusBar, stackEmpty])

  // Première chose vue quand aucun voyage n'est enregistré : savoir combien de
  // visites s'arrêtent là dit si l'arrivée est assez claire.
  useEffect(() => {
    trackEvent('onboarding_viewed')
  }, [])

  const toIntention = () => setStep({ kind: 'intention' })
  const onSaved = () => push({ kind: 'trip-ready' })

  const renderStep = () => {
    switch (step.kind) {
      case 'welcome':
        return <WelcomeStep onStart={toIntention} />
      case 'intention':
        return (
          <IntentionStep
            onBack={() => setStep({ kind: 'welcome' })}
            onChoose={(choice) => {
              if (choice === 'generator') push({ kind: 'generator' })
              else if (choice === 'program') push({ kind: 'import-program' })
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

  return (
    <ScreenStatusBarContext.Provider value={setChildStatusBar}>
      {renderStep()}
    </ScreenStatusBarContext.Provider>
  )
}

// ── Bienvenue ─────────────────────────────────────────────────────────────────

/** Ce que l'app fait sur place, en trois lignes : l'essentiel avant de commencer. */
const WELCOME_FEATURES = [
  {
    icon: CalendarDays,
    tone: 'primary',
    title: 'Le programme, jour par jour',
    description: 'Ce que vous faites aujourd’hui et l’étape suivante.',
  },
  {
    icon: Ticket,
    tone: 'secondary',
    title: 'Billets et adresses sous la main',
    description: 'Réservations, et l’adresse de l’hôtel pour le chauffeur.',
  },
  {
    icon: WifiOff,
    tone: 'accent',
    title: 'Tout marche sans réseau',
    description: 'En avion ou sans données mobiles, rien ne manque.',
  },
] as const

/**
 * Premier écran d'une app, pas la page d'accueil d'un site : l'icône, un mot
 * de bienvenue, ce que l'app fait en trois lignes, et les actions collées en
 * bas, sous le pouce. L'aperçu reprend la carte « Jour » de l'onglet
 * Aujourd'hui, avec le voyage d'exemple que le second bouton ouvre.
 */
function WelcomeStep({ onStart }: { onStart: () => void }) {
  const { loadMockData } = useTrip()
  const [loadingDemo, setLoadingDemo] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
    <div className="bg-background text-foreground flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 pt-[calc(var(--safe-top)+36px)] pb-6">
        <span className="bg-primary text-primary-foreground animate-pop flex size-[68px] items-center justify-center rounded-[20px] shadow-[0_12px_26px_color-mix(in_srgb,var(--primary)_34%,transparent)]">
          <Route className="size-9" aria-hidden />
        </span>
        <h1 className="font-display animate-rise mt-6 text-[30px] leading-[1.12]">
          Bienvenue dans TripBrain
        </h1>
        <p className="text-muted-foreground animate-rise mt-2 text-base leading-relaxed [animation-delay:0.05s]">
          Tout votre voyage dans la poche, même sans réseau.
        </p>

        {showcase.day && (
          <div
            aria-hidden
            className="bg-card border-border animate-rise mt-6 flex items-center gap-3.5 rounded-[20px] border p-3.5 [animation-delay:0.1s]"
          >
            <span className="bg-secondary-soft text-secondary-strong flex size-[52px] shrink-0 flex-col items-center justify-center rounded-2xl leading-none">
              <span className="text-[10px] font-black tracking-[0.06em] uppercase">
                Jour
              </span>
              <span className="font-display mt-0.5 text-xl">
                {showcase.day.dayNumber}
              </span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="truncate text-base leading-tight font-extrabold">
                {showcase.day.title}
              </span>
              <span className="flex flex-wrap gap-1.5">
                <span className="bg-primary-soft text-primary-strong rounded-full px-2.5 py-0.5 text-[11px] font-extrabold">
                  {showcase.day.stepCount} étapes
                </span>
                {showcase.transport && (
                  <span className="bg-ink text-ink-foreground flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold">
                    <TransportIcon className="size-3" />
                    Billet hors ligne
                  </span>
                )}
                {showcase.stay && (
                  <span className="bg-secondary-soft text-secondary-strong flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold">
                    <BedDouble className="size-3" />
                    Hôtel
                  </span>
                )}
              </span>
            </span>
          </div>
        )}

        <ul className="stagger mt-7 flex flex-col gap-5">
          {WELCOME_FEATURES.map((feature) => (
            <li key={feature.title} className="flex items-center gap-3.5">
              <IconBadge icon={feature.icon} tone={feature.tone} size="lg" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-base leading-snug font-extrabold">
                  {feature.title}
                </span>
                <span className="text-muted-foreground text-[13px] leading-snug">
                  {feature.description}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-background/95 sticky bottom-0 z-10 mx-auto flex w-full max-w-xl flex-col gap-1.5 px-6 pt-3 pb-[calc(var(--safe-bottom)+16px)] backdrop-blur">
        {error && (
          <p
            role="alert"
            className="text-destructive text-center text-sm font-bold"
          >
            {error}
          </p>
        )}
        <Button size="xl" className="w-full" onClick={onStart}>
          Commencer
          <ArrowRight aria-hidden />
        </Button>
        <Button
          variant="ghost"
          className="text-primary-strong h-12 w-full rounded-2xl text-[15px] font-extrabold"
          onClick={exploreDemo}
          disabled={loadingDemo}
        >
          <PlayCircle className="size-[18px]" aria-hidden />
          {loadingDemo ? 'Ouverture…' : 'Explorer un voyage exemple'}
        </Button>
        <p className="text-muted-foreground text-center text-xs leading-relaxed">
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
  onChoose: (choice: IntentionChoice) => void
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
            J’ai un fichier au format TripBrain
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
