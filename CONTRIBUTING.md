# Contributing to Brika

Thank you for your interest in contributing to Brika! This guide will help you get started.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) v1.3.9 or later
- [Git](https://git-scm.com/)

### Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/<your-username>/brika.git
   cd brika
   ```
3. Install dependencies:
   ```bash
   bun install
   ```
4. Start the development servers:
   ```bash
   bun dev
   ```

## Development Workflow

### Project Structure

Brika is a monorepo with the following workspaces:

- `apps/` — Application entrypoints (hub, ui, website)
- `packages/` — Shared libraries and utilities
- `plugins/` — Plugin implementations

### Scripts

| Command | Description |
|---|---|
| `bun dev` | Start hub and UI in development mode |
| `bun test` | Run all tests |
| `bun run typecheck` | Type-check all packages |
| `bun run lint` | Lint with Biome |
| `bun run lint:fix` | Lint and auto-fix |
| `bun run build` | Build all packages |

### Code Style

- We use [Biome](https://biomejs.dev/) for linting and formatting
- Run `bun run lint:fix` before committing
- TypeScript strict mode is enforced
- Avoid `!` non-null assertions — use `?.`, `?? default`, or guard checks
- Avoid `as` type assertions — use proper type narrowing or guards
- Prefer `as const` over `const enum`

### Type Checking

We use `tsgo` (TypeScript native Go compiler) for type checking:

```bash
bun run typecheck
```

## Making Changes

### Branching

- Create a feature branch from `main`:
  ```bash
  git checkout -b feat/your-feature
  ```
- Use conventional branch prefixes: `feat/`, `fix/`, `refactor/`, `docs/`, `chore/`

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new brick type for charts
fix: resolve IPC timeout on slow connections
refactor: migrate store to shared pattern
docs: update plugin development guide
chore: bump dependencies
```

Use a scope when applicable:

```
feat(hub): add route for brick actions
fix(ui): correct dashboard layout overflow
```

### Pull Requests

1. Keep PRs focused — one feature or fix per PR
2. Update or add tests for your changes
3. Ensure all checks pass:
   ```bash
   bun test
   bun run typecheck
   bun run lint
   ```
4. Fill out the PR template when opening your pull request
5. Link any related issues

### Tests

- Write tests alongside your changes
- Place test files next to the source (`*.test.ts`)
- Run tests with:
  ```bash
  bun test
  ```

## Reporting Issues

- Use the [GitHub issue tracker](https://github.com/maxscharwath/brika/issues)
- Search existing issues before creating a new one
- Use the provided issue templates when possible
- Include reproduction steps for bug reports

## License

By contributing to Brika, you agree that your contributions will be licensed under the [MIT License](LICENSE).
