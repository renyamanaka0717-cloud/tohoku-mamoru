'use client';

import { useState, useEffect, useMemo, useRef } from 'react';

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
  recurrence?: 'daily' | 'weekly' | 'monthly' | 'yearly' | null;
  pinned?: boolean;
  tags?: string[];
}

interface Settings { wakeTime: string; sleepTime: string; }
interface FreeSlot  { start: string; end: string; min: number; }
interface ShopItem  { id: string; name: string; checked: boolean; }

type TaskMode = 'later' | 'scheduled' | 'recurring';

// ── Constants ─────────────────────────────────────────────────────────────────

const ICONS = ['📝','💼','🏃','🍽️','📚','💊','🛒','🏠','💻','📞','🎯','⭐','🎵','🛁','🐕','✅'];
const DEFAULT_SETTINGS: Settings = { wakeTime: '07:00', sleepTime: '23:00' };
const TASKS_KEY    = 'tl-tasks-v2';
const SETTINGS_KEY = 'tl-settings-v2';
const SHOP_KEY     = 'tl-shop-v1';
const PX_PER_HOUR  = 100;
const PX_PER_MIN   = PX_PER_HOUR / 60;
const DAY_NAMES    = ['日','月','火','水','木','金','土'];
const DUR_OPTS     = [{v:0,l:'なし'},{v:5,l:'5分'},{v:10,l:'10分'},{v:15,l:'15分'},{v:30,l:'30分'}];

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
            <button onClick={()=>setVm(m=>shiftMonth(m.year,m.month,-1))} className="w-9 h-9 flex items-center justify-center text-gray-600 text-xl font-semibold">‹</button>
            <span className="font-bold text-gray-900 text-base">{vm.year}年{vm.month+1}月</span>
            <button onClick={()=>setVm(m=>shiftMonth(m.year,m.month,1))} className="w-9 h-9 flex items-center justify-center text-gray-600 text-xl font-semibold">›</button>
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
                        <p className="text-[9px] text-gray-600 truncate leading-tight py-px">{t.icon} {t.name}</p>
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
  return '📝';
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

  const [mode,setMode]        = useState<TaskMode>(initMode());
  const [name,setName]        = useState(task?.name??'');
  const [startTime,setST]     = useState(task?.startTime??prefillTime??nowStr());
  const [duration,setDur]     = useState(task?.duration??0);
  const [memo,setMemo]        = useState(task?.memo??'');
  const [icon,setIcon]        = useState(task?.icon??'📝');
  const [recur,setRecur]      = useState<'daily'|'weekly'|'monthly'|'yearly'>(
    task?.recurrence==='weekly'?'weekly':
    task?.recurrence==='monthly'?'monthly':
    task?.recurrence==='yearly'?'yearly':'daily'
  );
  const [pinned,setPinned]    = useState(task?.pinned??false);
  const [tags,setTags]        = useState<string[]>(task?.tags??[]);
  const [tagInput,setTagInput]= useState('');
  const [iconOpen,setIconOpen]= useState(false);
  const [taskDate,setTaskDate]= useState(task?.date??currentDate);
  const [dateOpen,setDateOpen]= useState(false);
  const [calVm,setCalVm]      = useState(()=>{
    const d=new Date((task?.date??currentDate)+'T12:00:00');
    return {year:d.getFullYear(),month:d.getMonth()};
  });

  const headerIcon = mode==='later' ? icon : autoIcon(name);

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

  const addTag=()=>{
    const t=tagInput.trim();
    if(!t||tags.includes(t)) return;
    setTags(prev=>[...prev,t]);
    setTagInput('');
  };

  const save=()=>{
    if(!name.trim()) return;
    const dur=duration;
    const base:Omit<Task,'id'>={
      name:name.trim(),
      startTime:mode==='later'?null:(startTime||null),
      duration:dur,
      memo,
      icon:mode==='later'?icon:autoIcon(name.trim()),
      completed:task?.completed??false,
      date:mode==='scheduled'?taskDate:(task?.date??currentDate),
      isLater:mode==='later',
      recurrence:mode==='recurring'?recur:null,
      pinned,
      tags,
    };
    if(mode==='recurring'&&!task){
      const instances:Omit<Task,'id'>[]=[];
      if(recur==='daily'){
        for(let i=0;i<14;i++) instances.push({...base,date:shiftDate(currentDate,i)});
      } else if(recur==='weekly'){
        for(let i=0;i<4;i++) instances.push({...base,date:shiftDate(currentDate,i*7)});
      } else if(recur==='monthly'){
        for(let i=0;i<12;i++) instances.push({...base,date:shiftMonthBy(currentDate,i)});
      } else if(recur==='yearly'){
        for(let i=0;i<5;i++) instances.push({...base,date:shiftYearBy(currentDate,i)});
      }
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
                <p className="text-xs text-gray-400 mb-0.5">{startTime}{computedEnd?`〜${computedEnd}`:''}{mode==='recurring'&&' · 繰り返し'}</p>
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
              <div className="flex gap-2 flex-wrap">
                {([['daily','毎日'],['weekly','毎週'],['monthly','毎月'],['yearly','毎年']] as ['daily'|'weekly'|'monthly'|'yearly',string][]).map(([r,l])=>(
                  <button key={r} onClick={()=>setRecur(r)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold ${recur===r?'bg-gray-900 text-white':'bg-gray-100 text-gray-600'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 日付選択 (scheduled only) */}
          {mode==='scheduled'&&(
            <div className="bg-white mx-3 mt-3 rounded-2xl overflow-hidden">
              <button className="w-full flex items-center justify-between px-4 py-3"
                onClick={()=>setDateOpen(o=>!o)}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">📅</span>
                  <span className="text-sm font-semibold text-gray-800">日付</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-gray-700">{taskDateLabel()}</span>
                  <span className={`text-gray-400 text-xs transition-transform ${dateOpen?'rotate-180':''}`}>∨</span>
                </div>
              </button>
              {dateOpen&&(
                <div className="border-t border-gray-50 px-3 pb-3">
                  {/* Month nav */}
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm font-bold text-gray-800">
                      {calVm.year}年{calVm.month+1}月
                    </span>
                    <div className="flex gap-1">
                      <button onClick={()=>setCalVm(m=>shiftMonth(m.year,m.month,-1))}
                        className="w-7 h-7 flex items-center justify-center text-gray-500 rounded-lg bg-gray-100 text-sm">‹</button>
                      <button onClick={()=>setCalVm(m=>shiftMonth(m.year,m.month,1))}
                        className="w-7 h-7 flex items-center justify-center text-gray-500 rounded-lg bg-gray-100 text-sm">›</button>
                    </div>
                  </div>
                  {/* Day headers */}
                  <div className="grid grid-cols-7 mb-1">
                    {DAY_NAMES.map((n,i)=>(
                      <div key={i} className={`text-center text-[11px] font-semibold py-1 ${i===0?'text-red-400':i===6?'text-blue-400':'text-gray-400'}`}>{n}</div>
                    ))}
                  </div>
                  {/* Calendar grid */}
                  <div className="grid grid-cols-7">
                    {calDays.map((d,i)=>{
                      const isSel=d===taskDate, isToday=d===todayStr();
                      return (
                        <button key={i} disabled={!d} onClick={()=>{if(d){setTaskDate(d);setDateOpen(false);}}}
                          className="flex items-center justify-center py-1">
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                            !d?'':isSel?'bg-gray-900 text-white':isToday?'bg-gray-100 font-bold text-gray-900':'text-gray-600'
                          }`}>
                            {d?new Date(d+'T12:00:00').getDate():''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 開始時刻 (scheduled/recurring only) */}
          {(mode==='scheduled'||mode==='recurring')&&(
            <div className="bg-white mx-3 mt-3 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🕐</span>
                  <span className="text-sm font-semibold text-gray-800">開始時刻</span>
                </div>
                {startTime&&computedEnd&&(
                  <span className="text-sm font-semibold text-gray-500">{startTime}〜{computedEnd}</span>
                )}
              </div>
              <input type="time" value={startTime} onChange={e=>setST(e.target.value)}
                className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 outline-none focus:border-gray-400"/>
            </div>
          )}

          {/* 所要時間 — all modes */}
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

          {/* Pin + Tags */}
          <div className="bg-white mx-3 mt-3 rounded-2xl overflow-hidden">
            {/* Pin toggle */}
            <div className="flex items-center justify-between p-4 border-b border-gray-50">
              <div className="flex items-center gap-3">
                <span className="text-xl w-8 text-center">📌</span>
                <div>
                  <p className="text-sm font-semibold text-gray-800">ピン留め</p>
                  <p className="text-xs text-gray-400">リストの上部に固定表示</p>
                </div>
              </div>
              <button onClick={()=>setPinned(p=>!p)}
                className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${pinned?'bg-gray-900':'bg-gray-200'}`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${pinned?'left-[22px]':'left-0.5'}`}/>
              </button>
            </div>

            {/* Tags */}
            <div className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xl w-8 text-center">🏷️</span>
                <p className="text-sm font-semibold text-gray-800">タグ</p>
              </div>
              {tags.length>0&&(
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {tags.map(t=>(
                    <span key={t} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs font-medium px-2.5 py-1 rounded-full">
                      {t}
                      <button onClick={()=>setTags(prev=>prev.filter(x=>x!==t))} className="text-gray-400 leading-none ml-0.5">×</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input type="text" value={tagInput} onChange={e=>setTagInput(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&addTag()}
                  placeholder="タグを入力して追加..."
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 outline-none focus:border-gray-400"/>
                <button onClick={addTag} disabled={!tagInput.trim()}
                  className="px-3 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold disabled:opacity-40">追加</button>
              </div>
            </div>
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
        {(task.tags??[]).length>0&&(
          <div className="flex flex-wrap gap-1 mt-1">
            {(task.tags??[]).map(tag=>(
              <span key={tag} className="bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded-full">{tag}</span>
            ))}
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

function FreeTimeCard({slot,fits,height,onSchedule}:{slot:FreeSlot;fits:Task[];height:number;onSchedule:(t:Task,time:string)=>void;}) {
  const h=Math.floor(slot.min/60), m=slot.min%60;
  return (
    <div className="bg-gray-100 rounded-2xl px-4 pt-3 pb-4" style={{minHeight:`${height}px`}}>
      <div className="flex items-center gap-1 mb-1.5">
        <span className="text-xs">🕐</span>
        <span className="text-xs text-gray-400 font-medium">空き時間</span>
      </div>
      <p className="font-black text-gray-800 leading-none mb-3">
        {h>0&&<span className="text-[2rem]">{h}時間</span>}
        {m>0&&<span className="text-[2rem] ml-0.5"> {m}分</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        {fits.map(t=>(
          <button key={t.id} onClick={()=>onSchedule(t,slot.start)}
            className="inline-flex items-center gap-1.5 bg-white rounded-full px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm">
            <span className="w-3.5 h-3.5 border border-gray-300 rounded-sm shrink-0"/>
            <span>{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────────

function Timeline({date,tasks,later,settings,now,onToggle,onEdit,onSchedule,onAddAtTime,onDragStart,dragTaskId}:{
  date:string;tasks:Task[];later:Task[];settings:Settings;now:string;
  onToggle:(id:string)=>void;onEdit:(t:Task)=>void;
  onSchedule:(t:Task,time:string)=>void;onAddAtTime:(time:string)=>void;
  onDragStart:(t:Task,x:number,y:number)=>void;dragTaskId?:string;
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
  const wakeMin=toMin(settings.wakeTime),sleepMin=toMin(settings.sleepTime);
  const totalMins=sleepMin-wakeMin;
  const nowMin=toMin(now);
  const calcY=(min:number)=>(min-wakeMin)*PX_PER_MIN;

  const dayTasks=tasks.filter(t=>t.date===date&&!t.isLater&&t.startTime).sort((a,b)=>toMin(a.startTime!)-toMin(b.startTime!));
  const freeSlots=calcFreeSlots(tasks,date,settings);
  const laterPool=later.filter(t=>!t.completed);

  // Combined layout: tasks + free slots in time order, no overlaps
  const MIN_CARD_H = 60;
  type TLItem = {type:'task';t:Task;y:number}|{type:'free';s:FreeSlot;y:number};
  const allItems:TLItem[] = [
    ...dayTasks.map(t=>({type:'task' as const,t,y:calcY(toMin(t.startTime!))})),
    ...freeSlots.map(s=>({type:'free' as const,s,y:calcY(toMin(s.start))})),
  ].sort((a,b)=>a.y-b.y);

  let prevBottom=-Infinity;
  const taskLayout:{task:Task;top:number;h:number}[]=[];
  const freeLayout:{slot:FreeSlot;freeY:number;cardH:number}[]=[];

  for(const item of allItems){
    if(item.type==='task'){
      const top=Math.max(item.y,prevBottom+2);
      const h=Math.max(MIN_CARD_H,(item.t.duration??0)*PX_PER_MIN);
      taskLayout.push({task:item.t,top,h});
      prevBottom=top+h;
    } else {
      const slotEndY=calcY(toMin(item.s.end));
      const freeY=Math.max(item.y,prevBottom)+2;
      const cardH=Math.max(60,Math.min(item.s.min*PX_PER_MIN-4,slotEndY-freeY));
      freeLayout.push({slot:item.s,freeY,cardH});
      prevBottom=freeY+cardH;
    }
  }

  const maxBottom=Math.max(
    taskLayout.length?taskLayout[taskLayout.length-1].top+taskLayout[taskLayout.length-1].h:0,
    freeLayout.length?freeLayout[freeLayout.length-1].freeY+freeLayout[freeLayout.length-1].cardH:0,
  );
  const totalHeight=Math.max(totalMins*PX_PER_MIN,maxBottom+32);

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
      {taskLayout.map(({task,top,h})=>{
        const isDragging=dragTaskId===task.id;
        const isPressing=pressingId===task.id;
        return (
          <div key={task.id} className={`absolute z-10 transition-transform select-none ${isPressing?'scale-95':''}`}
            style={{top:`${top}px`,left:`${CARD_LEFT}px`,right:'0px',minHeight:`${h}px`,
              opacity:isDragging?0.25:1, pointerEvents:isDragging?'none':'auto'}}
            onTouchStart={e=>startLP(task,e)}
            onTouchEnd={cancelLP}
            onTouchMove={cancelLP}>
            <TaskCard task={task} onToggle={()=>onToggle(task.id)} onEdit={()=>onEdit(task)}/>
          </div>
        );
      })}

      {/* free time cards */}
      {freeLayout.map(({slot,freeY,cardH},i)=>{
        const fits=laterPool.filter(t=>(t.duration??0)<=slot.min).slice(0,3);
        return (
          <div key={i} className="absolute z-10" style={{top:`${freeY}px`,left:`${CARD_LEFT}px`,right:'0px'}}>
            <FreeTimeCard slot={slot} fits={fits} height={cardH} onSchedule={onSchedule}/>
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

// ── BottomTabs ────────────────────────────────────────────────────────────────

function BottomTabs({activeTab,onSwitchTab,onClose,tasks,shopItems,pendingCount,shopPending,
  onToggle,onEdit,onMoveToTimeline,onAddShop,onToggleShop,onDeleteShop,onDragStart
}:{
  activeTab:'later'|'shop'; onSwitchTab:(t:'later'|'shop')=>void; onClose:()=>void;
  tasks:Task[]; shopItems:ShopItem[]; pendingCount:number; shopPending:number;
  onToggle:(id:string)=>void; onEdit:(t:Task)=>void; onMoveToTimeline:(t:Task)=>void;
  onAddShop:(n:string)=>void; onToggleShop:(id:string)=>void; onDeleteShop:(id:string)=>void;
  onDragStart:(t:Task,x:number,y:number)=>void;
}) {
  const [shopInput,setShopInput] = useState('');
  const [sortDir,setSortDir]     = useState<'asc'|'desc'>('asc');
  const [pressingId,setPressingId]= useState<string|null>(null);
  const lpTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

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

  // Pinned tasks always appear first, then sorted by order
  const sortedLater = (() => {
    const pinned  = laterPending.filter(t=>t.pinned);
    const normal  = laterPending.filter(t=>!t.pinned);
    const ordered = sortDir==='asc' ? normal : [...normal].reverse();
    return [...pinned,...ordered];
  })();

  const scheduledRaw = tasks.filter(t=>!t.isLater&&t.startTime&&!t.completed)
    .sort((a,b)=>{
      const cmp=a.date.localeCompare(b.date)||toMin(a.startTime!)-toMin(b.startTime!);
      return sortDir==='asc'?cmp:-cmp;
    });

  const shopPendingItems=shopItems.filter(i=>!i.checked);
  const shopDoneItems=shopItems.filter(i=>i.checked);

  const SortBtn=({dir,label}:{dir:'asc'|'desc';label:string})=>(
    <button onClick={()=>setSortDir(dir)}
      className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm transition-colors ${sortDir===dir?'bg-gray-900 text-white':'bg-gray-100 text-gray-500'}`}>
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col" onClick={onClose}>
      <div className="flex-1"/>
      <div className="bg-white w-full max-w-md mx-auto rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e=>e.stopPropagation()}>
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
              <div className="flex gap-1.5">
                <SortBtn dir="asc" label="↓"/>
                <SortBtn dir="desc" label="↑↓"/>
              </div>
            </div>

            {/* あとでやる section */}
            {laterPending.length>0&&(
              <div className="mb-1">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs text-gray-400">≡</span>
                  <span className="text-xs text-gray-400 font-medium">あとでやる {laterPending.length}</span>
                </div>
                <div className="space-y-2">
                  {sortedLater.map(t=>(
                    <div key={t.id}
                      className={`flex items-center gap-2.5 bg-white border border-gray-100 rounded-2xl shadow-sm px-3 py-3 transition-transform select-none ${pressingId===t.id?'scale-95 shadow-lg border-blue-200':''}`}
                      onTouchStart={e=>startLP(t,e)}
                      onTouchEnd={cancelLP}
                      onTouchMove={cancelLP}>
                      <div className="flex-col items-center gap-0.5 shrink-0 hidden sm:flex">
                        <span className="text-gray-200 text-xs leading-none">⠿</span>
                      </div>
                      <div className="w-7 h-7 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                        {t.pinned
                          ? <span className="text-xs">📌</span>
                          : <span className="text-xs text-gray-400">☑</span>
                        }
                      </div>
                      <div className="flex-1 min-w-0" onClick={()=>onEdit(t)}>
                        <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                        {(t.duration??0)>0&&<p className="text-xs text-gray-400">{durLabel(t.duration??0)}</p>}
                        {t.memo&&<p className="text-xs text-gray-400 truncate">{t.memo}</p>}
                        {(t.tags??[]).length>0&&(
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(t.tags??[]).map(tag=>(
                              <span key={tag} className="bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded-full">{tag}</span>
                            ))}
                          </div>
                        )}
                        <button onClick={e=>{e.stopPropagation();onMoveToTimeline(t);}}
                          className="mt-1.5 text-xs font-semibold px-2.5 py-1 border border-gray-200 rounded-lg text-gray-600">
                          今日のタイムラインへ →
                        </button>
                      </div>
                      <button onClick={()=>onToggle(t.id)} className="w-6 h-6 rounded-full border-2 border-gray-300 shrink-0"/>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 時間指定 section */}
            {scheduledRaw.length>0&&(
              <div className="mt-4">
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
                        <p className="text-xs text-gray-400">⊙ {t.date.slice(5).replace('-','/')} {t.startTime}</p>
                        {(t.tags??[]).length>0&&(
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(t.tags??[]).map(tag=>(
                              <span key={tag} className="bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded-full">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={()=>onToggle(t.id)} className="w-6 h-6 rounded-full border-2 border-gray-300 shrink-0"/>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* empty */}
            {laterPending.length===0&&scheduledRaw.length===0&&(
              <div className="py-12 text-center"><p className="text-4xl mb-2">✨</p><p className="text-sm text-gray-400">タスクがありません</p></div>
            )}

            {/* completed */}
            {laterDone.length>0&&(
              <div className="mt-4">
                <p className="text-xs text-gray-300 pb-2">完了済み</p>
                <div className="space-y-2">
                  {laterDone.map(t=>(
                    <div key={t.id} className="flex items-center gap-2.5 bg-gray-50 border border-gray-100 rounded-2xl px-3 py-3 opacity-60">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-base shrink-0">{t.icon}</div>
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
                <div className="py-12 text-center"><p className="text-4xl mb-2">🛒</p><p className="text-sm text-gray-400">リストは空です</p></div>
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
                    <p className="text-xs text-gray-300 pt-3 pb-1">購入済み</p>
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

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [tasks,setTasks]         = useState<Task[]>([]);
  const [settings,setSettings]   = useState<Settings>(DEFAULT_SETTINGS);
  const [shopItems,setShopItems] = useState<ShopItem[]>([]);
  const [date,setDate]           = useState(todayStr());
  const [modal,setModal]         = useState<{open:boolean;task:Task|null;prefillTime?:string}>({open:false,task:null});
  const [settingsOpen,setSOp]    = useState(false);
  const [calendarOpen,setCalOp]  = useState(false);
  const [activeTab,setActiveTab] = useState<'later'|'shop'|null>(null);
  const [loaded,setLoaded]       = useState(false);
  const [now,setNow]             = useState(nowStr());
  const [touchY,setTouchY]       = useState(0);
  const [dragTask,setDragTask]   = useState<Task|null>(null);
  const [dragPos,setDragPos]     = useState({x:0,y:0});
  const [dropTime,setDropTime]   = useState<string|null>(null);

  useEffect(()=>{
    try{
      const t=localStorage.getItem(TASKS_KEY);
      const s=localStorage.getItem(SETTINGS_KEY);
      const sh=localStorage.getItem(SHOP_KEY);
      if(t) setTasks((JSON.parse(t) as Task[]).map(tk=>({...tk,recurrence:tk.recurrence??null,pinned:tk.pinned??false,tags:tk.tags??[]})));
      if(s) setSettings(JSON.parse(s));
      if(sh) setShopItems(JSON.parse(sh));
    }catch{}
    setLoaded(true);
  },[]);

  useEffect(()=>{ if(loaded) localStorage.setItem(TASKS_KEY,JSON.stringify(tasks)); },[tasks,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings)); },[settings,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(SHOP_KEY,JSON.stringify(shopItems)); },[shopItems,loaded]);
  useEffect(()=>{ const iv=setInterval(()=>setNow(nowStr()),60000); return ()=>clearInterval(iv); },[]);

  const laterTasks    = useMemo(()=>tasks.filter(t=>t.isLater),[tasks]);
  const pendingCount  = useMemo(()=>laterTasks.filter(t=>!t.completed).length,[laterTasks]);
  const shopPending   = useMemo(()=>shopItems.filter(i=>!i.checked).length,[shopItems]);
  const weekDates     = useMemo(()=>getWeekDates(date),[date]);
  const taskDateSet   = useMemo(()=>new Set(tasks.filter(t=>!t.isLater&&t.startTime).map(t=>t.date)),[tasks]);
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
      const header=document.querySelector('header');
      const headerBottom=header?header.getBoundingClientRect().bottom:130;
      const wakeMin=toMin(settings.wakeTime);
      const rawMin=wakeMin+(clientY+window.scrollY-headerBottom-16)/PX_PER_MIN;
      const snapped=Math.round(rawMin/5)*5;
      return fromMin(Math.max(wakeMin,Math.min(toMin(settings.sleepTime),snapped)));
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
      // あとでやる drag → schedule on today; timeline drag → move time only
      setTasks(prev=>prev.map(tk=>tk.id===dragTask.id
        ? dragTask.isLater ? {...tk,isLater:false,startTime:time,date} : {...tk,startTime:time}
        : tk
      ));
      setDragTask(null);
      setDropTime(null);
    };
    document.addEventListener('touchmove',onMove,{passive:false});
    document.addEventListener('touchend',onEnd);
    return ()=>{
      document.removeEventListener('touchmove',onMove);
      document.removeEventListener('touchend',onEnd);
    };
  },[dragTask,settings,date]);

  const addShopItem  = (name:string) => setShopItems(prev=>[...prev,{id:uid(),name,checked:false}]);
  const toggleShop   = (id:string)   => setShopItems(prev=>prev.map(i=>i.id===id?{...i,checked:!i.checked}:i));
  const deleteShop   = (id:string)   => setShopItems(prev=>prev.filter(i=>i.id!==id));

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
              <button onClick={()=>setCalOp(true)} className="w-8 h-8 flex items-center justify-center text-gray-400 text-lg">📅</button>
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
          onToggle={toggle} onEdit={openEdit} onSchedule={scheduleInSlot} onAddAtTime={openAdd}
          onDragStart={startDrag} dragTaskId={dragTask?.id}/>
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
          tasks={tasks} shopItems={shopItems} pendingCount={pendingCount} shopPending={shopPending}
          onToggle={toggle} onEdit={openEdit} onMoveToTimeline={moveToTimeline}
          onAddShop={addShopItem} onToggleShop={toggleShop} onDeleteShop={deleteShop}
          onDragStart={startDrag}/>
      )}

      {/* ── Drag overlay ── */}
      {dragTask&&(
        <div className="fixed inset-0 z-[70] pointer-events-none">
          {/* Drop time line */}
          {dropTime&&(
            <div className="absolute left-0 right-0 flex items-center gap-2 px-14"
              style={{top:`${dragPos.y}px`}}>
              <span className="bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">{dropTime}</span>
              <div className="flex-1 h-0.5 bg-blue-400 rounded-full"/>
            </div>
          )}
          {/* Floating card */}
          <div style={{
            position:'absolute',
            left:`${Math.max(8,Math.min(dragPos.x-70,window.innerWidth-180))}px`,
            top:`${dragPos.y-50}px`,
            transform:'rotate(-3deg) scale(1.05)',
          }}>
            <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 px-4 py-3 w-44">
              <p className="text-sm font-bold text-gray-900 truncate">{dragTask.name}</p>
              <p className="text-xs text-blue-500 mt-0.5 font-semibold">{dropTime??'ドラッグして配置'}</p>
            </div>
          </div>
        </div>
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
