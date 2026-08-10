'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Language = 'ja' | 'en';

// 文言はここに集約する。新しい文言を追加する時は必ずja/en両方を埋めること。
// 英語文言は初期実装時点の仮訳。ネイティブチェック前提で、後日まとめて見直す。
export const STRINGS = {
  welcomeTitle:          { ja: 'BrainBox',                     en: 'BrainBox' },
  welcomeSubtitle:       { ja: '頭の中を、もっとシンプルに。',            en: 'Simplify what’s on your mind.' },
  welcomeStartTour:      { ja: '使い方を見る',                     en: 'See how it works' },
  welcomeLater:          { ja: 'スキップ',                       en: 'Skip' },

  tourSkip:              { ja: 'スキップ',                       en: 'Skip' },
  tourAddTitle:          { ja: 'タスクを追加してみよう',             en: 'Let’s add a task' },
  tourAddBody:           { ja: 'ここをタップして、新しいタスクを追加しましょう。', en: 'Tap here to add a new task.' },
  tourSaveTitle:         { ja: '「あとでやる」タスクはこちらのタブから追加できます。', en: 'You can add "Later" tasks from this tab.' },
  tourLaterNameTitle:    { ja: 'タスクを入力してみましょう。',          en: 'Try entering a task name.' },
  tourLaterConfirmTitle: { ja: '保存ボタンを押しましょう。',            en: 'Tap the save button.' },
  tourLaterConfirmBody:  { ja: '「あとでやる」タスク一覧に追加されます。', en: 'It will be added to your "Later" list.' },
  tourDragTitle:         { ja: 'あとでやるタスクが空き時間カードに表示されます。', en: 'Your "Later" tasks appear on the free-time card.' },
  tourDragBody:          { ja: 'タスクを長押ししてタイムラインにドラッグしてみましょう。', en: 'Long-press a task and drag it onto the timeline.' },
  tourNext:              { ja: '次へ',                          en: 'Next' },
  tourDefaultTaskName:   { ja: 'テスト',                        en: 'Test' },
  tourCompleteTitle:     { ja: 'ツアー完了！',                     en: 'Tour complete!' },
  tourCompleteBody:      { ja: 'これでBrainBoxの基本的な使い方はばっちりです。さっそく使ってみましょう。', en: 'You’re all set with the basics of BrainBox. Let’s get started.' },
  tourCompleteStart:     { ja: 'はじめる',                        en: 'Get started' },

  settingsDisplayTitle:  { ja: '表示設定',                        en: 'Display' },
  settingsLanguageJa:    { ja: '日本語',                          en: 'Japanese' },
  settingsLanguageEn:    { ja: 'English',                        en: 'English' },

  // Timeline / FreeTimeCard（{n}/{start}/{end}等はcall側でreplace()する簡易プレースホルダー）
  timelineWake:              { ja: '起床',                        en: 'Wake up' },
  timelineSleep:             { ja: '就寝',                        en: 'Sleep' },
  timelineMovedTasksNotice:  { ja: '未完了タスク{n}件をあとでやるへ移動', en: 'Moved {n} unfinished task(s) to Later' },
  timelineMovedTasksTitle:   { ja: '移動したタスク',                en: 'Moved tasks' },
  timelineCompletedTitle:    { ja: '今日完了したタスク',             en: 'Completed today' },
  timelineCompletedEmpty:    { ja: 'まだ完了したタスクはありません',   en: 'No completed tasks yet' },
  timelineDuplicateNotice:   { ja: 'タスクが重複しています',          en: 'Tasks overlap' },
  timelineEmptyTitle:        { ja: 'タスクがありません',             en: 'No tasks' },
  timelineEmptySubtitle:     { ja: '時間をタップして追加',           en: 'Tap a time to add one' },
  freeTimeRange:             { ja: '空き時間 {start}〜{end}',       en: 'Free time {start}–{end}' },
  durUnitHour:               { ja: '時間',                        en: 'h' },
  durUnitMin:                { ja: '分',                          en: 'm' },
  moreCountChip:             { ja: '+{n}件',                      en: '+{n} more' },

  // ヘッダー（App本体）
  headerFreeTimeToggle:      { ja: '空き時間',                     en: 'Free time' },
  fileTabAll:                { ja: 'すべて',                       en: 'All' },
  loading:                   { ja: '読み込み中…',                  en: 'Loading…' },

  // BottomTabs（あとでやる・買い物リスト）
  laterTabLabel:             { ja: 'あとでやる',                    en: 'Later' },
  shopTabLabel:              { ja: '買い物リスト',                   en: 'Shopping list' },
  laterSectionLabel:         { ja: 'あとでやる {n}',                en: 'Later {n}' },
  scheduledSectionLabel:     { ja: '時間指定 {n}',                  en: 'Scheduled {n}' },
  recurringSectionLabel:     { ja: '繰り返し {n}',                  en: 'Recurring {n}' },
  laterEmptyLabel:           { ja: 'タスクがありません',              en: 'No tasks' },
  doneSectionLabel:          { ja: '完了済み',                      en: 'Completed' },
  shopAddPlaceholder:        { ja: '商品を追加...',                 en: 'Add an item...' },
  addButton:                 { ja: '追加',                        en: 'Add' },
  shopEmptyLabel:            { ja: 'リストは空です',                 en: 'Your list is empty' },
  shopDoneNotice:            { ja: '購入済み（7日後に自動削除）',       en: 'Purchased (auto-deleted after 7 days)' },

  // TaskModal（タスク作成・編集）
  taskModalBulkInput:        { ja: '一括入力',                     en: 'Bulk add' },
  taskModalSaving:           { ja: '保存中…',                      en: 'Saving…' },
  taskModalSaved:            { ja: '✓ 保存済み',                    en: '✓ Saved' },
  taskModalSaveFailed:       { ja: '保存に失敗しました',              en: 'Failed to save' },
  taskModalDone:             { ja: '完了',                        en: 'Done' },
  taskModalSave:             { ja: '保存',                        en: 'Save' },
  taskModalRecurringSuffix:  { ja: '繰り返し',                      en: 'Recurring' },
  taskModalAllDay:           { ja: '終日',                        en: 'All day' },
  taskModalNamePlaceholder:  { ja: 'タスク名を入力...',              en: 'Enter a task name...' },
  modeLater:                 { ja: 'あとで',                       en: 'Later' },
  modeScheduled:             { ja: '時間指定',                      en: 'Scheduled' },
  modeRecurring:             { ja: '繰り返し',                      en: 'Recurring' },
  recPresetDaily:            { ja: '毎日',                        en: 'Daily' },
  recPresetWeekly:           { ja: '毎週',                        en: 'Weekly' },
  recPresetMonthly:          { ja: '毎月',                        en: 'Monthly' },
  recPresetYearly:           { ja: '毎年',                        en: 'Yearly' },
  recPresetCustom:           { ja: 'カスタム',                      en: 'Custom' },
  fieldStartTime:            { ja: '開始時刻',                      en: 'Start time' },
  fieldDuration:             { ja: '所要時間',                      en: 'Duration' },
  fieldAlert:                { ja: 'アラート',                      en: 'Alert' },
  fieldDeadline:             { ja: '締切',                        en: 'Deadline' },
  fieldLocationNotify:       { ja: '場所で通知',                     en: 'Notify by location' },
  fieldTags:                 { ja: 'タグ',                        en: 'Tags' },
  addTagButton:              { ja: 'タグを追加',                     en: 'Add tag' },
  subtaskPlaceholder:        { ja: 'サブタスクを追加',                en: 'Add a subtask' },
  memoPlaceholder:           { ja: 'メモを追加...',                 en: 'Add a note...' },
  deleteTaskButton:          { ja: '削除する',                      en: 'Delete' },
  cancelButton:              { ja: 'キャンセル',                     en: 'Cancel' },
  setButton:                 { ja: '設定',                        en: 'Set' },
  clearButton:               { ja: '解除',                        en: 'Clear' },
  deadlineDatePlaceholder:   { ja: '日付を選択する',                  en: 'Select a date' },
  deadlineNotifyTiming:      { ja: '通知タイミング',                  en: 'Notify' },
  iconColorSheetTitle:       { ja: 'アイコンとカラー',                en: 'Icon & Color' },
  iconSearchPlaceholder:     { ja: 'アイコンを検索',                  en: 'Search icons' },
  iconSearchResults:         { ja: '検索結果',                      en: 'Search results' },
  iconSearchEmpty:           { ja: '見つかりませんでした',             en: 'No results found' },
  colorSectionLabel:         { ja: 'カラー',                       en: 'Color' },
  recentIconsLabel:          { ja: '最近使ったアイコン',               en: 'Recently used' },
  timeUnitHour:              { ja: '時',                          en: 'h' },
  timeUnitMin:               { ja: '分',                          en: 'm' },
  discardConfirmTitle:       { ja: '入力内容を破棄しますか？',           en: 'Discard your changes?' },
  discardConfirmBody:        { ja: '保存していない内容は失われます。',      en: 'Unsaved changes will be lost.' },
  discardButton:             { ja: '破棄する',                      en: 'Discard' },
  saveBeforeMoveTitle:       { ja: '入力内容を保存しますか？',           en: 'Save your changes?' },
  saveBeforeMoveBody:        { ja: 'タグ設定画面に移動する前に、入力中の内容を保存するか選んでください。', en: 'Choose whether to save your changes before going to tag settings.' },
  saveAndMoveButton:         { ja: '保存して移動',                   en: 'Save & continue' },
  discardAndMoveButton:      { ja: '破棄して移動',                   en: 'Discard & continue' },
  deleteTaskConfirmTitle:    { ja: 'このタスクを削除しますか？',          en: 'Delete this task?' },
  deleteTaskConfirmBody:     { ja: 'この操作は取り消せません。',          en: 'This can’t be undone.' },
} as const;

