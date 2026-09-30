# Agent instructions

## Required verification

Before telling the user that a code change is correct, run the checks relevant to the changed files and report their results. Do not claim a check passed if it was not run or if it failed.

- From the repository root, run `biome check .`. This checks formatting, lint rules, and import organization for Biome-supported files across the repo. It is a check-only command; don't add `--write` when verifying. To apply fixes, run `biome check --write` with explicit file paths, inspect the diff to preserve unrelated user changes, then rerun `biome check .`.
- Biome CLI 2.4.x is required. If `biome` is not on `PATH`, try the Neovim Mason install with `~/.local/share/nvim/mason/bin/biome check .`. If neither is available, say the Biome check could not be run rather than claiming the code is verified.
- For Analyzer changes, run `pnpm --dir services/analyzer run typecheck` and `pnpm --dir services/analyzer run test`.
- For checkout-api changes, run `pnpm --dir services/checkout-api run typecheck` and `pnpm --dir services/checkout-api run test`.
- For operator-ui changes, run `pnpm --dir services/operator-ui run typecheck` and `pnpm --dir services/operator-ui run test`.

Run the checks for every affected service. If a required check fails, fix it when in scope or report the failure and its impact clearly.
