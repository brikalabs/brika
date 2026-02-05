import { useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { markdownComponents } from './markdown-components';

export function Markdown({ children }: Readonly<{ children: string }>) {
  // Handle hash navigation after content renders
  useEffect(() => {
    const hash = globalThis.location.hash.slice(1);
    if (hash) {
      const element = document.getElementById(hash);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [children]);

  return (
    <div className="px-6 text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown components={markdownComponents}>{children}</ReactMarkdown>
    </div>
  );
}
