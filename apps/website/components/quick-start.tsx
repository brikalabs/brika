'use client';

import { type ComponentType, type ReactNode, useEffect, useState } from 'react';
import { FaApple, FaDocker, FaWindows } from 'react-icons/fa';
import { docker, site } from '@/lib/config';
import { cn } from '@/lib/utils';
import { AnimatedSection } from './ui/animated-section';
import { CopyButton } from './ui/copy-button';
import { Cmd, Comment, Cursor, Flag, Line, Terminal } from './ui/terminal';

type Tab = 'unix' | 'windows' | 'docker';
type Channel = 'stable' | 'next';

function getTabs(channel: Channel) {
  const isNext = channel === 'next';
  const dockerTag = isNext ? 'next' : 'latest';
  const dockerImage = `${docker.image}:${dockerTag}`;

  const tabs: {
    value: Tab;
    label: string;
    shortLabel: string;
    icon: ComponentType<{ className?: string }>;
    command: string;
    comment: string;
    note: string;
    body: ReactNode;
    output: string;
  }[] = [
    {
      value: 'unix',
      label: 'macOS / Linux',
      shortLabel: 'Unix',
      icon: FaApple,
      command: isNext
        ? `curl -fsSL ${site.url}/install.sh | bash -s next`
        : `curl -fsSL ${site.url}/install.sh | bash`,
      comment: isNext
        ? '# Install latest development build.'
        : '# One command. No sudo. No dependencies.',
      note: 'macOS (Intel & Apple Silicon) \u00b7 Linux (x64 & arm64)',
      output: '\u2713 Brika installed to ~/.brika/bin/brika',
      body: isNext ? (
        <>
          <Cmd>curl</Cmd> <Flag>-fsSL</Flag> <span>{site.url}/install.sh</span>{' '}
          <Flag>|</Flag> <Cmd>bash</Cmd> <Flag>-s</Flag> <span>next</span>
        </>
      ) : (
        <>
          <Cmd>curl</Cmd> <Flag>-fsSL</Flag> <span>{site.url}/install.sh</span>{' '}
          <Flag>|</Flag> <Cmd>bash</Cmd>
        </>
      ),
    },
    {
      value: 'windows',
      label: 'Windows',
      shortLabel: 'Win',
      icon: FaWindows,
      command: isNext
        ? `irm ${site.url}/install.ps1 -out i.ps1; ./i.ps1 next`
        : `iwr -useb ${site.url}/install.ps1 | iex`,
      comment: isNext
        ? '# Install latest development build.'
        : '# PowerShell one-liner. No admin required.',
      note: 'PowerShell 5.1+ \u00b7 Windows 10/11 (x64 & arm64)',
      output: '\u2713 Brika installed successfully',
      body: isNext ? (
        <>
          <Cmd>irm</Cmd> <span>{site.url}/install.ps1</span> <Flag>-out</Flag>{' '}
          <span>i.ps1</span><Flag>;</Flag> <Cmd>./i.ps1</Cmd> <span>next</span>
        </>
      ) : (
        <>
          <Cmd>iwr</Cmd> <Flag>-useb</Flag> <span>{site.url}/install.ps1</span>{' '}
          <Flag>|</Flag> <Cmd>iex</Cmd>
        </>
      ),
    },
    {
      value: 'docker',
      label: 'Docker',
      shortLabel: 'Docker',
      icon: FaDocker,
      command: `docker run -d -p ${docker.port}:${docker.port} --name brika ${dockerImage}`,
      comment: isNext
        ? '# Run latest development build from GHCR.'
        : '# Pull and run. That\u2019s it.',
      note: `Docker 20+ \u00b7 Exposes on port ${docker.port} \u00b7 Works on any OS`,
      output: `\u2713 Container started on http://localhost:${docker.port}`,
      body: (
        <>
          <Cmd>docker</Cmd> <Flag>run -d -p</Flag>{' '}
          <span>
            {docker.port}:{docker.port}
          </span>{' '}
          <Flag>--name</Flag> <span>brika {dockerImage}</span>
        </>
      ),
    },
  ];

  return tabs;
}

const prompts: Record<Tab, string> = {
  unix: '$',
  windows: '>',
  docker: '$',
};

export function QuickStart() {
  const [active, setActive] = useState<Tab>('unix');
  const [channel, setChannel] = useState<Channel>('stable');

  useEffect(() => {
    if (navigator.userAgent.toLowerCase().includes('win')) {
      setActive('windows');
    }
  }, []);

  const tabs = getTabs(channel);
  const current = tabs.find((t) => t.value === active) ?? tabs[0];

  return (
    <AnimatedSection id="install" className="py-20 md:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="mb-2 text-center text-3xl font-bold tracking-tight md:text-4xl">
          Quick Start
        </h2>
        <p className="mb-10 text-center text-muted-foreground">
          Install Brika in seconds. One command, no dependencies.
        </p>

        <div className="mx-auto max-w-2xl">
          <Terminal
            actions={
              <>
                <div className="flex items-center gap-1" role="tablist">
                  {tabs.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      role="tab"
                      aria-selected={active === t.value}
                      onClick={() => setActive(t.value)}
                      className={cn(
                        'flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium transition-colors cursor-pointer sm:gap-1.5 sm:px-3',
                        active === t.value
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <t.icon className="size-3.5" />
                      <span className="hidden sm:inline">{t.label}</span>
                      <span className="sm:hidden">{t.shortLabel}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="flex items-center rounded-full border border-code-border bg-code-bg p-0.5">
                    <button
                      type="button"
                      onClick={() => setChannel('stable')}
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-all cursor-pointer sm:px-2.5',
                        channel === 'stable'
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                      )}
                    >
                      stable
                    </button>
                    <button
                      type="button"
                      onClick={() => setChannel('next')}
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-all cursor-pointer sm:px-2.5',
                        channel === 'next'
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                      )}
                    >
                      next
                    </button>
                  </div>
                  <div className="border-l border-code-border pl-2 sm:pl-3">
                    <CopyButton value={current.command} />
                  </div>
                </div>
              </>
            }
          >
            <Comment>{current.comment}</Comment>
            <div className="h-3" />
            <Line prompt={prompts[active]}>
              <span className="break-all">{current.body}</span>
              <Cursor />
            </Line>
            <div className="h-2" />
            <div className="select-none text-xs text-primary/70">{current.output}</div>
          </Terminal>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            {channel === 'next' && (
              <span className="text-warning">Unstable dev build &middot; </span>
            )}
            {current.note}
          </p>
        </div>
      </div>
    </AnimatedSection>
  );
}
