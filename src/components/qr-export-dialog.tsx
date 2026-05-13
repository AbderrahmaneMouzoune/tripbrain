'use client'

import { useCallback, useEffect, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  IconAlertTriangle,
  IconArrowLeft,
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
import { cn } from '@/lib/utils'

// Étapes affichées pendant la compression locale
const LOADING_STEPS = [
  'Analyse de l\u2019itinéraire\u2026',
  'Encodage des données\u2026',
  'Compression en cours\u2026',
]

// Étapes affichées pendant le téléversement R2
const UPLOADING_STEPS = [
  'Connexion au serveur\u2026',
  'Téléversement des données\u2026',
  'Génération du lien de partage\u2026',
]

/** Convertit une erreur inconnue en message explicite en français. */
function toFrenchError(err: unknown, context: 'upload' | 'compress'): string {
  if (!(err instanceof Error)) {
    return context === 'upload'
      ? 'Erreur inconnue lors du téléversement.'
      : 'Erreur inconnue lors de la compression.'
  }
  const msg = err.message.toLowerCase()
  if (msg.includes('network') || msg.includes('failed to fetch')) {
    return 'Erreur réseau\u00a0: vérifiez votre connexion internet et réessayez.'
  }
  if (msg.includes('failed to upload') || msg.includes('upload')) {
    return 'Échec du téléversement. Vérifiez votre connexion et réessayez.'
  }
  if (msg.includes('url de partage invalide')) {
    return 'Le serveur n\u2019a pas retourné d\u2019URL valide. Réessayez dans quelques instants.'
  }
  if (context === 'upload') {
    return `Échec du téléversement\u00a0: ${err.message}`
  }
  return `Erreur de compression\u00a0: ${err.message}`
}

interface QrExportDialogProps {
  itinerary: DayItinerary[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

type QrExportState =
  | { status: 'loading' }
  | { status: 'ready'; qrValue: string }
  | { status: 'needs-upload'; compressed: string }
  | { status: 'uploading' }
  | { status: 'error'; message: string }

export function QrExportDialog({
  itinerary,
  open,
  onOpenChange,
}: QrExportDialogProps) {
  const [state, setState] = useState<QrExportState>({ status: 'loading' })
  const [revision, setRevision] = useState(0)
  const [stepIndex, setStepIndex] = useState(0)

  // Anime les étapes de chargement / téléversement
  useEffect(() => {
    if (state.status !== 'loading' && state.status !== 'uploading') return
    const steps =
      state.status === 'uploading' ? UPLOADING_STEPS : LOADING_STEPS
    setStepIndex(0)
    const id = setInterval(() => {
      setStepIndex((i) => (i + 1) % steps.length)
    }, 1200)
    return () => clearInterval(id)
  }, [state.status])

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
          setState({ status: 'needs-upload', compressed })
        }
      })
      .catch((err) => {
        setState({ status: 'error', message: toFrenchError(err, 'compress') })
      })
  }, [open, itinerary, revision])

  const handleUpload = useCallback(async () => {
    if (state.status !== 'needs-upload') return
    const { compressed } = state
    setState({ status: 'uploading' })
    try {
      const url = await uploadItinerary(compressed)
      setState({ status: 'ready', qrValue: url })
    } catch (err) {
      setState({ status: 'error', message: toFrenchError(err, 'upload') })
    }
  }, [state])

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

  const isLoading = state.status === 'loading' || state.status === 'uploading'
  const activeSteps =
    state.status === 'uploading' ? UPLOADING_STEPS : LOADING_STEPS

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconQrcode className="h-5 w-5" />
            Exporter en QR Code
          </DialogTitle>
          {/* Bouton retour en haut à droite */}
          <DialogClose
            aria-label="Retour"
            className="ring-offset-background focus:ring-ring absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <IconArrowLeft />
            <span className="sr-only">Retour</span>
          </DialogClose>
        </DialogHeader>

        {/* Conteneur stable — min-h évite le layout shift entre les états */}
        <div className="flex min-h-[22rem] flex-col py-2">
          {/* Zone de contenu principal */}
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            {isLoading && (
              <div className="flex flex-col items-center gap-4">
                <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
                <div className="flex flex-col items-center gap-1">
                  {activeSteps.map((step, i) => (
                    <p
                      key={step}
                      className={cn(
                        'text-sm transition-all duration-300',
                        i === stepIndex
                          ? 'text-foreground font-medium opacity-100'
                          : 'text-muted-foreground opacity-40',
                      )}
                    >
                      {step}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {state.status === 'needs-upload' && (
              <Alert variant="warning" className="w-full">
                <IconAlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Votre itinéraire est trop volumineux pour être intégré
                  directement dans un QR code. Les données seront téléversées
                  sur le web dans une URL temporaire valide{' '}
                  <strong>10&nbsp;minutes</strong>.
                </AlertDescription>
              </Alert>
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
              </>
            )}

            {state.status === 'error' && (
              <Alert variant="destructive" className="w-full">
                <IconAlertTriangle className="h-4 w-4" />
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            )}
          </div>

          {/* Bouton d'action — toujours ancré en bas de la zone */}
          <div className="flex w-full gap-2 pt-2">
            {state.status === 'needs-upload' && (
              <Button onClick={handleUpload} className="w-full gap-2">
                <IconCloudUpload className="h-4 w-4" />
                Téléverser et générer le QR Code
              </Button>
            )}
            {state.status === 'ready' && (
              <>
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
              </>
            )}
            {state.status === 'error' && (
              <Button
                variant="outline"
                onClick={() => setRevision((r) => r + 1)}
                className="w-full gap-2"
              >
                <IconRefresh className="h-4 w-4" />
                Réessayer
              </Button>
            )}
            {/* Espace réservé pendant le chargement pour maintenir la hauteur */}
            {isLoading && <div className="h-9 w-full" />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
