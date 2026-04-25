import { useEffect, useRef, useState } from 'react';

interface Heading {
  readonly id: string;
  readonly text: string;
  readonly level: number;
}

/**
 * Right-rail "On this page" navigation. Scans the article for `<h2>` and
 * `<h3>` elements with an `id`, builds a hierarchy, and highlights the
 * heading currently nearest the top of the viewport via IntersectionObserver.
 */
export function OnThisPage() {
  const [headings, setHeadings] = useState<readonly Heading[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const article = document.querySelector('[data-doc-article]');
    if (!article) {
      return;
    }
    const collected: Heading[] = [];
    for (const el of article.querySelectorAll<HTMLElement>('h2[id], h3[id]')) {
      collected.push({
        id: el.id,
        text: el.textContent?.trim() ?? '',
        level: el.tagName === 'H2' ? 2 : 3,
      });
    }
    setHeadings(collected);
    if (collected.length > 0) {
      setActiveId(collected[0]?.id ?? null);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0 && visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: [0, 1] }
    );
    for (const el of article.querySelectorAll<HTMLElement>('h2[id], h3[id]')) {
      observer.observe(el);
    }
    observerRef.current = observer;
    return () => observer.disconnect();
  }, []);

  if (headings.length === 0) {
    return null;
  }

  return (
    <nav aria-label="On this page" className="text-sm">
      <p className="mb-3 font-medium font-mono text-[0.6875rem] text-clay-subtle uppercase tracking-wider">
        On this page
      </p>
      <ul className="space-y-1.5">
        {headings.map((heading) => {
          const active = heading.id === activeId;
          return (
            <li key={heading.id} className={heading.level === 3 ? 'pl-3' : ''}>
              <a
                href={`#${heading.id}`}
                className={
                  active
                    ? 'block border-clay-brand border-l-2 pl-2 font-medium text-clay-strong leading-snug'
                    : 'block border-transparent border-l-2 pl-2 text-clay-subtle leading-snug transition-colors hover:text-clay-default'
                }
              >
                {heading.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
