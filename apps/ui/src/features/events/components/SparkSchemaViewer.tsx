import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface SparkSchemaViewerProps {
  schema?: Record<string, unknown>;
}

export function SparkSchemaViewer({ schema }: SparkSchemaViewerProps) {
  const [expanded, setExpanded] = useState(false);

  if (!schema) {
    return <span className="text-muted-foreground text-xs italic">No schema</span>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(!expanded);
        }}
        className="flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <span>Schema</span>
      </button>
      {expanded && (
        <div
          className="mt-2 max-h-48 overflow-auto rounded-md border bg-muted/50 p-2"
          onClick={(e) => e.stopPropagation()}
        >
          <pre className="font-mono text-xs">{JSON.stringify(schema, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
