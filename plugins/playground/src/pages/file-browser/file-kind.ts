/**
 * File-type identity used by every UI surface in the file browser.
 *
 * One module owns the mapping from extension → semantic kind →
 * accent color token + icon, so the list rows, the preview panel,
 * and any future visualisation pick the same colour for the same
 * file. Adding a new extension here lights it up everywhere.
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
import { extOf } from './helpers';

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
  folder: {
    Icon: Folder,
    fg: 'text-data-6',
    bg: 'bg-data-6/10',
    label: 'Folder',
  },
  image: {
    Icon: ImageIcon,
    fg: 'text-data-3',
    bg: 'bg-data-3/10',
    label: 'Image',
  },
  video: {
    Icon: Video,
    fg: 'text-data-4',
    bg: 'bg-data-4/10',
    label: 'Video',
  },
  audio: {
    Icon: Music,
    fg: 'text-data-7',
    bg: 'bg-data-7/10',
    label: 'Audio',
  },
  code: {
    Icon: Code,
    fg: 'text-data-1',
    bg: 'bg-data-1/10',
    label: 'Code',
  },
  document: {
    Icon: FileText,
    fg: 'text-data-5',
    bg: 'bg-data-5/10',
    label: 'Document',
  },
  spreadsheet: {
    Icon: Sheet,
    fg: 'text-data-2',
    bg: 'bg-data-2/10',
    label: 'Spreadsheet',
  },
  archive: {
    Icon: Archive,
    fg: 'text-data-8',
    bg: 'bg-data-8/10',
    label: 'Archive',
  },
  other: {
    Icon: FileIcon,
    fg: 'text-muted-foreground',
    bg: 'bg-muted',
    label: 'File',
  },
};

export function describeFile(name: string, isDirectory: boolean): FileKindDescriptor {
  if (isDirectory) {
    return { kind: 'folder', ...DESCRIPTORS.folder };
  }
  const kind = KIND_BY_EXT[extOf(name)] ?? 'other';
  return { kind, ...DESCRIPTORS[kind] };
}
