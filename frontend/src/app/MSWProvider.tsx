'use client';

/**
 * MSWProvider — Client Component
 *
 * Conditionally starts the Mock Service Worker in development mode.
 * In production (or when NEXT_PUBLIC_API_URL points at the real backend),
 * the worker is never started and no mock code runs.
 *
 * Usage: wrap children in the root layout.tsx with this provider.
 * At Integration Step 3, simply remove this provider from layout.tsx
 * and point NEXT_PUBLIC_API_URL at http://localhost:8080.
 */

import { useEffect, useState } from 'react';

async function initMSW(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (process.env.NODE_ENV !== 'development') return;

  const { worker } = await import('@/mocks/browser');
  await worker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: {
      url: '/mockServiceWorker.js',
    },
  });
}

interface MSWProviderProps {
  children: React.ReactNode;
}

export default function MSWProvider({ children }: MSWProviderProps) {
  const [mswReady, setMswReady] = useState(false);

  useEffect(() => {
    initMSW().then(() => setMswReady(true));
  }, []);

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
