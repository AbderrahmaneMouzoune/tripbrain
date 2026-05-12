'use client'

import { useRef, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { compressToEncodedURIComponent } from 'lz-string'
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
  IconQrcode,
  IconDownload,
  IconAlertTriangle,
  IconCircleCheck,
} from '@tabler/icons-react'
import type { DayItinerary } from '@/lib/itinerary-data'

const QRCodeCanvas = dynamic(
  () => import('qrcode.react').then((m) => ({ default: m.QRCodeCanvas })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[256px] w-[256px] animate-pulse rounded-xl bg-muted" />
    ),
  },
)

/** Maximum byte length of compressed payload that a QR code can reliably hold */
const QR_MAX_BYTES = 2900

interface QrExportDialogProps {
  itinerary: DayItinerary[]
  /** Optional custom trigger — defaults to an icon button */
  trigger?: React.ReactNode
}

export function QrExportDialog({ itinerary, trigger }: QrExportDialogProps) {
  const [open, setOpen] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const { compressed, byteCount, isTooLarge } = useMemo(() => {
    const json = JSON.stringify({ itinerary })
    const compressed = compressToEncodedURIComponent(json)
    const byteCount = new TextEncoder().encode(compressed).length
    return { compressed, byteCount, isTooLarge: byteCount > QR_MAX_BYTES }
  }, [itinerary])

  const handleDownload = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = 'tripbrain-qr.png'
    a.click()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="icon" title="Exporter en QR Code">
            <IconQrcode className="h-5 w-5" />
            <span className="sr-only">Exporter en QR Code</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Exporter en QR Code</DialogTitle>
          <DialogDescription>
            Scannez ce code avec un autre appareil pour y importer votre
            itinéraire.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {/* Size warning / ok badge */}
          {isTooLarge ? (
            <div className="bg-destructive/10 text-destructive flex w-full items-start gap-2 rounded-lg px-4 py-3 text-sm">
              <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Données trop volumineuses</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {`L'itinéraire compressé fait ${byteCount.toLocaleString('fr-FR')} octets, ce qui dépasse la limite recommandée de ${QR_MAX_BYTES.toLocaleString('fr-FR')} octets. Le QR code pourrait ne pas être lisible par tous les scanners.`}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground flex w-full items-center gap-2 rounded-lg border px-4 py-2 text-xs">
              <IconCircleCheck className="text-primary h-4 w-4 shrink-0" />
              <span>
                Taille compressée :{' '}
                <span className="text-foreground font-medium">
                  {byteCount.toLocaleString('fr-FR')} octets
                </span>{' '}
                — compatible QR code
              </span>
            </div>
          )}

          {/* QR code canvas */}
          {isTooLarge ? (
            <div className="flex h-[256px] w-[256px] items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 text-destructive/60 text-xs text-center p-4">
              Données trop volumineuses pour générer un QR code
            </div>
          ) : (
            <div className="rounded-xl border p-3 shadow-sm">
              <QRCodeCanvas
                ref={canvasRef}
                value={compressed}
                size={240}
                level="M"
                marginSize={1}
              />
            </div>
          )}

          {/* Download button */}
          <Button
            onClick={handleDownload}
            disabled={isTooLarge}
            variant={isTooLarge ? 'outline' : 'default'}
            className="w-full gap-2"
          >
            <IconDownload className="h-4 w-4" />
            Télécharger le QR code (.png)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
