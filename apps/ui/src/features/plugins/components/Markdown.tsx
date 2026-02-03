import { Link as LinkIcon } from 'lucide-react';
import { Children, Fragment, isValidElement, type ReactNode, useEffect } from 'react';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockInfo,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';

// --- Heading Utilities ---

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

const headingStyles: Record<HeadingLevel, string> = {
  1: 'mt-6 mb-4 border-b border-border pb-2 font-bold text-2xl first:mt-0',
  2: 'mt-5 mb-3 border-b border-border pb-2 font-semibold text-xl first:mt-0',
  3: 'mt-4 mb-2 font-semibold text-lg first:mt-0',
  4: 'mt-3 mb-2 font-semibold text-base first:mt-0',
  5: 'mt-3 mb-2 font-semibold text-sm first:mt-0',
  6: 'mt-3 mb-2 font-semibold text-xs first:mt-0',
};

function extractText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join(' ');
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return extractText(props.children);
  }
  return '';
}

function slugify(text: string) {
  return text
    .replaceAll(/<[^>]*>/g, '')
    .toLowerCase()
    .trim()
    .replaceAll(/[^\w\s-]/g, '')
    .replaceAll(/\s+/g, '-')
    .replaceAll(/-+/g, '-');
}

// --- Code Block Utilities ---

function getLanguage(className?: string) {
  return className?.match(/language-([\w+-]+)/i)?.[1]?.toLowerCase() ?? null;
}

function getFilename(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;

  const meta =
    (node as { data?: { meta?: unknown } }).data?.meta ??
    (node as { properties?: { dataMeta?: unknown } }).properties?.dataMeta ??
    (node as { properties?: { meta?: unknown } }).properties?.meta ??
    (node as { meta?: unknown }).meta;

  if (typeof meta !== 'string') return null;

  const match = /filename\s*=\s*["']?([^"'\s]+)["']?/i.exec(meta);
  return match?.[1] ?? null;
}

// --- Code Block Component ---

function MarkdownCodeBlock({
  code,
  language,
  filename,
}: Readonly<{
  code: string;
  language: string | null;
  filename: string | null;
}>) {
  const { t } = useLocale();

  return (
    <CodeBlock className="mb-4">
      <CodeBlockHeader>
        <CodeBlockInfo>
          {({ language, filename, lineCount }) => {
            const items = [
              language && (
                <span
                  key="lang"
                  className="rounded-md bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.2em]"
                >
                  {language}
                </span>
              ),
              filename && (
                <span key="file" className="min-w-0 truncate font-mono text-foreground/80">
                  {filename}
                </span>
              ),
              lineCount > 0 && (
                <span key="lines" className="text-muted-foreground">
                  {t('common:code.lines', { count: lineCount })}
                </span>
              ),
            ].filter(Boolean);

            return (
              <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
                {items.map((item, i) => (
                  <Fragment key={i}>
                    {item}
                    {i < items.length - 1 && <span className="text-muted-foreground/50">/</span>}
                  </Fragment>
                ))}
              </div>
            );
          }}
        </CodeBlockInfo>
        <CodeBlockActions>
          <CodeBlockCopyButton
            copyLabel={t('common:actions.copy')}
            copiedLabel={t('common:messages.copied')}
          />
        </CodeBlockActions>
      </CodeBlockHeader>
      <CodeBlockContent language={language} filename={filename} showLineNumbers>
        {code}
      </CodeBlockContent>
    </CodeBlock>
  );
}

// --- Heading Component ---

function createHeading(level: HeadingLevel) {
  const Tag = `h${level}` as const;

  return function Heading({ children }: { children?: ReactNode }) {
    const id = slugify(extractText(children)) || 'heading';

    return (
      <Tag id={id} className={headingStyles[level]}>
        <a href={`#${id}`} className="group relative block text-inherit no-underline">
          <span
            className="absolute top-1/2 -left-6 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          >
            <LinkIcon className="size-4 text-muted-foreground" />
          </span>
          {children}
        </a>
      </Tag>
    );
  };
}

// --- Markdown Components ---

const components: Components = {
  h1: createHeading(1),
  h2: createHeading(2),
  h3: createHeading(3),
  h4: createHeading(4),
  h5: createHeading(5),
  h6: createHeading(6),
  p: ({ children }) => <p className="mb-4 leading-7 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-4 ml-6 list-disc space-y-2">{children}</ul>,
  ol: ({ children }) => <ol className="mb-4 ml-6 list-decimal space-y-2">{children}</ol>,
  li: ({ children }) => <li className="leading-7">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-primary/30 border-l-4 bg-muted/30 pl-4 italic">
      {children}
    </blockquote>
  ),
  code: ({ className, children, node }) => {
    const text = Children.toArray(children).join('');
    const isBlock = Boolean(className) || text.includes('\n');

    if (!isBlock) {
      return (
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-primary text-sm">
          {children}
        </code>
      );
    }

    return (
      <MarkdownCodeBlock
        code={text.replace(/\n$/, '')}
        language={getLanguage(className)}
        filename={getFilename(node)}
      />
    );
  },
  pre: ({ children }) => <>{children}</>,
  a: ({ href, children }) => (
    <a
      href={href}
      target={href?.startsWith('#') ? undefined : '_blank'}
      rel={href?.startsWith('#') ? undefined : 'noopener noreferrer'}
      className="text-primary underline-offset-4 hover:underline"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="my-6 border-border" />,
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse border border-border">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-border border-b">{children}</tr>,
  th: ({ children }) => (
    <th className="border border-border bg-muted/30 px-4 py-2 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-border px-4 py-2">{children}</td>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  img: ({ src, alt }) => <img src={src} alt={alt} className="my-4 h-auto max-w-full rounded-lg" />,
};

// --- Main Component ---

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
      <ReactMarkdown components={components}>{children}</ReactMarkdown>
    </div>
  );
}
