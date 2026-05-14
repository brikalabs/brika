console.log('[brika-bootstrap] entry module loaded', {
  url: location.href,
  scripts: Array.from(document.scripts).map((s) => s.src || '(inline)'),
});

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from '@/App';
import '@/index.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
