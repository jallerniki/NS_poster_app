import { NextRequest, NextResponse } from 'next/server'

/**
 * Telegram Bot API — list chats/channels where the bot is present.
 *
 * Body: { token: string }
 *
 * Calls getMe to validate the token + get the bot's username, then getUpdates
 * to collect all chats the bot has interacted with (channels it administers,
 * groups, private chats). Returns a deduplicated list sorted by type/title.
 *
 * NOTE: getUpdates only returns chats where the bot has RECEIVED a message or
 * update. For a freshly-created bot with no activity, the list will be empty —
 * the user should send any message in the channel/group first (or post via the
 * bot) so it appears here.
 */

export interface TgChat {
  id: string
  type: 'channel' | 'group' | 'supergroup' | 'private'
  title: string
  username?: string
  /** Bot's admin status in this chat (best-effort, from recent updates). */
  isMember?: boolean
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

  const api = (method: string) =>
    `https://api.telegram.org/bot${token}/${method}`

  try {
    // 1. Validate token + get bot info
    const meRes = await fetch(api('getMe'), {
      signal: AbortSignal.timeout(10_000),
    })
    const meData = await meRes.json().catch(() => null)
    if (!meRes.ok || !meData?.ok) {
      const desc = meData?.description ?? `HTTP ${meRes.status}`
      return NextResponse.json(
        { ok: false, error: `Неверный токен: ${desc}` },
        { status: 200 },
      )
    }

    const botUsername: string = meData.result?.username ?? ''

    // 2. Drop webhook if set — getUpdates is blocked while a webhook is active.
    //    (drop_pending_updates=false so we don't lose queued updates.)
    try {
      await fetch(api('deleteWebhook?drop_pending_updates=false'), {
        signal: AbortSignal.timeout(5_000),
      })
    } catch {
      // ignore — webhook may not be set
    }

    // 3. Get recent updates to collect chats
    //    Allowed_updates includes channel_post so we see channels where the
    //    bot is admin (channel posts arrive as updates to admin bots).
    //    Use timeout=0 for non-blocking + limit=100.
    const updatesRes = await fetch(api('getUpdates'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: 100,
        timeout: 0,
        allowed_updates: [
          'message',
          'channel_post',
          'edited_channel_post',
          'my_chat_member',
          'chat_member',
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    })
    const updatesData = await updatesRes.json().catch(() => null)
    const updates: Array<Record<string, unknown>> = updatesData?.result ?? []

    // 3. Collect unique chats from updates
    const chatsMap = new Map<string, TgChat>()
    for (const upd of updates) {
      const chat = extractChat(upd)
      if (!chat) continue
      if (!chatsMap.has(chat.id)) {
        chatsMap.set(chat.id, chat)
      }
    }

    // 4. Sort: channels first, then groups, then private; alphabetical by title
    const typeOrder: Record<TgChat['type'], number> = {
      channel: 0,
      group: 1,
      supergroup: 2,
      private: 3,
    }
    const chats = Array.from(chatsMap.values()).sort((a, b) => {
      const t = typeOrder[a.type] - typeOrder[b.type]
      if (t !== 0) return t
      return a.title.localeCompare(b.title, 'ru')
    })

    return NextResponse.json({
      ok: true,
      bot: {
        id: meData.result?.id,
        username: botUsername,
        firstName: meData.result?.first_name ?? '',
        canJoinGroups: meData.result?.can_join_groups ?? false,
        canReadAllGroupMessages:
          meData.result?.can_read_all_group_messages ?? false,
      },
      chats,
      hint:
        chats.length === 0
          ? 'Бот виден, но нет чатов. Добавьте бота администратором в канал/группу и отправьте туда любое сообщение — чат появится в списке.'
          : undefined,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { ok: false, error: `Не удалось связаться с Telegram: ${msg}` },
      { status: 200 },
    )
  }
}

/** Extract a TgChat from a Telegram update object. */
function extractChat(upd: Record<string, unknown>): TgChat | null {
  // Try message / channel_post / edited_channel_post / my_chat_member
  const myChatMember = upd.my_chat_member as
    | { chat?: Record<string, unknown> }
    | undefined
  const candidates: unknown[] = [
    upd.message,
    upd.channel_post,
    upd.edited_channel_post,
    upd.edited_message,
    myChatMember?.chat,
  ]
  for (const c of candidates) {
    if (c && typeof c === 'object') {
      const chat = (c as { chat?: Record<string, unknown> }).chat ?? c
      const id = (chat as Record<string, unknown>).id
      const type = (chat as Record<string, unknown>).type
      if (typeof id !== 'undefined' && typeof type === 'string') {
        const tgType = (
          ['channel', 'group', 'supergroup', 'private'].includes(type)
            ? type
            : 'private'
        ) as TgChat['type']
        const chatRec = chat as Record<string, unknown>
        return {
          id: String(id),
          type: tgType,
          title:
            (typeof chatRec.title === 'string' && chatRec.title) ||
            (typeof chatRec.username === 'string' && '@' + chatRec.username) ||
            (typeof chatRec.first_name === 'string' && chatRec.first_name) ||
            `Чат ${id}`,
          username:
            typeof chatRec.username === 'string' ? chatRec.username : undefined,
        }
      }
    }
  }
  return null
}
