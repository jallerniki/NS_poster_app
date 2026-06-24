import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { safeParse } from '@/lib/social'
import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Publish a scheduled post IMMEDIATELY to one or all of its targets.
 *
 * POST /api/posts/[id]/publish
 * Body: { targetId?: string }   // omit to publish to ALL targets
 *
 * For each target: fetches the PlatformAccount, calls the right Bot API
 * (Telegram / MAX / VK) to send the message text (+ first photo as media),
 * and updates the target status + resultRef.
 *
 * Supports markdown-style links [text](url) in the post text — converted to
 * HTML <a> tags for Telegram (parse_mode=HTML), kept as plain text for MAX,
 * and converted to HTML for VK.
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = (await request.json().catch(() => null)) as {
    targetId?: string
  } | null

  const post = await db.scheduledPost.findUnique({
    where: { id },
    include: {
      targets: {
        include: { account: true },
        where: body?.targetId ? { id: body.targetId } : undefined,
      },
    },
  })

  if (!post) {
    return NextResponse.json({ ok: false, error: 'Пост не найден' }, { status: 404 })
  }

  if (post.targets.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'У поста нет целей для публикации' },
      { status: 200 },
    )
  }

  // Mark the post as "publishing".
  await db.scheduledPost.update({
    where: { id },
    data: { status: 'publishing' },
  })

  const results: Array<{
    targetId: string
    accountName: string
    platform: string
    ok: boolean
    message?: string
  }> = []

  // Publish to each target sequentially (avoid hammering APIs in parallel).
  for (const target of post.targets) {
    const account = target.account
    if (!account || !account.active) {
      results.push({
        targetId: target.id,
        accountName: account?.name ?? '—',
        platform: account?.platform ?? '?',
        ok: false,
        message: 'Площадка неактивна',
      })
      continue
    }

    // Compose the final text: post content + appendix (if any).
    let text = post.content
    if (target.appendixId) {
      const appendix = await db.appendixTemplate.findUnique({
        where: { id: target.appendixId },
      })
      if (appendix) {
        text =
          appendix.position === 'prepend'
            ? `${appendix.body}\n\n${text}`
            : `${text}${appendix.body}`
      }
    }

    const photos = safeParse<string[]>(post.mediaUrls, [])

    // Parse product metadata (sku, categories) for inline buttons.
    const productMeta = safeParse<Record<string, unknown>>(post.productMeta, {})

    // Check if the user enabled inline buttons for this post (default: true
    // when productMeta exists and attachButtons isn't explicitly false).
    const attachButtons = productMeta.attachButtons !== false

    // Find an active button preset for this platform.
    let buttonPreset: { productLabel: string; productUrl: string; categoryLabel: string; categoryUrl: string } | null = null
    if (attachButtons && (account.platform === 'telegram' || account.platform === 'max')) {
      const preset = await db.buttonPreset.findFirst({
        where: { platform: account.platform, active: true },
      })
      if (preset) {
        buttonPreset = {
          productLabel: preset.productLabel,
          productUrl: preset.productUrl,
          categoryLabel: preset.categoryLabel,
          categoryUrl: preset.categoryUrl,
        }
      }
    }

    try {
      const result = await publishToPlatform(account, text, photos, productMeta, buttonPreset)
      // Success → mark target published.
      await db.scheduledPostTarget.update({
        where: { id: target.id },
        data: {
          status: 'published',
          resultRef: result.messageId ?? null,
          publishedAt: new Date(),
          errorMessage: null,
        },
      })
      results.push({
        targetId: target.id,
        accountName: account.name,
        platform: account.platform,
        ok: true,
        message: result.messageId
          ? `Отправлено (ID: ${result.messageId})`
          : 'Отправлено',
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await db.scheduledPostTarget.update({
        where: { id: target.id },
        data: { status: 'failed', errorMessage: msg },
      })
      results.push({
        targetId: target.id,
        accountName: account.name,
        platform: account.platform,
        ok: false,
        message: msg,
      })
    }
  }

  // Update the post status based on target outcomes.
  const allOk = results.every((r) => r.ok)
  const anyOk = results.some((r) => r.ok)
  await db.scheduledPost.update({
    where: { id },
    data: {
      status: allOk ? 'published' : anyOk ? 'partial' : 'failed',
    },
  })

  return NextResponse.json({ ok: true, results })
}

/** Publish text (+ optional photo) to a platform. Returns { messageId }. */
async function publishToPlatform(
  account: {
    platform: string
    token: string
    targetId: string | null
  },
  text: string,
  photos: string[],
  productMeta: Record<string, unknown>,
  buttonPreset: { productLabel: string; productUrl: string; categoryLabel: string; categoryUrl: string } | null,
): Promise<{ messageId: string }> {
  if (account.platform === 'telegram') {
    return publishToTelegram(account.token, account.targetId, text, photos, productMeta, buttonPreset)
  }
  if (account.platform === 'max') {
    return publishToMax(account.token, account.targetId, text, photos, productMeta, buttonPreset)
  }
  if (account.platform === 'vk') {
    throw new Error('VK публикация требует отдельной настройки access token пользователя')
  }
  throw new Error(`Неизвестная платформа: ${account.platform}`)
}

/** Send via Telegram Bot API. */
async function publishToTelegram(
  token: string,
  chatId: string | null,
  text: string,
  photos: string[],
  productMeta: Record<string, unknown>,
  buttonPreset: { productLabel: string; productUrl: string; categoryLabel: string; categoryUrl: string } | null,
): Promise<{ messageId: string }> {
  if (!chatId) throw new Error('Не указан ID чата/канала')
  const base = `https://api.telegram.org/bot${token}`

  // Convert markdown links [text](url) → HTML <a href="url">text</a> for TG.
  const htmlText = mdLinksToHtml(text)
  console.log('[publish:telegram] chatId=', chatId, 'photoCount=', photos.length, 'htmlText=', htmlText.slice(0, 200))

  if (photos.length > 0) {
    // Cap at 10 (Telegram media group limit).
    const allPhotos = photos.slice(0, 10)
    const caption = htmlText.slice(0, 1024)

    // Download all photos upfront (parallel) and attach as multipart files.
    const photoParts = await Promise.all(
      allPhotos.map((url, i) => resolvePhotoForUpload(url, `photo${i}`)),
    )
    console.log('[publish:telegram] photoParts resolved:', photoParts.map((p, i) => p ? `photo${i}=OK(${p.filename})` : `photo${i}=NULL`))

    // For a SINGLE photo: use sendPhoto with reply_markup (inline buttons).
    if (allPhotos.length === 1) {
      const replyMarkup = buildTelegramReplyMarkup(productMeta, buttonPreset)
      const singleForm = new FormData()
      singleForm.append('chat_id', chatId)
      singleForm.append('caption', caption)
      singleForm.append('parse_mode', 'HTML')
      const part = photoParts[0]
      if (part) {
        singleForm.append('photo', part.data, part.filename)
      } else {
        singleForm.append('photo', allPhotos[0])
      }
      if (replyMarkup) {
        singleForm.append('reply_markup', JSON.stringify(replyMarkup))
      }

      let res = await fetch(`${base}/sendPhoto`, {
        method: 'POST',
        body: singleForm,
        signal: AbortSignal.timeout(30_000),
      })
      let data = await res.json().catch(() => null)
      console.log('[publish:telegram] sendPhoto(single) status=', res.status, 'ok=', data?.ok, 'description=', data?.description)

      // Fallback: plain caption (no HTML) if HTML failed.
      if (!res.ok || !data?.ok) {
        console.log('[publish:telegram] retrying sendPhoto with plain caption')
        const form2 = new FormData()
        form2.append('chat_id', chatId)
        form2.append('caption', text.slice(0, 1024))
        const part2 = photoParts[0]
        if (part2) {
          form2.append('photo', part2.data, part2.filename)
        } else {
          form2.append('photo', allPhotos[0])
        }
        if (replyMarkup) {
          form2.append('reply_markup', JSON.stringify(replyMarkup))
        }
        res = await fetch(`${base}/sendPhoto`, {
          method: 'POST',
          body: form2,
          signal: AbortSignal.timeout(30_000),
        })
        data = await res.json().catch(() => null)
        console.log('[publish:telegram] sendPhoto(plain) status=', res.status, 'ok=', data?.ok, 'description=', data?.description)
      }

      if (!res.ok || !data?.ok) {
        throw new Error(`Telegram: ${data?.description ?? `HTTP ${res.status}`}`)
      }
      return { messageId: String(data.result?.message_id ?? '') }
    }

    // For MULTIPLE photos: use sendMediaGroup (album). Buttons go as a separate message.
    const mediaArr: Array<Record<string, unknown>> = []
    const attachedFiles: Array<{ field: string; data: Blob; filename: string }> = []
    for (let i = 0; i < allPhotos.length; i++) {
      const part = photoParts[i]
      const attachName = part ? `attach://${part.field}` : allPhotos[i]
      mediaArr.push({
        type: 'photo',
        media: attachName,
        caption: i === 0 ? caption : undefined,
        parse_mode: 'HTML',
      })
      if (part) attachedFiles.push(part)
    }

    const groupForm = new FormData()
    groupForm.append('chat_id', chatId)
    groupForm.append('media', JSON.stringify(mediaArr))
    for (const f of attachedFiles) {
      groupForm.append(f.field, f.data, f.filename)
    }

    let res = await fetch(`${base}/sendMediaGroup`, {
      method: 'POST',
      body: groupForm,
      signal: AbortSignal.timeout(60_000),
    })
    let data = await res.json().catch(() => null)
    console.log('[publish:telegram] sendMediaGroup status=', res.status, 'ok=', data?.ok, 'description=', data?.description)

    // Fallback: if HTML caption failed, retry as plain text.
    if (!res.ok || !data?.ok) {
      console.log('[publish:telegram] retrying sendMediaGroup with plain caption')
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
        if (part) {
          groupForm2.append(part.field, part.data, part.filename)
        }
      }
      groupForm2.append('chat_id', chatId)
      groupForm2.append('media', JSON.stringify(mediaArr2))
      res = await fetch(`${base}/sendMediaGroup`, {
        method: 'POST',
        body: groupForm2,
        signal: AbortSignal.timeout(60_000),
      })
      data = await res.json().catch(() => null)
      console.log('[publish:telegram] sendMediaGroup(plain) status=', res.status, 'ok=', data?.ok, 'description=', data?.description)
    }

    if (!res.ok || !data?.ok) {
      throw new Error(`Telegram: ${data?.description ?? `HTTP ${res.status}`}`)
    }
    // sendMediaGroup returns an array of messages; take the first message_id.
    const resultArr = Array.isArray(data.result) ? data.result : [data.result]
    const msgId = String(resultArr[0]?.message_id ?? '')
    // Media groups don't support reply_markup → send buttons as a separate message.
    await sendTelegramButtons(token, chatId, productMeta, buttonPreset)
    return { messageId: msgId }
  }

  // No photo → send text message (with inline buttons if available).
  const replyMarkup = buildTelegramReplyMarkup(productMeta, buttonPreset)
  // Try HTML first; if Telegram rejects the HTML, retry as plain text.
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
    signal: AbortSignal.timeout(20_000),
  })
  let data = await res.json().catch(() => null)
  console.log('[publish:telegram] sendMessage(HTML) status=', res.status, 'ok=', data?.ok, 'description=', data?.description)
  // Fallback: if HTML parse failed, retry as plain text (strip HTML tags).
  if (!res.ok || !data?.ok) {
    const plainText = text // original text without HTML conversion
    console.log('[publish:telegram] retrying as plain text')
    res = await fetch(`${base}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: plainText.slice(0, 4096),
        disable_web_page_preview: false,
      }),
      signal: AbortSignal.timeout(20_000),
    })
    data = await res.json().catch(() => null)
    console.log('[publish:telegram] sendMessage(plain) status=', res.status, 'ok=', data?.ok, 'description=', data?.description)
  }
  if (!res.ok || !data?.ok) {
    throw new Error(`Telegram: ${data?.description ?? `HTTP ${res.status}`}`)
  }
  return { messageId: String(data.result?.message_id ?? '') }
}

/**
 * Resolve a photo URL for multipart upload to Telegram.
 * Downloads ALL photos (local + remote https://) to a Blob so Telegram
 * receives the actual file bytes — avoids "wrong type of the web page content"
 * errors that occur when Telegram's servers can't fetch the URL directly.
 *
 * - /uploads/... → read from local disk
 * - localhost → read from local disk
 * - https://... → download via fetch, return as Blob
 * Returns null only if the download fails entirely.
 */
async function resolvePhotoForUpload(
  url: string,
  field: string,
): Promise<{ field: string; data: Blob; filename: string } | null> {
  // Local upload: starts with /uploads/
  if (url.startsWith('/uploads/')) {
    try {
      const filePath = path.join(process.cwd(), 'public', url)
      const buf = await fs.readFile(filePath)
      const filename = path.basename(filePath)
      return { field, data: new Blob([buf]), filename }
    } catch {
      return null
    }
  }
  // Localhost URL — read from disk
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    try {
      const urlObj = new URL(url)
      const filePath = path.join(process.cwd(), 'public', urlObj.pathname)
      const buf = await fs.readFile(filePath)
      const filename = path.basename(filePath)
      return { field, data: new Blob([buf]), filename }
    } catch {
      return null
    }
  }
  // Public https URL — download it ourselves and upload as multipart.
  // Telegram's servers sometimes can't fetch certain URLs (SSL, user-agent,
  // HTTP/2 issues), so we always download + re-upload to be safe.
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(20_000),
        headers: { 'User-Agent': 'PostManager/1.0' },
      })
      if (!res.ok) return null
      const buf = new Uint8Array(await res.arrayBuffer())
      const filename =
        url.split('/').pop()?.split('?')[0] || `photo-${Date.now()}.jpg`
      return { field, data: new Blob([buf]), filename }
    } catch {
      return null
    }
  }
  return null
}

/** Send via MAX Bot API.
 *  MAX uses two hosts: botapi.max.ru for uploads + /me + /chats,
 *  and platform-api.max.ru for sending messages (chat_id as query param).
 */
async function publishToMax(
  token: string,
  chatId: string | null,
  text: string,
  photos: string[],
  productMeta: Record<string, unknown>,
  buttonPreset: ButtonPresetData | null,
): Promise<{ messageId: string }> {
  if (!chatId) throw new Error('Не указан ID чата')
  const botBase = 'https://botapi.max.ru'
  const msgBase = 'https://botapi.max.ru'
  const auth = `access_token=${encodeURIComponent(token)}`
  const chatParam = `&chat_id=${encodeURIComponent(chatId)}`

  // Build attachments array (inline keyboard always goes here)
  const maxAttachments: Array<Record<string, unknown>> = []
  const inlineKeyboard = buildMaxInlineKeyboard(productMeta, buttonPreset)
  if (inlineKeyboard) maxAttachments.push(inlineKeyboard)

  // Upload ALL photos to MAX (two-step per photo) and attach them.
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
    } catch (e) {
      console.log('[publish:max] photo upload failed:', e instanceof Error ? e.message : String(e))
    }
    if (attachmentToken) {
      maxAttachments.unshift({ type: 'image', payload: { token: attachmentToken } })
    }
  }

  const body: Record<string, unknown> = {
    text: text.slice(0, 4000),
  }
  if (maxAttachments.length > 0) {
    body.attachments = maxAttachments
  }

  const res = await fetch(`${msgBase}/messages?${auth}${chatParam}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })
  const data = await res.json().catch(() => null)
  console.log('[publish:max] messages status=', res.status, 'ok=', res.ok, 'data=', JSON.stringify(data).slice(0, 200))
  if (!res.ok) {
    const errMsg = (data as { message?: string; description?: string })?.message
      || (data as { message?: string; description?: string })?.description
      || `HTTP ${res.status}`
    throw new Error(`MAX: ${errMsg}`)
  }
  const msgId = String(
    (data as { message?: { body?: { mid?: string } } }).message?.body?.mid ??
      (data as { message?: { id?: string } }).message?.id ??
      '',
  )
  return { messageId: msgId }
}

