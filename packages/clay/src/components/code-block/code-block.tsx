import { cva, type VariantProps } from 'class-variance-authority';
import { Check, Copy } from 'lucide-react';
import * as React from 'react';
import { cn } from '../../primitives/cn';
import { Button } from '../button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../tooltip';

// --- Variants ---

const codeBlockVariants = cva(
  'font-(family-name:--code-block-font-family) overflow-hidden rounded-code-block border border-border bg-code-block-bg tracking-(--code-block-letter-spacing)',
  {
    variants: {
      variant: {
        default: '',
        subtle: 'border-transparent bg-muted/30',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

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

interface CodeBlockThemes {
  readonly light: string;
  readonly dark: string;
}

const DEFAULT_THEMES: CodeBlockThemes = {
  light: 'catppuccin-latte',
  dark: 'catppuccin-mocha',
};

type Mode = 'light' | 'dark';

/** Read the page's current mode from `<html data-mode="...">` or the legacy `.dark` class. */
function readMode(): Mode {
  if (typeof document === 'undefined') {
    return 'light';
  }
  const root = document.documentElement;
  if (root.dataset.mode === 'dark' || root.classList.contains('dark')) {
    return 'dark';
  }
  return 'light';
}

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

/** Load Shiki, verify language support, and tokenize the code with the theme
 *  matching the page's current mode. Returns null if the language is not
 *  bundled or tokenization fails. */
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

/** Subscribe to changes in the page's mode (data-mode / .dark on <html>). */
function useMode(): Mode {
  const [mode, setMode] = React.useState<Mode>(readMode);
  React.useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setMode(readMode()));
    observer.observe(root, { attributes: true, attributeFilter: ['data-mode', 'class'] });
    return () => observer.disconnect();
  }, []);
  return mode;
}

// --- Components ---

interface CodeBlockProps
  extends React.ComponentProps<'div'>,
    VariantProps<typeof codeBlockVariants> {
  /** Visual treatment; "subtle" drops the surrounding chrome. */
  variant?: VariantProps<typeof codeBlockVariants>['variant'];
}

function CodeBlock({ className, variant, ...props }: Readonly<CodeBlockProps>) {
  const [state, setState] = React.useState({
    code: '',
    lineCount: 0,
    language: null as string | null,
    filename: null as string | null,
  });

  const setCodeInfo = React.useCallback(
    (code: string, lineCount: number) => setState((prev) => ({ ...prev, code, lineCount })),
    []
  );
  const setLanguage = React.useCallback(
    (language: string | null) => setState((prev) => ({ ...prev, language })),
    []
  );
  const setFilename = React.useCallback(
    (filename: string | null) => setState((prev) => ({ ...prev, filename })),
    []
  );

  const contextValue = React.useMemo<CodeBlockContextValue>(
    () => ({ ...state, setCodeInfo, setLanguage, setFilename }),
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
    VariantProps<typeof codeBlockHeaderVariants> {
  /** Header treatment; "flat" removes the divider. */
  variant?: VariantProps<typeof codeBlockHeaderVariants>['variant'];
}

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
  /** The literal string copied to the clipboard. Falls back to the parent CodeBlock's code. */
  value?: string;
  /** Label flashed after a successful copy. */
  copiedLabel?: string;
  /** Label shown in the resting state. */
  copyLabel?: string;
  /** How long the "copied" state persists before reverting, in milliseconds. */
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
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
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
  /** Shiki language identifier (e.g. "tsx", "bash"). */
  language?: string | null;
  /** Optional filename label rendered in the header. */
  filename?: string | null;
  /**
   * Shiki theme pair. The light entry is used when the page is in light mode,
   * the dark entry under `data-mode="dark"` / `.dark`. Defaults to the
   * Catppuccin pair (`catppuccin-latte` / `catppuccin-mocha`).
   */
  themes?: CodeBlockThemes;
  /** Toggles the line-number gutter. */
  showLineNumbers?: boolean;
  /** Starting number when line numbers are shown. */
  lineNumberStart?: number;
  /** Density preset; "default" or "sm". */
  size?: VariantProps<typeof codeBlockContentVariants>['size'];
}

function CodeBlockContent({
  className,
  size,
  language: languageProp,
  filename: filenameProp,
  themes = DEFAULT_THEMES,
  showLineNumbers = true,
  lineNumberStart = 1,
  children,
  ...props
}: Readonly<CodeBlockContentProps>) {
  const { setCodeInfo, setLanguage, setFilename } = useCodeBlockContext('CodeBlockContent');
  const [highlightTokens, setHighlightTokens] = React.useState<CodeToken[][] | null>(null);
  const [foreground, setForeground] = React.useState<string | null>(null);
  const mode = useMode();
  const activeTheme = mode === 'dark' ? themes.dark : themes.light;

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

    tokenizeWithShiki(normalizedCode, languageProp, activeTheme).then((result) => {
      if (cancelled) {
        return;
      }
      setHighlightTokens(result?.tokens ?? null);
      setForeground(result?.foreground ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, [languageProp, normalizedCode, activeTheme]);

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
            style={{ color: foreground ?? undefined }}
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
