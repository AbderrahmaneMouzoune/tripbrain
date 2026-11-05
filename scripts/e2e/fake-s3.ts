// Faux stockage compatible S3, en mémoire, pour les tests de bout en bout des
// itinéraires modèles (`scripts/e2e/run.ts`).
//
// Il implémente exactement ce que `@s3nd/core` et le SDK AWS v3 envoient ici,
// en adressage « path-style » (`/<bucket>/<clé>`) :
// - PutObject, avec `If-None-Match: *` et `If-Match: "<etag>"` (412 sinon) ;
// - GetObject et HeadObject (404 `NoSuchKey`) ;
// - DeleteObject (204) et DeleteObjects (`POST /<bucket>?delete`, XML).
// Toute signature SigV4 est acceptée. Un corps `aws-chunked` est décodé.
// L'ETag change à chaque écriture, même à contenu identique : c'est le cas le
// plus strict pour les écritures conditionnelles.
//
// Pour les assertions et la panne simulée, en plus de l'API en mémoire
// (`FakeS3`) :
//   GET    /__keys[?bucket=e2e]   clés stockées, tailles, ETag
//   GET    /__object?bucket=&key= un objet tel que stocké
//   GET    /__stats               requêtes reçues, par opération
//   POST   /__faults              ajoute une panne (JSON, voir `FaultRuleInput`)
//   DELETE /__faults              retire toutes les pannes
//   POST   /__reset               vide le stockage, les pannes et les compteurs
//
// Lancé seul : `bun scripts/e2e/fake-s3.ts [port]` (défaut 9000).

import { createHash } from 'node:crypto'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import type { AddressInfo, Socket } from 'node:net'
import { fileURLToPath } from 'node:url'

// ── Types ─────────────────────────────────────────────────────────────────────

export type S3Operation =
  | 'PutObject'
  | 'GetObject'
  | 'HeadObject'
  | 'DeleteObject'
  | 'DeleteObjects'

export interface StoredObject {
  body: Buffer
  /** Entre guillemets, comme S3 le renvoie. */
  etag: string
  contentType: string | undefined
  contentEncoding: string | undefined
  cacheControl: string | undefined
  metadata: Record<string, string>
  lastModified: Date
}

export interface StoredKey {
  bucket: string
  key: string
  size: number
  etag: string
}

/**
 * Une panne injectée. Elle vise une opération et, au choix, une clé (égale,
 * ou motif). Sans `times`, elle dure jusqu'à `clearFaults()`. Le SDK rejoue
 * de lui-même un 5xx ou une connexion coupée (3 essais) : une panne d'une
 * seule fois ne se voit donc pas.
 */
export interface FaultRule {
  op?: S3Operation
  key?: string | RegExp
  /** Réponse d'erreur S3 (`<Error><Code>…`) avec ce statut. */
  status?: number
  /** Code S3 de l'erreur ; par défaut d'après le statut. */
  code?: string
  /** Coupe la connexion sans répondre, avant de traiter la requête. */
  reset?: boolean
  /**
   * Traite la requête (l'écriture a lieu), puis coupe la connexion au lieu de
   * répondre : la réponse perdue en route. Le SDK rejoue alors la requête.
   */
  resetAfter?: boolean
  /** Attend avant de traiter (ou d'échouer). */
  delayMs?: number
  /**
   * DeleteObjects seulement : refuse les clés visées une à une, dans un
   * `DeleteResult` en 200, au lieu d'échouer la requête entière.
   */
  perKey?: boolean
  times?: number
}

/** Forme JSON de `POST /__faults` : `key` y est un motif (`RegExp`). */
export interface FaultRuleInput extends Omit<FaultRule, 'key'> {
  key?: string
}

