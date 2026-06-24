/**
 * Next.js instrumentation hook — runs once when the server starts.
 *
 * Starts the in-process posting scheduler in the Node.js runtime only
 * (skips the Edge runtime and build). The scheduler publishes due posts
 * every minute without any external cron setup.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('./lib/scheduler')
    startScheduler()
  }
}
