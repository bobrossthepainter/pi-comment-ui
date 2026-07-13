# pi-comment-ui

[![CI](https://github.com/bobrossthepainter/pi-comment-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/bobrossthepainter/pi-comment-ui/actions/workflows/ci.yml)

Pi extension that quotes the last completed assistant response, lets you edit the comment, and inserts the result into Pi's input editor.

The Glimpse mode is intended for Pi sessions running in Docker, a VM, or another remote/headless environment: the extension talks to `@bobrossthepainter/glimpse-relay-client`, while the editor window opens on the native macOS host.

## Install

GitHub Packages requires npm authentication even for public packages. Create a classic GitHub token with `read:packages`, then log in and install the Pi package:

```bash
npm config set @bobrossthepainter:registry https://npm.pkg.github.com
npm login --scope=@bobrossthepainter --auth-type=legacy --registry=https://npm.pkg.github.com
# Username: your GitHub username
# Password: the token with read:packages

pi install npm:@bobrossthepainter/pi-comment-ui
```

The extension registers `/comment`.

## Editor selection

Set `PI_COMMENT_EDITOR` before starting Pi:

- `glimpse` — open a focused Markdown editor through `@bobrossthepainter/glimpse-relay-client`
- `external` — use `$VISUAL` or `$EDITOR`
- `pi-ui` or `inline` — use Pi's built-in multiline editor

When the variable is unset, the extension keeps the original behavior: it uses a configured external editor outside containers and Pi UI otherwise. If an explicitly selected external or Glimpse editor fails, it warns and falls back to Pi UI.

## Glimpse relay setup

Run `@bobrossthepainter/glimpse-relay` on the UI host, then configure the Pi process/container:

```bash
export PI_COMMENT_EDITOR=glimpse
export GLIMPSE_RELAY=host.docker.internal:7777
export GLIMPSE_RELAY_TOKEN_FILE=/path/mounted/into/the/container/.glimpse-relay-token
# Or: export GLIMPSE_RELAY_TOKEN="..."
```

In the Glimpse editor, use **Save comment** or <kbd>Cmd/Ctrl</kbd>+<kbd>Enter</kbd> to return the text to Pi. Closing or cancelling the window leaves Pi's editor unchanged. While the window is open, Escape in the Pi terminal also cancels it.

## Local development

```bash
npm install
npm run check
npm test
pi -e .
```

## Publishing

The package is published to GitHub Packages by `.github/workflows/publish.yml`.

1. Update `version` in `package.json` and `package-lock.json`.
2. Merge the change to `main` and wait for CI.
3. Publish a GitHub release tagged `v<version>` (for example `v0.1.0`).

The workflow verifies that the release tag matches `package.json`, runs checks and tests, then publishes `@bobrossthepainter/pi-comment-ui`. It can also be run manually with the `latest` or `next` npm distribution tag.
