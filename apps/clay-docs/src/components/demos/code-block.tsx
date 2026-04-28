import {
  CodeBlock,
  CodeBlockContent,
  CodeBlockHeader,
  CodeBlockInfo,
} from '@brika/clay';

const SAMPLE = `import { Button } from "@brika/clay/components/button";

export function Save() {
  return <Button>Save changes</Button>;
}`;

export function CodeBlockDefaultDemo() {
  return (
    <CodeBlock className="w-full max-w-lg">
      <CodeBlockHeader>
        <CodeBlockInfo>
          {({ filename, language }) => (
            <div className="flex min-w-0 flex-1 items-center justify-between gap-2 text-xs">
              <span className="font-mono text-muted-foreground">{filename}</span>
              <span className="font-mono text-[0.625rem] text-muted-foreground uppercase tracking-wider">
                {language}
              </span>
            </div>
          )}
        </CodeBlockInfo>
      </CodeBlockHeader>
      <CodeBlockContent language="tsx" filename="save.tsx" showLineNumbers={false}>
        {SAMPLE}
      </CodeBlockContent>
    </CodeBlock>
  );
}
