'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTripData } from '@/hooks/use-trip-data'
import { Timeline } from '@/components/timeline'
import { DayDetail } from '@/components/day-detail'
import { ShareDialog } from '@/components/share-dialog'
import { DataManager } from '@/components/data-manager'
import { OnboardingScreen } from '@/components/onboarding-screen'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChevronLeft, ChevronRight, Map, List, FolderOpen } from 'lucide-react'
import { DocumentsView } from '@/components/documents-view'
import { ImageCacheProvider } from '@/components/image-cache-provider'
import { CacheStatusBadge } from '@/components/cache-status-badge'
import { MapOverlay } from '@/components/map-overlay'
import { cn } from '@/lib/utils'
import { AppIcon } from '@/components/app-icon'
import { DemoBanner } from '@/components/demo-banner'

function getTripCountdown(
  tripStartDate: Date,
  tripEndDate: Date,
): {
  type: 'before' | 'during' | 'after'
  days: number
} {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const start = new Date(tripStartDate)
  start.setHours(0, 0, 0, 0)

  const end = new Date(tripEndDate)
  end.setHours(0, 0, 0, 0)

  if (today < start) {
    const diff = Math.ceil(
      (start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    )
    return { type: 'before', days: diff }
  }

  if (today > end) {
    const diff = Math.ceil(
      (today.getTime() - end.getTime()) / (1000 * 60 * 60 * 24),
    )
    return { type: 'after', days: diff }
  }

  const diff =
    Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  return { type: 'during', days: diff }
}

function HomePageContent() {
  const {
    isLoading,
    hasData,
    isDemo,
    itinerary,
    tripStartDate,
    tripEndDate,
    loadMockData,
    importData,
    exportData,
    clearData,
    getCurrentDayIndex,
  } = useTripData()

  const searchParams = useSearchParams()

  const [selectedDay, setSelectedDay] = useState(0)
  const [activeTab, setActiveTab] = useState<'roadbook' | 'documents'>(
    'roadbook',
  )
  const [isMapOpen, setIsMapOpen] = useState(false)

  useEffect(() => {
    if (!hasData && !isLoading && searchParams.get('demo') === 'true') {
      loadMockData()
    }
  }, [hasData, isLoading, searchParams, loadMockData])

  useEffect(() => {
    if (hasData) {
      setSelectedDay(getCurrentDayIndex())
    }
  }, [hasData, getCurrentDayIndex])

  if (isLoading) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <AppIcon size="md" pulse />
          <p className="text-muted-foreground text-sm">Chargement…</p>
        </div>
      </div>
    )
  }

  if (!hasData) {
    return (
      <OnboardingScreen
        onImportFile={importData}
        onUseMockData={loadMockData}
      />
    )
  }

  const countdown = getTripCountdown(tripStartDate, tripEndDate)
  const safeDay = Math.min(selectedDay, itinerary.length - 1)
  const currentDay = itinerary[safeDay]

  const handlePrevDay = () => {
    setSelectedDay((prev) => Math.max(0, prev - 1))
  }

  const handleNextDay = () => {
    setSelectedDay((prev) => Math.min(itinerary.length - 1, prev + 1))
  }

  return (
    <ImageCacheProvider itinerary={itinerary} currentDayIndex={safeDay}>
      <main className="bg-background relative min-h-screen overflow-x-clip">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div className="animate-sticker-float bg-primary/12 border-primary/30 absolute top-8 -left-8 h-24 w-24 rotate-12 rounded-2xl border-2" />
          <div className="animate-sticker-bounce bg-secondary/16 border-secondary/35 absolute top-16 right-3 h-20 w-20 -rotate-12 rounded-full border-2" />
          <div className="animate-sticker-float bg-accent/14 border-accent/35 absolute top-72 right-10 h-16 w-16 rotate-6 rounded-xl border-2 [animation-delay:180ms]" />
        </div>

        <div className="relative z-10">
          {/* Demo banner */}
          {isDemo && (
            <DemoBanner
              onQuitDemo={() => {
                clearData()
                window.history.replaceState(null, '', window.location.pathname)
              }}
            />
          )}

          {/* Header */}
          <header
            className="bg-card/85 border-border/60 sticky top-0 z-50 border-b backdrop-blur-xl"
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
          >
            <div className="mx-auto max-w-4xl px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Geometric tile emblem */}
                  <AppIcon size="sm" />
                  <div>
                    <h1 className="text-foreground font-display text-base leading-tight font-bold tracking-[0.08em] uppercase">
                      TripBrain
                    </h1>
                    <p className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
                      {countdown.type === 'before' &&
                        `Départ dans ${countdown.days} jour${countdown.days > 1 ? 's' : ''}`}
                      {countdown.type === 'during' &&
                        `Jour ${countdown.days} du voyage`}
                      {countdown.type === 'after' &&
                        `Voyage terminé il y a ${countdown.days} jour${countdown.days > 1 ? 's' : ''}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <CacheStatusBadge />
                  <DataManager
                    onExport={exportData}
                    onImport={importData}
                    onClear={clearData}
                  />
                  <ShareDialog
                    itinerary={itinerary}
                    selectedDay={selectedDay}
                  />
                </div>
              </div>
            </div>
          </header>

          {/* Timeline */}
          <section className="border-border/60 bg-card/55 border-b backdrop-blur-md">
            <div className="mx-auto max-w-4xl">
              <Timeline
                itinerary={itinerary}
                selectedDay={selectedDay}
                onSelectDay={(index) => {
                  setSelectedDay(index)
                  if (activeTab === 'documents') {
                    setActiveTab('roadbook')
                  }
                }}
              />
            </div>
          </section>

          {/* Main Content */}
          <div id="main-content" className="mx-auto max-w-4xl px-4 py-6">
            {/* Navigation + tabs bar */}
            <div className="mb-6 flex items-center justify-between">
              {activeTab === 'documents' ? (
                <div className="w-22" aria-hidden />
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevDay}
                  disabled={selectedDay === 0}
                  className="border-border/70 hover:bg-muted/60 gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Précédent</span>
                </Button>
              )}

              <Tabs
                value={activeTab}
                onValueChange={(v) =>
                  setActiveTab(v as 'roadbook' | 'documents')
                }
                className="shrink-0"
              >
                <TabsList className="bg-muted/70 grid h-9 w-full grid-cols-2">
                  <TabsTrigger
                    value="roadbook"
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5 text-xs"
                  >
                    <List className="h-3.5 w-3.5" />
                    Roadbook
                  </TabsTrigger>
                  <TabsTrigger
                    value="documents"
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5 text-xs"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    Docs
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {activeTab === 'documents' ? (
                <div className="w-22" aria-hidden />
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextDay}
                  disabled={selectedDay === itinerary.length - 1}
                  className="border-border/70 hover:bg-muted/60 gap-1"
                >
                  <span className="hidden sm:inline">Suivant</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Content */}
            {activeTab === 'roadbook' ? (
              <DayDetail day={currentDay} />
            ) : (
              <DocumentsView />
            )}
          </div>

          {/* Mobile bottom nav spacer */}
          <div className="mb-[env(safe-area-inset-bottom)] h-20 md:hidden [@media(display-mode:standalone)]:mb-[calc(env(safe-area-inset-bottom)+1.5rem)]" />

          {/* Mobile bottom navigation */}
          <nav className="bg-card/85 border-border/60 fixed right-0 bottom-0 left-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden [@media(display-mode:standalone)]:pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
            <div className="flex items-center justify-around gap-2 py-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrevDay}
                disabled={selectedDay === 0 || activeTab === 'documents'}
                className={cn(`h-auto w-16 flex-col gap-0.5 py-2`, {
                  'pointer-events-none opacity-50': activeTab === 'documents',
                })}
                aria-hidden={activeTab === 'documents'}
                tabIndex={activeTab === 'documents' ? -1 : undefined}
              >
                <ChevronLeft className="h-5 w-5" />
                <span className="text-[10px]">Précédent</span>
              </Button>

              <Button
                variant={activeTab === 'roadbook' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('roadbook')}
                className="h-auto flex-1 flex-col gap-0.5 py-2"
              >
                <List className="h-5 w-5" />
                <span className="text-[10px]">Roadbook</span>
              </Button>

              <Button
                variant={activeTab === 'documents' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('documents')}
                className="h-auto flex-1 flex-col gap-0.5 py-2"
              >
                <FolderOpen className="h-5 w-5" />
                <span className="text-[10px]">Docs</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleNextDay}
                disabled={
                  selectedDay === itinerary.length - 1 ||
                  activeTab === 'documents'
                }
                className={cn(`h-auto w-16 flex-col gap-0.5 py-2`, {
                  'pointer-events-none opacity-50': activeTab === 'documents',
                })}
                aria-hidden={activeTab === 'documents'}
                tabIndex={activeTab === 'documents' ? -1 : undefined}
              >
                <ChevronRight className="h-5 w-5" />
                <span className="text-[10px]">Suivant</span>
              </Button>
            </div>
          </nav>

          {/* Floating map button */}
          <Button
            onClick={() => setIsMapOpen(true)}
            className="fixed right-5 bottom-20 z-40 rounded-full shadow-lg hover:shadow-xl md:bottom-8"
            aria-label="Ouvrir la carte"
          >
            <Map className="h-4 w-4" strokeWidth={2} />
            <span className="text-sm font-semibold">Carte</span>
          </Button>

          {/* Immersive map overlay */}
          {isMapOpen && (
            <MapOverlay
              itinerary={itinerary}
              selectedDay={selectedDay}
              onSelectDay={(index) => {
                setSelectedDay(index)
              }}
              onClose={() => setIsMapOpen(false)}
            />
          )}
        </div>
      </main>
    </ImageCacheProvider>
  )
}

export default function HomePage() {
  return (
    <Suspense>
      <HomePageContent />
    </Suspense>
  )
}
