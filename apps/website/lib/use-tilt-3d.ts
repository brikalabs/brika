import { useCallback, useRef } from 'react';

/**
 * Reusable 3D tilt effect driven by CSS custom properties.
 *
 * Sets `--mx`, `--my` (0–1 cursor position) and `--rx`, `--ry` (rotation deg)
 * on the element. Pair with CSS:
 *
 * ```css
 * transform: perspective(600px) rotateX(calc(var(--rx)*1deg)) rotateY(calc(var(--ry)*1deg));
 * ```
 */
export function useTilt3D(intensity = 10) {
  const ref = useRef<HTMLElement>(null);

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      el.style.setProperty('--mx', `${x}`);
      el.style.setProperty('--my', `${y}`);
      el.style.setProperty('--rx', `${(y - 0.5) * -intensity}`);
      el.style.setProperty('--ry', `${(x - 0.5) * intensity}`);
    },
    [intensity],
  );

  const onMouseLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0');
    el.style.setProperty('--ry', '0');
  }, []);

  return { ref, onMouseMove, onMouseLeave } as const;
}
