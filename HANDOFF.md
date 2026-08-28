# Local Calendar Handoff

## Current Release

The current source and public repository use semantic version `1.9.1`.

Repository: https://github.com/aoliaoduo/local-calendar

## Implemented

- Day, 4-day, week, month, year, and agenda views.
- Event CRUD, drag-to-create, recurrence, reminders, and single-occurrence edits.
- Tasks with due dates, reminders, editing, search, and calendar projection.
- Local calendars, local profile, light/dark appearance, tray, printing, trash, ICS import/export, and backups.
- Portable Windows packaging with app-local data.
- Top-level settings menu follows the Google Calendar pattern: settings, recycle bin, appearance, and print.
- Avatar opens a local profile card; appearance and calendar editing are separate from general settings.
- PowerShell CLI is exposed through the package `bin/localcal.cmd` shim.
- CLI also resolves its package directory from `process.argv[1]`, so the generated PowerShell shim works from any current directory.

## Next Recommended Work

1. Add ICS import preview and target-calendar selection.
2. Add task list grouping and drag sorting.
3. Add notification settings and startup behavior controls.
4. Add end-to-end tests for recurrence, trash, reminders, and portable paths.
5. Keep release artifacts out of Git; only the latest portable executable belongs in the release folder.

## Verification

Run `npm run typecheck`, `npm run build`, and `npm run dist:win:proxy` from the workspace root.
