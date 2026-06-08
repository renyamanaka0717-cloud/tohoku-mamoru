'use client';

import { useState, useEffect, useMemo } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  name: string;
  startTime: string | null;
  duration: number;           // 0 = なし
  memo: string;
  icon: string;
  completed: boolean;
  date: string;
  isLater: boolean;
  recurrence?: 'daily' | 'weekly' | null;
}

interface Settings { wakeTime: string; sleepTime: string; }
interface FreeSlot  { start: string; end: string; min: number; }

type TaskMode = 'later' | 'scheduled' | 'recurring';

// ── Constants ─────────────────────────────────────────────────────────────────

const ICONS = ['📝','💼','🏃','🍽️','📚','💊','🛒','🏠','💻','📞','🎯','⭐','🎵','🛁','🐕','✅'];
const DEFAULT_SETTINGS: Settings = { wakeTime: '07:00', sleepTime: '23:00' };
const TASKS_KEY    = 'tl-tasks-v2';
const SETTINGS_KEY = 'tl-settings-v2';
const PX_PER_HOUR  = 72;
const PX_PER_MIN   = PX_PER_HOUR / 60;
const DAY_NAMES    = ['日','月','火','水','木','金','土'];
const DUR_OPTS     = [{v:0,l:'なし'},{v:5,l:'5分'},{v:10,l:'10分'},{v:15,l:'15分'},{v:30,l:'30分'}];

// ── Utils ─────────────────────────────────────────────────────────────────────

const toMin    = (t: string) => { const [h,m]=t.split(':').map(Number); return h*60+m; };
const fromMin  = (m: number) => `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const dateToStr= (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const todayStr = () => dateToStr(new Date());
const nowStr   = () => { const d=new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
const shiftDate= (s: string, n: number) => { const d=new Date(s+'T12:00:00'); d.setDate(d.getDate()+n); return dateToStr(d); };
const uid      = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const durLabel = (m: number) => m<=0?'':m>=60?`${Math.floor(m/60)}時間${m%60?`${m%60}分`:''}` :`${m}分`;
const getDateInfo= (s: string) => { const d=new Date(s+'T12:00:00'); return {day:d.getDate(),month:d.getMonth()+1,year:d.getFullYear()}; };
const getWeekDates=(s:string)=>{ const d=new Date(s+'T12:00:00'),dow=d.getDay(); return Array.from({length:7},(_,i)=>{const c=new Date(d);c.setDate(d.getDate()-dow+i);return dateToStr(c);}); };
const shiftMonth=(y:number,m:number,d:number)=>{ let nm=m+d,ny=y; if(nm<0){nm=11;ny--;}if(nm>11){nm=0;ny++;} return {year:ny,month:nm}; };

// ── Free slots ────────────────────────────────────────────────────────────────

function calcFreeSlots(tasks: Task[], date: string, s: Settings): FreeSlot[] {
  const scheduled = tasks
    .filter(t=>t.date===date&&!t.isLater&&t.startTime&&(t.duration??0)>0)
    .map(t=>[toMin(t.startTime!),toMin(t.startTime!)+(t.duration??0)] as [number,number])
    .sort((a,b)=>a[0]-b[0]);
  const slots:FreeSlot[]=[];
  let cur=toMin(s.wakeTime);
  const end=toMin(s.sleepTime);
  for(const [st,en] of scheduled){
    if(st>cur) slots.push({start:fromMin(cur),end:fromMin(st),min:st-cur});
    cur=Math.max(cur,en);
  }
  if(cur<end) slots.push({start:fromMin(cur),end:fromMin(end),min:end-cur});
  return slots.filter(sl=>sl.min>=10);
}

// ── MonthCalendar ─────────────────────────────────────────────────────────────

function MonthCalendar({selected,onSelect,onClose,tasks}:{selected:string;onSelect:(d:string)=>void;onClose:()=>void;tasks:Task[];}) {
  const init = new Date(selected+'T12:00:00');
  const [vm,setVm] = useState({year:init.getFullYear(),month:init.getMonth()});
  const today = todayStr();

  const taskDates = useMemo(()=>new Set(tasks.filter(t=>!t.isLater&&t.startTime).map(t=>t.date)),[tasks]);

  const days = useMemo(()=>{
    const {year,month}=vm;
    const first=new Date(year,month,1).getDay();
    const total=new Date(year,month+1,0).getDate();
    const arr:(string|null)[]=Array(first).fill(null);
    for(let d=1;d<=total;d++) arr.push(dateToStr(new Date(year,month,d)));
    return arr;
  },[vm]);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white w-full max-w-md mx-auto rounded-t-3xl p-4 pb-8" onClick={e=>e.stopPropagation()}>
        <div className="flex justify-center mb-3"><div className="w-10 h-1 bg-gray-200 rounded-full"/></div>
        <div className="flex items-center justify-between mb-4 px-1">
          <button onClick={()=>setVm(m=>shiftMonth(m.year,m.month,-1))} className="w-9 h-9 flex items-center justify-center text-gray-600 text-xl font-semibold">‹</button>
          <span className="font-bold text-gray-900">{vm.year}年{vm.month+1}月</span>
          <button onClick={()=>setVm(m=>shiftMonth(m.year,m.month,1))} className="w-9 h-9 flex items-center justify-center text-gray-600 text-xl font-semibold">›</button>
        </div>
        <div className="grid grid-cols-7 mb-1">
          {DAY_NAMES.map((n,i)=>(
            <div key={i} className={`text-center text-xs font-semibold py-1 ${i===0?'text-red-400':i===6?'text-blue-400':'text-gray-400'}`}>{n}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d,i)=>(
            <div key={i} className="flex flex-col items-center py-0.5">
              <button onClick={()=>{if(d){onSelect(d);onClose();}}}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium ${
                  !d?'':d===selected?'bg-gray-900 text-white':d===today?'bg-gray-100 font-bold text-gray-900':'text-gray-600'
                }`}>
                {d?new Date(d+'T12:00:00').getDate():''}
              </button>
              <div className={`w-1.5 h-1.5 rounded-full ${d&&taskDates.has(d)?(d===selected?'bg-gray-400':'bg-gray-400'):'bg-transparent'}`}/>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── TaskModal ─────────────────────────────────────────────────────────────────

