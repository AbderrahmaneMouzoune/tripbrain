'use client'

import { useEffect, useState } from 'react'
import {
  AppWindow,
  Check,
  CheckCircle2,
  Download,
  Maximize,
  MoreVertical,
  Share,
  ShieldCheck,
  Smartphone,
  SquarePlus,
  WifiOff,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIsMobile } from '@/hooks/use-mobile'
import { usePwaInstall } from '@/hooks/use-pwa-install'
import {
  INSTALL_BENEFITS,
  INSTALL_FAMILIES,
  getGuideForFamily,
  type InstallBenefitIcon,
  type InstallFamily,
  type InstallGuide,
  type InstallStepIcon,
} from '@/lib/pwa-install'

const STEP_ICONS: Record<InstallStepIcon, LucideIcon> = {
  share: Share,
  menu: MoreVertical,
  plus: SquarePlus,
  check: Check,
  download: Download,
  browser: AppWindow,
}

const BENEFIT_ICONS: Record<InstallBenefitIcon, LucideIcon> = {
  offline: WifiOff,
  fullscreen: Maximize,
  home: Smartphone,
  shield: ShieldCheck,
}

// ── Sous-composants ──────────────────────────────────────────────────────────

function BenefitList() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {INSTALL_BENEFITS.map((benefit) => {
        const Icon = BENEFIT_ICONS[benefit.icon]
        return (
          <li key={benefit.title} className="flex gap-2.5">
            <span className="bg-muted text-muted-foreground mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
              <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p className="text-foreground text-xs font-semibold">
                {benefit.title}
              </p>
              <p className="text-muted-foreground text-xs leading-snug">
                {benefit.description}
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function GuideSteps({ guide }: { guide: InstallGuide }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="h-5 px-2 text-[10px]">
          {guide.browserLabel}
        </Badge>
      </div>

      {guide.steps.length > 0 && (
        <ol className="space-y-3">
          {guide.steps.map((step, index) => {
            const Icon = STEP_ICONS[step.icon]
            return (
              <li key={step.title} className="flex gap-3">
                <span className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground text-sm font-medium">
                    <span className="text-muted-foreground mr-1.5 tabular-nums">
                      {index + 1}.
                    </span>
                    {step.title}
                  </p>
                  {step.detail && (
                    <p className="text-muted-foreground mt-0.5 text-xs leading-snug">
                      {step.detail}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {guide.note && (
        <Alert variant="info">
          <AppWindow className="h-4 w-4" />
          <AlertTitle>Bon à savoir</AlertTitle>
          <AlertDescription>{guide.note}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

// ── Contenu principal ────────────────────────────────────────────────────────

/**
 * Marche à suivre pour installer TripBrain, adaptée à la plateforme détectée.
 * Réutilisable tel quel dans une boîte de dialogue, un tiroir ou une page.
 */
export function PwaInstallGuideContent() {
  const {
    isReady,
    target,
    isStandalone,
    isInstalled,
    canPrompt,
    promptInstall,
  } = usePwaInstall()
  const [family, setFamily] = useState<InstallFamily>('ios')

  // La détection n'a lieu qu'au montage : on cale l'onglet dessus une fois prête.
  useEffect(() => {
    if (target) setFamily(target.family)
  }, [target])

  if (isStandalone || isInstalled) {
    return (
      <div className="space-y-4">
        <Alert variant="info">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>TripBrain est installée</AlertTitle>
          <AlertDescription>
            Vous pouvez la lancer depuis votre écran d’accueil, même sans
            connexion.
          </AlertDescription>
        </Alert>
        <BenefitList />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {canPrompt && (
        <div className="bg-primary/5 border-primary/20 space-y-2 rounded-xl border p-3">
          <p className="text-foreground text-sm font-semibold">
            Installation en un geste
          </p>
          <p className="text-muted-foreground text-xs">
            Votre navigateur sait installer TripBrain directement — inutile de
            suivre les étapes ci-dessous.
          </p>
          <Button className="w-full gap-2" onClick={() => promptInstall()}>
            <Download className="h-4 w-4" />
            Installer l’application
          </Button>
        </div>
      )}

      <BenefitList />

      <Separator />

      <Tabs
        value={family}
        onValueChange={(value) => setFamily(value as InstallFamily)}
      >
        <TabsList className="grid w-full grid-cols-3">
          {INSTALL_FAMILIES.map((item) => (
            <TabsTrigger key={item.id} value={item.id} className="text-xs">
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {INSTALL_FAMILIES.map((item) => (
          <TabsContent key={item.id} value={item.id} className="mt-4">
            <GuideSteps
              guide={getGuideForFamily(item.id, isReady ? target : null)}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

// ── Enveloppe responsive ─────────────────────────────────────────────────────

interface PwaInstallGuideProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: React.ReactNode
}

const GUIDE_TITLE = 'Installer TripBrain'
const GUIDE_DESCRIPTION =
  'Ajoutez TripBrain à votre écran d’accueil pour l’ouvrir comme une vraie application, même hors connexion.'

/**
 * Guide d'installation : tiroir sur mobile — là où l'on installe vraiment —
 * et boîte de dialogue sur écran large.
 */
export function PwaInstallGuide({
  open,
  onOpenChange,
  trigger,
}: PwaInstallGuideProps) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        {trigger && <DrawerTrigger asChild>{trigger}</DrawerTrigger>}
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{GUIDE_TITLE}</DrawerTitle>
            <DrawerDescription>{GUIDE_DESCRIPTION}</DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <PwaInstallGuideContent />
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{GUIDE_TITLE}</DialogTitle>
          <DialogDescription>{GUIDE_DESCRIPTION}</DialogDescription>
        </DialogHeader>
        <PwaInstallGuideContent />
      </DialogContent>
    </Dialog>
  )
}
