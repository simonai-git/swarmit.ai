export async function register() {
  // Only run on the server
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Instrumentation] Initializing server-side services...');

    try {
      // Import scheduler dynamically to avoid client-side bundling
      const { startScheduler } = await import('./lib/scheduler');

      // Start the internal task scheduler
      startScheduler();

      // Register graceful shutdown handlers for SIGTERM (Railway deploy) and SIGINT (Ctrl+C)
      const shutdown = async (signal: string) => {
        console.log(`[Instrumentation] ${signal} received, flushing logs...`);
        try {
          const { stopSchedulerAsync } = await import('./lib/scheduler');
          await stopSchedulerAsync();
        } catch (err) {
          console.error('[Instrumentation] Error during shutdown:', err);
        }
        process.exit(0);
      };
      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));

      console.log('[Instrumentation] Server-side services initialized');
    } catch (error) {
      console.error('[Instrumentation] Failed to start scheduler:', error);
    }
  }
}
