#!/bin/bash
set -e

echo "📦 APIルートを一時的に退避..."
if [ -d src/app/_api ] && [ ! -d src/app/api ]; then
  echo "  (前回の退避済みファイルを再利用)"
elif [ -d src/app/api ]; then
  [ -d src/app/_api ] && rm -rf src/app/_api
  mv src/app/api src/app/_api
fi

echo "🔨 Androidビルド中..."
# クローズドテスト用に購入フロー無しで全員PRO化したいビルドだけ、呼び出し時に
# NEXT_PUBLIC_FORCE_PREMIUM_ANDROID=true ./build-android.sh のように付ける（本番ビルドでは付けない）
BUILD_TARGET=android npm run build

echo "📦 APIルートを戻す..."
mv src/app/_api src/app/api

echo "🔄 Capacitorと同期中..."
./node_modules/.bin/cap sync android

echo "✅ 完了！次のコマンドでAndroid Studioを開いてください："
echo "   npx cap open android"
