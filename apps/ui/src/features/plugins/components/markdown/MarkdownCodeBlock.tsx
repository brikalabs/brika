import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockInfo,
} from '@brika/clay';
import { Fragment, type ReactElement } from 'react';
import { useLocale } from '@/lib/use-locale';

interface MarkdownCodeBlockProps {
  code: string;
  language: string | null;
  filename: string | null;
}

export function MarkdownCodeBlock({ code, language, filename }: Readonly<MarkdownCodeBlockProps>) {
  const { t } = useLocale();

  return (
    <CodeBlock className="mb-4">
      <CodeBlockHeader>
        <CodeBlockInfo>
          {({ language, filename, lineCount }) => {
            const items = [
              language && (
                <span
                  key="lang"
                  className="rounded-md bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.2em]"
                >
                  {language}
                </span>
              ),
              filename && (
                <span key="file" className="min-w-0 truncate font-mono text-foreground/80">
                  {filename}
                </span>
              ),
              lineCount > 0 && (
                <span key="lines" className="text-muted-foreground">
                  {t('common:code.lines', {
                    count: lineCount,
                  })}
                </span>
              ),
            ].filter(Boolean);

            return (
              <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
                {items.map((item, i) => {
                  const key = (item as ReactElement).key ?? `info-${i}`;
                  return (
                    <Fragment key={key}>
                      {item}
                      {i < items.length - 1 && <span className="text-muted-foreground/50">/</span>}
                    </Fragment>
                  );
                })}
              </div>
            );
          }}
        </CodeBlockInfo>
        <CodeBlockActions>
          <CodeBlockCopyButton
            copyLabel={t('common:actions.copy')}
            copiedLabel={t('common:messages.copied')}
          />
        </CodeBlockActions>
      </CodeBlockHeader>
      <CodeBlockContent language={language} filename={filename} showLineNumbers>
        {code}
      </CodeBlockContent>
    </CodeBlock>
  );
}
