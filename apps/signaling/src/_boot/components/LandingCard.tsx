import {
  Button,
  ButtonGroup,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@brika/clay';
import { ArrowRight, BookOpen, Code2, ExternalLink } from 'lucide-react';
import { type ReactElement, type SyntheticEvent, useEffect, useState } from 'react';
import { isValidHubName } from '@/lib/hub-name';
import { suggestHubName } from '@/lib/hub-storage';

/**
 * Shown at the bare `hub.brika.dev/` URL. `LoaderScreen` already
 * renders the `<Mark>` above every phase, so this card is just
 * heading + description + name picker + footer.
 */
export function LandingCard(): ReactElement {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim().toLowerCase();
  const canSubmit = isValidHubName(trimmed);

  // Pre-fill from `?hub=` query or the legacy `/<name>` path so users
  // arriving on an old URL just hit Enter.
  useEffect(() => {
    const hint = suggestHubName();
    if (hint) {
      setName(hint);
    }
  }, []);

  const onSubmit = (e: SyntheticEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!isValidHubName(trimmed)) {
      setError(
        'Names are 4–32 chars: lowercase letters, digits, hyphens. Must start with a letter and end alphanumeric.'
      );
      return;
    }
    // Pass the candidate name via `?hub=` only — DO NOT persist it yet.
    // `useBootstrap` will write it to localStorage after the WebRTC
    // handshake completes; that way a typo or a nonexistent hub doesn't
    // trap the user (they were stuck retrying the bad name on every
    // refresh until they manually cleared storage).
    globalThis.location.replace(`/?hub=${encodeURIComponent(trimmed)}`);
  };

  return (
    <Card className="w-full max-w-[420px] overflow-hidden border-border/60 shadow-foreground/5 shadow-xl">
      <CardContent className="space-y-6 px-7 pt-9 pb-7">
        <div className="flex flex-col items-center text-center">
          <CardTitle className="text-[17px] tracking-tight">Open a hub remotely</CardTitle>
          <CardDescription className="mt-1.5 max-w-[300px] text-[13px] leading-relaxed">
            Type the name your hub claimed and we'll connect over a direct, end-to-end-encrypted
            channel.
          </CardDescription>
        </div>

        <form onSubmit={onSubmit} className="space-y-2">
          <label htmlFor="brika-hub-name" className="sr-only">
            Hub name
          </label>
          <ButtonGroup className="w-full">
            <InputGroup className="flex-1">
              <InputGroupAddon>
                <InputGroupText className="font-mono text-[12.5px]">hub.brika.dev/</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                id="brika-hub-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) {
                    setError(null);
                  }
                }}
                placeholder="your-hub"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                autoFocus
                pattern="[a-z][a-z0-9-]{2,30}[a-z0-9]"
                maxLength={32}
                className="font-mono text-[13.5px]"
                aria-label="Hub name"
                aria-invalid={error ? true : undefined}
              />
            </InputGroup>
            <Button
              type="submit"
              size="icon"
              disabled={!canSubmit}
              aria-label="Connect to hub"
              title="Connect"
            >
              <ArrowRight />
            </Button>
          </ButtonGroup>
          {error && (
            <p className="px-1 text-[12px] text-destructive leading-snug" role="alert">
              {error}
            </p>
          )}
        </form>
      </CardContent>

      <CardFooter className="border-border/40 border-t bg-muted/30 px-3 py-2">
        <nav className="flex w-full items-center justify-center gap-1">
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <a href="https://brika.dev" rel="noopener">
              <ExternalLink className="size-3.5" />
              brika.dev
            </a>
          </Button>
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <a href="https://github.com/brikalabs/brika" rel="noopener">
              <Code2 className="size-3.5" />
              GitHub
            </a>
          </Button>
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <a href="https://brika.dev/docs/remote-access" rel="noopener">
              <BookOpen className="size-3.5" />
              Docs
            </a>
          </Button>
        </nav>
      </CardFooter>
    </Card>
  );
}
