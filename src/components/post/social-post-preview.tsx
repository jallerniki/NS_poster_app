'use client'

import * as React from 'react'
import { Eye, Heart, MessageCircle, Repeat2, Share2, Store } from 'lucide-react'

import type { Platform } from '@/lib/social'
import { cn } from '@/lib/utils'
import { PhotoCollage } from './photo-collage'

export interface SocialPostPreviewProps {
  platform: Platform
  /** Final composed text (post content + appendix already merged). */
  text: string
  /** Photo URLs to render as a collage. */
  photos?: string[]
  /** Display name of the channel / community / bot. */
  accountName?: string
  /** Short label under the name (e.g. "канал", "сообщество"). */
  accountType?: string
  /** Time label shown in the footer, e.g. "12:30" or "21 июн, 12:30". */
  time?: string
  /** Views count label, e.g. "1,2K". */
  views?: string
  /** Likes/reactions count label. */
  reactions?: string
  /** Comments count label (VK). */
  comments?: string
  /** Shares count label (VK). */
  shares?: string
  /** When set, text is truncated to this many lines (with ellipsis). */
  maxLines?: number
  className?: string
}

const PLATFORM_ACCENT: Record<Platform, { ring: string; text: string; dot: string }> = {
  telegram: { ring: 'ring-sky-200', text: 'text-sky-700', dot: '#0ea5e9' },
  max: { ring: 'ring-emerald-200', text: 'text-emerald-700', dot: '#10b981' },
  vk: { ring: 'ring-rose-200', text: 'text-rose-700', dot: '#f43f5e' },
}

function Avatar({ platform, name }: { platform: Platform; name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || 'М'
  const gradients: Record<Platform, string> = {
    telegram: 'from-sky-400 to-sky-600',
    max: 'from-emerald-400 to-emerald-600',
    vk: 'from-rose-400 to-rose-600',
  }
  return (
    <div
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white',
        gradients[platform],
      )}
      aria-hidden
    >
      {initial}
    </div>
  )
}

/**
 * Realistic, platform-accurate rendering of a social post.
 *
 * - Telegram / MAX: channel-style message — header (avatar + name), a white
 *   bubble containing the photo collage and caption, then a footer with
 *   views · time · reactions.
 * - VK: wall-post style — author row, text block, photo collage, then a
 *   footer row with views · comments · likes · share.
 */
export function SocialPostPreview({
  platform,
  text,
  photos = [],
  accountName,
  accountType,
  time,
  views,
  reactions,
  comments,
  shares,
  maxLines,
  className,
}: SocialPostPreviewProps) {
  const accent = PLATFORM_ACCENT[platform]
  const name = accountName ?? (platform === 'telegram' ? 'Мой канал' : platform === 'max' ? 'Мой бот' : 'Моё сообщество')
  const photos_ = photos.filter(Boolean)

  if (platform === 'vk') {
    return (
      <VkPreview
        name={name}
        accountType={accountType ?? 'сообщество'}
        time={time ?? ''}
        text={text}
        photos={photos_}
        views={views}
        comments={comments}
        reactions={reactions}
        shares={shares}
        className={className}
      />
    )
  }

  // Telegram & MAX share the channel-post layout, only tint differs.
  const isMax = platform === 'max'
  const bubbleBg = isMax ? 'bg-white border-emerald-200' : 'bg-white border-slate-200'
  const footerTime = time ?? ''

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Avatar platform={platform} name={name} />
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1 text-sm font-semibold leading-tight">
            <span className="truncate">{name}</span>
            {isMax ? (
              <span className="inline-flex size-3.5 items-center justify-center rounded-full bg-emerald-500 text-[8px] text-white">
                ✓
              </span>
            ) : (
              <span className="inline-flex size-3.5 items-center justify-center rounded-full bg-sky-500 text-[8px] text-white">
                ✓
              </span>
            )}
          </span>
          <span className="text-[11px] leading-tight text-muted-foreground">
            {accountType ?? (isMax ? 'бот · MAX' : 'канал · Telegram')}
          </span>
        </div>
      </div>

      {/* Bubble: media then caption (TG channel posts put caption below media) */}
      <div className={cn('overflow-hidden rounded-2xl border shadow-sm', bubbleBg)}>
        {photos_.length > 0 && <PhotoCollage photos={photos_} rounding="none" />}
        {text.trim() ? (
          <div
            className={cn(
              'whitespace-pre-wrap break-words px-3 py-2.5 text-sm leading-relaxed text-slate-900',
              maxLines === 3 && 'line-clamp-3',
              maxLines === 2 && 'line-clamp-2',
              maxLines === 4 && 'line-clamp-4',
            )}
          >
            {renderText(text)}
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 px-1 text-[11px] text-muted-foreground">
        {views && (
          <span className="inline-flex items-center gap-1">
            <Eye className="size-3" />
            {views}
          </span>
        )}
        {footerTime && <span>{footerTime}</span>}
        {reactions && (
          <span className="inline-flex items-center gap-1">
            <Heart className="size-3" />
            {reactions}
          </span>
        )}
      </div>
    </div>
  )
}

function VkPreview({
  name,
  accountType,
  time,
  text,
  photos,
  views,
  comments,
  reactions,
  shares,
  className,
}: {
  name: string
  accountType: string
  time: string
  text: string
  photos: string[]
  views?: string
  comments?: string
  reactions?: string
  shares?: string
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Author row */}
      <div className="flex items-center gap-2">
        <Avatar platform="vk" name={name} />
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1 text-sm font-semibold leading-tight">
            <span className="truncate">{name}</span>
            <span className="inline-flex size-3.5 items-center justify-center rounded-full bg-rose-500 text-[8px] text-white">
              ✓
            </span>
          </span>
          <span className="text-[11px] leading-tight text-muted-foreground">
            {accountType}
            {time ? ` · ${time}` : ''}
          </span>
        </div>
      </div>

      {/* Text */}
      {text.trim() ? (
        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-900">
          {renderText(text)}
        </div>
      ) : null}

      {/* Photos */}
      {photos.length > 0 && <PhotoCollage photos={photos} rounding="lg" />}

      {/* Footer */}
      <div className="flex items-center gap-4 pt-0.5 text-[12px] text-muted-foreground">
        {views && (
          <span className="inline-flex items-center gap-1">
            <Eye className="size-3.5" />
            {views}
          </span>
        )}
        {comments && (
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="size-3.5" />
            {comments}
          </span>
        )}
        {reactions && (
          <span className="inline-flex items-center gap-1">
            <Heart className="size-3.5" />
            {reactions}
          </span>
        )}
        {shares && (
          <span className="inline-flex items-center gap-1">
            <Share2 className="size-3.5" />
            {shares}
          </span>
        )}
        <Repeat2 className="ml-auto size-3.5" />
      </div>
    </div>
  )
}

