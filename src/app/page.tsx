'use client';
// v2026-06-12
import { useState, useEffect, useMemo, useRef } from 'react';
import { AppIcons } from './components/Icons';
import { usePremium } from './components/Premium';
import { setNativeAppIcon } from './components/AppIcon';
import { updateWidgetData, getPendingWidgetActions } from './components/WidgetData';
import { setShopGeofences, setTaskLocationGeofences, setForgetAlertGeofences, checkGeofencePermissions, ensureGeofencePermission, getPendingGeofenceAction, getFiredTaskLocationIds, getNativeCurrentLocation, openAppSettings } from './components/Geofence';
import { scheduleInactivityReminder, cancelInactivityReminder } from './components/Inactivity';
import { notify, requestNotifyPermission, syncTaskAlerts, syncFreeSlotAlerts, syncShopNotifs, syncLaterStaleAlerts, syncWakeCheckins, syncDeadlineAlerts, isNative } from './components/LocalNotify';
import { getAppVersion } from './components/AppVersion';
import { logAnalyticsEvent } from './components/Analytics';
import { isDevModeUnlocked, DEV_MODE_UNLOCKED_KEY, getDevPremiumOverride, setDevPremiumOverride, isDevDenied, DEV_LOCATION_DENIED_KEY, DEV_NOTIF_DENIED_KEY } from './components/DevMode';
import { App as CapApp } from '@capacitor/app';
import ProductTour from './components/ProductTour';
import Welcome from './components/Welcome';
import { useI18n, type Language, type StringKey } from './components/I18n';

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
  laterSince?: string;  // あとでやるに入った日時（ISO文字列）。放置通知の起点
  color?: string;
  subtasks?: {id:string;name:string;completed:boolean}[];
  userId?: string;  // future: cloud sync owner
  allDay?: boolean;
  deadlineAt?: string;   // 締切日時（ISO文字列 "YYYY-MM-DDTHH:mm"）。PRO機能
  deadlineNotify?: 'week'|'3days'|'dayBefore'|'sameDay'|'auto';
  locationNotify?: boolean;               // 「あとでやる」の場所通知 ON/OFF。PRO機能
  location?: { name:string; lat:number; lng:number };  // 選択した場所
}

interface Settings { wakeTime: string; sleepTime: string; keepIncomplete?: boolean; showFreeCard?: boolean; freeCardMinMin?: number; wakeColor?:string; sleepColor?:string; theme?:string; appIcon?:string; notificationsEnabled?:boolean; laterReminderHours?: number; appInactivityHours?: number; }
// 「おすすめ機能」表示の判定に使う端末内の利用履歴（未使用の機能を段階的に紹介するため）
interface FeatureUsage {
  installedAt: string;
  shoppingListUsedAt?: string;
  locationReminderUsedAt?: string;
  repeatTaskUsedAt?: string;
  lastRecommendationShownAt?: string;
}
interface RecommendationState { shownCount: number; lastShownAt?: string; dismissedAt?: string; }
type RecommendationId = 'shoppingList'|'locationReminder'|'repeatTask';
interface RecommendationDef {
  id: RecommendationId;
  usedKey: keyof Omit<FeatureUsage,'installedAt'|'lastRecommendationShownAt'>;
  title: string; body: string; cta: string;
  requiresLocationPermission?: boolean;
}
// 対象機能を増やす時はここに追記するだけでよい（優先順位はこの並び順）
const RECOMMENDATION_DEFS: RecommendationDef[] = [
  { id:'shoppingList', usedKey:'shoppingListUsedAt', title:'買い物リスト、使ってみませんか？', body:'買うものをまとめておくと、必要なときにすぐ確認できます。', cta:'使ってみる' },
  { id:'locationReminder', usedKey:'locationReminderUsedAt', title:'場所で通知、使ってみませんか？', body:'よく行く場所に近づいたら、買い物リストを知らせてくれます。', cta:'使ってみる', requiresLocationPermission:true },
  { id:'repeatTask', usedKey:'repeatTaskUsedAt', title:'繰り返しタスク、使ってみませんか？', body:'毎日・毎週のタスクは繰り返し設定にしておくと登録の手間が省けます。', cta:'使ってみる' },
];
const daysBetween=(fromMs:number,toMs:number):number=>(toMs-fromMs)/86400000;
type AuthUser = {uid:string;email?:string;displayName?:string;isPremium?:boolean};
interface FreeSlot  { start: string; end: string; min: number; }
interface ShopItem  { id: string; name: string; checked: boolean; purchasedAt?: string; }
interface ShopNotifSetting { id: string; days: number[]; time: string; enabled: boolean; }
interface ShopLocation { id: string; name: string; lat: number; lng: number; radius: 100|300|500; enabled: boolean; }
// 忘れ物防止アラート（PRO機能）。「あとでやる」とは独立した機能。weekdaysは0=日〜6=土、
// timeStart/timeEndは省略可（両方空なら終日対象）。初回実装では退出(Exit)トリガーのみ対応
interface ForgetAlert {
  id: string; name: string; location: { name:string; lat:number; lng:number }; radius: 100|300|500;
  trigger: 'enter'|'exit';
  weekdays: number[]; timeStart?: string; timeEnd?: string; enabled: boolean; items: string[];
}
interface TagDef    { name: string; color: string; }
interface MoveHistory { id: string; date: string; taskNames: string[]; }
interface CustomTab  { id: string; name: string; showInAll?: boolean; }
interface BulkHistoryEntry { id:string; name:string; startTime:string; endTime:string; dates:string[]; taskIds:string[]; registeredAt:string; icon?:string; color?:string; }
interface LifePattern { id:string; name:string; wakeTime:string; sleepTime:string; color:string; }

type TaskMode = 'later' | 'scheduled' | 'recurring' | 'allday';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: Settings = { wakeTime: '07:00', sleepTime: '23:00' };
const TASKS_KEY    = 'tl-tasks-v2';
const SETTINGS_KEY = 'tl-settings-v2';
const SHOP_KEY     = 'tl-shop-v1';
const TAGS_KEY     = 'tl-tags-v1';
const HISTORY_KEY      = 'tl-history-v1';
const CUSTOM_TABS_KEY  = 'tl-custom-tabs-v1';
const BULK_HIST_KEY        = 'tl-bulk-hist-v1';
const DAY_SETTINGS_KEY     = 'tl-day-settings-v1';
const LIFE_PATTERNS_KEY    = 'tl-life-patterns-v1';
const PATTERN_OVERRIDES_KEY= 'tl-pattern-overrides-v1';
const MORNING_SNOOZE_KEY = 'tl-morning-snooze-v1'; // stores snooze timestamp (ms)
const SHOP_NOTIF_KEY    = 'tl-shop-notif-v1';
const SHOP_LOC_KEY      = 'tl-shop-loc-v1';
const FORGET_ALERTS_KEY = 'tl-forget-alerts-v1';
const NOTIF_ASKED_KEY   = 'tl-notif-asked-v1';
const LOCATION_ASKED_KEY = 'tl-location-asked-v1';
const WAKESLEEP_ASKED_KEY = 'tl-wakesleep-asked-v1';
const FEATURE_USAGE_KEY = 'tl-feature-usage-v1';
const RECOMMEND_STATE_KEY = 'tl-recommend-state-v1';
const TOUR_COMPLETED_KEY = 'tl-product-tour-completed-v1';
const LATER_NOTIFIED_KEY = 'tl-later-notified-v1';
const TASK_ALERT_FIRED_KEY = 'tl-task-alert-fired-v1';
const DEADLINE_ALERT_FIRED_KEY = 'tl-deadline-alert-fired-v1';
const WAKE_CHECKIN_NOTIF_KEY = 'tl-wake-checkin-notif-v1';
const LATER_REMINDER_OPTS = [{v:0,l:'オフ'},{v:1,l:'1時間'},{v:3,l:'3時間'},{v:6,l:'6時間'},{v:12,l:'12時間'},{v:24,l:'1日'},{v:48,l:'2日'},{v:72,l:'3日'}];
const APP_INACTIVITY_OPTS = [{v:0,l:'オフ'},{v:6,l:'6時間'},{v:12,l:'12時間'},{v:24,l:'1日'},{v:48,l:'2日'},{v:72,l:'3日'}];
const AUTH_KEY          = 'tl-auth-v1';

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
  {bg:'#F0CCF5',text:'#7A1A8E'},
];
const getTagTextColor=(bg:string)=>TAG_COLORS.find(c=>c.bg===bg)?.text??'#374151';
const PX_PER_HOUR  = 40;
const PX_PER_MIN   = PX_PER_HOUR / 60;
const DAY_NAMES    = ['日','月','火','水','木','金','土'];
const DAY_NAMES_EN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTH_NAMES_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DUR_OPTS     = [
  {v:0,l:'なし'},
  {v:5,l:'5分'},{v:10,l:'10分'},{v:15,l:'15分'},{v:30,l:'30分'},{v:45,l:'45分'},
  {v:60,l:'1時間'},{v:90,l:'1時間半'},{v:120,l:'2時間'},
  {v:180,l:'3時間'},{v:240,l:'4時間'},{v:300,l:'5時間'},
];
const NOTIF_OPTS   = [{v:0,l:'開始時'},{v:5,l:'5分前'},{v:10,l:'10分前'},{v:15,l:'15分前'},{v:30,l:'30分前'},{v:60,l:'1時間前'},{v:1440,l:'前日'}];

const taskAlertBody = (startTime: string, offset: number): string => {
  if(offset===0) return `そろそろ始めましょう（${startTime}〜）`;
  if(offset===1440) return `明日${startTime}から予定があります`;
  if(offset===60) return `あと1時間で始まります（${startTime}〜）`;
  return `あと${offset}分で始まります（${startTime}〜）`;
};

// ── 締切管理（PRO機能）─────────────────────────────────────────────────────────
type DeadlineNotifyOpt = NonNullable<Task['deadlineNotify']>;
const DEADLINE_NOTIFY_OPTS: {v:DeadlineNotifyOpt;l:string}[] = [
  {v:'auto',l:'おまかせ'},{v:'week',l:'1週間前'},{v:'3days',l:'3日前'},{v:'dayBefore',l:'前日'},{v:'sameDay',l:'当日'},
];
// 「当日」通知を出す時刻（締切当日の朝）
const DEADLINE_SAMEDAY_HOUR = 9;

// ── 「あとでやる」場所通知（PRO機能）─────────────────────────────────────────────
const TASK_LOCATION_RADIUS_M = 200; // 初回実装では固定値
// CLLocationManagerが監視できるリージョンはアプリ全体で20件まで（買い物リストの場所通知と共有の予算）。
// 安全マージンを見て合計19件までに制限する
const MAX_MONITORED_REGIONS = 19;

interface DeadlineFire { key:string; fireMs:number; kind:'days'|'hours'|'today'|'exact'; amount:number; }
// deadlineNotify設定から、実際に発火させる時刻の一覧を計算する。
// 「おまかせ」は1週間前・3日前・前日・当日・5時間前・3時間前・1時間前・締切の8件をまとめて予約する
const computeDeadlineFires = (deadlineAt: string, opt: DeadlineNotifyOpt): DeadlineFire[] => {
  const deadlineMs = new Date(deadlineAt).getTime();
  const dateStr = deadlineAt.slice(0,10);
  const sameDayMs = new Date(`${dateStr}T${String(DEADLINE_SAMEDAY_HOUR).padStart(2,'0')}:00:00`).getTime();
  const fires: DeadlineFire[] = [];
  const addDays = (days:number,key:string)=>fires.push({key,fireMs:deadlineMs-days*86400000,kind:'days',amount:days});
  const addHours = (hours:number,key:string)=>fires.push({key,fireMs:deadlineMs-hours*3600000,kind:'hours',amount:hours});
  const addToday = ()=>fires.push({key:'sameDay',fireMs:sameDayMs,kind:'today',amount:0});
  const addExact = ()=>fires.push({key:'exact',fireMs:deadlineMs,kind:'exact',amount:0});
  if(opt==='week') addDays(7,'week');
  else if(opt==='3days') addDays(3,'3days');
  else if(opt==='dayBefore') addDays(1,'dayBefore');
  else if(opt==='sameDay') addToday();
  else if(opt==='auto'){ addDays(7,'week'); addDays(3,'3days'); addDays(1,'dayBefore'); addToday(); addHours(5,'5h'); addHours(3,'3h'); addHours(1,'1h'); addExact(); }
  return fires;
};
const deadlineAlertBody = (taskName:string, fire:DeadlineFire): string => {
  if(fire.kind==='days') return `${taskName}期限まで、あと${fire.amount}日です。`;
  if(fire.kind==='hours') return `${taskName}期限まで、あと${fire.amount}時間です。`;
  if(fire.kind==='today') return `${taskName}期限は今日です。`;
  return `${taskName}の期限になりました。`;
};
// タイムライン等での「締切まであとN日」表示用。日数は時刻を無視したカレンダー日数で計算するが、
// 当日（diff===0）だけは締切の時刻まで含めて「締切は本日の◯時」と表示する
const deadlineRemainLabel = (deadlineAt:string, lang:Language='ja'): string => {
  const deadlineDay = deadlineAt.slice(0,10);
  const diff = Math.round((new Date(deadlineDay+'T00:00:00').getTime()-new Date(todayStr()+'T00:00:00').getTime())/86400000);
  if(lang==='en'){
    if(diff<0) return `Overdue by ${-diff} day${-diff===1?'':'s'}`;
    if(diff===0){
      const [h,m]=deadlineAt.slice(11,16).split(':').map(Number);
      return `Due today at ${h}:${String(m).padStart(2,'0')}`;
    }
    return `Due in ${diff} day${diff===1?'':'s'}`;
  }
  if(diff<0) return `締切から${-diff}日超過`;
  if(diff===0){
    const [h,m]=deadlineAt.slice(11,16).split(':').map(Number);
    return m>0?`締切は本日の${h}時${m}分`:`締切は本日の${h}時`;
  }
  return `締切まであと${diff}日`;
};
// 締切ラベルの表示色: 超過・当日=赤、直近1〜3日=オレンジ（注意）、それ以外=グレー。
// 常に赤にすると余裕がある締切まで目立ってしまい緊急度のシグナルにならないため3段階にしている
const deadlineLabelColor = (deadlineAt:string): string => {
  const deadlineDay = deadlineAt.slice(0,10);
  const diff = Math.round((new Date(deadlineDay+'T00:00:00').getTime()-new Date(todayStr()+'T00:00:00').getTime())/86400000);
  if(diff<=0) return 'text-[#D97A7A]';
  if(diff<=3) return 'text-amber-600';
  return 'text-gray-400';
};

// ── Utils ─────────────────────────────────────────────────────────────────────

const toMin       = (t: string) => { const [h,m]=t.split(':').map(Number); return h*60+m; };

// 就寝〜起床の時間帯かどうか（就寝時刻が起床時刻より遅い＝日をまたぐケースを考慮）
const inSleepWindow = (nowM: number, wakeM: number, sleepM: number): boolean => {
  if(sleepM===wakeM) return false;
  if(sleepM>wakeM) return nowM>=sleepM||nowM<wakeM;
  return nowM>=sleepM&&nowM<wakeM;
};

// 発火予定時刻(ms)が就寝時間帯に重なる場合、起床時刻ちょうどに前倒しするのではなく、
// 起床時刻を起点として改めてhours時間分カウントし直す（就寝中はカウントが止まるイメージ。
// アプリ放置アラートと同じ設計。起床時刻ちょうどに前倒しすると、起床直後に間髪入れず
// 通知が来てしまい、また朝イチの起床チェックイン通知と同時刻に重なってしまうため）
const adjustFireForSleep = (fireMs: number, hours: number, wakeTime: string, sleepTime: string): number => {
  const d=new Date(fireMs);
  const m=d.getHours()*60+d.getMinutes();
  const wakeM=toMin(wakeTime), sleepM=toMin(sleepTime);
  if(!inSleepWindow(m,wakeM,sleepM)) return fireMs;
  const wakeDate=new Date(d);
  wakeDate.setHours(Math.floor(wakeM/60),wakeM%60,0,0);
  if(wakeDate.getTime()<=fireMs) wakeDate.setDate(wakeDate.getDate()+1);
  const adjusted=wakeDate.getTime()+hours*3600000;
  // hoursが起床〜就寝の間隔より長い設定だと、加算後もまだ就寝時間帯に重なることがある
  // （wakeTime+hoursの時刻は毎回同じなので、同じ調整を繰り返しても変わらない）。
  // その場合は起床時刻そのものにフォールバックする
  const adjD=new Date(adjusted);
  const adjM=adjD.getHours()*60+adjD.getMinutes();
  return inSleepWindow(adjM,wakeM,sleepM) ? wakeDate.getTime() : adjusted;
};

// 放置アラート（タスク放置・アプリ放置 共通）: 未解決なら何時間おきに再通知するか、最大何回まで予約するか
const STALE_REPEAT_HOURS = 6;
const STALE_MAX_REPEATS = 5;

// navigator.geolocation（WKWebView標準API）は実機で権限許可済みでもコールバックが
// 一切呼ばれずに固まることがある実際の不具合を確認したため、ネイティブでは
// CLLocationManager.requestLocation() を直接使うGeofencePluginのgetCurrentLocationを使う。
// Web/開発環境ではnavigator.geolocationにフォールバックする
const getCurrentCoords = (timeoutMs=10000): Promise<{lat:number;lng:number}|null> => {
  if(isNative()) return getNativeCurrentLocation();
  if(!navigator.geolocation) return Promise.resolve(null);
  return new Promise(resolve=>{
    let done=false;
    const failsafe=setTimeout(()=>{ if(done) return; done=true; resolve(null); },timeoutMs+2000);
    navigator.geolocation.getCurrentPosition(
      pos=>{ if(done) return; done=true; clearTimeout(failsafe); resolve({lat:pos.coords.latitude,lng:pos.coords.longitude}); },
      ()=>{ if(done) return; done=true; clearTimeout(failsafe); resolve(null); },
      {enableHighAccuracy:false,timeout:timeoutMs}
    );
  });
};
const fromMin     = (m: number) => `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const dateToStr   = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const todayStr    = () => dateToStr(new Date());
const nowStr      = () => { const d=new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
const shiftDate   = (s: string, n: number) => { const d=new Date(s+'T12:00:00'); d.setDate(d.getDate()+n); return dateToStr(d); };
const shiftMonthBy= (s: string, n: number) => { const d=new Date(s+'T12:00:00'); d.setMonth(d.getMonth()+n); return dateToStr(d); };
const shiftYearBy = (s: string, n: number) => { const d=new Date(s+'T12:00:00'); d.setFullYear(d.getFullYear()+n); return dateToStr(d); };
const uid         = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const durLabel    = (m: number, lang: Language = 'ja') => {
  if(m<=0) return '';
  if(lang==='en') return m>=60?`${Math.floor(m/60)}h${m%60?` ${m%60}m`:''}`:`${m}m`;
  return m>=60?`${Math.floor(m/60)}時間${m%60?`${m%60}分`:''}` :`${m}分`;
};
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

const recLabel=(t:Task,lang:Language='ja'):string=>{
  if(lang==='en'){
    if(t.recurrence==='daily') return 'Daily';
    if(t.recurrence==='weekly') return 'Weekly';
    if(t.recurrence==='monthly') return 'Monthly';
    if(t.recurrence==='yearly') return 'Yearly';
    if(t.recurrence==='custom'&&t.customRec) return summarizeCustomRec(t.customRec);
    return '';
  }
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
  const wMin=toMin(s.wakeTime);
  // Adjust times that fall before wakeTime to be treated as next-day (midnight-crossing)
  const adjM=(t:string)=>{const m=toMin(t);return m<wMin?m+1440:m;};
  const taskSlots = tasks
    .filter(t=>t.date===date&&!t.isLater&&t.startTime)
    .map(t=>{const st=adjM(t.startTime!);return [st,st+(t.duration??0)] as [number,number];});
  const raw = [...taskSlots].sort((a,b)=>a[0]-b[0]);
  const scheduled:[number,number][]=[];
  for(const s of raw){
    if(scheduled.length===0||s[0]>scheduled[scheduled.length-1][1]) scheduled.push([...s]);
    else scheduled[scheduled.length-1][1]=Math.max(scheduled[scheduled.length-1][1],s[1]);
  }
  const slots:FreeSlot[]=[];
  let cur=wMin;
  const end=adjM(s.sleepTime);
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
              <div key={i} className={`text-center text-xs font-semibold py-1 text-gray-400`}>{n}</div>
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
                    !d?'':isSel?'bg-[var(--c-primary)] text-white':isToday?'bg-gray-100 font-bold text-gray-900':'text-gray-600'
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
      <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-100 bg-white" style={{paddingTop:'calc(1rem + env(safe-area-inset-top))'}}>
        <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-gray-600"><AppIcons.caretLeft/></button>
        <div className="flex items-center gap-3">
          <button onClick={()=>setVm(m=>shiftMonth(m.year,m.month,-1))}
            className="w-9 h-9 flex items-center justify-center text-gray-500 bg-gray-100 rounded-xl"><AppIcons.caretLeft/></button>
          <span className="font-bold text-gray-900 text-base min-w-[7rem] text-center">{vm.year}年{vm.month+1}月</span>
          <button onClick={()=>setVm(m=>shiftMonth(m.year,m.month,1))}
            className="w-9 h-9 flex items-center justify-center text-gray-500 bg-gray-100 rounded-xl"><AppIcons.caretRight/></button>
        </div>
        <button onClick={()=>{const d=new Date();setVm({year:d.getFullYear(),month:d.getMonth()});onSelect(today);}}
          className="text-xs font-bold px-3 py-1.5 bg-[var(--c-primary)] text-white rounded-full">今日</button>
      </div>

      {/* Category filter - file tabs */}
      <div className="bg-[var(--c-primary)]">
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
          <div key={i} className={`text-center text-xs font-semibold text-gray-400`}>{n}</div>
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
                  !d?'':isSel?'bg-[var(--c-primary)] text-white':isToday?'bg-gray-100 text-gray-900':'text-gray-700'
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
      <div className="flex items-center gap-3 px-4 pb-3 border-b border-gray-100" style={{paddingTop:'calc(1rem + env(safe-area-inset-top))'}}>
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

const ICON_CATEGORIES:{label:string;icons:{key:string;label:string;pro?:boolean}[]}[]=[
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
    {key:'cake',    label:'お菓子',    pro:true},
    {key:'pizza',   label:'ピザ',      pro:true},
    {key:'bathtub', label:'お風呂',    pro:true},
    {key:'bed',     label:'ベッド',    pro:true},
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
    {key:'creditcard', label:'カード', pro:true},
    {key:'piggybank',  label:'貯金',   pro:true},
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
  {label:'趣味・スポーツ',icons:[
    {key:'guitar',     label:'ギター',   pro:true},
    {key:'basketball', label:'バスケ',   pro:true},
    {key:'soccer',     label:'サッカー', pro:true},
    {key:'volleyball', label:'バレー',   pro:true},
    {key:'paint',      label:'アート',   pro:true},
    {key:'rocket',     label:'挑戦',     pro:true},
  ]},
  {label:'生き物・自然',icons:[
    {key:'cat',    label:'猫',   pro:true},
    {key:'dog',    label:'犬',   pro:true},
    {key:'bird',   label:'鳥',   pro:true},
    {key:'fish',   label:'魚',   pro:true},
    {key:'rabbit', label:'うさぎ',pro:true},
    {key:'flower', label:'花',   pro:true},
    {key:'tree',   label:'木',   pro:true},
    {key:'sun',    label:'天気', pro:true},
  ]},
  {label:'おでかけ',icons:[
    {key:'airplane', label:'飛行機', pro:true},
    {key:'bus',      label:'バス',   pro:true},
    {key:'boat',     label:'船',     pro:true},
    {key:'backpack', label:'旅行',   pro:true},
    {key:'suitcase', label:'出張',   pro:true},
    {key:'location', label:'場所',   pro:true},
    {key:'tent',     label:'キャンプ',pro:true},
    {key:'campfire', label:'焚き火', pro:true},
  ]},
];
const ICON_OPTIONS=ICON_CATEGORIES.flatMap(c=>c.icons);
const TASK_COLORS=[
  '',
  // 明るめ（パステル）
  '#F4A7B0','#F4AA80','#F4D47A','#A8D8B0','#90C4E0','#B8AADC','#DDB0CC','#D4C8B8',
  // 濃いめ（白文字映え）
  '#C4888E','#C47A5E','#C4A44A','#7A9E8A','#6A8FAF','#8F82B8','#A67899','#8F8880',
];
const APP_ICONS=[
  {id:'mint',    name:'ミント',           file:'mint.png'},
  {id:'sage',    name:'セージグリーン',   file:'sage.png'},
  {id:'lilac',   name:'ライラック',       file:'lilac.png'},
  {id:'rose',    name:'ダスティローズ',   file:'rose.png'},
  {id:'dusty',   name:'ダスティブルー',   file:'dusty.png'},
  {id:'apricot', name:'アプリコット',     file:'apricot.png'},
  {id:'greige',  name:'グレージュ',       file:'greige.png'},
  {id:'charcoal',name:'チャコールグレー', file:'charcoal.png'},
  {id:'mocha',   name:'モカベージュ',     file:'mocha.png'},
];
const THEMES=[
  {id:'mint',    name:'ミント',             color:'#94CFC8'},
  {id:'coral',   name:'コーラルピンク',     color:'#E88878'},
  {id:'sunset',  name:'サンセットオレンジ', color:'#E8906A'},
  {id:'forest',  name:'フォレストグリーン', color:'#5A8A6A'},
  {id:'sky',     name:'スカイブルー',       color:'#7CB9E8'},
  {id:'navy',    name:'ネイビー',           color:'#5F7EA8'},
  {id:'lavender',name:'ラベンダー',         color:'#9B8EC4'},
  {id:'peach',   name:'ピーチ',             color:'#E8A0B0'},
  {id:'mono',    name:'モノクロ',           color:'#666666'},
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
    guitar:AppIcons.guitar,basketball:AppIcons.basketball,soccer:AppIcons.soccer,
    volleyball:AppIcons.volleyball,paint:AppIcons.paint,rocket:AppIcons.rocket,
    cat:AppIcons.cat,dog:AppIcons.dog,bird:AppIcons.bird,fish:AppIcons.fish,
    rabbit:AppIcons.rabbit,flower:AppIcons.flower,tree:AppIcons.tree,sun:AppIcons.sun,
    airplane:AppIcons.airplane,bus:AppIcons.bus,boat:AppIcons.boat,
    backpack:AppIcons.backpack,suitcase:AppIcons.suitcase,location:AppIcons.location,
    tent:AppIcons.tent,campfire:AppIcons.campfire,cake:AppIcons.cake,pizza:AppIcons.pizza,
    bathtub:AppIcons.bathtub,bed:AppIcons.bed,creditcard:AppIcons.creditcard,piggybank:AppIcons.piggybank,
  } as Record<string,typeof AppIcons.task>;
  return m[key]??AppIcons.task;
}
function defaultIconKey(name:string):string {
  if(/昼寝|仮眠/.test(name)) return 'rest';
  if(/料理|炊事|下ごしらえ|献立|仕込み|クッキング/.test(name)) return 'cooking';
  if(/食|飯|昼|夕|朝|ご飯|食事|弁当|外食|レストラン|カフェ|ランチ|ディナー|おやつ|間食|軽食|夜食|スナック|焼肉|寿司|ラーメン|うどん|そば|パン|コーヒー|飲み物|ドリンク|居酒屋|コンビニ飯/.test(name)) return 'food';
  if(/洗濯|乾燥機|乾かす|たたむ|洗い物/.test(name)) return 'washing';
  if(/掃除|片付|家事|整理|整頓|ゴミ|ゴミ出し|掃く|拭く|クリーニング/.test(name)) return 'clean';
  if(/散歩|ペット|犬|猫|ハムスター|うさぎ|鳥|動物/.test(name)) return 'paw';
  if(/走|ジョギング|ランニング|マラソン|ジョグ/.test(name)) return 'running';
  if(/自転車|サイクリング|チャリ|ロードバイク/.test(name)) return 'bicycle';
  if(/ヨガ|ストレッチ|瞑想|深呼吸|マインドフル/.test(name)) return 'yoga';
  if(/筋トレ|ジム|ウエイト|ダンベル|トレーニング|スポーツ|水泳|泳|運動|腕立て|スクワット|腹筋|プール|バドミントン|テニス|サッカー|野球|バスケ|フットサル|卓球|バレー/.test(name)) return 'exercise';
  if(/薬|服薬|サプリ|点眼|塗り薬|飲み薬|処方/.test(name)) return 'medicine';
  if(/病院|診察|通院|クリニック|歯医者|健診|人間ドック|予防接種|ワクチン|検診/.test(name)) return 'hospital';
  if(/会議|ミーティング|打ち合わせ|MTG|Zoom|zoom|オンライン会議|面接|1on1/.test(name)) return 'meeting';
  if(/メール|mail|Slack|slack|チャット|DM|メッセージ/.test(name)) return 'mail';
  if(/書類|資料|レポート|申請|手続|契約|履歴書|明細|議事録/.test(name)) return 'document';
  if(/仕事|業務|出社|退社|プレゼン|報告|リモート|在宅|テレワーク|副業|バイト|アルバイト/.test(name)) return 'work';
  if(/買い物|ショッピング|スーパー|購入|ドラッグストア|薬局|日用品|コンビニ/.test(name)) return 'shopping';
  if(/支払|振込|請求|引落|家賃|税金|保険|年金|水道|電気|ガス|公共料金/.test(name)) return 'payment';
  if(/お金|給料|貯金|節約|予算|銀行|ATM|家計|投資|株|収入|出費/.test(name)) return 'money';
  if(/読書|マンガ|漫画|雑誌|電子書籍|Kindle/.test(name)) return 'book';
  if(/勉強|学習|テスト|試験|宿題|課題|授業|講義|英語|英会話|資格|TOEIC|検定|塾|学校|登校|下校|学院/.test(name)) return 'study';
  if(/電話|通話|電話する|問い合わせ|コール/.test(name)) return 'phone';
  if(/音楽|歌|ピアノ|ギター|ライブ|コンサート|バンド|作曲|楽器|演奏/.test(name)) return 'music';
  if(/電車|バス|地下鉄|新幹線|乗り換え/.test(name)) return 'train';
  if(/移動|車|ドライブ|送迎|迎え|飛行機|空港/.test(name)) return 'travel';
  if(/プレゼント|ギフト|贈り物|お祝い|誕生日|バレンタイン|ホワイトデー|お土産/.test(name)) return 'gift';
  if(/ゲーム|スマホゲー|ゲーセン|Switch|Nintendo|プレステ/.test(name)) return 'game';
  if(/写真|撮影|カメラ/.test(name)) return 'camera';
  if(/休憩|仮眠|昼寝|ひと息|リラックス|のんびり|ゆっくり/.test(name)) return 'rest';
  if(/就寝|おやすみ|睡眠|寝る/.test(name)) return 'sleep';
  if(/健康|体重|体温|血圧|体調/.test(name)) return 'health';
  return 'task';
}


// ── PickerCol (drum-roll time picker column) ──────────────────────────────────

const HOURS = Array.from({length:24},(_,i)=>String(i).padStart(2,'0'));
const MINS  = ['00','05','10','15','20','25','30','35','40','45','50','55'];

function PickerCol({items,value,onChange}:{items:string[];value:string;onChange:(v:string)=>void}){
  const H=44,SHOW=5,HALF=2;
  const N=items.length;
  // Triple the items for infinite circular scroll
  const loopItems=[...items,...items,...items];
  const listRef=useRef<HTMLDivElement>(null);
  const touchY=useRef(0),baseTy=useRef(0),curTy=useRef(0);
  const lastY=useRef(0),lastT=useRef(0),vel=useRef(0);
  const rafId=useRef(0);

  const toTy=(idx:number)=>HALF*H-idx*H;
  const tyToIdx=(ty:number)=>Math.round((HALF*H-ty)/H);

  // Silently jump to the equivalent position in the middle copy
  const recenter=()=>{
    if(!listRef.current) return;
    const i=tyToIdx(curTy.current);
    const realIdx=((i%N)+N)%N;
    const midI=N+realIdx;
    const ty=toTy(midI);
    curTy.current=ty;
    listRef.current.style.transition='none';
    listRef.current.style.transform=`translateY(${ty}px)`;
  };

  const raw=(ty:number)=>{
    if(!listRef.current) return;
    listRef.current.style.transition='none';
    listRef.current.style.transform=`translateY(${ty}px)`;
    curTy.current=ty;
  };
  const snapTo=(ty:number)=>{
    cancelAnimationFrame(rafId.current);
    const i=tyToIdx(ty);
    const dest=toTy(i);
    if(!listRef.current) return;
    listRef.current.style.transition='transform 0.18s cubic-bezier(0.33,1,0.68,1)';
    listRef.current.style.transform=`translateY(${dest}px)`;
    curTy.current=dest;
    const realIdx=((i%N)+N)%N;
    const newValue=items[realIdx];
    if(newValue!==value) onChange(newValue);
    setTimeout(recenter,220);
  };
  const startMomentum=(v0:number)=>{
    cancelAnimationFrame(rafId.current);
    let v=v0,prev=performance.now();
    const tick=(now:number)=>{
      const dt=Math.min(now-prev,32);prev=now;
      v*=Math.exp(-dt/220);
      const next=curTy.current+v*dt;
      if(Math.abs(v)<0.04){snapTo(curTy.current);return;}
      raw(next);
      rafId.current=requestAnimationFrame(tick);
    };
    rafId.current=requestAnimationFrame(tick);
  };
  useEffect(()=>{
    const i=items.indexOf(value);
    if(i>=0){cancelAnimationFrame(rafId.current);
      const ty=toTy(N+i);
      if(listRef.current){listRef.current.style.transition='transform 0.22s cubic-bezier(0.33,1,0.68,1)';listRef.current.style.transform=`translateY(${ty}px)`;curTy.current=ty;}}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[value]);
  useEffect(()=>{
    const i=items.indexOf(value);
    const ty=toTy(N+(i>=0?i:0));
    curTy.current=ty;if(listRef.current) listRef.current.style.transform=`translateY(${ty}px)`;
    return ()=>cancelAnimationFrame(rafId.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  return(
    <div style={{height:SHOW*H,overflow:'hidden',position:'relative',width:52,touchAction:'none',userSelect:'none'}}
      onTouchStart={e=>{
        cancelAnimationFrame(rafId.current);
        recenter();
        const y=e.touches[0].clientY;
        touchY.current=y;baseTy.current=curTy.current;
        lastY.current=y;lastT.current=performance.now();vel.current=0;
      }}
      onTouchMove={e=>{
        e.preventDefault();
        const y=e.touches[0].clientY,now=performance.now(),dt=now-lastT.current;
        if(dt>0) vel.current=(y-lastY.current)/dt;
        lastY.current=y;lastT.current=now;
        raw(baseTy.current+(y-touchY.current));
      }}
      onTouchEnd={()=>{Math.abs(vel.current)>0.2?startMomentum(vel.current):snapTo(curTy.current);}}>
      <div style={{position:'absolute',top:HALF*H,height:H,left:0,right:0,
        borderTop:'1.5px solid #E5E7EB',borderBottom:'1.5px solid #E5E7EB',
        background:'rgba(0,0,0,0.02)',borderRadius:8,pointerEvents:'none',zIndex:1}}/>
      <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:2,
        background:`linear-gradient(to bottom,#fff 0%,transparent ${HALF*H}px,transparent ${(SHOW-HALF)*H}px,#fff 100%)`}}/>
      <div ref={listRef} style={{willChange:'transform'}}>
        {loopItems.map((v,i)=>(
          <div key={i} style={{height:H,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <span style={{fontSize:v===value?22:16,fontWeight:v===value?700:400,
              color:v===value?'#1F2937':'#9CA3AF',fontVariantNumeric:'tabular-nums',
              transition:'font-size 0.15s,color 0.15s'}}>
              {v}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── TaskModal ─────────────────────────────────────────────────────────────────

function TaskModal({task,currentDate,prefillTime,prefillCategory,openIconSheet:initIconSheet,onSave,onUpdate,onDelete,onClose,onBulkInput,globalTags,customTabs,notificationsEnabled,onEnableNotifications,isPremium=true,onOpenTagSettings,atLocationLimit=false,suppressAutoFocus=false,focusNameSignal,fillTestNameSignal}:{
  task:Task|null; currentDate:string; prefillTime?:string; prefillCategory?:string; openIconSheet?:boolean;
  onSave:(tasks:Omit<Task,'id'>[])=>void; onUpdate?:(data:Omit<Task,'id'>)=>void; onDelete?:()=>void; onClose:()=>void; onBulkInput?:()=>void;
  isPremium?:boolean;
  globalTags:TagDef[]; customTabs:CustomTab[];
  notificationsEnabled?:boolean; onEnableNotifications?:()=>void;
  onOpenTagSettings?:()=>void;
  atLocationLimit?:boolean;
  // タスク名入力欄の自動フォーカスを抑止する（プロダクトツアーで、あとで入力ステップに来るまで
  // キーボードを出したくないため）。focusNameSignalが変化した時点で改めてフォーカスする
  suppressAutoFocus?:boolean;
  focusNameSignal?:number;
  // プロダクトツアーでタスク名を入力せず「次へ」を押した場合、この値が変化した時点で
  // 名前が空ならプレースホルダー名を入れる（保存ボタンがdisabledのままにならないようにする）
  fillTestNameSignal?:number;
}) {
  const { tr } = useI18n();
  const initMode=():TaskMode=>{
    if(!task) return prefillTime?'scheduled':'later';
    if(task.allDay) return 'allday';
    if(task.recurrence) return 'recurring';
    if(task.isLater) return 'later';
    return 'scheduled';
  };

  const nameInputRef = useRef<HTMLInputElement>(null);
  useEffect(()=>{
    // 編集時（既存タスクを開いた時）は他の項目を触りたいことが多く、意図せずキーボードが
    // 出ると邪魔になるため、新規作成時のみ自動フォーカスする
    if(!suppressAutoFocus&&!task) nameInputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  const focusNameBaseline = useRef(focusNameSignal);
  useEffect(()=>{
    if(focusNameSignal!==undefined && focusNameSignal!==focusNameBaseline.current){
      focusNameBaseline.current = focusNameSignal;
      nameInputRef.current?.focus();
    }
  },[focusNameSignal]);

  const [mode,setMode]        = useState<TaskMode>(initMode());
  const [name,setName]        = useState(task?.name??'');
  const fillTestNameBaseline = useRef(fillTestNameSignal);
  useEffect(()=>{
    if(fillTestNameSignal!==undefined && fillTestNameSignal!==fillTestNameBaseline.current){
      fillTestNameBaseline.current = fillTestNameSignal;
      setName(n=>n.trim()?n:tr('tourDefaultTaskName'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[fillTestNameSignal]);
  const [startTime,setST]     = useState(task?.startTime??prefillTime??nowStr());
  const [duration,setDur]     = useState(task?.duration??0);
  const [memo,setMemo]        = useState(task?.memo??'');
  const [icon,setIcon]        = useState(()=>{
    const k=task?.icon??'';
    return ICON_OPTIONS.some(o=>o.key===k)?k:'task';
  });
  const [color,setColor]      = useState(task?.color??'');
  const [iconSheetOpen,setIconSheetOpen] = useState(initIconSheet??false);
  const [autoIcon,setAutoIcon] = useState(task===null || !task?.icon || task.icon==='task');
  const [recentIcons,setRecentIcons] = useState<string[]>(()=>{
    if(typeof window==='undefined') return [];
    try{return JSON.parse(localStorage.getItem('tl-recent-icons')||'[]');}catch{return [];}
  });
  const [iconQuery,setIconQuery] = useState('');
  const pickIcon=(opt:{key:string;label:string;pro?:boolean})=>{
    if(opt.pro&&!isPremium){ setModalProPrompt(`アイコン「${opt.label}」の使用`); return; }
    setIcon(opt.key);
    setRecentIcons(prev=>{
      const next=[opt.key,...prev.filter(k=>k!==opt.key)].slice(0,5);
      try{localStorage.setItem('tl-recent-icons',JSON.stringify(next));}catch{}
      return next;
    });
  };
  const renderIconBtn=(opt:{key:string;label:string;pro?:boolean})=>{
    const Ic=getTaskIcon(opt.key);
    const sel=icon===opt.key;
    const locked=!!opt.pro&&!isPremium;
    return (
      <button key={opt.key} onClick={()=>pickIcon(opt)}
        className={`relative flex flex-col items-center gap-1.5 py-3 rounded-2xl ${sel?'':'bg-gray-50'}`}
        style={sel?{background:color||'var(--c-primary)'}:undefined}>
        <Ic size={22} className={sel?'text-white':locked?'text-gray-300':'text-gray-700'}/>
        {locked&&<AppIcons.lock size={10} className="absolute top-1.5 right-1.5 text-gray-300"/>}
      </button>
    );
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
  const [notifications,setNotifs]  = useState<number[]>(task?.notifications??((!task||task.isLater)?[0]:[]));
  const [deadlineDate,setDeadlineDate] = useState(task?.deadlineAt?task.deadlineAt.slice(0,10):'');
  const [deadlineTime,setDeadlineTime] = useState(task?.deadlineAt?task.deadlineAt.slice(11,16):'18:00');
  const [deadlineNotify,setDeadlineNotify] = useState<DeadlineNotifyOpt>(task?.deadlineNotify??'dayBefore');
  const [deadlineOpen,setDeadlineOpen] = useState(false);
  const [locationNotify,setLocationNotify] = useState(task?.locationNotify??false);
  const [taskLocation,setTaskLocation] = useState(task?.location??null);
  // 場所通知を設定した後に位置情報/通知の許可を取り消された場合に気づけるよう、
  // モーダルを開くたびに現在の許可状態を確認する（ShopLocationPanelと同じパターン）
  const [taskLocPermStatus,setTaskLocPermStatus] = useState<{location:string;notifications:string}|null>(null);
  useEffect(()=>{ if(locationNotify) checkGeofencePermissions().then(setTaskLocPermStatus); },[locationNotify]);
  const [locAdding,setLocAdding] = useState(false);
  const [locMapMode,setLocMapMode] = useState(false);
  const [locMapCenter,setLocMapCenter] = useState<{lat:number;lng:number}|null>(null);
  const [locSearchQuery,setLocSearchQuery] = useState('');
  const [locSearchResults,setLocSearchResults] = useState<{name:string;lat:number;lng:number}[]>([]);
  const [locSearching,setLocSearching] = useState(false);
  const [locPending,setLocPending] = useState<{name:string;lat:number;lng:number}|null>(null);
  const [locLocating,setLocLocating] = useState(false);
  const [locError,setLocError] = useState<string|null>(null);
  const [modalProPrompt,setModalProPrompt] = useState<string|null>(null);
  const modalSwX=useRef(0), modalSwY=useRef(0);
  const modeOrder:TaskMode[]=['later','scheduled','recurring','allday'];
  const onModalSwipe=(e:React.TouchEvent)=>{
    const dx=e.changedTouches[0].clientX-modalSwX.current;
    const dy=Math.abs(e.changedTouches[0].clientY-modalSwY.current);
    if(Math.abs(dx)>60&&Math.abs(dx)>dy){
      const idx=modeOrder.indexOf(mode);
      if(dx<0&&idx<modeOrder.length-1) setMode(modeOrder[idx+1]);
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
  const [timePickerOpen,setTPOpen]= useState(false);
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

  // ── Auto-save (edit mode only) ─────────────────────────────────────────────
  const autoSaveTimer   = useRef<ReturnType<typeof setTimeout>|null>(null);
  const savedTimer      = useRef<ReturnType<typeof setTimeout>|null>(null);
  const lastSavedRef    = useRef('');
  const pendingDataRef  = useRef<Omit<Task,'id'>|null>(null);
  const isFirstRender   = useRef(true);
  const [saveStatus, setSaveStatus] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [saveFading, setSaveFading] = useState(false);

  const buildData = (): Omit<Task,'id'> => ({
    name:name.trim(), startTime:(mode==='later'||mode==='allday')?null:(startTime||null), duration:mode==='allday'?0:duration, memo, icon,
    color:color||undefined, completed:task?.completed??false,
    date:(mode==='scheduled'||mode==='allday')?taskDate:(task?.date??currentDate),
    isLater:mode==='later', allDay:mode==='allday'||undefined,
    laterSince:mode==='later'?(task?.isLater?(task?.laterSince??new Date().toISOString()):new Date().toISOString()):undefined,
    recurrence:mode==='recurring'?recur:null,
    customRec:mode==='recurring'&&recur==='custom'?customRec:undefined,
    notifications:(mode!=='later'&&mode!=='allday')?notifications:undefined,
    incompleteReminder:(mode!=='later'&&mode!=='allday')?incompleteRem:false,
    category:category??undefined, pinned, tags,
    subtasks:subtasks.length>0?subtasks:undefined,
    deadlineAt:(mode!=='recurring'&&deadlineDate)?`${deadlineDate}T${deadlineTime||'18:00'}`:undefined,
    deadlineNotify:(mode!=='recurring'&&deadlineDate)?deadlineNotify:undefined,
    locationNotify:locationNotify&&!!taskLocation,
    location:taskLocation??undefined,
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
  },[name,taskDate,startTime,duration,mode,recur,customRec,tags,subtasks,memo,category,notifications,incompleteRem,icon,color,deadlineDate,deadlineTime,deadlineNotify,locationNotify,taskLocation]);

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

  // 場所で通知（PRO機能）── OFFにした時点で場所情報も削除する（初回実装のシンプルな仕様）
  const locDoSearch=async()=>{
    const q=locSearchQuery.trim();
    if(!q) return;
    setLocSearching(true);
    try{
      const res=await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=jp&limit=8&accept-language=ja`);
      const data=await res.json() as {display_name:string;lat:string;lon:string}[];
      setLocSearchResults(data.map(d=>({name:d.display_name,lat:parseFloat(d.lat),lng:parseFloat(d.lon)})));
    }catch{
      setLocSearchResults([]);
    }
    setLocSearching(false);
  };
  const locUseCurrentLocation=()=>{
    setLocLocating(true);
    getCurrentCoords(10000).then(loc=>{
      setLocLocating(false);
      if(!loc){ setLocError('現在地を取得できませんでした'); return; }
      setLocMapCenter(loc);
      setLocMapMode(true);
    });
  };
  const locOpenMapMode=()=>{ setLocMapCenter(null); setLocMapMode(true); };
  const locConfirmPending=async()=>{
    if(!locPending) return;
    const ok=await ensureGeofencePermission('task_location');
    if(!ok){ setLocError('場所に到着したときに通知するため、位置情報の利用を許可してください。'); return; }
    setTaskLocation({name:locPending.name,lat:locPending.lat,lng:locPending.lng});
    setLocationNotify(true);
    setLocAdding(false);
    setLocMapMode(false);
    setLocPending(null);
    setLocSearchQuery('');
    setLocSearchResults([]);
    setLocError(null);
  };
  const locCancelAdd=()=>{
    setLocAdding(false);setLocMapMode(false);setLocMapCenter(null);setLocPending(null);
    setLocSearchQuery('');setLocSearchResults([]);setLocError(null);
  };

  const save=()=>{
    if(!name.trim()) return;
    const dur=duration;
    const base:Omit<Task,'id'>={
      name:name.trim(),
      startTime:(mode==='later'||mode==='allday')?null:(startTime||null),
      duration:mode==='allday'?0:dur,
      memo,
      icon:icon,
      color:color||undefined,
      completed:task?.completed??false,
      date:(mode==='scheduled'||mode==='allday')?taskDate:(task?.date??currentDate),
      isLater:mode==='later',
      allDay:mode==='allday'||undefined,
      recurrence:mode==='recurring'?recur:null,
      customRec:mode==='recurring'&&recur==='custom'?customRec:undefined,
      notifications:(mode!=='later'&&mode!=='allday')?notifications:undefined,
      incompleteReminder:(mode!=='later'&&mode!=='allday')?incompleteRem:false,
      category:category??undefined,
      pinned,
      tags,
      subtasks:subtasks.length>0?subtasks:undefined,
      deadlineAt:(mode!=='recurring'&&deadlineDate)?`${deadlineDate}T${deadlineTime||'18:00'}`:undefined,
      deadlineNotify:(mode!=='recurring'&&deadlineDate)?deadlineNotify:undefined,
      locationNotify:locationNotify&&!!taskLocation,
      location:taskLocation??undefined,
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
      if(!task&&(notificationsEnabled===false)){
        const ok=window.confirm('通知機能がオフになっています。\nタスクのアラートを受け取るには通知を有効にしてください。\n\n通知をオンにしますか？');
        if(ok) onEnableNotifications?.();
      }
      onSave(instances);
    } else {
      if(!task&&(mode==='scheduled'||mode==='recurring')&&(notificationsEnabled===false)){
        const ok=window.confirm('通知機能がオフになっています。\nタスクのアラートを受け取るには通知を有効にしてください。\n\n通知をオンにしますか？');
        if(ok) onEnableNotifications?.();
      }
      onSave([base]);
    }
  };

  const [showDiscard,setShowDiscard] = useState(false);
  const [tagNavConfirm,setTagNavConfirm] = useState(false);
  const [deleteConfirm,setDeleteConfirm] = useState(false);
  const hasChanges =
    name!==(task?.name??'') ||
    duration!==(task?.duration??0) ||
    memo!==(task?.memo??'') ||
    tags.length!==(task?.tags??[]).length ||
    tags.some((t,i)=>t!==(task?.tags??[])[i]) ||
    subtasks.length!==(task?.subtasks??[]).length ||
    locationNotify!==(task?.locationNotify??false);

  const handleClose=()=>{
    if(task){flushAndClose();}
    else if(hasChanges){setShowDiscard(true);}
    else{onClose();}
  };

  const headerBg=color?(()=>{
    const hex=color;
    const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
    return `rgb(${Math.round(r*0.82)},${Math.round(g*0.82)},${Math.round(b*0.82)})`;
  })():'var(--c-primary-dark)';

  return (
    <div className="fixed inset-0 z-50 bg-black/60" onClick={handleClose}>
      <div className="absolute bottom-0 left-0 right-0 max-w-md mx-auto" onClick={e=>e.stopPropagation()} data-tour={!task?'modal-card':undefined}>
        {/* ── Dark header ── */}
        <div className="rounded-t-3xl px-4 pt-4" style={{background:headerBg}}>
        <div>
          {/* Buttons row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button onClick={handleClose} className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-white">×</button>
              {!task&&onBulkInput&&<button onClick={onBulkInput} className="px-3 py-1.5 text-sm font-semibold rounded-full bg-white/20 text-white flex items-center gap-1">一括入力<AppIcons.caretRight size={12}/></button>}
            </div>
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
                <button onClick={save} disabled={!name.trim()} data-tour={!task?'save-button':undefined}
                  className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${name.trim()?'bg-white/90 text-gray-800':'bg-white/20 text-white/40 cursor-not-allowed'}`}>保存</button>
              )}
            </div>
          </div>

          {/* Icon + name */}
          <div className="flex items-center gap-3 mb-4" data-tour={!task?'name-input-row':undefined}>
            <button onClick={()=>setIconSheetOpen(true)}
              className="relative w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 text-white bg-white/20 active:bg-white/30 transition-colors"
              style={color?{background:color}:{}}>
              {(()=>{const Ic=getTaskIcon(icon);return <Ic size={32} className={color?'text-white':'text-white'}/>;})()}
              <div className="absolute bottom-0.5 right-0.5 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-sm">
                <AppIcons.pencil size={11} className="text-gray-500"/>
              </div>
            </button>
            <div className="flex-1 min-w-0">
              {(mode==='scheduled'||mode==='recurring')&&startTime&&(
                <p className="text-xs text-white/60 mb-0.5">{startTime}{computedEnd?`〜${computedEnd}`:''}{mode==='recurring'&&' · 繰り返し'}</p>
              )}
              {mode==='allday'&&(
                <p className="text-xs text-white/60 mb-0.5">終日</p>
              )}
              <input ref={nameInputRef} type="text" value={name} onChange={e=>{const v=e.target.value;setName(v);if(autoIcon)setIcon(defaultIconKey(v));}}
                placeholder="タスク名を入力..."
                className="w-full bg-transparent text-white text-lg font-medium placeholder-white/40 outline-none border-b border-white/30 pb-1"/>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex bg-white/20 rounded-xl p-1 mb-3">
            {([['later','あとで'],['scheduled','時間指定'],['recurring','繰り返し']] as [TaskMode,string][]).map(([m,l])=>(
              <button key={m} onClick={()=>setMode(m)}
                data-tour={!task&&m==='later'?'tab-later':undefined}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${mode===m?'bg-white/90 text-gray-800':'text-white/70'}`}>
                {l}
              </button>
            ))}
          </div>
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
                    <button key={r} onClick={()=>{if(r==='custom'&&!isPremium){setModalProPrompt('繰り返しのカスタム設定');return;}setRecur(r);}}
                      className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold inline-flex items-center gap-1.5 ${recur===r?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>
                      {['毎日','毎週','毎月','毎年','カスタム'][i]}
                      {r==='custom'&&<span className={`inline-flex items-center border rounded px-1 py-0.5 text-[9px] font-bold leading-none tracking-wide ${recur===r?'border-white/60 text-white/80':'border-gray-300 text-gray-400'}`}>PRO</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom 3-block UI */}
              {recur==='custom'&&(
                <>
                  {/* Summary */}
                  <div className="mx-3 mt-3 bg-[var(--c-primary)] rounded-2xl px-4 py-3">
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
                          className={`flex-1 py-2.5 rounded-full text-sm font-semibold ${customRec.frequency===u?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>
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
                              className={`flex-1 h-10 rounded-full text-sm font-semibold ${(customRec.weekdays??[]).includes(i)?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>
                              {n}
                            </button>
                          ))}
                        </div>
                      )}

                      {customRec.frequency==='month'&&(
                        <>
                          <div className="flex gap-2 mb-4">
                            <button onClick={()=>setCR('monthlyType','date')}
                              className={`flex-1 py-2 rounded-full text-sm font-semibold ${customRec.monthlyType!=='weekday'?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>
                              日付で指定
                            </button>
                            <button onClick={()=>setCR('monthlyType','weekday')}
                              className={`flex-1 py-2 rounded-full text-sm font-semibold ${customRec.monthlyType==='weekday'?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>
                              曜日で指定
                            </button>
                          </div>
                          {customRec.monthlyType!=='weekday'?(
                            <div className="flex gap-2 overflow-x-auto pb-0.5" style={{scrollbarWidth:'none'} as React.CSSProperties}>
                              {([1,5,10,15,20,25,'last' as const]).map(d=>(
                                <button key={String(d)} onClick={()=>setCR('dayOfMonth',d)}
                                  className={`shrink-0 px-3 py-2 rounded-full text-sm font-semibold ${customRec.dayOfMonth===d?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>
                                  {d==='last'?'月末':`${d}日`}
                                </button>
                              ))}
                            </div>
                          ):(
                            <div className="space-y-3">
                              <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{scrollbarWidth:'none'} as React.CSSProperties}>
                                {([1,2,3,4,'last' as const]).map(wn=>(
                                  <button key={String(wn)} onClick={()=>setCR('weekNumber',wn)}
                                    className={`shrink-0 flex-1 py-2 rounded-full text-sm font-semibold min-w-[3rem] ${customRec.weekNumber===wn?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>
                                    {wn==='last'?'最終':`第${wn}`}
                                  </button>
                                ))}
                              </div>
                              <div className="flex gap-1.5">
                                {DAY_NAMES.map((n,i)=>(
                                  <button key={i} onClick={()=>setCR('weekday',i)}
                                    className={`flex-1 h-9 rounded-full text-sm font-semibold ${customRec.weekday===i?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>
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
                                  className={`shrink-0 w-12 h-10 rounded-full text-sm font-semibold ${customRec.yearMonth===i+1?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>
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
                                  className={`shrink-0 px-3 py-2 rounded-full text-sm font-semibold ${customRec.yearDay===d?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>
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
                          className={`flex-1 py-2 rounded-full text-xs font-semibold ${customRec.endType===t?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>
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

            {/* 日付 — scheduled/allday */}
            {(mode==='scheduled'||mode==='allday')&&(
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
                        <div key={i} className={`text-center text-[11px] font-semibold py-1 text-gray-400`}>{n}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7">
                      {calDays.map((d,i)=>{
                        const isSel=d===taskDate, isToday=d===todayStr();
                        return (
                          <button key={i} disabled={!d} onClick={()=>{if(d){setTaskDate(d);setDateOpen(false);}}} className="flex items-center justify-center py-1">
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${!d?'':isSel?'bg-[var(--c-primary)] text-white':isToday?'bg-gray-100 font-bold text-gray-900':'text-gray-600'}`}>
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

            {/* 開始時刻 + 終日トグル — scheduled/recurring/allday */}
            {(mode==='scheduled'||mode==='recurring'||mode==='allday')&&(<>
              <div className="h-px bg-gray-100 mx-4"/>
              <div className="w-full flex items-center gap-3 px-4 py-3.5" data-tour={!task?'start-time-row':undefined}>
                <AppIcons.clock size={18} className="text-gray-400 shrink-0"/>
                <span className="text-sm font-medium text-gray-800 shrink-0">開始時刻</span>
                <button onClick={()=>setMode(m=>m==='allday'?'scheduled':'allday')}
                  className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${mode==='allday'?'bg-[var(--c-primary)]':'bg-gray-200'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${mode==='allday'?'left-[22px]':'left-0.5'}`}/>
                </button>
                <span className="text-xs text-gray-400 shrink-0">終日</span>
                {mode!=='allday'&&(
                  <button className="flex-1 flex items-center justify-end gap-1" onClick={()=>setTPOpen(true)}>
                    <span className="text-sm text-gray-500">{startTime}{computedEnd?`〜${computedEnd}`:''}</span>
                    <AppIcons.caretRight size={14} className="text-gray-300"/>
                  </button>
                )}
              </div>
            </>)}

            {/* 所要時間 — not shown for allday */}
            {mode!=='allday'&&(<>
              <div className="h-px bg-gray-100 mx-4"/>
              <div className="w-full flex items-center gap-3 px-4 py-2.5">
                <AppIcons.clock size={18} className="text-gray-400 shrink-0"/>
                <span className="text-sm font-medium text-gray-800 shrink-0">所要時間</span>
                <div className="flex gap-1.5 overflow-x-auto" style={{scrollbarWidth:'none',WebkitOverflowScrolling:'touch'} as React.CSSProperties}>
                  {DUR_OPTS.map(({v,l})=>(
                    <button key={v} onClick={()=>{setDur(v);setCDurOpen(false);}}
                      className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold ${duration===v&&!custDurOpen?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>
                      {l}
                    </button>
                  ))}
                  <button onClick={()=>setCDurOpen(o=>!o)}
                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold ${custDurOpen?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>
                    カスタム
                  </button>
                </div>
              </div>
              {custDurOpen&&(
                <div className="flex items-center gap-2 px-4 pb-3">
                  <input type="number" value={custDurMin} min={1}
                    onChange={e=>setCDurMin(Math.max(1,Number(e.target.value)))}
                    className="w-20 border border-gray-200 rounded-xl px-3 py-2 text-sm text-center outline-none"/>
                  <span className="text-sm text-gray-600">分</span>
                  <button onClick={()=>{setDur(custDurMin);setCDurOpen(false);}}
                    className="px-4 py-2 bg-[var(--c-primary)] text-white rounded-xl text-sm font-semibold">設定</button>
                </div>
              )}
            </>)}

            {/* アラート — scheduled/recurring only */}
            {(mode==='scheduled'||mode==='recurring')&&(
              <>
                <div className="h-px bg-gray-100 mx-4"/>
                <div className="w-full flex items-center gap-3 px-4 py-2.5">
                  <AppIcons.bell size={18} className="text-gray-400 shrink-0"/>
                  <span className="text-sm font-medium text-gray-800 shrink-0">アラート</span>
                  <div className="flex gap-1.5 overflow-x-auto" style={{scrollbarWidth:'none',WebkitOverflowScrolling:'touch'} as React.CSSProperties}>
                    {NOTIF_OPTS.map(({v,l})=>(
                      <button key={v} onClick={()=>toggleNotif(v)}
                        className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold ${notifications.includes(v)?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>
                        {l}
                      </button>
                    ))}
                    <button onClick={()=>setCNOpen(o=>!o)}
                      className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold ${custNotifOpen?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>
                      カスタム
                    </button>
                  </div>
                </div>
                {custNotifOpen&&(
                  <div className="flex items-center gap-2 px-4 pb-3">
                    <input type="number" value={custNotifMin} min={1}
                      onChange={e=>setCNMin(Math.max(1,Number(e.target.value)))}
                      className="w-20 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none text-center"/>
                    <span className="text-sm text-gray-600">分前</span>
                    <button onClick={addCustNotif} className="px-3 py-2 bg-[var(--c-primary)] text-white rounded-xl text-sm font-semibold">追加</button>
                  </div>
                )}
                {notifications.filter(v=>!NOTIF_OPTS.find(o=>o.v===v)).length>0&&(
                  <div className="flex flex-wrap gap-2 px-4 pb-3">
                    {notifications.filter(v=>!NOTIF_OPTS.find(o=>o.v===v)).map(v=>(
                      <span key={v} className="inline-flex items-center gap-1 bg-[var(--c-primary)] text-white text-xs font-semibold px-2.5 py-1.5 rounded-full">
                        {v}分前<button onClick={()=>setNotifs(prev=>prev.filter(x=>x!==v))} className="opacity-70 leading-none ml-0.5">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* 締切（PRO機能） */}
            {mode!=='recurring'&&(
              <>
                <div className="h-px bg-gray-100 mx-4"/>
                <button className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50"
                  onClick={()=>{ if(!isPremium){setModalProPrompt('締切管理');return;} setDeadlineOpen(o=>!o); }}>
                  <AppIcons.deadline size={18} className="text-gray-400 shrink-0"/>
                  <span className="flex-1 text-left text-sm font-medium text-gray-800 flex items-center gap-1.5">
                    締切
                    {!isPremium&&<AppIcons.lock size={11} className="text-gray-300"/>}
                  </span>
                  {deadlineDate&&<span className="text-xs text-gray-400">{deadlineDate.slice(5).replace('-','/')} {deadlineTime}</span>}
                  <AppIcons.caretRight size={14} className="text-gray-300"/>
                </button>
                {deadlineOpen&&isPremium&&(
                  <div className="border-t border-gray-100 px-4 pb-3">
                    <div className="flex items-center gap-2 py-3">
                      <div className="flex-1 relative">
                        <input type="date" value={deadlineDate} onChange={e=>setDeadlineDate(e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 outline-none"/>
                        {/* iOS(WebKit)のtype="date"はplaceholder属性を表示しないため、
                            未入力時だけ重ねて表示する（クリックは下の実inputに通す） */}
                        {!deadlineDate&&(
                          <span className="absolute inset-y-0 left-3 flex items-center text-sm text-gray-400 pointer-events-none">日付を選択する</span>
                        )}
                      </div>
                      <input type="time" value={deadlineTime} onChange={e=>setDeadlineTime(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 outline-none"/>
                      {deadlineDate&&(
                        <button onClick={()=>setDeadlineDate('')} className="text-xs text-gray-400 px-2 shrink-0">解除</button>
                      )}
                    </div>
                    {deadlineDate&&(
                      <>
                        <p className="text-xs text-gray-400 mb-1.5">通知タイミング</p>
                        <div className="flex flex-wrap gap-1.5 pb-1">
                          {DEADLINE_NOTIFY_OPTS.map(({v,l})=>(
                            <button key={v} onClick={()=>setDeadlineNotify(v)}
                              className={`px-3 py-1 rounded-full text-xs font-semibold ${deadlineNotify===v?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>{l}</button>
                          ))}
                        </div>
                        {deadlineNotify==='auto'&&(
                          <div className="mt-2 bg-gray-50 rounded-xl p-3 space-y-2.5">
                            <p className="text-xs font-semibold text-gray-500">通知される内容（8件）</p>
                            {computeDeadlineFires(`${deadlineDate}T${deadlineTime||'18:00'}`,'auto')
                              .sort((a,b)=>a.fireMs-b.fireMs)
                              .map(fire=>{
                                const d=new Date(fire.fireMs);
                                const w=['日','月','火','水','木','金','土'][d.getDay()];
                                const label=`${d.getMonth()+1}/${d.getDate()}(${w}) ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                                return (
                                  <div key={fire.key}>
                                    <p className="text-[11px] text-gray-400">{label}</p>
                                    <p className="text-xs text-gray-700">{deadlineAlertBody(name.trim()||'このタスク',fire)}</p>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {/* 場所で通知（「あとでやる」限定・PRO機能） */}
            {mode==='later'&&(
              <>
                <div className="h-px bg-gray-100 mx-4"/>
                <button className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50"
                  onClick={()=>{
                    if(!isPremium){ setModalProPrompt('場所で通知'); return; }
                    if(!taskLocation&&atLocationLimit){ setLocError('場所通知の登録上限に達しています。他の場所通知をオフにしてから追加してください。'); return; }
                    setLocAdding(o=>!o);
                  }}>
                  <AppIcons.location size={18} className="text-gray-400 shrink-0"/>
                  <span className="flex-1 text-left text-sm font-medium text-gray-800 flex items-center gap-1.5">
                    場所で通知
                    {!isPremium&&<AppIcons.lock size={11} className="text-gray-300"/>}
                  </span>
                  {taskLocation&&<span className="text-xs text-gray-400 truncate max-w-[140px]">{taskLocation.name}</span>}
                  <AppIcons.caretRight size={14} className="text-gray-300"/>
                </button>
                {locError&&<p className="text-xs text-[#D97A7A] px-4 pb-3">{locError}</p>}
                {locationNotify&&taskLocPermStatus&&
                  (taskLocPermStatus.location==='denied'||taskLocPermStatus.location==='limited'||taskLocPermStatus.notifications==='denied')&&(
                  <p className="text-xs text-[#D97A7A] px-4 pb-3 leading-relaxed">
                    位置情報または通知の許可が取り消されているため、この通知は届きません。設定アプリ &gt; BrainBoxから「位置情報（常に）」と「通知」を許可してください。
                  </p>
                )}
                {locAdding&&(
                  <div className="border-t border-gray-100 px-4 pt-3 pb-4">
                    {locMapMode?(
                      <ShopMapPicker
                        initialCenter={locMapCenter??locSearchResults[0]??{lat:35.681236,lng:139.767125}}
                        onConfirm={loc=>{setLocPending(prev=>prev?{...loc,name:prev.name}:loc);setLocMapMode(false);setLocMapCenter(null);}}
                        onCancel={()=>{setLocMapMode(false);setLocMapCenter(null);}}/>
                    ):taskLocation&&!locPending?(
                      <>
                        <div className="flex items-center gap-2 mb-3">
                          <AppIcons.location size={14} className="text-gray-400 shrink-0"/>
                          <p className="flex-1 text-sm text-gray-700 truncate">{taskLocation.name}</p>
                        </div>
                        <p className="text-xs text-gray-400 mb-3">半径{TASK_LOCATION_RADIUS_M}m以内に入ったら通知します</p>
                        <div className="flex gap-2">
                          <button onClick={()=>setLocPending(taskLocation)}
                            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 active:bg-gray-200">
                            場所を変更
                          </button>
                          <button onClick={()=>{setTaskLocation(null);setLocationNotify(false);setLocAdding(false);setLocError(null);}}
                            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-50 text-[#D97A7A]">
                            解除
                          </button>
                        </div>
                      </>
                    ):!locPending?(
                      <>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">場所を検索</p>
                        <div className="flex gap-2 mb-3">
                          <input value={locSearchQuery} onChange={e=>setLocSearchQuery(e.target.value)}
                            onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();locDoSearch();}}}
                            placeholder="住所や施設名を入力"
                            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50"/>
                          <button onClick={locDoSearch} disabled={locSearching||!locSearchQuery.trim()}
                            className="px-4 py-2 bg-gray-100 rounded-xl text-sm font-semibold text-gray-700 shrink-0 disabled:opacity-40">
                            {locSearching?'検索中':'検索'}
                          </button>
                        </div>
                        {locSearchResults.length>0&&(
                          <div className="space-y-1 mb-3 max-h-32 overflow-y-auto">
                            {locSearchResults.map((r,i)=>(
                              <button key={i} onClick={()=>setLocPending(r)}
                                className="w-full text-left px-3 py-2 rounded-xl bg-gray-50 active:bg-gray-100 text-sm text-gray-700 truncate">
                                {r.name}
                              </button>
                            ))}
                          </div>
                        )}
                        <button onClick={locOpenMapMode} disabled={locLocating}
                          className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 active:bg-gray-200 mb-2 disabled:opacity-40">
                          {locLocating?'取得中...':'地図で指定'}
                        </button>
                        <button onClick={locUseCurrentLocation} disabled={locLocating}
                          className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 active:bg-gray-200 mb-3 disabled:opacity-40">
                          {locLocating?'取得中...':'現在地から登録'}
                        </button>
                        <button onClick={locCancelAdd} className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gray-50 text-gray-400">
                          キャンセル
                        </button>
                      </>
                    ):(
                      <>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">名前</p>
                        <input value={locPending.name} onChange={e=>setLocPending({...locPending,name:e.target.value})}
                          placeholder="場所の名前"
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 mb-3"/>
                        <p className="text-xs text-gray-400 mb-3">半径{TASK_LOCATION_RADIUS_M}m以内に入ったら通知します</p>
                        <button onClick={()=>{setLocMapCenter({lat:locPending.lat,lng:locPending.lng});setLocMapMode(true);}}
                          className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 active:bg-gray-200 mb-3">
                          地図で場所を変更
                        </button>
                        <div className="flex gap-2">
                          <button onClick={()=>setLocPending(null)}
                            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 active:bg-gray-200">
                            戻る
                          </button>
                          <button onClick={locConfirmPending}
                            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[var(--c-primary)] text-white active:opacity-80">
                            設定する
                          </button>
                        </div>
                      </>
                    )}
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
                {globalTags.length>0&&(
                  <div className="flex flex-wrap gap-2 mb-3">
                    {globalTags.map(td=>{
                      const active=tags.includes(td.name);
                      return (
                        <button key={td.name} onClick={()=>toggleTag(td.name)}
                          style={{backgroundColor:td.color,color:getTagTextColor(td.color)}}
                          className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${active?'ring-2 ring-[var(--c-primary)] ring-offset-1':''}`}>
                          {td.name}
                        </button>
                      );
                    })}
                  </div>
                )}
                <button onClick={()=>{
                    if(task){ flushAndClose(); onOpenTagSettings?.(); return; }
                    if(hasChanges){ setTagNavConfirm(true); return; }
                    onOpenTagSettings?.();
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--c-primary)] px-3 py-1.5 rounded-full bg-gray-50">
                  <AppIcons.plus size={12}/>タグを追加
                </button>
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
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${st.completed?'bg-[var(--c-primary)] border-[var(--c-primary)]':'border-gray-300'}`}>
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
            <button onClick={()=>setDeleteConfirm(true)}
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
                <button onClick={()=>{setIconSheetOpen(false);setAutoIcon(false);}} className="px-4 py-1.5 bg-gray-700 text-white text-sm font-semibold rounded-full">保存</button>
              </div>
            </div>
            <div className="overflow-y-auto px-5 pb-10 flex-1">
              {/* Icon search */}
              <div className="relative mb-4">
                <AppIcons.search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                <input type="text" value={iconQuery} onChange={e=>setIconQuery(e.target.value)}
                  placeholder="アイコンを検索"
                  className="w-full bg-gray-50 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none"/>
              </div>
              {iconQuery.trim()?(
                <div className="mb-5">
                  <p className="text-xs font-bold text-gray-400 mb-2">検索結果</p>
                  {(()=>{
                    const results=ICON_OPTIONS.filter(o=>o.label.includes(iconQuery.trim()));
                    if(results.length===0) return <p className="text-sm text-gray-400 text-center py-6">見つかりませんでした</p>;
                    return <div className="grid grid-cols-5 gap-2">{results.map(renderIconBtn)}</div>;
                  })()}
                </div>
              ):(<>
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
                        return renderIconBtn(opt);
                      })}
                    </div>
                  </>
                )}
                {/* Categories */}
                {ICON_CATEGORIES.map(cat=>(
                  <div key={cat.label} className="mb-5">
                    <p className="text-xs font-bold text-gray-400 mb-2">{cat.label}</p>
                    <div className="grid grid-cols-5 gap-2">
                      {cat.icons.map(renderIconBtn)}
                    </div>
                  </div>
                ))}
              </>)}
            </div>
          </div>
        </div>
      )}
      {timePickerOpen&&(
        <div className="absolute inset-0 z-[105] flex items-center justify-center bg-black/50 rounded-t-3xl"
          onClick={()=>setTPOpen(false)}>
          <div className="bg-white rounded-3xl mx-6 w-full max-w-xs shadow-2xl" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <span className="text-base font-bold text-gray-800">開始時刻</span>
              <button onClick={()=>setTPOpen(false)}
                className="px-4 py-1.5 bg-[var(--c-primary)] text-white text-sm font-bold rounded-full">完了</button>
            </div>
            {(()=>{
              const [hStr,mStr]=startTime.split(':');
              const normM=String(Math.min(55,Math.round((parseInt(mStr)||0)/5)*5)).padStart(2,'0');
              return(
                <>
                  <div className="flex items-center justify-center gap-2 px-5 pb-3 pt-2">
                    <PickerCol items={HOURS} value={hStr} onChange={v=>setST(`${v}:${normM}`)}/>
                    <span className="text-base font-medium text-gray-500 w-5 text-center">時</span>
                    <PickerCol items={MINS} value={normM} onChange={v=>setST(`${hStr}:${v}`)}/>
                    <span className="text-base font-medium text-gray-500 w-5 text-center">分</span>
                  </div>
                  <div className="flex justify-center gap-3 pb-6">
                    {['00','15','30','45'].map(m=>(
                      <button key={m} onClick={()=>setST(`${hStr}:${m}`)}
                        className={`w-14 py-1.5 rounded-full text-sm font-bold transition-colors ${normM===m?'text-white':'text-[var(--c-primary)] bg-gray-50'}`}
                        style={normM===m?{background:'var(--c-primary)'}:{}}>
                        {m}
                      </button>
                    ))}
                  </div>
                </>
              );
            })()}
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
      {tagNavConfirm&&(
        <div className="absolute inset-0 z-[110] flex items-center justify-center px-6" onClick={e=>e.stopPropagation()}>
          <div className="bg-white rounded-2xl p-5 shadow-xl w-full max-w-xs">
            <h3 className="text-base font-bold text-gray-900 mb-1">入力内容を保存しますか？</h3>
            <p className="text-sm text-gray-500 mb-5">タグ設定画面に移動する前に、入力中の内容を保存するか選んでください。</p>
            <div className="flex flex-col gap-2">
              <button onClick={()=>{setTagNavConfirm(false);save();onOpenTagSettings?.();}} disabled={!name.trim()}
                className={`py-2.5 rounded-xl text-sm font-semibold ${name.trim()?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-300 cursor-not-allowed'}`}>保存して移動</button>
              <button onClick={()=>{setTagNavConfirm(false);onOpenTagSettings?.();}}
                className="py-2.5 bg-[#D97A7A] text-white rounded-xl text-sm font-semibold">破棄して移動</button>
              <button onClick={()=>setTagNavConfirm(false)}
                className="py-2.5 bg-gray-100 text-gray-900 rounded-xl text-sm font-semibold">キャンセル</button>
            </div>
          </div>
        </div>
      )}
      {modalProPrompt&&<ProGateSheet onClose={()=>setModalProPrompt(null)} feature={modalProPrompt}/>}
      {deleteConfirm&&(
        <div className="absolute inset-0 z-[110] flex items-center justify-center px-6" onClick={e=>e.stopPropagation()}>
          <div className="bg-white rounded-2xl p-5 shadow-xl w-full max-w-xs">
            <h3 className="text-base font-bold text-gray-900 mb-1">このタスクを削除しますか？</h3>
            <p className="text-sm text-gray-500 mb-5">この操作は取り消せません。</p>
            <div className="flex flex-col gap-2">
              <button onClick={()=>{onDelete?.();onClose();}}
                className="py-2.5 bg-[#D97A7A] text-white rounded-xl text-sm font-semibold">削除する</button>
              <button onClick={()=>setDeleteConfirm(false)}
                className="py-2.5 bg-gray-100 text-gray-900 rounded-xl text-sm font-semibold">キャンセル</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── TaskCard ──────────────────────────────────────────────────────────────────

function TaskCard({task,onToggle,onEdit,globalTags,onSubtaskToggle,tabName}:{task:Task;onToggle:()=>void;onEdit:()=>void;globalTags:TagDef[];onSubtaskToggle?:(subtaskId:string)=>void;tabName?:string;}) {
  const [openPanel,setOpenPanel] = useState<'subtask'|'memo'|null>(null);
  const {language} = useI18n();
  const endTime = (task.startTime&&(task.duration??0)>0) ? fromMin(toMin(task.startTime)+(task.duration??0)) : null;
  const subtasks = task.subtasks??[];
  const doneCount = subtasks.filter(s=>s.completed).length;
  const hasIcons = subtasks.length>0||!!task.memo;
  const firstTagColor = (task.tags??[]).map(n=>globalTags.find(t=>t.name===n)?.color).find(Boolean);
  return (
    <div className={`relative bg-white rounded-2xl border border-gray-100 px-3 py-2.5 overflow-hidden ${task.completed?'opacity-50':''}`} style={{boxShadow:'0 4px 12px rgba(0,0,0,0.06)'}}
      onClick={onEdit}>
      {firstTagColor&&<div className="absolute left-0 top-0 bottom-0 w-1.5" style={{background:firstTagColor}}/>}
      <div className="flex items-center gap-2.5">
        <div className="flex-1 min-w-0">
          {task.startTime&&(
            <p className="text-[11px] text-gray-400 leading-none mb-0.5 flex items-center gap-1.5">
              <span>{task.startTime}{endTime?`〜${endTime}`:''}{task.recurrence&&<AppIcons.repeat size={11} className="ml-1 inline-block align-middle"/>}</span>
              {tabName&&<span className="bg-gray-100 text-gray-500 rounded px-1 py-px text-[10px] font-medium leading-none">{tabName}</span>}
            </p>
          )}
          <p className={`text-[15px] font-semibold leading-snug ${task.completed?'line-through text-gray-400':'text-gray-900'}`}>{task.name}</p>
          {task.deadlineAt&&!task.completed&&(
            <p className={`text-[11px] font-semibold mt-1 flex items-center gap-1 ${deadlineLabelColor(task.deadlineAt)}`}>
              <AppIcons.deadline size={10}/>{deadlineRemainLabel(task.deadlineAt,language)}
            </p>
          )}
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
            </div>
          )}
        </div>
        <button onClick={e=>{e.stopPropagation();onToggle();}}
          className={`w-6 h-6 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${task.completed?'border-[var(--c-primary)] bg-[var(--c-primary)]':'border-gray-300'}`}>
          {task.completed&&<span className="text-white text-[10px] font-bold leading-none">✓</span>}
        </button>
      </div>
      {openPanel==='subtask'&&subtasks.length>0&&(
        <div className="mt-2 space-y-1.5 pb-0.5" onClick={e=>e.stopPropagation()}>
          {subtasks.map(st=>(
            <div key={st.id} className="flex items-center gap-2">
              <button onClick={e=>{e.stopPropagation();onSubtaskToggle?.(st.id);}}
                className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${st.completed?'bg-[var(--c-primary)] border-[var(--c-primary)]':'border-gray-300'}`}>
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

function FreeTimeCard({slot,fits,moreCount=0,height,onSchedule,onDragStart,onMoreClick,measureRef,outerRef}:{
  slot:FreeSlot;fits:Task[];moreCount?:number;height:number;
  onSchedule:(t:Task,time:string)=>void;
  onDragStart:(t:Task,x:number,y:number)=>void;
  onMoreClick?:()=>void;
  measureRef?:(el:HTMLDivElement|null)=>void;
  outerRef?:(el:HTMLDivElement|null)=>void;
}) {
  const [pressingId,setPressingId] = useState<string|null>(null);
  const lpTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const didDrag = useRef(false);
  const {tr} = useI18n();

  const startLP=(task:Task,e:React.TouchEvent)=>{
    const touch=e.touches[0];
    setPressingId(task.id);
    lpTimer.current=setTimeout(()=>{
      navigator.vibrate?.(40);
      setPressingId(null);
      didDrag.current=true;
      onDragStart(task,touch.clientX,touch.clientY);
    },500);
  };
  const cancelLP=()=>{
    if(lpTimer.current){clearTimeout(lpTimer.current);lpTimer.current=null;}
    setPressingId(null);
  };

  const h=Math.floor(slot.min/60), m=slot.min%60;
  return (
    <div ref={outerRef} className="bg-gray-50 rounded-2xl px-3 pt-3 pb-3 flex flex-col border border-gray-100" style={{minHeight:`${height}px`}} data-tour="free-time-card">
      {/* 実測はこの内側のcontentRefで行う（外側のminHeightに引きずられると、一度でも見積りが
          過大になった時に測定値がその過大なサイズで固定されてしまい、あとで縮まなくなる不具合が
          あったため。ここは中身の自然な高さだけを反映する） */}
      <div ref={measureRef}>
        <div className="flex items-center gap-1 mb-1">
          <AppIcons.freeTime size={12} className="text-gray-400"/>
          <span className="text-xs text-gray-400 font-medium">{tr('freeTimeRange').replace('{start}',slot.start).replace('{end}',slot.end)}</span>
        </div>
        <p className="font-medium text-gray-600 leading-none">
          {h>0&&<><span className="text-lg">{h}</span><span className="text-xs ml-0.5">{tr('durUnitHour')}</span></>}
          {m>0&&<><span className="text-lg ml-1">{m}</span><span className="text-xs ml-0.5">{tr('durUnitMin')}</span></>}
        </p>
        {(fits.length>0||moreCount>0)&&(
          <div className="flex flex-wrap gap-1.5 mt-2">
            {fits.map(t=>(
              <button key={t.id}
                onClick={()=>{if(didDrag.current){didDrag.current=false;return;}onSchedule(t,slot.start);}}
                onTouchStart={e=>startLP(t,e)}
                onTouchEnd={cancelLP}
                onTouchMove={cancelLP}
                data-tour="tour-draggable"
                className={`inline-flex items-center bg-gray-100 rounded-full px-2.5 py-1 text-xs font-medium text-gray-500 select-none transition-transform${pressingId===t.id?' scale-95':''}`}>
                <span>{t.name}</span>
              </button>
            ))}
            {moreCount>0&&(
              <button onClick={onMoreClick}
                className="inline-flex items-center bg-gray-100 rounded-full px-2.5 py-1 text-xs font-medium text-gray-400 select-none active:bg-gray-200">
                {tr('moreCountChip').replace('{n}',String(moreCount))}
              </button>
            )}
          </div>
        )}
      </div>
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
          className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors${task.completed?' border-[var(--c-primary)] bg-[var(--c-primary)]':' border-gray-300'}`}>
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

function Timeline({date,tasks,later,settings,now,onToggle,onEdit,onEditIconSheet,onSchedule,onAddAtTime,onDragStart,dragTaskId,yToTimeRef,layoutYRef,globalTags,todayHistory,onSubtaskToggle,lifePatterns=[],patternOverrides={},onPickColor,onEditTime,onOpenLater,customTabs=[]}:{
  date:string;tasks:Task[];later:Task[];settings:Settings;now:string;
  onToggle:(id:string)=>void;onEdit:(t:Task)=>void;onEditIconSheet:(t:Task)=>void;
  onSchedule:(t:Task,time:string)=>void;onAddAtTime:(time:string)=>void;
  onDragStart:(t:Task,x:number,y:number)=>void;dragTaskId?:string;
  yToTimeRef:React.MutableRefObject<((clientY:number)=>string)|null>;
  layoutYRef:React.MutableRefObject<((min:number)=>number)|null>;
  globalTags:TagDef[];
  todayHistory?:{taskNames:string[]};
  onSubtaskToggle:(taskId:string,subtaskId:string)=>void;
  lifePatterns?:LifePattern[];
  onPickColor?:(target:'wake'|'sleep')=>void;
  onEditTime?:(target:'wake'|'sleep')=>void;
  onOpenLater?:()=>void;
  patternOverrides?:Record<string,string>;
  customTabs?:CustomTab[];
}) {
  const [pressingId,setPressingId] = useState<string|null>(null);
  const [historyOpen,setHistoryOpen] = useState(false);
  const [measuredH,setMeasuredH] = useState<Record<string,number>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const roRef = useRef<ResizeObserver|null>(null);
  const {tr} = useI18n();
  // 空き時間カードの外枠(padding+border)の高さ。measuredH['free-*']は内側のcontentのみの高さなので、
  // 積み上げ計算で外枠込みの実際の高さに戻すために使う。フォントサイズやborder幅の環境差（実機WebKit等）
  // で固定px値だと合わないことがあったため、outerRefでマウント時に実際のcomputed styleから算出する
  const freeChromeRef = useRef<Record<string,number>>({});
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
  // When sleep < wake (midnight-crossing), treat sleep as next-day for layout math
  const sleepMinEff=sleepMin<wakeMin?sleepMin+1440:sleepMin;
  const adjM=(t:string)=>{const m=toMin(t);return m<wakeMin?m+1440:m;};
  const nowMin=toMin(now);

  const dayTasks=tasks.filter(t=>t.date===date&&!t.isLater&&t.startTime).sort((a,b)=>toMin(a.startTime!)-toMin(b.startTime!));
  const freeCardMinMin=settings.freeCardMinMin??120;
  const freeSlots=(settings.showFreeCard===false)?[]:calcFreeSlots(tasks,date,settings).filter(sl=>sl.min>=freeCardMinMin);
  const laterPool=later.filter(t=>!t.completed);
  // 「あとでやる」が多いと空き時間カードが際限なく巨大化するため、表示は先頭8件までにし、
  // 残りは「+N件」の非インタラクティブなチップでまとめる（全件は「あとでやる」タブで見られる）
  const FREE_CARD_MAX_CHIPS=8;
  const laterPoolMoreCount=Math.max(0,laterPool.length-FREE_CARD_MAX_CHIPS);
  const laterPoolVisible=laterPool.slice(0,FREE_CARD_MAX_CHIPS);
  // calcFreeContentHの見積りにも「+N件」チップぶんの幅を反映させるため、見積り専用の疑似チップを足したリストを使う
  const laterPoolForEstimate:Task[]=laterPoolMoreCount>0?[...laterPoolVisible,{name:`+${laterPoolMoreCount}件`} as Task]:laterPoolVisible;

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
        ?(measuredH[startTime]??MIN_CARD_H)
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
  // FreeTimeCardの外枠(padding+border)の高さ。フォールバック用の概算値（outerRefでの実測が間に合わない
  // 最初のフレームのみ使う。px-3 pt-3 pb-3=24px相当+border 2px相当を17px基準フォントで見積もったもの）
  const FREE_CARD_CHROME_FALLBACK=27;

  type FreePassItem={slot:FreeSlot;freeY:number;finalH:number};
  const groupLayout:{g:TaskGroupData;top:number}[]=[];
  const freePassItems:FreePassItem[]=[];

  // Phase 0: pre-wake tasks — compact (card order, no time gap)
  // Only include tasks that are before wake AND before sleep (excludes post-midnight tasks when sleep is past midnight)
  let prevBottom=-16;
  for(const g of taskGroupList.filter(g=>{const rawM=toMin(g.startTime);return rawM<wakeMin&&sleepMin>wakeMin;})){
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
      .filter(g=>{const m=adjM(g.startTime);return m>=wakeMin&&m<=sleepMinEff;})
      .map(g=>({kind:'task' as const,g,startMin:adjM(g.startTime),h:g.h})),
    ...freeSlots.map(s=>({kind:'free' as const,slot:s,startMin:adjM(s.start),
      h:measuredH[`free-${s.start}`]!=null
        ?measuredH[`free-${s.start}`]+(freeChromeRef.current[`free-${s.start}`]??FREE_CARD_CHROME_FALLBACK)
        :calcFreeContentH(laterPoolForEstimate)})),
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
  if(anchors[anchors.length-1].min!==sleepMinEff) anchors.push({min:sleepMinEff,y:sleepCardTop});

  // Phase 2: post-sleep tasks — compact (card order, no time gap)
  // Exclude Phase 0 tasks: only include tasks where rawMin >= wakeMin, or past-midnight sleep and rawMin >= sleepMin
  prevBottom=sleepCardTop+SLEEP_CARD_H;
  for(const g of taskGroupList.filter(g=>{const rawM=toMin(g.startTime);return adjM(g.startTime)>sleepMinEff&&(rawM>=wakeMin||(sleepMin<wakeMin&&rawM>=sleepMin));})){
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
    const baseY=el?el.getBoundingClientRect().top:0;
    const timelineY=clientY-baseY;
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
    return fromMin(((snapped%1440)+1440)%1440);
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
        nodes.push({y:wakeCardTop+WAKE_CARD_H/2,color:settings.wakeColor||'var(--c-primary)'});
        for(const {g,top} of groupLayout){
          const mid=g.tasks[Math.floor(g.tasks.length/2)];
          nodes.push({y:top+groupIconTop(g)+groupStackH(g)/2,color:mid?.color||'var(--c-primary)'});
        }
        nodes.push({y:sleepCardTop+SLEEP_CARD_H/2,color:settings.sleepColor||'var(--c-primary)'});
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
      <div className="absolute z-10 cursor-pointer active:opacity-70" style={{top:`${wakeCardTop}px`,left:`${AXIS_X-28}px`,width:'56px',height:'56px'}}
        onClick={()=>onPickColor?.('wake')}>
        <div className="w-full h-full flex items-center justify-center" style={{borderRadius:'28px',background:settings.wakeColor||'var(--c-primary)'}}>
          <AppIcons.wake size={24} className="text-white"/>
        </div>
      </div>
      <div className="absolute flex items-center" style={{top:`${sleepCardTop+SLEEP_CARD_H/2}px`,transform:'translateY(-50%)',left:0}}>
        <span className="text-xs w-10 text-right pr-1 leading-none text-gray-300">{settings.sleepTime}</span>
      </div>
      <div className="absolute z-10 cursor-pointer active:opacity-70" style={{top:`${sleepCardTop}px`,left:`${AXIS_X-28}px`,width:'56px',height:'56px'}}
        onClick={()=>onPickColor?.('sleep')}>
        <div className="w-full h-full flex items-center justify-center" style={{borderRadius:'28px',background:settings.sleepColor||'var(--c-primary)'}}>
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
      {date===todayStr()&&(nowMin>=wakeMin||sleepMinEff>1440&&nowMin<sleepMin)&&adjM(now)<=sleepMinEff&&(
        <div className="absolute flex items-center z-20 gap-1.5" style={{top:`${layoutCalcY(adjM(now))-12}px`,left:'-4px',right:0}}>
          <div className="bg-[var(--c-primary)] text-white text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap">{now}</div>
        </div>
      )}

      {/* wake card */}
      {(()=>{const patId=patternOverrides[date];const pat=patId?lifePatterns.find(p=>p.id===patId):null;return(
      <div className="absolute z-10 cursor-pointer active:opacity-70" style={{top:`${wakeCardTop}px`,left:`${CARD_LEFT}px`,right:'0px'}}
        onClick={()=>onEditTime?.('wake')}>
        <div className="flex items-center gap-2.5 bg-white rounded-2xl border border-gray-100 px-3 py-2.5 select-none" style={{boxShadow:'0 4px 12px rgba(0,0,0,0.06)'}}>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-gray-400 leading-none mb-0.5">{settings.wakeTime}</p>
            <p className="text-sm font-semibold text-gray-900">{tr('timelineWake')}</p>
          </div>
          {pat&&<span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{background:pat.color+'22',color:pat.color}}>{pat.name}</span>}
        </div>
      </div>
      );})()}

      {/* sleep card */}
      {(()=>{const patId=patternOverrides[date];const pat=patId?lifePatterns.find(p=>p.id===patId):null;return(
      <div className="absolute z-10 cursor-pointer active:opacity-70" style={{top:`${sleepCardTop}px`,left:`${CARD_LEFT}px`,right:'0px'}}
        onClick={()=>onEditTime?.('sleep')}>
        <div className="flex items-center gap-2.5 bg-white rounded-2xl border border-gray-100 px-3 py-2.5 select-none" style={{boxShadow:'0 4px 12px rgba(0,0,0,0.06)'}}>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-gray-400 leading-none mb-0.5">{settings.sleepTime}</p>
            <p className="text-sm font-semibold text-gray-900">{tr('timelineSleep')}</p>
          </div>
          {pat&&<span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{background:pat.color+'22',color:pat.color}}>{pat.name}</span>}
        </div>
      </div>
      );})()}

      {/* move history card */}
      {hasHistoryCard&&todayHistory&&(
        <>
          <div className="absolute z-10"
            style={{top:`${sleepCardTop+SLEEP_CARD_H+12}px`,left:`${CARD_LEFT}px`,right:'0px'}}
            onClick={()=>setHistoryOpen(true)}>
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl border border-gray-100 px-3 py-2.5 active:bg-gray-100">
              <span className="text-xs text-gray-400">↩︎</span>
              <span className="text-xs text-gray-400 flex-1">{tr('timelineMovedTasksNotice').replace('{n}',String(todayHistory.taskNames.length))}</span>
              <AppIcons.caretRight size={12} className="text-gray-300"/>
            </div>
          </div>
          {historyOpen&&(
            <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-6"
              onClick={()=>setHistoryOpen(false)}>
              <div className="bg-white rounded-2xl p-4 w-full max-w-xs shadow-xl"
                onClick={e=>e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-900">{tr('timelineMovedTasksTitle')}</p>
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
              <AppIcons.sparkle size={16} className="text-[var(--c-primary)] shrink-0"/>
              <span className="text-sm font-semibold text-gray-500">{tr('timelineCompletedTitle')}</span>
              {completedToday.length>0&&(
                <span className="ml-auto text-xs font-bold bg-[var(--c-primary)] text-white rounded-full px-2 py-0.5">{completedToday.length}</span>
              )}
            </div>
            <div className="px-3 pb-3">
              {completedToday.length===0?(
                <p className="text-xs text-gray-400 text-center py-2">{tr('timelineCompletedEmpty')}</p>
              ):(
                <div className="flex flex-col gap-1">
                  {completedToday.map(t=>(
                    <div key={t.id} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2">
                      <div className="w-4 h-4 rounded bg-[var(--c-primary)] flex items-center justify-center shrink-0">
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
              <div className="w-full h-full flex items-center justify-center active:opacity-70 transition-opacity" style={{borderRadius:'28px',background:task.color||'var(--c-primary)'}}>
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
              <TaskCard task={task} onToggle={()=>onToggle(task.id)} onEdit={()=>onEdit(task)} globalTags={globalTags} onSubtaskToggle={(sid)=>onSubtaskToggle(task.id,sid)} tabName={task.category?customTabs.find(t=>t.id===task.category)?.name:undefined}/>
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
            <span className="text-[var(--c-primary)]" style={{fontSize:'10px'}}>●</span>
            <span className="text-xs text-gray-400">{tr('timelineDuplicateNotice')}</span>
          </div>,
          <div key={`cap-${g.startTime}`} className="absolute z-10 pointer-events-none"
            style={{top:`${stackTop}px`,left:`${AXIS_X-28}px`,width:'56px',height:`${stackH}px`,overflow:'visible'}}>
            {g.tasks.map((task,i)=>(
              <div key={`bg-${task.id}`} className="absolute" style={{
                top:`${capTops[i]}px`,left:0,width:'56px',height:`${capBottoms[i]-capTops[i]}px`,
                background:task.color||'var(--c-primary)',
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
                    <TaskCard task={task} onToggle={()=>onToggle(task.id)} onEdit={()=>onEdit(task)} globalTags={globalTags} onSubtaskToggle={(sid)=>onSubtaskToggle(task.id,sid)} tabName={task.category?customTabs.find(t=>t.id===task.category)?.name:undefined}/>
                  </div>
                );
              })}
            </div>
          </div>,
        ];
      })}

      {/* free time cards */}
      {freeLayout.map(({slot,freeY,finalH},i)=>{
        const fits=laterPoolVisible;
        return (
          <div key={i} className="absolute z-10" style={{top:`${freeY}px`,left:`${CARD_LEFT}px`,right:'0px'}}>
            <FreeTimeCard slot={slot} fits={fits} moreCount={laterPoolMoreCount} height={finalH} onSchedule={onSchedule} onDragStart={onDragStart} onMoreClick={onOpenLater}
              measureRef={el=>{if(el){el.dataset.gk=`free-${slot.start}`;roRef.current?.observe(el);}}}
              outerRef={el=>{
                if(!el) return;
                const key=`free-${slot.start}`;
                const cs=getComputedStyle(el);
                freeChromeRef.current[key]=parseFloat(cs.paddingTop)+parseFloat(cs.paddingBottom)+parseFloat(cs.borderTopWidth)+parseFloat(cs.borderBottomWidth);
              }}/>
          </div>
        );
      })}

      {/* empty state */}
      {dayTasks.length===0&&freeSlots.length===0&&(
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{left:`${CARD_LEFT}px`}}>
          <AppIcons.task size={40} className="mb-2 text-gray-300"/>
          <p className="text-sm text-gray-400">{tr('timelineEmptyTitle')}</p>
          <p className="text-xs text-gray-300 mt-1">{tr('timelineEmptySubtitle')}</p>
        </div>
      )}
    </div>
  );
}

// ── ShopNotifPanel ────────────────────────────────────────────────────────────

function ShopNotifPanel({settings,onChange,notificationsEnabled=true,onEnableNotifications}:{
  settings:ShopNotifSetting[];
  onChange:(s:ShopNotifSetting[])=>void;
  notificationsEnabled?:boolean;
  onEnableNotifications?:()=>void;
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
  const startEdit=(s:ShopNotifSetting)=>{ setEditing(s); setAdding(false); };
  const save=(s:ShopNotifSetting)=>{
    if(adding) onChange([...settings,s]);
    else onChange(settings.map(x=>x.id===s.id?s:x));
    setEditing(null);setAdding(false);
  };
  const del=(id:string)=>onChange(settings.filter(s=>s.id!==id));
  const [deleteId,setDeleteId]=useState<string|null>(null);
  const toggleEnabled=(id:string)=>{
    const target=settings.find(s=>s.id===id);
    if(target&&!target.enabled&&!notificationsEnabled){
      const ok=window.confirm('通知機能がオフになっています。\n通知を有効にしますか？');
      if(!ok) return;
      onEnableNotifications?.();
    }
    onChange(settings.map(s=>s.id===id?{...s,enabled:!s.enabled}:s));
  };
  return (
    <div className="px-4 pb-6">
      <div className="flex items-center justify-between mb-3 mt-1">
        <p className="text-sm font-semibold text-gray-700">買い物リストの通知</p>
        <button onClick={startAdd} disabled={!!editing}
          className="flex items-center gap-1 px-3 py-1.5 bg-[var(--c-primary)] text-white rounded-xl text-sm font-semibold disabled:opacity-40">
          <AppIcons.plus size={14}/>追加
        </button>
      </div>
      {settings.length===0&&!editing&&(
        <p className="text-sm text-gray-400 text-center py-4">通知が設定されていません</p>
      )}
      <div className="space-y-2">
        {settings.map(s=>(
          <div key={s.id} className="bg-white rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3">
            <AppIcons.bell size={16} className={s.enabled?'text-[var(--c-primary)]':'text-gray-300'}/>
            <button onClick={()=>startEdit(s)} className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-gray-800">{fmtDays(s.days)}</p>
              <p className="text-xs text-gray-400">{s.time}</p>
            </button>
            <button onClick={()=>toggleEnabled(s.id)}
              className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${s.enabled?'bg-[var(--c-primary)]':'bg-gray-200'}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${s.enabled?'left-[18px]':'left-0.5'}`}/>
            </button>
            <button onClick={()=>setDeleteId(s.id)} className="text-gray-300 active:text-[#D97A7A] shrink-0">
              <AppIcons.trash size={16}/>
            </button>
          </div>
        ))}
      </div>
      {deleteId&&(
        <div className="fixed inset-0 z-[110] bg-black/40 flex items-center justify-center p-4" onClick={()=>setDeleteId(null)}>
          <div className="bg-white rounded-3xl w-full max-w-md mx-auto p-5" onClick={e=>e.stopPropagation()}>
            <p className="text-center text-[17px] font-semibold text-gray-900 mb-1">この通知を削除しますか？</p>
            <p className="text-center text-[13px] text-gray-400 mb-6">この操作は取り消せません</p>
            <div className="flex gap-2">
              <button onClick={()=>setDeleteId(null)}
                className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 text-[15px] font-semibold">キャンセル</button>
              <button onClick={()=>{del(deleteId);setDeleteId(null);}}
                className="flex-1 py-3 rounded-2xl bg-[#D97A7A] text-white text-[15px] font-semibold">削除する</button>
            </div>
          </div>
        </div>
      )}
      {editing&&(
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={()=>{setEditing(null);setAdding(false);}}>
          <div className="bg-white w-full max-w-md mx-auto rounded-3xl max-h-[85vh] overflow-y-auto p-4" onClick={e=>e.stopPropagation()}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">曜日</p>
            <div className="flex gap-2 flex-wrap mb-4">
              {DOW.map((d,i)=>(
                <button key={i} onClick={()=>{
                  const days=editing.days.includes(i)?editing.days.filter(x=>x!==i):[...editing.days,i];
                  setEditing({...editing,days});
                }}
                  className={`w-9 h-9 rounded-full text-sm font-semibold transition-colors ${editing.days.includes(i)?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>
                  {d}
                </button>
              ))}
            </div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">時間</p>
            <input type="time" value={editing.time} onChange={e=>setEditing({...editing,time:e.target.value})}
              className="border border-gray-200 rounded-xl px-2 py-2 text-sm bg-gray-50 w-full block mb-4" style={{boxSizing:'border-box'}}/>
            <div className="flex gap-2">
              <button onClick={()=>{setEditing(null);setAdding(false);}}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 active:bg-gray-200">
                キャンセル
              </button>
              <button onClick={()=>save(editing)} disabled={editing.days.length===0}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[var(--c-primary)] text-white active:opacity-80 disabled:opacity-40">
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ShopLocationPanel ─────────────────────────────────────────────────────────

// CARTO Voyagerタイル（無料・APIキー不要、Googleマップに近い見やすい配色）を使った軽量な地図ピッカー（ライブラリ追加なし）。
// ピンは画面中央に固定し、地図側をドラッグして動かす（Google/Appleマップと同じUX）。
function ShopMapPicker({initialCenter,onConfirm,onCancel}:{
  initialCenter:{lat:number;lng:number};
  onConfirm:(loc:{name:string;lat:number;lng:number})=>void;
  onCancel:()=>void;
}) {
  const TILE=256, W=304, H=240;
  const [center,setCenter]=useState(initialCenter);
  const [zoom,setZoom]=useState(17);
  const [drag,setDrag]=useState({x:0,y:0});
  const dragStart=useRef<{x:number;y:number}|null>(null);
  const [pinchScale,setPinchScale]=useState(1);
  const pinchStart=useRef<{dist:number;zoom:number}|null>(null);
  const [confirming,setConfirming]=useState(false);
  const [myLocation,setMyLocation]=useState<{lat:number;lng:number}|null>(null);
  const [locating,setLocating]=useState(false);
  const [mapQuery,setMapQuery]=useState('');
  const [mapResults,setMapResults]=useState<{name:string;lat:number;lng:number}[]>([]);
  const [mapSearching,setMapSearching]=useState(false);

  const lonLatToPx=(lon:number,lat:number,z:number)=>{
    const n=2**z;
    const x=(lon+180)/360*n*TILE;
    const latRad=lat*Math.PI/180;
    const y=(1-Math.log(Math.tan(latRad)+1/Math.cos(latRad))/Math.PI)/2*n*TILE;
    return {x,y};
  };
  const pxToLonLat=(x:number,y:number,z:number)=>{
    const n=2**z;
    const lon=x/(n*TILE)*360-180;
    const latRad=Math.atan(Math.sinh(Math.PI*(1-2*y/(n*TILE))));
    return {lon,lat:latRad*180/Math.PI};
  };

  const centerPx=lonLatToPx(center.lng,center.lat,zoom);
  const centerTileX=Math.floor(centerPx.x/TILE), centerTileY=Math.floor(centerPx.y/TILE);
  const fracX=centerPx.x-centerTileX*TILE, fracY=centerPx.y-centerTileY*TILE;
  const wrapLeft=W/2-(TILE+fracX), wrapTop=H/2-(TILE+fracY);
  const n=2**zoom;
  const tiles:{left:number;top:number;tx:number;ty:number}[]=[];
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const ty=centerTileY+dy;
    if(ty<0||ty>=n) continue;
    tiles.push({left:(dx+1)*TILE,top:(dy+1)*TILE,tx:((centerTileX+dx)%n+n)%n,ty});
  }

  const onStart=(x:number,y:number)=>{ dragStart.current={x,y}; };
  const onMove=(x:number,y:number)=>{
    if(!dragStart.current) return;
    setDrag({x:x-dragStart.current.x,y:y-dragStart.current.y});
  };
  const onEnd=()=>{
    if(!dragStart.current) return;
    const {lon,lat}=pxToLonLat(centerPx.x-drag.x,centerPx.y-drag.y,zoom);
    setCenter({lat,lng:lon});
    setDrag({x:0,y:0});
    dragStart.current=null;
  };

  const touchDist=(a:React.Touch,b:React.Touch)=>Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
  const onTouchStart=(e:React.TouchEvent)=>{
    e.stopPropagation();
    if(e.touches.length===2){
      dragStart.current=null;
      pinchStart.current={dist:touchDist(e.touches[0],e.touches[1]),zoom};
    } else if(e.touches.length===1){
      onStart(e.touches[0].clientX,e.touches[0].clientY);
    }
  };
  const onTouchMove=(e:React.TouchEvent)=>{
    e.stopPropagation();
    if(e.touches.length===2&&pinchStart.current){
      setPinchScale(touchDist(e.touches[0],e.touches[1])/pinchStart.current.dist);
    } else if(e.touches.length===1){
      onMove(e.touches[0].clientX,e.touches[0].clientY);
    }
  };
  const onTouchEnd=(e:React.TouchEvent)=>{
    e.stopPropagation();
    if(pinchStart.current){
      const newZoom=Math.min(19,Math.max(12,Math.round(pinchStart.current.zoom+Math.log2(pinchScale))));
      setZoom(newZoom);
      setPinchScale(1);
      pinchStart.current=null;
    }
    if(e.touches.length===0) onEnd();
  };

  const confirm=async()=>{
    setConfirming(true);
    let name='地図で指定した場所';
    try{
      const res=await fetch(`https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lon=${center.lng}&lat=${center.lat}`);
      const data=await res.json() as {results?:{lv01Nm?:string;muniCd?:string}};
      if(data.results?.lv01Nm) name=data.results.lv01Nm;
    }catch{
      // 逆ジオコーディングに失敗しても座標だけで登録を続行
    }
    onConfirm({name,lat:center.lat,lng:center.lng});
    setConfirming(false);
  };

  const doMapSearch=async()=>{
    const q=mapQuery.trim();
    if(!q) return;
    setMapSearching(true);
    try{
      const res=await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=jp&limit=6&accept-language=ja`);
      const data=await res.json() as {display_name:string;lat:string;lon:string}[];
      setMapResults(data.map(d=>({name:d.display_name,lat:parseFloat(d.lat),lng:parseFloat(d.lon)})));
    }catch{
      setMapResults([]);
    }
    setMapSearching(false);
  };
  const pickMapResult=(r:{name:string;lat:number;lng:number})=>{
    setCenter({lat:r.lat,lng:r.lng});
    setMapResults([]);
    setMapQuery('');
  };

  const useMyLocation=()=>{
    setLocating(true);
    getCurrentCoords(10000).then(loc=>{
      setLocating(false);
      if(!loc){ alert('現在地を取得できませんでした'); return; }
      setMyLocation(loc);
      setCenter(loc);
    });
  };

  // 地図を開いた瞬間に画面をブロックせず表示し、裏で現在地取得を試みて
  // 取れたらピンを自動的に現在地へ寄せる（ユーザーがまだ地図を操作していない場合のみ）。
  // 失敗してもアラートは出さず、既定の中心のまま静かにフォールバックする。
  useEffect(()=>{
    let cancelled=false;
    getCurrentCoords(7000).then(loc=>{
      if(cancelled||!loc) return;
      setMyLocation(loc);
      if(!dragStart.current) setCenter(loc);
    });
    return ()=>{ cancelled=true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const myDotPx = myLocation ? lonLatToPx(myLocation.lng,myLocation.lat,zoom) : null;
  const myDotLeft = myDotPx ? W/2+(myDotPx.x-centerPx.x)+drag.x : null;
  const myDotTop  = myDotPx ? H/2+(myDotPx.y-centerPx.y)+drag.y : null;

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input value={mapQuery} onChange={e=>setMapQuery(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();doMapSearch();}}}
          placeholder="住所や施設名で検索"
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50"/>
        <button onClick={doMapSearch} disabled={mapSearching||!mapQuery.trim()}
          className="px-4 py-2 bg-gray-100 rounded-xl text-sm font-semibold text-gray-700 shrink-0 disabled:opacity-40">
          {mapSearching?'検索中':'検索'}
        </button>
      </div>
      {mapResults.length>0&&(
        <div className="space-y-1 mb-2 max-h-32 overflow-y-auto">
          {mapResults.map((r,i)=>(
            <button key={i} onClick={()=>pickMapResult(r)}
              className="w-full text-left px-3 py-2 rounded-xl bg-gray-50 active:bg-gray-100 text-sm text-gray-700 truncate">
              {r.name}
            </button>
          ))}
        </div>
      )}
      <div className="relative rounded-xl overflow-hidden bg-gray-100 mb-3 select-none touch-none"
        style={{width:'100%',height:H}}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={e=>onStart(e.clientX,e.clientY)}
        onMouseMove={e=>{if(dragStart.current)onMove(e.clientX,e.clientY);}}
        onMouseUp={onEnd}
        onMouseLeave={()=>{if(dragStart.current)onEnd();}}
      >
        <div className="absolute" style={{inset:0,transform:`scale(${pinchScale})`,transformOrigin:'center center'}}>
          <div className="absolute" style={{left:wrapLeft+drag.x,top:wrapTop+drag.y,width:TILE*3,height:TILE*3}}>
            {tiles.map((t,i)=>(
              <img key={i} src={`https://basemaps.cartocdn.com/rastertiles/voyager/${zoom}/${t.tx}/${t.ty}.png`} draggable={false} alt=""
                style={{position:'absolute',left:t.left,top:t.top,width:TILE,height:TILE}}/>
            ))}
          </div>
        </div>
        {myDotLeft!==null&&myDotTop!==null&&(
          <div className="absolute pointer-events-none" style={{left:myDotLeft,top:myDotTop,transform:'translate(-50%,-50%)'}}>
            <div className="w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-white" style={{boxShadow:'0 0 0 4px rgba(59,130,246,0.25)'}}/>
          </div>
        )}
        <div className="absolute pointer-events-none" style={{left:'50%',top:'50%',transform:'translate(-50%,-100%)'}}>
          <AppIcons.location size={32} className="text-[var(--c-primary)]"/>
        </div>
        <div className="absolute bottom-1 right-1.5 bg-white/80 rounded px-1 text-[9px] text-gray-500">© CARTO © OpenStreetMap</div>
        <div className="absolute top-2 right-2 flex flex-col gap-1.5">
          <button onClick={()=>setZoom(z=>Math.min(19,z+1))} className="w-7 h-7 bg-white rounded-lg shadow text-gray-600 font-bold">+</button>
          <button onClick={()=>setZoom(z=>Math.max(12,z-1))} className="w-7 h-7 bg-white rounded-lg shadow text-gray-600 font-bold">−</button>
        </div>
        <button onClick={useMyLocation} disabled={locating}
          className="absolute bottom-2 left-2 w-8 h-8 bg-white rounded-lg shadow flex items-center justify-center text-gray-600 disabled:opacity-50">
          <AppIcons.crosshair size={16}/>
        </button>
      </div>
      <p className="text-xs text-gray-400 text-center mb-3">ドラッグで移動、ピンチで拡大縮小できます</p>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 active:bg-gray-200">
          戻る
        </button>
        <button onClick={confirm} disabled={confirming}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[var(--c-primary)] text-white active:opacity-80 disabled:opacity-50">
          {confirming?'取得中...':'この位置に決定'}
        </button>
      </div>
    </div>
  );
}

function ShopLocationPanel({locations,onChange,isPremium,onProPrompt}:{
  locations:ShopLocation[];
  onChange:(l:ShopLocation[])=>void;
  isPremium:boolean;
  onProPrompt:(feature:string)=>void;
}) {
  const [adding,setAdding]=useState(false);
  const [mapMode,setMapMode]=useState(false);
  const [mapCenter,setMapCenter]=useState<{lat:number;lng:number}|null>(null);
  const [searchQuery,setSearchQuery]=useState('');
  const [searchResults,setSearchResults]=useState<{name:string;lat:number;lng:number}[]>([]);
  const [searching,setSearching]=useState(false);
  const [pendingCoord,setPendingCoord]=useState<{name:string;lat:number;lng:number}|null>(null);
  const [radius,setRadius]=useState<100|300|500>(300);
  const [locating,setLocating]=useState(false);
  const [permStatus,setPermStatus]=useState<{location:string;notifications:string}|null>(null);

  useEffect(()=>{ checkGeofencePermissions().then(setPermStatus); },[]);

  const doSearch=async()=>{
    const q=searchQuery.trim();
    if(!q) return;
    setSearching(true);
    try{
      const res=await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=jp&limit=8&accept-language=ja`);
      const data=await res.json() as {display_name:string;lat:string;lon:string}[];
      setSearchResults(data.map(d=>({name:d.display_name,lat:parseFloat(d.lat),lng:parseFloat(d.lon)})));
    }catch{
      setSearchResults([]);
    }
    setSearching(false);
  };

  const useCurrentLocation=()=>{
    setLocating(true);
    getCurrentCoords(10000).then(loc=>{
      setLocating(false);
      if(!loc){ alert('現在地を取得できませんでした'); return; }
      setMapCenter(loc);
      setMapMode(true);
    });
  };

  // 地図はすぐに表示し、現在地への自動センタリングは ShopMapPicker 内部で
  // 裏側で試みる（ここで待ってから開くと表示までのラグが大きくなるため）
  const openMapMode=()=>{
    setMapCenter(null);
    setMapMode(true);
  };

  const [editLocId,setEditLocId]=useState<string|null>(null);

  const cancelAdd=()=>{ setAdding(false);setMapMode(false);setMapCenter(null);setPendingCoord(null);setSearchQuery('');setSearchResults([]);setRadius(300);setEditLocId(null); };

  const startEditLocation=(l:ShopLocation)=>{
    setEditLocId(l.id);
    setPendingCoord({name:l.name,lat:l.lat,lng:l.lng});
    setRadius(l.radius);
    setAdding(true);
  };

  const confirmAdd=async()=>{
    if(!pendingCoord) return;
    if(!isPremium){ onProPrompt('場所で通知'); return; }
    const ok=await ensureGeofencePermission('shop_location');
    const status=await checkGeofencePermissions();
    setPermStatus(status);
    if(!ok) return;
    if(editLocId){
      onChange(locations.map(l=>l.id===editLocId?{...l,name:pendingCoord.name,lat:pendingCoord.lat,lng:pendingCoord.lng,radius}:l));
    }else{
      onChange([...locations,{id:uid(),name:pendingCoord.name,lat:pendingCoord.lat,lng:pendingCoord.lng,radius,enabled:true}]);
      logAnalyticsEvent('location_notification_created',{radius});
    }
    cancelAdd();
  };

  const toggle=(id:string)=>{
    const target=locations.find(l=>l.id===id);
    if(target&&!target.enabled&&!isPremium){ onProPrompt('場所で通知'); return; }
    onChange(locations.map(l=>l.id===id?{...l,enabled:!l.enabled}:l));
  };
  const del=(id:string)=>onChange(locations.filter(l=>l.id!==id));
  const [deleteId,setDeleteId]=useState<string|null>(null);

  // location==='limited'は「Appの使用中のみ許可」状態。バックグラウンドのジオフェンス監視には
  // 「常に許可」が必須なため、明確な拒否(denied)と同様にバナーで案内する
  const permDenied = permStatus!==null && (permStatus.location==='denied'||permStatus.location==='limited'||permStatus.notifications==='denied');

  return (
    <div className="px-4 pb-6">
      <div className="flex items-center justify-between mb-3 mt-1">
        <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          場所で通知
          {!isPremium&&<span className="inline-flex items-center gap-0.5 border border-gray-300 rounded px-1.5 py-0.5 text-[10px] font-bold text-gray-400 leading-none tracking-wide">★ PRO</span>}
        </p>
        <button onClick={()=>setAdding(true)} disabled={adding}
          className="flex items-center gap-1 px-3 py-1.5 bg-[var(--c-primary)] text-white rounded-xl text-sm font-semibold disabled:opacity-40">
          <AppIcons.plus size={14}/>追加
        </button>
      </div>
      {permDenied&&(
        <div className="bg-amber-50 rounded-2xl px-4 py-3 mb-3 flex items-start gap-2">
          <AppIcons.location size={16} className="text-amber-500 shrink-0 mt-0.5"/>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-amber-700 leading-relaxed mb-2">位置情報または通知の許可が必要です。設定アプリ &gt; BrainBoxから「位置情報（常に）」と「通知」を許可してください。</p>
            <button onClick={()=>openAppSettings()}
              className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg text-xs font-semibold active:bg-amber-200">
              設定アプリを開く
            </button>
          </div>
        </div>
      )}
      {locations.length===0&&!adding&&(
        <p className="text-sm text-gray-400 text-center py-4">場所が登録されていません</p>
      )}
      <div className="space-y-2">
        {locations.map(l=>(
          <div key={l.id} className="bg-white rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3">
            <AppIcons.location size={16} className={l.enabled?'text-[var(--c-primary)]':'text-gray-300'}/>
            <button onClick={()=>startEditLocation(l)} className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-gray-800 truncate">{l.name}</p>
              <p className="text-xs text-gray-400">半径{l.radius}m</p>
            </button>
            <button onClick={()=>toggle(l.id)}
              className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${l.enabled?'bg-[var(--c-primary)]':'bg-gray-200'}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${l.enabled?'left-[18px]':'left-0.5'}`}/>
            </button>
            <button onClick={()=>setDeleteId(l.id)} className="text-gray-300 active:text-[#D97A7A] shrink-0">
              <AppIcons.trash size={16}/>
            </button>
          </div>
        ))}
      </div>
      {deleteId&&(
        <div className="fixed inset-0 z-[110] bg-black/40 flex items-center justify-center p-4" onClick={()=>setDeleteId(null)}>
          <div className="bg-white rounded-3xl w-full max-w-md mx-auto p-5" onClick={e=>e.stopPropagation()}>
            <p className="text-center text-[17px] font-semibold text-gray-900 mb-1">この場所を削除しますか？</p>
            <p className="text-center text-[13px] text-gray-400 mb-6">この操作は取り消せません</p>
            <div className="flex gap-2">
              <button onClick={()=>setDeleteId(null)}
                className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 text-[15px] font-semibold">キャンセル</button>
              <button onClick={()=>{del(deleteId);setDeleteId(null);}}
                className="flex-1 py-3 rounded-2xl bg-[#D97A7A] text-white text-[15px] font-semibold">削除する</button>
            </div>
          </div>
        </div>
      )}
      {adding&&(
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={cancelAdd}>
          <div className="bg-white w-full max-w-md mx-auto rounded-3xl max-h-[85vh] overflow-y-auto p-4" onClick={e=>e.stopPropagation()}>
            {!pendingCoord?(
              <>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">場所を検索</p>
                <div className="flex gap-2 mb-3">
                  <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();doSearch();}}}
                    placeholder="住所や施設名を入力"
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50"/>
                  <button onClick={doSearch} disabled={searching||!searchQuery.trim()}
                    className="px-4 py-2 bg-gray-100 rounded-xl text-sm font-semibold text-gray-700 shrink-0 disabled:opacity-40">
                    {searching?'検索中':'検索'}
                  </button>
                </div>
                {searchResults.length>0&&(
                  <div className="space-y-1 mb-3 max-h-40 overflow-y-auto">
                    {searchResults.map((r,i)=>(
                      <button key={i} onClick={()=>setPendingCoord(r)}
                        className="w-full text-left px-3 py-2 rounded-xl bg-gray-50 active:bg-gray-100 text-sm text-gray-700 truncate">
                        {r.name}
                      </button>
                    ))}
                  </div>
                )}
                <button onClick={openMapMode} disabled={locating}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 active:bg-gray-200 mb-2 disabled:opacity-40">
                  {locating?'取得中...':'地図で指定'}
                </button>
                <button onClick={useCurrentLocation} disabled={locating}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 active:bg-gray-200 mb-3 disabled:opacity-40">
                  {locating?'取得中...':'現在地から登録'}
                </button>
                <button onClick={cancelAdd} className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gray-50 text-gray-400">
                  キャンセル
                </button>
              </>
            ):(
              <>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">通知する範囲</p>
                <div className="flex gap-2 mb-4">
                  {([100,300,500] as const).map(r=>(
                    <button key={r} onClick={()=>setRadius(r)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${radius===r?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>
                      {r}m
                    </button>
                  ))}
                </div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">名前</p>
                <input value={pendingCoord.name} onChange={e=>setPendingCoord({...pendingCoord,name:e.target.value})}
                  placeholder="場所の名前"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 mb-4"/>
                <button onClick={()=>{setMapCenter({lat:pendingCoord.lat,lng:pendingCoord.lng});setMapMode(true);}}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 active:bg-gray-200 mb-4">
                  地図で場所を変更
                </button>
                <div className="flex gap-2">
                  <button onClick={()=>{editLocId?cancelAdd():setPendingCoord(null);}}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 active:bg-gray-200">
                    {editLocId?'キャンセル':'戻る'}
                  </button>
                  <button onClick={confirmAdd}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[var(--c-primary)] text-white active:opacity-80">
                    {editLocId?'保存':'登録'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {adding&&mapMode&&(
        <div className="fixed inset-0 z-[110] bg-black/50 flex items-end justify-center" onClick={()=>{setMapMode(false);setMapCenter(null);}}>
          <div className="bg-white w-full max-w-md mx-auto rounded-t-3xl p-4" onClick={e=>e.stopPropagation()}>
            <ShopMapPicker
              initialCenter={mapCenter??searchResults[0]??{lat:35.681236,lng:139.767125}}
              onConfirm={loc=>{setPendingCoord(prev=>editLocId&&prev?{...loc,name:prev.name}:loc);setMapMode(false);setMapCenter(null);}}
              onCancel={()=>{setMapMode(false);setMapCenter(null);}}/>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ForgetAlertsPanel（忘れ物防止アラート・PRO機能）────────────────────────────────

type ForgetAlertDraft = Omit<ForgetAlert,'location'> & { location: {name:string;lat:number;lng:number}|null };

function ForgetAlertsPanel({alerts,onChange,isPremium,onProPrompt}:{
  alerts:ForgetAlert[];
  onChange:(a:ForgetAlert[])=>void;
  isPremium:boolean;
  onProPrompt:(feature:string)=>void;
}) {
  const DOW=['日','月','火','水','木','金','土'];
  const [editing,setEditing]=useState<ForgetAlertDraft|null>(null);
  const [adding,setAdding]=useState(false);
  const [mapMode,setMapMode]=useState(false);
  const [mapCenter,setMapCenter]=useState<{lat:number;lng:number}|null>(null);
  const [locating,setLocating]=useState(false);
  const [itemInput,setItemInput]=useState('');
  const [permError,setPermError]=useState<string|null>(null);
  const [customDayOpen,setCustomDayOpen]=useState(false);
  // 登録済みアラートが有効なまま、設定後に位置情報/通知の許可を取り消された場合に気づけるよう、
  // 画面を開くたびに現在の許可状態を確認する（ShopLocationPanelと同じパターン）
  const [permStatus,setPermStatus]=useState<{location:string;notifications:string}|null>(null);
  useEffect(()=>{ checkGeofencePermissions().then(setPermStatus); },[]);

  // 2件目以降の登録・有効化はPRO限定（1件までは無料）。作成順（配列の並び順）で判定する
  const isLockedByPlan=(idx:number)=>!isPremium&&idx>0;

  const fmtDays=(days:number[])=>{
    if(days.length===7) return '毎日';
    if(days.length===2&&days.includes(0)&&days.includes(6)) return '週末';
    if(days.length===5&&!days.includes(0)&&!days.includes(6)) return '平日';
    return [...days].sort((a,b)=>a-b).map(d=>DOW[d]).join('・');
  };
  // 文章の空欄に表示する曜日プリセット名（毎日/平日/休日に一致しなければカスタム扱い）
  const dayPreset=(days:number[]):'毎日'|'平日'|'休日'|'カスタム'=>{
    const s=[...days].sort((a,b)=>a-b).join(',');
    if(s==='0,1,2,3,4,5,6') return '毎日';
    if(s==='1,2,3,4,5') return '平日';
    if(s==='0,6') return '休日';
    return 'カスタム';
  };
  const applyDayPreset=(p:'毎日'|'平日'|'休日'|'カスタム')=>{
    if(!editing) return;
    if(p==='毎日'){ setEditing({...editing,weekdays:[0,1,2,3,4,5,6]}); setCustomDayOpen(false); }
    else if(p==='平日'){ setEditing({...editing,weekdays:[1,2,3,4,5]}); setCustomDayOpen(false); }
    else if(p==='休日'){ setEditing({...editing,weekdays:[0,6]}); setCustomDayOpen(false); }
    else setCustomDayOpen(true);
  };
  // 保存前に表示する文章形式のプレビュー（入力フォームとは別に、確認だけを担う）。
  // 時間帯を指定していない（終日）場合は「の終日に」という不自然な言い回しを避け、
  // 曜日だけを述べる形にする
  const previewText=(d:ForgetAlertDraft)=>{
    const day=dayPreset(d.weekdays)==='カスタム'?fmtDays(d.weekdays):dayPreset(d.weekdays);
    const place=d.name||'（場所未設定）';
    const triggerLabel=d.trigger==='enter'?`${place}に着いたとき`:`${place}を出るとき`;
    const items=d.items.length>0?d.items.join('、'):'（持ち物未設定）';
    const dayClause=d.timeStart&&d.timeEnd?`${day}の${d.timeStart}〜${d.timeEnd}に`:`${day}、`;
    return `${dayClause}${triggerLabel}、\n${items}を確認してください。`;
  };

  const cancelEdit=()=>{
    setEditing(null);setAdding(false);setMapMode(false);setMapCenter(null);
    setPermError(null);setItemInput('');setCustomDayOpen(false);
  };
  const startAdd=()=>{
    setEditing({id:uid(),name:'',location:null,radius:300,trigger:'exit',weekdays:[1,2,3,4,5],timeStart:'',timeEnd:'',enabled:true,items:[]});
    setAdding(true);
    setItemInput('');setPermError(null);setCustomDayOpen(false);
  };
  const startEdit=(a:ForgetAlert)=>{
    setEditing({...a,trigger:a.trigger??'exit'}); setAdding(false); setItemInput(''); setPermError(null);
    setCustomDayOpen(dayPreset(a.weekdays)==='カスタム');
  };

  const useCurrentLocation=()=>{
    setLocating(true);
    getCurrentCoords(10000).then(loc=>{
      setLocating(false);
      if(!loc){ setPermError('現在地を取得できませんでした'); return; }
      setMapCenter(loc);
      setMapMode(true);
    });
  };
  const pickLocation=(loc:{name:string;lat:number;lng:number})=>{
    if(!editing) return;
    setEditing({...editing, location:loc, name:editing.name||loc.name});
  };
  const toggleDay=(i:number)=>{
    if(!editing) return;
    setEditing({...editing,weekdays:editing.weekdays.includes(i)?editing.weekdays.filter(x=>x!==i):[...editing.weekdays,i]});
  };
  const addItem=()=>{
    const v=itemInput.trim();
    if(!v||!editing||editing.items.includes(v)){ setItemInput(''); return; }
    setEditing({...editing,items:[...editing.items,v]});
    setItemInput('');
  };
  const removeItem=(v:string)=>{ if(editing) setEditing({...editing,items:editing.items.filter(x=>x!==v)}); };

  const saveEditing=async()=>{
    if(!editing||!editing.location||!editing.name.trim()||editing.weekdays.length===0||editing.items.length===0) return;
    if(adding&&!isPremium&&alerts.length>=1){ onProPrompt('忘れ物防止アラート（2件目以降）'); return; }
    const ok=await ensureGeofencePermission('forget_alert');
    if(!ok){ setPermError('場所を出たときに通知するため、位置情報の利用を許可してください。'); return; }
    const toSave:ForgetAlert={...editing,name:editing.name.trim(),location:editing.location};
    if(adding){ onChange([...alerts,toSave]); logAnalyticsEvent('location_notification_created',{radius:toSave.radius}); }
    else onChange(alerts.map(a=>a.id===toSave.id?toSave:a));
    cancelEdit();
  };
  const del=(id:string)=>onChange(alerts.filter(a=>a.id!==id));
  const [deleteId,setDeleteId]=useState<string|null>(null);
  const toggleEnabled=(id:string)=>{
    const idx=alerts.findIndex(a=>a.id===id);
    if(idx>=0&&!alerts[idx].enabled&&isLockedByPlan(idx)){ onProPrompt('忘れ物防止アラート（2件目以降）'); return; }
    onChange(alerts.map(a=>a.id===id?{...a,enabled:!a.enabled}:a));
  };

  // locationが'limited'（Appの使用中のみ許可）はバックグラウンドのジオフェンス監視には不十分なため、
  // 明確な拒否(denied)と同様に案内する。有効なアラートが無ければ表示する意味が無いので絞り込む
  const permDenied = permStatus!==null && alerts.some(a=>a.enabled) &&
    (permStatus.location==='denied'||permStatus.location==='limited'||permStatus.notifications==='denied');

  return (
    <div className="pb-6">
      <div className="flex items-center justify-between mb-3 mt-4">
        <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          忘れ物防止アラート
          {!isPremium&&<span className="inline-flex items-center gap-0.5 border border-gray-300 rounded px-1.5 py-0.5 text-[10px] font-bold text-gray-400 leading-none tracking-wide">★ PRO</span>}
        </p>
        <button onClick={startAdd}
          className="flex items-center gap-1 px-3 py-1.5 bg-[var(--c-primary)] text-white rounded-xl text-sm font-semibold">
          <AppIcons.plus size={14}/>追加
        </button>
      </div>
      {!isPremium&&<p className="text-xs text-gray-400 px-1 mb-3">1件まで無料でご利用いただけます。2件目からPROが必要です。</p>}
      {permDenied&&(
        <div className="bg-amber-50 rounded-2xl px-4 py-3 mb-3 flex items-start gap-2">
          <AppIcons.location size={16} className="text-amber-500 shrink-0 mt-0.5"/>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-amber-700 leading-relaxed mb-2">位置情報または通知の許可が必要です。設定アプリ &gt; BrainBoxから「位置情報（常に）」と「通知」を許可してください。</p>
            <button onClick={()=>openAppSettings()}
              className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg text-xs font-semibold active:bg-amber-200">
              設定アプリを開く
            </button>
          </div>
        </div>
      )}
      {alerts.length===0&&(
        <p className="text-sm text-gray-400 text-center py-8">アラートが登録されていません</p>
      )}
      <div className="space-y-2">
        {alerts.map((a,i)=>{
          const locked=isLockedByPlan(i);
          return (
          <div key={a.id} className="bg-white rounded-2xl shadow-sm px-4 py-3">
            <div className="flex items-center gap-3">
              <AppIcons.backpack size={16} className={a.enabled?'text-[var(--c-primary)]':'text-gray-300'}/>
              <button onClick={()=>startEdit(a)} className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-gray-800 truncate">{a.name}{(a.trigger??'exit')==='enter'?'に着いたとき':'を出るとき'}</p>
                <p className="text-xs text-gray-400">{fmtDays(a.weekdays)}{a.timeStart&&a.timeEnd?` ${a.timeStart}〜${a.timeEnd}`:''}・{a.radius??200}m</p>
              </button>
              {locked&&<AppIcons.star size={12} className="text-gray-300 shrink-0"/>}
              <button onClick={()=>toggleEnabled(a.id)}
                className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${a.enabled?'bg-[var(--c-primary)]':'bg-gray-200'}`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${a.enabled?'left-[18px]':'left-0.5'}`}/>
              </button>
              <button onClick={()=>setDeleteId(a.id)} className="text-gray-300 active:text-[#D97A7A] shrink-0">
                <AppIcons.trash size={16}/>
              </button>
            </div>
            {a.items.length>0&&(
              <div className="flex flex-wrap gap-1.5 mt-2.5 pl-7">
                {a.items.map(it=>(
                  <span key={it} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{it}</span>
                ))}
              </div>
            )}
          </div>
        );})}
      </div>

      {deleteId&&(
        <div className="fixed inset-0 z-[110] bg-black/40 flex items-center justify-center p-4" onClick={()=>setDeleteId(null)}>
          <div className="bg-white rounded-3xl w-full max-w-md mx-auto p-5" onClick={e=>e.stopPropagation()}>
            <p className="text-center text-[17px] font-semibold text-gray-900 mb-1">このアラートを削除しますか？</p>
            <p className="text-center text-[13px] text-gray-400 mb-6">この操作は取り消せません</p>
            <div className="flex gap-2">
              <button onClick={()=>setDeleteId(null)}
                className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 text-[15px] font-semibold">キャンセル</button>
              <button onClick={()=>{del(deleteId);setDeleteId(null);}}
                className="flex-1 py-3 rounded-2xl bg-[#D97A7A] text-white text-[15px] font-semibold">削除する</button>
            </div>
          </div>
        </div>
      )}

      {editing&&(
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={cancelEdit}>
          <div className="bg-white w-full max-w-md mx-auto rounded-3xl max-h-[85vh] overflow-y-auto p-4" onClick={e=>e.stopPropagation()}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">忘れ物防止アラートを作成</p>

            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">場所</p>
            <input value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}
              placeholder="場所の名前"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 mb-2"/>
            {editing.location&&(
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 mb-2">
                <AppIcons.location size={14} className="text-gray-400 shrink-0"/>
                <p className="flex-1 text-sm text-gray-700 truncate">{editing.location.name}</p>
              </div>
            )}
            <div className="flex gap-2 mb-3">
              <button onClick={()=>{setMapCenter(editing.location?{lat:editing.location.lat,lng:editing.location.lng}:null);setMapMode(true);}}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 active:bg-gray-200">地図で指定</button>
              <button onClick={useCurrentLocation} disabled={locating}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 active:bg-gray-200 disabled:opacity-40">
                {locating?'取得中...':'現在地から'}
              </button>
            </div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">通知する範囲</p>
            <div className="flex gap-2 mb-4">
              {([100,300,500] as const).map(r=>(
                <button key={r} onClick={()=>setEditing({...editing,radius:r})}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${editing.radius===r?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>
                  {r}m
                </button>
              ))}
            </div>

            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">条件</p>
            <div className="flex gap-2 mb-4">
              <button onClick={()=>setEditing({...editing,trigger:'enter'})}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${editing.trigger==='enter'?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>
                到着したら
              </button>
              <button onClick={()=>setEditing({...editing,trigger:'exit'})}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${editing.trigger==='exit'?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>
                出発したら
              </button>
            </div>

            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">曜日</p>
            <div className="flex gap-2 flex-wrap mb-3">
              {(['毎日','平日','休日','カスタム'] as const).map(p=>(
                <button key={p} onClick={()=>applyDayPreset(p)}
                  className={`px-3 py-1.5 rounded-full text-sm font-semibold ${dayPreset(editing.weekdays)===p||(p==='カスタム'&&customDayOpen&&dayPreset(editing.weekdays)!=='カスタム')?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>{p}</button>
              ))}
            </div>
            {(dayPreset(editing.weekdays)==='カスタム'||customDayOpen)&&(
              <div className="flex gap-2 flex-wrap mb-4">
                {DOW.map((d,i)=>(
                  <button key={i} onClick={()=>toggleDay(i)}
                    className={`w-9 h-9 rounded-full text-sm font-semibold transition-colors ${editing.weekdays.includes(i)?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>
                    {d}
                  </button>
                ))}
              </div>
            )}

            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">時間帯（任意）</p>
            <div className="flex items-center gap-2 mb-1">
              <input type="time" value={editing.timeStart??''} onChange={e=>setEditing({...editing,timeStart:e.target.value})}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50"/>
              <span className="text-gray-300">〜</span>
              <input type="time" value={editing.timeEnd??''} onChange={e=>setEditing({...editing,timeEnd:e.target.value})}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50"/>
              {(editing.timeStart||editing.timeEnd)&&(
                <button onClick={()=>setEditing({...editing,timeStart:'',timeEnd:''})} className="text-xs text-gray-400 px-1 shrink-0">解除</button>
              )}
            </div>
            <p className="text-[11px] text-gray-300 mb-4">指定しない場合は終日対象になります</p>

            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">持ち物</p>
            <div className="flex gap-2 mb-2">
              <input value={itemInput} onChange={e=>setItemInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addItem();}}}
                placeholder="財布、鍵など"
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50"/>
              <button onClick={addItem} disabled={!itemInput.trim()}
                className="px-4 py-2 bg-gray-100 rounded-xl text-sm font-semibold text-gray-700 shrink-0 disabled:opacity-40">追加</button>
            </div>
            {editing.items.length>0&&(
              <div className="flex flex-wrap gap-1.5 mb-4">
                {editing.items.map(it=>(
                  <span key={it} className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-full">
                    {it}<button onClick={()=>removeItem(it)} className="opacity-60 leading-none ml-0.5">×</button>
                  </span>
                ))}
              </div>
            )}

            <div className="h-px bg-gray-100 mb-4"/>

            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">プレビュー</p>
            <div className="bg-gray-50 rounded-2xl p-4 mb-4">
              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">{previewText(editing)}</p>
            </div>

            {permError&&<p className="text-xs text-[#D97A7A] mb-3">{permError}</p>}

            <div className="flex gap-2">
              <button onClick={cancelEdit}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 active:bg-gray-200">
                キャンセル
              </button>
              <button onClick={saveEditing}
                disabled={!editing.location||!editing.name.trim()||editing.weekdays.length===0||editing.items.length===0}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[var(--c-primary)] text-white active:opacity-80 disabled:opacity-40">
                {adding?'登録':'保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing&&mapMode&&(
        <div className="fixed inset-0 z-[110] bg-black/50 flex items-end justify-center" onClick={()=>{setMapMode(false);setMapCenter(null);}}>
          <div className="bg-white w-full max-w-md mx-auto rounded-t-3xl p-4" onClick={e=>e.stopPropagation()}>
            <ShopMapPicker
              initialCenter={mapCenter??{lat:35.681236,lng:139.767125}}
              onConfirm={loc=>{pickLocation(loc);setMapMode(false);setMapCenter(null);}}
              onCancel={()=>{setMapMode(false);setMapCenter(null);}}/>
          </div>
        </div>
      )}
    </div>
  );
}

// ── BottomTabs ────────────────────────────────────────────────────────────────

function BottomTabs({activeTab,onSwitchTab,onClose,tasks,shopItems,pendingCount,shopPending,
  onToggle,onEdit,onAddShop,onToggleShop,onDeleteShop,onDragStart,shopNotifSettings,onShopNotifSettings,
  shopLocations,onShopLocations,isPremium,onOpenPro,
  notificationsEnabled,onEnableNotifications
}:{
  activeTab:'later'|'shop'; onSwitchTab:(t:'later'|'shop')=>void; onClose:()=>void;
  tasks:Task[]; shopItems:ShopItem[]; pendingCount:number; shopPending:number;
  onToggle:(id:string)=>void; onEdit:(t:Task)=>void;
  onAddShop:(n:string)=>void; onToggleShop:(id:string)=>void; onDeleteShop:(id:string)=>void;
  onDragStart:(t:Task,x:number,y:number)=>void;
  shopNotifSettings:ShopNotifSetting[]; onShopNotifSettings:(s:ShopNotifSetting[])=>void;
  shopLocations:ShopLocation[]; onShopLocations:(l:ShopLocation[])=>void;
  isPremium:boolean; onOpenPro:()=>void;
  notificationsEnabled?:boolean; onEnableNotifications?:()=>void;
}) {
  const {tr,language} = useI18n();
  const [shopInput,setShopInput] = useState('');
  const [sortDir,setSortDir]     = useState<null|'asc'|'desc'>(null);
  const [shopSortDir,setShopSortDir] = useState<null|'asc'|'desc'>(null);
  const [pressingId,setPressingId]= useState<string|null>(null);
  const [showShopNotif,setShowShopNotif] = useState(false);
  const [locProPrompt,setLocProPrompt] = useState<string|null>(null);
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

  const scheduledRaw = tasks.filter(t=>!t.isLater&&t.startTime&&!t.completed&&!t.recurrence&&t.date===todayStr())
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
          {([['later',tr('laterTabLabel'),pendingCount],['shop',tr('shopTabLabel'),shopPending]] as const).map(([t,label,cnt])=>(
            <button key={t} onClick={()=>onSwitchTab(t)}
              className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${activeTab===t?'border-[var(--c-primary)] text-gray-900':'border-transparent text-gray-400'}`}>
              {label}
              {cnt>0&&<span className="text-[11px] bg-[var(--c-primary)] text-white min-w-[18px] h-[18px] rounded-full flex items-center justify-center font-bold px-1">{cnt}</span>}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden" style={{display:'grid',gridTemplateColumns:'1fr',gridTemplateRows:'1fr'}}>
        {/* ── あとでやる tab ── */}
          <div className={`overflow-y-auto px-4 ${activeTab==='later'?'':'invisible pointer-events-none'}`} style={{gridArea:'1/1',paddingBottom:'calc(5.5rem + env(safe-area-inset-bottom))'}}>
            <div className="flex items-center justify-between pt-3 pb-2">
              <h3 className="text-sm font-bold text-gray-900">
                {tr('laterTabLabel')}
                {pendingCount>0&&<span className="ml-1.5 text-gray-400 font-normal">{pendingCount}</span>}
              </h3>
              <button onClick={()=>setSortDir(d=>d===null?'asc':d==='asc'?'desc':'asc')}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-sm bg-[var(--c-primary)] text-white transition-colors">
                {sortDir===null?'↑↓':sortDir==='asc'?'↑':'↓'}
              </button>
            </div>

            {/* あとでやる section */}
            {normalLater.length>0&&(
              <div className="mb-1">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs text-gray-400">≡</span>
                  <span className="text-xs text-gray-400 font-medium">{tr('laterSectionLabel').replace('{n}',String(normalLater.length))}</span>
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
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{background:t.color||'color-mix(in srgb, var(--c-primary) 15%, white)'}}>
                        <LaterIc size={14} className={t.color?'text-white':'text-[var(--c-primary)]'}/>
                      </div>
                      <div className="flex-1 min-w-0" onClick={()=>onEdit(t)}>
                        {(t.duration??0)>0&&<p className="text-xs text-gray-400">{durLabel(t.duration??0,language)}</p>}
                        <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                        {t.deadlineAt&&(
                          <p className={`text-[11px] font-semibold mt-0.5 flex items-center gap-1 ${deadlineLabelColor(t.deadlineAt)}`}>
                            <AppIcons.deadline size={10}/>{deadlineRemainLabel(t.deadlineAt,language)}
                          </p>
                        )}
                        {t.locationNotify&&t.location&&(
                          <p className="text-[11px] text-gray-400 font-semibold mt-0.5 flex items-center gap-1">
                            <AppIcons.location size={10}/><span className="truncate">{t.location.name}</span>
                          </p>
                        )}
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
                  <span className="text-xs text-gray-400 font-medium">{tr('scheduledSectionLabel').replace('{n}',String(scheduledRaw.length))}</span>
                </div>
                <div className="space-y-2">
                  {scheduledRaw.map(t=>{
                    const SchedIc=getTaskIcon(t.icon||defaultIconKey(t.name));
                    return (
                    <div key={t.id} className="flex items-center gap-2.5 bg-white border border-gray-100 rounded-2xl shadow-sm px-3 py-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{background:t.color||'color-mix(in srgb, var(--c-primary) 15%, white)'}}>
                        <SchedIc size={14} className={t.color?'text-white':'text-[var(--c-primary)]'}/>
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
                  <span className="text-xs text-gray-400 font-medium">{tr('recurringSectionLabel').replace('{n}',String(recurringGroups.length))}</span>
                </div>
                <div className="space-y-2">
                  {recurringGroups.map(t=>{
                    const RecIc=getTaskIcon(t.icon||defaultIconKey(t.name));
                    return (
                    <div key={`${t.name}||${t.recurrence}||${t.startTime??''}`}
                      className="flex items-center gap-2.5 bg-white border border-gray-100 rounded-2xl shadow-sm px-3 py-3"
                      onClick={()=>onEdit(t)}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{background:t.color||'color-mix(in srgb, var(--c-primary) 15%, white)'}}>
                        <RecIc size={14} className={t.color?'text-white':'text-[var(--c-primary)]'}/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400">{recLabel(t,language)}{t.startTime?` ${t.startTime}`:''}</p>
                        <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                      </div>
                    </div>
                  );})}
                </div>
              </div>
            )}

            {/* empty */}
            {normalLater.length===0&&scheduledRaw.length===0&&recurringGroups.length===0&&(
              <div className="py-12 text-center"><AppIcons.sparkle className="mx-auto mb-2 text-gray-300"/><p className="text-sm text-gray-400">{tr('laterEmptyLabel')}</p></div>
            )}

            {/* completed */}
            {laterDone.length>0&&(
              <div className="mt-4">
                <p className="text-xs text-gray-300 pb-2">{tr('doneSectionLabel')}</p>
                <div className="space-y-2">
                  {laterDone.map(t=>(
                    <div key={t.id} className="flex items-center gap-2.5 bg-gray-50 border border-gray-100 rounded-2xl px-3 py-3 opacity-60">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><AppIcons.task size={16} className="text-gray-400"/></div>
                      <div className="flex-1"><p className="text-sm font-semibold text-gray-400 line-through">{t.name}</p></div>
                      <button onClick={()=>onToggle(t.id)} className="w-6 h-6 rounded-full border-2 border-[var(--c-primary)] bg-[var(--c-primary)] shrink-0 flex items-center justify-center">
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
                <h3 className="text-sm font-bold text-gray-900">{tr('shopTabLabel')}</h3>
                <div className="flex items-center gap-2">
                  <button onClick={()=>setShowShopNotif(v=>!v)}
                    className={`relative w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${showShopNotif?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-500'}`}>
                    <AppIcons.bell size={15}/>
                    {shopNotifSettings.filter(s=>s.enabled).length>0&&!showShopNotif&&(
                      <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-[var(--c-primary)] rounded-full border-2 border-white"/>
                    )}
                  </button>
                  <button onClick={()=>setShopSortDir(d=>d===null?'asc':d==='asc'?'desc':'asc')}
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-sm bg-[var(--c-primary)] text-white transition-colors">
                    {shopSortDir===null?'↑↓':shopSortDir==='asc'?'↑':'↓'}
                  </button>
                </div>
              </div>
              {!showShopNotif&&<div className="flex gap-2">
                <input type="text" value={shopInput} onChange={e=>setShopInput(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&addShop()}
                  placeholder={tr('shopAddPlaceholder')}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-400 bg-gray-50"/>
                <button onClick={addShop} disabled={!shopInput.trim()}
                  className="px-4 py-2 bg-[var(--c-primary)] text-white rounded-xl text-sm font-semibold disabled:opacity-40">{tr('addButton')}</button>
              </div>}
            </div>
            <div className="overflow-y-auto pb-10 flex-1">
              {showShopNotif?(
                <>
                  <ShopNotifPanel settings={shopNotifSettings} onChange={onShopNotifSettings} notificationsEnabled={notificationsEnabled} onEnableNotifications={onEnableNotifications}/>
                  <ShopLocationPanel locations={shopLocations} onChange={onShopLocations} isPremium={isPremium} onProPrompt={setLocProPrompt}/>
                  {locProPrompt&&<ProGateSheet feature={locProPrompt} onClose={()=>setLocProPrompt(null)} onView={()=>{setLocProPrompt(null);onOpenPro();}}/>}
                </>
              ):shopItems.length===0?(
                <div className="py-12 text-center px-4"><AppIcons.shopping size={40} className="mx-auto mb-2 text-gray-300"/><p className="text-sm text-gray-400">{tr('shopEmptyLabel')}</p></div>
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
                    <p className="text-xs text-gray-300 pt-3 pb-1">{tr('shopDoneNotice')}</p>
                    {shopDoneItems.map(item=>(
                      <div key={item.id} className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 opacity-60">
                        <button onClick={()=>onToggleShop(item.id)} className="w-5 h-5 rounded border-2 border-[var(--c-primary)] bg-[var(--c-primary)] shrink-0 flex items-center justify-center">
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

function ProGateSheet({onClose,onView,feature}:{onClose:()=>void;onView?:()=>void;feature?:string}) {
  useEffect(()=>{ logAnalyticsEvent('paywall_viewed'); },[]);
  return (
    <div className="fixed inset-0 z-[200] bg-black/40 flex items-end justify-center" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-t-3xl px-5 pt-5 pb-10 shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="flex justify-center mb-4"><div className="w-10 h-1 bg-gray-200 rounded-full"/></div>
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{background:'var(--c-primary)'}}>
            <AppIcons.star size={28} className="text-white"/>
          </div>
          <p className="text-[17px] font-bold text-gray-900">Proプランが必要です</p>
          <p className="text-sm text-gray-500 text-center leading-relaxed">{feature?`「${feature}」はProプランでご利用いただけます。`:'この機能はProプランでご利用いただけます。'}<br/>設定画面のPROから登録できます。</p>
        </div>
        {onView&&<button onClick={onView} className="w-full py-3.5 rounded-2xl text-[15px] font-semibold text-white mb-2" style={{background:'var(--c-primary)'}}>PROプランを見る</button>}
        <button onClick={onClose} className="w-full py-2.5 text-sm text-gray-400">閉じる</button>
      </div>
    </div>
  );
}

function SettingsRow({icon,iconBg,title,desc,onClick,isLast=false,pro=false,isPremium=false}:{
  icon:React.ReactNode; iconBg:string; title:string; desc?:string; onClick?:()=>void; isLast?:boolean; pro?:boolean; isPremium?:boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 transition-colors${!isLast?' border-b border-gray-100':''}`}
    >
      <div className="w-[30px] h-[30px] rounded-[8px] flex items-center justify-center shrink-0"
        style={{background:'color-mix(in srgb, var(--c-primary) 15%, white)', color:'var(--c-primary)'}}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium text-gray-900 leading-tight flex items-center gap-1.5">{title}{pro&&!isPremium&&<span className="inline-flex items-center gap-0.5 border border-gray-300 rounded px-1.5 py-0.5 text-[10px] font-bold text-gray-400 leading-none tracking-wide">★ PRO</span>}</p>
        {desc&&<p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
      </div>
      <AppIcons.caretRight className="text-gray-300 shrink-0"/>
    </button>
  );
}

function SettingsScreen({settings,onSettings,onClose,globalTags,onGlobalTags,customTabs,onCustomTabs,onDeleteTabTasks,onDeleteTag,onRenameTag,shopNotifSettings,onShopNotifSettings,shopLocations,onShopLocations,forgetAlerts,onForgetAlerts,authUser,isPremium,onAppleSignIn,onSignOut,onBulkAdd,bulkHistory,onBulkHistoryDelete,onBulkHistoryEdit,lifePatterns,onLifePatterns,patternOverrides,onApplyPattern,initialSub,tasks,onEditTask}:{
  settings:Settings; onSettings:(s:Settings)=>void; onClose:()=>void;
  globalTags:TagDef[]; onGlobalTags:(tags:TagDef[])=>void;
  customTabs:CustomTab[]; onCustomTabs:(tabs:CustomTab[])=>void; onDeleteTabTasks:(tabId:string)=>void;
  onDeleteTag:(tagName:string)=>void; onRenameTag:(oldName:string, newName:string, newColor:string)=>void;
  shopNotifSettings:ShopNotifSetting[]; onShopNotifSettings:(s:ShopNotifSetting[])=>void;
  shopLocations:ShopLocation[]; onShopLocations:(l:ShopLocation[])=>void;
  forgetAlerts:ForgetAlert[]; onForgetAlerts:(a:ForgetAlert[])=>void;
  authUser:AuthUser|null; isPremium:boolean;
  onAppleSignIn:()=>Promise<void>; onSignOut:()=>void;
  onBulkAdd:(tasks:Omit<Task,'id'>[],endTime:string)=>void;
  bulkHistory:BulkHistoryEntry[];
  onBulkHistoryDelete:(entryId:string)=>void;
  onBulkHistoryEdit:(entryId:string,name:string,startTime:string,endTime:string,icon:string,color:string)=>void;
  lifePatterns:LifePattern[]; onLifePatterns:(p:LifePattern[])=>void;
  patternOverrides:Record<string,string>; onApplyPattern:(dates:string[],patternId:string|null)=>void;
  initialSub?:string;
  tasks:Task[]; onEditTask:(t:Task)=>void;
}) {
  const { tr, language, setLanguage } = useI18n();
  const [sub,setSubRaw]        = useState<string|null>(initialSub??null);
  // 戻る操作で常にメイン設定画面まで戻ってしまわないよう、遷移履歴をスタックで保持する。
  // setSub(次の画面) で現在地をスタックに積み、back() でスタックから1つ戻す
  const subHistoryRef = useRef<(string|null)[]>([]);
  const setSub = (next:string|null) => {
    subHistoryRef.current.push(sub);
    setSubRaw(next);
  };
  useEffect(()=>{ if(sub==='premium') logAnalyticsEvent('paywall_viewed'); },[sub]);
  const [appVersion,setAppVersion] = useState<string|null>(null);
  useEffect(()=>{ getAppVersion().then(setAppVersion); },[]);
  // 開発者モード（アプリバージョン行を7回タップで解放。一般ユーザーには表示しない）
  const [devModeUnlocked,setDevModeUnlocked] = useState(false);
  useEffect(()=>{ setDevModeUnlocked(isDevModeUnlocked()); },[]);
  const versionTapCountRef = useRef(0);
  const versionTapTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const handleVersionTap = () => {
    if(versionTapTimerRef.current) clearTimeout(versionTapTimerRef.current);
    versionTapCountRef.current += 1;
    if(versionTapCountRef.current>=7){
      versionTapCountRef.current = 0;
      localStorage.setItem(DEV_MODE_UNLOCKED_KEY,'1');
      setDevModeUnlocked(true);
      if(navigator.vibrate) navigator.vibrate(50);
      return;
    }
    versionTapTimerRef.current = setTimeout(()=>{ versionTapCountRef.current = 0; },1500);
  };
  // 開発者モードの各種上書き状態。RevenueCat・OS権限は変更せず、UI上の判定結果だけを差し替える
  const [devPlan,setDevPlanState] = useState<'free'|'premium'|null>(null);
  const [firstLaunchDone,setFirstLaunchDone] = useState(true);
  const [tourDone,setTourDone] = useState(true);
  const [notifGranted,setNotifGrantedState] = useState(true);
  const [locGranted,setLocGrantedState] = useState(true);
  useEffect(()=>{
    setDevPlanState(getDevPremiumOverride());
    setFirstLaunchDone(!!localStorage.getItem(WAKESLEEP_ASKED_KEY));
    setTourDone(!!localStorage.getItem(TOUR_COMPLETED_KEY));
    setNotifGrantedState(!isDevDenied(DEV_NOTIF_DENIED_KEY));
    setLocGrantedState(!isDevDenied(DEV_LOCATION_DENIED_KEY));
  },[]);
  const setDevPlan=(p:'free'|'premium'|null)=>{ setDevPlanState(p); setDevPremiumOverride(p); };
  const toggleFirstLaunch=()=>{
    const next=!firstLaunchDone;
    if(next){
      localStorage.setItem(WAKESLEEP_ASKED_KEY,'1');
      localStorage.setItem(TOUR_COMPLETED_KEY,'1');
      localStorage.setItem(NOTIF_ASKED_KEY,'1');
      localStorage.setItem(LOCATION_ASKED_KEY,'1');
    }else{
      localStorage.removeItem(WAKESLEEP_ASKED_KEY);
      localStorage.removeItem(TOUR_COMPLETED_KEY);
      localStorage.removeItem(NOTIF_ASKED_KEY);
      localStorage.removeItem(LOCATION_ASKED_KEY);
    }
    window.location.reload();
  };
  const toggleTour=()=>{
    const next=!tourDone;
    if(next) localStorage.setItem(TOUR_COMPLETED_KEY,'1');
    else localStorage.removeItem(TOUR_COMPLETED_KEY);
    window.location.reload();
  };
  const toggleNotifGranted=()=>{
    const next=!notifGranted;
    setNotifGrantedState(next);
    if(next) localStorage.removeItem(DEV_NOTIF_DENIED_KEY); else localStorage.setItem(DEV_NOTIF_DENIED_KEY,'1');
  };
  const toggleLocGranted=()=>{
    const next=!locGranted;
    setLocGrantedState(next);
    if(next) localStorage.removeItem(DEV_LOCATION_DENIED_KEY); else localStorage.setItem(DEV_LOCATION_DENIED_KEY,'1');
  };
  const [tagInput,setTagInput] = useState('');
  const [newTagColor,setNewTagColor] = useState(TAG_COLORS[0].bg);
  const [editIdx,setEditIdx]   = useState<number|null>(null);
  const [editVal,setEditVal]   = useState('');
  const [editColor,setEditColor]   = useState(TAG_COLORS[0].bg);
  const [tabInput,setTabInput]     = useState('');
  const [editTabId,setEditTabId]   = useState<string|null>(null);
  const [editTabVal,setEditTabVal] = useState('');
  const [deleteTabId,setDeleteTabId] = useState<string|null>(null);
  const [deleteTabMode,setDeleteTabMode] = useState<'move'|'delete'|null>(null);
  const _today0 = todayStr();
  const _todayD = new Date(_today0+'T12:00:00');
  const [bulkName,setBulkName] = useState('');
  const [bulkStart,setBulkStart] = useState('09:00');
  const [bulkEnd,setBulkEnd] = useState('17:00');
  const [bulkDates,setBulkDates] = useState<Set<string>>(new Set());
  const [bulkVm,setBulkVm] = useState({year:_todayD.getFullYear(),month:_todayD.getMonth()});
  const [bulkDone,setBulkDone] = useState(false);
  const [bulkIconOverride,setBulkIconOverride] = useState<string|null>(null);
  const [bulkIconSheet,setBulkIconSheet] = useState(false);
  const [bulkColor,setBulkColor] = useState('');
  const [histExp,setHistExp]       = useState<string|null>(null);
  const [histEditName,setHEN]      = useState('');
  const [histEditStart,setHES]     = useState('');
  const [histEditEnd,setHEE]       = useState('');
  const [histEditIcon,setHEIcon]   = useState('task');
  const [histEditColor,setHEColor] = useState('');
  const [histIconSheet,setHIconSh] = useState(false);
  const [bulkEditId,setBulkEditId] = useState<string|null>(null);
  const [bulkDeleteId,setBulkDeleteId] = useState<string|null>(null);
  const _lpToday = todayStr();
  const _lpTodayD= new Date(_lpToday+'T12:00:00');
  const [lpVm,setLpVm]             = useState({year:_lpTodayD.getFullYear(),month:_lpTodayD.getMonth()});
  const [lpSelectedDates,setLpSel] = useState<Set<string>>(new Set());
  const [lpActivePat,setLpActivePat] = useState<string|null>(null);
  const [lpAddMode,setLpAddMode]   = useState(false);
  const [lpNewName,setLpNewName]   = useState('');
  const [lpNewWake,setLpNewWake]   = useState('07:00');
  const [lpNewSleep,setLpNewSleep] = useState('23:00');
  const [lpNewColor,setLpNewColor] = useState('#94CFC8');
  const [lpEditId,setLpEditId]     = useState<string|null>(null);
  const [lpDeleteId,setLpDeleteId] = useState<string|null>(null);
  const [lpEditName,setLpEditName] = useState('');
  const [lpEditWake,setLpEditWake] = useState('');
  const [lpEditSleep,setLpEditSleep] = useState('');
  const [lpEditColor,setLpEditColor] = useState('');
  const [lpEditConfirmId,setLpEditConfirmId] = useState<string|null>(null);
  const [colorPicking,setColorPicking] = useState<'wake'|'sleep'|null>(null);
  const { purchase, restore, isPurchasing } = usePremium();
  const [proPrompt,setProPrompt] = useState<string|null>(null);
  const proSheet = proPrompt ? <ProGateSheet feature={proPrompt} onClose={()=>setProPrompt(null)} onView={()=>{setProPrompt(null);setSub('premium');}}/> : null;

  const back = () => setSubRaw(subHistoryRef.current.pop() ?? null);

  const subHeader = (title:string) => (
    <div className="bg-white border-b border-gray-200 px-4 py-3.5 flex items-center shrink-0" style={{paddingTop:'calc(0.875rem + env(safe-area-inset-top))'}}>

      <button onClick={back} className="flex items-center gap-0.5 min-w-[80px]" style={{color:'var(--c-primary)'}}>
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
    if(!isPremium && globalTags.length >= 2) { setProPrompt('タグを3個以上作成'); return; }
    onGlobalTags([...globalTags, {name:t, color:newTagColor}]);
    setTagInput('');
  };
  const [deleteTagIdx,setDeleteTagIdx] = useState<number|null>(null);
  const [pendingCommitEdit,setPendingCommitEdit] = useState(false);
  const deleteTag = (i:number) => setDeleteTagIdx(i);
  const startEdit = (i:number) => { setEditIdx(i); setEditVal(globalTags[i].name); setEditColor(globalTags[i].color); };
  const commitEdit = () => {
    if(editIdx===null) return;
    const v = editVal.trim();
    if(!v || globalTags.some((t,i)=>t.name===v&&i!==editIdx&&t.color===editColor)) { setEditIdx(null); return; }
    const orig=globalTags[editIdx];
    if(orig.name===v && orig.color===editColor){ setEditIdx(null); return; }
    setPendingCommitEdit(true);
  };
  const doCommitEdit = () => {
    if(editIdx===null) return;
    const v=editVal.trim(); if(!v) return;
    const oldName=globalTags[editIdx].name;
    onRenameTag(oldName, v, editColor);
    setEditIdx(null); setPendingCommitEdit(false);
  };

  if(sub==='bulkInput'){
    const bDays=(()=>{
      const {year,month}=bulkVm;
      const first=new Date(year,month,1).getDay();
      const total=new Date(year,month+1,0).getDate();
      const arr:(string|null)[]=Array(first).fill(null);
      for(let d=1;d<=total;d++) arr.push(dateToStr(new Date(year,month,d)));
      return arr;
    })();
    const t2m=(t:string)=>{const [h,m]=t.split(':').map(Number);return h*60+m;};
    const bDur=Math.max(0,t2m(bulkEnd)-t2m(bulkStart));
    const toggleDate=(d:string)=>setBulkDates(prev=>{const s=new Set(prev);if(s.has(d))s.delete(d);else s.add(d);return s;});
    const bulkIcon = bulkIconOverride ?? defaultIconKey(bulkName);
    const register=()=>{
      if(!bulkName.trim()||bulkDates.size===0) return;
      const thisMonth=todayStr().slice(0,7);
      if(!isPremium&&bulkHistory.filter(e=>e.registeredAt.startsWith(thisMonth)).length>=1){setProPrompt('一括入力を月2回以上利用');return;}
      onBulkAdd([...bulkDates].map(date=>({
        name:bulkName.trim(),startTime:bulkStart,duration:bDur,
        date,completed:false,isLater:false,memo:'',
        icon:bulkIconOverride ?? defaultIconKey(bulkName.trim()),
        color:bulkColor,
      } as Omit<Task,'id'>)), bulkEnd);
      setBulkName('');setBulkDates(new Set());setBulkDone(true);setBulkIconOverride(null);setBulkColor('');
      setTimeout(()=>setBulkDone(false),2000);
    };
    return (
      <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
        {subHeader('タスク一括入力')}{proSheet}
        <div className="flex-1 overflow-y-auto px-4 pb-10">
          {!isPremium&&<p className="text-xs text-gray-400 px-1 mt-4 mb-4">月1回まで無料でご利用いただけます。2回目からPROが必要です。</p>}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-4">タスク情報</p>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
              <button onClick={()=>setBulkIconSheet(true)}
                className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 active:opacity-80"
                style={{background:bulkColor||'var(--c-primary)'}}>
                {(()=>{const Ic=getTaskIcon(bulkIcon);return <Ic size={22} className="text-white"/>;})()}
              </button>
              <input value={bulkName} onChange={e=>setBulkName(e.target.value)}
                placeholder="タスク名を入力"
                className="flex-1 text-base font-medium text-gray-800 bg-transparent outline-none placeholder-gray-300"/>
            </div>
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
              <AppIcons.clock size={18} className="text-gray-400 shrink-0"/>
              <span className="text-sm font-medium text-gray-500 shrink-0 w-16">開始時刻</span>
              <input type="time" value={bulkStart} onChange={e=>setBulkStart(e.target.value)}
                className="flex-1 text-sm text-gray-800 bg-transparent outline-none"/>
            </div>
            <div className="flex items-center gap-3 px-4 py-3.5">
              <AppIcons.clock size={18} className="text-gray-400 shrink-0"/>
              <span className="text-sm font-medium text-gray-500 shrink-0 w-16">終了時刻</span>
              <input type="time" value={bulkEnd} onChange={e=>setBulkEnd(e.target.value)}
                className="flex-1 text-sm text-gray-800 bg-transparent outline-none"/>
            </div>
          </div>
          <div className="flex items-center justify-between px-1 mb-2 mt-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">日付を選択</p>
            {bulkDates.size>0&&<span className="text-xs text-[var(--c-primary)] font-semibold">{bulkDates.size}日選択中</span>}
          </div>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm px-3 py-3">
            <div className="flex items-center justify-between mb-3">
              <button onClick={()=>setBulkVm(m=>shiftMonth(m.year,m.month,-1))} className="w-9 h-9 flex items-center justify-center text-gray-600"><AppIcons.caretLeft/></button>
              <span className="font-bold text-gray-900 text-base">{bulkVm.year}年{bulkVm.month+1}月</span>
              <button onClick={()=>setBulkVm(m=>shiftMonth(m.year,m.month,1))} className="w-9 h-9 flex items-center justify-center text-gray-600"><AppIcons.caretRight/></button>
            </div>
            <div className="grid grid-cols-7 mb-1">
              {DAY_NAMES.map((n,i)=>(
                <div key={i} className={`text-center text-xs font-semibold py-1 text-gray-400`}>{n}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1">
              {bDays.map((d,i)=>{
                const isSel=d?bulkDates.has(d):false;
                const isToday=d===_today0;
                return (
                  <button key={i} disabled={!d} onClick={()=>d&&toggleDate(d)}
                    className="flex items-center justify-center h-9 rounded-xl active:bg-gray-50">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      !d?'':isSel?'bg-[var(--c-primary)] text-white':isToday?'bg-gray-100 font-bold text-gray-900':'text-gray-600'
                    }`}>
                      {d?new Date(d+'T12:00:00').getDate():''}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex justify-center gap-3 mt-6">
            <button onClick={()=>setSub('bulkHistory')}
              className="flex-1 py-4 rounded-2xl text-sm font-semibold bg-white text-gray-600 shadow-sm">
              履歴を見る
            </button>
            <button onClick={register}
              disabled={!bulkName.trim()||bulkDates.size===0}
              className={`flex-1 py-4 rounded-2xl text-sm font-bold transition-colors ${!bulkName.trim()||bulkDates.size===0?'bg-gray-100 text-gray-400':'bg-[var(--c-primary)] text-white'}`}>
              {bulkDone?'登録しました':'選択した日に登録'}
            </button>
          </div>
        </div>
        {bulkIconSheet&&(
          <div className="fixed inset-0 z-[90] bg-black/40 flex flex-col justify-end" onClick={()=>setBulkIconSheet(false)}>
            <div className="bg-white rounded-t-3xl max-h-[78vh] flex flex-col w-full max-w-md mx-auto" onClick={e=>e.stopPropagation()}>
              <div className="flex justify-center pt-3 shrink-0"><div className="w-10 h-1 bg-gray-200 rounded-full"/></div>
              <div className="flex items-center justify-between px-5 pt-3 pb-2 shrink-0">
                <span className="text-base font-bold text-gray-900">アイコンとカラー</span>
                <button onClick={()=>setBulkIconSheet(false)} className="px-4 py-1.5 bg-gray-700 text-white text-sm font-semibold rounded-full">完了</button>
              </div>
              <div className="overflow-y-auto px-5 pb-10 flex-1">
                <p className="text-xs font-bold text-gray-400 mb-2 mt-1">カラー</p>
                <div className="flex gap-2 mb-5" style={{overflowX:'auto',WebkitOverflowScrolling:'touch',paddingTop:'4px',paddingBottom:'4px',paddingLeft:'4px'}}>
                  {TASK_COLORS.map((c,i)=>(
                    <button key={i} onClick={()=>setBulkColor(c)}
                      className={`shrink-0 w-8 h-8 rounded-full border-2 transition-all ${bulkColor===c?'border-gray-800 scale-110':'border-gray-100'}`}
                      style={{background:c||'#E5E7EB'}}/>
                  ))}
                </div>
                {ICON_CATEGORIES.map(cat=>(
                  <div key={cat.label} className="mb-5">
                    <p className="text-xs font-bold text-gray-400 mb-2">{cat.label}</p>
                    <div className="grid grid-cols-5 gap-2">
                      {cat.icons.map(opt=>{
                        const Ic=getTaskIcon(opt.key);
                        const sel=bulkIcon===opt.key;
                        const bg=bulkColor||'var(--c-primary)';
                        const locked=!!opt.pro&&!isPremium;
                        return (
                          <button key={opt.key} onClick={()=>{if(locked){setProPrompt(`アイコン「${opt.label}」の使用`);return;}setBulkIconOverride(opt.key);}}
                            className={`relative flex flex-col items-center gap-1.5 py-3 rounded-2xl ${sel?'':'bg-gray-50'}`}
                            style={sel?{background:bg}:undefined}>
                            <Ic size={22} className={sel?'text-white':locked?'text-gray-300':'text-gray-700'}/>
                            {locked&&<AppIcons.lock size={10} className="absolute top-1.5 right-1.5 text-gray-300"/>}
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

  if(sub==='bulkHistory'){
    const disp=bulkHistory.slice(0,10);
    return (
      <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
        {subHeader('登録履歴')}{proSheet}
        <div className="flex-1 overflow-y-auto px-4 pb-10">
          {disp.length===0&&(
            <div className="flex flex-col items-center justify-center pt-20 gap-3">
              <AppIcons.task size={40} className="text-gray-300"/>
              <p className="text-sm text-gray-400">まだ登録履歴がありません</p>
            </div>
          )}
          <div className="mt-6 flex flex-col gap-3">
            {disp.map(entry=>{
              const isExp=histExp===entry.id;
              const dt=new Date(entry.registeredAt);
              const dateLabel=`${dt.getMonth()+1}/${dt.getDate()}`;
              return (
                <div key={entry.id} className="bg-white rounded-2xl overflow-hidden shadow-sm">
                  <button className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50" onClick={()=>setHistExp(isExp?null:entry.id)}>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-semibold text-gray-800">{entry.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{entry.startTime}〜{entry.endTime} · {entry.dates.length}日 · {dateLabel}登録</p>
                    </div>
                    <AppIcons.caretDown size={14} className={`text-gray-400 shrink-0 transition-transform ${isExp?'rotate-180':''}`}/>
                  </button>
                  {isExp&&(
                    <div className="border-t border-gray-100 px-4 py-3 flex gap-2">
                      <button onClick={()=>{
                          setHEN(entry.name);setHES(entry.startTime);setHEE(entry.endTime);
                          setHEIcon(entry.icon??defaultIconKey(entry.name));setHEColor(entry.color??'');
                          setBulkEditId(entry.id);
                        }}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[var(--c-primary)] text-white">一括編集</button>
                      <button onClick={()=>setBulkDeleteId(entry.id)}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[#D97A7A] text-white">一括削除</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {bulkEditId&&(()=>{
          const entry=bulkHistory.find(e=>e.id===bulkEditId);
          if(!entry) return null;
          return (
            <div className="fixed inset-0 z-[90] bg-black/40 flex flex-col justify-end" onClick={()=>setBulkEditId(null)}>
              <div className="bg-white rounded-t-3xl flex flex-col w-full max-w-md mx-auto" onClick={e=>e.stopPropagation()}>
                <div className="flex justify-center pt-3 shrink-0"><div className="w-10 h-1 bg-gray-200 rounded-full"/></div>
                <div className="flex items-center justify-between px-5 pt-3 pb-2 shrink-0">
                  <button onClick={()=>setBulkEditId(null)} className="text-sm text-gray-400 font-medium">キャンセル</button>
                  <span className="text-base font-bold text-gray-900">一括編集</span>
                  <button onClick={()=>{
                      onBulkHistoryEdit(entry.id,histEditName.trim()||entry.name,histEditStart,histEditEnd,histEditIcon,histEditColor);
                      setBulkEditId(null);setHistExp(null);
                    }}
                    className="text-sm font-semibold text-[var(--c-primary)]">保存</button>
                </div>
                <div className="px-5 pb-8">
                  <p className="text-xs text-gray-400 mb-4">{entry.dates.length}日分すべてに反映されます</p>
                  <div className="bg-gray-50 rounded-xl px-3 py-2.5 flex flex-col gap-2.5">
                    <div className="flex items-center gap-2">
                      <button onClick={()=>setHIconSh(true)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 active:opacity-80"
                        style={{background:histEditColor||'var(--c-primary)'}}>
                        {(()=>{const Ic=getTaskIcon(histEditIcon);return <Ic size={16} className="text-white"/>;})()}
                      </button>
                      <input value={histEditName} onChange={e=>setHEN(e.target.value)}
                        className="flex-1 text-sm text-gray-800 bg-transparent outline-none border-b border-gray-200 pb-0.5"/>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-14 shrink-0">開始時刻</span>
                      <input type="time" value={histEditStart} onChange={e=>setHES(e.target.value)}
                        className="flex-1 text-sm text-gray-800 bg-transparent outline-none"/>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-14 shrink-0">終了時刻</span>
                      <input type="time" value={histEditEnd} onChange={e=>setHEE(e.target.value)}
                        className="flex-1 text-sm text-gray-800 bg-transparent outline-none"/>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
        {bulkDeleteId&&(()=>{
          const dp=bulkHistory.find(e=>e.id===bulkDeleteId);
          if(!dp) return null;
          return (
            <div className="fixed inset-0 z-[100] flex items-end justify-center" onClick={()=>setBulkDeleteId(null)}>
              <div className="absolute inset-0 bg-black/40"/>
              <div className="relative bg-white rounded-t-2xl w-full max-w-md px-6 pt-6 pb-10" onClick={e=>e.stopPropagation()}>
                <p className="text-center text-[17px] font-semibold text-gray-900 mb-1">「{dp.name}」を削除しますか？</p>
                <p className="text-center text-[13px] text-gray-400 mb-6">{dp.dates.length}日分すべてのタスクが削除されます</p>
                <div className="flex flex-col gap-3">
                  <button onClick={()=>{onBulkHistoryDelete(dp.id);setHistExp(null);setBulkDeleteId(null);}}
                    className="w-full py-3.5 rounded-2xl bg-[#D97A7A] text-white text-[15px] font-semibold">削除する</button>
                  <button onClick={()=>setBulkDeleteId(null)} className="w-full py-3.5 rounded-2xl bg-gray-50 text-gray-500 text-[15px] font-semibold">キャンセル</button>
                </div>
              </div>
            </div>
          );
        })()}
        {histIconSheet&&(
          <div className="fixed inset-0 z-[95] bg-black/40 flex flex-col justify-end" onClick={()=>setHIconSh(false)}>
            <div className="bg-white rounded-t-3xl max-h-[78vh] flex flex-col w-full max-w-md mx-auto" onClick={e=>e.stopPropagation()}>
              <div className="flex justify-center pt-3 shrink-0"><div className="w-10 h-1 bg-gray-200 rounded-full"/></div>
              <div className="flex items-center justify-between px-5 pt-3 pb-2 shrink-0">
                <span className="text-base font-bold text-gray-900">アイコン</span>
                <button onClick={()=>setHIconSh(false)} className="px-4 py-1.5 bg-gray-700 text-white text-sm font-semibold rounded-full">完了</button>
              </div>
              <div className="overflow-y-auto px-5 pb-10 flex-1">
                <p className="text-xs font-bold text-gray-400 mb-2 mt-1">カラー</p>
                <div className="flex gap-2 mb-5 flex-wrap" style={{paddingLeft:'4px',paddingTop:'4px',paddingBottom:'4px'}}>
                  {TASK_COLORS.map((c,i)=>(
                    <button key={i} onClick={()=>setHEColor(c)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${histEditColor===c?'border-gray-700 scale-110':'border-transparent'}`}
                      style={{background:c||'#E5E7EB'}}/>
                  ))}
                </div>
                {ICON_CATEGORIES.map(cat=>(
                  <div key={cat.label} className="mb-5">
                    <p className="text-xs font-bold text-gray-400 mb-2">{cat.label}</p>
                    <div className="grid grid-cols-5 gap-2">
                      {cat.icons.map(opt=>{
                        const Ic=getTaskIcon(opt.key);
                        const sel=histEditIcon===opt.key;
                        const bg=histEditColor||'var(--c-primary)';
                        const locked=!!opt.pro&&!isPremium;
                        return (
                          <button key={opt.key} onClick={()=>{if(locked){setProPrompt(`アイコン「${opt.label}」の使用`);return;}setHEIcon(opt.key);}}
                            className={`relative flex flex-col items-center gap-1.5 py-3 rounded-2xl ${sel?'':'bg-gray-50'}`}
                            style={sel?{background:bg}:undefined}>
                            <Ic size={22} className={sel?'text-white':locked?'text-gray-300':'text-gray-700'}/>
                            {locked&&<AppIcons.lock size={10} className="absolute top-1.5 right-1.5 text-gray-300"/>}
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

  if(sub==='stats') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('統計')}
      <div className="flex-1 overflow-y-auto px-4 pb-8">{comingSoon(<AppIcons.stats size={48}/>,'タスク完了の統計機能は近日公開予定です')}</div>
    </div>
  );

  if(sub==='tabs') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('ファイルタブ')}{proSheet}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {!isPremium&&<p className="text-xs text-gray-400 px-1 mt-4 mb-4">1個まで無料でご利用いただけます。2個目からPROが必要です。</p>}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-4">新しいタブ</p>
        <div className="bg-white rounded-2xl shadow-sm px-4 py-3">
          <div className="flex gap-2 items-center">
            <input value={tabInput} onChange={e=>setTabInput(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'){const v=tabInput.trim();if(v){if(!isPremium&&customTabs.length>=1){setProPrompt('ファイルタブを2個以上作成');return;}onCustomTabs([...customTabs,{id:uid(),name:v}]);setTabInput('');}}} }
              placeholder="タブ名を入力"
              className="flex-1 text-[15px] bg-transparent outline-none text-gray-900 placeholder-gray-300 border-b border-gray-200 pb-1"/>
            <button onClick={()=>{const v=tabInput.trim();if(v){if(!isPremium&&customTabs.length>=1){setProPrompt('ファイルタブを2個以上作成');return;}onCustomTabs([...customTabs,{id:uid(),name:v}]);setTabInput('');}}}
              className="px-4 py-1.5 bg-[var(--c-primary)] text-white text-sm font-semibold rounded-xl shrink-0">追加</button>
          </div>
        </div>
        {customTabs.length>0&&(
          <>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-6">タブ一覧</p>
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              {customTabs.map((tab,i)=>(
                <div key={tab.id}>
                  <div className={`px-4 py-3 flex items-center gap-3${i<customTabs.length-1?' border-b border-gray-100':''}`}>
                    {editTabId===tab.id ? (
                      <input autoFocus value={editTabVal} onChange={e=>setEditTabVal(e.target.value)}
                        onKeyDown={e=>{if(e.key==='Enter'){const v=editTabVal.trim();if(v)onCustomTabs(customTabs.map(t=>t.id===tab.id?{...t,name:v}:t));setEditTabId(null);}}}
                        className="flex-1 text-[15px] border-b border-gray-300 outline-none bg-transparent text-gray-900 py-0.5"/>
                    ) : (
                      <div className="flex-1 min-w-0">
                        <span className="text-[15px] text-gray-900">{tab.name}</span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[12px] text-gray-400">【すべて】タブに表示</span>
                          <button
                            onClick={()=>onCustomTabs(customTabs.map(t=>t.id===tab.id?{...t,showInAll:t.showInAll===false?undefined:false}:t))}
                            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${tab.showInAll===false?'bg-gray-200':'bg-[var(--c-primary)]'}`}>
                            <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${tab.showInAll===false?'translate-x-0.5':'translate-x-4'}`}/>
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="flex gap-1 shrink-0">
                      <button onClick={()=>{if(editTabId===tab.id){const v=editTabVal.trim();if(v)onCustomTabs(customTabs.map(t=>t.id===tab.id?{...t,name:v}:t));setEditTabId(null);}else{setEditTabId(tab.id);setEditTabVal(tab.name);}}}
                        className="text-xs text-gray-400 font-medium px-2 py-1">
                        {editTabId===tab.id?'確定':'編集'}
                      </button>
                      {editTabId===tab.id
                        ? <button onClick={()=>setEditTabId(null)} className="text-xs text-gray-400 font-medium px-2 py-1">キャンセル</button>
                        : <button onClick={()=>setDeleteTabId(tab.id)} className="text-xs text-[#D97A7A] font-medium px-2 py-1">削除</button>
                      }
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {deleteTabId&&!deleteTabMode&&(()=>{const dt=customTabs.find(t=>t.id===deleteTabId);return(
          <div className="fixed inset-0 z-[100] flex items-end justify-center" onClick={()=>setDeleteTabId(null)}>
            <div className="absolute inset-0 bg-black/40"/>
            <div className="relative bg-white rounded-t-2xl w-full max-w-md px-6 pt-6 pb-10" onClick={e=>e.stopPropagation()}>
              <p className="text-center text-[17px] font-semibold text-gray-900 mb-1">「{dt?.name}」を削除しますか？</p>
              <p className="text-center text-[13px] text-gray-400 mb-6">このタブのタスクをどうしますか？</p>
              <div className="flex flex-col gap-3">
                <button onClick={()=>setDeleteTabMode('move')} className="w-full py-3.5 rounded-2xl bg-gray-100 text-gray-900 text-[15px] font-semibold">タスクを【すべて】に移動</button>
                <button onClick={()=>setDeleteTabMode('delete')} className="w-full py-3.5 rounded-2xl bg-[#D97A7A] text-white text-[15px] font-semibold">タスクも完全に削除</button>
                <button onClick={()=>setDeleteTabId(null)} className="w-full py-3.5 rounded-2xl bg-gray-50 text-gray-500 text-[15px] font-semibold">キャンセル</button>
              </div>
            </div>
          </div>
        );})()}
        {deleteTabId&&deleteTabMode&&(()=>{const dt=customTabs.find(t=>t.id===deleteTabId);const isDelete=deleteTabMode==='delete';return(
          <div className="fixed inset-0 z-[100] flex items-end justify-center" onClick={()=>setDeleteTabMode(null)}>
            <div className="absolute inset-0 bg-black/40"/>
            <div className="relative bg-white rounded-t-2xl w-full max-w-md px-6 pt-6 pb-10" onClick={e=>e.stopPropagation()}>
              <p className="text-center text-[17px] font-semibold text-gray-900 mb-1">本当に削除しますか？</p>
              <p className="text-center text-[13px] text-gray-400 mb-6">{isDelete?`「${dt?.name}」のタスクもすべて完全に削除されます`:`「${dt?.name}」のタスクは【すべて】タブに移動されます`}</p>
              <div className="flex flex-col gap-3">
                <button onClick={()=>{if(isDelete)onDeleteTabTasks(deleteTabId!);onCustomTabs(customTabs.filter(t=>t.id!==deleteTabId));setDeleteTabId(null);setDeleteTabMode(null);}}
                  className={`w-full py-3.5 rounded-2xl text-[15px] font-semibold ${isDelete?'bg-[#D97A7A] text-white':'bg-gray-100 text-gray-900'}`}>
                  {isDelete?'完全に削除する':'移動して削除する'}
                </button>
                <button onClick={()=>setDeleteTabMode(null)} className="w-full py-3.5 rounded-2xl bg-gray-50 text-gray-500 text-[15px] font-semibold">戻る</button>
              </div>
            </div>
          </div>
        );})()}
        {customTabs.length===0&&(
          <p className="text-sm text-gray-400 text-center mt-10">タブがまだありません</p>
        )}
      </div>
    </div>
  );

  if(sub==='forgetAlerts') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('忘れ物防止アラート')}{proSheet}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <ForgetAlertsPanel alerts={forgetAlerts} onChange={onForgetAlerts} isPremium={isPremium} onProPrompt={setProPrompt}/>
      </div>
    </div>
  );

  if(sub==='tags') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('タグ')}{proSheet}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {!isPremium&&<p className="text-xs text-gray-400 px-1 mt-4">2個まで無料でご利用いただけます。3個目からPROが必要です。</p>}

        {/* New tag */}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-4">新しいタグ</p>
        <div className="bg-white rounded-2xl shadow-sm px-4 pt-4 pb-3">
          <div className="flex gap-2 mb-3 flex-wrap">
            {TAG_COLORS.map(c=>(
              <button key={c.bg} onClick={()=>setNewTagColor(c.bg)}
                style={{backgroundColor:c.bg}}
                className={`w-7 h-7 rounded-full border border-gray-200 transition-all ${newTagColor===c.bg?'ring-2 ring-[var(--c-primary)] ring-offset-1 scale-110':''}`}/>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <input value={tagInput} onChange={e=>setTagInput(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&addTag()}
              placeholder="タグ名を入力"
              className="flex-1 text-[15px] bg-transparent outline-none text-gray-900 placeholder-gray-300 border-b border-gray-200 pb-1"/>
            <button onClick={addTag}
              className="px-4 py-1.5 bg-[var(--c-primary)] text-white text-sm font-semibold rounded-xl shrink-0">追加</button>
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
                            className={`w-6 h-6 rounded-full border border-gray-200 transition-all ${editColor===c.bg?'ring-2 ring-[var(--c-primary)] ring-offset-1 scale-110':''}`}/>
                        ))}
                      </div>
                      <input autoFocus value={editVal}
                        onChange={e=>setEditVal(e.target.value)}
                        onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commitEdit();}}}
                        className="w-full text-[15px] border-b border-gray-300 outline-none bg-transparent text-gray-900 py-0.5"/>
                    </div>
                  ) : (
                    <>
                      <span style={{backgroundColor:tag.color}} className="w-4 h-4 rounded-full shrink-0"/>
                      <span className="flex-1 text-[15px] text-gray-900">{tag.name}</span>
                    </>
                  )}
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={()=>editIdx===i?commitEdit():startEdit(i)}
                      className={`text-xs font-medium px-2.5 py-1 rounded-lg ${editIdx===i?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>
                      {editIdx===i?'確定':'編集'}
                    </button>
                    {editIdx===i
                      ? <button onClick={()=>setEditIdx(null)} className="text-xs font-medium px-2.5 py-1 rounded-lg bg-gray-100 text-gray-400">キャンセル</button>
                      : <button onClick={()=>deleteTag(i)} className="text-xs font-medium px-2.5 py-1 rounded-lg bg-red-50 text-[#D97A7A]">削除</button>
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
        {deleteTagIdx!==null&&(()=>{const dt=globalTags[deleteTagIdx];return(
          <div className="fixed inset-0 z-[100] flex items-end justify-center" onClick={()=>setDeleteTagIdx(null)}>
            <div className="absolute inset-0 bg-black/40"/>
            <div className="relative bg-white rounded-t-2xl w-full max-w-md px-6 pt-6 pb-10" onClick={e=>e.stopPropagation()}>
              <p className="text-center text-[17px] font-semibold text-gray-900 mb-1">「{dt?.name}」を削除しますか？</p>
              <p className="text-center text-[13px] text-gray-400 mb-6">このタグがついているタスクからも削除されます</p>
              <div className="flex flex-col gap-3">
                <button onClick={()=>{if(dt)onDeleteTag(dt.name);setDeleteTagIdx(null);}} className="w-full py-3.5 rounded-2xl bg-[#D97A7A] text-white text-[15px] font-semibold">削除する</button>
                <button onClick={()=>setDeleteTagIdx(null)} className="w-full py-3.5 rounded-2xl bg-gray-100 text-gray-700 text-[15px] font-semibold">キャンセル</button>
              </div>
            </div>
          </div>
        );})()}
        {pendingCommitEdit&&editIdx!==null&&(()=>{const orig=globalTags[editIdx];return(
          <div className="fixed inset-0 z-[100] flex items-end justify-center" onClick={()=>setPendingCommitEdit(false)}>
            <div className="absolute inset-0 bg-black/40"/>
            <div className="relative bg-white rounded-t-2xl w-full max-w-md px-6 pt-6 pb-10" onClick={e=>e.stopPropagation()}>
              <p className="text-center text-[17px] font-semibold text-gray-900 mb-1">「{orig.name}」を変更しますか？</p>
              <p className="text-center text-[13px] text-gray-400 mb-6">このタグがついているすべてのタスクのタグ名・色も変更されます</p>
              <div className="flex flex-col gap-3">
                <button onClick={doCommitEdit} className="w-full py-3.5 rounded-2xl bg-[var(--c-primary)] text-white text-[15px] font-semibold">変更する</button>
                <button onClick={()=>setPendingCommitEdit(false)} className="w-full py-3.5 rounded-2xl bg-gray-100 text-gray-700 text-[15px] font-semibold">キャンセル</button>
              </div>
            </div>
          </div>
        );})()}
      </div>
    </div>
  );

  if(sub==='recurring') {
    const seen=new Set<string>();
    const recurTasks=tasks.filter(t=>{
      if(!t.recurrence||t.isLater) return false;
      const key=`${t.name}|${t.startTime}|${t.recurrence}`;
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a,b)=>(a.startTime??'').localeCompare(b.startTime??''));
    return (
      <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
        {subHeader('繰り返しタスク')}
        <div className="flex-1 overflow-y-auto px-4 pb-8">
          {recurTasks.length===0?(
            <div className="flex flex-col items-center justify-center pt-20 gap-3">
              <div className="text-gray-300"><AppIcons.repeat size={48}/></div>
              <p className="text-[17px] font-semibold text-gray-900">繰り返しタスクはありません</p>
              <p className="text-sm text-gray-400 text-center px-8 leading-relaxed">タスク作成時に「繰り返し」を選ぶと、ここに表示されます</p>
            </div>
          ):(
            <>
              <p className="text-xs text-gray-400 px-1 mt-4 mb-2">{recurTasks.length}件</p>
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                {recurTasks.map((t,i)=>{
                  const Icon=getTaskIcon(t.icon||'task');
                  return (
                    <button key={t.id} onClick={()=>{onEditTask(t);onClose();}}
                      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 ${i<recurTasks.length-1?'border-b border-gray-100':''}`}>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{background:t.color??'var(--c-primary)'}}>
                        <Icon size={18} className="text-white"/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-medium text-gray-900 truncate">{t.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{recLabel(t)}{t.startTime?` · ${t.startTime}`:''}</p>
                      </div>
                      <AppIcons.caretRight size={14} className="text-gray-300 shrink-0"/>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if(sub==='notifications') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('通知')}{proSheet}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm mt-6">
          <SettingsRow icon={<AppIcons.bell size={18}/>} iconBg="bg-gray-100" title="通知設定"
            desc={(settings.notificationsEnabled??true)?'オン':'オフ'}
            onClick={()=>setSub('notifications-general')} isLast/>
        </div>
      </div>
    </div>
  );

  if(sub==='notifications-later') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('放置アラート')}{proSheet}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-4">タスク放置アラート</p>
        <p className="text-xs text-gray-400 px-1 mb-4 leading-relaxed">「あとでやる」に追加したタスクが、設定した時間が経っても完了していないときにお知らせします。</p>
        <div className="bg-white rounded-2xl shadow-sm px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-800">通知する</p>
            <button onClick={()=>onSettings({...settings,laterReminderHours:(settings.laterReminderHours??72)!==0?0:72})}
              className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${(settings.laterReminderHours??72)!==0?'bg-[var(--c-primary)]':'bg-gray-200'}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${(settings.laterReminderHours??72)!==0?'left-[18px]':'left-0.5'}`}/>
            </button>
          </div>
          {(settings.laterReminderHours??72)!==0&&(
            <div className="flex gap-2 flex-wrap">
              {LATER_REMINDER_OPTS.filter(o=>o.v!==0).map(o=>{
                const locked=o.v!==72&&!isPremium;
                return (
                  <button key={o.v} onClick={()=>{if(locked){setProPrompt('タスク放置アラートの間隔変更');return;}onSettings({...settings,laterReminderHours:o.v});}}
                    className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors inline-flex items-center gap-1 ${(settings.laterReminderHours??72)===o.v?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>
                    {locked&&<AppIcons.lock size={10} className="text-gray-400"/>}
                    {o.l}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-6">アプリ放置アラート</p>
        <p className="text-xs text-gray-400 px-1 mb-4 leading-relaxed">一定時間アプリを開いていない場合に通知します。</p>
        <div className="bg-white rounded-2xl shadow-sm px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-800">通知する</p>
            <button onClick={()=>onSettings({...settings,appInactivityHours:(settings.appInactivityHours??6)!==0?0:6})}
              className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${(settings.appInactivityHours??6)!==0?'bg-[var(--c-primary)]':'bg-gray-200'}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${(settings.appInactivityHours??6)!==0?'left-[18px]':'left-0.5'}`}/>
            </button>
          </div>
          {(settings.appInactivityHours??6)!==0&&(
            <div className="flex gap-2 flex-wrap">
              {APP_INACTIVITY_OPTS.filter(o=>o.v!==0).map(o=>{
                const locked=o.v!==6&&!isPremium;
                return (
                  <button key={o.v} onClick={()=>{if(locked){setProPrompt('アプリ放置アラートの間隔変更');return;}onSettings({...settings,appInactivityHours:o.v});}}
                    className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors inline-flex items-center gap-1 ${(settings.appInactivityHours??6)===o.v?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>
                    {locked&&<AppIcons.lock size={10} className="text-gray-400"/>}
                    {o.l}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if(sub==='notifications-general') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('通知設定')}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm mt-6">
          <div className="px-4 py-3.5 flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-medium text-gray-900">通知を有効にする</p>
              <p className="text-xs text-gray-400 mt-0.5">タスクのアラートや買い物リストの通知</p>
            </div>
            <button onClick={()=>{
                const next=!(settings.notificationsEnabled??true);
                if(next) requestNotifyPermission('settings');
                onSettings({...settings,notificationsEnabled:next});
              }}
              className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${(settings.notificationsEnabled??true)?'bg-[var(--c-primary)]':'bg-gray-200'}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${(settings.notificationsEnabled??true)?'left-[18px]':'left-0.5'}`}/>
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400 px-1 mt-2 leading-relaxed">通知を受け取るには、端末の設定でこのアプリの通知を許可してください。</p>
      </div>
    </div>
  );

  if(sub==='notifications-shop') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('買い物リスト通知')}
      <div className="flex-1 overflow-y-auto pb-8">
        <div className="mt-6">
          <ShopNotifPanel settings={shopNotifSettings} onChange={onShopNotifSettings}
            notificationsEnabled={settings.notificationsEnabled??true}
            onEnableNotifications={()=>onSettings({...settings,notificationsEnabled:true})}/>
          <ShopLocationPanel locations={shopLocations} onChange={onShopLocations} isPremium={isPremium} onProPrompt={setProPrompt}/>
        </div>
      </div>
    </div>
  );

  if(sub==='freeCard') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('空き時間カード')}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm mt-6">
          <div className="px-4 py-3.5 flex items-center justify-between border-b border-gray-100">
            <p className="text-[15px] font-medium text-gray-900">空き時間カードを表示</p>
            <button onClick={()=>onSettings({...settings,showFreeCard:!(settings.showFreeCard??true)})}
              className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${(settings.showFreeCard??true)?'bg-[var(--c-primary)]':'bg-gray-200'}`}>
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
                      className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${active?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if(sub==='display') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader(tr('settingsDisplayTitle'))}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm mt-6">
          <SettingsRow icon={<AppIcons.palette/>} iconBg="bg-gray-100"
            title="テーマカラー"
            desc={THEMES.find(t=>t.id===(settings.theme??'mint'))?.name??'ミント'}
            onClick={()=>setSub('themeColor')}/>
          <div className="h-px bg-gray-100 mx-4"/>
          <SettingsRow icon={<AppIcons.home/>} iconBg="bg-gray-100"
            title="アプリアイコン"
            desc={APP_ICONS.find(t=>t.id===(settings.appIcon??'mint'))?.name??'ミント'}
            onClick={()=>setSub('appIcon')}/>
          <div className="h-px bg-gray-100 mx-4"/>
          <SettingsRow icon={<AppIcons.freeTime size={18}/>} iconBg="bg-gray-100"
            title="空き時間カード"
            desc={(settings.showFreeCard??true)?`表示中・最小${settings.freeCardMinMin??120}分`:'非表示'}
            onClick={()=>setSub('freeCard')}/>
          <div className="h-px bg-gray-100 mx-4"/>
          <SettingsRow icon={<AppIcons.book size={18}/>} iconBg="bg-gray-100"
            title="言語 / Language"
            desc={language==='ja'?tr('settingsLanguageJa'):tr('settingsLanguageEn')}
            onClick={()=>setSub('language')} isLast/>
        </div>
      </div>
    </div>
  );

  if(sub==='language') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('言語 / Language')}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm mt-6">
          {([['ja','settingsLanguageJa'],['en','settingsLanguageEn']] as [Language,StringKey][]).map(([code,labelKey],i)=>(
            <div key={code}>
              {i>0&&<div className="h-px bg-gray-100 mx-4"/>}
              <button onClick={()=>setLanguage(code)}
                className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50">
                <span className="flex-1 text-left text-sm font-medium text-gray-800">{tr(labelKey)}</span>
                {language===code&&<AppIcons.checkSquare size={18} className="text-[var(--c-primary)]"/>}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if(sub==='themeColor') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('テーマカラー')}{proSheet}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <p className="text-xs text-gray-400 px-1 mb-4 mt-6">テーマを選択するとアプリ全体の色が切り替わります</p>
        <div className="grid grid-cols-4 gap-4">
          {(()=>{const effectiveTheme=THEMES.some(th=>th.id===settings.theme)?(settings.theme??'mint'):'mint';return THEMES.map(t=>{
            const selected=effectiveTheme===t.id;
            const isFree=t.id==='mint';
            return (
              <button key={t.id} onClick={()=>{if(!isPremium&&!isFree){setProPrompt('テーマカラーの変更');return;}onSettings({...settings,theme:t.id});}}
                className="flex flex-col items-center gap-2 py-3">
                <div className="relative w-14 h-14">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{background:t.color}}>
                    {selected&&(
                      <div className="w-7 h-7 bg-white rounded-full flex items-center justify-center shadow">
                        <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                          <path d="M1 4L4.5 7.5L11 1" stroke={t.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    )}
                  </div>
                  {!isFree&&!isPremium&&(
                    <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow z-10">
                      <AppIcons.lock size={10} className="text-gray-400"/>
                    </div>
                  )}
                </div>
                <span className={`text-xs text-center leading-tight ${selected?'font-bold text-gray-900':'text-gray-500'}`}>{t.name}</span>
                {!isFree&&!isPremium&&<span className="text-[8px] font-bold text-gray-400 border border-gray-300 rounded px-1 py-0.5 leading-none">PRO</span>}
              </button>
            );
          });})()}
        </div>
      </div>
    </div>
  );

  if(sub==='appIcon') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('アプリアイコン')}{proSheet}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <p className="text-xs text-gray-400 px-1 mb-4 mt-6">選択したアイコンがホーム画面に反映されます</p>
        <div className="grid grid-cols-3 gap-4">
          {APP_ICONS.map(ic=>{
            const selected=(settings.appIcon??'mint')===ic.id;
            const isFree=ic.id==='mint';
            return (
              <button key={ic.id} onClick={()=>{if(!isPremium&&!isFree){setProPrompt('アプリアイコンの変更');return;}onSettings({...settings,appIcon:ic.id});setNativeAppIcon(ic.id);}}
                className="flex flex-col items-center gap-2 py-3">
                <div className="relative w-14 h-14">
                  <div className="w-14 h-14 rounded-[16px] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/app-icons/${ic.file}`} alt={ic.name} className="w-full h-full object-cover"/>
                    {selected&&(
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <div className="w-7 h-7 bg-white rounded-full flex items-center justify-center shadow">
                          <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                            <path d="M1 4L4.5 7.5L11 1" stroke="#1F1F1F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>
                  {!isFree&&!isPremium&&(
                    <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow z-10">
                      <AppIcons.lock size={10} className="text-gray-400"/>
                    </div>
                  )}
                </div>
                <span className={`text-xs text-center leading-tight ${selected?'font-bold text-gray-900':'text-gray-500'}`}>{ic.name}</span>
                {!isFree&&!isPremium&&<span className="text-[8px] font-bold text-gray-400 border border-gray-300 rounded px-1 py-0.5 leading-none">PRO</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  if(sub==='lifePatterns') {
    const PATTERN_COLORS=['#94CFC8','#C4888E','#6A8FAF','#7A9E8A','#C4A44A','#8F82B8','#C47A5E','#A67899'];
    const daysInMonth=(y:number,m:number)=>new Date(y,m+1,0).getDate();
    const firstDow=(y:number,m:number)=>new Date(y,m,1).getDay();
    const totalDays=daysInMonth(lpVm.year,lpVm.month);
    const startDow=firstDow(lpVm.year,lpVm.month);
    const calNulls:Array<number|null>=Array(startDow).fill(null);
    const calDays:Array<number|null>=Array.from({length:totalDays},(_,i)=>i+1);
    const calCells:Array<number|null>=[...calNulls,...calDays];
    while(calCells.length%7!==0) calCells.push(null);
    const cellDate=(day:number)=>`${lpVm.year}-${String(lpVm.month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return (
      <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
        {subHeader('生活パターン')}{proSheet}
        <div className="flex-1 overflow-y-auto px-4 pb-10">
          {!isPremium&&<p className="text-xs text-gray-400 px-1 mt-4 mb-2">1個まで無料でご利用いただけます。2個目からPROが必要です。</p>}
          <p className="text-xs text-gray-400 px-1 mb-1 mt-6">シフトや予定に合わせて、日ごとの起床・就寝時間を変更できます</p>
          <p className="text-xs text-gray-400 px-1 mb-2">パターンを追加・選択して日付をタップ</p>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm mb-1">
            {lifePatterns.length===0&&!lpAddMode&&(
              <p className="text-sm text-gray-400 text-center py-6">パターンがまだありません</p>
            )}
            {lifePatterns.map((pat,i)=>(
              <div key={pat.id} className={`px-4 py-3 flex items-center gap-3${i<lifePatterns.length-1||lpAddMode?' border-b border-gray-100':''}`}>
                {lpEditId===pat.id ? (
                  <div className="flex-1 flex flex-col gap-2">
                    <input autoFocus value={lpEditName}
                      onChange={e=>setLpEditName(e.target.value)}
                      className="text-[15px] border-b border-gray-200 outline-none bg-transparent text-gray-900 py-0.5"/>
                    <div className="flex gap-3 items-center">
                      <input type="time" value={lpEditWake}
                        onChange={e=>setLpEditWake(e.target.value)}
                        className="border border-gray-200 rounded-xl px-2 py-1 text-xs bg-gray-50"/>
                      <span className="text-xs text-gray-400">〜</span>
                      <input type="time" value={lpEditSleep}
                        onChange={e=>setLpEditSleep(e.target.value)}
                        className="border border-gray-200 rounded-xl px-2 py-1 text-xs bg-gray-50"/>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {PATTERN_COLORS.map(c=>(
                        <button key={c} onClick={()=>setLpEditColor(c)}
                          style={{background:c}}
                          className={`w-6 h-6 rounded-full border-2 ${lpEditColor===c?'border-gray-700':'border-transparent'}`}/>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={()=>setLpEditConfirmId(pat.id)}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold bg-[var(--c-primary)] text-white">確定</button>
                      <button onClick={()=>setLpEditId(null)}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold bg-gray-100 text-gray-500">キャンセル</button>
                    </div>
                    <button onClick={()=>setLpDeleteId(pat.id)}
                      className="text-xs font-semibold text-[#D97A7A] text-center py-1">このパターンを削除</button>
                  </div>
                ) : (
                  <>
                    <button onClick={()=>setLpActivePat(lpActivePat===pat.id?null:pat.id)}
                      className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-4 h-4 rounded-full shrink-0" style={{background:pat.color}}/>
                      <div className="flex-1 min-w-0 text-left">
                        <p className={`text-[15px] font-medium ${lpActivePat===pat.id?'text-[var(--c-primary)]':'text-gray-900'}`}>{pat.name}</p>
                        <p className="text-xs text-gray-400">{pat.wakeTime} 起床 / {pat.sleepTime} 就寝</p>
                      </div>
                      {lpActivePat===pat.id&&<AppIcons.checkCircle size={18} className="text-[var(--c-primary)] shrink-0"/>}
                    </button>
                    <button onClick={()=>{setLpEditId(pat.id);setLpEditName(pat.name);setLpEditWake(pat.wakeTime);setLpEditSleep(pat.sleepTime);setLpEditColor(pat.color);}}
                      className="text-xs text-gray-400 font-medium px-2 py-1 shrink-0">編集</button>
                  </>
                )}
              </div>
            ))}
            {lpAddMode&&(
              <div className="px-4 py-3 flex flex-col gap-2">
                <input autoFocus value={lpNewName} onChange={e=>setLpNewName(e.target.value)}
                  placeholder="パターン名（例：平日、休日、早番、遅番）"
                  className="text-[15px] border-b border-gray-200 outline-none bg-transparent text-gray-900 placeholder-gray-300 py-0.5"/>
                <div className="flex gap-3 items-center">
                  <input type="time" value={lpNewWake} onChange={e=>setLpNewWake(e.target.value)}
                    className="border border-gray-200 rounded-xl px-2 py-1 text-xs bg-gray-50"/>
                  <span className="text-xs text-gray-400">〜</span>
                  <input type="time" value={lpNewSleep} onChange={e=>setLpNewSleep(e.target.value)}
                    className="border border-gray-200 rounded-xl px-2 py-1 text-xs bg-gray-50"/>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {PATTERN_COLORS.map(c=>(
                    <button key={c} onClick={()=>setLpNewColor(c)}
                      style={{background:c}}
                      className={`w-6 h-6 rounded-full border-2 ${lpNewColor===c?'border-gray-700':'border-transparent'}`}/>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={()=>{
                    if(!lpNewName.trim()) return;
                    const np:LifePattern={id:uid(),name:lpNewName.trim(),wakeTime:lpNewWake,sleepTime:lpNewSleep,color:lpNewColor};
                    onLifePatterns([...lifePatterns,np]);
                    setLpNewName('');setLpAddMode(false);
                  }} className="flex-1 py-2 rounded-xl text-xs font-semibold bg-[var(--c-primary)] text-white">追加</button>
                  <button onClick={()=>setLpAddMode(false)}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold bg-gray-100 text-gray-500">キャンセル</button>
                </div>
              </div>
            )}
          </div>
          {!lpAddMode&&(
            <button onClick={()=>{if(!isPremium&&lifePatterns.length>=1){setProPrompt('生活パターンを2個以上登録');return;}setLpAddMode(true);setLpNewName('');setLpNewWake('07:00');setLpNewSleep('23:00');setLpNewColor('#94CFC8');}}
              className="w-full py-3 rounded-2xl text-sm font-semibold text-[var(--c-primary)] bg-white shadow-sm mb-5">＋ パターンを追加</button>
          )}

          {/* Calendar — always visible */}
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm mb-3">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <button onClick={()=>setLpVm(prev=>shiftMonth(prev.year,prev.month,-1))}
                className="w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100">
                <AppIcons.caretLeft size={16} className="text-gray-600"/>
              </button>
              <p className="text-[15px] font-semibold text-gray-900">{lpVm.year}年{lpVm.month+1}月</p>
              <button onClick={()=>setLpVm(prev=>shiftMonth(lpVm.year,lpVm.month,1))}
                className="w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100">
                <AppIcons.caretRight size={16} className="text-gray-600"/>
              </button>
            </div>
            <div className="grid grid-cols-7 px-2 pt-2">
              {['日','月','火','水','木','金','土'].map(d=>(
                <div key={d} className="text-center text-xs text-gray-400 pb-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 px-2 pb-3">
              {calCells.map((day,idx)=>{
                if(!day) return <div key={idx}/>;
                const ds=cellDate(day);
                const patId=patternOverrides[ds]??null;
                const cellPat=patId?lifePatterns.find(p=>p.id===patId)??null:null;
                const isToday=ds===_lpToday;
                return (
                  <button key={idx}
                    onClick={()=>{ if(!lpActivePat) return; onApplyPattern([ds],lpActivePat===patId?null:lpActivePat); }}
                    className="flex flex-col items-center py-1 rounded-xl active:bg-gray-50">
                    <span className={`text-sm w-8 h-8 flex items-center justify-center rounded-full font-medium
                      ${isToday&&!cellPat?'bg-gray-100 text-gray-900':''}
                      ${cellPat?'text-white':'text-gray-700'}
                    `} style={cellPat?{background:cellPat.color}:undefined}>{day}</span>
                    {cellPat&&(
                      <span className="text-[9px] leading-tight text-center mt-0.5 max-w-[40px] truncate" style={{color:cellPat.color}}>{cellPat.name}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {lpDeleteId&&(()=>{const dp=lifePatterns.find(p=>p.id===lpDeleteId);const affectedDates=Object.keys(patternOverrides).filter(d=>patternOverrides[d]===lpDeleteId);return(
          <div className="fixed inset-0 z-[100] flex items-end justify-center" onClick={()=>setLpDeleteId(null)}>
            <div className="absolute inset-0 bg-black/40"/>
            <div className="relative bg-white rounded-t-2xl w-full max-w-md px-6 pt-6 pb-10" onClick={e=>e.stopPropagation()}>
              <p className="text-center text-[17px] font-semibold text-gray-900 mb-1">「{dp?.name}」を削除しますか？</p>
              <p className="text-center text-[13px] text-gray-400 mb-6">
                {affectedDates.length>0?`このパターンを設定した${affectedDates.length}日分の日付も解除されます`:'このパターンを削除します'}
              </p>
              <div className="flex flex-col gap-3">
                <button onClick={()=>{
                  if(affectedDates.length>0) onApplyPattern(affectedDates,null);
                  onLifePatterns(lifePatterns.filter(p=>p.id!==lpDeleteId));
                  setLpEditId(null);
                  if(lpActivePat===lpDeleteId) setLpActivePat(null);
                  setLpDeleteId(null);
                }} className="w-full py-3.5 rounded-2xl bg-[#D97A7A] text-white text-[15px] font-semibold">削除する</button>
                <button onClick={()=>setLpDeleteId(null)} className="w-full py-3.5 rounded-2xl bg-gray-50 text-gray-500 text-[15px] font-semibold">キャンセル</button>
              </div>
            </div>
          </div>
        );})()}
        {lpEditConfirmId&&(()=>{const dp=lifePatterns.find(p=>p.id===lpEditConfirmId);const affectedDates=Object.keys(patternOverrides).filter(d=>patternOverrides[d]===lpEditConfirmId);return(
          <div className="fixed inset-0 z-[100] flex items-end justify-center" onClick={()=>setLpEditConfirmId(null)}>
            <div className="absolute inset-0 bg-black/40"/>
            <div className="relative bg-white rounded-t-2xl w-full max-w-md px-6 pt-6 pb-10" onClick={e=>e.stopPropagation()}>
              <p className="text-center text-[17px] font-semibold text-gray-900 mb-1">「{dp?.name}」の内容を変更しますか？</p>
              <p className="text-center text-[13px] text-gray-400 mb-6">
                {affectedDates.length>0?`このパターンを設定した${affectedDates.length}日分にも反映されます`:'この内容で保存します'}
              </p>
              <div className="flex flex-col gap-3">
                <button onClick={()=>{
                  onLifePatterns(lifePatterns.map(p=>p.id===lpEditConfirmId?{...p,name:lpEditName.trim()||p.name,wakeTime:lpEditWake,sleepTime:lpEditSleep,color:lpEditColor}:p));
                  setLpEditConfirmId(null);
                  setLpEditId(null);
                }} className="w-full py-3.5 rounded-2xl bg-[var(--c-primary)] text-white text-[15px] font-semibold">変更する</button>
                <button onClick={()=>setLpEditConfirmId(null)} className="w-full py-3.5 rounded-2xl bg-gray-50 text-gray-500 text-[15px] font-semibold">キャンセル</button>
              </div>
            </div>
          </div>
        );})()}
      </div>
    );
  }

  if(sub==='wakeSleep') {
    const PATTERN_COLORS=['#94CFC8','#C4888E','#6A8FAF','#7A9E8A','#C4A44A','#8F82B8','#C47A5E','#A67899'];
    const daysInMonth=(y:number,m:number)=>new Date(y,m+1,0).getDate();
    const firstDow=(y:number,m:number)=>new Date(y,m,1).getDay();
    const totalDays=daysInMonth(lpVm.year,lpVm.month);
    const startDow=firstDow(lpVm.year,lpVm.month);
    const calNulls:Array<number|null>=Array(startDow).fill(null);
    const calDays:Array<number|null>=Array.from({length:totalDays},(_,i)=>i+1);
    const calCells:Array<number|null>=[...calNulls,...calDays];
    while(calCells.length%7!==0) calCells.push(null);
    const cellDate=(day:number)=>`${lpVm.year}-${String(lpVm.month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return (
      <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
        {subHeader('起床・就寝')}{proSheet}
        <div className="flex-1 overflow-y-auto px-4 pb-10">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-6">時間設定</p>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm mb-5">
            <div className="px-4 py-4 flex items-center gap-3">
              <button onClick={()=>{if(!isPremium){setProPrompt('起床・就寝アイコンの色変更');return;}setColorPicking(colorPicking==='wake'?null:'wake');}} className="relative shrink-0">
                <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{background:settings.wakeColor||'var(--c-primary)'}}>
                  <AppIcons.wake size={16} className="text-white"/>
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow border border-gray-100">
                  <AppIcons.pencil size={9} className="text-gray-500"/>
                </div>
              </button>
              <input type="time" value={settings.wakeTime}
                onChange={e=>onSettings({...settings,wakeTime:e.target.value})}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50"/>
              <span className="text-gray-300 text-sm">〜</span>
              <button onClick={()=>{if(!isPremium){setProPrompt('起床・就寝アイコンの色変更');return;}setColorPicking(colorPicking==='sleep'?null:'sleep');}} className="relative shrink-0">
                <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{background:settings.sleepColor||'var(--c-primary)'}}>
                  <AppIcons.sleep size={16} className="text-white"/>
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow border border-gray-100">
                  <AppIcons.pencil size={9} className="text-gray-500"/>
                </div>
              </button>
              <input type="time" value={settings.sleepTime}
                onChange={e=>onSettings({...settings,sleepTime:e.target.value})}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50"/>
            </div>
            {colorPicking&&(
              <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                <p className="text-xs text-gray-400 mb-2 flex items-center gap-1.5">{colorPicking==='wake'?'起床':'就寝'}アイコンの色<span className="inline-flex items-center gap-0.5 border border-gray-300 rounded px-1.5 py-0.5 text-[10px] font-bold text-gray-400 leading-none tracking-wide">★ PRO</span></p>
                <div className="flex flex-wrap gap-2">
                  {['#94CFC8',...TASK_COLORS.filter(Boolean)].map((c,i)=>{
                    const cur=colorPicking==='wake'?(settings.wakeColor||'#94CFC8'):(settings.sleepColor||'#94CFC8');
                    return <button key={i} onClick={()=>{onSettings({...settings,[colorPicking==='wake'?'wakeColor':'sleepColor']:c});setColorPicking(null);}}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${cur===c?'border-gray-700 scale-110':'border-transparent'}`}
                      style={{background:c}}/>;
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 py-4">
              <p className="text-sm font-medium text-gray-800 mb-1">日ごとに起床・就寝時間を変えたいときは</p>
              <p className="text-xs text-gray-400 mb-3 leading-relaxed">生活パターンを使うと、シフトや休日など日ごとの時間帯を設定できます。</p>
              <button onClick={()=>setSub('lifePatterns')}
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 active:bg-gray-200">
                生活パターンの設定へ
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if(sub==='account') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('アカウント')}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm mt-6">
          <SettingsRow icon={<AppIcons.link size={18}/>} iconBg="bg-gray-100"
            title="Appleアカウント"
            desc="近日リリース予定"
            onClick={()=>{}} />
          <SettingsRow icon={<AppIcons.sparkle size={18}/>} iconBg="bg-gray-100"
            title="iCloudバックアップ"
            desc="近日リリース予定"
            onClick={()=>{}} />
          <SettingsRow icon={<AppIcons.clock size={18}/>} iconBg="bg-gray-100"
            title="同期状態"
            desc="近日リリース予定"
            onClick={()=>{}} isLast/>
        </div>
      </div>
    </div>
  );


  if(sub==='devMode') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('開発者モード')}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <p className="text-xs text-gray-400 px-1 mb-4 mt-4 leading-relaxed">
          ここでの変更はRevenueCatや実際のOS権限を変えるものではなく、アプリの見た目だけを一時的に切り替えます。
        </p>

        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2">プラン</p>
        <div className="bg-white rounded-2xl shadow-sm p-3 mb-6 flex gap-2">
          <button onClick={()=>setDevPlan('free')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${devPlan==='free'?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>Free</button>
          <button onClick={()=>setDevPlan('premium')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${devPlan==='premium'?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>Premium</button>
          <button onClick={()=>setDevPlan(null)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${devPlan===null?'bg-[var(--c-primary)] text-white':'bg-gray-100 text-gray-600'}`}>実際の状態</button>
        </div>

        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2">アプリ状態</p>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-6">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
            <div className="flex-1 min-w-0 pr-3">
              <p className="text-sm font-medium text-gray-800">初回起動</p>
              <p className="text-xs text-gray-400 mt-0.5">OFFにするとオンボーディングからやり直せます</p>
            </div>
            <button onClick={toggleFirstLaunch}
              className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${firstLaunchDone?'bg-[var(--c-primary)]':'bg-gray-200'}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${firstLaunchDone?'left-[18px]':'left-0.5'}`}/>
            </button>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <div className="flex-1 min-w-0 pr-3">
              <p className="text-sm font-medium text-gray-800">プロダクトツアー</p>
              <p className="text-xs text-gray-400 mt-0.5">OFFにするとツアーを再表示できます</p>
            </div>
            <button onClick={toggleTour}
              className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${tourDone?'bg-[var(--c-primary)]':'bg-gray-200'}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${tourDone?'left-[18px]':'left-0.5'}`}/>
            </button>
          </div>
        </div>
        <p className="text-[11px] text-gray-300 px-1 mb-6 -mt-4">切り替えるとアプリが再読み込みされます</p>

        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2">権限</p>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-800">通知許可</p>
            <button onClick={toggleNotifGranted}
              className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${notifGranted?'bg-[var(--c-primary)]':'bg-gray-200'}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${notifGranted?'left-[18px]':'left-0.5'}`}/>
            </button>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <p className="text-sm font-medium text-gray-800">位置情報許可</p>
            <button onClick={toggleLocGranted}
              className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${locGranted?'bg-[var(--c-primary)]':'bg-gray-200'}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${locGranted?'left-[18px]':'left-0.5'}`}/>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if(sub==='premium') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('PRO')}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="mt-6 mb-4 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--c-primary)]/10 mb-3">
            <AppIcons.star size={32} className="text-[var(--c-primary)]"/>
          </div>
          <p className="text-lg font-bold text-gray-900">PROにアップグレード</p>
          <p className="text-sm text-gray-500 mt-1">より便利な機能で、毎日をもっとスムーズに</p>
        </div>

        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2">★ PRO 機能一覧</p>
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm mb-4">
          <div className="grid px-4 py-2.5 bg-gray-50 border-b border-gray-100" style={{gridTemplateColumns:'1fr 72px 64px'}}>
            <p className="text-xs font-semibold text-gray-500">機能</p>
            <p className="text-xs font-semibold text-gray-500 text-center">無料</p>
            <p className="text-xs font-bold text-[var(--c-primary)] text-center">PRO</p>
          </div>
          {[
            {label:'生活パターン',         free:'1個',       pro:'無制限'},
            {label:'タスク一括入力',       free:'月1回',     pro:'無制限'},
            {label:'タグ',                 free:'2個',       pro:'無制限'},
            {label:'ファイルタブ',         free:'1個',       pro:'無制限'},
            {label:'繰り返し間隔カスタム', free:'基本のみ',  pro:'完全対応'},
            {label:'テーマカラー',         free:'ミントのみ', pro:'9色'},
            {label:'アプリアイコン変更',   free:'×',         pro:'対応'},
            {label:'起床・就寝アイコン色変更', free:'×',      pro:'対応'},
            {label:'場所で通知',           free:'×',         pro:'対応'},
            {label:'放置アラート',         free:'既定のみ',  pro:'完全対応'},
            {label:'締切管理',             free:'×',         pro:'対応'},
            {label:'あとでやるの場所通知', free:'×',         pro:'対応'},
            {label:'忘れ物防止アラート',   free:'×',         pro:'対応'},
          ].map(({label,free,pro},i,arr)=>(
            <div key={i} className={`grid items-center px-4 py-3${i<arr.length-1?' border-b border-gray-100':''}`} style={{gridTemplateColumns:'1fr 72px 64px'}}>
              <p className="text-sm text-gray-800">{label}</p>
              <p className={`text-sm text-center ${free==='×'?'text-gray-300':'text-gray-500'}`}>{free}</p>
              <p className="text-sm font-semibold text-[var(--c-primary)] text-center">{pro}</p>
            </div>
          ))}
        </div>

        {isPremium ? (
          <div className="bg-white rounded-2xl px-4 py-5 shadow-sm text-center">
            <p className="text-sm font-bold text-[var(--c-primary)] mb-1">PROプランを利用中です</p>
            <p className="text-xs text-gray-400">すべての機能をご利用いただけます</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl px-4 py-5 shadow-sm mb-3">
              <p className="text-[13px] font-semibold text-gray-400 text-center mb-3">料金プラン</p>
              <div className="rounded-xl px-4 py-4 text-center border border-gray-100" style={{background:'color-mix(in srgb, var(--c-primary) 8%, white)'}}>
                <p className="text-sm font-bold mb-1" style={{color:'var(--c-primary)'}}>7日間無料トライアル</p>
                <p className="text-xs text-gray-400 mb-1">トライアル終了後 月額</p>
                <p className="text-2xl font-bold" style={{color:'var(--c-primary)'}}>¥200</p>
                <p className="text-xs text-gray-400 mt-1">いつでもキャンセル可能</p>
              </div>
            </div>
            <button
              disabled={isPurchasing}
              onClick={async()=>{try{await purchase();}catch{alert('購入処理に失敗しました。時間をおいて再度お試しください。');}}}
              className="w-full py-4 rounded-2xl text-[15px] font-bold text-white mb-2 active:opacity-80 disabled:opacity-50"
              style={{background:'var(--c-primary)'}}
            >
              {isPurchasing?'処理中...':'7日間無料で始める'}
            </button>
            <button
              onClick={async()=>{const ok=await restore();if(!ok)alert('復元できる購入履歴が見つかりませんでした');}}
              className="w-full py-2.5 text-sm text-gray-400 text-center"
            >
              購入を復元
            </button>
          </>
        )}
      </div>
    </div>
  );

  if(sub==='privacy') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('プライバシーポリシー')}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <p className="text-xs text-gray-400 mt-4 mb-3 px-1">最終更新日：2026年7月3日</p>
        {([
          {title:'BrainBoxについて',body:'BrainBoxは、ADHD気質の方やToDoリストが続かない方向けに、1日のタスクを時間軸で見える化するタイムライン型タスク管理アプリです。\n本プライバシーポリシーは、本アプリにおける個人情報の取り扱いについて説明します。'},
          {title:'取得する情報',body:'本アプリは、以下の情報をお客様のデバイス上にのみ保存します。\n・タスク名・日時・メモ・サブタスクなどの入力データ\n・起床・就寝時間などの設定情報\n・タグ・カテゴリ・繰り返し設定などのカスタマイズ情報\n\nこれらの情報は外部サーバーには送信されず、お客様のデバイス内のみで管理されます。'},
          {title:'情報の利用目的',body:'取得した情報は、以下の目的にのみ使用します。\n・タスクの表示・管理・検索機能の提供\n・繰り返しタスクのスケジュール生成\n・アプリ設定の保持'},
          {title:'第三者提供について',body:'本アプリは、お客様の個人情報を第三者に提供することはありません。\n\nただし、オプション機能としてAI文章生成機能（Groq APIを使用）をご利用いただく場合、入力したタスク情報が当該APIに送信されることがあります。詳細はGroq社のプライバシーポリシーをご確認ください。'},
          {title:'データの管理について',body:'本アプリのデータはすべてお客様のデバイス内（localStorage）に保存されます。\n・アプリをアンインストールするとすべてのデータが削除されます\n・デバイスの初期化によってデータが失われる場合があります\n・本アプリはデータのクラウドバックアップ機能を持ちません'},
          {title:'プライバシーポリシーの改定について',body:'本プライバシーポリシーは、法令の改正や機能追加に伴い改定される場合があります。重要な変更がある場合はアプリ内またはサポートページにてお知らせします。'},
        ] as {title:string;body:string}[]).map(({title,body},i,arr)=>(
          <div key={i} className={`bg-white rounded-2xl shadow-sm px-4 py-4 mb-3`}>
            <p className="text-[15px] font-bold text-gray-900 mb-2">{title}</p>
            <p className="text-[14px] text-gray-500 leading-relaxed whitespace-pre-line">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );

  if(sub==='terms') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('利用規約')}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <p className="text-xs text-gray-400 mt-4 mb-3 px-1">最終更新日：2026年7月3日</p>
        {([
          {title:'はじめに',body:'本利用規約（以下「本規約」）は、BrainBox（以下「本アプリ」）のご利用条件を定めるものです。本アプリをご利用いただくことで、本規約に同意したものとみなします。'},
          {title:'利用条件',body:'本アプリは、個人的・非商業的な用途に限り無償でご利用いただけます。\n・本アプリの複製・改変・再配布は禁止します\n・本アプリを商業目的で利用することは禁止します\n・本アプリのリバースエンジニアリングは禁止します'},
          {title:'免責事項',body:'本アプリは現状有姿で提供されます。本アプリの利用によって生じたいかなる損害についても、開発者は責任を負いません。\n・データの消失・破損に関する損害\n・本アプリの不具合・停止による損害\n・その他、本アプリの利用に起因する損害\n\n重要なデータは定期的にバックアップされることをお勧めします。'},
          {title:'知的財産権',body:'本アプリに関する著作権その他の知的財産権は、開発者に帰属します。本規約に定める範囲を超えた利用は禁止します。'},
          {title:'サービスの変更・終了',body:'開発者は、予告なく本アプリの機能変更・サービスの一部または全部の終了を行う場合があります。これによってお客様に生じた損害について、開発者は責任を負いません。'},
          {title:'規約の変更',body:'開発者は、必要に応じて本規約を変更することがあります。変更後の規約は本ページにて公開します。重要な変更がある場合はアプリ内またはサポートページにてお知らせします。'},
        ] as {title:string;body:string}[]).map(({title,body},i,arr)=>(
          <div key={i} className="bg-white rounded-2xl shadow-sm px-4 py-4 mb-3">
            <p className="text-[15px] font-bold text-gray-900 mb-2">{title}</p>
            <p className="text-[14px] text-gray-500 leading-relaxed whitespace-pre-line">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );

  if(sub==='support') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('よくある質問')}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="mt-4 bg-white rounded-2xl overflow-hidden shadow-sm">
          {([
            {q:'データはどこに保存されますか？',a:'すべてのデータはお使いのデバイスのローカルストレージに保存されます。外部サーバーへの送信は行いません。'},
            {q:'アプリを削除するとデータはどうなりますか？',a:'アプリをアンインストールするとすべてのデータが削除されます。現在、クラウドバックアップ機能はありません。'},
            {q:'タスクを誤って削除してしまいました。復元できますか？',a:'申し訳ありませんが、削除したタスクの復元機能は現在ありません。重要なタスクは削除前にご確認ください。'},
            {q:'繰り返しタスクの一部だけ削除できますか？',a:'はい。繰り返しタスクを削除する際、「この予定のみ削除」または「すべての予定を削除」を選択できます。'},
            {q:'起床・就寝時間はどこで変更できますか？',a:'設定画面の「起床・就寝」から変更できます。タイムライン上の起床・就寝カードをタップしても変更できます。'},
            {q:'「あとでやる」に移動したタスクはどこで確認できますか？',a:'画面下部のバーにある「あとでやる」ボタンをタップすると、あとでやるリストが表示されます。'},
          ] as {q:string;a:string}[]).map(({q,a},i,arr)=>(
            <div key={i} className={i<arr.length-1?'border-b border-gray-100':''}>
              <div className="px-4 py-4">
                <p className="text-[15px] font-semibold text-gray-900 mb-1.5">Q. {q}</p>
                <p className="text-[14px] text-gray-500 leading-relaxed">A. {a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if(sub==='contact') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('お問い合わせ')}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="mt-4 rounded-2xl shadow-sm px-4 py-5" style={{background:'#06C755'}}>
          <div className="flex items-center gap-2 mb-2">
            <AppIcons.chat size={20} className="text-white"/>
            <p className="text-[15px] font-bold text-white">LINEでお問い合わせ</p>
          </div>
          <p className="text-[14px] text-white/90 leading-relaxed mb-1">ご質問やご要望がございましたら、公式LINEからお気軽にお問い合わせください。</p>
          <p className="text-[13px] text-white/70 mb-4">通常、1〜3日以内にお返事いたします。</p>
          <button onClick={()=>window.open('https://lin.ee/TeaJYTJ')}
            className="w-full py-3 rounded-xl text-[15px] font-semibold"
            style={{background:'white',color:'#06C755'}}>
            LINEで問い合わせる
          </button>
        </div>

        <div className="mt-4 bg-white rounded-2xl shadow-sm px-4 py-5">
          <p className="text-[14px] font-semibold text-gray-500 mb-2">メールでお問い合わせ</p>
          <p className="text-[13px] text-gray-400 leading-relaxed mb-4">LINEをご利用でない方は、メールでもお問い合わせいただけます。</p>
          <button onClick={()=>window.open('mailto:support.brainbox.jp@gmail.com')}
            className="w-full py-2.5 rounded-xl text-[14px] font-semibold text-gray-600 bg-gray-100">
            メールアプリで開く
          </button>
        </div>
      </div>
    </div>
  );

  if(sub==='faq') return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      {subHeader('よくある質問')}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="mt-4 bg-white rounded-2xl overflow-hidden shadow-sm">
          {[
            {q:'データはどこに保存されますか？',a:'すべてのデータはお使いのデバイスのローカルストレージに保存されます。外部サーバーへの送信は行いません。'},
            {q:'アプリを削除するとデータはどうなりますか？',a:'アプリをアンインストールするとすべてのデータが削除されます。現在、クラウドバックアップ機能はありません。'},
            {q:'タスクを誤って削除してしまいました。復元できますか？',a:'申し訳ありませんが、削除したタスクの復元機能は現在ありません。重要なタスクは削除前にご確認ください。'},
            {q:'繰り返しタスクの一部だけ削除できますか？',a:'はい。繰り返しタスクを削除する際、「この予定のみ削除」または「すべての予定を削除」を選択できます。'},
            {q:'起床・就寝時間はどこで変更できますか？',a:'設定画面の「起床・就寝」から変更できます。タイムライン上の起床・就寝カードをタップしても変更できます。'},
            {q:'「あとでやる」に移動したタスクはどこで確認できますか？',a:'画面下部のバーにある「あとでやる」ボタンをタップすると、あとでやるリストが表示されます。'},
          ].map(({q,a},i,arr)=>(
            <div key={i} className={i<arr.length-1?'border-b border-gray-100':''}>
              <div className="px-4 py-4">
                <p className="text-[15px] font-semibold text-gray-900 mb-1.5">Q. {q}</p>
                <p className="text-[14px] text-gray-500 leading-relaxed">A. {a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-y-0 inset-x-0 z-[80] bg-[#F2F2F7] flex flex-col max-w-md mx-auto">
      <div className="bg-[#F2F2F7] px-4 pb-2 shrink-0 relative flex items-center justify-center" style={{paddingTop:'calc(1rem + env(safe-area-inset-top))'}}>

        <button onClick={onClose} className="absolute left-4 flex items-center" style={{color:'var(--c-primary)'}}>
          <AppIcons.caretLeft size={20}/>
        </button>
        <h1 className="text-[20px] font-bold text-gray-900">設定</h1>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-10">


        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-6">機能</p>
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <SettingsRow icon={<AppIcons.tag/>} iconBg="bg-gray-100" title="タグ" desc="タスクにラベルを付けて整理・検索" onClick={()=>setSub('tags')}/>
          <SettingsRow icon={<AppIcons.caretRight/>} iconBg="bg-gray-100" title="ファイルタブ" desc="タスクをフォルダ別に管理" onClick={()=>setSub('tabs')}/>
          <SettingsRow icon={<AppIcons.pencil size={18}/>} iconBg="bg-gray-100" title="タスク一括入力" desc="まとめてタスクを登録" onClick={()=>setSub('bulkInput')}/>
          <SettingsRow icon={<AppIcons.calendar size={18}/>} iconBg="bg-gray-100" title="生活パターン" desc="シフトや休日で起床・就寝時間を切り替え" onClick={()=>setSub('lifePatterns')}/>
          <SettingsRow icon={<AppIcons.repeat size={18}/>} iconBg="bg-gray-100" title="繰り返しタスク" desc="繰り返しタスクを管理" onClick={()=>setSub('recurring')}/>
          <SettingsRow icon={<AppIcons.wake size={18}/>} iconBg="bg-gray-100" title="起床・就寝" desc="起床時間、就寝時間を設定" onClick={()=>setSub('wakeSleep')}/>
          <SettingsRow icon={<AppIcons.shopping size={18}/>} iconBg="bg-gray-100" title="買い物リスト通知"
            desc="時間や場所で買い物リストを通知"
            onClick={()=>setSub('notifications-shop')}/>
          <SettingsRow icon={<AppIcons.postponed size={18}/>} iconBg="bg-gray-100" title="放置アラート"
            desc="タスクやアプリの放置を通知"
            onClick={()=>setSub('notifications-later')}/>
          <SettingsRow icon={<AppIcons.backpack size={18}/>} iconBg="bg-gray-100" title="忘れ物防止アラート"
            desc="場所を出るときに持ち物を確認"
            onClick={()=>setSub('forgetAlerts')} isLast/>
        </div>

        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-6">一般</p>
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <SettingsRow icon={<AppIcons.bell/>} iconBg="bg-gray-100" title="通知" desc="通知設定" onClick={()=>setSub('notifications')}/>
          <SettingsRow icon={<AppIcons.palette/>} iconBg="bg-gray-100" title="表示設定" desc="外観、言語など" onClick={()=>setSub('display')} isLast/>
        </div>

        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-6">連携</p>
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <SettingsRow icon={<AppIcons.link size={18}/>} iconBg="bg-gray-100" title="アカウント" desc="Appleアカウント・iCloudバックアップ" onClick={()=>setSub('account')} isLast/>
        </div>

        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-6">サブスクリプション</p>
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <SettingsRow icon={<AppIcons.star/>} iconBg="bg-gray-100" title="PRO" desc={isPremium?'利用中':'月額¥200'} onClick={()=>setSub('premium')} isLast/>
        </div>

        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-6">情報</p>
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <SettingsRow icon={<AppIcons.tag size={18}/>} iconBg="bg-gray-100" title="プライバシーポリシー" onClick={()=>setSub('privacy')}/>
          <SettingsRow icon={<AppIcons.book size={18}/>} iconBg="bg-gray-100" title="利用規約" onClick={()=>setSub('terms')}/>
          <SettingsRow icon={<AppIcons.question size={18}/>} iconBg="bg-gray-100" title="よくある質問" onClick={()=>setSub('support')}/>
          <SettingsRow icon={<AppIcons.mail size={18}/>} iconBg="bg-gray-100" title="お問い合わせ" onClick={()=>setSub('contact')}/>
          <button onClick={handleVersionTap} className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50">
            <div className="w-[30px] h-[30px] rounded-[8px] flex items-center justify-center shrink-0"
              style={{background:'color-mix(in srgb, var(--c-primary) 15%, white)', color:'var(--c-primary)'}}>
              <AppIcons.sparkle size={18}/>
            </div>
            <p className="flex-1 text-[15px] font-medium text-gray-900">アプリバージョン</p>
            <span className="text-sm text-gray-400">{appVersion??'—'}</span>
          </button>
        </div>

        {devModeUnlocked&&(
          <>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2 mt-6">開発者向け</p>
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              <SettingsRow icon={<AppIcons.settings size={18}/>} iconBg="bg-gray-100" title="開発者モード" desc="検証用の状態を切り替える" onClick={()=>setSub('devMode')} isLast/>
            </div>
          </>
        )}

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
  const [weekAnchor,setWeekAnchor] = useState(todayStr());
  const [modal,setModal]         = useState<{open:boolean;task:Task|null;prefillTime?:string;prefillCategory?:string;iconSheet?:boolean}>({open:false,task:null});
  const [activeCategory,setActiveCat] = useState<string|null>(null);
  const [tabFilter,setTabFilter]       = useState<string[]>([]);
  const [showTabFilter,setShowTabFilter] = useState(false);
  const [customTabs,setCustomTabs]   = useState<CustomTab[]>([]);
  const [editTabId,setEditTabId]     = useState<string|null>(null);
  const [editTabName,setEditTabName] = useState('');
  const [settingsOpen,setSOp]    = useState(false);
  const [settingsInitSub,setSettingsInitSub] = useState<string|undefined>(undefined);
  const [colorPickTarget,setColorPickTarget] = useState<'wake'|'sleep'|null>(null);
  const [calendarOpen,setCalOp]  = useState(false);
  const [searchOpen,setSearchOpen] = useState(false);
  const [activeTab,setActiveTab] = useState<'later'|'shop'|null>(null);
  const [loaded,setLoaded]       = useState(false);
  const [now,setNow]             = useState(nowStr());
  const [touchY,setTouchY]       = useState(0);
  const [dragTask,setDragTask]   = useState<Task|null>(null);
  const [dragPos,setDragPos]     = useState({x:0,y:0});
  const [dropTime,setDropTime]   = useState<string|null>(null);
  const mainRef = useRef<HTMLElement|null>(null);
  const mainSwX = useRef(0);
  const mainSwY = useRef(0);
  const weekSwX = useRef(0);
  const weekSwY = useRef(0);
  const yToTimeRef = useRef<((clientY:number)=>string)|null>(null);
  const layoutYRef = useRef<((min:number)=>number)|null>(null);
  const dragSettingInitY   = useRef<number>(0);
  const dragSettingInitMin = useRef<number>(0);
  const [recConfirm,setRecConfirm] = useState<Task|null>(null);
  const [pendingDragMove,setPendingDragMove] = useState<{task:Task;time:string}|null>(null);
  const [editScope,setEditScope]   = useState<'one'|'all'>('one');
  const [overTrash,setOverTrash]   = useState(false);
  const [overLater,setOverLater]   = useState(false);
  const [settingConfirm,setSettingConfirm] = useState<{type:'wake'|'sleep';newTime:string}|null>(null);
  const [timePickerTarget,setTimePickerTarget] = useState<'wake'|'sleep'|null>(null);
  const [timePickerValue,setTimePickerValue] = useState('');
  const [dayOverrides,setDayOverrides] = useState<Record<string,{wakeTime?:string;sleepTime?:string}>>({});
  const [morningTasks,setMorningTasks] = useState<Task[]|null>(null);
  const [morningSelected,setMorningSel] = useState<Set<string>>(new Set());
  const morningShownRef = useRef(false);
  const [shopNotifSettings,setShopNotifSettings] = useState<ShopNotifSetting[]>([]);
  const [shopLocations,setShopLocations] = useState<ShopLocation[]>([]);
  const [forgetAlerts,setForgetAlerts] = useState<ForgetAlert[]>([]);
  const [bulkHistory,setBulkHistory] = useState<BulkHistoryEntry[]>([]);
  const [lifePatterns,setLifePatterns] = useState<LifePattern[]>([]);
  const [patternOverrides,setPatternOverrides] = useState<Record<string,string>>({});
  const [authUser,setAuthUser] = useState<AuthUser|null>(null);
  const [showTour,setShowTour] = useState(false);
  const [showWelcome,setShowWelcome] = useState(false);
  const [tourDragSignal,setTourDragSignal] = useState(0);
  const [tourTaskSavedSignal,setTourTaskSavedSignal] = useState(0);
  const [tourFocusNameSignal,setTourFocusNameSignal] = useState(0);
  const [tourFillTestNameSignal,setTourFillTestNameSignal] = useState(0);
  const [tourSampleTasks,setTourSampleTasks] = useState<Task[]>([]);
  // プロダクトツアー中だけ表示するサンプルタスク。実データ（tasks/localStorage）には
  // 一切保存せず、表示用にfilteredTasksへ合成するだけなのでツアー終了時に消せば痕跡は残らない
  useEffect(()=>{
    if(!showTour){ setTourSampleTasks([]); return; }
    const today=todayStr();
    const names=['牛乳を買う','クリーニングを受け取る','振込をする'];
    setTourSampleTasks(names.map((name,i)=>({
      id:`tour-sample-${i}`,name,startTime:null,duration:0,memo:'',icon:defaultIconKey(name),
      completed:false,date:today,isLater:true,recurrence:null,tags:[],notifications:[],subtasks:[],
    })));
  },[showTour]);
  const [showWakeSleepPrompt,setShowWakeSleepPrompt] = useState(false);
  const [wsPromptWake,setWsPromptWake] = useState('07:00');
  const [wsPromptSleep,setWsPromptSleep] = useState('23:00');
  const [appProPrompt,setAppProPrompt] = useState(false);
  const [featureUsage,setFeatureUsage] = useState<FeatureUsage|null>(null);
  const [recommendState,setRecommendState] = useState<Partial<Record<RecommendationId,RecommendationState>>>({});
  const [activeRecommendation,setActiveRecommendation] = useState<RecommendationId|null>(null);
  const featureUsageRef = useRef<FeatureUsage|null>(null);
  const recommendStateRef = useRef<Partial<Record<RecommendationId,RecommendationState>>>({});
  const recommendPickedRef = useRef(false);
  const { isPremium } = usePremium();
  const { tr, language } = useI18n();

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
      const sl=localStorage.getItem(SHOP_LOC_KEY);
      if(sl) setShopLocations(JSON.parse(sl) as ShopLocation[]);
      const fga=localStorage.getItem(FORGET_ALERTS_KEY);
      if(fga) setForgetAlerts(JSON.parse(fga) as ForgetAlert[]);
      const au=localStorage.getItem(AUTH_KEY);
      if(au) setAuthUser(JSON.parse(au) as AuthUser);
      const bh=localStorage.getItem(BULK_HIST_KEY);
      if(bh) setBulkHistory(JSON.parse(bh) as BulkHistoryEntry[]);
      const lp=localStorage.getItem(LIFE_PATTERNS_KEY);
      if(lp) setLifePatterns(JSON.parse(lp) as LifePattern[]);
      const po=localStorage.getItem(PATTERN_OVERRIDES_KEY);
      if(po) setPatternOverrides(JSON.parse(po) as Record<string,string>);
      const fu=localStorage.getItem(FEATURE_USAGE_KEY);
      setFeatureUsage(fu?JSON.parse(fu) as FeatureUsage:{installedAt:new Date().toISOString()});
      const rs=localStorage.getItem(RECOMMEND_STATE_KEY);
      if(rs) setRecommendState(JSON.parse(rs) as Partial<Record<RecommendationId,RecommendationState>>);
    }catch{}
    setLoaded(true);
    if(!localStorage.getItem(TOUR_COMPLETED_KEY)){
      // setTimeoutで遅延させると、loaded=trueになった直後からこのタイマーが発火するまでの間、
      // ウェルカム画面より先にタイムライン本体が一瞬見えてしまう不具合があった（初回起動時は
      // 裏に見せるべき既存のタイムラインが存在しないため、この一瞬の表示が特に目立つ）。
      // loadedと同じタイミングで即座にセットし、隙間なくウェルカム画面へ切り替える
      setShowWelcome(true);
    } else if(!localStorage.getItem(NOTIF_ASKED_KEY)){
      setTimeout(()=>maybeShowNotifPrompt(),800);
    } else if(!localStorage.getItem(LOCATION_ASKED_KEY)){
      setTimeout(()=>maybeShowLocPrompt(),800);
    } else if(!localStorage.getItem(WAKESLEEP_ASKED_KEY)){
      maybeShowWakeSleepPrompt();
    }
  },[]);

  useEffect(()=>{ if(loaded) localStorage.setItem(TASKS_KEY,JSON.stringify(tasks)); },[tasks,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings)); },[settings,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(SHOP_KEY,JSON.stringify(shopItems)); },[shopItems,loaded]);
  useEffect(()=>{
    if(!loaded) return;
    const today=todayStr();
    const nextTasks=tasks
      .filter(t=>!t.completed && !t.isLater && t.date===today && t.startTime && t.startTime>=now)
      .sort((a,b)=>(a.startTime! < b.startTime! ? -1 : 1))
      .slice(0,6)
      .map(t=>({id:t.id,name:t.name,time:t.startTime!,icon:t.icon||defaultIconKey(t.name)}));
    const shopList=shopItems.filter(s=>!s.checked).slice(0,10).map(s=>({id:s.id,name:s.name}));
    const laterList=tasks.filter(t=>t.isLater&&!t.completed).slice(0,7).map(t=>({id:t.id,name:t.name,icon:t.icon||defaultIconKey(t.name)}));
    const themeColor=THEMES.find(th=>th.id===(settings.theme??'mint'))?.color??'#94CFC8';
    updateWidgetData(nextTasks,shopList,laterList,themeColor);
  },[tasks,shopItems,now,loaded,settings.theme]);
  useEffect(()=>{
    if(!loaded) return;
    const applyPending=async()=>{
      const {completedTaskIds,purchasedShopItemIds}=await getPendingWidgetActions();
      if(completedTaskIds.length>0){
        setTasks(prev=>prev.map(t=>completedTaskIds.includes(t.id)?{...t,completed:true}:t));
      }
      if(purchasedShopItemIds.length>0){
        setShopItems(prev=>prev.map(s=>purchasedShopItemIds.includes(s.id)?{...s,checked:true,purchasedAt:new Date().toISOString()}:s));
      }
      const {shouldOpenShop,shouldOpenLater,notificationOpened}=await getPendingGeofenceAction();
      if(shouldOpenShop) setActiveTab('shop');
      if(shouldOpenLater) setActiveTab('later');
      if(notificationOpened) logAnalyticsEvent('notification_opened');
      // バックグラウンド中に場所到着で発火済みになったタスクのlocationNotifyをオフにする
      // （場所通知は1タスク1回のみのため。時間通知とは独立しており、時間通知が別途発火しても
      // 互いに解除し合わない仕様）
      const firedIds=await getFiredTaskLocationIds();
      if(firedIds.length>0){
        setTasks(prev=>prev.map(t=>firedIds.includes(t.id)?{...t,locationNotify:false,location:undefined}:t));
        // 「あとでやる」タスクの場所通知は到着時（didEnterRegion）にfiredフラグが立つため、
        // タップの有無に関わらず実際に発火したタイミングを正確に計測できる
        firedIds.forEach(()=>logAnalyticsEvent('location_reminder_triggered',{type:'task'}));
      }
    };
    applyPending();
    const onVisible=()=>{ if(document.visibilityState==='visible') applyPending(); };
    document.addEventListener('visibilitychange',onVisible);
    return ()=>document.removeEventListener('visibilitychange',onVisible);
  },[loaded]);
  useEffect(()=>{
    if(!loaded||!isNative()) return;
    // ウィジェットの「あとでやるを追加」ボタン（brainbox://addLater というLink）から
    // アプリが開かれた時に、あとでやるタブ＋新規作成モーダルを自動で開く
    const handle=CapApp.addListener('appUrlOpen',data=>{
      if(data.url.includes('addLater')){ setActiveTab('later'); openAdd(); }
    });
    return ()=>{ handle.then(h=>h.remove()); };
  },[loaded]);
  useEffect(()=>{
    if(!loaded) return;
    const hours=settings.appInactivityHours??6;
    if(hours<=0){ cancelInactivityReminder(); return; }
    const onVisibilityChange=()=>{
      if(document.visibilityState==='hidden'){
        if(settings.notificationsEnabled??true){
          // 就寝中に設定時間が経過してしまう場合、起床時刻ちょうどに即通知するのではなく、
          // 起床時刻を起点として改めて設定時間分カウントし直す（就寝中はカウントが止まるイメージ）。
          // 以降の再通知（STALE_REPEAT_HOURSごと）はこの基準時刻からの固定間隔で予約する
          const nowMs=Date.now();
          const rawBaseMs=nowMs+hours*3600*1000;
          const baseFireMs=adjustFireForSleep(rawBaseMs,hours,settings.wakeTime,settings.sleepTime);
          const hoursList:number[]=[];
          for(let i=0;i<STALE_MAX_REPEATS;i++){
            const fireMs=baseFireMs+i*STALE_REPEAT_HOURS*3600000;
            hoursList.push((fireMs-nowMs)/3600000);
          }
          scheduleInactivityReminder(hoursList);
        }
      } else {
        cancelInactivityReminder();
      }
    };
    document.addEventListener('visibilitychange',onVisibilityChange);
    return ()=>document.removeEventListener('visibilitychange',onVisibilityChange);
  },[loaded,settings.appInactivityHours,settings.notificationsEnabled,settings.wakeTime,settings.sleepTime]);
  useEffect(()=>{ if(loaded) localStorage.setItem(TAGS_KEY,JSON.stringify(globalTags)); },[globalTags,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(HISTORY_KEY,JSON.stringify(moveHistory)); },[moveHistory,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(CUSTOM_TABS_KEY,JSON.stringify(customTabs)); },[customTabs,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(SHOP_NOTIF_KEY,JSON.stringify(shopNotifSettings)); },[shopNotifSettings,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(SHOP_LOC_KEY,JSON.stringify(shopLocations)); },[shopLocations,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(FORGET_ALERTS_KEY,JSON.stringify(forgetAlerts)); },[forgetAlerts,loaded]);
  useEffect(()=>{
    if(!loaded) return;
    const activeTaskLocCount=tasks.filter(t=>!t.completed&&t.locationNotify&&t.location).length;
    const enabledForgetCount=forgetAlerts.filter(a=>a.enabled).length;
    const budget=Math.max(0,MAX_MONITORED_REGIONS-activeTaskLocCount-enabledForgetCount);
    const shopLocs=shopLocations.filter(l=>l.enabled).slice(0,budget);
    setShopGeofences(shopLocs.map(l=>({id:l.id,name:l.name,lat:l.lat,lng:l.lng,radius:l.radius})));
  },[shopLocations,tasks,forgetAlerts,loaded]);
  // 「あとでやる」タスクの場所通知。タイムラインにドロップされて時間指定タスクになっても
  // （isLaterがfalseになっても）locationNotifyは維持され続けるので isLater では絞り込まない。
  // 完了・削除したタスクは tasks から外れる（または completed になる）ことで自動的に解除される
  useEffect(()=>{
    if(!loaded) return;
    const enabledShopCount=shopLocations.filter(l=>l.enabled).length;
    const enabledForgetCount=forgetAlerts.filter(a=>a.enabled).length;
    const budget=Math.max(0,MAX_MONITORED_REGIONS-enabledShopCount-enabledForgetCount);
    const locTasks=tasks.filter(t=>!t.completed&&t.locationNotify&&t.location).slice(0,budget);
    setTaskLocationGeofences(locTasks.map(t=>({id:t.id,name:t.name,lat:t.location!.lat,lng:t.location!.lng,radius:TASK_LOCATION_RADIUS_M})));
  },[tasks,shopLocations,forgetAlerts,loaded]);
  // 忘れ物防止アラート（PRO機能）。「あとでやる」とは独立した機能。買い物リストの場所通知・
  // タスクの場所通知と同じCLLocationManagerの監視上限（20件）を共有するため予算を分け合う
  useEffect(()=>{
    if(!loaded) return;
    const enabledShopCount=shopLocations.filter(l=>l.enabled).length;
    const activeTaskLocCount=tasks.filter(t=>!t.completed&&t.locationNotify&&t.location).length;
    const budget=Math.max(0,MAX_MONITORED_REGIONS-enabledShopCount-activeTaskLocCount);
    const alerts=forgetAlerts.filter(a=>a.enabled).slice(0,budget);
    setForgetAlertGeofences(alerts.map(a=>({
      id:a.id,name:a.name,lat:a.location.lat,lng:a.location.lng,radius:a.radius??TASK_LOCATION_RADIUS_M,
      trigger:a.trigger??'exit',weekdays:a.weekdays,timeStart:a.timeStart||'',timeEnd:a.timeEnd||'',items:a.items,
    })));
  },[forgetAlerts,shopLocations,tasks,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(DAY_SETTINGS_KEY,JSON.stringify(dayOverrides)); },[dayOverrides,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(BULK_HIST_KEY,JSON.stringify(bulkHistory)); },[bulkHistory,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(LIFE_PATTERNS_KEY,JSON.stringify(lifePatterns)); },[lifePatterns,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(PATTERN_OVERRIDES_KEY,JSON.stringify(patternOverrides)); },[patternOverrides,loaded]);
  useEffect(()=>{ if(loaded&&featureUsage) localStorage.setItem(FEATURE_USAGE_KEY,JSON.stringify(featureUsage)); },[featureUsage,loaded]);
  useEffect(()=>{ if(loaded) localStorage.setItem(RECOMMEND_STATE_KEY,JSON.stringify(recommendState)); },[recommendState,loaded]);
  useEffect(()=>{ featureUsageRef.current=featureUsage; },[featureUsage]);
  useEffect(()=>{ recommendStateRef.current=recommendState; },[recommendState]);
  // 未使用の機能を検知して featureUsage に記録する（一度記録したら上書きしない）
  useEffect(()=>{
    if(!loaded||!featureUsage) return;
    const nowIso=new Date().toISOString();
    setFeatureUsage(prev=>{
      if(!prev) return prev;
      let changed=false;
      const next={...prev};
      if(!next.shoppingListUsedAt&&shopItems.length>0){ next.shoppingListUsedAt=nowIso; changed=true; }
      if(!next.locationReminderUsedAt&&shopLocations.length>0){ next.locationReminderUsedAt=nowIso; changed=true; }
      if(!next.repeatTaskUsedAt&&tasks.some(t=>t.recurrence)){ next.repeatTaskUsedAt=nowIso; changed=true; }
      return changed?next:prev;
    });
  },[loaded,featureUsage,shopItems,shopLocations,tasks]);
  useEffect(()=>{ const iv=setInterval(()=>setNow(nowStr()),60000); return ()=>clearInterval(iv); },[]);
  useEffect(()=>{
    const t=THEMES.find(th=>th.id===(settings.theme??'mint'));
    const hex=t?.color??'#94CFC8';
    document.documentElement.style.setProperty('--c-primary',hex);
    const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
    document.documentElement.style.setProperty('--c-primary-dark',`rgb(${Math.round(r*0.82)},${Math.round(g*0.82)},${Math.round(b*0.82)})`);
  },[settings.theme]);

  const handleAppleSignIn=async():Promise<void>=>{
    try{
      const apple=(window as {AppleID?:{auth:{init:(c:object)=>void;signIn:()=>Promise<{authorization:{id_token:string;code:string};user?:{name?:{firstName?:string;lastName?:string};email?:string}}>}}}).AppleID;
      if(!apple) return;
      apple.auth.init({clientId:'com.tohoku-mamoru.app',scope:'name email',redirectURI:window.location.origin,usePopup:true});
      const res=await apple.auth.signIn();
      const token=res.authorization.id_token;
      const payload=JSON.parse(atob(token.split('.')[1]));
      const uid=payload.sub as string;
      const email=res.user?.email||payload.email as string|undefined;
      const firstName=res.user?.name?.firstName||'';
      const lastName=res.user?.name?.lastName||'';
      const displayName=[lastName,firstName].filter(Boolean).join(' ')||undefined;
      const au:AuthUser={uid,email,displayName};
      setAuthUser(au);
      localStorage.setItem(AUTH_KEY,JSON.stringify(au));
    }catch(e){console.error('Apple sign in failed:',e);}
  };

  const handleSignOut=():void=>{
    setAuthUser(null);
    localStorage.removeItem(AUTH_KEY);
  };

  const maybeShowProductTour=()=>{
    if(localStorage.getItem(TOUR_COMPLETED_KEY)){ maybeShowNotifPrompt(); return; }
    setTimeout(()=>setShowWelcome(true),600);
  };
  // 起床・就寝設定は導線の最後（通知・位置情報許可の後）に確認する
  const maybeShowWakeSleepPrompt=()=>{
    if(localStorage.getItem(WAKESLEEP_ASKED_KEY)) return;
    setWsPromptWake(settings.wakeTime);
    setWsPromptSleep(settings.sleepTime);
    setShowWakeSleepPrompt(true);
  };
  // 通知・位置情報の許可は、プロダクトツアーを体験して価値が伝わった後に求める
  // （アプリに触る前だと拒否されやすいため。ツアー完了時に呼ばれる）。
  // BrainBox独自の説明ポップアップは挟まず、Apple純正の許可ダイアログをそのまま順番に出す。
  // requestNotifyPermission/ensureGeofencePermissionの完了を待ってから次に進むことで、
  // 「通知許可→位置情報許可」の順序をダイアログの表示タイミングレベルで保証している
  const maybeShowNotifPrompt=()=>{
    if(localStorage.getItem(NOTIF_ASKED_KEY)){ maybeShowLocPrompt(); return; }
    localStorage.setItem(NOTIF_ASKED_KEY,'1');
    setSettings(s=>({...s,notificationsEnabled:true}));
    requestNotifyPermission('onboarding').finally(()=>maybeShowLocPrompt());
  };
  const maybeShowLocPrompt=()=>{
    if(localStorage.getItem(LOCATION_ASKED_KEY)){ maybeShowWakeSleepPrompt(); return; }
    localStorage.setItem(LOCATION_ASKED_KEY,'1');
    ensureGeofencePermission('onboarding').finally(()=>maybeShowWakeSleepPrompt());
  };
  const dismissWakeSleepPrompt=()=>{
    localStorage.setItem(WAKESLEEP_ASKED_KEY,'1');
    setShowWakeSleepPrompt(false);
  };
  const confirmWakeSleepPrompt=()=>{
    setSettings(s=>({...s,wakeTime:wsPromptWake,sleepTime:wsPromptSleep}));
    dismissWakeSleepPrompt();
  };

  const showRecommendation=(id:RecommendationId)=>{
    const nowIso=new Date().toISOString();
    setFeatureUsage(prev=>prev?{...prev,lastRecommendationShownAt:nowIso}:prev);
    setRecommendState(prev=>{
      const cur=prev[id]??{shownCount:0};
      return {...prev,[id]:{...cur,shownCount:cur.shownCount+1,lastShownAt:nowIso}};
    });
    setActiveRecommendation(id);
  };
  const dismissRecommendation=()=>{
    if(activeRecommendation){
      const id=activeRecommendation;
      const nowIso=new Date().toISOString();
      setRecommendState(prev=>{
        const cur=prev[id]??{shownCount:1};
        return {...prev,[id]:{...cur,dismissedAt:nowIso}};
      });
    }
    setActiveRecommendation(null);
  };
  const useRecommendation=()=>{
    const id=activeRecommendation;
    setActiveRecommendation(null);
    if(id==='shoppingList'){ setActiveTab('shop'); }
    else if(id==='locationReminder'){ setSettingsInitSub('notifications-shop'); setSOp(true); }
    else if(id==='repeatTask'){ openAdd(); }
  };

  // 起動から一定時間が経ったタイミングで、未使用の機能を1つだけ提案する
  // （インストールから3日以上・前回のおすすめ表示から2日以上・却下から7日以上・表示は最大2回まで）
  useEffect(()=>{
    if(!loaded||showTour||!featureUsage||recommendPickedRef.current) return;
    const timer=setTimeout(async()=>{
      if(recommendPickedRef.current) return;
      const fu=featureUsageRef.current;
      if(!fu) return;
      const nowMs=Date.now();
      if(daysBetween(new Date(fu.installedAt).getTime(),nowMs)<3) return;
      if(fu.lastRecommendationShownAt&&daysBetween(new Date(fu.lastRecommendationShownAt).getTime(),nowMs)<2) return;
      const rs=recommendStateRef.current;
      for(const def of RECOMMENDATION_DEFS){
        if(fu[def.usedKey]) continue;
        const state=rs[def.id];
        if(state){
          if(state.shownCount>=2) continue;
          if(state.dismissedAt&&daysBetween(new Date(state.dismissedAt).getTime(),nowMs)<7) continue;
        }
        if(def.requiresLocationPermission){
          const status=await checkGeofencePermissions();
          if(status.location==='denied') continue;
        }
        recommendPickedRef.current=true;
        showRecommendation(def.id);
        return;
      }
    },6000);
    return ()=>clearTimeout(timer);
  },[loaded,featureUsage]);

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
      const past2=tasks.filter(t=>!t.completed&&!t.isLater&&!!t.startTime&&!t.recurrence&&t.date===shiftDate(today,-1));
      if(past2.length>0) notify('昨日のタスクが残っています',`昨日のタスクが${past2.length}件残っています`);
    }
    if(morningShownRef.current) return;
    const yesterday=shiftDate(today,-1);
    const past=tasks.filter(t=>!t.completed&&!t.isLater&&!!t.startTime&&!t.recurrence&&t.date===yesterday);
    if(past.length===0) return;
    morningShownRef.current=true;
    setMorningTasks(past);
    setMorningSel(new Set());
  },[loaded,tasks,settings.wakeTime,now]);

  // 買い物リスト通知 — ネイティブでは syncShopNotifs の事前予約が発火を担うため、
  // ここは常時フォアグラウンドが前提のWeb/開発環境向けフォールバックとしてのみ動作する
  useEffect(()=>{
    if(!loaded||shopNotifSettings.length===0||isNative()) return;
    const dow=new Date().getDay();
    const nowM=toMin(now);
    shopNotifSettings.forEach(s=>{
      if(!s.enabled||!s.days.includes(dow)||toMin(s.time)!==nowM) return;
      const key=`tl-shop-notif-fired-${s.id}-${todayStr()}`;
      if(localStorage.getItem(key)) return;
      const pending=shopItems.filter(i=>!i.checked);
      if(pending.length===0) return;
      localStorage.setItem(key,'1');
      const names=pending.slice(0,3).map(i=>i.name).join('・')+(pending.length>3?'…':'');
      notify('買い物リスト',`未購入 ${pending.length}件: ${names}`);
    });
  },[loaded,now,shopNotifSettings,shopItems]);

  // 買い物リストの時間指定通知をネイティブに事前スケジュール（バックグラウンド/未起動でも発火させるため）。
  // 直近7日分の該当曜日をまとめて予約する（tasks/shopItems変更のたびに現在の未購入内容で再計算される）
  useEffect(()=>{
    if(!loaded||!isNative()) return;
    if(shopNotifSettings.length===0){ syncShopNotifs([]); return; }
    const pending=shopItems.filter(i=>!i.checked);
    if(pending.length===0){ syncShopNotifs([]); return; }
    const names=pending.slice(0,3).map(i=>i.name).join('・')+(pending.length>3?'…':'');
    const body=`未購入 ${pending.length}件: ${names}`;
    const nowMs=Date.now();
    const alerts:{id:string;title:string;body:string;timestamp:number;openShop?:boolean}[]=[];
    shopNotifSettings.forEach(s=>{
      if(!s.enabled) return;
      for(let d=0;d<7;d++){
        const dt=new Date();
        dt.setDate(dt.getDate()+d);
        if(!s.days.includes(dt.getDay())) continue;
        const [hh,mm]=s.time.split(':').map(Number);
        dt.setHours(hh,mm,0,0);
        if(dt.getTime()<=nowMs) continue;
        alerts.push({id:`shop-notif-${s.id}-${d}`,title:'買い物リスト',body,timestamp:Math.floor(dt.getTime()/1000),openShop:true});
      }
    });
    syncShopNotifs(alerts);
  },[loaded,now,shopNotifSettings,shopItems]);

  // 起床時間にアプリを開くよう促す通知（前日の未完了タスクがあれば1つにまとめる）— ネイティブでは
  // syncWakeCheckins の事前予約が発火を担うため、ここは常時フォアグラウンドが前提のWeb/開発環境向けフォールバックとしてのみ動作する
  useEffect(()=>{
    if(!loaded||!(settings.notificationsEnabled??true)||isNative()) return;
    const today=todayStr();
    if(toMin(now)!==toMin(settings.wakeTime)) return;
    if(localStorage.getItem(WAKE_CHECKIN_NOTIF_KEY)===today) return;
    localStorage.setItem(WAKE_CHECKIN_NOTIF_KEY,today);
    const past=tasks.filter(t=>!t.completed&&!t.isLater&&!!t.startTime&&!t.recurrence&&t.date===shiftDate(today,-1));
    const body=past.length>0?`今日の予定をチェックしましょう。昨日のタスクが${past.length}件残っています`:'今日の予定をチェックしましょう';
    notify('おはようございます',body);
  },[loaded,now,tasks,settings.wakeTime,settings.notificationsEnabled]);

  // 起床時チェックイン通知をネイティブに事前スケジュール（バックグラウンド/未起動でも発火させるため）。
  // 直近7日分の起床時刻をまとめて予約する。当日分のみ「昨日の未完了タスク件数」を反映し、
  // それ以降の日は未来の状態が分からないため一般的な文言にする
  useEffect(()=>{
    if(!loaded||!isNative()) return;
    if(!(settings.notificationsEnabled??true)){ syncWakeCheckins([]); return; }
    const wakeM=toMin(settings.wakeTime);
    const nowMs=Date.now();
    const alerts:{id:string;title:string;body:string;timestamp:number}[]=[];
    for(let d=0;d<7;d++){
      const dt=new Date();
      dt.setDate(dt.getDate()+d);
      dt.setHours(Math.floor(wakeM/60),wakeM%60,0,0);
      if(dt.getTime()<=nowMs) continue;
      let body='今日の予定をチェックしましょう';
      if(d===0){
        const yesterday=shiftDate(todayStr(),-1);
        const past=tasks.filter(t=>!t.completed&&!t.isLater&&!!t.startTime&&!t.recurrence&&t.date===yesterday);
        if(past.length>0) body=`今日の予定をチェックしましょう。昨日のタスクが${past.length}件残っています`;
      }
      alerts.push({id:`wake-checkin-${d}`,title:'おはようございます',body,timestamp:Math.floor(dt.getTime()/1000)});
    }
    syncWakeCheckins(alerts);
  },[loaded,now,tasks,settings.wakeTime,settings.notificationsEnabled]);

  // タスクごとのアラート（開始時・何分前・前日）— ネイティブでは syncTaskAlerts の事前予約が発火を担うため、
  // ここは常時フォアグラウンドが前提のWeb/開発環境向けフォールバックとしてのみ動作する
  useEffect(()=>{
    if(!loaded||!(settings.notificationsEnabled??true)||isNative()) return;
    const nowMinuteMs=Math.floor(Date.now()/60000)*60000;
    let firedKeys:string[]=[];
    try{ firedKeys=JSON.parse(localStorage.getItem(TASK_ALERT_FIRED_KEY)||'[]'); }catch{}
    const newFired:string[]=[];
    const toFire:{task:Task;offset:number}[]=[];
    tasks.forEach(t=>{
      if(t.completed||t.isLater||!t.startTime||!t.date||!t.notifications?.length) return;
      const startMs=new Date(`${t.date}T${t.startTime}:00`).getTime();
      t.notifications.forEach(m=>{
        const alertMinuteMs=Math.floor((startMs-m*60000)/60000)*60000;
        if(alertMinuteMs!==nowMinuteMs) return;
        const key=`${t.id}:${m}:${t.date}`;
        if(firedKeys.includes(key)) return;
        toFire.push({task:t,offset:m});
        newFired.push(key);
      });
    });
    if(toFire.length===0) return;
    localStorage.setItem(TASK_ALERT_FIRED_KEY,JSON.stringify([...firedKeys,...newFired].slice(-500)));
    toFire.forEach(({task,offset})=>{
      notify(task.name,taskAlertBody(task.startTime!,offset));
    });
  },[loaded,now,tasks,settings.notificationsEnabled]);

  // タスクごとのアラートをネイティブに事前スケジュール（バックグラウンド/未起動でも発火させるため）。
  // iOSは同時に予約できるローカル通知が最大64件までのため、直近60件に絞って予約する
  // （手前のアラートが消化されれば次回実行時に自動で繰り上がる）
  useEffect(()=>{
    if(!loaded||!isNative()) return;
    if(!(settings.notificationsEnabled??true)){ syncTaskAlerts([]); return; }
    const nowMs=Date.now();
    const alerts:{id:string;title:string;body:string;timestamp:number}[]=[];
    tasks.forEach(t=>{
      if(t.completed||t.isLater||!t.startTime||!t.date||!t.notifications?.length) return;
      const startMs=new Date(`${t.date}T${t.startTime}:00`).getTime();
      t.notifications.forEach(m=>{
        const fireMs=startMs-m*60000;
        if(fireMs<=nowMs) return;
        alerts.push({
          id:`task-alert-${t.id}-${m}`,
          title:t.name,
          body:taskAlertBody(t.startTime!,m),
          timestamp:Math.floor(fireMs/1000),
        });
      });
    });
    alerts.sort((a,b)=>a.timestamp-b.timestamp);
    syncTaskAlerts(alerts.slice(0,60));
  },[loaded,now,tasks,settings.notificationsEnabled]);

  // 締切管理（PRO機能）の通知 — ネイティブでは syncDeadlineAlerts の事前予約が発火を担うため、
  // ここは常時フォアグラウンドが前提のWeb/開発環境向けフォールバックとしてのみ動作する
  useEffect(()=>{
    if(!loaded||!(settings.notificationsEnabled??true)||isNative()) return;
    const nowMinuteMs=Math.floor(Date.now()/60000)*60000;
    let firedKeys:string[]=[];
    try{ firedKeys=JSON.parse(localStorage.getItem(DEADLINE_ALERT_FIRED_KEY)||'[]'); }catch{}
    const newFired:string[]=[];
    const toFire:{task:Task;fire:DeadlineFire}[]=[];
    tasks.forEach(t=>{
      if(t.completed||!t.deadlineAt||!t.deadlineNotify) return;
      computeDeadlineFires(t.deadlineAt,t.deadlineNotify).forEach(fire=>{
        const fireMinuteMs=Math.floor(fire.fireMs/60000)*60000;
        if(fireMinuteMs!==nowMinuteMs) return;
        const key=`${t.id}:${fire.key}`;
        if(firedKeys.includes(key)) return;
        toFire.push({task:t,fire});
        newFired.push(key);
      });
    });
    if(toFire.length===0) return;
    localStorage.setItem(DEADLINE_ALERT_FIRED_KEY,JSON.stringify([...firedKeys,...newFired].slice(-500)));
    toFire.forEach(({task,fire})=>{
      notify(task.name,deadlineAlertBody(task.name,fire));
    });
  },[loaded,now,tasks,settings.notificationsEnabled]);

  // 締切管理（PRO機能）の通知をネイティブに事前スケジュール（バックグラウンド/未起動でも発火させるため）
  useEffect(()=>{
    if(!loaded||!isNative()) return;
    if(!(settings.notificationsEnabled??true)){ syncDeadlineAlerts([]); return; }
    const nowMs=Date.now();
    const alerts:{id:string;title:string;body:string;timestamp:number}[]=[];
    tasks.forEach(t=>{
      if(t.completed||!t.deadlineAt||!t.deadlineNotify) return;
      computeDeadlineFires(t.deadlineAt,t.deadlineNotify).forEach(fire=>{
        if(fire.fireMs<=nowMs) return;
        alerts.push({
          id:`deadline-${t.id}-${fire.key}`,
          title:t.name,
          body:deadlineAlertBody(t.name,fire),
          timestamp:Math.floor(fire.fireMs/1000),
        });
      });
    });
    alerts.sort((a,b)=>a.timestamp-b.timestamp);
    syncDeadlineAlerts(alerts.slice(0,60));
  },[loaded,now,tasks,settings.notificationsEnabled]);

  // 「あとでやる」に長時間放置されているタスクの通知 — ネイティブでは syncLaterStaleAlerts の
  // 事前予約が発火を担うため、ここは常時フォアグラウンドが前提のWeb/開発環境向けフォールバックとしてのみ動作する
  useEffect(()=>{
    if(!loaded||!(settings.notificationsEnabled??true)||isNative()) return;
    const hours=settings.laterReminderHours??72;
    if(hours<=0) return;
    if(inSleepWindow(toMin(now),toMin(settings.wakeTime),toMin(settings.sleepTime))) return;
    const thresholdMs=hours*3600*1000;
    const nowTs=Date.now();
    let notifiedKeys:string[]=[];
    try{ notifiedKeys=JSON.parse(localStorage.getItem(LATER_NOTIFIED_KEY)||'[]'); }catch{}
    const stale=tasks.filter(t=>t.isLater&&!t.completed&&t.laterSince
      &&(nowTs-new Date(t.laterSince).getTime())>=thresholdMs
      &&!notifiedKeys.includes(`${t.id}:${t.laterSince}`));
    if(stale.length===0) return;
    localStorage.setItem(LATER_NOTIFIED_KEY,JSON.stringify([...notifiedKeys,...stale.map(t=>`${t.id}:${t.laterSince}`)]));
    const names=stale.slice(0,3).map(t=>t.name).join('・')+(stale.length>3?'…':'');
    notify('あとでやるが溜まっています',`${stale.length}件が長時間放置されています: ${names}`);
  },[loaded,now,tasks,settings.notificationsEnabled,settings.laterReminderHours,settings.wakeTime,settings.sleepTime]);

  // 「あとでやる」放置タスクの通知をネイティブに事前スケジュール（バックグラウンド/未起動でも発火させるため）。
  // タスクごとにlaterSince+設定時間の絶対時刻で予約し、就寝時間帯に重なる場合は起床時刻まで後ろ倒しする。
  // タスクが完了していなければSTALE_REPEAT_HOURSごとに最大STALE_MAX_REPEATS回まで再通知する
  useEffect(()=>{
    if(!loaded||!isNative()) return;
    const hours=settings.laterReminderHours??72;
    if(!(settings.notificationsEnabled??true)||hours<=0){ syncLaterStaleAlerts([]); return; }
    const nowMs=Date.now();
    const alerts:{id:string;title:string;body:string;timestamp:number}[]=[];
    tasks.forEach(t=>{
      if(!t.isLater||t.completed||!t.laterSince) return;
      const baseMs=new Date(t.laterSince).getTime()+hours*3600*1000;
      let lastFireMs=-1;
      for(let i=0;i<STALE_MAX_REPEATS;i++){
        const rawFireMs=baseMs+i*STALE_REPEAT_HOURS*3600000;
        if(rawFireMs<=nowMs) continue;
        const fireMs=adjustFireForSleep(rawFireMs,hours,settings.wakeTime,settings.sleepTime);
        // 就寝時間帯を挟むSTALE_REPEAT_HOURS間隔の複数回が同じ起床時刻に後ろ倒しされると、
        // 同じタスクについて全く同じ内容の通知が同時刻に重複してしまうため、直前と同じ時刻ならスキップする
        if(fireMs===lastFireMs) continue;
        lastFireMs=fireMs;
        alerts.push({id:`later-stale-${t.id}-${i}`,title:'あとでやるが溜まっています',body:`「${t.name}」が長時間放置されています`,timestamp:Math.floor(fireMs/1000)});
      }
    });
    syncLaterStaleAlerts(alerts.slice(0,60));
  },[loaded,tasks,settings.laterReminderHours,settings.notificationsEnabled,settings.wakeTime,settings.sleepTime]);

  // 空き時間が5分続いたら「あとでやる」タスクの消化を提案
  // ネイティブでは syncFreeSlotAlerts の事前予約が発火を担うため、
  // ここは常時フォアグラウンドが前提のWeb/開発環境向けフォールバックとしてのみ動作する
  useEffect(()=>{
    if(!loaded||!(settings.notificationsEnabled??true)||isNative()) return;
    const laterPool=tasks.filter(t=>t.isLater&&!t.completed);
    if(laterPool.length===0) return;
    const today=todayStr();
    const nowM=toMin(now);
    const slots=calcFreeSlots(tasks,today,settings);
    const activeSlot=slots.find(sl=>nowM>=toMin(sl.start)+5&&nowM<toMin(sl.end));
    if(!activeSlot) return;
    const key=`tl-freeslot-notif-${today}-${activeSlot.start}`;
    if(localStorage.getItem(key)) return;
    localStorage.setItem(key,'1');
    const first=laterPool[0];
    const body=laterPool.length>1?`「${first.name}」など${laterPool.length}件のタスクがあります`:`「${first.name}」をやってみませんか？`;
    notify('空き時間ができました',body);
  },[loaded,now,tasks,settings,settings.notificationsEnabled]);

  // 空き時間の開始5分後をネイティブに事前スケジュール（バックグラウンド/未起動でも発火させるため）
  useEffect(()=>{
    if(!loaded||!isNative()) return;
    if(!(settings.notificationsEnabled??true)){ syncFreeSlotAlerts([]); return; }
    const laterPool=tasks.filter(t=>t.isLater&&!t.completed);
    if(laterPool.length===0){ syncFreeSlotAlerts([]); return; }
    const first=laterPool[0];
    const body=laterPool.length>1?`「${first.name}」など${laterPool.length}件のタスクがあります`:`「${first.name}」をやってみませんか？`;
    const today=todayStr();
    const nowMs=Date.now();
    const alerts=calcFreeSlots(tasks,today,settings)
      .map(sl=>({
        id:`free-slot-${today}-${sl.start}`,
        title:'空き時間ができました',
        body,
        timestamp:Math.floor((new Date(`${today}T${sl.start}:00`).getTime()+5*60000)/1000),
      }))
      .filter(a=>a.timestamp*1000>nowMs);
    syncFreeSlotAlerts(alerts);
  },[loaded,now,tasks,settings,settings.notificationsEnabled]);

  const filteredTasks = useMemo(()=>{
    // プロダクトツアー中はサンプルタスクを表示にだけ合成する（実データには保存しない）
    const source=showTour?[...tasks,...tourSampleTasks]:tasks;
    const base=activeCategory
      ?source.filter(t=>t.category===activeCategory)
      :tabFilter.length>0
        ?source.filter(t=>!(t.category&&tabFilter.includes(t.category)))
        :source.filter(t=>!t.category||customTabs.find(ct=>ct.id===t.category)?.showInAll!==false);
    return base.filter(t=>!t.allDay);
  },[tasks,activeCategory,customTabs,tabFilter,showTour,tourSampleTasks]);
  const laterTasks    = useMemo(()=>filteredTasks.filter(t=>t.isLater),[filteredTasks]);
  const pendingCount  = useMemo(()=>laterTasks.filter(t=>!t.completed).length,[laterTasks]);
  const shopPending   = useMemo(()=>shopItems.filter(i=>!i.checked).length,[shopItems]);
  const activeLocationRegionCount = useMemo(()=>
    shopLocations.filter(l=>l.enabled).length
    + tasks.filter(t=>!t.completed&&t.locationNotify&&t.location&&t.id!==modal.task?.id).length
    + forgetAlerts.filter(a=>a.enabled).length,
  [shopLocations,tasks,modal.task,forgetAlerts]);
  const weekDates     = useMemo(()=>getWeekDates(weekAnchor),[weekAnchor]);
  const taskDateSet   = useMemo(()=>new Set(filteredTasks.filter(t=>!t.isLater&&t.startTime).map(t=>t.date)),[filteredTasks]);
  const {day,month,year} = useMemo(()=>getDateInfo(date),[date]);
  const today = todayStr();

  const effectiveSettings = useMemo(()=>{
    const patId=patternOverrides[date];
    const pat=patId?lifePatterns.find(p=>p.id===patId):null;
    const ov=dayOverrides[date]??{};
    return {...settings,
      wakeTime:  ov.wakeTime  ?? pat?.wakeTime  ?? settings.wakeTime,
      sleepTime: ov.sleepTime ?? pat?.sleepTime ?? settings.sleepTime,
    };
  },[settings,dayOverrides,date,patternOverrides,lifePatterns]);

  // Drag task from あとでやる to timeline
  const startDrag=(task:Task,x:number,y:number)=>{
    setDragTask(task);
    setDragPos({x,y});
    setActiveTab(null);
  };
  const openTimePicker=(type:'wake'|'sleep')=>{
    setTimePickerValue(type==='wake'?effectiveSettings.wakeTime:effectiveSettings.sleepTime);
    setTimePickerTarget(type);
  };

  useEffect(()=>{
    if(!dragTask) return;
    const calcTime=(clientY:number)=>{
      if(yToTimeRef.current) return yToTimeRef.current(clientY);
      const header=document.querySelector('header');
      const headerBottom=header?header.getBoundingClientRect().bottom:130;
      const wakeMin=toMin(settings.wakeTime);
      const rawMin=wakeMin+(clientY+(mainRef.current?.scrollTop??0)-headerBottom-16)/PX_PER_MIN;
      const snapped=Math.round(rawMin/5)*5;
      return fromMin(Math.max(0,Math.min(24*60,snapped))%(24*60));
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
        logAnalyticsEvent('task_deleted');
      } else if(isInLater(t.clientX,t.clientY)){
        setTasks(prev=>prev.map(tk=>tk.id===dragTask.id
          ? {...tk,isLater:true,startTime:null,laterSince:tk.laterSince??new Date().toISOString()}
          : tk
        ));
      } else {
        const time=calcTime(t.clientY);
        if(dragTask.recurrence){
          setPendingDragMove({task:dragTask,time});
        } else {
          setTasks(prev=>prev.map(tk=>tk.id===dragTask.id
            ? dragTask.isLater ? {...tk,isLater:false,startTime:time,date,laterSince:undefined,notifications:tk.notifications?.length?tk.notifications:[0]} : {...tk,startTime:time}
            : tk
          ));
          logAnalyticsEvent(dragTask.isLater?'later_task_moved_to_timeline':'timeline_task_moved');
        }
      }
      setDragTask(null);
      setDropTime(null);
      setOverTrash(false);
      setOverLater(false);
      setTourDragSignal(n=>n+1);
    };
    document.addEventListener('touchmove',onMove,{passive:false});
    document.addEventListener('touchend',onEnd);
    return ()=>{
      document.removeEventListener('touchmove',onMove);
      document.removeEventListener('touchend',onEnd);
    };
  },[dragTask,settings,date]);

  const addShopItem  = (name:string) => { setShopItems(prev=>[...prev,{id:uid(),name,checked:false}]); logAnalyticsEvent('shopping_item_created'); };
  const toggleShop   = (id:string)   => setShopItems(prev=>{
    const now=Date.now();
    const target=prev.find(i=>i.id===id);
    if(target&&!target.checked) logAnalyticsEvent('shopping_item_completed');
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
  const openEditIconSheet=(task:Task)=>{
    if(task.recurrence){setRecConfirm(task);}else{setModal({open:true,task,iconSheet:true});}
  };
  const closeModal = () => setModal({open:false,task:null});

  const bulkAddTasks = (newTasks:Omit<Task,'id'>[], endTime:string) => {
    const withIds=newTasks.map(t=>({...t,id:uid()}));
    setTasks(prev=>[...prev,...withIds]);
    if(withIds.length>0){
      const entry:BulkHistoryEntry={id:uid(),name:withIds[0].name||'',startTime:withIds[0].startTime||'',endTime,dates:withIds.map(t=>t.date||'').sort(),taskIds:withIds.map(t=>t.id),registeredAt:new Date().toISOString(),icon:withIds[0].icon||'task'};
      setBulkHistory(prev=>[entry,...prev].slice(0,20));
    }
  };
  const bulkHistoryDelete = (entryId:string) => {
    const entry=bulkHistory.find(e=>e.id===entryId);
    if(entry) setTasks(prev=>prev.filter(t=>!entry.taskIds.includes(t.id)));
    setBulkHistory(prev=>prev.filter(e=>e.id!==entryId));
  };
  const bulkHistoryEdit = (entryId:string, name:string, startTime:string, endTime:string, icon:string, color:string) => {
    const entry=bulkHistory.find(e=>e.id===entryId);
    if(!entry) return;
    const t2m=(t:string)=>{const [h,m]=t.split(':').map(Number);return h*60+m;};
    const duration=Math.max(0,t2m(endTime)-t2m(startTime));
    setTasks(prev=>prev.map(t=>entry.taskIds.includes(t.id)?{...t,name,startTime,duration,icon,color}:t));
    setBulkHistory(prev=>prev.map(e=>e.id===entryId?{...e,name,startTime,endTime,icon,color}:e));
  };

  const applyPattern = (dates:string[], patternId:string|null) => {
    setPatternOverrides(prev=>{
      const next={...prev};
      dates.forEach(d=>{ if(patternId===null){delete next[d];}else{next[d]=patternId;} });
      return next;
    });
  };

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
      if(showTour&&!modal.task) setTourTaskSavedSignal(n=>n+1);
      if(!modal.task){
        logAnalyticsEvent('task_created',{mode:newTasks[0].isLater?'later':newTasks[0].recurrence?'recurring':'scheduled'});
        if(newTasks[0].isLater) logAnalyticsEvent('later_task_created');
        else if(newTasks[0].startTime) logAnalyticsEvent('timeline_task_added');
      }
      const wasTimeNotify=(modal.task?.notifications?.length??0)>0;
      const wasLocNotify=modal.task?.locationNotify??false;
      if(!wasTimeNotify&&(newTasks[0].notifications?.length??0)>0) logAnalyticsEvent('time_notification_created');
      if(!wasLocNotify&&newTasks[0].locationNotify) logAnalyticsEvent('location_notification_created');
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
    logAnalyticsEvent('task_deleted');
  };
  const toggle   = (id:string) => setTasks(prev=>{
    const target=prev.find(t=>t.id===id);
    if(target&&!target.completed) logAnalyticsEvent('task_completed');
    return prev.map(t=>t.id===id?{...t,completed:!t.completed}:t);
  });
  const scheduleInSlot=(task:Task,startTime:string)=>setModal({open:true,task:{...task,isLater:false,startTime,date,notifications:task.notifications?.length?task.notifications:[0]}});
  const moveToTimeline=(task:Task)=>setModal({open:true,task:{...task,isLater:false}});
  const handleMorningAction=(type:'done'|'later')=>{
    const ids=morningSelected;
    setTasks(prev=>prev.map(t=>{
      if(!ids.has(t.id)) return t;
      if(type==='done') return {...t,completed:true};
      return {...t,isLater:true,startTime:null,postponedCount:(t.postponedCount??0)+1,lastPostponedDate:todayStr(),laterSince:t.laterSince??new Date().toISOString()};
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

  if(!loaded) return <div className="flex h-screen items-center justify-center text-gray-400">{tr('loading')}</div>;

  return (
    <div className="max-w-md mx-auto bg-white font-sans flex flex-col" style={{height:'100%'}}>
      {/* ── Header ── */}
      <header className="z-30 bg-gray-50 flex-shrink-0" style={{paddingTop:'env(safe-area-inset-top)'}}>
        <div className="px-4 pt-1 pb-0">
          {/* Date + nav */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-2xl font-bold text-gray-900">{language==='ja'?`${year}年${month}月`:`${MONTH_NAMES_EN[month-1]} ${year}`}</span>
            <div className="flex items-center gap-1">
              <button onClick={()=>setSettings(s=>({...s,showFreeCard:!(s.showFreeCard??true)}))}
                className={`relative h-7 rounded-full text-xs font-medium transition-colors duration-200 mr-1 overflow-hidden ${(settings.showFreeCard??true)?'bg-[var(--c-primary)] text-white':'bg-gray-200 text-gray-500'}`}
                style={{width:'84px'}}>
                <span className="absolute inset-0 flex items-center justify-center" style={{paddingLeft:(settings.showFreeCard??true)?'0':'10px',paddingRight:(settings.showFreeCard??true)?'10px':'0',transition:'padding 0.2s'}}>{tr('headerFreeTimeToggle')}</span>
                <span className="absolute top-1.5 w-4 h-4 bg-white rounded-full" style={{boxShadow:'0 1px 3px rgba(0,0,0,0.2)',transition:'left 0.2s',left:(settings.showFreeCard??true)?'calc(100% - 22px)':'6px'}}/>
              </button>
              <button onClick={()=>setCalOp(true)} className="w-8 h-8 flex items-center justify-center text-gray-400"><AppIcons.calendar size={24}/></button>
              <button onClick={()=>setSearchOpen(true)} className="w-8 h-8 flex items-center justify-center text-gray-400"><AppIcons.search size={24}/></button>
              <button onClick={()=>{setSettingsInitSub(undefined);setSOp(true);}} className="w-8 h-8 flex items-center justify-center text-gray-400"><AppIcons.settings size={24}/></button>
            </div>
          </div>

          {/* Week calendar */}
          <div className="grid grid-cols-7 pt-1 pb-0.5"
            onTouchStart={e=>{weekSwX.current=e.touches[0].clientX;weekSwY.current=e.touches[0].clientY;}}
            onTouchEnd={e=>{
              const dx=e.changedTouches[0].clientX-weekSwX.current;
              const dy=e.changedTouches[0].clientY-weekSwY.current;
              if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5) setWeekAnchor(shiftDate(weekAnchor,dx<0?7:-7));
            }}>
            {DAY_NAMES.map((name,i)=>{
              const d=weekDates[i];
              const isSel=d===date, isToday=d===today;
              return (
                <button key={i} onClick={()=>{setDate(d);setWeekAnchor(d);}} className="flex flex-col items-center py-1">
                  <span className="text-[13px] font-medium text-gray-400">{language==='ja'?name:DAY_NAMES_EN[i]}</span>
                  <span className={`w-8 h-8 flex items-center justify-center rounded-full font-bold transition-colors ${isSel?'bg-[var(--c-primary)] text-white':isToday?'bg-gray-200 text-gray-900':'text-gray-600'}`} style={{fontSize:'17px'}}>
                    {new Date(d+'T12:00:00').getDate()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Category filter tabs */}
        <div className="bg-gray-50 flex items-end">
          <div className="flex-1 min-w-0 tabs-scroll flex items-end pl-3 pt-2" style={{overflowX:'auto',WebkitOverflowScrolling:'touch',overflowY:'hidden',touchAction:'pan-x'}}>
          {(()=>{const totalZ=1+customTabs.length;return(
          <button onClick={()=>{setActiveCat(null);setEditTabId(null);}} className="shrink-0 relative"
            style={activeCategory===null?{
              width:'80px',padding:'7px 12px 9px',background:'var(--c-primary)',color:'white',fontWeight:700,fontSize:'0.875rem',
              border:'none',borderRadius:'14px 14px 0 0',marginBottom:'-2px',zIndex:totalZ,
              boxShadow:'0 4px 12px rgba(0,0,0,0.10)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
            }:{
              width:'80px',padding:'5px 12px',background:'#FFFFFF',color:'#6B7280',fontWeight:600,fontSize:'0.875rem',
              border:'none',borderRadius:'14px 14px 0 0',marginBottom:'2px',zIndex:totalZ,
              boxShadow:'0 4px 10px rgba(0,0,0,0.08)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
            }}>{tr('fileTabAll')}</button>);})()}
          {customTabs.map((tab,i)=>{
            const active=activeCategory===tab.id;
            const tabZ=customTabs.length-i;
            return (
              <button key={tab.id} onClick={()=>{
                setActiveCat(active?null:tab.id);
              }} className="shrink-0 relative"
                style={active?{
                  width:'80px',padding:'7px 12px 9px',background:'var(--c-primary)',color:'white',fontWeight:700,fontSize:'0.875rem',
                  border:'none',borderRadius:'14px 14px 0 0',marginBottom:'-2px',zIndex:tabZ,
                  boxShadow:'0 4px 12px rgba(0,0,0,0.10)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                }:{
                  width:'80px',padding:'5px 12px',background:'#FFFFFF',color:'#6B7280',fontWeight:600,fontSize:'0.875rem',
                  border:'none',borderRadius:'14px 14px 0 0',marginBottom:'2px',zIndex:tabZ,
                  boxShadow:'0 4px 10px rgba(0,0,0,0.08)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                }}>{tab.name}</button>
            );
          })}
          <button onClick={()=>{setSettingsInitSub('tabs');setSOp(true);}}
            className="shrink-0 w-8 h-7 flex items-center justify-center text-gray-400 text-xl font-light ml-1 mb-0.5">+</button>
          <div className="shrink-0" style={{width:'12px'}}/>
          </div>
          {activeCategory===null&&(
            <button onClick={()=>setShowTabFilter(true)}
              className="shrink-0 w-9 h-8 flex items-center justify-center mb-1 mr-2"
              style={{color:'#9CA3AF'}}>
              <AppIcons.filter size={18}/>
            </button>
          )}
        </div>

        {/* All-day strip — sticky, aligned with timeline CARD_LEFT */}
        {(()=>{
          const allDayTasks=tasks.filter(t=>t.allDay&&t.date===date&&!t.isLater&&(activeCategory===null?(customTabs.find(ct=>ct.id===t.category)?.showInAll!==false):t.category===activeCategory));
          if(allDayTasks.length===0) return null;
          return (
            <div className="flex items-center bg-white border-b border-gray-100 py-2 gap-3" style={{paddingLeft:'12px'}}>
              <div className="flex items-center gap-1 shrink-0">
                <AppIcons.wake size={13} className="text-gray-400"/>
                <span className="text-xs text-gray-400 font-medium whitespace-nowrap">終日</span>
              </div>
              <div className="flex gap-4 overflow-x-auto flex-1 pr-3" style={{scrollbarWidth:'none',WebkitOverflowScrolling:'touch'}}>
                {allDayTasks.map(t=>(
                  <button key={t.id} onClick={()=>openEdit(t)}
                    className="inline-flex items-center gap-1.5 shrink-0">
                    <span className={`text-sm font-medium ${t.completed?'text-gray-400 line-through':'text-gray-700'}`}>{t.name}</span>
                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${t.completed?'border-[var(--c-primary)] bg-[var(--c-primary)]':'border-gray-400'}`}
                      onClick={e=>{e.stopPropagation();toggle(t.id);}}>
                      {t.completed&&<span className="w-1.5 h-1.5 rounded-full bg-white"/>}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
      </header>

      {/* ── Timeline ── */}
      <main ref={mainRef} className="px-3 pt-3 flex-1 overflow-y-auto" style={{paddingBottom:'calc(3.5rem + env(safe-area-inset-bottom))'}}
        onTouchStart={e=>{mainSwX.current=e.touches[0].clientX;mainSwY.current=e.touches[0].clientY;}}
        onTouchEnd={e=>{
          if(dragTask) return;
          const dx=e.changedTouches[0].clientX-mainSwX.current;
          const dy=e.changedTouches[0].clientY-mainSwY.current;
          if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5){const nd=shiftDate(date,dx<0?1:-1);setDate(nd);setWeekAnchor(nd);}
        }}>
        <Timeline date={date} tasks={filteredTasks} later={laterTasks} settings={effectiveSettings} now={now}
          onToggle={toggle} onEdit={openEdit} onEditIconSheet={openEditIconSheet} onSchedule={scheduleInSlot} onAddAtTime={openAdd}
          onDragStart={startDrag} dragTaskId={dragTask?.id} yToTimeRef={yToTimeRef} layoutYRef={layoutYRef} globalTags={globalTags}
          todayHistory={moveHistory.find(h=>h.date===date)} onSubtaskToggle={subtaskToggle}
          lifePatterns={lifePatterns} patternOverrides={patternOverrides}
          onPickColor={(target)=>{if(!isPremium){setAppProPrompt(true);return;}setColorPickTarget(target);}}
          onEditTime={openTimePicker}
          onOpenLater={()=>setActiveTab('later')}
          customTabs={activeCategory===null?customTabs:[]}/>
      </main>

      {/* ── Bottom bar ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 max-w-md mx-auto bg-gray-50 rounded-t-2xl"
        style={{boxShadow:'0 -4px 16px rgba(0,0,0,0.10)'}}
        onTouchStart={e=>setTouchY(e.touches[0].clientY)}
        onTouchEnd={e=>{ if(touchY-e.changedTouches[0].clientY>30) setActiveTab('later'); }}
      >
        <div className="flex">
          {([['later',tr('laterTabLabel'),pendingCount],['shop',tr('shopTabLabel'),shopPending]] as const).map(([tab,label,cnt],i)=>(
            <button key={tab} onClick={()=>setActiveTab(t=>t===tab?null:tab)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 transition-colors ${i===0?'border-r border-gray-300':''} ${activeTab===tab?'bg-gray-100':''}`}>
              <span className={`text-base font-semibold ${activeTab===tab?'text-gray-900':'text-gray-500'}`}>{label}</span>
              {cnt>0&&<span className="text-[12px] bg-[var(--c-primary)] text-white min-w-[20px] h-[20px] rounded-full flex items-center justify-center font-bold px-1">{cnt}</span>}
            </button>
          ))}
        </div>
        <div style={{height:'env(safe-area-inset-bottom)'}}/>

      </div>

      {/* ── Wake/Sleep color picker ── */}
      {colorPickTarget&&(
        <div className="fixed inset-0 z-[120] bg-black/40 flex items-end justify-center" onClick={()=>setColorPickTarget(null)}>
          <div className="bg-white w-full max-w-md rounded-t-3xl px-5 pt-5 pb-8 shadow-2xl" onClick={e=>e.stopPropagation()}>
            <div className="flex justify-center mb-4"><div className="w-10 h-1 bg-gray-200 rounded-full"/></div>
            <div className="flex items-center gap-2 mb-4">
              <p className="text-[15px] font-semibold text-gray-900">{colorPickTarget==='wake'?'起床':'就寝'}アイコンの色</p>
              <span className="bg-gray-700 text-white rounded px-1.5 leading-none" style={{fontSize:'9px',fontWeight:700,paddingTop:'3px',paddingBottom:'3px'}}>PRO</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {['#94CFC8',...TASK_COLORS.filter(Boolean)].map((c,i)=>{
                const cur=colorPickTarget==='wake'?(settings.wakeColor||'#94CFC8'):(settings.sleepColor||'#94CFC8');
                return <button key={i} onClick={()=>{setSettings(prev=>({...prev,[colorPickTarget==='wake'?'wakeColor':'sleepColor']:c}));setColorPickTarget(null);}}
                  className={`w-9 h-9 rounded-full border-2 transition-all ${cur===c?'border-gray-700 scale-110':'border-transparent'}`}
                  style={{background:c}}/>;
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Wake/Sleep time picker ── */}
      {timePickerTarget&&(
        <div className="fixed inset-0 z-[120] bg-black/40 flex items-end justify-center" onClick={()=>setTimePickerTarget(null)}>
          <div className="bg-white w-full max-w-md rounded-t-3xl px-5 pt-5 pb-10 shadow-2xl" onClick={e=>e.stopPropagation()}>
            <div className="flex justify-center mb-4"><div className="w-10 h-1 bg-gray-200 rounded-full"/></div>
            <p className="text-[15px] font-semibold text-gray-900 mb-5">{timePickerTarget==='wake'?'起床':'就寝'}時間を変更</p>
            <div className="flex items-center justify-center mb-6">
              <input type="time" value={timePickerValue} onChange={e=>setTimePickerValue(e.target.value)}
                className="text-3xl font-bold text-gray-900 border-b-2 border-gray-300 focus:border-[var(--c-primary)] outline-none bg-transparent text-center py-2"/>
            </div>
            <button onClick={()=>{
              if(timePickerValue){setSettingConfirm({type:timePickerTarget,newTime:timePickerValue});}
              setTimePickerTarget(null);
            }} className="w-full py-3.5 rounded-2xl text-[15px] font-semibold text-white" style={{background:'var(--c-primary)'}}>完了</button>
          </div>
        </div>
      )}

      {/* ── FAB ── */}
      <div className="fixed right-4 z-50" style={{bottom:'calc(3.5rem + env(safe-area-inset-bottom))'}} data-tour="fab-add">
        <button onClick={()=>openAdd()}
          className="w-14 h-14 bg-[var(--c-primary)] text-white rounded-full shadow-2xl active:bg-gray-700"
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
          shopNotifSettings={shopNotifSettings} onShopNotifSettings={setShopNotifSettings}
          shopLocations={shopLocations} onShopLocations={setShopLocations}
          isPremium={isPremium} onOpenPro={()=>{setActiveTab(null);setSettingsInitSub('premium');setSOp(true);}}
          notificationsEnabled={settings.notificationsEnabled??true}
          onEnableNotifications={()=>setSettings(s=>({...s,notificationsEnabled:true}))}/>
      )}

      {/* あとでやる FAB */}
      {activeTab==='later'&&(
        <div className="fixed right-4 z-[60]" style={{bottom:'calc(1.5rem + env(safe-area-inset-bottom))'}}>
          <button onClick={()=>{setActiveTab(null);openAdd();}}
            className="w-14 h-14 bg-[var(--c-primary)] text-white rounded-full shadow-2xl active:bg-gray-700"
            style={{display:'grid',placeItems:'center'}}><AppIcons.plus size={28} className="block"/></button>
        </div>
      )}

      {/* ── Drag overlay ── */}
      {dragTask&&(()=>{
        const wakeMinDrag=toMin(settings.wakeTime);
        const dropMinRaw=dropTime?toMin(dropTime):0;
        const adjDropMin=dropMinRaw<wakeMinDrag?dropMinRaw+1440:dropMinRaw;
        return (
        <div className="fixed inset-0 z-[70] pointer-events-none">
          {/* Drop time line */}
          {dropTime&&!overTrash&&!overLater&&(
            <div className="absolute right-0 flex items-center justify-end"
              style={{top:`${layoutYRef.current?layoutYRef.current(adjDropMin):dragPos.y}px`,left:'68px'}}>
              <span className="bg-gray-600 text-white text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 mr-2">{dropTime}</span>
            </div>
          )}
          {/* Floating card */}
          {!overTrash&&!overLater&&(
            <div style={{
              position:'absolute',
              left:`${Math.max(8,Math.min(dragPos.x-70,window.innerWidth-180))}px`,
              top:`${dragPos.y-60}px`,
              transform:'rotate(-3deg) scale(1.05)',
            }}>
              <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 px-4 py-3 w-44">
                <p className="text-sm font-bold text-gray-900 truncate">{dragTask?.name}</p>
                <p className="text-xs text-[var(--c-primary)] mt-0.5 font-semibold">{dropTime??'ドラッグして配置'}</p>
              </div>
            </div>
          )}
          {/* Bottom drop zones */}
          <div className="absolute bottom-0 left-0 right-0 h-24 flex">
            <div className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${overTrash?'bg-[#D97A7A]':'bg-red-50'}`}>
              <AppIcons.trash size={28} className={overTrash?'text-white':'text-[#D97A7A]'}/>
              <span className={`text-xs font-bold ${overTrash?'text-white':'text-[#D97A7A]'}`}>削除する</span>
            </div>
            <div className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${overLater?'bg-[var(--c-primary)]':'bg-pink-50'}`}>
              <AppIcons.postponed size={28} className={overLater?'text-white':'text-[var(--c-primary)]'}/>
              <span className={`text-xs font-bold ${overLater?'text-white':'text-[var(--c-primary)]'}`}>あとでやるに戻す</span>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── Setting time confirm popup ── */}
      {settingConfirm&&(()=>{
        const activePatId=patternOverrides[date];
        const activePat=activePatId?lifePatterns.find(p=>p.id===activePatId):null;
        const clearPattern=()=>setPatternOverrides(prev=>{const n={...prev};delete n[date];return n;});
        return(
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-end justify-center" onClick={()=>setSettingConfirm(null)}>
          <div className="bg-white w-full max-w-md rounded-t-3xl px-5 pt-6 pb-10 shadow-2xl" onClick={e=>e.stopPropagation()}>
            <p className="text-base font-bold text-gray-900 mb-1">{settingConfirm.type==='wake'?'起床':'就寝'}時間を変更</p>
            <p className="text-sm text-gray-500 mb-3">{settingConfirm.newTime} に変更します</p>
            {activePat&&(
              <div className="bg-orange-50 border border-orange-100 rounded-xl px-3 py-2.5 mb-5">
                <p className="text-xs text-orange-500 font-medium">「{activePat.name}」パターンが設定されています</p>
                <p className="text-xs text-orange-400 mt-0.5">変更するとこの日のパターンが解除されます</p>
              </div>
            )}
            {!activePat&&<div className="mb-3"/>}
            <div className="space-y-3">
              <button onClick={()=>{
                const key=settingConfirm.type==='wake'?'wakeTime':'sleepTime';
                if(activePat) clearPattern();
                setDayOverrides(prev=>({...prev,[date]:{...prev[date],[key]:settingConfirm.newTime}}));
                setSettingConfirm(null);
              }} className="w-full py-3.5 bg-gray-100 rounded-2xl text-sm font-semibold text-gray-900">{activePat?'パターンを解除してこの日だけ変更':'この日だけ変更'}</button>
              <button onClick={()=>{
                const key=settingConfirm.type==='wake'?'wakeTime':'sleepTime';
                if(activePat) clearPattern();
                setSettings(prev=>({...prev,[key]:settingConfirm.newTime}));
                setDayOverrides(prev=>{
                  const n={...prev};
                  if(n[date]){const d={...n[date]};delete d[key];if(!Object.keys(d).length)delete n[date];else n[date]=d;}
                  return n;
                });
                setSettingConfirm(null);
              }} className="w-full py-3.5 bg-[var(--c-primary)] rounded-2xl text-sm font-semibold text-white">他の日も全部この時間に変更</button>
              <button onClick={()=>setSettingConfirm(null)} className="w-full py-2.5 text-sm text-gray-400 font-semibold">キャンセル</button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── Week Icon View ── */}

      {/* ── Calendar ── */}
      {calendarOpen&&(
        <CalendarPage date={date} tasks={tasks} customTabs={customTabs} onSelect={(d)=>{setDate(d);setWeekAnchor(d);setCalOp(false);}} onClose={()=>setCalOp(false)}/>
      )}

      {/* ── Search ── */}
      {searchOpen&&(
        <SearchPage tasks={tasks} onClose={()=>setSearchOpen(false)}
          onSelect={(t)=>{if(!t.isLater){setDate(t.date);setWeekAnchor(t.date);}setSearchOpen(false);}}/>
      )}

      {/* ── Task Modal ── */}
      {modal.open&&(
        <TaskModal task={modal.task} currentDate={date} prefillTime={modal.prefillTime} prefillCategory={modal.prefillCategory} openIconSheet={!!modal.iconSheet}
          onSave={saveTasks} onUpdate={modal.task?updateTask:undefined}
          onDelete={modal.task?()=>delTask(modal.task!.id):undefined}
          onClose={closeModal} onBulkInput={()=>{closeModal();setSettingsInitSub('bulkInput');setSOp(true);}}
          onOpenTagSettings={()=>{closeModal();setSettingsInitSub('tags');setSOp(true);}}
          globalTags={globalTags} customTabs={customTabs}
          notificationsEnabled={settings.notificationsEnabled??true}
          onEnableNotifications={()=>setSettings(s=>({...s,notificationsEnabled:true}))}
          isPremium={isPremium} atLocationLimit={activeLocationRegionCount>=MAX_MONITORED_REGIONS}
          suppressAutoFocus={showTour&&!modal.task}
          focusNameSignal={showTour&&!modal.task?tourFocusNameSignal:undefined}
          fillTestNameSignal={showTour&&!modal.task?tourFillTestNameSignal:undefined}/>
      )}

      {/* ── Settings Screen ── */}
      {settingsOpen&&(
        <SettingsScreen settings={settings} onSettings={setSettings} onClose={()=>setSOp(false)} globalTags={globalTags} onGlobalTags={setGlobalTags} customTabs={customTabs} onCustomTabs={setCustomTabs} onDeleteTabTasks={(tabId)=>setTasks(prev=>prev.filter(t=>t.category!==tabId))} onDeleteTag={(tagName)=>{setGlobalTags(prev=>prev.filter(t=>t.name!==tagName));setTasks(prev=>prev.map(t=>({...t,tags:(t.tags??[]).filter(n=>n!==tagName)})));}} onRenameTag={(oldName,newName,newColor)=>{setGlobalTags(prev=>prev.map(t=>t.name===oldName?{name:newName,color:newColor}:t));setTasks(prev=>prev.map(t=>({...t,tags:(t.tags??[]).map(n=>n===oldName?newName:n)})));}} shopNotifSettings={shopNotifSettings} onShopNotifSettings={setShopNotifSettings} shopLocations={shopLocations} onShopLocations={setShopLocations} forgetAlerts={forgetAlerts} onForgetAlerts={setForgetAlerts} authUser={authUser} isPremium={isPremium} onAppleSignIn={handleAppleSignIn} onSignOut={handleSignOut} onBulkAdd={bulkAddTasks} bulkHistory={bulkHistory} onBulkHistoryDelete={bulkHistoryDelete} onBulkHistoryEdit={bulkHistoryEdit} lifePatterns={lifePatterns} onLifePatterns={setLifePatterns} patternOverrides={patternOverrides} onApplyPattern={applyPattern} initialSub={settingsInitSub} tasks={tasks} onEditTask={(t)=>{setSOp(false);openEdit(t);}}/>
      )}

      {/* ── Tab filter bottom sheet ── */}
      {showTabFilter&&(
        <div className="fixed inset-0 z-[200] bg-black/40 flex items-end justify-center" onClick={()=>setShowTabFilter(false)}>
          <div className="bg-white w-full max-w-md rounded-t-3xl px-5 pt-5 pb-10 shadow-2xl" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-base font-bold text-gray-900">表示するタブを選択</p>
              {tabFilter.length>0&&(
                <button onClick={()=>setTabFilter([])} className="text-sm font-medium" style={{color:'var(--c-primary)'}}>すべて表示</button>
              )}
            </div>
            {customTabs.length===0?(
              <p className="text-sm text-gray-400 text-center py-4">タブが作成されていません</p>
            ):(
              <div className="space-y-1">
                {customTabs.map(tab=>{
                  const excluded=tabFilter.includes(tab.id);
                  const checked=!excluded;
                  return(
                    <button key={tab.id} onClick={()=>setTabFilter(prev=>excluded?prev.filter(id=>id!==tab.id):[...prev,tab.id])}
                      className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl active:bg-gray-50">
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${checked?'border-[var(--c-primary)] bg-[var(--c-primary)]':'border-gray-300'}`}>
                        {checked&&<span className="block w-2 h-2 rounded-sm bg-white"/>}
                      </div>
                      <span className={`text-[15px] font-medium ${checked?'text-gray-900':'text-gray-400'}`}>{tab.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <button onClick={()=>setShowTabFilter(false)}
              className="mt-5 w-full py-3.5 rounded-2xl text-[15px] font-semibold"
              style={{background:'var(--c-primary)',color:'white'}}>
              完了
            </button>
          </div>
        </div>
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
              }} className="w-full py-3.5 bg-[var(--c-primary)] rounded-2xl text-sm font-semibold text-white">すべての予定を変更</button>
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
                className="w-full py-3.5 bg-[var(--c-primary)] rounded-2xl text-sm font-semibold text-white">すべての予定を変更</button>
              <button onClick={()=>setRecConfirm(null)}
                className="w-full py-2.5 text-sm text-gray-400 font-semibold">キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {appProPrompt&&<ProGateSheet onClose={()=>setAppProPrompt(false)} onView={()=>{setAppProPrompt(false);setSettingsInitSub('premium');setSOp(true);}} feature="起床・就寝アイコンの色変更"/>}

      {showWakeSleepPrompt&&(
        <div className="fixed inset-0 z-[210] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={dismissWakeSleepPrompt}/>
          <div className="relative bg-white rounded-t-3xl w-full max-w-md px-6 pt-7 pb-10 shadow-2xl">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{background:'rgba(217,163,178,0.12)'}}>
                <AppIcons.wake size={32} className="text-[var(--c-primary)]"/>
              </div>
            </div>
            <p className="text-lg font-bold text-gray-900 text-center mb-2">起床・就寝時間を設定しよう</p>
            <p className="text-sm text-gray-500 text-center mb-6 leading-relaxed">あなたの生活リズムに合わせてタイムラインを表示します。</p>
            <div className="flex items-center justify-center gap-3 mb-7">
              <input type="time" value={wsPromptWake} onChange={e=>setWsPromptWake(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50"/>
              <span className="text-gray-300 text-sm">〜</span>
              <input type="time" value={wsPromptSleep} onChange={e=>setWsPromptSleep(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50"/>
            </div>
            <button onClick={confirmWakeSleepPrompt}
              className="w-full py-3.5 rounded-2xl text-[15px] font-bold text-white mb-3"
              style={{background:'var(--c-primary)'}}>設定する</button>
            <button onClick={dismissWakeSleepPrompt}
              className="w-full py-2.5 text-sm font-medium text-gray-400">あとで</button>
          </div>
        </div>
      )}

      {/* ── ウェルカム画面（初回起動時、プロダクトツアーの前） ── */}
      {showWelcome&&(
        <Welcome
          onStartTour={()=>{
            setShowWelcome(false);
            setShowTour(true);
            logAnalyticsEvent('product_tour_started');
          }}
          onLater={()=>{
            setShowWelcome(false);
            localStorage.setItem(TOUR_COMPLETED_KEY,'1');
            logAnalyticsEvent('product_tour_skipped');
            maybeShowNotifPrompt();
          }}/>
      )}

      {/* ── プロダクトツアー ── */}
      {showTour&&!settingsOpen&&!calendarOpen&&!searchOpen&&(
        <ProductTour gestureSignal={tourDragSignal} modalOpen={modal.open} taskSavedSignal={tourTaskSavedSignal}
          isDragging={!!dragTask}
          onEnterLaterNameStep={()=>setTourFocusNameSignal(n=>n+1)}
          onSkipLaterName={()=>setTourFillTestNameSignal(n=>n+1)}
          onFinish={(skipped)=>{
            localStorage.setItem(TOUR_COMPLETED_KEY,'1');
            setShowTour(false);
            logAnalyticsEvent(skipped?'product_tour_skipped':'product_tour_completed');
            maybeShowNotifPrompt();
          }}/>
      )}

      {/* ── おすすめ機能カード ── */}
      {activeRecommendation&&!showTour&&!modal.open&&!settingsOpen&&!calendarOpen&&!searchOpen&&(()=>{
        const def=RECOMMENDATION_DEFS.find(d=>d.id===activeRecommendation);
        if(!def) return null;
        return (
          <div className="fixed left-0 right-0 z-40 max-w-md mx-auto px-4" style={{bottom:'calc(7.5rem + env(safe-area-inset-bottom))'}}>
            <div className="bg-white rounded-2xl px-4 py-3.5 flex items-start gap-3" style={{boxShadow:'0 8px 24px rgba(0,0,0,0.14)',border:'1px solid rgba(0,0,0,0.05)'}}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{background:'rgba(217,163,178,0.14)'}}>
                <AppIcons.sparkle size={18} className="text-[var(--c-primary)]"/>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800">{def.title}</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{def.body}</p>
                <div className="flex items-center gap-3 mt-2.5">
                  <button onClick={useRecommendation}
                    className="text-xs font-bold text-white px-3.5 py-1.5 rounded-xl"
                    style={{background:'var(--c-primary)'}}>{def.cta}</button>
                  <button onClick={dismissRecommendation} className="text-xs font-medium text-gray-400">今はしない</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
