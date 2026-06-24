'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Newspaper,
  Image as ImageIcon,
  CalendarDays,
  X,
  Plus,
} from 'lucide-react'
import {
  format,
  formatDistanceToNow,
  parseISO,
  isSameDay,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isToday as isDateToday,
  addMonths,
} from 'date-fns'
import { ru } from 'date-fns/locale'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useStore } from '@/lib/store'
import {
  PLATFORMS,
  PLATFORM_LIST,
  POST_STATUS_META,
  composePostText,
  safeParse,
  type Platform,
  type PostStatus,
  type AppendixPosition,
} from '@/lib/social'
import { PhotoCollage } from '@/components/post/photo-collage'
import { SocialPostPreview } from '@/components/post/social-post-preview'
import { cn } from '@/lib/utils'

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface PostTarget {
  id: string
  accountId: string
  status: string
  appendixId: string | null
  errorMessage: string | null
  resultRef: string | null
  publishedAt: string | null
  account: { id: string; platform: Platform; name: string }
}

interface PostListItem {
  id: string
  title: string
  content: string
  mediaUrls: string | null
  wordpressRef: string | null
  scheduledAt: string
  status: PostStatus
  targets: PostTarget[]
}

interface AppendixTemplate {
  id: string
  platform: string
  name: string
  body: string
  position: string
  category: string | null
  active: boolean
}

interface CalendarDay {
  date: string // YYYY-MM-DD (UTC)
  total: number
  byPlatform: Record<Platform, number>
  published: number
  scheduled: number
  failed: number
  posts: Array<{
    id: string
    title: string
    scheduledAt: string
    status: string
    platforms: string[]
  }>
}

interface StatsResponse {
  totalPosts: number
  scheduled: number
  published: number
  failed: number
  partial: number
  today: { scheduled: number; published: number }
  thisWeek: { scheduled: number; published: number }
  nextPost: {
    id: string
    title: string
    scheduledAt: string
    platforms: string[]
  } | null
  byPlatform: Record<Platform, { total: number; published: number; scheduled: number }>
}

// ────────────────────────────────────────────────────────────────────────────
// Constants & helpers
// ────────────────────────────────────────────────────────────────────────────

const WEEKDAY_HEADERS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

type FeedFilter = 'all' | 'scheduled' | 'published' | 'today'

const FILTER_OPTIONS: { value: FeedFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'scheduled', label: 'Запланированы' },
  { value: 'published', label: 'Опубликованы' },
  { value: 'today', label: 'Сегодня' },
]

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Stable hash from a string — used to derive deterministic-looking stats. */
function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/** 1234 → "1,2K", 836 → "836", 12000 → "12,0K" */
function formatCount(n: number): string {
  if (n >= 1000) {
    const k = n / 1000
    return `${k.toFixed(1).replace('.', ',')}K`
  }
  return String(n)
}

// ────────────────────────────────────────────────────────────────────────────
// Main section
// ────────────────────────────────────────────────────────────────────────────

