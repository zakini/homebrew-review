# 3. Distribute as a formula built from source in this tap

Date: 2026-10-09

Status: Accepted

## Context

`brew review` is a Homebrew external command, so it should install like any other formula: `brew install zakini/review/brew-review`, then `brew review`.

## Decision

- **One repo.** The TypeScript source lives in this tap repo next to `Formula/`. No separate source repo and no npm publishing.
- **For now, the formula builds from source at install time**, pointed at this repo by git tag:

  ```ruby
  url "https://github.com/zakini/homebrew-review.git", tag: "v0.1.0"
  head "https://github.com/zakini/homebrew-review.git", branch: "main"
  depends_on "node@24"

  def install
    system "npm", "install", *std_npm_args
    (bin/"brew-review").write_env_script libexec/"bin/brew-review",
      PATH: "#{Formula["node@24"].opt_bin}:$PATH",
      NODE_USE_ENV_PROXY: "1"
  end
  ```

  - `node@24` is keg-only, so the `write_env_script` wrapper is needed to run the binary on the pinned Node. The CLI keeps its `#!/usr/bin/env node` shebang for this.
  - `NODE_USE_ENV_PROXY=1` makes Node's built-in `fetch`, which the AI SDK uses, follow the `https_proxy`/`http_proxy` variables that `brew` passes through. Without it, `brew review` ignores proxies, which breaks it for users behind one. `brew` filters this variable out itself, so it has to be set in the wrapper.
  - `ignore-scripts` (see [ADR 4](0004-pin-node-lts-and-harden-npm.md)) skips `prepare`, so the formula must run the build explicitly; the sketch doesn't show that step yet. Work it out when writing the formula, including how `std_npm_args` handles devDependencies when building from a local directory.
- **Release flow for now:** tag `vX.Y.Z`, bump the formula's `tag:`, push. The tap's CI (`brew test-bot`) runs on PRs.
- **Later: a bundled JS file on GitHub Releases.** The user dislikes the install-time `npm install`. A GitHub Action on each tag will bundle everything into one `brew-review.js` with esbuild, attach it to the release, and update the formula's `url`/`sha256`, either by committing directly or by opening a PR. The formula then just downloads that file:

  ```ruby
  url "https://github.com/zakini/homebrew-review/releases/download/v0.1.0/brew-review.js"
  sha256 "..."
  depends_on "node@24"

  def install
    libexec.install "brew-review.js"
    (bin/"brew-review").write_env_script libexec/"brew-review.js",
      PATH: "#{Formula["node@24"].opt_bin}:$PATH",
      NODE_USE_ENV_PROXY: "1"
  end
  ```

  This removes npm from the user's install and works on every platform. The release build becomes an esbuild bundle, and `tsc --noEmit` stays for type-checking. Don't let current choices block this, but don't build it until the tool itself works.

## Consequences

- Installing needs network access to npm at install time until the Releases change.
- The formula needs a real `test do` block (e.g. `--help` output). An earlier `brew tap-new`/`brew create` stub was deleted because it was boilerplate: it called `./configure`, had an empty `license ""`, a `system "false"` test and `deny_network_access!`, which would block `npm install`.

## Alternatives considered

- **Homebrew bottles:** `tests.yml`/`publish.yml` from `brew tap-new` are already set up for them, but they only cover the CI matrix's platforms.
- **Compiled binaries for each platform:** no Node needed, but bigger downloads, a build matrix and macOS code signing.
- **Publishing to npm:** an extra registry and release step for no benefit, since users install through the tap.
