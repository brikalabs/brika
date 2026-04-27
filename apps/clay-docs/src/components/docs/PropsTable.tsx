import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import docgen from 'virtual:clay-docgen';

/**
 * Markdown overrides for prop descriptions. Keeps Clay's typography by
 * routing each tag through the same Tailwind classes the rest of the
 * docs site uses (mono code spans, link styles, list spacing).
 *
 * Headings are intentionally downgraded — a prop blurb shouldn't outrank
 * the page's section headings, so any `#` becomes a bold span.
 */
const propMarkdownComponents: Components = {
  p: ({ children }) => <span>{children}</span>,
  code: ({ children }) => (
    <code className="rounded border border-clay-hairline bg-clay-base px-1 py-px font-mono text-[0.8125rem] text-clay-default">
      {children}
    </code>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-clay-link underline-offset-2 hover:underline"
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
      target={href?.startsWith('http') ? '_blank' : undefined}
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-clay-strong">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
};

interface PropsTableProps {
  /** displayName as exported by the component (e.g. "Button", "ProgressDisplay"). */
  readonly displayName: string;
}

const LITERAL_LIMIT = 12;

interface ParsedType {
  readonly raw: string;
  readonly literals: readonly string[] | null;
}

/**
 * If the type is a union of string / number / boolean literals, return the
 * literals so the row can render them as a real TS-style union. Returns
 * null for everything else — those render as the raw type signature.
 */
function parseType(raw: string): ParsedType {
  const parts = raw.split('|').map((p) => p.trim());
  if (parts.length < 2 || parts.length > LITERAL_LIMIT) {
    return { raw, literals: null };
  }
  const literals: string[] = [];
  for (const part of parts) {
    const isStringLiteral = /^"[^"]*"$/.test(part) || /^'[^']*'$/.test(part);
    const isNumberLiteral = /^-?\d+(\.\d+)?$/.test(part);
    const isBoolOrNullish = part === 'true' || part === 'false' || part === 'null';
    if (!(isStringLiteral || isNumberLiteral || isBoolOrNullish)) {
      return { raw, literals: null };
    }
    literals.push(part);
  }
  return { raw, literals };
}

function TypeSignature({ raw, literals }: ParsedType) {
  if (!literals) {
    return <span className="text-clay-default">{raw}</span>;
  }
  return (
    <span className="text-clay-subtle">
      {literals.map((literal, index) => (
        <span key={literal}>
          {index > 0 && <span className="text-clay-inactive"> | </span>}
          <span className="text-clay-default">{literal}</span>
        </span>
      ))}
    </span>
  );
}

/**
 * Render the prop reference as a vertical block list — name + default on
 * the first line, the TypeScript-style type on its own line (full width),
 * and the description below. Long literal unions wrap naturally without
 * being squeezed into a narrow table column.
 *
 * Props come from `react-docgen-typescript` via the `virtual:clay-docgen`
 * Vite plugin. Required props are listed first, then alphabetical.
 */
export function PropsTable({ displayName }: PropsTableProps) {
  const entry = docgen[displayName];

  if (!entry || entry.props.length === 0) {
    return (
      <div className="not-prose rounded-md border border-clay-hairline border-dashed bg-clay-canvas/30 px-4 py-6 text-center">
        <p className="font-mono text-clay-subtle text-sm">
          <span className="font-semibold text-clay-default">{displayName}</span> exposes no
          wrapper-specific props.
        </p>
        <p className="mt-1 max-w-xl mx-auto text-[0.75rem] text-clay-inactive leading-relaxed">
          All props pass through to the underlying HTML / Radix primitive — see the component
          source linked above for the full type signature.
        </p>
      </div>
    );
  }

  return (
    <section className="not-prose">
      <ul className="divide-y divide-clay-hairline border-clay-hairline border-y">
        {entry.props.map((prop) => {
          const parsed = parseType(prop.type);
          const slug = `prop-${prop.name}`;
          return (
            <li key={prop.name} id={slug} className="scroll-mt-24 py-4">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <a
                  href={`#${slug}`}
                  className="font-mono font-semibold text-[0.9375rem] text-clay-strong hover:underline underline-offset-4"
                >
                  {prop.name}
                  {prop.required && (
                    <span aria-label="required" className="ml-0.5 text-clay-brand">
                      *
                    </span>
                  )}
                </a>
                {prop.defaultValue !== null && (
                  <span className="font-mono text-[0.75rem] text-clay-inactive">
                    default{' '}
                    <span className="text-clay-default">{prop.defaultValue}</span>
                  </span>
                )}
              </div>
              <div className="mb-2 font-mono text-[0.8125rem] leading-6 wrap-break-word">
                <TypeSignature {...parsed} />
              </div>
              {prop.description ? (
                <p className="max-w-[68ch] text-clay-default text-sm leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={propMarkdownComponents}>
                    {prop.description}
                  </ReactMarkdown>
                </p>
              ) : (
                <p className="max-w-[68ch] text-clay-inactive italic text-sm leading-relaxed">
                  No description yet.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
