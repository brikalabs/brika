import { github, site } from '@/lib/config';

export function Footer() {
  return (
    <footer className="border-t border-border py-8">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="flex size-5 items-center justify-center rounded-md corner-squircle bg-primary text-[8px] font-black text-primary-foreground">
            B
          </div>
          <span>&copy; {new Date().getFullYear()} Brika</span>
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
