import React, { useState } from "react";
import { Button, Input, ScrollArea, Badge } from "@/components/ui";
import { ChevronRight, ChevronDown, Variable, Braces, Clock, Zap, Database, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface VariableInfo {
  name: string;
  source: string;
  type: string;
}

interface VariablePickerProps {
  variables: VariableInfo[];
  onInsert: (expression: string) => void;
  className?: string;
}

interface TreeNode {
  name: string;
  fullPath: string;
  type: string;
  source: string;
  children: TreeNode[];
}

function buildTree(variables: VariableInfo[]): TreeNode[] {
  const root: TreeNode[] = [];

  // Add trigger group
  const triggerNode: TreeNode = {
    name: "trigger",
    fullPath: "trigger",
    type: "object",
    source: "Event data",
    children: [
      { name: "type", fullPath: "trigger.type", type: "string", source: "trigger", children: [] },
      { name: "payload", fullPath: "trigger.payload", type: "object", source: "trigger", children: [] },
      { name: "source", fullPath: "trigger.source", type: "string", source: "trigger", children: [] },
      { name: "ts", fullPath: "trigger.ts", type: "number", source: "trigger", children: [] },
    ],
  };
  root.push(triggerNode);

  // Add prev
  root.push({
    name: "prev",
    fullPath: "prev",
    type: "any",
    source: "Previous block output",
    children: [],
  });

  // Add vars group
  const varsChildren: TreeNode[] = [];
  variables
    .filter((v) => v.name.startsWith("vars."))
    .forEach((v) => {
      varsChildren.push({
        name: v.name.replace("vars.", ""),
        fullPath: v.name,
        type: v.type,
        source: v.source,
        children: [],
      });
    });

  if (varsChildren.length > 0) {
    root.push({
      name: "vars",
      fullPath: "vars",
      type: "object",
      source: "Workflow variables",
      children: varsChildren,
    });
  }

  return root;
}

function TreeNodeItem({
  node,
  depth = 0,
  onInsert,
}: {
  node: TreeNode;
  depth?: number;
  onInsert: (expression: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const [copied, setCopied] = useState(false);
  const hasChildren = node.children.length > 0;

  const handleCopy = () => {
    const expr = `{{ ${node.fullPath} }}`;
    navigator.clipboard.writeText(expr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleInsert = () => {
    onInsert(`{{ ${node.fullPath} }}`);
  };

  const getIcon = () => {
    if (node.name === "trigger") return <Zap className="size-3.5 text-green-500" />;
    if (node.name === "prev") return <Clock className="size-3.5 text-blue-500" />;
    if (node.name === "vars") return <Database className="size-3.5 text-purple-500" />;
    return <Variable className="size-3.5 text-primary" />;
  };

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 py-1 px-2 rounded hover:bg-accent cursor-pointer group",
          "transition-colors",
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <button onClick={() => setExpanded(!expanded)} className="p-0.5 hover:bg-muted rounded">
            {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          </button>
        ) : (
          <span className="w-4" />
        )}

        {getIcon()}

        <span className="flex-1 text-sm font-mono truncate" onClick={handleInsert}>
          {node.name}
        </span>

        <Badge variant="outline" className="text-[10px] px-1 py-0">
          {node.type}
        </Badge>

        <button
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-muted rounded transition-opacity"
          title="Copy expression"
        >
          {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
        </button>
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNodeItem key={child.fullPath} node={child} depth={depth + 1} onInsert={onInsert} />
          ))}
        </div>
      )}
    </div>
  );
}

export function VariablePicker({ variables, onInsert, className }: VariablePickerProps) {
  const [search, setSearch] = useState("");
  const tree = buildTree(variables);

  const filteredTree = search
    ? tree.filter((node) => {
        const matchesNode = node.name.toLowerCase().includes(search.toLowerCase());
        const matchesChildren = node.children.some((c) =>
          c.name.toLowerCase().includes(search.toLowerCase()),
        );
        return matchesNode || matchesChildren;
      })
    : tree;

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="p-2 border-b">
        <Input
          placeholder="Search variables..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      <ScrollArea className="flex-1">
        <div className="py-1">
          {filteredTree.map((node) => (
            <TreeNodeItem key={node.fullPath} node={node} onInsert={onInsert} />
          ))}

          {filteredTree.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-4">No variables found</div>
          )}
        </div>
      </ScrollArea>

      <div className="p-2 border-t text-xs text-muted-foreground">
        Click to insert • <Braces className="size-3 inline" /> for expressions
      </div>
    </div>
  );
}
