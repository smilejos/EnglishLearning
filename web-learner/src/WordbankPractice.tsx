import { useEffect, useRef, useState } from "react";
import * as api from "./api";
import { SoundIcon } from "./icons";
import { claimAudio, releaseAudio, stopAudio } from "./lib/audioBus";
import { levelLabel, maskWord, SYSTEM_LABELS } from "./lib/wordbank";
import type { PracticeMode, WordbankOptions, WordbankQuestion, WordbankSystem } from "./wordbankTypes";
import "./WordbankPractice.css";

const MODES: { value: PracticeMode; label: string; hint: string }[] = [
  { value: "practice", label: "單純練習", hint: "看單字、解釋與例句，依自己的節奏朗讀。" },
  { value: "listening", label: "聽力練習", hint: "先聽單字與例句，試著回想，再揭曉答案。" },
  { value: "challenge", label: "單字挑戰", hint: "閱讀英文解釋，試著想出這個單字。" },
];

function WordbankAudio({ url, label }: { url: string | null; label: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const active = useRef<{ audio: HTMLAudioElement; stop: () => void } | null>(null);
  useEffect(() => () => {
    active.current?.stop();
  }, [url]);

  async function play() {
    if (!url) return;
    if (active.current) { active.current.stop(); return; }
    const audio = new Audio(api.wordbankAudioUrl(url));
    const stop = () => {
      audio.pause();
      audio.onended = null;
      audio.onerror = null;
      releaseAudio(stop);
      if (active.current?.audio === audio) { active.current = null; setState("idle"); }
    };
    active.current = { audio, stop };
    claimAudio(stop);
    setState("loading");
    audio.onended = stop;
    audio.onerror = () => { stop(); setState("error"); };
    try {
      await audio.play();
      if (active.current?.audio === audio) setState("playing");
    } catch {
      if (active.current?.audio === audio) { stop(); setState("error"); }
    }
  }

  return <span className="wordbank-audio">
    <button type="button" className={`btn btn--ghost btn--sm${state === "playing" ? " is-playing" : ""}`}
      disabled={!url || state === "loading"} onClick={() => void play()}
      aria-label={!url ? `${label}（音檔待準備）` : state === "playing" ? `停止${label}` : label}>
      <SoundIcon />{!url ? `${label} · 待準備` : state === "loading" ? "載入音檔…" : state === "playing" ? "停止播放" : label}
    </button>
    {state === "error" && <span role="alert" className="wordbank-audio__error">播放失敗，請再試一次。</span>}
  </span>;
}

export function WordbankPractice() {
  const [options, setOptions] = useState<WordbankOptions | null>(null);
  const [optionsError, setOptionsError] = useState(false);
  const [optionsAttempt, setOptionsAttempt] = useState(0);
  const [system, setSystem] = useState<WordbankSystem>("list");
  const [levels, setLevels] = useState<string[]>(["all"]);
  const [mode, setMode] = useState<PracticeMode>("practice");
  const [draw, setDraw] = useState(0);
  const [question, setQuestion] = useState<WordbankQuestion | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const answerRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setOptionsError(false);
    void api.getWordbankOptions(controller.signal).then((data) => {
      if (!controller.signal.aborted) setOptions(data);
    }).catch(() => {
      if (!controller.signal.aborted) setOptionsError(true);
    });
    return () => controller.abort();
  }, [optionsAttempt]);

  const levelKey = levels.join(",");
  useEffect(() => {
    const controller = new AbortController();
    stopAudio();
    setBusy(true); setQuestion(null); setError(false); setRevealed(false);
    void api.getWordbankQuestion(system, levelKey.split(","), controller.signal).then((data) => {
      if (!controller.signal.aborted) { setQuestion(data); setBusy(false); }
    }).catch(() => {
      if (!controller.signal.aborted) { setError(true); setBusy(false); }
    });
    return () => { controller.abort(); stopAudio(); };
  }, [system, levelKey, mode, draw]);

  function resetQuestion() { stopAudio(); setQuestion(null); setRevealed(false); setBusy(true); }
  function changeLevel(value: string) {
    if (value === "all" && levels.includes("all")) return;
    resetQuestion();
    setLevels((previous) => {
      if (value === "all") return ["all"];
      const specific = previous.filter((v) => v !== "all");
      const next = specific.includes(value) ? specific.filter((v) => v !== value) : [...specific, value];
      return next.length ? next : ["all"];
    });
  }
  function reveal() { setRevealed(true); window.requestAnimationFrame(() => answerRef.current?.focus()); }

  const entry = question?.entry;
  const showAnswer = mode === "practice" || revealed;
  const explainVisible = showAnswer || mode === "challenge";
  const activeMode = MODES.find((m) => m.value === mode)!;

  return <main className="wrap wordbank-page">
    <div className="greet">
      <h1 className="greet__hi">單字練習</h1>
      <p className="greet__sub">選擇程度和方式，每次練習一個隨機單字。</p>
    </div>
    <div className="wordbank-layout">
      <aside className="wordbank-settings" aria-label="練習設定">
        <label className="wordbank-field" htmlFor="wordbank-system">分級制度</label>
        <select className="filter__select" id="wordbank-system" value={system}
          onChange={(e) => { resetQuestion(); setSystem(e.target.value as WordbankSystem); setLevels(["all"]); }}>
          {(Object.keys(SYSTEM_LABELS) as WordbankSystem[]).map((value) => <option key={value} value={value}>{SYSTEM_LABELS[value]}</option>)}
        </select>
        <fieldset className="wordbank-levels"><legend>選擇級別</legend>
          {options ? options.systems[system].map(({ value, count }) => <label key={value} className="wordbank-level">
            <input type="checkbox" checked={levels.includes(value)} onChange={() => changeLevel(value)} />
            <span>{levelLabel(system, value)}</span><span className="wordbank-count">{count.toLocaleString()}</span>
          </label>) : optionsError ? <div><p className="is-error">無法載入級別。</p><button className="link-btn" onClick={() => setOptionsAttempt((v) => v + 1)}>重新載入級別</button></div> : <p className="wordbank-note" role="status">載入級別…</p>}
        </fieldset>
        <p className="wordbank-note">可多選級別，僅練習勾選範圍。</p>
      </aside>
      <section className="wordbank-workspace" aria-label="單字練習內容">
        <div className="wordbank-modes" role="group" aria-label="練習方式">
          {MODES.map((m) => <button type="button" key={m.value} className={`wordbank-mode${m.value === mode ? " on" : ""}`}
            aria-pressed={m.value === mode} onClick={() => { if (mode !== m.value) { resetQuestion(); setMode(m.value); } }}>{m.label}</button>)}
        </div>
        <p className="wordbank-mode-hint">{activeMode.hint}</p>
        <div className="wordbank-question" aria-busy={busy}>
          {busy && <p className="status-line" role="status">正在抽選單字…</p>}
          {error && <div role="alert"><p className="status-line is-error">無法取得單字，請重新抽選。</p><button className="btn btn--primary" onClick={() => setDraw((v) => v + 1)}>重新抽選</button></div>}
          {!busy && !error && !entry && <div><h2 className="wordbank-empty">沒有符合條件的單字</h2><p className="wordbank-note">試試其他級別，或選擇全部。</p></div>}
          {entry && <>
            <div className="wordbank-word-row">
              <h2 className={`wordbank-word${showAnswer ? "" : " wordbank-word--masked"}`} lang="en" tabIndex={-1} ref={answerRef}
                aria-label={showAnswer ? undefined : "單字提示"}>{showAnswer ? entry.word : maskWord(entry.word, mode)}</h2>
              {(showAnswer || mode === "listening") && <WordbankAudio key={`word-${entry.guid}`} url={entry.wordAudioUrl} label="朗讀單字" />}
            </div>
            {showAnswer && <div className="wordbank-definition">
              <p className="wordbank-pos" lang="en">{entry.partsOfSpeech.length ? entry.partsOfSpeech.join(" / ") : "詞性待補"}</p>
              <p>{entry.definition || "中文定義待補"}</p>
            </div>}
            <div className="wordbank-actions">
              {!showAnswer && <button className="btn btn--primary" onClick={reveal}>揭曉答案</button>}
              <button className={`btn ${showAnswer ? "btn--primary" : "btn--ghost"}`} onClick={() => { resetQuestion(); setDraw((v) => v + 1); }}>下一個單字 <span aria-hidden="true">→</span></button>
              <span className="wordbank-note">抽選範圍 {question.poolSize.toLocaleString()} 字</span>
            </div>
            {explainVisible && <section className="wordbank-explains" aria-label="英文解釋">
              <h3>英文解釋</h3>
              {entry.explains.some((exp) => exp.en.trim()) ? <ul>{entry.explains.filter((exp) => exp.en.trim()).map((exp, index) => <li key={exp.guid}>
                <p lang="en">{exp.en}</p>
                <WordbankAudio url={exp.audioUrl} label={`朗讀英文解釋 ${index + 1}`} />
              </li>)}</ul>
                : <p className="wordbank-note">英文解釋待補{!showAnswer ? "，可先揭曉答案或換下一個單字。" : "。"}</p>}
            </section>}
            {(showAnswer || mode === "listening") && <section className="wordbank-examples" aria-label="例句">
              <h3>{showAnswer ? "例句" : "聽聽例句"}</h3>
              {entry.examples.length ? <ol>{entry.examples.map((example, index) => <li key={example.guid}>
                <div className="wordbank-example-row"><span className="wordbank-example-number">例句 {index + 1}</span>
                  <WordbankAudio url={example.audioUrl} label={`朗讀例句 ${index + 1}`} /></div>
                {showAnswer && <><p className="wordbank-example-en" lang="en">{example.en || "英文例句待補"}</p><p className="wordbank-example-zh">{example.zh || "中文翻譯待補"}</p></>}
              </li>)}</ol> : <p className="wordbank-note">例句待補。</p>}
            </section>}

          </>}
        </div>
      </section>
    </div>
  </main>;
}
