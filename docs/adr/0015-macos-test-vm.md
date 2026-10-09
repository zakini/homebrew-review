# 15. Test signal gathering in a macOS VM

Date: 2026-10-09

Status: Proposed (not built yet; see "To verify" in [`docs/macos-test-vm.md`](../macos-test-vm.md))

## Context

Agents work in `sbx` sandboxes, which are Linux microVMs running container images. Docker has no macOS images, and Homebrew on Linux can't install app casks or show anything that only happens on macOS. Signal gathering ([ADR 9](0009-gather-usage-signals-in-code.md)) needs checking against a real macOS Homebrew, including installing casks, without giving the agent open network access or access to the host.

## Decision

- **Use a [Tart](https://tart.run) VM.** Tart drives Apple's Virtualization framework from a CLI, has base images with Homebrew installed, makes near-instant copy-on-write clones and has built-in egress filtering (Softnet).
- **A fresh clone of a base image for each session**, deleted afterwards, so installs never pile up and anything that gets into the VM is thrown away.
- **The agent stays in its sandbox and reaches the VM over SSH**, key-only, with an `sbx` network rule for that one VM's address, added when the clone boots and removed afterwards.
- **The agent checks signal gathering, not `brew review`.** It changes the VM's state (installs or removes packages, opens apps, edits dotfiles), runs the signals script from source ([ADR 13](0013-testing-strategy.md)) and checks the output.
- **Control what's in the VM and what it can reach, not which commands run in it.** The agent has `sudo` in the VM (cask installs need it), so command restrictions wouldn't hold.
  - **No API key or other credentials in the VM, and no route to `api.anthropic.com`.** If the agent runs `brew review` anyway, it has no key to enter and couldn't reach the API with one, and anything it removes is in a throwaway clone.
  - **Three network layers**, each covering a gap the others leave: Softnet limits the VM to the host's gateway, a filtering proxy on the gateway allows only listed domains, and `pf` limits traffic to the gateway to the proxy port, DHCP and SSH replies.
- **Real AI runs never happen from the VM.** Signals captured there reach the AI side only as fixtures or eval cases the user has checked.

The how-to (network layer configuration, setup steps and open questions) is in [`docs/macos-test-vm.md`](../macos-test-vm.md).

## Consequences

- Building it needs `sudo` on the host (`pf`) and trusting Softnet, which appears to run as root, widening what runs privileged on the Mac.
- macOS allows at most two macOS VMs running at once per Mac, which caps parallel testing.
- Whatever the VM can reach, the sandbox can effectively reach too, through SSH forwarding. The allow-list should stay narrow.
- Everything depends on SSH from the sandbox to the VM working through `sbx`'s egress proxy, which hasn't been checked yet. Check it first.
- Tart 2.40.1 is under the [Functional Source License 1.1, Apache 2.0 future licence](https://github.com/openai/tart/blob/2.40.1/LICENSE) (`FSL-1.1-ALv2`). It allows any use except offering it commercially as a competing product or service, with no usage or CPU core limits. Each release becomes Apache 2.0 two years after it's made available.

## Alternatives considered

- **Lume:** MIT licensed and aimed at agents, but has no built-in network filtering.
- **UTM:** mainly a GUI and has no image registry.
- **Parallels:** paid and heavier than needed.
- **GitHub Actions macOS runners:** the most isolated option, since nothing runs on the Mac, but each test takes minutes and the sandbox would need to push to GitHub.
- **Running full `brew review` in the VM with a limited API key:** puts a real key where the agent can read it, and needs `tmux` to drive the prompts.
