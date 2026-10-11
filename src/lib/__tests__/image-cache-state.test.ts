import { cacheState, shouldWaitForWifi } from '@/hooks/use-image-cache'

describe('cacheState', () => {
  const stats = (partial: Partial<Parameters<typeof cacheState>[0]>) => ({
    total: 10,
    cached: 0,
    downloading: 0,
    pending: 0,
    error: 0,
    ...partial,
  })

  it('reads the overall state of the image cache', () => {
    expect(cacheState(stats({ total: 0 }))).toBe('empty')
    expect(cacheState(stats({ cached: 10 }))).toBe('complete')
    expect(cacheState(stats({ cached: 4, downloading: 3, pending: 3 }))).toBe(
      'downloading',
    )
    expect(cacheState(stats({ cached: 8, error: 2 }))).toBe('partial')
  })
})

describe('shouldWaitForWifi', () => {
  it('waits only on a known mobile connection with the setting on', () => {
    expect(shouldWaitForWifi(true, 'cellular')).toBe(true)
    expect(shouldWaitForWifi(true, 'wifi')).toBe(false)
    expect(shouldWaitForWifi(false, 'cellular')).toBe(false)
  })

  it('does not block when the browser does not tell the network type', () => {
    expect(shouldWaitForWifi(true, undefined)).toBe(false)
  })
})