export type StringKey = keyof typeof STRINGS;

const LANG_KEY = 'tl-language-v1';

// ja→日本語、それ以外（enを含む未対応言語すべて）はenにフォールバックする
function detectLanguage(): Language {
  if (typeof navigator === 'undefined') return 'ja';
  const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
  for (const l of langs) {
    if (l && l.toLowerCase().startsWith('ja')) return 'ja';
  }
  return 'en';
}

export function getStoredLanguage(): Language | null {
  if (typeof window === 'undefined') return null;
  const v = localStorage.getItem(LANG_KEY);
  return v === 'ja' || v === 'en' ? v : null;
}

interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  // page.tsxでは`t`がループ変数（タスク・タグ等）として頻繁に使われるため、
  // 衝突を避けて翻訳関数は`tr`という名前にしている
  tr: (key: StringKey) => string;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'ja',
  setLanguage: () => {},
  tr: (key) => STRINGS[key].ja,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('ja');

  // 初回マウント時のみ判定する。保存済みの言語があればそれを、無ければ端末の言語設定から判定する
  useEffect(() => {
    const lang = getStoredLanguage() ?? detectLanguage();
    setLanguageState(lang);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(LANG_KEY, lang);
  };

  const tr = (key: StringKey) => STRINGS[key][language];

  return <I18nContext.Provider value={{ language, setLanguage, tr }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