export interface FakeS3 {
  readonly port: number
  /** `http://127.0.0.1:<port>`, à passer en `R2_ENDPOINT`. */
  readonly url: string
  keys(bucket?: string): StoredKey[]
  object(bucket: string, key: string): StoredObject | undefined
  /** Écrit un objet tel quel, sans condition (objets corrompus, restauration). */
  putObject(
    bucket: string,
    key: string,
    body: Buffer,
    contentType?: string,
  ): void
  addFault(rule: FaultRule): void
  clearFaults(): void
  /** Latence ajoutée à chaque requête S3 (pas aux routes `/__…`). */
  setLatency(ms: number): void
  /** Requêtes S3 reçues, par opération. */
  stats(): Record<string, number>
  reset(): void
  /** Ne répond plus du tout : connexion refusée, comme un stockage en panne. */
  stop(): Promise<void>
  /** Écoute à nouveau, sur le même port, avec le même contenu. */
  start(): Promise<void>
  close(): Promise<void>
}

export interface FakeS3Options {
  port?: number
  host?: string
  latencyMs?: number
  /** Journal des requêtes S3 reçues (débogage). */
  log?: (line: string) => void
}

// ── XML ───────────────────────────────────────────────────────────────────────

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>'
const S3_NAMESPACE = 'http://s3.amazonaws.com/doc/2006-03-01/'

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function unescapeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10)),
    )
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

const ERROR_MESSAGES: Record<string, string> = {
  NoSuchKey: 'The specified key does not exist.',
  NoSuchBucket: 'The specified bucket does not exist.',
  PreconditionFailed:
    'At least one of the pre-conditions you specified did not hold',
  InternalError: 'We encountered an internal error. Please try again.',
  SlowDown: 'Please reduce your request rate.',
  ServiceUnavailable: 'Service is unable to handle request.',
  AccessDenied: 'Access Denied',
  NotImplemented:
    'A header you provided implies functionality that is not implemented',
  MalformedXML: 'The XML you provided was not well-formed.',
  BadDigest: 'The Content-MD5 you specified did not match what we received.',
}

function defaultCode(status: number): string {
  switch (status) {
    case 400:
      return 'InvalidRequest'
    case 403:
      return 'AccessDenied'
    case 404:
      return 'NoSuchKey'
    case 409:
      return 'ConditionalRequestConflict'
    case 412:
      return 'PreconditionFailed'
    case 501:
      return 'NotImplemented'
    case 503:
      return 'SlowDown'
    default:
      return 'InternalError'
  }
}

let requestCounter = 0

function requestId(): string {
  requestCounter += 1
  return `E2E${requestCounter.toString(16).toUpperCase().padStart(13, '0')}`
}

function sendError(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  code: string,
  resource: string,
): void {
  const id = requestId()
  res.statusCode = status
  res.setHeader('x-amz-request-id', id)
  // Une réponse HEAD n'a pas de corps : le SDK ne lit que le statut.
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  const body =
    XML_HEADER +
    `<Error><Code>${escapeXml(code)}</Code>` +
    `<Message>${escapeXml(ERROR_MESSAGES[code] ?? code)}</Message>` +
    `<Resource>${escapeXml(resource)}</Resource>` +
    `<RequestId>${id}</RequestId></Error>`
  res.setHeader('content-type', 'application/xml')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}

// ── Corps ─────────────────────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/**
 * Corps `aws-chunked` (`x-amz-content-sha256: STREAMING-…`) :
 * `<taille hexa>[;chunk-signature=…]\r\n<octets>\r\n` … `0\r\n<trailers>\r\n`.
 */
function decodeAwsChunked(raw: Buffer): Buffer {
  const parts: Buffer[] = []
  let offset = 0
  while (offset < raw.length) {
    const lineEnd = raw.indexOf('\r\n', offset)
    if (lineEnd < 0) throw new Error('aws-chunked : ligne de taille tronquée')
    const header = raw.subarray(offset, lineEnd).toString('latin1')
    const size = parseInt(header.split(';')[0].trim(), 16)
    if (!Number.isFinite(size)) {
      throw new Error(`aws-chunked : taille illisible « ${header} »`)
    }
    offset = lineEnd + 2
    if (size === 0) break
    parts.push(raw.subarray(offset, offset + size))
    offset += size + 2
  }
  return Buffer.concat(parts)
}

