'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'

import { LoginScreen } from '@/components/login-screen'
import { AppShell } from '@/components/app-shell'
import { useAuth } from '@/lib/auth-store'

/**
 * Top-level auth gate.
 *
 * On mount, validates the persisted WordPress JWT token (if any):
 *   - token valid → render the dashboard (AppShell)
 *   - token invalid / missing → render the LoginScreen
 * While validating, render a splash loader.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const token = useAuth((s) => s.token)
  const validating = useAuth((s) => s.validating)
  const setValidating = useAuth((s) => s.setValidating)
  const setAuthenticated = useAuth((s) => s.setAuthenticated)
  const logout = useAuth((s) => s.logout)
  const siteUrl = useAuth((s) => s.siteUrl)

  // Validate the persisted token once on mount.
  const didValidate = React.useRef(false)
  React.useEffect(() => {
    if (didValidate.current) return
    didValidate.current = true

    if (!token) {
      setValidating(false)
      setAuthenticated(false)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/auth/wordpress/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, siteUrl }),
        })
        const data = await res.json().catch(() => null)
        if (cancelled) return
        if (data?.ok === true) {
          setAuthenticated(true)
        } else {
          // Token expired/invalid — drop the session.
          logout()
        }
      } catch {
        if (!cancelled) {
          // Network error — keep the token but mark not-confirmed so user sees app.
          setAuthenticated(false)
        }
      } finally {
        if (!cancelled) setValidating(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [token, siteUrl, setValidating, setAuthenticated, logout])

  // Splash while checking the stored token.
  if (token && validating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-950 via-slate-950 to-slate-900">
        <div className="flex flex-col items-center gap-3 text-teal-200">
          <Loader2 className="size-6 animate-spin text-teal-300" />
          <div className="text-sm">Проверка подключения к WordPress…</div>
        </div>
      </div>
    )
  }

  // No token / invalid token → login screen.
  if (!token) {
    return <LoginScreen />
  }

  // Valid session → dashboard.
  return <AppShell>{children}</AppShell>
}
