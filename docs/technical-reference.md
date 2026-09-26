# pureprojects technical reference

[Back to the README](../README.md) · [Development guide](development.md)

Track knowledge-work projects: deliverables with dates and owners, the next
action, what you are waiting on, and the documents each project pulls
together.

Part of the **[puredesktop](https://puredesktop.ai)** suite: this repo is mounted as a git submodule
at `apps/pureprojects` in a compatible development checkout.
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

See the [development guide](../docs/development.md) for building and changing this app.
