/**
 * File-type identity used by every UI surface in the file browser.
 *
 * One module owns the mapping from extension → semantic kind → accent
 * colour token + icon, so the list rows, the preview panel, and any
 * future visualisation pick the same colour for the same file. Adding
 * a new extension here lights it up everywhere.
 */

import {
  Archive,
  Code,
  File as FileIcon,
  FileText,
  Folder,
  Image as ImageIcon,
  type LucideIcon,
  Music,
  Sheet,
  Video,
} from '@brika/sdk/ui-kit/icons';
import { extOf } from './path';

export type FileKind =
  | 'folder'
  | 'image'
  | 'video'
  | 'audio'
  | 'code'
  | 'document'
  | 'spreadsheet'
  | 'archive'
  | 'other';

export interface FileKindDescriptor {
  kind: FileKind;
  Icon: LucideIcon;
  /**
   * Tailwind text colour for the icon. Uses the workspace `data-N` palette
   * so the same hue appears on tinted backgrounds, preview headers, etc.
   */
  fg: string;
  /** Soft tinted background for icon medallions (10–15% opacity). */
  bg: string;
  /** Human label shown in the preview metadata block. */
  label: string;
}

const KIND_BY_EXT: Record<string, FileKind> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  avif: 'image',
  bmp: 'image',
  ico: 'image',
  mp4: 'video',
  mov: 'video',
  webm: 'video',
  mkv: 'video',
  avi: 'video',
  mp3: 'audio',
  wav: 'audio',
  flac: 'audio',
  ogg: 'audio',
  m4a: 'audio',
  ts: 'code',
  tsx: 'code',
  js: 'code',
  jsx: 'code',
  mjs: 'code',
  cjs: 'code',
  json: 'code',
  yaml: 'code',
  yml: 'code',
  toml: 'code',
  xml: 'code',
  html: 'code',
  css: 'code',
  sh: 'code',
  py: 'code',
  rs: 'code',
  go: 'code',
  txt: 'document',
  md: 'document',
  rtf: 'document',
  pdf: 'document',
  doc: 'document',
  docx: 'document',
  csv: 'spreadsheet',
  xls: 'spreadsheet',
  xlsx: 'spreadsheet',
  zip: 'archive',
  tar: 'archive',
  gz: 'archive',
  bz2: 'archive',
  '7z': 'archive',
  rar: 'archive',
};

const DESCRIPTORS: Record<FileKind, Omit<FileKindDescriptor, 'kind'>> = {
  folder: { Icon: Folder, fg: 'text-data-6', bg: 'bg-data-6/10', label: 'Folder' },
  image: { Icon: ImageIcon, fg: 'text-data-3', bg: 'bg-data-3/10', label: 'Image' },
  video: { Icon: Video, fg: 'text-data-4', bg: 'bg-data-4/10', label: 'Video' },
  audio: { Icon: Music, fg: 'text-data-7', bg: 'bg-data-7/10', label: 'Audio' },
  code: { Icon: Code, fg: 'text-data-1', bg: 'bg-data-1/10', label: 'Code' },
  document: { Icon: FileText, fg: 'text-data-5', bg: 'bg-data-5/10', label: 'Document' },
  spreadsheet: { Icon: Sheet, fg: 'text-data-2', bg: 'bg-data-2/10', label: 'Spreadsheet' },
  archive: { Icon: Archive, fg: 'text-data-8', bg: 'bg-data-8/10', label: 'Archive' },
  other: { Icon: FileIcon, fg: 'text-muted-foreground', bg: 'bg-muted', label: 'File' },
};

export function describeFile(name: string, isDirectory: boolean): FileKindDescriptor {
  if (isDirectory) {
    return { kind: 'folder', ...DESCRIPTORS.folder };
  }
  const kind = KIND_BY_EXT[extOf(name)] ?? 'other';
  return { kind, ...DESCRIPTORS[kind] };
}

/**
 * Map a file name to the preview kind the panel should render.
 *
 * Kept explicit (rather than derived from `FileKind`) so that decoding
 * binaries — `.docx`, `.rtf`, `.zip`, `.xlsx`, etc. — as text never
 * sneaks in. If an extension isn't here the panel falls back to the
 * generic "download to inspect" placeholder.
 */
export type PreviewKind = 'image' | 'pdf' | 'audio' | 'video' | 'text' | 'generic';

const PREVIEW_KIND_BY_EXT: Record<string, PreviewKind> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  avif: 'image',
  pdf: 'pdf',
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  flac: 'audio',
  m4a: 'audio',
  aac: 'audio',
  mp4: 'video',
  webm: 'video',
  mov: 'video',
  mkv: 'video',
  txt: 'text',
  json: 'text',
  md: 'text',
  csv: 'text',
  ts: 'text',
  tsx: 'text',
  js: 'text',
  jsx: 'text',
  yaml: 'text',
  yml: 'text',
  toml: 'text',
  xml: 'text',
  html: 'text',
  css: 'text',
};

export function previewKindFor(name: string): PreviewKind {
  return PREVIEW_KIND_BY_EXT[extOf(name)] ?? 'generic';
}

/**
 * Map a file extension to a Shiki language identifier used by Clay's
 * `CodeBlockContent` for syntax highlighting. Returns `null` for files
 * Shiki can't usefully colour (txt/md fall through to plain text).
 */
const SHIKI_LANG_BY_EXT: Record<string, string> = {
  ts: 'tsx',
  tsx: 'tsx',
  js: 'jsx',
  jsx: 'jsx',
  mjs: 'js',
  cjs: 'js',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  html: 'html',
  css: 'css',
  md: 'markdown',
  sh: 'bash',
  py: 'python',
  rs: 'rust',
  go: 'go',
  csv: 'csv',
};

export function shikiLanguageFor(name: string): string | null {
  return SHIKI_LANG_BY_EXT[extOf(name)] ?? null;
}
