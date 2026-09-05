'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { downloadICS } from '@/lib/calendar-export'
import { SHARE_CODE_LENGTH } from '@/lib/share'
import type { DayItinerary } from '@/lib/itinerary-data'
import { ActionRow } from '@/components/share-dialog/action-row'
import { ShareExportDialog } from '@/components/share-dialog/share-export-dialog'
import { ImportShareDialog } from '@/components/share-dialog/import-share-dialog'
import { ResetConfirmDialog } from '@/components/share-dialog/reset-confirm-dialog'
import { usePwaInstall } from '@/components/pwa-install-provider'
import {
  IconCalendarPlus,
  IconCalendarWeek,
  IconDeviceMobile,
  IconDeviceMobilePlus,
  IconDownload,
  IconKey,
  IconQrcode,
  IconShare2,
  IconShieldLock,
} from '@tabler/icons-react'
import { useState } from 'react'
import { trackEvent } from '@/lib/analytics/client'

const PROMPT_SOURCE = { kind: 'prompt' } as const

interface ShareDialogProps {
  itinerary: DayItinerary[]
  selectedDay?: number
  trigger?: React.ReactNode
  onClear: () => Promise<void>
  /** Enregistre un itinéraire reçu via un code de partage. */
  onImportShared: (itinerary: DayItinerary[]) => Promise<void>
}

/** Intitulé de section : repère visuel, sans peser dans la hiérarchie. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-muted-foreground px-1 text-[0.6875rem] font-semibold tracking-wider uppercase">
      {children}
    </h3>
  )
}

export function ShareDialog({
  itinerary,
  selectedDay,
  trigger,
  onClear,
  onImportShared,
}: ShareDialogProps) {
  const [open, setOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  // L'installation disparaît de la liste dès que l'app tourne déjà installée.
  const { canInstall, open: openInstallPrompt } = usePwaInstall()

  const handleClear = async () => {
    trackEvent('data_cleared', { surface: 'share_dialog' })
    await onClear()
    setOpen(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (next) trackEvent('share_opened')
    setOpen(next)
  }

  const dayCount = itinerary.length
  const currentDay =
    selectedDay !== undefined ? itinerary[selectedDay] : undefined

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          {trigger || (
            <Button variant="ghost" size="icon" title="Partager & données">
              <IconShare2 className="h-5 w-5" />
              <span className="sr-only">Partager & données</span>
            </Button>
          )}
        </DialogTrigger>

        {/* En-tête fixe, contenu défilant : la dialog ne dépasse jamais l'écran. */}
        <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="px-4 pt-5 pb-3 text-left sm:px-6 sm:pt-6">
            <DialogTitle className="pr-8">Partager &amp; données</DialogTitle>
            <DialogDescription>
              Envoyez votre voyage sur un autre appareil, ajoutez-le à votre
              agenda ou effacez-le.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-5 overflow-y-auto overscroll-contain px-4 pt-1 pb-5 sm:px-6 sm:pb-6">
            <p className="text-muted-foreground bg-muted/40 flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-relaxed">
              <IconDeviceMobile className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Votre voyage vit sur cet appareil : le partage est le seul moyen
                de le retrouver ailleurs.
              </span>
            </p>

            {/* ── Partage ── */}
            <section className="flex flex-col gap-2">
              <SectionTitle>Partage</SectionTitle>

              <ActionRow
                icon={IconQrcode}
                tone="primary"
                label="Partager l’itinéraire"
                description="Lien à envoyer, QR code à scanner ou code à dicter"
                onClick={() => {
                  setOpen(false)
                  setExportOpen(true)
                }}
              />

              <ActionRow
                icon={IconKey}
                tone="secondary"
                label="Recevoir un partage"
                description={`Saisir les ${SHARE_CODE_LENGTH} chiffres affichés sur l’autre appareil`}
                onClick={() => {
                  setOpen(false)
                  setImportOpen(true)
                }}
              />
            </section>

            {/* ── Calendrier ── */}
            <section className="flex flex-col gap-2">
              <SectionTitle>Calendrier</SectionTitle>

              <ActionRow
                icon={IconCalendarWeek}
                tone="primary"
                label="Ajouter tout le voyage"
                description={`Fichier .ics — ${dayCount} jour${dayCount > 1 ? 's' : ''} vers Apple Calendar, Google Agenda ou Outlook`}
                trailing={
                  <IconDownload className="text-muted-foreground/60 mt-1 h-4 w-4 shrink-0" />
                }
                onClick={() => {
                  trackEvent('calendar_exported', { scope: 'trip' })
                  downloadICS(itinerary, 'tripbrain-voyage.ics')
                }}
              />

              {currentDay && (
                <ActionRow
                  icon={IconCalendarPlus}
                  tone="neutral"
                  label={`Ajouter le jour ${currentDay.dayNumber}`}
                  description={`Fichier .ics — ${currentDay.city} uniquement`}
                  trailing={
                    <IconDownload className="text-muted-foreground/60 mt-1 h-4 w-4 shrink-0" />
                  }
                  onClick={() => {
                    trackEvent('calendar_exported', { scope: 'day' })
                    downloadICS(
                      [currentDay],
                      `tripbrain-jour-${currentDay.dayNumber}.ics`,
                    )
                  }}
                />
              )}
            </section>

            {/* ── Application ── */}
            {canInstall && (
              <section className="flex flex-col gap-2">
                <SectionTitle>Application</SectionTitle>

                <ActionRow
                  icon={IconDeviceMobilePlus}
                  tone="secondary"
                  label="Installer l’application"
                  description="Sur l’écran d’accueil, en plein écran et consultable hors ligne"
                  onClick={() => {
                    setOpen(false)
                    openInstallPrompt('manual')
                  }}
                />
              </section>
            )}

            {/* ── Vos données ── */}
            <section className="flex flex-col gap-2">
              <SectionTitle>Vos données</SectionTitle>

              <ActionRow
                icon={IconShieldLock}
                tone="neutral"
                label="Confidentialité"
                description="Ce qui reste sur l’appareil, et réglage de la mesure d’audience"
                href="/politique-de-confidentialite"
                onClick={() => setOpen(false)}
              />

              <ResetConfirmDialog onConfirm={handleClear} />
            </section>
          </div>
        </DialogContent>
      </Dialog>

      <ShareExportDialog
        itinerary={itinerary}
        open={exportOpen}
        onOpenChange={setExportOpen}
        onNavBack={() => setOpen(true)}
      />

      <ImportShareDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        source={PROMPT_SOURCE}
        hasExistingData
        onImport={onImportShared}
        onNavBack={() => setOpen(true)}
      />
    </>
  )
}
