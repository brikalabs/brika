import type { IconName } from 'lucide-react/dynamic';
import dynamicIconImports from 'lucide-react/dynamicIconImports';

function isIconName(icon: string): icon is IconName {
  return icon in dynamicIconImports;
}

/** Validate an arbitrary icon string against the lucide catalog. */
export function toIconName(icon: string | undefined, fallback: IconName = 'box'): IconName {
  return icon && isIconName(icon) ? icon : fallback;
}
