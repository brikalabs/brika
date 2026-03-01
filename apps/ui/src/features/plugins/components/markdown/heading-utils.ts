import { isValidElement, type ReactNode } from 'react';

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export const headingStyles: Record<HeadingLevel, string> = {
  1: 'mt-6 mb-4 border-b border-border pb-2 font-bold text-2xl first:mt-0',
  2: 'mt-5 mb-3 border-b border-border pb-2 font-semibold text-xl first:mt-0',
  3: 'mt-4 mb-2 font-semibold text-lg first:mt-0',
  4: 'mt-3 mb-2 font-semibold text-base first:mt-0',
  5: 'mt-3 mb-2 font-semibold text-sm first:mt-0',
  6: 'mt-3 mb-2 font-semibold text-xs first:mt-0',
};

export function extractText(node: ReactNode): string {
  if (node === null || typeof node === 'boolean') {
    return '';
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractText).join(' ');
  }
  if (isValidElement(node)) {
    const props = node.props as {
      children?: ReactNode;
    };
    return extractText(props.children);
  }
  return '';
}

export function slugify(text: string) {
  return text
    .replaceAll(/<[^>]*>/g, '')
    .toLowerCase()
    .trim()
    .replaceAll(/[^\w\s-]/g, '')
    .replaceAll(/\s+/g, '-')
    .replaceAll(/-+/g, '-');
}
