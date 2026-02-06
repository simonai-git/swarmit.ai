export async function register() {
  // Only run on the server
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Instrumentation] Initializing server-side services...');

    try {
      // Import scheduler dynamically to avoid client-side bundling
      const { startScheduler } = await import('./lib/scheduler');

      // Start the internal task scheduler
      startScheduler();

      console.log('[Instrumentation] Server-side services initialized');
    } catch (error) {
      console.error('[Instrumentation] Failed to start scheduler:', error);
    }
  }
}
