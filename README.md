<p><img src="docs/assets/app-icon.svg" width="88" height="88" alt="pureprojects icon"></p>

# pureprojects

## What pureprojects does

A workspace for knowledge-work projects: outcomes, deliverables, dates, owners, next actions, and things you are waiting on. Keep the documents supporting a project alongside its plan.

## App layout

| Area | What you use it for |
| --- | --- |
| **Project list** | Browse projects and select the one you want to work on. |
| **Project detail** | Review the outcome, deliverables, owners, dates, and progress. |
| **Next action and waiting items** | Keep the immediate work and outstanding dependencies visible. |
| **Document tools** | Attach or choose project documents and open them for editing. |

The app also uses the shared [puredesktop](https://puredesktop.ai) shell and drawer agent. Panels can vary with the current view and selection.

## Getting started

1. Create a project and describe the outcome you are working toward.
2. Add deliverables with owners and dates, then record the next action and anything you are waiting on.
3. Link the documents that support the project and revisit progress as work advances.

Read the [app guide](docs/app-guide.md) for development, loading, and source-layout details.

## Develop and customize

We welcome **developers and vibecoders alike**. You can add features to pureprojects, develop a fork, or create a new app for [puredesktop](https://puredesktop.ai).

### Use Claude Code, Codex, or your own tools

Open a local source checkout or a purefactory project's folder in your preferred coding tool. Ask it to read this README, `plugin.json`, `package.json`, `agents.md`, and the [development guide](docs/development.md) before making changes. Review the changes, run the app's checks, and test it inside [puredesktop](https://puredesktop.ai). This source may require matching shared platform packages; a browser preview alone does not provide desktop services.

The [development guide](docs/development.md) explains how to start Claude Code or Codex in the project, work on this repository, and load your app into the desktop.

### Use purefactory inside the desktop

Open **purefactory** (Factory) to describe a new app, or select an available app project and request a feature. Use **Open folder** to continue with external tools and **Open app** to test the result. You can also request a local app change through the app's drawer where app-development integration is available; distinguish changing the app from editing its current document.

Use **Share** in purefactory to create a `.pureapp` package. In current builds, install it through **Settings → System → Install an app → Choose package…**. See the [development guide](docs/development.md#load-and-share-your-app) for the full workflow and version differences.

## Developer accounts and the marketplace

We welcome **developers and vibecoders alike**. Go to [puredesktop.ai](https://puredesktop.ai) and [create a developer account](https://puredesktop.ai/developers) to join the developer community and submit your app for review.

Bring improvements to this app, develop a fork, or build something entirely new. We welcome **open-source and proprietary projects alike** to the [puredesktop](https://puredesktop.ai) marketplace. Support for **paid apps is coming soon**, so you will be able to charge for your apps if you choose. Forks and redistributed dependencies must follow their applicable licenses.

For developer access, app submissions, or marketplace questions, contact [info@puredesktop.ai](mailto:info@puredesktop.ai).

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

See the [development guide](docs/development.md) for building and changing this app.
