'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ClipboardPaste,
  Info,
  QrCode,
  RotateCw,
  Share2,
  WifiOff,
} from 'lucide-react'
import { MobileScreen } from '@/components/mobile/mobile-screen'
import { IconBadge } from '@/components/mobile/icon-badge'
import { Button } from '@/components/ui/button'
import { SHARE_CODE_LENGTH, type IncomingShare } from '@/lib/share'
import { cn } from '@/lib/utils'
import {
  digitsOnly,
  groupCodeDigits,
  parseShareInput,
  type ShareErrorDescription,
} from '@/components/receive/share-input'

/** Le presse-papiers est-il lisible sur demande (clic sur « Coller ») ? */
function canReadClipboard(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard?.readText === 'function'
  )
}

/**
 * Saisie d'un code de partage : huit chiffres sur le pavé numérique, affichés
 * 4 + 4. Un lien collé dans le champ est reconnu aussi : on ne force personne à
 * en extraire le code.
 */
export function CodeEntryStep({
  initialCode = '',
  error,
  busy,
  onSubmitCode,
  onIncoming,
  onScan,
  onBack,
  backIcon,
  progress,
}: {
  initialCode?: string
  /** Échec de la dernière tentative : le champ passe en rouge, l'aide s'affiche. */
  error?: ShareErrorDescription | null
  busy?: boolean
  onSubmitCode: (code: string) => void
  /** Un lien complet a été collé : il se traite sans passer par le code. */
  onIncoming: (incoming: IncomingShare) => void
  onScan: () => void
  onBack: () => void
  backIcon?: 'back' | 'close'
  progress?: { step: number; total: number }
}) {
  const inputId = useId()
  const hintId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [digits, setDigits] = useState(() =>
    digitsOnly(initialCode).slice(0, SHARE_CODE_LENGTH),
  )
  const [pasteHint, setPasteHint] = useState<string | null>(null)
  const [clipboardReadable, setClipboardReadable] = useState(false)
  // L'erreur affichée est celle du code tenté : dès qu'on retouche le champ,
  // elle s'efface.
  const [showError, setShowError] = useState(Boolean(error))

  useEffect(() => {
    setClipboardReadable(canReadClipboard())
  }, [])

  useEffect(() => {
    setShowError(Boolean(error))
  }, [error])

  const complete = digits.length === SHARE_CODE_LENGTH
  const invalid = showError && Boolean(error)

  const handleChange = (raw: string) => {
    setPasteHint(null)
    setShowError(false)
    // Un lien entier collé dans le champ : inutile d'en extraire le code à la main.
    if (/[/:]/.test(raw)) {
      const incoming = parseShareInput(raw, window.location.host)
      if (incoming?.code && !incoming.payload) {
        setDigits(digitsOnly(incoming.code).slice(0, SHARE_CODE_LENGTH))
        return
      }
      if (incoming) {
        onIncoming(incoming)
        return
      }
    }
    setDigits(digitsOnly(raw).slice(0, SHARE_CODE_LENGTH))
  }

  const handlePaste = async () => {
    setPasteHint(null)
    try {
      const text = await navigator.clipboard.readText()
      const incoming = parseShareInput(text, window.location.host)
      if (incoming?.payload) {
        onIncoming(incoming)
        return
      }
      const code = incoming?.code ? digitsOnly(incoming.code) : ''
      if (code.length === SHARE_CODE_LENGTH) {
        setShowError(false)
        setDigits(code)
        return
      }
      setPasteHint('Le presse-papiers ne contient pas de code TripBrain.')
    } catch {
      // Lecture refusée : on rend la main au champ, où le collage du système marche toujours.
      setPasteHint(
        'Collez le code dans le champ (appui long, puis « Coller »).',
      )
      inputRef.current?.focus()
    }
  }

  const submit = () => {
    if (complete && !busy) onSubmitCode(digits)
  }

  return (
    <MobileScreen
      onBack={onBack}
      backIcon={backIcon}
      progress={progress}
      title="Entrez votre code"
      description="Il s’affiche sur tripbrain.fr ou sur l’appareil qui partage le voyage. Il reste valable une heure."
      footer={
        <Button
          size="xl"
          className="w-full"
          onClick={submit}
          disabled={!complete || busy}
        >
          {invalid && !busy && <RotateCw aria-hidden />}
          {busy
            ? 'Récupération du voyage…'
            : invalid
              ? 'Réessayer'
              : 'Récupérer mon voyage'}
        </Button>
      }
    >
      <form
        className="flex flex-col gap-2.5"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <label
          htmlFor={inputId}
          className="text-muted-foreground text-[13px] font-extrabold"
        >
          Code de partage
        </label>
        <input
          ref={inputRef}
          id={inputId}
          value={groupCodeDigits(digits)}
          onChange={(event) => handleChange(event.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          enterKeyHint="go"
          spellCheck={false}
          placeholder="0000 0000"
          aria-invalid={invalid || undefined}
          aria-describedby={hintId}
          className={cn(
            'bg-card text-foreground placeholder:text-muted-foreground/40 h-[72px] w-full rounded-[18px] border-2 px-4 text-center font-mono text-[32px] font-semibold tracking-[0.18em] outline-none',
            invalid
              ? 'border-destructive shadow-[0_0_0_4px_var(--destructive-soft)]'
              : 'border-primary focus:shadow-[0_0_0_4px_var(--primary-soft)]',
          )}
        />
        <div id={hintId} aria-live="polite">
          {invalid && error ? (
            <p
              role="alert"
              className="text-destructive flex items-start gap-2 text-sm leading-snug font-bold"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{error.message}</span>
            </p>
          ) : complete ? (
            <p className="text-success flex items-center gap-1.5 text-[13px] font-bold">
              <CheckCircle2 className="size-4" aria-hidden />
              Code complet
            </p>
          ) : (
            <p className="text-muted-foreground text-[13px] font-bold">
              {SHARE_CODE_LENGTH} chiffres ·{' '}
              <span className="tabular-nums">
                {digits.length}/{SHARE_CODE_LENGTH}
              </span>
            </p>
          )}
        </div>
      </form>

      {!invalid && (
        <div className="mt-4 flex flex-wrap gap-2.5">
          {clipboardReadable && (
            <Button
              variant="outline"
              className="border-border min-h-11 rounded-xl px-3.5 text-sm font-extrabold shadow-none"
              onClick={handlePaste}
            >
              <ClipboardPaste aria-hidden />
              Coller
            </Button>
          )}
          <Button
            variant="outline"
            className="border-border min-h-11 rounded-xl px-3.5 text-sm font-extrabold shadow-none"
            onClick={onScan}
          >
            <QrCode aria-hidden />
            Scanner un QR code
          </Button>
        </div>
      )}
      {pasteHint && (
        <p role="status" className="text-muted-foreground mt-2 text-[13px]">
          {pasteHint}
        </p>
      )}

      {invalid ? (
        <>
          <section
            aria-labelledby={`${inputId}-help`}
            className="bg-card border-border mt-5 rounded-[20px] border p-1.5"
          >
            <h2
              id={`${inputId}-help`}
              className="text-secondary-strong px-2.5 pt-2.5 pb-1 text-[11px] font-black tracking-[0.1em] uppercase"
            >
              Essayez plutôt
            </h2>
            <div className="flex items-center gap-3 p-2.5">
              <IconBadge icon={Share2} tone="primary" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] leading-snug font-extrabold">
                  Demandez un nouveau code sur l’autre appareil
                </span>
                <span className="text-muted-foreground block text-[13px]">
                  Bouton « Partager » sur tripbrain.fr ou dans l’app
                </span>
              </span>
            </div>
            <div className="bg-border/70 mx-2.5 h-px" />
            <button
              type="button"
              onClick={onScan}
              className="pressable focus-visible:ring-ring/50 flex min-h-11 w-full items-center gap-3 rounded-[14px] p-2.5 text-left outline-none focus-visible:ring-[3px]"
            >
              <IconBadge icon={QrCode} tone="accent" />
              <span className="min-w-0 flex-1">
                <span className="text-primary-strong block text-[15px] font-extrabold">
                  Scanner le QR code
                </span>
                <span className="text-muted-foreground block text-[13px]">
                  Sans rien saisir
                </span>
              </span>
              <ChevronRight
                className="text-muted-foreground size-5 shrink-0"
                aria-hidden
              />
            </button>
          </section>
          <div className="bg-muted mt-3 flex items-start gap-3 rounded-2xl px-4 py-3.5">
            <WifiOff
              className="text-muted-foreground mt-0.5 size-[18px] shrink-0"
              aria-hidden
            />
            <p className="text-[13px] leading-relaxed">
              <strong>Pas de réseau ?</strong>{' '}
              <span className="text-muted-foreground">
                Le QR code fonctionne hors ligne pour les petits voyages.
              </span>
            </p>
          </div>
        </>
      ) : (
        <div className="bg-primary-soft mt-7 flex items-start gap-3 rounded-2xl px-4 py-3.5">
          <Info
            className="text-primary-strong mt-0.5 size-[18px] shrink-0"
            aria-hidden
          />
          <p className="text-primary-strong text-[13px] leading-relaxed">
            Le voyage est préparé sur ce téléphone ? Depuis tripbrain.fr, il
            s’ouvre directement dans l’app, <strong>sans code à saisir</strong>.
          </p>
        </div>
      )}
    </MobileScreen>
  )
}
