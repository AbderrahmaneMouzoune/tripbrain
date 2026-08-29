'use client'

import { useState } from 'react'
import { Download, Smartphone, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PwaInstallGuide } from '@/components/pwa-install-guide'
import { usePwaInstall } from '@/hooks/use-pwa-install'

/**
 * Un seul geste pour l'utilisateur : « Installer ». L'invite native s'ouvre
 * quand le navigateur en propose une, le guide prend le relais sinon.
 */
function useInstallAction() {
  const install = usePwaInstall()
  const [guideOpen, setGuideOpen] = useState(false)

  return {
    ...install,
    guideOpen,
    setGuideOpen,
    startInstall: () => {
      if (install.canPrompt) {
        install.promptInstall()
        return
      }
      setGuideOpen(true)
    },
  }
}

/**
 * Invitation à installer TripBrain, affichée sur l'écran d'onboarding — le
 * moment où l'on découvre l'app. Disparaît une fois l'app installée.
 */
export function PwaInstallCard() {
  const {
    isReady,
    isStandalone,
    isInstalled,
    guideOpen,
    setGuideOpen,
    startInstall,
  } = useInstallAction()

  if (!isReady || isStandalone || isInstalled) return null

  return (
    <>
      <div className="bg-primary/5 border-primary/15 flex items-center gap-3 rounded-xl border p-3">
        <span className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
          <Smartphone className="h-4 w-4" strokeWidth={1.75} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-foreground text-sm font-medium">
            Installer TripBrain
          </p>
          <p className="text-muted-foreground text-xs">
            Comme une appli, même sans réseau.
          </p>
        </div>

        <Button size="sm" variant="outline" onClick={startInstall}>
          Installer
        </Button>
      </div>

      <PwaInstallGuide open={guideOpen} onOpenChange={setGuideOpen} />
    </>
  )
}

/**
 * Rappel discret pour les voyageurs qui utilisent déjà TripBrain dans un
 * onglet. Reportable : « Plus tard » met la proposition en sommeil 14 jours.
 */
export function PwaInstallBanner() {
  const {
    isReady,
    guide,
    isStandalone,
    isInstalled,
    isSnoozed,
    snooze,
    guideOpen,
    setGuideOpen,
    startInstall,
  } = useInstallAction()

  // Rien à proposer quand le navigateur n'installe pas les applications web.
  const isActionable = guide !== null && !guide.unsupported

  if (!isReady || !isActionable || isStandalone || isInstalled || isSnoozed) {
    return null
  }

  return (
    <>
      <div className="border-primary/20 bg-primary/5 border-b px-4 py-2">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <Smartphone
            className="text-primary h-4 w-4 shrink-0"
            strokeWidth={1.75}
          />
          <p className="text-foreground min-w-0 flex-1 text-xs font-medium sm:text-sm">
            Ajoutez TripBrain à votre écran d’accueil
          </p>

          <Button
            size="sm"
            variant="outline"
            className="border-primary/40 h-7 shrink-0 gap-1 text-xs"
            onClick={startInstall}
          >
            <Download className="h-3.5 w-3.5" />
            Installer
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={snooze}
            aria-label="Masquer la proposition d’installation"
            title="Plus tard"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <PwaInstallGuide open={guideOpen} onOpenChange={setGuideOpen} />
    </>
  )
}
