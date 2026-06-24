// Cross-platform post-build step for Next.js standalone output.
// Replaces the Unix-only `cp -r ...` so the build works on Windows, Linux, macOS.
//
// Copies into .next/standalone:
//   .next/static      → .next/standalone/.next/static   (static assets)
//   public            → .next/standalone/public          (public assets)
//   node_modules/.prisma       → standalone node_modules/.prisma   (generated client + engine)
//   node_modules/@prisma/client→ standalone node_modules/@prisma/client
//   prisma/schema.prisma       → standalone/prisma                (for runtime introspection)
// Ensures writable dirs exist: public/uploads, public/download
import { cpSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const standalone = join(root, '.next', 'standalone')

function log(msg) {
  console.log('[postbuild] ' + msg)
}

function copyIntoStandalone(src, destRel, { recursive = true } = {}) {
  const dest = join(standalone, destRel)
  if (!existsSync(src)) {
    log(`skip (missing): ${src}`)
    return
  }
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(src, dest, { recursive })
  log(`copied: ${src} → ${destRel}`)
}

if (!existsSync(standalone)) {
  console.error('[postbuild] ERROR: .next/standalone not found. Run `next build` first.')
  process.exit(1)
}

// 1. Static assets
copyIntoStandalone(join(root, '.next', 'static'), join('.next', 'static'))

// 2. Public assets
copyIntoStandalone(join(root, 'public'), 'public')

// 3. Prisma generated client + engine binary (critical for standalone + SQLite)
copyIntoStandalone(join(root, 'node_modules', '.prisma'), join('node_modules', '.prisma'))
copyIntoStandalone(join(root, 'node_modules', '@prisma', 'client'), join('node_modules', '@prisma', 'client'))

// 4. Prisma schema (harmless, useful if Prisma needs it at runtime)
copyIntoStandalone(join(root, 'prisma', 'schema.prisma'), join('prisma', 'schema.prisma'), {
  recursive: false,
})

// 5. Ensure writable runtime dirs exist in standalone/public
for (const dir of ['uploads', 'download']) {
  mkdirSync(join(standalone, 'public', dir), { recursive: true })
}
log('ensured: public/uploads, public/download')

log('done')
