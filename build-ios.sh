#!/bin/bash
set -e

echo "📦 APIルートを一時的に退避..."
if [ -d src/app/_api ] && [ ! -d src/app/api ]; then
  echo "  (前回の退避済みファイルを再利用)"
elif [ -d src/app/api ]; then
  [ -d src/app/_api ] && rm -rf src/app/_api
  mv src/app/api src/app/_api
fi

echo "🔨 iOSビルド中..."
BUILD_TARGET=ios npm run build

echo "📦 APIルートを戻す..."
mv src/app/_api src/app/api

echo "🔄 Capacitorと同期中..."
npx cap sync ios

echo "✅ 完了！次のコマンドでXcodeを開いてください："
echo "   npx cap open ios"
