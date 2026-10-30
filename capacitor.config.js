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
    },
  },
};

module.exports = config;
