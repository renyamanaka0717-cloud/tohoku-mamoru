'use client';
import { useState, useRef } from 'react';
import type { TouchEvent } from 'react';
import { AppIcons } from './Icons';

const MINT_SOFT = 'color-mix(in srgb, var(--c-primary) 14%, white)';

interface PageDef { title: string; body: string; }

const PAGES: PageDef[] = [
  { title: '頭の中を、\n空っぽに。', body: '覚えることは、\nBrainBoxにおまかせ' },
  { title: '忘れ物、\nありませんか？', body: '買い物リストやタスクを\n作ったこと自体を忘れてしまう。' },
  { title: 'だから、場所で\n思い出させる。', body: '登録した場所に近づくと、\n必要なことをお知らせします。' },
  { title: '必要なときだけ、\nやさしく通知。', body: '時間でも、場所でも、\nあなたに合ったタイミングで\nお知らせします。' },
  { title: 'さあ、\nはじめましょう！', body: 'BrainBoxが、あなたの毎日を\nもっとラクに、もっと忘れなく\nしてくれます。' },
];

function Circle({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <div className="rounded-full flex items-center justify-center shrink-0" style={{ width: size, height: size, background: MINT_SOFT }}>
      {children}
    </div>
  );
}

function Illustration({ page }: { page: number }) {
  if (page === 0) {
    return (
      <div className="relative flex items-center justify-center" style={{ height: 140 }}>
        <Circle size={120}><AppIcons.brain size={56} className="text-[var(--c-primary)]"/></Circle>
        <div className="absolute" style={{ top: 6, left: '28%' }}><AppIcons.sparkle size={16} className="text-[var(--c-primary)]"/></div>
        <div className="absolute" style={{ top: 16, right: '26%' }}><AppIcons.sparkle size={12} className="text-[var(--c-primary)]"/></div>
      </div>
    );
  }
  if (page === 1) {
    return (
      <div className="flex flex-col items-center gap-3" style={{ height: 140, justifyContent: 'center' }}>
        <div className="bg-gray-50 rounded-2xl px-4 py-2.5 text-xs text-gray-400 text-center leading-relaxed">
          あ、買い物リスト<br/>作ったのに忘れてた…
        </div>
        <Circle size={72}><AppIcons.shopping size={32} className="text-[var(--c-primary)]"/></Circle>
      </div>
    );
  }
  if (page === 2) {
    return (
      <div className="flex items-center justify-center" style={{ height: 140 }}>
        <Circle size={120}><AppIcons.location size={52} className="text-[var(--c-primary)]"/></Circle>
      </div>
    );
  }
  if (page === 3) {
    return (
      <div className="flex items-end justify-center gap-3" style={{ height: 140 }}>
        <Circle size={60}><AppIcons.clock size={24} className="text-[var(--c-primary)]"/></Circle>
        <Circle size={84}><AppIcons.bell size={34} className="text-[var(--c-primary)]"/></Circle>
        <Circle size={60}><AppIcons.location size={24} className="text-[var(--c-primary)]"/></Circle>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center" style={{ height: 140 }}>
      <Circle size={110}><AppIcons.sparkle size={46} className="text-[var(--c-primary)]"/></Circle>
    </div>
  );
}

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [page, setPage] = useState(0);
  const touchX = useRef(0);
  const touchY = useRef(0);

  const next = () => setPage(p => Math.min(p + 1, PAGES.length - 1));
  const prev = () => setPage(p => Math.max(p - 1, 0));

  const onTouchStart = (e: TouchEvent) => {
    touchX.current = e.touches[0].clientX;
    touchY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchX.current;
    const dy = e.changedTouches[0].clientY - touchY.current;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) next(); else prev();
    }
  };

  const p = PAGES[page];
  const isLast = page === PAGES.length - 1;

  return (
    <div className="max-w-md mx-auto bg-white flex flex-col" style={{ height: '100%' }}>
      <div className="flex-1 flex flex-col px-6 overflow-y-auto"
        style={{ paddingTop: 'calc(2.5rem + env(safe-area-inset-top))' }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}>
        <div className="flex-1 flex flex-col items-center justify-center">
          <Illustration page={page}/>
          <h1 className="text-2xl font-bold text-gray-900 text-center mt-8 whitespace-pre-line leading-snug">{p.title}</h1>
          <p className="text-sm text-gray-500 text-center mt-3 whitespace-pre-line leading-relaxed">{p.body}</p>
        </div>
      </div>

      <div className="px-6 flex-shrink-0" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
        <div className="flex items-center justify-center gap-1.5 mb-4">
          {PAGES.map((_, i) => (
            <div key={i} className="rounded-full transition-all"
              style={{ width: i === page ? 18 : 6, height: 6, background: i === page ? 'var(--c-primary)' : '#E5E7EB' }}/>
          ))}
        </div>
        <button onClick={isLast ? onComplete : next}
          className="w-full py-3.5 rounded-2xl text-[15px] font-bold text-white bg-[var(--c-primary)] active:opacity-80">
          {isLast ? '始める' : '次へ'}
        </button>
      </div>
    </div>
  );
}
