import { z } from 'zod';

const ValidationIssueSchema = z.object({
  type: z.enum([
    'missing-key',
    'missing-namespace',
    'missing-variable',
    'unknown-key',
    'dead-key',
    'plugin-error',
  ]),
  severity: z.enum(['error', 'warning']),
  namespace: z.string(),
  locale: z.string(),
  key: z.string().optional(),
  referenceLocale: z.string(),
  variables: z.array(z.string()).optional(),
  detail: z.string().optional(),
});

const CoverageEntrySchema = z.object({
  locale: z.string(),
  namespace: z.string(),
  totalKeys: z.number(),
  translatedKeys: z.number(),
  percentage: z.number(),
});

export const ValidationResultSchema = z.object({
  issues: z.array(ValidationIssueSchema),
  coverage: z.array(CoverageEntrySchema),
  timestamp: z.number(),
  referenceLocale: z.string(),
});

export const TranslationsBundleSchema = z.record(
  z.string(),
  z.record(z.string(), z.record(z.string(), z.unknown()))
);

const KeyUsageSchema = z.object({
  file: z.string(),
  line: z.number(),
});

export const KeyUsageMapSchema = z.object({
  keys: z.record(z.string(), z.array(KeyUsageSchema)),
  patterns: z.array(z.string()),
  opaqueNamespaces: z.array(z.string()),
  hasGlobalOpaque: z.boolean(),
});
