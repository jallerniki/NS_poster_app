import { NextRequest, NextResponse } from 'next/server'

/**
 * MAX Bot API — resolve a chat by ID via /chats/<chatId>.
 *
 * Body: { token: string, chatId: string }
 *
 * MAX uses ?access_token=<token> query param. The /chats/<id> endpoint returns
 * info about a specific chat the bot is a member of.
 */

export interface ResolvedMaxChat {
  id: string
  type: 'channel' | 'group' | 'private' | 'dialog'
  title: string
  link?: string
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    token?: string
    chatId?: string
  } | null

  const token = body?.token?.trim()
  const chatId = body?.chatId?.trim() ?? ''

  if (!token) {
    return NextResponse.json(
      { ok: false, error: 'Укажите токен бота' },
      { status: 200 },
    )
  }
  if (!chatId) {
    return NextResponse.json(
      { ok: false, error: 'Укажите ID чата' },
      { status: 200 },
    )
  }

  const base = 'https://botapi.max.ru'
  const auth = `access_token=${encodeURIComponent(token)}`

  try {
    const res = await fetch(`${base}/chats/${encodeURIComponent(chatId)}?${auth}`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => null)
      const msg =
        err?.message ||
        (res.status === 404
          ? 'Чат не найден — добавьте бота в чат MAX сначала'
          : `HTTP ${res.status}`)
      return NextResponse.json(
        { ok: false, error: msg },
        { status: 200 },
      )
    }
    const chat = (await res.json()) as Record<string, unknown>
    const type = typeof chat.type === 'string' ? chat.type : 'group'
    return NextResponse.json({
      ok: true,
      chat: {
        id: String(chat.chat_id ?? chat.id ?? chatId),
        type: (['channel', 'group', 'private', 'dialog'].includes(type)
          ? type
          : 'group') as ResolvedMaxChat['type'],
        title:
          (typeof chat.title === 'string' && chat.title) ||
          (typeof chat.username === 'string' && '@' + chat.username) ||
          (typeof chat.name === 'string' && chat.name) ||
          `Чат ${chatId}`,
        link: typeof chat.link === 'string' ? chat.link : undefined,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { ok: false, error: `Не удалось связаться с MAX: ${msg}` },
      { status: 200 },
    )
  }
}
