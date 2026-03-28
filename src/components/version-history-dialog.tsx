'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { ItinerarySnapshot } from '@/hooks/use-trip-data'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { History, RotateCcw, Clock } from 'lucide-react'

interface VersionHistoryDialogProps {
  open: boolean
  onClose: () => void
  getSnapshots: () => Promise<ItinerarySnapshot[]>
  onRestore: (id: string) => Promise<void>
}

export function VersionHistoryDialog({
  open,
  onClose,
  getSnapshots,
  onRestore,
}: VersionHistoryDialogProps) {
  const [snapshots, setSnapshots] = useState<ItinerarySnapshot[]>([])
  const [loading, setLoading] = useState(false)
  const [restoreId, setRestoreId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    getSnapshots()
      .then(setSnapshots)
      .finally(() => setLoading(false))
  }, [open, getSnapshots])

  const handleRestore = async () => {
    if (!restoreId) return
    await onRestore(restoreId)
    setRestoreId(null)
    onClose()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Historique des versions
            </DialogTitle>
            <DialogDescription>
              Restaurez une version précédente de votre itinéraire. Un
              instantané est automatiquement sauvegardé avant chaque session de
              modification.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground text-sm">Chargement…</p>
            </div>
          ) : snapshots.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Clock className="text-muted-foreground h-8 w-8" />
              <p className="text-muted-foreground text-sm">
                Aucun historique disponible.
                <br />
                Les instantanés sont créés automatiquement avant vos
                modifications.
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="flex flex-col gap-2 pr-1">
                {snapshots.map((snap) => (
                  <div
                    key={snap.id}
                    className="bg-muted/40 flex items-center justify-between rounded-lg px-3 py-2.5"
                  >
                    <div className="flex flex-col gap-0.5">
                      <p className="text-sm font-medium">{snap.label}</p>
                      <p className="text-muted-foreground text-xs">
                        {format(new Date(snap.timestamp), 'dd MMM yyyy – HH:mm', {
                          locale: fr,
                        })}
                        {' · '}
                        {snap.itinerary.length} jour
                        {snap.itinerary.length > 1 ? 's' : ''}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 shrink-0"
                      onClick={() => setRestoreId(snap.id)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Restaurer
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={restoreId !== null}
        onOpenChange={(v) => !v && setRestoreId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurer cette version ?</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;itinéraire actuel sera remplacé par la version sélectionnée.
              Pensez à exporter une sauvegarde si vous souhaitez conserver les
              modifications en cours.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore}>
              Restaurer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
