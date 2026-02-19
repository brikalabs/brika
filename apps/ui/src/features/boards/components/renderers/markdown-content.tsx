import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const components: Components = {
  h1: ({ children }) => <h1 className="mb-2 font-bold text-base">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 font-semibold text-sm">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 font-semibold text-xs">{children}</h3>,
  p: ({ children }) => <p className="mb-2 text-xs leading-5 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-1 text-xs">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-1 text-xs">{children}</ol>,
  li: ({ children }) => <li className="leading-5">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-primary/30 border-l-2 pl-3 text-muted-foreground text-xs italic">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    if (className) {
      return (
        <pre className="my-2 overflow-auto rounded-md bg-muted/50 p-2 text-[11px]">
          <code className="font-mono">{children}</code>
        </pre>
      );
    }
    return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{children}</code>;
  },
  pre: ({ children }) => <>{children}</>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline-offset-2 hover:underline"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="my-3 border-border" />,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-border border-b last:border-b-0">{children}</tr>,
  th: ({ children }) => (
    <th className="px-3 py-1.5 text-left font-semibold text-muted-foreground">{children}</th>
  ),
  td: ({ children }) => <td className="px-3 py-1.5">{children}</td>,
};

export default function MarkdownContent({ content }: Readonly<{ content: string }>) {
  return (
    <div className="min-w-0 text-foreground [&>*:first-child]:mt-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
