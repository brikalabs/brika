/**
 * CodeBlock is a context-driven primitive — its content is supplied via
 * a useCodeBlock hook, not props. The full setup is non-trivial for an
 * embedded demo card. Show a static preview that matches the rendered
 * output instead; the real component is documented in source.
 */
export function CodeBlockDefaultDemo() {
  return (
    <div className="w-full max-w-lg overflow-hidden rounded-lg border border-clay-hairline bg-clay-base">
      <div className="flex items-center justify-between border-clay-hairline border-b px-3 py-1.5">
        <span className="font-mono text-clay-subtle text-xs">save.tsx</span>
        <span className="font-mono text-[0.625rem] text-clay-inactive uppercase tracking-wider">
          tsx
        </span>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-clay-default text-xs leading-relaxed">
        <code>{`import { Button } from "@brika/clay/components/button";

export function Save() {
  return <Button>Save changes</Button>;
}`}</code>
      </pre>
    </div>
  );
}
