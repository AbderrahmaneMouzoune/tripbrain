'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { trackEvent } from '@/lib/analytics/client'

/** Les quatre onglets de la barre du bas. */
export type AppTab = 'today' | 'program' | 'map' | 'documents'

/** Gestes possibles pour changer de journée : sert la mesure d'usage. */
export type DayChangeMethod =
  | 'swipe'
  | 'arrow'
  | 'timeline'
  | 'bottom_nav'
  | 'map'

/**
 * Les écrans qui s'empilent au-dessus des onglets. Chacun est décrit par ce
 * qu'il montre, jamais par un composant : `ScreenHost` fait la correspondance.
 * Les journées sont désignées par leur index dans l'itinéraire consulté.
 */
export type AppScreen =
  /** Roadbook complet d'une journée. */
  | { kind: 'day'; dayIndex: number }
  | { kind: 'activity'; dayIndex: number; activityId: string }
  | { kind: 'transport'; dayIndex: number }
  | { kind: 'accommodation'; dayIndex: number }
  /** Adresse de l'hébergement en très grand, à montrer au chauffeur. */
  | { kind: 'driver'; dayIndex: number }
  /** Menu « Voyage » : partage, calendrier, réglages, réinitialisation. */
  | { kind: 'menu' }
  | { kind: 'trips' }
  | { kind: 'share' }
  /** Recevoir un partage : code à saisir ou QR code à scanner. */
  | { kind: 'receive'; method?: 'code' | 'scan' }
  | { kind: 'calendar'; dayIndex?: number }
  | { kind: 'reset' }
  | { kind: 'settings' }
  | { kind: 'offline' }
  | { kind: 'generator' }
  /** Fin d'arrivée d'un voyage : hors ligne et rappels (après import ou génération). */
  | { kind: 'trip-ready' }
  | { kind: 'import-file' }
  | { kind: 'document'; documentId: string }
  | { kind: 'add-document'; dayIndex?: number }

export type AppScreenKind = AppScreen['kind']

interface NavigationValue {
  tab: AppTab
  setTab: (tab: AppTab) => void
  /** Journée consultée dans Aujourd'hui / Programme / Carte. */
  selectedDay: number
  selectDay: (index: number, method?: DayChangeMethod) => void
  /** Sens du dernier changement de journée, pour l'animation de glissement. */
  dayDirection: 'next' | 'previous' | null
  /** Pile des écrans ouverts au-dessus des onglets ; le dernier est visible. */
  stack: AppScreen[]
  push: (screen: AppScreen) => void
  /** Ferme l'écran du dessus. */
  pop: () => void
  /** Remplace l'écran du dessus (enchaînement sans retour possible). */
  replace: (screen: AppScreen) => void
  /** Ferme tous les écrans empilés. */
  closeAll: () => void
}

