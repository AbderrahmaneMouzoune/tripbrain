import { describe, expect, it } from 'vitest'
import { nativeMapsUrls, parseMapsUrl } from '../maps-links'

describe('parseMapsUrl', () => {
  it('reconnaît une recherche Google Maps', () => {
    expect(
      parseMapsUrl(
        'https://www.google.com/maps/search/?api=1&query=Registan%20Samarcande',
      ),
    ).toEqual({ kind: 'search', query: 'Registan Samarcande' })
  })

  it('reconnaît un itinéraire Google Maps', () => {
    expect(
      parseMapsUrl(
        'https://www.google.com/maps/dir/?api=1&destination=H%C3%B4tel%20Rayann',
      ),
    ).toEqual({ kind: 'directions', destination: 'Hôtel Rayann' })
  })

  it('ignore le reste', () => {
    expect(parseMapsUrl('https://www.google.com/search?q=x')).toBeNull()
    expect(parseMapsUrl('https://www.booking.com/hotel')).toBeNull()
    expect(parseMapsUrl('https://www.google.com/maps/search/?api=1')).toBeNull()
    expect(parseMapsUrl('pas une url')).toBeNull()
  })
})

describe('nativeMapsUrls', () => {
  it('préfère Google Maps puis Plans sur iOS', () => {
    expect(
      nativeMapsUrls({ kind: 'search', query: 'Registan' }, 'ios'),
    ).toEqual(['comgooglemaps://?q=Registan', 'maps://?q=Registan'])
    expect(
      nativeMapsUrls({ kind: 'directions', destination: 'Hôtel' }, 'ios'),
    ).toEqual([
      'comgooglemaps://?daddr=H%C3%B4tel',
      'maps://?daddr=H%C3%B4tel&dirflg=w',
    ])
  })

  it('passe par les intentions geo et navigation sur Android', () => {
    expect(
      nativeMapsUrls({ kind: 'search', query: 'Registan' }, 'android'),
    ).toEqual(['geo:0,0?q=Registan'])
    expect(
      nativeMapsUrls({ kind: 'directions', destination: 'Hôtel' }, 'android'),
    ).toEqual(['google.navigation:q=H%C3%B4tel', 'geo:0,0?q=H%C3%B4tel'])
  })

  it('ne propose rien ailleurs', () => {
    expect(nativeMapsUrls({ kind: 'search', query: 'x' }, 'web')).toEqual([])
  })
})
