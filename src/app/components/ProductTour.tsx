'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppIcons } from './Icons';
import { useI18n, type StringKey } from './I18n';

interface TourStepDef {
  id: 'add' | 'save' | 'laterName' | 'laterConfirm' | 'drag';
  selector: string;
  // 吹き出しの矢印が指す位置・吹き出しの上下配置の基準。省略時はselectorの対象と同じ
  // （スポットライトの範囲と、矢印が指す/吹き出しが基準にする位置が異なる場合に使う。
  // 例: saveステップはヘッダー全体をスポットライトするが、矢印・配置は「あとで」タブを基準にする）
  arrowSelector?: string;
  titleKey: StringKey;
  bodyKey?: StringKey;
  // このステップだけは実際の操作を強制せず「次へ」ボタンで進める（例: saveステップは
  // 機能の存在を伝える説明のみで、特定の操作を指示しているわけではないため）
  showNextButton?: boolean;
  // 吹き出しの上下配置を自動判定（対象が画面下半分か）せず固定したい場合に指定する。
  // laterName/laterConfirmステップは対象（タスク名入力欄）が画面上部にあるが、
  // 吹き出しは上に固定表示したいため使う
  bubblePosition?: 'above' | 'below';
}

const STEPS: TourStepDef[] = [
  { id: 'add', selector: '[data-tour="fab-add"]', titleKey: 'tourAddTitle', bodyKey: 'tourAddBody' },
  { id: 'save', selector: '[data-tour="modal-card"]', arrowSelector: '[data-tour="tab-later"]', titleKey: 'tourSaveTitle', showNextButton: true },
  { id: 'laterName', selector: '[data-tour="modal-card"]', arrowSelector: '[data-tour="name-input-row"]', titleKey: 'tourLaterNameTitle', showNextButton: true, bubblePosition: 'above' },
  { id: 'laterConfirm', selector: '[data-tour="modal-card"]', arrowSelector: '[data-tour="save-button"]', titleKey: 'tourLaterConfirmTitle', bodyKey: 'tourLaterConfirmBody' },
  { id: 'drag', selector: '[data-tour="tour-draggable"]', titleKey: 'tourDragTitle', bodyKey: 'tourDragBody' },
];

interface Rect { top: number; left: number; width: number; height: number; }

