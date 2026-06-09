# CLAUDE.md — tohoku-mamoru

## Project Overview

**1日タイムライン** — a Japanese, mobile-first daily timeline task manager designed for iPhone (Safari).
Single-page Next.js app. All UI and labels are in Japanese. No user accounts; everything is localStorage.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS 3 (utility-only, no component library) |
| AI | Groq API (`llama-3.3-70b-versatile`) via `/api/generate` |
| Storage | `localStorage` only (no database) |
| Runtime | Browser / iOS Safari |

---

## File Structure

```
src/
  app/
    page.tsx          ← ENTIRE frontend (1900+ lines, single file)
    layout.tsx        ← HTML shell, viewport meta, font
    globals.css       ← Tailwind directives + iOS scroll fix + line-clamp
    api/
      generate/
        route.ts      ← Groq AI endpoint (Threads post generation, unused in main UI)
.env.local.example    ← GROQ_API_KEY template
```

> **All product code lives in `src/app/page.tsx`.**
> Do not split into multiple files unless the user explicitly requests it.

---

## Development Commands

```bash
npm run dev      # local dev server (http://localhost:3000)
npm run build    # production build (run before every push to catch type errors)
npm run lint     # ESLint check
```

Always run `npm run build` before committing. Type errors fail the build.

---

## Git Branch

Active development branch: `claude/daily-timeline-todo-app-uvvUQ`
Push target: `origin claude/daily-timeline-todo-app-uvvUQ`

---

## Architecture: Everything in page.tsx

### Component Tree

```
App (main)
├── MonthCalendar       modal — month grid picker
├── CalendarPage        full-screen month view
├── SearchPage          full-screen task search
├── TaskModal           task create/edit sheet (3 modes)
├── TaskCard            single task row
├── FreeTimeCard        free-slot suggestion card
├── Timeline            hour-based scrollable timeline
└── BottomTabs          bottom sheet: あとでやる + 買い物リスト
```

### Data Types

```typescript
interface Task {
  id: string
  name: string
  startTime: string | null   // "HH:MM" or null
  duration: number           // minutes; 0 = no duration
  memo: string
  icon: string
  completed: boolean
  date: string               // "YYYY-MM-DD"
  isLater: boolean           // true = in あとでやる tray, not on timeline
  recurrence?: 'daily'|'weekly'|'monthly'|'yearly'|'custom'|null
  customRec?: CustomRec
  pinned?: boolean
  tags?: string[]
  notifications?: number[]   // minutes before start; 0=exact, 1440=prev day
  incompleteReminder?: boolean
  category?: string          // '個人' | '仕事' | undefined
}

interface Settings {
  wakeTime: string           // "HH:MM"
  sleepTime: string          // "HH:MM"
}

interface FreeSlot {
  start: string              // "HH:MM"
  end: string                // "HH:MM"
  min: number                // duration in minutes
}

interface ShopItem {
  id: string
  name: string
  checked: boolean
}
```

### localStorage Keys

| Key | Content |
|-----|---------|
| `tl-tasks-v2` | `Task[]` (full array) |
| `tl-settings-v2` | `Settings` |
| `tl-shop-v1` | `ShopItem[]` |

Saved on every state change via `useEffect`.

### Key Constants

```typescript
PX_PER_HOUR = 40            // base pixels per hour in timeline
PX_PER_MIN  = 40/60         // ≈ 0.667 px/min
BASE_SLOT_HEIGHT = 40       // min row height per hour
CARD_GAP = 12               // vertical gap between cards (px)
MIN_CARD_H = 72             // minimum task card height (px)
CATEGORIES = ['個人', '仕事']
```

---

## Timeline Layout System

This is the most complex part of the codebase. Understand it before touching any layout code.

### Row-Based Layout

Each hour has an `HourRow`:
```typescript
type HourRow = { hourMin: number; rowHeight: number; top: number }
```

- `top` is cumulative (sum of all previous rowHeights)
- `rowHeight` = `max(BASE_SLOT_HEIGHT, tallest_card_bottom + CARD_GAP)` for that hour
- Free-time cards are content-height only: `96 + min(fitsN, 3) * 36` px

**Critical:** rows expand to fit their cards. A free-time card can make an hour row 200+ px tall. All Y calculations must use `hourRows`, never `min * PX_PER_MIN`.

### Time ↔ Y Conversion

```typescript
// Time → Y (inside Timeline component)
rowCalcY(min) = row.top + (min - row.hourMin) / 60 * BASE_SLOT_HEIGHT

// Y → Time (calcTime in parent useEffect)
relY = (clientY + window.scrollY) - dragContainerTopRef.current
// then walk hourRows: frac = min(relY - row.top, BASE) / BASE
```

### layoutRef

