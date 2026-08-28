# Local Calendar Handoff

## Current Release

The current source and public repository use semantic version `2.1.2`.

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
- Tasks with due dates are projected into calendar views and can be edited or moved from the calendar.
- Tasks support recurrence rules (daily, weekdays, weekly, monthly, yearly); calendar projections are generated from the shared service.
- Recurring task occurrences support single-instance edit/delete via task exception dates.
- Tray entries and system reminder notifications focus the window and open the matching event/task.
- Reminder payloads are also retained in the renderer notification center with target metadata.
- Tasks now carry numeric priority (-1/0/1) and the panel groups open tasks by due-date horizon.
- Tasks have a persisted `sort_order`; the task panel can reorder open tasks by drag and drop.
- Week timeline distinguishes quick single-click creation from a detailed double-click editor.
- Task filters and multi-select bulk completion/deletion are available in the task panel.
- CLI includes `localcal doctor --json` for data-path, database, RPC, and record-count diagnostics.
- CLI task listing supports `--today`, `--overdue`, and `--scheduled` filters.
- CLI `task done` and `task delete` accept multiple IDs for batch operations.
- CLI `task done-all --today|--overdue` supports guarded date-based batch completion.
- Window bounds/maximized state are stored in `data/window-state.json`; development, portable, and CLI modes share the same app-local `data` directory.

## Next Recommended Work

1. Add ICS import preview and target-calendar selection.
2. Add task list grouping and drag sorting.
3. Add notification settings and startup behavior controls.
4. Expand automated tests to scheduler integration (the current smoke suite covers reminders, trash, task recurrence, sorting, explicit paths, and legacy migration).
5. Keep release artifacts out of Git; only the latest portable executable belongs in the release folder.

## Verification

Run `npm run typecheck`, `npm test`, `npm run build`, and `npm run dist:win:proxy` from the workspace root.

## Release Checklist

- Verify the portable executable starts on Windows 10 with an app-local `data` directory.
- Run `localcal doctor --json` against the same directory used by the portable build.
- Keep `release/`, `portable-*`, `data/`, and `out/` out of Git commits.
