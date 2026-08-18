'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { setAnalyticsUserProperty } from './Analytics';

export type Language = 'ja' | 'en' | 'ko';
// 言語ピッカーで選べる選択肢。'auto'は端末のシステム言語設定に追従する（明示的に選んだ場合のみlocalStorageに固定される）
export type LanguagePref = Language | 'auto';

// 文言はここに集約する。新しい文言を追加する時は必ずja/en/ko全部を埋めること。
// 英語文言は初期実装時点の仮訳。ネイティブチェック前提で、後日まとめて見直す。
export const STRINGS = {
  welcomeTitle:          { ja: 'BrainBox',                     en: 'BrainBox',                         ko: 'BrainBox' },
  welcomeSubtitle:       { ja: '頭の中を、もっとシンプルに。',            en: 'Simplify what’s on your mind.',   ko: '머릿속을 더 단순하게.' },
  welcomeStartTour:      { ja: '使い方を見る',                     en: 'See how it works',                ko: '사용법 보기' },
  welcomeLater:          { ja: 'スキップ',                       en: 'Skip',                             ko: '건너뛰기' },

  tourSkip:              { ja: 'スキップ',                       en: 'Skip',                             ko: '건너뛰기' },
  tourAddTitle:          { ja: 'タスクを追加してみよう',             en: 'Let’s add a task',                ko: '태스크를 추가해 볼까요' },
  tourAddBody:           { ja: 'ここをタップして、新しいタスクを追加しましょう。', en: 'Tap here to add a new task.',   ko: '여기를 탭해서 새 태스크를 추가해 보세요.' },
  tourSaveTitle:         { ja: '「あとでやる」タスクはこちらのタブから追加できます。', en: 'You can add "Later" tasks from this tab.', ko: '\'나중에 할 일\' 태스크는 이 탭에서 추가할 수 있어요.' },
  tourLaterNameTitle:    { ja: 'タスクを入力してみましょう。',          en: 'Try entering a task name.',       ko: '태스크를 입력해 볼까요.' },
  tourLaterConfirmTitle: { ja: '保存ボタンを押しましょう。',            en: 'Tap the save button.',            ko: '저장 버튼을 눌러보세요.' },
  tourLaterConfirmBody:  { ja: '「あとでやる」タスク一覧に追加されます。', en: 'It will be added to your "Later" list.', ko: '\'나중에 할 일\' 목록에 추가돼요.' },
  tourDragTitle:         { ja: 'あとでやるタスクが空き時間カードに表示されます。', en: 'Your "Later" tasks appear on the free-time card.', ko: '나중에 할 일이 여유 시간 카드에 표시돼요.' },
  tourDragBody:          { ja: 'タスクを長押ししてタイムラインにドラッグしてみましょう。', en: 'Long-press a task and drag it onto the timeline.', ko: '태스크를 길게 눌러 타임라인으로 드래그해 보세요.' },
  tourNext:              { ja: '次へ',                          en: 'Next',                             ko: '다음' },
  tourDefaultTaskName:   { ja: 'テスト',                        en: 'Test',                             ko: '테스트' },
  tourCompleteTitle:     { ja: 'ツアー完了！',                     en: 'Tour complete!',                  ko: '투어 완료!' },
  tourCompleteBody:      { ja: 'これでBrainBoxの基本的な使い方はばっちりです。さっそく使ってみましょう。', en: 'You’re all set with the basics of BrainBox. Let’s get started.', ko: '이제 BrainBox의 기본 사용법을 모두 익히셨어요. 바로 사용해 보세요.' },
  tourCompleteStart:     { ja: 'はじめる',                        en: 'Get started',                     ko: '시작하기' },

  settingsDisplayTitle:  { ja: '表示設定',                        en: 'Display',                         ko: '화면 설정' },
  languageAutoLabel:     { ja: '自動',                          en: 'Automatic',                        ko: '자동' },
  languageAutoDesc:      { ja: 'システム設定に従う',                  en: 'Match system setting',            ko: '시스템 설정을 따름' },

  // Timeline / FreeTimeCard（{n}/{start}/{end}等はcall側でreplace()する簡易プレースホルダー）
  timelineWake:              { ja: '起床',                        en: 'Wake up',                       ko: '기상' },
  timelineSleep:             { ja: '就寝',                        en: 'Sleep',                         ko: '취침' },
  timelineMovedTasksNotice:  { ja: '未完了タスク{n}件をあとでやるへ移動', en: 'Moved {n} unfinished task(s) to Later', ko: '미완료 태스크 {n}개를 나중에 할 일로 이동' },
  timelineMovedTasksTitle:   { ja: '移動したタスク',                en: 'Moved tasks',                   ko: '이동한 태스크' },
  timelineCompletedTitle:    { ja: '今日完了したタスク',             en: 'Completed today',               ko: '오늘 완료한 태스크' },
  timelineCompletedEmpty:    { ja: 'まだ完了したタスクはありません',   en: 'No completed tasks yet',        ko: '아직 완료한 태스크가 없어요' },
  timelineDuplicateNotice:   { ja: 'タスクが重複しています',          en: 'Tasks overlap',                 ko: '태스크가 겹쳐 있어요' },
  timelineEmptyTitle:        { ja: 'タスクがありません',             en: 'No tasks',                      ko: '태스크가 없어요' },
  timelineEmptySubtitle:     { ja: '時間をタップして追加',           en: 'Tap a time to add one',         ko: '시간을 탭해서 추가' },
  freeTimeRange:             { ja: '空き時間 {start}〜{end}',       en: 'Free time {start}–{end}',       ko: '여유 시간 {start}~{end}' },
  durUnitHour:               { ja: '時間',                        en: 'h',                             ko: '시간' },
  durUnitMin:                { ja: '分',                          en: 'm',                             ko: '분' },
  moreCountChip:             { ja: '+{n}件',                      en: '+{n} more',                     ko: '+{n}개' },

  // ヘッダー（App本体）
  headerFreeTimeToggle:      { ja: '空き時間',                     en: 'Free time',                     ko: '여유 시간' },
  fileTabAll:                { ja: 'すべて',                       en: 'All',                           ko: '전체' },
  loading:                   { ja: '読み込み中…',                  en: 'Loading…',                      ko: '불러오는 중…' },

  // BottomTabs（あとでやる・買い物リスト）
  laterTabLabel:             { ja: 'あとでやる',                    en: 'Later',                         ko: '나중에' },
  shopTabLabel:              { ja: '買い物リスト',                   en: 'Shopping list',                 ko: '쇼핑 목록' },
  laterSectionLabel:         { ja: 'あとでやる {n}',                en: 'Later {n}',                     ko: '나중에 {n}' },
  reorderPopupTitle:         { ja: '並び替え',                     en: 'Reorder',                       ko: '순서 변경' },
  reorderPopupHint:          { ja: 'ハンドルをドラッグして順番を変更できます', en: 'Drag the handle to change the order', ko: '핸들을 드래그하여 순서를 바꿀 수 있어요' },
  scheduledSectionLabel:     { ja: '時間指定 {n}',                  en: 'Scheduled {n}',                 ko: '시간 지정 {n}' },
  recurringSectionLabel:     { ja: '繰り返し {n}',                  en: 'Recurring {n}',                 ko: '반복 {n}' },
  laterEmptyLabel:           { ja: 'タスクがありません',              en: 'No tasks',                      ko: '태스크가 없어요' },
  doneSectionLabel:          { ja: '完了済み',                      en: 'Completed',                     ko: '완료됨' },
  shopAddPlaceholder:        { ja: '商品を追加...',                 en: 'Add an item...',                ko: '항목 추가...' },
  addButton:                 { ja: '追加',                        en: 'Add',                           ko: '추가' },
  shopEmptyLabel:            { ja: 'リストは空です',                 en: 'Your list is empty',            ko: '목록이 비어 있어요' },
  shopDoneNotice:            { ja: '購入済み（7日後に自動削除）',       en: 'Purchased (auto-deleted after 7 days)', ko: '구매 완료(7일 후 자동 삭제)' },

  // TaskModal（タスク作成・編集）
  taskModalBulkInput:        { ja: '一括入力',                     en: 'Bulk add',                      ko: '일괄 입력' },
  taskModalSaving:           { ja: '保存中…',                      en: 'Saving…',                       ko: '저장 중…' },
  taskModalSaved:            { ja: '✓ 保存済み',                    en: '✓ Saved',                       ko: '✓ 저장됨' },
  taskModalSaveFailed:       { ja: '保存に失敗しました',              en: 'Failed to save',                ko: '저장에 실패했어요' },
  taskModalDone:             { ja: '完了',                        en: 'Done',                          ko: '완료' },
  taskModalSave:             { ja: '保存',                        en: 'Save',                          ko: '저장' },
  taskModalRecurringSuffix:  { ja: '繰り返し',                      en: 'Recurring',                     ko: '반복' },
  taskModalAllDay:           { ja: '終日',                        en: 'All day',                       ko: '종일' },
  taskModalNamePlaceholder:  { ja: 'タスク名を入力...',              en: 'Enter a task name...',          ko: '태스크 이름 입력...' },
  modeLater:                 { ja: 'あとで',                       en: 'Later',                         ko: '나중에' },
  modeScheduled:             { ja: '時間指定',                      en: 'Scheduled',                     ko: '시간 지정' },
  modeRecurring:             { ja: '繰り返し',                      en: 'Recurring',                     ko: '반복' },
  recPresetDaily:            { ja: '毎日',                        en: 'Daily',                         ko: '매일' },
  recPresetWeekly:           { ja: '毎週',                        en: 'Weekly',                        ko: '매주' },
  recPresetMonthly:          { ja: '毎月',                        en: 'Monthly',                       ko: '매월' },
  recPresetYearly:           { ja: '毎年',                        en: 'Yearly',                        ko: '매년' },
  recPresetCustom:           { ja: 'カスタム',                      en: 'Custom',                        ko: '사용자 지정' },
  fieldStartTime:            { ja: '開始時刻',                      en: 'Start time',                    ko: '시작 시각' },
  fieldDuration:             { ja: '所要時間',                      en: 'Duration',                      ko: '소요 시간' },
  fieldAlert:                { ja: 'アラート',                      en: 'Alert',                         ko: '알림' },
  fieldDeadline:             { ja: '締切',                        en: 'Deadline',                      ko: '마감일' },
  fieldLocationNotify:       { ja: '場所で通知',                     en: 'Notify by location',            ko: '위치로 알림' },
  fieldTags:                 { ja: 'タグ',                        en: 'Tags',                          ko: '태그' },
  addTagButton:              { ja: 'タグを追加',                     en: 'Add tag',                       ko: '태그 추가' },
  subtaskPlaceholder:        { ja: 'サブタスクを追加',                en: 'Add a subtask',                 ko: '하위 작업 추가' },
  memoPlaceholder:           { ja: 'メモを追加...',                 en: 'Add a note...',                 ko: '메모 추가...' },
  deleteTaskButton:          { ja: '削除する',                      en: 'Delete',                        ko: '삭제하기' },
  cancelButton:              { ja: 'キャンセル',                     en: 'Cancel',                        ko: '취소' },
  setButton:                 { ja: '設定',                        en: 'Set',                           ko: '설정' },
  clearButton:               { ja: '解除',                        en: 'Clear',                         ko: '해제' },
  deadlineDatePlaceholder:   { ja: '日付を選択する',                  en: 'Select a date',                 ko: '날짜 선택하기' },
  deadlineNotifyTiming:      { ja: '通知タイミング',                  en: 'Notify',                        ko: '알림 시점' },
  iconColorSheetTitle:       { ja: 'アイコンとカラー',                en: 'Icon & Color',                  ko: '아이콘과 색상' },
  iconSearchPlaceholder:     { ja: 'アイコンを検索',                  en: 'Search icons',                  ko: '아이콘 검색' },
  iconSearchResults:         { ja: '検索結果',                      en: 'Search results',                ko: '검색 결과' },
  iconSearchEmpty:           { ja: '見つかりませんでした',             en: 'No results found',              ko: '결과가 없어요' },
  colorSectionLabel:         { ja: 'カラー',                       en: 'Color',                         ko: '색상' },
  recentIconsLabel:          { ja: '最近使ったアイコン',               en: 'Recently used',                 ko: '최근 사용한 아이콘' },
  timeUnitHour:              { ja: '時',                          en: 'h',                             ko: '시' },
  timeUnitMin:               { ja: '分',                          en: 'm',                             ko: '분' },
  discardConfirmTitle:       { ja: '入力内容を破棄しますか？',           en: 'Discard your changes?',         ko: '입력한 내용을 삭제할까요?' },
  discardConfirmBody:        { ja: '保存していない内容は失われます。',      en: 'Unsaved changes will be lost.', ko: '저장하지 않은 내용은 사라져요.' },
  discardButton:             { ja: '破棄する',                      en: 'Discard',                       ko: '삭제하기' },
  saveBeforeMoveTitle:       { ja: '入力内容を保存しますか？',           en: 'Save your changes?',            ko: '입력한 내용을 저장할까요?' },
  saveBeforeMoveBody:        { ja: 'タグ設定画面に移動する前に、入力中の内容を保存するか選んでください。', en: 'Choose whether to save your changes before going to tag settings.', ko: '태그 설정 화면으로 이동하기 전에, 입력 중인 내용을 저장할지 선택해 주세요.' },
  saveAndMoveButton:         { ja: '保存して移動',                   en: 'Save & continue',               ko: '저장하고 이동' },
  discardAndMoveButton:      { ja: '破棄して移動',                   en: 'Discard & continue',            ko: '삭제하고 이동' },
  deleteTaskConfirmTitle:    { ja: 'このタスクを削除しますか？',          en: 'Delete this task?',             ko: '이 태스크를 삭제할까요?' },
  deleteTaskConfirmBody:     { ja: 'この操作は取り消せません。',          en: 'This can’t be undone.',         ko: '이 작업은 되돌릴 수 없어요.' },

  // MonthCalendar / CalendarPage
  closeButton:               { ja: '閉じる',                       en: 'Close',                         ko: '닫기' },
  todayButton:               { ja: '今日',                        en: 'Today',                         ko: '오늘' },

  // SearchPage
  searchPlaceholder:         { ja: 'タスク・メモ・タブを検索...',        en: 'Search tasks, notes, tabs...',  ko: '태스크·메모·탭 검색...' },
  searchEmptyPrompt:         { ja: 'タスク名・メモ・タブで検索',          en: 'Search by task name, note, or tab', ko: '태스크 이름·메모·탭으로 검색' },
  searchNoResults:           { ja: '「{q}」は見つかりませんでした',       en: 'No results for "{q}"',          ko: '\'{q}\'에 대한 결과가 없어요' },

  // SettingsScreen（トップレベルのメニュー一覧）
  settingsTitle:             { ja: '設定',                        en: 'Settings',                      ko: '설정' },
  sectionFeatures:           { ja: '基本機能',                     en: 'Basic features',                ko: '기본 기능' },
  sectionNotifications:      { ja: '通知',                        en: 'Notifications',                 ko: '알림' },
  sectionGeneral:            { ja: '一般',                        en: 'General',                       ko: '일반' },
  sectionIntegration:        { ja: '連携',                        en: 'Integrations',                  ko: '연동' },
  sectionSubscription:       { ja: 'サブスクリプション',              en: 'Subscription',                  ko: '구독' },
  sectionInfo:               { ja: '情報',                        en: 'Info',                          ko: '정보' },
  sectionDeveloper:          { ja: '開発者向け',                    en: 'Developer',                     ko: '개발자용' },
  rowTagsTitle:              { ja: 'タグ',                        en: 'Tags',                          ko: '태그' },
  rowTagsDesc:               { ja: 'タスクにラベルを付けて整理・検索',    en: 'Label tasks to organize and find them', ko: '태스크에 라벨을 붙여 정리하고 검색' },
  rowTabsTitle:              { ja: 'ファイルタブ',                   en: 'File tabs',                     ko: '파일 탭' },
  rowTabsDesc:               { ja: 'タスクをフォルダ別に管理',          en: 'Organize tasks into folders',   ko: '태스크를 폴더별로 관리' },
  rowBulkInputTitle:         { ja: 'タスク一括入力',                 en: 'Bulk add tasks',                ko: '태스크 일괄 입력' },
  rowBulkInputDesc:          { ja: 'まとめてタスクを登録',             en: 'Add multiple tasks at once',    ko: '여러 태스크를 한번에 등록' },
  rowLifePatternsTitle:      { ja: '生活パターン',                   en: 'Life patterns',                 ko: '생활 패턴' },
  rowLifePatternsDesc:       { ja: 'シフトや休日で起床・就寝時間を切り替え', en: 'Switch wake/sleep times for shifts or days off', ko: '근무 교대나 휴일에 맞춰 기상·취침 시간 전환' },
  rowRecurringTitle:         { ja: '繰り返しタスク',                 en: 'Recurring tasks',               ko: '반복 태스크' },
  rowRecurringDesc:          { ja: '繰り返しタスクを管理',             en: 'Manage your recurring tasks',   ko: '반복 태스크 관리' },
  rowWakeSleepTitle:         { ja: '起床・就寝',                    en: 'Wake & sleep',                  ko: '기상·취침' },
  rowWakeSleepDesc:          { ja: '起床時間、就寝時間を設定',          en: 'Set your wake and sleep times', ko: '기상 시간과 취침 시간 설정' },
  rowShopNotifTitle:         { ja: '買い物リスト通知',                en: 'Shopping list alerts',          ko: '쇼핑 목록 알림' },
  rowShopNotifDesc:          { ja: '時間や場所で買い物リストを通知',      en: 'Get notified by time or location', ko: '시간이나 장소로 쇼핑 목록 알림' },
  rowLaterAlertTitle:        { ja: '放置通知',                      en: 'Inactivity alerts',             ko: '방치 알림' },
  rowLaterAlertDesc:         { ja: 'タスクやアプリの放置を通知',         en: 'Get reminded about neglected tasks or the app', ko: '태스크나 앱 방치를 알림' },
  rowForgetAlertTitle:       { ja: '忘れ物防止通知',                  en: 'Forgotten item alerts',         ko: '분실물 방지 알림' },
  rowForgetAlertDesc:        { ja: '場所を出るときに持ち物を確認',        en: 'Check your belongings when leaving a place', ko: '장소를 떠날 때 소지품 확인' },
  rowNotificationsTitle:     { ja: '通知',                        en: 'Notifications',                 ko: '알림' },
  rowNotificationsDesc:      { ja: '通知設定',                      en: 'Notification settings',         ko: '알림 설정' },
  rowDisplayTitle:           { ja: '表示設定',                      en: 'Display',                       ko: '화면 설정' },
  rowDisplayDesc:            { ja: '外観、言語など',                  en: 'Appearance, language, and more', ko: '화면, 언어 등' },
  rowAccountTitle:           { ja: 'アカウント',                     en: 'Account',                       ko: '계정' },
  rowAccountDesc:            { ja: 'Appleアカウント・iCloudバックアップ', en: 'Apple account & iCloud backup', ko: 'Apple 계정·iCloud 백업' },
  rowProTitle:               { ja: 'PRO',                         en: 'PRO',                           ko: 'PRO' },
  rowProActive:              { ja: '利用中',                       en: 'Active',                        ko: '이용 중' },
  rowProPrice:               { ja: '月額{price}',                   en: '{price}/month',                 ko: '월 {price}' },
  rowPrivacyTitle:           { ja: 'プライバシーポリシー',              en: 'Privacy policy',                ko: '개인정보처리방침' },
  rowTermsTitle:             { ja: '利用規約',                      en: 'Terms of service',              ko: '이용약관' },
  rowFaqTitle:               { ja: 'よくある質問',                   en: 'FAQ',                           ko: '자주 묻는 질문' },
  rowContactTitle:           { ja: 'お問い合わせ',                   en: 'Contact us',                    ko: '문의하기' },
  rowAppVersionTitle:        { ja: 'アプリバージョン',                en: 'App version',                   ko: '앱 버전' },
  rowDevModeTitle:           { ja: '開発者モード',                   en: 'Developer mode',                ko: '개발자 모드' },
  rowDevModeDesc:            { ja: '検証用の状態を切り替える',          en: 'Toggle states for testing',     ko: '테스트용 상태 전환' },

  // 設定 → ファイルタブ / タグ（共通の確認ダイアログを含む）
  fileTabsFreeLimitNote:     { ja: '1個まで無料でご利用いただけます。2個目からPROが必要です。', en: 'You can use up to 1 for free. PRO is required for a 2nd.', ko: '1개까지 무료로 이용할 수 있어요. 2개째부터는 PRO가 필요해요.' },
  newTabSectionLabel:        { ja: '新しいタブ',                     en: 'New tab',                       ko: '새 탭' },
  tabNamePlaceholder:        { ja: 'タブ名を入力',                    en: 'Enter a tab name',              ko: '탭 이름 입력' },
  tabListSectionLabel:       { ja: 'タブ一覧',                      en: 'Tabs',                           ko: '탭 목록' },
  showInAllLabel:            { ja: '【すべて】タブに表示',              en: 'Show in "All" tab',             ko: '[전체] 탭에 표시' },
  confirmButton:             { ja: '確定',                        en: 'Confirm',                        ko: '확인' },
  editButton:                { ja: '編集',                        en: 'Edit',                           ko: '편집' },
  deleteButton:              { ja: '削除',                        en: 'Delete',                         ko: '삭제' },
  noTabsYet:                 { ja: 'タブがまだありません',              en: 'No tabs yet',                    ko: '아직 탭이 없어요' },
  deleteNamedConfirmTitle:   { ja: '「{name}」を削除しますか？',         en: 'Delete "{name}"?',              ko: '\'{name}\'을(를) 삭제할까요?' },
  deleteTabConfirmBody:      { ja: 'このタブのタスクをどうしますか？',       en: 'What should happen to this tab’s tasks?', ko: '이 탭의 태스크는 어떻게 할까요?' },
  moveTasksToAllButton:      { ja: 'タスクを【すべて】に移動',           en: 'Move tasks to "All"',           ko: '태스크를 [전체]로 이동' },
  deleteTasksTooButton:      { ja: 'タスクも完全に削除',               en: 'Delete tasks too',              ko: '태스크도 완전히 삭제' },
  confirmDeleteTitle:        { ja: '本当に削除しますか？',              en: 'Are you sure?',                 ko: '정말 삭제할까요?' },
  deleteAllTasksInTabBody:   { ja: '「{name}」のタスクもすべて完全に削除されます', en: 'All tasks in "{name}" will be permanently deleted too', ko: '\'{name}\'의 태스크도 모두 완전히 삭제돼요' },
  moveTasksToAllBody:        { ja: '「{name}」のタスクは【すべて】タブに移動されます', en: 'Tasks in "{name}" will be moved to the "All" tab', ko: '\'{name}\'의 태스크는 [전체] 탭으로 이동돼요' },
  deletePermanentlyButton:   { ja: '完全に削除する',                  en: 'Delete permanently',            ko: '완전히 삭제하기' },
  moveAndDeleteButton:       { ja: '移動して削除する',                 en: 'Move & delete',                 ko: '이동하고 삭제하기' },
  backButton:                { ja: '戻る',                        en: 'Back',                           ko: '뒤로' },
  noTagsYet:                 { ja: 'タグがまだありません',              en: 'No tags yet',                    ko: '아직 태그가 없어요' },
  tagsFreeLimitNote:         { ja: '2個まで無料でご利用いただけます。3個目からPROが必要です。', en: 'You can use up to 2 for free. PRO is required for a 3rd.', ko: '2개까지 무료로 이용할 수 있어요. 3개째부터는 PRO가 필요해요.' },
  newTagSectionLabel:        { ja: '新しいタグ',                     en: 'New tag',                        ko: '새 태그' },
  tagNamePlaceholder:        { ja: 'タグ名を入力',                    en: 'Enter a tag name',              ko: '태그 이름 입력' },
  tagListSectionLabel:       { ja: 'タグ一覧',                      en: 'Tags',                           ko: '태그 목록' },
  deleteTagConfirmBody:      { ja: 'このタグがついているタスクからも削除されます', en: 'It will also be removed from tasks that use this tag', ko: '이 태그가 붙은 태스크에서도 함께 삭제돼요' },
  renameNamedConfirmTitle:   { ja: '「{name}」を変更しますか？',         en: 'Rename "{name}"?',              ko: '\'{name}\'을(를) 변경할까요?' },
  renameTagConfirmBody:      { ja: 'このタグがついているすべてのタスクのタグ名・色も変更されます', en: 'This will update the name and color on all tasks that use this tag', ko: '이 태그가 붙은 모든 태스크의 태그 이름·색상도 함께 변경돼요' },
  changeButton:              { ja: '変更する',                      en: 'Save',                           ko: '변경하기' },

  // 設定 → 繰り返しタスク
  noRecurringTasks:          { ja: '繰り返しタスクはありません',         en: 'No recurring tasks',            ko: '반복 태스크가 없어요' },
  noRecurringTasksHint:      { ja: 'タスク作成時に「繰り返し」を選ぶと、ここに表示されます', en: 'Choose "Recurring" when creating a task to see it here', ko: '태스크 생성 시 \'반복\'을 선택하면 여기에 표시돼요' },

  // 設定 → 起床・就寝
  timeSettingsSectionLabel:  { ja: '時間設定',                      en: 'Time settings',                 ko: '시간 설정' },
  wakeIconColorLabel:        { ja: '起床アイコンの色',                en: 'Wake icon color',               ko: '기상 아이콘 색상' },
  sleepIconColorLabel:       { ja: '就寝アイコンの色',                en: 'Sleep icon color',              ko: '취침 아이콘 색상' },
  dailyOverrideTitle:        { ja: '日ごとに起床・就寝時間を変えたいときは', en: 'Want different times on different days?', ko: '매일 기상·취침 시간을 다르게 하고 싶다면' },
  dailyOverrideBody:         { ja: '生活パターンを使うと、シフトや休日など日ごとの時間帯を設定できます。', en: 'Life patterns let you set different times for shifts, days off, and more.', ko: '생활 패턴을 사용하면 근무 교대나 휴일 등 요일별 시간대를 설정할 수 있어요.' },
  goToLifePatternsButton:    { ja: '生活パターンの設定へ',              en: 'Go to life patterns',           ko: '생활 패턴 설정으로' },

  // 設定 → 通知
  notificationSettingsRowTitle: { ja: '通知設定',                   en: 'Notification settings',         ko: '알림 설정' },
  onLabel:                   { ja: 'オン',                        en: 'On',                            ko: '켜짐' },
  offLabel:                  { ja: 'オフ',                        en: 'Off',                            ko: '꺼짐' },
  laterAlertSectionLabel:    { ja: 'タスク放置通知',                  en: 'Task inactivity alert',         ko: '태스크 방치 알림' },
  laterAlertDesc:            { ja: '「あとでやる」に追加したタスクが、設定した時間が経っても完了していないときにお知らせします。', en: 'Get notified if a task added to "Later" is still incomplete after the time you set.', ko: '\'나중에 할 일\'에 추가한 태스크가 설정한 시간이 지나도 완료되지 않으면 알려드려요.' },
  notifyToggleLabel:         { ja: '通知する',                      en: 'Notify me',                     ko: '알림 받기' },
  appAlertSectionLabel:      { ja: 'アプリ放置通知',                  en: 'App inactivity alert',          ko: '앱 방치 알림' },
  appAlertDesc:              { ja: '一定時間アプリを開いていない場合に通知します。', en: 'Get notified if you haven’t opened the app in a while.', ko: '일정 시간 동안 앱을 열지 않으면 알려드려요.' },
  enableNotificationsTitle:  { ja: '通知を有効にする',                en: 'Enable notifications',          ko: '알림 사용하기' },
  enableNotificationsDesc:   { ja: 'タスクのアラートや買い物リストの通知',    en: 'Task alerts and shopping list notifications', ko: '태스크 알림과 쇼핑 목록 알림' },
  notificationsPermissionHint: { ja: '通知を受け取るには、端末の設定でこのアプリの通知を許可してください。', en: 'To receive notifications, allow them for this app in your device settings.', ko: '알림을 받으려면 기기 설정에서 이 앱의 알림을 허용해 주세요.' },

  // 設定 → 買い物リスト通知（ShopNotifPanel / ShopLocationPanel）
  shopNotifTitle:            { ja: '買い物リストの通知',               en: 'Shopping list notifications',   ko: '쇼핑 목록 알림' },
  noShopNotifYet:            { ja: '通知が設定されていません',           en: 'No notifications set',          ko: '설정된 알림이 없어요' },
  dowSectionLabel:           { ja: '曜日',                        en: 'Days',                          ko: '요일' },
  timeSectionLabel:          { ja: '時間',                        en: 'Time',                          ko: '시간' },
  deleteNotifConfirmTitle:   { ja: 'この通知を削除しますか？',           en: 'Delete this notification?',     ko: '이 알림을 삭제할까요?' },
  cantUndoBody:              { ja: 'この操作は取り消せません',           en: 'This can’t be undone',          ko: '이 작업은 되돌릴 수 없어요' },
  everyDayLabel:             { ja: '毎日',                        en: 'Every day',                     ko: '매일' },
  weekendLabel:              { ja: '週末',                        en: 'Weekend',                       ko: '주말' },
  weekdayLabel:              { ja: '平日',                        en: 'Weekdays',                      ko: '평일' },
  notifOffConfirm:           { ja: '通知機能がオフになっています。\n通知を有効にしますか？', en: 'Notifications are turned off.\nDo you want to enable them?', ko: '알림 기능이 꺼져 있어요.\n알림을 사용할까요?' },
  taskNotifOffConfirm:       { ja: '通知機能がオフになっています。\nタスクのアラートを受け取るには通知を有効にしてください。\n\n通知をオンにしますか？', en: 'Notifications are turned off.\nEnable them to receive task alerts.\n\nTurn on notifications?', ko: '알림 기능이 꺼져 있어요.\n태스크 알림을 받으려면 알림을 사용해야 해요.\n\n알림을 켤까요?' },

  // ShopLocationPanel（買い物リストの場所通知）
  permissionBannerText:      { ja: '位置情報または通知の許可が必要です。設定アプリ > BrainBoxから「位置情報（常に）」と「通知」を許可してください。', en: 'Location or notification permission is required. Please allow "Location (Always)" and "Notifications" for BrainBox in Settings.', ko: '위치 정보 또는 알림 권한이 필요해요. 설정 앱 > BrainBox에서 \'위치(항상)\'와 \'알림\'을 허용해 주세요.' },
  openSettingsAppButton:     { ja: '設定アプリを開く',                en: 'Open Settings',                 ko: '설정 앱 열기' },
  noLocationsYet:            { ja: '場所が登録されていません',           en: 'No locations registered',       ko: '등록된 장소가 없어요' },
  radiusLabel:               { ja: '半径{r}m',                    en: '{r}m radius',                   ko: '반경 {r}m' },
  deleteLocationConfirmTitle: { ja: 'この場所を削除しますか？',          en: 'Delete this location?',         ko: '이 장소를 삭제할까요?' },
  searchLocationSectionLabel: { ja: '場所を検索',                    en: 'Search for a place',            ko: '장소 검색' },
  addressPlaceholder:        { ja: '住所や施設名を入力',                en: 'Enter an address or place name', ko: '주소나 장소명 입력' },
  searchingLabel:            { ja: '検索中',                       en: 'Searching',                     ko: '검색 중' },
  searchLabel:               { ja: '検索',                        en: 'Search',                        ko: '검색' },
  gettingLocationLabel:      { ja: '取得中...',                    en: 'Getting location...',           ko: '가져오는 중...' },
  pickOnMapButton:           { ja: '地図で指定',                    en: 'Choose on map',                 ko: '지도에서 지정' },
  useCurrentLocationButton:  { ja: '現在地から登録',                  en: 'Use current location',          ko: '현재 위치로 등록' },
  notifyRadiusSectionLabel:  { ja: '通知する範囲',                   en: 'Notification range',            ko: '알림 범위' },
  nameSectionLabel:          { ja: '名前',                        en: 'Name',                          ko: '이름' },
  placeNamePlaceholder:      { ja: '場所の名前',                    en: 'Place name',                    ko: '장소 이름' },
  changeOnMapButton:         { ja: '地図で場所を変更',                en: 'Change location on map',        ko: '지도에서 장소 변경' },
  registerButton:            { ja: '登録',                        en: 'Register',                      ko: '등록' },
  couldNotGetLocation:       { ja: '現在地を取得できませんでした',         en: 'Couldn’t get your current location', ko: '현재 위치를 가져올 수 없었어요' },

  // 設定 → 表示設定（空き時間カード・テーマカラー・アプリアイコン）
  freeCardScreenTitle:       { ja: '空き時間カード',                  en: 'Free time cards',               ko: '여유 시간 카드' },
  showFreeCardLabel:         { ja: '空き時間カードを表示',              en: 'Show free time cards',          ko: '여유 시간 카드 표시' },
  minDisplayTimeLabel:       { ja: '最小表示時間',                   en: 'Minimum duration to show',      ko: '최소 표시 시간' },
  themeColorRowTitle:        { ja: 'テーマカラー',                    en: 'Theme color',                   ko: '테마 색상' },
  appIconRowTitle:           { ja: 'アプリアイコン',                   en: 'App icon',                      ko: '앱 아이콘' },
  freeCardShownDesc:         { ja: '表示中・最小{n}分',                en: 'Shown · min {n}m',              ko: '표시 중·최소 {n}분' },
  freeCardHiddenDesc:        { ja: '非表示',                       en: 'Hidden',                        ko: '숨김' },
  themeColorScreenSubtitle:  { ja: 'テーマを選択するとアプリ全体の色が切り替わります', en: 'Choose a theme to change the app’s color throughout', ko: '테마를 선택하면 앱 전체 색상이 바뀌어요' },
  weekStartRowTitle:         { ja: '週の開始日',                     en: 'Week starts on',                ko: '주 시작 요일' },
  weekStartSunday:           { ja: '日曜日',                       en: 'Sunday',                        ko: '일요일' },
  weekStartMonday:           { ja: '月曜日',                       en: 'Monday',                        ko: '월요일' },
  fontSizeRowTitle:          { ja: '文字サイズ',                     en: 'Font size',                     ko: '글자 크기' },
  fontSizeSmall:             { ja: '小',                          en: 'Small',                         ko: '작게' },
  fontSizeStandard:          { ja: '標準',                         en: 'Standard',                      ko: '보통' },
  fontSizeLarge:             { ja: '大',                          en: 'Large',                         ko: '크게' },
  fontSizeXLarge:            { ja: '特大',                         en: 'Extra Large',                   ko: '아주 크게' },
  appIconScreenSubtitle:     { ja: '選択したアイコンがホーム画面に反映されます',   en: 'Your chosen icon will appear on your home screen', ko: '선택한 아이콘이 홈 화면에 적용돼요' },

  // 設定 → 生活パターン
  lifePatternsFreeLimitNote: { ja: '1個まで無料でご利用いただけます。2個目からPROが必要です。', en: 'You can use up to 1 for free. PRO is required for a 2nd.', ko: '1개까지 무료로 이용할 수 있어요. 2개째부터는 PRO가 필요해요.' },
  lifePatternsIntro1:        { ja: 'シフトや予定に合わせて、日ごとの起床・就寝時間を変更できます', en: 'Change your wake and sleep times per day to match shifts or plans', ko: '근무 교대나 일정에 맞춰 요일별 기상·취침 시간을 바꿀 수 있어요' },
  lifePatternsIntro2:        { ja: 'パターンを追加・選択して日付をタップ',      en: 'Add or select a pattern, then tap a date', ko: '패턴을 추가·선택하고 날짜를 탭하세요' },
  noPatternsYet:             { ja: 'パターンがまだありません',            en: 'No patterns yet',               ko: '아직 패턴이 없어요' },
  deletePatternButton:       { ja: 'このパターンを削除',                en: 'Delete this pattern',           ko: '이 패턴 삭제' },
  patternNamePlaceholder:    { ja: 'パターン名（例：平日、休日、早番、遅番）', en: 'Pattern name (e.g. Weekday, Day off, Early shift)', ko: '패턴 이름(예: 평일, 휴일, 오전 근무, 오후 근무)' },
  addPatternButton:          { ja: '＋ パターンを追加',                 en: '+ Add pattern',                 ko: '+ 패턴 추가' },
  deletePatternAffectedBody: { ja: 'このパターンを設定した{n}日分の日付も解除されます', en: 'This will also clear it from {n} date(s) where it’s set', ko: '이 패턴을 설정한 {n}일의 날짜도 함께 해제돼요' },
  deletePatternSimpleBody:   { ja: 'このパターンを削除します',            en: 'This pattern will be deleted',  ko: '이 패턴을 삭제해요' },
  changePatternConfirmTitle: { ja: '「{name}」の内容を変更しますか？',      en: 'Save changes to "{name}"?',     ko: '\'{name}\'의 내용을 변경할까요?' },
  changePatternAffectedBody: { ja: 'このパターンを設定した{n}日分にも反映されます', en: 'This will also apply to {n} date(s) where it’s set', ko: '이 패턴을 설정한 {n}일에도 함께 반영돼요' },
  changePatternSimpleBody:   { ja: 'この内容で保存します',               en: 'Your changes will be saved',    ko: '이 내용으로 저장해요' },

  // 設定 → 忘れ物防止アラート（ForgetAlertsPanel）
  dayOffLabel:               { ja: '休日',                        en: 'Weekend',                       ko: '휴일' },
  customLabel:               { ja: 'カスタム',                      en: 'Custom',                        ko: '사용자 지정' },
  forgetAlertFreeLimitNote:  { ja: '1件まで無料でご利用いただけます。2件目からPROが必要です。', en: 'You can use up to 1 for free. PRO is required for a 2nd.', ko: '1건까지 무료로 이용할 수 있어요. 2건째부터는 PRO가 필요해요.' },
  noAlertsYet:               { ja: 'アラートが登録されていません',          en: 'No alerts registered',          ko: '등록된 알림이 없어요' },
  forgetAlertArriveLabel:    { ja: '{place}に着いたとき',              en: 'Arrive at {place}',             ko: '{place}에 도착했을 때' },
  forgetAlertLeaveLabel:     { ja: '{place}を出るとき',               en: 'Leave {place}',                 ko: '{place}을(를) 떠날 때' },
  deleteAlertConfirmTitle:   { ja: 'このアラートを削除しますか？',          en: 'Delete this alert?',            ko: '이 알림을 삭제할까요?' },
  createForgetAlertTitle:    { ja: '忘れ物防止通知を作成',              en: 'Create alert',                  ko: '분실물 방지 알림 만들기' },
  placeSectionLabel:         { ja: '場所',                        en: 'Place',                         ko: '장소' },
  conditionSectionLabel:     { ja: '条件',                        en: 'Condition',                     ko: '조건' },
  arriveOptionLabel:         { ja: '到着したら',                     en: 'On arrival',                    ko: '도착하면' },
  leaveOptionLabel:          { ja: '出発したら',                     en: 'On departure',                  ko: '출발하면' },
  timeRangeOptionalLabel:    { ja: '時間帯（任意）',                   en: 'Time range (optional)',         ko: '시간대(선택)' },
  allDayNote:                { ja: '指定しない場合は終日対象になります',       en: 'Leave blank to apply all day',  ko: '지정하지 않으면 하루 종일 적용돼요' },
  itemsSectionLabel:         { ja: '持ち物',                       en: 'Items',                         ko: '준비물' },
  itemsPlaceholder:          { ja: '財布、鍵など',                    en: 'Wallet, keys, etc.',            ko: '지갑, 열쇠 등' },
  previewSectionLabel:       { ja: 'プレビュー',                     en: 'Preview',                       ko: '미리보기' },
  previewNoPlace:            { ja: '（場所未設定）',                   en: '(no place set)',                ko: '(장소 미설정)' },
  previewNoItems:            { ja: '（持ち物未設定）',                  en: '(no items set)',                ko: '(준비물 미설정)' },
  previewCheckItemsBody:     { ja: '{items}を確認してください。',         en: '{items}.',                      ko: '{items}을(를) 확인하세요.' },
  useCurrentLocationShortButton: { ja: '現在地から',                 en: 'Current location',              ko: '현재 위치' },
  forgetAlertLocationPermError: { ja: '場所を出たときに通知するため、位置情報の利用を許可してください。', en: 'To get notified when you leave a place, please allow location access.', ko: '장소를 떠날 때 알림을 받으려면 위치 정보 사용을 허용해 주세요.' },

  // 設定 → アカウント
  appleAccountTitle:         { ja: 'Appleアカウント',                 en: 'Apple Account',                 ko: 'Apple 계정' },
  comingSoonDesc:            { ja: '近日リリース予定',                  en: 'Coming soon',                   ko: '출시 예정' },
  icloudBackupTitle:         { ja: 'iCloudバックアップ',               en: 'iCloud Backup',                 ko: 'iCloud 백업' },
  syncStatusTitle:           { ja: '同期状態',                       en: 'Sync status',                   ko: '동기화 상태' },

  // 設定 → よくある質問（sub==='support'とsub==='faq'で共用）
  faqQ1: { ja: 'データはどこに保存されますか？', en: 'Where is my data stored?', ko: '데이터는 어디에 저장되나요?' },
  faqA1: { ja: 'すべてのデータはお使いのデバイスのローカルストレージに保存されます。外部サーバーへの送信は行いません。', en: 'All data is stored in local storage on your device. Nothing is sent to external servers.', ko: '모든 데이터는 사용 중인 기기의 로컬 저장소에 저장돼요. 외부 서버로 전송하지 않아요.' },
  faqQ2: { ja: 'アプリを削除するとデータはどうなりますか？', en: 'What happens to my data if I delete the app?', ko: '앱을 삭제하면 데이터는 어떻게 되나요?' },
  faqA2: { ja: 'アプリをアンインストールするとすべてのデータが削除されます。現在、クラウドバックアップ機能はありません。', en: 'All data is deleted when you uninstall the app. There is currently no cloud backup feature.', ko: '앱을 삭제하면 모든 데이터가 함께 삭제돼요. 현재 클라우드 백업 기능은 없어요.' },
  faqQ3: { ja: 'タスクを誤って削除してしまいました。復元できますか？', en: 'I accidentally deleted a task. Can I restore it?', ko: '태스크를 실수로 삭제했어요. 복구할 수 있나요?' },
  faqA3: { ja: '申し訳ありませんが、削除したタスクの復元機能は現在ありません。重要なタスクは削除前にご確認ください。', en: 'Sorry, there is currently no way to restore a deleted task. Please double-check before deleting important tasks.', ko: '죄송하지만 삭제한 태스크를 복구하는 기능은 아직 없어요. 중요한 태스크는 삭제 전에 다시 한번 확인해 주세요.' },
  faqQ4: { ja: '繰り返しタスクの一部だけ削除できますか？', en: 'Can I delete just one occurrence of a recurring task?', ko: '반복 태스크 중 일부만 삭제할 수 있나요?' },
  faqA4: { ja: 'はい。繰り返しタスクを削除する際、「この予定のみ削除」または「すべての予定を削除」を選択できます。', en: 'Yes. When deleting a recurring task, you can choose "Delete this occurrence only" or "Delete all occurrences."', ko: '네. 반복 태스크를 삭제할 때 \'이 일정만 삭제\' 또는 \'모든 일정 삭제\'를 선택할 수 있어요.' },
  faqQ5: { ja: '起床・就寝時間はどこで変更できますか？', en: 'Where can I change my wake and sleep times?', ko: '기상·취침 시간은 어디서 변경하나요?' },
  faqA5: { ja: '設定画面の「起床・就寝」から変更できます。タイムライン上の起床・就寝カードをタップしても変更できます。', en: 'You can change them from "Wake & sleep" in Settings, or by tapping the wake/sleep cards on the timeline.', ko: '설정 화면의 \'기상·취침\'에서 변경할 수 있어요. 타임라인의 기상·취침 카드를 탭해도 변경할 수 있어요.' },
  faqQ6: { ja: '「あとでやる」に移動したタスクはどこで確認できますか？', en: 'Where can I see tasks moved to "Later"?', ko: '\'나중에 할 일\'로 이동한 태스크는 어디서 확인하나요?' },
  faqA6: { ja: '画面下部のバーにある「あとでやる」ボタンをタップすると、あとでやるリストが表示されます。', en: 'Tap the "Later" button on the bottom bar to see the Later list.', ko: '화면 하단 바에 있는 \'나중에\' 버튼을 탭하면 나중에 할 일 목록이 표시돼요.' },

  // 設定 → お問い合わせ
  contactLineTitle:          { ja: 'LINEでお問い合わせ',                en: 'Contact us on LINE',            ko: 'LINE으로 문의하기' },
  contactLineBody:           { ja: 'ご質問やご要望がございましたら、公式LINEからお気軽にお問い合わせください。', en: 'If you have any questions or requests, feel free to reach out via our official LINE account.', ko: '질문이나 요청 사항이 있으시면 공식 LINE으로 편하게 문의해 주세요.' },
  contactLineResponseTime:   { ja: '通常、1〜3日以内にお返事いたします。',    en: 'We usually reply within 1–3 days.', ko: '보통 1~3일 이내에 답변드려요.' },
  contactLineButton:         { ja: 'LINEで問い合わせる',                en: 'Contact via LINE',              ko: 'LINE으로 문의하기' },
  contactEmailTitle:         { ja: 'メールでお問い合わせ',               en: 'Contact us by email',           ko: '이메일로 문의하기' },
  contactEmailBody:          { ja: 'LINEをご利用でない方は、メールでもお問い合わせいただけます。', en: 'If you don’t use LINE, you can also reach us by email.', ko: 'LINE을 사용하지 않으시면 이메일로도 문의할 수 있어요.' },
  contactEmailButton:        { ja: 'メールアプリで開く',                 en: 'Open in mail app',              ko: '메일 앱으로 열기' },

  // 設定 → プライバシーポリシー
  legalLastUpdated:          { ja: '最終更新日：2026年7月3日',            en: 'Last updated: July 3, 2026',    ko: '최종 업데이트: 2026년 7월 3일' },
  privacyAboutTitle:         { ja: 'BrainBoxについて',                en: 'About BrainBox',                ko: 'BrainBox 소개' },
  privacyAboutBody:          { ja: 'BrainBoxは、ADHD気質の方やToDoリストが続かない方向けに、1日のタスクを時間軸で見える化するタイムライン型タスク管理アプリです。\n本プライバシーポリシーは、本アプリにおける個人情報の取り扱いについて説明します。', en: 'BrainBox is a timeline-style task management app that visualizes your day’s tasks along a time axis, designed for people with ADHD tendencies or who struggle to keep up with to-do lists.\nThis Privacy Policy explains how personal information is handled in this app.', ko: 'BrainBox는 ADHD 성향이 있거나 할 일 목록을 꾸준히 지키기 어려운 분들을 위해, 하루의 태스크를 시간축으로 시각화하는 타임라인형 태스크 관리 앱이에요.\n이 개인정보처리방침은 본 앱에서 개인정보를 어떻게 다루는지 설명해요.' },
  privacyCollectTitle:       { ja: '取得する情報',                     en: 'Information we collect',        ko: '수집하는 정보' },
  privacyCollectBody:        { ja: '本アプリは、以下の情報をお客様のデバイス上にのみ保存します。\n・タスク名・日時・メモ・サブタスクなどの入力データ\n・起床・就寝時間などの設定情報\n・タグ・カテゴリ・繰り返し設定などのカスタマイズ情報\n\nこれらの情報は外部サーバーには送信されず、お客様のデバイス内のみで管理されます。', en: 'This app stores the following information only on your device.\n・Input data such as task names, dates/times, memos, and subtasks\n・Settings such as wake and sleep times\n・Customization info such as tags, categories, and recurrence settings\n\nThis information is never sent to external servers and is managed only on your device.', ko: '본 앱은 다음 정보를 사용자의 기기에만 저장해요.\n·태스크 이름·날짜/시간·메모·하위 작업 등의 입력 데이터\n·기상·취침 시간 등의 설정 정보\n·태그·카테고리·반복 설정 등의 커스터마이징 정보\n\n이 정보는 외부 서버로 전송되지 않으며, 사용자의 기기 안에서만 관리돼요.' },
  privacyPurposeTitle:       { ja: '情報の利用目的',                    en: 'Purpose of use',                ko: '정보 이용 목적' },
  privacyPurposeBody:        { ja: '取得した情報は、以下の目的にのみ使用します。\n・タスクの表示・管理・検索機能の提供\n・繰り返しタスクのスケジュール生成\n・アプリ設定の保持', en: 'The information collected is used only for the following purposes.\n・Providing task display, management, and search features\n・Generating schedules for recurring tasks\n・Retaining app settings', ko: '수집한 정보는 다음 목적으로만 사용해요.\n·태스크 표시·관리·검색 기능 제공\n·반복 태스크의 일정 생성\n·앱 설정 유지' },
  privacyThirdPartyTitle:    { ja: '第三者提供について',                  en: 'Third-party disclosure',        ko: '제3자 제공에 대해' },
  privacyThirdPartyBody:     { ja: '本アプリは、お客様の個人情報を第三者に提供することはありません。\n\nただし、オプション機能としてAI文章生成機能（Groq APIを使用）をご利用いただく場合、入力したタスク情報が当該APIに送信されることがあります。詳細はGroq社のプライバシーポリシーをご確認ください。', en: 'This app does not provide your personal information to any third party.\n\nHowever, if you use the optional AI text generation feature (which uses the Groq API), the task information you enter may be sent to that API. Please review Groq’s privacy policy for details.', ko: '본 앱은 사용자의 개인정보를 제3자에게 제공하지 않아요.\n\n다만 선택 기능인 AI 문장 생성 기능(Groq API 사용)을 이용하실 경우, 입력한 태스크 정보가 해당 API로 전송될 수 있어요. 자세한 내용은 Groq사의 개인정보처리방침을 확인해 주세요.' },
  privacyDataMgmtTitle:      { ja: 'データの管理について',                 en: 'Data management',               ko: '데이터 관리에 대해' },
  privacyDataMgmtBody:       { ja: '本アプリのデータはすべてお客様のデバイス内（localStorage）に保存されます。\n・アプリをアンインストールするとすべてのデータが削除されます\n・デバイスの初期化によってデータが失われる場合があります\n・本アプリはデータのクラウドバックアップ機能を持ちません', en: 'All data for this app is stored on your device (localStorage).\n・All data is deleted when you uninstall the app\n・Data may be lost if your device is reset\n・This app has no cloud backup feature for data', ko: '본 앱의 데이터는 모두 사용자의 기기 안(localStorage)에 저장돼요.\n·앱을 삭제하면 모든 데이터가 함께 삭제돼요\n·기기를 초기화하면 데이터가 사라질 수 있어요\n·본 앱은 데이터의 클라우드 백업 기능이 없어요' },
  privacyRevisionTitle:      { ja: 'プライバシーポリシーの改定について',          en: 'Changes to this policy',        ko: '개인정보처리방침 개정에 대해' },
  privacyRevisionBody:       { ja: '本プライバシーポリシーは、法令の改正や機能追加に伴い改定される場合があります。重要な変更がある場合はアプリ内またはサポートページにてお知らせします。', en: 'This Privacy Policy may be revised due to changes in laws or the addition of new features. If there are any significant changes, we will notify you in the app or on our support page.', ko: '이 개인정보처리방침은 법령 개정이나 기능 추가에 따라 개정될 수 있어요. 중요한 변경 사항이 있을 경우 앱 내 또는 지원 페이지에서 안내해 드려요.' },

  // 設定 → 利用規約
  termsIntroTitle:           { ja: 'はじめに',                       en: 'Introduction',                  ko: '시작하며' },
  termsIntroBody:            { ja: '本利用規約（以下「本規約」）は、BrainBox（以下「本アプリ」）のご利用条件を定めるものです。本アプリをご利用いただくことで、本規約に同意したものとみなします。', en: 'These Terms of Service (the “Terms”) set out the conditions for using BrainBox (the “App”). By using the App, you are deemed to have agreed to these Terms.', ko: '이 이용약관(이하 \'본 약관\')은 BrainBox(이하 \'본 앱\')의 이용 조건을 정한 것이에요. 본 앱을 이용하시면 본 약관에 동의한 것으로 간주돼요.' },
  termsConditionsTitle:      { ja: '利用条件',                       en: 'Conditions of use',             ko: '이용 조건' },
  termsConditionsBody:       { ja: '本アプリは、個人的・非商業的な用途に限り無償でご利用いただけます。\n・本アプリの複製・改変・再配布は禁止します\n・本アプリを商業目的で利用することは禁止します\n・本アプリのリバースエンジニアリングは禁止します', en: 'This app is provided free of charge for personal, non-commercial use only.\n・Copying, modifying, or redistributing this app is prohibited\n・Using this app for commercial purposes is prohibited\n・Reverse engineering this app is prohibited', ko: '본 앱은 개인적·비상업적 용도에 한해 무료로 이용할 수 있어요.\n·본 앱의 복제·변경·재배포는 금지돼요\n·본 앱을 상업적 목적으로 이용하는 것은 금지돼요\n·본 앱의 리버스 엔지니어링은 금지돼요' },
  termsDisclaimerTitle:      { ja: '免責事項',                       en: 'Disclaimer',                    ko: '면책 조항' },
  termsDisclaimerBody:       { ja: '本アプリは現状有姿で提供されます。本アプリの利用によって生じたいかなる損害についても、開発者は責任を負いません。\n・データの消失・破損に関する損害\n・本アプリの不具合・停止による損害\n・その他、本アプリの利用に起因する損害\n\n重要なデータは定期的にバックアップされることをお勧めします。', en: 'This app is provided “as is.” The developer is not liable for any damages arising from the use of this app.\n・Damages related to data loss or corruption\n・Damages caused by malfunctions or outages of this app\n・Other damages arising from the use of this app\n\nWe recommend backing up important data regularly.', ko: '본 앱은 있는 그대로 제공돼요. 본 앱의 이용으로 발생하는 어떠한 손해에 대해서도 개발자는 책임을 지지 않아요.\n·데이터 손실·손상에 관한 손해\n·본 앱의 오류·중단으로 인한 손해\n·기타 본 앱의 이용으로 인해 발생하는 손해\n\n중요한 데이터는 정기적으로 백업하시길 권장해요.' },
  termsIpTitle:              { ja: '知的財産権',                      en: 'Intellectual property',         ko: '지적 재산권' },
  termsIpBody:               { ja: '本アプリに関する著作権その他の知的財産権は、開発者に帰属します。本規約に定める範囲を超えた利用は禁止します。', en: 'Copyright and other intellectual property rights related to this app belong to the developer. Use beyond the scope set out in these Terms is prohibited.', ko: '본 앱에 관한 저작권 및 기타 지적 재산권은 개발자에게 귀속돼요. 본 약관에서 정한 범위를 넘어서는 이용은 금지돼요.' },
  termsChangesTitle:         { ja: 'サービスの変更・終了',                 en: 'Changes or termination of service', ko: '서비스 변경·종료' },
  termsChangesBody:          { ja: '開発者は、予告なく本アプリの機能変更・サービスの一部または全部の終了を行う場合があります。これによってお客様に生じた損害について、開発者は責任を負いません。', en: 'The developer may change features of this app or terminate part or all of the service without prior notice. The developer is not liable for any damages this causes you.', ko: '개발자는 사전 예고 없이 본 앱의 기능을 변경하거나 서비스의 일부 또는 전부를 종료할 수 있어요. 이로 인해 사용자에게 발생하는 손해에 대해 개발자는 책임을 지지 않아요.' },
  termsRevisionTitle:        { ja: '規約の変更',                       en: 'Changes to these Terms',        ko: '약관 변경' },
  termsRevisionBody:         { ja: '開発者は、必要に応じて本規約を変更することがあります。変更後の規約は本ページにて公開します。重要な変更がある場合はアプリ内またはサポートページにてお知らせします。', en: 'The developer may change these Terms as needed. The revised Terms will be published on this page. If there are any significant changes, we will notify you in the app or on our support page.', ko: '개발자는 필요에 따라 본 약관을 변경할 수 있어요. 변경된 약관은 이 페이지에 공개돼요. 중요한 변경 사항이 있을 경우 앱 내 또는 지원 페이지에서 안내해 드려요.' },

  // 設定 → PRO
  proUpgradeTitle:           { ja: 'PROにアップグレード',                en: 'Upgrade to PRO',                ko: 'PRO로 업그레이드' },
  proUpgradeSubtitle:        { ja: 'より便利な機能で、毎日をもっとスムーズに', en: 'More convenient features for a smoother everyday', ko: '더 편리한 기능으로 매일을 더 순조롭게' },
  proFeatureListLabel:       { ja: '★ PRO 機能一覧',                  en: '★ PRO Features',                ko: '★ PRO 기능 목록' },
  proHeaderFeature:          { ja: '機能',                         en: 'Feature',                       ko: '기능' },
  proHeaderFree:             { ja: '無料',                         en: 'Free',                          ko: '무료' },
  proFeatureCustomRecurrence: { ja: '繰り返し間隔カスタム',              en: 'Custom recurrence intervals',   ko: '반복 간격 사용자 지정' },
  proFeatureAppIconChange:   { ja: 'アプリアイコン変更',                en: 'App icon change',               ko: '앱 아이콘 변경' },
  proFeatureWakeSleepIconColor: { ja: '起床・就寝アイコン色変更',          en: 'Wake/sleep icon color',         ko: '기상·취침 아이콘 색상 변경' },
  proFeatureDeadline:        { ja: '締切管理',                       en: 'Deadline management',           ko: '마감일 관리' },
  proFeatureLaterLocationNotify: { ja: 'あとでやるの場所通知',            en: 'Location alerts for Later tasks', ko: '나중에 할 일의 위치 알림' },
  proValCount1:              { ja: '1個',                          en: '1',                             ko: '1개' },
  proValCount2:              { ja: '2個',                          en: '2',                             ko: '2개' },
  proValUnlimited:           { ja: '無制限',                        en: 'Unlimited',                     ko: '무제한' },
  proValOncePerMonth:        { ja: '月1回',                         en: '1/month',                       ko: '월 1회' },
  proValFull:                { ja: '完全対応',                       en: 'Full',                          ko: '완전 지원' },
  proValBasicOnly:           { ja: '基本のみ',                       en: 'Basic only',                    ko: '기본만' },
  proValMintOnly:            { ja: 'ミントのみ',                      en: 'Mint only',                     ko: '민트만' },
  proVal9Colors:             { ja: '9色',                          en: '9 colors',                      ko: '9색' },
  proValSupported:           { ja: '対応',                         en: 'Supported',                     ko: '지원' },
  proValDefaultOnly:         { ja: '既定のみ',                       en: 'Default only',                  ko: '기본값만' },
  proActiveTitle:            { ja: 'PROプランを利用中です',              en: 'You’re on the PRO plan',        ko: 'PRO 플랜을 이용 중이에요' },
  proActiveDesc:             { ja: 'すべての機能をご利用いただけます',        en: 'All features are available to you', ko: '모든 기능을 이용할 수 있어요' },
  proPricingLabel:           { ja: '料金プラン',                      en: 'Pricing',                       ko: '요금제' },
  proTrialTitle:             { ja: '7日間無料トライアル',                en: '7-day free trial',              ko: '7일 무료 체험' },
  proTrialAfter:             { ja: 'トライアル終了後 月額',              en: 'After trial, per month',        ko: '체험 종료 후 월' },
  proTrialCancelNote:        { ja: 'いつでもキャンセル可能',              en: 'Cancel anytime',                ko: '언제든지 취소 가능' },
  proStartTrialButton:       { ja: '7日間無料で始める',                 en: 'Start 7-day free trial',        ko: '7일 무료로 시작하기' },
  proProcessingLabel:        { ja: '処理中...',                      en: 'Processing...',                 ko: '처리 중...' },
  proRestoreButton:          { ja: '購入を復元',                      en: 'Restore purchase',              ko: '구매 복원' },
  proPurchaseFailedAlert:    { ja: '購入処理に失敗しました。時間をおいて再度お試しください。', en: 'Purchase failed. Please try again later.', ko: '구매 처리에 실패했어요. 잠시 후 다시 시도해 주세요.' },
  proRestoreNotFoundAlert:   { ja: '復元できる購入履歴が見つかりませんでした', en: 'No purchase history found to restore', ko: '복원할 수 있는 구매 내역을 찾지 못했어요' },

  // プッシュ通知の本文（LocalNotify経由。タイトル・本文とも言語設定に追従させる）
  notifTaskStartingSoon:     { ja: 'そろそろ始めましょう（{time}〜）',        en: 'Starting soon ({time})',        ko: '슬슬 시작할 시간이에요 ({time}~)' },
  notifTaskTomorrow:         { ja: '明日{time}から予定があります',           en: 'You have plans tomorrow at {time}', ko: '내일 {time}부터 일정이 있어요' },
  notifTaskIn1Hour:          { ja: 'あと1時間で始まります（{time}〜）',       en: 'Starting in 1 hour ({time})',   ko: '1시간 후 시작해요 ({time}~)' },
  notifTaskInMinutes:        { ja: 'あと{n}分で始まります（{time}〜）',       en: 'Starting in {n} min ({time})',  ko: '{n}분 후 시작해요 ({time}~)' },
  notifDeadlineDays:         { ja: '{name}期限まで、あと{n}日です。',        en: '{n} day(s) left until {name} is due.', ko: '{name} 마감까지 {n}일 남았어요.' },
  notifDeadlineHours:        { ja: '{name}期限まで、あと{n}時間です。',       en: '{n} hour(s) left until {name} is due.', ko: '{name} 마감까지 {n}시간 남았어요.' },
  notifDeadlineToday:        { ja: '{name}期限は今日です。',               en: '{name} is due today.',          ko: '{name} 마감일은 오늘이에요.' },
  notifDeadlineNow:          { ja: '{name}の期限になりました。',            en: '{name} is now due.',            ko: '{name}의 마감 시각이 됐어요.' },
  notifThisTaskFallback:     { ja: 'このタスク',                        en: 'This task',                     ko: '이 태스크' },
  notifWakeCheckinTitle:     { ja: 'おはようございます',                    en: 'Good morning',                  ko: '좋은 아침이에요' },
  notifWakeCheckinBody:      { ja: '今日の予定をチェックしましょう',          en: "Check today's schedule",        ko: '오늘 일정을 확인해 보세요' },
  notifWakeCheckinBodyPast:  { ja: '今日の予定をチェックしましょう。昨日のタスクが{n}件残っています', en: "Check today's schedule. You have {n} unfinished task(s) from yesterday.", ko: '오늘 일정을 확인해 보세요. 어제 태스크가 {n}개 남아 있어요' },
  notifYesterdayTasksTitle:  { ja: '昨日のタスクが残っています',              en: 'You have tasks left from yesterday', ko: '어제 태스크가 남아 있어요' },
  notifYesterdayTasksBody:   { ja: '昨日のタスクが{n}件残っています',         en: 'You have {n} unfinished task(s) from yesterday', ko: '어제 태스크가 {n}개 남아 있어요' },
  notifShopListTitle:        { ja: '買い物リスト',                        en: 'Shopping list',                 ko: '쇼핑 목록' },
  notifShopListBody:         { ja: '未購入 {n}件: {names}',              en: '{n} item(s) left: {names}',     ko: '미구매 {n}개: {names}' },
  notifLaterStaleTitle:      { ja: 'あとでやるが溜まっています',              en: 'Later tasks are piling up',     ko: '나중에 할 일이 쌓이고 있어요' },
  notifLaterStaleBody:       { ja: '{n}件が長時間放置されています: {names}', en: '{n} task(s) left unfinished for a while: {names}', ko: '{n}개가 오래 방치되고 있어요: {names}' },
  notifLaterStaleBodySingle: { ja: '「{name}」が長時間放置されています',       en: '"{name}" has been left unfinished for a while', ko: '\'{name}\'이(가) 오래 방치되고 있어요' },
  notifFreeTimeTitle:        { ja: '空き時間ができました',                  en: 'You have free time',            ko: '여유 시간이 생겼어요' },
  notifFreeTimeBodyMulti:    { ja: '「{name}」など{n}件のタスクがあります',    en: 'You have {n} tasks, including "{name}"', ko: '\'{name}\' 외 {n}개의 태스크가 있어요' },
  notifFreeTimeBodySingle:   { ja: '「{name}」をやってみませんか？',          en: 'Why not try "{name}"?',          ko: '\'{name}\'을(를) 해보는 건 어때요?' },
  deadlinePreviewLabel:      { ja: '通知される内容（{n}件）',               en: 'Notifications to be sent ({n})', ko: '전송될 알림 내용 ({n}건)' },

  // PROペイウォールシート（ProGateSheet）自体の固定文言
  proSheetTitle:        { ja: 'Proプランが必要です',                     en: 'PRO plan required',             ko: 'PRO 플랜이 필요해요' },
  proSheetBodyFeature:  { ja: '「{feature}」はProプランでご利用いただけます。', en: '"{feature}" is available with the PRO plan.', ko: '\'{feature}\'은(는) PRO 플랜에서 이용할 수 있어요.' },
  proSheetBodyGeneric:  { ja: 'この機能はProプランでご利用いただけます。',       en: 'This feature is available with the PRO plan.', ko: '이 기능은 PRO 플랜에서 이용할 수 있어요.' },
  proSheetNote:         { ja: '設定画面のPROから登録できます。',              en: 'You can subscribe from PRO in Settings.', ko: '설정 화면의 PRO에서 등록할 수 있어요.' },
  proSheetViewButton:   { ja: 'PROプランを見る',                        en: 'View PRO plan',                 ko: 'PRO 플랜 보기' },
  proSheetClose:        { ja: '閉じる',                                en: 'Close',                          ko: '닫기' },

  // ProGateSheetのfeatureに渡す機能名（PROゲートの対象になる操作の説明）
  proFeatureTags:            { ja: 'タグを3個以上作成',              en: 'Creating 3+ tags',              ko: '태그 3개 이상 만들기' },
  proFeatureBulkInput:       { ja: '一括入力を月2回以上利用',          en: 'Using bulk input more than once a month', ko: '일괄 입력을 월 2회 이상 이용' },
  proFeatureIconUse:         { ja: 'アイコン「{name}」の使用',         en: 'Using the "{name}" icon',       ko: '\'{name}\' 아이콘 사용' },
  proFeatureTabs:            { ja: 'ファイルタブを2個以上作成',         en: 'Creating 2+ file tabs',         ko: '파일 탭 2개 이상 만들기' },
  proFeatureLaterInterval:   { ja: 'タスク放置通知の間隔変更',          en: 'Changing the later-task alert interval', ko: '태스크 방치 알림 간격 변경' },
  proFeatureInactiveInterval:{ ja: 'アプリ放置通知の間隔変更',          en: 'Changing the app-inactivity alert interval', ko: '앱 방치 알림 간격 변경' },
  proFeatureThemeColor:      { ja: 'テーマカラーの変更',              en: 'Changing the theme color',      ko: '테마 색상 변경' },
  proFeatureAppIcon:         { ja: 'アプリアイコンの変更',             en: 'Changing the app icon',         ko: '앱 아이콘 변경' },
  proFeatureLifePatterns:    { ja: '生活パターンを2個以上登録',         en: 'Registering 2+ life patterns',  ko: '생활 패턴 2개 이상 등록' },
  proFeatureWakeSleepColor:  { ja: '起床・就寝アイコンの色変更',        en: 'Changing the wake/sleep icon color', ko: '기상·취침 아이콘 색상 변경' },
  proFeatureLocationNotify:  { ja: '場所で通知',                    en: 'Location-based notification',   ko: '위치로 알림' },
  proFeatureForgetAlerts:    { ja: '忘れ物防止通知（2件目以降）',       en: 'Forget-item alerts (2nd and beyond)', ko: '분실물 방지 알림(2건째부터)' },
  proFeatureCustomRepeat:    { ja: '繰り返しのカスタム設定',           en: 'Custom repeat settings',        ko: '반복 사용자 지정 설정' },

  // おすすめ機能カード（RECOMMENDATION_DEFS）
  recommendShoppingListTitle: { ja: '買い物リスト、使ってみませんか？',                    en: 'Want to try the shopping list?', ko: '쇼핑 목록, 한번 써보실래요?' },
  recommendShoppingListBody:  { ja: '買うものをまとめておくと、必要なときにすぐ確認できます。', en: 'Keep track of what to buy so you can check it anytime.', ko: '살 것을 미리 모아두면 필요할 때 바로 확인할 수 있어요.' },
  recommendLocationTitle:     { ja: '場所で通知、使ってみませんか？',                      en: 'Want to try location alerts?', ko: '위치 알림, 한번 써보실래요?' },
  recommendLocationBody:      { ja: 'よく行く場所に近づいたら、買い物リストを知らせてくれます。', en: "Get notified about your shopping list when you're near a place you often visit.", ko: '자주 가는 장소에 가까워지면 쇼핑 목록을 알려드려요.' },
  recommendRepeatTitle:       { ja: '繰り返しタスク、使ってみませんか？',                    en: 'Want to try repeating tasks?',  ko: '반복 태스크, 한번 써보실래요?' },
  recommendRepeatBody:        { ja: '毎日・毎週のタスクは繰り返し設定にしておくと登録の手間が省けます。', en: 'Set daily or weekly tasks to repeat so you don\'t have to re-add them.', ko: '매일·매주 하는 태스크는 반복으로 설정해두면 다시 등록하는 수고를 덜 수 있어요.' },
  recommendCta:               { ja: '使ってみる',                                     en: 'Try it',                        ko: '써보기' },
  recommendDismiss:           { ja: '今はしない',                                     en: 'Not now',                       ko: '나중에 할게요' },

  // タスク一括入力（設定 → タスク一括入力）
  bulkInputTitle:            { ja: 'タスク一括入力',                          en: 'Bulk add tasks',                ko: '태스크 일괄 입력' },
  bulkInputFreeLimitNote:    { ja: '月1回まで無料でご利用いただけます。2回目からPROが必要です。', en: 'Free for 1 use per month. PRO is required after that.', ko: '월 1회까지 무료로 이용할 수 있어요. 2회째부터는 PRO가 필요해요.' },
  bulkInputTaskInfoLabel:    { ja: 'タスク情報',                            en: 'Task info',                     ko: '태스크 정보' },
  bulkInputNamePlaceholder:  { ja: 'タスク名を入力',                          en: 'Enter a task name',             ko: '태스크 이름 입력' },
  fieldEndTime:              { ja: '終了時刻',                             en: 'End time',                      ko: '종료 시각' },
  bulkInputSelectDateLabel:  { ja: '日付を選択',                            en: 'Select dates',                  ko: '날짜 선택' },
  bulkInputDaysSelected:     { ja: '{n}日選択中',                          en: '{n} day(s) selected',           ko: '{n}일 선택됨' },
  bulkInputViewHistoryButton:{ ja: '履歴を見る',                            en: 'View history',                  ko: '기록 보기' },
  bulkInputRegisteredDone:   { ja: '登録しました',                          en: 'Registered!',                   ko: '등록했어요' },
  bulkInputRegisterButton:   { ja: '選択した日に登録',                        en: 'Register selected dates',       ko: '선택한 날짜에 등록' },
  iconSheetTitleShort:       { ja: 'アイコン',                             en: 'Icon',                          ko: '아이콘' },
  bulkHistoryTitle:          { ja: '登録履歴',                             en: 'Registration history',          ko: '등록 기록' },
  bulkHistoryEmpty:          { ja: 'まだ登録履歴がありません',                    en: 'No registration history yet',   ko: '아직 등록 기록이 없어요' },
  bulkHistoryEntryMeta:      { ja: '{start}〜{end} · {days}日 · {date}登録',   en: '{start}–{end} · {days} day(s) · Registered {date}', ko: '{start}~{end} · {days}일 · {date} 등록' },
  bulkEditButton:            { ja: '一括編集',                             en: 'Bulk edit',                     ko: '일괄 편집' },
  bulkDeleteButton:          { ja: '一括削除',                             en: 'Bulk delete',                   ko: '일괄 삭제' },
  bulkEditAllDaysNote:       { ja: '{n}日分すべてに反映されます',                 en: 'This will apply to all {n} day(s).', ko: '{n}일 전체에 반영돼요' },
  bulkDeleteAllDaysNote:     { ja: '{n}日分すべてのタスクが削除されます',            en: 'All tasks for {n} day(s) will be deleted.', ko: '{n}일의 모든 태스크가 삭제돼요' },

  // カスタム繰り返し設定（TaskModal、recur==='custom'）
  customRecIntervalLabel:  { ja: '① 間隔',           en: '① Interval',      ko: '① 간격' },
  customRecTimingLabel:    { ja: '② 実行タイミング',    en: '② Timing',        ko: '② 실행 시점' },
  customRecEndLabel:       { ja: '③ 終了条件',        en: '③ End condition', ko: '③ 종료 조건' },
  customRecUnitHour:       { ja: '時',              en: 'Hr',              ko: '시' },
  customRecUnitDay:        { ja: '日',              en: 'Day',             ko: '일' },
  customRecUnitWeek:       { ja: '週',              en: 'Wk',              ko: '주' },
  customRecUnitMonth:      { ja: '月',              en: 'Mo',              ko: '월' },
  customRecUnitYear:       { ja: '年',              en: 'Yr',              ko: '년' },
  customRecByDate:         { ja: '日付で指定',         en: 'By date',         ko: '날짜로 지정' },
  customRecByWeekday:      { ja: '曜日で指定',         en: 'By weekday',      ko: '요일로 지정' },
  customRecLastDay:        { ja: '月末',             en: 'Last day',        ko: '월말' },
  customRecLastWeek:       { ja: '最終',             en: 'Last',            ko: '마지막' },
  customRecMonthLabel:     { ja: '月',              en: 'Month',           ko: '월' },
  customRecDayLabel:       { ja: '日',              en: 'Day',             ko: '일' },
  customRecEndNever:       { ja: '終了なし',           en: 'No end',          ko: '종료 없음' },
  customRecEndDate:        { ja: '指定日まで',         en: 'Until date',      ko: '지정한 날짜까지' },
  customRecEndCount:       { ja: '回数で終了',         en: 'After N times',   ko: '횟수로 종료' },
  customRecTimesSuffix:    { ja: '回で終了',           en: 'times',           ko: '회로 종료' },

  // TaskModal 「あとでやる」の場所通知UI
  taskLocationPermError:      { ja: '場所に到着したときに通知するため、位置情報の利用を許可してください。', en: 'To get notified when you arrive at a place, please allow location access.', ko: '장소에 도착했을 때 알림을 받으려면 위치 정보 사용을 허용해 주세요.' },
  taskLocationLimitReached:   { ja: '場所通知の登録上限に達しています。他の場所通知をオフにしてから追加してください。', en: "You've reached the location alert limit. Turn off another location alert before adding a new one.", ko: '위치 알림 등록 개수가 한도에 도달했어요. 다른 위치 알림을 끈 후 추가해 주세요.' },
  taskLocationPermRevokedNote:{ ja: '位置情報または通知の許可が取り消されているため、この通知は届きません。設定アプリ > BrainBoxから「位置情報（常に）」と「通知」を許可してください。', en: 'Location or notification permission has been revoked, so this alert won’t arrive. Please allow "Location (Always)" and "Notifications" for BrainBox in Settings.', ko: '위치 정보 또는 알림 권한이 취소되어 이 알림이 전송되지 않아요. 설정 앱 > BrainBox에서 \'위치(항상)\'와 \'알림\'을 허용해 주세요.' },
  taskLocationRadiusNote:      { ja: '半径{r}m以内に入ったら通知します',    en: "You'll be notified within {r}m", ko: '반경 {r}m 이내에 들어오면 알려드려요' },
  changeLocationButton:        { ja: '場所を変更',                    en: 'Change location',               ko: '장소 변경' },
  taskLocationConfirmButton:   { ja: '設定する',                     en: 'Set',                            ko: '설정하기' },

  // ShopMapPicker（地図ピッカー、共有コンポーネント）
  mapPickedPlaceFallback:   { ja: '地図で指定した場所',            en: 'Location picked on map',        ko: '지도에서 지정한 장소' },
  mapDragPinchHint:         { ja: 'ドラッグで移動、ピンチで拡大縮小できます', en: 'Drag to move, pinch to zoom', ko: '드래그로 이동, 핀치로 확대·축소할 수 있어요' },
  mapConfirmingLabel:       { ja: '取得中...',                  en: 'Confirming...',                 ko: '확인 중...' },
  confirmThisLocationButton:{ ja: 'この位置に決定',              en: 'Confirm this location',         ko: '이 위치로 결정' },

  // MorningCheckModal（起床時「昨日のタスク」確認）
  morningCloseConfirmBody:    { ja: 'このまま閉じると、昨日のタスクは前日に残ります。閉じますか？', en: "If you close now, yesterday's tasks will stay on that day. Close anyway?", ko: '이대로 닫으면 어제 태스크는 그 날짜에 그대로 남아요. 닫을까요?' },
  morningSnoozeQuestion:      { ja: '何時間後に再通知しますか？',        en: 'When should we remind you again?', ko: '몇 시간 후에 다시 알려드릴까요?' },
  morningSnoozeMinutes:       { ja: '{m}分後',                    en: 'In {m} min',                    ko: '{m}분 후' },
  morningSnoozeHours:         { ja: '{h}時間後',                   en: 'In {h}h',                       ko: '{h}시간 후' },
  morningSnoozeHoursMinutes:  { ja: '{h}時間{m}分後',               en: 'In {h}h {m}m',                  ko: '{h}시간 {m}분 후' },
  morningSnoozeConfirmButton: { ja: 'この時間後に再通知する',          en: 'Remind me then',                ko: '이 시간 후 다시 알림' },
  morningTitle:               { ja: '昨日のタスク',                 en: "Yesterday's tasks",             ko: '어제 태스크' },
  morningRemainingCount:      { ja: '{n}件のタスクが残っています',        en: '{n} task(s) remaining',         ko: '{n}개의 태스크가 남아 있어요' },
  selectAllLabel:             { ja: 'すべて選択',                   en: 'Select all',                    ko: '전체 선택' },
  markDoneButton:             { ja: '完了した',                    en: 'Mark done',                     ko: '완료함' },
  moveToLaterButton:          { ja: 'あとでやるに戻す',               en: 'Move to Later',                 ko: '나중에 할 일로 되돌리기' },
  checkLaterButton:           { ja: 'あとで確認する',                en: "I'll check later",              ko: '나중에 확인할게요' },

  // 起床・就寝カラー/時間ピッカー・変更確認・初回設定プロンプト
  allDayLabel:                { ja: '終日',                       en: 'All day',                       ko: '종일' },
  wakeSleepIconColorTitle:    { ja: '{label}アイコンの色',            en: '{label} icon color',            ko: '{label} 아이콘 색상' },
  wakeSleepTimeChangeTitle:   { ja: '{label}時間を変更',             en: 'Change {label} time',           ko: '{label} 시간 변경' },
  dragToPlaceLabel:           { ja: 'ドラッグして配置',               en: 'Drag to place',                 ko: '드래그해서 배치' },
  settingConfirmNewTimeNote:  { ja: '{time} に変更します',            en: 'Change to {time}',              ko: '{time}(으)로 변경해요' },
  patternAppliedNote:         { ja: '「{name}」パターンが設定されています', en: '"{name}" pattern is applied',   ko: '\'{name}\' 패턴이 설정되어 있어요' },
  patternWillClearNote:       { ja: '変更するとこの日のパターンが解除されます', en: 'Changing this will clear the pattern for this day', ko: '변경하면 이 날의 패턴이 해제돼요' },
  clearPatternAndChangeTodayButton: { ja: 'パターンを解除してこの日だけ変更', en: 'Clear pattern and change today only', ko: '패턴을 해제하고 이 날만 변경' },
  changeTodayOnlyButton:      { ja: 'この日だけ変更',                en: 'Change today only',             ko: '이 날만 변경' },
  changeAllDaysButton:        { ja: '他の日も全部この時間に変更',          en: 'Change this time for all days', ko: '다른 날도 모두 이 시간으로 변경' },
  wakeSleepSetupTitle:        { ja: '起床・就寝時間を設定しよう',          en: "Let's set your wake & sleep time", ko: '기상·취침 시간을 설정해요' },
  wakeSleepSetupBody:         { ja: 'あなたの生活リズムに合わせてタイムラインを表示します。', en: "We'll show your timeline based on your daily rhythm.", ko: '사용자의 생활 리듬에 맞춰 타임라인을 보여드려요.' },
  laterButton:                { ja: 'あとで',                     en: 'Later',                         ko: '나중에' },

  // タブ表示フィルター・繰り返し予定の移動/変更確認
  tabFilterTitle:             { ja: '表示するタブを選択',              en: 'Choose tabs to show',           ko: '표시할 탭 선택' },
  showAllButton:              { ja: 'すべて表示',                   en: 'Show all',                      ko: '전체 표시' },
  noTabsCreatedYet:           { ja: 'タブが作成されていません',           en: 'No tabs created yet',           ko: '만들어진 탭이 없어요' },
  recurringMoveTitle:         { ja: '繰り返し予定の移動',              en: 'Move recurring task',           ko: '반복 일정 이동' },
  recurringMoveConfirmBody:   { ja: '「{name}」を {time} に移動しますか？', en: 'Move "{name}" to {time}?',      ko: '\'{name}\'을(를) {time}(으)로 이동할까요?' },
  recurringEditTitle:         { ja: '繰り返し予定の変更',              en: 'Edit recurring task',           ko: '반복 일정 변경' },
  recurringEditConfirmBody:   { ja: '「{name}」をどのように変更しますか？',   en: 'How do you want to change "{name}"?', ko: '\'{name}\'을(를) 어떻게 변경할까요?' },
  thisOccurrenceOnlyButton:   { ja: 'この予定のみ変更',               en: 'Change this occurrence only',   ko: '이 일정만 변경' },
  allOccurrencesButton:       { ja: 'すべての予定を変更',              en: 'Change all occurrences',        ko: '모든 일정 변경' },

  // 統計画面（準備中）
  statsScreenTitle:      { ja: '統計',                          en: 'Stats',                          ko: '통계' },
  comingSoonLabel:       { ja: '準備中',                         en: 'Coming soon',                    ko: '준비 중' },
  statsComingSoonDesc:   { ja: 'タスク完了の統計機能は近日公開予定です',      en: 'Task completion stats are coming soon', ko: '태스크 완료 통계 기능은 곧 제공될 예정이에요' },
  newTabDefaultName:     { ja: 'タブ',                          en: 'Tab',                            ko: '탭' },
} as const;

