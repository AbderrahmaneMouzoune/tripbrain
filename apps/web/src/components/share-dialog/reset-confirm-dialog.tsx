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
import { ActionRow } from '@/components/share-dialog/action-row'
import { IconTrash } from '@tabler/icons-react'

interface ResetConfirmDialogProps {
  onConfirm: () => Promise<void>
}

export function ResetConfirmDialog({ onConfirm }: ResetConfirmDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <ActionRow
          icon={IconTrash}
          tone="destructive"
          label="Réinitialiser"
          description="Supprimer le voyage et les documents de cet appareil"
          className="hover:border-destructive/40 hover:bg-destructive/5"
        />
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
