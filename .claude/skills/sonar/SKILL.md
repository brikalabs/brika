---
name: sonar
description: Fix SonarCloud issues (bugs, code smells, security hotspots) and manage false positives. Use when the user wants to address SonarCloud quality gate failures or fix reported issues.
argument-hint: [issue type, rule, or file to fix]
---

# SonarCloud Issue Fixer

Fix SonarCloud issues for: $ARGUMENTS

---

## Workflow

1. **Fetch current issues** from SonarCloud API
2. **Triage**: real issues vs false positives
3. **Fix** real issues with minimal, safe refactors
4. **Mark false positives** via the `sonar-fp` CLI (never use `// NOSONAR` comments)
5. **Run tests** to verify no breakage
6. **Commit & push** to trigger a new SonarCloud analysis

## Fetching Issues

Use the SonarCloud API to get current open issues:

```bash
# All open issues (bugs + smells + vulnerabilities)
curl -s "https://sonarcloud.io/api/issues/search?componentKeys=brika&statuses=OPEN&ps=100&s=SEVERITY&asc=false" | bun -e "const d=await Bun.stdin.json();d.issues.forEach(i=>console.log(\`[\${i.type}] \${i.severity} \${i.component.replace('brika:','')}:\${i.line} — \${i.message} (\${i.rule})\`))"

# Security hotspots
curl -s "https://sonarcloud.io/api/hotspots/search?projectKey=brika&status=TO_REVIEW&ps=50" | bun -e "const d=await Bun.stdin.json();d.hotspots.forEach(h=>console.log(\`[HOTSPOT] \${h.vulnerabilityProbability} \${h.component.replace('brika:','')}:\${h.line} — \${h.message} (\${h.rule})\`))"

# Filter by type/severity
curl -s "https://sonarcloud.io/api/issues/search?componentKeys=brika&statuses=OPEN&types=BUG&severities=CRITICAL,MAJOR&ps=50"
```

## Fixing Strategies by Rule

### Bugs

| Rule | Fix |
|------|-----|
| **S6440** React hook called conditionally | Move hook call before any early returns |
| **S2871** Sort without comparator | Add `(a, b) => a.localeCompare(b)` or numeric comparator |
| **S7739** Object with `then` property | Rename property to avoid thenable trap |
| **S2137** Variable shadows restricted name | Rename variable, or mark as false positive via `sonar-fp` CLI |
| **S5256** Table without header | Add `<thead>`, or mark as false positive via `sonar-fp` if header is consumer responsibility |

### Critical Code Smells

| Rule | Fix |
|------|-----|
| **S3776** Cognitive complexity > 15 | Extract helper functions, use early returns, simplify conditions |
| **S2004** Function nesting > 4 levels | Extract inner callbacks to named functions or components |
| **S7059** Async operation in constructor | Extract to a private `#init()` method |
| **S3735** Void operator | Replace `void expr` with just `expr;` or use an alternative |

### Major Code Smells

| Rule | Fix |
|------|-----|
| **S6479** Array index as key | Use stable unique IDs (`item.id`, `item.name`) |
| **S2933** Property should be readonly | Add `readonly` keyword |
| **S3358** Nested ternary | Extract to variable or use if/else |
| **S4624** Nested template literal | Extract inner template to a variable |
| **S6582** Use optional chaining | Replace `x && x.y` with `x?.y` |
| **S6819** Non-interactive element with handler | Use `<button>` instead of `<div role="button">` |
| **S6481** Unstable context value | Wrap value in `useMemo()` |
| **S6478** Component defined inside component | Move to module scope |
| **S4144** Duplicate function implementation | Extract shared helper |
| **S7746** Mishandled promise | Add `await` or `void` with `.catch()` |
| **S7785** Can use top-level await | Replace IIFE with top-level `await` |
| **S4782** Redundant undefined in optional | Remove `undefined` from union |
| **S6564** Redundant type alias | Inline the type |
| **S6661** Object.assign instead of spread | Use `{ ...obj }` spread |
| **S1121** Assignment in expression | Extract to separate statement |
| **S107** Too many parameters (>7) | Use options object |
| **S2301** Boolean method parameter | Split into two methods |

### Security Hotspots

| Rule | Fix |
|------|-----|
| **S5852** Regex backtracking DoS | Make regex non-backtracking: use atomic groups, possessive quantifiers, or rewrite |
| **S2245** Math.random() for security | Use `crypto.getRandomValues()` for security; for UI/demo mark as safe via `sonar-fp hotspot-safe` |

## False Positive Management

**IMPORTANT**: Never use `// NOSONAR` comments in code. Always manage false positives via the SonarCloud API using the `sonar-fp` CLI.

### CLI tool (`sonar-fp`)

```bash
# List all open issues
bun run scripts/sonar-fp.ts list

# List security hotspots
bun run scripts/sonar-fp.ts hotspots

# Mark a specific issue as false positive
bun run scripts/sonar-fp.ts fp <issue-key> "Reason for false positive"

# Mark as won't fix
bun run scripts/sonar-fp.ts wontfix <issue-key> "Reason"

# Bulk mark by rule (e.g., all S4662 CSS at-rule issues)
bun run scripts/sonar-fp.ts bulk-fp --rule css:S4662 "Tailwind CSS v4 syntax"

# Review hotspots — mark as safe
bun run scripts/sonar-fp.ts hotspot-safe <hotspot-key> "Not a security risk because..."

# Reopen a resolved issue
bun run scripts/sonar-fp.ts reopen <issue-key>
```

Requires `SONAR_TOKEN` env var for write operations. Read-only commands work without auth on public projects.

## Priority Order

Fix issues in this order for maximum quality gate impact:

1. **Bugs** (reliability rating) — highest impact on quality gate
2. **Security hotspots** (security rating) — blocks quality gate
3. **Critical code smells** (maintainability rating)
4. **Major code smells** — bulk volume reduction

## Testing After Fixes

Always verify after fixing:
```bash
# Run full test suite
bun test

# Check TypeScript compilation
bunx --bun tsc --noEmit

# Check linting
bunx biome check .
```

## Commit Convention

```
fix: resolve SonarCloud <type> in <area>

<description of what was fixed and why>
```
