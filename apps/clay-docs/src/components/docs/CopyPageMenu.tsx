import { Check, ChevronDown, Copy, ExternalLink, FileText, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const SITE_ORIGIN = 'https://clay.brika.dev';
const GITHUB_REPO = 'https://github.com/brikalabs/brika';
const GITHUB_BRANCH = 'main';

interface CopyPageMenuProps {
  /** Path of the current page (e.g. `/components/button`). */
  readonly pathname: string;
  /** Repo-relative path of the MDX source (e.g. `apps/clay-docs/src/pages/components/button.mdx`). */
  readonly sourcePath: string;
}

function buildLlmPrompt(pageUrl: string): string {
  return `I'm reading ${pageUrl} from the Clay component library. Help me understand and use the component on this page.`;
}

/**
 * "Copy page" split-button with a dropdown of LLM-friendly and clipboard
 * actions. Mirrors the pattern shadcn and kumo use — gives readers who want
 * to dump the page into an AI a one-click path instead of fiddling with
 * select + copy + context-switch.
 */
export function CopyPageMenu({ pathname, sourcePath }: CopyPageMenuProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const pageUrl = `${SITE_ORIGIN}${pathname}`;
  const rawMdxUrl = `${GITHUB_REPO}/blob/${GITHUB_BRANCH}/${sourcePath}?plain=1`;
  const claudeUrl = `https://claude.ai/new?q=${encodeURIComponent(buildLlmPrompt(pageUrl))}`;
  const chatgptUrl = `https://chatgpt.com/?q=${encodeURIComponent(buildLlmPrompt(pageUrl))}`;

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDocumentClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onDocumentClick);
    window.addEventListener('keydown', onKeydown);
    return () => {
      window.removeEventListener('mousedown', onDocumentClick);
      window.removeEventListener('keydown', onKeydown);
    };
  }, [open]);

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
            href={rawMdxUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-clay-default text-sm transition-colors hover:bg-clay-control"
          >
            <FileText size={14} className="shrink-0 text-clay-subtle" aria-hidden="true" />
            <span>View page as Markdown</span>
            <ExternalLink size={11} className="ml-auto text-clay-inactive" aria-hidden="true" />
          </a>
          <a
            role="menuitem"
            href={claudeUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-clay-default text-sm transition-colors hover:bg-clay-control"
          >
            <Sparkles size={14} className="shrink-0 text-clay-subtle" aria-hidden="true" />
            <span>Open in Claude</span>
            <ExternalLink size={11} className="ml-auto text-clay-inactive" aria-hidden="true" />
          </a>
          <a
            role="menuitem"
            href={chatgptUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-clay-default text-sm transition-colors hover:bg-clay-control"
          >
            <Sparkles size={14} className="shrink-0 text-clay-subtle" aria-hidden="true" />
            <span>Open in ChatGPT</span>
            <ExternalLink size={11} className="ml-auto text-clay-inactive" aria-hidden="true" />
          </a>
        </div>
      )}
    </div>
  );
}
