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
      <div className="mb-3 flex items-center gap-2">
        <span aria-hidden="true" className="h-px flex-1 bg-clay-hairline" />
        <p className="font-medium font-mono text-[0.625rem] text-clay-subtle uppercase tracking-[0.12em]">
          On this page
        </p>
        <span aria-hidden="true" className="h-px flex-1 bg-clay-hairline" />
      </div>
      <ul className="space-y-1">
        {headings.map((heading) => {
          const active = heading.id === activeId;
          const indent = heading.level === 3 ? 'pl-5' : 'pl-2';
          return (
            <li key={heading.id}>
              <a
                href={`#${heading.id}`}
                className={
                  active
                    ? `block border-clay-brand border-l-2 py-0.5 ${indent} font-medium text-clay-strong text-xs leading-snug`
                    : `block border-transparent border-l-2 py-0.5 ${indent} text-clay-subtle text-xs leading-snug transition-colors hover:text-clay-default`
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
