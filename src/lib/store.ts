import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PostForEdit } from '@/components/sections/post-helpers'

export type DashboardSection =
  | 'dashboard'
  | 'calendar'
  | 'platforms'
  | 'appendices'
  | 'templates'
  | 'buttons'
  | 'wordpress'

interface AppState {
  section: DashboardSection
  setSection: (section: DashboardSection) => void
  /** Global post-editor dialog state. */
  editorOpen: boolean
  /** Post being edited, or null when creating a new post. */
  editorPost: PostForEdit | null
  /** Open the editor. Pass a post to edit it; omit to create a new one. */
  openEditor: (post?: PostForEdit | null) => void
  closeEditor: () => void
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      section: 'dashboard',
      setSection: (section) => set({ section }),
      editorOpen: false,
      editorPost: null,
      openEditor: (post = null) => set({ editorOpen: true, editorPost: post }),
      closeEditor: () => set({ editorOpen: false }),
    }),
    {
      name: 'post-manager-store',
      // Only persist the active section — keep ephemeral UI state out of storage
      partialize: (state) => ({ section: state.section }),
    },
  ),
)
