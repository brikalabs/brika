import { capture } from '@brika/sdk';
import { Tree, TreeItem } from '@brika/sdk/ui-kit';
import { useLocale } from '@brika/sdk/ui-kit/hooks';
import { type ReactNode, useCallback } from 'react';
import type { TreeNode } from '../hooks/use-dir-tree';
import { ROOT_PATH } from '../lib/path';

interface DirectoryTreeProps {
  readonly nodes: Readonly<Record<string, TreeNode>>;
  readonly currentPath: string;
  readonly onNavigate: (path: string) => void;
  readonly onExpand: (id: string) => void;
}

function renderNode(node: TreeNode, nodes: Readonly<Record<string, TreeNode>>): ReactNode {
  const hasChildren = node.children !== null && node.children.length > 0;
  const isLazy = node.children === null;

  return (
    <TreeItem
      key={node.id}
      nodeId={node.id}
      label={node.label}
      lazy={isLazy}
      loading={node.loading}
    >
      {hasChildren
        ? node.children.map((child) => {
            const childNode = nodes[child.id] ?? child;
            return renderNode(childNode, nodes);
          })
        : null}
    </TreeItem>
  );
}

/**
 * Sidebar directory tree. Only folder nodes are shown; files are browsed
 * in the main EntryList. Children are fetched lazily on first expand via
 * the Tree's `onExpand` callback.
 */
export function DirectoryTree({ nodes, currentPath, onNavigate, onExpand }: DirectoryTreeProps) {
  const { t } = useLocale();
  const rootNode = nodes[ROOT_PATH];

  const handleSelectedChange = useCallback(
    (ids: string[]) => {
      const id = ids[0];
      if (id && id !== currentPath) {
        capture('playground.folder_opened');
        onNavigate(id);
      }
    },
    [currentPath, onNavigate]
  );

  if (!rootNode) {
    return null;
  }

  return (
    <nav
      aria-label={t('fileBrowser.tree.label')}
      className="w-60 shrink-0 overflow-y-auto rounded-lg border border-border bg-card p-2"
    >
      <Tree
        selectedIds={[currentPath]}
        onSelectedChange={handleSelectedChange}
        defaultExpandedIds={[ROOT_PATH]}
        onExpand={onExpand}
        showIcons
        showLines
      >
        {renderNode(rootNode, nodes)}
      </Tree>
    </nav>
  );
}
