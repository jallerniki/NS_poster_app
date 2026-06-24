import { NextRequest, NextResponse } from 'next/server'

/**
 * WordPress JWT login proxy.
 *
 * Forwards { siteUrl, username, password } to the WP jwt-auth token endpoint
 * and returns the token + user info on success. Kept server-side to avoid CORS
 * and to keep the WP site URL handling centralized.
 *
 * Body: { siteUrl?: string, username: string, password: string }
 *   siteUrl defaults to https://nstkani.ru
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'Укажите username и password' },
        { status: 400 },
      )
    }

    const rawSite = typeof body.siteUrl === 'string' ? body.siteUrl.trim() : ''
    const siteUrl = rawSite || 'https://nstkani.ru'
    const normalizedSite = siteUrl.replace(/\/+$/, '')
    const endpoint = `${normalizedSite}/wp-json/jwt-auth/v1/token`

    const wpRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: body.username, password: body.password }),
      signal: AbortSignal.timeout(15_000),
    })

    const data = await wpRes.json().catch(() => null)

    if (!wpRes.ok) {
      // WP returns { code, message, data: { status } } on failure.
      const message =
        (data && typeof data.message === 'string' && data.message) ||
        `WordPress: HTTP ${wpRes.status}`
      return NextResponse.json(
        { ok: false, error: stripHtml(message) },
        { status: 200 }, // 200 so the client can read the message easily
      )
    }

    if (!data || typeof data.token !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'Некорректный ответ WordPress' },
        { status: 502 },
      )
    }

    return NextResponse.json({
      ok: true,
      token: data.token,
      siteUrl: normalizedSite,
      user: {
        email: data.user_email ?? '',
        nicename: data.user_nicename ?? '',
        displayName: data.user_display_name ?? body.username,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Неизвестная ошибка'
    return NextResponse.json(
      { ok: false, error: `Не удалось связаться с WordPress: ${message}` },
      { status: 502 },
    )
  }
}

/** WP error messages ship with <strong>…</strong> HTML — strip it for clean UI. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '').trim()
}
