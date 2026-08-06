'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppIcons } from './Icons';

interface TourStepDef {
  id: 'add' | 'schedule' | 'save' | 'drag';
  selector: string;
  // 吹き出しの矢印が指す位置・吹き出しの上下配置の基準。省略時はselectorの対象と同じ
  // （スポットライトの範囲と、矢印が指す/吹き出しが基準にする位置が異なる場合に使う。
  // 例: saveステップはヘッダー全体をスポットライトするが、矢印・配置は「あとで」タブを基準にする）
  arrowSelector?: string;
  title: string;
  body: string;
}

const STEPS: TourStepDef[] = [
  { id: 'add', selector: '[data-tour="fab-add"]', title: 'タスクを追加してみよう', body: 'ここをタップして、新しいタスクを追加しましょう。' },
  { id: 'schedule', selector: '[data-tour="modal-card"]', arrowSelector: '[data-tour="tab-scheduled"]', title: '開始時刻を設定してみよう', body: '時間指定のタスクはこちらから追加できます。' },
  { id: 'save', selector: '[data-tour="modal-header"]', arrowSelector: '[data-tour="tab-later"]', title: '「あとでやる」に保存', body: 'タスク名を入力して保存すると、「あとでやる」にタスクを追加されます。' },
  { id: 'drag', selector: '[data-tour="tour-draggable"]', title: 'タスクをタイムラインに追加', body: 'タスクを長押しして、空いている時間にドラッグしてみましょう。' },
];

interface Rect { top: number; left: number; width: number; height: number; }