export default function ProductTour({ onFinish, gestureSignal, modalOpen, taskSavedSignal, isDragging, onEnterLaterNameStep, onSkipLaterName }: {
  onFinish: (skipped: boolean) => void;
  gestureSignal: number;
  modalOpen: boolean;
  taskSavedSignal: number;
  isDragging?: boolean;
  onEnterLaterNameStep?: () => void;
  // laterNameステップで名前を入力せず「次へ」を押した場合に、仮の名前を入れてもらうためのコールバック
  onSkipLaterName?: () => void;
}) {
  const { tr } = useI18n();
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [arrowRect, setArrowRect] = useState<Rect | null>(null);
  const [showCompletion, setShowCompletion] = useState(false);
  // ドロップ完了直後は演出用に一旦オーバーレイを消し、2秒待ってから完了ポップアップを出す
  const [dropped, setDropped] = useState(false);
  // laterNameステップの「次へ」は、名前が入力されるまで表示しない
  const [hasName, setHasName] = useState(false);
  const indicatorRef = useRef<HTMLDivElement>(null);
  // 「上固定」吹き出しの最小位置は固定pxではなく、実際に描画されたページインジケーター行の
  // 下端を実測して使う（過去の不具合: 固定56pxだとキーボード表示時にステータスバー付近まで
  // 吹き出しが迫って隠れ、108pxだとキーボード非表示時にヘッダーに重なりすぎた。
  // デバイスのセーフエリアやキーボード有無に関わらず自然に避けられるよう実測値に変更）
  const [indicatorBottom, setIndicatorBottom] = useState(56);
  // iOSのWKWebViewはキーボード表示時に「レイアウトビューポート」と「実際に見えている範囲
  // （visualViewport）」がズレる既知の挙動があり、position:fixedの要素がそのズレの影響で
  // 画面外に消えてしまう不具合があった（吹き出しだけでなくページインジケーター行ごと見えなく
  // なっていたことから判明）。visualViewportの実際のオフセット・高さを追従し、オーバーレイ
  // 全体をそのぶんだけ補正することで、キーボード表示中も正しい位置に表示させる
  const [vv, setVv] = useState<{ top: number; height: number }>({ top: 0, height: typeof window !== 'undefined' ? window.innerHeight : 812 });
  useEffect(() => {
    const update = () => {
      const v = window.visualViewport;
      setVv(v ? { top: v.offsetTop, height: v.height } : { top: 0, height: window.innerHeight });
    };
    update();
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  const modalOpenBaseline = useRef(modalOpen);
  const taskSavedBaseline = useRef(taskSavedSignal);
  const gestureBaseline = useRef(gestureSignal);
  const step = STEPS[stepIndex];

  // getBoundingClientRect()が返すDOMRectはtop/left/width/heightがprototypeのgetterで
  // own enumerable propertyではないため、{...rect}のスプレッドではこれらがコピーされず失われる
  // （highlightRectの計算がNaNになり、ブラウザがその不正なスタイル代入を無視して直前の値を
  // 保持し続ける不具合の原因だった）。stateには必ずプレーンオブジェクトに変換して保存する
  const toRect = (r: DOMRect): Rect => ({ top: r.top, left: r.left, width: r.width, height: r.height });

  const measure = useCallback(() => {
    const el = document.querySelector(step.selector) as HTMLElement | null;
    setRect(el ? toRect(el.getBoundingClientRect()) : null);
    if (step.arrowSelector) {
      const arrowEl = document.querySelector(step.arrowSelector) as HTMLElement | null;
      setArrowRect(arrowEl ? toRect(arrowEl.getBoundingClientRect()) : null);
    } else {
      setArrowRect(null);
    }
    if (indicatorRef.current) setIndicatorBottom(indicatorRef.current.getBoundingClientRect().bottom);
  }, [step.selector, step.arrowSelector]);

  useEffect(() => {
    measure();
    const iv = setInterval(measure, 400);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    return () => {
      clearInterval(iv);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
    };
  }, [measure]);

  const goNext = useCallback(() => {
    if (stepIndex >= STEPS.length - 1) setShowCompletion(true);
    else setStepIndex(i => i + 1);
  }, [stepIndex]);

  // 対象要素が見つからない場合（該当データが無い等）は少し待って自動的に次へ進む。
  // ただしdrop直後（dropped）はdragステップの対象が消えるのが正常な結果なので、
  // このフォールバックではなく専用の2秒待ちタイマー（下記）に処理を任せる
  useEffect(() => {
    if (rect || showCompletion || dropped) return;
    const t = setTimeout(() => goNext(), 800);
    return () => clearTimeout(t);
  }, [rect, showCompletion, dropped, goNext]);

  // 各ステップに入った時点の値を基準に記録し、実際の操作（タップ・保存・ドラッグ）で自動的に進む
  useEffect(() => {
    modalOpenBaseline.current = modalOpen;
    taskSavedBaseline.current = taskSavedSignal;
    gestureBaseline.current = gestureSignal;
  }, [stepIndex]);
  useEffect(() => {
    if (step.id === 'add' && modalOpen && !modalOpenBaseline.current) goNext();
  }, [modalOpen, step.id, goNext]);
  useEffect(() => {
    // 「あとでやる」の保存は複数の説明ステップ（save/laterName/laterConfirm）を経てから行われるが、
    // どのステップの最中に実際に保存されても即座に反映できるよう、まとめて監視する
    if ((step.id === 'save' || step.id === 'laterName' || step.id === 'laterConfirm') && taskSavedSignal !== taskSavedBaseline.current) goNext();
  }, [taskSavedSignal, step.id, goNext]);
  // laterNameステップに入った時点でタスク名入力欄にフォーカスし、キーボードを表示する
  // （それ以外のステップでは自動フォーカスを抑止しているため、ここで明示的に発火させる。
  // 実際のキーボード表示は「次へ」ボタンのonClick内での直接focus()が主で、これは保険）
  useEffect(() => {
    if (step.id === 'laterName') onEnterLaterNameStep?.();
  }, [step.id, onEnterLaterNameStep]);
  // laterNameステップの間、名前入力欄の値を直接監視して「次へ」ボタンの表示を切り替える
  // （最初は非表示・文字が入力された時点で表示。TaskModalの`name` stateは兄弟コンポーネントから
  // 直接見えないため、実DOMのinputに'input'イベントリスナーを付けて追従する）
  useEffect(() => {
    if (step.id !== 'laterName') { setHasName(false); return; }
    const el = document.querySelector('[data-tour="name-input-row"] input') as HTMLInputElement | null;
    if (!el) return;
    const update = () => setHasName(!!el.value.trim());
    update();
    el.addEventListener('input', update);
    return () => el.removeEventListener('input', update);
  }, [step.id]);
  // ドロップした瞬間にオーバーレイを消して結果を見せ、2秒待ってから完了ポップアップに進む
  useEffect(() => {
    if (step.id !== 'drag' || gestureSignal === gestureBaseline.current) return;
    setDropped(true);
    const t = setTimeout(() => goNext(), 2000);
    return () => clearTimeout(t);
  }, [gestureSignal, step.id, goNext]);

  const handleSkip = () => onFinish(true);

  if (showCompletion) {
    return (
      <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/55 px-6">
        <div className="bg-white rounded-3xl px-6 py-8 w-full max-w-xs text-center shadow-2xl">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'color-mix(in srgb, var(--c-primary) 14%, white)' }}>
            <AppIcons.checkSquare size={30} className="text-[var(--c-primary)]" />
          </div>
          <p className="text-lg font-bold text-gray-900 mb-2">{tr('tourCompleteTitle')}</p>
          <p className="text-sm text-gray-500 leading-relaxed mb-6">{tr('tourCompleteBody')}</p>
          <button onClick={() => onFinish(false)} className="w-full py-3 rounded-2xl text-[15px] font-bold text-white" style={{ background: 'var(--c-primary)' }}>{tr('tourCompleteStart')}</button>
        </div>
      </div>
    );
  }

  // ドロップ直後は完了ポップアップが出るまでの2秒間、オーバーレイ・吹き出しを消して
  // タイムラインに追加された結果をそのまま見せる
  if (dropped) return null;

  const vh = vv.height;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 390;
  // 吹き出しの上下配置・矢印の水平位置は、スポットライト範囲（rect）ではなく矢印が指すべき対象
  // （arrowSelectorがあればそちら、無ければスポットライト対象そのもの）を基準にする。
  // スポットライトが広い範囲（モーダル全体・ヘッダー全体など）の場合、rectそのものを基準にすると
  // 吹き出しがその範囲の端に配置されて対象から離れすぎるのを防ぐため
  // 稀にレイアウト確定前の一瞬でサイズ0のrectを拾うことがあるため、幅・高さが0の測定結果は無視する
  const validArrowRect = arrowRect && arrowRect.width > 0 && arrowRect.height > 0 ? arrowRect : null;
  const arrowTarget = validArrowRect ?? rect;
  const above = step.bubblePosition ? step.bubblePosition === 'above' : (arrowTarget ? arrowTarget.top > vh * 0.55 : false);
  const bubbleTop = arrowTarget
    ? (above ? Math.max(indicatorBottom + 12, arrowTarget.top - 168) : Math.min(vh - 190, arrowTarget.top + arrowTarget.height + 20))
    : vh / 2 - 80;
  const bubbleContainerLeft = 16, bubbleContainerWidth = vw - 32;
  const bubbleWidth = Math.min(320, bubbleContainerWidth);
  const bubbleLeft = bubbleContainerLeft + (bubbleContainerWidth - bubbleWidth) / 2;
  const arrowLeft = arrowTarget
    ? Math.min(bubbleWidth - 24, Math.max(24, (arrowTarget.left + arrowTarget.width / 2) - bubbleLeft))
    : bubbleWidth / 2;
  // 注目を引く光る枠は、スポットライトの穴（rect、タップ可能な範囲）とは別に、矢印が指す対象の
  // 下端までで打ち切る（arrowSelectorがある場合のみ）。穴自体は変えずタップ可能範囲を保ったまま、
  // 視覚的な強調だけを対象の近くに絞れる（例: saveステップはモーダル全体が操作可能なままだが、
  // 光る枠は「あとで」タブの少し下までで止める）
  const highlightRect = rect && validArrowRect
    ? { ...rect, height: Math.max(40, Math.min(rect.height, (validArrowRect.top + validArrowRect.height) - rect.top + 12)) }
    : rect;
  // dragステップは空き時間カード内の他の「あとでやる」タスクも見えた方が分かりやすいため、
  // 通常より暗さを弱める。さらに実際にドラッグ中は指の下のタイムライン全体が見える必要があるため、
  // ほぼ暗転無しにする
  const overlayAlpha = step.id === 'drag' ? (isDragging ? 0.08 : 0.3) : 0.6;
  const overlayStyle = { background: `rgba(0,0,0,${overlayAlpha})` };

  return (
    <div className="fixed inset-0 z-[220]" style={{ pointerEvents: 'none', transform: vv.top ? `translateY(${vv.top}px)` : undefined }}>
      {/* タップ可能な「穴」は光る枠（highlightRect）と一致させる。それ以外（rectのうち
          highlightRectより下の部分も含む）はすべて暗転でタップを吸収し、操作できるのは
          光っている場所と吹き出し（ボタン）だけにする */}
      {highlightRect ? (
        <>
          <div className="absolute" style={{ ...overlayStyle, top: 0, left: 0, right: 0, height: Math.max(0, highlightRect.top), pointerEvents: 'auto' }} />
          <div className="absolute" style={{ ...overlayStyle, top: highlightRect.top + highlightRect.height, left: 0, right: 0, bottom: 0, pointerEvents: 'auto' }} />
          <div className="absolute" style={{ ...overlayStyle, top: highlightRect.top, left: 0, width: Math.max(0, highlightRect.left), height: highlightRect.height, pointerEvents: 'auto' }} />
          <div className="absolute" style={{ ...overlayStyle, top: highlightRect.top, left: highlightRect.left + highlightRect.width, right: 0, height: highlightRect.height, pointerEvents: 'auto' }} />
          <div className="absolute rounded-2xl border-2 border-white"
            style={{
              top: highlightRect.top - 6, left: highlightRect.left - 6, width: highlightRect.width + 12, height: highlightRect.height + 12,
              pointerEvents: 'none', animation: 'tourPulse 1.6s ease-in-out infinite, tourScale 1.6s ease-in-out infinite',
            }} />
        </>
      ) : (
        <div className="absolute inset-0" style={{ ...overlayStyle, pointerEvents: 'auto' }} />
      )}

      {/* ページインジケーター＋スキップ */}
      <div ref={indicatorRef} className="fixed left-0 right-0 flex items-center justify-between px-5" style={{ top: 'calc(1rem + env(safe-area-inset-top))', pointerEvents: 'auto' }}>
        <div className="flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s.id} className="rounded-full transition-all" style={{ width: i === stepIndex ? 18 : 6, height: 6, background: i === stepIndex ? 'var(--c-primary)' : 'rgba(255,255,255,0.4)' }} />
          ))}
        </div>
        <button onClick={handleSkip} className="text-xs text-white/40 px-2 py-1.5 active:opacity-60">{tr('tourSkip')}</button>
      </div>

      {/* 吹き出し（説明のみ・ボタンなし／一部ステップのみ「次へ」ボタン） */}
      {rect && (
        <div className="fixed left-4 right-4" style={{ top: bubbleTop, pointerEvents: 'none' }}>
          <div className="relative bg-white rounded-2xl px-5 py-4 shadow-2xl max-w-xs mx-auto">
            <div style={{
              position: 'absolute', left: arrowLeft, width: 0, height: 0,
              borderLeft: '8px solid transparent', borderRight: '8px solid transparent',
              ...(above ? { bottom: -8, borderTop: '8px solid white' } : { top: -8, borderBottom: '8px solid white' }),
              animation: 'tourBlink 1.4s ease-in-out infinite',
            }} />
            <p className={`text-sm font-bold text-gray-900 ${step.bodyKey?'mb-1':''}`}>{tr(step.titleKey)}</p>
            {step.bodyKey&&<p className="text-xs text-gray-500 leading-relaxed">{tr(step.bodyKey)}</p>}
            {step.showNextButton&&(step.id!=='laterName'||hasName)&&(
              <button onClick={()=>{
                if(step.id==='laterName') onSkipLaterName?.();
                // saveステップから抜ける瞬間、タップのユーザー操作と同じ呼び出しスタック内でfocus()する。
                // useEffect経由（onEnterLaterNameStep）だと描画後の非同期タイミングになりiOSでキーボードが
                // 開かないため、ここで実DOMのinputを直接focusする
                if(step.id==='save'){
                  (document.querySelector('[data-tour="name-input-row"] input') as HTMLInputElement|null)?.focus();
                }
                goNext();
              }}
                className="w-full mt-3 py-2.5 rounded-xl text-sm font-bold text-white active:opacity-80"
                style={{ background: 'var(--c-primary)', pointerEvents: 'auto' }}>
                {tr('tourNext')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
