'use client'

import { useEffect, type ComponentType } from 'react'
import {
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
}

const REGISTRY: { [K in AppScreenKind]: Entry<K> } = {
  day: { component: DayScreen, presentation: 'screen' },
  activity: { component: ActivityScreen, presentation: 'screen' },
  transport: { component: TransportScreen, presentation: 'screen' },
  accommodation: { component: AccommodationScreen, presentation: 'screen' },
  driver: { component: DriverScreen, presentation: 'screen' },
  menu: { component: MenuScreen, presentation: 'screen' },
  trips: { component: TripsScreen, presentation: 'screen' },
  share: { component: ShareScreen, presentation: 'screen' },
  receive: { component: ReceiveScreen, presentation: 'screen' },
  calendar: { component: CalendarSheet, presentation: 'sheet' },
  reset: { component: ResetSheet, presentation: 'sheet' },
  settings: { component: SettingsScreen, presentation: 'screen' },
  offline: { component: OfflineScreen, presentation: 'screen' },
  generator: { component: GeneratorScreen, presentation: 'screen' },
  'trip-ready': { component: TripReadyScreen, presentation: 'screen' },
  'import-file': { component: ImportFileScreen, presentation: 'screen' },
  document: { component: DocumentScreen, presentation: 'screen' },
  'add-document': { component: AddDocumentSheet, presentation: 'sheet' },
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
            aria-modal={isTop}
            aria-hidden={!isTop}
            className="bg-background animate-screen fixed inset-0 overflow-y-auto overscroll-contain"
            // Au-dessus de la barre d'onglets (z-40), sous les dialogues et feuilles (z-50).
            style={{ zIndex: 41 + Math.min(index, 8) }}
          >
            {renderScreen(screen, pop)}
          </div>
        )
      })}
    </>
  )
}
