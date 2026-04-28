/**
 * Allow CSS custom properties (`--my-var`) on `React.CSSProperties` so
 * components can write `style={{ '--normal-bg': 'var(--popover)' }}`
 * without cast gymnastics. React's stock typing only covers standard
 * properties.
 */

declare module 'react' {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined;
  }
}

export {};
