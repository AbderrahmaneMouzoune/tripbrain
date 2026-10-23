'use client'

import { useEffect, type ComponentType, type CSSProperties } from 'react'
import {
  SCREENS_WITH_TAB_BAR,
  useAppNav,
  type AppScreen,
  type AppScreenKind,
} from '@/components/app/navigation'
import type { ScreenProps } from '@/components/app/screen-props'
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
  const { stack, pop } = useAppNav()

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

  if (stack.length === 0) return null

  return (
    <>
      {stack.map((screen, index) => {
        const isTop = index === stack.length - 1
        const key = `${index}-${screen.kind}`
        if (REGISTRY[screen.kind].presentation === 'sheet') {
          return <div key={key}>{renderScreen(screen, pop)}</div>
        }
        return (
          <div
            key={key}
            role="dialog"
            aria-label={REGISTRY[screen.kind].label}
            aria-modal={isTop}
            aria-hidden={!isTop}
            className="bg-background animate-screen fixed inset-0 overflow-y-auto overscroll-contain"
            // Au-dessus de la barre d'onglets (z-40), sous les dialogues et feuilles (z-50).
            style={
              {
                zIndex: 41 + Math.min(index, 7),
                // Place réservée à la barre d'onglets, quand elle passe dessus :
                // les pieds collés en bas des écrans s'arrêtent au-dessus.
                '--tab-bar-offset': SCREENS_WITH_TAB_BAR.has(screen.kind)
                  ? 'calc(84px + env(safe-area-inset-bottom))'
                  : '0px',
              } as CSSProperties
            }
          >
            {renderScreen(screen, pop)}
            <div aria-hidden className="h-[var(--tab-bar-offset)]" />
          </div>
        )
      })}
    </>
  )
}
