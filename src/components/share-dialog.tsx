'use client'

import { ImportFormatGuide } from '@/components/import-format-guide'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
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
import { IconFileExport, IconFileImport, IconTrash } from '@tabler/icons-react'
import {
  AlertCircle,
  CalendarDays,
  Download,
  HardDriveDownload,
  Share2,
} from 'lucide-react'
import { useRef, useState } from 'react'

interface ShareDialogProps {
  itinerary: DayItinerary[]
  selectedDay?: number
  trigger?: React.ReactNode
  onExport: () => void
  onImport: (file: File) => Promise<void>
  onImportXlsx: (file: File) => Promise<void>
  onImportCsv: (files: File[]) => Promise<void>
  onClear: () => Promise<void>
}

export function ShareDialog({
  itinerary,
  selectedDay,
  trigger,
  onExport,
  onImport,
  onImportXlsx,
  onImportCsv,
  onClear,
}: ShareDialogProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingImport, setLoadingImport] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return

    setError(null)
    setLoadingImport(true)

    try {
      if (files.length > 1) {
        if (files.some((f) => !f.name.toLowerCase().endsWith('.csv'))) {
          setError(
            'En cas de sélection multiple, tous les fichiers doivent être des .csv',
          )
          return
        }
        await onImportCsv(files)
        setOpen(false)
        return
      }

      const file = files[0]
      const name = file.name.toLowerCase()
      if (name.endsWith('.json')) {
        await onImport(file)
      } else if (name.endsWith('.xlsx')) {
        await onImportXlsx(file)
      } else if (name.endsWith('.csv')) {
        setError(
          'Pour importer en CSV, sélectionnez les 3 fichiers simultanément (days.csv, activities.csv, transports.csv)',
        )
        return
      } else {
        setError(
          'Format non supporté. Utilisez un fichier .json, .xlsx, ou 3 fichiers .csv',
        )
        return
      }
      setOpen(false)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de lire le fichier. Vérifiez qu'il s'agit d'un export TripBrain valide.",
      )
      if (fileInputRef.current) fileInputRef.current.value = ''
    } finally {
      setLoadingImport(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(Array.from(e.target.files ?? []))
    if (e.target) e.target.value = ''
  }

  const handleClear = async () => {
    await onClear()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon" title="Partager & données">
            <Share2 className="h-5 w-5" />
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
              <HardDriveDownload className="h-3.5 w-3.5" />
              Données
            </TabsTrigger>
            <TabsTrigger value="calendar" className="gap-1.5 text-xs">
              <CalendarDays className="h-3.5 w-3.5" />
              Calendrier
            </TabsTrigger>
          </TabsList>

          {/* ── Données ── */}
          <TabsContent value="data" className="mt-4 space-y-3">
            {error && (
              <div className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg px-4 py-3 text-sm">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Export */}
            <Button
              variant="outline"
              className="border-border bg-muted/40 hover:bg-muted/70 h-auto w-full justify-start gap-3 py-3"
              onClick={() => {
                onExport()
                setOpen(false)
              }}
            >
              <span className="bg-primary/10 text-primary inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
                <IconFileExport className="h-4 w-4" />
              </span>
              <div className="text-left">
                <p className="text-foreground text-sm font-medium">
                  Exporter mes données
                </p>
                <p className="text-muted-foreground text-xs">
                  Télécharger un fichier JSON de sauvegarde
                </p>
              </div>
            </Button>

            {/* Import */}
            <Button
              variant="outline"
              className="border-border h-auto w-full justify-start gap-3 py-3"
              onClick={() => {
                setError(null)
                fileInputRef.current?.click()
              }}
              disabled={loadingImport}
            >
              <span className="bg-secondary text-secondary-foreground inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
                <IconFileImport className="h-4 w-4" />
              </span>
              <div className="text-left">
                <p className="text-foreground text-sm font-medium">
                  {loadingImport ? 'Chargement…' : 'Importer des données'}
                </p>
                <p className="text-muted-foreground text-xs">
                  Formats : .json, .xlsx, ou 3 fichiers .csv
                </p>
              </div>
            </Button>

            <div className="flex justify-center">
              <ImportFormatGuide />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.xlsx,.csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              multiple
              className="sr-only"
              onChange={handleFileChange}
            />

            <Separator />

            {/* Reset */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="border-border h-auto w-full justify-start gap-3 py-3"
                >
                  <span className="bg-destructive text-destructive-foreground inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
                    <IconTrash className="h-4 w-4" stroke={1.9} />
                  </span>
                  <div className="text-left">
                    <p className="text-sm font-medium">Réinitialiser</p>
                    <p className="text-muted-foreground text-xs">
                      Supprimer toutes les données du voyage
                    </p>
                  </div>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Réinitialiser les données ?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Cette action supprimera définitivement toutes les données de
                    votre voyage. Pensez à exporter une sauvegarde avant de
                    continuer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleClear}
                  >
                    Réinitialiser
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
                <Download className="h-4 w-4" />
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
                  <Download className="h-4 w-4" />
                  Télécharger ce jour (.ics)
                </Button>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
