'use client'

import { useState, useEffect, useMemo, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTripData } from '@/hooks/use-trip-data'
import type { DayItinerary } from '@/lib/itinerary-data'
import { useSwipe } from '@/hooks/use-swipe'
import { Timeline } from '@/components/timeline'
import { DayDetail } from '@/components/day-detail'
import { ShareDialog } from '@/components/share-dialog'
import {
  ImportShareDialog,
  type ImportShareSource,
} from '@/components/share-dialog/import-share-dialog'
import { OnboardingScreen } from '@/components/onboarding-screen'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  EditReviewDialog,
  type EditReviewIntent,
} from '@/components/edit/edit-review-dialog'
import { countChanges, summarizeItineraryChanges } from '@/lib/itinerary-diff'
import {
  ChevronLeft,
  ChevronRight,
  Map,
  List,
  FolderOpen,
  Pencil,
  Check,
  Undo2,
} from 'lucide-react'
import { DocumentsView } from '@/components/documents-view'
import { ImageCacheProvider } from '@/components/image-cache-provider'
import { CacheStatusBadge } from '@/components/cache-status-badge'
import { MapOverlay } from '@/components/map-overlay'
import { cn } from '@/lib/utils'
import { AppIcon } from '@/components/app-icon'
import { DemoBanner } from '@/components/demo-banner'
import { trackEvent } from '@/lib/analytics/client'

/** Gestes possibles pour changer de journée : sert la mesure d'usage. */
type DayChangeMethod = 'swipe' | 'arrow' | 'timeline' | 'bottom_nav' | 'map'

