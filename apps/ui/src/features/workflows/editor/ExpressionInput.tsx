import React, { useState, useRef, useEffect, useCallback } from "react";
import { Textarea, Input, ScrollArea } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Variable, Braces } from "lucide-react";

interface VariableInfo {
  name: string;
  source: string;
  type: string;
}

interface ExpressionInputProps {
  value: string;
  onChange: (value: string) => void;
  variables: VariableInfo[];
  placeholder?: string;
  multiline?: boolean;
  className?: string;
}

interface AutocompleteItem {
  label: string;
  insert: string;
  description: string;
  type: "variable" | "property";
}

export function ExpressionInput({
  value,
  onChange,
  variables,
  placeholder,
  multiline = false,
  className,
}: ExpressionInputProps) {
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteItems, setAutocompleteItems] = useState<AutocompleteItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  // Build autocomplete items from variables
  const buildAutocompleteItems = useCallback(
    (search: string): AutocompleteItem[] => {
      const items: AutocompleteItem[] = [];

      // Add all variables
      variables.forEach((v) => {
        if (!search || v.name.toLowerCase().includes(search.toLowerCase())) {
          items.push({
            label: v.name,
            insert: `{{ ${v.name} }}`,
            description: `${v.type} from ${v.source}`,
            type: "variable",
          });
        }
      });

      // Add common properties/paths
      const commonProps = [
        { name: "trigger.type", desc: "Event type" },
        { name: "trigger.payload", desc: "Event payload object" },
        { name: "trigger.source", desc: "Event source" },
        { name: "trigger.ts", desc: "Event timestamp" },
        { name: "prev", desc: "Previous block output" },
        { name: "vars", desc: "Workflow variables" },
      ];

      commonProps.forEach((p) => {
        if (!search || p.name.toLowerCase().includes(search.toLowerCase())) {
          if (!items.find((i) => i.label === p.name)) {
            items.push({
              label: p.name,
              insert: `{{ ${p.name} }}`,
              description: p.desc,
              type: "property",
            });
          }
        }
      });

      return items.slice(0, 10);
    },
    [variables],
  );

  // Check for {{ trigger and show autocomplete
  const checkForAutocomplete = useCallback(
    (text: string, cursor: number) => {
      // Look for {{ before cursor
      const beforeCursor = text.slice(0, cursor);
      const match = beforeCursor.match(/\{\{\s*(\w*)$/);

      if (match) {
        const search = match[1] || "";
        const items = buildAutocompleteItems(search);
        setAutocompleteItems(items);
        setShowAutocomplete(items.length > 0);
        setSelectedIndex(0);
      } else {
        setShowAutocomplete(false);
      }
    },
    [buildAutocompleteItems],
  );

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const newValue = e.target.value;
    const cursor = e.target.selectionStart || 0;
    setCursorPosition(cursor);
    onChange(newValue);
    checkForAutocomplete(newValue, cursor);
  };

  // Handle key navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showAutocomplete) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, autocompleteItems.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
      case "Tab":
        if (autocompleteItems[selectedIndex]) {
          e.preventDefault();
          insertAutocomplete(autocompleteItems[selectedIndex]);
        }
        break;
      case "Escape":
        setShowAutocomplete(false);
        break;
    }
  };

  // Insert autocomplete item
  const insertAutocomplete = (item: AutocompleteItem) => {
    const beforeCursor = value.slice(0, cursorPosition);
    const afterCursor = value.slice(cursorPosition);

    // Find the {{ and replace from there
    const match = beforeCursor.match(/\{\{\s*\w*$/);
    if (match) {
      const insertPoint = beforeCursor.length - match[0].length;
      const newValue = value.slice(0, insertPoint) + item.insert + afterCursor;
      onChange(newValue);

      // Move cursor after insertion
      const newCursor = insertPoint + item.insert.length;
      setTimeout(() => {
        inputRef.current?.setSelectionRange(newCursor, newCursor);
        inputRef.current?.focus();
      }, 0);
    }

    setShowAutocomplete(false);
  };

  // Close autocomplete on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        autocompleteRef.current &&
        !autocompleteRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowAutocomplete(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const commonProps = {
    value,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    placeholder: placeholder || "Type {{ for variables",
    className: cn("font-mono text-sm", className),
  };

  return (
    <div className="relative">
      {multiline ? (
        <Textarea ref={inputRef as React.RefObject<HTMLTextAreaElement>} {...commonProps} rows={4} />
      ) : (
        <Input ref={inputRef as React.RefObject<HTMLInputElement>} {...commonProps} />
      )}

      {/* Variable hint button */}
      <button
        type="button"
        className="absolute right-2 top-2 text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => {
          const items = buildAutocompleteItems("");
          setAutocompleteItems(items);
          setShowAutocomplete(true);
          setSelectedIndex(0);
          inputRef.current?.focus();
        }}
        title="Insert variable"
      >
        <Braces className="size-4" />
      </button>

      {/* Autocomplete dropdown */}
      {showAutocomplete && autocompleteItems.length > 0 && (
        <div
          ref={autocompleteRef}
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg overflow-hidden"
        >
          <ScrollArea className="max-h-48">
            {autocompleteItems.map((item, index) => (
              <button
                key={item.label}
                type="button"
                className={cn(
                  "w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-accent",
                  index === selectedIndex && "bg-accent",
                )}
                onClick={() => insertAutocomplete(item)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <Variable className="size-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs truncate">{item.label}</div>
                  <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                </div>
              </button>
            ))}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
