'use client'

import * as React from 'react'
import { Plus } from 'lucide-react'

import { SidebarNav } from '@/components/sidebar-nav'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { PostEditorDialog } from '@/components/sections/post-editor-dialog'
import { useStore, type DashboardSection } from '@/lib/store'

const SECTION_TITLES: Record<DashboardSection, string> = {
  dashboard: 'Обзор',
  calendar: 'Календарь',
  platforms: 'Площадки',
  appendices: 'Приписки',
  wordpress: 'WordPress',
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const section = useStore((s) => s.section)
  const openEditor = useStore((s) => s.openEditor)
  const editorOpen = useStore((s) => s.editorOpen)
  const editorPost = useStore((s) => s.editorPost)
  const closeEditor = useStore((s) => s.closeEditor)

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground md:flex-row">
      <SidebarNav />
      <main className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold leading-tight md:text-lg">
              {SECTION_TITLES[section]}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              size="sm"
              onClick={() => openEditor(null)}
              className="bg-teal-700 text-white hover:bg-teal-700/90"
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">Создать пост</span>
            </Button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 md:p-6">{children}</div>
      </main>

      {/* Global post editor dialog — opened from header / feed cards */}
      <PostEditorDialog
        open={editorOpen}
        onOpenChange={(o) => (o ? openEditor(editorPost) : closeEditor())}
        post={editorPost ?? undefined}
      />
    </div>
  )
}
