# 5. Build and CLI tooling

Date: 2026-10-09

Status: Accepted

## Context

The project needs a type-checked build, a fast development loop, linting, argument parsing with subcommands, and interactive prompts.

## Decision

- **npm project:** `"type": "module"`, `bin: { "brew-review": "dist/cli.js" }`, `files: ["dist"]`.
- **TypeScript:** extend `@tsconfig/node24` and `@tsconfig/strictest`, add `@total-typescript/ts-reset` through `src/reset.d.ts`, and `@types/node@24`.
- **Builds use `tsc`**, compiling to `dist/` through a `build` script. Don't use Node's built-in type stripping for development or release; the user chose a proper build step instead.
- **Development uses `tsx`** (`"dev": "tsx src/cli.ts"`, with `tsx watch` while iterating). tsx doesn't type-check, so `typecheck` and `lint` are separate scripts. strictest's `isolatedModules` keeps code to what tsc and tsx compile the same way.
- **ESLint (flat config):** `@eslint/js` recommended, `typescript-eslint` `strictTypeChecked` plus `stylisticTypeChecked`, and `@stylistic/eslint-plugin` `configs.recommended`. Use type information wherever a config supports it (`parserOptions.projectService` and `tsconfigRootDir: import.meta.dirname`, with `allowDefaultProject` for `eslint.config.js`). Ignore `dist/`.
- **Argument parsing: commander**, with `@commander-js/extra-typings` for inferred option and argument types.
- **Prompts: `@clack/prompts`** (confirm, select, multiselect, masked password input).

## Consequences

- The release build moves to an esbuild bundle later (see [ADR 3](0003-distribute-as-source-built-formula.md)), with `tsc --noEmit` kept for type-checking.
- Clack doesn't handle non-interactive input, so the CLI checks for a terminal itself (see [ADR 7](0007-commands-and-scope.md)).

## Alternatives considered

- **ts-node:** poorly maintained lately and awkward with ESM.
- **citty:** tried first and dropped. It treats the first positional as a subcommand name, so it can't support both `brew review <package>` and `brew review config …`, and it runs a parent command's `run` after its subcommand. commander only dispatches to a subcommand when the word matches one, otherwise passing it to the root action, keeps root options working before a subcommand, and lists subcommands in root `--help`.
- **yargs:** handled the same cases as commander, but has more dependencies, needs separate types and prints full help on every error.
