import {
  createOwnerToken,
  hashOwnerToken,
  isOwnerToken,
  readBearerToken,
  verifyOwnerToken,
} from '@/lib/template-token'

function requestWith(authorization?: string): Request {
  return new Request('http://localhost/api/templates/0123456789abcdef', {
    method: 'PUT',
    headers: authorization ? { Authorization: authorization } : {},
  })
}

describe('createOwnerToken', () => {
  it('tire 32 octets en base64url, sans remplissage', () => {
    const token = createOwnerToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(token, 'base64url')).toHaveLength(32)
    expect(isOwnerToken(token)).toBe(true)
  })

  it('ne tire jamais deux fois le même jeton', () => {
    const tokens = new Set(Array.from({ length: 200 }, createOwnerToken))
    expect(tokens.size).toBe(200)
  })
})

describe('hashOwnerToken', () => {
  it('donne le SHA-256 du jeton en hexadécimal', () => {
    expect(hashOwnerToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('ne contient rien du jeton', () => {
    const token = createOwnerToken()
    expect(hashOwnerToken(token)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashOwnerToken(token)).not.toContain(token)
  })
})

describe('verifyOwnerToken', () => {
  it('reconnaît le jeton dont on garde l’empreinte', () => {
    const token = createOwnerToken()
    expect(verifyOwnerToken(token, hashOwnerToken(token))).toBe(true)
  })

  it('refuse un autre jeton', () => {
    const hash = hashOwnerToken(createOwnerToken())
    expect(verifyOwnerToken(createOwnerToken(), hash)).toBe(false)
    expect(verifyOwnerToken('', hash)).toBe(false)
  })

  it('refuse sans lever une empreinte stockée mal formée', () => {
    const token = createOwnerToken()
    const hash = hashOwnerToken(token)
    expect(verifyOwnerToken(token, hash.slice(0, 32))).toBe(false)
    expect(verifyOwnerToken(token, hash.toUpperCase())).toBe(false)
    expect(verifyOwnerToken(token, '')).toBe(false)
  })
})

describe('readBearerToken', () => {
  const token = createOwnerToken()

  it('lit le jeton de l’en-tête Authorization', () => {
    expect(readBearerToken(requestWith(`Bearer ${token}`))).toBe(token)
  })

  it('accepte le schéma quelle que soit sa casse', () => {
    expect(readBearerToken(requestWith(`bearer ${token}`))).toBe(token)
    expect(readBearerToken(requestWith(`BEARER  ${token}`))).toBe(token)
  })

  it('ne trouve rien sans en-tête ou avec un autre schéma', () => {
    expect(readBearerToken(requestWith())).toBeNull()
    expect(readBearerToken(requestWith(`Basic ${token}`))).toBeNull()
    expect(readBearerToken(requestWith(token))).toBeNull()
  })

  it('refuse un jeton qui n’en a pas la forme', () => {
    expect(readBearerToken(requestWith('Bearer'))).toBeNull()
    expect(readBearerToken(requestWith('Bearer abc'))).toBeNull()
    expect(readBearerToken(requestWith(`Bearer ${token}x`))).toBeNull()
    expect(readBearerToken(requestWith(`Bearer ${token} ${token}`))).toBeNull()
    expect(
      readBearerToken(requestWith(`Bearer ${token.slice(0, 42)}+`)),
    ).toBeNull()
  })
})
