import { describe, expect, it } from 'vitest'
import {
  NATIVE_IMPORT_MAX_BYTES,
  itineraryFileName,
  routeNativeImport,
} from '../native-file-import'

const file = (name: string, type = '', size = 1000) => ({ name, type, size })

describe('routeNativeImport', () => {
  it('sends itinerary formats to the trip import', () => {
    expect(routeNativeImport(file('voyage.json'))).toEqual({
      kind: 'itinerary',
    })
    expect(routeNativeImport(file('Voyage.XLSX'))).toEqual({
      kind: 'itinerary',
    })
    expect(routeNativeImport(file('days.csv', 'text/csv'))).toEqual({
      kind: 'itinerary',
    })
    expect(routeNativeImport(file('export', 'application/json'))).toEqual({
      kind: 'itinerary',
    })
  })

  it('sends zip archives to the documents restore', () => {
    expect(routeNativeImport(file('docs.zip'))).toEqual({
      kind: 'documents-zip',
    })
    expect(routeNativeImport(file('archive', 'application/zip'))).toEqual({
      kind: 'documents-zip',
    })
  })

  it('stores pdf and images as documents', () => {
    expect(routeNativeImport(file('billet.pdf'))).toEqual({ kind: 'document' })
    expect(routeNativeImport(file('IMG_0001.HEIC'))).toEqual({
      kind: 'document',
    })
    expect(routeNativeImport(file('scan', 'image/jpeg'))).toEqual({
      kind: 'document',
    })
    expect(routeNativeImport(file('ticket', 'application/pdf'))).toEqual({
      kind: 'document',
    })
  })

  it('refuses unknown formats and oversized files', () => {
    expect(routeNativeImport(file('notes.docx'))).toEqual({
      kind: 'unsupported',
    })
    expect(
      routeNativeImport(
        file('billet.pdf', 'application/pdf', NATIVE_IMPORT_MAX_BYTES + 1),
      ),
    ).toEqual({ kind: 'too-large' })
  })
})

describe('itineraryFileName', () => {
  it('keeps names that have an extension', () => {
    expect(itineraryFileName('voyage.json', 'application/json')).toBe(
      'voyage.json',
    )
  })

  it('adds the extension from the MIME type', () => {
    expect(itineraryFileName('export', 'application/json')).toBe('export.json')
    expect(
      itineraryFileName(
        'export',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    ).toBe('export.xlsx')
  })
})
