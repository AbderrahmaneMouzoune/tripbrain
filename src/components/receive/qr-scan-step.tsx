'use client'

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  CameraOff,
  ChevronRight,
  Flashlight,
  FlashlightOff,
  KeyRound,
  Link2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SHARE_CODE_LENGTH, type IncomingShare } from '@/lib/share'
import { cn } from '@/lib/utils'
import { parseShareInput } from '@/components/receive/share-input'

/** API de détection native (Chrome Android, Safari récent) : absente des types DOM. */
interface NativeBarcodeDetector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>
}
interface NativeBarcodeDetectorConstructor {
  new (options?: { formats: string[] }): NativeBarcodeDetector
  getSupportedFormats?: () => Promise<string[]>
}

type CameraState =
  | 'starting'
  | 'live'
  | 'denied'
  | 'unavailable'
  /** La page n'est pas servie en HTTPS, ou le navigateur n'a pas de caméra. */
  | 'unsupported'

/** Intervalle entre deux lectures d'image : assez vif, sans chauffer le téléphone. */
const SCAN_INTERVAL_MS = 220
/** Largeur d'analyse pour jsQR : au-delà, on ralentit sans mieux lire. */
const ANALYSIS_WIDTH = 640

async function createNativeDetector(): Promise<NativeBarcodeDetector | null> {
  const Detector = (
    window as unknown as { BarcodeDetector?: NativeBarcodeDetectorConstructor }
  ).BarcodeDetector
  if (!Detector) return null
  try {
    const formats = (await Detector.getSupportedFormats?.()) ?? ['qr_code']
    if (!formats.includes('qr_code')) return null
    return new Detector({ formats: ['qr_code'] })
  } catch {
    return null
  }
}

/**
 * Scanner de QR code de partage : caméra arrière, viseur, lampe quand le
 * téléphone en a une. La lecture passe par `BarcodeDetector` quand il existe,
 * sinon par jsQR (chargé seulement à ce moment-là).
 *
 * Tout QR code n'est pas un partage : seuls les liens TripBrain sont retenus,
 * les autres sont signalés sans couper la caméra.
 */
