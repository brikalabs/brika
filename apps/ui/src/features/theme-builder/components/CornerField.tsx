/**
 * CornerField — picker for the theme's corner geometry (round, squircle,
 * bevel, scoop, notch). Each option renders a small visual preview using
 * SVG or a CSS approximation so the user can see the shape inline.
 */

import { cn } from '@brika/clay';
import { useTranslation } from 'react-i18next';
import { CORNER_STYLES, type CornerStyle } from '../types';

interface CornerFieldProps {
  value: CornerStyle;
  onChange: (next: CornerStyle) => void;
  /** Base radius in rem used to size the previews proportionally. */
  radius: number;
}

const OPTION_IDS: readonly CornerStyle[] = ['round', 'squircle', 'bevel', 'scoop', 'notch'];

interface CornerPreviewProps {
  style: CornerStyle;
  size?: number;
  radius: number;
}

function CornerPreview({ style, size = 44, radius }: Readonly<CornerPreviewProps>) {
  // Clamp radius to a sensible screen value.
  const r = Math.min(Math.max(radius * 10, 4), size / 2);
  const stroke = 'var(--primary)';
  const fill = 'color-mix(in srgb, var(--primary) 12%, transparent)';

  if (style === 'round') {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <rect
          x={1}
          y={1}
          width={size - 2}
          height={size - 2}
          rx={r}
          ry={r}
          fill={fill}
          stroke={stroke}
          strokeWidth={1.5}
        />
      </svg>
    );
  }

  if (style === 'squircle') {
    // Superellipse approximation using two cubic beziers per corner.
    const k = r * 0.55; // handle offset — "squircle-ish" feel
    const w = size - 2;
    const h = size - 2;
    const d = `
      M 1 ${1 + r}
      C 1 ${1 + r - k}, ${1 + r - k} 1, ${1 + r} 1
      L ${1 + w - r} 1
      C ${1 + w - r + k} 1, ${1 + w} ${1 + r - k}, ${1 + w} ${1 + r}
      L ${1 + w} ${1 + h - r}
      C ${1 + w} ${1 + h - r + k}, ${1 + w - r + k} ${1 + h}, ${1 + w - r} ${1 + h}
      L ${1 + r} ${1 + h}
      C ${1 + r - k} ${1 + h}, 1 ${1 + h - r + k}, 1 ${1 + h - r}
      Z
    `;
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <path d={d} fill={fill} stroke={stroke} strokeWidth={1.5} />
      </svg>
    );
  }

  if (style === 'bevel') {
    const w = size - 2;
    const h = size - 2;
    const b = r;
    const d = `
      M ${1 + b} 1
      L ${1 + w - b} 1
      L ${1 + w} ${1 + b}
      L ${1 + w} ${1 + h - b}
      L ${1 + w - b} ${1 + h}
      L ${1 + b} ${1 + h}
      L 1 ${1 + h - b}
      L 1 ${1 + b}
      Z
    `;
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <path d={d} fill={fill} stroke={stroke} strokeWidth={1.5} />
      </svg>
    );
  }

  if (style === 'scoop') {
    const w = size - 2;
    const h = size - 2;
    const s = r;
    // Concave quarter arcs at each corner using 0-sweep quadratic.
    const d = `
      M ${1 + s} 1
      L ${1 + w - s} 1
      Q ${1 + w - s} ${1 + s}, ${1 + w} ${1 + s}
      L ${1 + w} ${1 + h - s}
      Q ${1 + w - s} ${1 + h - s}, ${1 + w - s} ${1 + h}
      L ${1 + s} ${1 + h}
      Q ${1 + s} ${1 + h - s}, 1 ${1 + h - s}
      L 1 ${1 + s}
      Q ${1 + s} ${1 + s}, ${1 + s} 1
      Z
    `;
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <path d={d} fill={fill} stroke={stroke} strokeWidth={1.5} />
      </svg>
    );
  }

  // notch — right-angle step
  const w = size - 2;
  const h = size - 2;
  const n = r;
  const d = `
    M ${1 + n} 1
    L ${1 + w} 1
    L ${1 + w} ${1 + h - n}
    L ${1 + w - n} ${1 + h - n}
    L ${1 + w - n} ${1 + h}
    L 1 ${1 + h}
    L 1 ${1 + n}
    L ${1 + n} ${1 + n}
    Z
  `;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <path d={d} fill={fill} stroke={stroke} strokeWidth={1.5} />
    </svg>
  );
}

export function CornerField({ value, onChange, radius }: Readonly<CornerFieldProps>) {
  const { t } = useTranslation('themeBuilder');
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{t('fields.corner.label')}</span>
        <span className="font-mono text-muted-foreground text-xs">--corner-shape</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {OPTION_IDS.map((id) => {
          const active = value === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              title={t(`fields.corner.options.${id}.hint`)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-md border px-2 py-2 text-[10px] transition-colors',
                active
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
              )}
            >
              <CornerPreview style={id} radius={radius} />
              <span className="font-medium">{t(`fields.corner.options.${id}.label`)}</span>
            </button>
          );
        })}
      </div>
      {!CORNER_STYLES.includes(value) && (
        <p className="text-muted-foreground text-xs">{t('fields.corner.fallback')}</p>
      )}
    </div>
  );
}
