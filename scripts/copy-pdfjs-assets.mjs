/**
 * Copie dans `public/pdfjs/<version>/` ce dont pdf.js a besoin à l'exécution :
 * le worker, les polices standard, les tables de caractères (CMap) et les
 * décodeurs WebAssembly. Servis comme fichiers statiques, ils passent par le
 * service worker et restent disponibles hors ligne.
 *
 * Le numéro de version dans le chemin évite qu'un cache garde un worker d'une
 * autre version que la bibliothèque (pdf.js refuse alors d'ouvrir le fichier).
 * Lancé avant `next dev` et `next build` ; le dossier n'est pas versionné.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkgDir = dirname(require.resolve('pdfjs-dist/package.json'))
const { version } = JSON.parse(
  readFileSync(join(pkgDir, 'package.json'), 'utf8'),
)

const publicDir = join(root, 'public', 'pdfjs')
const target = join(publicDir, version)

if (existsSync(join(target, 'pdf.worker.min.mjs'))) process.exit(0)

// Une seule version à la fois : les anciennes partent.
rmSync(publicDir, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
cpSync(
  join(pkgDir, 'legacy', 'build', 'pdf.worker.min.mjs'),
  join(target, 'pdf.worker.min.mjs'),
)
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
  cpSync(join(pkgDir, folder), join(target, folder), { recursive: true })
}
console.log(`pdf.js ${version} : fichiers copiés dans public/pdfjs/${version}`)
