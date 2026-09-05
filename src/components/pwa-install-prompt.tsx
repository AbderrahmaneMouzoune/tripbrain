'use client'

import { useState } from 'react'
import { AppIcon } from '@/components/app-icon'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { usePwaInstall } from '@/components/pwa-install-provider'
import { useClipboard } from '@/hooks/use-clipboard'
import { cn } from '@/lib/utils'
import type { InstallGuide } from '@/lib/pwa-install'
import {
  IconBolt,
  IconCheck,
  IconCopy,
  IconDeviceMobilePlus,
  IconDotsVertical,
  IconDownload,
  IconMaximize,
  IconShare2,
  IconSquarePlus,
  IconWifiOff,
  type TablerIcon,
} from '@tabler/icons-react'

interface Benefit {
  icon: TablerIcon
  title: string
  description: string
}

const BENEFITS: Benefit[] = [
  {
    icon: IconWifiOff,
    title: 'Hors ligne, vraiment',
    description: 'Ton roadbook reste lisible sans réseau ni data à l’étranger.',
  },
  {
    icon: IconBolt,
    title: 'Ouverte en un geste',
    description: 'Une icône sur l’écran d’accueil, plus d’onglet à retrouver.',
  },
  {
    icon: IconMaximize,
    title: 'Plein écran',
    description: 'Sans barre d’adresse : plus de place pour ta journée.',
  },
]

interface Step {
  icon: TablerIcon
  label: string
}

const IOS_STEPS: Step[] = [
  { icon: IconShare2, label: 'Appuie sur Partager, dans la barre de Safari.' },
  { icon: IconSquarePlus, label: 'Choisis « Sur l’écran d’accueil ».' },
  { icon: IconCheck, label: 'Valide avec « Ajouter ». C’est fait.' },
]

