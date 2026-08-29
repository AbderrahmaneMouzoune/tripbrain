'use client'

import { useState } from 'react'
import { Download, Smartphone, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PwaInstallGuide } from '@/components/pwa-install-guide'
import { usePwaInstall } from '@/hooks/use-pwa-install'

/**
 * Invitation à installer TripBrain, affichée sur l'écran d'accueil de
 * l'onboarding — le moment où l'on découvre l'app et où l'installer a le plus
 * de sens. Disparaît dès que l'app tourne en mode application.
 */
export function PwaInstallCard() {
  const { isReady, isStandalone, isInstalled, canPrompt, promptInstall } =
    usePwaInstall()
  const [guideOpen, setGuideOpen] = useState(false)

  if (!isReady || isStandalone || isInstalled) return null

  return (
    <>
      <div className="bg-primary/5 border-primary/15 flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center">
        <span className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
          <Smartphone className="h-4 w-4" strokeWidth={1.75} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-foreground text-sm font-medium">
            Installez TripBrain comme une application
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Une icône sur votre écran d’accueil, un accès hors connexion à votre
            roadbook et à vos billets.
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          {canPrompt && (
            <Button
              size="sm"
              onClick={() => promptInstall()}
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              Installer
            </Button>
          )}
          <Button
            variant={canPrompt ? 'ghost' : 'outline'}
            size="sm"
            onClick={() => setGuideOpen(true)}
          >
            {canPrompt ? 'Comment faire ?' : 'Voir la marche à suivre'}
          </Button>
        </div>
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
    canPrompt,
    promptInstall,
  } = usePwaInstall()
  const [guideOpen, setGuideOpen] = useState(false)

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
            Installez TripBrain pour l’ouvrir comme une appli, même sans réseau.
          </p>

          <Button
            size="sm"
            variant="outline"
            className="border-primary/40 h-7 shrink-0 gap-1 text-xs"
            onClick={() => {
              if (canPrompt) {
                promptInstall()
                return
              }
              setGuideOpen(true)
            }}
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
