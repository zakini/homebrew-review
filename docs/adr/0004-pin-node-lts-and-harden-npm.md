# 4. Pin Node to the current LTS and harden npm

Date: 2026-10-09

Status: Accepted

## Context

The tool runs on a Node version chosen by its formula, and is developed partly by agents in sandboxes that install npm packages. Supply-chain attacks through npm packages, especially install scripts and freshly published versions, are a real risk.

## Decision

- **Node: pin to the latest LTS.** That's Node 24 today. Node 26 becomes LTS on 2026-10-28. From Node 27, Node ships one major a year (April release, October LTS). Bump yearly in the formula (`depends_on` and the `Formula["node@…"]` line), `engines` and the version files. Check `brew info node@26` exists before switching.
  - `.node-version` contains `24` (fnm reads `.node-version` and `.nvmrc`), and `package.json` has `"engines": { "node": "^24" }`.
- **Package manager: npm**, pinned with `"packageManager": "npm@11.14.1"` for Corepack. Corepack only shims npm after `corepack enable npm`, and isn't bundled with Node 25 and later. npm's native `devEngines` (`runtime` + `packageManager`, `onFail: "error"`) is worth considering too.
- **Harden npm with a project `.npmrc`:**
  - `min-release-age=7` refuses package versions published less than 7 days ago (needs npm 11.10 or later).
  - `ignore-scripts=true` stops dependencies' install scripts running.

## Consequences

- `ignore-scripts` also stops the project's own `prepare` script on `npm install` and `npm ci`, so builds must call `npm run build` explicitly, including in the formula.
- New dependency versions take a week to become installable.
- The user's Mac had Node v24.14.0, fnm 1.39.0, npm 11.14.1 and Corepack 0.34.6 when this was decided. Work may also run in a Linux `sbx` sandbox where Node, fnm or `brew` differ or are missing. Check what's available rather than assuming.
