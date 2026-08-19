'use client';

/**
 * MSWProvider — Client Component
 *
 * Starts Mock Service Worker only when explicitly enabled via NEXT_PUBLIC_ENABLE_MOCK=true.
 * When pointing to the real Spring Boot backend (http://localhost:8080), MSW is bypassed.
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
  if (process.env.NEXT_PUBLIC_ENABLE_MOCK !== 'true') return;

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
  const isMockEnabled = process.env.NEXT_PUBLIC_ENABLE_MOCK === 'true';
  const [mswReady, setMswReady] = useState(!isMockEnabled);

  useEffect(() => {
    if (isMockEnabled && !mswReady) {
      initMSW().finally(() => setMswReady(true));
    }
  }, [isMockEnabled, mswReady]);

  if (isMockEnabled && !mswReady) {
    return null;
  }

  return <>{children}</>;
}