/**
 * Convert text to Telegram HTML:
 * 1. Escape HTML entities (& < >) so they don't break parse_mode=HTML.
 * 2. Convert markdown **bold** → <b>…</b>
 * 3. Convert markdown [text](url) → <a href="url">text</a> (URL & in href escaped)
 *
 * Telegram HTML is strict — any unescaped < or & causes "wrong type of the web
 * page content" / "can't parse entities" errors.
 */
function mdLinksToHtml(text: string): string {
  // 1. Escape HTML entities first (before inserting our own tags).
  let out = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // 2. Convert **bold** → <b>…</b> (after escaping, the ** markers are intact).
  out = out.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')

  // 3. Convert [text](url) → <a href="url">text</a>.
  //    The URL may contain & which we escaped to &amp; in step 1 — that's
  //    actually correct for an HTML href attribute, so we leave it.
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+?)\s*\)/g,
    '<a href="$2">$1</a>',
  )

  return out
}

// ── Inline buttons helpers ───────────────────────────────────────────────────

interface ButtonPresetData {
  productLabel: string
  productUrl: string
  categoryLabel: string
  categoryUrl: string
}

/**
 * Build a Telegram reply_markup inline_keyboard with 2 buttons:
 * [Товар] [Категория]
 * Returns null if no preset or no product data.
 */
