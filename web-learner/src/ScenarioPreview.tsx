/// <reference types="vite/client" />
import { useEffect, useRef, useState } from "react";
import { claimAudio, releaseAudio } from "./lib/audioBus";
import { HeadphonesIcon, PauseIcon, SoundIcon } from "./icons";

type Entry = {
  guid: string; word: string; list: string | null; partsOfSpeech: string[]; definition: string;
  wordAudioKey: string | null;
  explains: { guid: string; en: string; audioKey: string | null }[];
  examples: { guid: string; en: string; zh: string; audioKey: string | null }[];
};
export type ScenarioPreviewData = {
  titleZh: string;
  targets: { word: string; entryGuid: string; senseZh: string; teachingPos: string }[];
  entries: Entry[];
  story: { textZh: string; sentences: {
    id: string; en: string; wordLinks: {
      start: number; end: number; surface: string; word: string; entryGuid: string; isTarget: boolean;
    }[];
  }[] };
};

// 僅供這張已含文字的參考圖使用；正式套件 interaction 仍待無文字底圖審核。
const labelRegions: Record<string, [number, number, number]> = {
  television: [.095, .12, .09], plant: [.245, .078, .064], clock: [.407, .004, .064],
  comfortable: [.265, .162, .115], read: [.267, .3, .054], book: [.443, .297, .055],
  sofa: [.522, .172, .05], shelf: [.655, .078, .058], curtain: [.778, .04, .078],
  window: [.896, .056, .084], lamp: [.88, .169, .064], sleep: [.744, .266, .056],
  pillow: [.743, .425, .074], table: [.638, .741, .066], chair: [.81, .849, .07],
};

function AudioButton({ audioKey, label, urls }: { audioKey: string | null; label: string; urls: Record<string, string> }) {
  const url = audioKey ? urls[audioKey] : undefined;
  const audio = useRef<HTMLAudioElement | null>(null);
  const generation = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const stop = useRef(() => {
    generation.current++;
    audio.current?.pause();
    audio.current = null;
    setPlaying(false);
    releaseAudio(stop.current);
  });
  useEffect(() => () => stop.current(), [url]);
  const play = async () => {
    if (!url) return;
    if (playing) { stop.current(); return; }
    stop.current();
    setFailed(false);
    const current = new Audio(url);
    audio.current = current;
    const ticket = generation.current;
    const fail = () => {
      if (ticket !== generation.current) return;
      stop.current(); setFailed(true);
    };
    current.onended = () => { if (ticket === generation.current) stop.current(); };
    current.onerror = fail;
    claimAudio(stop.current);
    try {
      await current.play();
      if (ticket === generation.current) setPlaying(true);
    } catch { fail(); }
  };
  return <span className="scenario-audio">
    <button className="btn btn--ghost btn--sm" disabled={!url} onClick={() => void play()}
      aria-label={playing ? `暫停${label}` : `${failed ? "重試" : "播放"}${label}`}>
      {playing ? <PauseIcon /> : <SoundIcon />}
      {url ? playing ? "暫停" : failed ? "重試播放" : "播放" : "音檔待準備"}
    </button>
    {failed && <span role="status" className="scenario-error">播放失敗，請重試。</span>}
  </span>;
}

function StorySentence({ sentence, onSelect }: {
  sentence: ScenarioPreviewData["story"]["sentences"][number]; onSelect: (guid: string) => void;
}) {
  let cursor = 0;
  const chunks: React.ReactNode[] = [];
  for (const link of sentence.wordLinks) {
    chunks.push(sentence.en.slice(cursor, link.start));
    chunks.push(<button key={link.start} className={`scenario-story-word${link.isTarget ? " is-target" : ""}`}
      aria-label={`查看 ${link.surface}（${link.word}）單字卡`} onClick={() => onSelect(link.entryGuid)}>{link.surface}</button>);
    cursor = link.end;
  }
  chunks.push(sentence.en.slice(cursor));
  return <>{chunks} </>;
}