/**
 * Light-weight markdown-ish rendering for **bold** and links http(s)://…
 * Telegram captions use **bold** for emphasis; we render those as <strong>.
 */
function renderText(text: string): React.ReactNode {
  const nodes: React.ReactNode[] = []
  // Split by lines first to preserve whitespace-pre-wrap semantics via spans.
  const lines = text.split('\n')
  lines.forEach((line, li) => {
    let remaining = line
    let key = 0
    const parts: React.ReactNode[] = []
    // Token regex: **bold**, [text](url) markdown links (URL may have trailing space before )), or https?://\S+
    const tokenRe = /(\*\*[^*]+\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+?)\s*\)|https?:\/\/\S+)/g
    let lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = tokenRe.exec(remaining)) !== null) {
      if (match.index > lastIndex) {
        parts.push(remaining.slice(lastIndex, match.index))
      }
      const tok = match[0]
      const mdLinkText = match[2] // [text](url) → text
      const mdLinkUrl = match[3]  // [text](url) → url
      if (tok.startsWith('**')) {
        parts.push(
          <strong key={`b-${li}-${key++}`} className="font-semibold">
            {tok.slice(2, -2)}
          </strong>,
        )
      } else if (mdLinkText && mdLinkUrl) {
        // Markdown link [text](url) → render as styled anchor with the text.
        parts.push(
          <a
            key={`a-${li}-${key++}`}
            href={mdLinkUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-sky-600 underline decoration-sky-300 underline-offset-2 break-all"
          >
            {mdLinkText}
          </a>,
        )
      } else {
        parts.push(
          <a
            key={`a-${li}-${key++}`}
            href={tok}
            target="_blank"
            rel="noreferrer noopener"
            className="text-sky-600 underline decoration-sky-300 underline-offset-2 break-all"
          >
            {tok}
          </a>,
        )
      }
      lastIndex = match.index + tok.length
    }
    if (lastIndex < remaining.length) {
      parts.push(remaining.slice(lastIndex))
    }
    nodes.push(
      <React.Fragment key={`line-${li}`}>
        {parts.length > 0 ? parts : ''}
        {li < lines.length - 1 ? '\n' : ''}
      </React.Fragment>,
    )
  })
  return nodes
}

/** Small badge showing the shop / store identity used as a default avatar fallback. */
export function StoreBadge({ className }: { className?: string }) {
  return <Store className={className} />
}
