'use client'

import { Suspense, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { TripProvider, useTrip } from '@/components/app/trip-provider'
import { NavigationProvider, useAppNav } from '@/components/app/navigation'
import { EditSessionProvider } from '@/components/app/edit-session'
import { ScreenHost } from '@/components/app/screen-host'
import { BottomTabBar, TAB_BAR_SPACER } from '@/components/app/bottom-tab-bar'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { DemoChrome } from '@/components/onboarding/demo-chrome'
import { IncomingShareGate } from '@/components/receive/incoming-share'
import { TodayView } from '@/components/today/today-view'
import { ProgramView } from '@/components/program/program-view'
import { MapView } from '@/components/map/map-view'
import { DocumentsTab } from '@/components/documents/documents-tab'
import { ImageCacheProvider } from '@/components/image-cache-provider'
import { AppIcon } from '@/components/app-icon'
import { usePwaInstall } from '@/components/pwa-install-provider'
import { useAnalytics } from '@/hooks/use-analytics'
import { trackEvent } from '@/lib/analytics/client'

function TabContent() {
  const { tab } = useAppNav()
  switch (tab) {
    case 'today':
      return <TodayView />
    case 'program':
      return <ProgramView />
    case 'map':
      return <MapView />
    case 'documents':
      return <DocumentsTab />
  }
}

function TripShell() {
  const { itinerary } = useTrip()
  const { selectedDay } = useAppNav()
  const safeDay = Math.min(selectedDay, Math.max(itinerary.length - 1, 0))

  return (
    <ImageCacheProvider itinerary={itinerary} currentDayIndex={safeDay}>
      <main className="bg-background relative min-h-dvh overflow-x-clip">
        <DemoChrome />
        <TabContent />
        <div aria-hidden className={TAB_BAR_SPACER} />
        <BottomTabBar />
      </main>
    </ImageCacheProvider>
  )
}

function HomePageContent() {
  const {
    isLoading,
    hasData,
    isDemo,
    tripRevision,
    loadMockData,
    getCurrentDayIndex,
  } = useTrip()
  const { selectDay } = useAppNav()
  const searchParams = useSearchParams()
  const { armAutoPrompt } = usePwaInstall()
  const { consent, isConfigured: isAnalyticsConfigured } = useAnalytics()
  const appOpenedRef = useRef(false)

  useEffect(() => {
    if (!hasData && !isLoading && searchParams.get('demo') === 'true') {
      void loadMockData()
    }
  }, [hasData, isLoading, searchParams, loadMockData])

  // On ne propose l'installation qu'une fois le voyage chargé : avant, la
  // proposition arriverait sans que l'app ait rendu le moindre service. Tant
  // que la demande de consentement attend une réponse, elle occupe déjà le bas
  // de l'écran : une seule demande à la fois.
  const consentSettled = !isAnalyticsConfigured || consent !== null
  useEffect(() => {
    armAutoPrompt(hasData && !isLoading && consentSettled)
  }, [armAutoPrompt, hasData, isLoading, consentSettled])

  // Placement automatique sur la journée du jour : à l'ouverture et à chaque
  // voyage chargé, jamais après une modification. Sans ce garde-fou, cocher une
  // activité renvoyait à la journée en cours, loin de ce qu'on retouchait —
  // `getCurrentDayIndex` change d'identité à chaque écriture.
  const positionedRevision = useRef<number | null>(null)
  useEffect(() => {
    if (!hasData || positionedRevision.current === tripRevision) return
    positionedRevision.current = tripRevision
    selectDay(getCurrentDayIndex())
  }, [hasData, tripRevision, getCurrentDayIndex, selectDay])

  // Une seule fois par visite, une fois l'état local connu : savoir si l'app est
  // installée et si elle s'ouvre sur un voyage dit à quoi ressemble l'entrée.
  useEffect(() => {
    if (isLoading || appOpenedRef.current) return
    appOpenedRef.current = true
    trackEvent('app_opened', {
      display_mode: window.matchMedia('(display-mode: standalone)').matches
        ? 'standalone'
        : 'browser',
      has_trip: hasData,
      is_demo: isDemo,
    })
  }, [isLoading, hasData, isDemo])

  if (isLoading) {
    return (
      <div className="bg-background flex min-h-dvh items-center justify-center">
        <div className="animate-fade flex flex-col items-center gap-3">
          <AppIcon size="md" pulse />
          <p className="text-muted-foreground text-sm">Chargement…</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {hasData ? <TripShell /> : <OnboardingFlow />}
      <ScreenHost />
      {/* Partage reçu par l'URL : rendu des deux côtés de l'onboarding. */}
      <IncomingShareGate />
    </>
  )
}

export default function HomePage() {
  return (
    <Suspense>
      <TripProvider>
        <NavigationProvider>
          <EditSessionProvider>
            <HomePageContent />
          </EditSessionProvider>
        </NavigationProvider>
      </TripProvider>
    </Suspense>
  )
}
