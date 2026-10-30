'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
} from 'react'
import {
  SCREENS_WITH_TAB_BAR,
  useAppNav,
  type AppScreen,
  type AppScreenKind,
} from '@/components/app/navigation'
import {
  ScreenStatusBarContext,
  type ScreenProps,
  type ScreenStatusBarRequest,
} from '@/components/app/screen-props'
import { useTrip } from '@/components/app/trip-provider'
import { useKeyboardInset } from '@/hooks/use-keyboard-inset'
import {
  setNativeStatusBarStyle,
  type NativeStatusBarStyle,
} from '@/lib/native-app'
import { ImportFileScreen } from '@/components/onboarding/import-file-screen'
import { ReceiveScreen } from '@/components/receive/receive-screen'
import { TripReadyScreen } from '@/components/onboarding/trip-ready-screen'
import { GeneratorScreen } from '@/components/generator/generator-flow'
import { DayScreen } from '@/components/day/day-screen'
import { ActivityScreen } from '@/components/day/activity-screen'
import { TransportScreen } from '@/components/day/transport-screen'
import { AccommodationScreen } from '@/components/day/accommodation-screen'
import { DriverScreen } from '@/components/day/driver-screen'
import { MenuScreen } from '@/components/trip-menu/menu-screen'
import { TripsScreen } from '@/components/trip-menu/trips-screen'
import { ShareScreen } from '@/components/share/share-screen'
import { GroupScreen } from '@/components/share/group-screen'
import { CalendarSheet } from '@/components/share/calendar-sheet'
import { ResetSheet } from '@/components/trip-menu/reset-sheet'
import { DocumentScreen } from '@/components/documents/document-screen'
import { AddDocumentSheet } from '@/components/documents/add-document-sheet'
import { SettingsScreen } from '@/components/settings/settings-screen'
import { OfflineScreen } from '@/components/settings/offline-screen'

type Entry<K extends AppScreenKind> = {
  component: ComponentType<ScreenProps<K>>
  /**
   * `screen` : plein écran qui glisse depuis la droite et couvre les onglets.
   * `sheet` : le composant rend lui-même une feuille du bas, ouverte d'office.
   */
  presentation: 'screen' | 'sheet'
  /** Nom annoncé par les lecteurs d'écran quand l'écran s'ouvre. */
  label: string
}

const REGISTRY: { [K in AppScreenKind]: Entry<K> } = {
  day: { component: DayScreen, presentation: 'screen', label: 'Journée' },
  activity: {
    component: ActivityScreen,
    presentation: 'screen',
    label: 'Activité',
  },
  transport: {
    component: TransportScreen,
    presentation: 'screen',
    label: 'Trajet',
  },
  accommodation: {
    component: AccommodationScreen,
    presentation: 'screen',
    label: 'Hébergement',
  },
  driver: {
    component: DriverScreen,
    presentation: 'screen',
    label: 'Chauffeur',
  },
  menu: { component: MenuScreen, presentation: 'screen', label: 'Menu' },
  trips: {
    component: TripsScreen,
    presentation: 'screen',
    label: 'Mes voyages',
  },
  share: {
    component: ShareScreen,
    presentation: 'screen',
    label: 'Partager le voyage',
  },
  group: {
    component: GroupScreen,
    presentation: 'screen',
    label: 'Voyager à plusieurs',
  },
  receive: {
    component: ReceiveScreen,
    presentation: 'screen',
    label: 'Recevoir un voyage',
  },
  calendar: {
    component: CalendarSheet,
    presentation: 'sheet',
    label: 'Calendrier',
  },
  reset: {
    component: ResetSheet,
    presentation: 'sheet',
    label: 'Réinitialiser',
  },
  settings: {
    component: SettingsScreen,
    presentation: 'screen',
    label: 'Réglages',
  },
  offline: {
    component: OfflineScreen,
    presentation: 'screen',
    label: 'Hors ligne',
  },
  generator: {
    component: GeneratorScreen,
    presentation: 'screen',
    label: 'Générateur d’itinéraire',
  },
  'trip-ready': {
    component: TripReadyScreen,
    presentation: 'screen',
    label: 'Voyage prêt',
  },
  'import-file': {
    component: ImportFileScreen,
    presentation: 'screen',
    label: 'Importer un fichier',
  },
  document: {
    component: DocumentScreen,
    presentation: 'screen',
    label: 'Document',
  },
  'add-document': {
    component: AddDocumentSheet,
    presentation: 'sheet',
    label: 'Ajouter un document',
  },
}

/**
 * Écrans au fond foncé de haut en bas : icônes claires dans la barre d'état.
 * Un écran au fond variable le demande lui-même (`useScreenStatusBar`).
 */
const LIGHT_STATUS_BAR: ReadonlySet<AppScreenKind> = new Set(['document'])

/**
 * Écrans au haut d'écran uni et clair : un voile sous la barre d'état
 * (app native) masque le contenu qui défile dessous. Les écrans à photo, à
 * fond foncé ou à caméra n'en ont pas.
 */
const VEILED_SCREENS: ReadonlySet<AppScreenKind> = new Set([
  'day',
  'transport',
  'menu',
  'trips',
  'share',
  'group',
  'settings',
  'offline',
])

/** Défilement (px) au-delà duquel la barre d'état a quitté l'en-tête photo. */
const STATUS_BAR_ALLOWANCE = 60

function renderScreen(screen: AppScreen, onClose: () => void) {
  const entry = REGISTRY[screen.kind] as Entry<typeof screen.kind>
  const Component = entry.component as ComponentType<
    ScreenProps<typeof screen.kind>
  >
  return <Component screen={screen as never} onClose={onClose} />
}