function buildTelegramReplyMarkup(
  productMeta: Record<string, unknown>,
  preset: ButtonPresetData | null,
): { inline_keyboard: Array<Array<{ text: string; url: string }>> } | null {
  if (!preset) return null
  const buttons: Array<{ text: string; url: string }> = []
  const ctx = buildButtonContext(productMeta)

  // Product button
  const productUrl = fillTemplate(preset.productUrl, ctx)
  if (productUrl) {
    buttons.push({ text: preset.productLabel, url: productUrl })
  }
  // Category button
  const categoryUrl = fillTemplate(preset.categoryUrl, ctx)
  if (categoryUrl) {
    buttons.push({ text: preset.categoryLabel, url: categoryUrl })
  }

  if (buttons.length === 0) return null
  return { inline_keyboard: [buttons] }
}

/**
 * Send a separate text message with inline buttons (used after sendMediaGroup
 * which doesn't support reply_markup).
 */
async function sendTelegramButtons(
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

/**
 * Build the template context for button URL filling.
 * Extracts sku, id, slug, category, categorySlug from productMeta.
 */
function buildButtonContext(productMeta: Record<string, unknown>): Record<string, string> {
  const sku = strVal(productMeta.sku) || strVal(productMeta.slug)
  const id = strVal(productMeta.id)
  const slug = strVal(productMeta.slug) || sku
  const categories = Array.isArray(productMeta.categories)
    ? (productMeta.categories as unknown[]).map((c) => strVal(c)).filter(Boolean)
    : []
  const category = categories[0] ?? ''
  // categorySlug: slugify the category name (lowercase, cyrillic → latin transllit not applied,
  // just lowercased + spaces→dashes). For WP, the category slug is usually available.
  const categorySlug =
    strVal(productMeta.categorySlug) ||
    (category ? category.toLowerCase().replace(/\s+/g, '-') : '')
  return { sku, id, slug, category, categorySlug }
}

function strVal(v: unknown): string {
  if (v == null) return ''
  if (Array.isArray(v)) return v.length > 0 ? String(v[0]) : ''
  return String(v)
}

/** Replace {{key}} placeholders in a template string. */
function fillTemplate(template: string, ctx: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key) => ctx[key] ?? '')
}

/**
 * Build a MAX inline_keyboard attachment object.
 * MAX format: { type: 'inline_keyboard', payload: { layout: 'INLINE_KEYBOARD_LAYOUT', buttons: [[{type:'link', text:'...', url:'...'}]] } }
 * Returns null if no preset or no product data.
 */
function buildMaxInlineKeyboard(
  productMeta: Record<string, unknown>,
  preset: ButtonPresetData | null,
): { type: string; payload: { layout: string; buttons: Array<Array<{ type: string; text: string; url: string }>> } } | null {
  if (!preset) return null
  const ctx = buildButtonContext(productMeta)
  const row: Array<{ type: string; text: string; url: string }> = []

  const productUrl = fillTemplate(preset.productUrl, ctx)
  if (productUrl) {
    row.push({ type: 'link', text: preset.productLabel, url: productUrl })
  }
  const categoryUrl = fillTemplate(preset.categoryUrl, ctx)
  if (categoryUrl) {
    row.push({ type: 'link', text: preset.categoryLabel, url: categoryUrl })
  }

  if (row.length === 0) return null
  return {
    type: 'inline_keyboard',
    payload: {
      layout: 'INLINE_KEYBOARD_LAYOUT',
      buttons: [row],
    },
  }
}