function isAwsChunked(req: IncomingMessage): boolean {
  const sha = String(req.headers['x-amz-content-sha256'] ?? '')
  const encoding = String(req.headers['content-encoding'] ?? '')
  return sha.startsWith('STREAMING-') || /\baws-chunked\b/i.test(encoding)
}

/** `Content-Encoding` sans `aws-chunked`, qui ne décrit que le transport. */
function storedEncoding(header: string | undefined): string | undefined {
  if (!header) return undefined
  const kept = header
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && part.toLowerCase() !== 'aws-chunked')
  return kept.length > 0 ? kept.join(', ') : undefined
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name]
  return Array.isArray(value) ? value.join(', ') : value
}

function stripQuotes(etag: string): string {
  return etag.trim().replace(/^W\//, '').replace(/^"|"$/g, '')
}

// ── Serveur ───────────────────────────────────────────────────────────────────

interface ParsedRequest {
  bucket: string
  key: string
  query: URLSearchParams
}

function parsePath(req: IncomingMessage): ParsedRequest {
  const url = new URL(req.url ?? '/', 'http://fake-s3')
  const segments = url.pathname.slice(1).split('/')
  const bucket = decodeURIComponent(segments.shift() ?? '')
  const key = segments.map((segment) => decodeURIComponent(segment)).join('/')
  return { bucket, key, query: url.searchParams }
}

function operationOf(
  method: string,
  parsed: ParsedRequest,
): S3Operation | null {
  if (method === 'POST' && parsed.query.has('delete') && !parsed.key) {
    return 'DeleteObjects'
  }
  if (!parsed.key) return null
  switch (method) {
    case 'PUT':
      return 'PutObject'
    case 'GET':
      return 'GetObject'
    case 'HEAD':
      return 'HeadObject'
    case 'DELETE':
      return 'DeleteObject'
    default:
      return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function keyMatches(pattern: string | RegExp | undefined, key: string) {
  if (pattern === undefined) return true
  return typeof pattern === 'string' ? pattern === key : pattern.test(key)
}

export async function startFakeS3(
  options: FakeS3Options = {},
): Promise<FakeS3> {
  const host = options.host ?? '127.0.0.1'
  const buckets = new Map<string, Map<string, StoredObject>>()
  let faults: FaultRule[] = []
  let latencyMs = options.latencyMs ?? 0
  let generation = 0
  const counts: Record<string, number> = {}
  const sockets = new Set<Socket>()

  function bucketOf(name: string): Map<string, StoredObject> {
    let bucket = buckets.get(name)
    if (!bucket) {
      bucket = new Map()
      buckets.set(name, bucket)
    }
    return bucket
  }

  /** Première panne qui vise cette requête ; elle est décomptée. */
  function takeFault(op: S3Operation, keys: string[]): FaultRule | null {
    for (const rule of faults) {
      if (rule.op !== undefined && rule.op !== op) continue
      if (!keys.some((key) => keyMatches(rule.key, key))) continue
      if (rule.times !== undefined) {
        if (rule.times <= 0) continue
        rule.times -= 1
      }
      return rule
    }
    return null
  }

  function newEtag(body: Buffer): string {
    generation += 1
    const digest = createHash('md5')
      .update(body)
      .update(String(generation))
      .digest('hex')
    return `"${digest}"`
  }

  async function handlePut(
    req: IncomingMessage,
    res: ServerResponse,
    parsed: ParsedRequest,
    resource: string,
  ): Promise<void> {
    const raw = await readBody(req)
    let body: Buffer
    try {
      body = isAwsChunked(req) ? decodeAwsChunked(raw) : raw
    } catch {
      sendError(req, res, 400, 'IncompleteBody', resource)
      return
    }
    const md5 = header(req, 'content-md5')
    if (md5 && createHash('md5').update(body).digest('base64') !== md5) {
      sendError(req, res, 400, 'BadDigest', resource)
      return
    }
    const objects = bucketOf(parsed.bucket)
    const existing = objects.get(parsed.key)
    const ifNoneMatch = header(req, 'if-none-match')
    if (ifNoneMatch !== undefined && ifNoneMatch.trim() === '*' && existing) {
      sendError(req, res, 412, 'PreconditionFailed', resource)
      return
    }
    const ifMatch = header(req, 'if-match')
    if (ifMatch !== undefined) {
      if (!existing) {
        sendError(req, res, 404, 'NoSuchKey', resource)
        return
      }
      const wanted = ifMatch.split(',').map(stripQuotes)
      if (
        !wanted.includes('*') &&
        !wanted.includes(stripQuotes(existing.etag))
      ) {
        sendError(req, res, 412, 'PreconditionFailed', resource)
        return
      }
    }
    const metadata: Record<string, string> = {}
    for (const [name, value] of Object.entries(req.headers)) {
      if (name.startsWith('x-amz-meta-') && typeof value === 'string') {
        metadata[name.slice('x-amz-meta-'.length)] = value
      }
    }
    const stored: StoredObject = {
      body,
      etag: newEtag(body),
      contentType: header(req, 'content-type'),
      contentEncoding: storedEncoding(header(req, 'content-encoding')),
      cacheControl: header(req, 'cache-control'),
      metadata,
      lastModified: new Date(),
    }
    objects.set(parsed.key, stored)
    res.statusCode = 200
    res.setHeader('x-amz-request-id', requestId())
    res.setHeader('etag', stored.etag)
    res.setHeader('content-length', 0)
    res.end()
  }

  function handleGet(
    req: IncomingMessage,
    res: ServerResponse,
    parsed: ParsedRequest,
    resource: string,
  ): void {
    const stored = buckets.get(parsed.bucket)?.get(parsed.key)
    if (!stored) {
      sendError(req, res, 404, 'NoSuchKey', resource)
      return
    }
    res.statusCode = 200
    res.setHeader('x-amz-request-id', requestId())
    res.setHeader('etag', stored.etag)
    res.setHeader('last-modified', stored.lastModified.toUTCString())
    res.setHeader('accept-ranges', 'bytes')
    res.setHeader(
      'content-type',
      stored.contentType ?? 'application/octet-stream',
    )
    if (stored.contentEncoding) {
      res.setHeader('content-encoding', stored.contentEncoding)
    }
    if (stored.cacheControl) res.setHeader('cache-control', stored.cacheControl)
    for (const [name, value] of Object.entries(stored.metadata)) {
      res.setHeader(`x-amz-meta-${name}`, value)
    }
    res.setHeader('content-length', stored.body.length)
    res.end(req.method === 'HEAD' ? undefined : stored.body)
  }

  function handleDelete(res: ServerResponse, parsed: ParsedRequest): void {
    buckets.get(parsed.bucket)?.delete(parsed.key)
    res.statusCode = 204
    res.setHeader('x-amz-request-id', requestId())
    res.end()
  }

  /** En mode `Quiet`, S3 ne liste que les échecs. */
  function handleDeleteObjects(
    res: ServerResponse,
    parsed: ParsedRequest,
    keys: string[],
    quiet: boolean,
    perKeyFault: FaultRule | null,
  ): void {
    const objects = buckets.get(parsed.bucket)
    const deleted: string[] = []
    const errors: string[] = []
    for (const key of keys) {
      if (perKeyFault && keyMatches(perKeyFault.key, key)) {
        errors.push(key)
        continue
      }
      objects?.delete(key)
      deleted.push(key)
    }
    const body =
      XML_HEADER +
      `<DeleteResult xmlns="${S3_NAMESPACE}">` +
      (quiet
        ? ''
        : deleted
            .map((key) => `<Deleted><Key>${escapeXml(key)}</Key></Deleted>`)
            .join('')) +
      errors
        .map(
          (key) =>
            `<Error><Key>${escapeXml(key)}</Key><Code>${escapeXml(
              perKeyFault?.code ?? 'AccessDenied',
            )}</Code><Message>${escapeXml(
              ERROR_MESSAGES[perKeyFault?.code ?? 'AccessDenied'] ??
                'Access Denied',
            )}</Message></Error>`,
        )
        .join('') +
      '</DeleteResult>'
    res.statusCode = 200
    res.setHeader('x-amz-request-id', requestId())
    res.setHeader('content-type', 'application/xml')
    res.setHeader('content-length', Buffer.byteLength(body))
    res.end(body)
  }

  async function handleS3(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const method = req.method ?? 'GET'
    const parsed = parsePath(req)
    const resource = `/${parsed.bucket}/${parsed.key}`
    const op = operationOf(method, parsed)
    counts[op ?? `${method} (non géré)`] =
      (counts[op ?? `${method} (non géré)`] ?? 0) + 1
    options.log?.(`${method} ${req.url} → ${op ?? '?'}`)
    if (latencyMs > 0) await sleep(latencyMs)
    if (!op) {
      await readBody(req)
      sendError(req, res, 501, 'NotImplemented', resource)
      return
    }
    if (!parsed.bucket) {
      sendError(req, res, 404, 'NoSuchBucket', resource)
      return
    }

    // DeleteObjects : les clés sont dans le corps, lu avant de chercher une panne.
    let deleteKeys: string[] = []
    let quiet = false
    if (op === 'DeleteObjects') {
      const xml = (await readBody(req)).toString('utf8')
      if (!/<Delete[\s>]/.test(xml)) {
        sendError(req, res, 400, 'MalformedXML', resource)
        return
      }
      deleteKeys = [...xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)].map((match) =>
        unescapeXml(match[1]),
      )
      quiet = /<Quiet>\s*true\s*<\/Quiet>/i.test(xml)
    }

    const fault = takeFault(
      op,
      op === 'DeleteObjects' ? deleteKeys : [parsed.key],
    )
    if (fault?.delayMs) await sleep(fault.delayMs)
    if (fault?.reset) {
      req.socket.destroy()
      return
    }
    if (fault?.resetAfter) {
      // L'opération a lieu ; seule la réponse se perd.
      res.end = (() => {
        req.socket.destroy()
        return res
      }) as typeof res.end
    }
    if (fault?.status !== undefined && !fault.perKey) {
      if (op !== 'DeleteObjects') await readBody(req)
      sendError(
        req,
        res,
        fault.status,
        fault.code ?? defaultCode(fault.status),
        resource,
      )
      return
    }

    switch (op) {
      case 'PutObject':
        await handlePut(req, res, parsed, resource)
        return
      case 'GetObject':
      case 'HeadObject':
        await readBody(req)
        handleGet(req, res, parsed, resource)
        return
      case 'DeleteObject':
        await readBody(req)
        handleDelete(res, parsed)
        return
      case 'DeleteObjects':
        handleDeleteObjects(
          res,
          parsed,
          deleteKeys,
          quiet,
          fault?.perKey ? fault : null,
        )
        return
    }
  }

  function listKeys(bucket?: string): StoredKey[] {
    const result: StoredKey[] = []
    for (const [name, objects] of buckets) {
      if (bucket !== undefined && name !== bucket) continue
      for (const [key, stored] of objects) {
        result.push({
          bucket: name,
          key,
          size: stored.body.length,
          etag: stored.etag,
        })
      }
    }
    return result.sort((a, b) =>
      a.bucket === b.bucket
        ? a.key < b.key
          ? -1
          : a.key > b.key
            ? 1
            : 0
        : a.bucket < b.bucket
          ? -1
          : 1,
    )
  }

  function sendJson(res: ServerResponse, status: number, value: unknown) {
    const body = JSON.stringify(value)
    res.statusCode = status
    res.setHeader('content-type', 'application/json')
    res.setHeader('content-length', Buffer.byteLength(body))
    res.end(body)
  }

  function toRule(input: FaultRuleInput): FaultRule {
    return {
      ...input,
      key: input.key === undefined ? undefined : new RegExp(input.key),
    }
  }

  async function handleDebug(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://fake-s3')
    const route = `${req.method} ${url.pathname}`
    switch (route) {
      case 'GET /__keys': {
        const bucket = url.searchParams.get('bucket') ?? undefined
        sendJson(res, 200, { keys: listKeys(bucket) })
        return
      }
      case 'GET /__object': {
        const stored = buckets
          .get(url.searchParams.get('bucket') ?? '')
          ?.get(url.searchParams.get('key') ?? '')
        if (!stored) {
          sendJson(res, 404, { error: 'absent' })
          return
        }
        res.statusCode = 200
        res.setHeader(
          'content-type',
          stored.contentType ?? 'application/octet-stream',
        )
        res.setHeader('etag', stored.etag)
        res.end(stored.body)
        return
      }
      case 'GET /__stats':
        sendJson(res, 200, { counts })
        return
      case 'POST /__faults': {
        const input = JSON.parse(
          (await readBody(req)).toString('utf8'),
        ) as FaultRuleInput
        faults.push(toRule(input))
        sendJson(res, 201, { faults: faults.length })
        return
      }
      case 'DELETE /__faults':
        faults = []
        sendJson(res, 200, { faults: 0 })
        return
      case 'POST /__reset':
        api.reset()
        sendJson(res, 200, { ok: true })
        return
      default:
        sendJson(res, 404, { error: `route de débogage inconnue : ${route}` })
    }
  }

  const server: Server = createServer((req, res) => {
    const handle = (req.url ?? '').startsWith('/__')
      ? handleDebug(req, res)
      : handleS3(req, res)
    handle.catch((error: unknown) => {
      options.log?.(`erreur interne du faux S3 : ${String(error)}`)
      if (!res.headersSent) {
        sendError(req, res, 500, 'InternalError', req.url ?? '/')
      } else {
        res.destroy()
      }
    })
  })
  server.on('connection', (socket: Socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })

  function listen(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, host, () => {
        server.off('error', reject)
        resolve((server.address() as AddressInfo).port)
      })
    })
  }

  function stopListening(): Promise<void> {
    return new Promise((resolve) => {
      if (!server.listening) {
        resolve()
        return
      }
      server.close(() => resolve())
      // Les connexions gardées ouvertes par le SDK : sans elles, la panne
      // ne se verrait qu'à la prochaine connexion.
      for (const socket of sockets) socket.destroy()
      sockets.clear()
    })
  }

  const port = await listen(options.port ?? 0)

  const api: FakeS3 = {
    port,
    url: `http://${host}:${port}`,
    keys: listKeys,
    object: (bucket, key) => buckets.get(bucket)?.get(key),
    putObject(bucket, key, body, contentType) {
      bucketOf(bucket).set(key, {
        body,
        etag: newEtag(body),
        contentType,
        contentEncoding: undefined,
        cacheControl: undefined,
        metadata: {},
        lastModified: new Date(),
      })
    },
    addFault(rule) {
      faults.push({ ...rule })
    },
    clearFaults() {
      faults = []
    },
    setLatency(ms) {
      latencyMs = ms
    },
    stats: () => ({ ...counts }),
    reset() {
      buckets.clear()
      faults = []
      for (const name of Object.keys(counts)) delete counts[name]
    },
    stop: stopListening,
    async start() {
      if (!server.listening) await listen(port)
    },
    close: stopListening,
  }
  return api
}

// Lancé seul : `bun scripts/e2e/fake-s3.ts [port]`.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? process.env.FAKE_S3_PORT ?? 9000)
  startFakeS3({ port, log: (line) => console.log(line) }).then(
    (s3) => console.log(`Faux S3 à l’écoute sur ${s3.url}`),
    (error: unknown) => {
      console.error(error)
      process.exit(1)
    },
  )
}
