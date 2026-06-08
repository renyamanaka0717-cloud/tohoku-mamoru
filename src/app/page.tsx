'use client';

import { useState, useEffect, useMemo } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  name: string;
  startTime: string | null;  // "HH:MM" | null
  duration: number;          // minutes
  memo: string;
  icon: string;
  completed: boolean;
  date: string;              // "YYYY-MM-DD"
  isLater: boolean;
}

interface Settings {
  wakeTime: string;
  sleepTime: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const ICONS = [
  '📝', '💼', '🏃', '🍽️', '📚', '💊', '🛒', '🏠',
  '💻', '📞', '🎯', '⭐', '🎵', '🛁', '👶', '🐕',
];

const DEFAULT_SETTINGS: Settings = { wakeTime: '07:00', sleepTime: '23:00' };
const TASKS_KEY = 'tl-tasks-v1';
const SETTINGS_KEY = 'tl-settings-v1';

// ─── Utilities ─────────────────────────────────────────────────────────────────

const toMin = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const fromMin = (m: number): string =>
  `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const todayStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatJp = (d: string): string => {
  const dt = new Date(d + 'T12:00:00');
  return `${dt.getMonth() + 1}月${dt.getDate()}日（${'日月火水木金土'[dt.getDay()]}）`;
};

const nextDayStr = (d: string): string => {
  const dt = new Date(d + 'T12:00:00');
  dt.setDate(dt.getDate() + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const uid = (): string =>
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const durLabel = (m: number): string =>
  m >= 60
    ? `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ''}`
    : `${m}分`;

// ─── Free Slot Calculation ──────────────────────────────────────────────────────

interface FreeSlot {
  start: string;
  end: string;
  min: number;
}

function calcFreeSlots(tasks: Task[], date: string, settings: Settings): FreeSlot[] {
  const scheduled = tasks
    .filter(t => t.date === date && !t.isLater && t.startTime)
    .map(t => [toMin(t.startTime!), toMin(t.startTime!) + t.duration] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  const slots: FreeSlot[] = [];
  let cur = toMin(settings.wakeTime);
  const end = toMin(settings.sleepTime);

  for (const [s, e] of scheduled) {
    if (s > cur) slots.push({ start: fromMin(cur), end: fromMin(s), min: s - cur });
    cur = Math.max(cur, e);
  }
  if (cur < end) slots.push({ start: fromMin(cur), end: fromMin(end), min: end - cur });

  return slots.filter(sl => sl.min >= 10);
}

// ─── Timeline Items ─────────────────────────────────────────────────────────────

type TLItem =
  | { kind: 'task'; task: Task }
  | { kind: 'free'; slot: FreeSlot; fits: Task[] };

function buildTimeline(dayTasks: Task[], freeSlots: FreeSlot[], laterPool: Task[]): TLItem[] {
  const taskItems: TLItem[] = dayTasks
    .filter(t => t.startTime)
    .sort((a, b) => toMin(a.startTime!) - toMin(b.startTime!))
    .map(t => ({ kind: 'task' as const, task: t }));

  const freeItems: TLItem[] = freeSlots.map(slot => ({
    kind: 'free' as const,
    slot,
    fits: laterPool.filter(t => !t.completed && t.duration <= slot.min).slice(0, 3),
  }));

  return [...taskItems, ...freeItems].sort((a, b) => {
    const ta = a.kind === 'task' ? toMin(a.task.startTime!) : toMin(a.slot.start);
    const tb = b.kind === 'task' ? toMin(b.task.startTime!) : toMin(b.slot.start);
    return ta - tb;
  });
}

// ─── TaskModal ──────────────────────────────────────────────────────────────────

function TaskModal({
  task,
  currentDate,
  onSave,
  onClose,
}: {
  task: Task | null;
  currentDate: string;
  onSave: (data: Omit<Task, 'id'>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(task?.name ?? '');
  const [startTime, setStartTime] = useState(task?.startTime ?? '');
  const [duration, setDuration] = useState(task?.duration ?? 30);
  const [memo, setMemo] = useState(task?.memo ?? '');
  const [icon, setIcon] = useState(task?.icon ?? '📝');
  const [isLater, setIsLater] = useState(task?.isLater ?? false);

  const save = () => {
    if (!name.trim()) return;
    const later = isLater || !startTime;
    onSave({
      name: name.trim(),
      startTime: later ? null : startTime,
      duration,
      memo,
      icon,
      completed: task?.completed ?? false,
      date: task?.date ?? currentDate,
      isLater: later,
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-end"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md mx-auto rounded-t-3xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="px-5 py-3 pb-10">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold text-gray-900">
              {task ? 'タスクを編集' : 'タスクを追加'}
            </h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-gray-400 text-2xl leading-none"
            >
              ×
            </button>
          </div>

          {/* Icon */}
          <p className="text-xs font-semibold text-gray-400 mb-2">アイコン</p>
          <div className="flex flex-wrap gap-2 mb-5">
            {ICONS.map(ic => (
              <button
                key={ic}
                onClick={() => setIcon(ic)}
                className={`text-xl w-10 h-10 rounded-2xl flex items-center justify-center transition-colors ${
                  icon === ic ? 'bg-gray-900' : 'bg-gray-100'
                }`}
              >
                {ic}
              </button>
            ))}
          </div>

          {/* Name */}
          <p className="text-xs font-semibold text-gray-400 mb-1">タスク名 *</p>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例：朝ごはん、メールチェック…"
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm mb-4 bg-gray-50 outline-none focus:border-gray-400"
            autoFocus
          />

          {/* Later toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl mb-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">あとでやるに入れる</p>
              <p className="text-xs text-gray-400 mt-0.5">時間が決まっていないタスク</p>
            </div>
            <button
              onClick={() => setIsLater(!isLater)}
              className={`w-12 h-7 rounded-full relative transition-colors flex-shrink-0 ${
                isLater ? 'bg-gray-900' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${
                  isLater ? 'right-1' : 'left-1'
                }`}
              />
            </button>
          </div>

          {/* Time fields */}
          {!isLater && (
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-400 mb-1">開始時間</p>
                <input
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="w-full border border-gray-200 rounded-2xl px-3 py-2.5 text-sm bg-gray-50 outline-none focus:border-gray-400"
                />
                <p className="text-xs text-gray-300 mt-1">空欄→あとでやりへ</p>
              </div>
              <div className="w-32">
                <p className="text-xs font-semibold text-gray-400 mb-1">所要時間（分）</p>
                <input
                  type="number"
                  value={duration}
                  onChange={e => setDuration(Math.max(5, Number(e.target.value) || 5))}
                  min={5}
                  step={5}
                  className="w-full border border-gray-200 rounded-2xl px-3 py-2.5 text-sm bg-gray-50 outline-none focus:border-gray-400 text-center"
                />
              </div>
            </div>
          )}

          {isLater && (
            <div className="mb-4 w-40">
              <p className="text-xs font-semibold text-gray-400 mb-1">所要時間の目安（分）</p>
              <input
                type="number"
                value={duration}
                onChange={e => setDuration(Math.max(5, Number(e.target.value) || 5))}
                min={5}
                step={5}
                className="w-full border border-gray-200 rounded-2xl px-3 py-2.5 text-sm bg-gray-50 outline-none focus:border-gray-400 text-center"
              />
            </div>
          )}

          {/* Memo */}
          <p className="text-xs font-semibold text-gray-400 mb-1">メモ（任意）</p>
          <textarea
            value={memo}
            onChange={e => setMemo(e.target.value)}
            rows={2}
            placeholder="メモ…"
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm bg-gray-50 outline-none focus:border-gray-400 resize-none mb-5"
          />

          <button
            onClick={save}
            disabled={!name.trim()}
            className="w-full bg-gray-900 text-white py-4 rounded-2xl text-sm font-bold disabled:opacity-40 active:bg-gray-700"
          >
            {task ? '変更を保存' : '追加する'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TaskCard ───────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: Task;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const endTime = task.startTime
    ? fromMin(toMin(task.startTime) + task.duration)
    : null;

  return (
    <div
      className={`relative rounded-2xl border p-3 ${
        task.completed
          ? 'bg-gray-50 border-gray-100'
          : 'bg-white border-gray-200 shadow-sm'
      }`}
    >
      <div className="flex gap-2.5">
        <button
          onClick={onToggle}
          className={`mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
            task.completed ? 'border-gray-900 bg-gray-900' : 'border-gray-300'
          }`}
        >
          {task.completed && (
            <span className="text-white text-[10px] font-bold leading-none">✓</span>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-1.5">
            <span className="text-xl leading-tight shrink-0">{task.icon}</span>
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm font-semibold leading-snug ${
                  task.completed ? 'text-gray-400 line-through' : 'text-gray-900'
                }`}
              >
                {task.name}
              </p>
              {task.startTime && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {task.startTime}〜{endTime} · {durLabel(task.duration)}
                </p>
              )}
              {task.memo && (
                <p className="text-xs text-gray-400 mt-1 line-clamp-2">{task.memo}</p>
              )}
            </div>
            <button
              onClick={() => setMenu(!menu)}
              className="shrink-0 text-gray-300 px-1 text-xl leading-none"
            >
              ···
            </button>
          </div>
        </div>
      </div>

      {menu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
          <div className="absolute right-2 top-10 bg-white border border-gray-100 rounded-2xl shadow-xl z-20 overflow-hidden">
            <button
              onClick={() => { onEdit(); setMenu(false); }}
              className="block w-full text-left px-4 py-3 text-sm text-gray-700"
            >
              ✏️ 編集
            </button>
            <button
              onClick={() => { onDelete(); setMenu(false); }}
              className="block w-full text-left px-4 py-3 text-sm text-red-500 border-t border-gray-50"
            >
              🗑️ 削除
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── FreeSlotBlock ──────────────────────────────────────────────────────────────

function FreeSlotBlock({
  slot,
  fits,
  onSchedule,
}: {
  slot: FreeSlot;
  fits: Task[];
  onSchedule: (t: Task, time: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-dashed border-gray-200 p-3 bg-gray-50/70">
      <button
        className="flex items-center justify-between w-full"
        onClick={() => fits.length > 0 && setOpen(!open)}
      >
        <span className="text-xs text-gray-400">
          {slot.start}〜{slot.end}　空き {durLabel(slot.min)}
        </span>
        {fits.length > 0 && (
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
            💡 {fits.length}件の提案
          </span>
        )}
      </button>

      {open && fits.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold text-gray-500">この時間に入れられるタスク：</p>
          {fits.map(t => (
            <div
              key={t.id}
              className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl p-2.5"
            >
              <span className="text-lg">{t.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{t.name}</p>
                <p className="text-xs text-gray-400">{durLabel(t.duration)}</p>
              </div>
              <button
                onClick={() => { onSchedule(t, slot.start); setOpen(false); }}
                className="text-xs font-bold px-3 py-1.5 bg-gray-900 text-white rounded-xl shrink-0"
              >
                入れる
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── TimelineView ───────────────────────────────────────────────────────────────

function TimelineView({
  date,
  tasks,
  later,
  settings,
  onToggle,
  onEdit,
  onDelete,
  onSchedule,
}: {
  date: string;
  tasks: Task[];
  later: Task[];
  settings: Settings;
  onToggle: (id: string) => void;
  onEdit: (t: Task) => void;
  onDelete: (id: string) => void;
  onSchedule: (t: Task, time: string) => void;
}) {
  const dayTasks = tasks.filter(t => t.date === date && !t.isLater && t.startTime);
  const freeSlots = calcFreeSlots(tasks, date, settings);
  const items = buildTimeline(dayTasks, freeSlots, later);

  if (dayTasks.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-5xl mb-3">📋</p>
        <p className="text-sm text-gray-400">今日のタスクがありません</p>
        <p className="text-xs text-gray-300 mt-1">＋ ボタンでタスクを追加しましょう</p>
      </div>
    );
  }

  return (
    <div className="pt-3">
      {/* Wake marker */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-xs text-gray-400 w-12 text-right shrink-0">
          {settings.wakeTime}
        </span>
        <span className="text-base">🌅</span>
        <span className="text-xs text-gray-500">起床</span>
      </div>

      <div className="flex gap-3">
        {/* Vertical timeline line */}
        <div className="flex flex-col items-center w-12 shrink-0 pt-1">
          <div className="flex-1 w-px bg-gray-100" />
        </div>

        {/* Items */}
        <div className="flex-1 space-y-2 pb-2">
          {items.map((item, i) =>
            item.kind === 'task' ? (
              <TaskCard
                key={item.task.id}
                task={item.task}
                onToggle={() => onToggle(item.task.id)}
                onEdit={() => onEdit(item.task)}
                onDelete={() => onDelete(item.task.id)}
              />
            ) : (
              <FreeSlotBlock
                key={`free-${i}`}
                slot={item.slot}
                fits={item.fits}
                onSchedule={onSchedule}
              />
            )
          )}
        </div>
      </div>

      {/* Sleep marker */}
      <div className="flex items-center gap-3 mt-2">
        <span className="text-xs text-gray-400 w-12 text-right shrink-0">
          {settings.sleepTime}
        </span>
        <span className="text-base">🌙</span>
        <span className="text-xs text-gray-500">就寝</span>
      </div>
    </div>
  );
}

// ─── LaterCard ──────────────────────────────────────────────────────────────────

function LaterCard({
  task,
  onToggle,
  onEdit,
  onDelete,
  onMoveToTimeline,
}: {
  task: Task;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMoveToTimeline: () => void;
}) {
  const [menu, setMenu] = useState(false);

  return (
    <div
      className={`relative rounded-2xl border p-3 ${
        task.completed
          ? 'bg-gray-50 border-gray-100'
          : 'bg-white border-gray-200 shadow-sm'
      }`}
    >
      <div className="flex gap-2.5">
        <button
          onClick={onToggle}
          className={`mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${
            task.completed ? 'border-gray-900 bg-gray-900' : 'border-gray-300'
          }`}
        >
          {task.completed && (
            <span className="text-white text-[10px] font-bold leading-none">✓</span>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-1.5">
            <span className="text-xl shrink-0">{task.icon}</span>
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm font-semibold leading-snug ${
                  task.completed ? 'text-gray-400 line-through' : 'text-gray-900'
                }`}
              >
                {task.name}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{durLabel(task.duration)}</p>
              {task.memo && (
                <p className="text-xs text-gray-400 mt-1 line-clamp-2">{task.memo}</p>
              )}
            </div>
            <button
              onClick={() => setMenu(!menu)}
              className="shrink-0 text-gray-300 px-1 text-xl leading-none"
            >
              ···
            </button>
          </div>

          {!task.completed && (
            <button
              onClick={onMoveToTimeline}
              className="mt-2.5 text-xs font-semibold px-3 py-2 border border-gray-200 rounded-xl text-gray-600 active:bg-gray-50"
            >
              今日のタイムラインへ →
            </button>
          )}
        </div>
      </div>

      {menu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
          <div className="absolute right-2 top-10 bg-white border border-gray-100 rounded-2xl shadow-xl z-20 overflow-hidden">
            <button
              onClick={() => { onEdit(); setMenu(false); }}
              className="block w-full text-left px-4 py-3 text-sm text-gray-700"
            >
              ✏️ 編集
            </button>
            <button
              onClick={() => { onDelete(); setMenu(false); }}
              className="block w-full text-left px-4 py-3 text-sm text-red-500 border-t border-gray-50"
            >
              🗑️ 削除
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── LaterList ──────────────────────────────────────────────────────────────────

function LaterList({
  tasks,
  onToggle,
  onEdit,
  onDelete,
  onMoveToTimeline,
}: {
  tasks: Task[];
  onToggle: (id: string) => void;
  onEdit: (t: Task) => void;
  onDelete: (id: string) => void;
  onMoveToTimeline: (t: Task) => void;
}) {
  const pending = tasks.filter(t => !t.completed);
  const done = tasks.filter(t => t.completed);

  if (tasks.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-5xl mb-3">✨</p>
        <p className="text-sm text-gray-400">あとでやるタスクはありません</p>
        <p className="text-xs text-gray-300 mt-1">タスク追加時に「あとでやる」を ON にしましょう</p>
      </div>
    );
  }

  return (
    <div className="pt-3 space-y-2">
      {pending.map(t => (
        <LaterCard
          key={t.id}
          task={t}
          onToggle={() => onToggle(t.id)}
          onEdit={() => onEdit(t)}
          onDelete={() => onDelete(t.id)}
          onMoveToTimeline={() => onMoveToTimeline(t)}
        />
      ))}
      {done.length > 0 && (
        <>
          <p className="text-xs text-gray-300 pt-3 pb-1">完了済み</p>
          {done.map(t => (
            <LaterCard
              key={t.id}
              task={t}
              onToggle={() => onToggle(t.id)}
              onEdit={() => onEdit(t)}
              onDelete={() => onDelete(t.id)}
              onMoveToTimeline={() => onMoveToTimeline(t)}
            />
          ))}
        </>
      )}
    </div>
  );
}

// ─── App ────────────────────────────────────────────────────────────────────────

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [date, setDate] = useState(todayStr());
  const [tab, setTab] = useState<'timeline' | 'later'>('timeline');
  const [modal, setModal] = useState<{ open: boolean; task: Task | null }>({
    open: false,
    task: null,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage
  useEffect(() => {
    try {
      const t = localStorage.getItem(TASKS_KEY);
      const s = localStorage.getItem(SETTINGS_KEY);
      if (t) setTasks(JSON.parse(t));
      if (s) setSettings(JSON.parse(s));
    } catch {
      // ignore parse errors on first load
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  }, [tasks, loaded]);

  useEffect(() => {
    if (loaded) localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings, loaded]);

  const laterTasks = useMemo(() => tasks.filter(t => t.isLater), [tasks]);
  const pendingLaterCount = useMemo(
    () => laterTasks.filter(t => !t.completed).length,
    [laterTasks]
  );

  const openAdd = () => setModal({ open: true, task: null });
  const openEdit = (task: Task) => setModal({ open: true, task });
  const closeModal = () => setModal({ open: false, task: null });

  const saveTask = (data: Omit<Task, 'id'>) => {
    setTasks(prev =>
      modal.task
        ? prev.map(t => (t.id === modal.task!.id ? { ...t, ...data } : t))
        : [...prev, { ...data, id: uid() }]
    );
    closeModal();
  };

  const toggle = (id: string) =>
    setTasks(prev =>
      prev.map(t => (t.id === id ? { ...t, completed: !t.completed } : t))
    );

  const del = (id: string) =>
    setTasks(prev => prev.filter(t => t.id !== id));

  // Assign a "later" task to a free slot in the current day timeline
  const scheduleInSlot = (task: Task, startTime: string) => {
    setTasks(prev =>
      prev.map(t =>
        t.id === task.id ? { ...t, isLater: false, startTime, date } : t
      )
    );
  };

  // Open edit modal with isLater=false so the user can pick a start time
  const moveToTimeline = (task: Task) => {
    setModal({ open: true, task: { ...task, isLater: false } });
  };

  // Move incomplete scheduled tasks to the next day
  const carryOver = () => {
    const next = nextDayStr(date);
    const toMove = tasks.filter(t => t.date === date && !t.completed && !t.isLater);
    const rest = tasks.filter(t => !(t.date === date && !t.completed && !t.isLater));
    setTasks([...rest, ...toMove.map(t => ({ ...t, id: uid(), date: next }))]);
    setDate(next);
    setSettingsOpen(false);
  };

  if (!loaded) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-400 text-sm">
        読み込み中…
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen bg-gray-50 font-sans">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm">
        <div className="px-4 pt-4 pb-0">
          {/* Date row */}
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-[10px] font-bold tracking-widest text-gray-400 mb-0.5">
                TODAY
              </p>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">
                {formatJp(date)}
              </h1>
            </div>
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={`p-2.5 rounded-xl transition-colors ${
                settingsOpen ? 'bg-gray-900 text-white' : 'text-gray-400 hover:bg-gray-100'
              }`}
            >
              ⚙
            </button>
          </div>

          {/* Settings panel */}
          {settingsOpen && (
            <div className="mb-3 p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <div className="flex gap-4 mb-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1">起床時間</p>
                  <input
                    type="time"
                    value={settings.wakeTime}
                    onChange={e =>
                      setSettings(s => ({ ...s, wakeTime: e.target.value }))
                    }
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                  />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">就寝時間</p>
                  <input
                    type="time"
                    value={settings.sleepTime}
                    onChange={e =>
                      setSettings(s => ({ ...s, sleepTime: e.target.value }))
                    }
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                  />
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => { setDate(todayStr()); setSettingsOpen(false); }}
                  className="text-xs px-3 py-2 border border-gray-200 rounded-xl text-gray-600 bg-white"
                >
                  今日に戻る
                </button>
                <button
                  onClick={carryOver}
                  className="text-xs px-3 py-2 bg-gray-900 text-white rounded-xl font-semibold"
                >
                  未完了を翌日へ繰り越し →
                </button>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setTab('timeline')}
              className={`flex-1 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                tab === 'timeline'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-400'
              }`}
            >
              タイムライン
            </button>
            <button
              onClick={() => setTab('later')}
              className={`flex-1 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                tab === 'later'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-400'
              }`}
            >
              あとでやる
              {pendingLaterCount > 0 && (
                <span className="ml-1.5 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">
                  {pendingLaterCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <main className="px-4 pb-32">
        {tab === 'timeline' ? (
          <TimelineView
            date={date}
            tasks={tasks}
            later={laterTasks}
            settings={settings}
            onToggle={toggle}
            onEdit={openEdit}
            onDelete={del}
            onSchedule={scheduleInSlot}
          />
        ) : (
          <LaterList
            tasks={laterTasks}
            onToggle={toggle}
            onEdit={openEdit}
            onDelete={del}
            onMoveToTimeline={moveToTimeline}
          />
        )}
      </main>

      {/* ── FAB ── */}
      <div className="fixed bottom-8 right-4 z-40">
        <button
          onClick={openAdd}
          className="w-14 h-14 bg-gray-900 text-white rounded-full text-3xl shadow-2xl flex items-center justify-center active:bg-gray-700 leading-none"
        >
          +
        </button>
      </div>

      {/* ── Modal ── */}
      {modal.open && (
        <TaskModal
          task={modal.task}
          currentDate={date}
          onSave={saveTask}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
