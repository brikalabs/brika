# Quick Setup

Fast-track checklist for getting BRIKA running.

## 5-Minute Setup

### 1. Clone and Install

```bash
git clone https://github.com/maxscharwath/brika.git
cd brika
bun install
```

### 2. Start Development

```bash
bun run dev
```

### 3. Open the UI

Navigate to http://localhost:5173

## Checklist

```markdown
## Setup
- [ ] Bun installed (`bun --version`)
- [ ] Repository cloned
- [ ] Dependencies installed (`bun install`)

## Development
- [ ] Hub running (port 3001)
- [ ] UI running (port 5173)
- [ ] API health check: `curl http://localhost:3001/api/health`

## First Steps
- [ ] Open dashboard at http://localhost:5173
- [ ] Browse installed plugins
- [ ] Create a new workflow
- [ ] Add blocks to the canvas
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port
lsof -i :3001

# Kill if needed
kill -9 <PID>
```

### Dependencies Not Found

```bash
# Clear cache and reinstall
rm -rf node_modules bun.lockb
bun install
```

### TypeScript Errors

```bash
# Check types
bun run tsc
```

## Next Steps

* [Project Structure](project-structure.md) — Learn the codebase layout
* [Create a Plugin](../plugins/create-plugin.md) — Build your first plugin
