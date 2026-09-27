# pureprojects roadmap

## Scope

Keep outcome-led projects, deliverables, one next action, waiting items and linked documents; do not turn projects into a second task-board app.

These are proposed, incremental improvements, not a release schedule or a list of missing core features. Keep each change small and preserve existing file formats, user data and app workflows.

## Improvements

1. **Outcome prompt examples.** Add a short example beside the outcome field to encourage a concrete result without imposing a template or additional required fields.

2. **Next-action empty guidance.** When an active project lacks a next action, show a concise prompt and focus the existing editor from that prompt.

3. **Deliverable date feedback.** Explain malformed dates next to the deliverable input and preserve other edits when a date needs correction.

4. **Owner name suggestions.** Offer names already used in the open project as suggestions in deliverable owner fields without creating a new identity or assignment system.

5. **Long deliverable titles.** Wrap long deliverable names without hiding their owner, date or completion control.

6. **Move deliverable destination context.** Show project status beside each destination in the existing move menu so similarly named projects can be distinguished.

7. **Move deliverable confirmation.** After moving a deliverable, name the destination and provide a direct link to it while leaving the source project open.

8. **Waiting item age.** Show how long an existing waiting item has been outstanding where its stored timestamps support that calculation.

9. **Waiting resolution context.** Name the person and awaited item in the resolution action so clearing one wait is distinct from clearing all waits.

10. **Completed project action explanation.** Before completion, explain the existing effect on next actions and waiting items, preserving the app's current completion behavior.

11. **Archive versus complete wording.** Clarify the difference between hiding a project in the archive and marking its outcome done in the existing action labels and help text.

12. **Project list filter summary.** Display active search or status filters and a reset action when the list is narrowed.

13. **Due-date exact tooltips.** Expose the exact date and timezone interpretation next to relative due labels such as tomorrow or overdue.

14. **Deliverable completion count.** Show completed and total deliverables together in project detail without changing the project's manually maintained outcome or status.

15. **Journal entry timestamps.** Make exact entry times available beside relative journal dates so users can reconstruct the sequence of decisions.

16. **Journal text wrapping.** Keep long decision explanations and URLs readable within the project detail pane without horizontal page scrolling.

17. **Document picker location context.** Show the current folder and full filename on focus in the existing picker, helping distinguish similarly named project documents.

18. **Duplicate document link feedback.** Explain when a selected document is already linked to the project instead of adding a second identical reference.

19. **Missing document recovery.** Name an unavailable linked document and offer the existing picker to choose a replacement without deleting the link silently.

20. **Return-to-list continuity.** Preserve list filters and scroll position when opening a project and returning to the project list.

## References

- [App guide](docs/app-guide.md)
- [Development guide](docs/development.md)
- [Current implementation](src/components/ProjectDetail.tsx)
