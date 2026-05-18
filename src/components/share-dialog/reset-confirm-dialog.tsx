'use client'

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
import { IconTrash } from '@tabler/icons-react'

interface ResetConfirmDialogProps {
  onConfirm: () => Promise<void>
}

export function ResetConfirmDialog({ onConfirm }: ResetConfirmDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          className="h-auto w-full justify-start gap-3 py-3"
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
          <AlertDialogTitle>Réinitialiser les données ?</AlertDialogTitle>
          <AlertDialogDescription>
            Cette action supprimera définitivement toutes les données de votre
            voyage. Pensez à exporter une sauvegarde avant de continuer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Réinitialiser
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
