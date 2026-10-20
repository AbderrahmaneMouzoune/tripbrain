'use client'

import type { CSSProperties, ReactNode } from 'react'
import {
  BUDGETS,
  INTERESTS,
  labelOf,
  OCCASIONS,
  partySize,
  type TripBrief,
} from '@/lib/generator/trip-brief'
import {
  formatEuros,
  isIsoDate,
  type Illustration,
} from '@/lib/generator/trip-journey'

/**
 * L'illustration au-dessus de chaque question. Elle se redessine à partir des
 * réponses : le voyageur voit sa réponse prendre forme avant de continuer.
 * `animKey` change à chaque réponse pour rejouer l'animation d'apparition.
 */

const PLANE =
  'M22 12 15 10.2 10.4 3H7.8l2.4 7.2H4L2 7.6H.5l.9 4.4-.9 4.4H2l2-2.6h6.2l-2.4 7.2h2.6L15 13.8z'

function Frame({
  background,
  border,
  children,
  className,
  style,
}: {
  background: string
  border?: boolean
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      aria-hidden
      className={`tj-illus ${className ?? ''}`}
      style={{
        background,
        border: border ? '1px solid #d6e0ef' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** Un dessin de 350 × 132, centré quelle que soit la largeur disponible. */
function Stage({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: 0,
        width: 350,
        height: 132,
        marginLeft: -175,
      }}
    >
      {children}
    </div>
  )
}

const pop = (delay = 0): CSSProperties => ({
  animation: 'tj-pop .4s cubic-bezier(.2,.8,.2,1) backwards',
  animationDelay: `${delay}s`,
})

export function JourneyIllustration({
  kind,
  brief,
  startDate,
  animKey,
}: {
  kind: Illustration
  brief: TripBrief
  startDate: string
  animKey: string
}) {
  const destination = brief.destination.trim()

  switch (kind) {
    case 'postcard': {
      const code = destination
        ? destination
            .replace(/^(le|la|les|l')\s*/i, '')
            .slice(0, 3)
            .toUpperCase()
        : '···'
      return (
        <Frame background="#1d5fe0">
          <svg
            width="100%"
            height="132"
            viewBox="0 0 350 132"
            preserveAspectRatio="xMidYMid slice"
            fill="none"
            style={{ position: 'absolute', inset: 0 }}
          >
            <path
              className="tj-route"
              d="M-10 110 C 80 60, 160 130, 250 60 S 340 40, 370 20"
              stroke="#6b9af0"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <div
            className="tj-float"
            style={{
              position: 'absolute',
              left: '50%',
              top: 18,
              marginLeft: -110,
              width: 220,
              height: 96,
              background: '#fff',
              borderRadius: 14,
              transform: 'rotate(-3deg)',
              boxShadow: '0 14px 26px -14px rgba(6,20,60,.6)',
              display: 'flex',
              alignItems: 'center',
              padding: '12px 14px',
              gap: 10,
            }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-black tracking-[0.12em] text-[#c2410c] uppercase">
                Bons baisers de
              </p>
              <p
                className={`font-display mt-0.5 truncate leading-tight ${destination ? 'text-[22px]' : 'text-lg'}`}
                style={{ color: destination ? '#0e1a3a' : '#c7d5ec' }}
              >
                {destination || 'Où ça ?'}
              </p>
            </div>
            <span
              key={`${animKey}-${code}`}
              className="flex h-14 w-12 flex-none items-center justify-center rounded-md border-2 border-dashed border-[#f26a2e] font-mono text-[13px] font-semibold text-[#f26a2e]"
              style={destination ? pop() : undefined}
            >
              {code}
            </span>
          </div>
        </Frame>
      )
    }

    case 'route': {
      const origin = brief.origin.trim()
      const path = 'M60 100 C 120 20, 230 20, 290 100'
      return (
        <Frame background="#fff1e8">
          <Stage>
            <svg width="350" height="132" viewBox="0 0 350 132" fill="none">
              <path
                d={path}
                className="tj-route"
                stroke={origin ? '#f26a2e' : '#c7d5ec'}
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <circle
                cx="60"
                cy="100"
                r="8"
                fill="#1d5fe0"
                stroke="#fff"
                strokeWidth="3"
              />
              <circle
                cx="290"
                cy="100"
                r="9"
                fill="#f26a2e"
                stroke="#fff"
                strokeWidth="3"
              />
            </svg>
            {origin && (
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: 22,
                  height: 22,
                  margin: '-11px 0 0 -11px',
                  color: '#0e1a3a',
                  offsetPath: `path('${path}')`,
                  offsetRotate: 'auto',
                  animation: 'tj-fly 3.2s ease-in-out infinite',
                }}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d={PLANE} />
                </svg>
              </span>
            )}
            <span
              className="absolute bottom-1.5 left-3 text-[13px] font-black"
              style={{ color: origin ? '#1447b8' : '#8a98b5' }}
            >
              {origin || 'Départ ?'}
            </span>
            <span className="absolute right-3 bottom-1.5 max-w-[45%] truncate text-[13px] font-black text-[#c2410c]">
              {destination || 'Votre destination'}
            </span>
          </Stage>
        </Frame>
      )
    }

    case 'calendar': {
      const start = isIsoDate(startDate)
        ? new Date(`${startDate}T00:00:00`)
        : null
      const count = Math.min(brief.durationDays, 28)
      const size = count > 14 ? 16 : count > 7 ? 22 : 30
      const cells = Array.from({ length: count }, (_, index) => {
        if (!start) return { day: '', weekend: false }
        const day = new Date(start)
        day.setDate(start.getDate() + index)
        return {
          day: String(day.getDate()),
          weekend: day.getDay() === 0 || day.getDay() === 6,
        }
      })
      const end = start ? new Date(start) : null
      end?.setDate(start!.getDate() + brief.durationDays - 1)
      const weekendDays = cells.filter((cell) => cell.weekend).length
      const note = !start
        ? 'Choisissez une date : chaque journée sera datée.'
        : brief.durationDays >= 10
          ? 'Prévoyez une journée sans programme au milieu.'
          : weekendDays
            ? `${weekendDays} jour${weekendDays > 1 ? 's' : ''} de week-end : marchés et musées plus fréquentés.`
            : 'Que des jours de semaine : moins de monde partout.'
      return (
        <Frame
          background="#ffffff"
          border
          className="flex flex-col gap-2.5 p-3.5"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-black">
              {start
                ? start.toLocaleDateString('fr-FR', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'long',
                  })
                : 'Départ ?'}
            </span>
            {end && (
              <span className="text-[13px] font-extrabold text-[#0e7490]">
                retour{' '}
                {end.toLocaleDateString('fr-FR', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {cells.map((cell, index) => (
              <span
                key={`${animKey}-${index}`}
                className="flex items-center justify-center rounded-md font-mono text-[9px] font-semibold"
                style={{
                  width: size,
                  height: size,
                  background:
                    index === 0
                      ? '#f26a2e'
                      : cell.weekend
                        ? '#c9dafb'
                        : '#1d5fe0',
                  color:
                    index === 0 ? '#0e1a3a' : cell.weekend ? '#1447b8' : '#fff',
                  ...pop(index * 0.03),
                }}
              >
                {cell.day}
              </span>
            ))}
          </div>
          <span className="text-xs font-extrabold text-[#4a5a7a]">{note}</span>
        </Frame>
      )
    }

    case 'shape': {
      const shape = brief.shape || 'roaming'
      return (
        <Frame background="#e6eefd">
          <Stage>
            <svg width="350" height="132" viewBox="0 0 350 132" fill="none">
              <g
                key={`${animKey}-${shape}`}
                style={{ ...pop(), transformOrigin: '175px 66px' }}
              >
                {shape === 'roaming' && (
                  <>
                    <path
                      className="tj-route"
                      d="M50 100 L120 40 L190 90 L250 35 L300 80"
                      stroke="#1d5fe0"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                    {[
                      [50, 100],
                      [120, 40],
                      [190, 90],
                      [250, 35],
                    ].map(([x, y]) => (
                      <circle key={`${x}`} cx={x} cy={y} r="8" fill="#1d5fe0" />
                    ))}
                    <circle
                      cx="300"
                      cy="80"
                      r="9"
                      fill="#f26a2e"
                      stroke="#fff"
                      strokeWidth="3"
                    />
                  </>
                )}
                {shape === 'twoBases' && (
                  <>
                    <path
                      className="tj-route"
                      d="M100 70 L250 60"
                      stroke="#1d5fe0"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                    <circle cx="100" cy="70" r="14" fill="#1d5fe0" />
                    <circle cx="250" cy="60" r="14" fill="#f26a2e" />
                    <circle cx="60" cy="40" r="5" fill="#6b9af0" />
                    <circle cx="70" cy="105" r="5" fill="#6b9af0" />
                    <circle cx="290" cy="30" r="5" fill="#ffb38e" />
                    <circle cx="295" cy="95" r="5" fill="#ffb38e" />
                  </>
                )}
                {shape === 'base' && (
                  <>
                    <circle cx="175" cy="66" r="18" fill="#f26a2e" />
                    <path
                      className="tj-route"
                      d="M175 66 C 120 10, 80 60, 175 66"
                      stroke="#1d5fe0"
                      strokeWidth="3"
                    />
                    <path
                      className="tj-route"
                      d="M175 66 C 240 10, 280 70, 175 66"
                      stroke="#1d5fe0"
                      strokeWidth="3"
                    />
                    <path
                      className="tj-route"
                      d="M175 66 C 140 130, 220 130, 175 66"
                      stroke="#1d5fe0"
                      strokeWidth="3"
                    />
                  </>
                )}
                {shape === 'undecided' && (
                  <text
                    x="175"
                    y="84"
                    textAnchor="middle"
                    fontFamily="var(--font-display)"
                    fontSize="52"
                    fill="#1d5fe0"
                  >
                    ?
                  </text>
                )}
              </g>
            </svg>
          </Stage>
        </Frame>
      )
    }

    case 'people': {
      // Sur l'écran des compteurs, les personnages suivent les chiffres même
      // si le groupe n'est plus déterminé.
      const shown = Boolean(brief.group) || animKey === 'party'
      const adults = shown ? Math.min(brief.adults, 6) : 0
      const kids = shown ? Math.min(brief.children, 4) : 0
      const extra = shown
        ? Math.max(0, brief.adults - 6) + Math.max(0, brief.children - 4)
        : 0
      return (
        <Frame
          background="#e6eefd"
          className="flex items-end justify-center gap-2 pb-[22px]"
        >
          {adults + kids === 0 && (
            <span className="self-center text-sm font-extrabold text-[#4a5a7a]">
              Qui embarque ?
            </span>
          )}
          {Array.from({ length: adults }, (_, index) => (
            <span
              key={`${animKey}-a${index}`}
              className="flex flex-col items-center gap-[3px]"
              style={pop(index * 0.06)}
            >
              <span className="size-[26px] rounded-full bg-[#1d5fe0]" />
              <span className="h-[34px] w-[42px] rounded-[21px_21px_8px_8px] bg-[#1d5fe0]" />
            </span>
          ))}
          {Array.from({ length: kids }, (_, index) => (
            <span
              key={`${animKey}-k${index}`}
              className="flex flex-col items-center gap-[3px]"
              style={pop((adults + index) * 0.06)}
            >
              <span className="size-[18px] rounded-full bg-[#f26a2e]" />
              <span className="h-6 w-[30px] rounded-[15px_15px_6px_6px] bg-[#f26a2e]" />
            </span>
          ))}
          {extra > 0 && (
            <span
              key={`${animKey}-extra-${extra}`}
              className="bg-ink self-center rounded-full px-2.5 py-1 font-mono text-xs font-semibold text-white"
              style={pop()}
            >
              +{extra}
            </span>
          )}
        </Frame>
      )
    }

    case 'passport': {
      const sets: Record<
        string,
        {
          t: string
          x: number
          y: number
          r: number
          c: string
          round: boolean
        }[]
      > = {
        first: [
          { t: '1RE FOIS', x: 70, y: 32, r: -8, c: '#f26a2e', round: true },
        ],
        again: [
          { t: '2019', x: 30, y: 28, r: -10, c: '#1d5fe0', round: false },
          { t: 'RETOUR', x: 120, y: 40, r: 6, c: '#f26a2e', round: true },
        ],
        regular: [
          { t: '2018', x: 14, y: 22, r: -12, c: '#1d5fe0', round: false },
          { t: '2021', x: 80, y: 46, r: 8, c: '#0e7490', round: false },
          { t: '2023', x: 140, y: 18, r: -4, c: '#f26a2e', round: true },
          { t: '2025', x: 130, y: 58, r: 10, c: '#1d5fe0', round: false },
        ],
      }
      const stamps = sets[brief.familiarity] ?? []
      return (
        <Frame
          background="#0e1a3a"
          className="flex items-center justify-center"
        >
          <div className="relative h-[100px] w-[220px] -rotate-2 rounded-[10px] bg-[#f6f1e4]">
            <span className="absolute top-2 left-3 text-[9px] font-black tracking-[0.12em] text-[#4a5a7a]">
              VISAS
            </span>
            {stamps.map((stamp, index) => (
              <span
                key={`${animKey}-${stamp.t}`}
                className="absolute px-2 py-1.5 font-mono text-[11px] font-semibold"
                style={{
                  left: stamp.x,
                  top: stamp.y,
                  rotate: `${stamp.r}deg`,
                  border: `2px solid ${stamp.c}`,
                  color: stamp.c,
                  borderRadius: stamp.round ? '50%' : 8,
                  ...pop(index * 0.12),
                }}
              >
                {stamp.t}
              </span>
            ))}
          </div>
        </Frame>
      )
    }

    case 'day': {
      const startHour =
        { early: 7.5, standard: 9, late: 10.5 }[brief.dayStart] ?? 9
      const count = { slow: 2, balanced: 4, intense: 6 }[brief.pace] ?? 3
      const px = (hour: number) => ((hour - 7) / 16) * 310
      const slot = (21 - startHour) / count
      const sunX = Math.round(px(startHour))
      const sunY = Math.round(
        70 - Math.sin(((startHour - 7) / 16) * Math.PI) * 50,
      )
      const ease = 'cubic-bezier(.2,.8,.2,1)'
      return (
        <Frame background="#ffffff" border>
          <Stage>
            <svg
              width="350"
              height="132"
              viewBox="0 0 350 132"
              fill="none"
              style={{ position: 'absolute' }}
            >
              <path
                d="M20 96 Q 175 -10 330 96"
                stroke="#e3eaf5"
                strokeWidth="2"
                strokeDasharray="3 6"
              />
            </svg>
            <div
              style={{
                position: 'absolute',
                left: 20,
                top: 0,
                width: 310,
                height: 132,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: sunX,
                  top: sunY,
                  width: 26,
                  height: 26,
                  marginLeft: -13,
                  borderRadius: '50%',
                  background: '#f26a2e',
                  boxShadow: '0 0 0 6px #fff1e8',
                  transition: `left .6s ${ease}, top .6s ${ease}`,
                }}
              />
              <span
                className="font-mono text-[11px] font-semibold text-[#c2410c]"
                style={{
                  position: 'absolute',
                  left: sunX,
                  top: sunY + 30,
                  marginLeft: -16,
                  transition: `left .6s ${ease}`,
                }}
              >
                {Math.floor(startHour)} h{startHour % 1 ? ' 30' : ''}
              </span>
              <div className="absolute right-0 bottom-4 left-0 h-5 rounded-lg bg-[#f3f7fd]">
                {Array.from({ length: count }, (_, index) => (
                  <span
                    key={`${animKey}-${count}-${index}`}
                    className="absolute top-[3px] h-3.5 rounded-[5px] bg-[#1d5fe0]"
                    style={{
                      left: Math.round(px(startHour + index * slot)),
                      width: Math.max(14, Math.round(px(7 + slot * 0.7))),
                      transition: `left .5s ${ease}, width .5s`,
                      ...pop(index * 0.05),
                    }}
                  />
                ))}
              </div>
              <span className="absolute bottom-0 left-0 font-mono text-[10px] text-[#4a5a7a]">
                7 h
              </span>
              <span className="absolute right-0 bottom-0 font-mono text-[10px] text-[#4a5a7a]">
                23 h
              </span>
            </div>
          </Stage>
        </Frame>
      )
    }

    case 'train': {
      const width =
        { short: 90, medium: 190, long: 290 }[brief.maxTravelTime] ?? 190
      const duration =
        { short: 1.4, medium: 2.6, long: 3.8 }[brief.maxTravelTime] ?? 2.6
      const label =
        {
          short: '1 h maximum',
          medium: '2 à 3 h',
          long: 'aussi long qu’il faut',
        }[brief.maxTravelTime] ?? '?'
      return (
        <Frame
          background="#e2f4fa"
          className="flex items-center justify-center"
        >
          <div
            className="relative h-10"
            style={{ width, transition: 'width .6s cubic-bezier(.2,.8,.2,1)' }}
          >
            <span
              className="absolute right-0 left-0 h-1"
              style={{
                top: 30,
                backgroundImage:
                  'radial-gradient(circle,#0e7490 1.6px,transparent 2px)',
                backgroundSize: '9px 4px',
              }}
            />
            <span
              className="absolute -left-1.5 size-4 rounded-full bg-[#0e7490]"
              style={{ top: 24 }}
            />
            <span
              className="absolute -right-1.5 size-4 rounded-full bg-[#f26a2e]"
              style={{ top: 24 }}
            />
            <span
              className="absolute top-0.5 h-[22px] w-[26px]"
              style={{
                animation: `tj-ride ${duration}s ease-in-out infinite alternate`,
              }}
            >
              <svg width="26" height="22" viewBox="0 0 30 24">
                <rect
                  x="2"
                  y="2"
                  width="26"
                  height="16"
                  rx="6"
                  fill="#0e7490"
                />
                <rect x="6" y="6" width="7" height="5" rx="1.5" fill="#fff" />
                <rect x="16" y="6" width="7" height="5" rx="1.5" fill="#fff" />
                <circle cx="9" cy="21" r="2" fill="#0e1a3a" />
                <circle cx="21" cy="21" r="2" fill="#0e1a3a" />
              </svg>
            </span>
          </div>
          <span className="absolute bottom-3 font-mono text-xs font-semibold text-[#0e7490]">
            {label}
          </span>
        </Frame>
      )
    }

    case 'coins': {
      const level =
        { backpacker: 1, moderate: 2, comfort: 3, premium: 4 }[brief.budget] ??
        0
      const budget = BUDGETS.find((option) => option.id === brief.budget)
      const people = Math.max(1, partySize(brief))
      const total = budget
        ? `${brief.budget === 'premium' ? '+ de ' : '≈ '}${formatEuros(budget.perDay * people * brief.durationDays)}`
        : '? €'
      return (
        <Frame
          background="#fff1e8"
          className="flex items-end justify-end gap-2.5 pr-[22px] pb-[18px]"
        >
          <span className="absolute top-3 left-4 flex max-w-[55%] flex-col gap-px">
            <span className="text-[9px] font-black tracking-[0.12em] text-[#c2410c] uppercase">
              Tout le voyage{' '}
              <span className="font-display text-sm tracking-normal">
                {level ? '€'.repeat(level) : ''}
              </span>
            </span>
            <span
              key={`${animKey}-${brief.budget}`}
              className="font-mono text-xl font-semibold"
              style={pop()}
            >
              {total}
            </span>
            <span className="text-[11px] font-extrabold text-[#4a5a7a]">
              {people} pers. × {brief.durationDays} jours, hors transport
            </span>
          </span>
          {Array.from({ length: Math.max(level, 1) }, (_, index) => (
            <span
              key={`${animKey}-${level}-${index}`}
              className="flex flex-col-reverse gap-[3px]"
              style={{
                animation: 'tj-rise .4s backwards',
                animationDelay: `${index * 0.08}s`,
              }}
            >
              {Array.from({ length: level ? index + 2 : 1 }, (_, coin) => (
                <span
                  key={coin}
                  className="h-[11px] w-10 rounded-[50%] bg-[#f26a2e] shadow-[0_2px_0_#c2410c]"
                />
              ))}
            </span>
          ))}
        </Frame>
      )
    }

    case 'podium': {
      const top = brief.interests
        .slice(0, 3)
        .map((id) => labelOf(INTERESTS, id))
      const places = [
        { index: 1, height: 52, color: '#6b9af0' },
        { index: 0, height: 74, color: '#1d5fe0' },
        { index: 2, height: 38, color: '#9cbcf6' },
      ]
      return (
        <Frame
          background="#e6eefd"
          className="flex items-end justify-center gap-1.5 px-3"
        >
          {places.map((place) => {
            const label = top[place.index]
            return (
              <div
                key={place.index}
                className="flex w-[100px] flex-col items-center gap-[5px]"
              >
                <span
                  key={`${animKey}-${label}`}
                  className="flex min-h-[26px] items-end text-center text-[11px] leading-[1.15] font-black"
                  style={{ color: label ? '#0e1a3a' : '#8a98b5', ...pop() }}
                >
                  {label ?? '…'}
                </span>
                <span
                  className="flex w-full justify-center rounded-t-[10px] pt-1.5 font-mono font-semibold text-white"
                  style={{
                    height: label ? place.height : 18,
                    background: label ? place.color : '#c9dafb',
                    transition: 'height .5s cubic-bezier(.2,.8,.2,1)',
                  }}
                >
                  {place.index + 1}
                </span>
              </div>
            )
          })}
        </Frame>
      )
    }

    case 'burst': {
      const romantic = ['honeymoon', 'anniversary'].includes(brief.occasion)
      const label =
        brief.occasion === 'none'
          ? 'Un voyage, tout simplement'
          : labelOf(OCCASIONS, brief.occasion) || 'Une raison de fêter ?'
      const colors = romantic
        ? ['#ff8fab', '#f26a2e', '#ffffff']
        : ['#f26a2e', '#6b9af0', '#ffd166', '#ffffff']
      const sparks =
        brief.occasion && brief.occasion !== 'none'
          ? Array.from({ length: 14 }, (_, index) => {
              const angle = (index / 14) * Math.PI * 2
              const radius = 60 + (index % 3) * 20
              return {
                x: Math.round(Math.cos(angle) * radius * 1.6),
                y: Math.round(Math.sin(angle) * radius * 0.8),
                color: colors[index % colors.length],
                size: 8 + (index % 3) * 3,
                radius: romantic ? '50% 50% 0 50%' : index % 2 ? '50%' : '2px',
                delay: (index % 4) * 0.04,
              }
            })
          : []
      return (
        <Frame
          background="#0e1a3a"
          className="flex items-center justify-center"
        >
          <span className="font-display relative z-[1] px-5 text-center text-2xl text-white">
            {label}
          </span>
          {sparks.map((spark, index) => (
            <span
              key={`${animKey}-${brief.occasion}-${index}`}
              className="absolute top-1/2 left-1/2"
              style={
                {
                  width: spark.size,
                  height: spark.size,
                  margin: -5,
                  borderRadius: spark.radius,
                  background: spark.color,
                  '--x': `${spark.x}px`,
                  '--y': `${spark.y}px`,
                  animation: 'tj-burst 1.1s cubic-bezier(.2,.8,.2,1) forwards',
                  animationDelay: `${spark.delay}s`,
                } as CSSProperties
              }
            />
          ))}
        </Frame>
      )
    }

    case 'feet': {
      const mobility = brief.mobility[0] ?? ''
      const count = { great: 8, moderate: 5, limited: 2 }[mobility] ?? 3
      const label =
        {
          great: '10 km et plus',
          moderate: '5 à 6 km',
          limited: '3 km maximum',
          wheelchair: 'Lieux accessibles uniquement',
          stroller: 'Trottoirs et ascenseurs',
        }[mobility] ?? 'Combien de pas par jour ?'
      return (
        <Frame
          background="#dcf3e4"
          className="flex items-center justify-center gap-3.5"
        >
          {Array.from({ length: count }, (_, index) => (
            <span
              key={`${animKey}-${mobility}-${index}`}
              className="h-[26px] w-4 rounded-[50%_50%_45%_45%] bg-[#15803d]"
              style={{
                translate: `0 ${index % 2 ? 8 : -8}px`,
                rotate: `${index % 2 ? 8 : -8}deg`,
                ...pop(index * 0.07),
              }}
            />
          ))}
          <span className="absolute bottom-3 font-mono text-xs font-semibold text-[#15803d]">
            {label}
          </span>
        </Frame>
      )
    }
  }
}
