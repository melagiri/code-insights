# Contributing to Code Insights

Thanks for your interest in contributing! This guide covers everything you need to get started.

## Prerequisites

- **Node.js** 18 or later
- **pnpm** >= 9
- A Firebase project (for testing sync — see [Quick Start](README.md#quick-start))

## Getting Started

```bash
# Clone the repo
git clone https://github.com/melagiri/code-insights.git
cd code-insights

# Install dependencies
cd cli
pnpm install

# Build
pnpm build

# Link for local testing
npm link
```

## Project Structure

```
code-insights/
├── cli/              # CLI tool (open source)
│   ├── src/
│   │   ├── commands/ # CLI commands (init, sync, status, insights, open, reset, install-hook)
│   │   ├── parser/   # JSONL parsing and session title generation
│   │   ├── firebase/ # Firestore client operations
│   │   ├── utils/    # Config and device utilities
│   │   ├── types.ts  # TypeScript type definitions
│   │   └── index.ts  # CLI entry point
│   └── dist/         # Compiled output (not committed)
└── docs/             # Product docs, roadmap, architecture
```

> **Note:** The web dashboard is developed in a separate closed-source repository (`code-insights-web`). This repo contains the CLI tool only.

## Development Workflow

### 1. Create a branch

```bash
git checkout -b feature/your-feature-name
# or: fix/description, chore/description
```

Branch naming conventions:
- `feature/*` — New features
- `fix/*` — Bug fixes
- `chore/*` — Maintenance, dependencies, config

### 2. Make changes

```bash
cd cli
pnpm dev    # Watch mode — recompiles on save
```

### 3. Verify your changes

```bash
pnpm build  # Ensure clean compile
pnpm lint   # Check for lint errors
```

### 4. Test locally

```bash
# After building, test your changes with a real sync
code-insights sync --dry-run
```

### 5. Submit a PR

- Keep PRs focused — one feature or fix per PR
- Write a clear description of what changed and why
- Reference any related issues

## Code Style

- **TypeScript** with strict mode enabled
- **ES Modules** (`import`/`export`, not `require`)
- Match the existing style in surrounding code
- Use `chalk` for colored terminal output, `ora` for spinners

## What to Work On

- Check [open issues](https://github.com/melagiri/code-insights/issues) for bugs and feature requests
- Issues labeled `good first issue` are a great starting point
- If you want to work on something not listed, open an issue first to discuss

## Reporting Bugs

When filing a bug report, include:

1. What you expected to happen
2. What actually happened
3. Steps to reproduce
4. Node.js version (`node --version`)
5. OS and version

## Suggesting Features

Open an issue with:

1. The problem you're trying to solve
2. Your proposed solution
3. Any alternatives you considered

## Commit Messages

Follow the existing convention:

```
type(scope): short description

# Examples:
feat(cli): add export command for session data
fix(parser): handle empty JSONL files gracefully
docs: update CLI README with troubleshooting section
chore(cli): update firebase-admin dependency
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
