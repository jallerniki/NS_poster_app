import { NextRequest, NextResponse } from 'next/server'

/**
 * MAX messenger Bot API — list chats where the bot is present.
 *
 * Body: { token: string }
 *
 * MAX Bot API (https://dev.max.ru/docs) uses base URL https://botapi.max.ru
 * with the token passed as ?access_token=<token> query param (NOT in the path).
 *
 * Methods used:
 *   - GET /me?access_token=…           → bot info (validates token)
 *   - GET /chats?access_token=…         → all chats the bot is a member of
 *   - GET /messages?access_token=…      → recent messages (fallback)
 *
 * The /chats endpoint is the MAX-native way to list chats — it returns all
 * chats where the bot is present, without needing recent activity.
 */

export interface MaxChat {
  id: string
  type: 'channel' | 'group' | 'private' | 'dialog'
  title: string
  /** Public link if available. */
  link?: string
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    token?: string
  } | null

  const token = body?.token?.trim()
  if (!token) {
    return NextResponse.json(
      { ok: false, error: 'Укажите токен бота' },
      { status: 200 },
    )
  }

  const base = 'https://botapi.max.ru'
  const auth = `access_token=${encodeURIComponent(token)}`

  try {
    // 1. Validate token + get bot info via /me
    const meRes = await fetch(`${base}/me?${auth}`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!meRes.ok) {
      const meErr = await meRes.json().catch(() => null)
      const msg =
        meErr?.message ||
        (meRes.status === 401
          ? 'Неверный токен MAX бота'
          : `HTTP ${meRes.status}`)
      return NextResponse.json(
        { ok: false, error: msg },
        { status: 200 },
      )
    }
    const meData = (await meRes.json()) as {
      name?: string
      username?: string
      first_name?: string
    }
    const botName: string =
      meData.name || meData.username || meData.first_name || 'бот'

    // 2. Get all chats the bot is a member of via /chats
    let chats: MaxChat[] = []
    try {
      const chatsRes = await fetch(`${base}/chats?${auth}`, {
        signal: AbortSignal.timeout(10_000),
      })
      if (chatsRes.ok) {
        const chatsData = (await chatsRes.json()) as
          | Array<Record<string, unknown>>
          | Record<string, unknown>
        const list: Array<Record<string, unknown>> = Array.isArray(chatsData)
          ? chatsData
          : (Array.isArray((chatsData as { chats?: unknown }).chats)
              ? (chatsData as { chats: Array<Record<string, unknown>> }).chats
              : Array.isArray((chatsData as { result?: unknown }).result)
                ? (chatsData as { result: Array<Record<string, unknown>> }).result
                : [])
        chats = list.map(mapMaxChat).filter((c): c is MaxChat => c !== null)
      }
    } catch {
      // /chats not available — fall back to /messages
    }

    // 3. Fallback: /messages if /chats returned nothing
    if (chats.length === 0) {
      try {
        const msgRes = await fetch(
          `${base}/messages?${auth}&count=100`,
          { signal: AbortSignal.timeout(10_000) },
        )
        if (msgRes.ok) {
          const msgData = (await msgRes.json()) as
            | Array<Record<string, unknown>>
            | Record<string, unknown>
          const arr: Array<Record<string, unknown>> = Array.isArray(msgData)
            ? msgData
            : (Array.isArray((msgData as { messages?: unknown }).messages)
                ? (msgData as { messages: Array<Record<string, unknown>> }).messages
                : Array.isArray((msgData as { result?: unknown }).result)
                  ? (msgData as { result: Array<Record<string, unknown>> }).result
                  : [])
          const seen = new Map<string, MaxChat>()
          for (const m of arr) {
            const chat = extractMaxChatFromMessage(m)
            if (chat && !seen.has(chat.id)) seen.set(chat.id, chat)
          }
          chats = Array.from(seen.values())
        }
      } catch {
        // ignore
      }
    }

    // 4. Sort: channels first, then groups, then dialogs
    const typeOrder: Record<MaxChat['type'], number> = {
      channel: 0,
      group: 1,
      dialog: 2,
      private: 3,
    }
    chats.sort((a, b) => {
      const t = typeOrder[a.type] - typeOrder[b.type]
      if (t !== 0) return t
      return a.title.localeCompare(b.title, 'ru')
    })

    return NextResponse.json({
      ok: true,
      bot: { name: botName },
      chats,
      hint:
        chats.length === 0
          ? 'Бот виден, но нет чатов. Добавьте бота в чат/канал MAX и отправьте туда сообщение — чат появится в списке.'
          : undefined,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { ok: false, error: `Не удалось связаться с MAX: ${msg}` },
      { status: 200 },
    )
  }
}

function mapMaxChat(c: Record<string, unknown>): MaxChat | null {
  const id = c.chat_id ?? c.id ?? c.peer_id
  if (id === undefined && id !== 0) return null
  const type = typeof c.type === 'string' ? c.type : 'group'
  const title =
    (typeof c.title === 'string' && c.title) ||
    (typeof c.username === 'string' && '@' + c.username) ||
    (typeof c.name === 'string' && c.name) ||
    `Чат ${id}`
  return {
    id: String(id),
    type: (['channel', 'group', 'private', 'dialog'].includes(type)
      ? type
      : 'group') as MaxChat['type'],
    title,
    link: typeof c.link === 'string' ? c.link : undefined,
  }
}

function extractMaxChatFromMessage(m: Record<string, unknown>): MaxChat | null {
  const chat = m.chat ?? m.recipient ?? m.sender
  if (chat && typeof chat === 'object') {
    return mapMaxChat(chat as Record<string, unknown>)
  }
  return null
}
