import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui';
import { AuthProvider } from '@brika/auth/react';
import { RouteProvider } from '@/router';
import { queryClient } from '@/lib/query';

// Initialize i18n (side-effect import)
import '@/lib/i18n';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <RouteProvider />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