/**
 * Affiche la pile d'écrans ouverts au-dessus des onglets. Tous restent montés
 * (le roadbook garde sa position sous une fiche activité) ; seul le dernier est
 * visible et reçoit le focus.
 */
export function ScreenHost() {
  const { stack, pop, tab } = useAppNav()
  const { hasData } = useTrip()

  // Clavier à l'écran (app native) : `--keyboard-inset` borne les écrans.
  useKeyboardInset()

  // Le défilement de la page sous un écran plein est figé.
  const coversPage = stack.some(
    (screen) => REGISTRY[screen.kind].presentation === 'screen',
  )
  useEffect(() => {
    if (!coversPage) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [coversPage])

  // ── Barre d'état (app native) ──────────────────────────────────────────────
  // Une feuille laisse voir l'écran du dessous : c'est lui qui décide.
  const keyOf = (screen: AppScreen, index: number) => `${index}-${screen.kind}`
  let topScreenIndex = -1
  stack.forEach((screen, index) => {
    if (REGISTRY[screen.kind].presentation === 'screen') topScreenIndex = index
  })
  const topScreen = topScreenIndex >= 0 ? stack[topScreenIndex] : undefined
  const topScreenKey = topScreen ? keyOf(topScreen, topScreenIndex) : null

  const [requests, setRequests] = useState<
    Record<string, ScreenStatusBarRequest>
  >({})
  const setters = useRef(
    new Map<string, (request: ScreenStatusBarRequest | null) => void>(),
  )
  const requestFor = (key: string) => {
    let setter = setters.current.get(key)
    if (!setter) {
      setter = (request) =>
        setRequests((previous) => {
          const current = previous[key]
          if (!request) {
            if (!current) return previous
            const next = { ...previous }
            delete next[key]
            return next
          }
          if (
            current?.style === request.style &&
            current.heroHeight === request.heroHeight
          ) {
            return previous
          }
          return { ...previous, [key]: request }
        })
      setters.current.set(key, setter)
    }
    return setter
  }

  // En-tête photo : la barre redevient sombre une fois la photo défilée.
  const containers = useRef(new Map<string, HTMLDivElement>())
  const heroHeight = topScreenKey
    ? requests[topScreenKey]?.heroHeight
    : undefined
  const [pastHero, setPastHero] = useState(false)
  const measureHero = useCallback(() => {
    const container = topScreenKey
      ? containers.current.get(topScreenKey)
      : undefined
    setPastHero(
      Boolean(
        container &&
        heroHeight &&
        container.scrollTop > heroHeight - STATUS_BAR_ALLOWANCE,
      ),
    )
  }, [topScreenKey, heroHeight])
  useEffect(measureHero, [measureHero])

  let statusBar: NativeStatusBarStyle | null
  if (!topScreen || !topScreenKey) {
    // Onglets : fond clair. Sans voyage, l'onboarding gère sa propre barre.
    statusBar = hasData ? 'dark' : null
  } else {
    const request = requests[topScreenKey]
    statusBar = request
      ? request.heroHeight && pastHero
        ? 'dark'
        : request.style
      : LIGHT_STATUS_BAR.has(topScreen.kind)
        ? 'light'
        : 'dark'
  }
  // Sans voyage ni écran ouvert, rien n'est envoyé : `OnboardingFlow` règle
  // sa barre selon son étape, et la réaffirme quand la pile se vide.
  useEffect(() => {
    if (statusBar) setNativeStatusBarStyle(statusBar)
  }, [statusBar])

  return (
    <>
      {/* Voile sous la barre d'état des onglets (sauf la carte, plein cadre). */}
      {hasData && tab !== 'map' && (
        <div
          aria-hidden
          className="bg-background/85 native:block pointer-events-none fixed inset-x-0 top-0 z-[39] hidden h-[var(--safe-top)] backdrop-blur-md"
        />
      )}
      {stack.map((screen, index) => {
        const isTop = index === stack.length - 1
        const key = keyOf(screen, index)
        if (REGISTRY[screen.kind].presentation === 'sheet') {
          return <div key={key}>{renderScreen(screen, pop)}</div>
        }
        return (
          <div
            key={key}
            ref={(node) => {
              if (node) containers.current.set(key, node)
              else containers.current.delete(key)
            }}
            role="dialog"
            aria-label={REGISTRY[screen.kind].label}
            aria-modal={isTop}
            aria-hidden={!isTop}
            onScroll={key === topScreenKey ? measureHero : undefined}
            // Dans l'app, le clavier à l'écran raccourcit l'écran par le bas :
            // champs et pieds collés restent visibles au-dessus.
            className="bg-background animate-screen native:bottom-[var(--keyboard-inset,0px)] fixed inset-0 overflow-y-auto overscroll-contain"
            // Au-dessus de la barre d'onglets (z-40), sous les dialogues et feuilles (z-50).
            style={
              {
                zIndex: 41 + Math.min(index, 7),
                // Place réservée à la barre d'onglets, quand elle passe dessus :
                // les pieds collés en bas des écrans s'arrêtent au-dessus.
                '--tab-bar-offset': SCREENS_WITH_TAB_BAR.has(screen.kind)
                  ? 'calc(84px + var(--safe-bottom))'
                  : '0px',
              } as CSSProperties
            }
          >
            {VEILED_SCREENS.has(screen.kind) && (
              <div
                aria-hidden
                className="bg-background/85 native:block pointer-events-none sticky top-0 z-30 -mb-[var(--safe-top)] hidden h-[var(--safe-top)] backdrop-blur-md"
              />
            )}
            <ScreenStatusBarContext.Provider value={requestFor(key)}>
              {renderScreen(screen, pop)}
            </ScreenStatusBarContext.Provider>
            <div aria-hidden className="h-[var(--tab-bar-offset)]" />
          </div>
        )
      })}
    </>
  )
}
