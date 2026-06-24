'use client'

import * as React from 'react'
import {
  CalendarDays,
  FileText,
  Globe,
  LayoutDashboard,
  LogOut,
  MousePointerClick,
  Plug,
  Share2,
  StickyNote,
} from 'lucide-react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  type DashboardSection,
  useStore,
} from '@/lib/store'
import { useAuth } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

interface NavItem {
  id: DashboardSection
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Обзор',
    description: 'Сводка и лента постов',
    icon: LayoutDashboard,
  },
  {
    id: 'calendar',
    label: 'Календарь',
    description: 'Сетка публикаций',
    icon: CalendarDays,
  },
  {
    id: 'platforms',
    label: 'Площадки',
    description: 'Подключения и токены',
    icon: Plug,
  },
  {
    id: 'appendices',
    label: 'Приписки',
    description: 'Подписи по площадкам',
    icon: StickyNote,
  },
  {
    id: 'templates',
    label: 'Шаблоны',
    description: 'Шаблоны постов',
    icon: FileText,
  },
  {
    id: 'buttons',
    label: 'Кнопки',
    description: 'Кнопки в постах',
    icon: MousePointerClick,
  },
  {
    id: 'wordpress',
    label: 'WordPress',
    description: 'Источник товаров',
    icon: Globe,
  },
]

/** Pulsing green dot used to indicate "online" (WP session active). */
function OnlineDot({ online }: { online: boolean }) {
  return (
    <span className="relative inline-flex size-2.5" aria-hidden>
      {online ? (
        <>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400" />
        </>
      ) : (
        <span className="relative inline-flex size-2.5 rounded-full bg-slate-500" />
      )}
    </span>
  )
}

export function SidebarNav() {
  const section = useStore((s) => s.section)
  const setSection = useStore((s) => s.setSection)
  const authenticated = useAuth((s) => s.authenticated)
  const user = useAuth((s) => s.user)
  const logout = useAuth((s) => s.logout)

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-gradient-to-b from-teal-900 to-teal-950 text-teal-50 h-screen sticky top-0">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          <div className="flex size-10 items-center justify-center rounded-xl bg-teal-50/10 ring-1 ring-white/15">
            <Share2 className="size-5 text-teal-50" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold leading-tight text-teal-50">
              <span className="truncate">Пост-Менеджер</span>
              {authenticated ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-300 ring-1 ring-emerald-400/30"
                  title="Подключение к WordPress активно"
                >
                  <OnlineDot online />
                  Активно
                </span>
              ) : null}
            </div>
            <div className="text-[11px] text-teal-200/80 leading-tight">
              Telegram · MAX · VK
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const active = item.id === section
              const isWp = item.id === 'wordpress'
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSection(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group relative flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                      active
                        ? 'bg-white/10 text-white'
                        : 'text-teal-100/80 hover:bg-white/5 hover:text-white',
                    )}
                  >
                    {/* Left accent bar */}
                    <span
                      className={cn(
                        'absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-teal-300 transition-opacity',
                        active ? 'opacity-100' : 'opacity-0',
                      )}
                      aria-hidden
                    />
                    <Icon
                      className={cn(
                        'mt-0.5 size-5 shrink-0',
                        active
                          ? 'text-teal-50'
                          : 'text-teal-200/80 group-hover:text-white',
                      )}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-1.5 text-sm font-medium leading-tight">
                        <span className="truncate">{item.label}</span>
                        {isWp ? (
                          <span
                            className="ml-auto inline-flex shrink-0 items-center gap-1 text-[9px] font-semibold uppercase tracking-wide"
                            title={
                              authenticated
                                ? 'WordPress подключён'
                                : 'WordPress не подключён'
                            }
                          >
                            <OnlineDot online={authenticated} />
                            <span
                              className={
                                authenticated ? 'text-emerald-300' : 'text-teal-300/50'
                              }
                            >
                              {authenticated ? 'Активно' : 'Неактивно'}
                            </span>
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          'text-[11px] leading-tight',
                          active
                            ? 'text-teal-100/90'
                            : 'text-teal-300/60 group-hover:text-teal-100/80',
                        )}
                      >
                        {item.description}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* User footer with logout */}
        <div className="border-t border-white/10 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-50/15 text-xs font-semibold uppercase text-teal-50 ring-1 ring-white/10">
              {(user?.displayName || user?.nicename || 'U').charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-teal-50">
                {user?.displayName || user?.nicename || 'Пользователь'}
              </div>
              <div className="truncate text-[10px] text-teal-300/70">
                {user?.email || 'WordPress'}
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              aria-label="Выйти"
              title="Выйти"
              className="flex size-7 items-center justify-center rounded-md text-teal-200/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top section switcher */}
      <div className="md:hidden flex items-center gap-2 border-b bg-background px-4 py-3 sticky top-0 z-30">
        <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-b from-teal-700 to-teal-900 text-teal-50">
          <Share2 className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
            Пост-Менеджер
            {authenticated ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-600">
                <OnlineDot online />
                Активно
              </span>
            ) : null}
          </div>
          <div className="text-[11px] text-muted-foreground leading-tight">
            Telegram · MAX · VK
          </div>
        </div>
        <Select value={section} onValueChange={(v) => setSection(v as DashboardSection)}>
          <SelectTrigger className="h-9 w-[150px]" aria-label="Раздел">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NAV_ITEMS.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={logout}
          aria-label="Выйти"
          title="Выйти"
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </>
  )
}
