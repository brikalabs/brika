import { Check, ChevronDown, Copy, ExternalLink, FileText, Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import { useDismiss } from '~/lib/use-dismiss';

interface CopyPageMenuProps {
  /** Absolute URL of the current page. */
  readonly pageUrl: string;
  /** Path that serves the page as plain Markdown (e.g. `/components/button.md`). */
  readonly markdownUrl: string;
}

function buildLlmPrompt(markdownUrl: string): string {
  return `Read ${markdownUrl} — it's the Markdown source for a page from the Clay component library. Help me understand and use what it documents.`;
}

/**
 * "Copy page" split-button with a dropdown of LLM-friendly and clipboard
 * actions. Mirrors the pattern shadcn and kumo use — gives readers who want
 * to dump the page into an AI a one-click path instead of fiddling with
 * select + copy + context-switch.
 */
export function CopyPageMenu({ pageUrl, markdownUrl }: CopyPageMenuProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const absoluteMarkdownUrl = new URL(markdownUrl, pageUrl).href;
  const promptQuery = encodeURIComponent(buildLlmPrompt(absoluteMarkdownUrl));
  const llmHandoffs = [
    { label: 'Open in Claude', href: `https://claude.ai/new?q=${promptQuery}` },
    { label: 'Open in ChatGPT', href: `https://chatgpt.com/?q=${promptQuery}` },
  ];

  useDismiss(open, rootRef, () => setOpen(false));

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard unavailable — drop silently.
    }
  };

  return (
    <div ref={rootRef} className="relative inline-flex items-stretch">
      <div className="inline-flex items-stretch divide-x divide-clay-hairline overflow-hidden rounded border border-clay-hairline bg-clay-elevated">
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 font-mono text-clay-default text-xs transition-colors hover:bg-clay-control"
        >
          {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          <span>{copied ? 'Copied' : 'Copy page'}</span>
        </button>
        <button
          type="button"
          onClick={() => setOpen((previous) => !previous)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="More page actions"
          className="inline-flex items-center justify-center px-2 py-1.5 text-clay-subtle transition-colors hover:bg-clay-control hover:text-clay-default"
        >
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </div>

      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-40 mt-1.5 w-64 overflow-hidden rounded-lg border border-clay-hairline bg-clay-elevated shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              copyLink();
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-clay-default text-sm transition-colors hover:bg-clay-control"
          >
            <Copy size={14} className="shrink-0 text-clay-subtle" aria-hidden="true" />
            <span>Copy page link</span>
          </button>
          <a
            role="menuitem"
            href={markdownUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-clay-default text-sm transition-colors hover:bg-clay-control"
          >
            <FileText size={14} className="shrink-0 text-clay-subtle" aria-hidden="true" />
            <span>View page as Markdown</span>
            <ExternalLink size={11} className="ml-auto text-clay-inactive" aria-hidden="true" />
          </a>
          {llmHandoffs.map((handoff) => (
            <a
              key={handoff.label}
              role="menuitem"
              href={handoff.href}
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-clay-default text-sm transition-colors hover:bg-clay-control"
            >
              <Sparkles size={14} className="shrink-0 text-clay-subtle" aria-hidden="true" />
              <span>{handoff.label}</span>
              <ExternalLink size={11} className="ml-auto text-clay-inactive" aria-hidden="true" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
