import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { withCustomConfig } from 'react-docgen-typescript';

const claySrc = resolve('/Users/maxsch/Personal/brika/packages/clay/src');
const componentsDir = resolve(claySrc, 'components');
const tsconfigPath = resolve(claySrc, '..', 'tsconfig.json');

const slugs = readdirSync(componentsDir).filter((entry) =>
  statSync(resolve(componentsDir, entry)).isDirectory()
);
const files = slugs
  .map((slug) => resolve(componentsDir, slug, `${slug}.tsx`))
  .filter((file) => existsSync(file));

const parser = withCustomConfig(tsconfigPath, {
  savePropValueAsString: true,
  shouldExtractLiteralValuesFromEnum: true,
  shouldRemoveUndefinedFromOptional: true,
  propFilter: (prop) => {
    if (prop.name === 'key' || prop.name === 'ref') return false;
    if (prop.parent) return !prop.parent.fileName.includes('node_modules');
    return true;
  },
});
const docs = parser.parse(files);

let totalRequired = 0;
let totalOptional = 0;
let totalDescribed = 0;
let totalUndescribed = 0;
for (const doc of docs) {
  if (!doc.displayName) continue;
  const props = Object.values(doc.props);
  if (props.length === 0) continue;
  const required = props.filter((p) => p.required);
  const optional = props.filter((p) => !p.required);
  totalRequired += required.length;
  totalOptional += optional.length;
  console.log(`\n${doc.displayName}: ${required.length} req / ${optional.length} opt`);
  for (const p of [...required, ...optional]) {
    const flag = p.required ? 'REQ' : 'opt';
    const def = p.defaultValue ? ` = ${p.defaultValue.value}` : '';
    const hasDesc = p.description && p.description.trim().length > 0;
    if (hasDesc) totalDescribed++;
    else totalUndescribed++;
    const descMark = hasDesc ? '✓' : '·';
    console.log(`  [${flag}] ${descMark} ${p.name}: ${p.type.name}${def}`);
  }
}
console.log(
  `\n=== ${docs.length} components · ${totalRequired} required · ${totalOptional} optional · ${totalDescribed}/${totalDescribed + totalUndescribed} described ===`
);
