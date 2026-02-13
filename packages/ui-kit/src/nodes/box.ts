import { normalizeChildren, type BaseNode, type Child, type ComponentNode } from './_shared';

export interface BoxNode extends BaseNode {
  type: 'box';
  children: ComponentNode[];

  /** CSS color or gradient string (e.g. "#ff6b35", "linear-gradient(...)") */
  background?: string;
  /** Background image URL */
  backgroundImage?: string;
  /** How the background image fits */
  backgroundFit?: 'cover' | 'contain' | 'fill';
  /** Background image anchor position */
  backgroundPosition?: 'center' | 'top' | 'bottom' | 'left' | 'right';
  /** Backdrop blur level (glassmorphism) */
  blur?: 'sm' | 'md' | 'lg';
  /** Background layer opacity (0-1), useful with backgroundImage + background overlay */
  opacity?: number;
  /** Inner padding */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Border radius */
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  /** Fill available space (flex-1) */
  grow?: boolean;
}

export function Box(props: {
  background?: string;
  backgroundImage?: string;
  backgroundFit?: 'cover' | 'contain' | 'fill';
  backgroundPosition?: 'center' | 'top' | 'bottom' | 'left' | 'right';
  blur?: 'sm' | 'md' | 'lg';
  opacity?: number;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  grow?: boolean;
  children?: Child | Child[];
}): BoxNode {
  const { children, ...rest } = props;
  return { type: 'box', ...rest, children: normalizeChildren(children) };
}

declare module './_shared' {
  interface NodeTypeMap {
    box: BoxNode;
  }
}
