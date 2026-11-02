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
      // 【根本原因・本命】@capacitor/keyboardのnode_modules型定義で確認:
      // resize未設定時のデフォルトは'native'で、これは「キーボード表示のたびに
      // WKWebViewそのもののフレームをネイティブ側が物理的に縮める」モード
      // （ネイティブ実装のKeyboard.m・_updateFrame内、ResizeNativeケースで
      // webView.frameを直接書き換えている箇所を確認済み）。このモードだと、
      // 縮んだWebViewの下端とキーボードの上端の間に「WebViewもキーボードも
      // 何も描画しない隙間」ができ、その隙間（キーボードの角丸の外側を含む）
      // にルートView/Windowの既定背景（黒）が露出していた。これまでの
      // autoBackdropColor・style修正はどちらもWebView内のCSSやキーボード自身の
      // 色を対象にしていたため直らなかった——原因はWebViewが縮んで“空白”が
      // 生まれていたこと自体だった。
      // resize:'none'にすると「WKWebViewもアプリも一切リサイズしない」設定になり、
      // WebViewは常にフルスクリーンのまま（＝キーボードは単にその上に重なる
      // だけ）になるため、この隙間自体が発生しなくなる。このセッションで
      // 実装してきたvisualViewport基準のモーダル位置・高さ調整（キーボードは
      // 重なるだけでWebView自体はリサイズされない、という前提で書いたコード）
      // とも整合する設定で、むしろ今までこの設定が無かったせいで「ネイティブの
      // WebViewリサイズ」と「JS側のvisualViewport補正」が同時に・競合して
      // 動いていたと考えられる
      resize: 'none',
    },
  },
};

module.exports = config;
