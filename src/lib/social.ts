/**
 * Shared types and platform metadata for the social posting dashboard.
 */

export type Platform = 'telegram' | 'max' | 'vk'

export type PostStatus =
  | 'draft'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'partial'
  | 'failed'
  | 'canceled'

export type TargetStatus =
  | 'pending'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'canceled'

export type AppendixPosition = 'prepend' | 'append'

export interface PlatformMeta {
  id: Platform
  label: string
  /** Tailwind color token used across the UI */
  color: string
  /** Hex for inline styling (calendar dots, etc.) */
  hex: string
  /** Lucide icon name */
  icon: string
  description: string
  /** What the "token" field means for this platform */
  tokenLabel: string
  /** What the "targetId" field means for this platform */
  targetLabel: string
  hint: string
}

export const PLATFORMS: Record<Platform, PlatformMeta> = {
  telegram: {
    id: 'telegram',
    label: 'Telegram',
    color: 'sky',
    hex: '#0ea5e9',
    icon: 'Send',
    description: 'Бот или канал. Постинг через Bot API.',
    tokenLabel: 'Bot Token',
    targetLabel: 'Channel / Chat ID',
    hint: 'Получите токен у @BotFather. Для канала — добавьте бота администратором. ID канала можно указать как @username или -100xxxxxxxxxx.',
  },
  max: {
    id: 'max',
    label: 'MAX',
    color: 'emerald',
    hex: '#10b981',
    icon: 'MessageCircle',
    description: 'Бот мессенджера MAX. Постинг через Bot API.',
    tokenLabel: 'Bot Token',
    targetLabel: 'Chat ID',
    hint: 'Создайте бота через @MasterBot в MAX. Добавьте бота в чат/канал и укажите ID чата.',
  },
  vk: {
    id: 'vk',
    label: 'ВКонтакте',
    color: 'rose',
    hex: '#f43f5e',
    icon: 'Users',
    description: 'Сообщество ВКонтакте. Постинг через VK API.',
    tokenLabel: 'Access Token',
    targetLabel: 'Group ID',
    hint: 'Создайте Standalone-приложение, получите access_token с правами wall, groups. Укажите ID сообщества (без минуса).',
  },
}

export const PLATFORM_LIST = Object.values(PLATFORMS)

export const POST_STATUS_META: Record<
  PostStatus,
  { label: string; color: string; bg: string; text: string }
> = {
  draft: { label: 'Черновик', color: 'slate', bg: 'bg-slate-100', text: 'text-slate-600' },
  scheduled: { label: 'Запланирован', color: 'amber', bg: 'bg-amber-100', text: 'text-amber-700' },
  publishing: { label: 'Публикуется', color: 'sky', bg: 'bg-sky-100', text: 'text-sky-700' },
  published: { label: 'Опубликован', color: 'emerald', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  partial: { label: 'Частично', color: 'orange', bg: 'bg-orange-100', text: 'text-orange-700' },
  failed: { label: 'Ошибка', color: 'rose', bg: 'bg-rose-100', text: 'text-rose-700' },
  canceled: { label: 'Отменён', color: 'slate', bg: 'bg-slate-100', text: 'text-slate-500' },
}

export const TARGET_STATUS_META: Record<
  TargetStatus,
  { label: string; color: string; bg: string; text: string }
> = {
  pending: { label: 'Ожидает', color: 'amber', bg: 'bg-amber-100', text: 'text-amber-700' },
  publishing: { label: 'Публикуется', color: 'sky', bg: 'bg-sky-100', text: 'text-sky-700' },
  published: { label: 'Опубликовано', color: 'emerald', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  failed: { label: 'Ошибка', color: 'rose', bg: 'bg-rose-100', text: 'text-rose-700' },
  canceled: { label: 'Отменено', color: 'slate', bg: 'bg-slate-100', text: 'text-slate-500' },
}

/** Build the final text to send to a platform by combining post content + appendix. */
export function composePostText(content: string, appendixBody?: string, position?: AppendixPosition): string {
  if (!appendixBody) return content
  return position === 'prepend' ? `${appendixBody}\n\n${content}` : `${content}${appendixBody}`
}

/** Safe JSON parse with fallback. */
export function safeParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
