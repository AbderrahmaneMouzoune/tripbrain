// Tests de bout en bout des itinéraires modèles, en HTTP réel :
// faux S3 en mémoire → `next start` (build de production) → scénarios.
//
//   bun run e2e:templates
//
// Variables :
//   E2E_SKIP_BUILD=1   réutilise le `.next` existant au lieu de lancer `bun run build`
//   E2E_ONLY=<texte>   ne joue que les scénarios dont le nom contient ce texte
//   E2E_VERBOSE=1      recopie le journal du serveur Next au fil de l'eau
//
// Code de sortie : 0 si tous les scénarios passent, 1 sinon.
// Procédure : `docs/itineraire-modele-technique.md` §9.

import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startFakeS3, type FakeS3 } from './fake-s3'
import { runTemplateScenarios } from './templates-e2e'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BUCKET = 'e2e'
const READY_TIMEOUT_MS = 90_000
const VERBOSE = process.env.E2E_VERBOSE === '1'

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address ? address.port : 0
      probe.close(() => resolve(port))
    })
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`
}

/** `bun run build`, journal gardé pour l'afficher en cas d'échec. */
async function build(): Promise<void> {
  const started = Date.now()
  console.log('Build de production (bun run build)…')
  const output: string[] = []
  const child = spawn('bun', ['run', 'build'], {
    cwd: ROOT,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout?.on('data', (chunk: Buffer) => output.push(chunk.toString()))
  child.stderr?.on('data', (chunk: Buffer) => output.push(chunk.toString()))
  const code = await new Promise<number | null>((resolve) =>
    child.on('exit', resolve),
  )
  if (code !== 0) {
    console.error(output.join('').split('\n').slice(-60).join('\n'))
    throw new Error(`Le build a échoué (code ${code}).`)
  }
  console.log(`Build terminé en ${seconds(Date.now() - started)}.`)
}

interface NextServer {
  url: string
  child: ChildProcess
  log: () => string
}

/**
 * `next start` sous Node, comme en production, avec les variables R2 qui
 * pointent vers le faux S3. Le groupe de processus est tué en entier.
 */
async function startNext(s3: FakeS3): Promise<NextServer> {
  const port = await freePort()
  const lines: string[] = []
  const nextBin = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')
  const child = spawn(
    'node',
    [nextBin, 'start', '-p', String(port), '-H', '127.0.0.1'],
    {
      cwd: ROOT,
      detached: true,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        R2_ENDPOINT: s3.url,
        R2_BUCKET_NAME: BUCKET,
        R2_ACCESS_KEY_ID: 'x',
        R2_SECRET_ACCESS_KEY: 'y',
        // Ignoré quand `R2_ENDPOINT` est posé : on s'assure qu'il ne sert pas.
        R2_ACCOUNT_ID: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const collect = (chunk: Buffer) => {
    const text = chunk.toString()
    lines.push(text)
    if (VERBOSE) process.stdout.write(`[next] ${text}`)
  }
  child.stdout?.on('data', collect)
  child.stderr?.on('data', collect)
  let exited: number | null | undefined
  child.on('exit', (code) => {
    exited = code
  })

  const url = `http://127.0.0.1:${port}`
  const started = Date.now()
  while (Date.now() - started < READY_TIMEOUT_MS) {
    if (exited !== undefined) {
      console.error(lines.join(''))
      throw new Error(`next start s'est arrêté (code ${exited}).`)
    }
    try {
      const response = await fetch(`${url}/api/templates/index`)
      if (response.status === 200) {
        console.log(
          `Serveur Next prêt sur ${url} en ${seconds(Date.now() - started)}.`,
        )
        return { url, child, log: () => lines.join('') }
      }
    } catch {
      // Pas encore à l'écoute.
    }
    await sleep(250)
  }
  stopNext(child)
  console.error(lines.join(''))
  throw new Error(`next start n'a pas répondu en ${seconds(READY_TIMEOUT_MS)}.`)
}

function stopNext(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}

async function waitForExit(child: ChildProcess, ms: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(ms),
  ])
  if (child.exitCode === null && child.signalCode === null && child.pid) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
  }
}

async function main(): Promise<number> {
  const started = Date.now()
  const s3 = await startFakeS3()
  console.log(`Faux S3 à l’écoute sur ${s3.url} (bucket « ${BUCKET} »).`)
  let next: NextServer | null = null
  const interrupt = () => {
    if (next) stopNext(next.child)
    process.exit(130)
  }
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', interrupt)
  try {
    if (process.env.E2E_SKIP_BUILD === '1') {
      console.log('Build sauté (E2E_SKIP_BUILD=1) : .next existant réutilisé.')
    } else {
      await build()
    }
    next = await startNext(s3)
    const server = next
    const report = await runTemplateScenarios({
      baseUrl: server.url,
      s3,
      bucket: BUCKET,
      root: ROOT,
      r2Env: {
        R2_ENDPOINT: s3.url,
        R2_BUCKET_NAME: BUCKET,
        R2_ACCESS_KEY_ID: 'x',
        R2_SECRET_ACCESS_KEY: 'y',
      },
      serverLog: server.log,
      only: process.env.E2E_ONLY,
    })
    console.log(`Durée totale : ${seconds(Date.now() - started)}.`)
    if (report.failed > 0 && !VERBOSE) {
      console.log('\nFin du journal du serveur Next :')
      console.log(server.log().split('\n').slice(-40).join('\n'))
    }
    return report.failed > 0 ? 1 : 0
  } finally {
    if (next) {
      stopNext(next.child)
      await waitForExit(next.child, 5000)
    }
    await s3.close()
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error)
    process.exit(1)
  },
)
