import { describe, it, expect } from 'vitest'
import { cn } from '../utils'

describe('cn', () => {
  it('returns empty string with no arguments', () => {
    expect(cn()).toBe('')
  })

  it('joins class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles a single class', () => {
    expect(cn('only')).toBe('only')
  })

  it('filters out falsy values', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz')
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar')
    expect(cn('foo', 0 as unknown as string, 'bar')).toBe('foo bar')
  })

  it('handles conditional object syntax', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz')
  })

  it('handles array of classes', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar')
  })

  it('handles nested arrays', () => {
    expect(cn(['foo', ['bar', 'baz']])).toBe('foo bar baz')
  })

  it('resolves tailwind conflicting utility classes (last wins)', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
    expect(cn('text-sm', 'text-lg')).toBe('text-lg')
    expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500')
  })

  it('does not merge unrelated classes', () => {
    const result = cn('flex', 'items-center', 'justify-end')
    expect(result).toContain('flex')
    expect(result).toContain('items-center')
    expect(result).toContain('justify-end')
  })

  it('handles mixed conditional objects and strings', () => {
    const isActive = true
    const isDisabled = false
    const result = cn('base', { active: isActive, disabled: isDisabled }, 'extra')
    expect(result).toBe('base active extra')
  })
})
