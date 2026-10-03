# PureProjects reliability and performance audit

## Ownership and behavior

`projects.json` remains the authoritative project record, accessed through the existing slug-scoped, versioned storage bridge. Linked documents remain ordinary Writer `.document` packages accessed through the existing documents service. All changes in this audit belong to PureProjects; no shared SDK or shell implementation changes are required.

- `ProjectStore` serializes reads and writes from one instance. An edit reads the current disk version, applies the change, and writes with that version. An external conflict rereads and reapplies once; other refusals fail immediately. A rejected operation does not poison the queue.
- `useProjectPersistence` publishes acknowledged writes, synchronizes its current snapshot immediately, and propagates write/read failures to callers. Failed refreshes retain the visible snapshot but cannot supply an assistant with a false fresh read. Standalone previews use memory immediately, without attempting host writes.
- Manual follow-up actions and successful assistant receipts happen after persistence. Edit/create/delete dialogs stay available with their entered values when their operation fails. Mutation callbacks validate the project against the fresh store before updating it. Completing a next action refuses to clear an action changed by another writer.
- Linked document saves are serialized and coalesce typing. Failed content remains pending for retry. Closing, including the modal close control, waits for in-flight and pending writes and remains open on failure. Opening Writer first saves the current content and reports a failed handoff. Read failures never mount an editable empty document. Document sessions capture their own path; new callback identities cannot reset the editor.
- Document creation supplies initial content in the create request, avoiding an extra write. File creation/rename and project-link updates remain separate operations; partial failures report the actual resulting path and how to attach it again.
- The activity feed merges its initial page with live events, deduplicates, sorts newest first, and caps memory at 400 entries. Boot timeouts are cleaned up. Editor code, document schemas, and assistant handlers load on demand. The SWC compiler/plugin pair is pinned compatibly, and Vite deduplicates React, React DOM and styled-components across local workspace dependencies.
- At narrow widths, the toolbar wraps and each project becomes a compact three-row summary, retaining name, status, next action, people and due date. Desktop columns and drag ordering remain available.

## Verification

- 143 tests pass in 11 files, including 25 new cases covering storage conflicts, concurrent edits, acknowledgement failures, read freshness, assistant failure receipts, asynchronous document schemas, autosave coalescing/retry/ordering, close/handoff behavior, and activity bounds.
- Seven selected regressions fail against the original store/overlay source and pass after the fixes.
- App typecheck and production build pass. In the same local dependency/build setup, the main minified JavaScript bundle shrank from 2,268.84 kB (682.07 kB gzip) to 727.10 kB (211.08 kB gzip), with document functionality moved to deferred chunks. This is a bundle measurement, not a measured native startup time.
- Browser verification used an isolated iframe bridge fixture at 1280 and 540 pixels. Verified project-edit failure retains the entered name and original saved title, then retry commits that name; document-save failure keeps the edited content open, then retry/reopen returns the saved content. Checked list/detail/editor layouts and the lazy editor load. The fixture wrote only disposable memory, not user files.

## Limits and non-decisions

Native desktop filesystem writes, multi-window document editing and paid assistant execution were not exercised against live user data. Project writes use the existing storage compare-and-swap contract; document autosaves still rely on the documents service's existing concurrency contract. Ordinary dismissal waits for save acknowledgement; forced process termination cannot guarantee saving pending content. No installer was requested or built. Existing large deferred editor/diagram chunks and the baseline KaTeX test-environment warning remain.
