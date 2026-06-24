/**
 * Publishing core — pure platform senders (no DB access).
 *
 * Used by:
 *   - src/lib/publish-service.ts  (orchestration: loads post/targets from DB,
 *     composes text, calls these senders, writes status back)
 *   - Manual publish route + automated worker both go through publish-service.
 *
 * Supported platforms:
 *   - telegram  → Bot API (sendMessage / sendPhoto / sendMediaGroup)
 *   - max       → MAX Bot API (uploads + messages)
 *   - vk        → VK API (photos.getWallUploadServer → saveWallPhoto → wall.post)
 *
 * Markdown links [text](url) are converted to HTML for Telegram & VK;
 * kept as plain text for MAX.
 */

import fs from 'node:fs/promises'
import path from 'node:path'

export interface PlatformAccountLite {
  platform: string
  token: string
  targetId: string | null
  name: string
}

export interface PublishOutcome {
  messageId: string
}

export interface ButtonPresetData {
  productLabel: string
  productUrl: string
  categoryLabel: string
  categoryUrl: string
}

const TG_TIMEOUT = 20_000
const TG_PHOTO_TIMEOUT = 30_000
const TG_GROUP_TIMEOUT = 60_000
const MAX_TIMEOUT = 20_000

/** Dispatch to the right platform sender. */
export async function publishToPlatform(
  account: PlatformAccountLite,
  text: string,
  photos: string[],
  productMeta: Record<string, unknown>,
  buttonPreset: ButtonPresetData | null,
): Promise<PublishOutcome> {
  switch (account.platform) {
    case 'telegram':
      return publishToTelegram(account.token, account.targetId, text, photos, productMeta, buttonPreset)
    case 'max':
      return publishToMax(account.token, account.targetId, text, photos, productMeta, buttonPreset)
    case 'vk':
      return publishToVK(account.token, account.targetId, text, photos, productMeta)
    default:
      throw new Error(`Неизвестная платформа: ${account.platform}`)
  }
}

// ── Telegram ──────────────────────────────────────────────────────────────────