const NavigationContext = createContext<NavigationValue | null>(null)

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [tab, setTabState] = useState<AppTab>('today')
  const [selectedDay, setSelectedDay] = useState(0)
  const [dayDirection, setDayDirection] = useState<'next' | 'previous' | null>(
    null,
  )
  const [stack, setStack] = useState<AppScreen[]>([])
  const closeAllRef = useRef<() => void>(() => {})

  const setTab = useCallback((next: AppTab) => {
    setTabState((current) => {
      if (current !== next) {
        trackEvent('view_changed', { view: next, surface: 'bottom_nav' })
      }
      return next
    })
    if (stackRef.current.length > 0) closeAllRef.current()
  }, [])

  const selectDay = useCallback((index: number, method?: DayChangeMethod) => {
    setSelectedDay((current) => {
      if (current === index) return current
      setDayDirection(index > current ? 'next' : 'previous')
      if (method) {
        const direction =
          Math.abs(index - current) > 1
            ? 'jump'
            : index > current
              ? 'next'
              : 'previous'
        trackEvent('day_changed', { method, direction })
      }
      return index
    })
  }, [])

  // Chaque écran empilé ajoute une entrée d'historique : le bouton retour du
  // téléphone ferme l'écran du dessus au lieu de quitter l'application.
  const stackRef = useRef<AppScreen[]>([])
  stackRef.current = stack

  // Un retour d'historique est asynchrone : tant que son `popstate` n'est pas
  // arrivé, une deuxième fermeture (feuille qui se referme ET bouton Annuler,
  // par exemple) reculerait d'un cran de trop, jusqu'à sortir de l'application.
  // On ignore donc les fermetures en double, et on diffère les ouvertures
  // demandées pendant ce temps.
  const backPendingRef = useRef(false)
  const queuedPushesRef = useRef<AppScreen[]>([])

  const pushNow = useCallback((screen: AppScreen) => {
    const depth = stackRef.current.length + 1
    window.history.pushState({ tripbrainDepth: depth }, '')
    stackRef.current = [...stackRef.current, screen]
    setStack((current) => [...current, screen])
  }, [])

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      backPendingRef.current = false
      const depth =
        typeof event.state?.tripbrainDepth === 'number'
          ? event.state.tripbrainDepth
          : 0
      if (stackRef.current.length > depth) {
        stackRef.current = stackRef.current.slice(0, depth)
      }
      setStack((current) =>
        current.length > depth ? current.slice(0, depth) : current,
      )
      const queued = queuedPushesRef.current
      queuedPushesRef.current = []
      for (const screen of queued) pushNow(screen)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [pushNow])

  /** Filet de sécurité : si le `popstate` n'arrive jamais, on débloque. */
  const armBackTimeout = () => {
    window.setTimeout(() => {
      if (!backPendingRef.current) return
      backPendingRef.current = false
      const queued = queuedPushesRef.current
      queuedPushesRef.current = []
      for (const screen of queued) pushNow(screen)
    }, 1500)
  }

  /** L'entrée d'historique du dessus correspond-elle à la pile affichée ? */
  const historyMatches = () =>
    window.history.state?.tripbrainDepth === stackRef.current.length

  const push = useCallback(
    (screen: AppScreen) => {
      if (backPendingRef.current) {
        queuedPushesRef.current.push(screen)
        return
      }
      pushNow(screen)
    },
    [pushNow],
  )
  const pop = useCallback(() => {
    if (backPendingRef.current || stackRef.current.length === 0) return
    if (historyMatches()) {
      // Le retour d'historique déclenche `popstate`, qui retire l'écran.
      backPendingRef.current = true
      armBackTimeout()
      window.history.back()
      return
    }
    stackRef.current = stackRef.current.slice(0, -1)
    setStack((current) => current.slice(0, -1))
  }, [])
  const replace = useCallback((screen: AppScreen) => {
    stackRef.current = [...stackRef.current.slice(0, -1), screen]
    setStack((current) => [...current.slice(0, -1), screen])
  }, [])
  const closeAll = useCallback(() => {
    const depth = stackRef.current.length
    if (backPendingRef.current || depth === 0) return
    if (historyMatches()) {
      backPendingRef.current = true
      armBackTimeout()
      window.history.go(-depth)
      return
    }
    stackRef.current = []
    setStack([])
  }, [])

  closeAllRef.current = closeAll

  const value = useMemo<NavigationValue>(
    () => ({
      tab,
      setTab,
      selectedDay,
      selectDay,
      dayDirection,
      stack,
      push,
      pop,
      replace,
      closeAll,
    }),
    [
      tab,
      setTab,
      selectedDay,
      selectDay,
      dayDirection,
      stack,
      push,
      pop,
      replace,
      closeAll,
    ],
  )

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useAppNav(): NavigationValue {
  const value = useContext(NavigationContext)
  if (!value) {
    throw new Error('useAppNav doit être appelé sous <NavigationProvider>.')
  }
  return value
}
