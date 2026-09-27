# pureprojects contribution roadmap

Build something you can see and try in the app. The first five items are **good first contributions**: bounded changes with a concrete demonstration. Choose a feature below, fix a bug, or propose your own improvement.

## Scope

Keep outcome-led projects, deliverables, one next action, waiting items and linked documents; do not turn projects into a second task-board app.

Size describes scope, not a promised completion time: **Small** = one focused interface change; **Medium** = coordinated interface/state work; **Large** = a feature across several flows, storage or export paths. All items are proposals, not claims that existing features are absent. Check the current code and extend what is there. Maintainers review code and tests before merging. Attribution is your choice.

## Good first contributions

1. **See deliverable progress at a glance.** Show completed and total deliverables together in project detail without changing the project's manually maintained outcome or status.
   <!-- contribution: {"id": "deliverable-completion-count", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/deliverable-completion-count.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/deliverable-completion-count.md)

2. **Reuse owner names when adding deliverables.** Offer names already used in the open project as suggestions in deliverable owner fields without creating a new identity or assignment system.
   <!-- contribution: {"id": "owner-name-suggestions", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/owner-name-suggestions.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/owner-name-suggestions.md)

3. **Clear project list filters.** Display active search or status filters and a reset action when the list is narrowed.
   <!-- contribution: {"id": "project-list-filter-summary", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/project-list-filter-summary.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/project-list-filter-summary.md)

4. **Read complete deliverable titles.** Wrap long deliverable names without hiding their owner, date or completion control.
   <!-- contribution: {"id": "long-deliverable-titles", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/long-deliverable-titles.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/long-deliverable-titles.md)

5. **See the exact due date.** Expose the exact date and timezone interpretation next to relative due labels such as tomorrow or overdue.
   <!-- contribution: {"id": "due-date-exact-tooltips", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/due-date-exact-tooltips.md"} -->
   [Small · Good first contribution · Implementation brief](docs/contributions/due-date-exact-tooltips.md)

## More improvements

6. **Start with a concrete project outcome.** Add a short example beside the outcome field to encourage a concrete result without imposing a template or additional required fields.
   <!-- contribution: {"id": "outcome-prompt-examples", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/outcome-prompt-examples.md"} -->
   [Small · Implementation brief](docs/contributions/outcome-prompt-examples.md)

7. **Add the missing next action.** When an active project lacks a next action, show a concise prompt and focus the existing editor from that prompt.
   <!-- contribution: {"id": "next-action-empty-guidance", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/next-action-empty-guidance.md"} -->
   [Small · Implementation brief](docs/contributions/next-action-empty-guidance.md)

8. **Correct a deliverable date inline.** Explain malformed dates next to the deliverable input and preserve other edits when a date needs correction.
   <!-- contribution: {"id": "deliverable-date-feedback", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/deliverable-date-feedback.md"} -->
   [Small · Implementation brief](docs/contributions/deliverable-date-feedback.md)

9. **Choose the right destination project.** Show project status beside each destination in the existing move menu so similarly named projects can be distinguished.
   <!-- contribution: {"id": "move-deliverable-destination-context", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/move-deliverable-destination-context.md"} -->
   [Medium · Implementation brief](docs/contributions/move-deliverable-destination-context.md)

10. **Open the destination after moving a deliverable.** After moving a deliverable, name the destination and provide a direct link to it while leaving the source project open.
   <!-- contribution: {"id": "move-deliverable-confirmation", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/move-deliverable-confirmation.md"} -->
   [Medium · Implementation brief](docs/contributions/move-deliverable-confirmation.md)

11. **See how long you have been waiting.** Show how long an existing waiting item has been outstanding where its stored timestamps support that calculation.
   <!-- contribution: {"id": "waiting-item-age", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/waiting-item-age.md"} -->
   [Medium · Implementation brief](docs/contributions/waiting-item-age.md)

12. **Resolve the right waiting item.** Name the person and awaited item in the resolution action so clearing one wait is distinct from clearing all waits.
   <!-- contribution: {"id": "waiting-resolution-context", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/waiting-resolution-context.md"} -->
   [Medium · Implementation brief](docs/contributions/waiting-resolution-context.md)

13. **Understand what completing a project changes.** Before completion, explain the existing effect on next actions and waiting items, preserving the app's current completion behavior.
   <!-- contribution: {"id": "completed-project-action-explanation", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/completed-project-action-explanation.md"} -->
   [Medium · Implementation brief](docs/contributions/completed-project-action-explanation.md)

14. **Tell archiving from completing a project.** Clarify the difference between hiding a project in the archive and marking its outcome done in the existing action labels and help text.
   <!-- contribution: {"id": "archive-versus-complete-wording", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/archive-versus-complete-wording.md"} -->
   [Small · Implementation brief](docs/contributions/archive-versus-complete-wording.md)

15. **Read exact journal entry times.** Make exact entry times available beside relative journal dates so users can reconstruct the sequence of decisions.
   <!-- contribution: {"id": "journal-entry-timestamps", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/journal-entry-timestamps.md"} -->
   [Small · Implementation brief](docs/contributions/journal-entry-timestamps.md)

16. **Read long journal entries.** Keep long decision explanations and URLs readable within the project detail pane without horizontal page scrolling.
   <!-- contribution: {"id": "journal-text-wrapping", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/journal-text-wrapping.md"} -->
   [Small · Implementation brief](docs/contributions/journal-text-wrapping.md)

17. **Tell same-named project documents apart.** Show the current folder and full filename on focus in the existing picker, helping distinguish similarly named project documents.
   <!-- contribution: {"id": "document-picker-location-context", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/document-picker-location-context.md"} -->
   [Medium · Implementation brief](docs/contributions/document-picker-location-context.md)

18. **Avoid linking a document twice.** Explain when a selected document is already linked to the project instead of adding a second identical reference.
   <!-- contribution: {"id": "duplicate-document-link-feedback", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/duplicate-document-link-feedback.md"} -->
   [Medium · Implementation brief](docs/contributions/duplicate-document-link-feedback.md)

19. **Replace a missing project document.** Name an unavailable linked document and offer the existing picker to choose a replacement without deleting the link silently.
   <!-- contribution: {"id": "missing-document-recovery", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/missing-document-recovery.md"} -->
   [Medium · Implementation brief](docs/contributions/missing-document-recovery.md)

20. **Return to the same place in the project list.** Preserve list filters and scroll position when opening a project and returning to the project list.
   <!-- contribution: {"id": "return-to-list-continuity", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/return-to-list-continuity.md"} -->
   [Medium · Implementation brief](docs/contributions/return-to-list-continuity.md)

21. **See deliverables across projects on a timeline.** Add an optional cross-project timeline of dated deliverables with project and owner filters. Selecting an item opens its existing detail; undated work stays visible in a separate list.
   <!-- contribution: {"id": "see-deliverables-across-projects-on-a-timeline", "size": "large", "goodFirstIssue": false, "guide": "docs/contributions/see-deliverables-across-projects-on-a-timeline.md"} -->
   [Large · Implementation brief](docs/contributions/see-deliverables-across-projects-on-a-timeline.md)

## References

- [Contribution brief index](docs/contributions/README.md)
- [App guide](docs/app-guide.md)
- [Development guide](docs/development.md)
- [Contributing](CONTRIBUTING.md)
