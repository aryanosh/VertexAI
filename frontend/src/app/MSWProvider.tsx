'use client';

/**
 * MSWProvider — Client Component
 *
 * Conditionally starts the Mock Service Worker in development mode.
 * In production (or when NEXT_PUBLIC_API_URL points at the real backend),
 * the worker is never started and no mock code runs.
 *
 * Uses a singleton initialization promise to prevent double-start errors
 * on page refresh / React 18 Strict Mode.
 */

import { useEffect, useState } from 'react';

declare global {
  interface Window {
    __mswInitialized?: boolean;
    __mswPromise?: Promise<void>;
  }
}

async function initMSW(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (process.env.NODE_ENV !== 'development') return;

  if (window.__mswInitialized) return;
  if (window.__mswPromise) {
    await window.__mswPromise;
    return;
  }

  window.__mswPromise = (async () => {
    try {
      const { worker } = await import('@/mocks/browser');
      await worker.start({
        onUnhandledRequest: 'bypass',
        serviceWorker: {
          url: '/mockServiceWorker.js',
        },
      });
      window.__mswInitialized = true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // Ignore if network is already enabled / already started during Fast Refresh
      if (message.includes('already enabled') || message.includes('already registered')) {
        window.__mswInitialized = true;
        return;
      }
      console.warn('[MSW] Worker initialization warning:', err);
      window.__mswInitialized = true;
    }
  })();

  await window.__mswPromise;
}

interface MSWProviderProps {
  children: React.ReactNode;
}

export default function MSWProvider({ children }: MSWProviderProps) {
  const [mswReady, setMswReady] = useState(
    process.env.NODE_ENV !== 'development' ||
      (typeof window !== 'undefined' && Boolean(window.__mswInitialized))
  );

  useEffect(() => {
    if (!mswReady) {
      initMSW().finally(() => setMswReady(true));
    }
  }, [mswReady]);

  // In production, render immediately without waiting for MSW
  if (process.env.NODE_ENV !== 'development') {
    return <>{children}</>;
  }

  // In development, wait for MSW worker to start before rendering
  if (!mswReady) {
    return null;
  }

  return <>{children}</>;
}

