'use client'

import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Globe,
  KeyRound,
  User,
  Loader2,
  Plug,
  PlugZap,
  CheckCircle2,
  XCircle,
  LogOut,
  RefreshCw,
  Eye,
  EyeOff,
  ShoppingBag,
  ExternalLink,
} from 'lucide-react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-store'

// Result of a "Проверить подключение" run.
interface CheckResult {
  ok: boolean
  message: string
  productCount?: number
  sampleTitle?: string
  sampleUrl?: string | null
  sampleImage?: string | null
}

export function WordPressSection() {
  const token = useAuth((s) => s.token)
  const user = useAuth((s) => s.user)
  const siteUrl = useAuth((s) => s.siteUrl)
  const authenticated = useAuth((s) => s.authenticated)
  const setSession = useAuth((s) => s.setSession)
  const setAuthenticated = useAuth((s) => s.setAuthenticated)
  const logout = useAuth((s) => s.logout)
  const queryClient = useQueryClient()

  // Inline form state — default to the stored site URL + a fresh login/password.
  const [formSiteUrl, setFormSiteUrl] = React.useState(siteUrl || 'https://nstkani.ru')
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [checking, setChecking] = React.useState(false)
  const [result, setResult] = React.useState<CheckResult | null>(null)

  // When the session changes (e.g. after login), reset the form & result.
  React.useEffect(() => {
    if (authenticated) {
      setResult({
        ok: true,
        message: `Подключение активно: ${user?.displayName || user?.nicename || 'пользователь'}`,
      })
    } else {
      setResult(null)
    }
  }, [authenticated, user])

  const handleCheck = async () => {
    setResult(null)

    if (!formSiteUrl.trim() || !username.trim() || !password) {
      toast.error('Заполните URL, логин и пароль')
      return
    }

    setChecking(true)
    try {
      // 1. Login via WP JWT.
      const loginRes = await fetch('/api/auth/wordpress/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteUrl: formSiteUrl.trim(),
          username: username.trim(),
          password,
        }),
      })
      const loginData = await loginRes.json().catch(() => null)
      if (!loginData || loginData.ok !== true) {
        const msg = loginData?.error || 'Не удалось войти в WordPress'
        setResult({ ok: false, message: msg })
        toast.error(msg)
        return
      }

      // 2. Try to fetch products — proves the token works AND products are accessible.
      const searchRes = await fetch('/api/wordpress/products/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: loginData.token,
          siteUrl: loginData.siteUrl,
          query: '', // empty query → latest products
          perPage: 5,
        }),
      })
      const searchData = await searchRes.json().catch(() => null)

      if (!searchData || searchData.ok !== true) {
        // Token works but products fetch failed — still mark as connected.
        const msg =
          searchData?.error ||
          'Вход выполнен, но товары недоступны. Проверьте права пользователя.'
        setSession({
          token: loginData.token,
          siteUrl: loginData.siteUrl,
          user: {
            displayName: loginData.user?.displayName ?? username.trim(),
            email: loginData.user?.email ?? '',
            nicename: loginData.user?.nicename ?? username.trim(),
          },
        })
        await queryClient.invalidateQueries()
        setResult({ ok: false, message: msg })
        toast.error(msg)
        return
      }

      const products = searchData.products ?? []
      const sample = products[0]
      // 3. Save session → sidebar switches to "Активно".
      setSession({
        token: loginData.token,
        siteUrl: loginData.siteUrl,
        user: {
          displayName: loginData.user?.displayName ?? username.trim(),
          email: loginData.user?.email ?? '',
          nicename: loginData.user?.nicename ?? username.trim(),
        },
      })
      await queryClient.invalidateQueries()

      const okMsg = `Вход выполнен. Доступно товаров: ${products.length}${
        sample ? `. Пример: «${sample.title || sample.sku}»` : ''
      }`
      setResult({
        ok: true,
        message: okMsg,
        productCount: products.length,
        sampleTitle: sample?.title || sample?.sku,
        sampleUrl: sample?.permalink || sample?.link || null,
        sampleImage: sample?.featuredImageUrl ?? null,
      })
      toast.success('WordPress подключён — товары подхватываются')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Неизвестная ошибка'
      setResult({ ok: false, message: `Ошибка сети: ${msg}` })
      toast.error(msg)
    } finally {
      setChecking(false)
    }
  }

  const handleRecheck = async () => {
    // Re-validate the stored token + fetch fresh products.
    setChecking(true)
    setResult(null)
    try {
      const searchRes = await fetch('/api/wordpress/products/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          siteUrl,
          query: '',
          perPage: 5,
        }),
      })
      const searchData = await searchRes.json().catch(() => null)
      if (!searchData || searchData.ok !== true) {
        const msg = searchData?.error || 'Сессия недействительна'
        if (searchData?.error && /сессия|истекл|войдите/i.test(searchData.error)) {
          // Token expired → drop session.
          logout()
        } else {
          setAuthenticated(false)
        }
        setResult({ ok: false, message: msg })
        toast.error(msg)
        return
      }
      const products = searchData.products ?? []
      const sample = products[0]
      setResult({
        ok: true,
        message: `Подключение активно. Доступно товаров: ${products.length}${
          sample ? `. Пример: «${sample.title || sample.sku}»` : ''
        }`,
        productCount: products.length,
        sampleTitle: sample?.title || sample?.sku,
        sampleUrl: sample?.permalink || sample?.link || null,
        sampleImage: sample?.featuredImageUrl ?? null,
      })
      setAuthenticated(true)
      toast.success('Проверка пройдена — товары доступны')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Неизвестная ошибка'
      setResult({ ok: false, message: `Ошибка сети: ${msg}` })
      toast.error(msg)
    } finally {
      setChecking(false)
    }
  }

  const handleDisconnect = () => {
    logout()
    setPassword('')
    setResult(null)
    toast.success('Подключение отключено')
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Подключение к WordPress-магазину
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Войдите в ваш магазин на WordPress — дашборд сможет искать товары и
          формировать посты по шаблону. Учётные данные отправляются на ваш сайт
          через JWT.
        </p>
      </div>

      {/* Status banner */}
      <Card
        className={cn(
          'gap-0 border-l-4 py-0',
          authenticated
            ? 'border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20'
            : 'border-l-slate-300 bg-slate-50/60 dark:bg-slate-900/30',
        )}
      >
        <CardContent className="flex items-center gap-3 px-4 py-3">
          <div
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-full',
              authenticated
                ? 'bg-emerald-500/15 text-emerald-600'
                : 'bg-slate-400/15 text-slate-500',
            )}
          >
            {authenticated ? (
              <CheckCircle2 className="size-5" />
            ) : (
              <XCircle className="size-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">
                {authenticated ? 'Активно' : 'Неактивно'}
              </span>
              {authenticated && user ? (
                <Badge
                  variant="outline"
                  className="border-transparent bg-emerald-100 px-1.5 py-0 text-[10px] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                >
                  {user.displayName || user.nicename}
                </Badge>
              ) : null}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {authenticated
                ? `${siteUrl} · ${user?.email || ''}`
                : 'Введите данные для подключения'}
            </div>
          </div>
          {authenticated ? (
            <Badge
              variant="outline"
              className="shrink-0 border-transparent bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
            >
              <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-emerald-500" />
              онлайн
            </Badge>
          ) : null}
        </CardContent>
      </Card>

      {/* Connection form (always inline — no edit dialog) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="size-4 text-teal-600" />
            Данные для входа
          </CardTitle>
          <CardDescription>
            Адрес вашего WordPress-сайта, логин и пароль пользователя с правами
            на чтение товаров.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Site URL */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wp-url" className="flex items-center gap-1.5">
              <Globe className="size-3.5 text-muted-foreground" />
              Адрес WordPress-сайта
            </Label>
            <Input
              id="wp-url"
              value={formSiteUrl}
              onChange={(e) => setFormSiteUrl(e.target.value)}
              placeholder="https://example.ru"
              disabled={checking}
              autoComplete="url"
            />
          </div>

          {/* Username */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wp-user" className="flex items-center gap-1.5">
              <User className="size-3.5 text-muted-foreground" />
              Логин
            </Label>
            <Input
              id="wp-user"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              disabled={checking}
              autoComplete="username"
            />
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wp-pass" className="flex items-center gap-1.5">
              <KeyRound className="size-3.5 text-muted-foreground" />
              Пароль
            </Label>
            <div className="relative">
              <Input
                id="wp-pass"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={checking}
                autoComplete="current-password"
                className="pr-10"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !checking) {
                    e.preventDefault()
                    void handleCheck()
                  }
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
            <div className="text-xs text-muted-foreground">
              Пароль пользователя WordPress (если включён JWT Auth — обычный
              пароль учётки, плагин сам выпустит токен).
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {!authenticated ? (
              <Button
                type="button"
                onClick={handleCheck}
                disabled={checking}
                className="gap-2 bg-teal-700 text-white hover:bg-teal-700/90"
              >
                {checking ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plug className="size-4" />
                )}
                Проверить подключение
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRecheck}
                  disabled={checking}
                  className="gap-2"
                >
                  {checking ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  Проверить снова
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleDisconnect}
                  disabled={checking}
                  className="gap-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                >
                  <LogOut className="size-4" />
                  Отключить
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Result / verification output */}
      {checking ? (
        <Card>
          <CardContent className="flex items-center gap-3 px-4 py-4">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </CardContent>
        </Card>
      ) : result ? (
        <Card
          className={cn(
            'gap-0 border-l-4',
            result.ok
              ? 'border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20'
              : 'border-l-rose-500 bg-rose-50/40 dark:bg-rose-950/20',
          )}
        >
          <CardContent className="flex items-start gap-3 px-4 py-4">
            <div
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-full',
                result.ok
                  ? 'bg-emerald-500/15 text-emerald-600'
                  : 'bg-rose-500/15 text-rose-600',
              )}
            >
              {result.ok ? (
                <CheckCircle2 className="size-5" />
              ) : (
                <XCircle className="size-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'text-sm font-semibold',
                    result.ok ? 'text-emerald-700' : 'text-rose-700',
                  )}
                >
                  {result.ok ? 'Проверка пройдена' : 'Проверка не пройдена'}
                </span>
                {typeof result.productCount === 'number' ? (
                  <Badge
                    variant="outline"
                    className="gap-1 border-transparent bg-emerald-100 px-1.5 py-0 text-[10px] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                  >
                    <ShoppingBag className="size-2.5" />
                    {result.productCount} товаров
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {result.message}
              </p>

              {/* Sample product preview */}
              {result.ok && result.sampleTitle ? (
                <div className="mt-3 flex items-center gap-3 rounded-md border bg-card p-2.5">
                  {result.sampleImage ? (
                    <img
                      src={result.sampleImage}
                      alt={result.sampleTitle}
                      className="size-12 shrink-0 rounded object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="flex size-12 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                      <ShoppingBag className="size-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {result.sampleTitle}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      Первый найденный товар — товары подхватываются корректно.
                    </div>
                  </div>
                  {result.sampleUrl ? (
                    <a
                      href={result.sampleUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label="Открыть товар на сайте"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Footer hint */}
      <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
        <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
          <PlugZap className="size-3.5 text-teal-600" />
          Как это работает
        </div>
        После успешной проверки дашборд сможет искать товары в вашем магазине
        (через <code>/wp-json/wp/v2/product</code>) и подставлять их в посты по
        шаблону — с фото, ценой и описанием. Выйти из аккаунта можно в любой
        момент кнопкой «Отключить».
      </div>
    </div>
  )
}
