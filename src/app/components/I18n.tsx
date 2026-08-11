'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { setAnalyticsUserProperty } from './Analytics';

export type Language = 'ja' | 'en';
// 言語ピッカーで選べる選択肢。'auto'は端末のシステム言語設定に追従する（明示的に選んだ場合のみlocalStorageに固定される）
export type LanguagePref = Language | 'auto';

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
  languageAutoLabel:     { ja: '自動',                          en: 'Automatic' },
  languageAutoDesc:      { ja: 'システム設定に従う',                  en: 'Match system setting' },

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

  // MonthCalendar / CalendarPage
  closeButton:               { ja: '閉じる',                       en: 'Close' },
  todayButton:               { ja: '今日',                        en: 'Today' },

  // SearchPage
  searchPlaceholder:         { ja: 'タスク・メモ・タブを検索...',        en: 'Search tasks, notes, tabs...' },
  searchEmptyPrompt:         { ja: 'タスク名・メモ・タブで検索',          en: 'Search by task name, note, or tab' },
  searchNoResults:           { ja: '「{q}」は見つかりませんでした',       en: 'No results for "{q}"' },

  // SettingsScreen（トップレベルのメニュー一覧）
  settingsTitle:             { ja: '設定',                        en: 'Settings' },
  sectionFeatures:           { ja: '基本機能',                     en: 'Basic features' },
  sectionNotifications:      { ja: '通知',                        en: 'Notifications' },
  sectionGeneral:            { ja: '一般',                        en: 'General' },
  sectionIntegration:        { ja: '連携',                        en: 'Integrations' },
  sectionSubscription:       { ja: 'サブスクリプション',              en: 'Subscription' },
  sectionInfo:               { ja: '情報',                        en: 'Info' },
  sectionDeveloper:          { ja: '開発者向け',                    en: 'Developer' },
  rowTagsTitle:              { ja: 'タグ',                        en: 'Tags' },
  rowTagsDesc:               { ja: 'タスクにラベルを付けて整理・検索',    en: 'Label tasks to organize and find them' },
  rowTabsTitle:              { ja: 'ファイルタブ',                   en: 'File tabs' },
  rowTabsDesc:               { ja: 'タスクをフォルダ別に管理',          en: 'Organize tasks into folders' },
  rowBulkInputTitle:         { ja: 'タスク一括入力',                 en: 'Bulk add tasks' },
  rowBulkInputDesc:          { ja: 'まとめてタスクを登録',             en: 'Add multiple tasks at once' },
  rowLifePatternsTitle:      { ja: '生活パターン',                   en: 'Life patterns' },
  rowLifePatternsDesc:       { ja: 'シフトや休日で起床・就寝時間を切り替え', en: 'Switch wake/sleep times for shifts or days off' },
  rowRecurringTitle:         { ja: '繰り返しタスク',                 en: 'Recurring tasks' },
  rowRecurringDesc:          { ja: '繰り返しタスクを管理',             en: 'Manage your recurring tasks' },
  rowWakeSleepTitle:         { ja: '起床・就寝',                    en: 'Wake & sleep' },
  rowWakeSleepDesc:          { ja: '起床時間、就寝時間を設定',          en: 'Set your wake and sleep times' },
  rowShopNotifTitle:         { ja: '買い物リスト通知',                en: 'Shopping list alerts' },
  rowShopNotifDesc:          { ja: '時間や場所で買い物リストを通知',      en: 'Get notified by time or location' },
  rowLaterAlertTitle:        { ja: '放置通知',                      en: 'Inactivity alerts' },
  rowLaterAlertDesc:         { ja: 'タスクやアプリの放置を通知',         en: 'Get reminded about neglected tasks or the app' },
  rowForgetAlertTitle:       { ja: '忘れ物防止通知',                  en: 'Forgotten item alerts' },
  rowForgetAlertDesc:        { ja: '場所を出るときに持ち物を確認',        en: 'Check your belongings when leaving a place' },
  rowNotificationsTitle:     { ja: '通知',                        en: 'Notifications' },
  rowNotificationsDesc:      { ja: '通知設定',                      en: 'Notification settings' },
  rowDisplayTitle:           { ja: '表示設定',                      en: 'Display' },
  rowDisplayDesc:            { ja: '外観、言語など',                  en: 'Appearance, language, and more' },
  rowAccountTitle:           { ja: 'アカウント',                     en: 'Account' },
  rowAccountDesc:            { ja: 'Appleアカウント・iCloudバックアップ', en: 'Apple account & iCloud backup' },
  rowProTitle:               { ja: 'PRO',                         en: 'PRO' },
  rowProActive:              { ja: '利用中',                       en: 'Active' },
  rowProPrice:               { ja: '月額{price}',                   en: '{price}/month' },
  rowPrivacyTitle:           { ja: 'プライバシーポリシー',              en: 'Privacy policy' },
  rowTermsTitle:             { ja: '利用規約',                      en: 'Terms of service' },
  rowFaqTitle:               { ja: 'よくある質問',                   en: 'FAQ' },
  rowContactTitle:           { ja: 'お問い合わせ',                   en: 'Contact us' },
  rowAppVersionTitle:        { ja: 'アプリバージョン',                en: 'App version' },
  rowDevModeTitle:           { ja: '開発者モード',                   en: 'Developer mode' },
  rowDevModeDesc:            { ja: '検証用の状態を切り替える',          en: 'Toggle states for testing' },

  // 設定 → ファイルタブ / タグ（共通の確認ダイアログを含む）
  fileTabsFreeLimitNote:     { ja: '1個まで無料でご利用いただけます。2個目からPROが必要です。', en: 'You can use up to 1 for free. PRO is required for a 2nd.' },
  newTabSectionLabel:        { ja: '新しいタブ',                     en: 'New tab' },
  tabNamePlaceholder:        { ja: 'タブ名を入力',                    en: 'Enter a tab name' },
  tabListSectionLabel:       { ja: 'タブ一覧',                      en: 'Tabs' },
  showInAllLabel:            { ja: '【すべて】タブに表示',              en: 'Show in "All" tab' },
  confirmButton:             { ja: '確定',                        en: 'Confirm' },
  editButton:                { ja: '編集',                        en: 'Edit' },
  deleteButton:              { ja: '削除',                        en: 'Delete' },
  noTabsYet:                 { ja: 'タブがまだありません',              en: 'No tabs yet' },
  deleteNamedConfirmTitle:   { ja: '「{name}」を削除しますか？',         en: 'Delete "{name}"?' },
  deleteTabConfirmBody:      { ja: 'このタブのタスクをどうしますか？',       en: 'What should happen to this tab’s tasks?' },
  moveTasksToAllButton:      { ja: 'タスクを【すべて】に移動',           en: 'Move tasks to "All"' },
  deleteTasksTooButton:      { ja: 'タスクも完全に削除',               en: 'Delete tasks too' },
  confirmDeleteTitle:        { ja: '本当に削除しますか？',              en: 'Are you sure?' },
  deleteAllTasksInTabBody:   { ja: '「{name}」のタスクもすべて完全に削除されます', en: 'All tasks in "{name}" will be permanently deleted too' },
  moveTasksToAllBody:        { ja: '「{name}」のタスクは【すべて】タブに移動されます', en: 'Tasks in "{name}" will be moved to the "All" tab' },
  deletePermanentlyButton:   { ja: '完全に削除する',                  en: 'Delete permanently' },
  moveAndDeleteButton:       { ja: '移動して削除する',                 en: 'Move & delete' },
  backButton:                { ja: '戻る',                        en: 'Back' },
  noTagsYet:                 { ja: 'タグがまだありません',              en: 'No tags yet' },
  tagsFreeLimitNote:         { ja: '2個まで無料でご利用いただけます。3個目からPROが必要です。', en: 'You can use up to 2 for free. PRO is required for a 3rd.' },
  newTagSectionLabel:        { ja: '新しいタグ',                     en: 'New tag' },
  tagNamePlaceholder:        { ja: 'タグ名を入力',                    en: 'Enter a tag name' },
  tagListSectionLabel:       { ja: 'タグ一覧',                      en: 'Tags' },
  deleteTagConfirmBody:      { ja: 'このタグがついているタスクからも削除されます', en: 'It will also be removed from tasks that use this tag' },
  renameNamedConfirmTitle:   { ja: '「{name}」を変更しますか？',         en: 'Rename "{name}"?' },
  renameTagConfirmBody:      { ja: 'このタグがついているすべてのタスクのタグ名・色も変更されます', en: 'This will update the name and color on all tasks that use this tag' },
  changeButton:              { ja: '変更する',                      en: 'Save' },

  // 設定 → 繰り返しタスク
  noRecurringTasks:          { ja: '繰り返しタスクはありません',         en: 'No recurring tasks' },
  noRecurringTasksHint:      { ja: 'タスク作成時に「繰り返し」を選ぶと、ここに表示されます', en: 'Choose "Recurring" when creating a task to see it here' },

  // 設定 → 起床・就寝
  timeSettingsSectionLabel:  { ja: '時間設定',                      en: 'Time settings' },
  wakeIconColorLabel:        { ja: '起床アイコンの色',                en: 'Wake icon color' },
  sleepIconColorLabel:       { ja: '就寝アイコンの色',                en: 'Sleep icon color' },
  dailyOverrideTitle:        { ja: '日ごとに起床・就寝時間を変えたいときは', en: 'Want different times on different days?' },
  dailyOverrideBody:         { ja: '生活パターンを使うと、シフトや休日など日ごとの時間帯を設定できます。', en: 'Life patterns let you set different times for shifts, days off, and more.' },
  goToLifePatternsButton:    { ja: '生活パターンの設定へ',              en: 'Go to life patterns' },

  // 設定 → 通知
  notificationSettingsRowTitle: { ja: '通知設定',                   en: 'Notification settings' },
  onLabel:                   { ja: 'オン',                        en: 'On' },
  offLabel:                  { ja: 'オフ',                        en: 'Off' },
  laterAlertSectionLabel:    { ja: 'タスク放置通知',                  en: 'Task inactivity alert' },
  laterAlertDesc:            { ja: '「あとでやる」に追加したタスクが、設定した時間が経っても完了していないときにお知らせします。', en: 'Get notified if a task added to "Later" is still incomplete after the time you set.' },
  notifyToggleLabel:         { ja: '通知する',                      en: 'Notify me' },
  appAlertSectionLabel:      { ja: 'アプリ放置通知',                  en: 'App inactivity alert' },
  appAlertDesc:              { ja: '一定時間アプリを開いていない場合に通知します。', en: 'Get notified if you haven’t opened the app in a while.' },
  enableNotificationsTitle:  { ja: '通知を有効にする',                en: 'Enable notifications' },
  enableNotificationsDesc:   { ja: 'タスクのアラートや買い物リストの通知',    en: 'Task alerts and shopping list notifications' },
  notificationsPermissionHint: { ja: '通知を受け取るには、端末の設定でこのアプリの通知を許可してください。', en: 'To receive notifications, allow them for this app in your device settings.' },

  // 設定 → 買い物リスト通知（ShopNotifPanel / ShopLocationPanel）
  shopNotifTitle:            { ja: '買い物リストの通知',               en: 'Shopping list notifications' },
  noShopNotifYet:            { ja: '通知が設定されていません',           en: 'No notifications set' },
  dowSectionLabel:           { ja: '曜日',                        en: 'Days' },
  timeSectionLabel:          { ja: '時間',                        en: 'Time' },
  deleteNotifConfirmTitle:   { ja: 'この通知を削除しますか？',           en: 'Delete this notification?' },
  cantUndoBody:              { ja: 'この操作は取り消せません',           en: 'This can’t be undone' },
  everyDayLabel:             { ja: '毎日',                        en: 'Every day' },
  weekendLabel:              { ja: '週末',                        en: 'Weekend' },
  weekdayLabel:              { ja: '平日',                        en: 'Weekdays' },
  notifOffConfirm:           { ja: '通知機能がオフになっています。\n通知を有効にしますか？', en: 'Notifications are turned off.\nDo you want to enable them?' },
  taskNotifOffConfirm:       { ja: '通知機能がオフになっています。\nタスクのアラートを受け取るには通知を有効にしてください。\n\n通知をオンにしますか？', en: 'Notifications are turned off.\nEnable them to receive task alerts.\n\nTurn on notifications?' },

  // ShopLocationPanel（買い物リストの場所通知）
  permissionBannerText:      { ja: '位置情報または通知の許可が必要です。設定アプリ > BrainBoxから「位置情報（常に）」と「通知」を許可してください。', en: 'Location or notification permission is required. Please allow "Location (Always)" and "Notifications" for BrainBox in Settings.' },
  openSettingsAppButton:     { ja: '設定アプリを開く',                en: 'Open Settings' },
  noLocationsYet:            { ja: '場所が登録されていません',           en: 'No locations registered' },
  radiusLabel:               { ja: '半径{r}m',                    en: '{r}m radius' },
  deleteLocationConfirmTitle: { ja: 'この場所を削除しますか？',          en: 'Delete this location?' },
  searchLocationSectionLabel: { ja: '場所を検索',                    en: 'Search for a place' },
  addressPlaceholder:        { ja: '住所や施設名を入力',                en: 'Enter an address or place name' },
  searchingLabel:            { ja: '検索中',                       en: 'Searching' },
  searchLabel:               { ja: '検索',                        en: 'Search' },
  gettingLocationLabel:      { ja: '取得中...',                    en: 'Getting location...' },
  pickOnMapButton:           { ja: '地図で指定',                    en: 'Choose on map' },
  useCurrentLocationButton:  { ja: '現在地から登録',                  en: 'Use current location' },
  notifyRadiusSectionLabel:  { ja: '通知する範囲',                   en: 'Notification range' },
  nameSectionLabel:          { ja: '名前',                        en: 'Name' },
  placeNamePlaceholder:      { ja: '場所の名前',                    en: 'Place name' },
  changeOnMapButton:         { ja: '地図で場所を変更',                en: 'Change location on map' },
  registerButton:            { ja: '登録',                        en: 'Register' },
  couldNotGetLocation:       { ja: '現在地を取得できませんでした',         en: 'Couldn’t get your current location' },

  // 設定 → 表示設定（空き時間カード・テーマカラー・アプリアイコン）
  freeCardScreenTitle:       { ja: '空き時間カード',                  en: 'Free time cards' },
  showFreeCardLabel:         { ja: '空き時間カードを表示',              en: 'Show free time cards' },
  minDisplayTimeLabel:       { ja: '最小表示時間',                   en: 'Minimum duration to show' },
  themeColorRowTitle:        { ja: 'テーマカラー',                    en: 'Theme color' },
  appIconRowTitle:           { ja: 'アプリアイコン',                   en: 'App icon' },
  freeCardShownDesc:         { ja: '表示中・最小{n}分',                en: 'Shown · min {n}m' },
  freeCardHiddenDesc:        { ja: '非表示',                       en: 'Hidden' },
  themeColorScreenSubtitle:  { ja: 'テーマを選択するとアプリ全体の色が切り替わります', en: 'Choose a theme to change the app’s color throughout' },
  weekStartRowTitle:         { ja: '週の開始日',                     en: 'Week starts on' },
  weekStartSunday:           { ja: '日曜日',                       en: 'Sunday' },
  weekStartMonday:           { ja: '月曜日',                       en: 'Monday' },
  fontSizeRowTitle:          { ja: '文字サイズ',                     en: 'Font size' },
  fontSizeSmall:             { ja: '小',                          en: 'Small' },
  fontSizeStandard:          { ja: '標準',                         en: 'Standard' },
  fontSizeLarge:             { ja: '大',                          en: 'Large' },
  fontSizeXLarge:            { ja: '特大',                         en: 'Extra Large' },
  appIconScreenSubtitle:     { ja: '選択したアイコンがホーム画面に反映されます',   en: 'Your chosen icon will appear on your home screen' },

  // 設定 → 生活パターン
  lifePatternsFreeLimitNote: { ja: '1個まで無料でご利用いただけます。2個目からPROが必要です。', en: 'You can use up to 1 for free. PRO is required for a 2nd.' },
  lifePatternsIntro1:        { ja: 'シフトや予定に合わせて、日ごとの起床・就寝時間を変更できます', en: 'Change your wake and sleep times per day to match shifts or plans' },
  lifePatternsIntro2:        { ja: 'パターンを追加・選択して日付をタップ',      en: 'Add or select a pattern, then tap a date' },
  noPatternsYet:             { ja: 'パターンがまだありません',            en: 'No patterns yet' },
  deletePatternButton:       { ja: 'このパターンを削除',                en: 'Delete this pattern' },
  patternNamePlaceholder:    { ja: 'パターン名（例：平日、休日、早番、遅番）', en: 'Pattern name (e.g. Weekday, Day off, Early shift)' },
  addPatternButton:          { ja: '＋ パターンを追加',                 en: '+ Add pattern' },
  deletePatternAffectedBody: { ja: 'このパターンを設定した{n}日分の日付も解除されます', en: 'This will also clear it from {n} date(s) where it’s set' },
  deletePatternSimpleBody:   { ja: 'このパターンを削除します',            en: 'This pattern will be deleted' },
  changePatternConfirmTitle: { ja: '「{name}」の内容を変更しますか？',      en: 'Save changes to "{name}"?' },
  changePatternAffectedBody: { ja: 'このパターンを設定した{n}日分にも反映されます', en: 'This will also apply to {n} date(s) where it’s set' },
  changePatternSimpleBody:   { ja: 'この内容で保存します',               en: 'Your changes will be saved' },

  // 設定 → 忘れ物防止アラート（ForgetAlertsPanel）
  dayOffLabel:               { ja: '休日',                        en: 'Weekend' },
  customLabel:               { ja: 'カスタム',                      en: 'Custom' },
  forgetAlertFreeLimitNote:  { ja: '1件まで無料でご利用いただけます。2件目からPROが必要です。', en: 'You can use up to 1 for free. PRO is required for a 2nd.' },
  noAlertsYet:               { ja: 'アラートが登録されていません',          en: 'No alerts registered' },
  forgetAlertArriveLabel:    { ja: '{place}に着いたとき',              en: 'Arrive at {place}' },
  forgetAlertLeaveLabel:     { ja: '{place}を出るとき',               en: 'Leave {place}' },
  deleteAlertConfirmTitle:   { ja: 'このアラートを削除しますか？',          en: 'Delete this alert?' },
  createForgetAlertTitle:    { ja: '忘れ物防止通知を作成',              en: 'Create alert' },
  placeSectionLabel:         { ja: '場所',                        en: 'Place' },
  conditionSectionLabel:     { ja: '条件',                        en: 'Condition' },
  arriveOptionLabel:         { ja: '到着したら',                     en: 'On arrival' },
  leaveOptionLabel:          { ja: '出発したら',                     en: 'On departure' },
  timeRangeOptionalLabel:    { ja: '時間帯（任意）',                   en: 'Time range (optional)' },
  allDayNote:                { ja: '指定しない場合は終日対象になります',       en: 'Leave blank to apply all day' },
  itemsSectionLabel:         { ja: '持ち物',                       en: 'Items' },
  itemsPlaceholder:          { ja: '財布、鍵など',                    en: 'Wallet, keys, etc.' },
  previewSectionLabel:       { ja: 'プレビュー',                     en: 'Preview' },
  previewNoPlace:            { ja: '（場所未設定）',                   en: '(no place set)' },
  previewNoItems:            { ja: '（持ち物未設定）',                  en: '(no items set)' },
  previewCheckItemsBody:     { ja: '{items}を確認してください。',         en: '{items}.' },
  useCurrentLocationShortButton: { ja: '現在地から',                 en: 'Current location' },
  forgetAlertLocationPermError: { ja: '場所を出たときに通知するため、位置情報の利用を許可してください。', en: 'To get notified when you leave a place, please allow location access.' },

  // 設定 → アカウント
  appleAccountTitle:         { ja: 'Appleアカウント',                 en: 'Apple Account' },
  comingSoonDesc:            { ja: '近日リリース予定',                  en: 'Coming soon' },
  icloudBackupTitle:         { ja: 'iCloudバックアップ',               en: 'iCloud Backup' },
  syncStatusTitle:           { ja: '同期状態',                       en: 'Sync status' },

  // 設定 → よくある質問（sub==='support'とsub==='faq'で共用）
  faqQ1: { ja: 'データはどこに保存されますか？', en: 'Where is my data stored?' },
  faqA1: { ja: 'すべてのデータはお使いのデバイスのローカルストレージに保存されます。外部サーバーへの送信は行いません。', en: 'All data is stored in local storage on your device. Nothing is sent to external servers.' },
  faqQ2: { ja: 'アプリを削除するとデータはどうなりますか？', en: 'What happens to my data if I delete the app?' },
  faqA2: { ja: 'アプリをアンインストールするとすべてのデータが削除されます。現在、クラウドバックアップ機能はありません。', en: 'All data is deleted when you uninstall the app. There is currently no cloud backup feature.' },
  faqQ3: { ja: 'タスクを誤って削除してしまいました。復元できますか？', en: 'I accidentally deleted a task. Can I restore it?' },
  faqA3: { ja: '申し訳ありませんが、削除したタスクの復元機能は現在ありません。重要なタスクは削除前にご確認ください。', en: 'Sorry, there is currently no way to restore a deleted task. Please double-check before deleting important tasks.' },
  faqQ4: { ja: '繰り返しタスクの一部だけ削除できますか？', en: 'Can I delete just one occurrence of a recurring task?' },
  faqA4: { ja: 'はい。繰り返しタスクを削除する際、「この予定のみ削除」または「すべての予定を削除」を選択できます。', en: 'Yes. When deleting a recurring task, you can choose "Delete this occurrence only" or "Delete all occurrences."' },
  faqQ5: { ja: '起床・就寝時間はどこで変更できますか？', en: 'Where can I change my wake and sleep times?' },
  faqA5: { ja: '設定画面の「起床・就寝」から変更できます。タイムライン上の起床・就寝カードをタップしても変更できます。', en: 'You can change them from "Wake & sleep" in Settings, or by tapping the wake/sleep cards on the timeline.' },
  faqQ6: { ja: '「あとでやる」に移動したタスクはどこで確認できますか？', en: 'Where can I see tasks moved to "Later"?' },
  faqA6: { ja: '画面下部のバーにある「あとでやる」ボタンをタップすると、あとでやるリストが表示されます。', en: 'Tap the "Later" button on the bottom bar to see the Later list.' },

  // 設定 → お問い合わせ
  contactLineTitle:          { ja: 'LINEでお問い合わせ',                en: 'Contact us on LINE' },
  contactLineBody:           { ja: 'ご質問やご要望がございましたら、公式LINEからお気軽にお問い合わせください。', en: 'If you have any questions or requests, feel free to reach out via our official LINE account.' },
  contactLineResponseTime:   { ja: '通常、1〜3日以内にお返事いたします。',    en: 'We usually reply within 1–3 days.' },
  contactLineButton:         { ja: 'LINEで問い合わせる',                en: 'Contact via LINE' },
  contactEmailTitle:         { ja: 'メールでお問い合わせ',               en: 'Contact us by email' },
  contactEmailBody:          { ja: 'LINEをご利用でない方は、メールでもお問い合わせいただけます。', en: 'If you don’t use LINE, you can also reach us by email.' },
  contactEmailButton:        { ja: 'メールアプリで開く',                 en: 'Open in mail app' },

  // 設定 → プライバシーポリシー
  legalLastUpdated:          { ja: '最終更新日：2026年7月3日',            en: 'Last updated: July 3, 2026' },
  privacyAboutTitle:         { ja: 'BrainBoxについて',                en: 'About BrainBox' },
  privacyAboutBody:          { ja: 'BrainBoxは、ADHD気質の方やToDoリストが続かない方向けに、1日のタスクを時間軸で見える化するタイムライン型タスク管理アプリです。\n本プライバシーポリシーは、本アプリにおける個人情報の取り扱いについて説明します。', en: 'BrainBox is a timeline-style task management app that visualizes your day’s tasks along a time axis, designed for people with ADHD tendencies or who struggle to keep up with to-do lists.\nThis Privacy Policy explains how personal information is handled in this app.' },
  privacyCollectTitle:       { ja: '取得する情報',                     en: 'Information we collect' },
  privacyCollectBody:        { ja: '本アプリは、以下の情報をお客様のデバイス上にのみ保存します。\n・タスク名・日時・メモ・サブタスクなどの入力データ\n・起床・就寝時間などの設定情報\n・タグ・カテゴリ・繰り返し設定などのカスタマイズ情報\n\nこれらの情報は外部サーバーには送信されず、お客様のデバイス内のみで管理されます。', en: 'This app stores the following information only on your device.\n・Input data such as task names, dates/times, memos, and subtasks\n・Settings such as wake and sleep times\n・Customization info such as tags, categories, and recurrence settings\n\nThis information is never sent to external servers and is managed only on your device.' },
  privacyPurposeTitle:       { ja: '情報の利用目的',                    en: 'Purpose of use' },
  privacyPurposeBody:        { ja: '取得した情報は、以下の目的にのみ使用します。\n・タスクの表示・管理・検索機能の提供\n・繰り返しタスクのスケジュール生成\n・アプリ設定の保持', en: 'The information collected is used only for the following purposes.\n・Providing task display, management, and search features\n・Generating schedules for recurring tasks\n・Retaining app settings' },
  privacyThirdPartyTitle:    { ja: '第三者提供について',                  en: 'Third-party disclosure' },
  privacyThirdPartyBody:     { ja: '本アプリは、お客様の個人情報を第三者に提供することはありません。\n\nただし、オプション機能としてAI文章生成機能（Groq APIを使用）をご利用いただく場合、入力したタスク情報が当該APIに送信されることがあります。詳細はGroq社のプライバシーポリシーをご確認ください。', en: 'This app does not provide your personal information to any third party.\n\nHowever, if you use the optional AI text generation feature (which uses the Groq API), the task information you enter may be sent to that API. Please review Groq’s privacy policy for details.' },
  privacyDataMgmtTitle:      { ja: 'データの管理について',                 en: 'Data management' },
  privacyDataMgmtBody:       { ja: '本アプリのデータはすべてお客様のデバイス内（localStorage）に保存されます。\n・アプリをアンインストールするとすべてのデータが削除されます\n・デバイスの初期化によってデータが失われる場合があります\n・本アプリはデータのクラウドバックアップ機能を持ちません', en: 'All data for this app is stored on your device (localStorage).\n・All data is deleted when you uninstall the app\n・Data may be lost if your device is reset\n・This app has no cloud backup feature for data' },
  privacyRevisionTitle:      { ja: 'プライバシーポリシーの改定について',          en: 'Changes to this policy' },
  privacyRevisionBody:       { ja: '本プライバシーポリシーは、法令の改正や機能追加に伴い改定される場合があります。重要な変更がある場合はアプリ内またはサポートページにてお知らせします。', en: 'This Privacy Policy may be revised due to changes in laws or the addition of new features. If there are any significant changes, we will notify you in the app or on our support page.' },

  // 設定 → 利用規約
  termsIntroTitle:           { ja: 'はじめに',                       en: 'Introduction' },
  termsIntroBody:            { ja: '本利用規約（以下「本規約」）は、BrainBox（以下「本アプリ」）のご利用条件を定めるものです。本アプリをご利用いただくことで、本規約に同意したものとみなします。', en: 'These Terms of Service (the “Terms”) set out the conditions for using BrainBox (the “App”). By using the App, you are deemed to have agreed to these Terms.' },
  termsConditionsTitle:      { ja: '利用条件',                       en: 'Conditions of use' },
  termsConditionsBody:       { ja: '本アプリは、個人的・非商業的な用途に限り無償でご利用いただけます。\n・本アプリの複製・改変・再配布は禁止します\n・本アプリを商業目的で利用することは禁止します\n・本アプリのリバースエンジニアリングは禁止します', en: 'This app is provided free of charge for personal, non-commercial use only.\n・Copying, modifying, or redistributing this app is prohibited\n・Using this app for commercial purposes is prohibited\n・Reverse engineering this app is prohibited' },
  termsDisclaimerTitle:      { ja: '免責事項',                       en: 'Disclaimer' },
  termsDisclaimerBody:       { ja: '本アプリは現状有姿で提供されます。本アプリの利用によって生じたいかなる損害についても、開発者は責任を負いません。\n・データの消失・破損に関する損害\n・本アプリの不具合・停止による損害\n・その他、本アプリの利用に起因する損害\n\n重要なデータは定期的にバックアップされることをお勧めします。', en: 'This app is provided “as is.” The developer is not liable for any damages arising from the use of this app.\n・Damages related to data loss or corruption\n・Damages caused by malfunctions or outages of this app\n・Other damages arising from the use of this app\n\nWe recommend backing up important data regularly.' },
  termsIpTitle:              { ja: '知的財産権',                      en: 'Intellectual property' },
  termsIpBody:               { ja: '本アプリに関する著作権その他の知的財産権は、開発者に帰属します。本規約に定める範囲を超えた利用は禁止します。', en: 'Copyright and other intellectual property rights related to this app belong to the developer. Use beyond the scope set out in these Terms is prohibited.' },
  termsChangesTitle:         { ja: 'サービスの変更・終了',                 en: 'Changes or termination of service' },
  termsChangesBody:          { ja: '開発者は、予告なく本アプリの機能変更・サービスの一部または全部の終了を行う場合があります。これによってお客様に生じた損害について、開発者は責任を負いません。', en: 'The developer may change features of this app or terminate part or all of the service without prior notice. The developer is not liable for any damages this causes you.' },
  termsRevisionTitle:        { ja: '規約の変更',                       en: 'Changes to these Terms' },
  termsRevisionBody:         { ja: '開発者は、必要に応じて本規約を変更することがあります。変更後の規約は本ページにて公開します。重要な変更がある場合はアプリ内またはサポートページにてお知らせします。', en: 'The developer may change these Terms as needed. The revised Terms will be published on this page. If there are any significant changes, we will notify you in the app or on our support page.' },

  // 設定 → PRO
  proUpgradeTitle:           { ja: 'PROにアップグレード',                en: 'Upgrade to PRO' },
  proUpgradeSubtitle:        { ja: 'より便利な機能で、毎日をもっとスムーズに', en: 'More convenient features for a smoother everyday' },
  proFeatureListLabel:       { ja: '★ PRO 機能一覧',                  en: '★ PRO Features' },
  proHeaderFeature:          { ja: '機能',                         en: 'Feature' },
  proHeaderFree:             { ja: '無料',                         en: 'Free' },
  proFeatureCustomRecurrence: { ja: '繰り返し間隔カスタム',              en: 'Custom recurrence intervals' },
  proFeatureAppIconChange:   { ja: 'アプリアイコン変更',                en: 'App icon change' },
  proFeatureWakeSleepIconColor: { ja: '起床・就寝アイコン色変更',          en: 'Wake/sleep icon color' },
  proFeatureDeadline:        { ja: '締切管理',                       en: 'Deadline management' },
  proFeatureLaterLocationNotify: { ja: 'あとでやるの場所通知',            en: 'Location alerts for Later tasks' },
  proValCount1:              { ja: '1個',                          en: '1' },
  proValCount2:              { ja: '2個',                          en: '2' },
  proValUnlimited:           { ja: '無制限',                        en: 'Unlimited' },
  proValOncePerMonth:        { ja: '月1回',                         en: '1/month' },
  proValFull:                { ja: '完全対応',                       en: 'Full' },
  proValBasicOnly:           { ja: '基本のみ',                       en: 'Basic only' },
  proValMintOnly:            { ja: 'ミントのみ',                      en: 'Mint only' },
  proVal9Colors:             { ja: '9色',                          en: '9 colors' },
  proValSupported:           { ja: '対応',                         en: 'Supported' },
  proValDefaultOnly:         { ja: '既定のみ',                       en: 'Default only' },
  proActiveTitle:            { ja: 'PROプランを利用中です',              en: 'You’re on the PRO plan' },
  proActiveDesc:             { ja: 'すべての機能をご利用いただけます',        en: 'All features are available to you' },
  proPricingLabel:           { ja: '料金プラン',                      en: 'Pricing' },
  proTrialTitle:             { ja: '7日間無料トライアル',                en: '7-day free trial' },
  proTrialAfter:             { ja: 'トライアル終了後 月額',              en: 'After trial, per month' },
  proTrialCancelNote:        { ja: 'いつでもキャンセル可能',              en: 'Cancel anytime' },
  proStartTrialButton:       { ja: '7日間無料で始める',                 en: 'Start 7-day free trial' },
  proProcessingLabel:        { ja: '処理中...',                      en: 'Processing...' },
  proRestoreButton:          { ja: '購入を復元',                      en: 'Restore purchase' },
  proPurchaseFailedAlert:    { ja: '購入処理に失敗しました。時間をおいて再度お試しください。', en: 'Purchase failed. Please try again later.' },
  proRestoreNotFoundAlert:   { ja: '復元できる購入履歴が見つかりませんでした', en: 'No purchase history found to restore' },

  // プッシュ通知の本文（LocalNotify経由。タイトル・本文とも言語設定に追従させる）
  notifTaskStartingSoon:     { ja: 'そろそろ始めましょう（{time}〜）',        en: 'Starting soon ({time})' },
  notifTaskTomorrow:         { ja: '明日{time}から予定があります',           en: 'You have plans tomorrow at {time}' },
  notifTaskIn1Hour:          { ja: 'あと1時間で始まります（{time}〜）',       en: 'Starting in 1 hour ({time})' },
  notifTaskInMinutes:        { ja: 'あと{n}分で始まります（{time}〜）',       en: 'Starting in {n} min ({time})' },
  notifDeadlineDays:         { ja: '{name}期限まで、あと{n}日です。',        en: '{n} day(s) left until {name} is due.' },
  notifDeadlineHours:        { ja: '{name}期限まで、あと{n}時間です。',       en: '{n} hour(s) left until {name} is due.' },
  notifDeadlineToday:        { ja: '{name}期限は今日です。',               en: '{name} is due today.' },
  notifDeadlineNow:          { ja: '{name}の期限になりました。',            en: '{name} is now due.' },
  notifThisTaskFallback:     { ja: 'このタスク',                        en: 'This task' },
  notifWakeCheckinTitle:     { ja: 'おはようございます',                    en: 'Good morning' },
  notifWakeCheckinBody:      { ja: '今日の予定をチェックしましょう',          en: "Check today's schedule" },
  notifWakeCheckinBodyPast:  { ja: '今日の予定をチェックしましょう。昨日のタスクが{n}件残っています', en: "Check today's schedule. You have {n} unfinished task(s) from yesterday." },
  notifYesterdayTasksTitle:  { ja: '昨日のタスクが残っています',              en: 'You have tasks left from yesterday' },
  notifYesterdayTasksBody:   { ja: '昨日のタスクが{n}件残っています',         en: 'You have {n} unfinished task(s) from yesterday' },
  notifShopListTitle:        { ja: '買い物リスト',                        en: 'Shopping list' },
  notifShopListBody:         { ja: '未購入 {n}件: {names}',              en: '{n} item(s) left: {names}' },
  notifLaterStaleTitle:      { ja: 'あとでやるが溜まっています',              en: 'Later tasks are piling up' },
  notifLaterStaleBody:       { ja: '{n}件が長時間放置されています: {names}', en: '{n} task(s) left unfinished for a while: {names}' },
  notifLaterStaleBodySingle: { ja: '「{name}」が長時間放置されています',       en: '"{name}" has been left unfinished for a while' },
  notifFreeTimeTitle:        { ja: '空き時間ができました',                  en: 'You have free time' },
  notifFreeTimeBodyMulti:    { ja: '「{name}」など{n}件のタスクがあります',    en: 'You have {n} tasks, including "{name}"' },
  notifFreeTimeBodySingle:   { ja: '「{name}」をやってみませんか？',          en: 'Why not try "{name}"?' },
  deadlinePreviewLabel:      { ja: '通知される内容（{n}件）',               en: 'Notifications to be sent ({n})' },

  // PROペイウォールシート（ProGateSheet）自体の固定文言
  proSheetTitle:        { ja: 'Proプランが必要です',                     en: 'PRO plan required' },
  proSheetBodyFeature:  { ja: '「{feature}」はProプランでご利用いただけます。', en: '"{feature}" is available with the PRO plan.' },
  proSheetBodyGeneric:  { ja: 'この機能はProプランでご利用いただけます。',       en: 'This feature is available with the PRO plan.' },
  proSheetNote:         { ja: '設定画面のPROから登録できます。',              en: 'You can subscribe from PRO in Settings.' },
  proSheetViewButton:   { ja: 'PROプランを見る',                        en: 'View PRO plan' },
  proSheetClose:        { ja: '閉じる',                                en: 'Close' },

  // ProGateSheetのfeatureに渡す機能名（PROゲートの対象になる操作の説明）
  proFeatureTags:            { ja: 'タグを3個以上作成',              en: 'Creating 3+ tags' },
  proFeatureBulkInput:       { ja: '一括入力を月2回以上利用',          en: 'Using bulk input more than once a month' },
  proFeatureIconUse:         { ja: 'アイコン「{name}」の使用',         en: 'Using the "{name}" icon' },
  proFeatureTabs:            { ja: 'ファイルタブを2個以上作成',         en: 'Creating 2+ file tabs' },
  proFeatureLaterInterval:   { ja: 'タスク放置通知の間隔変更',          en: 'Changing the later-task alert interval' },
  proFeatureInactiveInterval:{ ja: 'アプリ放置通知の間隔変更',          en: 'Changing the app-inactivity alert interval' },
  proFeatureThemeColor:      { ja: 'テーマカラーの変更',              en: 'Changing the theme color' },
  proFeatureAppIcon:         { ja: 'アプリアイコンの変更',             en: 'Changing the app icon' },
  proFeatureLifePatterns:    { ja: '生活パターンを2個以上登録',         en: 'Registering 2+ life patterns' },
  proFeatureWakeSleepColor:  { ja: '起床・就寝アイコンの色変更',        en: 'Changing the wake/sleep icon color' },
  proFeatureLocationNotify:  { ja: '場所で通知',                    en: 'Location-based notification' },
  proFeatureForgetAlerts:    { ja: '忘れ物防止通知（2件目以降）',       en: 'Forget-item alerts (2nd and beyond)' },
  proFeatureCustomRepeat:    { ja: '繰り返しのカスタム設定',           en: 'Custom repeat settings' },

  // おすすめ機能カード（RECOMMENDATION_DEFS）
  recommendShoppingListTitle: { ja: '買い物リスト、使ってみませんか？',                    en: 'Want to try the shopping list?' },
  recommendShoppingListBody:  { ja: '買うものをまとめておくと、必要なときにすぐ確認できます。', en: 'Keep track of what to buy so you can check it anytime.' },
  recommendLocationTitle:     { ja: '場所で通知、使ってみませんか？',                      en: 'Want to try location alerts?' },
  recommendLocationBody:      { ja: 'よく行く場所に近づいたら、買い物リストを知らせてくれます。', en: "Get notified about your shopping list when you're near a place you often visit." },
  recommendRepeatTitle:       { ja: '繰り返しタスク、使ってみませんか？',                    en: 'Want to try repeating tasks?' },
  recommendRepeatBody:        { ja: '毎日・毎週のタスクは繰り返し設定にしておくと登録の手間が省けます。', en: 'Set daily or weekly tasks to repeat so you don\'t have to re-add them.' },
  recommendCta:               { ja: '使ってみる',                                     en: 'Try it' },
  recommendDismiss:           { ja: '今はしない',                                     en: 'Not now' },

  // タスク一括入力（設定 → タスク一括入力）
  bulkInputTitle:            { ja: 'タスク一括入力',                          en: 'Bulk add tasks' },
  bulkInputFreeLimitNote:    { ja: '月1回まで無料でご利用いただけます。2回目からPROが必要です。', en: 'Free for 1 use per month. PRO is required after that.' },
  bulkInputTaskInfoLabel:    { ja: 'タスク情報',                            en: 'Task info' },
  bulkInputNamePlaceholder:  { ja: 'タスク名を入力',                          en: 'Enter a task name' },
  fieldEndTime:              { ja: '終了時刻',                             en: 'End time' },
  bulkInputSelectDateLabel:  { ja: '日付を選択',                            en: 'Select dates' },
  bulkInputDaysSelected:     { ja: '{n}日選択中',                          en: '{n} day(s) selected' },
  bulkInputViewHistoryButton:{ ja: '履歴を見る',                            en: 'View history' },
  bulkInputRegisteredDone:   { ja: '登録しました',                          en: 'Registered!' },
  bulkInputRegisterButton:   { ja: '選択した日に登録',                        en: 'Register selected dates' },
  iconSheetTitleShort:       { ja: 'アイコン',                             en: 'Icon' },
  bulkHistoryTitle:          { ja: '登録履歴',                             en: 'Registration history' },
  bulkHistoryEmpty:          { ja: 'まだ登録履歴がありません',                    en: 'No registration history yet' },
  bulkHistoryEntryMeta:      { ja: '{start}〜{end} · {days}日 · {date}登録',   en: '{start}–{end} · {days} day(s) · Registered {date}' },
  bulkEditButton:            { ja: '一括編集',                             en: 'Bulk edit' },
  bulkDeleteButton:          { ja: '一括削除',                             en: 'Bulk delete' },
  bulkEditAllDaysNote:       { ja: '{n}日分すべてに反映されます',                 en: 'This will apply to all {n} day(s).' },
  bulkDeleteAllDaysNote:     { ja: '{n}日分すべてのタスクが削除されます',            en: 'All tasks for {n} day(s) will be deleted.' },

  // カスタム繰り返し設定（TaskModal、recur==='custom'）
  customRecIntervalLabel:  { ja: '① 間隔',           en: '① Interval' },
  customRecTimingLabel:    { ja: '② 実行タイミング',    en: '② Timing' },
  customRecEndLabel:       { ja: '③ 終了条件',        en: '③ End condition' },
  customRecUnitHour:       { ja: '時',              en: 'Hr' },
  customRecUnitDay:        { ja: '日',              en: 'Day' },
  customRecUnitWeek:       { ja: '週',              en: 'Wk' },
  customRecUnitMonth:      { ja: '月',              en: 'Mo' },
  customRecUnitYear:       { ja: '年',              en: 'Yr' },
  customRecByDate:         { ja: '日付で指定',         en: 'By date' },
  customRecByWeekday:      { ja: '曜日で指定',         en: 'By weekday' },
  customRecLastDay:        { ja: '月末',             en: 'Last day' },
  customRecLastWeek:       { ja: '最終',             en: 'Last' },
  customRecMonthLabel:     { ja: '月',              en: 'Month' },
  customRecDayLabel:       { ja: '日',              en: 'Day' },
  customRecEndNever:       { ja: '終了なし',           en: 'No end' },
  customRecEndDate:        { ja: '指定日まで',         en: 'Until date' },
  customRecEndCount:       { ja: '回数で終了',         en: 'After N times' },
  customRecTimesSuffix:    { ja: '回で終了',           en: 'times' },

  // TaskModal 「あとでやる」の場所通知UI
  taskLocationPermError:      { ja: '場所に到着したときに通知するため、位置情報の利用を許可してください。', en: 'To get notified when you arrive at a place, please allow location access.' },
  taskLocationLimitReached:   { ja: '場所通知の登録上限に達しています。他の場所通知をオフにしてから追加してください。', en: "You've reached the location alert limit. Turn off another location alert before adding a new one." },
  taskLocationPermRevokedNote:{ ja: '位置情報または通知の許可が取り消されているため、この通知は届きません。設定アプリ > BrainBoxから「位置情報（常に）」と「通知」を許可してください。', en: 'Location or notification permission has been revoked, so this alert won’t arrive. Please allow "Location (Always)" and "Notifications" for BrainBox in Settings.' },
  taskLocationRadiusNote:      { ja: '半径{r}m以内に入ったら通知します',    en: "You'll be notified within {r}m" },
  changeLocationButton:        { ja: '場所を変更',                    en: 'Change location' },
  taskLocationConfirmButton:   { ja: '設定する',                     en: 'Set' },

  // ShopMapPicker（地図ピッカー、共有コンポーネント）
  mapPickedPlaceFallback:   { ja: '地図で指定した場所',            en: 'Location picked on map' },
  mapDragPinchHint:         { ja: 'ドラッグで移動、ピンチで拡大縮小できます', en: 'Drag to move, pinch to zoom' },
  mapConfirmingLabel:       { ja: '取得中...',                  en: 'Confirming...' },
  confirmThisLocationButton:{ ja: 'この位置に決定',              en: 'Confirm this location' },

  // MorningCheckModal（起床時「昨日のタスク」確認）
  morningCloseConfirmBody:    { ja: 'このまま閉じると、昨日のタスクは前日に残ります。閉じますか？', en: "If you close now, yesterday's tasks will stay on that day. Close anyway?" },
  morningSnoozeQuestion:      { ja: '何時間後に再通知しますか？',        en: 'When should we remind you again?' },
  morningSnoozeMinutes:       { ja: '{m}分後',                    en: 'In {m} min' },
  morningSnoozeHours:         { ja: '{h}時間後',                   en: 'In {h}h' },
  morningSnoozeHoursMinutes:  { ja: '{h}時間{m}分後',               en: 'In {h}h {m}m' },
  morningSnoozeConfirmButton: { ja: 'この時間後に再通知する',          en: 'Remind me then' },
  morningTitle:               { ja: '昨日のタスク',                 en: "Yesterday's tasks" },
  morningRemainingCount:      { ja: '{n}件のタスクが残っています',        en: '{n} task(s) remaining' },
  selectAllLabel:             { ja: 'すべて選択',                   en: 'Select all' },
  markDoneButton:             { ja: '完了した',                    en: 'Mark done' },
  moveToLaterButton:          { ja: 'あとでやるに戻す',               en: 'Move to Later' },
  checkLaterButton:           { ja: 'あとで確認する',                en: "I'll check later" },

  // 起床・就寝カラー/時間ピッカー・変更確認・初回設定プロンプト
  allDayLabel:                { ja: '終日',                       en: 'All day' },
  wakeSleepIconColorTitle:    { ja: '{label}アイコンの色',            en: '{label} icon color' },
  wakeSleepTimeChangeTitle:   { ja: '{label}時間を変更',             en: 'Change {label} time' },
  dragToPlaceLabel:           { ja: 'ドラッグして配置',               en: 'Drag to place' },
  settingConfirmNewTimeNote:  { ja: '{time} に変更します',            en: 'Change to {time}' },
  patternAppliedNote:         { ja: '「{name}」パターンが設定されています', en: '"{name}" pattern is applied' },
  patternWillClearNote:       { ja: '変更するとこの日のパターンが解除されます', en: 'Changing this will clear the pattern for this day' },
  clearPatternAndChangeTodayButton: { ja: 'パターンを解除してこの日だけ変更', en: 'Clear pattern and change today only' },
  changeTodayOnlyButton:      { ja: 'この日だけ変更',                en: 'Change today only' },
  changeAllDaysButton:        { ja: '他の日も全部この時間に変更',          en: 'Change this time for all days' },
  wakeSleepSetupTitle:        { ja: '起床・就寝時間を設定しよう',          en: "Let's set your wake & sleep time" },
  wakeSleepSetupBody:         { ja: 'あなたの生活リズムに合わせてタイムラインを表示します。', en: "We'll show your timeline based on your daily rhythm." },
  laterButton:                { ja: 'あとで',                     en: 'Later' },

  // タブ表示フィルター・繰り返し予定の移動/変更確認
  tabFilterTitle:             { ja: '表示するタブを選択',              en: 'Choose tabs to show' },
  showAllButton:              { ja: 'すべて表示',                   en: 'Show all' },
  noTabsCreatedYet:           { ja: 'タブが作成されていません',           en: 'No tabs created yet' },
  recurringMoveTitle:         { ja: '繰り返し予定の移動',              en: 'Move recurring task' },
  recurringMoveConfirmBody:   { ja: '「{name}」を {time} に移動しますか？', en: 'Move "{name}" to {time}?' },
  recurringEditTitle:         { ja: '繰り返し予定の変更',              en: 'Edit recurring task' },
  recurringEditConfirmBody:   { ja: '「{name}」をどのように変更しますか？',   en: 'How do you want to change "{name}"?' },
  thisOccurrenceOnlyButton:   { ja: 'この予定のみ変更',               en: 'Change this occurrence only' },
  allOccurrencesButton:       { ja: 'すべての予定を変更',              en: 'Change all occurrences' },

  // 統計画面（準備中）
  statsScreenTitle:      { ja: '統計',                          en: 'Stats' },
  comingSoonLabel:       { ja: '準備中',                         en: 'Coming soon' },
  statsComingSoonDesc:   { ja: 'タスク完了の統計機能は近日公開予定です',      en: 'Task completion stats are coming soon' },
  newTabDefaultName:     { ja: 'タブ',                          en: 'Tab' },
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