const MANUAL_STEPS: Step[] = [
  { icon: IconDotsVertical, label: 'Ouvre le menu de ton navigateur.' },
  {
    icon: IconDeviceMobilePlus,
    label:
      'Choisis « Installer l’application » ou « Ajouter à l’écran d’accueil ».',
  },
  { icon: IconCheck, label: 'Confirme. TripBrain rejoint tes apps.' },
]

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-2.5">
      {steps.map((step, index) => (
        <li key={step.label} className="flex items-center gap-3">
          <span className="bg-primary/10 text-primary relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
            <step.icon className="h-4.5 w-4.5" stroke={1.75} />
            <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold">
              {index + 1}
            </span>
          </span>
          <span className="text-foreground text-sm leading-snug">
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** Version détaillée : le prompt natif fait le reste, on a la place d'argumenter. */
function BenefitList() {
  return (
    <ul className="space-y-3">
      {BENEFITS.map((benefit) => (
        <li key={benefit.title} className="flex items-start gap-3">
          <span className="bg-primary/10 text-primary inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
            <benefit.icon className="h-4.5 w-4.5" stroke={1.75} />
          </span>
          <span className="min-w-0">
            <span className="text-foreground block text-sm font-medium">
              {benefit.title}
            </span>
            <span className="text-muted-foreground block text-xs leading-snug">
              {benefit.description}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Version compacte : rappelle l'intérêt sans écraser la marche à suivre. */
function BenefitStrip() {
  return (
    <ul className="bg-muted/50 grid grid-cols-3 gap-1 rounded-xl p-2">
      {BENEFITS.map((benefit) => (
        <li
          key={benefit.title}
          className="flex flex-col items-center gap-1 text-center"
        >
          <benefit.icon className="text-primary h-4 w-4" stroke={1.75} />
          <span className="text-muted-foreground text-[11px] leading-tight">
            {benefit.title}
          </span>
        </li>
      ))}
    </ul>
  )
}

function GuideBody({ guide }: { guide: InstallGuide }) {
  const { copied, copy } = useClipboard()

  if (guide === 'ios-safari') {
    return (
      <div className="space-y-3">
        <BenefitStrip />
        <StepList steps={IOS_STEPS} />
      </div>
    )
  }

  if (guide === 'ios-browser') {
    return (
      <div className="space-y-3">
        <BenefitStrip />
        <p className="text-muted-foreground text-sm leading-relaxed">
          Sur iPhone et iPad, seul <strong>Safari</strong> peut ajouter une app
          à l’écran d’accueil. Copie le lien, ouvre-le dans Safari, puis suis
          les 3 étapes.
        </p>
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => copy(window.location.origin)}
        >
          {copied ? (
            <IconCheck className="h-4 w-4" />
          ) : (
            <IconCopy className="h-4 w-4" />
          )}
          {copied ? 'Lien copié' : 'Copier le lien de l’app'}
        </Button>
        <StepList steps={IOS_STEPS} />
      </div>
    )
  }

  if (guide === 'manual') {
    return (
      <div className="space-y-3">
        <BenefitStrip />
        <StepList steps={MANUAL_STEPS} />
      </div>
    )
  }

  // guide === 'native' : le navigateur ouvre sa propre boîte de dialogue.
  return <BenefitList />
}

/**
 * Proposition d'installation : relance automatique sur mobile (une fois le
 * voyage chargé) ou ouverture manuelle depuis le menu « Partager & données ».
 */
export function PwaInstallPrompt() {
  const {
    guide,
    isOpen,
    origin,
    close,
    snooze,
    optOut,
    justInstalled,
    promptNativeInstall,
  } = usePwaInstall()
  const [isPrompting, setIsPrompting] = useState(false)

  const handleNativeInstall = async () => {
    setIsPrompting(true)
    try {
      await promptNativeInstall()
    } finally {
      setIsPrompting(false)
    }
  }

  return (
    <Drawer
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DrawerContent className="mx-auto max-w-md">
        {justInstalled ? (
          <>
            <DrawerHeader className="items-center gap-3 pb-2 text-center">
              <span className="bg-primary/10 text-primary mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl">
                <IconCheck className="h-7 w-7" stroke={2} />
              </span>
              <DrawerTitle className="text-lg">
                TripBrain est installée
              </DrawerTitle>
              <DrawerDescription>
                Retrouve-la sur ton écran d’accueil, avec tes documents et ton
                itinéraire déjà en mémoire.
              </DrawerDescription>
            </DrawerHeader>
            <DrawerFooter className="pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <Button onClick={close} className="w-full">
                Parfait
              </Button>
            </DrawerFooter>
          </>
        ) : (
          <>
            <DrawerHeader className="gap-3 pb-2">
              <div className="flex items-center gap-3 text-left">
                <AppIcon size="sm" />
                <div className="min-w-0">
                  <DrawerTitle className="text-base">
                    Installe TripBrain sur ton téléphone
                  </DrawerTitle>
                  <DrawerDescription className="text-xs">
                    Gratuit, hors ligne, sans passer par un store.
                  </DrawerDescription>
                </div>
              </div>
            </DrawerHeader>

            <div className="px-4 pb-2">
              <GuideBody guide={guide} />
            </div>

            <DrawerFooter className="pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {guide === 'native' ? (
                <Button
                  onClick={handleNativeInstall}
                  disabled={isPrompting}
                  className="w-full gap-2"
                >
                  <IconDownload className="h-4 w-4" />
                  {isPrompting ? 'Installation…' : 'Installer l’application'}
                </Button>
              ) : (
                <Button onClick={close} className="w-full">
                  J’ai compris
                </Button>
              )}

              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={snooze}
                  className="text-muted-foreground text-xs"
                >
                  Plus tard
                </Button>
                {origin === 'auto' && (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={optOut}
                    className="text-muted-foreground text-xs"
                  >
                    Ne plus proposer
                  </Button>
                )}
              </div>
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  )
}

/**
 * Entrée manuelle discrète, pour qui a repoussé la proposition ou veut
 * installer avant même d'avoir un voyage. Disparaît en mode installé.
 *
 * Dans « Partager & données », la même action passe par une `ActionRow` : le
 * dialog a son propre gabarit de lignes.
 */
export function PwaInstallEntry({
  className,
  onSelect,
}: {
  className?: string
  /** Permet au conteneur de se refermer avant l'ouverture du tiroir. */
  onSelect?: () => void
}) {
  const { canInstall, open } = usePwaInstall()

  if (!canInstall) return null

  return (
    <Button
      variant="link"
      size="sm"
      onClick={() => {
        onSelect?.()
        open('manual')
      }}
      className={cn('text-muted-foreground', className)}
    >
      <IconDeviceMobilePlus className="mr-1.5 h-4 w-4" />
      Installer l’app sur mon téléphone
    </Button>
  )
}