function TaskModal({task,currentDate,prefillTime,onSave,onDelete,onClose}:{
  task:Task|null; currentDate:string; prefillTime?:string;
  onSave:(tasks:Omit<Task,'id'>[])=>void; onDelete?:()=>void; onClose:()=>void;
}) {
  const initMode=():TaskMode=>{
    if(!task) return prefillTime?'scheduled':'later';
    if(task.recurrence) return 'recurring';
    if(task.isLater) return 'later';
    return 'scheduled';
  };

  const [mode,setMode]       = useState<TaskMode>(initMode());
  const [name,setName]       = useState(task?.name??'');
  const [startTime,setST]    = useState(task?.startTime??prefillTime??'');
  const [duration,setDur]    = useState(task?.duration??30);
  const [memo,setMemo]       = useState(task?.memo??'');
  const [icon,setIcon]       = useState(task?.icon??'📝');
  const [recur,setRecur]     = useState<'daily'|'weekly'>((task?.recurrence==='weekly')?'weekly':'daily');
  const [iconOpen,setIconOpen]= useState(false);

  const headerIcon = mode==='scheduled'?'🕐':mode==='recurring'?'🔄':icon;

  const save=()=>{
    if(!name.trim()) return;
    const base:Omit<Task,'id'>={
      name:name.trim(),
      startTime:mode==='later'?null:(startTime||null),
      duration,
      memo,
      icon:headerIcon,
      completed:task?.completed??false,
      date:task?.date??currentDate,
      isLater:mode==='later',
      recurrence:mode==='recurring'?recur:null,
    };
    if(mode==='recurring'&&!task){
      const step=recur==='daily'?1:7;
      const days=recur==='daily'?14:28;
      const instances:Omit<Task,'id'>[]=[];
      for(let i=0;i<days;i+=step) instances.push({...base,date:shiftDate(currentDate,i)});
      onSave(instances);
    } else {
      onSave([base]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60" onClick={onClose}>
      <div className="absolute bottom-0 left-0 right-0 max-w-md mx-auto" onClick={e=>e.stopPropagation()}>
        {/* ── Dark header ── */}
        <div className="bg-gray-900 rounded-t-3xl px-4 pt-4">
          {/* Buttons row */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={onClose} className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-white">×</button>
            <button onClick={save} disabled={!name.trim()}
              className="px-5 py-1.5 bg-gray-600 text-white text-sm font-semibold rounded-full disabled:opacity-40">保存</button>
          </div>

          {/* Icon + name */}
          <div className="flex items-center gap-3 mb-4">
            <button onClick={()=>mode==='later'&&setIconOpen(!iconOpen)}
              className="w-12 h-12 bg-gray-700 rounded-2xl flex items-center justify-center text-2xl shrink-0 relative">
              {headerIcon}
              {mode==='later'&&<span className="absolute -bottom-0.5 -right-0.5 text-[10px] bg-gray-500 text-white rounded-full px-0.5">✎</span>}
            </button>
            <div className="flex-1 min-w-0">
              {(mode==='scheduled'||mode==='recurring')&&startTime&&(
                <p className="text-xs text-gray-400 mb-0.5">{startTime}{mode==='recurring'&&' · 繰り返し'}</p>
              )}
              <input type="text" value={name} onChange={e=>setName(e.target.value)}
                placeholder="タスク名を入力..."
                className="w-full bg-transparent text-white text-lg font-medium placeholder-gray-500 outline-none border-b border-gray-700 pb-1"
                autoFocus/>
            </div>
          </div>

          {/* Icon picker */}
          {iconOpen&&mode==='later'&&(
            <div className="flex flex-wrap gap-2 pb-3">
              {ICONS.map(ic=>(
                <button key={ic} onClick={()=>{setIcon(ic);setIconOpen(false);}}
                  className={`text-xl w-10 h-10 rounded-xl flex items-center justify-center ${icon===ic?'bg-white/20':'bg-gray-700'}`}>
                  {ic}
                </button>
              ))}
            </div>
          )}

          {/* Tabs */}
          <div className="flex bg-gray-800 rounded-xl p-1">
            {([['later','あとで'],['scheduled','時間指定'],['recurring','繰り返し']] as [TaskMode,string][]).map(([m,l])=>(
              <button key={m} onClick={()=>setMode(m)}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${mode===m?'bg-white text-gray-900':'text-gray-400'}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="h-1"/>
        </div>

        {/* ── White content ── */}
        <div className="bg-gray-50 max-h-[55vh] overflow-y-auto">
          {/* Memo */}
          <div className="bg-white mx-3 mt-3 rounded-2xl p-4">
            <textarea value={memo} onChange={e=>setMemo(e.target.value)}
              placeholder="メモを追加..." rows={3}
              className="w-full text-sm text-gray-700 placeholder-gray-400 outline-none resize-none bg-transparent"/>
          </div>

          {/* Recurring settings */}
          {mode==='recurring'&&(
            <div className="bg-white mx-3 mt-3 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🔄</span>
                <span className="text-sm font-semibold text-gray-800">繰り返し</span>
              </div>
              <div className="flex gap-2">
                {([['daily','毎日'],['weekly','毎週']] as ['daily'|'weekly',string][]).map(([r,l])=>(
                  <button key={r} onClick={()=>setRecur(r)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold ${recur===r?'bg-gray-900 text-white':'bg-gray-100 text-gray-600'}`}>
                    {l}
                  </button>
                ))}
                <span className="px-3 py-2 rounded-full text-sm text-gray-300 bg-gray-100 flex items-center gap-1">毎月<span className="text-[10px] bg-gray-200 px-1 rounded">PRO</span></span>
              </div>
            </div>
          )}

          {/* Time */}
          {(mode==='scheduled'||mode==='recurring')&&(
            <div className="bg-white mx-3 mt-3 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🕐</span>
                <span className="text-sm font-semibold text-gray-800">開始時刻</span>
              </div>
              <input type="time" value={startTime} onChange={e=>setST(e.target.value)}
                className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 outline-none focus:border-gray-400"/>
            </div>
          )}

          {/* Duration */}
          <div className="bg-white mx-3 mt-3 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🕐</span>
              <span className="text-sm font-semibold text-gray-800">所要時間</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {DUR_OPTS.map(({v,l})=>(
                <button key={v} onClick={()=>setDur(v)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold ${duration===v?'bg-gray-900 text-white':'bg-gray-100 text-gray-600'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* PRO features */}
          <div className="bg-white mx-3 mt-3 rounded-2xl overflow-hidden">
            {[
              {ic:'☆',label:'ピン留め',desc:'リストの上部に固定表示'},
              {ic:'🏷️',label:'タグ',desc:'PROにアップグレード'},
            ].map(({ic,label,desc})=>(
              <div key={label} className="flex items-center justify-between p-4 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-xl w-8 text-center">{ic}</span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-gray-800">{label}</span>
                      <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded font-bold">★ PRO</span>
                    </div>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </div>
                </div>
                <span className="text-gray-200 text-lg">›</span>
              </div>
            ))}
          </div>

          {/* Delete */}
          {task&&onDelete&&(
            <button onClick={()=>{onDelete();onClose();}}
              className="w-full mt-3 mb-2 py-3 text-sm text-red-400 font-medium">
              削除する
            </button>
          )}
          <div className="h-6"/>
        </div>
      </div>
    </div>
  );
}

// ── TaskCard ──────────────────────────────────────────────────────────────────

function TaskCard({task,onToggle,onEdit}:{task:Task;onToggle:()=>void;onEdit:()=>void;}) {
  const endTime = (task.startTime&&(task.duration??0)>0) ? fromMin(toMin(task.startTime)+(task.duration??0)) : null;
  return (
    <div className={`flex items-center gap-2.5 bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-2.5 ${task.completed?'opacity-50':''}`}
      onClick={onEdit}>
      <div className="w-8 h-8 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 text-base leading-none">
        {task.icon}
      </div>
      <div className="flex-1 min-w-0">
        {task.startTime&&(
          <p className="text-[11px] text-gray-400 leading-none mb-0.5">
            {task.startTime}{endTime?`〜${endTime}`:''}
            {task.recurrence&&<span className="ml-1">🔄</span>}
          </p>
        )}
        <p className={`text-sm font-semibold leading-snug ${task.completed?'line-through text-gray-400':'text-gray-900'}`}>{task.name}</p>
        {task.memo&&<p className="text-xs text-gray-400 mt-0.5 truncate">{task.memo}</p>}
      </div>
      <button onClick={e=>{e.stopPropagation();onToggle();}}
        className={`w-6 h-6 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${task.completed?'border-gray-900 bg-gray-900':'border-gray-300'}`}>
        {task.completed&&<span className="text-white text-[10px] font-bold leading-none">✓</span>}
      </button>
    </div>
  );
}

// ── FreeTimeCard ──────────────────────────────────────────────────────────────

function FreeTimeCard({slot,fits,onSchedule}:{slot:FreeSlot;fits:Task[];onSchedule:(t:Task,time:string)=>void;}) {
  const h=Math.floor(slot.min/60), m=slot.min%60;
  const label=`${h>0?`${h}時間`:''}${m>0?`${m}分`:''}`;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-gray-200"/>
        <span className="text-xs text-gray-400 font-medium whitespace-nowrap">空き {label}</span>
        <div className="flex-1 h-px bg-gray-200"/>
      </div>
      {fits.map(t=>(
        <div key={t.id} className="flex items-center gap-2.5 bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-2.5">
          <div className="w-8 h-8 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-base shrink-0">{t.icon}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{t.name}</p>
            {(t.duration??0)>0&&<p className="text-xs text-gray-400">{durLabel(t.duration??0)}</p>}
          </div>
          <button onClick={()=>onSchedule(t,slot.start)}
            className="text-xs font-bold px-3 py-1.5 bg-gray-900 text-white rounded-xl shrink-0">
            入れる
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────────

function Timeline({date,tasks,later,settings,now,onToggle,onEdit,onSchedule,onAddAtTime}:{
  date:string;tasks:Task[];later:Task[];settings:Settings;now:string;
  onToggle:(id:string)=>void;onEdit:(t:Task)=>void;
  onSchedule:(t:Task,time:string)=>void;onAddAtTime:(time:string)=>void;
}) {
  const wakeMin=toMin(settings.wakeTime),sleepMin=toMin(settings.sleepTime);
  const totalMins=sleepMin-wakeMin,totalHeight=totalMins*PX_PER_MIN;
  const nowMin=toMin(now);
  const calcY=(min:number)=>(min-wakeMin)*PX_PER_MIN;

  const dayTasks=tasks.filter(t=>t.date===date&&!t.isLater&&t.startTime).sort((a,b)=>toMin(a.startTime!)-toMin(b.startTime!));
  const freeSlots=calcFreeSlots(tasks,date,settings);
  const laterPool=later.filter(t=>!t.completed);

  const hours:number[]=[];
  for(let m=wakeMin;m<=sleepMin;m+=60) hours.push(m);

  const AXIS_X=52, CARD_LEFT=AXIS_X+16;

  return (
    <div className="relative" style={{height:`${totalHeight+32}px`,minHeight:'400px'}}>
      {/* vertical line */}
      <div className="absolute w-px bg-gray-200" style={{left:`${AXIS_X}px`,top:0,height:`${totalHeight}px`}}/>

      {/* hour marks */}
      {hours.map(h=>{
        const isWake=h===wakeMin, isSleep=h===sleepMin;
        const inFree=freeSlots.some(s=>toMin(s.start)<=h&&h<toMin(s.end));
        const hasTask=dayTasks.some(t=>toMin(t.startTime!)===h);
        return (
          <div key={h} className="absolute flex items-center" style={{top:`${calcY(h)-8}px`,left:0}}>
            {/* tappable time label */}
            <button
              onClick={()=>!isWake&&!isSleep&&onAddAtTime(fromMin(h))}
              className={`text-xs w-12 text-right pr-1 leading-none transition-colors ${
                isWake||isSleep?'text-gray-400 cursor-default':'text-gray-400 active:text-gray-900'
              }`}>
              {fromMin(h)}
            </button>
            {(isWake||isSleep)?(
              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-sm -ml-3.5 z-10 shadow-sm">
                {isWake?'☀️':'🌙'}
              </div>
            ):(
              <div className={`w-2.5 h-2.5 rounded-full border-2 -ml-1.5 z-10 ${inFree||hasTask?'border-transparent bg-transparent':'border-gray-200 bg-white'}`}/>
            )}
          </div>
        );
      })}

      {/* current time */}
      {date===todayStr()&&nowMin>=wakeMin&&nowMin<=sleepMin&&(
        <div className="absolute flex items-center z-20 gap-1.5" style={{top:`${calcY(nowMin)-12}px`,left:0,right:0}}>
          <div className="bg-gray-900 text-white text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap">{now}</div>
          <button onClick={()=>onAddAtTime(now)} className="w-5 h-5 bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">+</button>
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
        const fits=laterPool.filter(t=>(t.duration??0)<=slot.min).slice(0,3);
        return (
          <div key={i} className="absolute z-10" style={{top:`${calcY(toMin(slot.start))+2}px`,left:`${CARD_LEFT}px`,right:'0px'}}>
            <FreeTimeCard slot={slot} fits={fits} onSchedule={onSchedule}/>
          </div>
        );
      })}

      {/* empty state */}
      {dayTasks.length===0&&freeSlots.length===0&&(
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{left:`${CARD_LEFT}px`}}>
          <p className="text-4xl mb-2">📋</p>
          <p className="text-sm text-gray-400">タスクがありません</p>
          <p className="text-xs text-gray-300 mt-1">時間をタップして追加</p>
        </div>
      )}
    </div>
  );
}

// ── LaterSheet ────────────────────────────────────────────────────────────────

function LaterSheet({tasks,onToggle,onEdit,onMoveToTimeline,onClose}:{
  tasks:Task[];onToggle:(id:string)=>void;onEdit:(t:Task)=>void;
  onMoveToTimeline:(t:Task)=>void;onClose:()=>void;
}) {
  const pending=tasks.filter(t=>!t.completed);
  const done=tasks.filter(t=>t.completed);

  return (
    <div className="fixed inset-0 z-50 flex flex-col" onClick={onClose}>
      <div className="flex-1"/>
      <div className="bg-white w-full max-w-md mx-auto rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full"/>
        </div>
        <div className="flex items-center justify-between px-4 py-2 shrink-0">
          <h2 className="text-base font-bold text-gray-900">あとでやる</h2>
          <button onClick={onClose} className="text-gray-400 text-xl w-8 h-8 flex items-center justify-center">×</button>
        </div>
        <div className="overflow-y-auto px-4 pb-10 flex-1">
          {tasks.length===0?(
            <div className="py-12 text-center">
              <p className="text-4xl mb-2">✨</p>
              <p className="text-sm text-gray-400">あとでやるタスクはありません</p>
            </div>
          ):(
            <div className="space-y-2 pt-1">
              {pending.map(t=>(
                <div key={t.id} className="flex items-center gap-2.5 bg-white border border-gray-100 rounded-2xl shadow-sm px-3 py-3">
                  <div className="w-8 h-8 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-base shrink-0">{t.icon}</div>
                  <div className="flex-1 min-w-0" onClick={()=>onEdit(t)}>
                    <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                    {(t.duration??0)>0&&<p className="text-xs text-gray-400">{durLabel(t.duration??0)}</p>}
                    {t.memo&&<p className="text-xs text-gray-400 truncate">{t.memo}</p>}
                    <button onClick={e=>{e.stopPropagation();onMoveToTimeline(t);}}
                      className="mt-2 text-xs font-semibold px-3 py-1.5 border border-gray-200 rounded-xl text-gray-600">
                      今日のタイムラインへ →
                    </button>
                  </div>
                  <button onClick={()=>onToggle(t.id)} className="w-6 h-6 rounded-full border-2 border-gray-300 shrink-0 flex items-center justify-center"/>
                </div>
              ))}
              {done.length>0&&<>
                <p className="text-xs text-gray-300 pt-3 pb-1">完了済み</p>
                {done.map(t=>(
                  <div key={t.id} className="flex items-center gap-2.5 bg-gray-50 border border-gray-100 rounded-2xl px-3 py-3 opacity-60">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-base shrink-0">{t.icon}</div>
                    <div className="flex-1"><p className="text-sm font-semibold text-gray-400 line-through">{t.name}</p></div>
                    <button onClick={()=>onToggle(t.id)} className="w-6 h-6 rounded-full border-2 border-gray-900 bg-gray-900 shrink-0 flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold">✓</span>
                    </button>
                  </div>
                ))}
              </>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [tasks,setTasks]         = useState<Task[]>([]);
  const [settings,setSettings]   = useState<Settings>(DEFAULT_SETTINGS);
  const [date,setDate]           = useState(todayStr());
  const [modal,setModal]         = useState<{open:boolean;task:Task|null;prefillTime?:string}>({open:false,task:null});
  const [settingsOpen,setSOp]    = useState(false);
  const [calendarOpen,setCalOp]  = useState(false);
  const [laterOpen,setLaterOpen] = useState(false);
  const [loaded,setLoaded]       = useState(false);
  const [now,setNow]             = useState(nowStr());
  const [touchY,setTouchY]       = useState(0);

  useEffect(()=>{
    try{
      const t=localStorage.getItem(TASKS_KEY);
      const s=localStorage.getItem(SETTINGS_KEY);
      if(t) setTasks((JSON.parse(t) as Task[]).map(tk=>({...tk,recurrence:tk.recurrence??null})));
      if(s) setSettings(JSON.parse(s));
    }catch{}
    setLoaded(true);
  },[]);

  useEffect(()=>{ if(loaded) localStorage.setItem(TASKS_KEY,JSON.stringify(tasks)); },[tasks,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings)); },[settings,loaded]);
  useEffect(()=>{ const iv=setInterval(()=>setNow(nowStr()),60000); return ()=>clearInterval(iv); },[]);

  const laterTasks    = useMemo(()=>tasks.filter(t=>t.isLater),[tasks]);
  const pendingCount  = useMemo(()=>laterTasks.filter(t=>!t.completed).length,[laterTasks]);
  const weekDates     = useMemo(()=>getWeekDates(date),[date]);
  const taskDateSet   = useMemo(()=>new Set(tasks.filter(t=>!t.isLater&&t.startTime).map(t=>t.date)),[tasks]);
  const {day,month,year} = useMemo(()=>getDateInfo(date),[date]);
  const today = todayStr();

  const openAdd  = (prefillTime?:string) => setModal({open:true,task:null,prefillTime});
  const openEdit = (task:Task) => setModal({open:true,task});
  const closeModal = () => setModal({open:false,task:null});

  const saveTasks = (data:Omit<Task,'id'>[]) => {
    const newTasks = data.map(d=>({...d,id:uid()}));
    setTasks(prev=>modal.task
      ? prev.map(t=>t.id===modal.task!.id?{...newTasks[0],id:t.id}:t)
      : [...prev,...newTasks]
    );
    closeModal();
  };
  const delTask  = (id:string) => setTasks(prev=>prev.filter(t=>t.id!==id));
  const toggle   = (id:string) => setTasks(prev=>prev.map(t=>t.id===id?{...t,completed:!t.completed}:t));
  const scheduleInSlot=(task:Task,startTime:string)=>setTasks(prev=>prev.map(t=>t.id===task.id?{...t,isLater:false,startTime,date}:t));
  const moveToTimeline=(task:Task)=>setModal({open:true,task:{...task,isLater:false}});
  const carryOver=()=>{
    const next=shiftDate(date,1);
    const toMove=tasks.filter(t=>t.date===date&&!t.completed&&!t.isLater);
    const rest=tasks.filter(t=>!(t.date===date&&!t.completed&&!t.isLater));
    setTasks([...rest,...toMove.map(t=>({...t,id:uid(),date:next}))]);
    setDate(next); setSOp(false);
  };

  if(!loaded) return <div className="flex h-screen items-center justify-center text-gray-400">読み込み中…</div>;

  return (
    <div className="max-w-md mx-auto min-h-screen bg-gray-50 font-sans">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-white shadow-sm">
        <div className="px-4 pt-4 pb-0">
          {/* Date + nav */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-end gap-2">
              <span className="text-6xl font-black text-gray-900 leading-none">{day}</span>
              <div className="pb-1.5">
                <p className="text-lg font-bold text-gray-600 leading-tight">{month}月</p>
                <p className="text-sm text-gray-400">{year}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 pt-2">
              <button onClick={()=>setDate(shiftDate(date,-1))} className="w-8 h-8 flex items-center justify-center text-gray-600 text-xl font-semibold">‹</button>
              <button onClick={()=>setDate(today)}
                className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors ${date===today?'bg-gray-900 text-white':'border border-gray-300 text-gray-600'}`}>
                今日
              </button>
              <button onClick={()=>setDate(shiftDate(date,1))} className="w-8 h-8 flex items-center justify-center text-gray-600 text-xl font-semibold">›</button>
              {/* Calendar icon */}
              <button onClick={()=>setCalOp(true)} className="w-8 h-8 flex items-center justify-center text-gray-400 text-lg">📅</button>
              {/* Settings */}
              <button onClick={()=>setSOp(!settingsOpen)}
                className={`w-8 h-8 flex items-center justify-center rounded-xl transition-colors ${settingsOpen?'bg-gray-900 text-white':'text-gray-400'}`}>⚙</button>
            </div>
          </div>

          {/* Settings panel */}
          {settingsOpen&&(
            <div className="mb-2 p-3 bg-gray-50 rounded-2xl border border-gray-100">
              <div className="flex gap-4 mb-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1">起床</p>
                  <input type="time" value={settings.wakeTime} onChange={e=>setSettings(s=>({...s,wakeTime:e.target.value}))}
                    className="border border-gray-200 rounded-xl px-2.5 py-2 text-sm bg-white"/>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">就寝</p>
                  <input type="time" value={settings.sleepTime} onChange={e=>setSettings(s=>({...s,sleepTime:e.target.value}))}
                    className="border border-gray-200 rounded-xl px-2.5 py-2 text-sm bg-white"/>
                </div>
              </div>
              <button onClick={carryOver} className="text-xs px-3 py-2 bg-gray-900 text-white rounded-xl font-semibold">
                未完了を翌日へ繰り越し →
              </button>
            </div>
          )}

          {/* Week calendar */}
          <div className="grid grid-cols-7 py-2 border-t border-gray-50">
            {DAY_NAMES.map((name,i)=>{
              const d=weekDates[i];
              const isSel=d===date, isToday=d===today;
              return (
                <button key={i} onClick={()=>setDate(d)} className="flex flex-col items-center py-1">
                  <span className={`text-[11px] font-medium ${i===0?'text-red-400':i===6?'text-blue-400':'text-gray-400'}`}>{name}</span>
                  <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold transition-colors ${isSel?'bg-gray-900 text-white':isToday?'bg-gray-100 text-gray-900':'text-gray-600'}`}>
                    {new Date(d+'T12:00:00').getDate()}
                  </span>
                  <div className={`w-1.5 h-1.5 rounded-full ${taskDateSet.has(d)?(isSel?'bg-gray-400':'bg-gray-400'):'bg-transparent'}`}/>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* ── Timeline ── */}
      <main className="px-3 py-4 pb-24">
        <Timeline date={date} tasks={tasks} later={laterTasks} settings={settings} now={now}
          onToggle={toggle} onEdit={openEdit} onSchedule={scheduleInSlot} onAddAtTime={openAdd}/>
      </main>

      {/* ── Bottom bar (あとでやる) ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 max-w-md mx-auto"
        onTouchStart={e=>setTouchY(e.touches[0].clientY)}
        onTouchEnd={e=>{ if(touchY-e.changedTouches[0].clientY>30) setLaterOpen(true); }}
      >
        <button
          onClick={()=>setLaterOpen(true)}
          className="w-full bg-white border-t border-gray-100 flex items-center justify-between px-5 py-3"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">あとでやる</span>
            {pendingCount>0&&(
              <span className="text-xs bg-gray-900 text-white w-5 h-5 rounded-full flex items-center justify-center font-bold">{pendingCount}</span>
            )}
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <div className="w-4 h-0.5 bg-gray-300 rounded-full"/>
            <div className="w-4 h-0.5 bg-gray-300 rounded-full"/>
          </div>
        </button>
      </div>

      {/* ── FAB ── */}
      <div className="fixed bottom-16 right-4 z-50">
        <button onClick={()=>openAdd()}
          className="w-14 h-14 bg-gray-900 text-white rounded-full text-3xl shadow-2xl flex items-center justify-center active:bg-gray-700 leading-none">
          +
        </button>
      </div>

      {/* ── Later sheet ── */}
      {laterOpen&&(
        <LaterSheet tasks={laterTasks} onToggle={toggle} onEdit={openEdit}
          onMoveToTimeline={moveToTimeline} onClose={()=>setLaterOpen(false)}/>
      )}

      {/* ── Calendar ── */}
      {calendarOpen&&(
        <MonthCalendar selected={date} onSelect={setDate} onClose={()=>setCalOp(false)} tasks={tasks}/>
      )}

      {/* ── Task Modal ── */}
      {modal.open&&(
        <TaskModal task={modal.task} currentDate={date} prefillTime={modal.prefillTime}
          onSave={saveTasks}
          onDelete={modal.task?()=>delTask(modal.task!.id):undefined}
          onClose={closeModal}/>
      )}
    </div>
  );
}
