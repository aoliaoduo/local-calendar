# Local Calendar Agent Notes

## Project

Windows-only portable Electron calendar with local SQLite storage, tasks, reminders, recurrence exceptions, CLI/RPC control, and a React renderer.

## Commands

- `npm install` installs dependencies.
- `npm run dev` starts the development app.
- `npm run typecheck` runs TypeScript checks.
- `npm run build` builds main, preload, and renderer bundles.
- `npm run dist:win:proxy` builds the Windows portable executable through the configured local proxy.

## Data

- Packaged and development app data live in the app/workspace `data` directory.
- `calendar.db` is SQLite; do not delete it during development.
- Build outputs are ignored by Git.

## Architecture

- `src/main` owns Electron windows, tray, notifications, printing, backups, and local IPC.
- `src/preload` exposes the restricted renderer bridge.
- `src/shared` owns SQLite schema, service logic, recurrence, and RPC methods.
- `src/renderer/src` contains React UI components and styles.
- `src/cli` provides the AI-friendly `localcal` command.

## Working Rules

- Run `npm run typecheck` and `npm run build` before handoff.
- Preserve portable storage behavior.
- Keep account editing under the avatar and appearance editing under the appearance menu.
- Keep calendar editing in the sidebar row menus, not the general settings dialog.
- Keep generated `release` and `portable-*` artifacts out of commits.
