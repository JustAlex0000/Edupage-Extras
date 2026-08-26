# Working in Edupage Extras

Edupage Extras is a plain-JavaScript Manifest V3 browser extension. Read
[README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md), and
[CONTRIBUTING.md](CONTRIBUTING.md) before a substantial change.

## Keep changes safe

- Use the existing architecture and keep work narrowly scoped.
- Never collect, log, commit, or package page content, credentials, tokens,
  cookies, or saved captures.
- New injected DOM names use `ee-`; new `chrome.storage.local` keys use
  camelCase and start with `ee`.
- Add or change locale keys in all of `_locales/en`, `_locales/sk`, and
  `_locales/cs`.
- Content scripts run at `document_start` in every frame. Wait for a body
  before appending, and guard top-frame-only work.
- Keep page enhancers idempotent and compatible with asynchronous EduPage
  rendering: path guard, toggle, bounded observer, cleanup, and re-apply.

## Easy-to-break areas

- Do not touch EduPage's floating grades header (`#znamkyTableHeaderBg`) or
  copy native sticky-header styles. Work with the real grade rows instead.
- The theme cache and `scripts/instant-theme.css` must stay compatible with
  the shared custom-theme defaults.
- Test Question Helper is experimental: explicit action only, no automatic
  answer submission, and no provider credentials in page code.
- `docs/private/` is local-only. Never commit, quote, package, or widen access
  around its captures or notes.

## Finish the whole change

- Trace a user-visible change through every affected surface: manifest
  registration, content or background code, popup or settings, keyboard
  commands, all locales, tests, and user-facing documentation.
- Check the reverse path too. A setting must turn off cleanly, an injected UI
  must clean itself up, and a permission-denied or unsupported browser path
  must fail quietly and honestly.
- Do not add long-running polling, repaint loops, or decorative motion. Prefer
  event-driven work, bounded observers, and short transitions. Respect reduced
  motion for injected UI.
- Do not kill processes by a name, path, or broad pattern. Stop only a process
  you started or one whose working directory you have confirmed is this repo.

## Release discipline

- Before a store release, review the combined staged and unstaged diff, verify
  that `package.json` and `manifest.json` have the same version, and add the
  matching changelog entry.
- Run `npm test`, `npm run lint:firefox`, both browser builds, and both package
  verifiers. A green package check does not replace a manual Chrome and Firefox
  check of the changed user flow.
- Keep experiments opt-in and clearly labelled. Do not present unfinished
  features as part of the stable release promise.

## Verify

Run focused tests plus `npm test`. For packaging changes, also run:

```sh
npm run lint:firefox
npm run build:firefox
npm run verify:package
```

Inspect the staged diff before a commit. Do not create commits, tags, pushes,
or releases unless explicitly asked.
