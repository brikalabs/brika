import { Link as LinkIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { extractText, type HeadingLevel, headingStyles, slugify } from './heading-utils';

export function createHeading(level: HeadingLevel) {
  const Tag = `h${level}` as const;

  return function Heading({ children }: { children?: ReactNode }) {
    const id = slugify(extractText(children)) || 'heading';

    return (
      <Tag id={id} className={headingStyles[level]}>
        <a href={`#${id}`} className="group relative block text-inherit no-underline">
          <span
            className="absolute top-1/2 -left-6 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          >
            <LinkIcon className="size-4 text-muted-foreground" />
          </span>
          {children}
        </a>
      </Tag>
    );
  };
}
