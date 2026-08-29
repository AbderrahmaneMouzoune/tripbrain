'use client'

import { useEffect, useState } from 'react'
import {
  AppWindow,
  Check,
  Download,
  MoreVertical,
  Share,
  SquarePlus,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePwaInstall } from '@/hooks/use-pwa-install'
import {
  INSTALL_FAMILIES,
  getGuideForFamily,
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

function GuideSteps({ guide }: { guide: InstallGuide }) {
  return (
    <div className="space-y-2">
      {guide.steps.length > 0 && (
        <ol className="space-y-1.5">
          {guide.steps.map((step, index) => {
            const Icon = STEP_ICONS[step.icon]
            return (
              <li
                key={step.title}
                className="bg-muted/50 flex items-center gap-3 rounded-lg px-3 py-2.5"
              >
                <span className="bg-background text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground text-sm leading-tight font-medium">
                    {step.title}
                  </p>
                  {step.detail && (
                    <p className="text-muted-foreground mt-0.5 text-xs leading-snug">
                      {step.detail}
                    </p>
                  )}
                </div>
                <span className="text-muted-foreground/60 shrink-0 text-xs tabular-nums">
                  {index + 1}
                </span>
              </li>
            )
          })}
        </ol>
      )}

      {guide.note && (
        <p className="text-muted-foreground px-1 text-xs leading-snug">
          {guide.note}
        </p>
      )}
    </div>
  )
}

/**
 * Marche à suivre pour installer TripBrain, calée sur la plateforme détectée.
 * Réutilisable tel quel dans une boîte de dialogue ou une page.
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
      <p className="text-muted-foreground text-sm">
        TripBrain est installée : lancez-la depuis votre écran d’accueil.
      </p>
    )
  }

  // Invite native disponible : un seul bouton suffit, les étapes n'ont plus lieu d'être.
  if (canPrompt) {
    return (
      <Button className="w-full gap-2" onClick={() => promptInstall()}>
        <Download className="h-4 w-4" />
        Installer maintenant
      </Button>
    )
  }

  return (
    <Tabs
      value={family}
      onValueChange={(value) => setFamily(value as InstallFamily)}
      className="gap-3"
    >
      <TabsList className="grid w-full grid-cols-3">
        {INSTALL_FAMILIES.map((item) => (
          <TabsTrigger key={item.id} value={item.id} className="text-xs">
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {INSTALL_FAMILIES.map((item) => (
        <TabsContent key={item.id} value={item.id}>
          <GuideSteps
            guide={getGuideForFamily(item.id, isReady ? target : null)}
          />
        </TabsContent>
      ))}
    </Tabs>
  )
}

interface PwaInstallGuideProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: React.ReactNode
}

/** Guide d'installation, en boîte de dialogue sur toutes les tailles d'écran. */
export function PwaInstallGuide({
  open,
  onOpenChange,
  trigger,
}: PwaInstallGuideProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[85dvh] gap-4 overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Installer TripBrain</DialogTitle>
          <DialogDescription>
            Votre roadbook comme une appli, même sans réseau.
          </DialogDescription>
        </DialogHeader>
        <PwaInstallGuideContent />
      </DialogContent>
    </Dialog>
  )
}
