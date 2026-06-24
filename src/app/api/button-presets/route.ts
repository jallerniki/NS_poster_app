import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/** GET /api/button-presets — list all button presets. */
export async function GET() {
  const presets = await db.buttonPreset.findMany({
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(presets)
}

/** POST /api/button-presets — create a new button preset. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body || !body.platform || !body.productUrl || !body.categoryUrl) {
    return NextResponse.json(
      { error: 'Укажите platform, productUrl, categoryUrl' },
      { status: 400 },
    )
  }
  const preset = await db.buttonPreset.create({
    data: {
      name: body.name || `${body.platform} — кнопки`,
      platform: body.platform,
      productLabel: body.productLabel || 'Товар',
      productUrl: body.productUrl,
      categoryLabel: body.categoryLabel || 'Категория',
      categoryUrl: body.categoryUrl,
      active: body.active ?? true,
      buttonsEnabledByDefault: body.buttonsEnabledByDefault ?? true,
    },
  })
  return NextResponse.json(preset)
}
