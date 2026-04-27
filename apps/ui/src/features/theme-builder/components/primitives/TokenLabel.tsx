/**
 * TokenLabel — the small field-subhead row that pairs a human label
 * with its CSS custom-property name on the right.
 *
 *   Radius                                              --radius
 */

interface TokenLabelProps {
  children: React.ReactNode;
  cssVar?: string;
  /** Optional right-hand hint shown in place of the css var. */
  hint?: React.ReactNode;
}

export function TokenLabel({ children, cssVar, hint }: Readonly<TokenLabelProps>) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-medium text-xs">{children}</span>
      {cssVar && <span className="font-mono text-[10px] text-muted-foreground">{cssVar}</span>}
      {!cssVar && hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
    </div>
  );
}
