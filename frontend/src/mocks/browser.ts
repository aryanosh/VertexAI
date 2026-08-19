/**
 * MSW Browser Worker Setup
 * Initializes Mock Service Worker for browser environments.
 * Source: https://mswjs.io/docs/integrations/browser
 */

import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);
