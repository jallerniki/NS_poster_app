import { db } from '@/lib/db'

/**
 * Seed the database with demo data so the dashboard is not empty on first run.
 * Run with: bun run scripts/seed.ts
 */
async function main() {
  console.log('🌱 Seeding database...')

  // --- Platform accounts ---
  const tg = await db.platformAccount.upsert({
    where: { id: 'seed-tg-main' },
    update: {},
    create: {
      id: 'seed-tg-main',
      platform: 'telegram',
      name: 'Основной Telegram-канал',
      targetId: '-1003883298197',
      token: '8372250689:AAE8Q67HxWESi9TiRYP77phtx1A9_z5oYts',
      extra: JSON.stringify({ channelTitle: 'тестовый канал', channelUsername: 'ns_tkani_planner' }),
      active: true,
    },
  })

  const max = await db.platformAccount.upsert({
    where: { id: 'seed-max-main' },
    update: {},
    create: {
      id: 'seed-max-main',
      platform: 'max',
      name: 'MAX-бот магазина',
      targetId: '-72528171727581',
      token: 'f9LHodD0cOJUkCQKJ565ND9Xj3s8nNSGrp-8_2c09-hZZpQDd7TfJnz-2LQS64sTScLZvl4AaRGYsxKpurQg',
      extra: JSON.stringify({ channelTitle: 'Тестовый канал', channelUsername: null }),
      active: true,
    },
  })

  const vk = await db.platformAccount.upsert({
    where: { id: 'seed-vk-main' },
    update: {},
    create: {
      id: 'seed-vk-main',
      platform: 'vk',
      name: 'VK-сообщество',
      targetId: 'my_shop_group',
      token: 'vk_demo_access_token',
      extra: JSON.stringify({ groupId: '123456', apiVersion: '5.199' }),
      active: true,
    },
  })

  // --- Appendix templates (per-platform приписки) ---
  const appendices = [
    {
      id: 'seed-apx-tg-1',
      platform: 'telegram',
      name: 'Telegram — хештеги',
      body: '\n\n#нашмагазин #распродажа #товары',
      position: 'append',
      category: 'Хештеги',
    },
    {
      id: 'seed-apx-tg-2',
      platform: 'telegram',
      name: 'Telegram — заказ',
      body: '📲 Заказать: @shop_manager\n💳 Оплата картой / СБП',
      position: 'append',
      category: 'Контакты',
    },
    {
      id: 'seed-apx-max-1',
      platform: 'max',
      name: 'MAX — короткий призыв',
      body: '\n👉 Подробности и заказ — в личку боту',
      position: 'append',
      category: 'Призыв',
    },
    {
      id: 'seed-apx-vk-1',
      platform: 'vk',
      name: 'VK — хештеги и ссылка',
      body: '\n\n#магазин #скидки #товары\n🔗 Больше товаров: https://example-shop.ru',
      position: 'append',
      category: 'Хештеги',
    },
    {
      id: 'seed-apx-vk-2',
      platform: 'vk',
      name: 'VK — доставка',
      body: '🚚 Доставка по всей России от 1 дня',
      position: 'prepend',
      category: 'Условия',
    },
  ]
  for (const a of appendices) {
    await db.appendixTemplate.upsert({
      where: { id: a.id },
      update: {},
      create: a,
    })
  }

  // --- WordPress source ---
  await db.wordPressSource.upsert({
    where: { id: 'seed-wp-main' },
    update: {},
    create: {
      id: 'seed-wp-main',
      name: 'Основной магазин (WordPress + WooCommerce)',
      siteUrl: 'https://example-shop.ru',
      username: 'admin',
      appPassword: 'demo-app-password-xxxx xxxx xxxx xxxx xxxx xxxx',
      customFields: JSON.stringify(['price', 'old_price', 'sku', 'brand', 'stock_status']),
      postType: 'product',
      active: true,
    },
  })

  // --- Post templates ---
  const postTemplates = [
    {
      id: 'seed-pt-fabric',
      name: 'Ткань — карточка (по умолчанию)',
      platform: 'all',
      body: '{{description}}\n\n{{brand}}\nАрт: {{sku}}\n{{metaLine состав}}\n{{metaLine ширина}}\n{{metaLine пр-во}}\n{{couponLine}}\n❗Цена {{regularPrice}} ₽/м{{saleBlock}}.',
    },
    {
      id: 'seed-pt-tg',
      name: 'Telegram — карточка товара',
      platform: 'telegram',
      body: '🛒 *{{title}}*\n\n💰 Цена: {{price}} руб.\n🏷 Артикул: {{sku}}\n\n{{description}}\n\n🔗 {{url}}',
    },
    {
      id: 'seed-pt-vk',
      name: 'VK — карточка товара',
      platform: 'vk',
      body: '🛒 {{title}}\n\n💰 Цена: {{price}} руб.\n🏷 Артикул: {{sku}}\n\n{{description}}\n\n🔗 {{url}}',
    },
    {
      id: 'seed-pt-max',
      name: 'MAX — карточка товара',
      platform: 'max',
      body: '🛒 {{title}}\n💰 {{price}} руб. | Арт. {{sku}}\n\n{{description}}\n🔗 {{url}}',
    },
  ]
  for (const t of postTemplates) {
    await db.postTemplate.upsert({
      where: { id: t.id },
      update: { name: t.name, body: t.body, platform: t.platform },
      create: t,
    })
  }

  // --- Button presets (inline-button templates for product/category links) ---
  const buttonPresets = [
    {
      id: 'seed-bp-telegram',
      name: 'Telegram — кнопки каталога',
      platform: 'telegram',
      productLabel: 'Товар',
      productUrl: 'https://t.me/test_nstkani_bot/ns_tkani_catalogue?startapp={{sku}}',
      categoryLabel: 'Категория',
      categoryUrl:
        'https://t.me/test_nstkani_bot/ns_tkani_catalogue?startapp=cat-{{categorySlug}}',
      active: true,
      buttonsEnabledByDefault: true,
    },
    {
      id: 'seed-bp-max',
      name: 'MAX — кнопки каталога',
      platform: 'max',
      productLabel: 'Товар',
      productUrl: 'https://nstkani.ru/?from=max&start={{sku}}',
      categoryLabel: 'Категория',
      categoryUrl: 'https://nstkani.ru/?from=max&start=cat-{{categorySlug}}',
      active: true,
      buttonsEnabledByDefault: true,
    },
  ]
  for (const bp of buttonPresets) {
    await db.buttonPreset.upsert({
      where: { id: bp.id },
      update: {
        name: bp.name,
        platform: bp.platform,
        productLabel: bp.productLabel,
        productUrl: bp.productUrl,
        categoryLabel: bp.categoryLabel,
        categoryUrl: bp.categoryUrl,
        active: bp.active,
        buttonsEnabledByDefault: bp.buttonsEnabledByDefault,
      },
      create: bp,
    })
  }

  // --- Scheduled posts (spread across the current month, mix of statuses) ---
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  // Reliable real placeholder photos (deterministic by seed).
  const img = (seed: string, w = 800, h = 600) =>
    `https://picsum.photos/seed/${seed}/${w}/${h}`

  type PostSeed = {
    id: string
    title: string
    content: string
    mediaUrls?: string
    wordpressRef?: string
    scheduledAt: Date
    status: string
    targets: { accountId: string; status: string; appendixId?: string; publishedAt?: Date; resultRef?: string; errorMessage?: string }[]
  }

  const posts: PostSeed[] = [
    {
      id: 'seed-post-1',
      title: 'Кроссовки летние (распродажа)',
      content: '🛒 Летние кроссовки Air Breeze\n\n💰 Цена: 2990 руб. (было 4990)\n🏷 Артикул: AB-2024\n\nЛёгкие дышащие кроссовки для города и спорта. Размеры 36–45.\n\n🔗 https://example-shop.ru/product/air-breeze',
      mediaUrls: JSON.stringify([img('air-breeze-1')]),
      wordpressRef: 'air-breeze',
      scheduledAt: new Date(y, m, now.getDate() - 2, 10, 0),
      status: 'published',
      targets: [
        { accountId: tg.id, status: 'published', appendixId: 'seed-apx-tg-1', publishedAt: new Date(y, m, now.getDate() - 2, 10, 0), resultRef: 'msg/123' },
        { accountId: vk.id, status: 'published', appendixId: 'seed-apx-vk-1', publishedAt: new Date(y, m, now.getDate() - 2, 10, 1), resultRef: 'wall456' },
        { accountId: max.id, status: 'published', appendixId: 'seed-apx-max-1', publishedAt: new Date(y, m, now.getDate() - 2, 10, 2), resultRef: 'max_789' },
      ],
    },
    {
      id: 'seed-post-2',
      title: 'Куртка осенняя водозащитная',
      content: '🛒 Осенняя куртка StormShell\n\n💰 Цена: 5490 руб.\n🏷 Артикул: SS-101\n\nВодозащитная мембранная куртка. Размеры S–XXL.\n\n🔗 https://example-shop.ru/product/stormshell',
      mediaUrls: JSON.stringify([img('stormshell-1'), img('stormshell-2'), img('stormshell-3')]),
      wordpressRef: 'stormshell',
      scheduledAt: new Date(y, m, now.getDate(), 12, 0),
      status: 'scheduled',
      targets: [
        { accountId: tg.id, status: 'pending', appendixId: 'seed-apx-tg-2' },
        { accountId: vk.id, status: 'pending', appendixId: 'seed-apx-vk-1' },
      ],
    },
    {
      id: 'seed-post-3',
      title: 'Рюкзак городской 25л',
      content: '🛒 Городской рюкзак UrbanPack 25L\n\n💰 Цена: 1990 руб.\n🏷 Артикул: UP-25\n\nВодоотталкивающая ткань, отделение для ноутбука 15".\n\n🔗 https://example-shop.ru/product/urbanpack-25',
      mediaUrls: JSON.stringify([img('urbanpack-1'), img('urbanpack-2')]),
      wordpressRef: 'urbanpack-25',
      scheduledAt: new Date(y, m, now.getDate(), 18, 30),
      status: 'scheduled',
      targets: [
        { accountId: max.id, status: 'pending', appendixId: 'seed-apx-max-1' },
      ],
    },
    {
      id: 'seed-post-4',
      title: 'Флеш-распродажа выходных',
      content: '⚡ Флеш-распродажа!\n\nСкидки до 50% на всю летнюю коллекцию. Только сегодня и завтра!\n\n🔗 https://example-shop.ru/sale',
      mediaUrls: JSON.stringify([img('sale-1'), img('sale-2'), img('sale-3'), img('sale-4')]),
      scheduledAt: new Date(y, m, now.getDate() + 1, 9, 0),
      status: 'scheduled',
      targets: [
        { accountId: tg.id, status: 'pending', appendixId: 'seed-apx-tg-1' },
        { accountId: vk.id, status: 'pending', appendixId: 'seed-apx-vk-1' },
        { accountId: max.id, status: 'pending', appendixId: 'seed-apx-max-1' },
      ],
    },
    {
      id: 'seed-post-5',
      title: 'Новая коллекция шарфов',
      content: '🧣 Поступила новая коллекция шерстяных шарфов\n\n💰 От 890 руб.\n\n10 расцветок в наличии.\n\n🔗 https://example-shop.ru/category/scarves',
      mediaUrls: JSON.stringify([img('scarf-1'), img('scarf-2'), img('scarf-3'), img('scarf-4'), img('scarf-5'), img('scarf-6')]),
      scheduledAt: new Date(y, m, now.getDate() + 2, 11, 0),
      status: 'scheduled',
      targets: [
        { accountId: tg.id, status: 'pending', appendixId: 'seed-apx-tg-2' },
        { accountId: vk.id, status: 'pending', appendixId: 'seed-apx-vk-2' },
      ],
    },
    {
      id: 'seed-post-6',
      title: 'Кружка термостальная (ошибка публикации в MAX)',
      content: '🛒 Термокружка ThermoMug 450мл\n\n💰 Цена: 1290 руб.\n🏷 Артикул: TM-450\n\nДвойные стенки, держит тепло 6 часов.\n\n🔗 https://example-shop.ru/product/thermomug-450',
      mediaUrls: JSON.stringify([img('thermomug-1')]),
      wordpressRef: 'thermomug-450',
      scheduledAt: new Date(y, m, now.getDate() - 1, 14, 0),
      status: 'partial',
      targets: [
        { accountId: tg.id, status: 'published', publishedAt: new Date(y, m, now.getDate() - 1, 14, 0), resultRef: 'msg/321' },
        { accountId: max.id, status: 'failed', errorMessage: 'MAX API: chat not found (-1001234567890)' },
        { accountId: vk.id, status: 'published', publishedAt: new Date(y, m, now.getDate() - 1, 14, 1), resultRef: 'wall987' },
      ],
    },
    {
      id: 'seed-post-7',
      title: 'Подарочные сертификаты',
      content: '🎁 Подарочные сертификаты теперь в магазине!\n\nНоминалы: 1000, 2500, 5000 руб.\nСрок действия — 1 год.\n\n🔗 https://example-shop.ru/gift-cards',
      mediaUrls: JSON.stringify([img('giftcard-1'), img('giftcard-2')]),
      scheduledAt: new Date(y, m, now.getDate() + 3, 10, 0),
      status: 'scheduled',
      targets: [
        { accountId: tg.id, status: 'pending', appendixId: 'seed-apx-tg-1' },
        { accountId: vk.id, status: 'pending', appendixId: 'seed-apx-vk-1' },
      ],
    },
    {
      id: 'seed-post-8',
      title: 'Бонусы за отзыв',
      content: '⭐ Оставь отзыв на товар — получи 300 бонусов на счёт!\n\nБонусами можно оплатить до 30% следующей покупки.\n\n🔗 https://example-shop.ru/reviews',
      scheduledAt: new Date(y, m, now.getDate() + 5, 13, 0),
      status: 'scheduled',
      targets: [
        { accountId: tg.id, status: 'pending' },
        { accountId: max.id, status: 'pending', appendixId: 'seed-apx-max-1' },
        { accountId: vk.id, status: 'pending', appendixId: 'seed-apx-vk-2' },
      ],
    },
    {
      id: 'seed-post-9',
      title: 'Новая коллекция обуви (8 фото)',
      content: '👟 Новая коллекция обуви уже в продаже!\n\nБолее 20 моделей — от кроссовок до классических ботинок.\nРазмеры 36–46.\n\n🔗 https://example-shop.ru/category/shoes',
      mediaUrls: JSON.stringify([
        img('shoes-1'), img('shoes-2'), img('shoes-3'), img('shoes-4'),
        img('shoes-5'), img('shoes-6'), img('shoes-7'), img('shoes-8'),
      ]),
      scheduledAt: new Date(y, m, now.getDate() + 4, 12, 0),
      status: 'scheduled',
      targets: [
        { accountId: tg.id, status: 'pending', appendixId: 'seed-apx-tg-1' },
        { accountId: vk.id, status: 'pending', appendixId: 'seed-apx-vk-1' },
        { accountId: max.id, status: 'pending', appendixId: 'seed-apx-max-1' },
      ],
    },
    {
      id: 'seed-post-10',
      title: 'Летняя распродажа аксессуаров (5 фото)',
      content: '🎒 Летняя распродажа аксессуаров!\n\nСкидки до 40% на ремни, кошельки, сумки и очки.\n\n🔗 https://example-shop.ru/category/accessories',
      mediaUrls: JSON.stringify([
        img('acc-1'), img('acc-2'), img('acc-3'), img('acc-4'), img('acc-5'),
      ]),
      scheduledAt: new Date(y, m, now.getDate() + 6, 16, 0),
      status: 'scheduled',
      targets: [
        { accountId: tg.id, status: 'pending', appendixId: 'seed-apx-tg-2' },
        { accountId: vk.id, status: 'pending', appendixId: 'seed-apx-vk-2' },
      ],
    },
  ]

  for (const p of posts) {
    const { targets, ...postData } = p
    // upsert with update so re-running the seed refreshes photos/content on existing rows
    await db.scheduledPost.upsert({
      where: { id: postData.id },
      update: {
        title: postData.title,
        content: postData.content,
        mediaUrls: postData.mediaUrls ?? null,
        wordpressRef: postData.wordpressRef ?? null,
        scheduledAt: postData.scheduledAt,
        status: postData.status,
      },
      create: {
        ...postData,
        targets: {
          create: targets,
        },
      },
    })
  }

  console.log('✅ Seed complete.')
  console.log(`   - Platforms: 3 (${tg.name}, ${max.name}, ${vk.name})`)
  console.log(`   - Appendices: ${appendices.length}`)
  console.log(`   - WordPress sources: 1`)
  console.log(`   - Post templates: ${postTemplates.length}`)
  console.log(`   - Button presets: ${buttonPresets.length}`)
  console.log(`   - Scheduled posts: ${posts.length}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