function WordCard({ entry, target, urls }: {
  entry: Entry; target?: ScenarioPreviewData["targets"][number]; urls: Record<string, string>;
}) {
  return <>
    <div className="scenario-card-title"><h3>{entry.word}</h3>
      <AudioButton audioKey={entry.wordAudioKey} label={`${entry.word} 單字`} urls={urls} /></div>
    <p className="scenario-word-meta">{entry.partsOfSpeech.join(" / ")} · {entry.list ?? "未分類"}</p>
    {target && <p className="scenario-sense">本情境：{target.senseZh}（{target.teachingPos}）</p>}
    <p className="scenario-definition">{entry.definition || "中文釋義待補"}</p>
    <section aria-label="字庫英文解釋" className="scenario-word-section">
      <h4>英文解釋</h4>
      {entry.explains.slice(0, 1).map(item => <div key={item.guid}>
        <p>{item.en}</p><AudioButton audioKey={item.audioKey} label={`${entry.word} 英文解釋`} urls={urls} />
      </div>)}
      {entry.explains.length > 1 && <details><summary>更多英文解釋</summary>
        {entry.explains.slice(1).map(item => <div key={item.guid}><p>{item.en}</p>
          <AudioButton audioKey={item.audioKey} label={`${entry.word} 英文解釋`} urls={urls} /></div>)}
      </details>}
    </section>
    <section aria-label="字庫既有例句" className="scenario-word-section">
      <h4>字庫例句</h4>
      {entry.examples.slice(0, 1).map(item => <div key={item.guid}>
        <p>{item.en}</p><p className="scenario-example-zh">{item.zh}</p>
        <AudioButton audioKey={item.audioKey} label={`${entry.word} 英文例句`} urls={urls} />
      </div>)}
      {entry.examples.length > 1 && <details><summary>更多例句（{entry.examples.length - 1}）</summary>
        {entry.examples.slice(1).map(item => <div key={item.guid}><p>{item.en}</p><p className="scenario-example-zh">{item.zh}</p>
          <AudioButton audioKey={item.audioKey} label={`${entry.word} 英文例句`} urls={urls} /></div>)}
      </details>}
    </section>
  </>;
}

function PreviewDialog({ title, focusKey, children, onClose }: {
  title: string; focusKey: string; children: React.ReactNode; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const backdropDown = useRef(false);
  useEffect(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const element = dialog.current!;
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [focusKey]);
  const outside = (event: React.PointerEvent | React.MouseEvent) => {
    const rect = dialog.current!.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };
  return <dialog ref={dialog} className={`scenario-dialog${focusKey === "story" ? " scenario-dialog--story" : ""}`}
    aria-modal="true" aria-labelledby="scenario-dialog-title"
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const stops = [...dialog.current!.querySelectorAll<HTMLElement>(
        'button:not([disabled]), summary, a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter(element => {
        const closedDetails = element.closest("details:not([open])");
        return !closedDetails || (element.tagName === "SUMMARY" && element.parentElement === closedDetails);
      });
      const first = stops[0];
      const last = stops.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) {
        event.preventDefault(); last?.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus({ preventScroll: true });
      }
    }}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onPointerDown={event => { backdropDown.current = event.target === event.currentTarget && outside(event); }}
    onClick={event => {
      if (backdropDown.current && event.target === event.currentTarget && outside(event)) onClose();
      backdropDown.current = false;
    }}>
    <header className="scenario-dialog-heading">
      <h2 id="scenario-dialog-title" ref={heading} tabIndex={-1}>{title}</h2>
      <button className="scenario-dialog-close" aria-label={`關閉${title}`} onClick={onClose}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
    </header>
    <div className="scenario-dialog-content">{children}</div>
  </dialog>;
}

