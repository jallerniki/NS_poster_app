import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const source = await db.wordPressSource.findUnique({ where: { id } })
    if (!source) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json(source)
  } catch (error) {
    console.error('[api/wordpress/[id] GET]', error)
    return NextResponse.json({ error: 'Failed to load source' }, { status: 500 })
  }
}

interface UpdateSourceBody {
  name?: string
  siteUrl?: string
  username?: string
  appPassword?: string
  customFields?: string[]
  postType?: string
  active?: boolean
  lastSyncAt?: string
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = (await request.json()) as UpdateSourceBody
    const { name, siteUrl, username, appPassword, customFields, postType, active, lastSyncAt } =
      body ?? {}

    const existing = await db.wordPressSource.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const updated = await db.wordPressSource.update({
      where: { id },
      data: {
        name: name ?? existing.name,
        siteUrl: siteUrl ?? existing.siteUrl,
        username: username ?? existing.username,
        appPassword: appPassword ?? existing.appPassword,
        customFields:
          customFields === undefined
            ? existing.customFields
            : Array.isArray(customFields)
              ? JSON.stringify(customFields)
              : null,
        postType: postType ?? existing.postType,
        active: typeof active === 'boolean' ? active : existing.active,
        lastSyncAt: lastSyncAt === undefined ? existing.lastSyncAt : lastSyncAt ? new Date(lastSyncAt) : null,
      },
    })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('[api/wordpress/[id] PUT]', error)
    return NextResponse.json({ error: 'Failed to update source' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const existing = await db.wordPressSource.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await db.wordPressSource.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/wordpress/[id] DELETE]', error)
    return NextResponse.json({ error: 'Failed to delete source' }, { status: 500 })
  }
}
