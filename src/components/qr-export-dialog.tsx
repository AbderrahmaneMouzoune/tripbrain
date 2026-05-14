'use client'

import { useCallback, useEffect, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconBraces,
  IconCloudUpload,
  IconDownload,
  IconLink,
  IconPackage,
  IconQrcode,
  IconRefresh,
  IconSearch,
  IconServer,
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
  { label: 'Analyse de l\u2019itinéraire\u2026', Icon: IconSearch },
  { label: 'Encodage des données\u2026', Icon: IconBraces },
  { label: 'Compression en cours\u2026', Icon: IconPackage },
]

// Étapes affichées pendant le téléversement R2
const UPLOADING_STEPS = [
  { label: 'Connexion au serveur\u2026', Icon: IconServer },
  { label: 'Téléversement des données\u2026', Icon: IconCloudUpload },
  { label: 'Génération du lien de partage\u2026', Icon: IconLink },
]

/** Convertit une erreur inconnue en message explicite en français. */
function toFrenchError(err: unknown, context: 'upload' | 'compress'): string {
  if (!(err instanceof Error)) {
    return context === 'upload'
      ? 'Erreur inconnue lors du téléversement.'
      : 'Erreur inconnue lors de la compression.'
  }
  const msg = err.message.toLowerCase()
  const errType = (err as { type?: string }).type

  if (msg.includes('network') || msg.includes('failed to fetch')) {
    return 'Erreur réseau\u00a0: vérifiez votre connexion internet et réessayez.'
  }
  if (
    msg.includes('failed to upload') ||
    msg.includes('upload file') ||
    errType === 's3_upload'
  ) {
    return 'Impossible d\u2019envoyer les données vers le serveur de stockage. Vérifiez votre connexion et la configuration R2.'
  }
  if (msg.includes('no pre-signed') || msg.includes('pre-signed url')) {
    return 'Erreur de configuration serveur\u00a0: aucune URL de téléversement n\u2019a été fournie. Vérifiez la configuration R2.'
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
  /** Appelé quand l'utilisateur veut revenir à la dialog précédente */
  onNavBack?: () => void
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
  onNavBack,
}: QrExportDialogProps) {
  const [state, setState] = useState<QrExportState>({ status: 'loading' })
  const [revision, setRevision] = useState(0)
  const [stepIndex, setStepIndex] = useState(0)

  // Anime les étapes de chargement / téléversement — progression linéaire sans boucle :
  // étape 1 après 150 ms, étape 2 après 200 ms supplémentaires, étape 3 jusqu'à la fin.
  useEffect(() => {
    if (state.status !== 'loading' && state.status !== 'uploading') return
    setStepIndex(0)
    const t1 = setTimeout(() => setStepIndex(1), 150)
    const t2 = setTimeout(() => setStepIndex(2), 350)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
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

  const handleNavBack = useCallback(() => {
    onOpenChange(false)
    onNavBack?.()
  }, [onOpenChange, onNavBack])

  const isLoading = state.status === 'loading' || state.status === 'uploading'
  const activeSteps =
    state.status === 'uploading' ? UPLOADING_STEPS : LOADING_STEPS

  // Taille approximative en Ko du payload compressé (base64url)
  const compressedSizeKb =
    state.status === 'needs-upload'
      ? (state.compressed.length / 1024).toFixed(1)
      : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {/* Bouton retour — ferme cette dialog et ré-ouvre la précédente */}
        {onNavBack && (
          <button
            aria-label="Retour"
            onClick={handleNavBack}
            className="ring-offset-background focus:ring-ring absolute top-4 left-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <IconArrowLeft />
            <span className="sr-only">Retour</span>
          </button>
        )}

        <DialogHeader className={onNavBack ? 'pl-6' : undefined}>
          <DialogTitle className="flex items-center gap-2">
            <IconQrcode className="h-5 w-5" />
            Exporter en QR Code
          </DialogTitle>
        </DialogHeader>

        {/* Conteneur stable — min-h évite le layout shift entre les états */}
        <div className="flex min-h-[22rem] flex-col py-2">
          {/* Zone de contenu principal */}
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            {isLoading && (
              <div className="flex flex-col items-center gap-4">
                <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
                <div className="flex flex-col items-start gap-2">
                  {activeSteps.map(({ label, Icon }, i) => (
                    <div
                      key={label}
                      className={cn(
                        'flex items-center gap-2 text-sm transition-all duration-300',
                        i < stepIndex
                          ? 'text-muted-foreground opacity-50'
                          : i === stepIndex
                            ? 'text-foreground font-medium opacity-100'
                            : 'text-muted-foreground opacity-25',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {state.status === 'needs-upload' && (
              <Alert variant="warning" className="w-full">
                <IconAlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Votre itinéraire compressé pèse{' '}
                  <strong>{compressedSizeKb}&nbsp;Ko</strong>, ce qui dépasse
                  la limite du QR code intégré. Les données seront téléversées
                  dans une URL temporaire valide{' '}
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