export function ScenarioPreview({ data, imageUrl, audioUrls }: {
  data: ScenarioPreviewData; imageUrl: string; audioUrls: Record<string, string>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [showLocations, setShowLocations] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [modal, setModal] = useState<"word" | "story" | null>(null);
  const [fromStory, setFromStory] = useState(false);
  const [translationOpen, setTranslationOpen] = useState(false);
  const entry = data.entries.find(e => e.guid === selected);
  const target = data.targets.find(t => t.entryGuid === selected);
  const select = (guid: string) => {
    setSelected(guid);
    setFromStory(modal === "story");
    setModal("word");
  };
  return <div className="scenario-preview">
    <header className="topbar"><div className="topbar__in">
      <span className="brand"><span className="brand__mark"><HeadphonesIcon size={20} /></span>
        <span className="brand__name">英文學習平台</span></span>
      <span className="scenario-preview-status">情境試作預覽</span>
    </div></header>
    <main className="scenario-wrap">
      <div className="scenario-heading"><div><h1>{data.titleZh}</h1>
        <p>一個舒服的午後，從客廳裡的十五個單字開始。</p></div>
        <span className="scenario-level">basic ＋ advance · 15 詞</span></div>
      <div className={`scenario-image-tools${zoomed ? " is-zoomed" : ""}`}>
        <p><span className="scenario-desktop-hint">點選圖上的英文標籤，查看解釋與例句。</span>
          <span className="scenario-mobile-hint">放大圖片後點英文標籤，查看單字解釋。</span></p>
        <div><button className="btn btn--ghost btn--sm scenario-locations-button" aria-pressed={showLocations} onClick={() => setShowLocations(!showLocations)}>
          {showLocations ? "收起點選位置" : "顯示點選位置"}</button>
          <button className="btn btn--ghost btn--sm" aria-pressed={zoomed} onClick={() => setZoomed(!zoomed)}>{zoomed ? "還原圖片" : "放大圖片"}</button>
          <button className="btn btn--primary btn--sm" onClick={() => setModal("story")}><HeadphonesIcon size={16} /> 故事與旁白</button></div>
      </div>
      <div className={`scenario-image-scroll${zoomed ? " is-zoomed" : ""}`}>
        <div className={`scenario-image-canvas${showLocations ? " show-locations" : ""}`}>
          {imageFailed ? <p role="alert" className="scenario-image-error">圖片未能載入。可先開啟「故事與旁白」查看故事與單字。
            <button className="btn btn--ghost" onClick={() => setImageFailed(false)}>重試載入圖片</button></p> :
            <img src={imageUrl} alt="溫暖的午後客廳，一個孩子在沙發上閱讀，另一個孩子靠著枕頭睡覺；圖中標有十五個英文目標詞。"
              width="1672" height="941" onError={() => setImageFailed(true)} />}
          {!imageFailed && data.targets.map(t => {
            const [x, y, width] = labelRegions[t.word] ?? [0, 0, .05];
            return <button key={t.entryGuid} className={`scenario-hotspot${selected === t.entryGuid ? " is-selected" : ""}`}
              aria-label={`查看 ${t.word} 單字卡`} title={t.word} style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${width * 100}%` }}
              onClick={() => select(t.entryGuid)} />;
          })}
        </div>
      </div>
      <p className="scenario-image-note">這張參考圖的英文已畫在圖片內，暫不提供隱藏答案練習。</p>
      <footer className="scenario-footer">原八詞版與十五詞版均保留。本頁供效果與互動確認；故事旁白及三個 advance 詞的音檔尚待準備。</footer>
    </main>
    {modal && <PreviewDialog title={modal === "story" ? "客廳裡的小故事" : "單字卡"}
      focusKey={modal === "story" ? "story" : selected ?? "word"} onClose={() => setModal(null)}>
      {modal === "story" ? <section className="scenario-story" aria-label="客廳裡的小故事">
        <span className="scenario-pending"><HeadphonesIcon size={16} /> 英文旁白待準備</span>
        <p className="scenario-story-hint">點選故事中的單字，查看原形、解釋與例句。靛藍字是本次目標詞。</p>
        <p className="scenario-story-text">{data.story.sentences.map(s => <StorySentence key={s.id} sentence={s} onSelect={select} />)}</p>
        <div className="scenario-translation">
          <button className="link-btn" aria-expanded={translationOpen} aria-controls="scenario-translation-text"
            onClick={() => setTranslationOpen(!translationOpen)}>{translationOpen ? "收起繁中翻譯" : "展開繁中翻譯"}</button>
          {translationOpen && <p id="scenario-translation-text">{data.story.textZh}</p>}
        </div>
      </section> : entry && <>
        {fromStory && <button className="link-btn scenario-back-story" onClick={() => setModal("story")}>回到故事</button>}
        <WordCard key={entry.guid} entry={entry} target={target} urls={audioUrls} />
      </>}
    </PreviewDialog>}
  </div>;
}