export async function publishToTelegram(
  token: string,
  chatId: string | null,
  text: string,
  photos: string[],
  productMeta: Record<string, unknown>,
  buttonPreset: ButtonPresetData | null,
): Promise<PublishOutcome> {
  if (!chatId) throw new Error('Не указан ID чата/канала')
  const base = `https://api.telegram.org/bot${token}`

  const htmlText = mdLinksToHtml(text)

  if (photos.length > 0) {
    const allPhotos = photos.slice(0, 10)
    const caption = htmlText.slice(0, 1024)

    const photoParts = await Promise.all(
      allPhotos.map((url, i) => resolvePhotoForUpload(url, `photo${i}`)),
    )

    // Single photo → sendPhoto with inline buttons.
    if (allPhotos.length === 1) {
      const replyMarkup = buildTelegramReplyMarkup(productMeta, buttonPreset)
      const form = new FormData()
      form.append('chat_id', chatId)
      form.append('caption', caption)
      form.append('parse_mode', 'HTML')
      const part = photoParts[0]
      if (part) {
        form.append('photo', part.data, part.filename)
      } else {
        form.append('photo', allPhotos[0])
      }
      if (replyMarkup) form.append('reply_markup', JSON.stringify(replyMarkup))

      let res = await fetch(`${base}/sendPhoto`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(TG_PHOTO_TIMEOUT),
      })
      let data = await res.json().catch(() => null)

      // Fallback to plain caption if HTML failed.
      if (!res.ok || !data?.ok) {
        const form2 = new FormData()
        form2.append('chat_id', chatId)
        form2.append('caption', text.slice(0, 1024))
        const part2 = photoParts[0]
        if (part2) {
          form2.append('photo', part2.data, part2.filename)
        } else {
          form2.append('photo', allPhotos[0])
        }
        if (replyMarkup) form2.append('reply_markup', JSON.stringify(replyMarkup))
        res = await fetch(`${base}/sendPhoto`, {
          method: 'POST',
          body: form2,
          signal: AbortSignal.timeout(TG_PHOTO_TIMEOUT),
        })
        data = await res.json().catch(() => null)
      }

      if (!res.ok || !data?.ok) {
        throw new Error(`Telegram: ${data?.description ?? `HTTP ${res.status}`}`)
      }
      return { messageId: String(data.result?.message_id ?? '') }
    }

    // Multiple photos → sendMediaGroup (album). Buttons go as a separate message.
    const mediaArr: Array<Record<string, unknown>> = []
    for (let i = 0; i < allPhotos.length; i++) {
      const part = photoParts[i]
      const attachName = part ? `attach://${part.field}` : allPhotos[i]
      mediaArr.push({
        type: 'photo',
        media: attachName,
        caption: i === 0 ? caption : undefined,
        parse_mode: 'HTML',
      })
    }

    const groupForm = new FormData()
    groupForm.append('chat_id', chatId)
    groupForm.append('media', JSON.stringify(mediaArr))
    for (const p of photoParts) {
      if (p) groupForm.append(p.field, p.data, p.filename)
    }

    let res = await fetch(`${base}/sendMediaGroup`, {
      method: 'POST',
      body: groupForm,
      signal: AbortSignal.timeout(TG_GROUP_TIMEOUT),
    })
    let data = await res.json().catch(() => null)

    // Fallback to plain caption.
    if (!res.ok || !data?.ok) {
      const plainCaption = text.slice(0, 1024)
      const mediaArr2: Array<Record<string, unknown>> = []
      const groupForm2 = new FormData()
      for (let i = 0; i < allPhotos.length; i++) {
        const part = photoParts[i]
        const attachName = part ? `attach://${part.field}` : allPhotos[i]
        mediaArr2.push({
          type: 'photo',
          media: attachName,
          caption: i === 0 ? plainCaption : undefined,
        })
        if (part) groupForm2.append(part.field, part.data, part.filename)
      }
      groupForm2.append('chat_id', chatId)
      groupForm2.append('media', JSON.stringify(mediaArr2))
      res = await fetch(`${base}/sendMediaGroup`, {
        method: 'POST',
        body: groupForm2,
        signal: AbortSignal.timeout(TG_GROUP_TIMEOUT),
      })
      data = await res.json().catch(() => null)
    }

    if (!res.ok || !data?.ok) {
      throw new Error(`Telegram: ${data?.description ?? `HTTP ${res.status}`}`)
    }
    const resultArr = Array.isArray(data.result) ? data.result : [data.result]
    const msgId = String(resultArr[0]?.message_id ?? '')
    await sendTelegramButtons(token, chatId, productMeta, buttonPreset)
    return { messageId: msgId }
  }

  // No photo → text message (with inline buttons if available).
  const replyMarkup = buildTelegramReplyMarkup(productMeta, buttonPreset)
  let res = await fetch(`${base}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: htmlText,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
    signal: AbortSignal.timeout(TG_TIMEOUT),
  })
  let data = await res.json().catch(() => null)
  if (!res.ok || !data?.ok) {
    res = await fetch(`${base}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4096),
        disable_web_page_preview: false,
      }),
      signal: AbortSignal.timeout(TG_TIMEOUT),
    })
    data = await res.json().catch(() => null)
  }
  if (!res.ok || !data?.ok) {
    throw new Error(`Telegram: ${data?.description ?? `HTTP ${res.status}`}`)
  }
  return { messageId: String(data.result?.message_id ?? '') }
}

// ── MAX ───────────────────────────────────────────────────────────────────────

