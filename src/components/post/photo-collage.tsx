'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

export interface PhotoCollageProps {
  /** Photo URLs to render. */
  photos: string[]
  /** Outer rounding of the collage container. */
  rounding?: 'none' | 'md' | 'lg' | 'xl'
  /** Explicit height in pixels — overrides the default aspect ratio. */
  height?: number
  className?: string
}

/**
 * Telegram / MAX / VK-style photo collage.
 *
 * Layouts by count:
 *  - 1 → single 4:3
 *  - 2 → side-by-side
 *  - 3 → 1 tall (left) + 2 stacked (right)
 *  - 4 → 2×2 grid
 *  - 5 → 2 top + 3 bottom
 *  - 6 → 3×2 grid
 *  - 7+ → 3×2 grid with "+N" overlay on the 6th cell
 */
export function PhotoCollage({
  photos,
  rounding = 'lg',
  height,
  className,
}: PhotoCollageProps) {
  const list = photos.filter(Boolean)
  const count = list.length
  if (count === 0) return null

  const roundingCls: Record<NonNullable<PhotoCollageProps['rounding']>, string> = {
    none: '',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
  }

  const sizeCls = height
    ? undefined
    : count === 1
      ? 'aspect-[4/3]'
      : 'aspect-square'
  const style = height ? { height: `${height}px` } : undefined

  const wrapCls = cn(
    'overflow-hidden',
    roundingCls[rounding],
    sizeCls,
    className,
  )

  // ── 1: single ─────────────────────────────────────────────
  if (count === 1) {
    return (
      <div className={wrapCls} style={style}>
        <Photo src={list[0]} />
      </div>
    )
  }

  // ── 2: side-by-side ───────────────────────────────────────
  if (count === 2) {
    return (
      <div className={cn('grid grid-cols-2 gap-0.5', wrapCls)} style={style}>
        <Photo src={list[0]} />
        <Photo src={list[1]} />
      </div>
    )
  }

  // ── 3: 1 tall + 2 stacked ─────────────────────────────────
  if (count === 3) {
    return (
      <div
        className={cn('grid grid-cols-2 grid-rows-2 gap-0.5', wrapCls)}
        style={style}
      >
        <Photo src={list[0]} className="row-span-2" />
        <Photo src={list[1]} />
        <Photo src={list[2]} />
      </div>
    )
  }

  // ── 4: 2×2 ────────────────────────────────────────────────
  if (count === 4) {
    return (
      <div
        className={cn('grid grid-cols-2 grid-rows-2 gap-0.5', wrapCls)}
        style={style}
      >
        <Photo src={list[0]} />
        <Photo src={list[1]} />
        <Photo src={list[2]} />
        <Photo src={list[3]} />
      </div>
    )
  }

  // ── 5: 2 top + 3 bottom ───────────────────────────────────
  if (count === 5) {
    return (
      <div className={cn('flex flex-col gap-0.5', wrapCls)} style={style}>
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-0.5">
          <Photo src={list[0]} />
          <Photo src={list[1]} />
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-0.5">
          <Photo src={list[2]} />
          <Photo src={list[3]} />
          <Photo src={list[4]} />
        </div>
      </div>
    )
  }

  // ── 6 / 7+: 3×2 grid (+N overlay on 6th) ──────────────────
  const visible = list.slice(0, 6)
  const extra = count - 6
  return (
    <div
      className={cn('grid grid-cols-3 grid-rows-2 gap-0.5', wrapCls)}
      style={style}
    >
      {visible.slice(0, 5).map((src, i) => (
        <Photo key={i} src={src} />
      ))}
      <Photo
        src={visible[5] ?? ''}
        overlay={
          extra > 0 ? (
            <span className="text-xl font-bold tracking-tight">
              +{extra}
            </span>
          ) : undefined
        }
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Photo cell
// ────────────────────────────────────────────────────────────────────────────

interface PhotoProps {
  src: string
  className?: string
  /** Optional overlay content rendered on top of the image (e.g. "+N" badge). */
  overlay?: React.ReactNode
}

function Photo({ src, className, overlay }: PhotoProps) {
  const [loaded, setLoaded] = React.useState(false)
  return (
    <div className={cn('relative overflow-hidden bg-muted', className)}>
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          draggable={false}
          onLoad={() => setLoaded(true)}
          className={cn(
            'h-full w-full object-cover transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      ) : null}
      {overlay ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-white">
          {overlay}
        </div>
      ) : null}
    </div>
  )
}
