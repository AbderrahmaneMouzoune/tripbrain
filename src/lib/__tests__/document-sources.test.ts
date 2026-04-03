import { describe, it, expect } from 'vitest'
import {
  SOURCE_CATEGORIES,
  CATEGORY_COLOR_CLASSES,
  type SourceCategory,
  type Source,
} from '../document-sources'

describe('SOURCE_CATEGORIES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(SOURCE_CATEGORIES)).toBe(true)
    expect(SOURCE_CATEGORIES.length).toBeGreaterThan(0)
  })

  it('every category has required fields', () => {
    for (const cat of SOURCE_CATEGORIES) {
      expect(typeof cat.label).toBe('string')
      expect(cat.label.length).toBeGreaterThan(0)
      expect(typeof cat.color).toBe('string')
      expect(cat.color.length).toBeGreaterThan(0)
      expect(Array.isArray(cat.items)).toBe(true)
      expect(cat.items.length).toBeGreaterThan(0)
    }
  })

  it('every source has all required fields', () => {
    for (const cat of SOURCE_CATEGORIES) {
      for (const source of cat.items) {
        expect(typeof source.name).toBe('string')
        expect(source.name.length).toBeGreaterThan(0)
        expect(typeof source.bgColor).toBe('string')
        expect(source.bgColor).toMatch(/^bg-/)
        expect(typeof source.letter).toBe('string')
        expect(source.letter.length).toBeGreaterThan(0)
        expect(typeof source.deepLink).toBe('string')
        expect(source.deepLink.length).toBeGreaterThan(0)
        expect(typeof source.fallback).toBe('string')
        expect(source.fallback.length).toBeGreaterThan(0)
        expect(typeof source.description).toBe('string')
        expect(source.description.length).toBeGreaterThan(0)
      }
    }
  })

  it('fallback URLs are valid absolute URLs', () => {
    for (const cat of SOURCE_CATEGORIES) {
      for (const source of cat.items) {
        expect(() => new URL(source.fallback)).not.toThrow()
        const url = new URL(source.fallback)
        expect(['http:', 'https:']).toContain(url.protocol)
      }
    }
  })

  it('includes a Réservations category', () => {
    const reservations = SOURCE_CATEGORIES.find((c) => c.label === 'Réservations')
    expect(reservations).toBeDefined()
  })

  it('includes an Emails category', () => {
    const emails = SOURCE_CATEGORIES.find((c) => c.label === 'Emails')
    expect(emails).toBeDefined()
  })

  it('source names are unique across all categories', () => {
    const allNames = SOURCE_CATEGORIES.flatMap((c) => c.items.map((s) => s.name))
    const uniqueNames = new Set(allNames)
    expect(uniqueNames.size).toBe(allNames.length)
  })
})

describe('CATEGORY_COLOR_CLASSES', () => {
  it('is a non-empty object', () => {
    expect(typeof CATEGORY_COLOR_CLASSES).toBe('object')
    expect(Object.keys(CATEGORY_COLOR_CLASSES).length).toBeGreaterThan(0)
  })

  it('defines color entries for all category colors used in SOURCE_CATEGORIES', () => {
    for (const cat of SOURCE_CATEGORIES) {
      expect(CATEGORY_COLOR_CLASSES[cat.color]).toBeDefined()
    }
  })

  it('every color entry has badge and dot class strings', () => {
    for (const [, classes] of Object.entries(CATEGORY_COLOR_CLASSES)) {
      expect(typeof classes.badge).toBe('string')
      expect(classes.badge.length).toBeGreaterThan(0)
      expect(typeof classes.dot).toBe('string')
      expect(classes.dot.length).toBeGreaterThan(0)
    }
  })

  it('dot classes start with bg-', () => {
    for (const [, classes] of Object.entries(CATEGORY_COLOR_CLASSES)) {
      expect(classes.dot).toMatch(/^bg-/)
    }
  })
})
