'use client'

import { useSyncExternalStore } from 'react'
import {
  getGenerationState,
  getGeneratorDraft,
  getServerGenerationState,
  getServerGeneratorDraft,
  subscribeGeneration,
  type GenerationState,
  type GeneratorDraft,
} from '@/lib/generator/generation-store'

/** Vue React de la génération en cours, qui survit à la fermeture de l'écran. */
export function useGeneration(): GenerationState {
  return useSyncExternalStore(
    subscribeGeneration,
    getGenerationState,
    getServerGenerationState,
  )
}

/** Brouillon des formulaires, gardé d'une ouverture à l'autre. */
export function useGeneratorDraft(): GeneratorDraft {
  return useSyncExternalStore(
    subscribeGeneration,
    getGeneratorDraft,
    getServerGeneratorDraft,
  )
}
