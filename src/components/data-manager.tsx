'use client'

import { useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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
import { Download, Upload, Trash2, Database, AlertCircle } from 'lucide-react'

interface DataManagerProps {
  onExport: () => void
  onImport: (file: File) => Promise<void>
  onClear: () => Promise<void>
}

export function DataManager({ onExport, onImport, onClear }: DataManagerProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingImport, setLoadingImport] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.json') && !file.name.endsWith('.csv')) {
      setError('Veuillez sélectionner un fichier JSON ou CSV.')
      return
    }
    setError(null)
    setLoadingImport(true)
    try {
      await onImport(file)
      setOpen(false)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de lire le fichier. Vérifiez qu'il respecte le format TripBrain.",
      )
      // Reset input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = ''
    } finally {
      setLoadingImport(false)
    }
  }

  const handleClear = async () => {
    await onClear()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Gérer les données">
          <Database className="h-5 w-5" />
          <span className="sr-only">Gérer les données</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Gestion des données</DialogTitle>
          <DialogDescription>
            Exportez, importez ou réinitialisez les données de votre voyage.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg px-4 py-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-col gap-3 pt-2">
          {/* Export */}
          <Button
            variant="outline"
            className="w-full justify-start gap-3"
            onClick={() => {
              onExport()
              setOpen(false)
            }}
          >
            <Download className="h-4 w-4 shrink-0" />
            <div className="text-left">
              <p className="text-sm font-medium">Exporter mes données</p>
              <p className="text-muted-foreground text-xs">
                Télécharger un fichier JSON de sauvegarde
              </p>
            </div>
          </Button>

          {/* Import */}
          <Button
            variant="outline"
            className="w-full justify-start gap-3"
            onClick={() => {
              setError(null)
              fileInputRef.current?.click()
            }}
            disabled={loadingImport}
          >
            <Upload className="h-4 w-4 shrink-0" />
            <div className="text-left">
              <p className="text-sm font-medium">
                {loadingImport ? 'Chargement…' : 'Importer des données'}
              </p>
              <p className="text-muted-foreground text-xs">
                Remplacer avec un fichier JSON ou CSV
              </p>
            </div>
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json,.csv,text/csv"
            className="sr-only"
            onChange={handleFileChange}
          />

          {/* Reset */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive w-full justify-start gap-3"
              >
                <Trash2 className="h-4 w-4 shrink-0" />
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
                <AlertDialogTitle>Réinitialiser les données ?</AlertDialogTitle>
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
