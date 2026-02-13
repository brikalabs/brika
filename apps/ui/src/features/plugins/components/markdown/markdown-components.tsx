import { Children } from 'react';
import type { Components } from 'react-markdown';
import { getFilename, getLanguage } from './code-block-utils';
import { MarkdownCodeBlock } from './MarkdownCodeBlock';
import { createHeading } from './MarkdownHeading';

export const markdownComponents: Components = {
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
    const text = Children.toArray(children).map(String).join('');
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
