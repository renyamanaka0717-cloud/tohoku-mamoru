'use client';
// v2026-06-12
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
  photoCount?: number;
}

interface Settings { wakeTime: string; sleepTime: string; keepIncomplete?: boolean; showFreeCard?: boolean; freeCardMinMin?: number; }
interface FreeSlot  { start: string; end: string; min: number; }
interface ShopItem  { id: string; name: string; checked: boolean; purchasedAt?: string; }
interface ShopNotifSetting { id: string; days: number[]; time: string; enabled: boolean; }
interface TagDef    { name: string; color: string; }
interface MoveHistory { id: string; date: string; taskNames: string[]; }
interface CustomTab  { id: string; name: string; }

type TaskMode = 'later' | 'scheduled' | 'recurring';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: Settings = { wakeTime: '07:00', sleepTime: '23:00' };
const TASKS_KEY    = 'tl-tasks-v2';
const SETTINGS_KEY = 'tl-settings-v2';
const SHOP_KEY     = 'tl-shop-v1';
const TAGS_KEY     = 'tl-tags-v1';
const HISTORY_KEY      = 'tl-history-v1';
const CUSTOM_TABS_KEY  = 'tl-custom-tabs-v1';
const PHOTOS_KEY       = 'tl-photos-v1';
const DAY_SETTINGS_KEY = 'tl-day-settings-v1';
const MORNING_NOTIF_KEY = 'tl-morning-notif-v1';
const MORNING_SNOOZE_KEY = 'tl-morning-snooze-v1'; // stores snooze timestamp (ms)
const SHOP_NOTIF_KEY    = 'tl-shop-notif-v1';

// テーマカラー — 将来的にここを差し替えるだけで全体の色が変わる
const THEME = {
  primary:       'var(--c-primary)',
  danger:        'var(--c-danger)',
  cardBg:        'var(--c-card-bg)',
  background:    'var(--c-background)',
  border:        'var(--c-border)',
  textPrimary:   'var(--c-text-primary)',
  textSecondary: 'var(--c-text-secondary)',
} as const;

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
  return slots;
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
              <div key={i} className={`text-center text-xs font-semibold py-1 ${i===0?'text-[#D97A7A]':i===6?'text-blue-400':'text-gray-400'}`}>{n}</div>
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
                    !d?'':isSel?'bg-[#D9A3B2] text-white':isToday?'bg-gray-100 font-bold text-gray-900':'text-gray-600'
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

