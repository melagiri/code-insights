---
title: Contributing
description: How to set up the project, submit changes, and follow conventions.
---

Contributions are welcome! This guide covers what you need to get started.

## Prerequisites

- **Node.js** >= 18
- **pnpm** >= 9
- A Firebase project (for testing sync — see [Firebase Setup](/guides/firebase-setup/))

## Setup

```bash
git clone https://github.com/melagiri/code-insights.git
cd code-insights/cli
pnpm install
pnpm build
npm link    # Makes `code-insights` available globally
```

## Development

```bash
cd cli
pnpm dev    # Watch mode — recompiles on save
pnpm build  # One-time compile
pnpm lint   # Run ESLint
```

The CLI is written in TypeScript with ES Modules and compiled to `dist/`. After `npm link`, changes rebuild automatically in watch mode.

## Workflow

1. **Create a branch**

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** — Run `pnpm dev` for live recompilation.

3. **Verify**

   ```bash
   pnpm build  # Ensure clean compile
   pnpm lint   # Check for lint errors
   ```

4. **Test locally**

   ```bash
   code-insights sync --dry-run
   ```

5. **Submit a PR** — Keep it focused. One feature or fix per PR.

## Code Style

- TypeScript with strict mode enabled
- ES Modules (`import`/`export`, not `require`)
- Match the existing style in surrounding code
- Use `chalk` for colored terminal output, `ora` for spinners

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

## What to Work On

- Check [open issues](https://github.com/melagiri/code-insights/issues) for bugs and feature requests
- Issues labeled `good first issue` are a great starting point
- If you want to work on something not listed, open an issue first to discuss

## Reporting Bugs

Include:

1. What you expected to happen
2. What actually happened
3. Steps to reproduce
4. Node.js version (`node --version`)
5. OS and version

## Project Structure

```
code-insights/
├── cli/              # CLI tool (this is where the code lives)
│   ├── src/
│   │   ├── commands/ # CLI commands (init, sync, status, connect, reset, install-hook)
│   │   ├── parser/   # JSONL parsing and session title generation
│   │   ├── firebase/ # Firestore client operations
│   │   ├── utils/    # Config and device utilities
│   │   ├── types.ts  # TypeScript type definitions
│   │   └── index.ts  # CLI entry point
│   └── dist/         # Compiled output (not committed)
├── docs/             # Product docs, roadmap
└── docs-site/        # This documentation site (Starlight)
```

:::note
The web dashboard is developed in a separate closed-source repository. This repo contains the CLI tool only.
:::

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](https://github.com/melagiri/code-insights/blob/master/LICENSE).
