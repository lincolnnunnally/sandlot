// LPL telemetry — the ecosystem's shared first-party analytics client.
//
// Canonical source. Two consumers, both generated from this file:
//   1. the growth-telemetry factory module (new generated apps)
//   2. scripts/retrofit-telemetry.mjs (the 21 apps that already exist)
// A smoke test asserts both copies match this file byte for byte, so there is
// exactly one place to fix a bug.
//
// Zero dependencies, SSR-safe, and framework-agnostic on purpose: the ecosystem
// runs Next 15/16, Vite, and CRA, and all three must report the same funnel.
//
// Privacy: anon_id is a random id in this site's own localStorage. It is never
// shared across domains, and no email, name, or free text is ever auto-collected.
// Pass an opaque user id to identify() — never an email address.

const ENDPOINT = 'https://uqhqulrqcygsmmzdzemx.supabase.co/functions/v1/ecosystem-telemetry';

const ANON_KEY = 'lpl_anon';
const SESSION_KEY = 'lpl_sess';
const SESSION_TS_KEY = 'lpl_sess_ts';
const UTM_KEY = 'lpl_utm';

const SESSION_IDLE_MS = 30 * 60 * 1000; // a new session after 30 min of inactivity
const FLUSH_INTERVAL_MS = 5000;
const FLUSH_AT_COUNT = 10;

export type TelemetryEvent = {
  name: string;
  anon_id?: string | null;
  session_id?: string | null;
  user_id?: string | null;
  path?: string | null;
  referrer?: string | null;
  utm?: Record<string, string>;
  props?: Record<string, unknown>;
};

type Config = {
  app: string;
  endpoint: string;
  debug: boolean;
  respectDoNotTrack: boolean;
};

let config: Config | null = null;
let queue: TelemetryEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let currentUserId: string | null = null;
let disabled = false;

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Storage can throw in private mode or when cookies are blocked. Never let that break the app. */
function safeGet(store: Storage | undefined, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(store: Storage | undefined, key: string, value: string): void {
  try {
    store?.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function anonId(): string {
  const existing = safeGet(window.localStorage, ANON_KEY);
  if (existing) return existing;
  const id = uuid();
  safeSet(window.localStorage, ANON_KEY, id);
  return id;
}

function sessionId(): string {
  const now = Date.now();
  const lastSeen = Number(safeGet(window.sessionStorage, SESSION_TS_KEY) ?? 0);
  let id = safeGet(window.sessionStorage, SESSION_KEY);

  if (!id || !lastSeen || now - lastSeen > SESSION_IDLE_MS) {
    id = uuid();
    safeSet(window.sessionStorage, SESSION_KEY, id);
  }
  safeSet(window.sessionStorage, SESSION_TS_KEY, String(now));
  return id;
}

/**
 * UTM params belong to the whole session, not just the landing page — otherwise
 * a signup on page 3 looks like it came from nowhere.
 */
function sessionUtm(): Record<string, string> {
  const stored = safeGet(window.sessionStorage, UTM_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as Record<string, string>;
    } catch {
      /* fall through and re-read from the URL */
    }
  }

  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref']) {
    const value = params.get(key);
    if (value) utm[key] = value.slice(0, 120);
  }
  if (Object.keys(utm).length > 0) safeSet(window.sessionStorage, UTM_KEY, JSON.stringify(utm));
  return utm;
}

function doNotTrackEnabled(): boolean {
  const nav = window.navigator as Navigator & { msDoNotTrack?: string };
  const dnt = nav.doNotTrack ?? (window as unknown as { doNotTrack?: string }).doNotTrack ?? nav.msDoNotTrack;
  return dnt === '1' || dnt === 'yes';
}

function send(events: TelemetryEvent[]): void {
  if (!config || events.length === 0) return;
  const payload = JSON.stringify({ app: config.app, events });

  // sendBeacon survives the page unload that usually kills the last event of a visit.
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([payload], { type: 'text/plain;charset=UTF-8' });
      if (navigator.sendBeacon(config.endpoint, blob)) return;
    } catch {
      /* fall through to fetch */
    }
  }

  void fetch(config.endpoint, {
    method: 'POST',
    body: payload,
    headers: { 'content-type': 'application/json' },
    keepalive: true,
    // Telemetry must never take the app down with it.
  }).catch(() => undefined);
}

function flush(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  send(batch);
}

function scheduleFlush(): void {
  if (timer) return;
  timer = setTimeout(flush, FLUSH_INTERVAL_MS);
}

/**
 * Start reporting. Safe to call more than once (later calls are ignored), which
 * matters because React strict mode mounts effects twice in development.
 */
export function initTelemetry(options: {
  app: string;
  endpoint?: string;
  debug?: boolean;
  respectDoNotTrack?: boolean;
}): void {
  if (!isBrowser() || config) return;

  config = {
    app: options.app,
    endpoint: options.endpoint ?? ENDPOINT,
    debug: options.debug ?? false,
    respectDoNotTrack: options.respectDoNotTrack ?? true,
  };

  if (config.respectDoNotTrack && doNotTrackEnabled()) {
    disabled = true;
    if (config.debug) console.info('[lpl-telemetry] disabled by Do Not Track');
    return;
  }

  const onHide = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', flush);
}

/** Record an event. Names must be lower_snake_case; the ingest drops anything else. */
export function track(name: string, props: Record<string, unknown> = {}): void {
  if (!isBrowser() || disabled || !config) return;

  const event: TelemetryEvent = {
    name,
    anon_id: anonId(),
    session_id: sessionId(),
    user_id: currentUserId,
    path: window.location.pathname,
    referrer: document.referrer || null,
    utm: sessionUtm(),
    props,
  };

  if (config.debug) console.info('[lpl-telemetry]', name, props);

  queue.push(event);
  if (queue.length >= FLUSH_AT_COUNT) flush();
  else scheduleFlush();
}

/** Attach an opaque user id to subsequent events. Never pass an email address. */
export function identify(userId: string | null): void {
  currentUserId = userId;
}

export function trackPageView(props: Record<string, unknown> = {}): void {
  track('page_view', props);
}

// ---- canonical funnel helpers -----------------------------------------------
// page_view -> signup_started -> signup_completed -> activated -> payment_completed
// Use these rather than raw track() so every app reports the same five steps.

export const funnel = {
  signupStarted: (props?: Record<string, unknown>) => track('signup_started', props ?? {}),
  signupCompleted: (props?: Record<string, unknown>) => track('signup_completed', props ?? {}),
  /** The app's first real core action — see lpl_app_registry.activation_event. */
  activated: (props?: Record<string, unknown>) => track('activated', props ?? {}),
  paymentCompleted: (props?: Record<string, unknown>) => track('payment_completed', props ?? {}),
};

export function flushTelemetry(): void {
  flush();
}
