import { customAlphabet } from 'nanoid'

const nanoid = customAlphabet(
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  5,
)

const COMBINING_MARKS_REGEX = /[\u0300-\u036f]/g
const FILENAME_UNSAFE_CHARS_REGEX = /[^a-zA-Z0-9._-]+/g
const MULTIPLE_DASH_REGEX = /-{2,}/g
const PATH_SEPARATOR_REGEX = /[/\\]/
const EDGE_DASH_REGEX = /^-+|-+$/g
const EDGE_SLASH_REGEX = /^\/+|\/+$/g

export function sanitizeUploadFileName(fileName: string): string {
  const normalizedName = fileName.normalize('NFKD').replace(COMBINING_MARKS_REGEX, '')
  const basename = normalizedName.split(PATH_SEPARATOR_REGEX).pop() ?? 'file'

  const sanitizedName = basename
    .replace(/\s+/g, '-')
    .replace(FILENAME_UNSAFE_CHARS_REGEX, '-')
    .replace(MULTIPLE_DASH_REGEX, '-')
    .replace(EDGE_DASH_REGEX, '')
    .slice(0, 120)

  return sanitizedName || 'file'
}

export function generateUploadObjectKey(fileName: string, prefix = 'exports'): string {
  const normalizedPrefix = prefix.replace(EDGE_SLASH_REGEX, '')
  const safePrefix = normalizedPrefix.length > 0 ? normalizedPrefix : 'exports'
  const safeName = sanitizeUploadFileName(fileName)
  return `${safePrefix}/${nanoid()}-${safeName}`
}
