'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { AppIcons } from './components/Icons';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CustomRec {
  frequency: 'day'|'week'|'month'|'year'|'hour';
  interval: number;
  weekdays?: number[];           // 0=日…6=土
  monthlyType?: 'date'|'weekday';
  dayOfMonth?: number|'last';
  weekNumber?: number|'last';    // 1–4 | 'last'
  weekday?: number;              // 0–6
  yearMonth?: number;            // 1–12
  yearDay?: number;              // 1–31, 0=月末
  endType: 'never'|'date'|'count';
  endDate?: string;
  endCount?: number;
}

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
  recurrence?: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom' | null;
  customRec?: CustomRec;
  pinned?: boolean;
  tags?: string[];
  notifications?: number[];     // 開始何分前 (0=開始時, 1440=前日)
  incompleteReminder?: boolean;
  category?: string;
  postponedCount?: number;
  lastPostponedDate?: string;
  color?: string;
  subtasks?: {id:string;name:string;completed:boolean}[];
}

interface Settings { wakeTime: string; sleepTime: string; }
interface FreeSlot  { start: string; end: string; min: number; }
interface ShopItem  { id: string; name: string; checked: boolean; purchasedAt?: string; }
interface TagDef    { name: string; color: string; }
interface MoveHistory { id: string; date: string; taskNames: string[]; }

type TaskMode = 'later' | 'scheduled' | 'recurring';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: Settings = { wakeTime: '07:00', sleepTime: '23:00' };
const TASKS_KEY    = 'tl-tasks-v2';
const SETTINGS_KEY = 'tl-settings-v2';
const SHOP_KEY     = 'tl-shop-v1';
const TAGS_KEY     = 'tl-tags-v1';
const HISTORY_KEY  = 'tl-history-v1';
const TAG_COLORS: {bg:string;text:string}[] = [
  {bg:'#FFD6E0',text:'#9B2335'},{bg:'#FFE4CC',text:'#9C4A20'},
  {bg:'#FFF3CC',text:'#7A5800'},{bg:'#E2F5CC',text:'#3A6B0E'},
  {bg:'#CCF0E8',text:'#0E5E47'},{bg:'#CCE8F5',text:'#0A4F76'},
  {bg:'#CCE0FF',text:'#1A3F9E'},{bg:'#E8CCFF',text:'#5B1F9E'},
  {bg:'#F0CCF5',text:'#7A1A8E'},{bg:'#F5DDCC',text:'#8C3D10'},
];
const getTagTextColor=(bg:string)=>TAG_COLORS.find(c=>c.bg===bg)?.text??'#374151';
const PX_PER_HOUR  = 40;
const PX_PER_MIN   = PX_PER_HOUR / 60;
const DAY_NAMES    = ['日','月','火','水','木','金','土'];
const DUR_OPTS     = [
  {v:0,l:'なし'},
  {v:5,l:'5分'},{v:10,l:'10分'},{v:15,l:'15分'},{v:30,l:'30分'},{v:45,l:'45分'},
  {v:60,l:'1時間'},{v:90,l:'1時間半'},{v:120,l:'2時間'},
  {v:180,l:'3時間'},{v:240,l:'4時間'},{v:300,l:'5時間'},
];
const NOTIF_OPTS   = [{v:0,l:'開始時'},{v:5,l:'5分前'},{v:10,l:'10分前'},{v:15,l:'15分前'},{v:30,l:'30分前'},{v:60,l:'1時間前'},{v:1440,l:'前日'}];
const CATEGORIES   = ['個人','仕事'];

// ── Utils ─────────────────────────────────────────────────────────────────────

