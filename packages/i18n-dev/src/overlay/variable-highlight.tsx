import i18next from 'i18next';
import type { ReactNode } from 'react';

interface TemplatePart {
  type: 'text' | 'var';
  content: string;
}

const SENTINEL = '\0';

type InterpolateFn = (s: string, d: object, lng: string, opts: object) => string;

interface Interpolator {
  interpolate: InterpolateFn;
}

/**
 * Structural guard that preserves the original object reference — i18next's
 * `interpolate` is a method whose `this` binding (and internal regex state)
 * must survive across calls, so we don't clone or zod-parse the value.
 */
function isInterpolator(value: unknown): value is Interpolator {
  if (value === null || typeof value !== 'object' || !('interpolate' in value)) {
    return false;
  }
  return typeof value.interpolate === 'function';
}

function getInterpolator(): Interpolator | null {
  const services: unknown = i18next.services;
  if (services === null || typeof services !== 'object' || !('interpolator' in services)) {
    return null;
  }
  const candidate = services.interpolator;
  return isInterpolator(candidate) ? candidate : null;
}

function splitTemplate(value: string): TemplatePart[] {
  const interpolator = getInterpolator();
  if (!interpolator) {
    return [{ type: 'text', content: value }];
  }

  const vars: string[] = [];
  const target: Record<string, string> = {};
  const data = new Proxy(target, {
    get(_, prop) {
      if (typeof prop !== 'string') {
        return undefined;
      }
      vars.push(prop);
      return `${SENTINEL}${prop}${SENTINEL}`;
    },
    has() {
      return true;
    },
  });

  const interpolated = interpolator.interpolate(value, data, i18next.language, {
    interpolation: { escapeValue: false },
  });

  if (vars.length === 0) {
    return [{ type: 'text', content: value }];
  }

  const varSet = new Set(vars);
  const parts: TemplatePart[] = [];
  for (const segment of interpolated.split(SENTINEL)) {
    if (segment.length === 0) {
      continue;
    }
    if (varSet.has(segment)) {
      parts.push({ type: 'var', content: `{{${segment}}}` });
    } else {
      parts.push({ type: 'text', content: segment });
    }
  }
  return parts;
}

export function VariableHighlight({ value }: Readonly<{ value: string }>): ReactNode {
  const parts = splitTemplate(value);
  if (parts.length <= 1 && parts[0]?.type === 'text') {
    return <>{value}</>;
  }
  return (
    <>
      {parts.map((part, i) =>
        part.type === 'var' ? (
          <span
            key={`var-${part.content}-${i}`}
            className="mx-0.5 inline-block rounded bg-indigo-500/20 px-1 font-semibold text-indigo-300"
          >
            {part.content}
          </span>
        ) : (
          <span key={`txt-${part.content.length}-${i}`}>{part.content}</span>
        )
      )}
    </>
  );
}