export async function publishToMax(
  token: string,
  chatId: string | null,
  text: string,
  photos: string[],
  productMeta: Record<string, unknown>,
  buttonPreset: ButtonPresetData | null,
): Promise<PublishOutcome> {
  if (!chatId) throw new Error('Не указан ID чата')
  const botBase = 'https://botapi.max.ru'
  const msgBase = 'https://botapi.max.ru'
  const auth = `access_token=${encodeURIComponent(token)}`
  const chatParam = `&chat_id=${encodeURIComponent(chatId)}`

  const maxAttachments: Array<Record<string, unknown>> = []
  const inlineKeyboard = buildMaxInlineKeyboard(productMeta, buttonPreset)
  if (inlineKeyboard) maxAttachments.push(inlineKeyboard)

  // Upload each photo to MAX (two-step) and attach.
  for (const photoUrl of photos.slice(0, 10)) {
    let attachmentToken: string | null = null
    try {
      const part = await resolvePhotoForUpload(photoUrl, 'photo')
      if (part) {
        const upRes = await fetch(`${botBase}/uploads?${auth}&type=image`, {
          method: 'POST',
          signal: AbortSignal.timeout(15_000),
        })
        const upData = await upRes.json().catch(() => null)
        if (upRes.ok && upData?.url) {
          const uploadForm = new FormData()
          uploadForm.append('image', part.data, part.filename)
          const imgRes = await fetch(upData.url, {
            method: 'POST',
            body: uploadForm,
            signal: AbortSignal.timeout(30_000),
          })
          const imgData = await imgRes.json().catch(() => null)
          if (imgRes.ok && imgData?.photos) {
            const photoMap = imgData.photos as Record<string, { token?: string }>
            const firstKey = Object.keys(photoMap)[0]
            if (firstKey && photoMap[firstKey]?.token) {
              attachmentToken = photoMap[firstKey].token!
            }
          }
        }
      }
    } catch {
      // non-fatal: skip this photo
    }
    if (attachmentToken) {
      maxAttachments.unshift({ type: 'image', payload: { token: attachmentToken } })
    }
  }

  const body: Record<string, unknown> = { text: text.slice(0, 4000) }
  if (maxAttachments.length > 0) body.attachments = maxAttachments

  const res = await fetch(`${msgBase}/messages?${auth}${chatParam}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(MAX_TIMEOUT),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const errMsg =
      (data as { message?: string; description?: string })?.message ||
      (data as { message?: string; description?: string })?.description ||
      `HTTP ${res.status}`
    throw new Error(`MAX: ${errMsg}`)
  }
  const msgId = String(
    (data as { message?: { body?: { mid?: string } } }).message?.body?.mid ??
      (data as { message?: { id?: string } }).message?.id ??
      '',
  )
  return { messageId: msgId }
}

// ── VK ────────────────────────────────────────────────────────────────────────

const VK_API_VERSION = '5.199'

/**
 * Publish to a VK community wall via user access token.
 * targetId = group id (without leading minus).
 *
 * Flow: for each photo → getWallUploadServer → upload → saveWallPhoto → photo<owner>_<id>,
 * then wall.post with message + attachments.
 */
export async function publishToVK(
  accessToken: string,
  groupId: string | null,
  text: string,
  photos: string[],
  _productMeta: Record<string, unknown>,
): Promise<PublishOutcome> {
  if (!groupId) throw new Error('Не указан ID сообщества ВКонтакте')
  const gid = groupId.replace(/^-/, '').trim()
  if (!accessToken) throw new Error('VK: пустой access token. Нужен пользовательский токен с правами wall, photos, groups.')

  const api = (method: string, params: Record<string, string>) =>
    `https://api.vk.com/method/${method}?${new URLSearchParams({
      ...params,
      access_token: accessToken,
      v: VK_API_VERSION,
    }).toString()}`

  // 1. Upload photos (best-effort; failed photos are skipped).
  const attachments: string[] = []
  if (photos.length > 0) {
    let uploadUrl = ''
    try {
      const usRes = await fetch(api('photos.getWallUploadServer', { group_id: gid }), {
        signal: AbortSignal.timeout(15_000),
      })
      const usData = await usRes.json().catch(() => null)
      uploadUrl = (usData?.response?.upload_url as string) ?? ''
    } catch {
      // will skip photos
    }

    if (uploadUrl) {
      for (const photoUrl of photos.slice(0, 10)) {
        try {
          const part = await resolvePhotoForUpload(photoUrl, 'photo')
          if (!part) continue
          const upForm = new FormData()
          upForm.append('photo', part.data, part.filename)
          const upRes = await fetch(uploadUrl, {
            method: 'POST',
            body: upForm,
            signal: AbortSignal.timeout(30_000),
          })
          const upData = await upRes.json().catch(() => null)
          if (!upRes.ok || !upData?.server) continue

          const saveRes = await fetch(
            api('photos.saveWallPhoto', {
              group_id: gid,
              server: String(upData.server),
              photo: typeof upData.photo === 'string' ? upData.photo : JSON.stringify(upData.photo),
              hash: String(upData.hash ?? ''),
            }),
            { signal: AbortSignal.timeout(15_000) },
          )
          const saveData = await saveRes.json().catch(() => null)
          const saved = Array.isArray(saveData?.response) ? saveData.response[0] : null
          if (saved?.owner_id && saved?.id) {
            attachments.push(`photo${saved.owner_id}_${saved.id}`)
          }
        } catch {
          // skip this photo
        }
      }
    }
  }

  // 2. wall.post (HTML links → <a>, owner_id negative = community, from_group=1).
  const htmlText = mdLinksToVkHtml(text).slice(0, 4096)
  const postParams: Record<string, string> = {
    owner_id: `-${gid}`,
    from_group: '1',
    message: htmlText,
  }
  if (attachments.length > 0) postParams.attachments = attachments.join(',')

  const res = await fetch(api('wall.post', postParams), {
    method: 'POST',
    signal: AbortSignal.timeout(20_000),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || data?.error) {
    const err = data?.error
    const msg = err?.error_msg
      ? `VK: ${err.error_msg}${err.error_code ? ` (код ${err.error_code})` : ''}`
      : `HTTP ${res.status}`
    throw new Error(msg)
  }
  const postId = String(data?.response?.post_id ?? '')
  return { messageId: postId }
}

// ── Photo resolution (shared) ─────────────────────────────────────────────────

/**
 * Resolve a photo URL to a Blob for multipart upload.
 *   /uploads/... or localhost → read from disk (public/)
 *   http(s)://... → download via fetch
 * Returns null if resolution fails.
 */
export async function resolvePhotoForUpload(
  url: string,
  field: string,
): Promise<{ field: string; data: Blob; filename: string } | null> {
  if (url.startsWith('/uploads/') || url.startsWith('/download/')) {
    try {
      const filePath = path.join(process.cwd(), 'public', url)
      const buf = await fs.readFile(filePath)
      return { field, data: new Blob([buf]), filename: path.basename(filePath) }
    } catch {
      return null
    }
  }
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    try {
      const urlObj = new URL(url)
      const filePath = path.join(process.cwd(), 'public', urlObj.pathname)
      const buf = await fs.readFile(filePath)
      return { field, data: new Blob([buf]), filename: path.basename(filePath) }
    } catch {
      return null
    }
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(20_000),
        headers: { 'User-Agent': 'PostManager/1.0' },
      })
      if (!res.ok) return null
      const buf = new Uint8Array(await res.arrayBuffer())
      const filename = url.split('/').pop()?.split('?')[0] || `photo-${Date.now()}.jpg`
      return { field, data: new Blob([buf]), filename }
    } catch {
      return null
    }
  }
  return null
}

// ── Text formatting ───────────────────────────────────────────────────────────

/**
 * Convert text to Telegram HTML: escape entities, **bold** → <b>, [text](url) → <a>.
 */
export function mdLinksToHtml(text: string): string {
  let out = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+?)\s*\)/g, '<a href="$2">$1</a>')
  return out
}

/** VK message HTML: escape + **bold** → <b>, [text](url) → <a>. */
export function mdLinksToVkHtml(text: string): string {
  return mdLinksToHtml(text)
}

// ── Inline buttons ────────────────────────────────────────────────────────────

export function buildButtonContext(
  productMeta: Record<string, unknown>,
): Record<string, string> {
  const sku = strVal(productMeta.sku) || strVal(productMeta.slug)
  const id = strVal(productMeta.id)
  const slug = strVal(productMeta.slug) || sku
  const categories = Array.isArray(productMeta.categories)
    ? (productMeta.categories as unknown[]).map((c) => strVal(c)).filter(Boolean)
    : []
  const category = categories[0] ?? ''
  const categorySlug =
    strVal(productMeta.categorySlug) ||
    (category ? category.toLowerCase().replace(/\s+/g, '-') : '')
  return { sku, id, slug, category, categorySlug }
}

export function fillTemplate(template: string, ctx: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key) => ctx[key] ?? '')
}

export function buildTelegramReplyMarkup(
  productMeta: Record<string, unknown>,
  preset: ButtonPresetData | null,
): { inline_keyboard: Array<Array<{ text: string; url: string }>> } | null {
  if (!preset) return null
  const ctx = buildButtonContext(productMeta)
  const buttons: Array<{ text: string; url: string }> = []
  const productUrl = fillTemplate(preset.productUrl, ctx)
  if (productUrl) buttons.push({ text: preset.productLabel, url: productUrl })
  const categoryUrl = fillTemplate(preset.categoryUrl, ctx)
  if (categoryUrl) buttons.push({ text: preset.categoryLabel, url: categoryUrl })
  if (buttons.length === 0) return null
  return { inline_keyboard: [buttons] }
}

export async function sendTelegramButtons(
  token: string,
  chatId: string,
  productMeta: Record<string, unknown>,
  preset: ButtonPresetData | null,
): Promise<void> {
  const replyMarkup = buildTelegramReplyMarkup(productMeta, preset)
  if (!replyMarkup) return
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: '🔗 Ссылки',
        reply_markup: replyMarkup,
      }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    // buttons are non-fatal
  }
}

export function buildMaxInlineKeyboard(
  productMeta: Record<string, unknown>,
  preset: ButtonPresetData | null,
): {
  type: string
  payload: {
    layout: string
    buttons: Array<Array<{ type: string; text: string; url: string }>>
  }
} | null {
  if (!preset) return null
  const ctx = buildButtonContext(productMeta)
  const row: Array<{ type: string; text: string; url: string }> = []
  const productUrl = fillTemplate(preset.productUrl, ctx)
  if (productUrl) row.push({ type: 'link', text: preset.productLabel, url: productUrl })
  const categoryUrl = fillTemplate(preset.categoryUrl, ctx)
  if (categoryUrl) row.push({ type: 'link', text: preset.categoryLabel, url: categoryUrl })
  if (row.length === 0) return null
  return {
    type: 'inline_keyboard',
    payload: { layout: 'INLINE_KEYBOARD_LAYOUT', buttons: [row] },
  }
}

function strVal(v: unknown): string {
  if (v == null) return ''
  if (Array.isArray(v)) return v.length > 0 ? String(v[0]) : ''
  return String(v)
}