export function DashboardSection() {
  const [filter, setFilter] = React.useState<FeedFilter>('all')
  // Default to TODAY — the feed shows posts for the selected day. User can
  // pick another day in the mini-calendar or click "Показать все" to clear.
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(
    () => new Date(),
  )

  const postsQuery = useQuery<PostListItem[]>({
    queryKey: ['posts', 'dashboard-feed'],
    queryFn: async () => {
      const res = await fetch('/api/posts')
      if (!res.ok) throw new Error('Не удалось загрузить посты')
      return res.json() as Promise<PostListItem[]>
    },
    staleTime: 30_000,
  })

  const appendicesQuery = useQuery<AppendixTemplate[]>({
    queryKey: ['appendices', 'dashboard-feed'],
    queryFn: async () => {
      const res = await fetch('/api/appendices')
      if (!res.ok) throw new Error('Не удалось загрузить приписки')
      return res.json() as Promise<AppendixTemplate[]>
    },
    staleTime: 30_000,
  })

  const appendixMap = React.useMemo(() => {
    const m = new Map<string, AppendixTemplate>()
    for (const a of appendicesQuery.data ?? []) m.set(a.id, a)
    return m
  }, [appendicesQuery.data])

  // API returns DESC by scheduledAt — keep latest first.
  const sortedPosts = React.useMemo(() => {
    if (!postsQuery.data) return []
    return [...postsQuery.data].sort(
      (a, b) =>
        new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
    )
  }, [postsQuery.data])

  const filteredPosts = React.useMemo(() => {
    const now = new Date()
    return sortedPosts.filter((p) => {
      // Date filter (from mini-calendar) overrides the tab filter.
      if (selectedDate) {
        return isSameDay(parseISO(p.scheduledAt), selectedDate)
      }
      if (filter === 'all') return true
      if (filter === 'scheduled')
        return (
          p.status === 'scheduled' ||
          p.status === 'publishing' ||
          p.status === 'draft'
        )
      if (filter === 'published') return p.status === 'published'
      if (filter === 'today') return isSameDay(parseISO(p.scheduledAt), now)
      return true
    })
  }, [sortedPosts, filter, selectedDate])

  const loading = postsQuery.isLoading || appendicesQuery.isLoading

  const handleSelectDate = (day: Date | null) => {
    // Toggle off if the same day is clicked again.
    if (day && selectedDate && isSameDay(day, selectedDate)) {
      setSelectedDate(null)
    } else {
      setSelectedDate(day)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      {/* CENTER: feed */}
      <section className="flex min-w-0 flex-col gap-4">
        <FeedHeader
          count={filteredPosts.length}
          filter={filter}
          onFilterChange={setFilter}
          selectedDate={selectedDate}
          onClearDate={() => setSelectedDate(null)}
        />
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <FeedCardSkeleton key={i} />
            ))}
          </div>
        ) : filteredPosts.length === 0 ? (
          <FeedEmptyState
            hasDate={!!selectedDate}
            filter={filter}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredPosts.map((post) => (
              <FeedPostCard
                key={post.id}
                post={post}
                appendixMap={appendixMap}
              />
            ))}
          </div>
        )}
      </section>

      {/* RIGHT: mini-calendar + quick stats */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-[72px] lg:self-start">
        <MiniCalendar
          selectedDate={selectedDate}
          onSelectDate={handleSelectDate}
        />
        <QuickStats />
      </aside>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Feed header
// ────────────────────────────────────────────────────────────────────────────

function FeedHeader({
  count,
  filter,
  onFilterChange,
  selectedDate,
  onClearDate,
}: {
  count: number
  filter: FeedFilter
  onFilterChange: (f: FeedFilter) => void
  selectedDate: Date | null
  onClearDate: () => void
}) {
  // When a specific day is selected from the mini-calendar, show a date banner
  // instead of the tab filter (the date overrides the tabs).
  if (selectedDate) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold tracking-tight">
            Посты за {format(selectedDate, 'd MMMM', { locale: ru })}
          </h2>
          <span className="text-sm text-muted-foreground tabular-nums">
            {count}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onClearDate}
          className="h-8 gap-1.5"
        >
          <X className="size-3.5" />
          Показать все
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-baseline gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Лента публикаций</h2>
        <span className="text-sm text-muted-foreground tabular-nums">{count}</span>
      </div>
      <Tabs
        value={filter}
        onValueChange={(v) => onFilterChange(v as FeedFilter)}
      >
        <TabsList className="h-8">
          {FILTER_OPTIONS.map((opt) => (
            <TabsTrigger
              key={opt.value}
              value={opt.value}
              className="px-2.5 text-xs"
            >
              {opt.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Feed post card — compact, ~1/3 width, photo-forward
// ────────────────────────────────────────────────────────────────────────────

function FeedPostCard({
  post,
  appendixMap,
}: {
  post: PostListItem
  appendixMap: Map<string, AppendixTemplate>
}) {
  const openEditor = useStore((s) => s.openEditor)

  const date = parseISO(post.scheduledAt)
  const statusMeta = POST_STATUS_META[post.status] ?? POST_STATUS_META.scheduled

  // Primary target = first target's account (default to telegram if none)
  const primaryTarget = post.targets[0] ?? null
  const primaryPlatform: Platform = primaryTarget?.account.platform ?? 'telegram'

  // Appendix attached to the primary target
  const appendix =
    primaryTarget?.appendixId != null
      ? (appendixMap.get(primaryTarget.appendixId) ?? undefined)
      : undefined
  const appendixPosition: AppendixPosition | undefined =
    appendix?.position === 'prepend'
      ? 'prepend'
      : appendix?.position === 'append'
        ? 'append'
        : undefined

  const composedText = composePostText(
    post.content ?? '',
    appendix?.body,
    appendixPosition,
  )
  const photos = safeParse<string[]>(post.mediaUrls, [])

  // Unique platforms across all targets → colored dots
  const platforms = Array.from(
    new Set(
      post.targets
        .map((t) => t.account.platform)
        .filter(
          (p): p is Platform => p === 'telegram' || p === 'max' || p === 'vk',
        ),
    ),
  )

  const handleOpen = () => openEditor(post)

  return (
    <Card
      className="group flex cursor-pointer flex-col gap-0 overflow-hidden rounded-lg border border-slate-200/60 p-0 shadow-none transition-shadow hover:shadow-md dark:border-slate-800/60"
      onClick={handleOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleOpen()
        }
      }}
    >
      {/* Meta strip — compact, no border */}
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Clock className="size-3 text-muted-foreground" />
          <span className="truncate text-xs font-medium tabular-nums">
            {format(date, 'd MMM, HH:mm')}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge
            variant="outline"
            className={cn(
              'border-transparent px-1.5 py-0 text-[10px]',
              statusMeta.bg,
              statusMeta.text,
            )}
          >
            {statusMeta.label}
          </Badge>
          <div className="flex items-center gap-0.5">
            {platforms.map((p) => {
              const meta = PLATFORMS[p]
              if (!meta) return null
              return (
                <span
                  key={p}
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: meta.hex }}
                  title={meta.label}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* TG-style preview — no bg, no padding around bubble */}
      <div className="px-2 pb-2">
        <SocialPostPreview
          platform={primaryPlatform}
          text={composedText}
          photos={photos}
          accountName={primaryTarget?.account.name}
          time={format(date, 'HH:mm')}
          maxLines={3}
        />
      </div>

      {/* Footer — minimal */}
      <div className="flex items-center gap-1.5 px-3 pb-2 pt-1">
        {photos.length > 0 ? (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <ImageIcon className="size-2.5" />
            {photos.length}
          </span>
        ) : null}
        {post.wordpressRef ? (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-teal-600">
            <Newspaper className="size-2.5" />
            WP
          </span>
        ) : null}
      </div>
    </Card>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Feed skeleton + empty state
// ────────────────────────────────────────────────────────────────────────────

function FeedCardSkeleton() {
  return (
    <Card className="gap-0 overflow-hidden rounded-xl p-0 shadow-sm">
      <Skeleton className="h-[170px] w-full rounded-none" />
      <div className="space-y-2 p-3">
        <div className="flex justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </Card>
  )
}

function FeedEmptyState({
  hasDate,
  filter,
}: {
  hasDate: boolean
  filter: FeedFilter
}) {
  const openEditor = useStore((s) => s.openEditor)
  const isFiltered = filter !== 'all'

  return (
    <Card className="border-dashed py-6">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          {hasDate ? (
            <CalendarDays className="size-6 text-muted-foreground" />
          ) : (
            <Newspaper className="size-6 text-muted-foreground" />
          )}
        </div>
        <div className="space-y-1">
          <div className="text-sm font-medium">
            {hasDate
              ? 'На этот день постов нет'
              : isFiltered
                ? 'Ничего не найдено'
                : 'Пока нет публикаций'}
          </div>
          <div className="text-xs text-muted-foreground">
            {hasDate
              ? 'Выберите другой день в календаре или создайте новый пост.'
              : isFiltered
                ? 'Попробуйте сменить фильтр или создать новый пост.'
                : 'Создайте первый пост — он появится в ленте.'}
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => openEditor(null)}
          className="bg-teal-700 hover:bg-teal-800"
        >
          <Plus className="size-4" />
          Создать пост
        </Button>
      </CardContent>
    </Card>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Mini calendar (right column) — clicking a day filters the feed
// ────────────────────────────────────────────────────────────────────────────

function MiniCalendar({
  selectedDate,
  onSelectDate,
}: {
  selectedDate: Date | null
  onSelectDate: (day: Date | null) => void
}) {
  const today = React.useMemo(() => new Date(), [])
  const [viewDate, setViewDate] = React.useState<Date>(() =>
    startOfMonth(today),
  )

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth() + 1

  const calendarQuery = useQuery<CalendarDay[]>({
    queryKey: ['calendar', year, month],
    queryFn: async () => {
      const params = new URLSearchParams({
        year: String(year),
        month: String(month),
      })
      const res = await fetch(`/api/calendar?${params.toString()}`)
      if (!res.ok) throw new Error('Не удалось загрузить календарь')
      return res.json() as Promise<CalendarDay[]>
    },
    staleTime: 30_000,
  })

  const cells = React.useMemo(() => {
    const monthStart = startOfMonth(viewDate)
    const monthEnd = endOfMonth(viewDate)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: gridStart, end: gridEnd })
  }, [viewDate])

  const bucketsByKey = React.useMemo(() => {
    const map = new Map<string, CalendarDay>()
    for (const b of calendarQuery.data ?? []) {
      map.set(b.date, b)
    }
    return map
  }, [calendarQuery.data])

  return (
    <Card className="gap-0 p-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-1 px-1 pb-2">
        <div className="text-sm font-semibold capitalize">
          {format(viewDate, 'LLLL yyyy', { locale: ru })}
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setViewDate((d) => addMonths(d, -1))}
            aria-label="Предыдущий месяц"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setViewDate((d) => addMonths(d, 1))}
            aria-label="Следующий месяц"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-0.5 pb-1">
        {WEEKDAY_HEADERS.map((wd) => (
          <div
            key={wd}
            className="text-center text-[10px] font-medium uppercase text-muted-foreground"
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Day cells */}
      {calendarQuery.isLoading ? (
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton key={i} className="h-8 rounded" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((day) => {
            const key = localDateKey(day)
            const bucket = bucketsByKey.get(key) ?? null
            const inMonth = day.getMonth() === viewDate.getMonth()
            const isToday = isDateToday(day)
            const isSelected =
              !!selectedDate && isSameDay(day, selectedDate)
            return (
              <MiniDayCell
                key={key}
                date={day}
                bucket={bucket}
                inMonth={inMonth}
                isToday={isToday}
                isSelected={isSelected}
                onClick={() => onSelectDate(day)}
              />
            )
          })}
        </div>
      )}

      {/* Legend */}
      <div className="mt-2 flex items-center justify-center gap-3 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <span className="inline-block size-1.5 rounded-full bg-amber-400" />
          запл.
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
          опуб.
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block size-1.5 rounded-full border border-teal-600" />
          выбран
        </div>
      </div>
    </Card>
  )
}

function MiniDayCell({
  date,
  bucket,
  inMonth,
  isToday,
  isSelected,
  onClick,
}: {
  date: Date
  bucket: CalendarDay | null
  inMonth: boolean
  isToday: boolean
  isSelected: boolean
  onClick: () => void
}) {
  const hasScheduled = inMonth && !!bucket && bucket.scheduled > 0
  const hasPublished = inMonth && !!bucket && bucket.published > 0
  const hasActivity = hasScheduled || hasPublished

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={format(date, 'd MMMM yyyy', { locale: ru })}
      className={cn(
        'relative flex h-8 flex-col items-center justify-center rounded transition-colors',
        !inMonth && 'text-muted-foreground/40',
        inMonth && 'text-foreground hover:bg-accent',
        isToday && !isSelected && 'bg-teal-600 text-white hover:bg-teal-600',
        isSelected && 'ring-2 ring-teal-600 ring-offset-1 ring-offset-background',
        isSelected && isToday && 'bg-teal-600 text-white',
        isSelected && !isToday && 'bg-teal-50 text-teal-900',
      )}
    >
      <span className="text-[11px] font-medium leading-none tabular-nums">
        {format(date, 'd')}
      </span>
      {hasActivity ? (
        <div className="mt-0.5 flex items-center gap-0.5">
          {hasScheduled ? (
            <span className="inline-block size-1 rounded-full bg-amber-400" />
          ) : null}
          {hasPublished ? (
            <span className="inline-block size-1 rounded-full bg-emerald-500" />
          ) : null}
        </div>
      ) : null}
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Quick stats (right column)
// ────────────────────────────────────────────────────────────────────────────

function QuickStats() {
  const setSection = useStore((s) => s.setSection)

  const statsQuery = useQuery<StatsResponse>({
    queryKey: ['stats', 'dashboard-quick'],
    queryFn: async () => {
      const res = await fetch('/api/stats')
      if (!res.ok) throw new Error('Не удалось загрузить статистику')
      return res.json() as Promise<StatsResponse>
    },
    staleTime: 30_000,
  })

  const stats = statsQuery.data

  return (
    <Card className="gap-0 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">Сводка</div>
      </div>

      {statsQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : stats ? (
        <div className="space-y-4">
          {/* Today & this week */}
          <div className="grid grid-cols-2 gap-2">
            <StatPair
              label="Сегодня"
              scheduled={stats.today.scheduled}
              published={stats.today.published}
            />
            <StatPair
              label="На неделе"
              scheduled={stats.thisWeek.scheduled}
              published={stats.thisWeek.published}
            />
          </div>

          {/* By platform */}
          <div className="space-y-2.5">
            <div className="text-[11px] font-medium uppercase text-muted-foreground">
              По площадкам
            </div>
            {PLATFORM_LIST.map((p) => {
              const data = stats.byPlatform[p.id]
              const total = data?.total ?? 0
              const published = data?.published ?? 0
              const pct = total > 0 ? Math.round((published / total) * 100) : 0
              return (
                <div key={p.id} className="space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className="inline-block size-2 rounded-full"
                      style={{ backgroundColor: p.hex }}
                    />
                    <span className="flex-1">{p.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {published}/{total}
                    </span>
                  </div>
                  <Progress
                    value={pct}
                    className="h-1.5 [&>div]:bg-emerald-500"
                  />
                </div>
              )
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            onClick={() => setSection('calendar')}
          >
            <CalendarDays className="size-3.5" />
            Открыть календарь
          </Button>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">
          Не удалось загрузить статистику.
        </div>
      )}
    </Card>
  )
}

function StatPair({
  label,
  scheduled,
  published,
}: {
  label: string
  scheduled: number
  published: number
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-2.5">
      <div className="text-[10px] font-medium uppercase text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 flex items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="inline-block size-1.5 rounded-full bg-amber-400" />
          <span className="text-sm font-semibold tabular-nums">{scheduled}</span>
          <span className="text-[10px] text-muted-foreground">запл.</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
          <span className="text-sm font-semibold tabular-nums">{published}</span>
          <span className="text-[10px] text-muted-foreground">опуб.</span>
        </div>
      </div>
    </div>
  )
}
