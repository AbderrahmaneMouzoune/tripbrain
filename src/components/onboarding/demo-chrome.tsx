'use client'

import { useState } from 'react'
import { FileText, FlaskConical, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BottomSheet } from '@/components/mobile/bottom-sheet'
import { ListRow } from '@/components/mobile/list-row'
import { useTrip } from '@/components/app/trip-provider'
import { useAppNav } from '@/components/app/navigation'
import { trackEvent } from '@/lib/analytics/client'
import { IntentionOptions } from '@/components/onboarding/intention-options'

/**
 * Pendant la démo : une pastille « Voyage exemple » pour qu'on ne la prenne
 * pas pour son propre voyage, un moyen d'en sortir, et une invitation à
 * charger le sien. Rien n'est rendu hors démo.
 */
export function DemoChrome(_props: {}) {
  const { isDemo, activeTrip, deleteTrip } = useTrip()
  const { tab, push } = useAppNav()
  const [inviteDismissed, setInviteDismissed] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)

  if (!isDemo || !activeTrip) return null

  const quitDemo = async () => {
    setLeaving(true)
    trackEvent('demo_exited')
    trackEvent('data_cleared', { surface: 'demo_banner' })
    try {
      // Sans autre voyage, l'accueil revient de lui-même.
      await deleteTrip(activeTrip.id)
    } finally {
      setLeaving(false)
    }
  }

  /** Ferme la feuille avant d'ouvrir l'écran choisi, pour ne pas les empiler. */
  const choose = (open: () => void) => {
    setSheetOpen(false)
    open()
  }

  return (
    <>
      <div className="animate-fade mx-auto flex w-full max-w-xl items-center justify-between gap-3 px-5 pt-[calc(env(safe-area-inset-top)+12px)]">
        <span className="bg-secondary-soft text-secondary-strong border-secondary flex items-center gap-1.5 rounded-full border-[1.5px] border-dashed py-1.5 pr-3 pl-2.5 text-[13px] font-extrabold">
          <FlaskConical className="size-4" aria-hidden />
          Voyage exemple
        </span>
        <Button
          variant="ghost"
          className="text-muted-foreground min-h-11 px-2 text-sm font-extrabold"
          onClick={quitDemo}
          disabled={leaving}
        >
          Quitter
        </Button>
      </div>

      {/* La carte flotte au-dessus de la barre d'onglets ; la carte (onglet) a ses propres commandes en bas. */}
      {!inviteDismissed && (tab === 'today' || tab === 'program') && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom)+12px)] z-30 px-3">
          <div className="bg-ink text-ink-foreground animate-rise pointer-events-auto mx-auto flex max-w-xl items-center gap-3 rounded-[20px] py-3.5 pr-2 pl-4 shadow-[0_12px_30px_rgba(6,20,60,0.3)] [animation-delay:0.6s]">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-black">
                Ça vous parle ?
              </span>
              <span className="text-ink-foreground/70 block text-[13px]">
                Chargez votre voyage en une minute.
              </span>
            </span>
            <Button
              variant="secondary"
              className="h-11 rounded-xl px-4 text-[15px] font-black"
              onClick={() => setSheetOpen(true)}
            >
              Commencer
            </Button>
            <Button
              variant="ghost"
              size="icon-round"
              aria-label="Masquer l’invitation"
              className="text-ink-foreground/70 hover:text-ink-foreground shrink-0 hover:bg-transparent"
              onClick={() => setInviteDismissed(true)}
            >
              <X />
            </Button>
          </div>
        </div>
      )}

      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Où en est votre voyage ?"
        description="Choisissez votre point de départ, on s’occupe du reste."
      >
        <IntentionOptions
          onChoose={(choice) =>
            choose(() =>
              push(
                choice === 'generator'
                  ? { kind: 'generator' }
                  : { kind: 'receive', method: choice },
              ),
            )
          }
        />
        <ListRow
          icon={FileText}
          tone="muted"
          label="J’ai un fichier"
          description="JSON, Excel ou CSV"
          className="mt-2"
          onClick={() => choose(() => push({ kind: 'import-file' }))}
        />
      </BottomSheet>
    </>
  )
}
