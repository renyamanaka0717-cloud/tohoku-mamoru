'use client';

import { useState, useEffect, useMemo } from 'react';

interface Task {
  id: string;
  name: string;
  startTime: string | null;
  duration: number;
  memo: string;
  icon: string;
  completed: boolean;
  date: string;
  isLater: boolean;
}

interface Settings {
  wakeTime: string;
  sleepTime: string;
}

interface FreeSlot { start: string; end: string; min: number; }

// ── constants ────────────────────────────────────────────────────────────────
const ICONS = ['☀️','📝','💼','🏃','🍽️','📚','💊','🛒','🏠','💻','📞','🎯','⭐','🎵','🛁','🐕'];
const DEFAULT_SETTINGS: Settings = { wakeTime: '07:00', sleepTime: '23:00' };
const TASKS_KEY = 'tl-tasks-v2';
const SETTINGS_KEY = 'tl-settings-v2';
const PX_PER_HOUR = 72;
const PX_PER_MIN = PX_PER_HOUR / 60;
const DAY_NAMES = ['日','月','火','水','木','金','土'];

// ── utils ────────────────────────────────────────────────────────────────────
const toMin = (t: string) => { const [h,m] = t.split(':').map(Number); return h*60+m; };
const fromMin = (m: number) => `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const dateToStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const todayStr = () => dateToStr(new Date());
const nowStr = () => { const d=new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
const shiftDate = (s: string, n: number) => { const d=new Date(s+'T12:00:00'); d.setDate(d.getDate()+n); return dateToStr(d); };
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const durLabel = (m: number) => m>=60?`${Math.floor(m/60)}時間${m%60?`${m%60}分`:''}` :`${m}分`;

const getDateInfo = (s: string) => {
  const d = new Date(s+'T12:00:00');
  return { day: d.getDate(), month: d.getMonth()+1, year: d.getFullYear() };
};
const getWeekDates = (s: string) => {
  const d = new Date(s+'T12:00:00');
  const dow = d.getDay();
  return Array.from({length:7},(_,i)=>{ const c=new Date(d); c.setDate(d.getDate()-dow+i); return dateToStr(c); });
};

// ── free slots ───────────────────────────────────────────────────────────────
function calcFreeSlots(tasks: Task[], date: string, settings: Settings): FreeSlot[] {
  const scheduled = tasks
    .filter(t=>t.date===date&&!t.isLater&&t.startTime)
    .map(t=>[toMin(t.startTime!),toMin(t.startTime!)+t.duration] as [number,number])
    .sort((a,b)=>a[0]-b[0]);
  const slots: FreeSlot[]=[];
  let cur=toMin(settings.wakeTime);
  const end=toMin(settings.sleepTime);
  for(const [s,e] of scheduled){
    if(s>cur) slots.push({start:fromMin(cur),end:fromMin(s),min:s-cur});
    cur=Math.max(cur,e);
  }
  if(cur<end) slots.push({start:fromMin(cur),end:fromMin(end),min:end-cur});
  return slots.filter(sl=>sl.min>=10);
}

// ── TaskModal ────────────────────────────────────────────────────────────────
function TaskModal({ task, currentDate, prefillTime, onSave, onDelete, onClose }: {
  task: Task|null; currentDate: string; prefillTime?: string;
  onSave:(d:Omit<Task,'id'>)=>void; onDelete?:()=>void; onClose:()=>void;
}) {
  const [name,setName] = useState(task?.name??'');
  const [startTime,setStartTime] = useState(task?.startTime??prefillTime??'');
  const [duration,setDuration] = useState(task?.duration??30);
  const [memo,setMemo] = useState(task?.memo??'');
  const [icon,setIcon] = useState(task?.icon??'📝');
  const [isLater,setIsLater] = useState(task?.isLater??false);

  const save = () => {
    if(!name.trim()) return;
    const later = isLater||!startTime;
    onSave({ name:name.trim(), startTime:later?null:startTime, duration, memo, icon,
      completed:task?.completed??false, date:task?.date??currentDate, isLater:later });
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white w-full max-w-md mx-auto rounded-t-3xl max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <div className="flex justify-center pt-3"><div className="w-10 h-1 bg-gray-200 rounded-full"/></div>
        <div className="px-5 pt-3 pb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold">{task?'タスクを編集':'タスクを追加'}</h2>
            <button onClick={onClose} className="text-gray-400 text-2xl w-8 h-8 flex items-center justify-center">×</button>
          </div>

          <p className="text-xs font-semibold text-gray-400 mb-2">アイコン</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {ICONS.map(ic=>(
              <button key={ic} onClick={()=>setIcon(ic)}
                className={`text-xl w-10 h-10 rounded-2xl flex items-center justify-center ${icon===ic?'bg-gray-900':'bg-gray-100'}`}>
                {ic}
              </button>
            ))}
          </div>

          <p className="text-xs font-semibold text-gray-400 mb-1">タスク名 *</p>
          <input type="text" value={name} onChange={e=>setName(e.target.value)}
            placeholder="例：朝ごはん、メール確認…"
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm mb-4 bg-gray-50 outline-none focus:border-gray-400"
            autoFocus />

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl mb-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">あとでやるに入れる</p>
              <p className="text-xs text-gray-400 mt-0.5">時間が決まっていないタスク</p>
            </div>
            <button onClick={()=>setIsLater(!isLater)}
              className={`w-12 h-7 rounded-full relative transition-colors flex-shrink-0 ${isLater?'bg-gray-900':'bg-gray-300'}`}>
              <span className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${isLater?'right-1':'left-1'}`}/>
            </button>
          </div>

          {!isLater && (
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-400 mb-1">開始時間</p>
                <input type="time" value={startTime} onChange={e=>setStartTime(e.target.value)}
                  className="w-full border border-gray-200 rounded-2xl px-3 py-2.5 text-sm bg-gray-50 outline-none"/>
                <p className="text-xs text-gray-300 mt-1">空欄→あとでやりへ</p>
              </div>
              <div className="w-32">
                <p className="text-xs font-semibold text-gray-400 mb-1">所要時間（分）</p>
                <input type="number" value={duration}
                  onChange={e=>setDuration(Math.max(5,Number(e.target.value)||5))} min={5} step={5}
                  className="w-full border border-gray-200 rounded-2xl px-3 py-2.5 text-sm bg-gray-50 outline-none text-center"/>
              </div>
            </div>
          )}
          {isLater && (
            <div className="mb-4 w-40">
              <p className="text-xs font-semibold text-gray-400 mb-1">所要時間の目安（分）</p>
              <input type="number" value={duration}
                onChange={e=>setDuration(Math.max(5,Number(e.target.value)||5))} min={5} step={5}
                className="w-full border border-gray-200 rounded-2xl px-3 py-2.5 text-sm bg-gray-50 outline-none text-center"/>
            </div>
          )}

          <p className="text-xs font-semibold text-gray-400 mb-1">メモ（任意）</p>
          <textarea value={memo} onChange={e=>setMemo(e.target.value)} rows={2}
            placeholder="メモ…"
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm bg-gray-50 outline-none resize-none mb-4"/>

          <button onClick={save} disabled={!name.trim()}
            className="w-full bg-gray-900 text-white py-4 rounded-2xl text-sm font-bold disabled:opacity-40 mb-2">
            {task?'変更を保存':'追加する'}
          </button>
          {task && onDelete && (
            <button onClick={()=>{onDelete();onClose();}}
              className="w-full py-3 text-sm text-red-400 font-medium">
              削除する
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── TaskCard ─────────────────────────────────────────────────────────────────
function TaskCard({ task, onToggle, onEdit }: {
  task: Task; onToggle:()=>void; onEdit:()=>void;
}) {
  const endTime = task.startTime ? fromMin(toMin(task.startTime)+task.duration) : null;
  return (
    <div className={`flex items-center gap-2.5 bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-2.5 ${task.completed?'opacity-60':''}`}>
      <div className="w-8 h-8 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 text-base leading-none">
        {task.icon}
      </div>
      <div className="flex-1 min-w-0" onClick={onEdit}>
        {task.startTime && (
          <p className="text-[11px] text-gray-400 leading-none mb-0.5">{task.startTime}〜{endTime}</p>
        )}
        <p className={`text-sm font-semibold leading-snug ${task.completed?'line-through text-gray-400':'text-gray-900'}`}>{task.name}</p>
        {task.memo && <p className="text-xs text-gray-400 mt-0.5 truncate">{task.memo}</p>}
      </div>
      <button onClick={onToggle}
        className={`w-6 h-6 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${task.completed?'border-gray-900 bg-gray-900':'border-gray-300'}`}>
        {task.completed && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
      </button>
    </div>
  );
}

// ── FreeTimeCard ──────────────────────────────────────────────────────────────
function FreeTimeCard({ slot, fits, height, onSchedule }: {
  slot: FreeSlot; fits: Task[]; height: number; onSchedule:(t:Task,time:string)=>void;
}) {
  const h = Math.floor(slot.min/60);
  const m = slot.min%60;
  return (
    <div className="bg-gray-100 rounded-2xl px-4 pt-3 pb-4" style={{minHeight:`${height}px`}}>
      <div className="flex items-center gap-1 mb-1">
        <span className="text-xs text-gray-400">🕐</span>
        <span className="text-xs text-gray-400 font-medium">空き時間</span>
      </div>
      <p className="font-black text-gray-800 leading-none mb-3">
        {h>0 && <span className="text-[2rem]">{h}時間</span>}
        {m>0 && <span className="text-[2rem] ml-0.5">{m}分</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        {fits.map(t=>(
          <button key={t.id} onClick={()=>onSchedule(t,slot.start)}
            className="inline-flex items-center gap-1.5 bg-white rounded-full px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm">
            <span>{t.icon}</span><span>{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────────
function Timeline({ date, tasks, later, settings, now, onToggle, onEdit, onSchedule, onAddAtTime }: {
  date: string; tasks: Task[]; later: Task[]; settings: Settings; now: string;
  onToggle:(id:string)=>void; onEdit:(t:Task)=>void;
  onSchedule:(t:Task,time:string)=>void; onAddAtTime:(time:string)=>void;
}) {
  const wakeMin = toMin(settings.wakeTime);
  const sleepMin = toMin(settings.sleepTime);
  const totalMins = sleepMin-wakeMin;
  const totalHeight = totalMins*PX_PER_MIN;
  const nowMin = toMin(now);
  const calcY = (min:number) => (min-wakeMin)*PX_PER_MIN;

  const dayTasks = tasks
    .filter(t=>t.date===date&&!t.isLater&&t.startTime)
    .sort((a,b)=>toMin(a.startTime!)-toMin(b.startTime!));

  const freeSlots = calcFreeSlots(tasks, date, settings);
  const laterPool = later.filter(t=>!t.completed);

  const hours: number[] = [];
  for(let m=wakeMin; m<=sleepMin; m+=60) hours.push(m);

  const AXIS_X = 52;
  const CARD_LEFT = AXIS_X+16;

  const showEmpty = dayTasks.length===0 && freeSlots.length===0;

  return (
    <div className="relative" style={{height:`${totalHeight+32}px`,minHeight:'400px'}}>
      {/* vertical line */}
      <div className="absolute w-px bg-gray-200" style={{left:`${AXIS_X}px`,top:0,height:`${totalHeight}px`}}/>

      {/* hour marks */}
      {hours.map(h=>{
        const isWake = h===wakeMin;
        const isSleep = h===sleepMin;
        const inFree = freeSlots.some(s=>toMin(s.start)<=h&&h<toMin(s.end));
        const hasTask = dayTasks.some(t=>toMin(t.startTime!)===h);
        return (
          <div key={h} className="absolute flex items-center" style={{top:`${calcY(h)-8}px`,left:0}}>
            <span className="text-xs text-gray-400 w-12 text-right pr-1 leading-none">{fromMin(h)}</span>
            {(isWake||isSleep) ? (
              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-sm -ml-3.5 z-10 shadow-sm">
                {isWake?'☀️':'🌙'}
              </div>
            ) : (
              <div className={`w-2.5 h-2.5 rounded-full border-2 -ml-1.5 z-10 ${inFree||hasTask?'border-transparent bg-transparent':'border-gray-200 bg-white'}`}/>
            )}
          </div>
        );
      })}

      {/* current time */}
      {date===todayStr()&&nowMin>=wakeMin&&nowMin<=sleepMin&&(
        <div className="absolute flex items-center z-20 gap-1.5" style={{top:`${calcY(nowMin)-12}px`,left:0,right:0}}>
          <div className="bg-gray-900 text-white text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap">{now}</div>
          <button onClick={()=>onAddAtTime(now)}
            className="w-5 h-5 bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">+</button>
          <div className="flex-1 h-px bg-gray-300"/>
        </div>
      )}

      {/* task cards */}
      {dayTasks.map(task=>(
        <div key={task.id} className="absolute z-10" style={{top:`${calcY(toMin(task.startTime!))}px`,left:`${CARD_LEFT}px`,right:'0px'}}>
          <TaskCard task={task} onToggle={()=>onToggle(task.id)} onEdit={()=>onEdit(task)}/>
        </div>
      ))}

      {/* free time cards */}
      {freeSlots.map((slot,i)=>{
        const h = Math.max(80, slot.min*PX_PER_MIN-4);
        const fits = laterPool.filter(t=>t.duration<=slot.min).slice(0,3);
        return (
          <div key={i} className="absolute z-10" style={{top:`${calcY(toMin(slot.start))+2}px`,left:`${CARD_LEFT}px`,right:'0px'}}>
            <FreeTimeCard slot={slot} fits={fits} height={h} onSchedule={onSchedule}/>
          </div>
        );
      })}

      {/* empty state */}
      {showEmpty&&(
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{left:`${CARD_LEFT}px`}}>
          <p className="text-4xl mb-2">📋</p>
          <p className="text-sm text-gray-400">タスクがありません</p>
          <p className="text-xs text-gray-300 mt-1">＋ でタスクを追加</p>
        </div>
      )}
    </div>
  );
}

// ── LaterList ─────────────────────────────────────────────────────────────────
function LaterList({ tasks, onToggle, onEdit, onMoveToTimeline }: {
  tasks: Task[]; onToggle:(id:string)=>void; onEdit:(t:Task)=>void; onMoveToTimeline:(t:Task)=>void;
}) {
  const pending = tasks.filter(t=>!t.completed);
  const done = tasks.filter(t=>t.completed);
  if(tasks.length===0) return (
    <div className="py-16 text-center">
      <p className="text-5xl mb-3">✨</p>
      <p className="text-sm text-gray-400">あとでやるタスクはありません</p>
    </div>
  );
  return (
    <div className="space-y-2 pt-2">
      {pending.map(t=>(
        <div key={t.id} className={`flex items-center gap-2.5 bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-3 ${t.completed?'opacity-60':''}`}>
          <div className="w-8 h-8 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 text-base">{t.icon}</div>
          <div className="flex-1 min-w-0" onClick={()=>onEdit(t)}>
            <p className="text-sm font-semibold text-gray-900 leading-snug">{t.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{durLabel(t.duration)}</p>
            {t.memo&&<p className="text-xs text-gray-400 truncate">{t.memo}</p>}
            <button onClick={e=>{e.stopPropagation();onMoveToTimeline(t);}}
              className="mt-2 text-xs font-semibold px-3 py-1.5 border border-gray-200 rounded-xl text-gray-600">
              今日のタイムラインへ →
            </button>
          </div>
          <button onClick={()=>onToggle(t.id)}
            className="w-6 h-6 rounded-full border-2 border-gray-300 shrink-0 flex items-center justify-center"/>
        </div>
      ))}
      {done.length>0&&<>
        <p className="text-xs text-gray-300 pt-3 pb-1">完了済み</p>
        {done.map(t=>(
          <div key={t.id} className="flex items-center gap-2.5 bg-white rounded-2xl border border-gray-100 px-3 py-3 opacity-60">
            <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-base">{t.icon}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-400 line-through">{t.name}</p>
            </div>
            <button onClick={()=>onToggle(t.id)}
              className="w-6 h-6 rounded-full border-2 border-gray-900 bg-gray-900 shrink-0 flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">✓</span>
            </button>
          </div>
        ))}
      </>}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [tasks,setTasks] = useState<Task[]>([]);
  const [settings,setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [date,setDate] = useState(todayStr());
  const [tab,setTab] = useState<'timeline'|'later'>('timeline');
  const [modal,setModal] = useState<{open:boolean;task:Task|null;prefillTime?:string}>({open:false,task:null});
  const [settingsOpen,setSettingsOpen] = useState(false);
  const [loaded,setLoaded] = useState(false);
  const [now,setNow] = useState(nowStr());

  useEffect(()=>{
    try {
      const t=localStorage.getItem(TASKS_KEY);
      const s=localStorage.getItem(SETTINGS_KEY);
      if(t) setTasks(JSON.parse(t));
      if(s) setSettings(JSON.parse(s));
    } catch{}
    setLoaded(true);
  },[]);

  useEffect(()=>{ if(loaded) localStorage.setItem(TASKS_KEY,JSON.stringify(tasks)); },[tasks,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings)); },[settings,loaded]);
  useEffect(()=>{
    const iv = setInterval(()=>setNow(nowStr()),60000);
    return ()=>clearInterval(iv);
  },[]);

  const laterTasks = useMemo(()=>tasks.filter(t=>t.isLater),[tasks]);
  const pendingCount = useMemo(()=>laterTasks.filter(t=>!t.completed).length,[laterTasks]);
  const weekDates = useMemo(()=>getWeekDates(date),[date]);
  const {day,month,year} = useMemo(()=>getDateInfo(date),[date]);
  const today = todayStr();

  const openAdd = (prefillTime?:string) => setModal({open:true,task:null,prefillTime});
  const openEdit = (task:Task) => setModal({open:true,task});
  const closeModal = () => setModal({open:false,task:null});

  const saveTask = (data:Omit<Task,'id'>) => {
    setTasks(prev=>modal.task
      ? prev.map(t=>t.id===modal.task!.id?{...t,...data}:t)
      : [...prev,{...data,id:uid()}]
    );
    closeModal();
  };
  const delTask = (id:string) => setTasks(prev=>prev.filter(t=>t.id!==id));
  const toggle = (id:string) => setTasks(prev=>prev.map(t=>t.id===id?{...t,completed:!t.completed}:t));
  const scheduleInSlot = (task:Task,startTime:string) =>
    setTasks(prev=>prev.map(t=>t.id===task.id?{...t,isLater:false,startTime,date}:t));
  const moveToTimeline = (task:Task) => setModal({open:true,task:{...task,isLater:false}});
  const carryOver = () => {
    const next=shiftDate(date,1);
    const toMove=tasks.filter(t=>t.date===date&&!t.completed&&!t.isLater);
    const rest=tasks.filter(t=>!(t.date===date&&!t.completed&&!t.isLater));
    setTasks([...rest,...toMove.map(t=>({...t,id:uid(),date:next}))]);
    setDate(next); setSettingsOpen(false);
  };

  if(!loaded) return <div className="flex h-screen items-center justify-center text-gray-400">読み込み中…</div>;

  return (
    <div className="max-w-md mx-auto min-h-screen bg-gray-50 font-sans">
      {/* header */}
      <header className="sticky top-0 z-30 bg-white shadow-sm">
        <div className="px-4 pt-4 pb-0">
          {/* date + nav */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-end gap-2">
              <span className="text-6xl font-black text-gray-900 leading-none">{day}</span>
              <div className="pb-1.5">
                <p className="text-lg font-bold text-gray-600 leading-tight">{month}月</p>
                <p className="text-sm text-gray-400">{year}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 pt-2">
              <button onClick={()=>setDate(shiftDate(date,-1))} className="w-8 h-8 flex items-center justify-center text-gray-600 font-semibold text-lg">‹</button>
              <button onClick={()=>setDate(today)}
                className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors ${date===today?'bg-gray-900 text-white':'border border-gray-300 text-gray-600'}`}>
                今日
              </button>
              <button onClick={()=>setDate(shiftDate(date,1))} className="w-8 h-8 flex items-center justify-center text-gray-600 font-semibold text-lg">›</button>
              <button onClick={()=>setSettingsOpen(!settingsOpen)}
                className={`w-8 h-8 flex items-center justify-center rounded-xl ml-1 transition-colors ${settingsOpen?'bg-gray-900 text-white':'text-gray-400'}`}>⚙</button>
            </div>
          </div>

          {/* settings */}
          {settingsOpen&&(
            <div className="mb-2 p-3 bg-gray-50 rounded-2xl border border-gray-100">
              <div className="flex gap-4 mb-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1">起床</p>
                  <input type="time" value={settings.wakeTime}
                    onChange={e=>setSettings(s=>({...s,wakeTime:e.target.value}))}
                    className="border border-gray-200 rounded-xl px-2.5 py-2 text-sm bg-white"/>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">就寝</p>
                  <input type="time" value={settings.sleepTime}
                    onChange={e=>setSettings(s=>({...s,sleepTime:e.target.value}))}
                    className="border border-gray-200 rounded-xl px-2.5 py-2 text-sm bg-white"/>
                </div>
              </div>
              <button onClick={carryOver}
                className="text-xs px-3 py-2 bg-gray-900 text-white rounded-xl font-semibold">
                未完了を翌日へ繰り越し →
              </button>
            </div>
          )}

          {/* week calendar */}
          <div className="grid grid-cols-7 py-2 border-t border-gray-50">
            {DAY_NAMES.map((name,i)=>{
              const d=weekDates[i];
              const isSel=d===date;
              const isToday=d===today;
              return (
                <button key={i} onClick={()=>setDate(d)} className="flex flex-col items-center gap-1 py-1">
                  <span className={`text-[11px] font-medium ${i===0?'text-red-400':i===6?'text-blue-400':'text-gray-400'}`}>{name}</span>
                  <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold transition-colors ${isSel?'bg-gray-900 text-white':isToday?'text-gray-900':'text-gray-500'}`}>
                    {new Date(d+'T12:00:00').getDate()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* body */}
      <main className="px-3 py-4 pb-28">
        {tab==='timeline' ? (
          <Timeline date={date} tasks={tasks} later={laterTasks} settings={settings} now={now}
            onToggle={toggle} onEdit={openEdit} onSchedule={scheduleInSlot}
            onAddAtTime={openAdd}/>
        ) : (
          <LaterList tasks={laterTasks} onToggle={toggle} onEdit={openEdit} onMoveToTimeline={moveToTimeline}/>
        )}
      </main>

      {/* bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 max-w-md mx-auto bg-white border-t border-gray-100 px-6 py-3 flex items-center justify-around">
        <button onClick={()=>setTab('later')}
          className={`flex items-center gap-1.5 text-sm font-semibold transition-colors ${tab==='later'?'text-gray-900':'text-gray-400'}`}>
          あとでやる
          {pendingCount>0&&(
            <span className="text-xs bg-gray-200 text-gray-700 w-5 h-5 rounded-full flex items-center justify-center font-bold">{pendingCount}</span>
          )}
        </button>
        <button onClick={()=>setTab('timeline')}
          className={`text-sm font-semibold transition-colors ${tab==='timeline'?'text-gray-900':'text-gray-400'}`}>
          タイムライン
        </button>
      </div>

      {/* FAB */}
      <div className="fixed bottom-16 right-4 z-50">
        <button onClick={()=>openAdd()}
          className="w-14 h-14 bg-gray-900 text-white rounded-full text-3xl shadow-2xl flex items-center justify-center active:bg-gray-700 leading-none">
          +
        </button>
      </div>

      {/* modal */}
      {modal.open&&(
        <TaskModal
          task={modal.task}
          currentDate={date}
          prefillTime={modal.prefillTime}
          onSave={saveTask}
          onDelete={modal.task ? ()=>delTask(modal.task!.id) : undefined}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
