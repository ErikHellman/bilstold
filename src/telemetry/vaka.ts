// Crash reporting and cookieless analytics via Vaka (https://vaka.fly.dev).
// Only production builds served from a real host report anything: dev, tests
// and `vite preview` on localhost stay silent. The ingest key is public by design.
import * as Vaka from '@hellsoft/vaka-browser';

const KEY = 'vk_935cef5b303af8af74d74564bf9e7d4d';
const ENDPOINT = 'https://vaka.fly.dev';

declare const __VAKA_RELEASE__: string;

let enabled = false;

export function initTelemetry(): void {
  if (!import.meta.env.PROD) return;
  try {
    Vaka.init({ key: KEY, endpoint: ENDPOINT, release: __VAKA_RELEASE__, environment: 'production', ignoreLocalhost: true });
    enabled = true;
  } catch {
    // Telemetry must never break the game.
  }
}

export function track(name: string, props?: Record<string, string | number | boolean>): void {
  if (!enabled) return;
  try { Vaka.track(name, props); } catch { /* ignore */ }
}
