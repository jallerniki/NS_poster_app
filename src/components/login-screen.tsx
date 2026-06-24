'use client'

import * as React from 'react'
import { Loader2, Lock, Globe, LogIn, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useAuth } from '@/lib/auth-store'

/**
 * Login gate shown when there is no valid WordPress JWT session.
 * Posts to /api/auth/wordpress/login which proxies nstkani.ru (or a custom site).
 */
export function LoginScreen() {
  const setSession = useAuth((s) => s.setSession)

  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!username.trim() || !password) {
      setError('Введите имя пользователя и пароль')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/wordpress/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteUrl: 'https://nstkani.ru',
          username: username.trim(),
          password,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!data || data.ok !== true) {
        const msg = (data && data.error) || 'Не удалось войти'
        setError(msg)
        toast.error(msg)
        return
      }
      setSession({
        token: data.token,
        siteUrl: data.siteUrl,
        user: {
          displayName: data.user?.displayName ?? username,
          email: data.user?.email ?? '',
          nicename: data.user?.nicename ?? username,
        },
      })
      toast.success(`Вы вошли как ${data.user?.displayName ?? username}`)
    } catch {
      const msg = 'Сеть недоступна. Попробуйте ещё раз.'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-950 via-slate-950 to-slate-900 p-4">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-teal-500/15 ring-1 ring-teal-400/30 backdrop-blur">
            <Globe className="size-7 text-teal-300" />
          </div>
          <div>
            <div className="text-xl font-semibold text-white">Пост-Менеджер</div>
            <div className="text-sm text-teal-200/70">
              Telegram · MAX · VK · WordPress
            </div>
          </div>
        </div>

        <Card className="border-slate-700/60 bg-slate-900/70 text-slate-100 shadow-2xl backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lock className="size-4 text-teal-300" />
              Вход в дашборд
            </CardTitle>
            <CardDescription className="text-slate-400">
              Авторизация через ваш WordPress-сайт (JWT).
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="user" className="text-slate-300">
                  Имя пользователя
                </Label>
                <Input
                  id="user"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  autoComplete="username"
                  className="border-slate-700 bg-slate-950/60 text-slate-100 placeholder:text-slate-500 focus-visible:ring-teal-500"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pass" className="text-slate-300">
                  Пароль
                </Label>
                <Input
                  id="pass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="border-slate-700 bg-slate-950/60 text-slate-100 placeholder:text-slate-500 focus-visible:ring-teal-500"
                />
              </div>

              {error ? (
                <div className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-200">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                  <span className="break-words">{error}</span>
                </div>
              ) : null}

              <div className="rounded-md border border-slate-700/60 bg-slate-950/40 p-2.5 text-[11px] leading-snug text-slate-400">
                Учётные данные отправляются на{' '}
                <code className="text-teal-300">https://nstkani.ru</code>
                /wp-json/jwt-auth/v1/token. Токен хранится локально в браузере.
              </div>
            </CardContent>

            <CardFooter>
              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-teal-600 text-white hover:bg-teal-500"
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <LogIn className="size-4" />
                )}
                Войти
              </Button>
            </CardFooter>
          </form>
        </Card>

        <div className="mt-4 text-center text-[11px] text-slate-500">
          © {new Date().getFullYear()} Пост-Менеджер
        </div>
      </div>
    </div>
  )
}
