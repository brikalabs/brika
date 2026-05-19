import { registerCheck } from './registry';

const EXPECTED_SCHEMA_HOST = 'schema.brika.dev';
const EXPECTED_SCHEMA_URL = 'https://schema.brika.dev/plugin.schema.json';

registerCheck(({ pkg }) => {
  const { $schema: schemaUrl } = pkg;
  if (!schemaUrl) {
    const message = `$schema field is missing — add "$schema": "${EXPECTED_SCHEMA_URL}"`;
    return {
      warnings: [message],
      suggestions: [
        {
          for: message,
          description: 'Add the $schema field to enable editor autocomplete and validation',
          snippet: `"$schema": "${EXPECTED_SCHEMA_URL}"`,
          language: 'json',
        },
      ],
    };
  }
  if (!schemaUrl.includes(EXPECTED_SCHEMA_HOST)) {
    const message = `$schema "${schemaUrl}" does not point to ${EXPECTED_SCHEMA_HOST}`;
    return {
      warnings: [message],
      suggestions: [
        {
          for: message,
          description: `Point $schema at ${EXPECTED_SCHEMA_HOST}`,
          snippet: `"$schema": "${EXPECTED_SCHEMA_URL}"`,
          language: 'json',
        },
      ],
    };
  }
  return {};
});
