'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { useTripData, type TripDataApi } from '@/hooks/use-trip-data'

/**
 * Les voyages, partagés par tout l'écran : chaque vue lit le voyage consulté
 * et ses actions ici plutôt que de les recevoir de main en main.
 */
const TripContext = createContext<TripDataApi | null>(null)

export function TripProvider({ children }: { children: ReactNode }) {
  const value = useTripData()
  return <TripContext.Provider value={value}>{children}</TripContext.Provider>
}

export function useTrip(): TripDataApi {
  const value = useContext(TripContext)
  if (!value) {
    throw new Error('useTrip doit être appelé sous <TripProvider>.')
  }
  return value
}