Timeline exposes its internal data to the parent via `layoutRef`:
```typescript
layoutRef.current = { hourRows, wakeMin, BASE: BASE_SLOT_HEIGHT, container: HTMLDivElement }
```
Set via `useLayoutEffect` (no deps) after every render.

---

## Drag & Drop System

Long-press (500ms) on a task card initiates drag. Works from both the Timeline and BottomTabs tray.

### Key Implementation Details

1. **Drag start** (`startDrag` in App):
   - Captures `containerDocTop = rect.top + window.scrollY` into `dragContainerTopRef` (page coordinate — scroll-independent)
   - Sets `dragTask`, `dragPos`, closes `activeTab`

2. **During drag** (`useEffect` on `dragTask`):
   - `touchmove` + `touchend` on `document` with `{passive: false}` → `e.preventDefault()` stops scroll
   - `calcTime(clientY)` converts finger position to snapped time (5-min intervals)
   - Formula: `relY = (clientY + window.scrollY) - dragContainerTopRef.current`

3. **Drop line rendering** (inside Timeline container):
   - Line Y = `rowCalcY(toMin(dropTime))` — derived from the snapped time, NOT from raw `relY`
   - This is critical: raw `relY` ≠ `rowCalcY(T)` when the finger is inside an expanded row
   - Line and time-badge are `position: absolute` inside the container (same coordinate system as time labels)

4. **Drop**: applies `calcTime(changedTouches[0].clientY)` as new `startTime`

5. **Trash**: drag to bottom 100px of screen → delete task on release

### Why dragLine Must Be Inside the Container

The blue drop line is rendered inside the scrollable Timeline container (not a `fixed` overlay). This ensures it shares the same coordinate origin as the hour labels — misalignment is structurally impossible.

---

## TaskModal Modes

The modal has three modes selectable by swipe or tab:

| Mode | Japanese | Behavior |
|------|----------|----------|
| `later` | あとでやる | No time; adds to tray |
| `scheduled` | 時間指定 | Specific date + start time |
| `recurring` | 繰り返し | Generates multiple Task instances |

Recurring tasks:
- Presets: daily / weekly / monthly / yearly
- Custom (`CustomRec`): any frequency, interval, weekday selection, month-day rules, end conditions
- On save: generates up to 52 instances, each as a separate `Task` with the same recurrence metadata
- Edit dialog: "this occurrence only" vs "all occurrences"

---

## Features Implemented

- [x] Daily timeline with hour-based scrollable layout
- [x] Task cards with icon, time range, duration bar, tags
- [x] Free-time slot detection and display
- [x] Long-press drag from tray or timeline to reschedule
- [x] Drag-to-trash (delete)
- [x] Drop line + time badge aligned with time labels
- [x] あとでやる (later) tray with sort, pin, move-to-timeline
- [x] 買い物リスト (shopping list)
- [x] Task creation/editing: name, icon, duration, memo, tags, category, notifications
- [x] Recurring tasks (preset + custom rules)
- [x] Category filter tabs (個人 / 仕事)
- [x] Week strip date navigation with swipe
- [x] Month calendar picker
- [x] Full-screen search
- [x] Settings: wake/sleep time, carry-over incomplete tasks
- [x] Current time indicator
- [x] Free-slot quick-assign buttons
- [x] Auto-icon from task name (regex patterns)
- [x] localStorage persistence
- [x] Haptic feedback on long-press (navigator.vibrate)

---

## Known Patterns & Gotchas

### Coordinate System (Most Common Bug Area)
- `clientY` = viewport-relative (changes with scroll)
- `pageY = clientY + window.scrollY` = document-relative (scroll-independent)
- `getBoundingClientRect().top` = viewport-relative (changes with scroll)
- `containerDocTop = rect.top + scrollY` = document-relative (stable)
- Always use `pageY` math when comparing touch events to container-internal positions

### Expanded Rows
- When `rowHeight > BASE_SLOT_HEIGHT`, `calcTime` clamps `frac` to 1 for positions beyond BASE
- This means `relY` inside an expanded row maps to the next hour boundary
- **Never use raw `relY` as a line Y position** — always convert through `rowCalcY(toMin(time))`

### React Timing
- `useEffect` runs after paint — there is a ~1 frame gap after `setDragTask` before the touchmove listener is attached
- `useLayoutEffect` (no deps array) in Timeline always runs synchronously after render

### iOS Safari Specifics
- `overscroll-none` on body prevents pull-to-refresh
- `-webkit-overflow-scrolling: touch` for momentum scrolling
- viewport: `maximum-scale=1` prevents zoom
- `navigator.vibrate` for haptic (silently fails on unsupported devices)
- `{passive: false}` required on touchmove to call `preventDefault`

### Single-File Constraint
All UI code is in `page.tsx`. Do not refactor into separate files unless the user explicitly asks.

---

## Environment Variables

```
GROQ_API_KEY=   # Required only for /api/generate (AI post generation, not core app)
```

The main timeline app works without any API key.
