<p><img src="docs/assets/app-icon.svg" width="88" height="88" alt="pureprojects icon"></p>

# PureProjects

## App documentation

Track deliverables, owners, dates, next actions, and project documents.

1. Create a project and describe the outcome you are working toward.
2. Add deliverables with owners and dates, then record the next action and anything you are waiting on.
3. Link the documents that support the project and revisit progress as work advances.

Read the [app guide](docs/app-guide.md) for usage and development requirements. This app runs within [puredesktop](https://puredesktop.ai).

## Open source and contributions

Plan and track projects, deliverables, and supporting documents.

Anyone may use, study, modify, and share this software under the applicable licenses.
We welcome pull requests, bug reports, documentation improvements, and new ideas.
See [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute.

### License

Original code by pure.science inc is licensed under the [MIT License](LICENSE).
Copyright (c) 2026 pure.science inc. Third-party code, dependencies, and assets retain their own licenses and copyright notices.

### Major open-source projects

| Project / source | Homepage or documentation | Support the maintainers |
| --- | --- | --- |
| [Stuk/jszip](https://github.com/Stuk/jszip) | [Homepage / docs](https://stuk.github.io/jszip/) | [GitHub Sponsors](https://github.com/sponsors/Stuk) |
| [react/react](https://github.com/react/react) | [Homepage / docs](https://react.dev) | — |
| [styled-components/styled-components](https://github.com/styled-components/styled-components) | [Homepage / docs](https://styled-components.com) | [GitHub Sponsors](https://github.com/sponsors/quantizor) · [Open Collective](https://opencollective.com/styled-components) |

Thank you to these projects and their contributors. Additional direct dependencies,
upstream links, and asset notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).


Track knowledge-work projects: deliverables with dates and owners, the next
action, what you are waiting on, and the documents each project pulls
together.

Part of the **[puredesktop](https://puredesktop.ai)** suite: this repo is mounted as a git submodule
at `apps/pureprojects` in [Nikau-Dev/ps-suite](https://github.com/Nikau-Dev/ps-suite).
App slug `projects`, dev port `5410` (declared once, in `plugin.json` →
`entrypoint.url`).

## Start

From the suite root, the app is discovered automatically:

```bash
npm run dev:suite
```

Or run just this app from the suite root with `npm run dev -w @purescience/pureprojects`.

## Build and checks

```bash
npm run typecheck
npm run build
npm run test
npm run puredesktop:check
```

`puredesktop:check` verifies the package facts the shell needs: manifest
shape, entrypoint, permissions, `agents.md`, build output, and declared
agent tools. Run it after a fresh `build` — it asserts tool names appear in
`dist/`.

## Project layout

- `plugin.json`: app identity, permissions, entrypoint, and agent tool declarations.
- `agents.md`: app-scoped assistant prompt (lowercase, at the package root).
- `src/App.tsx`: bridge and boot gates wrapped in `AppFrame`.
- `src/bridge/platformBridge.ts`: the only place bridge calls live.
- `src/lib/projectModel.ts`: the domain — statuses, deliverables, derived readings.
- `src/lib/projectStore.ts`: the app-scoped JSON store, with conflict retry.
- `src/agents/`: agent tool catalog and handlers.

## How projects are stored

One JSON document in the app's slug-scoped storage (`projects.json`), read
and written through the platform storage bridge with the version it last
read — so two open windows conflict rather than silently overwriting each
other. Documents are **linked, never copied**: a project holds a path into
PureFiles, a mail thread, or a calendar event, and opening one routes
through the catalog to whichever app claims it.

## Agent tools

Declared in `plugin.json` → `app.agents.tools`, registered at runtime from
`src/agents/catalog.ts`, handled in `src/agents/handlers.ts`. All three
places must carry the same names, or calls time out.

Read tools: `getProjectsContext`, `listProjects`, `getProject`.

Approval-gated: `createProject`, `updateProject`, `addDeliverable`,
`updateDeliverable`, `removeDeliverable`, `setWaitingOn`,
`logJournalEntry`, `createDocument`, `linkDocument`, `removeLink`,
`deleteProject`.

Everything an agent can do, a person can do by hand — the list toolbar
creates projects, the detail pane edits every field, adds and completes
deliverables, sets and clears the wait, writes journal entries, and links
documents. Documents can be renamed from the list — renaming a `.document` moves the
package and rewrites its manifest title, and every project linking it is
repointed. Documents can be written in place: **New…** creates a PureWriter
`.document` package in PureDocuments, links it, and opens it in an
editor overlay built on the suite's shared TipTap editor — the same file
PureWriter opens and the writer agent tools edit. Linking opens a
workspace browser — breadcrumbs, folders-first
ordering, sortable name/kind/modified columns and a per-folder filter —
rather than asking for a path. Two asymmetries are deliberate: the journal
is append-only for agents but editable by the user, and `deleteProject`
demands the project's exact name alongside its id.

## Core rules

- `plugin.json` `app.slug` matches `PROJECTS_APP_SLUG` in `src/constants.ts`.
- The dev port is declared only in `plugin.json`; `vite.config.js` derives it
  via `appDevServerFromManifest`.
- Bridge calls stay inside `src/bridge/platformBridge.ts`; method names come
  from `PLATFORM_BRIDGE_METHODS`.
- `AppFrame` wraps every `src/App.tsx` return path.
- Colour comes from `--platform-*` theme variables; the one app-owned token
  is `--projects-accent`, which never overrides the platform accent.

Conventions for building and changing suite apps: see the submodule
playbook, [ps-suite #410](https://github.com/Nikau-Dev/ps-suite/issues/410).