/** Endroits d'où l'on bascule entre roadbook et documents. */
type TabSurface = 'tabs' | 'bottom_nav' | 'timeline'

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
    tripRevision,
    tripStartDate,
    tripEndDate,
    loadMockData,
    importData,
    importXlsxData,
    importCsvData,
    importSharedItinerary,
    updateDay,
    replaceItinerary,
    exportData,
    clearData,
    getCurrentDayIndex,
  } = useTripData()

  const searchParams = useSearchParams()

  // Partage reçu via l'URL, en attente de confirmation de l'utilisateur.
  const [sharedSource, setSharedSource] = useState<ImportShareSource | null>(
    null,
  )
  const sharedHandledRef = useRef(false)

  const appOpenedRef = useRef(false)

  const [selectedDay, setSelectedDay] = useState(0)
  const [swipeDirection, setSwipeDirection] = useState<
    'left' | 'right' | 'idle' | null
  >(null)
  const [activeTab, setActiveTab] = useState<'roadbook' | 'documents'>(
    'roadbook',
  )
  const [isMapOpen, setIsMapOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  // Photo de l'itinéraire prise à l'entrée en mode édition : elle permet de
  // tout remettre en place d'un geste tant que la session d'édition dure.
  const [editBaseline, setEditBaseline] = useState<DayItinerary[] | null>(null)
  // `reviewIntent` survit à la fermeture pour que le récapitulatif garde son
  // titre pendant l'animation de sortie.
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewIntent, setReviewIntent] = useState<EditReviewIntent>('save')

  // Récapitulatif des modifications de la session, alimenté par la photo.
  const changeSummaries = useMemo(
    () =>
      editBaseline ? summarizeItineraryChanges(editBaseline, itinerary) : [],
    [editBaseline, itinerary],
  )
  const pendingChanges = countChanges(changeSummaries)
  const hasPendingEdits = pendingChanges > 0

  const handleDayChange = (day: DayItinerary) => {
    updateDay(day).catch((error) => {
      console.error('Enregistrement de la journée impossible', error)
    })
  }

  const startEditing = () => {
    setEditBaseline(itinerary)
    setIsEditing(true)
    trackEvent('edit_mode_started')
  }

  const openReview = (intent: EditReviewIntent) => {
    setReviewIntent(intent)
    setReviewOpen(true)
  }

  /** Clôt la session : la photo est oubliée, le retour arrière n'est plus offert. */
  const stopEditing = () => {
    setReviewOpen(false)
    setIsEditing(false)
    setEditBaseline(null)
  }

  /**
   * Sortie par le bouton d'en-tête : avec des modifications en attente, on
   * passe par le récapitulatif plutôt que de clore la session en silence.
   */
  const toggleEditing = () => {
    if (!isEditing) {
      startEditing()
      return
    }
    if (hasPendingEdits) {
      openReview('save')
      return
    }
    stopEditing()
  }

  const discardEdits = () => {
    if (!editBaseline) {
      stopEditing()
      return
    }

    const discarded = pendingChanges

    replaceItinerary(editBaseline).then(
      () => {
        trackEvent('edit_changes_discarded', { changes_count: discarded })
        stopEditing()
      },
      (error) => {
        console.error('Annulation des modifications impossible', error)
      },
    )
  }

  useEffect(() => {
    if (!hasData && !isLoading && searchParams.get('demo') === 'true') {
      loadMockData()
    }
  }, [hasData, isLoading, searchParams, loadMockData])

  // Arrivée par un partage : `?import=` embarque l'itinéraire complet, `?code=`
  // pointe vers un partage déposé sur le serveur. L'URL est nettoyée aussitôt
  // pour qu'un rechargement ne repropose pas le même import, et le drapeau
  // garantit qu'on ne le traite qu'une fois par visite.
  useEffect(() => {
    if (isLoading || sharedHandledRef.current) return

    const payload = searchParams.get('import')
    const code = searchParams.get('code')
    if (!payload && !code) return

    sharedHandledRef.current = true
    setSharedSource(
      payload
        ? { kind: 'payload', payload }
        : { kind: 'code', code: code as string },
    )
    window.history.replaceState(null, '', window.location.pathname)
  }, [isLoading, searchParams])

  // Placement automatique sur la journée du jour : à l'ouverture et à chaque
  // voyage chargé, jamais après une modification. Sans ce garde-fou, cocher une
  // activité renvoyait à la journée en cours, loin de ce qu'on était en train
  // de retoucher — `getCurrentDayIndex` change d'identité à chaque écriture.
  const positionedRevision = useRef<number | null>(null)

  useEffect(() => {
    if (!hasData || positionedRevision.current === tripRevision) return

    positionedRevision.current = tripRevision
    setSelectedDay(getCurrentDayIndex())
  }, [hasData, tripRevision, getCurrentDayIndex])

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

  /** D'où vient le changement de journée : le geste compte autant que le saut. */
  const handlePrevDay = (method: DayChangeMethod = 'arrow') => {
    setSwipeDirection('right')
    setSelectedDay((prev) => Math.max(0, prev - 1))
    trackEvent('day_changed', { method, direction: 'previous' })
  }

  const handleNextDay = (method: DayChangeMethod = 'arrow') => {
    setSwipeDirection('left')
    setSelectedDay((prev) => Math.min(itinerary.length - 1, prev + 1))
    trackEvent('day_changed', { method, direction: 'next' })
  }

  const swipeHandlers = useSwipe({
    onSwipeLeft: () => {
      if (activeTab === 'roadbook' && selectedDay < itinerary.length - 1) {
        handleNextDay('swipe')
      }
    },
    onSwipeRight: () => {
      if (activeTab === 'roadbook' && selectedDay > 0) {
        handlePrevDay('swipe')
      }
    },
  })

  const openTab = (view: 'roadbook' | 'documents', surface: TabSurface) => {
    if (view !== activeTab) trackEvent('view_changed', { view, surface })
    setActiveTab(view)
  }

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

  // Rendue des deux côtés de l'onboarding : l'import fait passer de l'un à l'autre.
  const sharedImportDialog = sharedSource ? (
    <ImportShareDialog
      open
      onOpenChange={(next) => {
        if (!next) setSharedSource(null)
      }}
      source={sharedSource}
      hasExistingData={hasData}
      onImport={importSharedItinerary}
    />
  ) : null

  if (!hasData) {
    return (
      <>
        <OnboardingScreen
          onImportFile={importData}
          onImportXlsx={importXlsxData}
          onImportCsv={importCsvData}
          onImportShared={importSharedItinerary}
          onUseMockData={loadMockData}
        />
        {sharedImportDialog}
      </>
    )
  }

  const countdown = getTripCountdown(tripStartDate, tripEndDate)
  const safeDay = Math.min(selectedDay, itinerary.length - 1)
  const currentDay = itinerary[safeDay]
  const showEditBar = isEditing && activeTab === 'roadbook'

  return (
    <ImageCacheProvider itinerary={itinerary} currentDayIndex={safeDay}>
      <main className="bg-background relative min-h-screen overflow-x-clip">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div className="animate-sticker-float bg-primary/10 border-primary/15 shadow-primary/10 absolute top-8 -left-8 h-24 w-24 rotate-12 rounded-2xl border shadow-sm" />
          <div className="animate-sticker-bounce bg-secondary/10 border-secondary/15 shadow-secondary/10 absolute top-16 right-3 h-20 w-20 -rotate-12 rounded-full border shadow-sm" />
          <div className="animate-sticker-float bg-accent/10 border-accent/15 shadow-accent/10 absolute top-72 right-10 h-16 w-16 rotate-6 rounded-xl border shadow-sm [animation-delay:180ms]" />
        </div>

        <div className="relative z-10">
          {/* Demo banner */}
          {isDemo && (
            <DemoBanner
              onQuitDemo={() => {
                trackEvent('demo_exited')
                trackEvent('data_cleared', { surface: 'demo_banner' })
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
                  {activeTab === 'roadbook' && (
                    <Button
                      variant={isEditing ? 'default' : 'ghost'}
                      size="icon"
                      onClick={toggleEditing}
                      aria-pressed={isEditing}
                      aria-label={
                        isEditing
                          ? 'Quitter le mode édition'
                          : 'Modifier cette journée'
                      }
                      title={
                        isEditing
                          ? 'Quitter le mode édition'
                          : 'Modifier cette journée'
                      }
                    >
                      {isEditing ? (
                        <Check className="h-4 w-4" strokeWidth={2} />
                      ) : (
                        <Pencil className="h-4 w-4" strokeWidth={1.75} />
                      )}
                    </Button>
                  )}
                  <CacheStatusBadge />
                  <ShareDialog
                    itinerary={itinerary}
                    selectedDay={selectedDay}
                    onClear={clearData}
                    onImportShared={importSharedItinerary}
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
                  if (index !== selectedDay) {
                    setSwipeDirection(index > selectedDay ? 'left' : 'right')
                    setSelectedDay(index)
                    trackEvent('day_changed', {
                      method: 'timeline',
                      direction: 'jump',
                    })
                  }
                  if (activeTab === 'documents') {
                    openTab('roadbook', 'timeline')
                  }
                }}
              />
            </div>
          </section>

          {/* Main Content */}
          <div
            id="main-content"
            className="mx-auto max-w-4xl px-4 py-6"
            {...swipeHandlers}
          >
            {/* Navigation + tabs bar */}
            <div className="mb-6 flex items-center justify-between">
              {activeTab === 'documents' ? (
                <div className="w-22" aria-hidden />
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePrevDay('arrow')}
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
                  openTab(v as 'roadbook' | 'documents', 'tabs')
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
                  onClick={() => handleNextDay('arrow')}
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
              <div
                key={safeDay}
                className={cn({
                  'animate-slide-from-right': swipeDirection === 'right',
                  'animate-slide-from-left': swipeDirection === 'left',
                  'animate-fade-up': swipeDirection === null,
                })}
                onAnimationEnd={() => setSwipeDirection('idle')}
              >
                <DayDetail
                  day={currentDay}
                  isEditing={isEditing}
                  onDayChange={handleDayChange}
                />
              </div>
            ) : (
              <DocumentsView />
            )}
          </div>

          {/* Mobile bottom nav spacer */}
          <div className="mb-[env(safe-area-inset-bottom)] h-20 md:hidden [@media(display-mode:standalone)]:mb-[calc(env(safe-area-inset-bottom)+1.5rem)]" />

          {/* Réserve la hauteur de la barre d'édition collante */}
          {showEditBar && (
            <div
              aria-hidden
              className="h-16 md:mb-[env(safe-area-inset-bottom)]"
            />
          )}

          {/* Barre d'édition collante, empilée juste au-dessus de la nav mobile */}
          <div className="fixed inset-x-0 bottom-0 z-40">
            {showEditBar && (
              <div className="bg-card/95 border-border/60 border-t backdrop-blur-xl">
                <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-2.5 md:pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground text-xs font-semibold">
                      Mode édition
                    </p>
                    <p className="text-muted-foreground truncate text-[11px]">
                      {hasPendingEdits
                        ? `${pendingChanges} modification${pendingChanges > 1 ? 's' : ''} à enregistrer`
                        : 'Aucune modification pour le moment'}
                    </p>
                  </div>

                  {hasPendingEdits ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openReview('discard')}
                        className="text-muted-foreground hover:text-destructive h-8 shrink-0 gap-1.5 px-2.5 text-[11px]"
                      >
                        <Undo2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Annuler
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => openReview('save')}
                        className="h-8 shrink-0 gap-1.5 px-3 text-[11px]"
                      >
                        <Check className="h-3.5 w-3.5" strokeWidth={2} />
                        Enregistrer
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={stopEditing}
                      className="h-8 shrink-0 px-3 text-[11px]"
                    >
                      Terminer
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Mobile bottom navigation */}
            <nav className="bg-card/85 border-border/60 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden [@media(display-mode:standalone)]:pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
              <div className="flex items-center justify-around gap-2 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePrevDay('bottom_nav')}
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
                  onClick={() => openTab('roadbook', 'bottom_nav')}
                  className="h-auto flex-1 flex-col gap-0.5 py-2"
                >
                  <List className="h-5 w-5" />
                  <span className="text-[10px]">Roadbook</span>
                </Button>

                <Button
                  variant={activeTab === 'documents' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => openTab('documents', 'bottom_nav')}
                  className="h-auto flex-1 flex-col gap-0.5 py-2"
                >
                  <FolderOpen className="h-5 w-5" />
                  <span className="text-[10px]">Docs</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleNextDay('bottom_nav')}
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
          </div>

          {/* Floating map button */}
          <Button
            onClick={() => {
              trackEvent('map_opened')
              setIsMapOpen(true)
            }}
            className={cn(
              'fixed right-5 z-40 rounded-full shadow-lg transition-[bottom] hover:shadow-xl',
              // Reste au-dessus de la barre d'édition quand elle est déployée.
              showEditBar ? 'bottom-36 md:bottom-24' : 'bottom-20 md:bottom-8',
            )}
            aria-label="Ouvrir la carte"
          >
            <Map className="h-4 w-4" strokeWidth={2} />
            <span className="text-sm font-semibold">Carte</span>
          </Button>

          {/* Double validation de la session d'édition */}
          {isEditing && (
            <EditReviewDialog
              open={reviewOpen}
              onOpenChange={setReviewOpen}
              intent={reviewIntent}
              summaries={changeSummaries}
              onSave={() => {
                trackEvent('edit_changes_saved', {
                  changes_count: pendingChanges,
                })
                stopEditing()
              }}
              onDiscard={discardEdits}
            />
          )}

          {/* Immersive map overlay */}
          {isMapOpen && (
            <MapOverlay
              itinerary={itinerary}
              selectedDay={selectedDay}
              onSelectDay={(index) => {
                if (index !== selectedDay) {
                  trackEvent('day_changed', {
                    method: 'map',
                    direction: 'jump',
                  })
                }
                setSelectedDay(index)
              }}
              onClose={() => {
                trackEvent('map_closed')
                setIsMapOpen(false)
              }}
            />
          )}
        </div>

        {sharedImportDialog}
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
