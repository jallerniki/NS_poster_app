import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const preset = await db.buttonPreset.findUnique({ where: { id } })
  if (!preset) {
    return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
  }
  return NextResponse.json(preset)
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Пустое тело' }, { status: 400 })
  }
  const preset = await db.buttonPreset.update({
    where: { id },
    data: {
      name: body.name,
      platform: body.platform,
      productLabel: body.productLabel,
      productUrl: body.productUrl,
      categoryLabel: body.categoryLabel,
      categoryUrl: body.categoryUrl,
      active: body.active,
      buttonsEnabledByDefault: body.buttonsEnabledByDefault,
    },
  })
  return NextResponse.json(preset)
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  await db.buttonPreset.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
