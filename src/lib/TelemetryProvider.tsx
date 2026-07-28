'use client';

// Drop-in page-view tracking for Next.js App Router apps.
// Render once in the root layout, inside <body>:
//
//   import { Telemetry } from '../lib/TelemetryProvider';
//   <Telemetry app="furfriend" />
//
// This file lives beside telemetry.ts and imports it relatively, so it works the
// same whether the app keeps its code under src/ or at the repo root, and
// regardless of whether the app configured an "@/*" tsconfig path alias.
//
// The filename deliberately is NOT "Telemetry.tsx": macOS ships a
// case-insensitive filesystem, so "Telemetry" and "telemetry" resolve to the
// same path and TypeScript would silently import the core module instead of
// this component.
//
// The inner component is wrapped in Suspense because useSearchParams() opts the
// whole subtree into client-side rendering otherwise, which would turn every
// static page in the app into a dynamic one at build time.

import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { initTelemetry, trackPageView } from './telemetry';

function TelemetryInner({ app, debug }: { app: string; debug?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const started = useRef(false);
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!started.current) {
      initTelemetry({ app, debug });
      started.current = true;
    }
  }, [app, debug]);

  useEffect(() => {
    // App Router fires this on every navigation. Guard against duplicate
    // page_views from strict-mode double-mounts and no-op query changes.
    const key = `${pathname}?${searchParams?.toString() ?? ''}`;
    if (lastPath.current === key) return;
    lastPath.current = key;
    trackPageView();
  }, [pathname, searchParams]);

  return null;
}

export function Telemetry({ app, debug }: { app: string; debug?: boolean }) {
  return (
    <Suspense fallback={null}>
      <TelemetryInner app={app} debug={debug} />
    </Suspense>
  );
}

export default Telemetry;
