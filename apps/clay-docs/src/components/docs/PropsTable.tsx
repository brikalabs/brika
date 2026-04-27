import docgen from 'virtual:clay-docgen';

interface PropsTableProps {
  /** displayName as exported by the component (e.g. "Button", "ProgressDisplay"). */
  readonly displayName: string;
}

const LITERAL_LIMIT = 10;

interface ParsedType {
  readonly raw: string;
  readonly literals: readonly string[] | null;
}

/**
 * If the type is a union of string / number / boolean literals, return the
 * literals so the row can render them as chips. Returns null for anything
 * else (object types, references, complex unions).
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

interface PropRowProps {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly defaultValue: string | null;
  readonly description: string;
}

function PropRow({ name, type, required, defaultValue, description }: PropRowProps) {
  const parsed = parseType(type);
  return (
    <li className="group grid grid-cols-1 gap-2 px-5 py-4 transition-colors hover:bg-clay-canvas/40 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-6">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <code className="break-all font-mono font-semibold text-base text-clay-strong">
            {name}
          </code>
          {!required && (
            <span aria-hidden className="font-mono text-clay-inactive text-sm">
              ?
            </span>
          )}
          <span className="font-mono text-clay-inactive text-sm">:</span>
          {parsed.literals ? (
            <span className="flex flex-wrap items-center gap-1">
              {parsed.literals.map((literal, index) => (
                <span key={literal} className="flex items-center gap-1">
                  {index > 0 && (
                    <span aria-hidden className="font-mono text-clay-inactive text-xs">
                      |
                    </span>
                  )}
                  <code className="font-mono text-[0.8125rem] text-clay-subtle">{literal}</code>
                </span>
              ))}
            </span>
          ) : (
            <code className="break-all font-mono text-[0.8125rem] text-clay-subtle">{parsed.raw}</code>
          )}
        </div>
        {description ? (
          <p className="text-[0.8125rem] text-clay-default leading-snug">{description}</p>
        ) : (
          <p className="text-[0.8125rem] text-clay-inactive italic leading-snug">
            No description yet.
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-start gap-1.5 sm:flex-col sm:items-end sm:gap-1">
        {required ? (
          <span
            title="Required"
            className="inline-flex items-center rounded bg-clay-brand/12 px-1.5 py-px font-medium font-mono text-[0.5625rem] text-clay-brand uppercase tracking-[0.12em]"
          >
            Required
          </span>
        ) : (
          <span className="inline-flex items-center rounded border border-clay-hairline px-1.5 py-px font-medium font-mono text-[0.5625rem] text-clay-inactive uppercase tracking-[0.12em]">
            Optional
          </span>
        )}
        {defaultValue !== null && (
          <span className="inline-flex items-center gap-1 font-mono text-[0.6875rem]">
            <span className="text-clay-inactive uppercase tracking-[0.12em]">Default</span>
            <code className="text-clay-default">{defaultValue}</code>
          </span>
        )}
      </div>
    </li>
  );
}

/**
 * Render the prop reference for a Clay component.
 *
 * Props come from `react-docgen-typescript` via the `virtual:clay-docgen`
 * Vite plugin. Required props are listed first, then alphabetical.
 * Literal-union types render as chips; everything else as a code block.
 * Descriptions are pulled from TSDoc comments on the prop type.
 */
export function PropsTable({ displayName }: PropsTableProps) {
  const entry = docgen[displayName];

  if (!entry || entry.props.length === 0) {
    return (
      <div className="not-prose rounded-lg border border-clay-hairline border-dashed bg-clay-canvas/30 px-4 py-6 text-center">
        <p className="font-mono text-clay-subtle text-sm">
          No documented props for <code className="text-clay-default">{displayName}</code>.
        </p>
        <p className="mt-1 text-[0.75rem] text-clay-inactive">
          Add a TSDoc comment next to the prop type and they will appear here automatically.
        </p>
      </div>
    );
  }

  const requiredCount = entry.props.filter((p) => p.required).length;
  const optionalCount = entry.props.length - requiredCount;

  return (
    <section className="not-prose flex flex-col gap-3">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[0.6875rem] text-clay-subtle uppercase tracking-[0.12em]">
        <span>
          <span className="text-clay-strong">{entry.props.length}</span> prop
          {entry.props.length === 1 ? '' : 's'}
        </span>
        {requiredCount > 0 && (
          <>
            <span className="hairline w-4" aria-hidden />
            <span>
              <span className="text-clay-brand">{requiredCount}</span> required
            </span>
          </>
        )}
        {optionalCount > 0 && (
          <>
            <span className="hairline w-4" aria-hidden />
            <span>
              <span className="text-clay-default">{optionalCount}</span> optional
            </span>
          </>
        )}
      </header>

      <ul className="divide-y divide-clay-hairline overflow-hidden rounded-lg border border-clay-hairline bg-clay-canvas/30">
        {entry.props.map((prop) => (
          <PropRow
            key={prop.name}
            name={prop.name}
            type={prop.type}
            required={prop.required}
            defaultValue={prop.defaultValue}
            description={prop.description}
          />
        ))}
      </ul>
    </section>
  );
}
