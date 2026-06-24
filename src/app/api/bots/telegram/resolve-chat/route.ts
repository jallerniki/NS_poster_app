import { NextRequest, NextResponse } from 'next/server'

/**
 * Telegram Bot API — resolve a chat by @username or numeric ID via getChat.
 *
 * Body: { token: string, chatId: string }
 *   chatId can be "@channel_username", "channel_username", or "-100xxxxxxxxxx".
 *
 * Returns the chat info if the bot can see it (admin/member), or an error.
 * Used as a fallback when getUpdates doesn't list a channel the bot administers.
 */

export interface ResolvedChat {
  id: string
  type: 'channel' | 'group' | 'supergroup' | 'private'
  title: string
  username?: string
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    token?: string
    chatId?: string
  } | null

  const token = body?.token?.trim()
  const rawChatId = body?.chatId?.trim() ?? ''

  if (!token) {
    return NextResponse.json(
      { ok: false, error: 'Укажите токен бота' },
      { status: 200 },
    )
  }
  if (!rawChatId) {
    return NextResponse.json(
      { ok: false, error: 'Укажите @username или ID канала' },
      { status: 200 },
    )
  }

  // Normalize: ensure @username starts with @, keep numeric IDs as-is.
  const chatId = rawChatId.startsWith('@') || /^-?\d+$/.test(rawChatId)
    ? rawChatId
    : `@${rawChatId}`

  const endpoint = `https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chatId)}`

  try {
    const res = await fetch(endpoint, {
      signal: AbortSignal.timeout(10_000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.ok) {
      const desc = data?.description ?? `HTTP ${res.status}`
      return NextResponse.json(
        {
          ok: false,
          error: `Не удалось найти канал: ${desc}. Убедитесь, что бот добавлен администратором в канал.`,
        },
        { status: 200 },
      )
    }

    const chat = data.result as Record<string, unknown>
    const type = typeof chat.type === 'string' ? chat.type : 'private'
    const tgType = (
      ['channel', 'group', 'supergroup', 'private'].includes(type)
        ? type
        : 'private'
    ) as ResolvedChat['type']

    return NextResponse.json({
      ok: true,
      chat: {
        id: String(chat.id),
        type: tgType,
        title:
          (typeof chat.title === 'string' && chat.title) ||
          (typeof chat.username === 'string' && '@' + chat.username) ||
          (typeof chat.first_name === 'string' && chat.first_name) ||
          `Чат ${chat.id}`,
        username:
          typeof chat.username === 'string' ? chat.username : undefined,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { ok: false, error: `Не удалось связаться с Telegram: ${msg}` },
      { status: 200 },
    )
  }
}
