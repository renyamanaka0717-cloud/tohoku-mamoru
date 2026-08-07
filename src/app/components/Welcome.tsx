'use client';

// 表示文言はここに集約する（将来の多言語対応時はこのオブジェクトを言語ごとに差し替える想定）
export const WELCOME_TEXT = {
  title: 'BrainBox',
  subtitle: '頭の中を、もっとシンプルに。',
  startTour: 'ツアーを始める',
  later: 'あとで見る',
};

export default function Welcome({ onStartTour, onLater }: { onStartTour: () => void; onLater: () => void }) {
  return (
    <div className="fixed inset-0 z-[300] flex flex-col overflow-hidden"
      style={{ backgroundImage: 'url(/welcome-bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      {/* 背景画像のロゴマークが画面上部〜中央にあるため、その下に文字を配置する */}
      <div style={{ height: '48vh' }} />
      <div className="flex flex-col items-center text-center px-8">
        <h1 className="text-4xl font-bold text-white" style={{ animation: 'welcomeFadeUp 0.7s ease-out both', animationDelay: '0.1s' }}>
          {WELCOME_TEXT.title}
        </h1>
        <p className="mt-3 text-base text-white/90" style={{ animation: 'welcomeFadeUp 0.7s ease-out both', animationDelay: '0.25s' }}>
          {WELCOME_TEXT.subtitle}
        </p>
      </div>
      <div className="flex-1" />
      <div className="w-full px-6 flex flex-col gap-3" style={{
        paddingBottom: 'calc(2.5rem + env(safe-area-inset-bottom))',
        animation: 'welcomeFadeUp 0.7s ease-out both', animationDelay: '0.4s',
      }}>
        <button onClick={onStartTour}
          className="w-full py-3.5 rounded-2xl text-[15px] font-bold text-white active:opacity-80 shadow-lg"
          style={{ background: 'var(--c-primary)' }}>
          {WELCOME_TEXT.startTour}
        </button>
        <button onClick={onLater} className="w-full py-3 text-sm font-medium text-white/80 active:opacity-60">
          {WELCOME_TEXT.later}
        </button>
      </div>
    </div>
  );
}
