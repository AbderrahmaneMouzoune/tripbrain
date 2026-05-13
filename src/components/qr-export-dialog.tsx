'use client'

import { useCallback, useEffect, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
  IconCloudUpload,
  IconDownload,
  IconQrcode,
  IconRefresh,
} from '@tabler/icons-react'
import type { DayItinerary } from '@/lib/itinerary-data'
import {
  QR_INLINE_LIMIT,
  compressItinerary,
  getInlineQrUrl,
  uploadItinerary,
} from '@/lib/qr-export'

interface QrExportDialogProps {
  itinerary: DayItinerary[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

type QrExportState =
  | { status: 'loading' }
  | { status: 'ready'; qrValue: string }
  | { status: 'needs-upload' }
  | { status: 'uploading' }
  | { status: 'error'; message: string }

export function QrExportDialog({
  itinerary,
  open,
  onOpenChange,
}: QrExportDialogProps) {
  const [state, setState] = useState<QrExportState>({ status: 'loading' })
  const [revision, setRevision] = useState(0)

  // À l'ouverture, vérifie si l'inline suffit ou si un upload est nécessaire.
  // Si les données tiennent dans le QR, le code est généré directement.
  useEffect(() => {
    if (!open) return

    setState({ status: 'loading' })

    compressItinerary(itinerary)
      .then((compressed) => {
        if (compressed.length <= QR_INLINE_LIMIT) {
          setState({ status: 'ready', qrValue: getInlineQrUrl(compressed) })
        } else {
          setState({ status: 'needs-upload' })
        }
      })
      .catch((err) => {
        setState({
          status: 'error',
          message:
            err instanceof Error
              ? err.message
              : 'Erreur lors de la compression',
        })
      })
  }, [open, itinerary, revision])

  const handleUpload = useCallback(async () => {
    setState({ status: 'uploading' })
    try {
      const url = await uploadItinerary(itinerary)
      setState({ status: 'ready', qrValue: url })
    } catch (err) {
      setState({
        status: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Erreur lors du téléversement',
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

        {/* min-h stable pour éviter le layout shift entre les états */}
        <div className="flex min-h-[22rem] flex-col items-center justify-center gap-4 py-2">
          {(state.status === 'loading' || state.status === 'uploading') && (
            <div className="flex flex-col items-center gap-3">
              <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
              <p className="text-muted-foreground text-sm">
                {state.status === 'loading'
                  ? 'Analyse de l\u2019itinéraire\u2026'
                  : 'Téléversement en cours\u2026'}
              </p>
            </div>
          )}

          {state.status === 'needs-upload' && (
            <div className="flex w-full flex-col gap-4">
              <Alert variant="warning">
                <IconAlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Votre itinéraire est trop volumineux pour être intégré
                  directement dans un QR code. Les données seront téléversées
                  sur le web dans une URL temporaire valide{' '}
                  <strong>10&nbsp;minutes</strong>.
                </AlertDescription>
              </Alert>
              <Button onClick={handleUpload} className="w-full gap-2">
                <IconCloudUpload className="h-4 w-4" />
                Téléverser et générer le QR Code
              </Button>
            </div>
          )}

          {state.status === 'ready' && (
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
                  onClick={() => setRevision((r) => r + 1)}
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
            <div className="flex w-full flex-col gap-4">
              <Alert variant="destructive">
                <IconAlertTriangle className="h-4 w-4" />
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
              <Button
                variant="outline"
                onClick={() => setRevision((r) => r + 1)}
                className="w-full gap-2"
              >
                <IconRefresh className="h-4 w-4" />
                Réessayer
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
