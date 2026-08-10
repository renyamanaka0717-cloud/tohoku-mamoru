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

  // MonthCalendar / CalendarPage
  closeButton:               { ja: '閉じる',                       en: 'Close' },
  todayButton:               { ja: '今日',                        en: 'Today' },

  // SearchPage
  searchPlaceholder:         { ja: 'タスク・メモ・タブを検索...',        en: 'Search tasks, notes, tabs...' },
  searchEmptyPrompt:         { ja: 'タスク名・メモ・タブで検索',          en: 'Search by task name, note, or tab' },
  searchNoResults:           { ja: '「{q}」は見つかりませんでした',       en: 'No results for "{q}"' },

  // SettingsScreen（トップレベルのメニュー一覧）
  settingsTitle:             { ja: '設定',                        en: 'Settings' },
  sectionFeatures:           { ja: '機能',                        en: 'Features' },
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
  rowLaterAlertTitle:        { ja: '放置アラート',                   en: 'Inactivity alerts' },
  rowLaterAlertDesc:         { ja: 'タスクやアプリの放置を通知',         en: 'Get reminded about neglected tasks or the app' },
  rowForgetAlertTitle:       { ja: '忘れ物防止アラート',               en: 'Forgotten item alerts' },
  rowForgetAlertDesc:        { ja: '場所を出るときに持ち物を確認',        en: 'Check your belongings when leaving a place' },
  rowNotificationsTitle:     { ja: '通知',                        en: 'Notifications' },
  rowNotificationsDesc:      { ja: '通知設定',                      en: 'Notification settings' },
  rowDisplayTitle:           { ja: '表示設定',                      en: 'Display' },
  rowDisplayDesc:            { ja: '外観、言語など',                  en: 'Appearance, language, and more' },
  rowAccountTitle:           { ja: 'アカウント',                     en: 'Account' },
  rowAccountDesc:            { ja: 'Appleアカウント・iCloudバックアップ', en: 'Apple account & iCloud backup' },
  rowProTitle:               { ja: 'PRO',                         en: 'PRO' },
  rowProActive:              { ja: '利用中',                       en: 'Active' },
  rowProPrice:               { ja: '月額¥200',                     en: '¥200/month' },
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
  laterAlertSectionLabel:    { ja: 'タスク放置アラート',               en: 'Task inactivity alert' },
  laterAlertDesc:            { ja: '「あとでやる」に追加したタスクが、設定した時間が経っても完了していないときにお知らせします。', en: 'Get notified if a task added to "Later" is still incomplete after the time you set.' },
  notifyToggleLabel:         { ja: '通知する',                      en: 'Notify me' },
  appAlertSectionLabel:      { ja: 'アプリ放置アラート',               en: 'App inactivity alert' },
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
  createForgetAlertTitle:    { ja: '忘れ物防止アラートを作成',            en: 'Create alert' },
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
