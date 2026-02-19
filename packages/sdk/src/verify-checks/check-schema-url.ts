import { registerCheck } from './registry';

const EXPECTED_SCHEMA_HOST = 'schema.brika.dev';

registerCheck(({ pkg }) => {
  const { $schema: schemaUrl } = pkg;
  if (!schemaUrl) {
    return {
      warnings: [
        `$schema field is missing — add "$schema": "https://schema.brika.dev/plugin.schema.json"`,
      ],
    };
  }
  if (!schemaUrl.includes(EXPECTED_SCHEMA_HOST)) {
    return {
      warnings: [`$schema "${schemaUrl}" does not point to ${EXPECTED_SCHEMA_HOST}`],
    };
  }
  return {};
});
