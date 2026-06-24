import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const sources = await db.wordPressSource.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(sources)
  } catch (error) {
    console.error('[api/wordpress GET]', error)
    return NextResponse.json({ error: 'Failed to load sources' }, { status: 500 })
  }
}

interface CreateSourceBody {
  name?: string
  siteUrl?: string
  username?: string
  appPassword?: string
  customFields?: string[]
  postType?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateSourceBody
    const { name, siteUrl, username, appPassword, customFields, postType } = body ?? {}

    if (!name || !siteUrl || !username || !appPassword) {
      return NextResponse.json(
        { error: 'name, siteUrl, username, appPassword are required' },
        { status: 400 }
      )
    }

    const created = await db.wordPressSource.create({
      data: {
        name,
        siteUrl,
        username,
        appPassword,
        customFields: customFields ? JSON.stringify(customFields) : null,
        postType: postType ?? 'product',
      },
    })
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    console.error('[api/wordpress POST]', error)
    return NextResponse.json({ error: 'Failed to create source' }, { status: 500 })
  }
}
