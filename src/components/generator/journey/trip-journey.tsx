'use client'

import './trip-journey.css'

import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconMinus,
  IconPencil,
  IconPlus,
} from '@tabler/icons-react'
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { JourneyIllustration } from '@/components/generator/journey/journey-illustration'
import {
  JourneyPanel,
  type PanelTab,
} from '@/components/generator/journey/journey-panel'
import { BUDGETS, type TripBrief } from '@/lib/generator/trip-brief'
import {
  answerLabel,
  applyExpress,
  chapterProgress,
  chapterQuestions,
  CHAPTERS,
  dateShortcuts,
  DURATION_SHORTCUTS,
  hasIdea,
  ideasFor,
  isAnswered,
  missingRequired,
  multiValue,
  packsFor,
  parseExpress,
  precisionOf,
  questionById,
  REFINE_CHAPTERS,
  setMulti,
  setSingle,
  setText,
  singleValue,
  smartNote,
  suggestedOption,
  textValue,
  togglePack,
  toggleIdea,
  tripTotalFor,
  visibleQuestions,
  withPartyCounts,
  type ChapterId,
  type JourneyAnswers,
  type Question,
  type QuestionId,
} from '@/lib/generator/trip-journey'

/**
 * Le parcours du générateur : une question par écran, l'essentiel d'abord,
 * le reste à la carte depuis un écran central, et un billet récapitulatif
 * accessible à tout moment. Il ne fait que remplir le brief : ce qui se passe
 * ensuite (ouvrir une IA, lancer la génération) appartient à la page hôte,
 * via `renderFinish`.
 */

type Screen = 'question' | 'hub' | 'express' | 'recap'

export interface TripJourneyProps {
  brief: TripBrief
  onBriefChange: (brief: TripBrief) => void
  startDate: string
  onStartDateChange: (date: string) => void
  /** Première date proposable (aujourd'hui), au format AAAA-MM-JJ. */
  minDate: string
  /** Durée maximale acceptée par la génération. */
  maxDays: number
  /** Le prompt tel qu'il partira, montré dans le panneau de précision. */
  prompt: string
  copied: boolean
  onCopyPrompt: () => void
  /** Ce qui suit le billet : choix de l'IA sur le site, génération dans l'app. */
  renderFinish: (ready: boolean) => ReactNode
  /**
   * Écran qui prend la place du billet une fois l'IA ouverte (attente de sa
   * réponse, sur le site). Le cadre et l'en-tête restent.
   */
  overlay?: { label: string; content: ReactNode; onBack: () => void } | null
  /** `page` : une carte dans la page. `screen` : un écran d'app plein cadre. */
  variant: 'page' | 'screen'
  /** Billet en direct à droite, sur grand écran (variante `page`). */
  showTicket?: boolean
  /** Retour depuis la toute première question (fermer, dans l'app). */
  onExit?: () => void
  /** Écran d'arrivée : le billet, quand on revient corriger une demande. */
  startOn?: 'question' | 'recap'
  onChapterDone?: (chapterIndex: number) => void
  onExpressUsed?: () => void
  onFinishShortcut?: () => void
}

const AUTO_ADVANCE_MS = 700

