import {
  generateUploadObjectKey,
  sanitizeUploadFileName,
} from '../upload-file-key'

describe('sanitizeUploadFileName', () => {
  it('supprime les séparateurs de chemin et normalise les caractères', () => {
    expect(sanitizeUploadFileName('../dossier/Mon été 2026.json')).toBe(
      'Mon-ete-2026.json',
    )
  })

  it('retourne une valeur par défaut si le nom est vide après sanitization', () => {
    expect(sanitizeUploadFileName('   ')).toBe('file')
  })
})

describe('generateUploadObjectKey', () => {
  it('génère une clé avec un nanoid de 5 caractères et le nom sanitizé', () => {
    const key = generateUploadObjectKey('Mon été 2026.json')
    expect(key).toMatch(/^exports\/[A-Za-z0-9]{5}-Mon-ete-2026\.json$/)
  })

  it('supporte un préfixe custom', () => {
    const key = generateUploadObjectKey('export.json', '/custom/')
    expect(key).toMatch(/^custom\/[A-Za-z0-9]{5}-export\.json$/)
  })
})
