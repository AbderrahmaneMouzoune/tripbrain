import { defineConfig } from 'vitest/config'

// Seules les fonctions pures de lib/ sont testées ici : tout ce qui touche
// React Native passe par un build de développement sur appareil.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/__tests__/**/*.test.ts'],
  },
})
