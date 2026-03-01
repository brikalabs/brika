import { github, site } from '@/lib/config';
import { BrikaLogo } from './ui/brika-logo';

export function Footer() {
  return (
    <footer className="py-8">
      <div
        className="mx-auto mb-8 h-px max-w-xs bg-linear-to-r from-transparent via-border to-transparent"
        aria-hidden
      />
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BrikaLogo className="size-5" />
          <span>&copy; {new Date().getFullYear()} Brika Labs</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <a
            href={site.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            Docs
          </a>
          <a
            href={github.url}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            GitHub
          </a>
          <a
            href={github.licenseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            MIT License
          </a>
        </div>
      </div>
    </footer>
  );
}
