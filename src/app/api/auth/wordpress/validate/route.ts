import { NextRequest, NextResponse } from 'next/server'

/**
 * Validate a stored WordPress JWT token.
 *
 * Body: { token: string, siteUrl?: string }
 * Returns { ok: true } when WP confirms the token, { ok: false } otherwise.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body.token !== 'string') {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    const rawSite = typeof body.siteUrl === 'string' ? body.siteUrl.trim() : ''
    const siteUrl = (rawSite || 'https://nstkani.ru').replace(/\/+$/, '')
    const endpoint = `${siteUrl}/wp-json/jwt-auth/v1/token/validate`

    const wpRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${body.token}`,
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!wpRes.ok) {
      return NextResponse.json({ ok: false }, { status: 200 })
    }

    const data = await wpRes.json().catch(() => null)
    // WP returns { code: "jwt_auth_valid_token", data: { status: 200 } } on success.
    const valid =
      data?.code === 'jwt_auth_valid_token' ||
      data?.data?.status === 200 ||
      wpRes.status === 200

    return NextResponse.json({ ok: !!valid }, { status: 200 })
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