export type StringKey = keyof typeof STRINGS;

const LANG_KEY = 'tl-language-v1';

// ja→日本語、ko→韓国語、それ以外（enを含む未対応言語すべて）はenにフォールバックする
function detectLanguage(): Language {
  if (typeof navigator === 'undefined') return 'ja';
  const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
  for (const l of langs) {
    if (l && l.toLowerCase().startsWith('ja')) return 'ja';
  }
  for (const l of langs) {
    if (l && l.toLowerCase().startsWith('ko')) return 'ko';
  }
  return 'en';
}

export function getStoredLanguage(): Language | null {
  if (typeof window === 'undefined') return null;
  const v = localStorage.getItem(LANG_KEY);
  return v === 'ja' || v === 'en' || v === 'ko' ? v : null;
}

interface I18nContextValue {
  language: Language;
  // 言語ピッカーでチェックマークを表示する対象。'auto'の間はlocalStorageに何も保存されておらず、
  // 端末のシステム言語が変わればlanguageも次回起動時に追従する
  languagePref: LanguagePref;
  setLanguage: (lang: LanguagePref) => void;
  // page.tsxでは`t`がループ変数（タスク・タグ等）として頻繁に使われるため、
  // 衝突を避けて翻訳関数は`tr`という名前にしている
  tr: (key: StringKey) => string;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'ja',
  languagePref: 'auto',
  setLanguage: () => {},
  tr: (key) => STRINGS[key].ja,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('ja');
  const [languagePref, setLanguagePrefState] = useState<LanguagePref>('auto');

  // 初回マウント時のみ判定する。保存済みの言語があればそれを、無ければ端末の言語設定から判定する。
  // 初期stateの'ja'デフォルトはSSR/hydration対策の仮値でしかないため、ここで確定した言語だけを
  // app_languageユーザープロパティに記録する（仮値の'ja'を一瞬でも計測してしまわないように）
  useEffect(() => {
    const stored = getStoredLanguage();
    const lang = stored ?? detectLanguage();
    setLanguageState(lang);
    setLanguagePrefState(stored ?? 'auto');
    setAnalyticsUserProperty('app_language', lang);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (pref: LanguagePref) => {
    if (pref === 'auto') {
      localStorage.removeItem(LANG_KEY);
      const detected = detectLanguage();
      setLanguageState(detected);
      setLanguagePrefState('auto');
      setAnalyticsUserProperty('app_language', detected);
      return;
    }
    setLanguageState(pref);
    setLanguagePrefState(pref);
    localStorage.setItem(LANG_KEY, pref);
    setAnalyticsUserProperty('app_language', pref);
  };

  const tr = (key: StringKey) => STRINGS[key][language];

  return <I18nContext.Provider value={{ language, languagePref, setLanguage, tr }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
