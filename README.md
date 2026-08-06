# Daily Board

A digital bulletin board for choosing what to focus on *today*. Drag, resize, and
pin widgets — a today's-focus to-do list, freeform notes, a pomodoro timer — onto
a felt-textured board. Full task backlog lives on a separate page; star what you
want to see on today's board.

## Why this exists

Most to-do apps show you everything, all the time. This app is built around a
single idea: pick a small set of things to focus on today, and give them a
physical, spatial home you arrange yourself — like sticky notes on a corkboard.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- Zustand (state, with localStorage persistence)
- react-rnd (drag + resize)

## Getting started

```bash
npm install
npm run dev
```

## Architecture notes

- `src/store/boardStore.ts` — widget positions/sizes/data, persisted to localStorage
- `src/store/taskStore.ts` — the full task backlog + "focus today" flags
- `src/components/board/` — the canvas, the draggable widget shell, the add-widget tray
- `src/components/widgets/` — one component per widget type (todo, note, timer)
- `src/components/TaskListPage.tsx` — full backlog management page

Adding a new widget type: add it to `WidgetType` in `types/index.ts`, give it a
default layout/data in `boardStore.ts`, build the component in `components/widgets/`,
and register it in `Board.tsx` + `WidgetTray.tsx`.

## Scope

**In MVP:** freeform board (drag/resize/persist), today's-focus to-do widget +
full list page, note widget, pomodoro widget.

**Deliberately deferred:** Todoist/calendar integration (real OAuth work, its own
project), 20-20-20 timer (redundant with pomodoro for demo purposes), cosmetic
stickers (low technical signal), backend persistence (currently localStorage;
Spring Boot + Postgres is the natural next step).
