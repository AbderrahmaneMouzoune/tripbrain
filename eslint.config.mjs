import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Règles du React Compiler, arrivées avec eslint-plugin-react-hooks 7.
    // Le code existant les enfreint à ~65 endroits (relecture du stockage
    // local dans un effet, refs lues au rendu) : les corriger demande de
    // réécrire ces composants un par un. En avertissement d'ici là, pour
    // qu'elles restent visibles sans bloquer la CI.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'next-env.d.ts',
    // Copiés depuis node_modules par scripts/copy-pdfjs-assets.mjs.
    'public/**',
  ]),
])
