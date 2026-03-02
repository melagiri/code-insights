// Client-side PostHog telemetry for the dashboard SPA.
//
// Initialization is fire-and-forget: we fetch the identity from the server
// (which checks if telemetry is enabled and returns the same stable machine ID
// used by the CLI) and only init posthog-js if the server says enabled.
//
// Config choices:
//   autocapture: false — we don't want PostHog to auto-capture clicks/DOM events
//   capture_pageview: true — posthog-js will send $pageview on init; we add route
//     tracking manually in App.tsx via capturePageView()
//   persistence: 'memory' — no localStorage/cookies, privacy-first
//   disable_session_recording: true — no video replay
//   ip: false — PostHog discards IP before storing

import posthog from 'posthog-js';

const POSTHOG_API_KEY = 'phc_rNWNOSBvCmZL8GqfOpOLFWOHbWMgpI2HBJQVLGi5Hhq';
const POSTHOG_HOST = 'https://us.i.posthog.com';

let initialized = false;

/**
 * Initialize posthog-js. Fire-and-forget from main.tsx — does not block render.
 * Fetches /api/telemetry/identity to get the shared distinct_id and enabled flag.
 */
export async function initTelemetry(): Promise<void> {
  if (initialized) return;
  try {
    const res = await fetch('/api/telemetry/identity');
    if (!res.ok) return;
    const data = await res.json() as { enabled: boolean; distinct_id?: string };
    if (!data.enabled) return;

    posthog.init(POSTHOG_API_KEY, {
      api_host: POSTHOG_HOST,
      autocapture: false,
      capture_pageview: false, // We track page views manually on route change
      capture_pageleave: false,
      persistence: 'memory',
      disable_session_recording: true,
      ip: false,
    });

    if (data.distinct_id) {
      posthog.identify(data.distinct_id);
    }

    initialized = true;
  } catch {
    // Telemetry init failure is always silent
  }
}

/**
 * Capture a page view event. Called from App.tsx on route change.
 */
export function capturePageView(path: string): void {
  if (!initialized) return;
  try {
    posthog.capture('$pageview', { $current_url: path });
  } catch {
    // Silent
  }
}

/**
 * Capture the dashboard_loaded event with load time.
 * @param page - The route segment (e.g. 'dashboard', 'sessions')
 * @param loadTimeMs - Time from navigation start to first render in ms
 */
export function captureDashboardLoaded(page: string, loadTimeMs: number): void {
  if (!initialized) return;
  try {
    posthog.capture('dashboard_loaded', { page, load_time_ms: loadTimeMs });
  } catch {
    // Silent
  }
}
