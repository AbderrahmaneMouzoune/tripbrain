'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  AUTO_PROMPT_DELAY_MS,
  DEFAULT_PROMPT_STATE,
  PWA_PROMPT_STORAGE_KEY,
  canAutoPrompt,
  detectInstallPlatform,
  markInstalledState,
  optOutPromptState,
  parsePromptState,
  resolveInstallGuide,
  serializePromptState,
  snoozePromptState,
  type BeforeInstallPromptEvent,
  type InstallGuide,
  type InstallPlatform,
  type InstallPromptState,
} from '@/lib/pwa-install'

/** D'où vient l'ouverture : relance automatique ou geste explicite. */
export type InstallPromptOrigin = 'auto' | 'manual'

export type NativeInstallOutcome = 'accepted' | 'dismissed' | 'unavailable'

interface PwaInstallContextValue {
  platform: InstallPlatform
  /** Marche à suivre à afficher (prompt natif, gestes iOS, menu du navigateur…). */
  guide: InstallGuide
  /** L'app tourne déjà depuis l'écran d'accueil. */
  isStandalone: boolean
  isMobile: boolean
  /** Le prompt natif Chromium est disponible tout de suite. */
  hasNativePrompt: boolean
  /** Une installation est encore possible : sert à afficher les entrées manuelles. */
  canInstall: boolean
  /** L'installation vient d'aboutir pendant cette session. */
  justInstalled: boolean
  isOpen: boolean
  origin: InstallPromptOrigin
  open: (origin?: InstallPromptOrigin) => void
  /** Ferme sans trancher : une fermeture d'une relance automatique vaut « plus tard ». */
  close: () => void
  /** « Plus tard » : relance repoussée d'un cran. */
  snooze: () => void
  /** « Ne plus proposer » : plus aucune relance automatique. */
  optOut: () => void
  promptNativeInstall: () => Promise<NativeInstallOutcome>
  /** Autorise la relance automatique une fois que l'utilisateur a un voyage chargé. */
  armAutoPrompt: (ready: boolean) => void
}

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null)

const STANDALONE_QUERIES = [
  '(display-mode: standalone)',
  '(display-mode: fullscreen)',
  '(display-mode: minimal-ui)',
  '(display-mode: window-controls-overlay)',
]

const MOBILE_QUERY = '(max-width: 767px)'

function readStoredState(): InstallPromptState {
  try {
    return parsePromptState(localStorage.getItem(PWA_PROMPT_STORAGE_KEY))
  } catch {
    // Navigation privée ou stockage bloqué : on repart d'un état neutre.
    return { ...DEFAULT_PROMPT_STATE }
  }
}

function detectStandalone(): boolean {
  const matchesDisplayMode = STANDALONE_QUERIES.some(
    (query) => window.matchMedia(query).matches,
  )
  // Safari iOS n'expose pas `display-mode` mais garde ce drapeau historique.
  const iosStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true

  return matchesDisplayMode || iosStandalone
}

