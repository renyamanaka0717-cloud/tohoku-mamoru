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
