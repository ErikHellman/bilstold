// Crash reporting. Sentry is only loaded when a DSN is baked in at build time
// (VITE_SENTRY_DSN), and then as a separate chunk so the game bundle stays lean.
export async function initSentry(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  try {
    const Sentry = await import('./sentry-client');
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
      sendDefaultPii: false,
    });
  } catch {
    // Blocked by an ad blocker or offline: the game runs fine without it.
  }
}
