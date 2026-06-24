'use client'

import * as React from 'react'
import { Send, MessageCircle, Users, type LucideIcon } from 'lucide-react'

import type { Platform, AppendixPosition } from '@/lib/social'

/** One publication target per platform account for a scheduled post. */
export interface PostTarget {
  id: string
  accountId: string
  status: string
  appendixId: string | null
  errorMessage: string | null
  resultRef: string | null
  publishedAt: string | null
  account: { id: string; platform: Platform; name: string }
}

/** A scheduled post returned by /api/posts. */
export interface Post {
  id: string
  title: string
  content: string
  mediaUrls: string | null
  wordpressRef: string | null
  scheduledAt: string
  status: string
  createdAt: string
  updatedAt: string
  targets: PostTarget[]
}

/** Shape passed into the editor dialog for edit mode. */
export type PostForEdit = Pick<
  Post,
  'id' | 'title' | 'content' | 'mediaUrls' | 'wordpressRef' | 'scheduledAt' | 'targets'
>

/** A platform account row returned by /api/platforms. */
export interface PlatformAccount {
  id: string
  platform: Platform
  name: string
  targetId: string | null
  token: string
  extra: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

/** An appendix template row returned by /api/appendices. */
export interface AppendixTemplate {
  id: string
  platform: string
  name: string
  body: string
  position: string // 'prepend' | 'append'
  category: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

const PLATFORM_ICONS: Record<Platform, LucideIcon> = {
  telegram: Send,
  max: MessageCircle,
  vk: Users,
}

export function PlatformIcon({
  platform,
  className,
  style,
}: {
  platform: Platform
  className?: string
  style?: React.CSSProperties
}) {
  const Icon = PLATFORM_ICONS[platform] ?? Send
  return <Icon className={className} style={style} />
}

/** Map a post status string → hex color used for the card accent bar. */
export const STATUS_HEX: Record<string, string> = {
  draft: '#64748b',
  scheduled: '#f59e0b',
  publishing: '#0ea5e9',
  published: '#10b981',
  partial: '#f97316',
  failed: '#f43f5e',
  canceled: '#94a3b8',
}

/** Map a target status string → hex color used for the tiny status dot. */
export const TARGET_DOT_HEX: Record<string, string> = {
  pending: '#f59e0b',
  publishing: '#0ea5e9',
  published: '#10b981',
  failed: '#f43f5e',
  canceled: '#94a3b8',
}

/** Build a Date ~1 hour from now, rounded to the next :00 minute. */
export function defaultScheduled(): Date {
  const d = new Date()
  d.setHours(d.getHours() + 1, 0, 0, 0)
  return d
}

/** Tailwind bubble classes per platform for the post preview. */
export function bubbleClass(platform: Platform): string {
  switch (platform) {
    case 'telegram':
      return 'bg-sky-50 border-sky-200 text-sky-950'
    case 'max':
      return 'bg-emerald-50 border-emerald-200 text-emerald-950'
    case 'vk':
      return 'bg-rose-50 border-rose-200 text-rose-950'
    default:
      return 'bg-muted text-foreground'
  }
}

/** Per-platform accent classes for chips / hints. */
export function platformAccent(platform: Platform): string {
  switch (platform) {
    case 'telegram':
      return 'text-sky-700'
    case 'max':
      return 'text-emerald-700'
    case 'vk':
      return 'text-rose-700'
    default:
      return 'text-foreground'
  }
}

/** Coerce a stored position string into a typed AppendixPosition. */
export function asPosition(value: string | undefined | null): AppendixPosition | undefined {
  if (value === 'prepend' || value === 'append') return value
  return undefined
}