export function TripJourney(props: TripJourneyProps) {
  const {
    brief,
    onBriefChange,
    startDate,
    onStartDateChange,
    minDate,
    maxDays,
    prompt,
    copied,
    onCopyPrompt,
    renderFinish,
    overlay,
    variant,
    onExit,
    startOn = 'question',
    showTicket = variant === 'page',
  } = props

  const answers: JourneyAnswers = useMemo(
    () => ({ brief, startDate }),
    [brief, startDate],
  )
  const answersRef = useRef(answers)
  answersRef.current = answers
  const propsRef = useRef(props)
  propsRef.current = props

  const [screen, setScreen] = useState<Screen>(
    startOn === 'recap' ? 'recap' : 'question',
  )
  const [questionId, setQuestionId] = useState<QuestionId>('destination')
  const [returnTo, setReturnTo] = useState<'recap' | null>(null)
  const [chain, setChain] = useState(false)
  const [seen, setSeen] = useState<ChapterId[]>([])
  const [peek, setPeek] = useState<string | null>(null)
  const [panel, setPanel] = useState<PanelTab | null>(null)
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null)
  const [express, setExpress] = useState('')
  const [flip, setFlip] = useState(0)
  const titleId = useId()
  const advanceTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const topRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(
    () => () => {
      clearTimeout(advanceTimer.current)
      clearTimeout(toastTimer.current)
    },
    [],
  )

  const question = questionById(questionId)
  const precision = precisionOf(answers)
  const missing = missingRequired(answers)

  const showToast = useCallback((text: string) => {
    clearTimeout(toastTimer.current)
    setToast({ text, key: Date.now() })
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  /** Change d'écran ; la page ne doit jamais rester scrollée en bas de l'ancien. */
  const go = useCallback(
    (next: Screen, id?: QuestionId) => {
      clearTimeout(advanceTimer.current)
      setPeek(null)
      setPanel(null)
      setFlip((value) => value + 1)
      setScreen(next)
      if (id) setQuestionId(id)
      bodyRef.current?.scrollTo({ top: 0 })
      if (variant === 'page' && topRef.current) {
        const { top, bottom } = topRef.current.getBoundingClientRect()
        if (top < 0 || bottom > window.innerHeight + 1) {
          topRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }
    },
    [variant],
  )

  const openQuestion = useCallback((id: QuestionId) => go('question', id), [go])

  const goRecap = useCallback(() => {
    setReturnTo(null)
    setChain(false)
    go('recap')
  }, [go])

  /** La suite, après une réponse : question suivante, chapitre suivant ou écran central. */
  const next = useCallback(() => {
    const current = answersRef.current
    if (returnTo) {
      setReturnTo(null)
      go(returnTo)
      return
    }
    const inChapter = chapterQuestions(current, question.chapter, question.id)
    const position = inChapter.findIndex((item) => item.id === question.id)
    if (position >= 0 && position < inChapter.length - 1) {
      openQuestion(inChapter[position + 1].id)
      return
    }
    if (question.chapter === 'base') {
      go('hub')
      return
    }
    const chapterIndex = CHAPTERS.findIndex(
      (chapter) => chapter.id === question.chapter,
    )
    const title = CHAPTERS[chapterIndex].title
    setSeen((list) =>
      list.includes(question.chapter) ? list : [...list, question.chapter],
    )
    propsRef.current.onChapterDone?.(chapterIndex)
    const following = CHAPTERS[chapterIndex + 1]
    if (chain && following) {
      showToast(`« ${title} » bouclé`)
      openQuestion(chapterQuestions(current, following.id)[0].id)
      return
    }
    setChain(false)
    showToast(`« ${title} » bouclé`)
    go('hub')
  }, [chain, go, openQuestion, question, returnTo, showToast])

  const back = (() => {
    if (overlay && screen === 'recap') return overlay.onBack
    if (screen === 'question') {
      if (returnTo) {
        return () => {
          setReturnTo(null)
          go(returnTo)
        }
      }
      const inChapter = chapterQuestions(answers, question.chapter, question.id)
      const position = inChapter.findIndex((item) => item.id === question.id)
      if (position > 0) return () => openQuestion(inChapter[position - 1].id)
      if (question.chapter === 'base') return onExit
      return () => go('hub')
    }
    if (screen === 'hub') return () => openQuestion('when')
    if (screen === 'express') return () => openQuestion('destination')
    return () => go('hub')
  })()

  // ── Réponses ──────────────────────────────────────────────────────────────

  const pickSingle = (id: string) => {
    const current = singleValue(brief, question.id)
    const value = current === id ? '' : id
    onBriefChange(setSingle(brief, question.id, value))
    setPeek(null)
    clearTimeout(advanceTimer.current)
    if (value) {
      advanceTimer.current = setTimeout(
        () => next(),
        question.id === 'occasion' ? 1000 : AUTO_ADVANCE_MS,
      )
    }
  }

  const toggleMulti = (id: string) => {
    const current = multiValue(brief, question.id)
    onBriefChange(
      setMulti(
        brief,
        question.id,
        current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id],
      ),
    )
  }

  // Raccourcis clavier : chiffres pour répondre, Échap pour revenir.
  useEffect(() => {
    if (screen !== 'question' || question.kind !== 'single' || panel) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, [contenteditable]')) return
      const index = Number(event.key) - 1
      const option = question.options?.[index]
      if (option && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        pickSingle(option.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ── Ce que montre l'illustration : la réponse, ou celle qu'on survole ────

  const shownBrief =
    screen === 'question' && peek && question.kind === 'single'
      ? setSingle(brief, question.id, peek)
      : brief
  const peeking = Boolean(peek) && peek !== singleValue(brief, question.id)

  // ── Pied d'écran : une action principale, au plus une secondaire ─────────

  let primary: {
    label: string
    onClick: () => void
    disabled?: boolean
    ghost?: boolean
  } | null = null
  let secondary: { label: string; onClick: () => void } | null = null

  if (screen === 'question') {
    const answered = isAnswered(question, answers)
    if (question.kind === 'single' && !answered) {
      secondary = question.required
        ? null
        : { label: 'Passer, l’IA choisira', onClick: next }
    } else if (question.required) {
      primary = {
        label: returnTo ? 'Revenir au billet' : 'Continuer',
        onClick: next,
        disabled: !answered,
      }
    } else {
      primary = {
        label: answered
          ? returnTo
            ? 'Revenir au billet'
            : 'Continuer'
          : 'Passer',
        onClick: next,
        ghost: !answered,
      }
    }
    if (question.id === 'destination' && !returnTo) {
      secondary = {
        label: 'Je préfère tout écrire en une phrase',
        onClick: () => go('express'),
      }
    }
  } else if (screen === 'hub') {
    primary = { label: 'Voir mon billet', onClick: goRecap }
    if (precision.answered < precision.total) {
      secondary = {
        label: 'Tout répondre d’affilée',
        onClick: () => {
          const first = visibleQuestions(answers).find(
            (item) => item.chapter !== 'base' && !isAnswered(item, answers),
          )
          setChain(true)
          if (first) openQuestion(first.id)
        },
      }
    }
  } else if (screen === 'express') {
    const { detected } = parseExpress(express)
    primary = {
      label: 'C’est ça, continuer',
      disabled: detected.length === 0,
      onClick: () => {
        onBriefChange(applyExpress(brief, express))
        propsRef.current.onExpressUsed?.()
        showToast(
          `${detected.length} réponse${detected.length > 1 ? 's' : ''} remplie${detected.length > 1 ? 's' : ''} pour vous`,
        )
        // La date reste à choisir : c'est la seule chose qu'une phrase ne dit jamais.
        openQuestion('when')
      },
    }
    secondary = {
      label: 'Plutôt répondre aux questions',
      onClick: () => openQuestion('destination'),
    }
  }

  const canFinish = screen !== 'recap' && returnTo !== 'recap'
  /** Sur le billet, la suite (choix de l'IA, génération) reste toujours visible. */
  const recapFooter = screen === 'recap' && !overlay

  // ── En-tête ──────────────────────────────────────────────────────────────

  let headLabel = ''
  let headCount = ''
  let segments: boolean[] = []
  if (screen === 'question') {
    const inChapter = chapterQuestions(answers, question.chapter, question.id)
    const position = inChapter.findIndex((item) => item.id === question.id)
    headLabel =
      CHAPTERS.find((chapter) => chapter.id === question.chapter)?.title ?? ''
    headCount = `${position + 1}/${inChapter.length}`
    segments = inChapter.map((_, index) => index <= position)
  } else {
    headLabel =
      screen === 'hub'
        ? 'Votre brief'
        : screen === 'express'
          ? 'Mode express'
          : overlay
            ? overlay.label
            : 'Prêt à partir'
    segments = REFINE_CHAPTERS.map((chapter) => {
      const progress = chapterProgress(answers, chapter)
      return seen.includes(chapter.id) || progress.missing.length === 0
    })
  }

  const isScreen = variant === 'screen'

  return (
    <div
      ref={topRef}
      className={
        isScreen
          ? 'bg-background text-foreground flex min-h-dvh'
          : // Tout le parcours tient dans l'écran : seule la zone des
            // questions défile, le bouton principal reste toujours visible.
            'bg-card border-border text-foreground relative flex h-[calc(100svh-2rem)] max-h-[880px] min-h-[540px] scroll-mt-4 overflow-hidden rounded-[28px] border'
      }
    >
      <div
        className={`relative flex min-w-0 flex-1 flex-col ${isScreen ? '' : 'min-h-0'}`}
      >
        {/* En-tête : où l'on est, la jauge, et la sortie vers le billet. */}
        <div
          className={`border-border flex items-center gap-3 border-b bg-white px-4 pb-3 sm:px-6 ${
            isScreen ? 'pt-[calc(env(safe-area-inset-top)+12px)]' : 'pt-4'
          }`}
        >
          {back ? (
            <button
              type="button"
              aria-label="Revenir en arrière"
              onClick={back}
              className="border-border-strong flex size-10 flex-none cursor-pointer items-center justify-center rounded-full border-[1.5px] bg-white transition-transform hover:-translate-x-0.5"
            >
              <IconArrowLeft className="size-5" />
            </button>
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-primary-strong truncate text-[11px] font-black tracking-[0.12em] uppercase">
                {headLabel}
              </p>
              {headCount && (
                <span className="text-muted-foreground flex-none font-mono text-xs font-semibold">
                  {headCount}
                </span>
              )}
            </div>
            <div className="flex gap-1">
              {segments.map((filled, index) => (
                <span
                  key={index}
                  className="h-[5px] flex-1 rounded-full transition-colors duration-300"
                  style={{
                    background: filled
                      ? screen === 'question'
                        ? '#1d5fe0'
                        : '#15803d'
                      : '#e3eaf5',
                  }}
                />
              ))}
            </div>
          </div>
          <button
            type="button"
            aria-label={`Précision du brief : ${precision.value} %, voir le détail`}
            aria-expanded={Boolean(panel)}
            onClick={() => setPanel(panel ? null : 'why')}
            className="relative size-11 flex-none cursor-pointer rounded-full transition-transform hover:scale-105"
          >
            <svg viewBox="0 0 40 40" className="size-11 -rotate-90">
              <circle
                cx="20"
                cy="20"
                r="16"
                fill="none"
                stroke="#e3eaf5"
                strokeWidth="4"
              />
              <circle
                cx="20"
                cy="20"
                r="16"
                fill="none"
                stroke="#f26a2e"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray="100.5"
                strokeDashoffset={(100.5 * (1 - precision.value / 100)).toFixed(
                  1,
                )}
                style={{
                  transition: 'stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1)',
                }}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-semibold">
              {precision.value}%
            </span>
          </button>
          {canFinish && (
            <button
              type="button"
              onClick={() => {
                propsRef.current.onFinishShortcut?.()
                goRecap()
              }}
              className="bg-ink flex h-10 flex-none cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] font-black text-white transition-transform hover:-translate-y-0.5 active:scale-95"
            >
              J’ai fini
              <IconArrowRight className="size-4 text-[#f26a2e]" stroke={3} />
            </button>
          )}
        </div>

        <div
          ref={bodyRef}
          className={`flex flex-1 flex-col px-5 pt-6 pb-5 sm:px-8 ${
            isScreen ? '' : 'min-h-0 overflow-y-auto overscroll-contain'
          }`}
        >
          <div
            key={`${screen}-${questionId}-${flip}`}
            className="tj-screen mx-auto flex w-full max-w-xl flex-col"
          >
            {screen === 'question' && (
              <QuestionScreen
                question={question}
                answers={answers}
                shownBrief={shownBrief}
                peeking={peeking}
                titleId={titleId}
                minDate={minDate}
                maxDays={maxDays}
                onBriefChange={onBriefChange}
                onStartDateChange={onStartDateChange}
                onPickSingle={pickSingle}
                onToggleMulti={toggleMulti}
                onPeek={setPeek}
                onEnter={() => {
                  if (
                    !question.required ||
                    isAnswered(question, answersRef.current)
                  )
                    next()
                }}
              />
            )}
            {screen === 'hub' && (
              <HubScreen
                answers={answers}
                precision={precision.value}
                precisionLabel={precision.label}
                remaining={precision.total - precision.answered}
                seen={seen}
                unit={precision.unit}
                onOpen={(id) => {
                  setChain(false)
                  openQuestion(id)
                }}
              />
            )}
            {screen === 'express' && (
              <ExpressScreen value={express} onChange={setExpress} />
            )}
            {screen === 'recap' &&
              (overlay ? (
                overlay.content
              ) : (
                <RecapScreen
                  answers={answers}
                  precision={precision.value}
                  answered={precision.answered}
                  total={precision.total}
                  unit={precision.unit}
                  seen={seen}
                  missing={missing}
                  onEdit={(id) => {
                    setReturnTo('recap')
                    openQuestion(id)
                  }}
                  onShowPrompt={() => setPanel('prompt')}
                />
              ))}
          </div>
        </div>

        {(primary || secondary || recapFooter) && (
          <div
            className={`flex flex-col items-center gap-1.5 px-5 pt-3 sm:px-8 ${
              isScreen
                ? 'bg-background/95 sticky bottom-0 z-10 pb-[calc(env(safe-area-inset-bottom)+16px)] backdrop-blur'
                : 'pb-6'
            }`}
          >
            <div className="flex w-full max-w-xl flex-col items-center gap-1.5">
              {recapFooter && (
                <div className="w-full">
                  {renderFinish(missing.length === 0)}
                </div>
              )}
              {primary && (
                <button
                  type="button"
                  onClick={primary.onClick}
                  disabled={primary.disabled}
                  className={`flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-full text-[17px] font-black transition-[transform,opacity] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
                    primary.ghost
                      ? 'border-border-strong text-foreground border-[1.5px] bg-white'
                      : 'bg-primary text-white shadow-[0_14px_26px_-14px_rgba(29,95,224,0.9)]'
                  }`}
                >
                  {primary.label}
                  {!primary.ghost && <IconArrowRight className="size-5" />}
                </button>
              )}
              {secondary && (
                <button
                  type="button"
                  onClick={secondary.onClick}
                  className="text-muted-foreground hover:text-foreground min-h-11 cursor-pointer px-3 text-[15px] font-extrabold underline-offset-4 hover:underline"
                >
                  {secondary.label}
                </button>
              )}
            </div>
          </div>
        )}

        {panel && (
          <JourneyPanel
            tab={panel}
            onTab={setPanel}
            onClose={() => setPanel(null)}
            answers={answers}
            precision={precision}
            prompt={prompt}
            copied={copied}
            onCopy={onCopyPrompt}
            showFinish={canFinish}
            finishLabel="J’ai fini, voir mon billet"
            onFinish={goRecap}
            onOpenQuestion={(target) => {
              setReturnTo(null)
              setChain(false)
              openQuestion(target.id)
            }}
          />
        )}

        {toast && (
          <div
            key={toast.key}
            role="status"
            className="tj-toast bg-ink pointer-events-none absolute top-20 right-4 left-4 z-20 mx-auto flex max-w-md items-center gap-2.5 rounded-2xl px-3.5 py-3 text-white shadow-[0_16px_30px_-12px_rgba(6,20,60,0.6)]"
          >
            <span className="flex size-[26px] flex-none items-center justify-center rounded-full bg-[#15803d]">
              <IconCheck className="size-3.5" stroke={3.2} />
            </span>
            <span className="text-sm font-extrabold">{toast.text}</span>
          </div>
        )}
      </div>

      {showTicket && screen !== 'recap' && (
        <LiveTicket
          answers={answers}
          precision={precision.value}
          onFinish={canFinish ? goRecap : undefined}
        />
      )}
    </div>
  )
}

// ── Écran de question ─────────────────────────────────────────────────────────

function QuestionScreen({
  question,
  answers,
  shownBrief,
  peeking,
  titleId,
  minDate,
  maxDays,
  onBriefChange,
  onStartDateChange,
  onPickSingle,
  onToggleMulti,
  onPeek,
  onEnter,
}: {
  question: Question
  answers: JourneyAnswers
  shownBrief: TripBrief
  peeking: boolean
  titleId: string
  minDate: string
  maxDays: number
  onBriefChange: (brief: TripBrief) => void
  onStartDateChange: (date: string) => void
  onPickSingle: (id: string) => void
  onToggleMulti: (id: string) => void
  onPeek: (id: string | null) => void
  onEnter: () => void
}) {
  const { brief } = answers
  const chapter = CHAPTERS.find((item) => item.id === question.chapter)
  const note = smartNote(question, answers)
  const suggested = suggestedOption(question, answers)
  const ideas = ideasFor(question, answers)
  const packs = packsFor(question, answers)

  return (
    <div className="relative flex flex-col">
      {question.illustration && (
        <div className="relative mb-5">
          {peeking && (
            <span className="tj-pop bg-ink absolute top-2.5 right-2.5 z-[3] rounded-full px-2.5 py-1 text-[11px] font-black tracking-[0.06em] text-white">
              APERÇU
            </span>
          )}
          <JourneyIllustration
            kind={question.illustration}
            brief={shownBrief}
            startDate={answers.startDate}
            animKey={question.id}
          />
        </div>
      )}

      <p className="text-muted-foreground mb-1.5 text-[11px] font-black tracking-[0.12em] uppercase">
        {chapter?.title}
      </p>
      <h2 id={titleId} className="font-display text-[29px] leading-[1.08]">
        {question.title}
      </h2>
      {question.sub && (
        <p className="text-muted-foreground mt-2 text-[15px] leading-[1.45] font-bold">
          {question.sub}
        </p>
      )}
      {note && (
        <p className="tj-pop mt-3 rounded-xl bg-[#e2f4fa] px-3 py-2.5 text-sm font-extrabold text-[#0e7490]">
          {note}
        </p>
      )}

      <div className="mt-[18px] flex flex-col gap-2.5">
        {question.kind === 'text' && (
          <input
            aria-labelledby={titleId}
            value={textValue(brief, question.id)}
            onChange={(event) =>
              onBriefChange(setText(brief, question.id, event.target.value))
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onEnter()
              }
            }}
            placeholder={question.placeholder}
            autoComplete="off"
            maxLength={300}
            className="border-border-strong focus:border-primary h-14 w-full rounded-2xl border-2 bg-white px-4 text-[17px] font-bold outline-none placeholder:text-[#8a98b5] focus:shadow-[0_0_0_4px_#e6eefd]"
          />
        )}

        {question.kind === 'area' && (
          <textarea
            aria-labelledby={titleId}
            value={textValue(brief, question.id)}
            onChange={(event) =>
              onBriefChange(setText(brief, question.id, event.target.value))
            }
            placeholder={question.placeholder}
            maxLength={300}
            className="border-border-strong focus:border-primary h-[110px] w-full resize-none rounded-2xl border-2 bg-white px-4 py-3.5 text-base leading-[1.45] font-bold outline-none placeholder:text-[#8a98b5] focus:shadow-[0_0_0_4px_#e6eefd]"
          />
        )}

        {question.kind === 'when' && (
          <WhenControls
            answers={answers}
            minDate={minDate}
            maxDays={maxDays}
            onStartDateChange={onStartDateChange}
            onDaysChange={(durationDays) =>
              onBriefChange({ ...brief, durationDays })
            }
          />
        )}

        {question.kind === 'party' && (
          <>
            <Counter
              label="Adultes"
              hint="13 ans et plus"
              value={brief.adults}
              min={1}
              max={30}
              onChange={(adults) =>
                onBriefChange(withPartyCounts(brief, { adults }))
              }
            />
            <Counter
              label="Enfants"
              hint="Moins de 13 ans"
              value={brief.children}
              min={0}
              max={30}
              onChange={(children) =>
                onBriefChange(withPartyCounts(brief, { children }))
              }
            />
            {brief.children > 0 && (
              <input
                aria-label="Âge des enfants"
                value={brief.childrenAges}
                onChange={(event) =>
                  onBriefChange({ ...brief, childrenAges: event.target.value })
                }
                placeholder="Âge des enfants, ex. : 4 et 9 ans"
                maxLength={300}
                className="border-border-strong focus:border-primary h-12 w-full rounded-2xl border-2 bg-white px-4 text-[15px] font-bold outline-none placeholder:text-[#8a98b5]"
              />
            )}
          </>
        )}

        {question.kind === 'single' && (
          <div
            role="radiogroup"
            aria-labelledby={titleId}
            className="flex flex-col gap-2"
          >
            {question.options?.map((option, index) => {
              const on = singleValue(brief, question.id) === option.id
              const Icon = option.icon
              const hint =
                question.id === 'budget'
                  ? `${BUDGETS.find((item) => item.id === option.id)?.perDay ?? ''} € / jour / pers. · ${tripTotalFor(brief, option.id)} au total`
                  : option.hint
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onPickSingle(option.id)}
                  onMouseEnter={() => onPeek(option.id)}
                  onMouseLeave={() => onPeek(null)}
                  onFocus={() => onPeek(option.id)}
                  onBlur={() => onPeek(null)}
                  className={`flex min-h-[60px] w-full cursor-pointer items-center gap-3 rounded-[18px] px-3.5 py-2.5 text-left transition-[transform,border-color,background-color,box-shadow] duration-200 hover:-translate-y-0.5 active:scale-[0.98] ${
                    on
                      ? 'bg-primary-soft border-primary border-2'
                      : 'border-border border-[1.5px] bg-white hover:border-[#6b9af0]'
                  }`}
                >
                  <span
                    className={`flex size-9 flex-none items-center justify-center rounded-xl ${
                      on
                        ? 'bg-primary text-white'
                        : 'bg-background text-muted-foreground'
                    }`}
                  >
                    {Icon ? (
                      <Icon className="size-[18px]" />
                    ) : (
                      <span className="font-mono text-xs">{index + 1}</span>
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="text-base font-black">{option.label}</span>
                    {hint && (
                      <span className="text-muted-foreground text-[13px] font-bold">
                        {hint}
                      </span>
                    )}
                  </span>
                  {suggested === option.id && !on && (
                    <span className="tj-halo flex-none rounded-full bg-[#f26a2e] px-2 py-[3px] text-[10px] font-black text-[#0e1a3a]">
                      Conseillé
                    </span>
                  )}
                  {on ? (
                    <IconCheck
                      className="tj-pop text-primary size-5 flex-none"
                      stroke={3}
                    />
                  ) : (
                    <span className="text-muted-foreground hidden flex-none font-mono text-[11px] sm:inline">
                      {index + 1}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {question.kind === 'multi' && (
          <MultiControls
            question={question}
            brief={brief}
            packs={packs}
            onToggle={onToggleMulti}
            onSet={(value) =>
              onBriefChange(setMulti(brief, question.id, value))
            }
          />
        )}

        {ideas && (
          <div className="mt-0.5 flex flex-col gap-2">
            <p className="text-muted-foreground text-[10px] font-black tracking-[0.12em] uppercase">
              {ideas.label}
            </p>
            <div className="flex flex-wrap gap-2">
              {ideas.items.map((idea) => {
                const value = textValue(brief, question.id)
                const on =
                  ideas.mode === 'replace'
                    ? value === idea
                    : ideas.mode === 'toggle'
                      ? hasIdea(value, idea)
                      : false
                return (
                  <Chip
                    key={idea}
                    on={on}
                    plus={!on && ideas.mode !== 'replace'}
                    onClick={() => {
                      const nextValue =
                        ideas.mode === 'replace'
                          ? idea
                          : ideas.mode === 'toggle'
                            ? toggleIdea(value, idea)
                            : `${value ? `${value}\n` : ''}${idea}`
                      onBriefChange(
                        setText(brief, question.id, nextValue.slice(0, 300)),
                      )
                    }}
                  >
                    {ideas.mode === 'template' ? idea.split(' : ')[0] : idea}
                  </Chip>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Chip({
  on,
  plus,
  onClick,
  children,
  small,
}: {
  on: boolean
  plus?: boolean
  onClick: () => void
  children: ReactNode
  small?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border-[1.5px] font-extrabold transition-[transform,background-color,border-color] duration-150 hover:-translate-y-0.5 active:scale-95 ${
        small ? 'min-h-[34px] px-3 text-[13px]' : 'min-h-10 px-3.5 text-sm'
      } ${on ? 'bg-primary-soft border-primary text-primary-strong' : 'border-border-strong text-foreground bg-white'}`}
    >
      {on && <IconCheck className="tj-pop size-3.5" stroke={3} />}
      {plus && <IconPlus className="size-3.5" stroke={2.6} />}
      {children}
    </button>
  )
}

function Counter({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  hint: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <div className="border-border flex items-center justify-between rounded-[18px] border-[1.5px] bg-white py-2 pr-2 pl-4">
      <span className="flex flex-col">
        <span className="text-base font-black">{label}</span>
        <span className="text-muted-foreground text-[13px] font-bold">
          {hint}
        </span>
      </span>
      <span className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Moins : ${label}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="border-border-strong flex size-10 cursor-pointer items-center justify-center rounded-full border-[1.5px] bg-white disabled:opacity-40"
        >
          <IconMinus className="size-4" stroke={3} />
        </button>
        <span
          aria-live="polite"
          className="min-w-6 text-center font-mono text-xl font-semibold"
        >
          {value}
        </span>
        <button
          type="button"
          aria-label={`Plus : ${label}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="bg-primary flex size-10 cursor-pointer items-center justify-center rounded-full text-white disabled:opacity-40"
        >
          <IconPlus className="size-4" stroke={3} />
        </button>
      </span>
    </div>
  )
}

function WhenControls({
  answers,
  minDate,
  maxDays,
  onStartDateChange,
  onDaysChange,
}: {
  answers: JourneyAnswers
  minDate: string
  maxDays: number
  onStartDateChange: (date: string) => void
  onDaysChange: (days: number) => void
}) {
  const days = answers.brief.durationDays
  const shortcuts = useMemo(() => dateShortcuts(), [])
  return (
    <>
      <div className="flex flex-col gap-2">
        <label
          htmlFor="tj-start-date"
          className="text-muted-foreground text-[10px] font-black tracking-[0.12em] uppercase"
        >
          Départ
        </label>
        <input
          id="tj-start-date"
          type="date"
          required
          min={minDate}
          value={answers.startDate}
          onChange={(event) => onStartDateChange(event.target.value)}
          className="border-border-strong focus:border-primary h-14 w-full rounded-2xl border-2 bg-white px-4 font-mono text-[17px] font-semibold outline-none focus:shadow-[0_0_0_4px_#e6eefd]"
        />
        <div className="flex flex-wrap gap-1.5">
          {shortcuts.map((shortcut) => (
            <Chip
              key={shortcut.label}
              small
              on={answers.startDate === shortcut.date}
              onClick={() => onStartDateChange(shortcut.date)}
            >
              {shortcut.label}
            </Chip>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex flex-col gap-2">
        <p className="text-muted-foreground text-[10px] font-black tracking-[0.12em] uppercase">
          Durée sur place
        </p>
        <div className="border-border-strong flex items-center justify-between rounded-[18px] border-2 bg-white p-1.5">
          <button
            type="button"
            aria-label="Un jour de moins"
            disabled={days <= 1}
            onClick={() => onDaysChange(Math.max(1, days - 1))}
            className="border-border-strong flex size-11 cursor-pointer items-center justify-center rounded-full border-[1.5px] bg-white disabled:opacity-40"
          >
            <IconMinus className="size-5" stroke={3} />
          </button>
          <span aria-live="polite" className="flex items-baseline gap-2">
            <span className="font-mono text-[26px] font-semibold">{days}</span>
            <span className="text-muted-foreground font-extrabold">
              jour{days > 1 ? 's' : ''}
            </span>
          </span>
          <button
            type="button"
            aria-label="Un jour de plus"
            disabled={days >= maxDays}
            onClick={() => onDaysChange(Math.min(maxDays, days + 1))}
            className="bg-primary flex size-11 cursor-pointer items-center justify-center rounded-full text-white disabled:opacity-40"
          >
            <IconPlus className="size-5" stroke={3} />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DURATION_SHORTCUTS.filter(
            (shortcut) => shortcut.days <= maxDays,
          ).map((shortcut) => (
            <Chip
              key={shortcut.label}
              small
              on={days === shortcut.days}
              onClick={() => onDaysChange(shortcut.days)}
            >
              {shortcut.label}
            </Chip>
          ))}
        </div>
      </div>
    </>
  )
}

function MultiControls({
  question,
  brief,
  packs,
  onToggle,
  onSet,
}: {
  question: Question
  brief: TripBrief
  packs: ReturnType<typeof packsFor>
  onToggle: (id: string) => void
  onSet: (value: string[]) => void
}) {
  const value = multiValue(brief, question.id)
  return (
    <>
      {packs.length > 0 && (
        <>
          <p className="text-muted-foreground text-[10px] font-black tracking-[0.12em] uppercase">
            En un geste
          </p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
            {packs.map((pack) => {
              const on = pack.ids.every((id) => value.includes(id))
              const labels = pack.ids
                .map(
                  (id) =>
                    question.options?.find((option) => option.id === id)?.label,
                )
                .filter(Boolean)
                .join(' · ')
              return (
                <button
                  key={pack.label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onSet(togglePack(value, pack))}
                  className={`flex cursor-pointer flex-col gap-1 rounded-2xl border-[1.5px] px-3 py-[11px] text-left transition-[transform,background-color,border-color] duration-150 hover:-translate-y-0.5 active:scale-[0.96] ${
                    on
                      ? 'bg-primary-soft border-primary'
                      : pack.recommended
                        ? 'border-[#f26a2e] bg-[#fff1e8]'
                        : 'border-border bg-white'
                  }`}
                >
                  <span className="flex items-center justify-between gap-1.5">
                    <span className="text-[15px] font-black">{pack.label}</span>
                    {on ? (
                      <IconCheck
                        className="tj-pop text-primary size-4"
                        stroke={3.2}
                      />
                    ) : (
                      pack.recommended && (
                        <span className="rounded-full bg-[#f26a2e] px-[7px] py-0.5 text-[10px] font-black text-[#0e1a3a]">
                          Conseillé
                        </span>
                      )
                    )}
                  </span>
                  <span className="text-muted-foreground text-xs leading-[1.35] font-bold">
                    {labels}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="text-muted-foreground mt-1 text-[10px] font-black tracking-[0.12em] uppercase">
            Ou au détail
          </p>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {question.options?.map((option) => {
          const rank = value.indexOf(option.id)
          const on = rank !== -1
          const Icon = option.icon
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(option.id)}
              className={`inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-sm font-extrabold transition-[transform,background-color,border-color] duration-150 hover:-translate-y-0.5 active:scale-95 ${
                on
                  ? 'bg-primary-soft border-primary text-primary-strong'
                  : 'border-border-strong text-foreground bg-white'
              }`}
            >
              {on && question.ordered ? (
                <span className="tj-pop bg-primary flex size-5 items-center justify-center rounded-full font-mono text-[11px] text-white">
                  {rank + 1}
                </span>
              ) : on ? (
                <IconCheck className="tj-pop size-3.5" stroke={3} />
              ) : (
                Icon && <Icon className="text-muted-foreground size-4" />
              )}
              {option.label}
            </button>
          )
        })}
      </div>
    </>
  )
}

// ── Écran central : la jauge et les chapitres ────────────────────────────────

function HubScreen({
  answers,
  precision,
  precisionLabel,
  remaining,
  seen,
  unit,
  onOpen,
}: {
  answers: JourneyAnswers
  precision: number
  precisionLabel: string
  remaining: number
  seen: ChapterId[]
  unit: number
  onOpen: (id: QuestionId) => void
}) {
  const chapters = REFINE_CHAPTERS.map((chapter) => {
    const progress = chapterProgress(answers, chapter)
    const complete = progress.missing.length === 0 || seen.includes(chapter.id)
    return { chapter, progress, complete }
  })
  const nextChapter = chapters.find((item) => !item.complete)

  return (
    <div className="flex flex-col gap-3.5">
      <div className="bg-primary relative flex items-center gap-4 overflow-hidden rounded-3xl p-[18px] text-white">
        <div className="relative size-[76px] flex-none">
          <svg viewBox="0 0 40 40" className="size-[76px] -rotate-90">
            <circle
              cx="20"
              cy="20"
              r="16"
              fill="none"
              stroke="#3a74e6"
              strokeWidth="4.5"
            />
            <circle
              cx="20"
              cy="20"
              r="16"
              fill="none"
              stroke="#f26a2e"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeDasharray="100.5"
              strokeDashoffset={(100.5 * (1 - precision / 100)).toFixed(1)}
              style={{
                transition: 'stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)',
              }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-mono text-[17px] font-semibold">
            {precision}%
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black tracking-[0.12em] text-[#e6eefd] uppercase">
            Précision du brief
          </p>
          <p className="font-display mt-0.5 text-[22px] leading-[1.1]">
            {precisionLabel}
          </p>
          <p className="mt-1 text-[13px] font-bold text-[#e6eefd]">
            {remaining > 0
              ? `Encore ${remaining} réponse${remaining > 1 ? 's' : ''} pour un itinéraire sur mesure.`
              : 'Tout y est : l’IA n’aura rien à deviner.'}
          </p>
        </div>
      </div>

      <p className="text-muted-foreground mt-0.5 text-[15px] font-extrabold">
        L’essentiel est là. Pour un itinéraire plus juste, affinez un chapitre :
      </p>

      {nextChapter && (
        <button
          type="button"
          onClick={() =>
            onOpen(
              (
                nextChapter.progress.missing[0] ??
                nextChapter.progress.questions[0]
              ).id,
            )
          }
          className="flex w-full cursor-pointer items-center gap-3.5 rounded-[18px] border-l-[5px] border-[#f26a2e] bg-[#fff1e8] py-3.5 pr-3.5 pl-4 text-left transition-transform hover:translate-x-[3px]"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="text-[10px] font-black tracking-[0.12em] text-[#c2410c] uppercase">
              Prochain arrêt conseillé
            </span>
            <span className="font-display text-[21px] leading-[1.1]">
              {nextChapter.chapter.title}
            </span>
            <span className="text-muted-foreground text-[13px] font-bold">
              {nextChapter.progress.missing.length} question
              {nextChapter.progress.missing.length > 1 ? 's' : ''} · +
              {Math.round(
                nextChapter.progress.missing.filter((item) => item.tracked)
                  .length * unit,
              )}{' '}
              % de précision
            </span>
          </span>
          <span className="bg-ink flex flex-none items-center gap-1.5 rounded-full px-3.5 py-2.5 text-sm font-black text-white">
            Affiner
            <IconArrowRight className="size-4" stroke={3} />
          </span>
        </button>
      )}

      <nav aria-label="Chapitres" className="relative flex flex-col">
        <span
          aria-hidden
          className="absolute top-4 bottom-4 left-[11px] border-l-2 border-dashed border-[#c7d5ec]"
        />
        {chapters.map(({ chapter, progress, complete }) => {
          const started = progress.answered.length > 0
          const detail = complete
            ? started
              ? progress.answered
                  .map((question) => answerLabel(question, answers))
                  .join(' · ')
              : 'Passé : l’IA choisira pour vous'
            : started
              ? progress.answered
                  .map((question) => answerLabel(question, answers))
                  .join(' · ')
              : `${progress.questions.length} questions · ${progress.questions
                  .slice(0, 2)
                  .map((question) => question.short.toLowerCase())
                  .join(', ')}…`
          return (
            <button
              key={chapter.id}
              type="button"
              onClick={() =>
                onOpen((progress.missing[0] ?? progress.questions[0]).id)
              }
              className="border-b-border/60 flex cursor-pointer items-center gap-3.5 border-b py-[11px] pr-1 text-left transition-transform last:border-b-0 hover:translate-x-[3px]"
            >
              <span
                aria-hidden
                className="relative z-[1] flex size-6 flex-none items-center justify-center rounded-full border-2"
                style={{
                  background: complete ? '#15803d' : '#fff',
                  borderColor: complete
                    ? '#15803d'
                    : nextChapter?.chapter.id === chapter.id
                      ? '#f26a2e'
                      : '#c7d5ec',
                }}
              >
                {complete && (
                  <IconCheck className="size-3 text-white" stroke={4} />
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="text-[15px] font-black">{chapter.title}</span>
                <span className="text-muted-foreground truncate text-[13px] font-bold">
                  {detail}
                </span>
              </span>
              <span
                className="flex flex-none items-center gap-1 text-[13px] font-black"
                style={{ color: complete ? '#15803d' : '#1447b8' }}
              >
                {complete ? 'Modifier' : started ? 'Continuer' : 'Affiner'}
                <IconArrowRight className="size-3.5" stroke={3} />
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

// ── Mode express ─────────────────────────────────────────────────────────────

function ExpressScreen({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const { detected } = parseExpress(value)
  const tones: Record<string, string> = {
    Durée: 'bg-primary-soft text-primary-strong',
    Destination: 'bg-[#fff1e8] text-[#c2410c]',
    Voyageurs: 'bg-primary-soft text-primary-strong',
    Rythme: 'bg-[#dcf3e4] text-[#15803d]',
    Budget: 'bg-[#fff1e8] text-[#c2410c]',
    Envie: 'bg-[#e2f4fa] text-[#0e7490]',
  }
  return (
    <div className="flex flex-col gap-3.5">
      <p className="text-muted-foreground text-[11px] font-black tracking-[0.12em] uppercase">
        Mode express
      </p>
      <h2 className="font-display text-[29px] leading-[1.08]">
        Racontez votre voyage en une phrase.
      </h2>
      <p className="text-muted-foreground text-[15px] font-bold">
        On remplit le billet à mesure que vous écrivez.
      </p>
      <textarea
        aria-label="Votre voyage en une phrase"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={300}
        placeholder="Ex. : 5 jours à Lisbonne entre amis, tranquille, on aime les bonnes tables et les musées."
        className="border-border-strong focus:border-primary h-[120px] w-full resize-none rounded-2xl border-2 bg-white px-4 py-3.5 text-base leading-[1.45] font-bold outline-none placeholder:text-[#8a98b5] focus:shadow-[0_0_0_4px_#e6eefd]"
      />
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-[10px] font-black tracking-[0.12em] uppercase">
          On a compris
        </p>
        <div className="flex min-h-10 flex-wrap gap-2" aria-live="polite">
          {detected.length === 0 && (
            <span className="self-center text-sm font-bold text-[#8a98b5]">
              Destination, durée, voyageurs, rythme, envies…
            </span>
          )}
          {detected.map((item) => (
            <span
              key={`${item.kind}-${item.value}`}
              className={`tj-pop inline-flex items-center gap-1.5 rounded-full px-3 py-[7px] text-sm font-black ${tones[item.kind]}`}
            >
              <span className="text-[10px] tracking-[0.1em] uppercase opacity-75">
                {item.kind}
              </span>
              {item.value}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Le billet ────────────────────────────────────────────────────────────────

function RecapScreen({
  answers,
  precision,
  answered,
  total,
  unit,
  seen,
  missing,
  onEdit,
  onShowPrompt,
}: {
  answers: JourneyAnswers
  precision: number
  answered: number
  total: number
  unit: number
  seen: ChapterId[]
  missing: Question[]
  onEdit: (id: QuestionId) => void
  onShowPrompt: () => void
}) {
  const [showAll, setShowAll] = useState(false)
  const rows = visibleQuestions(answers)
  // Le billet montre ce qui est dit ; ce qui est laissé à l'IA tient en une
  // ligne, qu'on déplie pour le compléter.
  const shown = rows.filter(
    (question) => showAll || question.required || isAnswered(question, answers),
  )
  const hidden = rows.length - shown.length
  const suggestions = rows
    .filter(
      (question) =>
        question.tracked &&
        !isAnswered(question, answers) &&
        !seen.includes(question.chapter),
    )
    .slice(0, 3)

  return (
    <div className="flex flex-col gap-3.5">
      <h2 className="font-display text-[29px] leading-[1.08]">
        {missing.length ? 'Presque prêt.' : 'Votre brief est prêt.'}
      </h2>
      <div className="tj-rise border-border overflow-hidden rounded-[22px] border bg-white shadow-[0_18px_36px_-24px_rgba(14,26,58,0.45)]">
        <div className="bg-ink flex items-center justify-between px-4 py-[11px] text-white">
          <span className="font-display text-[13px] tracking-[0.08em]">
            TRIPBRAIN
          </span>
          <span className="font-mono text-[11px] text-[#f26a2e]">
            {precision} % · {answered}/{total}
          </span>
        </div>
        <div className="px-4 pt-0.5 pb-1.5">
          {shown.map((question) => {
            const value = answerLabel(question, answers)
            return (
              <button
                key={question.id}
                type="button"
                onClick={() => onEdit(question.id)}
                aria-label={`Modifier : ${question.short}`}
                className="group flex w-full cursor-pointer items-center justify-between gap-3 border-b border-dashed border-[#e3eaf5] py-2.5 text-left last:border-b-0"
              >
                <span className="text-muted-foreground flex-none text-xs font-extrabold">
                  {question.short}
                </span>
                <span className="flex min-w-0 items-center gap-[7px]">
                  <span
                    className="truncate text-right text-sm font-black"
                    style={{
                      color: value
                        ? '#0e1a3a'
                        : question.required
                          ? '#c2410c'
                          : '#8a98b5',
                    }}
                  >
                    {value ||
                      (question.required ? 'À remplir' : 'L’IA décidera')}
                  </span>
                  <IconPencil className="text-muted-foreground group-hover:text-primary size-3.5 flex-none" />
                </span>
              </button>
            )
          })}
          {(hidden > 0 || showAll) && (
            <button
              type="button"
              aria-expanded={showAll}
              onClick={() => setShowAll(!showAll)}
              className="text-primary-strong flex w-full cursor-pointer items-center justify-between gap-3 py-2.5 text-left text-xs font-black hover:underline"
            >
              <span>
                {showAll
                  ? 'Replier le billet'
                  : `+ ${hidden} réponse${hidden > 1 ? 's' : ''} laissée${hidden > 1 ? 's' : ''} à l’IA`}
              </span>
              <span>{showAll ? 'Replier' : 'Voir et compléter'}</span>
            </button>
          )}
        </div>
      </div>

      {missing.length > 0 && (
        <button
          type="button"
          onClick={() => onEdit(missing[0].id)}
          className="tj-pop flex cursor-pointer items-center gap-2.5 rounded-2xl border-[1.5px] border-[#f26a2e] bg-[#fff1e8] px-3.5 py-3 text-left"
        >
          <span className="flex size-9 flex-none items-center justify-center rounded-xl bg-white">
            <IconPencil className="size-5 text-[#c2410c]" />
          </span>
          <span className="flex-1 text-sm font-extrabold">
            {missing[0].id === 'destination'
              ? 'Il manque juste votre destination pour lancer l’IA.'
              : 'Il manque la date de départ pour lancer l’IA.'}
          </span>
          <span className="text-sm font-black text-[#c2410c]">Remplir</span>
        </button>
      )}

      {missing.length === 0 && suggestions.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-[10px] font-black tracking-[0.12em] uppercase">
            Si vous avez 30 secondes · +{Math.round(suggestions.length * unit)}{' '}
            % de précision
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((question) => (
              <Chip
                key={question.id}
                on={false}
                plus
                onClick={() => onEdit(question.id)}
              >
                {question.short}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onShowPrompt}
        className="text-muted-foreground hover:text-foreground mx-auto min-h-11 cursor-pointer px-3 text-sm font-extrabold underline-offset-4 hover:underline"
      >
        Voir le prompt
      </button>
    </div>
  )
}

// ── Billet en direct, à droite sur grand écran ───────────────────────────────

function LiveTicket({
  answers,
  precision,
  onFinish,
}: {
  answers: JourneyAnswers
  precision: number
  onFinish?: () => void
}) {
  const visible = visibleQuestions(answers)
  return (
    <aside className="bg-primary relative hidden w-[400px] flex-none flex-col gap-4 overflow-hidden px-7 py-8 text-white lg:flex">
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-black tracking-[0.12em] text-[#e6eefd] uppercase">
          Votre billet, en direct
        </p>
        <p className="font-display text-2xl leading-[1.1]">
          Chaque réponse s’imprime ici.
        </p>
      </div>
      <div className="flex min-h-0 flex-1 -rotate-1 flex-col overflow-hidden rounded-[20px] bg-white text-[#0e1a3a] shadow-[0_30px_50px_-24px_rgba(6,20,60,0.6)]">
        <div className="bg-ink flex items-center justify-between px-4 py-[11px] text-white">
          <span className="font-display text-[13px] tracking-[0.08em]">
            TRIPBRAIN
          </span>
          <span className="font-mono text-[11px] text-[#f26a2e]">
            {precision} %
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-2.5">
          {CHAPTERS.map((chapter) => (
            <div key={chapter.id} className="pt-2 pb-1">
              <p
                className="mb-0.5 text-[9px] font-black tracking-[0.12em] uppercase"
                style={{ color: chapter.color }}
              >
                {chapter.title}
              </p>
              {visible
                .filter((question) => question.chapter === chapter.id)
                .map((question) => {
                  const value = answerLabel(question, answers)
                  return (
                    <div
                      key={question.id}
                      className="flex justify-between gap-2.5 border-b border-dashed border-[#e3eaf5] py-[5px] text-xs"
                    >
                      <span className="text-muted-foreground font-extrabold">
                        {question.short}
                      </span>
                      {value ? (
                        <span
                          key={value}
                          className="tj-pop max-w-[200px] truncate text-right font-black"
                        >
                          {value}
                        </span>
                      ) : (
                        <span className="h-[9px] w-[70px] self-center rounded-[5px] bg-[#e3eaf5]" />
                      )}
                    </div>
                  )
                })}
            </div>
          ))}
        </div>
      </div>
      {onFinish && (
        <button
          type="button"
          onClick={onFinish}
          className="flex h-[52px] flex-none cursor-pointer items-center justify-center gap-2 rounded-full bg-white text-base font-black text-[#0e1a3a] transition-transform hover:-translate-y-0.5"
        >
          Prêt à partir ? Voir mon billet
          <IconArrowRight className="size-5 text-[#f26a2e]" stroke={3} />
        </button>
      )}
      <p className="text-[13px] font-bold text-[#e6eefd]">
        Raccourcis : Entrée pour continuer, chiffres 1 à 6 pour répondre.
      </p>
    </aside>
  )
}