export function QrScanStep({
  onBack,
  onResult,
  onUseCode,
  backIcon = 'close',
}: {
  onBack: () => void
  onResult: (incoming: IncomingShare, via: 'scan' | 'link') => void
  onUseCode: () => void
  backIcon?: 'back' | 'close'
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const doneRef = useRef(false)
  const [camera, setCamera] = useState<CameraState>('starting')
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteValue, setPasteValue] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)
  const pasteInputId = useId()

  // Le dernier `onResult` reçu, sans relancer la caméra quand il change.
  const onResultRef = useRef(onResult)
  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const accept = useCallback(
    (text: string, via: 'scan' | 'link'): boolean => {
      const incoming = parseShareInput(text, window.location.host)
      if (!incoming || doneRef.current) return false
      doneRef.current = true
      stopCamera()
      onResultRef.current(incoming, via)
      return true
    },
    [stopCamera],
  )

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    doneRef.current = false

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamera('unsupported')
        return
      }
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
      } catch (error) {
        if (cancelled) return
        const name = error instanceof DOMException ? error.name : ''
        setCamera(
          name === 'NotAllowedError' || name === 'SecurityError'
            ? 'denied'
            : 'unavailable',
        )
        return
      }
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      try {
        await video.play()
      } catch {
        // Lecture automatique bloquée : l'image reste figée, la détection aussi.
      }
      if (cancelled) return
      setCamera('live')

      const [track] = stream.getVideoTracks()
      const capabilities = track?.getCapabilities?.() as
        | (MediaTrackCapabilities & { torch?: boolean })
        | undefined
      setTorchAvailable(Boolean(capabilities?.torch))

      const native = await createNativeDetector()
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d', { willReadFrequently: true })
      const jsQR = native ? null : (await import('jsqr')).default
      let lastNotice = 0

      const tick = async () => {
        if (cancelled || doneRef.current) return
        if (video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth) {
          let text: string | null = null
          try {
            if (native) {
              const codes = await native.detect(video)
              text = codes[0]?.rawValue ?? null
            } else if (jsQR && context) {
              const ratio = Math.min(1, ANALYSIS_WIDTH / video.videoWidth)
              canvas.width = Math.round(video.videoWidth * ratio)
              canvas.height = Math.round(video.videoHeight * ratio)
              context.drawImage(video, 0, 0, canvas.width, canvas.height)
              const image = context.getImageData(
                0,
                0,
                canvas.width,
                canvas.height,
              )
              text =
                jsQR(image.data, image.width, image.height, {
                  inversionAttempts: 'dontInvert',
                })?.data ?? null
            }
          } catch {
            text = null
          }
          if (text && !cancelled && !accept(text, 'scan')) {
            // Un QR code étranger reste en vue : on le dit une fois de temps en temps.
            const now = Date.now()
            if (now - lastNotice > 3000) {
              lastNotice = now
              setNotice('Ce QR code ne contient pas de voyage TripBrain.')
            }
          }
        }
        if (!cancelled && !doneRef.current) {
          timer = setTimeout(tick, SCAN_INTERVAL_MS)
        }
      }
      void tick()
    }

    void start()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      stopCamera()
    }
  }, [accept, stopCamera])

  const toggleTorch = async () => {
    const [track] = streamRef.current?.getVideoTracks() ?? []
    if (!track) return
    const next = !torchOn
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      })
      setTorchOn(next)
    } catch {
      setTorchAvailable(false)
    }
  }

  const handlePasteLink = async () => {
    setPasteError(null)
    if (typeof navigator.clipboard?.readText === 'function') {
      try {
        const text = await navigator.clipboard.readText()
        if (accept(text, 'link')) return
      } catch {
        // Lecture refusée : le champ ci-dessous prend le relais.
      }
    }
    setPasteOpen(true)
  }

  const blocked =
    camera === 'denied' || camera === 'unavailable' || camera === 'unsupported'

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-black text-white">
      <video
        ref={videoRef}
        muted
        playsInline
        aria-hidden
        className={cn(
          'absolute inset-0 h-full w-full object-cover transition-opacity duration-500',
          camera === 'live' ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div aria-hidden className="absolute inset-0 bg-black/30" />

      <div className="relative z-10 mx-auto flex w-full max-w-xl items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+12px)]">
        <button
          type="button"
          onClick={onBack}
          aria-label={backIcon === 'close' ? 'Fermer' : 'Retour'}
          className="pressable flex size-11 items-center justify-center rounded-full bg-white/15 outline-none focus-visible:ring-[3px] focus-visible:ring-white/60"
        >
          <X className="size-5" aria-hidden />
        </button>
        <h1 className="text-base font-extrabold">Scanner un QR code</h1>
        {torchAvailable ? (
          <button
            type="button"
            onClick={toggleTorch}
            aria-pressed={torchOn}
            aria-label={torchOn ? 'Éteindre la lampe' : 'Allumer la lampe'}
            className={cn(
              'pressable flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-white/60',
              torchOn ? 'bg-white text-black' : 'bg-white/15',
            )}
          >
            {torchOn ? (
              <FlashlightOff className="size-5" aria-hidden />
            ) : (
              <Flashlight className="size-5" aria-hidden />
            )}
          </button>
        ) : (
          <span className="size-11" aria-hidden />
        )}
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-10 py-8">
        {blocked ? (
          <div
            role="alert"
            className="animate-rise flex max-w-xs flex-col items-center gap-3 text-center"
          >
            <span className="flex size-14 items-center justify-center rounded-2xl bg-white/15">
              <CameraOff className="size-7" aria-hidden />
            </span>
            <p className="text-lg font-black">
              {camera === 'denied'
                ? 'Accès à la caméra refusé'
                : 'Caméra indisponible'}
            </p>
            <p className="text-sm leading-relaxed text-white/80">
              {camera === 'denied'
                ? 'Autorisez la caméra pour ce site dans les réglages du navigateur, ou saisissez le code affiché sous le QR code.'
                : 'Ce navigateur ne peut pas utiliser la caméra ici. Saisissez plutôt le code affiché sous le QR code.'}
            </p>
            <Button
              size="lg2"
              className="mt-1 bg-white text-black hover:bg-white/90"
              onClick={onUseCode}
            >
              <KeyRound aria-hidden />
              Saisir le code
            </Button>
          </div>
        ) : (
          <>
            <div aria-hidden className="relative size-[260px] max-w-full">
              <span className="absolute top-0 left-0 size-11 rounded-tl-[18px] border-t-[5px] border-l-[5px] border-white" />
              <span className="absolute top-0 right-0 size-11 rounded-tr-[18px] border-t-[5px] border-r-[5px] border-white" />
              <span className="absolute bottom-0 left-0 size-11 rounded-bl-[18px] border-b-[5px] border-l-[5px] border-white" />
              <span className="absolute right-0 bottom-0 size-11 rounded-br-[18px] border-r-[5px] border-b-[5px] border-white" />
              {camera === 'live' && (
                <span className="bg-secondary animate-scan absolute inset-x-[22px] top-1/2 h-[3px] rounded-full shadow-[0_0_18px_var(--secondary)]" />
              )}
            </div>
            <p
              className="max-w-xs text-center text-[15px] leading-relaxed text-white/85"
              aria-live="polite"
            >
              {camera === 'starting'
                ? 'Ouverture de la caméra…'
                : (notice ??
                  'Visez le QR code affiché sur l’autre téléphone ou sur l’ordinateur.')}
            </p>
          </>
        )}
      </div>

      <div className="bg-background text-foreground animate-sheet relative z-10 mx-auto flex w-full max-w-xl flex-col gap-2.5 rounded-t-[28px] px-5 pt-5 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <p className="text-muted-foreground mb-1 text-[13px] font-extrabold">
          Pas de QR code sous la main ?
        </p>
        <SheetLink icon={KeyRound} onClick={onUseCode}>
          Saisir un code à {SHARE_CODE_LENGTH} chiffres
        </SheetLink>
        {pasteOpen ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (!accept(pasteValue, 'link')) {
                setPasteError(
                  'Ce lien n’est pas un partage TripBrain. Vérifiez qu’il est complet.',
                )
              }
            }}
          >
            <label
              htmlFor={pasteInputId}
              className="text-muted-foreground text-[13px] font-extrabold"
            >
              Lien de partage
            </label>
            <div className="flex gap-2">
              <input
                id={pasteInputId}
                value={pasteValue}
                onChange={(event) => {
                  setPasteValue(event.target.value)
                  setPasteError(null)
                }}
                type="url"
                inputMode="url"
                autoFocus
                placeholder="https://…"
                aria-invalid={Boolean(pasteError) || undefined}
                className="bg-card border-border-strong focus:border-primary h-12 min-w-0 flex-1 rounded-2xl border-[1.5px] px-3.5 text-[15px] outline-none"
              />
              <Button type="submit" size="lg2" disabled={!pasteValue.trim()}>
                Ouvrir
              </Button>
            </div>
            {pasteError && (
              <p
                role="alert"
                className="text-destructive text-[13px] font-bold"
              >
                {pasteError}
              </p>
            )}
          </form>
        ) : (
          <SheetLink icon={Link2} onClick={handlePasteLink}>
            Coller un lien de partage
          </SheetLink>
        )}
        <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
          Un petit voyage tient entièrement dans le QR code : il passe même sans
          connexion.
        </p>
      </div>
    </div>
  )
}

function SheetLink({
  icon: Icon,
  onClick,
  children,
}: {
  icon: typeof KeyRound
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pressable bg-card border-border focus-visible:ring-ring/50 flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 text-left text-[15px] font-extrabold outline-none focus-visible:ring-[3px]"
    >
      <Icon className="text-primary size-5 shrink-0" aria-hidden />
      <span className="flex-1">{children}</span>
      <ChevronRight
        className="text-muted-foreground size-5 shrink-0"
        aria-hidden
      />
    </button>
  )
}
