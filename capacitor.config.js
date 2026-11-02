/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: 'jp.brainbox.app',
  appName: 'BrainBox',
  webDir: 'out',
  backgroundColor: '#F9FAFB',
  ios: {
    contentInset: 'never',
  },
  plugins: {
    Keyboard: {
      // 複数の入力欄がある画面でiOSが自動表示する「前へ/次へ/完了」の
      // ネイティブキーボードツールバーを非表示にする
      hideFormAccessoryBar: true,
      // キーボード表示時、キーボード上部の角丸の外側（キーボードの背後）に
      // 見えるUIWindowの背景色をiOS標準のまま放置すると既定で黒になり、
      // 角丸の外側だけ黒く見えてしまう不具合があった。'auto'にすると
      // Capacitor側がキーボード表示のたびに上のbackgroundColor（#F9FAFB、
      // アプリ全体の背景色として既に使っている値。ここで新しい色は
      // 追加していない）をUIWindowの背景に反映してくれるため、
      // キーボード周辺が自然につながって見える（iOS限定の設定、Androidには無関係）
      autoBackdropColor: 'auto',
      // 根本原因の調査で判明: style未設定時のデフォルトは'DEFAULT'で、
      // これはiOS標準のキーボード外観をOS本体のライト/ダークモード設定に
      // 連動させる（@capacitor/keyboardの公式ドキュメント通り）。BrainBoxの
      // アプリ本体はダークモード非対応（常にライトの配色）のため、端末が
      // ダークモードだとキーボード本体がiOS標準で黒系になり、常にライトな
      // アプリUIとの境目に黒い帯が出ているように見えていた——これはWebView側
      // のCSS/背景色の問題ではなく、キーボード自体のネイティブな外観だった。
      // 'LIGHT'を明示し、端末のダーク/ライトモード設定によらずアプリの
      // （常にライトな）配色と一致させる。キーボードのサイズ・位置・配列は
      // この設定では変化しない（色の見た目のみ）
      style: 'LIGHT',
    },
  },
};

module.exports = config;
