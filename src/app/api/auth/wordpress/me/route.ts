import { NextRequest, NextResponse } from 'next/server'

/**
 * Fetch the current WP user profile using a stored JWT token.
 *
 * Hits /wp-json/wp/v2/users/me with the Bearer token and returns a compact
 * user object { id, name, email, slug, avatar_url? }. Used to show "онлайн"
 * context and the account name in the sidebar.
 *
 * Body: { token: string, siteUrl?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body.token !== 'string') {
      return NextResponse.json({ ok: false, error: 'Нет токена' }, { status: 400 })
    }

    const rawSite = typeof body.siteUrl === 'string' ? body.siteUrl.trim() : ''
    const siteUrl = (rawSite || 'https://nstkani.ru').replace(/\/+$/, '')
    const endpoint = `${siteUrl}/wp-json/wp/v2/users/me?context=edit`

    const wpRes = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${body.token}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!wpRes.ok) {
      return NextResponse.json(
        { ok: false, error: `WordPress: HTTP ${wpRes.status}` },
        { status: 200 },
      )
    }

    const u = await wpRes.json().catch(() => null)
    if (!u || typeof u.id !== 'number') {
      return NextResponse.json({ ok: false, error: 'Некорректный ответ' }, { status: 502 })
    }

    const avatarUrl =
      Array.isArray(u.avatar_urls) && u.avatar_urls.length > 0
        ? u.avatar_urls[u.avatar_urls.length - 1]?.url
        : typeof u.avatar_urls === 'object' && u.avatar_urls
          ? Object.values(u.avatar_urls).pop()
          : undefined

    return NextResponse.json({
      ok: true,
      user: {
        id: u.id,
        name: u.name ?? u.username ?? 'Пользователь',
        username: u.username ?? u.slug ?? '',
        email: u.email ?? '',
        slug: u.slug ?? '',
        avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : undefined,
        roles: Array.isArray(u.roles) ? u.roles : [],
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