const toMin       = (t: string) => { const [h,m]=t.split(':').map(Number); return h*60+m; };
const fromMin     = (m: number) => `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const dateToStr   = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const todayStr    = () => dateToStr(new Date());
const nowStr      = () => { const d=new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
const shiftDate   = (s: string, n: number) => { const d=new Date(s+'T12:00:00'); d.setDate(d.getDate()+n); return dateToStr(d); };
const shiftMonthBy= (s: string, n: number) => { const d=new Date(s+'T12:00:00'); d.setMonth(d.getMonth()+n); return dateToStr(d); };
const shiftYearBy = (s: string, n: number) => { const d=new Date(s+'T12:00:00'); d.setFullYear(d.getFullYear()+n); return dateToStr(d); };
const uid         = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const durLabel    = (m: number) => m<=0?'':m>=60?`${Math.floor(m/60)}時間${m%60?`${m%60}分`:''}` :`${m}分`;
const getDateInfo = (s: string) => { const d=new Date(s+'T12:00:00'); return {day:d.getDate(),month:d.getMonth()+1,year:d.getFullYear()}; };
const getWeekDates= (s:string)=>{ const d=new Date(s+'T12:00:00'),dow=d.getDay(); return Array.from({length:7},(_,i)=>{const c=new Date(d);c.setDate(d.getDate()-dow+i);return dateToStr(c);}); };
const shiftMonth  = (y:number,m:number,d:number)=>{ let nm=m+d,ny=y; if(nm<0){nm=11;ny--;}if(nm>11){nm=0;ny++;} return {year:ny,month:nm}; };

const summarizeCustomRec=(r:CustomRec):string=>{
  const WD=['日','月','火','水','木','金','土'];
  let main='';
  if(r.frequency==='hour'){
    main=r.interval===1?'毎時':`${r.interval}時間ごと`;
  } else if(r.frequency==='day'){
    main=r.interval===1?'毎日':`${r.interval}日ごと`;
  } else if(r.frequency==='week'){
    const base=r.interval===1?'毎週':`${r.interval}週間ごと`;
    const days=(r.weekdays??[]).sort((a,b)=>a-b).map(d=>WD[d]).join('・');
    main=days?`${base}の${days}`:base;
  } else if(r.frequency==='month'){
    const base=r.interval===1?'毎月':`${r.interval}ヶ月ごと`;
    if(r.monthlyType==='weekday'){
      const wn=r.weekNumber==='last'?'最終':`第${r.weekNumber}`;
      main=`${base}${wn}${WD[r.weekday??1]}曜日`;
    } else {
      const d=r.dayOfMonth==='last'?'月末':`${r.dayOfMonth??1}日`;
      main=`${base}${d}`;
    }
  } else {
    const base=r.interval===1?'毎年':`${r.interval}年ごと`;
    const d=r.yearDay===0?'末':`${r.yearDay??1}日`;
    main=`${base}${r.yearMonth??1}月${d}`;
  }
  if(r.endType==='count'&&r.endCount) main+=`・${r.endCount}回で終了`;
  else if(r.endType==='date'&&r.endDate){
    const dt=new Date(r.endDate+'T12:00:00');
    main+=`・〜${dt.getMonth()+1}月${dt.getDate()}日`;
  }
  return main;
};

const recLabel=(t:Task):string=>{
  if(t.recurrence==='daily') return '毎日';
  if(t.recurrence==='weekly') return '毎週';
  if(t.recurrence==='monthly') return '毎月';
  if(t.recurrence==='yearly') return '毎年';
  if(t.recurrence==='custom'&&t.customRec) return summarizeCustomRec(t.customRec);
  return '';
};

const generateCustomDates=(base:string,r:CustomRec):string[]=>{
  const dates:string[]=[],maxN=r.endType==='count'?(r.endCount??20):52;
  const endD=r.endType==='date'?r.endDate??'':'';
  const push=(d:string)=>{ if(d>=base&&dates.length<maxN&&(!endD||d<=endD)) dates.push(d); };
  if(r.frequency==='day'){
    for(let i=0;dates.length<maxN;i++){
      const d=shiftDate(base,i*r.interval);
      if(endD&&d>endD) break;
      push(d);
    }
  } else if(r.frequency==='week'){
    const wds=(r.weekdays?.length?[...r.weekdays]:[new Date(base+'T12:00:00').getDay()]).sort((a,b)=>a-b);
    const bd=new Date(base+'T12:00:00');
    const ws=new Date(bd);ws.setDate(bd.getDate()-bd.getDay());
    for(let w=0;dates.length<maxN&&w<200;w++){
      const wsD=new Date(ws);wsD.setDate(ws.getDate()+w*r.interval*7);
      if(endD&&dateToStr(wsD)>endD) break;
      for(const wd of wds){ const day=new Date(wsD);day.setDate(wsD.getDate()+wd);push(dateToStr(day)); }
    }
  } else if(r.frequency==='month'){
    for(let m=0;dates.length<maxN&&m<300;m++){
      const md=shiftMonthBy(base,m*r.interval);
      const mD=new Date(md+'T12:00:00');
      const yr=mD.getFullYear(),mo=mD.getMonth();
      let cand:string|null=null;
      if(r.monthlyType==='weekday'){
        const wd=r.weekday??0,wn=r.weekNumber??1;
        if(wn==='last'){
          const ld=new Date(yr,mo+1,0);const diff=(ld.getDay()-wd+7)%7;ld.setDate(ld.getDate()-diff);
          if(ld.getMonth()===mo) cand=dateToStr(ld);
        } else {
          const fd=new Date(yr,mo,1);const diff=(wd-fd.getDay()+7)%7;
          const nth=fd.getDate()+diff+((wn as number)-1)*7;
          const t=new Date(yr,mo,nth);if(t.getMonth()===mo) cand=dateToStr(t);
        }
      } else {
        const dom=r.dayOfMonth??new Date(base+'T12:00:00').getDate();
        if(dom==='last'){ cand=dateToStr(new Date(yr,mo+1,0)); }
        else { const t=new Date(yr,mo,dom as number);cand=dateToStr(t.getMonth()!==mo?new Date(yr,mo+1,0):t); }
      }
      if(cand){ if(endD&&cand>endD) break; push(cand); }
    }
  } else {
    const ym=(r.yearMonth??new Date(base+'T12:00:00').getMonth()+1)-1;
    const yd=r.yearDay===0?new Date(new Date(base+'T12:00:00').getFullYear(),ym+1,0).getDate():r.yearDay??new Date(base+'T12:00:00').getDate();
    for(let y=0;dates.length<maxN;y++){
      const bd=shiftYearBy(base,y*r.interval);
      const t=new Date(new Date(bd+'T12:00:00').getFullYear(),ym,yd);
      const cand=dateToStr(t);
      if(endD&&cand>endD) break;
      push(cand);
    }
  }
  return dates;
};

// ── Free slots ────────────────────────────────────────────────────────────────

function calcFreeSlots(tasks: Task[], date: string, s: Settings): FreeSlot[] {
  const scheduled = tasks
    .filter(t=>t.date===date&&!t.isLater&&t.startTime)
    .map(t=>[toMin(t.startTime!),toMin(t.startTime!)+(t.duration??0)] as [number,number])
    .sort((a,b)=>a[0]-b[0]);
  const slots:FreeSlot[]=[];
  let cur=toMin(s.wakeTime);
  const end=toMin(s.sleepTime);
  for(const [st,en] of scheduled){
    if(cur>=end) break;
    if(st>cur){
      const slotEnd=Math.min(st,end);
      slots.push({start:fromMin(cur),end:fromMin(slotEnd),min:slotEnd-cur});
    }
    cur=Math.max(cur,en);
  }
  if(cur<end) slots.push({start:fromMin(cur),end:fromMin(end),min:end-cur});
  return slots.filter(sl=>sl.min>=60);
}

// ── MonthCalendar ─────────────────────────────────────────────────────────────

function MonthCalendar({selected,onSelect,onClose,tasks}:{selected:string;onSelect:(d:string)=>void;onClose:()=>void;tasks:Task[];}) {
  const init = new Date(selected+'T12:00:00');
  const [vm,setVm] = useState({year:init.getFullYear(),month:init.getMonth()});
  const today = todayStr();

  const tasksByDate = useMemo(()=>{
    const map = new Map<string,Task[]>();
    tasks.filter(t=>!t.isLater&&t.startTime).forEach(t=>{
      if(!map.has(t.date)) map.set(t.date,[]);
      map.get(t.date)!.push(t);
    });
    return map;
  },[tasks]);

  const days = useMemo(()=>{
    const {year,month}=vm;
    const first=new Date(year,month,1).getDay();
    const total=new Date(year,month+1,0).getDate();
    const arr:(string|null)[]=Array(first).fill(null);
    for(let d=1;d<=total;d++) arr.push(dateToStr(new Date(year,month,d)));
    return arr;
  },[vm]);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-3" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl" onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <button onClick={()=>setVm(m=>shiftMonth(m.year,m.month,-1))} className="w-9 h-9 flex items-center justify-center text-gray-600"><AppIcons.caretLeft/></button>
            <span className="font-bold text-gray-900 text-base">{vm.year}年{vm.month+1}月</span>
            <button onClick={()=>setVm(m=>shiftMonth(m.year,m.month,1))} className="w-9 h-9 flex items-center justify-center text-gray-600"><AppIcons.caretRight/></button>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {DAY_NAMES.map((n,i)=>(
              <div key={i} className={`text-center text-xs font-semibold py-1 ${i===0?'text-red-400':i===6?'text-blue-400':'text-gray-400'}`}>{n}</div>
            ))}
          </div>
        </div>
        {/* Grid */}
        <div className="px-2 pb-2 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-7 gap-y-1">
            {days.map((d,i)=>{
              const dayTasks = d ? (tasksByDate.get(d)??[]).slice(0,2) : [];
              const isSel=d===selected, isToday=d===today;
              return (
                <button key={i} disabled={!d}
                  onClick={()=>{if(d){onSelect(d);onClose();}}}
                  className="flex flex-col items-center px-0.5 py-0.5 rounded-xl active:bg-gray-50">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    !d?'':isSel?'bg-gray-900 text-white':isToday?'bg-gray-100 font-bold text-gray-900':'text-gray-600'
                  }`}>
                    {d?new Date(d+'T12:00:00').getDate():''}
                  </span>
                  <div className="w-full space-y-0.5 mt-0.5 min-h-[20px]">
                    {dayTasks.map((t,ti)=>(
                      <div key={ti} className="w-full bg-gray-100 rounded px-1 overflow-hidden">
                        <p className="text-[9px] text-gray-600 truncate leading-tight py-px">{t.name}</p>
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        {/* Footer */}
        <div className="border-t border-gray-100 px-4 py-3 flex justify-end">
          <button onClick={onClose} className="text-sm text-gray-500 font-semibold px-4 py-1.5">閉じる</button>
        </div>
      </div>
    </div>
  );
}

// ── CalendarPage ─────────────────────────────────────────────────────────────

function CalendarPage({date,tasks,onSelect,onClose}:{date:string;tasks:Task[];onSelect:(d:string)=>void;onClose:()=>void;}) {
  const [vm,setVm]=useState(()=>{const d=new Date(date+'T12:00:00');return {year:d.getFullYear(),month:d.getMonth()};});
  const [catFilter,setCatF]=useState<string|null>(null);
  const today=todayStr();

  const filtered=useMemo(()=>catFilter?tasks.filter(t=>t.category===catFilter):tasks,[tasks,catFilter]);
  const tasksByDate=useMemo(()=>{
    const map=new Map<string,Task[]>();
    filtered.filter(t=>!t.isLater&&t.startTime).forEach(t=>{
      if(!map.has(t.date)) map.set(t.date,[]);
      map.get(t.date)!.push(t);
    });
    return map;
  },[filtered]);

  const days=useMemo(()=>{
    const {year,month}=vm;
    const first=new Date(year,month,1).getDay();
    const total=new Date(year,month+1,0).getDate();
    const arr:(string|null)[]=Array(first).fill(null);
    for(let d=1;d<=total;d++) arr.push(dateToStr(new Date(year,month,d)));
    return arr;
  },[vm]);

  return (
    <div className="fixed inset-0 z-[80] bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 bg-white">
        <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-gray-600"><AppIcons.caretLeft/></button>
        <div className="flex items-center gap-3">
          <button onClick={()=>setVm(m=>shiftMonth(m.year,m.month,-1))}
            className="w-9 h-9 flex items-center justify-center text-gray-500 bg-gray-100 rounded-xl"><AppIcons.caretLeft/></button>
          <span className="font-bold text-gray-900 text-base min-w-[7rem] text-center">{vm.year}年{vm.month+1}月</span>
          <button onClick={()=>setVm(m=>shiftMonth(m.year,m.month,1))}
            className="w-9 h-9 flex items-center justify-center text-gray-500 bg-gray-100 rounded-xl"><AppIcons.caretRight/></button>
        </div>
        <button onClick={()=>{const d=new Date();setVm({year:d.getFullYear(),month:d.getMonth()});onSelect(today);}}
          className="text-xs font-bold px-3 py-1.5 bg-gray-900 text-white rounded-full">今日</button>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 px-4 py-2 overflow-x-auto border-b border-gray-100" style={{scrollbarWidth:'none'} as React.CSSProperties}>
        <button onClick={()=>setCatF(null)}
          className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold ${!catFilter?'bg-gray-900 text-white':'bg-gray-100 text-gray-500'}`}>すべて</button>
        {CATEGORIES.map(cat=>(
          <button key={cat} onClick={()=>setCatF(c=>c===cat?null:cat)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold ${catFilter===cat?'bg-gray-900 text-white':'bg-gray-100 text-gray-500'}`}>{cat}</button>
        ))}
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 px-2 pt-3 pb-1">
        {DAY_NAMES.map((n,i)=>(
          <div key={i} className={`text-center text-xs font-semibold ${i===0?'text-red-400':i===6?'text-blue-400':'text-gray-400'}`}>{n}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-y-auto px-2 pb-8">
        <div className="grid grid-cols-7">
          {days.map((d,i)=>{
            const dayTasks=d?(tasksByDate.get(d)??[]):[];
            const isSel=d===date,isToday=d===today;
            return (
              <button key={i} disabled={!d} onClick={()=>{if(d){onSelect(d);}}}
                className="flex flex-col items-start py-1 px-0.5 rounded-2xl active:bg-gray-50" style={{minHeight:'100px'}}>
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold mx-auto ${
                  !d?'':isSel?'bg-gray-900 text-white':isToday?'bg-gray-100 text-gray-900':'text-gray-700'
                }`}>
                  {d?new Date(d+'T12:00:00').getDate():''}
                </span>
                <div className="w-full space-y-px mt-0.5">
                  {dayTasks.slice(0,3).map((t,ti)=>(
                    <div key={ti} className={`w-full rounded px-1 overflow-hidden ${isSel?'bg-gray-700':'bg-gray-100'}`}>
                      <p className={`text-[8px] truncate leading-tight py-px ${isSel?'text-white':'text-gray-600'}`}>{t.name}</p>
                    </div>
                  ))}
                  {dayTasks.length>3&&(
                    <p className={`text-[8px] text-center leading-tight ${isSel?'text-gray-300':'text-gray-400'}`}>+{dayTasks.length-3}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── SearchPage ────────────────────────────────────────────────────────────────

function SearchPage({tasks,onClose,onSelect}:{tasks:Task[];onClose:()=>void;onSelect:(t:Task)=>void;}) {
  const [query,setQuery]=useState('');
  const inputRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{inputRef.current?.focus();},[]);

  const results=useMemo(()=>{
    const q=query.trim().toLowerCase();
    if(!q) return [];
    return tasks.filter(t=>
      t.name.toLowerCase().includes(q)||(t.memo??'').toLowerCase().includes(q)
    ).sort((a,b)=>b.date.localeCompare(a.date)||(a.startTime??'').localeCompare(b.startTime??''));
  },[tasks,query]);

  const fmtDate=(d:string)=>{
    const dt=new Date(d+'T12:00:00');
    return `${dt.getMonth()+1}月${dt.getDate()}日（${DAY_NAMES[dt.getDay()]}）`;
  };

  return (
    <div className="fixed inset-0 z-[90] bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-gray-100">
        <button onClick={onClose} className="text-sm font-semibold text-gray-600 shrink-0">キャンセル</button>
        <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2.5">
          <AppIcons.search size={16} className="text-gray-400 shrink-0"/>
          <input ref={inputRef} type="text" value={query} onChange={e=>setQuery(e.target.value)}
            placeholder="タスクを検索..."
            className="flex-1 text-sm bg-transparent outline-none text-gray-900 placeholder-gray-400"/>
          {query&&<button onClick={()=>setQuery('')} className="text-gray-400 text-lg leading-none">×</button>}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {!query?(
          <div className="py-20 text-center"><AppIcons.search size={40} className="mx-auto mb-2 text-gray-300"/><p className="text-sm text-gray-400">タスク名・メモで検索</p></div>
        ):results.length===0?(
          <div className="py-20 text-center"><AppIcons.smileySad className="mx-auto mb-2 text-gray-300"/><p className="text-sm text-gray-400">「{query}」は見つかりませんでした</p></div>
        ):(
          <div>
            <p className="text-xs text-gray-400 px-4 pt-3 pb-1">{results.length}件</p>
            {results.map(t=>(
              <button key={t.id} onClick={()=>onSelect(t)}
                className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 active:bg-gray-50 text-left">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {t.isLater?'あとでやる':fmtDate(t.date)}
                    {t.startTime&&` · ${t.startTime}`}
                    {t.category&&<span className="ml-1 bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full text-[10px]">{t.category}</span>}
                  </p>
                  {t.memo&&<p className="text-xs text-gray-300 truncate mt-0.5">{t.memo}</p>}
                </div>
                <AppIcons.caretRight className="text-gray-300"/>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function autoIcon(name: string): string {
  const n = name;
  if (/食|飯|昼|夕|朝|ご飯|食事|弁当|外食|レストラン|カフェ|ランチ|ディナー/.test(n)) return '🍽️';
  if (/運動|走|ジョギング|ランニング|筋トレ|ジム|スポーツ|泳|水泳|トレーニング/.test(n)) return '🏃';
  if (/仕事|会議|ミーティング|打ち合わせ|報告|プレゼン|業務|出社|退社|資料/.test(n)) return '💼';
  if (/読書|本|勉強|学習|テスト|試験|宿題|課題|授業|講義/.test(n)) return '📚';
  if (/薬|病院|診察|通院|クリニック|歯医者/.test(n)) return '💊';
  if (/買い物|ショッピング|スーパー|購入/.test(n)) return '🛒';
  if (/掃除|洗濯|片付|家事|料理|炊事/.test(n)) return '🏠';
  if (/パソコン|PC|コード|プログラム|開発|デザイン/.test(n)) return '💻';
  if (/電話|通話|連絡|メール|LINE|チャット/.test(n)) return '📞';
  if (/音楽|歌|ピアノ|ギター|練習/.test(n)) return '🎵';
  if (/お風呂|シャワー|入浴|風呂/.test(n)) return '🛁';
  if (/犬|猫|ペット|散歩/.test(n)) return '🐕';
  if (/目標|ゴール|確認|チェック/.test(n)) return '🎯';
  if (/起床|起き|起きる/.test(n)) return '⭐';
  return '';
}

const ICON_CATEGORIES:{label:string;icons:{key:string;label:string}[]}[]=[
  {label:'日常',icons:[
    {key:'task',    label:'メモ'},
    {key:'shopping',label:'買い物'},
    {key:'food',    label:'食事'},
    {key:'clean',   label:'掃除'},
    {key:'rest',    label:'休憩'},
    {key:'sleep',   label:'睡眠'},
    {key:'home',    label:'家'},
    {key:'health',  label:'健康'},
  ]},
  {label:'仕事・学習',icons:[
    {key:'work',    label:'仕事'},
    {key:'calendar',label:'予定'},
    {key:'study',   label:'勉強'},
    {key:'book',    label:'読書'},
    {key:'phone',   label:'電話'},
    {key:'money',   label:'お金'},
  ]},
  {label:'その他',icons:[
    {key:'travel',   label:'移動'},
    {key:'exercise', label:'運動'},
    {key:'music',    label:'音楽'},
    {key:'camera',   label:'カメラ'},
    {key:'game',     label:'ゲーム'},
    {key:'question', label:'その他'},
  ]},
];
const ICON_OPTIONS=ICON_CATEGORIES.flatMap(c=>c.icons);
const TASK_COLORS=['','#FECACA','#FED7AA','#FEF08A','#BBF7D0','#BAE6FD','#C7D2FE','#FBCFE8'];

function getTaskIcon(key:string){
  const m={task:AppIcons.task,shopping:AppIcons.shopping,food:AppIcons.food,
    clean:AppIcons.clean,work:AppIcons.work,travel:AppIcons.travel,
    rest:AppIcons.rest,sleep:AppIcons.sleep,calendar:AppIcons.calendar,
    question:AppIcons.question,music:AppIcons.music,book:AppIcons.book,
    exercise:AppIcons.exercise,health:AppIcons.health,phone:AppIcons.phone,
    home:AppIcons.home,study:AppIcons.study,money:AppIcons.money,
    game:AppIcons.game,camera:AppIcons.camera,
  } as Record<string,typeof AppIcons.task>;
  return m[key]??AppIcons.task;
}

// ── TaskModal ─────────────────────────────────────────────────────────────────

function TaskModal({task,currentDate,prefillTime,prefillCategory,openIconSheet:initIconSheet,onSave,onDelete,onClose,globalTags}:{
  task:Task|null; currentDate:string; prefillTime?:string; prefillCategory?:string; openIconSheet?:boolean;
  onSave:(tasks:Omit<Task,'id'>[])=>void; onDelete?:()=>void; onClose:()=>void;
  globalTags:TagDef[];
}) {
  const initMode=():TaskMode=>{
    if(!task) return prefillTime?'scheduled':'later';
    if(task.recurrence) return 'recurring';
    if(task.isLater) return 'later';
    return 'scheduled';
  };

  const [mode,setMode]        = useState<TaskMode>(initMode());
  const [name,setName]        = useState(task?.name??'');
  const [startTime,setST]     = useState(task?.startTime??prefillTime??nowStr());
  const [duration,setDur]     = useState(task?.duration??0);
  const [memo,setMemo]        = useState(task?.memo??'');
  const [icon,setIcon]        = useState(()=>{
    const k=task?.icon??'';
    return ICON_OPTIONS.some(o=>o.key===k)?k:'task';
  });
  const [color,setColor]      = useState(task?.color??'');
  const [iconSheetOpen,setIconSheetOpen] = useState(initIconSheet??false);
  const [recentIcons,setRecentIcons] = useState<string[]>(()=>{
    if(typeof window==='undefined') return [];
    try{return JSON.parse(localStorage.getItem('tl-recent-icons')||'[]');}catch{return [];}
  });
  const pickIcon=(key:string)=>{
    setIcon(key);
    setRecentIcons(prev=>{
      const next=[key,...prev.filter(k=>k!==key)].slice(0,5);
      try{localStorage.setItem('tl-recent-icons',JSON.stringify(next));}catch{}
      return next;
    });
  };
  const [recur,setRecur]      = useState<'daily'|'weekly'|'monthly'|'yearly'|'custom'>(
    task?.recurrence==='weekly'?'weekly':
    task?.recurrence==='monthly'?'monthly':
    task?.recurrence==='yearly'?'yearly':
    task?.recurrence==='custom'?'custom':'daily'
  );
  const initCR=():CustomRec=>{
    if(task?.customRec) return task.customRec;
    const d=new Date(currentDate+'T12:00:00');
    return {frequency:'week',interval:1,weekdays:[d.getDay()],monthlyType:'date',
      dayOfMonth:d.getDate(),weekNumber:Math.min(4,Math.ceil(d.getDate()/7)),weekday:d.getDay(),
      yearMonth:d.getMonth()+1,yearDay:d.getDate(),endType:'never',endCount:10,
      endDate:shiftMonthBy(currentDate,3)};
  };
  const [customRec,setCustomRec] = useState<CustomRec>(initCR);
  const setCR=<K extends keyof CustomRec>(k:K,v:CustomRec[K])=>setCustomRec(r=>({...r,[k]:v}));
  const [category,setCategory]   = useState<string|null>(task?.category??prefillCategory??null);
  const [custDurOpen,setCDurOpen] = useState(false);
  const [custDurMin,setCDurMin]  = useState(duration>0&&!DUR_OPTS.find(o=>o.v===duration)?duration:90);
  const [notifications,setNotifs]  = useState<number[]>(task?.notifications??(!task?[0]:[]));
  const modalSwX=useRef(0), modalSwY=useRef(0);
  const modeOrder:TaskMode[]=['later','scheduled','recurring'];
  const onModalSwipe=(e:React.TouchEvent)=>{
    const dx=e.changedTouches[0].clientX-modalSwX.current;
    const dy=Math.abs(e.changedTouches[0].clientY-modalSwY.current);
    if(Math.abs(dx)>60&&Math.abs(dx)>dy){
      const idx=modeOrder.indexOf(mode);
      if(dx<0&&idx<2) setMode(modeOrder[idx+1]);
      else if(dx>0&&idx>0) setMode(modeOrder[idx-1]);
    }
  };
  const [incompleteRem,setIncRem]  = useState(task?.incompleteReminder??false);
  const [custNotifOpen,setCNOpen]  = useState(false);
  const [custNotifMin,setCNMin]    = useState(60);
  const [pinned,setPinned]    = useState(task?.pinned??false);
  const [tags,setTags]        = useState<string[]>(task?.tags??[]);
  const [taskDate,setTaskDate]= useState(task?.date??currentDate);
  const [dateOpen,setDateOpen]= useState(false);
  const [timeOpen,setTimeOpen]= useState(false);
  const [alertOpen,setAlertOpen]= useState(false);
  const [tagOpen,setTagOpen]   = useState(false);
  const [subtasksOpen,setSubtasksOpen] = useState(false);
  const [subtaskInput,setSubtaskInput] = useState('');
  const [subtasks,setSubtasks] = useState<{id:string;name:string;completed:boolean}[]>(task?.subtasks??[]);
  const [calVm,setCalVm]      = useState(()=>{
    const d=new Date((task?.date??currentDate)+'T12:00:00');
    return {year:d.getFullYear(),month:d.getMonth()};
  });

  const computedEnd = (startTime&&duration>0) ? fromMin(toMin(startTime)+duration) : null;

  const calDays = useMemo(()=>{
    const {year,month}=calVm;
    const first=new Date(year,month,1).getDay();
    const total=new Date(year,month+1,0).getDate();
    const arr:(string|null)[]=Array(first).fill(null);
    for(let d=1;d<=total;d++) arr.push(dateToStr(new Date(year,month,d)));
    return arr;
  },[calVm]);

  const taskDateLabel=()=>{
    const today=todayStr();
    const dt=new Date(taskDate+'T12:00:00');
    const m=dt.getMonth()+1, d=dt.getDate(), dow=DAY_NAMES[dt.getDay()];
    return `${taskDate===today?'今日 ':''}${m}月${d}日（${dow}）`;
  };

  const toggleNotif=(v:number)=>setNotifs(prev=>prev.includes(v)?prev.filter(x=>x!==v):[...prev,v].sort((a,b)=>a-b));
  const addCustNotif=()=>{
    if(custNotifMin>0&&!notifications.includes(custNotifMin)){
      setNotifs(prev=>[...prev,custNotifMin].sort((a,b)=>a-b));
    }
    setCNOpen(false);
  };

  const toggleTag=(name:string)=>setTags(prev=>prev.includes(name)?prev.filter(x=>x!==name):[...prev,name]);

  const save=()=>{
    if(!name.trim()) return;
    const dur=duration;
    const base:Omit<Task,'id'>={
      name:name.trim(),
      startTime:mode==='later'?null:(startTime||null),
      duration:dur,
      memo,
      icon:icon,
      color:color||undefined,
      completed:task?.completed??false,
      date:mode==='scheduled'?taskDate:(task?.date??currentDate),
      isLater:mode==='later',
      recurrence:mode==='recurring'?recur:null,
      customRec:mode==='recurring'&&recur==='custom'?customRec:undefined,
      notifications:mode!=='later'?notifications:undefined,
      incompleteReminder:mode!=='later'?incompleteRem:false,
      category:category??undefined,
      pinned,
      tags,
      subtasks:subtasks.length>0?subtasks:undefined,
    };
    if(mode==='recurring'&&!task){
      const instances:Omit<Task,'id'>[]=[];
      if(recur==='daily'){
        for(let i=0;i<14;i++) instances.push({...base,date:shiftDate(currentDate,i)});
      } else if(recur==='weekly'){
        for(let i=0;i<8;i++) instances.push({...base,date:shiftDate(currentDate,i*7)});
      } else if(recur==='monthly'){
        for(let i=0;i<12;i++) instances.push({...base,date:shiftMonthBy(currentDate,i)});
      } else if(recur==='yearly'){
        for(let i=0;i<5;i++) instances.push({...base,date:shiftYearBy(currentDate,i)});
      } else if(recur==='custom'){
        if(customRec.frequency==='hour'){
          const baseMin=base.startTime?toMin(base.startTime):8*60;
          const maxN=customRec.endType==='count'?(customRec.endCount??20):24;
          for(let i=0;i<maxN;i++){
            const totalMin=baseMin+i*customRec.interval*60;
            const dayOff=Math.floor(totalMin/(24*60));
            const d=shiftDate(currentDate,dayOff);
            if(customRec.endType==='date'&&customRec.endDate&&d>customRec.endDate) break;
            instances.push({...base,date:d,startTime:fromMin(totalMin%(24*60))});
          }
        } else {
          generateCustomDates(currentDate,customRec).forEach(d=>instances.push({...base,date:d}));
        }
      }
      onSave(instances);
    } else {
      onSave([base]);
    }
  };

  const handleClose=()=>{if(name.trim())save();else onClose();};

  return (
    <div className="fixed inset-0 z-50 bg-black/60" onClick={handleClose}>
      <div className="absolute bottom-0 left-0 right-0 max-w-md mx-auto" onClick={e=>e.stopPropagation()}>
        {/* ── Dark header ── */}
        <div className="bg-gray-900 rounded-t-3xl px-4 pt-4"
          onTouchStart={e=>{modalSwX.current=e.touches[0].clientX;modalSwY.current=e.touches[0].clientY;}}
          onTouchEnd={onModalSwipe}>
          {/* Buttons row */}
          <div className="flex items-center mb-4">
            <button onClick={handleClose} className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-white">×</button>
          </div>

          {/* Icon + name */}
          <div className="flex items-center gap-3 mb-4">
            <button onClick={()=>setIconSheetOpen(true)}
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-white bg-gray-700 active:bg-gray-600 transition-colors"
              style={color?{background:color}:{}}>
              {(()=>{const Ic=getTaskIcon(icon);return <Ic size={24} className={color?'text-gray-700':'text-white'}/>;})()}
            </button>
            <div className="flex-1 min-w-0">
              {(mode==='scheduled'||mode==='recurring')&&startTime&&(
                <p className="text-xs text-gray-400 mb-0.5">{startTime}{computedEnd?`〜${computedEnd}`:''}{mode==='recurring'&&' · 繰り返し'}</p>
              )}
              <input type="text" value={name} onChange={e=>setName(e.target.value)}
                placeholder="タスク名を入力..."
                className="w-full bg-transparent text-white text-lg font-medium placeholder-gray-500 outline-none border-b border-gray-700 pb-1"
                autoFocus/>
            </div>
          </div>

          {/* Category chips */}
          <div className="flex gap-2 mb-3">
            {CATEGORIES.map(cat=>(
              <button key={cat} onClick={()=>setCategory(c=>c===cat?null:cat)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${category===cat?'bg-white text-gray-900':'bg-gray-700 text-gray-300'}`}>
                {cat}
              </button>
            ))}
          </div>

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
        <div className="bg-gray-50 max-h-[55vh] overflow-y-auto"
          onTouchStart={e=>{modalSwX.current=e.touches[0].clientX;modalSwY.current=e.touches[0].clientY;}}
          onTouchEnd={onModalSwipe}>
          {/* Recurring settings */}
          {mode==='recurring'&&(
            <>
              {/* Type selector */}
              <div className="bg-white mx-3 mt-3 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AppIcons.repeat size={18} className="text-gray-600"/>
                  <span className="text-sm font-semibold text-gray-800">繰り返し</span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-0.5" style={{scrollbarWidth:'none',WebkitOverflowScrolling:'touch'} as React.CSSProperties}>
                  {(['daily','weekly','monthly','yearly','custom'] as const).map((r,i)=>(
                    <button key={r} onClick={()=>setRecur(r)}
                      className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold ${recur===r?'bg-gray-900 text-white':'bg-gray-100 text-gray-600'}`}>
                      {['毎日','毎週','毎月','毎年','カスタム'][i]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom 3-block UI */}
              {recur==='custom'&&(
                <>
                  {/* Summary */}
                  <div className="mx-3 mt-3 bg-gray-900 rounded-2xl px-4 py-3">
                    <p className="text-white text-sm font-bold">{summarizeCustomRec(customRec)}</p>
                  </div>

                  {/* ① 間隔 */}
                  <div className="bg-white mx-3 mt-3 rounded-2xl p-4">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">① 間隔</p>
                    <div className="flex items-center justify-center gap-5 mb-4">
                      <button onClick={()=>setCR('interval',Math.max(1,customRec.interval-1))}
                        className="w-11 h-11 rounded-full bg-gray-100 text-xl font-bold text-gray-600 flex items-center justify-center">−</button>
                      <span className="text-4xl font-black text-gray-900 min-w-[2.5rem] text-center">{customRec.interval}</span>
                      <button onClick={()=>setCR('interval',customRec.interval+1)}
                        className="w-11 h-11 rounded-full bg-gray-100 text-xl font-bold text-gray-600 flex items-center justify-center">+</button>
                    </div>
                    <div className="flex gap-2">
                      {(['hour','day','week','month','year'] as const).map((u,i)=>(
                        <button key={u} onClick={()=>setCR('frequency',u)}
                          className={`flex-1 py-2.5 rounded-full text-sm font-semibold ${customRec.frequency===u?'bg-gray-900 text-white':'bg-gray-100 text-gray-600'}`}>
                          {['時','日','週','月','年'][i]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ② 実行タイミング */}
                  {customRec.frequency!=='day'&&customRec.frequency!=='hour'&&(
                    <div className="bg-white mx-3 mt-3 rounded-2xl p-4">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">② 実行タイミング</p>

                      {customRec.frequency==='week'&&(
                        <div className="flex gap-1.5">
                          {DAY_NAMES.map((n,i)=>(
                            <button key={i} onClick={()=>{
                              const wds=customRec.weekdays??[];
                              setCR('weekdays',wds.includes(i)?wds.filter(x=>x!==i):[...wds,i]);
                            }}
                              className={`flex-1 h-10 rounded-full text-sm font-semibold ${(customRec.weekdays??[]).includes(i)?'bg-gray-900 text-white':'bg-gray-100 text-gray-600'}`}>
                              {n}
                            </button>
                          ))}
                        </div>
                      )}

                      {customRec.frequency==='month'&&(
                        <>
                          <div className="flex gap-2 mb-4">
                            <button onClick={()=>setCR('monthlyType','date')}
                              className={`flex-1 py-2 rounded-full text-sm font-semibold ${customRec.monthlyType!=='weekday'?'bg-gray-900 text-white':'bg-gray-100 text-gray-600'}`}>
                              日付で指定
                            </button>
                            <button onClick={()=>setCR('monthlyType','weekday')}
                              className={`flex-1 py-2 rounded-full text-sm font-semibold ${customRec.monthlyType==='weekday'?'bg-gray-900 text-white':'bg-gray-100 text-gray-600'}`}>
                              曜日で指定
                            </button>
                          </div>
                          {customRec.monthlyType!=='weekday'?(
                            <div className="flex gap-2 overflow-x-auto pb-0.5" style={{scrollbarWidth:'none'} as React.CSSProperties}>
                              {([1,5,10,15,20,25,'last' as const]).map(d=>(
                                <button key={String(d)} onClick={()=>setCR('dayOfMonth',d)}
                                  className={`shrink-0 px-3 py-2 rounded-full text-sm font-semibold ${customRec.dayOfMonth===d?'bg-gray-900 text-white':'bg-gray-100 text-gray-600'}`}>
                                  {d==='last'?'月末':`${d}日`}
                                </button>
                              ))}
                            </div>
                          ):(
                            <div className="space-y-3">
                              <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{scrollbarWidth:'none'} as React.CSSProperties}>
                                {([1,2,3,4,'last' as const]).map(wn=>(
                                  <button key={String(wn)} onClick={()=>setCR('weekNumber',wn)}
                                    className={`shrink-0 flex-1 py-2 rounded-full text-sm font-semibold min-w-[3rem] ${customRec.weekNumber===wn?'bg-gray-900 text-white':'bg-gray-100 text-gray-600'}`}>
                                    {wn==='last'?'最終':`第${wn}`}
                                  </button>
                                ))}
                              </div>
                              <div className="flex gap-1.5">
                                {DAY_NAMES.map((n,i)=>(
                                  <button key={i} onClick={()=>setCR('weekday',i)}
                                    className={`flex-1 h-9 rounded-full text-sm font-semibold ${customRec.weekday===i?'bg-gray-900 text-white':'bg-gray-100 text-gray-600'}`}>
                                    {n}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {customRec.frequency==='year'&&(
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs text-gray-400 mb-2">月</p>
                            <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{scrollbarWidth:'none'} as React.CSSProperties}>
                              {Array.from({length:12},(_,i)=>(
                                <button key={i} onClick={()=>setCR('yearMonth',i+1)}
                                  className={`shrink-0 w-12 h-10 rounded-full text-sm font-semibold ${customRec.yearMonth===i+1?'bg-gray-900 text-white':'bg-gray-100 text-gray-600'}`}>
                                  {i+1}月
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 mb-2">日</p>
                            <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{scrollbarWidth:'none'} as React.CSSProperties}>
                              {[1,5,10,15,20,25,0].map(d=>(
                                <button key={d} onClick={()=>setCR('yearDay',d)}
                                  className={`shrink-0 px-3 py-2 rounded-full text-sm font-semibold ${customRec.yearDay===d?'bg-gray-900 text-white':'bg-gray-100 text-gray-600'}`}>
                                  {d===0?'末':`${d}日`}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ③ 終了条件 */}
                  <div className="bg-white mx-3 mt-3 rounded-2xl p-4">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">③ 終了条件</p>
                    <div className="flex gap-2 mb-4">
                      {([['never','終了なし'],['date','指定日まで'],['count','回数で終了']] as const).map(([t,l])=>(
                        <button key={t} onClick={()=>setCR('endType',t)}
                          className={`flex-1 py-2 rounded-full text-xs font-semibold ${customRec.endType===t?'bg-gray-900 text-white':'bg-gray-100 text-gray-600'}`}>
                          {l}
                        </button>
                      ))}
                    </div>
                    {customRec.endType==='date'&&(
                      <input type="date" value={customRec.endDate??''} onChange={e=>setCR('endDate',e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 outline-none w-full"/>
                    )}
                    {customRec.endType==='count'&&(
                      <div className="flex items-center gap-3">
                        <button onClick={()=>setCR('endCount',Math.max(1,(customRec.endCount??10)-1))}
                          className="w-10 h-10 rounded-full bg-gray-100 text-xl font-bold text-gray-600 flex items-center justify-center">−</button>
                        <span className="text-2xl font-black text-gray-900">{customRec.endCount??10}</span>
                        <button onClick={()=>setCR('endCount',(customRec.endCount??10)+1)}
                          className="w-10 h-10 rounded-full bg-gray-100 text-xl font-bold text-gray-600 flex items-center justify-center">+</button>
                        <span className="text-sm text-gray-600">回で終了</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* Settings card */}
          <div className="bg-white mx-3 mt-3 rounded-2xl overflow-hidden">

            {/* 日付 — scheduled only */}
            {mode==='scheduled'&&(
              <>
                <button className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50" onClick={()=>setDateOpen(o=>!o)}>
                  <AppIcons.calendar size={18} className="text-gray-400 shrink-0"/>
                  <span className="flex-1 text-left text-sm font-medium text-gray-800">{taskDateLabel()}</span>
                  <AppIcons.caretRight size={14} className="text-gray-300"/>
                </button>
                {dateOpen&&(
                  <div className="border-t border-gray-100 px-3 pb-3">
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm font-bold text-gray-800">{calVm.year}年{calVm.month+1}月</span>
                      <div className="flex gap-1">
                        <button onClick={()=>setCalVm(m=>shiftMonth(m.year,m.month,-1))} className="w-7 h-7 flex items-center justify-center text-gray-500 rounded-lg bg-gray-100"><AppIcons.caretLeft size={14}/></button>
                        <button onClick={()=>setCalVm(m=>shiftMonth(m.year,m.month,1))} className="w-7 h-7 flex items-center justify-center text-gray-500 rounded-lg bg-gray-100"><AppIcons.caretRight size={14}/></button>
                      </div>
                    </div>
                    <div className="grid grid-cols-7 mb-1">
                      {DAY_NAMES.map((n,i)=>(
                        <div key={i} className={`text-center text-[11px] font-semibold py-1 ${i===0?'text-red-400':i===6?'text-blue-400':'text-gray-400'}`}>{n}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7">
                      {calDays.map((d,i)=>{
                        const isSel=d===taskDate, isToday=d===todayStr();
                        return (
                          <button key={i} disabled={!d} onClick={()=>{if(d){setTaskDate(d);setDateOpen(false);}}} className="flex items-center justify-center py-1">
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${!d?'':isSel?'bg-gray-900 text-white':isToday?'bg-gray-100 font-bold text-gray-900':'text-gray-600'}`}>
                              {d?new Date(d+'T12:00:00').getDate():''}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="h-px bg-gray-100 mx-4"/>
              </>
            )}

            {/* 時間 */}
            <button className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50" onClick={()=>setTimeOpen(o=>!o)}>
              <AppIcons.clock size={18} className="text-gray-400 shrink-0"/>
              <span className="flex-1 text-left text-sm font-medium text-gray-800">
                {mode==='later'
                  ? (duration>0?(DUR_OPTS.find(o=>o.v===duration)?.l??`${duration}分`):'所要時間なし')
                  : startTime?(computedEnd?`${startTime}〜${computedEnd}`:startTime):'時間未設定'
                }
              </span>
              {mode!=='later'&&duration>0&&<span className="text-xs text-gray-400 shrink-0">{DUR_OPTS.find(o=>o.v===duration)?.l??`${duration}分`}</span>}
              <AppIcons.caretRight size={14} className="text-gray-300"/>
            </button>
            {timeOpen&&(
              <div className="border-t border-gray-100 px-4 pt-3 pb-4">
                {mode!=='later'&&(
                  <>
                    <p className="text-xs text-gray-500 mb-1.5">開始時刻</p>
                    <input type="time" value={startTime} onChange={e=>setST(e.target.value)}
                      className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 outline-none focus:border-gray-400 mb-3 block"/>
                  </>
                )}
                <p className="text-xs text-gray-500 mb-1.5">所要時間</p>
                <div className="flex gap-2 overflow-x-auto pb-0.5" style={{scrollbarWidth:'none',WebkitOverflowScrolling:'touch'} as React.CSSProperties}>
                  {DUR_OPTS.map(({v,l})=>(
                    <button key={v} onClick={()=>{setDur(v);setCDurOpen(false);}}
                      className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold ${duration===v&&!custDurOpen?'bg-gray-900 text-white':'bg-gray-100 text-gray-600'}`}>
                      {l}
                    </button>
                  ))}
                  <button onClick={()=>setCDurOpen(o=>!o)}
                    className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold ${custDurOpen?'bg-gray-900 text-white':'bg-gray-100 text-gray-600'}`}>
                    カスタム
                  </button>
                </div>
                {custDurOpen&&(
                  <div className="flex items-center gap-2 mt-3">
                    <input type="number" value={custDurMin} min={1}
                      onChange={e=>setCDurMin(Math.max(1,Number(e.target.value)))}
                      className="w-20 border border-gray-200 rounded-xl px-3 py-2 text-sm text-center outline-none"/>
                    <span className="text-sm text-gray-600">分</span>
                    <button onClick={()=>{setDur(custDurMin);setCDurOpen(false);}}
                      className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold">設定</button>
                  </div>
                )}
              </div>
            )}

            {/* アラート — scheduled/recurring only */}
            {(mode==='scheduled'||mode==='recurring')&&(
              <>
                <div className="h-px bg-gray-100 mx-4"/>
                <button className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50" onClick={()=>setAlertOpen(o=>!o)}>
                  <AppIcons.bell size={18} className="text-gray-400 shrink-0"/>
                  <span className="flex-1 text-left text-sm font-medium text-gray-800">
                    {notifications.length>0?`${notifications.length}件のアラート`:'アラートなし'}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {notifications.length>0&&(
                      <span className="text-xs text-gray-400 max-w-[80px] truncate">
                        {notifications.slice(0,2).map(v=>NOTIF_OPTS.find(o=>o.v===v)?.l??`${v}分前`).join('・')}{notifications.length>2?'…':''}
                      </span>
                    )}
                    <AppIcons.caretRight size={14} className="text-gray-300"/>
                  </div>
                </button>
                {alertOpen&&(
                  <div className="border-t border-gray-100 px-4 pt-3 pb-4">
                    <div className="flex gap-2 overflow-x-auto pb-0.5 mb-2" style={{scrollbarWidth:'none',WebkitOverflowScrolling:'touch'} as React.CSSProperties}>
                      {NOTIF_OPTS.map(({v,l})=>(
                        <button key={v} onClick={()=>toggleNotif(v)}
                          className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold ${notifications.includes(v)?'bg-gray-900 text-white':'bg-gray-100 text-gray-600'}`}>
                          {l}
                        </button>
                      ))}
                      <button onClick={()=>setCNOpen(o=>!o)}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold ${custNotifOpen?'bg-gray-900 text-white':'bg-gray-100 text-gray-600'}`}>
                        カスタム
                      </button>
                    </div>
                    {custNotifOpen&&(
                      <div className="flex items-center gap-2 mb-2">
                        <input type="number" value={custNotifMin} min={1}
                          onChange={e=>setCNMin(Math.max(1,Number(e.target.value)))}
                          className="w-20 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none text-center"/>
                        <span className="text-sm text-gray-600">分前</span>
                        <button onClick={addCustNotif} className="px-3 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold">追加</button>
                      </div>
                    )}
                    {notifications.filter(v=>!NOTIF_OPTS.find(o=>o.v===v)).length>0&&(
                      <div className="flex flex-wrap gap-2 mb-2">
                        {notifications.filter(v=>!NOTIF_OPTS.find(o=>o.v===v)).map(v=>(
                          <span key={v} className="inline-flex items-center gap-1 bg-gray-900 text-white text-xs font-semibold px-2.5 py-1.5 rounded-full">
                            {v}分前<button onClick={()=>setNotifs(prev=>prev.filter(x=>x!==v))} className="opacity-70 leading-none ml-0.5">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-50 mt-1">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">未完了リマインダー</p>
                        <p className="text-xs text-gray-400">タスクが未完了の場合に通知</p>
                      </div>
                      <button onClick={()=>setIncRem(r=>!r)}
                        className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${incompleteRem?'bg-gray-900':'bg-gray-200'}`}>
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${incompleteRem?'left-[22px]':'left-0.5'}`}/>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* タグ */}
            <div className="h-px bg-gray-100 mx-4"/>
            <button className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50" onClick={()=>setTagOpen(o=>!o)}>
              <AppIcons.tag size={18} className="text-gray-400 shrink-0"/>
              <span className="flex-1 text-left text-sm font-medium text-gray-800">タグ</span>
              {tags.length>0&&(
                <div className="flex gap-1 shrink-0 max-w-[120px] overflow-hidden">
                  {tags.slice(0,2).map(t=>{
                    const td=globalTags.find(x=>x.name===t);
                    return td?(
                      <span key={t} className="text-xs px-1.5 py-0.5 rounded-full font-medium truncate max-w-[52px]"
                        style={{backgroundColor:td.color,color:getTagTextColor(td.color)}}>{t}</span>
                    ):null;
                  })}
                  {tags.length>2&&<span className="text-xs text-gray-400">+{tags.length-2}</span>}
                </div>
              )}
              <AppIcons.caretRight size={14} className="text-gray-300"/>
            </button>
            {tagOpen&&(
              <div className="border-t border-gray-100 px-4 pt-3 pb-4">
                {globalTags.length===0?(
                  <p className="text-xs text-gray-400">設定画面でタグを追加できます</p>
                ):(
                  <div className="flex flex-wrap gap-2">
                    {globalTags.map(td=>{
                      const active=tags.includes(td.name);
                      return (
                        <button key={td.name} onClick={()=>toggleTag(td.name)}
                          style={{backgroundColor:td.color,color:getTagTextColor(td.color)}}
                          className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${active?'ring-2 ring-gray-800 ring-offset-1':''}`}>
                          {td.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* サブタスク */}
            <div className="h-px bg-gray-100 mx-4"/>
            <div className="px-4 py-3">
              <div className="flex items-center gap-2">
                <AppIcons.checkSquare size={18} className="text-gray-400 shrink-0"/>
                <input type="text" value={subtaskInput} onChange={e=>setSubtaskInput(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter'&&subtaskInput.trim()){setSubtasks(prev=>[...prev,{id:Date.now().toString(),name:subtaskInput.trim(),completed:false}]);setSubtaskInput('');}}}
                  placeholder="サブタスクを追加"
                  className="flex-1 text-sm text-gray-700 placeholder-gray-400 outline-none bg-gray-100 rounded-lg px-3 py-1.5"/>
                <button
                  disabled={!subtaskInput.trim()}
                  onClick={()=>{if(subtaskInput.trim()){setSubtasks(prev=>[...prev,{id:Date.now().toString(),name:subtaskInput.trim(),completed:false}]);setSubtaskInput('');}}}
                  className={`text-sm font-semibold shrink-0 px-3 py-1.5 rounded-lg transition-colors ${subtaskInput.trim()?'bg-gray-700 text-white active:bg-gray-900':'bg-gray-100 text-gray-300'}`}>
                  追加
                </button>
              </div>
              {subtasks.length>0&&(
                <div className="mt-2 space-y-1">
                  {subtasks.map((st,i)=>(
                    <div key={st.id} className="flex items-center gap-2 pl-7">
                      <button onClick={()=>setSubtasks(prev=>prev.map((s,j)=>j===i?{...s,completed:!s.completed}:s))}
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${st.completed?'bg-gray-900 border-gray-900':'border-gray-300'}`}>
                        {st.completed&&<AppIcons.checkSquare size={9} className="text-white"/>}
                      </button>
                      <span className={`flex-1 text-sm ${st.completed?'line-through text-gray-400':'text-gray-700'}`}>{st.name}</span>
                      <button onClick={()=>setSubtasks(prev=>prev.filter((_,j)=>j!==i))} className="text-gray-300 text-base leading-none px-1">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Memo */}
          <div className="bg-white mx-3 mt-3 rounded-2xl p-4">
            <textarea value={memo} onChange={e=>setMemo(e.target.value)}
              placeholder="メモを追加..." rows={3}
              className="w-full text-sm text-gray-700 placeholder-gray-400 outline-none resize-none bg-transparent"/>
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
      {/* Icon & Color bottom sheet */}
      {iconSheetOpen&&(
        <div className="fixed inset-0 z-[100] bg-black/40 flex flex-col justify-end" onClick={()=>setIconSheetOpen(false)}>
          <div className="bg-white rounded-t-3xl max-h-[78vh] flex flex-col w-full max-w-md mx-auto" onClick={e=>e.stopPropagation()}>
            <div className="flex justify-center pt-3 shrink-0"><div className="w-10 h-1 bg-gray-200 rounded-full"/></div>
            <div className="flex items-center justify-between px-5 pt-3 pb-2 shrink-0">
              <span className="text-base font-bold text-gray-900">アイコンとカラー</span>
              <button onClick={()=>setIconSheetOpen(false)} className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 font-bold text-sm">×</button>
            </div>
            <div className="overflow-y-auto px-5 pb-10 flex-1">
              {/* Color */}
              <p className="text-xs font-bold text-gray-400 mb-2 mt-1">カラー</p>
              <div className="flex gap-2 mb-5">
                {TASK_COLORS.map((c,i)=>(
                  <button key={i} onClick={()=>setColor(c)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${color===c?'border-gray-800 scale-110':'border-gray-100'}`}
                    style={{background:c||'#E5E7EB'}}/>
                ))}
              </div>
              {/* Recent */}
              {recentIcons.length>0&&(
                <>
                  <p className="text-xs font-bold text-gray-400 mb-2">最近使ったアイコン</p>
                  <div className="grid grid-cols-5 gap-2 mb-5">
                    {recentIcons.map(key=>{
                      const opt=ICON_OPTIONS.find(o=>o.key===key);
                      if(!opt) return null;
                      const Ic=getTaskIcon(key);
                      const sel=icon===key;
                      return (
                        <button key={key} onClick={()=>pickIcon(key)}
                          className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl ${sel?'bg-gray-900':'bg-gray-50'}`}>
                          <Ic size={22} className={sel?'text-white':'text-gray-700'}/>
                          <span className={`text-[10px] leading-none ${sel?'text-gray-100':'text-gray-500'}`}>{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {/* Categories */}
              {ICON_CATEGORIES.map(cat=>(
                <div key={cat.label} className="mb-5">
                  <p className="text-xs font-bold text-gray-400 mb-2">{cat.label}</p>
                  <div className="grid grid-cols-5 gap-2">
                    {cat.icons.map(opt=>{
                      const Ic=getTaskIcon(opt.key);
                      const sel=icon===opt.key;
                      return (
                        <button key={opt.key} onClick={()=>pickIcon(opt.key)}
                          className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl ${sel?'bg-gray-900':'bg-gray-50'}`}>
                          <Ic size={22} className={sel?'text-white':'text-gray-700'}/>
                          <span className={`text-[10px] leading-none ${sel?'text-gray-100':'text-gray-500'}`}>{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── TaskCard ──────────────────────────────────────────────────────────────────

function TaskCard({task,onToggle,onEdit,globalTags}:{task:Task;onToggle:()=>void;onEdit:()=>void;globalTags:TagDef[];}) {
  const endTime = (task.startTime&&(task.duration??0)>0) ? fromMin(toMin(task.startTime)+(task.duration??0)) : null;
  return (
    <div className={`flex items-center gap-2.5 bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-2.5 ${task.completed?'opacity-50':''}`}
      onClick={onEdit}>
      <div className="flex-1 min-w-0">
        {task.startTime&&(
          <p className="text-[11px] text-gray-400 leading-none mb-0.5">
            {task.startTime}{endTime?`〜${endTime}`:''}
            {task.recurrence&&<AppIcons.repeat size={11} className="ml-1 inline-block align-middle"/>}
          </p>
        )}
        <p className={`text-sm font-semibold leading-snug ${task.completed?'line-through text-gray-400':'text-gray-900'}`}>{task.name}</p>
        {task.memo&&<p className="text-xs text-gray-400 mt-0.5 truncate">{task.memo}</p>}
        {(task.tags??[]).length>0&&(
          <div className="flex flex-wrap gap-1 mt-1">
            {(task.tags??[]).map(tag=>{
              const td=globalTags.find(t=>t.name===tag);
              return (
                <span key={tag} style={td?{backgroundColor:td.color,color:getTagTextColor(td.color)}:{}}
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${td?'':'bg-gray-100 text-gray-500'}`}>{tag}</span>
              );
            })}
          </div>
        )}
      </div>
      <button onClick={e=>{e.stopPropagation();onToggle();}}
        className={`w-6 h-6 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${task.completed?'border-gray-900 bg-gray-900':'border-gray-300'}`}>
        {task.completed&&<span className="text-white text-[10px] font-bold leading-none">✓</span>}
      </button>
    </div>
  );
}

// ── FreeTimeCard ──────────────────────────────────────────────────────────────

function FreeTimeCard({slot,fits,height,onSchedule,onDragStart}:{
  slot:FreeSlot;fits:Task[];height:number;
  onSchedule:(t:Task,time:string)=>void;
  onDragStart:(t:Task,x:number,y:number)=>void;
}) {
  const [pressingId,setPressingId] = useState<string|null>(null);
  const lpTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  const startLP=(task:Task,e:React.TouchEvent)=>{
    const touch=e.touches[0];
    setPressingId(task.id);
    lpTimer.current=setTimeout(()=>{
      navigator.vibrate?.(40);
      setPressingId(null);
      onDragStart(task,touch.clientX,touch.clientY);
    },500);
  };
  const cancelLP=()=>{
    if(lpTimer.current){clearTimeout(lpTimer.current);lpTimer.current=null;}
    setPressingId(null);
  };

  const h=Math.floor(slot.min/60), m=slot.min%60;
  return (
    <div className="bg-gray-100 rounded-2xl px-4 pt-5 pb-4 flex flex-col" style={{height:`${height}px`,overflow:'hidden'}}>
      <div className="flex items-center gap-1 mb-1">
        <AppIcons.freeTime size={12} className="text-gray-400"/>
        <span className="text-xs text-gray-400 font-medium">空き時間</span>
      </div>
      <p className="font-semibold text-gray-700 leading-none">
        {h>0&&<><span className="text-xl">{h}</span><span className="text-xs ml-0.5">時間</span></>}
        {m>0&&<><span className="text-xl ml-1">{m}</span><span className="text-xs ml-0.5">分</span></>}
      </p>
      {fits.length>0&&(
        <div className="flex flex-wrap gap-1.5 mt-2">
          {fits.map(t=>(
            <button key={t.id}
              onClick={()=>onSchedule(t,slot.start)}
              onTouchStart={e=>startLP(t,e)}
              onTouchEnd={cancelLP}
              onTouchMove={cancelLP}
              className={`inline-flex items-center gap-1 bg-white rounded-full px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm select-none transition-transform${pressingId===t.id?' scale-95 shadow-md ring-2 ring-blue-300':''}`}>
              <span className="w-3 h-3 border border-gray-300 rounded-sm shrink-0"/>
              <span>{t.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── CompactTaskCard ───────────────────────────────────────────────────────────

function CompactTaskCard({task,onToggle,onEdit}:{task:Task;onToggle:()=>void;onEdit:()=>void;}) {
  return (
    <div
      className={`h-full bg-white rounded-xl border border-gray-100 shadow-sm p-2 flex flex-col justify-between overflow-hidden${task.completed?' opacity-50':''}`}
      onClick={onEdit}>
      <div className="flex items-center justify-between gap-0.5">
        <button onClick={e=>{e.stopPropagation();onToggle();}}
          className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors${task.completed?' border-gray-900 bg-gray-900':' border-gray-300'}`}>
          {task.completed&&<span className="text-white text-[8px] font-bold leading-none">✓</span>}
        </button>
      </div>
      <p className={`text-[10px] font-semibold leading-tight mt-1${task.completed?' line-through text-gray-400':' text-gray-800'}`}
        style={{display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'} as React.CSSProperties}>
        {task.name}
      </p>
    </div>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────────

function Timeline({date,tasks,later,settings,now,onToggle,onEdit,onEditIconSheet,onSchedule,onAddAtTime,onDragStart,dragTaskId,yToTimeRef,layoutYRef,globalTags,todayHistory}:{
  date:string;tasks:Task[];later:Task[];settings:Settings;now:string;
  onToggle:(id:string)=>void;onEdit:(t:Task)=>void;onEditIconSheet:(t:Task)=>void;
  onSchedule:(t:Task,time:string)=>void;onAddAtTime:(time:string)=>void;
  onDragStart:(t:Task,x:number,y:number)=>void;dragTaskId?:string;
  yToTimeRef:React.MutableRefObject<((clientY:number)=>string)|null>;
  layoutYRef:React.MutableRefObject<((min:number)=>number)|null>;
  globalTags:TagDef[];
  todayHistory?:{taskNames:string[]};
}) {
  const [pressingId,setPressingId] = useState<string|null>(null);
  const [historyOpen,setHistoryOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lpTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const startLP=(task:Task,e:React.TouchEvent)=>{
    const touch=e.touches[0];
    setPressingId(task.id);
    lpTimer.current=setTimeout(()=>{
      navigator.vibrate?.(40);
      setPressingId(null);
      onDragStart(task,touch.clientX,touch.clientY);
    },500);
  };
  const cancelLP=()=>{
    if(lpTimer.current){clearTimeout(lpTimer.current);lpTimer.current=null;}
    setPressingId(null);
  };
  const wakeMin=toMin(settings.wakeTime),sleepMin=toMin(settings.sleepTime);
  const nowMin=toMin(now);

  const dayTasks=tasks.filter(t=>t.date===date&&!t.isLater&&t.startTime).sort((a,b)=>toMin(a.startTime!)-toMin(b.startTime!));
  const freeSlots=calcFreeSlots(tasks,date,settings);
  const laterPool=later.filter(t=>!t.completed);

  const MIN_CARD_H = 60;
  const WAKE_CARD_H=52, SLEEP_CARD_H=52;
  const COLS=5, ROW_GAP=6;

  type TaskGroupData={startTime:string;tasks:Task[];rows:number;h:number};
  const tasksByTime=new Map<string,Task[]>();
  for(const t of dayTasks){
    if(!tasksByTime.has(t.startTime!)) tasksByTime.set(t.startTime!,[]);
    tasksByTime.get(t.startTime!)!.push(t);
  }
  const taskGroupList:TaskGroupData[]=[...tasksByTime.entries()]
    .sort((a,b)=>toMin(a[0])-toMin(b[0]))
    .map(([startTime,tasks])=>{
      const rows=Math.ceil(tasks.length/COLS);
      const h=tasks.length===1
        ?Math.max(MIN_CARD_H,(tasks[0].duration??0)*PX_PER_MIN)
        :rows*MIN_CARD_H+(rows-1)*ROW_GAP;
      return {startTime,tasks,rows,h};
    });

  // Simulate chip wrapping to get accurate content height.
  // CARD_LEFT=68, p-4*2=32 → inner width = screenWidth - 100
  const calcFreeContentH=(tasks:Task[]):number=>{
    const PAD=20;    // py-5 (top and bottom)
    const ICON_H=16; // header row height
    const ICON_MB=4; // mb-1 after header
    const DUR_H=28;  // duration text (text-xl, leading-none)
    const CHIP_MT=8; // mt-2 before chips section
    const CHIP_H=24; const ROW_GAP=6; const GAP_X=6;
    const base=PAD*2+ICON_H+ICON_MB+DUR_H; // 88px — no mb on duration, no chips div
    if(tasks.length===0) return base;
    const innerW=(typeof window!=='undefined'?window.innerWidth:375)-68-32;
    let rows=1,rowW=0;
    for(const t of tasks){
      const w=36+t.name.length*9;
      if(rowW>0&&rowW+GAP_X+w>innerW){rows++;rowW=w;}
      else{rowW+=(rowW>0?GAP_X:0)+w;}
    }
    return base+CHIP_MT+rows*CHIP_H+(rows-1)*ROW_GAP;
  };

  type FreePassItem={slot:FreeSlot;freeY:number;finalH:number};
  const groupLayout:{g:TaskGroupData;top:number}[]=[];
  const freePassItems:FreePassItem[]=[];

  // Phase 0: pre-wake tasks — compact (card order, no time gap)
  let prevBottom=-16;
  for(const g of taskGroupList.filter(g=>toMin(g.startTime)<wakeMin)){
    const top=prevBottom+16;
    groupLayout.push({g,top});
    prevBottom=top+g.h;
  }

  // Wake card: right after pre-wake items (no clock-time gap)
  const wakeCardTop=prevBottom+16;
  prevBottom=wakeCardTop+WAKE_CARD_H;

  // Time→Y within activity window, anchored at wakeCardTop
  const calcDayY=(min:number)=>wakeCardTop+WAKE_CARD_H+(min-wakeMin)*PX_PER_MIN;

  // Phase 1: daytime tasks + free slots — real-time Y within wake–sleep window
  type TLItem={type:'group';g:TaskGroupData;y:number}|{type:'free';s:FreeSlot;y:number};
  const dayItems:TLItem[]=[
    ...taskGroupList.filter(g=>toMin(g.startTime)>=wakeMin&&toMin(g.startTime)<sleepMin)
      .map(g=>({type:'group' as const,g,y:calcDayY(toMin(g.startTime))})),
    ...freeSlots.map(s=>({type:'free' as const,s,y:calcDayY(toMin(s.start))})),
  ].sort((a,b)=>a.y-b.y||(a.type==='group'?-1:1));

  for(const item of dayItems){
    if(item.type==='group'){
      const top=Math.max(item.y,prevBottom+16);
      groupLayout.push({g:item.g,top});
      prevBottom=top+item.g.h;
    } else {
      const freeY=Math.max(item.y,prevBottom)+16;
      const contentH=calcFreeContentH(laterPool);
      const timeH=item.s.min*PX_PER_MIN;
      const finalH=Math.max(timeH,contentH,60);
      freePassItems.push({slot:item.s,freeY,finalH});
      prevBottom=freeY+finalH;
    }
  }

  const freeLayout:{slot:FreeSlot;freeY:number;finalH:number}[]=freePassItems;

  // Sleep card: right after daytime content
  const sleepCardTop=prevBottom+16;

  // Phase 2: post-sleep tasks — compact (card order, no time gap)
  prevBottom=sleepCardTop+SLEEP_CARD_H;
  for(const g of taskGroupList.filter(g=>toMin(g.startTime)>=sleepMin)){
    const top=prevBottom+16;
    groupLayout.push({g,top});
    prevBottom=top+g.h;
  }

  const hasHistoryCard=!!(todayHistory&&todayHistory.taskNames.length>0)&&date===todayStr();
  const HISTORY_CARD_H=44;
  const totalHeight=Math.max(prevBottom,sleepCardTop+SLEEP_CARD_H+(hasHistoryCard?HISTORY_CARD_H+12:0))+32;

  // Piecewise linear time→Y mapping using card layout as anchor points
  const rawAnchors:[number,number][]=[[wakeMin,wakeCardTop]];
  for(const {g,top} of groupLayout){
    const sm=toMin(g.startTime);
    const maxDur=Math.max(...g.tasks.map(t=>t.duration??0));
    rawAnchors.push([sm,top],[sm+maxDur,top+g.h]);
  }
  rawAnchors.push([sleepMin,sleepCardTop]);
  rawAnchors.sort((a,b)=>a[0]-b[0]);
  const anchors:[number,number][]=[];
  for(const [m,y] of rawAnchors){
    if(anchors.length>0&&anchors[anchors.length-1][0]===m){
      anchors[anchors.length-1][1]=Math.max(anchors[anchors.length-1][1],y);
    } else { anchors.push([m,y]); }
  }
  const layoutCalcY=(min:number):number=>{
    if(min<=anchors[0][0]) return anchors[0][1];
    if(min>=anchors[anchors.length-1][0]) return anchors[anchors.length-1][1];
    for(let i=0;i<anchors.length-1;i++){
      const [m0,y0]=anchors[i],[m1,y1]=anchors[i+1];
      if(min>=m0&&min<=m1) return Math.round(y0+(min-m0)/(m1-m0)*(y1-y0));
    }
    return calcDayY(min);
  };

  const AXIS_X=80, CARD_LEFT=112;

  // anchors の逆引き（Y座標→時刻）を App のドラッグハンドラに渡す
  yToTimeRef.current=(clientY:number):string=>{
    const el=containerRef.current;
    const baseY=el?(el.getBoundingClientRect().top+window.scrollY):0;
    const timelineY=clientY+window.scrollY-baseY;
    let min:number;
    if(!anchors.length||timelineY<=anchors[0][1]){
      min=anchors[0]?.[0]??wakeMin;
    } else if(timelineY>=anchors[anchors.length-1][1]){
      min=anchors[anchors.length-1][0];
    } else {
      min=wakeMin;
      for(let i=0;i<anchors.length-1;i++){
        const [m0,y0]=anchors[i],[m1,y1]=anchors[i+1];
        if(timelineY>=y0&&timelineY<=y1){
          min=y1===y0?m0:m0+(timelineY-y0)/(y1-y0)*(m1-m0);
          break;
        }
      }
    }
    const snapped=Math.round(min/5)*5;
    return fromMin(Math.max(wakeMin,Math.min(sleepMin,snapped)));
  };

  // 実レイアウト座標（min→スクリーンY）をドラッグオーバーレイ用に公開
  layoutYRef.current=(min:number):number=>{
    const el=containerRef.current;
    if(!el) return 0;
    return el.getBoundingClientRect().top+layoutCalcY(min);
  };

  return (
    <div ref={containerRef} className="relative" style={{height:`${totalHeight+32}px`,minHeight:'400px'}}>
      {/* vertical line */}
      <div className="absolute bg-gray-300" style={{left:`${AXIS_X-2}px`,width:'4px',top:0,height:`${totalHeight}px`}}/>


      {/* task start time labels — 1 per group, center-aligned, skip wake/sleep */}
      {groupLayout.map(({g,top})=>{
        const stMin=toMin(g.startTime);
        if(stMin===wakeMin||stMin===sleepMin) return null;
        const centerY=top+g.h/2;
        return [
          <div key={`tl-${g.startTime}`} className="absolute flex items-center" style={{top:`${centerY}px`,transform:'translateY(-50%)',left:0}}>
            <span className="text-xs w-12 text-right pr-1 leading-none text-gray-400">{g.startTime}</span>
          </div>,
        ];
      })}

      {/* wake/sleep axis labels */}
      <div className="absolute flex items-center" style={{top:`${wakeCardTop+WAKE_CARD_H/2}px`,transform:'translateY(-50%)',left:0}}>
        <span className="text-xs w-12 text-right pr-1 leading-none text-gray-400">{settings.wakeTime}</span>
      </div>
      <div className="absolute z-10 pointer-events-none" style={{top:`${wakeCardTop}px`,left:`${AXIS_X-28}px`,width:'56px',height:'56px'}}>
        <div className="w-full h-full bg-gray-100 flex items-center justify-center" style={{borderRadius:'28px'}}>
          <AppIcons.wake size={24} className="text-gray-400"/>
        </div>
      </div>
      <div className="absolute flex items-center" style={{top:`${sleepCardTop+SLEEP_CARD_H/2}px`,transform:'translateY(-50%)',left:0}}>
        <span className="text-xs w-12 text-right pr-1 leading-none text-gray-400">{settings.sleepTime}</span>
      </div>
      <div className="absolute z-10 pointer-events-none" style={{top:`${sleepCardTop}px`,left:`${AXIS_X-28}px`,width:'56px',height:'56px'}}>
        <div className="w-full h-full bg-gray-100 flex items-center justify-center" style={{borderRadius:'28px'}}>
          <AppIcons.sleep size={24} className="text-gray-400"/>
        </div>
      </div>

      {/* free slot hourly labels on left axis — skip wake/sleep and task start times */}
      {freeLayout.flatMap(({slot,freeY,finalH})=>{
        const usedMins=new Set([wakeMin,sleepMin,...groupLayout.map(({g})=>toMin(g.startTime))]);
        const startMin=toMin(slot.start);
        const endMin=toMin(slot.end);
        const slotMin=endMin-startMin;
        const cardY=(m:number)=>slotMin>0?freeY+(m-startMin)/slotMin*finalH:freeY;
        const labels:number[]=[];
        for(let m=Math.ceil(startMin/60)*60;m<=endMin;m+=60){
          if(usedMins.has(m)) continue;
          const y=cardY(m);
          if(y>=freeY&&y<=freeY+finalH) labels.push(m);
        }
        return labels.flatMap(m=>[
          <div key={`fh-${m}`} className="absolute flex items-center" style={{top:`${cardY(m)}px`,transform:'translateY(-50%)',left:0}}>
            <button onClick={()=>onAddAtTime(fromMin(m))}
              className="text-xs w-12 text-right pr-1 leading-none text-gray-400 active:text-gray-900 transition-colors">
              {fromMin(m)}
            </button>
          </div>,
          <div key={`fh-dot-${m}`} className="absolute z-10 rounded-full bg-gray-200" style={{width:'4px',height:'4px',left:`${AXIS_X}px`,top:`${cardY(m)}px`,transform:'translate(-50%,-50%)'}}/>,
        ]);
      })}

      {/* current time */}
      {date===todayStr()&&nowMin>=wakeMin&&nowMin<=sleepMin&&(
        <div className="absolute flex items-center z-20 gap-1.5" style={{top:`${layoutCalcY(nowMin)-12}px`,left:0,right:0}}>
          <div className="bg-gray-900 text-white text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap">{now}</div>
          <button onClick={()=>onAddAtTime(now)} className="w-5 h-5 bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">+</button>
          <div className="flex-1 h-px bg-gray-300"/>
        </div>
      )}

      {/* wake card */}
      <div className="absolute z-10" style={{top:`${wakeCardTop}px`,left:`${CARD_LEFT}px`,right:'0px'}}>
        <div className="flex items-center gap-2.5 bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-2.5">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-gray-400 leading-none mb-0.5">{settings.wakeTime}</p>
            <p className="text-sm font-semibold text-gray-900">起床</p>
          </div>
        </div>
      </div>

      {/* sleep card */}
      <div className="absolute z-10" style={{top:`${sleepCardTop}px`,left:`${CARD_LEFT}px`,right:'0px'}}>
        <div className="flex items-center gap-2.5 bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-2.5">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-gray-400 leading-none mb-0.5">{settings.sleepTime}</p>
            <p className="text-sm font-semibold text-gray-900">就寝</p>
          </div>
        </div>
      </div>

      {/* move history card */}
      {hasHistoryCard&&todayHistory&&(
        <>
          <div className="absolute z-10"
            style={{top:`${sleepCardTop+SLEEP_CARD_H+12}px`,left:`${CARD_LEFT}px`,right:'0px'}}
            onClick={()=>setHistoryOpen(true)}>
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl border border-gray-100 px-3 py-2.5 active:bg-gray-100">
              <span className="text-xs text-gray-400">↩︎</span>
              <span className="text-xs text-gray-400 flex-1">未完了タスク{todayHistory.taskNames.length}件をあとでやるへ移動</span>
              <AppIcons.caretRight size={12} className="text-gray-300"/>
            </div>
          </div>
          {historyOpen&&(
            <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-6"
              onClick={()=>setHistoryOpen(false)}>
              <div className="bg-white rounded-2xl p-4 w-full max-w-xs shadow-xl"
                onClick={e=>e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-900">移動したタスク</p>
                  <button onClick={()=>setHistoryOpen(false)}
                    className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 text-sm">×</button>
                </div>
                {todayHistory.taskNames.map((name,i)=>(
                  <div key={i} className="flex items-center gap-2.5 py-2 border-b border-gray-50 last:border-0">
                    <div className="w-4 h-4 rounded border border-gray-200 shrink-0"/>
                    <span className="text-sm text-gray-700">{name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* task groups */}
      {groupLayout.map(({g,top})=>{
        if(g.tasks.length===1){
          const task=g.tasks[0];
          const isDragging=dragTaskId===task.id;
          const isPressing=pressingId===task.id;
          const CapsuleIc=getTaskIcon(task.icon??'');
          return [
            <div key={`cap-${g.startTime}`} className="absolute z-10 cursor-pointer"
              style={{top:`${top}px`,left:`${AXIS_X-28}px`,width:'56px',height:`${Math.max(g.h,56)}px`}}
              onClick={e=>{e.stopPropagation();onEditIconSheet(task);}}>
              <div className="w-full h-full flex items-center justify-center active:opacity-70 transition-opacity" style={{borderRadius:'28px',background:task.color||'#F3F4F6'}}>
                <CapsuleIc size={24} className={task.color?'text-gray-600':'text-gray-400'}/>
              </div>
            </div>,
            <div key={g.startTime} className={`absolute z-10 transition-transform select-none ${isPressing?'scale-95':''}`}
              style={{top:`${top}px`,left:`${CARD_LEFT}px`,right:'0px',minHeight:`${g.h}px`,
                opacity:isDragging?0.25:1,pointerEvents:isDragging?'none':'auto'}}
              onTouchStart={e=>startLP(task,e)}
              onTouchEnd={cancelLP}
              onTouchMove={cancelLP}>
              <TaskCard task={task} onToggle={()=>onToggle(task.id)} onEdit={()=>onEdit(task)} globalTags={globalTags}/>
            </div>,
          ];
        }
        const cols=Math.min(g.tasks.length,COLS);
        return [
          <div key={`cap-${g.startTime}`} className="absolute z-10 pointer-events-none"
            style={{top:`${top}px`,left:`${AXIS_X-28}px`,width:'56px',height:`${Math.max(g.h,56)}px`}}>
            <div className="w-full h-full bg-gray-100 flex items-center justify-center" style={{borderRadius:'28px'}}>
              <AppIcons.task size={24} className="text-gray-400"/>
            </div>
          </div>,
          <div key={g.startTime} className="absolute z-10"
            style={{top:`${top}px`,left:`${CARD_LEFT}px`,right:'0px'}}>
            <div style={{display:'grid',gridTemplateColumns:`repeat(${cols},1fr)`,gap:`${ROW_GAP}px`}}>
              {g.tasks.map(task=>{
                const isDragging=dragTaskId===task.id;
                const isPressing=pressingId===task.id;
                return (
                  <div key={task.id}
                    className={`select-none transition-transform${isPressing?' scale-95':''}`}
                    style={{height:`${MIN_CARD_H}px`,opacity:isDragging?0.25:1,pointerEvents:isDragging?'none':'auto'}}
                    onTouchStart={e=>startLP(task,e)}
                    onTouchEnd={cancelLP}
                    onTouchMove={cancelLP}>
                    <CompactTaskCard task={task} onToggle={()=>onToggle(task.id)} onEdit={()=>onEdit(task)}/>
                  </div>
                );
              })}
            </div>
          </div>,
        ];
      })}

      {/* free time cards */}
      {freeLayout.map(({slot,freeY,finalH},i)=>{
        const fits=laterPool;
        return (
          <div key={i} className="absolute z-10" style={{top:`${freeY}px`,left:`${CARD_LEFT}px`,right:'0px'}}>
            <FreeTimeCard slot={slot} fits={fits} height={finalH} onSchedule={onSchedule} onDragStart={onDragStart}/>
          </div>
        );
      })}

      {/* empty state */}
      {dayTasks.length===0&&freeSlots.length===0&&(
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{left:`${CARD_LEFT}px`}}>
          <AppIcons.task size={40} className="mb-2 text-gray-300"/>
          <p className="text-sm text-gray-400">タスクがありません</p>
          <p className="text-xs text-gray-300 mt-1">時間をタップして追加</p>
        </div>
      )}
    </div>
  );
}

// ── BottomTabs ────────────────────────────────────────────────────────────────

function BottomTabs({activeTab,onSwitchTab,onClose,tasks,shopItems,pendingCount,shopPending,
  onToggle,onEdit,onAddShop,onToggleShop,onDeleteShop,onDragStart
}:{
  activeTab:'later'|'shop'; onSwitchTab:(t:'later'|'shop')=>void; onClose:()=>void;
  tasks:Task[]; shopItems:ShopItem[]; pendingCount:number; shopPending:number;
  onToggle:(id:string)=>void; onEdit:(t:Task)=>void;
  onAddShop:(n:string)=>void; onToggleShop:(id:string)=>void; onDeleteShop:(id:string)=>void;
  onDragStart:(t:Task,x:number,y:number)=>void;
}) {
  const [shopInput,setShopInput] = useState('');
  const [sortDir,setSortDir]     = useState<'asc'|'desc'>('asc');
  const [pressingId,setPressingId]= useState<string|null>(null);
  const lpTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const swX=useRef(0), swY=useRef(0);
  const tabs:('later'|'shop')[]=['later','shop'];
  const onSheetSwipe=(e:React.TouchEvent)=>{
    const dx=e.changedTouches[0].clientX-swX.current;
    const dy=Math.abs(e.changedTouches[0].clientY-swY.current);
    if(Math.abs(dx)>70&&Math.abs(dx)>dy){
      const idx=tabs.indexOf(activeTab);
      if(dx<0&&idx<1) onSwitchTab('shop');
      else if(dx>0&&idx>0) onSwitchTab('later');
    }
  };

  const startLP=(task:Task,e:React.TouchEvent)=>{
    const touch=e.touches[0];
    setPressingId(task.id);
    lpTimer.current=setTimeout(()=>{
      if(navigator.vibrate) navigator.vibrate(40);
      setPressingId(null);
      onDragStart(task,touch.clientX,touch.clientY);
    },500);
  };
  const cancelLP=()=>{
    if(lpTimer.current){clearTimeout(lpTimer.current);lpTimer.current=null;}
    setPressingId(null);
  };
  const addShop = () => { const v=shopInput.trim(); if(!v) return; onAddShop(v); setShopInput(''); };

  const laterTasks  = tasks.filter(t=>t.isLater);
  const laterPending= laterTasks.filter(t=>!t.completed);
  const laterDone   = laterTasks.filter(t=>t.completed);

  // Pinned tasks always appear first, then sorted by sortDir within the group
  const normalLater = (() => {
    const pinned  = laterPending.filter(t=>t.pinned&&!t.recurrence);
    const normal  = laterPending.filter(t=>!t.pinned&&!t.recurrence);
    const ordered = sortDir==='asc' ? normal : [...normal].reverse();
    return [...pinned,...ordered];
  })();

  const scheduledRaw = tasks.filter(t=>!t.isLater&&t.startTime&&!t.completed&&!t.recurrence)
    .sort((a,b)=>{
      const cmp=a.date.localeCompare(b.date)||toMin(a.startTime!)-toMin(b.startTime!);
      return sortDir==='asc'?cmp:-cmp;
    });

  // Recurring tasks grouped (one row per series)
  const recurringMap = new Map<string,Task>();
  [...laterPending.filter(t=>t.recurrence),
   ...tasks.filter(t=>!t.isLater&&t.startTime&&!t.completed&&t.recurrence)
  ].forEach(t=>{
    const key=`${t.name}||${t.recurrence}||${t.startTime??''}`;
    if(!recurringMap.has(key)) recurringMap.set(key,t);
  });
  const recurringGroups=[...recurringMap.values()].sort((a,b)=>{
    const cmp=(a.startTime??'').localeCompare(b.startTime??'')||a.name.localeCompare(b.name);
    return sortDir==='asc'?cmp:-cmp;
  });

  const shopPendingItems=shopItems.filter(i=>!i.checked);
  const shopDoneItems=shopItems.filter(i=>i.checked);


  return (
    <div className="fixed inset-0 z-50 flex flex-col" onClick={onClose}>
      <div className="flex-1"/>
      <div className="bg-white w-full max-w-md mx-auto rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e=>e.stopPropagation()}
        onTouchStart={e=>{swX.current=e.touches[0].clientX;swY.current=e.touches[0].clientY;}}
        onTouchEnd={onSheetSwipe}>
        <div className="flex justify-center pt-3 shrink-0"><div className="w-10 h-1 bg-gray-200 rounded-full"/></div>
        {/* Tab bar */}
        <div className="flex border-b border-gray-100 shrink-0 mt-1">
          {([['later','あとでやる',pendingCount],['shop','買い物リスト',shopPending]] as const).map(([t,label,cnt])=>(
            <button key={t} onClick={()=>onSwitchTab(t)}
              className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${activeTab===t?'border-gray-900 text-gray-900':'border-transparent text-gray-400'}`}>
              {label}
              {cnt>0&&<span className="text-[11px] bg-gray-900 text-white min-w-[18px] h-[18px] rounded-full flex items-center justify-center font-bold px-1">{cnt}</span>}
            </button>
          ))}
        </div>

        {/* ── あとでやる tab ── */}
        {activeTab==='later'&&(
          <div className="overflow-y-auto px-4 pb-10 flex-1">
            <div className="flex items-center justify-between pt-3 pb-2">
              <h3 className="text-sm font-bold text-gray-900">
                あとでやる
                {pendingCount>0&&<span className="ml-1.5 text-gray-400 font-normal">{pendingCount}</span>}
              </h3>
              <button onClick={()=>setSortDir(d=>d==='asc'?'desc':'asc')}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-sm bg-gray-900 text-white transition-colors">
                {sortDir==='asc'?'↓':'↑'}
              </button>
            </div>

            {/* あとでやる section */}
            {normalLater.length>0&&(
              <div className="mb-1">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs text-gray-400">≡</span>
                  <span className="text-xs text-gray-400 font-medium">あとでやる {normalLater.length}</span>
                </div>
                <div className="space-y-2">
                  {normalLater.map(t=>(
                    <div key={t.id}
                      className={`flex items-center gap-2.5 bg-white border border-gray-100 rounded-2xl shadow-sm px-3 py-3 transition-transform select-none ${pressingId===t.id?'scale-95 shadow-lg border-blue-200':''}`}
                      onTouchStart={e=>startLP(t,e)}
                      onTouchEnd={cancelLP}
                      onTouchMove={cancelLP}>
                      <div className="w-7 h-7 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                        {t.pinned?<AppIcons.pin size={12}/>:<AppIcons.checkSquare className="text-gray-400"/>}
                      </div>
                      <div className="flex-1 min-w-0" onClick={()=>onEdit(t)}>
                        <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                        {(t.duration??0)>0&&<p className="text-xs text-gray-400">{durLabel(t.duration??0)}</p>}
                      </div>
                      {(t.postponedCount??0)>0&&(
                        <span className="flex items-center gap-0.5 text-xs text-gray-400 font-semibold shrink-0"><AppIcons.postponed size={11}/>{t.postponedCount}</span>
                      )}
                      <button onClick={()=>onToggle(t.id)} className="w-6 h-6 rounded-full border-2 border-gray-300 shrink-0"/>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 時間指定 section */}
            {scheduledRaw.length>0&&(
              <div className="mt-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs text-gray-400">⊙</span>
                  <span className="text-xs text-gray-400 font-medium">時間指定 {scheduledRaw.length}</span>
                </div>
                <div className="space-y-2">
                  {scheduledRaw.map(t=>(
                    <div key={t.id} className="flex items-center gap-2.5 bg-white border border-gray-100 rounded-2xl shadow-sm px-3 py-3">
                      <div className="w-7 h-7 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                        <span className="text-xs text-gray-400">⊙</span>
                      </div>
                      <div className="flex-1 min-w-0" onClick={()=>onEdit(t)}>
                        <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                        <p className="text-xs text-gray-400">{t.date.slice(5).replace('-','/')} {t.startTime}</p>
                      </div>
                      <button onClick={()=>onToggle(t.id)} className="w-6 h-6 rounded-full border-2 border-gray-300 shrink-0"/>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 繰り返し section */}
            {recurringGroups.length>0&&(
              <div className="mt-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <AppIcons.repeat size={12} className="text-gray-400"/>
                  <span className="text-xs text-gray-400 font-medium">繰り返し {recurringGroups.length}</span>
                </div>
                <div className="space-y-2">
                  {recurringGroups.map(t=>(
                    <div key={`${t.name}||${t.recurrence}||${t.startTime??''}`}
                      className="flex items-center gap-2.5 bg-white border border-gray-100 rounded-2xl shadow-sm px-3 py-3"
                      onClick={()=>onEdit(t)}>
                      <div className="w-7 h-7 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                        <AppIcons.repeat size={12} className="text-gray-400"/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                        <p className="text-xs text-gray-400">{recLabel(t)}{t.startTime?` ${t.startTime}`:''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* empty */}
            {normalLater.length===0&&scheduledRaw.length===0&&recurringGroups.length===0&&(
              <div className="py-12 text-center"><AppIcons.sparkle className="mx-auto mb-2 text-gray-300"/><p className="text-sm text-gray-400">タスクがありません</p></div>
            )}

            {/* completed */}
            {laterDone.length>0&&(
              <div className="mt-4">
                <p className="text-xs text-gray-300 pb-2">完了済み</p>
                <div className="space-y-2">
                  {laterDone.map(t=>(
                    <div key={t.id} className="flex items-center gap-2.5 bg-gray-50 border border-gray-100 rounded-2xl px-3 py-3 opacity-60">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><AppIcons.task size={16} className="text-gray-400"/></div>
                      <div className="flex-1"><p className="text-sm font-semibold text-gray-400 line-through">{t.name}</p></div>
                      <button onClick={()=>onToggle(t.id)} className="w-6 h-6 rounded-full border-2 border-gray-900 bg-gray-900 shrink-0 flex items-center justify-center">
                        <span className="text-white text-[10px] font-bold">✓</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 買い物 tab ── */}
        {activeTab==='shop'&&(
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="px-4 pt-3 pb-2 shrink-0">
              <div className="flex gap-2">
                <input type="text" value={shopInput} onChange={e=>setShopInput(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&addShop()}
                  placeholder="商品を追加..."
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-400 bg-gray-50"/>
                <button onClick={addShop} disabled={!shopInput.trim()}
                  className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold disabled:opacity-40">追加</button>
              </div>
            </div>
            <div className="overflow-y-auto px-4 pb-10 flex-1">
              {shopItems.length===0?(
                <div className="py-12 text-center"><AppIcons.shopping size={40} className="mx-auto mb-2 text-gray-300"/><p className="text-sm text-gray-400">リストは空です</p></div>
              ):(
                <div className="space-y-2">
                  {shopPendingItems.map(item=>(
                    <div key={item.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl shadow-sm px-4 py-3">
                      <button onClick={()=>onToggleShop(item.id)} className="w-5 h-5 rounded border-2 border-gray-300 shrink-0"/>
                      <p className="flex-1 text-sm font-medium text-gray-800">{item.name}</p>
                      <button onClick={()=>onDeleteShop(item.id)} className="text-gray-300 text-xl leading-none">×</button>
                    </div>
                  ))}
                  {shopDoneItems.length>0&&<>
                    <p className="text-xs text-gray-300 pt-3 pb-1">購入済み（7日後に自動削除）</p>
                    {shopDoneItems.map(item=>(
                      <div key={item.id} className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 opacity-60">
                        <button onClick={()=>onToggleShop(item.id)} className="w-5 h-5 rounded border-2 border-gray-900 bg-gray-900 shrink-0 flex items-center justify-center">
                          <span className="text-white text-[10px] font-bold">✓</span>
                        </button>
                        <p className="flex-1 text-sm font-medium text-gray-400 line-through">{item.name}</p>
                        <button onClick={()=>onDeleteShop(item.id)} className="text-gray-300 text-xl leading-none">×</button>
                      </div>
                    ))}
                  </>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Settings Screen ──────────────────────────────────────────────────────────

function SettingsRow({icon,iconBg,title,desc,onClick,isLast=false}:{
  icon:React.ReactNode; iconBg:string; title:string; desc?:string; onClick?:()=>void; isLast?:boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 transition-colors${!isLast?' border-b border-gray-100':''}`}
    >
      <div className={`w-[30px] h-[30px] rounded-[8px] flex items-center justify-center shrink-0 text-gray-700 ${iconBg}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium text-gray-900 leading-tight">{title}</p>
        {desc&&<p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
      </div>
      <AppIcons.caretRight className="text-gray-300 shrink-0"/>
    </button>
  );
}

function SettingsScreen({settings,onSettings,onClose,globalTags,onGlobalTags}:{
  settings:Settings; onSettings:(s:Settings)=>void; onClose:()=>void;
  globalTags:TagDef[]; onGlobalTags:(tags:TagDef[])=>void;
}) {
  const [sub,setSub]           = useState<string|null>(null);
  const [tagInput,setTagInput] = useState('');
  const [newTagColor,setNewTagColor] = useState(TAG_COLORS[0].bg);
  const [editIdx,setEditIdx]   = useState<number|null>(null);
  const [editVal,setEditVal]   = useState('');
  const [editColor,setEditColor]   = useState(TAG_COLORS[0].bg);

  const back = () => setSub(null);

  const subHeader = (title:string) => (
    <div className="bg-white border-b border-gray-200 px-4 py-3.5 flex items-center shrink-0">
      <button onClick={back} className="flex items-center gap-0.5 text-gray-900 min-w-[80px]">
        <AppIcons.caretLeft size={20}/>
        <span className="text-[15px]">設定</span>
      </button>
      <h2 className="flex-1 text-center text-[17px] font-semibold text-gray-900 -mx-4">{title}</h2>
      <div className="min-w-[80px]"/>
    </div>
  );

  const comingSoon = (icon:React.ReactNode, msg:string) => (
    <div className="flex flex-col items-center justify-center pt-20 gap-3">
      <div className="text-gray-300">{icon}</div>
      <p className="text-[17px] font-semibold text-gray-900">準備中</p>
      <p className="text-sm text-gray-400 text-center px-8 leading-relaxed">{msg}</p>
    </div>
  );

  const addTag = () => {
    const t = tagInput.trim();
    if(!t || globalTags.some(td=>td.name===t)) return;
    onGlobalTags([...globalTags, {name:t, color:newTagColor}]);
    setTagInput('');
  };
  const deleteTag = (i:number) => onGlobalTags(globalTags.filter((_,idx)=>idx!==i));
  const startEdit = (i:number) => { setEditIdx(i); setEditVal(globalTags[i].name); setEditColor(globalTags[i].color); };
  const commitEdit = () => {
    if(editIdx===null) return;
    const v = editVal.trim();
    if(v && !globalTags.some((t,i)=>t.name===v&&i!==editIdx)){
      onGlobalTags(globalTags.map((t,i)=>i===editIdx?{name:v,color:editColor}:t));
    }
    setEditIdx(null);
  };

  if(sub==='stats') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('統計')}
      <div className="flex-1 overflow-y-auto px-4 pb-8">{comingSoon(<AppIcons.stats size={48}/>,'タスク完了の統計機能は近日公開予定です')}</div>
    </div>
  );

  if(sub==='tags') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('タグ')}
      <div className="flex-1 overflow-y-auto px-4 pb-8">

        {/* New tag */}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-6">新しいタグ</p>
        <div className="bg-white rounded-2xl shadow-sm px-4 pt-4 pb-3">
          <div className="flex gap-2 mb-3 flex-wrap">
            {TAG_COLORS.map(c=>(
              <button key={c.bg} onClick={()=>setNewTagColor(c.bg)}
                style={{backgroundColor:c.bg}}
                className={`w-7 h-7 rounded-full border border-gray-200 transition-all ${newTagColor===c.bg?'ring-2 ring-gray-800 ring-offset-1 scale-110':''}`}/>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <input value={tagInput} onChange={e=>setTagInput(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&addTag()}
              placeholder="タグ名を入力"
              className="flex-1 text-[15px] bg-transparent outline-none text-gray-900 placeholder-gray-300 border-b border-gray-200 pb-1"/>
            <button onClick={addTag}
              className="px-4 py-1.5 bg-gray-900 text-white text-sm font-semibold rounded-xl shrink-0">追加</button>
          </div>
          {tagInput.trim()&&(
            <div className="mt-3">
              <span style={{backgroundColor:newTagColor,color:getTagTextColor(newTagColor)}}
                className="inline-block px-3 py-1 rounded-full text-sm font-medium">
                {tagInput.trim()}
              </span>
            </div>
          )}
        </div>

        {/* Tag list */}
        {globalTags.length>0&&(
          <>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-6">タグ一覧</p>
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              {globalTags.map((tag,i)=>(
                <div key={i} className={`px-4 py-3 flex items-center gap-3${i<globalTags.length-1?' border-b border-gray-100':''}`}>
                  {editIdx===i ? (
                    <div className="flex-1 min-w-0">
                      <div className="flex gap-2 mb-2 flex-wrap">
                        {TAG_COLORS.map(c=>(
                          <button key={c.bg} onClick={()=>setEditColor(c.bg)}
                            style={{backgroundColor:c.bg}}
                            className={`w-6 h-6 rounded-full border border-gray-200 transition-all ${editColor===c.bg?'ring-2 ring-gray-800 ring-offset-1 scale-110':''}`}/>
                        ))}
                      </div>
                      <input autoFocus value={editVal}
                        onChange={e=>setEditVal(e.target.value)}
                        onKeyDown={e=>e.key==='Enter'&&commitEdit()}
                        className="w-full text-[15px] border-b border-gray-300 outline-none bg-transparent text-gray-900 py-0.5"/>
                    </div>
                  ) : (
                    <>
                      <span style={{backgroundColor:tag.color}} className="w-4 h-4 rounded-full shrink-0"/>
                      <span className="flex-1 text-[15px] text-gray-900">{tag.name}</span>
                    </>
                  )}
                  <div className="flex gap-1 shrink-0">
                    <button onClick={()=>editIdx===i?commitEdit():startEdit(i)}
                      className="text-xs text-blue-500 font-medium px-2 py-1">
                      {editIdx===i?'確定':'編集'}
                    </button>
                    {editIdx===i
                      ? <button onClick={()=>setEditIdx(null)} className="text-xs text-gray-400 font-medium px-2 py-1">キャンセル</button>
                      : <button onClick={()=>deleteTag(i)} className="text-xs text-red-400 font-medium px-2 py-1">削除</button>
                    }
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {globalTags.length===0&&(
          <p className="text-sm text-gray-400 text-center mt-10">タグがまだありません</p>
        )}
      </div>
    </div>
  );

  if(sub==='recurring') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('繰り返しタスク')}
      <div className="flex-1 overflow-y-auto px-4 pb-8">{comingSoon(<AppIcons.repeat size={48}/>,'繰り返しタスクの一覧・管理機能は近日公開予定です')}</div>
    </div>
  );

  if(sub==='notifications') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('通知')}
      <div className="flex-1 overflow-y-auto px-4 pb-8">{comingSoon(<AppIcons.bell size={48}/>,'通知設定は近日公開予定です')}</div>
    </div>
  );

  if(sub==='display') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('表示設定')}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-6">外観</p>
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3.5 flex items-center justify-between">
            <p className="text-[15px] font-medium text-gray-900">テーマ</p>
            <span className="text-[15px] text-gray-400">ライト</span>
          </div>
        </div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-6">言語</p>
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3.5 flex items-center justify-between">
            <p className="text-[15px] font-medium text-gray-900">言語</p>
            <span className="text-[15px] text-gray-400">日本語</span>
          </div>
        </div>
      </div>
    </div>
  );

  if(sub==='wakeSleep') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('起床・就寝')}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-6">時間設定</p>
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
            <p className="text-[15px] font-medium text-gray-900">起床時間</p>
            <input type="time" value={settings.wakeTime}
              onChange={e=>onSettings({...settings,wakeTime:e.target.value})}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50"/>
          </div>
          <div className="px-4 py-4 flex items-center justify-between">
            <p className="text-[15px] font-medium text-gray-900">就寝時間</p>
            <input type="time" value={settings.sleepTime}
              onChange={e=>onSettings({...settings,sleepTime:e.target.value})}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50"/>
          </div>
        </div>
      </div>
    </div>
  );

  if(sub==='account') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('アカウント連携')}
      <div className="flex-1 overflow-y-auto px-4 pb-8">{comingSoon(<AppIcons.link size={48}/>,'アカウント連携機能は近日公開予定です')}</div>
    </div>
  );

  if(sub==='calendar') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('カレンダー連携')}
      <div className="flex-1 overflow-y-auto px-4 pb-8">{comingSoon(<AppIcons.calendar size={48}/>,'カレンダー連携機能は近日公開予定です')}</div>
    </div>
  );

  if(sub==='premium') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('プレミアム')}
      <div className="flex-1 overflow-y-auto px-4 pb-8">{comingSoon(<AppIcons.star size={48}/>,'プレミアムプランは近日公開予定です')}</div>
    </div>
  );

  if(sub==='faq') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('よくある質問')}
      <div className="flex-1 overflow-y-auto px-4 pb-8">{comingSoon(<AppIcons.question size={48}/>,'よくある質問は近日公開予定です')}</div>
    </div>
  );

  return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      <div className="bg-[#F2F2F7] px-4 pt-14 pb-2 flex items-center justify-between shrink-0">
        <div className="w-14"/>
        <h1 className="text-[34px] font-bold text-gray-900">設定</h1>
        <button onClick={onClose}
          className="w-14 text-right text-[17px] font-medium text-gray-900">完了</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-10">

        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-4">統計</p>
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <SettingsRow icon={<AppIcons.stats/>} iconBg="bg-gray-100" title="統計" desc="タスク完了の統計を確認" onClick={()=>setSub('stats')} isLast/>
        </div>

        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-6">一般</p>
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <SettingsRow icon={<AppIcons.tag/>} iconBg="bg-gray-100" title="タグ" desc="タグを管理" onClick={()=>setSub('tags')}/>
          <SettingsRow icon={<AppIcons.repeat size={18}/>} iconBg="bg-gray-100" title="繰り返しタスク" desc="繰り返しタスクを管理" onClick={()=>setSub('recurring')}/>
          <SettingsRow icon={<AppIcons.bell/>} iconBg="bg-gray-100" title="通知" desc="通知設定" onClick={()=>setSub('notifications')}/>
          <SettingsRow icon={<AppIcons.palette/>} iconBg="bg-gray-100" title="表示設定" desc="外観、言語など" onClick={()=>setSub('display')}/>
          <SettingsRow icon={<AppIcons.wake size={18}/>} iconBg="bg-gray-100" title="起床・就寝" desc="起床時間、就寝時間を設定" onClick={()=>setSub('wakeSleep')} isLast/>
        </div>

        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-6">アカウント</p>
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <SettingsRow icon={<AppIcons.link/>} iconBg="bg-gray-100" title="アカウント連携" desc="連携サービスを管理" onClick={()=>setSub('account')}/>
          <SettingsRow icon={<AppIcons.calendar size={18}/>} iconBg="bg-gray-100" title="カレンダー連携" desc="カレンダーと同期" onClick={()=>setSub('calendar')} isLast/>
        </div>

        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-6">サブスクリプション</p>
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <SettingsRow icon={<AppIcons.star/>} iconBg="bg-gray-100" title="プレミアム" desc="プランを管理" onClick={()=>setSub('premium')} isLast/>
        </div>

        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-6">その他</p>
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <SettingsRow icon={<AppIcons.question/>} iconBg="bg-gray-100" title="よくある質問" onClick={()=>setSub('faq')} isLast/>
        </div>

      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [tasks,setTasks]         = useState<Task[]>([]);
  const [settings,setSettings]   = useState<Settings>(DEFAULT_SETTINGS);
  const [shopItems,setShopItems] = useState<ShopItem[]>([]);
  const [globalTags,setGlobalTags] = useState<TagDef[]>([]);
  const [moveHistory,setMoveHistory] = useState<MoveHistory[]>([]);
  const [date,setDate]           = useState(todayStr());
  const [modal,setModal]         = useState<{open:boolean;task:Task|null;prefillTime?:string;prefillCategory?:string;iconSheet?:boolean}>({open:false,task:null});
  const [activeCategory,setActiveCat] = useState<string|null>(null);
  const [settingsOpen,setSOp]    = useState(false);
  const [calendarOpen,setCalOp]  = useState(false);
  const [searchOpen,setSearchOpen] = useState(false);
  const [activeTab,setActiveTab] = useState<'later'|'shop'|null>(null);
  const [loaded,setLoaded]       = useState(false);
  const [now,setNow]             = useState(nowStr());
  const [touchY,setTouchY]       = useState(0);
  const [dragTask,setDragTask]   = useState<Task|null>(null);
  const [dragPos,setDragPos]     = useState({x:0,y:0});
  const [dropTime,setDropTime]   = useState<string|null>(null);
  const mainSwX = useRef(0);
  const mainSwY = useRef(0);
  const yToTimeRef = useRef<((clientY:number)=>string)|null>(null);
  const layoutYRef = useRef<((min:number)=>number)|null>(null);
  const [recConfirm,setRecConfirm] = useState<Task|null>(null);
  const [editScope,setEditScope]   = useState<'one'|'all'>('one');
  const [overTrash,setOverTrash]   = useState(false);
  const [overLater,setOverLater]   = useState(false);

  useEffect(()=>{
    try{
      const t=localStorage.getItem(TASKS_KEY);
      const s=localStorage.getItem(SETTINGS_KEY);
      const sh=localStorage.getItem(SHOP_KEY);
      const tg=localStorage.getItem(TAGS_KEY);
      if(t) setTasks((JSON.parse(t) as Task[]).map(tk=>({...tk,recurrence:tk.recurrence??null,customRec:tk.customRec,pinned:tk.pinned??false,tags:tk.tags??[],notifications:tk.notifications??[],incompleteReminder:tk.incompleteReminder??false,category:tk.category,postponedCount:tk.postponedCount??0,lastPostponedDate:tk.lastPostponedDate})));
      if(s) setSettings(JSON.parse(s));
      if(sh){
        const parsed:ShopItem[]=JSON.parse(sh);
        const now=Date.now();
        const cleaned=parsed.filter(i=>!(i.checked&&i.purchasedAt&&now-new Date(i.purchasedAt).getTime()>=7*24*60*60*1000));
        setShopItems(cleaned);
      }
      if(tg){
        const parsed=JSON.parse(tg);
        if(Array.isArray(parsed)&&parsed.length>0&&typeof parsed[0]==='string'){
          setGlobalTags((parsed as string[]).map((name,i)=>({name,color:TAG_COLORS[i%TAG_COLORS.length].bg})));
        } else {
          setGlobalTags(parsed as TagDef[]);
        }
      }
      const mh=localStorage.getItem(HISTORY_KEY);
      if(mh) setMoveHistory(JSON.parse(mh) as MoveHistory[]);
    }catch{}
    setLoaded(true);
  },[]);

  useEffect(()=>{ if(loaded) localStorage.setItem(TASKS_KEY,JSON.stringify(tasks)); },[tasks,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings)); },[settings,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(SHOP_KEY,JSON.stringify(shopItems)); },[shopItems,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(TAGS_KEY,JSON.stringify(globalTags)); },[globalTags,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(HISTORY_KEY,JSON.stringify(moveHistory)); },[moveHistory,loaded]);
  useEffect(()=>{ const iv=setInterval(()=>setNow(nowStr()),60000); return ()=>clearInterval(iv); },[]);

  // 就寝時刻を過ぎた当日の未完了タスクを「あとでやる」へ自動移動し履歴を記録
  useEffect(()=>{
    if(!loaded) return;
    const today=todayStr();
    const nowM=toMin(now);
    const sleepM=toMin(settings.sleepTime);
    const shouldMove=(t:Task)=>
      !t.completed&&!t.isLater&&!!t.startTime&&!t.recurrence&&
      (t.date<today||(t.date===today&&nowM>=sleepM));
    const toMove=tasks.filter(shouldMove);
    if(toMove.length===0) return;
    setTasks(prev=>prev.map(t=>{
      if(!shouldMove(t)) return t;
      const alreadyCounted=t.lastPostponedDate===today;
      return {
        ...t,
        isLater:true,
        startTime:null,
        postponedCount:alreadyCounted?(t.postponedCount??0):(t.postponedCount??0)+1,
        lastPostponedDate:today,
      };
    }));
    setMoveHistory(prev=>{
      const existing=prev.find(h=>h.date===today);
      const newNames=toMove.map(t=>t.name);
      if(existing){
        const merged=[...new Set([...existing.taskNames,...newNames])];
        if(merged.length===existing.taskNames.length) return prev;
        return prev.map(h=>h.date===today?{...h,taskNames:merged}:h);
      }
      return [...prev,{id:uid(),date:today,taskNames:newNames}];
    });
  },[loaded,tasks,settings.sleepTime,now]);

  const filteredTasks = useMemo(()=>activeCategory?tasks.filter(t=>t.category===activeCategory):tasks,[tasks,activeCategory]);
  const laterTasks    = useMemo(()=>filteredTasks.filter(t=>t.isLater),[filteredTasks]);
  const pendingCount  = useMemo(()=>laterTasks.filter(t=>!t.completed).length,[laterTasks]);
  const shopPending   = useMemo(()=>shopItems.filter(i=>!i.checked).length,[shopItems]);
  const weekDates     = useMemo(()=>getWeekDates(date),[date]);
  const taskDateSet   = useMemo(()=>new Set(filteredTasks.filter(t=>!t.isLater&&t.startTime).map(t=>t.date)),[filteredTasks]);
  const {day,month,year} = useMemo(()=>getDateInfo(date),[date]);
  const today = todayStr();

  // Drag task from あとでやる to timeline
  const startDrag=(task:Task,x:number,y:number)=>{
    setDragTask(task);
    setDragPos({x,y});
    setActiveTab(null);
  };

  useEffect(()=>{
    if(!dragTask) return;
    const calcTime=(clientY:number)=>{
      if(yToTimeRef.current) return yToTimeRef.current(clientY);
      const header=document.querySelector('header');
      const headerBottom=header?header.getBoundingClientRect().bottom:130;
      const wakeMin=toMin(settings.wakeTime);
      const rawMin=wakeMin+(clientY+window.scrollY-headerBottom-16)/PX_PER_MIN;
      const snapped=Math.round(rawMin/5)*5;
      return fromMin(Math.max(wakeMin,Math.min(toMin(settings.sleepTime),snapped)));
    };
    const TRASH_H=100;
    const isInBottomZone=(y:number)=>y>window.innerHeight-TRASH_H;
    const isInTrash=(x:number,y:number)=>isInBottomZone(y)&&x<window.innerWidth/2;
    const isInLater=(x:number,y:number)=>isInBottomZone(y)&&x>=window.innerWidth/2;
    const onMove=(e:TouchEvent)=>{
      e.preventDefault();
      const t=e.touches[0];
      setDragPos({x:t.clientX,y:t.clientY});
      setOverTrash(isInTrash(t.clientX,t.clientY));
      setOverLater(isInLater(t.clientX,t.clientY));
      if(!isInBottomZone(t.clientY)) setDropTime(calcTime(t.clientY));
    };
    const onEnd=(e:TouchEvent)=>{
      const t=e.changedTouches[0];
      if(isInTrash(t.clientX,t.clientY)){
        setTasks(prev=>prev.filter(tk=>tk.id!==dragTask.id));
      } else if(isInLater(t.clientX,t.clientY)){
        setTasks(prev=>prev.map(tk=>tk.id===dragTask.id
          ? {...tk,isLater:true,startTime:null}
          : tk
        ));
      } else {
        const time=calcTime(t.clientY);
        setTasks(prev=>prev.map(tk=>tk.id===dragTask.id
          ? dragTask.isLater ? {...tk,isLater:false,startTime:time,date} : {...tk,startTime:time}
          : tk
        ));
      }
      setDragTask(null);
      setDropTime(null);
      setOverTrash(false);
      setOverLater(false);
    };
    document.addEventListener('touchmove',onMove,{passive:false});
    document.addEventListener('touchend',onEnd);
    return ()=>{
      document.removeEventListener('touchmove',onMove);
      document.removeEventListener('touchend',onEnd);
    };
  },[dragTask,settings,date]);

  const addShopItem  = (name:string) => setShopItems(prev=>[...prev,{id:uid(),name,checked:false}]);
  const toggleShop   = (id:string)   => setShopItems(prev=>{
    const now=Date.now();
    return prev
      .map(i=>i.id===id?{...i,checked:!i.checked,purchasedAt:!i.checked?new Date().toISOString():(i.purchasedAt)}:i)
      .filter(i=>!(i.checked&&i.purchasedAt&&now-new Date(i.purchasedAt).getTime()>=7*24*60*60*1000));
  });
  const deleteShop   = (id:string)   => setShopItems(prev=>prev.filter(i=>i.id!==id));

  const openAdd  = (prefillTime?:string) => setModal({open:true,task:null,prefillTime,prefillCategory:activeCategory??'個人'});
  const openEdit = (task:Task) => {
    if(task.recurrence) { setRecConfirm(task); } else { setModal({open:true,task}); }
  };
  const openEditIconSheet=(task:Task)=>{
    if(task.recurrence){setRecConfirm(task);}else{setModal({open:true,task,iconSheet:true});}
  };
  const closeModal = () => setModal({open:false,task:null});

  const saveTasks = (data:Omit<Task,'id'>[]) => {
    if(editScope==='all'&&modal.task){
      const orig=modal.task, d=data[0];
      setTasks(prev=>prev.map(t=>
        t.name===orig.name&&t.recurrence===orig.recurrence&&t.startTime===orig.startTime
          ?{...t,name:d.name,duration:d.duration,memo:d.memo,icon:d.icon,category:d.category,tags:d.tags,notifications:d.notifications}
          :t
      ));
    } else {
      const newTasks=data.map(d=>({...d,id:uid()}));
      setTasks(prev=>modal.task
        ?prev.map(t=>t.id===modal.task!.id?{...newTasks[0],id:t.id}:t)
        :[...prev,...newTasks]
      );
    }
    setEditScope('one');
    closeModal();
  };
  const delTask  = (id:string) => setTasks(prev=>prev.filter(t=>t.id!==id));
  const toggle   = (id:string) => setTasks(prev=>prev.map(t=>t.id===id?{...t,completed:!t.completed}:t));
  const scheduleInSlot=(task:Task,startTime:string)=>setModal({open:true,task:{...task,isLater:false,startTime,date}});
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
        {/* Category filter tabs */}
        <div className="flex gap-2 px-4 pt-3 pb-1 overflow-x-auto" style={{scrollbarWidth:'none'} as React.CSSProperties}>
          <button onClick={()=>setActiveCat(null)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${!activeCategory?'bg-gray-900 text-white':'bg-gray-100 text-gray-500'}`}>
            すべて
          </button>
          {CATEGORIES.map(cat=>(
            <button key={cat} onClick={()=>setActiveCat(c=>c===cat?null:cat)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${activeCategory===cat?'bg-gray-900 text-white':'bg-gray-100 text-gray-500'}`}>
              {cat}
            </button>
          ))}
        </div>
        <div className="px-4 pt-2 pb-0">
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
              <button onClick={()=>setDate(shiftDate(date,-1))} className="w-8 h-8 flex items-center justify-center text-gray-600"><AppIcons.caretLeft/></button>
              <button onClick={()=>setDate(today)}
                className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors ${date===today?'bg-gray-900 text-white':'border border-gray-300 text-gray-600'}`}>
                今日
              </button>
              <button onClick={()=>setDate(shiftDate(date,1))} className="w-8 h-8 flex items-center justify-center text-gray-600"><AppIcons.caretRight/></button>
              <button onClick={()=>setCalOp(true)} className="w-8 h-8 flex items-center justify-center text-gray-400"><AppIcons.calendar size={20}/></button>
              <button onClick={()=>setSearchOpen(true)} className="w-8 h-8 flex items-center justify-center text-gray-400"><AppIcons.search size={20}/></button>
              <button onClick={()=>setSOp(true)} className="w-8 h-8 flex items-center justify-center text-gray-400"><AppIcons.settings size={20}/></button>
            </div>
          </div>


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
      <main className="px-3 py-4 pb-24"
        onTouchStart={e=>{mainSwX.current=e.touches[0].clientX;mainSwY.current=e.touches[0].clientY;}}
        onTouchEnd={e=>{
          if(dragTask) return;
          const dx=e.changedTouches[0].clientX-mainSwX.current;
          const dy=e.changedTouches[0].clientY-mainSwY.current;
          if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5) setDate(shiftDate(date,dx<0?1:-1));
        }}>
        <Timeline date={date} tasks={filteredTasks} later={laterTasks} settings={settings} now={now}
          onToggle={toggle} onEdit={openEdit} onEditIconSheet={openEditIconSheet} onSchedule={scheduleInSlot} onAddAtTime={openAdd}
          onDragStart={startDrag} dragTaskId={dragTask?.id} yToTimeRef={yToTimeRef} layoutYRef={layoutYRef} globalTags={globalTags}
          todayHistory={moveHistory.find(h=>h.date===date)}/>
      </main>

      {/* ── Bottom bar ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 max-w-md mx-auto bg-white border-t border-gray-100"
        onTouchStart={e=>setTouchY(e.touches[0].clientY)}
        onTouchEnd={e=>{ if(touchY-e.changedTouches[0].clientY>30) setActiveTab('later'); }}
      >
        <div className="flex">
          {([['later','あとでやる',pendingCount],['shop','買い物リスト',shopPending]] as const).map(([tab,label,cnt],i)=>(
            <button key={tab} onClick={()=>setActiveTab(t=>t===tab?null:tab)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 transition-colors ${i===0?'border-r border-gray-100':''} ${activeTab===tab?'bg-gray-50':''}`}>
              <span className={`text-sm font-semibold ${activeTab===tab?'text-gray-900':'text-gray-500'}`}>{label}</span>
              {cnt>0&&<span className="text-[11px] bg-gray-900 text-white min-w-[18px] h-[18px] rounded-full flex items-center justify-center font-bold px-1">{cnt}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ── FAB ── */}
      <div className="fixed bottom-16 right-4 z-50">
        <button onClick={()=>openAdd()}
          className="w-14 h-14 bg-gray-900 text-white rounded-full text-3xl shadow-2xl flex items-center justify-center active:bg-gray-700 leading-none">
          +
        </button>
      </div>

      {/* ── Bottom sheet ── */}
      {activeTab&&(
        <BottomTabs activeTab={activeTab} onSwitchTab={setActiveTab} onClose={()=>setActiveTab(null)}
          tasks={filteredTasks} shopItems={shopItems} pendingCount={pendingCount} shopPending={shopPending}
          onToggle={toggle} onEdit={openEdit}
          onAddShop={addShopItem} onToggleShop={toggleShop} onDeleteShop={deleteShop}
          onDragStart={startDrag}/>
      )}

      {/* あとでやる FAB */}
      {activeTab==='later'&&(
        <div className="fixed bottom-6 right-4 z-[60]">
          <button onClick={()=>{setActiveTab(null);openAdd();}}
            className="w-14 h-14 bg-gray-900 text-white rounded-full text-3xl shadow-2xl flex items-center justify-center active:bg-gray-700 leading-none">+</button>
        </div>
      )}

      {/* ── Drag overlay ── */}
      {dragTask&&(
        <div className="fixed inset-0 z-[70] pointer-events-none">
          {/* Drop time line — starts after axis area (68px) */}
          {dropTime&&!overTrash&&!overLater&&(
            <div className="absolute right-0 flex items-center gap-2"
              style={{top:`${layoutYRef.current?layoutYRef.current(toMin(dropTime)):dragPos.y}px`,left:'68px'}}>
              <div className="flex-1 h-0.5 bg-blue-400 rounded-full"/>
              <span className="bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 mr-2">{dropTime}</span>
            </div>
          )}
          {/* Floating card */}
          {!overTrash&&!overLater&&(
            <div style={{
              position:'absolute',
              left:`${Math.max(8,Math.min(dragPos.x-70,window.innerWidth-180))}px`,
              top:`${(layoutYRef.current&&dropTime?layoutYRef.current(toMin(dropTime)):dragPos.y)-60}px`,
              transform:'rotate(-3deg) scale(1.05)',
            }}>
              <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 px-4 py-3 w-44">
                <p className="text-sm font-bold text-gray-900 truncate">{dragTask.name}</p>
                <p className="text-xs text-blue-500 mt-0.5 font-semibold">{dropTime??'ドラッグして配置'}</p>
              </div>
            </div>
          )}
          {/* Bottom drop zones */}
          <div className="absolute bottom-0 left-0 right-0 h-24 flex">
            {/* Left: Delete */}
            <div className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${overTrash?'bg-red-400':'bg-red-50'}`}>
              <AppIcons.trash size={28} className={overTrash?'text-white':'text-red-400'}/>
              <span className={`text-xs font-bold ${overTrash?'text-white':'text-red-400'}`}>削除する</span>
            </div>
            {/* Right: Return to later */}
            <div className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${overLater?'bg-blue-400':'bg-blue-50'}`}>
              <AppIcons.postponed size={28} className={overLater?'text-white':'text-blue-400'}/>
              <span className={`text-xs font-bold ${overLater?'text-white':'text-blue-400'}`}>あとでやるに戻す</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Calendar ── */}
      {calendarOpen&&(
        <CalendarPage date={date} tasks={tasks} onSelect={(d)=>{setDate(d);setCalOp(false);}} onClose={()=>setCalOp(false)}/>
      )}

      {/* ── Search ── */}
      {searchOpen&&(
        <SearchPage tasks={tasks} onClose={()=>setSearchOpen(false)}
          onSelect={(t)=>{if(!t.isLater)setDate(t.date);setSearchOpen(false);}}/>
      )}

      {/* ── Task Modal ── */}
      {modal.open&&(
        <TaskModal task={modal.task} currentDate={date} prefillTime={modal.prefillTime} prefillCategory={modal.prefillCategory} openIconSheet={!!modal.iconSheet}
          onSave={saveTasks}
          onDelete={modal.task?()=>delTask(modal.task!.id):undefined}
          onClose={closeModal} globalTags={globalTags}/>
      )}

      {/* ── Settings Screen ── */}
      {settingsOpen&&(
        <SettingsScreen settings={settings} onSettings={setSettings} onClose={()=>setSOp(false)} globalTags={globalTags} onGlobalTags={setGlobalTags}/>
      )}

      {/* ── Recurrence edit confirm ── */}
      {recConfirm&&(
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-end justify-center" onClick={()=>setRecConfirm(null)}>
          <div className="bg-white w-full max-w-md rounded-t-3xl px-5 pt-6 pb-10 shadow-2xl" onClick={e=>e.stopPropagation()}>
            <p className="text-base font-bold text-gray-900 mb-1">繰り返し予定の変更</p>
            <p className="text-sm text-gray-500 mb-6">「{recConfirm.name}」をどのように変更しますか？</p>
            <div className="space-y-3">
              <button onClick={()=>{setEditScope('one');setModal({open:true,task:recConfirm});setRecConfirm(null);}}
                className="w-full py-3.5 bg-gray-100 rounded-2xl text-sm font-semibold text-gray-900">この予定のみ変更</button>
              <button onClick={()=>{setEditScope('all');setModal({open:true,task:recConfirm});setRecConfirm(null);}}
                className="w-full py-3.5 bg-gray-900 rounded-2xl text-sm font-semibold text-white">すべての予定を変更</button>
              <button onClick={()=>setRecConfirm(null)}
                className="w-full py-2.5 text-sm text-gray-400 font-semibold">キャンセル</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