function CalendarPage({date,tasks,customTabs,onSelect,onClose}:{date:string;tasks:Task[];customTabs:CustomTab[];onSelect:(d:string)=>void;onClose:()=>void;}) {
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
          className="text-xs font-bold px-3 py-1.5 bg-[#D9A3B2] text-white rounded-full">今日</button>
      </div>

      {/* Category filter - file tabs */}
      <div className="bg-[#D9A3B2]">
        <div className="flex items-end px-3 pt-2" style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
          {([{key:null as string|null,label:'すべて'},...customTabs.map(t=>({key:t.id,label:t.name}))]).map(({key,label})=>{
            const active=catFilter===key;
            return (
              <button key={String(key)} onClick={()=>setCatF(key)}
                className="shrink-0 relative"
                style={active?{
                  width:'80px',padding:'7px 12px 9px',background:'white',color:'#1F1F1F',fontWeight:700,fontSize:'0.875rem',
                  border:'none',borderRadius:'14px 14px 0 0',marginBottom:'-2px',zIndex:10,
                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                }:{
                  width:'80px',padding:'5px 12px',background:'rgba(0,0,0,0.12)',color:'rgba(255,255,255,0.88)',fontWeight:600,fontSize:'0.875rem',
                  border:'none',borderRadius:'14px 14px 0 0',marginBottom:'2px',
                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                }}>{label}</button>
            );
          })}
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 px-2 pt-3 pb-1">
        {DAY_NAMES.map((n,i)=>(
          <div key={i} className={`text-center text-xs font-semibold ${i===0?'text-[#D97A7A]':i===6?'text-blue-400':'text-gray-400'}`}>{n}</div>
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
                  !d?'':isSel?'bg-[#D9A3B2] text-white':isToday?'bg-gray-100 text-gray-900':'text-gray-700'
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
      t.name.toLowerCase().includes(q)||
      (t.memo??'').toLowerCase().includes(q)||
      (t.tags??[]).some(tag=>tag.toLowerCase().includes(q))
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
            placeholder="タスク・メモ・タブを検索..."
            className="flex-1 text-sm bg-transparent outline-none text-gray-900 placeholder-gray-400"/>
          {query&&<button onClick={()=>setQuery('')} className="text-gray-400 text-lg leading-none">×</button>}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {!query?(
          <div className="py-20 text-center"><AppIcons.search size={40} className="mx-auto mb-2 text-gray-300"/><p className="text-sm text-gray-400">タスク名・メモ・タブで検索</p></div>
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
    {key:'cooking', label:'料理'},
    {key:'clean',   label:'掃除'},
    {key:'washing', label:'洗濯'},
    {key:'rest',    label:'休憩'},
    {key:'sleep',   label:'睡眠'},
    {key:'home',    label:'家'},
    {key:'paw',     label:'散歩'},
    {key:'health',  label:'健康'},
  ]},
  {label:'仕事・学習',icons:[
    {key:'work',     label:'仕事'},
    {key:'meeting',  label:'会議'},
    {key:'document', label:'書類'},
    {key:'mail',     label:'メール'},
    {key:'calendar', label:'予定'},
    {key:'study',    label:'勉強'},
    {key:'book',     label:'読書'},
    {key:'phone',    label:'電話'},
    {key:'money',    label:'お金'},
    {key:'payment',  label:'支払い'},
  ]},
  {label:'健康・医療',icons:[
    {key:'hospital', label:'病院'},
    {key:'medicine', label:'薬'},
    {key:'exercise', label:'運動'},
    {key:'running',  label:'ランニング'},
    {key:'yoga',     label:'ヨガ'},
    {key:'bicycle',  label:'自転車'},
  ]},
  {label:'その他',icons:[
    {key:'travel',   label:'移動'},
    {key:'train',    label:'電車'},
    {key:'music',    label:'音楽'},
    {key:'game',     label:'ゲーム'},
    {key:'gift',     label:'プレゼント'},
    {key:'scissors', label:'趣味'},
    {key:'camera',   label:'カメラ'},
    {key:'question', label:'その他'},
  ]},
];
const ICON_OPTIONS=ICON_CATEGORIES.flatMap(c=>c.icons);
const TASK_COLORS=[
  '',
  // 濃いめ（白文字映え）
  '#C4888E','#C47A5E','#C4A44A','#7A9E8A','#6A8FAF','#8F82B8','#A67899','#8F8880',
  // 明るめ（柔らかい雰囲気）
  '#F4A7B0','#F4AA80','#F4D47A','#A8D8B0','#90C4E0','#B8AADC','#DDB0CC','#D4C8B8',
];

function getTaskIcon(key:string){
  const m={task:AppIcons.task,shopping:AppIcons.shopping,food:AppIcons.food,
    clean:AppIcons.clean,work:AppIcons.work,travel:AppIcons.travel,
    rest:AppIcons.rest,sleep:AppIcons.sleep,calendar:AppIcons.calendar,
    question:AppIcons.question,music:AppIcons.music,book:AppIcons.book,
    exercise:AppIcons.exercise,health:AppIcons.health,phone:AppIcons.phone,
    home:AppIcons.home,study:AppIcons.study,money:AppIcons.money,
    game:AppIcons.game,camera:AppIcons.camera,
    washing:AppIcons.washing,cooking:AppIcons.cooking,paw:AppIcons.paw,
    medicine:AppIcons.medicine,hospital:AppIcons.hospital,payment:AppIcons.payment,
    document:AppIcons.document,mail:AppIcons.mail,meeting:AppIcons.meeting,
    train:AppIcons.train,gift:AppIcons.gift,scissors:AppIcons.scissors,
    running:AppIcons.running,yoga:AppIcons.yoga,bicycle:AppIcons.bicycle,
  } as Record<string,typeof AppIcons.task>;
  return m[key]??AppIcons.task;
}
function defaultIconKey(name:string):string {
  if(/料理|炊事/.test(name)) return 'cooking';
  if(/食|飯|昼|夕|朝|ご飯|食事|弁当|外食|レストラン|カフェ|ランチ|ディナー/.test(name)) return 'food';
  if(/洗濯/.test(name)) return 'washing';
  if(/掃除|片付|家事/.test(name)) return 'clean';
  if(/散歩|ペット|犬|猫/.test(name)) return 'paw';
  if(/運動|走|ジョギング|ランニング|筋トレ|ジム|スポーツ|水泳|トレーニング/.test(name)) return 'exercise';
  if(/薬|服薬/.test(name)) return 'medicine';
  if(/病院|診察|通院|クリニック|歯医者/.test(name)) return 'hospital';
  if(/会議|ミーティング|打ち合わせ|MTG/.test(name)) return 'meeting';
  if(/メール|mail/.test(name)) return 'mail';
  if(/書類|資料|レポート|申請|手続/.test(name)) return 'document';
  if(/仕事|業務|出社|退社|プレゼン|報告/.test(name)) return 'work';
  if(/買い物|ショッピング|スーパー|購入/.test(name)) return 'shopping';
  if(/支払|振込|請求|引落/.test(name)) return 'payment';
  if(/お金|給料/.test(name)) return 'money';
  if(/読書/.test(name)) return 'book';
  if(/勉強|学習|テスト|試験|宿題|課題|授業|講義/.test(name)) return 'study';
  if(/電話|通話|連絡/.test(name)) return 'phone';
  if(/音楽|歌|ピアノ|ギター/.test(name)) return 'music';
  if(/電車|バス|地下鉄/.test(name)) return 'train';
  if(/移動|車/.test(name)) return 'travel';
  if(/プレゼント|ギフト|贈り物/.test(name)) return 'gift';
  if(/ゲーム/.test(name)) return 'game';
  return 'task';
}

// ── TaskModal ─────────────────────────────────────────────────────────────────

function TaskModal({task,currentDate,prefillTime,prefillCategory,openIconSheet:initIconSheet,scrollToPhotos,onSave,onUpdate,onDelete,onClose,globalTags,customTabs}:{
  task:Task|null; currentDate:string; prefillTime?:string; prefillCategory?:string; openIconSheet?:boolean; scrollToPhotos?:boolean;
  onSave:(tasks:Omit<Task,'id'>[], pendingPhotos?:string[])=>void; onUpdate?:(data:Omit<Task,'id'>)=>void; onDelete?:()=>void; onClose:()=>void;
  globalTags:TagDef[]; customTabs:CustomTab[];
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
  const [photos,setPhotos]       = useState<string[]>([]);
  const [photoViewIdx,setPhotoViewIdx] = useState<number|null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoSectionRef = useRef<HTMLDivElement>(null);

  useEffect(()=>{
    if(!task) return;
    try{
      const store=JSON.parse(localStorage.getItem(PHOTOS_KEY)||'{}') as Record<string,string[]>;
      setPhotos(store[task.id]??[]);
    }catch{}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{
    if(!scrollToPhotos) return;
    const t=setTimeout(()=>photoSectionRef.current?.scrollIntoView({behavior:'smooth',block:'start'}),120);
    return ()=>clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const compressImage=(file:File):Promise<string>=>new Promise((resolve,reject)=>{
    const img=new Image();
    const url=URL.createObjectURL(file);
    img.onload=()=>{
      const MAX=800; let w=img.width,h=img.height;
      if(w>MAX||h>MAX){if(w>h){h=Math.round(h*MAX/w);w=MAX;}else{w=Math.round(w*MAX/h);h=MAX;}}
      const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
      canvas.getContext('2d')!.drawImage(img,0,0,w,h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg',0.7));
    };
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('load failed'));};
    img.src=url;
  });

  const addPhotos=async(files:FileList|null)=>{
    if(!files) return;
    const remaining=3-photos.length; if(remaining<=0) return;
    const compressed=await Promise.all(Array.from(files).slice(0,remaining).map(f=>compressImage(f)));
    setPhotos(prev=>{
      const next=[...prev,...compressed];
      if(task){try{const s=JSON.parse(localStorage.getItem(PHOTOS_KEY)||'{}') as Record<string,string[]>;s[task.id]=next;localStorage.setItem(PHOTOS_KEY,JSON.stringify(s));}catch{}}
      return next;
    });
  };

  const removePhoto=(idx:number)=>{
    setPhotos(prev=>{
      const next=prev.filter((_,i)=>i!==idx);
      if(task){try{const s=JSON.parse(localStorage.getItem(PHOTOS_KEY)||'{}') as Record<string,string[]>;if(next.length===0)delete s[task.id];else s[task.id]=next;localStorage.setItem(PHOTOS_KEY,JSON.stringify(s));}catch{}}
      return next;
    });
  };

  const computedEnd = (startTime&&duration>0) ? fromMin(toMin(startTime)+duration) : null;

  // ── Auto-save (edit mode only) ─────────────────────────────────────────────
  const autoSaveTimer   = useRef<ReturnType<typeof setTimeout>|null>(null);
  const savedTimer      = useRef<ReturnType<typeof setTimeout>|null>(null);
  const lastSavedRef    = useRef('');
  const pendingDataRef  = useRef<Omit<Task,'id'>|null>(null);
  const isFirstRender   = useRef(true);
  const [saveStatus, setSaveStatus] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [saveFading, setSaveFading] = useState(false);

  const buildData = (): Omit<Task,'id'> => ({
    name:name.trim(), startTime:mode==='later'?null:(startTime||null), duration, memo, icon,
    color:color||undefined, completed:task?.completed??false,
    date:mode==='scheduled'?taskDate:(task?.date??currentDate),
    isLater:mode==='later', recurrence:mode==='recurring'?recur:null,
    customRec:mode==='recurring'&&recur==='custom'?customRec:undefined,
    notifications:mode!=='later'?notifications:undefined,
    incompleteReminder:mode!=='later'?incompleteRem:false,
    category:category??undefined, pinned, tags,
    subtasks:subtasks.length>0?subtasks:undefined,
    photoCount:photos.length>0?photos.length:undefined,
  });

  const doSave = (data: Omit<Task,'id'>) => {
    if(!onUpdate) return;
    const str = JSON.stringify(data);
    if(str===lastSavedRef.current){setSaveStatus('idle');return;}
    lastSavedRef.current = str;
    try {
      onUpdate(data);
      setSaveStatus('saved'); setSaveFading(false);
      if(savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(()=>{
        setSaveFading(true);
        savedTimer.current = setTimeout(()=>{setSaveStatus('idle');setSaveFading(false);},300);
      },1000);
    } catch { setSaveStatus('error'); }
  };

  useEffect(()=>{
    if(!task||!onUpdate) return;
    pendingDataRef.current = buildData();
    if(isFirstRender.current){isFirstRender.current=false;return;}
    if(autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setSaveStatus('saving');
    autoSaveTimer.current = setTimeout(()=>{
      if(pendingDataRef.current) doSave(pendingDataRef.current);
    },400);
    return ()=>{if(autoSaveTimer.current) clearTimeout(autoSaveTimer.current);};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[name,taskDate,startTime,duration,mode,recur,customRec,tags,subtasks,memo,category,notifications,incompleteRem,photos,icon,color]);

  const flushAndClose = () => {
    if(autoSaveTimer.current){
      clearTimeout(autoSaveTimer.current); autoSaveTimer.current=null;
      if(pendingDataRef.current){
        const str=JSON.stringify(pendingDataRef.current);
        if(str!==lastSavedRef.current&&onUpdate){onUpdate(pendingDataRef.current);lastSavedRef.current=str;}
      }
    }
    onClose();
  };
  // ──────────────────────────────────────────────────────────────────────────

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
      photoCount:photos.length>0?photos.length:undefined,
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
      onSave(instances, photos.length>0?photos:undefined);
    } else {
      onSave([base], photos.length>0?photos:undefined);
    }
  };

  const [showDiscard,setShowDiscard] = useState(false);
  const hasChanges =
    name!==(task?.name??'') ||
    duration!==(task?.duration??0) ||
    memo!==(task?.memo??'') ||
    tags.length!==(task?.tags??[]).length ||
    tags.some((t,i)=>t!==(task?.tags??[])[i]) ||
    subtasks.length!==(task?.subtasks??[]).length;

  const handleClose=()=>{
    if(task){flushAndClose();}
    else if(hasChanges){setShowDiscard(true);}
    else{onClose();}
  };

  const headerBg=(()=>{
    const hex=color||'#D9A3B2';
    const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
    return `rgb(${Math.round(r*0.82)},${Math.round(g*0.82)},${Math.round(b*0.82)})`;
  })();

  return (
    <div className="fixed inset-0 z-50 bg-black/60" onClick={handleClose}>
      <div className="absolute bottom-0 left-0 right-0 max-w-md mx-auto" onClick={e=>e.stopPropagation()}>
        {/* ── Dark header ── */}
        <div className="rounded-t-3xl px-4 pt-4" style={{background:headerBg}}>
          {/* Buttons row */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={handleClose} className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-white">×</button>
            <div className="flex items-center gap-3">
              {task ? (
                <>
                  {saveStatus!=='idle'&&(
                    <span style={{transition:'opacity 0.3s',opacity:saveFading?0:1}}
                      className={`text-xs ${saveStatus==='error'?'text-[#D97A7A]':saveStatus==='saved'?'text-white/80':'text-white/50'}`}>
                      {saveStatus==='saving'?'保存中…':saveStatus==='saved'?'✓ 保存済み':'保存に失敗しました'}
                    </span>
                  )}
                  <button onClick={flushAndClose}
                    className="px-4 py-1.5 text-sm font-semibold rounded-full bg-white/90 text-gray-800">完了</button>
                </>
              ) : (
                <button onClick={save} disabled={!name.trim()}
                  className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${name.trim()?'bg-white/90 text-gray-800':'bg-white/20 text-white/40 cursor-not-allowed'}`}>保存</button>
              )}
            </div>
          </div>

          {/* Icon + name */}
          <div className="flex items-center gap-3 mb-4">
            <button onClick={()=>setIconSheetOpen(true)}
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-white bg-white/20 active:bg-white/30 transition-colors"
              style={color?{background:color}:{}}>
              {(()=>{const Ic=getTaskIcon(icon);return <Ic size={24} className={color?'text-white':'text-white'}/>;})()}
            </button>
            <div className="flex-1 min-w-0">
              {(mode==='scheduled'||mode==='recurring')&&startTime&&(
                <p className="text-xs text-white/60 mb-0.5">{startTime}{computedEnd?`〜${computedEnd}`:''}{mode==='recurring'&&' · 繰り返し'}</p>
              )}
              <input type="text" value={name} onChange={e=>setName(e.target.value)}
                placeholder="タスク名を入力..."
                className="w-full bg-transparent text-white text-lg font-medium placeholder-white/40 outline-none border-b border-white/30 pb-1"
                autoFocus/>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex bg-white/20 rounded-xl p-1 mb-3">
            {([['later','あとで'],['scheduled','時間指定'],['recurring','繰り返し']] as [TaskMode,string][]).map(([m,l])=>(
              <button key={m} onClick={()=>setMode(m)}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${mode===m?'bg-white/90 text-gray-800':'text-white/70'}`}>
                {l}
              </button>
            ))}
          </div>

          {/* Category file tabs */}
          <div className="tabs-scroll flex items-end" style={{overflowX:'auto',WebkitOverflowScrolling:'touch',touchAction:'pan-x',marginLeft:'-16px',marginRight:'-16px',paddingLeft:'16px'}}>
            {([{id:null as string|null,name:'すべて'},...customTabs]).map(tab=>{
              const active=category===tab.id;
              return (
                <button key={tab.id??'all'} onClick={()=>setCategory(tab.id)}
                  style={active?{
                    width:'76px',padding:'6px 10px 8px',background:'#F9FAFB',color:'#374151',fontWeight:700,fontSize:'0.8125rem',
                    border:'none',borderRadius:'12px 12px 0 0',marginBottom:'-2px',flexShrink:0,
                    overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                  }:{
                    width:'76px',padding:'4px 10px 6px',background:'rgba(255,255,255,0.2)',color:'rgba(255,255,255,0.8)',fontWeight:600,fontSize:'0.8125rem',
                    border:'none',borderRadius:'12px 12px 0 0',marginBottom:'2px',flexShrink:0,
                    overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                  }}>{tab.name}</button>
              );
            })}
          </div>
        </div>

        {/* ── White content ── */}
        <div className="bg-gray-50 max-h-[55vh] overflow-y-auto">
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
                      className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold ${recur===r?'bg-[#D9A3B2] text-white':'bg-gray-100 text-gray-600'}`}>
                      {['毎日','毎週','毎月','毎年','カスタム'][i]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom 3-block UI */}
              {recur==='custom'&&(
                <>
                  {/* Summary */}
                  <div className="mx-3 mt-3 bg-[#D9A3B2] rounded-2xl px-4 py-3">
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
                          className={`flex-1 py-2.5 rounded-full text-sm font-semibold ${customRec.frequency===u?'bg-[#D9A3B2] text-white':'bg-gray-100 text-gray-600'}`}>
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
                              className={`flex-1 h-10 rounded-full text-sm font-semibold ${(customRec.weekdays??[]).includes(i)?'bg-[#D9A3B2] text-white':'bg-gray-100 text-gray-600'}`}>
                              {n}
                            </button>
                          ))}
                        </div>
                      )}

                      {customRec.frequency==='month'&&(
                        <>
                          <div className="flex gap-2 mb-4">
                            <button onClick={()=>setCR('monthlyType','date')}
                              className={`flex-1 py-2 rounded-full text-sm font-semibold ${customRec.monthlyType!=='weekday'?'bg-[#D9A3B2] text-white':'bg-gray-100 text-gray-600'}`}>
                              日付で指定
                            </button>
                            <button onClick={()=>setCR('monthlyType','weekday')}
                              className={`flex-1 py-2 rounded-full text-sm font-semibold ${customRec.monthlyType==='weekday'?'bg-[#D9A3B2] text-white':'bg-gray-100 text-gray-600'}`}>
                              曜日で指定
                            </button>
                          </div>
                          {customRec.monthlyType!=='weekday'?(
                            <div className="flex gap-2 overflow-x-auto pb-0.5" style={{scrollbarWidth:'none'} as React.CSSProperties}>
                              {([1,5,10,15,20,25,'last' as const]).map(d=>(
                                <button key={String(d)} onClick={()=>setCR('dayOfMonth',d)}
                                  className={`shrink-0 px-3 py-2 rounded-full text-sm font-semibold ${customRec.dayOfMonth===d?'bg-[#D9A3B2] text-white':'bg-gray-100 text-gray-600'}`}>
                                  {d==='last'?'月末':`${d}日`}
                                </button>
                              ))}
                            </div>
                          ):(
                            <div className="space-y-3">
                              <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{scrollbarWidth:'none'} as React.CSSProperties}>
                                {([1,2,3,4,'last' as const]).map(wn=>(
                                  <button key={String(wn)} onClick={()=>setCR('weekNumber',wn)}
                                    className={`shrink-0 flex-1 py-2 rounded-full text-sm font-semibold min-w-[3rem] ${customRec.weekNumber===wn?'bg-[#D9A3B2] text-white':'bg-gray-100 text-gray-600'}`}>
                                    {wn==='last'?'最終':`第${wn}`}
                                  </button>
                                ))}
                              </div>
                              <div className="flex gap-1.5">
                                {DAY_NAMES.map((n,i)=>(
                                  <button key={i} onClick={()=>setCR('weekday',i)}
                                    className={`flex-1 h-9 rounded-full text-sm font-semibold ${customRec.weekday===i?'bg-[#D9A3B2] text-white':'bg-gray-100 text-gray-600'}`}>
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
                                  className={`shrink-0 w-12 h-10 rounded-full text-sm font-semibold ${customRec.yearMonth===i+1?'bg-[#D9A3B2] text-white':'bg-gray-100 text-gray-600'}`}>
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
                                  className={`shrink-0 px-3 py-2 rounded-full text-sm font-semibold ${customRec.yearDay===d?'bg-[#D9A3B2] text-white':'bg-gray-100 text-gray-600'}`}>
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
                          className={`flex-1 py-2 rounded-full text-xs font-semibold ${customRec.endType===t?'bg-[#D9A3B2] text-white':'bg-gray-100 text-gray-600'}`}>
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
                        <div key={i} className={`text-center text-[11px] font-semibold py-1 ${i===0?'text-[#D97A7A]':i===6?'text-blue-400':'text-gray-400'}`}>{n}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7">
                      {calDays.map((d,i)=>{
                        const isSel=d===taskDate, isToday=d===todayStr();
                        return (
                          <button key={i} disabled={!d} onClick={()=>{if(d){setTaskDate(d);setDateOpen(false);}}} className="flex items-center justify-center py-1">
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${!d?'':isSel?'bg-[#D9A3B2] text-white':isToday?'bg-gray-100 font-bold text-gray-900':'text-gray-600'}`}>
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
                      className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold ${duration===v&&!custDurOpen?'bg-[#D9A3B2] text-white':'bg-gray-100 text-gray-600'}`}>
                      {l}
                    </button>
                  ))}
                  <button onClick={()=>setCDurOpen(o=>!o)}
                    className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold ${custDurOpen?'bg-[#D9A3B2] text-white':'bg-gray-100 text-gray-600'}`}>
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
                      className="px-4 py-2 bg-[#D9A3B2] text-white rounded-xl text-sm font-semibold">設定</button>
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
                          className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold ${notifications.includes(v)?'bg-[#D9A3B2] text-white':'bg-gray-100 text-gray-600'}`}>
                          {l}
                        </button>
                      ))}
                      <button onClick={()=>setCNOpen(o=>!o)}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold ${custNotifOpen?'bg-[#D9A3B2] text-white':'bg-gray-100 text-gray-600'}`}>
                        カスタム
                      </button>
                    </div>
                    {custNotifOpen&&(
                      <div className="flex items-center gap-2 mb-2">
                        <input type="number" value={custNotifMin} min={1}
                          onChange={e=>setCNMin(Math.max(1,Number(e.target.value)))}
                          className="w-20 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none text-center"/>
                        <span className="text-sm text-gray-600">分前</span>
                        <button onClick={addCustNotif} className="px-3 py-2 bg-[#D9A3B2] text-white rounded-xl text-sm font-semibold">追加</button>
                      </div>
                    )}
                    {notifications.filter(v=>!NOTIF_OPTS.find(o=>o.v===v)).length>0&&(
                      <div className="flex flex-wrap gap-2 mb-2">
                        {notifications.filter(v=>!NOTIF_OPTS.find(o=>o.v===v)).map(v=>(
                          <span key={v} className="inline-flex items-center gap-1 bg-[#D9A3B2] text-white text-xs font-semibold px-2.5 py-1.5 rounded-full">
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
                        className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${incompleteRem?'bg-[#D9A3B2]':'bg-gray-200'}`}>
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
                          className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${active?'ring-2 ring-[#D9A3B2] ring-offset-1':''}`}>
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
                  className={`text-sm font-semibold shrink-0 px-3 py-1.5 rounded-lg transition-colors ${subtaskInput.trim()?'bg-gray-700 text-white active:bg-[#6a9677]':'bg-gray-100 text-gray-300'}`}>
                  追加
                </button>
              </div>
              {subtasks.length>0&&(
                <div className="mt-2 space-y-1">
                  {subtasks.map((st,i)=>(
                    <div key={st.id} className="flex items-center gap-2 pl-7">
                      <button onClick={()=>setSubtasks(prev=>prev.map((s,j)=>j===i?{...s,completed:!s.completed}:s))}
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${st.completed?'bg-[#D9A3B2] border-[#D9A3B2]':'border-gray-300'}`}>
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

          {/* Photos */}
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e=>{addPhotos(e.target.files);if(fileInputRef.current)fileInputRef.current.value='';}}/>
          <div ref={photoSectionRef} className="bg-white mx-3 mt-3 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AppIcons.camera size={16} className="text-gray-400"/>
                <span className="text-sm font-medium text-gray-700">写真</span>
              </div>
              {photos.length>0&&photos.length<3&&(
                <button onClick={()=>fileInputRef.current?.click()}
                  className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full active:bg-gray-200">追加</button>
              )}
            </div>
            {photos.length>0?(
              <div className="flex gap-2 flex-wrap">
                {photos.map((src,i)=>(
                  <div key={i} className="relative">
                    <img src={src} alt="" className="w-20 h-20 rounded-xl object-cover cursor-pointer"
                      onClick={()=>setPhotoViewIdx(i)}/>
                    <button onClick={e=>{e.stopPropagation();removePhoto(i);}}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#D97A7A] rounded-full text-white text-[10px] flex items-center justify-center leading-none">×</button>
                  </div>
                ))}
              </div>
            ):(
              <button onClick={()=>fileInputRef.current?.click()}
                className="w-full text-sm text-gray-400 text-center py-4 border border-dashed border-gray-200 rounded-xl active:bg-gray-50">
                タップして追加（最大3枚）
              </button>
            )}
          </div>

          {/* Delete */}
          {task&&onDelete&&(
            <button onClick={()=>{onDelete();onClose();}}
              className="w-full mt-3 mb-2 py-3 text-sm text-[#D97A7A] font-medium">
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
              <div className="flex items-center gap-2">
                <button onClick={()=>setIconSheetOpen(false)} className="px-4 py-1.5 bg-gray-700 text-white text-sm font-semibold rounded-full">保存</button>
              </div>
            </div>
            <div className="overflow-y-auto px-5 pb-10 flex-1">
              {/* Color */}
              <p className="text-xs font-bold text-gray-400 mb-2 mt-1">カラー</p>
              <div className="tabs-scroll flex gap-2 mb-4"
                style={{overflowX:'auto',WebkitOverflowScrolling:'touch',overflowY:'visible',touchAction:'pan-x',paddingTop:'5px',paddingBottom:'5px',marginLeft:'-20px',marginRight:'-20px',paddingLeft:'20px',paddingRight:'20px'}}>
                {TASK_COLORS.map((c,i)=>(
                  <button key={i} onClick={()=>setColor(c)}
                    className={`shrink-0 w-8 h-8 rounded-full border-2 transition-all ${color===c?'border-gray-800 scale-110':'border-gray-100'}`}
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
                          className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl ${sel?'':'bg-gray-50'}`}
                          style={sel?{background:color||'#D9A3B2'}:undefined}>
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
                          className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl ${sel?'':'bg-gray-50'}`}
                          style={sel?{background:color||'#D9A3B2'}:undefined}>
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
      {showDiscard&&(
        <div className="absolute inset-0 z-[110] flex items-center justify-center px-6" onClick={e=>e.stopPropagation()}>
          <div className="bg-white rounded-2xl p-5 shadow-xl w-full max-w-xs">
            <h3 className="text-base font-bold text-gray-900 mb-1">入力内容を破棄しますか？</h3>
            <p className="text-sm text-gray-500 mb-5">保存していない内容は失われます。</p>
            <div className="flex gap-3">
              <button onClick={()=>setShowDiscard(false)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-900 rounded-xl text-sm font-semibold">キャンセル</button>
              <button onClick={()=>{setShowDiscard(false);onClose();}}
                className="flex-1 py-2.5 bg-[#D97A7A] text-white rounded-xl text-sm font-semibold">破棄する</button>
            </div>
          </div>
        </div>
      )}
      {photoViewIdx!==null&&(
        <div className="fixed inset-0 z-[120] bg-black/90 flex items-center justify-center"
          onClick={()=>setPhotoViewIdx(null)}>
          <img src={photos[photoViewIdx]} alt="" className="max-w-full max-h-full object-contain p-4"/>
          <button className="absolute top-4 right-4 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white text-xl leading-none">×</button>
        </div>
      )}
    </div>
  );
}

// ── TaskCard ──────────────────────────────────────────────────────────────────

function TaskCard({task,onToggle,onEdit,globalTags,onSubtaskToggle,onCameraClick}:{task:Task;onToggle:()=>void;onEdit:()=>void;globalTags:TagDef[];onSubtaskToggle?:(subtaskId:string)=>void;onCameraClick?:()=>void;}) {
  const [openPanel,setOpenPanel] = useState<'subtask'|'memo'|null>(null);
  const endTime = (task.startTime&&(task.duration??0)>0) ? fromMin(toMin(task.startTime)+(task.duration??0)) : null;
  const subtasks = task.subtasks??[];
  const doneCount = subtasks.filter(s=>s.completed).length;
  const hasIcons = subtasks.length>0||!!task.memo||(task.photoCount??0)>0;
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 px-3 py-2.5 ${task.completed?'opacity-50':''}`} style={{boxShadow:'0 4px 12px rgba(0,0,0,0.06)'}}
      onClick={onEdit}>
      <div className="flex items-center gap-2.5">
        <div className="flex-1 min-w-0">
          {task.startTime&&(
            <p className="text-[11px] text-gray-400 leading-none mb-0.5">
              {task.startTime}{endTime?`〜${endTime}`:''}
              {task.recurrence&&<AppIcons.repeat size={11} className="ml-1 inline-block align-middle"/>}
            </p>
          )}
          <p className={`text-[15px] font-semibold leading-snug ${task.completed?'line-through text-gray-400':'text-gray-900'}`}>{task.name}</p>
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
          {hasIcons&&(
            <div className="flex items-center gap-2 mt-2">
              {subtasks.length>0&&(
                <button onClick={e=>{e.stopPropagation();setOpenPanel(p=>p==='subtask'?null:'subtask');}}
                  className="inline-flex items-center gap-2 bg-gray-100 rounded-2xl px-3 active:bg-gray-200"
                  style={{height:'32px'}}>
                  <AppIcons.checkSquare size={13} className="text-gray-500"/>
                  <span className="text-xs font-semibold text-gray-600">{doneCount}/{subtasks.length}</span>
                  <span style={openPanel==='subtask'?{transform:'rotate(90deg)',transition:'transform 0.15s',display:'inline-flex'}:{transition:'transform 0.15s',display:'inline-flex'}}><AppIcons.caretRight size={12} className="text-gray-400"/></span>
                </button>
              )}
              {task.memo&&(
                <button onClick={e=>{e.stopPropagation();setOpenPanel(p=>p==='memo'?null:'memo');}}
                  className={`inline-flex items-center justify-center bg-gray-100 rounded-xl active:bg-gray-200 ${openPanel==='memo'?'ring-1 ring-gray-300':''}`}
                  style={{width:'32px',height:'32px'}}>
                  <AppIcons.task size={14} className="text-gray-500"/>
                </button>
              )}
              {(task.photoCount??0)>0&&(
                <button onClick={e=>{e.stopPropagation();onCameraClick?.();}}
                  className="inline-flex items-center justify-center bg-gray-100 rounded-xl active:bg-gray-200"
                  style={{width:'32px',height:'32px'}}>
                  <AppIcons.camera size={14} className="text-gray-500"/>
                </button>
              )}
            </div>
          )}
        </div>
        <button onClick={e=>{e.stopPropagation();onToggle();}}
          className={`w-6 h-6 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${task.completed?'border-[#D9A3B2] bg-[#D9A3B2]':'border-gray-300'}`}>
          {task.completed&&<span className="text-white text-[10px] font-bold leading-none">✓</span>}
        </button>
      </div>
      {openPanel==='subtask'&&subtasks.length>0&&(
        <div className="mt-2 space-y-1.5 pb-0.5" onClick={e=>e.stopPropagation()}>
          {subtasks.map(st=>(
            <div key={st.id} className="flex items-center gap-2">
              <button onClick={e=>{e.stopPropagation();onSubtaskToggle?.(st.id);}}
                className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${st.completed?'bg-[#D9A3B2] border-[#D9A3B2]':'border-gray-300'}`}>
                {st.completed&&<span className="text-white text-[8px] font-bold leading-none">✓</span>}
              </button>
              <span className={`text-xs ${st.completed?'line-through text-gray-400':'text-gray-700'}`}>{st.name}</span>
            </div>
          ))}
        </div>
      )}
      {openPanel==='memo'&&task.memo&&(
        <div className="mt-2 pb-0.5 text-xs text-gray-600 leading-relaxed whitespace-pre-wrap" onClick={e=>e.stopPropagation()}>
          {task.memo}
        </div>
      )}
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
    <div className="bg-gray-50 rounded-2xl px-4 pt-3 pb-3 flex flex-col border border-gray-100" style={{minHeight:`${height}px`}}>
      <div className="flex items-center gap-1 mb-1">
        <AppIcons.freeTime size={12} className="text-gray-400"/>
        <span className="text-xs text-gray-400 font-medium">空き時間 {slot.start}〜{slot.end}</span>
      </div>
      <p className="font-medium text-gray-600 leading-none">
        {h>0&&<><span className="text-lg">{h}</span><span className="text-xs ml-0.5">時間</span></>}
        {m>0&&<><span className="text-lg ml-1">{m}</span><span className="text-xs ml-0.5">分</span></>}
      </p>
      {fits.length>0&&(
        <div className="flex flex-wrap gap-1.5 mt-2">
          {fits.map(t=>(
            <button key={t.id}
              onClick={()=>onSchedule(t,slot.start)}
              onTouchStart={e=>startLP(t,e)}
              onTouchEnd={cancelLP}
              onTouchMove={cancelLP}
              className={`inline-flex items-center bg-gray-100 rounded-full px-2.5 py-1 text-xs font-medium text-gray-500 select-none transition-transform${pressingId===t.id?' scale-95':''}`}>
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
          className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors${task.completed?' border-[#D9A3B2] bg-[#D9A3B2]':' border-gray-300'}`}>
          {task.completed&&<span className="text-white text-[8px] font-bold leading-none">✓</span>}
        </button>
      </div>
      <p className={`text-[10px] font-semibold leading-tight mt-1${task.completed?' line-through text-gray-400':' text-gray-800'}`}
        style={{display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'} as React.CSSProperties}>
        {task.name}
      </p>
      {(task.photoCount??0)>0&&<AppIcons.camera size={10} className="text-gray-400 mt-0.5"/>}
    </div>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────────

function Timeline({date,tasks,later,settings,now,onToggle,onEdit,onEditIconSheet,onSchedule,onAddAtTime,onDragStart,dragTaskId,yToTimeRef,layoutYRef,globalTags,todayHistory,onSubtaskToggle,onDragWake,onDragSleep,onCameraClick}:{
  date:string;tasks:Task[];later:Task[];settings:Settings;now:string;
  onToggle:(id:string)=>void;onEdit:(t:Task)=>void;onEditIconSheet:(t:Task)=>void;
  onSchedule:(t:Task,time:string)=>void;onAddAtTime:(time:string)=>void;
  onDragStart:(t:Task,x:number,y:number)=>void;dragTaskId?:string;
  yToTimeRef:React.MutableRefObject<((clientY:number)=>string)|null>;
  layoutYRef:React.MutableRefObject<((min:number)=>number)|null>;
  globalTags:TagDef[];
  todayHistory?:{taskNames:string[]};
  onSubtaskToggle:(taskId:string,subtaskId:string)=>void;
  onDragWake:(x:number,y:number)=>void;
  onDragSleep:(x:number,y:number)=>void;
  onCameraClick:(taskId:string)=>void;
}) {
  const [pressingId,setPressingId] = useState<string|null>(null);
  const [pressingWake,setPressingWake] = useState(false);
  const [pressingSleep,setPressingSleep] = useState(false);
  const [historyOpen,setHistoryOpen] = useState(false);
  const [measuredH,setMeasuredH] = useState<Record<string,number>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const roRef = useRef<ResizeObserver|null>(null);
  if (roRef.current===null) {
    roRef.current = new ResizeObserver(entries=>{
      setMeasuredH(prev=>{
        const next={...prev}; let changed=false;
        for(const e of entries){
          const k=(e.target as HTMLElement).dataset.gk; if(!k) continue;
          const h=Math.ceil(e.borderBoxSize?.[0]?.blockSize??e.contentRect.height);
          if(next[k]!==h){next[k]=h;changed=true;}
        }
        return changed?next:prev;
      });
    });
  }
  useEffect(()=>()=>{roRef.current?.disconnect();},[]);
  const lpTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const settingLPTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
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
  const startSettingLP=(type:'wake'|'sleep',e:React.TouchEvent)=>{
    const touch=e.touches[0];
    if(type==='wake') setPressingWake(true); else setPressingSleep(true);
    settingLPTimer.current=setTimeout(()=>{
      navigator.vibrate?.(40);
      if(type==='wake'){setPressingWake(false);onDragWake(touch.clientX,touch.clientY);}
      else{setPressingSleep(false);onDragSleep(touch.clientX,touch.clientY);}
    },500);
  };
  const cancelSettingLP=()=>{
    if(settingLPTimer.current){clearTimeout(settingLPTimer.current);settingLPTimer.current=null;}
    setPressingWake(false);setPressingSleep(false);
  };
  const wakeMin=toMin(settings.wakeTime),sleepMin=toMin(settings.sleepTime);
  const nowMin=toMin(now);

  const dayTasks=tasks.filter(t=>t.date===date&&!t.isLater&&t.startTime).sort((a,b)=>toMin(a.startTime!)-toMin(b.startTime!));
  const freeCardMinMin=settings.freeCardMinMin??120;
  const freeSlots=(settings.showFreeCard===false)?[]:calcFreeSlots(tasks,date,settings).filter(sl=>sl.min>=freeCardMinMin);
  const laterPool=later.filter(t=>!t.completed);

  const MIN_CARD_H = 60;
  const WAKE_CARD_H=52, SLEEP_CARD_H=52;
  const DUP_LABEL_H=24;
  const COLS=5, ROW_GAP=6;

  const groupStackH=(g:{tasks:Task[];h:number;startTime:string}):number=>{
    if(g.tasks.length===1) return Math.max(measuredH[g.startTime]??g.h,56);
    const CAPSULE_H=56,GAP=16;
    const heights=g.tasks.map(t=>Math.max(measuredH[t.id]??MIN_CARD_H,CAPSULE_H));
    return heights.reduce((a,h)=>a+h,0)+(g.tasks.length-1)*GAP;
  };
  const groupIconTop=(g:{tasks:Task[]}):number=>g.tasks.length>1?DUP_LABEL_H:0;

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
        ?Math.max(measuredH[startTime]??MIN_CARD_H,(tasks[0].duration??0)*PX_PER_MIN)
        :tasks.reduce((sum,t)=>sum+Math.max(measuredH[t.id]??MIN_CARD_H,56),0)+(tasks.length-1)*16+DUP_LABEL_H;
      return {startTime,tasks,rows,h};
    });

  // Simulate chip wrapping to get accurate content height.
  // CARD_LEFT=108, p-4*2=32 → inner width = screenWidth - 140
  const calcFreeContentH=(tasks:Task[]):number=>{
    const PAD=12;    // py-3 (top and bottom)
    const ICON_H=16; // header row height
    const ICON_MB=4; // mb-1 after header
    const DUR_H=28;  // duration text (text-xl, leading-none)
    const CHIP_MT=8; // mt-2 before chips section
    const CHIP_H=24; const ROW_GAP=6; const GAP_X=6;
    const base=PAD*2+ICON_H+ICON_MB+DUR_H; // 72px — no mb on duration, no chips div
    if(tasks.length===0) return base;
    const innerW=(typeof window!=='undefined'?window.innerWidth:375)-108-32;
    // 全角文字（日本語）は半角の倍近い幅になるため、文字種で重みを変える
    const textW=(s:string)=>{
      let w=0;
      for(const ch of s) w+=/[　-鿿＀-￯]/.test(ch)?14:7;
      return w;
    };
    let rows=1,rowW=0;
    for(const t of tasks){
      const w=20+textW(t.name);
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
    prevBottom=top+(g.tasks.length>1?MIN_CARD_H:g.h);
  }

  // Wake card: right after pre-wake items (no clock-time gap)
  const wakeCardTop=prevBottom+16;
  prevBottom=wakeCardTop+WAKE_CARD_H;

  // Phase 1: daytime tasks + free slots, fully compacted in chronological
  // order — each card sits exactly CARD_GAP_MIN below the previous one,
  // regardless of the real clock-time gap between them. Wake/sleep join the
  // same compacted sequence. Each item's (realMinute, compactedTop) is
  // recorded as an anchor; current-time and drag interpolate between
  // anchors so they stay visually consistent with the compacted cards.
  const CARD_GAP_MIN=16;
  type DayItem=
    |{kind:'task';g:TaskGroupData;startMin:number;h:number}
    |{kind:'free';slot:FreeSlot;startMin:number;h:number};
  const dayItems:DayItem[]=[
    ...taskGroupList
      .filter(g=>toMin(g.startTime)>=wakeMin&&toMin(g.startTime)<sleepMin)
      .map(g=>({kind:'task' as const,g,startMin:toMin(g.startTime),h:g.h})),
    ...freeSlots.map(s=>({kind:'free' as const,slot:s,startMin:toMin(s.start),
      h:measuredH[`free-${s.start}`]??calcFreeContentH(laterPool)})),
  ].sort((a,b)=>a.startMin-b.startMin);

  type Anchor={min:number;y:number};
  const anchors:Anchor[]=[{min:wakeMin,y:wakeCardTop+WAKE_CARD_H}];

  let dayPrevBottom=wakeCardTop+WAKE_CARD_H;
  for(const item of dayItems){
    const top=dayPrevBottom+CARD_GAP_MIN;
    if(item.kind==='task') groupLayout.push({g:item.g,top});
    else freePassItems.push({slot:item.slot,freeY:top,finalH:item.h});
    anchors.push({min:item.startMin,y:top});
    dayPrevBottom=top+item.h;
  }

  const freeLayout:{slot:FreeSlot;freeY:number;finalH:number}[]=freePassItems;

  // Sleep card: right after the last daytime card, fully compacted
  const sleepCardTop=dayPrevBottom+CARD_GAP_MIN;
  anchors.push({min:sleepMin,y:sleepCardTop});

  // Phase 2: post-sleep tasks — compact (card order, no time gap)
  prevBottom=sleepCardTop+SLEEP_CARD_H;
  for(const g of taskGroupList.filter(g=>toMin(g.startTime)>=sleepMin)){
    const top=prevBottom+16;
    groupLayout.push({g,top});
    prevBottom=top+(g.tasks.length>1?MIN_CARD_H:g.h);
  }

  const hasHistoryCard=!!(todayHistory&&todayHistory.taskNames.length>0)&&date===todayStr();
  const HISTORY_CARD_H=44;

  const completedToday=tasks.filter(t=>t.completed&&t.date===date&&!t.isLater&&t.startTime);
  const showCompletedSection=date===todayStr()&&completedToday.length>0;
  const COMPLETED_SECTION_H=52+(completedToday.length>0?completedToday.length*36:40);
  const historyBottom=sleepCardTop+SLEEP_CARD_H+(hasHistoryCard?HISTORY_CARD_H+12:0);
  const completedSectionTop=historyBottom+16;
  const totalHeight=Math.max(prevBottom,historyBottom+(showCompletedSection?COMPLETED_SECTION_H+16:0))+32;

  // Piecewise time→Y: linear interpolation between the compacted anchors,
  // so current-time / drag stay visually aligned with the compacted cards.
  const layoutCalcY=(min:number):number=>{
    if(min<=anchors[0].min) return anchors[0].y;
    for(let i=0;i<anchors.length-1;i++){
      const a=anchors[i],b=anchors[i+1];
      if(min>=a.min&&min<=b.min){
        if(b.min===a.min) return a.y;
        return a.y+(min-a.min)/(b.min-a.min)*(b.y-a.y);
      }
    }
    return anchors[anchors.length-1].y;
  };

  // Layout zones: [time label area] [gap] [icon area centered on axis] [gap] [card area → right:0]
  const TIME_LABEL_W = 40;  // px — fits "HH:MM" at text-xs
  const AXIS_GAP     = 12;  // px — between label area and icon
  const ICON_HALF    = 28;  // px — half of 56px icon capsule
  const CARD_GAP     = 8;   // px — between icon right edge and card left

  const AXIS_X    = TIME_LABEL_W + AXIS_GAP + ICON_HALF;  // 72
  const CARD_LEFT = AXIS_X + ICON_HALF + CARD_GAP;         // 108

  // Y座標→時刻の逆引き（アンカー区分線形補間の逆関数）
  yToTimeRef.current=(clientY:number):string=>{
    const el=containerRef.current;
    const baseY=el?(el.getBoundingClientRect().top+window.scrollY):0;
    const timelineY=clientY+window.scrollY-baseY;
    let min=anchors[0].min;
    if(timelineY>anchors[0].y){
      min=anchors[anchors.length-1].min;
      for(let i=0;i<anchors.length-1;i++){
        const a=anchors[i],b=anchors[i+1];
        if(timelineY>=a.y&&timelineY<=b.y){
          min=b.y===a.y?a.min:a.min+(timelineY-a.y)/(b.y-a.y)*(b.min-a.min);
          break;
        }
      }
    }
    const snapped=Math.round(min/5)*5;
    return fromMin(Math.max(0,Math.min(23*60+55,snapped)));
  };

  // 時刻→スクリーンY（アンカー補間ベース、ドラッグオーバーレイ用）
  layoutYRef.current=(min:number):number=>{
    const el=containerRef.current;
    if(!el) return 0;
    return el.getBoundingClientRect().top+layoutCalcY(min);
  };

  return (
    <div ref={containerRef} className="relative" style={{height:`${totalHeight+32}px`,minHeight:'400px'}}>
      {/* vertical line — gradient between adjacent icon colors, dotted over free-time slots */}
      {(()=>{
        const nodes:{y:number;color:string}[]=[];
        nodes.push({y:wakeCardTop+WAKE_CARD_H/2,color:'#D9A3B2'});
        for(const {g,top} of groupLayout){
          const mid=g.tasks[Math.floor(g.tasks.length/2)];
          nodes.push({y:top+groupIconTop(g)+groupStackH(g)/2,color:mid?.color||'#D9A3B2'});
        }
        nodes.push({y:sleepCardTop+SLEEP_CARD_H/2,color:'#D9A3B2'});
        nodes.sort((a,b)=>a.y-b.y);
        if(nodes.length===0) return null;

        const freeRanges=freeLayout.map(({slot,freeY,finalH})=>({
          top:freeY, h:measuredH[`free-${slot.start}`]??finalH
        }));

        const renderSeg=(key:string|number,top:number,h:number,c1:string,c2:string)=>{
          if(h<=0) return null;
          const overlaps=freeRanges
            .map(r=>({rt:Math.max(r.top,top)-top, rb:Math.min(r.top+r.h,top+h)-top}))
            .filter(o=>o.rb>o.rt);
          return (
            <div key={key} className="absolute overflow-hidden" style={{
              left:`${AXIS_X}px`,width:'4px',top:`${top}px`,height:`${h}px`,transform:'translateX(-0.5px)',
              background:c1===c2?c1:`linear-gradient(to bottom,${c1},${c2})`
            }}>
              {overlaps.map((o,oi)=>(
                <div key={oi} className="absolute" style={{
                  top:`${o.rt}px`,height:`${o.rb-o.rt}px`,left:0,right:0,
                  backgroundImage:'repeating-linear-gradient(to bottom,transparent 0px,transparent 8px,white 8px,white 13px)'
                }}/>
              ))}
            </div>
          );
        };

        const elems=[];
        if(nodes[0].y>0) elems.push(renderSeg('pre',0,nodes[0].y,nodes[0].color,nodes[0].color));
        for(let i=0;i<nodes.length-1;i++)
          elems.push(renderSeg(i,nodes[i].y,nodes[i+1].y-nodes[i].y,nodes[i].color,nodes[i+1].color));
        const last=nodes[nodes.length-1];
        if(last.y<totalHeight) elems.push(renderSeg('post',last.y,totalHeight-last.y,last.color,last.color));
        return elems;
      })()}



      {/* wake/sleep axis labels */}
      <div className="absolute flex items-center" style={{top:`${wakeCardTop+WAKE_CARD_H/2}px`,transform:'translateY(-50%)',left:0}}>
        <span className="text-xs w-10 text-right pr-1 leading-none text-gray-300">{settings.wakeTime}</span>
      </div>
      <div className="absolute z-10 pointer-events-none" style={{top:`${wakeCardTop}px`,left:`${AXIS_X-28}px`,width:'56px',height:'56px'}}>
        <div className="w-full h-full bg-[#D9A3B2] flex items-center justify-center" style={{borderRadius:'28px'}}>
          <AppIcons.wake size={24} className="text-white"/>
        </div>
      </div>
      <div className="absolute flex items-center" style={{top:`${sleepCardTop+SLEEP_CARD_H/2}px`,transform:'translateY(-50%)',left:0}}>
        <span className="text-xs w-10 text-right pr-1 leading-none text-gray-300">{settings.sleepTime}</span>
      </div>
      <div className="absolute z-10 pointer-events-none" style={{top:`${sleepCardTop}px`,left:`${AXIS_X-28}px`,width:'56px',height:'56px'}}>
        <div className="w-full h-full bg-[#D9A3B2] flex items-center justify-center" style={{borderRadius:'28px'}}>
          <AppIcons.sleep size={24} className="text-white"/>
        </div>
      </div>

      {/* left axis: event times only (wake, tasks, sleep) */}
      {(()=>{
        const items:{y:number;text:string}[]=[
          {y:wakeCardTop+WAKE_CARD_H/2,text:settings.wakeTime},
          ...groupLayout
            .filter(({g})=>{const sm=toMin(g.startTime);return sm!==wakeMin&&sm!==sleepMin;})
            .map(({g,top})=>({y:top+groupIconTop(g)+groupStackH(g)/2,text:g.startTime})),
          {y:sleepCardTop+SLEEP_CARD_H/2,text:settings.sleepTime},
        ];
        // proximity filter: skip labels within 16px of an earlier one
        const visible:{y:number;text:string}[]=[];
        for(const item of items){
          if(!visible.some(v=>Math.abs(v.y-item.y)<16)) visible.push(item);
        }
        return visible.map(({y,text})=>(
          <div key={`al-${text}`} className="absolute flex items-center" style={{top:`${y}px`,transform:'translateY(-50%)',left:0}}>
            <span className="text-xs w-10 text-right pr-1 leading-none text-gray-300 font-medium">{text}</span>
          </div>
        ));
      })()}

      {/* current time */}
      {date===todayStr()&&nowMin>=wakeMin&&nowMin<=sleepMin&&(
        <div className="absolute flex items-center z-20 gap-1.5" style={{top:`${layoutCalcY(nowMin)-12}px`,left:'-4px',right:0}}>
          <div className="bg-[#D9A3B2] text-white text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap">{now}</div>
        </div>
      )}

      {/* wake card */}
      <div className="absolute z-10" style={{top:`${wakeCardTop}px`,left:`${CARD_LEFT}px`,right:'0px'}}
        onTouchStart={e=>startSettingLP('wake',e)}
        onTouchEnd={cancelSettingLP}
        onTouchMove={cancelSettingLP}>
        <div className={`flex items-center gap-2.5 bg-white rounded-2xl border border-gray-100 px-3 py-2.5 select-none transition-transform${pressingWake?' scale-95':''}`} style={{boxShadow:'0 4px 12px rgba(0,0,0,0.06)'}}>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-gray-400 leading-none mb-0.5">{settings.wakeTime}</p>
            <p className="text-sm font-semibold text-gray-900">起床</p>
          </div>
        </div>
      </div>

      {/* sleep card */}
      <div className="absolute z-10" style={{top:`${sleepCardTop}px`,left:`${CARD_LEFT}px`,right:'0px'}}
        onTouchStart={e=>startSettingLP('sleep',e)}
        onTouchEnd={cancelSettingLP}
        onTouchMove={cancelSettingLP}>
        <div className={`flex items-center gap-2.5 bg-white rounded-2xl border border-gray-100 px-3 py-2.5 select-none transition-transform${pressingSleep?' scale-95':''}`} style={{boxShadow:'0 4px 12px rgba(0,0,0,0.06)'}}>
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

      {/* completed tasks section */}
      {showCompletedSection&&(
        <div className="absolute" style={{top:`${completedSectionTop}px`,left:`${CARD_LEFT}px`,right:'0px'}}>
          <div className="h-px bg-gray-200 mb-4"/>
          <div className="rounded-2xl bg-gray-50 border border-gray-100">
            <div className="flex items-center gap-2 px-4 pt-3 pb-2">
              <AppIcons.sparkle size={16} className="text-[#D9A3B2] shrink-0"/>
              <span className="text-sm font-semibold text-gray-500">今日完了したタスク</span>
              {completedToday.length>0&&(
                <span className="ml-auto text-xs font-bold bg-[#D9A3B2] text-white rounded-full px-2 py-0.5">{completedToday.length}</span>
              )}
            </div>
            <div className="px-3 pb-3">
              {completedToday.length===0?(
                <p className="text-xs text-gray-400 text-center py-2">まだ完了したタスクはありません</p>
              ):(
                <div className="flex flex-col gap-1">
                  {completedToday.map(t=>(
                    <div key={t.id} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2">
                      <div className="w-4 h-4 rounded bg-[#D9A3B2] flex items-center justify-center shrink-0">
                        <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                      <span className="text-xs text-gray-400 flex-1 line-through">{t.name}</span>
                      {t.startTime&&<span className="text-xs text-gray-300">{t.startTime}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* task groups */}
      {groupLayout.map(({g,top})=>{
        if(g.tasks.length===1){
          const task=g.tasks[0];
          const isDragging=dragTaskId===task.id;
          const isPressing=pressingId===task.id;
          const CapsuleIc=getTaskIcon(task.icon||defaultIconKey(task.name));
          return [
            <div key={`cap-${g.startTime}`} className="absolute z-10 cursor-pointer"
              style={{top:`${top}px`,left:`${AXIS_X-28}px`,width:'56px',height:`${Math.max(measuredH[g.startTime]??g.h,56)}px`}}
              onClick={e=>{e.stopPropagation();onEditIconSheet(task);}}>
              <div className="w-full h-full flex items-center justify-center active:opacity-70 transition-opacity" style={{borderRadius:'28px',background:task.color||'#D9A3B2'}}>
                <CapsuleIc size={24} className={task.color?'text-white':'text-white'}/>
              </div>
            </div>,
            <div key={g.startTime} className={`absolute z-10 transition-transform select-none ${isPressing?'scale-95':''}`}
              ref={el=>{if(el){el.dataset.gk=g.startTime;roRef.current?.observe(el);}}}
              style={{top:`${top}px`,left:`${CARD_LEFT}px`,right:'0px',
                opacity:isDragging?0.25:1,pointerEvents:isDragging?'none':'auto'}}
              onTouchStart={e=>startLP(task,e)}
              onTouchEnd={cancelLP}
              onTouchMove={cancelLP}>
              <TaskCard task={task} onToggle={()=>onToggle(task.id)} onEdit={()=>onEdit(task)} globalTags={globalTags} onSubtaskToggle={(sid)=>onSubtaskToggle(task.id,sid)} onCameraClick={()=>onCameraClick(task.id)}/>
            </div>,
          ];
        }
        const CAPSULE_H=56,GAP=16,n=g.tasks.length;
        const stackTop=top+DUP_LABEL_H;
        const cardHeights=g.tasks.map(t=>Math.max(measuredH[t.id]??MIN_CARD_H,CAPSULE_H));
        const cardTops:number[]=[];
        { let acc=0; for(let i=0;i<n;i++){cardTops.push(acc);acc+=cardHeights[i]+GAP;} }
        const stackH=cardTops[n-1]+cardHeights[n-1];
        const centers=g.tasks.map((_,i)=>cardTops[i]+cardHeights[i]/2);
        const boundaries=centers.slice(0,-1).map((c,i)=>(c+centers[i+1])/2);
        const capTops=centers.map((c,i)=>i===0?c-CAPSULE_H/2:boundaries[i-1]);
        const capBottoms=centers.map((c,i)=>i===n-1?c+CAPSULE_H/2:boundaries[i]);
        return [
          <div key={`dup-${g.startTime}`} className="absolute z-10 flex items-center gap-1"
            style={{top:`${top}px`,left:`${CARD_LEFT}px`,right:'0px',height:`${DUP_LABEL_H}px`}}>
            <span className="text-[#D9A3B2]" style={{fontSize:'10px'}}>●</span>
            <span className="text-xs text-gray-400">タスクが重複しています</span>
          </div>,
          <div key={`cap-${g.startTime}`} className="absolute z-10 pointer-events-none"
            style={{top:`${stackTop}px`,left:`${AXIS_X-28}px`,width:'56px',height:`${stackH}px`,overflow:'visible'}}>
            {g.tasks.map((task,i)=>(
              <div key={`bg-${task.id}`} className="absolute" style={{
                top:`${capTops[i]}px`,left:0,width:'56px',height:`${capBottoms[i]-capTops[i]}px`,
                background:task.color||'#D9A3B2',
                borderTopLeftRadius:i===0?28:0,borderTopRightRadius:i===0?28:0,
                borderBottomLeftRadius:i===n-1?28:0,borderBottomRightRadius:i===n-1?28:0,
              }}/>
            ))}
            {boundaries.map((b,i)=>(
              <div key={`div-${i}`} className="absolute" style={{top:`${b-1}px`,left:0,width:'56px',height:'2px',background:'white'}}/>
            ))}
            {g.tasks.map((task,i)=>{
              const Ic=getTaskIcon(task.icon||defaultIconKey(task.name||''));
              return(
                <div key={`ic-${task.id}`} className="absolute flex items-center justify-center" style={{top:`${centers[i]-12}px`,left:0,width:'56px',height:'24px'}}>
                  <Ic size={24} className="text-white"/>
                </div>
              );
            })}
          </div>,
          <div key={g.startTime} className="absolute z-10"
            style={{top:`${stackTop}px`,left:`${CARD_LEFT}px`,right:'0px'}}>
            <div style={{display:'flex',flexDirection:'column',gap:`${GAP}px`}}>
              {g.tasks.map(task=>{
                const isDragging=dragTaskId===task.id;
                const isPressing=pressingId===task.id;
                return (
                  <div key={task.id}
                    className={`select-none transition-transform${isPressing?' scale-95':''}`}
                    style={{opacity:isDragging?0.25:1,pointerEvents:isDragging?'none':'auto'}}
                    ref={el=>{if(el){el.dataset.gk=task.id;roRef.current?.observe(el);}}}
                    onTouchStart={e=>startLP(task,e)}
                    onTouchEnd={cancelLP}
                    onTouchMove={cancelLP}>
                    <TaskCard task={task} onToggle={()=>onToggle(task.id)} onEdit={()=>onEdit(task)} globalTags={globalTags} onSubtaskToggle={(sid)=>onSubtaskToggle(task.id,sid)} onCameraClick={()=>onCameraClick(task.id)}/>
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
          <div key={i} className="absolute z-10" style={{top:`${freeY}px`,left:`${CARD_LEFT}px`,right:'0px'}}
            ref={el=>{if(el){el.dataset.gk=`free-${slot.start}`;roRef.current?.observe(el);}}}>
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

// ── ShopNotifPanel ────────────────────────────────────────────────────────────

function ShopNotifPanel({settings,onChange}:{
  settings:ShopNotifSetting[];
  onChange:(s:ShopNotifSetting[])=>void;
}) {
  const DOW=['日','月','火','水','木','金','土'];
  const [editing,setEditing]=useState<ShopNotifSetting|null>(null);
  const [adding,setAdding]=useState(false);
  const fmtDays=(days:number[])=>{
    if(days.length===7) return '毎日';
    if(days.length===2&&days.includes(0)&&days.includes(6)) return '週末';
    if(days.length===5&&!days.includes(0)&&!days.includes(6)) return '平日';
    return [...days].sort((a,b)=>a-b).map(d=>DOW[d]).join('・');
  };
  const startAdd=()=>{
    setEditing({id:Math.random().toString(36).slice(2),days:[1,2,3,4,5],time:'09:00',enabled:true});
    setAdding(true);
  };
  const save=(s:ShopNotifSetting)=>{
    if(adding) onChange([...settings,s]);
    else onChange(settings.map(x=>x.id===s.id?s:x));
    setEditing(null);setAdding(false);
  };
  const del=(id:string)=>onChange(settings.filter(s=>s.id!==id));
  const toggleEnabled=(id:string)=>onChange(settings.map(s=>s.id===id?{...s,enabled:!s.enabled}:s));
  return (
    <div className="px-4 pb-6">
      <div className="flex items-center justify-between mb-3 mt-1">
        <p className="text-sm font-semibold text-gray-700">買い物リストの通知</p>
        <button onClick={startAdd} disabled={!!editing}
          className="flex items-center gap-1 px-3 py-1.5 bg-[#D9A3B2] text-white rounded-xl text-sm font-semibold disabled:opacity-40">
          <AppIcons.plus size={14}/>追加
        </button>
      </div>
      {settings.length===0&&!editing&&(
        <p className="text-sm text-gray-400 text-center py-4">通知が設定されていません</p>
      )}
      <div className="space-y-2">
        {settings.map(s=>(
          <div key={s.id} className="bg-white rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3">
            <AppIcons.bell size={16} className={s.enabled?'text-[#D9A3B2]':'text-gray-300'}/>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">{fmtDays(s.days)}</p>
              <p className="text-xs text-gray-400">{s.time}</p>
            </div>
            <button onClick={()=>toggleEnabled(s.id)}
              className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${s.enabled?'bg-[#D9A3B2]':'bg-gray-200'}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${s.enabled?'left-[18px]':'left-0.5'}`}/>
            </button>
            <button onClick={()=>del(s.id)} className="text-gray-300 active:text-[#D97A7A] shrink-0">
              <AppIcons.trash size={16}/>
            </button>
          </div>
        ))}
      </div>
      {editing&&(
        <div className="mt-3 bg-white rounded-2xl shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">曜日</p>
          <div className="flex gap-2 flex-wrap mb-4">
            {DOW.map((d,i)=>(
              <button key={i} onClick={()=>{
                const days=editing.days.includes(i)?editing.days.filter(x=>x!==i):[...editing.days,i];
                setEditing({...editing,days});
              }}
                className={`w-9 h-9 rounded-full text-sm font-semibold transition-colors ${editing.days.includes(i)?'bg-[#D9A3B2] text-white':'bg-gray-100 text-gray-600'}`}>
                {d}
              </button>
            ))}
          </div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">時間</p>
          <input type="time" value={editing.time} onChange={e=>setEditing({...editing,time:e.target.value})}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 mb-4 w-full" style={{height:'40px'}}/>
          <div className="flex gap-2">
            <button onClick={()=>{setEditing(null);setAdding(false);}}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 active:bg-gray-200">
              キャンセル
            </button>
            <button onClick={()=>save(editing)} disabled={editing.days.length===0}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[#D9A3B2] text-white active:opacity-80 disabled:opacity-40">
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── BottomTabs ────────────────────────────────────────────────────────────────

function BottomTabs({activeTab,onSwitchTab,onClose,tasks,shopItems,pendingCount,shopPending,
  onToggle,onEdit,onAddShop,onToggleShop,onDeleteShop,onDragStart,shopNotifSettings,onShopNotifSettings
}:{
  activeTab:'later'|'shop'; onSwitchTab:(t:'later'|'shop')=>void; onClose:()=>void;
  tasks:Task[]; shopItems:ShopItem[]; pendingCount:number; shopPending:number;
  onToggle:(id:string)=>void; onEdit:(t:Task)=>void;
  onAddShop:(n:string)=>void; onToggleShop:(id:string)=>void; onDeleteShop:(id:string)=>void;
  onDragStart:(t:Task,x:number,y:number)=>void;
  shopNotifSettings:ShopNotifSetting[]; onShopNotifSettings:(s:ShopNotifSetting[])=>void;
}) {
  const [shopInput,setShopInput] = useState('');
  const [sortDir,setSortDir]     = useState<null|'asc'|'desc'>(null);
  const [shopSortDir,setShopSortDir] = useState<null|'asc'|'desc'>(null);
  const [pressingId,setPressingId]= useState<string|null>(null);
  const [showShopNotif,setShowShopNotif] = useState(false);
  const lpTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const swX=useRef(0), swY=useRef(0);
  const tabs:('later'|'shop')[]=['later','shop'];
  const onSheetSwipe=(e:React.TouchEvent)=>{
    const dx=e.changedTouches[0].clientX-swX.current;
    const dy=e.changedTouches[0].clientY-swY.current;
    if(dy>60&&Math.abs(dy)>Math.abs(dx)){onClose();return;}
    if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)){
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
    const ordered = sortDir!=='desc' ? normal : [...normal].reverse();
    return [...pinned,...ordered];
  })();

  const scheduledRaw = tasks.filter(t=>!t.isLater&&t.startTime&&!t.completed&&!t.recurrence)
    .sort((a,b)=>{
      const cmp=a.date.localeCompare(b.date)||toMin(a.startTime!)-toMin(b.startTime!);
      return sortDir!=='desc'?cmp:-cmp;
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

  const shopPendingItems=[...shopItems.filter(i=>!i.checked)].sort((a,b)=>shopSortDir!=='desc'?a.name.localeCompare(b.name,'ja'):b.name.localeCompare(a.name,'ja'));
  const shopDoneItems=shopItems.filter(i=>i.checked);


  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/20" onClick={onClose}>
      <div className="flex-1"/>
      <div className="bg-white w-full max-w-md mx-auto rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e=>e.stopPropagation()}
        onTouchStart={e=>{swX.current=e.touches[0].clientX;swY.current=e.touches[0].clientY;}}
        onTouchEnd={onSheetSwipe}>
        <button onClick={onClose} className="flex items-center justify-center pt-3 pb-2 w-full shrink-0 active:opacity-60">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full"/>
        </button>
        {/* Tab bar */}
        <div className="flex border-b border-gray-100 shrink-0 mt-1">
          {([['later','あとでやる',pendingCount],['shop','買い物リスト',shopPending]] as const).map(([t,label,cnt])=>(
            <button key={t} onClick={()=>onSwitchTab(t)}
              className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${activeTab===t?'border-[#D9A3B2] text-gray-900':'border-transparent text-gray-400'}`}>
              {label}
              {cnt>0&&<span className="text-[11px] bg-[#D9A3B2] text-white min-w-[18px] h-[18px] rounded-full flex items-center justify-center font-bold px-1">{cnt}</span>}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden" style={{display:'grid',gridTemplateColumns:'1fr',gridTemplateRows:'1fr'}}>
        {/* ── あとでやる tab ── */}
          <div className={`overflow-y-auto px-4 pb-10 ${activeTab==='later'?'':'invisible pointer-events-none'}`} style={{gridArea:'1/1'}}>
            <div className="flex items-center justify-between pt-3 pb-2">
              <h3 className="text-sm font-bold text-gray-900">
                あとでやる
                {pendingCount>0&&<span className="ml-1.5 text-gray-400 font-normal">{pendingCount}</span>}
              </h3>
              <button onClick={()=>setSortDir(d=>d===null?'asc':d==='asc'?'desc':'asc')}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-sm bg-[#D9A3B2] text-white transition-colors">
                {sortDir===null?'↑↓':sortDir==='asc'?'↑':'↓'}
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
                  {normalLater.map(t=>{
                    const LaterIc=getTaskIcon(t.icon||defaultIconKey(t.name));
                    return (
                    <div key={t.id}
                      className={`flex items-center gap-2.5 bg-white border border-gray-100 rounded-2xl shadow-sm px-3 py-3 transition-transform select-none ${pressingId===t.id?'scale-95 shadow-lg border-blue-200':''}`}
                      onTouchStart={e=>startLP(t,e)}
                      onTouchEnd={cancelLP}
                      onTouchMove={cancelLP}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{background:t.color||'#F3F4F6'}}>
                        <LaterIc size={14} className={t.color?'text-white':'text-gray-400'}/>
                      </div>
                      <div className="flex-1 min-w-0" onClick={()=>onEdit(t)}>
                        {(t.duration??0)>0&&<p className="text-xs text-gray-400">{durLabel(t.duration??0)}</p>}
                        <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                      </div>
                      {(t.postponedCount??0)>0&&(
                        <span className="flex items-center gap-0.5 text-xs text-gray-400 font-semibold shrink-0"><AppIcons.postponed size={11}/>{t.postponedCount}</span>
                      )}
                      <button onClick={()=>onToggle(t.id)} className="w-6 h-6 rounded-full border-2 border-gray-300 shrink-0"/>
                    </div>
                  );})}
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
                  {scheduledRaw.map(t=>{
                    const SchedIc=getTaskIcon(t.icon||defaultIconKey(t.name));
                    return (
                    <div key={t.id} className="flex items-center gap-2.5 bg-white border border-gray-100 rounded-2xl shadow-sm px-3 py-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{background:t.color||'#F3F4F6'}}>
                        <SchedIc size={14} className={t.color?'text-white':'text-gray-400'}/>
                      </div>
                      <div className="flex-1 min-w-0" onClick={()=>onEdit(t)}>
                        <p className="text-xs text-gray-400">{t.date.slice(5).replace('-','/')} {t.startTime}</p>
                        <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                      </div>
                      <button onClick={()=>onToggle(t.id)} className="w-6 h-6 rounded-full border-2 border-gray-300 shrink-0"/>
                    </div>
                  );})}
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
                  {recurringGroups.map(t=>{
                    const RecIc=getTaskIcon(t.icon||defaultIconKey(t.name));
                    return (
                    <div key={`${t.name}||${t.recurrence}||${t.startTime??''}`}
                      className="flex items-center gap-2.5 bg-white border border-gray-100 rounded-2xl shadow-sm px-3 py-3"
                      onClick={()=>onEdit(t)}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{background:t.color||'#F3F4F6'}}>
                        <RecIc size={14} className={t.color?'text-white':'text-gray-400'}/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400">{recLabel(t)}{t.startTime?` ${t.startTime}`:''}</p>
                        <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                      </div>
                    </div>
                  );})}
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
                      <button onClick={()=>onToggle(t.id)} className="w-6 h-6 rounded-full border-2 border-[#D9A3B2] bg-[#D9A3B2] shrink-0 flex items-center justify-center">
                        <span className="text-white text-[10px] font-bold">✓</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        {/* ── 買い物 tab ── */}
          <div className={`flex flex-col overflow-hidden ${activeTab==='shop'?'':'invisible pointer-events-none'}`} style={{gridArea:'1/1'}}>
            <div className="px-4 pt-3 pb-2 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-gray-900">買い物リスト</h3>
                <div className="flex items-center gap-2">
                  <button onClick={()=>setShowShopNotif(v=>!v)}
                    className={`relative w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${showShopNotif?'bg-[#D9A3B2] text-white':'bg-gray-100 text-gray-500'}`}>
                    <AppIcons.bell size={15}/>
                    {shopNotifSettings.filter(s=>s.enabled).length>0&&!showShopNotif&&(
                      <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-[#D9A3B2] rounded-full border-2 border-white"/>
                    )}
                  </button>
                  <button onClick={()=>setShopSortDir(d=>d===null?'asc':d==='asc'?'desc':'asc')}
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-sm bg-[#D9A3B2] text-white transition-colors">
                    {shopSortDir===null?'↑↓':shopSortDir==='asc'?'↑':'↓'}
                  </button>
                </div>
              </div>
              {!showShopNotif&&<div className="flex gap-2">
                <input type="text" value={shopInput} onChange={e=>setShopInput(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&addShop()}
                  placeholder="商品を追加..."
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-400 bg-gray-50"/>
                <button onClick={addShop} disabled={!shopInput.trim()}
                  className="px-4 py-2 bg-[#D9A3B2] text-white rounded-xl text-sm font-semibold disabled:opacity-40">追加</button>
              </div>}
            </div>
            <div className="overflow-y-auto pb-10 flex-1">
              {showShopNotif?(
                <ShopNotifPanel settings={shopNotifSettings} onChange={onShopNotifSettings}/>
              ):shopItems.length===0?(
                <div className="py-12 text-center px-4"><AppIcons.shopping size={40} className="mx-auto mb-2 text-gray-300"/><p className="text-sm text-gray-400">リストは空です</p></div>
              ):(
                <div className="space-y-2 px-4">
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
                        <button onClick={()=>onToggleShop(item.id)} className="w-5 h-5 rounded border-2 border-[#D9A3B2] bg-[#D9A3B2] shrink-0 flex items-center justify-center">
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
        </div>{/* end stacked panels wrapper */}
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

function SettingsScreen({settings,onSettings,onClose,globalTags,onGlobalTags,customTabs,onCustomTabs,shopNotifSettings,onShopNotifSettings}:{
  settings:Settings; onSettings:(s:Settings)=>void; onClose:()=>void;
  globalTags:TagDef[]; onGlobalTags:(tags:TagDef[])=>void;
  customTabs:CustomTab[]; onCustomTabs:(tabs:CustomTab[])=>void;
  shopNotifSettings:ShopNotifSetting[]; onShopNotifSettings:(s:ShopNotifSetting[])=>void;
}) {
  const [sub,setSub]           = useState<string|null>(null);
  const [tagInput,setTagInput] = useState('');
  const [newTagColor,setNewTagColor] = useState(TAG_COLORS[0].bg);
  const [editIdx,setEditIdx]   = useState<number|null>(null);
  const [editVal,setEditVal]   = useState('');
  const [editColor,setEditColor]   = useState(TAG_COLORS[0].bg);
  const [tabInput,setTabInput]     = useState('');
  const [editTabId,setEditTabId]   = useState<string|null>(null);
  const [editTabVal,setEditTabVal] = useState('');

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

  if(sub==='tabs') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('ファイルタブ')}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-6">新しいタブ</p>
        <div className="bg-white rounded-2xl shadow-sm px-4 py-3">
          <div className="flex gap-2 items-center">
            <input value={tabInput} onChange={e=>setTabInput(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'){const v=tabInput.trim();if(v){onCustomTabs([...customTabs,{id:uid(),name:v}]);setTabInput('');}}} }
              placeholder="タブ名を入力"
              className="flex-1 text-[15px] bg-transparent outline-none text-gray-900 placeholder-gray-300 border-b border-gray-200 pb-1"/>
            <button onClick={()=>{const v=tabInput.trim();if(v){onCustomTabs([...customTabs,{id:uid(),name:v}]);setTabInput('');}}}
              className="px-4 py-1.5 bg-[#D9A3B2] text-white text-sm font-semibold rounded-xl shrink-0">追加</button>
          </div>
        </div>
        {customTabs.length>0&&(
          <>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-6">タブ一覧</p>
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              {customTabs.map((tab,i)=>(
                <div key={tab.id} className={`px-4 py-3 flex items-center gap-3${i<customTabs.length-1?' border-b border-gray-100':''}`}>
                  {editTabId===tab.id ? (
                    <input autoFocus value={editTabVal} onChange={e=>setEditTabVal(e.target.value)}
                      onKeyDown={e=>{if(e.key==='Enter'){const v=editTabVal.trim();if(v)onCustomTabs(customTabs.map(t=>t.id===tab.id?{...t,name:v}:t));setEditTabId(null);}}}
                      className="flex-1 text-[15px] border-b border-gray-300 outline-none bg-transparent text-gray-900 py-0.5"/>
                  ) : (
                    <span className="flex-1 text-[15px] text-gray-900">{tab.name}</span>
                  )}
                  <div className="flex gap-1 shrink-0">
                    <button onClick={()=>{if(editTabId===tab.id){const v=editTabVal.trim();if(v)onCustomTabs(customTabs.map(t=>t.id===tab.id?{...t,name:v}:t));setEditTabId(null);}else{setEditTabId(tab.id);setEditTabVal(tab.name);}}}
                      className="text-xs text-blue-500 font-medium px-2 py-1">
                      {editTabId===tab.id?'確定':'編集'}
                    </button>
                    {editTabId===tab.id
                      ? <button onClick={()=>setEditTabId(null)} className="text-xs text-gray-400 font-medium px-2 py-1">キャンセル</button>
                      : <button onClick={()=>onCustomTabs(customTabs.filter(t=>t.id!==tab.id))} className="text-xs text-[#D97A7A] font-medium px-2 py-1">削除</button>
                    }
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {customTabs.length===0&&(
          <p className="text-sm text-gray-400 text-center mt-10">タブがまだありません</p>
        )}
      </div>
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
                className={`w-7 h-7 rounded-full border border-gray-200 transition-all ${newTagColor===c.bg?'ring-2 ring-[#D9A3B2] ring-offset-1 scale-110':''}`}/>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <input value={tagInput} onChange={e=>setTagInput(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&addTag()}
              placeholder="タグ名を入力"
              className="flex-1 text-[15px] bg-transparent outline-none text-gray-900 placeholder-gray-300 border-b border-gray-200 pb-1"/>
            <button onClick={addTag}
              className="px-4 py-1.5 bg-[#D9A3B2] text-white text-sm font-semibold rounded-xl shrink-0">追加</button>
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
                            className={`w-6 h-6 rounded-full border border-gray-200 transition-all ${editColor===c.bg?'ring-2 ring-[#D9A3B2] ring-offset-1 scale-110':''}`}/>
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
                      : <button onClick={()=>deleteTag(i)} className="text-xs text-[#D97A7A] font-medium px-2 py-1">削除</button>
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
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-6">リスト</p>
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <SettingsRow icon={<AppIcons.shopping size={18}/>} iconBg="bg-gray-100" title="買い物リスト"
            desc={shopNotifSettings.filter(s=>s.enabled).length>0?`${shopNotifSettings.filter(s=>s.enabled).length}件の通知が有効`:'通知なし'}
            onClick={()=>setSub('notifications-shop')} isLast/>
        </div>
      </div>
    </div>
  );

  if(sub==='notifications-shop') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      <div className="bg-white border-b border-gray-200 px-4 py-3.5 flex items-center shrink-0">
        <button onClick={()=>setSub('notifications')} className="flex items-center gap-0.5 text-gray-900 min-w-[80px]">
          <AppIcons.caretLeft size={20}/>
          <span className="text-[15px]">通知</span>
        </button>
        <h2 className="flex-1 text-center text-[17px] font-semibold text-gray-900 -mx-4">買い物リスト</h2>
        <div className="min-w-[80px]"/>
      </div>
      <div className="flex-1 overflow-y-auto pb-8">
        <div className="mt-6">
          <ShopNotifPanel settings={shopNotifSettings} onChange={onShopNotifSettings}/>
        </div>
      </div>
    </div>
  );

  if(sub==='display') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('表示設定')}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-6">空き時間カード</p>
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3.5 flex items-center justify-between border-b border-gray-100">
            <p className="text-[15px] font-medium text-gray-900">空き時間カードを表示</p>
            <button onClick={()=>onSettings({...settings,showFreeCard:!(settings.showFreeCard??true)})}
              className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${(settings.showFreeCard??true)?'bg-[#D9A3B2]':'bg-gray-200'}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${(settings.showFreeCard??true)?'left-[18px]':'left-0.5'}`}/>
            </button>
          </div>
          {(settings.showFreeCard??true)&&(
            <div className="px-4 py-3.5">
              <p className="text-[15px] font-medium text-gray-900 mb-3">最小表示時間</p>
              <div className="flex gap-2 flex-wrap">
                {([30,60,90,120,150,180] as const).map(m=>{
                  const label=m<60?`${m}分`:m===60?'1時間':m===90?'1.5時間':m===120?'2時間':m===150?'2.5時間':'3時間';
                  const active=(settings.freeCardMinMin??120)===m;
                  return (
                    <button key={m} onClick={()=>onSettings({...settings,freeCardMinMin:m})}
                      className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${active?'bg-[#D9A3B2] text-white':'bg-gray-100 text-gray-600'}`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
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
          <SettingsRow icon={<AppIcons.caretRight/>} iconBg="bg-gray-100" title="ファイルタブ" desc="タブを管理" onClick={()=>setSub('tabs')}/>
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

// ── MorningCheckModal ─────────────────────────────────────────────────────────

function MorningCheckModal({tasks,selected,onToggle,onSelectAll,onAction,onSnooze,onClose}:{
  tasks:Task[];selected:Set<string>;onToggle:(id:string)=>void;onSelectAll:()=>void;
  onAction:(type:'done'|'later')=>void;onSnooze:(minutes:number)=>void;onClose:()=>void;
}){
  const [sub,setSub]=useState<'main'|'snooze'|'closeConfirm'>('main');
  const [snoozeIdx,setSnoozeIdx]=useState(0);
  const snoozeScrollRef=useRef<HTMLDivElement>(null);
  const allSel=tasks.length>0&&tasks.every(t=>selected.has(t.id));
  const selCount=tasks.filter(t=>selected.has(t.id)).length;
  const ITEM_H=44;
  const SNOOZE_ITEMS=Array.from({length:20},(_,i)=>{
    const m=(i+1)*15,h=Math.floor(m/60),rem=m%60;
    return {m,l:h===0?`${m}分後`:rem===0?`${h}時間後`:`${h}時間${rem}分後`};
  });

  if(sub==='closeConfirm') return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/30 px-6">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
        <p className="text-sm text-gray-700 mb-6">このまま閉じると、昨日のタスクは前日に残ります。閉じますか？</p>
        <div className="flex gap-3">
          <button onClick={()=>setSub('main')}
            className="flex-1 py-3 bg-gray-100 rounded-xl text-sm font-semibold text-gray-800 active:bg-gray-200">戻る</button>
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl text-sm font-semibold text-white active:opacity-80" style={{background:THEME.danger}}>閉じる</button>
        </div>
      </div>
    </div>
  );

  if(sub==='snooze') return (
    <div className="fixed inset-0 z-[150] flex items-end bg-black/30">
      <div className="w-full max-w-md mx-auto bg-white rounded-t-3xl shadow-2xl">
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1 bg-gray-300 rounded-full"/>
        </div>
        <div className="px-5 pt-3 pb-2">
          <p className="text-[16px] font-bold text-gray-900">何時間後に再通知しますか？</p>
        </div>
        <div className="relative" style={{height:ITEM_H*5}}>
          <div style={{
            position:'absolute',top:ITEM_H*2,left:0,right:0,height:ITEM_H,
            borderTop:'1px solid #E5E7EB',borderBottom:'1px solid #E5E7EB',
            pointerEvents:'none',zIndex:1,
          }}/>
          <div ref={snoozeScrollRef}
            style={{
              height:'100%',overflowY:'scroll',scrollSnapType:'y mandatory',
              WebkitOverflowScrolling:'touch',position:'relative',
            }}
            onScroll={e=>{
              const idx=Math.round(e.currentTarget.scrollTop/ITEM_H);
              setSnoozeIdx(Math.max(0,Math.min(SNOOZE_ITEMS.length-1,idx)));
            }}
          >
            <div style={{height:ITEM_H*2}}/>
            {SNOOZE_ITEMS.map(({m,l},i)=>(
              <div key={m} style={{
                height:ITEM_H,scrollSnapAlign:'center',display:'flex',
                alignItems:'center',justifyContent:'center',
                fontSize:i===snoozeIdx?'17px':'15px',
                fontWeight:i===snoozeIdx?700:400,
                color:i===snoozeIdx?'#1F1F1F':'#9CA3AF',
              }}>
                {l}
              </div>
            ))}
            <div style={{height:ITEM_H*2}}/>
          </div>
        </div>
        <div className="px-4 pt-3 pb-8 space-y-2">
          <button onClick={()=>onSnooze(SNOOZE_ITEMS[snoozeIdx].m)}
            className="w-full py-3.5 rounded-xl text-sm font-semibold text-white active:opacity-80"
            style={{background:THEME.primary}}>
            この時間後に再通知する
          </button>
          <button onClick={()=>setSub('main')}
            className="w-full py-2.5 text-sm text-gray-400 font-medium">戻る</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[150] flex items-end bg-black/30">
      <div className="w-full max-w-md mx-auto bg-white rounded-t-3xl max-h-[80vh] flex flex-col shadow-2xl">
        <div className="pt-3 pb-1 flex justify-center shrink-0 relative">
          <div className="w-10 h-1 bg-gray-300 rounded-full"/>
          <button onClick={()=>setSub('closeConfirm')}
            className="absolute right-4 top-1.5 w-7 h-7 flex items-center justify-center text-gray-400 text-lg active:text-gray-600">×</button>
        </div>
        <div className="px-5 pt-2 pb-3 shrink-0">
          <p className="text-[17px] font-bold text-gray-900">昨日のタスク</p>
          <p className="text-sm text-gray-400 mt-1">{tasks.length}件のタスクが残っています</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <button className="w-full flex items-center gap-3 px-5 py-2.5 border-b border-gray-100" onClick={onSelectAll}>
            <div className="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0"
              style={allSel?{background:THEME.primary,borderColor:THEME.primary}:{borderColor:'#D1D5DB'}}>
              {allSel&&<span className="text-white text-[10px] font-bold">✓</span>}
            </div>
            <span className="text-sm text-gray-500 font-medium">すべて選択</span>
          </button>
          {tasks.map(t=>{
            const isSel=selected.has(t.id);
            const Ic=getTaskIcon(t.icon??'');
            return (
              <button key={t.id} onClick={()=>onToggle(t.id)}
                className="w-full flex items-center gap-3 px-5 py-3 border-b border-gray-100"
                style={isSel?{background:'color-mix(in srgb, var(--c-primary) 10%, white)'}:{}}>
                <div className="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0"
                  style={isSel?{background:THEME.primary,borderColor:THEME.primary}:{borderColor:'#D1D5DB'}}>
                  {isSel&&<span className="text-white text-[10px] font-bold">✓</span>}
                </div>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{background:t.color||'#F3F4F6'}}>
                  <Ic size={15} className={t.color?'text-white':'text-gray-400'}/>
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{t.name}</p>
                  <p className="text-xs text-gray-400">{t.date.slice(5).replace('-','/')} {t.startTime}</p>
                </div>
              </button>
            );
          })}
        </div>
        <div className="px-4 pt-3 pb-6 shrink-0 border-t border-gray-100">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <button disabled={selCount===0} onClick={()=>onAction('done')}
              className={`py-3 rounded-xl text-sm font-semibold ${selCount>0?'bg-gray-100 text-gray-800 active:bg-gray-200':'bg-gray-50 text-gray-300'}`}>
              完了した
            </button>
            <button disabled={selCount===0} onClick={()=>onAction('later')}
              className={`py-3 rounded-xl text-sm font-semibold ${selCount>0?'text-white active:opacity-80':'bg-gray-50 text-gray-300'}`}
              style={selCount>0?{background:THEME.primary}:{}}>
              あとでやるに戻す
            </button>
          </div>
          <button onClick={()=>setSub('snooze')}
            className="w-full py-2.5 text-sm text-gray-400 font-medium active:text-gray-600">
            あとで確認する
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [tasks,setTasks]         = useState<Task[]>([]);
  const [settings,setSettings]   = useState<Settings>(DEFAULT_SETTINGS);
  const [shopItems,setShopItems] = useState<ShopItem[]>([]);
  const [globalTags,setGlobalTags] = useState<TagDef[]>([]);
  const [moveHistory,setMoveHistory] = useState<MoveHistory[]>([]);
  const [date,setDate]           = useState(todayStr());
  const [modal,setModal]         = useState<{open:boolean;task:Task|null;prefillTime?:string;prefillCategory?:string;iconSheet?:boolean;scrollToPhotos?:boolean}>({open:false,task:null});
  const [activeCategory,setActiveCat] = useState<string|null>(null);
  const [customTabs,setCustomTabs]   = useState<CustomTab[]>([]);
  const [editTabId,setEditTabId]     = useState<string|null>(null);
  const [editTabName,setEditTabName] = useState('');
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
  const weekSwX = useRef(0);
  const weekSwY = useRef(0);
  const yToTimeRef = useRef<((clientY:number)=>string)|null>(null);
  const layoutYRef = useRef<((min:number)=>number)|null>(null);
  const [recConfirm,setRecConfirm] = useState<Task|null>(null);
  const [pendingDragMove,setPendingDragMove] = useState<{task:Task;time:string}|null>(null);
  const [editScope,setEditScope]   = useState<'one'|'all'>('one');
  const [overTrash,setOverTrash]   = useState(false);
  const [overLater,setOverLater]   = useState(false);
  const [dragSetting,setDragSetting] = useState<'wake'|'sleep'|null>(null);
  const [settingConfirm,setSettingConfirm] = useState<{type:'wake'|'sleep';newTime:string}|null>(null);
  const [dayOverrides,setDayOverrides] = useState<Record<string,{wakeTime?:string;sleepTime?:string}>>({});
  const [morningTasks,setMorningTasks] = useState<Task[]|null>(null);
  const [morningSelected,setMorningSel] = useState<Set<string>>(new Set());
  const morningShownRef = useRef(false);
  const [shopNotifSettings,setShopNotifSettings] = useState<ShopNotifSetting[]>([]);

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
      const ct=localStorage.getItem(CUSTOM_TABS_KEY);
      if(ct) setCustomTabs(JSON.parse(ct) as CustomTab[]);
      const ds=localStorage.getItem(DAY_SETTINGS_KEY);
      if(ds) setDayOverrides(JSON.parse(ds) as Record<string,{wakeTime?:string;sleepTime?:string}>);
      const sn=localStorage.getItem(SHOP_NOTIF_KEY);
      if(sn) setShopNotifSettings(JSON.parse(sn) as ShopNotifSetting[]);
    }catch{}
    setLoaded(true);
    if(typeof Notification!=='undefined'&&Notification.permission==='default'){
      Notification.requestPermission();
    }
  },[]);

  useEffect(()=>{ if(loaded) localStorage.setItem(TASKS_KEY,JSON.stringify(tasks)); },[tasks,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings)); },[settings,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(SHOP_KEY,JSON.stringify(shopItems)); },[shopItems,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(TAGS_KEY,JSON.stringify(globalTags)); },[globalTags,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(HISTORY_KEY,JSON.stringify(moveHistory)); },[moveHistory,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(CUSTOM_TABS_KEY,JSON.stringify(customTabs)); },[customTabs,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(SHOP_NOTIF_KEY,JSON.stringify(shopNotifSettings)); },[shopNotifSettings,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(DAY_SETTINGS_KEY,JSON.stringify(dayOverrides)); },[dayOverrides,loaded]);
  useEffect(()=>{ const iv=setInterval(()=>setNow(nowStr()),60000); return ()=>clearInterval(iv); },[]);

  // 起床時間後、初回起動時に過去の未完了タスクをポップアップで確認（スヌーズ対応）
  useEffect(()=>{
    if(!loaded) return;
    const today=todayStr();
    const nowM=toMin(now);
    const wakeM=toMin(settings.wakeTime);
    if(nowM<wakeM) return;
    // スヌーズ中か確認
    const snoozeTs=localStorage.getItem(MORNING_SNOOZE_KEY);
    if(snoozeTs){
      if(Date.now()<parseInt(snoozeTs)) return;
      localStorage.removeItem(MORNING_SNOOZE_KEY);
      morningShownRef.current=false;
      if(typeof Notification!=='undefined'&&Notification.permission==='granted'){
        const past2=tasks.filter(t=>!t.completed&&!t.isLater&&!!t.startTime&&!t.recurrence&&t.date<today);
        if(past2.length>0) new Notification('昨日のタスクが残っています',{body:`昨日のタスクが${past2.length}件残っています`});
      }
    }
    if(morningShownRef.current) return;
    const past=tasks.filter(t=>!t.completed&&!t.isLater&&!!t.startTime&&!t.recurrence&&t.date<today);
    if(past.length===0) return;
    morningShownRef.current=true;
    setMorningTasks(past);
    setMorningSel(new Set());
  },[loaded,tasks,settings.wakeTime,now]);

  // 起床時間に未完了タスク通知を送信
  useEffect(()=>{
    if(!loaded) return;
    const today=todayStr();
    const nowM=toMin(now);
    const wakeM=toMin(settings.wakeTime);
    if(nowM!==wakeM) return;
    const lastDate=localStorage.getItem(MORNING_NOTIF_KEY);
    if(lastDate===today) return;
    const past=tasks.filter(t=>!t.completed&&!t.isLater&&!!t.startTime&&!t.recurrence&&t.date<today);
    if(past.length===0) return;
    localStorage.setItem(MORNING_NOTIF_KEY,today);
    if(typeof Notification!=='undefined'&&Notification.permission==='granted'){
      new Notification('昨日のタスクが残っています',{body:`昨日のタスクが${past.length}件残っています`});
    }
  },[loaded,now,tasks,settings.wakeTime]);

  // 買い物リスト通知
  useEffect(()=>{
    if(!loaded||shopNotifSettings.length===0) return;
    const dow=new Date().getDay();
    const nowM=toMin(now);
    shopNotifSettings.forEach(s=>{
      if(!s.enabled||!s.days.includes(dow)||toMin(s.time)!==nowM) return;
      const key=`tl-shop-notif-fired-${s.id}-${todayStr()}`;
      if(localStorage.getItem(key)) return;
      const pending=shopItems.filter(i=>!i.checked);
      if(pending.length===0) return;
      localStorage.setItem(key,'1');
      if(typeof Notification!=='undefined'&&Notification.permission==='granted'){
        const names=pending.slice(0,3).map(i=>i.name).join('・')+(pending.length>3?'…':'');
        new Notification('買い物リスト',{body:`未購入 ${pending.length}件: ${names}`});
      }
    });
  },[loaded,now,shopNotifSettings,shopItems]);

  const filteredTasks = useMemo(()=>activeCategory?tasks.filter(t=>t.category===activeCategory):tasks,[tasks,activeCategory]);
  const laterTasks    = useMemo(()=>filteredTasks.filter(t=>t.isLater),[filteredTasks]);
  const pendingCount  = useMemo(()=>laterTasks.filter(t=>!t.completed).length,[laterTasks]);
  const shopPending   = useMemo(()=>shopItems.filter(i=>!i.checked).length,[shopItems]);
  const weekDates     = useMemo(()=>getWeekDates(date),[date]);
  const taskDateSet   = useMemo(()=>new Set(filteredTasks.filter(t=>!t.isLater&&t.startTime).map(t=>t.date)),[filteredTasks]);
  const {day,month,year} = useMemo(()=>getDateInfo(date),[date]);
  const today = todayStr();

  const effectiveSettings = useMemo(()=>{
    const ov=dayOverrides[date]??{};
    return {...settings, wakeTime:ov.wakeTime??settings.wakeTime, sleepTime:ov.sleepTime??settings.sleepTime};
  },[settings,dayOverrides,date]);

  // Drag task from あとでやる to timeline
  const startDrag=(task:Task,x:number,y:number)=>{
    setDragTask(task);
    setDragPos({x,y});
    setActiveTab(null);
  };
  const startDragSetting=(type:'wake'|'sleep',x:number,y:number)=>{
    setDragSetting(type);
    setDragPos({x,y});
    setDropTime(type==='wake'?effectiveSettings.wakeTime:effectiveSettings.sleepTime);
  };

  useEffect(()=>{
    if(!dragSetting) return;
    const calcTime=(clientY:number)=>{
      if(yToTimeRef.current) return yToTimeRef.current(clientY);
      const header=document.querySelector('header');
      const headerBottom=header?header.getBoundingClientRect().bottom:130;
      const wakeMin=toMin(settings.wakeTime);
      const rawMin=wakeMin+(clientY+window.scrollY-headerBottom-16)/PX_PER_MIN;
      return fromMin(Math.max(0,Math.min(23*60+55,Math.round(rawMin/5)*5)));
    };
    const onMove=(e:TouchEvent)=>{
      e.preventDefault();
      const t=e.touches[0];
      setDragPos({x:t.clientX,y:t.clientY});
      setDropTime(calcTime(t.clientY));
    };
    const onEnd=(e:TouchEvent)=>{
      const t=e.changedTouches[0];
      const time=calcTime(t.clientY);
      setSettingConfirm({type:dragSetting,newTime:time});
      setDragSetting(null);
      setDropTime(null);
    };
    document.addEventListener('touchmove',onMove,{passive:false});
    document.addEventListener('touchend',onEnd);
    return ()=>{document.removeEventListener('touchmove',onMove);document.removeEventListener('touchend',onEnd);};
  },[dragSetting,settings]);

  useEffect(()=>{
    if(!dragTask) return;
    const calcTime=(clientY:number)=>{
      if(yToTimeRef.current) return yToTimeRef.current(clientY);
      const header=document.querySelector('header');
      const headerBottom=header?header.getBoundingClientRect().bottom:130;
      const wakeMin=toMin(settings.wakeTime);
      const rawMin=wakeMin+(clientY+window.scrollY-headerBottom-16)/PX_PER_MIN;
      const snapped=Math.round(rawMin/5)*5;
      return fromMin(Math.max(0,Math.min(23*60+55,snapped)));
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
        if(dragTask.recurrence){
          setPendingDragMove({task:dragTask,time});
        } else {
          setTasks(prev=>prev.map(tk=>tk.id===dragTask.id
            ? dragTask.isLater ? {...tk,isLater:false,startTime:time,date} : {...tk,startTime:time}
            : tk
          ));
        }
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

  const addCustomTab=()=>{
    const newTab:CustomTab={id:uid(),name:`タブ${customTabs.length+1}`};
    setCustomTabs(prev=>[...prev,newTab]);
    setActiveCat(newTab.id);
    setEditTabId(newTab.id);
    setEditTabName(newTab.name);
  };
  const saveEditTab=()=>{
    if(!editTabId) return;
    const n=editTabName.trim();
    if(n) setCustomTabs(prev=>prev.map(t=>t.id===editTabId?{...t,name:n}:t));
    setEditTabId(null);
  };
  const deleteCustomTab=(id:string)=>{
    setCustomTabs(prev=>prev.filter(t=>t.id!==id));
    if(activeCategory===id) setActiveCat(null);
    setEditTabId(null);
  };

  const updateTask = (data: Omit<Task,'id'>) => {
    if(!modal.task) return;
    const id = modal.task.id;
    setTasks(prev=>prev.map(t=>t.id===id?{...t,...data,id}:t));
  };

  const openAdd  = (prefillTime?:string) => setModal({open:true,task:null,prefillTime,prefillCategory:activeCategory??undefined});
  const openEdit = (task:Task) => {
    if(task.recurrence) { setRecConfirm(task); } else { setModal({open:true,task}); }
  };
  const openEditAtPhotos = (taskId:string) => {
    const task=tasks.find(t=>t.id===taskId); if(!task) return;
    setModal({open:true,task,scrollToPhotos:true});
  };
  const openEditIconSheet=(task:Task)=>{
    if(task.recurrence){setRecConfirm(task);}else{setModal({open:true,task,iconSheet:true});}
  };
  const closeModal = () => setModal({open:false,task:null});

  const saveTasks = (data:Omit<Task,'id'>[], pendingPhotos?:string[]) => {
    if(editScope==='all'&&modal.task){
      const orig=modal.task, d=data[0];
      setTasks(prev=>prev.map(t=>
        t.name===orig.name&&t.recurrence===orig.recurrence&&t.startTime===orig.startTime
          ?{...t,name:d.name,duration:d.duration,memo:d.memo,icon:d.icon,category:d.category,tags:d.tags,notifications:d.notifications}
          :t
      ));
    } else {
      const newTasks=data.map(d=>({...d,id:uid()}));
      if(pendingPhotos&&pendingPhotos.length>0&&newTasks.length>0){
        try{const s=JSON.parse(localStorage.getItem(PHOTOS_KEY)||'{}') as Record<string,string[]>;s[newTasks[0].id]=pendingPhotos;localStorage.setItem(PHOTOS_KEY,JSON.stringify(s));}catch{}
      }
      setTasks(prev=>modal.task
        ?prev.map(t=>t.id===modal.task!.id?{...newTasks[0],id:t.id}:t)
        :[...prev,...newTasks]
      );
    }
    setEditScope('one');
    closeModal();
  };
  const subtaskToggle = (taskId:string, subtaskId:string) =>
    setTasks(prev=>prev.map(t=>t.id===taskId
      ?{...t,subtasks:t.subtasks?.map(s=>s.id===subtaskId?{...s,completed:!s.completed}:s)}
      :t));
  const delTask  = (id:string) => {
    setTasks(prev=>prev.filter(t=>t.id!==id));
    try{const s=JSON.parse(localStorage.getItem(PHOTOS_KEY)||'{}') as Record<string,string[]>;delete s[id];localStorage.setItem(PHOTOS_KEY,JSON.stringify(s));}catch{}
  };
  const toggle   = (id:string) => setTasks(prev=>prev.map(t=>t.id===id?{...t,completed:!t.completed}:t));
  const scheduleInSlot=(task:Task,startTime:string)=>setModal({open:true,task:{...task,isLater:false,startTime,date}});
  const moveToTimeline=(task:Task)=>setModal({open:true,task:{...task,isLater:false}});
  const handleMorningAction=(type:'done'|'later')=>{
    const ids=morningSelected;
    setTasks(prev=>prev.map(t=>{
      if(!ids.has(t.id)) return t;
      if(type==='done') return {...t,completed:true};
      return {...t,isLater:true,startTime:null};
    }));
    const remaining=(morningTasks||[]).filter(t=>!ids.has(t.id));
    if(remaining.length===0){setMorningTasks(null);}
    else{setMorningTasks(remaining);setMorningSel(new Set());}
  };
  const handleMorningSnooze=(minutes:number)=>{
    const ts=Date.now()+minutes*60*1000;
    localStorage.setItem(MORNING_SNOOZE_KEY,String(ts));
    setMorningTasks(null);
    morningShownRef.current=false;
  };
  const handleMorningClose=()=>{
    setMorningTasks(null);
    morningShownRef.current=true;
  };
  const carryOver=()=>{
    const next=shiftDate(date,1);
    const toMove=tasks.filter(t=>t.date===date&&!t.completed&&!t.isLater);
    const rest=tasks.filter(t=>!(t.date===date&&!t.completed&&!t.isLater));
    setTasks([...rest,...toMove.map(t=>({...t,id:uid(),date:next}))]);
    setDate(next); setSOp(false);
  };

  if(!loaded) return <div className="flex h-screen items-center justify-center text-gray-400">読み込み中…</div>;

  return (
    <div className="max-w-md mx-auto min-h-screen bg-white font-sans">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-gray-50">
        <div className="px-4 pt-1 pb-0">
          {/* Date + nav */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-2xl font-bold text-gray-900">{year}年{month}月</span>
            <div className="flex items-center gap-1">
              <button onClick={()=>setSettings(s=>({...s,showFreeCard:!(s.showFreeCard??true)}))}
                className={`relative h-7 rounded-full text-xs font-medium transition-colors duration-200 mr-1 overflow-hidden ${(settings.showFreeCard??true)?'bg-[#D9A3B2] text-white':'bg-gray-200 text-gray-500'}`}
                style={{width:'84px'}}>
                <span className="absolute inset-0 flex items-center justify-center" style={{paddingLeft:(settings.showFreeCard??true)?'0':'10px',paddingRight:(settings.showFreeCard??true)?'10px':'0',transition:'padding 0.2s'}}>空き時間</span>
                <span className="absolute top-1.5 w-4 h-4 bg-white rounded-full" style={{boxShadow:'0 1px 3px rgba(0,0,0,0.2)',transition:'left 0.2s',left:(settings.showFreeCard??true)?'calc(100% - 22px)':'6px'}}/>
              </button>
              <button onClick={()=>setCalOp(true)} className="w-8 h-8 flex items-center justify-center text-gray-400"><AppIcons.calendar size={24}/></button>
              <button onClick={()=>setSearchOpen(true)} className="w-8 h-8 flex items-center justify-center text-gray-400"><AppIcons.search size={24}/></button>
              <button onClick={()=>setSOp(true)} className="w-8 h-8 flex items-center justify-center text-gray-400"><AppIcons.settings size={24}/></button>
            </div>
          </div>

          {/* Week calendar */}
          <div className="grid grid-cols-7 pt-1 pb-0.5"
            onTouchStart={e=>{weekSwX.current=e.touches[0].clientX;weekSwY.current=e.touches[0].clientY;}}
            onTouchEnd={e=>{
              const dx=e.changedTouches[0].clientX-weekSwX.current;
              const dy=e.changedTouches[0].clientY-weekSwY.current;
              if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5) setDate(shiftDate(date,dx<0?7:-7));
            }}>
            {DAY_NAMES.map((name,i)=>{
              const d=weekDates[i];
              const isSel=d===date, isToday=d===today;
              return (
                <button key={i} onClick={()=>setDate(d)} className="flex flex-col items-center py-1">
                  <span className="text-[13px] font-medium text-gray-400">{name}</span>
                  <span className={`w-8 h-8 flex items-center justify-center rounded-full font-bold transition-colors ${isSel?'bg-[#D9A3B2] text-white':isToday?'bg-gray-200 text-gray-900':'text-gray-600'}`} style={{fontSize:'17px'}}>
                    {new Date(d+'T12:00:00').getDate()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        {/* Category filter tabs */}
        <div className="bg-gray-50">
          <div className="tabs-scroll flex items-end pl-3 pt-2" style={{overflowX:'auto',WebkitOverflowScrolling:'touch',overflowY:'hidden',touchAction:'pan-x'}}>
          <button onClick={()=>{setActiveCat(null);setEditTabId(null);}} className="shrink-0 relative"
            style={activeCategory===null?{
              width:'80px',padding:'7px 12px 9px',background:'#D9A3B2',color:'white',fontWeight:700,fontSize:'0.875rem',
              border:'none',borderRadius:'14px 14px 0 0',marginBottom:'-2px',zIndex:10,
              boxShadow:'0 4px 12px rgba(0,0,0,0.10)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
            }:{
              width:'80px',padding:'5px 12px',background:'#FFFFFF',color:'#6B7280',fontWeight:600,fontSize:'0.875rem',
              border:'none',borderRadius:'14px 14px 0 0',marginBottom:'2px',
              boxShadow:'0 4px 10px rgba(0,0,0,0.08)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
            }}>すべて</button>
          {customTabs.map(tab=>{
            const active=activeCategory===tab.id;
            return (
              <button key={tab.id} onClick={()=>{
                if(active){setEditTabId(tab.id);setEditTabName(tab.name);}
                else{setActiveCat(tab.id);setEditTabId(null);}
              }} className="shrink-0 relative"
                style={active?{
                  width:'80px',padding:'7px 12px 9px',background:'#D9A3B2',color:'white',fontWeight:700,fontSize:'0.875rem',
                  border:'none',borderRadius:'14px 14px 0 0',marginBottom:'-2px',zIndex:10,
                  boxShadow:'0 4px 12px rgba(0,0,0,0.10)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                }:{
                  width:'80px',padding:'5px 12px',background:'#FFFFFF',color:'#6B7280',fontWeight:600,fontSize:'0.875rem',
                  border:'none',borderRadius:'14px 14px 0 0',marginBottom:'2px',
                  boxShadow:'0 4px 10px rgba(0,0,0,0.08)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                }}>{tab.name}</button>
            );
          })}
          <button onClick={addCustomTab}
            className="shrink-0 w-8 h-7 flex items-center justify-center text-gray-400 text-xl font-light ml-1 mb-0.5">+</button>
          <div className="shrink-0" style={{width:'12px'}}/>
          </div>
        </div>
        {editTabId&&(
          <div className="flex gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
            <input value={editTabName} onChange={e=>setEditTabName(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter') saveEditTab();}}
              autoFocus
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-gray-400 bg-gray-50"/>
            <button onClick={saveEditTab} className="px-3 py-1.5 bg-[#D9A3B2] text-white rounded-lg text-xs font-semibold">完了</button>
            <button onClick={()=>deleteCustomTab(editTabId)} className="p-1.5 text-[#D97A7A]"><AppIcons.trash size={16}/></button>
          </div>
        )}
      </header>

      {/* ── Timeline ── */}
      <main className="px-3 pt-3 pb-24"
        onTouchStart={e=>{mainSwX.current=e.touches[0].clientX;mainSwY.current=e.touches[0].clientY;}}
        onTouchEnd={e=>{
          if(dragTask) return;
          const dx=e.changedTouches[0].clientX-mainSwX.current;
          const dy=e.changedTouches[0].clientY-mainSwY.current;
          if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5) setDate(shiftDate(date,dx<0?1:-1));
        }}>
        <Timeline date={date} tasks={filteredTasks} later={laterTasks} settings={effectiveSettings} now={now}
          onToggle={toggle} onEdit={openEdit} onEditIconSheet={openEditIconSheet} onSchedule={scheduleInSlot} onAddAtTime={openAdd}
          onDragStart={startDrag} dragTaskId={dragTask?.id} yToTimeRef={yToTimeRef} layoutYRef={layoutYRef} globalTags={globalTags}
          todayHistory={moveHistory.find(h=>h.date===date)} onSubtaskToggle={subtaskToggle}
          onDragWake={(x,y)=>startDragSetting('wake',x,y)}
          onDragSleep={(x,y)=>startDragSetting('sleep',x,y)}
          onCameraClick={openEditAtPhotos}/>
      </main>

      {/* ── Bottom bar ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 max-w-md mx-auto bg-gray-50 rounded-t-2xl"
        style={{boxShadow:'0 -4px 16px rgba(0,0,0,0.10)'}}
        onTouchStart={e=>setTouchY(e.touches[0].clientY)}
        onTouchEnd={e=>{ if(touchY-e.changedTouches[0].clientY>30) setActiveTab('later'); }}
      >
        <div className="flex">
          {([['later','あとでやる',pendingCount],['shop','買い物リスト',shopPending]] as const).map(([tab,label,cnt],i)=>(
            <button key={tab} onClick={()=>setActiveTab(t=>t===tab?null:tab)}
              className={`flex-1 flex items-center justify-center gap-2 py-8 transition-colors ${i===0?'border-r border-gray-300':''} ${activeTab===tab?'bg-gray-100':''}`}>
              <span className={`text-base font-semibold ${activeTab===tab?'text-gray-900':'text-gray-500'}`}>{label}</span>
              {cnt>0&&<span className="text-[13px] bg-[#D9A3B2] text-white min-w-[22px] h-[22px] rounded-full flex items-center justify-center font-bold px-1">{cnt}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ── FAB ── */}
      <div className="fixed bottom-24 right-4 z-50">
        <button onClick={()=>openAdd()}
          className="w-14 h-14 bg-[#D9A3B2] text-white rounded-full shadow-2xl active:bg-gray-700"
          style={{display:'grid',placeItems:'center'}}>
          <AppIcons.plus size={28} className="block"/>
        </button>
      </div>

      {/* ── Bottom sheet ── */}
      {activeTab&&(
        <BottomTabs activeTab={activeTab} onSwitchTab={setActiveTab} onClose={()=>setActiveTab(null)}
          tasks={filteredTasks} shopItems={shopItems} pendingCount={pendingCount} shopPending={shopPending}
          onToggle={toggle} onEdit={openEdit}
          onAddShop={addShopItem} onToggleShop={toggleShop} onDeleteShop={deleteShop}
          onDragStart={startDrag}
          shopNotifSettings={shopNotifSettings} onShopNotifSettings={setShopNotifSettings}/>
      )}

      {/* あとでやる FAB */}
      {activeTab==='later'&&(
        <div className="fixed bottom-6 right-4 z-[60]">
          <button onClick={()=>{setActiveTab(null);openAdd();}}
            className="w-14 h-14 bg-[#D9A3B2] text-white rounded-full shadow-2xl active:bg-gray-700"
            style={{display:'grid',placeItems:'center'}}><AppIcons.plus size={28} className="block"/></button>
        </div>
      )}

      {/* ── Drag overlay ── */}
      {(dragTask||dragSetting)&&(
        <div className="fixed inset-0 z-[70] pointer-events-none">
          {/* Drop time line */}
          {dropTime&&!overTrash&&!overLater&&(
            <div className="absolute right-0 flex items-center justify-end"
              style={{top:`${layoutYRef.current?layoutYRef.current(toMin(dropTime)):dragPos.y}px`,left:'68px'}}>
              <span className="bg-gray-600 text-white text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 mr-2">{dropTime}</span>
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
                {dragTask?(
                  <>
                    <p className="text-sm font-bold text-gray-900 truncate">{dragTask.name}</p>
                    <p className="text-xs text-blue-500 mt-0.5 font-semibold">{dropTime??'ドラッグして配置'}</p>
                  </>
                ):(
                  <>
                    <p className="text-sm font-bold text-gray-900">{dragSetting==='wake'?'起床':'就寝'}</p>
                    <p className="text-xs text-blue-500 mt-0.5 font-semibold">{dropTime??'ドラッグして配置'}</p>
                  </>
                )}
              </div>
            </div>
          )}
          {/* Bottom drop zones */}
          <div className="absolute bottom-0 left-0 right-0 h-24 flex">
            <div className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${dragSetting?'bg-gray-50 opacity-30':overTrash?'bg-[#D97A7A]':'bg-red-50'}`}>
              <AppIcons.trash size={28} className={dragSetting?'text-gray-300':overTrash?'text-white':'text-[#D97A7A]'}/>
              <span className={`text-xs font-bold ${dragSetting?'text-gray-300':overTrash?'text-white':'text-[#D97A7A]'}`}>削除する</span>
            </div>
            <div className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${dragSetting?'bg-gray-50 opacity-30':overLater?'bg-blue-400':'bg-blue-50'}`}>
              <AppIcons.postponed size={28} className={dragSetting?'text-gray-300':overLater?'text-white':'text-blue-400'}/>
              <span className={`text-xs font-bold ${dragSetting?'text-gray-300':overLater?'text-white':'text-blue-400'}`}>あとでやるに戻す</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Setting time confirm popup ── */}
      {settingConfirm&&(
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-end justify-center" onClick={()=>setSettingConfirm(null)}>
          <div className="bg-white w-full max-w-md rounded-t-3xl px-5 pt-6 pb-10 shadow-2xl" onClick={e=>e.stopPropagation()}>
            <p className="text-base font-bold text-gray-900 mb-1">{settingConfirm.type==='wake'?'起床':'就寝'}時間を変更</p>
            <p className="text-sm text-gray-500 mb-6">{settingConfirm.newTime} に変更します</p>
            <div className="space-y-3">
              <button onClick={()=>{
                const key=settingConfirm.type==='wake'?'wakeTime':'sleepTime';
                setDayOverrides(prev=>({...prev,[date]:{...prev[date],[key]:settingConfirm.newTime}}));
                setSettingConfirm(null);
              }} className="w-full py-3.5 bg-gray-100 rounded-2xl text-sm font-semibold text-gray-900">この日だけ変更</button>
              <button onClick={()=>{
                const key=settingConfirm.type==='wake'?'wakeTime':'sleepTime';
                setSettings(prev=>({...prev,[key]:settingConfirm.newTime}));
                setDayOverrides(prev=>{
                  const n={...prev};
                  if(n[date]){const d={...n[date]};delete d[key];if(!Object.keys(d).length)delete n[date];else n[date]=d;}
                  return n;
                });
                setSettingConfirm(null);
              }} className="w-full py-3.5 bg-[#D9A3B2] rounded-2xl text-sm font-semibold text-white">他の日も全部この時間に変更</button>
              <button onClick={()=>setSettingConfirm(null)} className="w-full py-2.5 text-sm text-gray-400 font-semibold">キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Week Icon View ── */}

      {/* ── Calendar ── */}
      {calendarOpen&&(
        <CalendarPage date={date} tasks={tasks} customTabs={customTabs} onSelect={(d)=>{setDate(d);setCalOp(false);}} onClose={()=>setCalOp(false)}/>
      )}

      {/* ── Search ── */}
      {searchOpen&&(
        <SearchPage tasks={tasks} onClose={()=>setSearchOpen(false)}
          onSelect={(t)=>{if(!t.isLater)setDate(t.date);setSearchOpen(false);}}/>
      )}

      {/* ── Task Modal ── */}
      {modal.open&&(
        <TaskModal task={modal.task} currentDate={date} prefillTime={modal.prefillTime} prefillCategory={modal.prefillCategory} openIconSheet={!!modal.iconSheet}
          scrollToPhotos={!!modal.scrollToPhotos}
          onSave={saveTasks} onUpdate={modal.task?updateTask:undefined}
          onDelete={modal.task?()=>delTask(modal.task!.id):undefined}
          onClose={closeModal} globalTags={globalTags} customTabs={customTabs}/>
      )}

      {/* ── Settings Screen ── */}
      {settingsOpen&&(
        <SettingsScreen settings={settings} onSettings={setSettings} onClose={()=>setSOp(false)} globalTags={globalTags} onGlobalTags={setGlobalTags} customTabs={customTabs} onCustomTabs={setCustomTabs} shopNotifSettings={shopNotifSettings} onShopNotifSettings={setShopNotifSettings}/>
      )}

      {/* ── Recurrence edit confirm ── */}
      {pendingDragMove&&(
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-end justify-center" onClick={()=>setPendingDragMove(null)}>
          <div className="bg-white w-full max-w-md rounded-t-3xl px-5 pt-6 pb-10 shadow-2xl" onClick={e=>e.stopPropagation()}>
            <p className="text-base font-bold text-gray-900 mb-1">繰り返し予定の移動</p>
            <p className="text-sm text-gray-500 mb-6">「{pendingDragMove.task.name}」を {pendingDragMove.time} に移動しますか？</p>
            <div className="space-y-3">
              <button onClick={()=>{
                const {task:orig,time}=pendingDragMove;
                setTasks(prev=>prev.map(tk=>tk.id===orig.id?{...tk,startTime:time}:tk));
                setPendingDragMove(null);
              }} className="w-full py-3.5 bg-gray-100 rounded-2xl text-sm font-semibold text-gray-900">この予定のみ変更</button>
              <button onClick={()=>{
                const {task:orig,time}=pendingDragMove;
                setTasks(prev=>prev.map(tk=>
                  tk.name===orig.name&&tk.recurrence===orig.recurrence&&tk.startTime===orig.startTime
                    ?{...tk,startTime:time}:tk
                ));
                setPendingDragMove(null);
              }} className="w-full py-3.5 bg-[#D9A3B2] rounded-2xl text-sm font-semibold text-white">すべての予定を変更</button>
              <button onClick={()=>setPendingDragMove(null)}
                className="w-full py-2.5 text-sm text-gray-400 font-semibold">キャンセル</button>
            </div>
          </div>
        </div>
      )}
      {recConfirm&&(
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-end justify-center" onClick={()=>setRecConfirm(null)}>
          <div className="bg-white w-full max-w-md rounded-t-3xl px-5 pt-6 pb-10 shadow-2xl" onClick={e=>e.stopPropagation()}>
            <p className="text-base font-bold text-gray-900 mb-1">繰り返し予定の変更</p>
            <p className="text-sm text-gray-500 mb-6">「{recConfirm.name}」をどのように変更しますか？</p>
            <div className="space-y-3">
              <button onClick={()=>{setEditScope('one');setModal({open:true,task:recConfirm});setRecConfirm(null);}}
                className="w-full py-3.5 bg-gray-100 rounded-2xl text-sm font-semibold text-gray-900">この予定のみ変更</button>
              <button onClick={()=>{setEditScope('all');setModal({open:true,task:recConfirm});setRecConfirm(null);}}
                className="w-full py-3.5 bg-[#D9A3B2] rounded-2xl text-sm font-semibold text-white">すべての予定を変更</button>
              <button onClick={()=>setRecConfirm(null)}
                className="w-full py-2.5 text-sm text-gray-400 font-semibold">キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Morning check popup ── */}
      {morningTasks&&(
        <MorningCheckModal
          tasks={morningTasks}
          selected={morningSelected}
          onToggle={id=>setMorningSel(prev=>{const s=new Set(prev);s.has(id)?s.delete(id):s.add(id);return s;})}
          onSelectAll={()=>setMorningSel(prev=>prev.size===morningTasks.length?new Set():new Set(morningTasks.map(t=>t.id)))}
          onAction={handleMorningAction}
          onSnooze={handleMorningSnooze}
          onClose={handleMorningClose}
        />
      )}
    </div>
  );
}
