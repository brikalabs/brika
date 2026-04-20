import { cva, type VariantProps } from 'class-variance-authority';
import { Check, Copy } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

// --- Variants ---

const codeBlockVariants = cva('overflow-hidden rounded-lg border border-border bg-muted/50', {
  variants: {
    variant: {
      default: '',
      subtle: 'border-transparent bg-muted/30',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

const codeBlockHeaderVariants = cva(
  'flex items-center gap-2 border-border border-b bg-muted/60 px-3 py-2',
  {
    variants: {
      variant: {
        default: '',
        flat: 'border-transparent bg-transparent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const codeBlockContentVariants = cva('m-0', {
  variants: {
    size: {
      default: 'p-4 text-sm leading-6',
      sm: 'p-3 text-xs leading-5',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

const codeBlockGutterVariants = cva(
  'select-none border-border/60 border-r bg-muted/40 px-3 font-mono text-muted-foreground tabular-nums',
  {
    variants: {
      size: {
        default: 'py-4 text-xs leading-6',
        sm: 'py-3 text-[10px] leading-5',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
);

// --- Types ---

type CodeToken = {
  content: string;
  color?: string;
  fontStyle?: number;
};

type CodeBlockContextValue = {
  code: string;
  lineCount: number;
  language: string | null;
  filename: string | null;
  setCodeInfo: (code: string, lineCount: number) => void;
  setLanguage: (language: string | null) => void;
  setFilename: (filename: string | null) => void;
};

// --- Context ---

const CodeBlockContext = React.createContext<CodeBlockContextValue | null>(null);

function useCodeBlockContext(component: string) {
  const context = React.useContext(CodeBlockContext);
  if (!context) {
    throw new Error(`${component} must be used within a CodeBlock`);
  }
  return context;
}

// --- Utilities ---

type HighlightResult = {
  tokens: CodeToken[][];
  foreground: string | null;
};

/** Load Shiki, verify language support, and tokenize the code. Returns null if
 *  the language is not bundled or tokenization fails. */
async function tokenizeWithShiki(
  code: string,
  language: string,
  theme: string
): Promise<HighlightResult | null> {
  const shiki = await import('shiki/bundle/web');
  const key = language.toLowerCase();
  if (!(key in shiki.bundledLanguages)) {
    return null;
  }

  try {
    const result = await shiki.codeToTokens(code, {
      lang: key as Parameters<typeof shiki.codeToTokens>[1]['lang'],
      theme,
    });
    return {
      tokens: result.tokens,
      foreground: result.fg ?? null,
    };
  } catch {
    return null;
  }
}

function getTokenStyle(token: CodeToken): React.CSSProperties {
  return {
    color: token.color,
    fontStyle: token.fontStyle && (token.fontStyle & 1) === 1 ? 'italic' : undefined,
    fontWeight: token.fontStyle && (token.fontStyle & 2) === 2 ? 600 : undefined,
    textDecoration: token.fontStyle && (token.fontStyle & 4) === 4 ? 'underline' : undefined,
  };
}

// --- Components ---

interface CodeBlockProps
  extends React.ComponentProps<'div'>,
    VariantProps<typeof codeBlockVariants> {}

function CodeBlock({ className, variant, ...props }: Readonly<CodeBlockProps>) {
  const [state, setState] = React.useState({
    code: '',
    lineCount: 0,
    language: null as string | null,
    filename: null as string | null,
  });

  const setCodeInfo = React.useCallback((code: string, lineCount: number) => {
    setState((prev) =>
      prev.code === code && prev.lineCount === lineCount
        ? prev
        : {
            ...prev,
            code,
            lineCount,
          }
    );
  }, []);

  const setLanguage = React.useCallback((language: string | null) => {
    setState((prev) =>
      prev.language === language
        ? prev
        : {
            ...prev,
            language,
          }
    );
  }, []);

  const setFilename = React.useCallback((filename: string | null) => {
    setState((prev) =>
      prev.filename === filename
        ? prev
        : {
            ...prev,
            filename,
          }
    );
  }, []);

  const contextValue = React.useMemo(
    () => ({
      ...state,
      setCodeInfo,
      setLanguage,
      setFilename,
    }),
    [state, setCodeInfo, setLanguage, setFilename]
  );

  return (
    <CodeBlockContext.Provider value={contextValue}>
      <div
        data-slot="code-block"
        className={cn(
          codeBlockVariants({
            variant,
          }),
          className
        )}
        {...props}
      />
    </CodeBlockContext.Provider>
  );
}

interface CodeBlockHeaderProps
  extends React.ComponentProps<'div'>,
    VariantProps<typeof codeBlockHeaderVariants> {}

function CodeBlockHeader({ className, variant, ...props }: Readonly<CodeBlockHeaderProps>) {
  return (
    <div
      data-slot="code-block-header"
      className={cn(
        codeBlockHeaderVariants({
          variant,
        }),
        className
      )}
      {...props}
    />
  );
}

// --- Header Components ---

/** Render prop component that provides code block data. */
type CodeBlockInfoData = {
  code: string;
  lineCount: number;
  language: string | null;
  filename: string | null;
};

function CodeBlockInfo({
  children,
}: Readonly<{
  children: (data: CodeBlockInfoData) => React.ReactNode;
}>) {
  const { code, lineCount, language, filename } = useCodeBlockContext('CodeBlockInfo');
  return (
    <>
      {children({
        code,
        lineCount,
        language,
        filename,
      })}
    </>
  );
}

/** Hook to access code block context data. */
function useCodeBlock() {
  return useCodeBlockContext('useCodeBlock');
}

/** Actions container (right side of header). */
function CodeBlockActions({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="code-block-actions"
      className={cn('ml-auto flex items-center gap-1', className)}
      {...props}
    />
  );
}

interface CodeBlockCopyButtonProps extends React.ComponentProps<typeof Button> {
  value?: string;
  copiedLabel?: string;
  copyLabel?: string;
  resetDelayMs?: number;
}

function CodeBlockCopyButton({
  className,
  variant = 'ghost',
  size = 'icon',
  onClick,
  value,
  copiedLabel = 'Copied',
  copyLabel = 'Copy code',
  resetDelayMs = 1500,
  ...props
}: Readonly<CodeBlockCopyButtonProps>) {
  const [copied, setCopied] = React.useState(false);
  const timeoutRef = React.useRef<number | null>(null);
  const { code } = useCodeBlockContext('CodeBlockCopyButton');
  const copyValue = value ?? code;

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        globalThis.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || !navigator?.clipboard || !copyValue) {
      return;
    }

    try {
      await navigator.clipboard.writeText(copyValue);
      setCopied(true);
      if (timeoutRef.current) {
        globalThis.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = globalThis.setTimeout(() => setCopied(false), resetDelayMs);
    } catch {
      // Ignore clipboard failures
    }
  };

  const label = copied ? copiedLabel : copyLabel;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          data-slot="code-block-copy"
          variant={variant}
          size={size}
          className={cn('size-8', className)}
          onClick={handleCopy}
          aria-label={props['aria-label'] ?? label}
          type="button"
          {...props}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

interface CodeBlockContentProps
  extends React.ComponentProps<'div'>,
    VariantProps<typeof codeBlockContentVariants> {
  language?: string | null;
  filename?: string | null;
  theme?: string;
  showLineNumbers?: boolean;
  lineNumberStart?: number;
}

function CodeBlockContent({
  className,
  size,
  language: languageProp,
  filename: filenameProp,
  theme = 'catppuccin-mocha',
  showLineNumbers = true,
  lineNumberStart = 1,
  children,
  ...props
}: Readonly<CodeBlockContentProps>) {
  const { setCodeInfo, setLanguage, setFilename } = useCodeBlockContext('CodeBlockContent');
  const [highlightTokens, setHighlightTokens] = React.useState<CodeToken[][] | null>(null);
  const [foreground, setForeground] = React.useState<string | null>(null);

  const code = React.useMemo(() => {
    if (typeof children === 'string') {
      return children;
    }
    if (Array.isArray(children)) {
      return children.filter((child) => typeof child === 'string').join('');
    }
    return '';
  }, [children]);

  const normalizedCode = React.useMemo(() => code.replace(/\n$/, ''), [code]);
  const lines = React.useMemo(() => normalizedCode.split('\n'), [normalizedCode]);

  // Set language and filename in context
  React.useEffect(() => {
    setLanguage(languageProp ?? null);
  }, [languageProp, setLanguage]);

  React.useEffect(() => {
    setFilename(filenameProp ?? null);
  }, [filenameProp, setFilename]);

  React.useEffect(() => {
    if (!languageProp) {
      setHighlightTokens(null);
      setForeground(null);
      return;
    }

    let cancelled = false;

    tokenizeWithShiki(normalizedCode, languageProp, theme).then((result) => {
      if (cancelled) {
        return;
      }
      setHighlightTokens(result?.tokens ?? null);
      setForeground(result?.foreground ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, [languageProp, normalizedCode, theme]);

  React.useEffect(() => {
    setCodeInfo(normalizedCode, lines.length);
  }, [lines.length, normalizedCode, setCodeInfo]);

  const lineHeight = size === 'sm' ? 'h-5 leading-5' : 'h-6 leading-6';

  return (
    <div
      data-slot="code-block-content"
      className={cn(
        'grid min-w-0',
        showLineNumbers ? 'grid-cols-[auto_1fr]' : 'grid-cols-1',
        className
      )}
      {...props}
    >
      {showLineNumbers && (
        <div
          className={codeBlockGutterVariants({
            size,
          })}
          aria-hidden="true"
        >
          {lines.map((_, i) => (
            <div key={`ln-${lineNumberStart + i}`} className={cn('text-right', lineHeight)}>
              {lineNumberStart + i}
            </div>
          ))}
        </div>
      )}
      <div className="min-w-0 overflow-x-auto">
        <pre
          className={codeBlockContentVariants({
            size,
          })}
        >
          <code
            data-slot="code-block-code"
            className="block font-mono"
            style={{
              color: foreground ?? undefined,
            }}
          >
            {lines.map((line, i) => {
              const tokens = highlightTokens?.[i];
              return (
                <span
                  key={`line-${lineNumberStart + i}`}
                  className={cn('block min-h-6 whitespace-pre', lineHeight)}
                >
                  {tokens?.length
                    ? tokens.map((token, j) => (
                        <span key={`${lineNumberStart + i}-${j}`} style={getTokenStyle(token)}>
                          {token.content}
                        </span>
                      ))
                    : line || ' '}
                </span>
              );
            })}
          </code>
        </pre>
      </div>
    </div>
  );
}

export {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockInfo,
  type CodeBlockInfoData,
  codeBlockVariants,
  useCodeBlock,
};
