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
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { downloadICS } from '@/lib/calendar-export'
import type { DayItinerary } from '@/lib/itinerary-data'
import { ShareExportDialog } from '@/components/share-dialog/share-export-dialog'
import { ImportShareDialog } from '@/components/share-dialog/import-share-dialog'
import { ResetConfirmDialog } from '@/components/share-dialog/reset-confirm-dialog'
import { PwaInstallEntry } from '@/components/pwa-install-prompt'
import {
  IconCalendar,
  IconDatabaseExport,
  IconDownload,
  IconKey,
  IconQrcode,
  IconShare2,
} from '@tabler/icons-react'
import { useState } from 'react'

const PROMPT_SOURCE = { kind: 'prompt' } as const

interface ShareDialogProps {
  itinerary: DayItinerary[]
  selectedDay?: number
  trigger?: React.ReactNode
  onClear: () => Promise<void>
  /** Enregistre un itinéraire reçu via un code de partage. */
  onImportShared: (itinerary: DayItinerary[]) => Promise<void>
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

  const handleClear = async () => {
    await onClear()
    setOpen(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          {trigger || (
            <Button variant="ghost" size="icon" title="Partager & données">
              <IconShare2 className="h-5 w-5" />
              <span className="sr-only">Partager & données</span>
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Partager & données</DialogTitle>
            <DialogDescription>
              Exportez votre voyage ou gérez vos données
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="data" className="mt-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="data" className="gap-1.5 text-xs">
                <IconDatabaseExport className="h-3.5 w-3.5" />
                Données
              </TabsTrigger>
              <TabsTrigger value="calendar" className="gap-1.5 text-xs">
                <IconCalendar className="h-3.5 w-3.5" />
                Calendrier
              </TabsTrigger>
            </TabsList>

            {/* ── Données ── */}
            <TabsContent value="data" className="mt-4 space-y-3">
              {/* Partage : QR code ou code à recopier */}
              <Button
                variant="outline"
                className="border-border bg-muted/40 hover:bg-muted/70 h-auto w-full justify-start gap-3 py-3"
                onClick={() => {
                  setOpen(false)
                  setExportOpen(true)
                }}
              >
                <span className="bg-primary/10 text-primary inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
                  <IconQrcode className="h-4 w-4" />
                </span>
                <div className="text-left">
                  <p className="text-foreground text-sm font-medium">
                    Partager l’itinéraire
                  </p>
                  <p className="text-muted-foreground text-xs">
                    QR code à scanner ou code à recopier
                  </p>
                </div>
              </Button>

              {/* Réception d'un partage */}
              <Button
                variant="outline"
                className="border-border bg-muted/40 hover:bg-muted/70 h-auto w-full justify-start gap-3 py-3"
                onClick={() => {
                  setOpen(false)
                  setImportOpen(true)
                }}
              >
                <span className="bg-secondary/10 text-secondary inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
                  <IconKey className="h-4 w-4" />
                </span>
                <div className="text-left">
                  <p className="text-foreground text-sm font-medium">
                    Importer un partage
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Saisir un code reçu depuis un autre appareil
                  </p>
                </div>
              </Button>

              {/* Installation sur l'écran d'accueil */}
              <PwaInstallEntry onSelect={() => setOpen(false)} />

              <Separator />

              {/* Reset */}
              <ResetConfirmDialog onConfirm={handleClear} />
            </TabsContent>

            {/* ── Calendrier ── */}
            <TabsContent value="calendar" className="mt-4 space-y-4">
              <div className="flex flex-col gap-3">
                <p className="text-muted-foreground text-sm">
                  Exportez votre voyage vers votre application de calendrier
                  préférée (Apple Calendar, Outlook…)
                </p>

                <Button
                  onClick={() => downloadICS(itinerary, 'tripbrain-voyage.ics')}
                  className="w-full gap-2"
                >
                  <IconDownload className="h-4 w-4" />
                  Télécharger tout le voyage (.ics)
                </Button>

                {selectedDay !== undefined && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const day = itinerary[selectedDay]
                      downloadICS([day], `tripbrain-jour-${day.dayNumber}.ics`)
                    }}
                    className="w-full gap-2"
                  >
                    <IconDownload className="h-4 w-4" />
                    Télécharger ce jour (.ics)
                  </Button>
                )}
              </div>
            </TabsContent>
          </Tabs>
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