export function PwaInstallProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [state, setState] = useState<InstallPromptState>(DEFAULT_PROMPT_STATE)
  const [platform, setPlatform] = useState<InstallPlatform>('desktop')
  const [isStandalone, setIsStandalone] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [nativePrompt, setNativePrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [origin, setOrigin] = useState<InstallPromptOrigin>('auto')
  const [justInstalled, setJustInstalled] = useState(false)
  const [isEngaged, setIsEngaged] = useState(false)

  // Une seule relance automatique par session, même si l'utilisateur change de jour.
  const autoPromptDoneRef = useRef(false)

  const persist = useCallback((next: InstallPromptState) => {
    setState(next)
    try {
      localStorage.setItem(PWA_PROMPT_STORAGE_KEY, serializePromptState(next))
    } catch {
      // Stockage indisponible : l'état reste valable pour la session en cours.
    }
  }, [])

  // ── Détection de l'environnement ──────────────────────────────────────────

  useEffect(() => {
    setState(readStoredState())
    setPlatform(
      detectInstallPlatform(navigator.userAgent, {
        maxTouchPoints: navigator.maxTouchPoints,
        platform: navigator.platform,
      }),
    )

    const standaloneLists = STANDALONE_QUERIES.map((query) =>
      window.matchMedia(query),
    )
    const mobileList = window.matchMedia(MOBILE_QUERY)

    const syncStandalone = () => setIsStandalone(detectStandalone())
    const syncMobile = () => setIsMobile(mobileList.matches)

    syncStandalone()
    syncMobile()

    standaloneLists.forEach((list) =>
      list.addEventListener('change', syncStandalone),
    )
    mobileList.addEventListener('change', syncMobile)

    return () => {
      standaloneLists.forEach((list) =>
        list.removeEventListener('change', syncStandalone),
      )
      mobileList.removeEventListener('change', syncMobile)
    }
  }, [])

  // ── Prompt natif Chromium ─────────────────────────────────────────────────

  useEffect(() => {
    // L'événement a pu se déclencher avant l'hydratation : le script inline du
    // layout l'a mis de côté sur `window`.
    if (window.__tbInstallPrompt) {
      setNativePrompt(window.__tbInstallPrompt)
    }

    const captureFromWindow = () =>
      setNativePrompt(window.__tbInstallPrompt ?? null)

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      const promptEvent = event as BeforeInstallPromptEvent
      window.__tbInstallPrompt = promptEvent
      setNativePrompt(promptEvent)
    }

    const onAppInstalled = () => {
      window.__tbInstallPrompt = null
      setNativePrompt(null)
      setJustInstalled(true)
      setState((current) => {
        const next = markInstalledState(current)
        try {
          localStorage.setItem(
            PWA_PROMPT_STORAGE_KEY,
            serializePromptState(next),
          )
        } catch {
          // Idem : sans stockage on garde l'info en mémoire.
        }
        return next
      })
    }

    window.addEventListener('tb:install-available', captureFromWindow)
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)

    return () => {
      window.removeEventListener('tb:install-available', captureFromWindow)
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  // ── Relance automatique ───────────────────────────────────────────────────

  useEffect(() => {
    if (autoPromptDoneRef.current) return

    const eligible = canAutoPrompt({
      state,
      now: Date.now(),
      isMobile,
      isStandalone,
      platform,
      hasNativePrompt: nativePrompt !== null,
      isEngaged,
    })

    if (!eligible) return

    const timer = window.setTimeout(() => {
      // L'utilisateur peut avoir basculé sur un autre onglet entre-temps.
      if (document.visibilityState !== 'visible') return
      autoPromptDoneRef.current = true
      setOrigin('auto')
      setIsOpen(true)
    }, AUTO_PROMPT_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [state, isMobile, isStandalone, platform, nativePrompt, isEngaged])

  // L'app passe en mode installé pendant la session : plus rien à proposer.
  useEffect(() => {
    if (isStandalone) setIsOpen(false)
  }, [isStandalone])

  // ── Actions ───────────────────────────────────────────────────────────────

  const open = useCallback((nextOrigin: InstallPromptOrigin = 'manual') => {
    setOrigin(nextOrigin)
    setJustInstalled(false)
    setIsOpen(true)
  }, [])

  const snooze = useCallback(() => {
    setIsOpen(false)
    persist(snoozePromptState(readStoredState(), Date.now()))
  }, [persist])

  const optOut = useCallback(() => {
    setIsOpen(false)
    persist(optOutPromptState(readStoredState()))
  }, [persist])

  const close = useCallback(() => {
    setIsOpen(false)
    // Fermer une relance automatique (croix, swipe, clic sur le fond) vaut un
    // « plus tard » : on n'insiste pas au prochain écran.
    if (origin === 'auto' && !justInstalled) {
      persist(snoozePromptState(readStoredState(), Date.now()))
    }
  }, [origin, justInstalled, persist])

  const promptNativeInstall =
    useCallback(async (): Promise<NativeInstallOutcome> => {
      const promptEvent = nativePrompt ?? window.__tbInstallPrompt
      if (!promptEvent) return 'unavailable'

      try {
        await promptEvent.prompt()
        const { outcome } = await promptEvent.userChoice

        // Un événement `beforeinstallprompt` ne se rejoue pas.
        window.__tbInstallPrompt = null
        setNativePrompt(null)

        if (outcome === 'accepted') {
          // `appinstalled` confirmera, mais on affiche le succès sans attendre.
          setJustInstalled(true)
          persist(markInstalledState(readStoredState()))
        } else {
          persist(snoozePromptState(readStoredState(), Date.now()))
          setIsOpen(false)
        }

        return outcome
      } catch {
        return 'unavailable'
      }
    }, [nativePrompt, persist])

  const armAutoPrompt = useCallback((ready: boolean) => {
    setIsEngaged(ready)
  }, [])

  const value = useMemo<PwaInstallContextValue>(() => {
    const hasNativePrompt = nativePrompt !== null

    return {
      platform,
      guide: resolveInstallGuide(platform, hasNativePrompt),
      isStandalone,
      isMobile,
      hasNativePrompt,
      canInstall: !isStandalone && !state.installed,
      justInstalled,
      isOpen,
      origin,
      open,
      close,
      snooze,
      optOut,
      promptNativeInstall,
      armAutoPrompt,
    }
  }, [
    platform,
    isStandalone,
    isMobile,
    nativePrompt,
    state.installed,
    justInstalled,
    isOpen,
    origin,
    open,
    close,
    snooze,
    optOut,
    promptNativeInstall,
    armAutoPrompt,
  ])

  return (
    <PwaInstallContext.Provider value={value}>
      {children}
    </PwaInstallContext.Provider>
  )
}

export function usePwaInstall(): PwaInstallContextValue {
  const context = useContext(PwaInstallContext)
  if (!context) {
    throw new Error('usePwaInstall doit être utilisé dans <PwaInstallProvider>')
  }
  return context
}
