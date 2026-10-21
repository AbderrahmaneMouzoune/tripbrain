'use client'

import { IconCheck, IconCopy, IconX } from '@tabler/icons-react'
import { useEffect, useRef } from 'react'
import {
  BASE_PRECISION,
  chapterProgress,
  CHAPTERS,
  REFINE_CHAPTERS,
  type JourneyAnswers,
  type Precision,
  type Question,
} from '@/lib/generator/trip-journey'

export type PanelTab = 'why' | 'prompt'

/**
 * Le détail de la jauge, à la manière d'une fenêtre de contexte : d'où vient
 * le pourcentage, ce que l'IA devra deviner, et le prompt tel qu'il partira.
 */
export function JourneyPanel({
  tab,
  onTab,
  onClose,
  answers,
  precision,
  prompt,
  copied,
  onCopy,
  onFinish,
  onOpenQuestion,
  showFinish,
  finishLabel,
}: {
  tab: PanelTab
  onTab: (tab: PanelTab) => void
  onClose: () => void
  answers: JourneyAnswers
  precision: Precision
  prompt: string
  copied: boolean
  onCopy: () => void
  onFinish: () => void
  onOpenQuestion: (question: Question) => void
  showFinish: boolean
  finishLabel: string
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // À l'ouverture seulement : le focus entre dans le panneau, et Échap le
  // referme. Le rendre à chaque rendu le ferait sauter sous le doigt.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      // Piège de focus : Tab tourne dans le panneau tant qu'il est ouvert.
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (
        event.shiftKey &&
        (active === first || active === dialogRef.current)
      ) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      // Le focus revient là où il était, la jauge en général.
      if (previous && document.contains(previous)) {
        previous.focus({ preventScroll: true })
      }
    }
  }, [])

  const base = chapterProgress(answers, CHAPTERS[0])
  const bars = [{ id: 'base', width: BASE_PRECISION, color: CHAPTERS[0].color }]
  const rows = REFINE_CHAPTERS.map((chapter) => {
    const progress = chapterProgress(answers, chapter)
    const missing = progress.missing.filter((question) => question.tracked)
    if (progress.trackedAnswered) {
      bars.push({
        id: chapter.id,
        width: progress.trackedAnswered * precision.unit,
        color: chapter.color,
      })
    }
    return { chapter, progress, missing }
  })

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className="tj-fade absolute inset-0 z-30 bg-[rgba(14,26,58,0.28)]"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Précision du brief"
        tabIndex={-1}
        className="tj-panel absolute top-[72px] right-3 left-3 z-40 flex max-h-[calc(100%-88px)] flex-col overflow-hidden rounded-[22px] bg-white shadow-[0_30px_60px_-20px_rgba(6,20,60,0.55),0_0_0_1px_#d6e0ef] outline-none sm:left-auto sm:w-[380px]"
      >
        <div className="flex items-center gap-2.5 px-[18px] pt-4 pb-3">
          <div className="bg-background flex flex-1 gap-1.5 rounded-full p-[3px]">
            {(
              [
                ['why', 'Précision'],
                ['prompt', 'Le prompt'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={tab === value}
                onClick={() => onTab(value)}
                className={`h-[34px] flex-1 cursor-pointer rounded-full text-[13px] font-black transition-colors ${
                  tab === value
                    ? 'bg-ink text-white'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="bg-background flex size-[34px] flex-none cursor-pointer items-center justify-center rounded-full"
          >
            <IconX className="size-4" stroke={3} />
          </button>
        </div>

        <div
          tabIndex={0}
          aria-label={tab === 'why' ? 'Détail de la précision' : 'Prompt'}
          className="focus-visible:ring-primary-soft min-h-0 flex-1 overflow-y-auto px-[18px] pb-3.5 outline-none focus-visible:ring-4"
        >
          {tab === 'why' ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display text-[30px] leading-none">
                  {precision.value} %
                </span>
                <span className="text-[13px] font-black text-[#c2410c]">
                  {precision.label}
                </span>
              </div>
              <div className="mt-2.5 mb-1.5 flex h-3 overflow-hidden rounded-full bg-[#e3eaf5]">
                {bars.map((bar) => (
                  <span
                    key={bar.id}
                    className="border-r-2 border-white transition-[width] duration-500"
                    style={{ width: `${bar.width}%`, background: bar.color }}
                  />
                ))}
              </div>
              <p className="text-muted-foreground mb-2 text-[13px] leading-[1.45] font-bold">
                L’essentiel (où, quand, combien de temps) vaut {BASE_PRECISION}{' '}
                %. Chaque réponse d’affinage ajoute environ{' '}
                {Math.round(precision.unit)} %. Ce qui manque, l’IA le devine :
                souvent bien, parfois à côté.
              </p>
              <div>
                <PanelRow
                  color={CHAPTERS[0].color}
                  title={CHAPTERS[0].title}
                  detail={
                    base.missing.length
                      ? `Il manque : ${base.missing.map((question) => question.short.toLowerCase()).join(', ')}`
                      : 'Où, quand, combien de temps'
                  }
                  score={`${BASE_PRECISION} %`}
                  action={base.missing.length ? 'Remplir' : undefined}
                  onAction={() => onOpenQuestion(base.missing[0])}
                />
                {rows.map(({ chapter, progress, missing }) => (
                  <PanelRow
                    key={chapter.id}
                    color={chapter.color}
                    title={chapter.title}
                    detail={
                      missing.length
                        ? `L’IA devine : ${missing
                            .slice(0, 2)
                            .map((question) => question.short.toLowerCase())
                            .join(', ')}${missing.length > 2 ? '…' : ''}`
                        : 'Rien à deviner'
                    }
                    score={`${progress.trackedAnswered}/${progress.tracked}`}
                    action={
                      missing.length
                        ? `+${Math.round(missing.length * precision.unit)} %`
                        : undefined
                    }
                    onAction={() => onOpenQuestion(missing[0])}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-muted-foreground mb-2 text-[13px] leading-[1.45] font-bold">
                Voici exactement ce qui partira vers l’IA. Il se réécrit à
                chaque réponse.
              </p>
              <pre className="bg-ink rounded-[14px] p-3.5 font-mono text-[11.5px] leading-[1.55] whitespace-pre-wrap text-[#e6eefd]">
                {prompt}
              </pre>
            </>
          )}
        </div>

        <div className="border-border flex flex-none gap-2 border-t px-[18px] pt-3 pb-4">
          <button
            type="button"
            onClick={onCopy}
            className="border-border-strong text-foreground flex h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border-[1.5px] bg-white text-sm font-black"
          >
            {copied ? (
              <IconCheck className="size-4 text-[#15803d]" stroke={3} />
            ) : (
              <IconCopy className="size-4" />
            )}
            {copied ? 'Copié !' : 'Copier le prompt'}
          </button>
          {showFinish && (
            <button
              type="button"
              onClick={onFinish}
              className="bg-ink flex h-11 flex-[1.3] cursor-pointer items-center justify-center rounded-full text-sm font-black text-white"
            >
              {finishLabel}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

function PanelRow({
  color,
  title,
  detail,
  score,
  action,
  onAction,
}: {
  color: string
  title: string
  detail: string
  score: string
  action?: string
  onAction: () => void
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-dashed border-[#e3eaf5] py-[7px] text-[13px] last:border-b-0">
      <span
        className="size-2.5 flex-none rounded-[3px]"
        style={{ background: color }}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-black">{title}</span>
        <span className="text-muted-foreground truncate text-xs font-bold">
          {detail}
        </span>
      </span>
      <span className="text-muted-foreground flex-none font-mono text-xs font-semibold">
        {score}
      </span>
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="text-primary-strong flex-none cursor-pointer px-0.5 py-1 text-xs font-black hover:underline"
        >
          {action}
        </button>
      )}
    </div>
  )
}
