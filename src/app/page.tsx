'use client'

import { useStore, type DashboardSection } from '@/lib/store'
import { DashboardSection as DashboardSectionView } from '@/components/sections/dashboard-section'
import { CalendarSection } from '@/components/sections/calendar-section'
import { PlatformsSection } from '@/components/sections/platforms-section'
import { AppendicesSection } from '@/components/sections/appendices-section'
import { TemplatesSection } from '@/components/sections/templates-section'
import { ButtonsSection } from '@/components/sections/buttons-section'
import { WordPressSection } from '@/components/sections/wordpress-section'

const SECTION_LABELS: Record<DashboardSection, string> = {
  dashboard: 'Обзор',
  calendar: 'Календарь',
  platforms: 'Площадки',
  appendices: 'Приписки',
  templates: 'Шаблоны',
  buttons: 'Кнопки',
  wordpress: 'WordPress',
}

function SectionRouter({ section }: { section: DashboardSection }) {
  switch (section) {
    case 'dashboard':
      return <DashboardSectionView />
    case 'calendar':
      return <CalendarSection />
    case 'platforms':
      return <PlatformsSection />
    case 'appendices':
      return <AppendicesSection />
    case 'templates':
      return <TemplatesSection />
    case 'buttons':
      return <ButtonsSection />
    case 'wordpress':
      return <WordPressSection />
    default:
      return (
        <div className="text-muted-foreground">Раздел не выбран</div>
      )
  }
}

export default function Home() {
  const section = useStore((s) => s.section)
  return <SectionRouter section={section} />
}
