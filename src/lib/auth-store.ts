import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface WpUser {
  displayName: string
  email: string
  nicename: string
}

interface AuthState {
  /** WordPress JWT token. */
  token: string | null
  /** WordPress site URL the token belongs to. */
  siteUrl: string
  /** Display info from the login response. */
  user: WpUser | null
  /** True while the persisted token is being validated on app boot. */
  validating: boolean
  /** True when token is confirmed valid by WP. */
  authenticated: boolean

  setSession: (session: {
    token: string
    siteUrl: string
    user: WpUser
  }) => void
  setValidating: (v: boolean) => void
  setAuthenticated: (v: boolean) => void
  logout: () => void
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      siteUrl: 'https://nstkani.ru',
      user: null,
      validating: true,
      authenticated: false,
      setSession: ({ token, siteUrl, user }) =>
        set({ token, siteUrl, user, authenticated: true, validating: false }),
      setValidating: (validating) => set({ validating }),
      setAuthenticated: (authenticated) => set({ authenticated }),
      logout: () =>
        set({
          token: null,
          user: null,
          authenticated: false,
          validating: false,
        }),
    }),
    {
      name: 'post-manager-auth',
      // Persist token + user + siteUrl; keep transient flags out.
      partialize: (state) => ({
        token: state.token,
        siteUrl: state.siteUrl,
        user: state.user,
      }),
    },
  ),
)
