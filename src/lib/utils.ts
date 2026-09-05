import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const FILE_SIZE_UNITS = ['B', 'KB', 'MB', 'GB'] as const

/** Human-readable byte count: 0 B, 812 KB, 3.4 MB… */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    FILE_SIZE_UNITS.length - 1,
  )
  return `${parseFloat((bytes / Math.pow(k, index)).toFixed(1))} ${FILE_SIZE_UNITS[index]}`
}
