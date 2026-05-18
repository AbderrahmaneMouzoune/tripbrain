import {
  generateUploadObjectKey,
  sanitizeUploadFileName,
} from '../upload-file-key'

describe('sanitizeUploadFileName', () => {
  it('supprime les séparateurs de chemin et normalise les caractères', () => {
    expect(sanitizeUploadFileName('../../../etc/passwd')).toBe('passwd')
    expect(sanitizeUploadFileName('../dossier/Mon été 2026.json')).toBe('Mon-ete-2026.json')
  })

  it('retourne une valeur par défaut si le nom est vide après sanitization', () => {
    expect(sanitizeUploadFileName('   ')).toBe('file')
    expect(sanitizeUploadFileName('你好😊')).toBe('file')
  })

  it('limite la longueur du nom de fichier sanitizé', () => {
    const veryLongName = `${'a'.repeat(200)}.json`
    expect(sanitizeUploadFileName(veryLongName)).toHaveLength(120)
  })

  it('préserve les extensions multiples', () => {
    expect(sanitizeUploadFileName('archive.tar.gz')).toBe('archive.tar.gz')
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
