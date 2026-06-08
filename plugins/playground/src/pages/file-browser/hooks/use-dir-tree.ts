import { useCallAction } from '@brika/sdk/ui-kit/hooks';
import { useCallback, useState } from 'react';
import { listEntries } from '../actions';
import { ROOT_PATH } from '../lib/path';

export interface TreeNode {
  id: string;
  label: string;
  children: TreeNode[] | null;
  loading: boolean;
}

/**
 * Manages the lazy-loaded directory tree for the sidebar.
 *
 * Each folder node starts with `children: null` (not yet fetched) and
 * `loading: false`. When the Tree fires `onExpand(id)` for a node that
 * has never been opened, `expandNode` fetches one directory level, marks
 * only the sub-folder entries as children (files are not shown in the
 * navigation tree), and stores the result.
 *
 * The root node for ROOT_PATH is seeded immediately so the tree always
 * has at least one visible item.
 */
export function useDirTree() {
  const callAction = useCallAction();

  const [root] = useState<TreeNode>(() => ({
    id: ROOT_PATH,
    label: 'data',
    children: null,
    loading: false,
  }));

  const [nodes, setNodes] = useState<Record<string, TreeNode>>(() => ({
    [ROOT_PATH]: root,
  }));

  const updateNode = useCallback((id: string, patch: Partial<TreeNode>) => {
    setNodes((prev) => {
      const existing = prev[id];
      if (!existing) {
        return prev;
      }
      return { ...prev, [id]: { ...existing, ...patch } };
    });
  }, []);

  const registerChildren = useCallback((parentId: string, childNodes: TreeNode[]) => {
    setNodes((prev) => {
      const next = { ...prev };
      for (const child of childNodes) {
        next[child.id] = child;
      }
      const parent = next[parentId];
      if (parent) {
        next[parentId] = { ...parent, children: childNodes, loading: false };
      }
      return next;
    });
  }, []);

  const expandNode = useCallback(
    async (id: string) => {
      const node = nodes[id];
      // Only fetch if we have not loaded children yet
      if (node?.children !== null) {
        return;
      }
      updateNode(id, { loading: true });
      try {
        const result = await callAction(listEntries, { path: id });
        const childNodes: TreeNode[] = result.entries
          .filter((e) => e.isDirectory)
          .map((e) => {
            const childId = `${id}/${e.name}`;
            return {
              id: childId,
              label: e.name,
              children: null,
              loading: false,
            };
          });
        registerChildren(id, childNodes);
      } catch {
        // On error leave children null so the node can be retried
        updateNode(id, { loading: false });
      }
    },
    [nodes, callAction, updateNode, registerChildren]
  );

  return { nodes, expandNode };
}
