'use client'

import { useCallback, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  IconAlertTriangle,
  IconDownload,
  IconQrcode,
  IconRefresh,
} from '@tabler/icons-react'
import type { DayItinerary } from '@/lib/itinerary-data'
import { exportItineraryQR } from '@/lib/qr-export'

interface QrExportDialogProps {
  itinerary: DayItinerary[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; qrValue: string }
  | { status: 'error'; message: string }

export function QrExportDialog({
  itinerary,
  open,
  onOpenChange,
}: QrExportDialogProps) {
  const [state, setState] = useState<State>({ status: 'idle' })

  const generate = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const qrValue = await exportItineraryQR(itinerary)
      setState({ status: 'success', qrValue })
    } catch (err) {
      setState({
        status: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Erreur lors de la génération du QR code',
      })
    }
  }, [itinerary])

  const handleDownload = useCallback(() => {
    const canvas = document.querySelector(
      '#qr-export-canvas',
    ) as HTMLCanvasElement | null
    if (!canvas) return
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = 'tripbrain-qrcode.png'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [])

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setState({ status: 'idle' })
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconQrcode className="h-5 w-5" />
            Exporter en QR Code
          </DialogTitle>
          <DialogDescription>
            Partagez cet itinéraire via un QR code
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {state.status === 'idle' && (
            <>
              <p className="text-muted-foreground text-center text-sm">
                Générez un QR code pour partager votre itinéraire. Les petits
                itinéraires sont intégrés directement dans le code.
              </p>
              <Button onClick={generate} className="w-full gap-2">
                <IconQrcode className="h-4 w-4" />
                Générer le QR Code
              </Button>
            </>
          )}

          {state.status === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
              <p className="text-muted-foreground text-sm">
                Génération en cours…
              </p>
            </div>
          )}

          {state.status === 'success' && (
            <>
              <div className="rounded-lg bg-white p-3 shadow-sm">
                <QRCodeCanvas
                  id="qr-export-canvas"
                  value={state.qrValue}
                  size={220}
                  level="M"
                  marginSize={1}
                />
              </div>
              <p className="text-muted-foreground text-center text-xs">
                Scannez ce code pour accéder à l&apos;itinéraire
              </p>
              <div className="flex w-full gap-2">
                <Button
                  variant="outline"
                  onClick={() => setState({ status: 'idle' })}
                  className="flex-1 gap-2"
                >
                  <IconRefresh className="h-4 w-4" />
                  Régénérer
                </Button>
                <Button onClick={handleDownload} className="flex-1 gap-2">
                  <IconDownload className="h-4 w-4" />
                  Télécharger
                </Button>
              </div>
            </>
          )}

          {state.status === 'error' && (
            <>
              <div className="bg-destructive/10 text-destructive flex w-full items-start gap-2 rounded-lg px-4 py-3 text-sm">
                <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{state.message}</span>
              </div>
              <Button
                variant="outline"
                onClick={() => setState({ status: 'idle' })}
                className="w-full gap-2"
              >
                <IconRefresh className="h-4 w-4" />
                Réessayer
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
