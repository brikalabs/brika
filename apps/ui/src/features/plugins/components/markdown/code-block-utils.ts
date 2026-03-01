export function getLanguage(className?: string) {
  return className?.match(/language-([\w+-]+)/i)?.[1]?.toLowerCase() ?? null;
}

export function getFilename(node: unknown): string | null {
  if (!node || typeof node !== 'object') {
    return null;
  }

  const meta =
    (
      node as {
        data?: {
          meta?: unknown;
        };
      }
    ).data?.meta ??
    (
      node as {
        properties?: {
          dataMeta?: unknown;
        };
      }
    ).properties?.dataMeta ??
    (
      node as {
        properties?: {
          meta?: unknown;
        };
      }
    ).properties?.meta ??
    (
      node as {
        meta?: unknown;
      }
    ).meta;

  if (typeof meta !== 'string') {
    return null;
  }

  const match = /filename\s*=\s*["']?([^"'\s]+)["']?/i.exec(meta);
  return match?.[1] ?? null;
}
