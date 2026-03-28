'use client'

import { useState, useEffect } from 'react'
import { useTripData } from '@/hooks/use-trip-data'
import { useItineraryEditor } from '@/hooks/use-itinerary-editor'
import { Timeline } from '@/components/timeline'
import { DayDetail } from '@/components/day-detail'
import { TripMap } from '@/components/trip-map'
import { ShareDialog } from '@/components/share-dialog'
import { DataManager } from '@/components/data-manager'
import { OnboardingScreen } from '@/components/onboarding-screen'
import { VersionHistoryDialog } from '@/components/version-history-dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChevronLeft, ChevronRight, Map, List, Compass, FolderOpen, Pencil, History } from 'lucide-react'
import { DocumentsView } from '@/components/documents-view'

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

export default function HomePage() {
  const {
    isLoading,
    hasData,
    itinerary,
    tripStartDate,
    tripEndDate,
    loadMockData,
    importData,
    exportData,
    clearData,
    getCurrentDayIndex,
    updateItinerary,
    saveSnapshot,
    getSnapshots,
    restoreSnapshot,
  } = useTripData()

  const editor = useItineraryEditor({
    itinerary,
    updateItinerary,
    saveSnapshot,
  })

  const [selectedDay, setSelectedDay] = useState(0)
  const [activeTab, setActiveTab] = useState<'roadbook' | 'map' | 'documents'>('roadbook')
  const [editMode, setEditMode] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  useEffect(() => {
    if (hasData) {
      setSelectedDay(getCurrentDayIndex())
    }
  }, [hasData, getCurrentDayIndex])

  if (isLoading) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="bg-primary flex h-14 w-14 items-center justify-center rounded-2xl">
            <Compass className="text-primary-foreground h-7 w-7 animate-pulse" strokeWidth={1.5} />
          </div>
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
    <main className="bg-background relative min-h-screen overflow-x-clip">
      <VersionHistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        getSnapshots={getSnapshots}
        onRestore={restoreSnapshot}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-sticker-float bg-primary/12 border-primary/30 absolute top-8 -left-8 h-24 w-24 rotate-12 rounded-2xl border-2" />
        <div className="animate-sticker-bounce bg-secondary/16 border-secondary/35 absolute top-16 right-3 h-20 w-20 -rotate-12 rounded-full border-2" />
        <div className="animate-sticker-float [animation-delay:180ms] bg-accent/14 border-accent/35 absolute top-72 right-10 h-16 w-16 rotate-6 rounded-xl border-2" />
      </div>

      <div className="relative z-10">
        {/* Header */}
      <header
        className="bg-card/85 border-border/60 sticky top-0 z-50 border-b backdrop-blur-xl"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto max-w-4xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Geometric tile emblem */}
              <div className="relative h-10 w-10 shrink-0">
                <div className="bg-primary absolute inset-0 rotate-6 rounded-lg opacity-20" />
                <div className="bg-primary relative flex h-10 w-10 items-center justify-center rounded-lg shadow-sm">
                  <Compass
                    className="text-primary-foreground h-5 w-5"
                    strokeWidth={1.5}
                  />
                </div>
              </div>
              <div>
                <h1
                  className="text-foreground font-display text-base leading-tight font-bold tracking-[0.08em] uppercase"
                >
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
              <Button
                variant={editMode ? 'default' : 'ghost'}
                size="icon"
                title={editMode ? 'Quitter le mode édition' : "Modifier l'itinéraire"}
                onClick={() => {
                  if (editMode) editor.resetSession()
                  setEditMode((v) => !v)
                }}
              >
                <Pencil className="h-5 w-5" />
                <span className="sr-only">{editMode ? 'Quitter le mode édition' : "Modifier l'itinéraire"}</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Historique des versions"
                onClick={() => setHistoryOpen(true)}
              >
                <History className="h-5 w-5" />
                <span className="sr-only">Historique des versions</span>
              </Button>
              <DataManager
                onExport={exportData}
                onImport={importData}
                onClear={clearData}
              />
              <ShareDialog itinerary={itinerary} selectedDay={selectedDay} />
            </div>
          </div>
        </div>
      </header>

      {/* Edit mode banner */}
      {editMode && (
        <div className="bg-primary/10 border-primary/30 border-b px-4 py-2">
          <div className="mx-auto max-w-4xl flex items-center justify-between gap-3">
            <p className="text-primary text-xs font-medium flex items-center gap-1.5">
              <Pencil className="h-3.5 w-3.5" />
              Mode édition actif — Les modifications sont sauvegardées automatiquement
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs border-primary/40 text-primary hover:bg-primary/10"
              onClick={() => {
                editor.resetSession()
                setEditMode(false)
              }}
            >
              Terminer
            </Button>
          </div>
        </div>
      )}

      {/* Timeline */}
      <section className="border-border/60 bg-card/55 border-b backdrop-blur-md">
        <div className="mx-auto max-w-4xl">
          <Timeline itinerary={itinerary} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
        </div>
      </section>

      {/* Main Content */}
      <div className="mx-auto max-w-4xl px-4 py-6">
        {/* Navigation + tabs bar */}
        <div className="mb-6 flex items-center justify-between">
          {activeTab === 'documents' ? (
            <div className="w-[88px]" aria-hidden />
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
            onValueChange={(v) => setActiveTab(v as 'roadbook' | 'map' | 'documents')}
            className="shrink-0"
          >
            <TabsList className="bg-muted/70 grid h-9 w-full grid-cols-3">
              <TabsTrigger
                value="roadbook"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5 text-xs"
              >
                <List className="h-3.5 w-3.5" />
                Roadbook
              </TabsTrigger>
              <TabsTrigger
                value="map"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5 text-xs"
              >
                <Map className="h-3.5 w-3.5" />
                Carte
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
            <div className="w-[88px]" aria-hidden />
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
          <DayDetail
            day={currentDay}
            editMode={editMode}
            onUpdateDay={(updates) => editor.updateDay(safeDay, updates)}
            onAddActivity={(activity) => editor.addActivity(safeDay, activity)}
            onUpdateActivity={(actIndex, activity) =>
              editor.updateActivity(safeDay, actIndex, activity)
            }
            onDeleteActivity={(actIndex) =>
              editor.deleteActivity(safeDay, actIndex)
            }
            onDuplicateActivity={(actIndex) =>
              editor.duplicateActivity(safeDay, actIndex)
            }
            onMoveActivityUp={(actIndex) =>
              editor.moveActivityUp(safeDay, actIndex)
            }
            onMoveActivityDown={(actIndex) =>
              editor.moveActivityDown(safeDay, actIndex)
            }
          />
        ) : activeTab === 'map' ? (
          <div className="flex flex-col gap-4">
            <TripMap itinerary={itinerary} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
            <DayDetail
              day={currentDay}
              editMode={editMode}
              onUpdateDay={(updates) => editor.updateDay(safeDay, updates)}
              onAddActivity={(activity) => editor.addActivity(safeDay, activity)}
              onUpdateActivity={(actIndex, activity) =>
                editor.updateActivity(safeDay, actIndex, activity)
              }
              onDeleteActivity={(actIndex) =>
                editor.deleteActivity(safeDay, actIndex)
              }
              onDuplicateActivity={(actIndex) =>
                editor.duplicateActivity(safeDay, actIndex)
              }
              onMoveActivityUp={(actIndex) =>
                editor.moveActivityUp(safeDay, actIndex)
              }
              onMoveActivityDown={(actIndex) =>
                editor.moveActivityDown(safeDay, actIndex)
              }
            />
          </div>
        ) : (
          <DocumentsView />
        )}
      </div>

      {/* Mobile bottom nav spacer */}
      <div className="h-20 mb-[env(safe-area-inset-bottom)] [@media(display-mode:standalone)]:mb-[calc(env(safe-area-inset-bottom)+1.5rem)] md:hidden" />

      {/* Mobile bottom navigation */}
      <nav
        className="bg-card/85 border-border/60 fixed right-0 bottom-0 left-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-xl [@media(display-mode:standalone)]:pb-[calc(env(safe-area-inset-bottom)+1.5rem)] md:hidden"
      >
        <div className="flex items-center justify-around py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrevDay}
            disabled={selectedDay === 0 || activeTab === 'documents'}
            className={`h-auto flex-col gap-0.5 py-2 ${activeTab === 'documents' ? 'pointer-events-none opacity-0' : ''}`}
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
            className="h-auto flex-col gap-0.5 py-2"
          >
            <List className="h-5 w-5" />
            <span className="text-[10px]">Roadbook</span>
          </Button>

          <Button
            variant={activeTab === 'map' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('map')}
            className="h-auto flex-col gap-0.5 py-2"
          >
            <Map className="h-5 w-5" />
            <span className="text-[10px]">Carte</span>
          </Button>

          <Button
            variant={activeTab === 'documents' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('documents')}
            className="h-auto flex-col gap-0.5 py-2"
          >
            <FolderOpen className="h-5 w-5" />
            <span className="text-[10px]">Docs</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleNextDay}
            disabled={selectedDay === itinerary.length - 1 || activeTab === 'documents'}
            className={`h-auto flex-col gap-0.5 py-2 ${activeTab === 'documents' ? 'pointer-events-none opacity-0' : ''}`}
            aria-hidden={activeTab === 'documents'}
            tabIndex={activeTab === 'documents' ? -1 : undefined}
          >
            <ChevronRight className="h-5 w-5" />
            <span className="text-[10px]">Suivant</span>
          </Button>
        </div>
      </nav>
      </div>
    </main>
  )
}
