import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockInfo,
} from '@brika/clay/components/code-block';
import { TooltipProvider } from '@brika/clay/components/tooltip';

/**
 * Single source-of-truth code block for the docs site. Wraps Clay's own
 * CodeBlock primitive — the same one used by apps/ui's
 * `MarkdownCodeBlock` — so docs and runtime markdown render identically.
 *
 * `variant="compact"` drops the header (used inside ComponentExample where
 * the demo already provides the visual context).
 *
 * Wrapped in TooltipProvider because CodeBlockCopyButton consumes a
 * Tooltip context internally; without the provider it crashes on render.
 */

type Lang = 'tsx' | 'ts' | 'jsx' | 'js' | 'bash' | 'css' | 'html' | 'json';

interface CodeSourceProps {
  readonly code: string;
  readonly lang?: Lang;
  readonly filename?: string;
  readonly variant?: 'default' | 'compact';
}

export function CodeSource({ code, lang = 'tsx', filename, variant = 'default' }: CodeSourceProps) {
  const showHeader = variant === 'default';
  return (
    <TooltipProvider>
      <CodeBlock className="my-4">
        {showHeader && (
          <CodeBlockHeader>
            <CodeBlockInfo>
              {({ language, filename: detected, lineCount }) => (
                <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
                  {language && (
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.625rem] text-muted-foreground uppercase tracking-wider">
                      {language}
                    </span>
                  )}
                  {detected && (
                    <span className="min-w-0 truncate font-mono text-foreground/80">
                      {detected}
                    </span>
                  )}
                  {lineCount > 0 && (
                    <span className="font-mono text-[0.625rem] text-muted-foreground">
                      {lineCount} {lineCount === 1 ? 'line' : 'lines'}
                    </span>
                  )}
                </div>
              )}
            </CodeBlockInfo>
            <CodeBlockActions>
              <CodeBlockCopyButton />
            </CodeBlockActions>
          </CodeBlockHeader>
        )}
        <CodeBlockContent language={lang} filename={filename ?? null} showLineNumbers={showHeader}>
          {code}
        </CodeBlockContent>
      </CodeBlock>
    </TooltipProvider>
  );
}
