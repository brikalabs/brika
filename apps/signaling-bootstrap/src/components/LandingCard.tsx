import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from '@brika/clay';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, ExternalLink } from 'lucide-react';
import React, { useState } from 'react';
import { isValidHubName } from '@/lib/hub-name';

/**
 * Shown at the bare `hub.brika.dev/` URL. Pretty wordmark, tagline,
 * a Clay `<InputGroup>` for the hub-name picker, plus a footer with
 * help links.
 */
export function LandingCard(): React.ReactElement {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim().toLowerCase();
  const canSubmit = trimmed.length >= 4;

  const onSubmit = (e: React.SyntheticEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!isValidHubName(trimmed)) {
      setError(
        'Names are 4–32 chars: lowercase letters, digits, hyphens. Must start with a letter and end alphanumeric.'
      );
      return;
    }
    navigate({ to: '/$hubName', params: { hubName: trimmed } }).catch(() => {
      // Navigation failures (cancelled by a later push, etc.) are not
      // actionable here — the user can retype if it stays stuck.
    });
  };

  return (
    <Card className="w-full max-w-[440px]">
      <CardContent className="space-y-5 py-7 text-center">
        <div className="space-y-2">
          <CardTitle className="text-[22px]">BRIKA</CardTitle>
          <CardDescription>
            The remote-access shell for your home hub. Enter your hub name to connect.
          </CardDescription>
        </div>

        <form onSubmit={onSubmit} className="space-y-2 text-left">
          <label htmlFor="brika-hub-name" className="sr-only">
            Hub name
          </label>
          <InputGroup>
            <InputGroupAddon>
              <InputGroupText>hub.brika.dev/</InputGroupText>
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
              aria-label="Hub name"
              aria-invalid={error ? true : undefined}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="submit"
                variant="default"
                size="xs"
                disabled={!canSubmit}
                aria-label="Connect to hub"
              >
                Connect
                <ArrowRight />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {error && <p className="text-[12px] text-destructive">{error}</p>}
        </form>

        <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-[12.5px] text-muted-foreground">
          <a
            href="https://brika.dev"
            rel="noopener"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            brika.dev <ExternalLink className="size-3" />
          </a>
          <a
            href="https://github.com/brikalabs/brika"
            rel="noopener"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            GitHub <ExternalLink className="size-3" />
          </a>
          <a
            href="https://brika.dev/docs/remote-access"
            rel="noopener"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            Setup guide <ExternalLink className="size-3" />
          </a>
        </nav>
      </CardContent>
    </Card>
  );
}