export default function ProductTour({ onFinish, gestureSignal, modalOpen, taskSavedSignal, timePickedSignal }: {
  onFinish: (skipped: boolean) => void;
  gestureSignal: number;
  modalOpen: boolean;
  taskSavedSignal: number;
  timePickedSignal: number;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [arrowRect, setArrowRect] = useState<Rect | null>(null);
  const [showCompletion, setShowCompletion] = useState(false);
  const modalOpenBaseline = useRef(modalOpen);
  const taskSavedBaseline = useRef(taskSavedSignal);
  const gestureBaseline = useRef(gestureSignal);
  const timePickedBaseline = useRef(timePickedSignal);
  const step = STEPS[stepIndex];

  const measure = useCallback(() => {
    const el = document.querySelector(step.selector) as HTMLElement | null;
    if (el) setRect(el.getBoundingClientRect());
    else setRect(null);
    if (step.arrowSelector) {
      const arrowEl = document.querySelector(step.arrowSelector) as HTMLElement | null;
      setArrowRect(arrowEl ? arrowEl.getBoundingClientRect() : null);
    } else {
      setArrowRect(null);
    }
  }, [step.selector, step.arrowSelector]);

  useEffect(() => {
    measure();
    const iv = setInterval(measure, 400);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { clearInterval(iv); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [measure]);

  const goNext = useCallback(() => {
    if (stepIndex >= STEPS.length - 1) setShowCompletion(true);
    else setStepIndex(i => i + 1);
  }, [stepIndex]);

  // 対象要素が見つからない場合（該当データが無い等）は少し待って自動的に次へ進む
  useEffect(() => {
    if (rect || showCompletion) return;
    const t = setTimeout(() => goNext(), 800);
    return () => clearTimeout(t);
  }, [rect, showCompletion, goNext]);

  // 各ステップに入った時点の値を基準に記録し、実際の操作（タップ・保存・ドラッグ）で自動的に進む
  useEffect(() => {
    modalOpenBaseline.current = modalOpen;
    taskSavedBaseline.current = taskSavedSignal;
    gestureBaseline.current = gestureSignal;
    timePickedBaseline.current = timePickedSignal;
  }, [stepIndex]);
  useEffect(() => {
    if (step.id === 'add' && modalOpen && !modalOpenBaseline.current) goNext();
  }, [modalOpen, step.id, goNext]);
  useEffect(() => {
    if (step.id === 'schedule' && timePickedSignal !== timePickedBaseline.current) goNext();
  }, [timePickedSignal, step.id, goNext]);
  useEffect(() => {
    if (step.id === 'save' && taskSavedSignal !== taskSavedBaseline.current) goNext();
  }, [taskSavedSignal, step.id, goNext]);
  useEffect(() => {
    if (step.id === 'drag' && gestureSignal !== gestureBaseline.current) goNext();
  }, [gestureSignal, step.id, goNext]);

  const handleSkip = () => onFinish(true);

  if (showCompletion) {
    return (
      <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/55 px-6">
        <div className="bg-white rounded-3xl px-6 py-8 w-full max-w-xs text-center shadow-2xl">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'color-mix(in srgb, var(--c-primary) 14%, white)' }}>
            <AppIcons.checkSquare size={30} className="text-[var(--c-primary)]" />
          </div>
          <p className="text-lg font-bold text-gray-900 mb-2">ツアー完了！</p>
          <p className="text-sm text-gray-500 leading-relaxed mb-6">これでBrainBoxの基本的な使い方はばっちりです。さっそく使ってみましょう。</p>
          <button onClick={() => onFinish(false)} className="w-full py-3 rounded-2xl text-[15px] font-bold text-white" style={{ background: 'var(--c-primary)' }}>はじめる</button>
        </div>
      </div>
    );
  }

  const vh = typeof window !== 'undefined' ? window.innerHeight : 812;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 390;
  // 吹き出しの上下配置・矢印の水平位置は、スポットライト範囲（rect）ではなく矢印が指すべき対象
  // （arrowSelectorがあればそちら、無ければスポットライト対象そのもの）を基準にする。
  // スポットライトが広い範囲（モーダル全体など）の場合、吹き出しがその範囲の端に配置されて
  // 対象から離れすぎるのを防ぐため
  const arrowTarget = arrowRect ?? rect;
  const above = arrowTarget ? arrowTarget.top > vh * 0.55 : false;
  const bubbleTop = arrowTarget
    ? (above ? Math.max(56, arrowTarget.top - 168) : Math.min(vh - 190, arrowTarget.top + arrowTarget.height + 20))
    : vh / 2 - 80;
  const bubbleContainerLeft = 16, bubbleContainerWidth = vw - 32;
  const bubbleWidth = Math.min(320, bubbleContainerWidth);
  const bubbleLeft = bubbleContainerLeft + (bubbleContainerWidth - bubbleWidth) / 2;
  const arrowLeft = arrowTarget
    ? Math.min(bubbleWidth - 24, Math.max(24, (arrowTarget.left + arrowTarget.width / 2) - bubbleLeft))
    : bubbleWidth / 2;
  // 注目を引く光る枠は、スポットライトの穴（rect、タップ可能な範囲）とは別に、矢印が指す対象の
  // 下端までで打ち切る（arrowSelectorがある場合のみ）。穴自体は変えずタップ可能範囲を保ったまま、
  // 視覚的な強調だけを対象の近くに絞れる（例: scheduleステップはモーダル全体が操作可能なままだが、
  // 光る枠は「時間指定」タブの少し下までで止める）
  const highlightRect = rect && arrowRect
    ? { ...rect, height: Math.max(40, Math.min(rect.height, (arrowRect.top + arrowRect.height) - rect.top + 12)) }
    : rect;

  return (
    <div className="fixed inset-0 z-[220]" style={{ pointerEvents: 'none' }}>
      {/* 対象要素の周囲だけを避けて画面を暗くする（4分割の帯） */}
      {rect ? (
        <>
          <div className="absolute bg-black/60" style={{ top: 0, left: 0, right: 0, height: Math.max(0, rect.top), pointerEvents: 'auto' }} />
          <div className="absolute bg-black/60" style={{ top: rect.top + rect.height, left: 0, right: 0, bottom: 0, pointerEvents: 'auto' }} />
          <div className="absolute bg-black/60" style={{ top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height, pointerEvents: 'auto' }} />
          <div className="absolute bg-black/60" style={{ top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height, pointerEvents: 'auto' }} />
          {highlightRect && (
            <div className="absolute rounded-2xl border-2 border-white"
              style={{
                top: highlightRect.top - 6, left: highlightRect.left - 6, width: highlightRect.width + 12, height: highlightRect.height + 12,
                pointerEvents: 'none', animation: 'tourPulse 1.6s ease-in-out infinite, tourScale 1.6s ease-in-out infinite',
              }} />
          )}
        </>
      ) : (
        <div className="absolute inset-0 bg-black/60" style={{ pointerEvents: 'auto' }} />
      )}

      {/* ページインジケーター＋スキップ */}
      <div className="fixed left-0 right-0 flex items-center justify-between px-5" style={{ top: 'calc(1rem + env(safe-area-inset-top))', pointerEvents: 'auto' }}>
        <div className="flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s.id} className="rounded-full transition-all" style={{ width: i === stepIndex ? 18 : 6, height: 6, background: i === stepIndex ? 'var(--c-primary)' : 'rgba(255,255,255,0.4)' }} />
          ))}
        </div>
        <button onClick={handleSkip} className="text-xs font-medium text-white bg-black/30 rounded-full px-3 py-1.5 active:opacity-70">スキップ</button>
      </div>

      {/* 吹き出し（説明のみ・ボタンなし。実際に操作すると自動で次に進む） */}
      {rect && (
        <div className="fixed left-4 right-4" style={{ top: bubbleTop, pointerEvents: 'none' }}>
          <div className="relative bg-white rounded-2xl px-5 py-4 shadow-2xl max-w-xs mx-auto">
            <div style={{
              position: 'absolute', left: arrowLeft, width: 0, height: 0,
              borderLeft: '8px solid transparent', borderRight: '8px solid transparent',
              ...(above ? { bottom: -8, borderTop: '8px solid white' } : { top: -8, borderBottom: '8px solid white' }),
              animation: 'tourBlink 1.4s ease-in-out infinite',
            }} />
            <p className="text-sm font-bold text-gray-900 mb-1">{step.title}</p>
            <p className="text-xs text-gray-500 leading-relaxed">{step.body}</p>
          </div>
        </div>
      )}
    </div>
  );
}
