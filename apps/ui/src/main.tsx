import { AuthProvider } from '@brika/auth/react';
import { TooltipProvider } from '@brika/clay';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { apiFetch } from '@/lib/api';
import { queryClient } from '@/lib/query';
import { RouteProvider } from '@/router';

// Initialize i18n (side-effect import)
import '@/lib/i18n';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element not found');
}
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {/*
        AuthProvider's fetch goes through the same transport as the rest of
        the app — direct fetch on LAN, WebRTC data channel when the UI is
        loaded with `?hub=<name>` (see lib/api/index.ts).
      */}
      <AuthProvider fetch={apiFetch}>
        <TooltipProvider>
          <RouteProvider />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
