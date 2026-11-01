import { useCallback, useEffect, useRef, useState } from "react";
import { claimAudio, releaseAudio } from "./lib/audioBus";
import { NextIcon, PauseIcon, PrevIcon, RepeatIcon, SoundIcon } from "./icons";
import { phonicsAudioPath, shortAFamilies, shortAIntroductionWords, shortAQuestions, shortASentences, studyWords, type PhonicsQuestion } from "./phonicsLesson";
import "./PhonicsLearning.css";

/** 播放票號避免舊 play promise／媒體事件覆蓋新的播放狀態。 */
function usePhonicsAudio() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const ticket = useRef(0);
  const nextTrack = useRef<number | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [active, setActive] = useState<string | null>(null);
  const [sequenceActive, setSequenceActive] = useState(false);
  const stop = useCallback(() => {
    ticket.current++;
    if (nextTrack.current !== null) {
      window.clearTimeout(nextTrack.current);
      nextTrack.current = null;
    }
    if (audio.current) {
      audio.current.pause();
      audio.current.onended = null;
      audio.current.onerror = null;
      audio.current = null;
    }
    releaseAudio(stop);
    setActive(null);
    setState("idle");
    setSequenceActive(false);
  }, []);
  useEffect(() => () => stop(), [stop]);
  const playTracks = (keys: string[], rate: number, onTrack?: (index: number) => void) => {
    stop();
    if (keys.length === 0) return;
    const ownTicket = ++ticket.current;
    setSequenceActive(keys.length > 1);
    claimAudio(stop);
    const startTrack = async (index: number): Promise<void> => {
      if (ticket.current !== ownTicket) return;
      nextTrack.current = null;
      const current = new Audio(phonicsAudioPath(keys[index]));
      current.playbackRate = rate;
      audio.current = current;
      onTrack?.(index);
      const isCurrent = () => ticket.current === ownTicket && audio.current === current;
      const fail = () => {
        if (!isCurrent()) return;
        stop();
        setState("error");
      };
      current.onended = () => {
        if (!isCurrent()) return;
        if (index + 1 === keys.length) { stop(); return; }
        current.onended = null;
        current.onerror = null;
        audio.current = null;
        // 每字之間保留短暫間隔，讓使用者有時間跟讀；仍持有音源仲裁。
        nextTrack.current = window.setTimeout(() => { void startTrack(index + 1); }, 650);
      };
      current.onerror = fail;
      setActive(keys[index]);
      setState("loading");
      try {
        await current.play();
        if (isCurrent()) setState("playing");
      } catch { fail(); }
    };
    return startTrack(0);
  };
  const play = (key: string, rate = 1) => playTracks([key], rate);
  const playSequence = (keys: string[], onTrack: (index: number) => void) => playTracks(keys, 1, onTrack);
  return { state, active, sequenceActive, play, playSequence, stop };
}
type Player = ReturnType<typeof usePhonicsAudio>;

function AudioButton({ player, audioKey, label, slow = false, primary = false }: {
  player: Player; audioKey: string; label: string; slow?: boolean; primary?: boolean;
}) {
  const playing = player.active === audioKey && player.state === "playing";
  const loading = player.active === audioKey && player.state === "loading";
  return <button className={`btn ${primary ? "btn--primary" : "btn--ghost"}`}
    disabled={loading} aria-label={playing ? `停止${label}` : label}
    onClick={() => playing ? player.stop() : void player.play(audioKey, slow ? 0.8 : 1)}>
    {playing ? <PauseIcon /> : <SoundIcon size={18} />}
    {loading ? "載入中…" : playing ? "停止播放" : label}
  </button>;
}

const wordsByKey = new Map(studyWords.map((entry) => [entry.word.toLowerCase(), entry]));
function MarkedWord({ word }: { word: string }) {
  const ranges = wordsByKey.get(word.toLowerCase())?.targetRanges ?? [];
  return <span lang="en">{word.split("").map((letter, index) =>
    ranges.some(({ start, end }) => index >= start && index < end)
      ? <em key={index}>{letter}</em> : <span key={index}>{letter}</span>)}
  </span>;
}

/** 程式原生插畫：貓與墊子，僅用在示範與短句；聽力題不出現圖片提示。 */
function CatOnMat({ compact = false }: { compact?: boolean }) {
  return <svg className={`phonics-cat ${compact ? "phonics-cat--compact" : ""}`} viewBox="0 0 400 300" role="img" aria-label="一隻貓坐在墊子上">
    <ellipse cx="206" cy="253" rx="143" ry="19" fill="#e5e7f0" />
    <path d="M73 229 Q62 230 56 245 L49 265 Q198 291 356 265 L344 241 Q341 231 326 230Z" fill="#d9ddf8" stroke="#9da6d4" strokeWidth="2" />
    <path d="M76 250 Q199 270 335 251 M94 239 Q202 254 320 240" fill="none" stroke="#b1b9e2" strokeWidth="2" />
    <path d="M264 227 Q323 222 315 181 Q311 165 299 173 Q294 178 302 185 Q307 206 271 206" fill="#e8b984" stroke="#71523d" strokeWidth="3" />
    <path d="M143 170 Q123 207 132 237 Q165 255 262 240 Q277 198 250 163Z" fill="#e8b984" stroke="#71523d" strokeWidth="3" />
    <path d="M166 195 Q154 225 158 241 M226 195 Q234 220 230 241" fill="none" stroke="#71523d" strokeWidth="3" strokeLinecap="round" />
    <path d="M136 120 L133 57 Q157 61 174 83 Q199 75 223 83 Q248 57 267 57 L262 123 Q274 174 222 188 Q166 200 137 159Z" fill="#f1c898" stroke="#71523d" strokeWidth="3" strokeLinejoin="round" />
    <path d="M145 77 L148 105 L166 91Z M252 78 L232 93 L251 105Z" fill="#d48f79" />
    <path d="M184 82 L186 105 M199 80 L200 102 M215 82 L213 105" stroke="#bb8859" strokeWidth="5" strokeLinecap="round" />
    <path d="M158 134 Q166 126 174 134 M222 134 Q230 126 238 134" stroke="#574134" strokeWidth="3" fill="none" strokeLinecap="round" />
    <path d="M191 146 L204 146 L198 153Z" fill="#906258" />
    <path d="M198 153 Q191 164 183 157 M198 153 Q205 164 213 157" stroke="#71523d" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    <path d="M153 149 L119 144 M153 157 L117 160 M239 149 L277 144 M239 157 L280 161" stroke="#71523d" strokeWidth="2" strokeLinecap="round" />
    <path d="M171 244 L174 237 M182 245 L184 238 M240 244 L242 237 M251 243 L253 236" stroke="#71523d" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}

function ManOnMat() {
  return <svg className="phonics-cat" viewBox="0 0 400 300" role="img" aria-label="一名男子坐在墊子上">
    <ellipse cx="200" cy="263" rx="144" ry="16" fill="#e5e7f0" />
    <path d="M74 241 Q69 233 88 230 L315 230 Q328 231 332 241 L346 266 Q200 288 54 266Z" fill="#d9ddf8" stroke="#9da6d4" strokeWidth="2" />
    <path d="M78 254 Q198 272 323 254" fill="none" stroke="#b1b9e2" strokeWidth="2" />
    <path d="M155 194 Q115 203 112 227 Q117 246 159 247 L234 237 L229 219 L164 224 L193 205Z" fill="#737b94" stroke="#444e5c" strokeWidth="3" strokeLinejoin="round" />
    <path d="M242 194 Q283 204 287 227 Q282 247 243 248 L166 237 L172 219 L237 224 L206 205Z" fill="#8790aa" stroke="#444e5c" strokeWidth="3" strokeLinejoin="round" />
    <path d="M173 112 Q156 115 147 134 L135 181 L161 190 L171 166 L170 207 Q199 221 231 207 L230 165 L241 190 L267 181 L254 134 Q246 114 227 112Z" fill="#a7adea" stroke="#5b62a4" strokeWidth="3" strokeLinejoin="round" />
    <path d="M145 177 L134 200 Q132 209 144 214 L168 221 Q180 221 180 211 Q180 205 170 203 L156 199 L163 184 M238 183 L245 199 L230 203 Q220 205 220 212 Q221 222 233 221 L257 214 Q269 210 266 200 L255 177" fill="#e7b991" stroke="#815d43" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M186 96 L185 116 Q200 131 214 116 L213 96" fill="#e7b991" stroke="#815d43" strokeWidth="2.5" />
    <ellipse cx="200" cy="74" rx="31" ry="36" fill="#f1c9a5" stroke="#815d43" strokeWidth="2.5" />
    <path d="M170 75 Q160 45 184 35 Q211 22 229 49 L233 74 L222 69 L216 49 Q202 62 181 58 L179 75Z" fill="#57463e" />
    <path d="M184 77 Q188 74 192 77 M208 77 Q212 74 216 77" fill="none" stroke="#57463e" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M195 93 Q201 98 208 92" fill="none" stroke="#815d43" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M184 104 Q199 116 216 103" fill="none" stroke="#815d43" strokeWidth="3" strokeLinecap="round" />
  </svg>;
}

function PhonicsOverview() {
  return <main className="wrap phonics-page">
    <a className="phonics-back" href="#"><PrevIcon size={15} /> 回首頁</a>
    <header className="phonics-page-heading">
      <div className="phonics-title-line"><h1>自然發音</h1><span className="phonics-preview-label">教材試作</span></div>
      <p>認識字母與聲音的關係，一步一步，自己讀出單字。</p>
    </header>
    <section className="phonics-course" aria-labelledby="short-a-title">
      <div className="phonics-course-copy">
        <h2 id="short-a-title">短母音 <span lang="en">a</span></h2>
        <p className="phonics-course-lead">從 <MarkedWord word="cat" /> 開始，<br />聽見單字中間的聲音。</p>
        <p className="phonics-course-description">從 <span lang="en">-at、-an、-ap</span> 三個字族，聽出相同的字尾，練習把每個音連起來讀。</p>
        <div className="phonics-course-facts"><span>{shortAFamilies.length} 個字族・{studyWords.length} 個單字</span><span>{shortAQuestions.length} 題練習</span><span>{shortASentences.length} 個短句</span></div>
        <a className="btn btn--primary phonics-start" href="#/phonics/short-a">開始這一課 <NextIcon size={17} /></a>
      </div>
      <div className="phonics-course-art"><span className="phonics-art-letter" lang="en" aria-hidden="true">a</span><CatOnMat /></div>
    </section>
    <section className="phonics-course-plan" aria-labelledby="phonics-plan-title">
      <h2 id="phonics-plan-title">這一課，怎麼學？</h2>
      <ol><li><span>01</span><div><strong>認識聲音</strong><p>聽聽 a 在單字中的發音。</p></div></li>
        <li><span>02</span><div><strong>看字拼讀</strong><p>選一個字族，換個字首讀讀看。</p></div></li>
        <li><span>03</span><div><strong>動手練習</strong><p>混合三個字族，聽音選字與拼字。</p></div></li>
        <li><span>04</span><div><strong>讀個短句</strong><p>把剛學的單字放進句子裡。</p></div></li></ol>
    </section>
    <p className="phonics-footnote">本版提供短母音 a 試學，練習紀錄只保留在本輪。</p>
  </main>;
}

function SoundIntroduction({ player }: { player: Player }) {
  const [example, setExample] = useState("cat");
  return <section className="phonics-introduction" aria-labelledby="phonics-sound-title">
    <div className="phonics-intro-main">
      <h2 id="phonics-sound-title">聽聽 a 在單字裡的聲音</h2>
      <p className="phonics-instruction">先聽，再跟著讀。留意中間的 <span lang="en">a</span>。</p>
      <div className="phonics-sound-display"><span className="phonics-big-letter" lang="en">a</span><span className="phonics-ipa">短母音 <span lang="en">/æ/</span></span></div>
      <AudioButton player={player} audioKey={example} label="聽單字示範" primary />
      <div className="phonics-example-words" aria-label="選擇示範單字">{shortAIntroductionWords.map(({ word }) =>
        <button key={word} aria-pressed={word === example} onClick={() => { setExample(word); void player.play(word); }}>
          <MarkedWord word={word} /><SoundIcon size={15} />
        </button>)}</div>
    </div>
    <aside className="phonics-intro-aside"><CatOnMat /><div className="phonics-teaching-note"><h3>把注意力放在中間</h3>
      <p>{shortAIntroductionWords.map(({ word }, i) => <span key={word}>{i > 0 && "、"}<MarkedWord word={word} /></span>)} 中間的 a，都有這一課要學的聲音。</p>
      <p>這裡播放完整單字。聽完後，試著自己讀一次。</p></div></aside>
  </section>;
}

function WordBlending({ player }: { player: Player }) {
  const [familyId, setFamilyId] = useState(shortAFamilies[0].id);
  const [index, setIndex] = useState(0);
  const family = shortAFamilies.find(({ id }) => id === familyId) ?? shortAFamilies[0];
  const words = family.words;
  const entry = words[index];
  const chooseFamily = (id: string) => {
    player.stop(); setFamilyId(id); setIndex(0);
  };
  return <section className="phonics-blending" aria-labelledby="phonics-blend-title">
    <h2 id="phonics-blend-title">看字形，試著連起來讀</h2>
    <p className="phonics-instruction">先選一個字族，聽聽字首怎麼變，再把每個音連起來讀。</p>
    <div className="phonics-family-picker" role="group" aria-label="選擇字族">{shortAFamilies.map((item) =>
      <button key={item.id} aria-label={`${item.label} 字族，${item.words.length} 個單字`} aria-pressed={family.id === item.id} onClick={() => chooseFamily(item.id)}>
        <span lang="en">{item.label}</span><span>{item.words.length} 詞</span>
      </button>)}</div>
    <p className="phonics-family-description"><span lang="en">{family.label}</span> 字族<span aria-hidden="true"> · </span>{family.description}</p>
    <div className={`phonics-graphemes ${entry.graphemes.length > 3 ? "phonics-graphemes--long" : ""}`} aria-label={`${entry.word} 的 ${entry.graphemes.length} 個字形`}>
      {entry.graphemes.map((grapheme, i) => <div key={`${entry.word}-${i}`}>
        <span className={`phonics-grapheme ${grapheme.kind === "vowel" ? "is-vowel" : ""}`} lang="en">{grapheme.text}</span>
        <span className="phonics-grapheme-label">{grapheme.kind === "vowel" ? "母音" : "子音"}</span>
      </div>)}
    </div>
    <div className="phonics-whole-word"><MarkedWord word={entry.word} /><span>{entry.meaning}</span></div>
    <p className="phonics-word-structure"><span lang="en">{entry.structure}</span><span aria-hidden="true"> · </span>{entry.phonemes.length} 個聲音，從左到右連起來讀</p>
    <div className="phonics-audio-actions"><AudioButton player={player} audioKey={entry.word} label="聽完整單字" primary />
      <button className="btn btn--ghost" onClick={() => void player.play(entry.word, 0.8)}><SoundIcon /> 放慢聽</button>
      <button className="btn btn--ghost" aria-label={player.sequenceActive ? "停止字族連播" : `全部播放 ${family.label} 字族，共 ${words.length} 詞`}
        onClick={() => player.sequenceActive ? player.stop() : void player.playSequence(words.map(({ word }) => word), setIndex)}>
        {player.sequenceActive ? <PauseIcon /> : <RepeatIcon size={18} />}{player.sequenceActive ? "停止全部播放" : "全部播放"}</button></div>
    <p className="phonics-playback-status" role="status">{player.sequenceActive ? `${family.label} 字族：正在播放 ${index + 1} / ${words.length}：${entry.word}` : `本字族共 ${words.length} 個單字，點單字就能聽。`}</p>
    <div className="phonics-word-picker" aria-label="選擇拼讀單字">{words.map(({ word }, i) =>
      <button key={word} aria-label={`播放單字 ${word}`} aria-pressed={index === i} onClick={() => { setIndex(i); void player.play(word); }}><MarkedWord word={word} /><SoundIcon size={14} /></button>)}</div>
    <p className="phonics-inline-tip">字尾一樣，字首不一樣。仍然要把每個音都讀出來，再連成完整單字。</p>
  </section>;
}

function Practice({ player, onContinue }: { player: Player; onContinue: () => void }) {
  const [questions, setQuestions] = useState(shortAQuestions);
  const [index, setIndex] = useState(0);
  const [selection, setSelection] = useState<string | null>(null);
  const [tiles, setTiles] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [finished, setFinished] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const question = questions[index];
  const answer = question.kind === "listen" ? selection : tiles.map((i) => question.choices[i]).join("");
  const ready = question.kind === "listen" ? selection !== null : tiles.length === question.answer.word.length;
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    heading.current?.focus();
  }, [index, finished, questions]);
  const clearAnswer = () => { setSelection(null); setTiles([]); setFeedback(null); };
  const check = () => {
    if (!ready || feedback !== null) return;
    player.stop();
    const correct = answer === question.answer.word;
    setFeedback(correct);
    setResults((previous) => question.id in previous ? previous : { ...previous, [question.id]: correct });
  };
  const next = () => {
    player.stop();
    if (index + 1 === questions.length) setFinished(true);
    else { setIndex(index + 1); clearAnswer(); }
  };
  const restart = (nextQuestions: PhonicsQuestion[]) => {
    player.stop(); setQuestions(nextQuestions); setIndex(0); clearAnswer(); setResults({}); setFinished(false);
  };
  if (finished) {
    const missed = questions.filter((item) => results[item.id] === false);
    return <section className="phonics-practice-summary">
      <div className="phonics-complete-mark"><CheckMark /></div>
      <h2 ref={heading} tabIndex={-1}>這一輪練習完成了</h2>
      <p>第一次作答，答對 <strong>{questions.length - missed.length} / {questions.length}</strong> 題。</p>
      {missed.length > 0 ? <><p className="phonics-summary-hint">這幾個單字，可以再聽一次。</p>
        <div className="phonics-missed-words">{missed.map((item) => <button key={item.id} className="btn btn--ghost" onClick={() => void player.play(item.answer.word)}><SoundIcon /><MarkedWord word={item.answer.word} /></button>)}</div>
        <button className="btn btn--primary" onClick={() => restart(missed)}><RepeatIcon size={17} /> 再練這 {missed.length} 題</button></>
        : <p className="phonics-summary-hint">接下來，把這些聲音放進短句裡。</p>}
      <div className="phonics-summary-actions"><button className="btn btn--ghost" onClick={() => restart(shortAQuestions)}>全部再練一次</button>
        <button className={`btn ${missed.length ? "btn--ghost" : "btn--primary"}`} onClick={onContinue}>讀個短句 <NextIcon size={16} /></button></div>
    </section>;
  }
  return <section className="phonics-practice" aria-labelledby="phonics-question-title">
    <div className="phonics-question-meta"><span>{question.kind === "listen" ? "聽音選字" : "聽音拼字"}</span><span>第 {index + 1} / {questions.length} 題</span></div>
    <div className="phonics-question-progress" aria-hidden="true">{questions.map((item, i) => <span key={item.id} className={i <= index ? "is-reached" : ""} />)}</div>
    <h2 id="phonics-question-title" ref={heading} tabIndex={-1}>{question.kind === "listen" ? "你聽到哪一個單字？" : "聽一聽，把單字拼出來"}</h2>
    <p className="phonics-instruction">{question.kind === "listen" ? "按下播放，選出你聽到的單字。" : "按順序點選字母；點上方的字母可以放回。"}</p>
    <div className="phonics-listen-actions"><AudioButton player={player} audioKey={question.answer.word} label="播放題目" primary />
      <button className="btn btn--ghost" onClick={() => void player.play(question.answer.word, 0.8)}>放慢聽</button></div>
    {question.kind === "listen" ? <div className="phonics-listen-choices" role="group" aria-label="單字選項">
      {question.choices.map((choice) => <button key={choice} lang="en" disabled={feedback !== null}
        aria-pressed={selection === choice} onClick={() => setSelection(choice)}
        className={`${selection === choice ? "is-selected" : ""} ${feedback !== null && choice === question.answer.word ? "is-correct" : ""}`}>
        {choice}{feedback !== null && choice === question.answer.word && <CheckMark />}
      </button>)}
    </div> : <div className="phonics-spelling">
      <div className="phonics-spelling-slots" role="group" aria-label="已排列的字母">
        {Array.from({ length: question.answer.word.length }, (_, i) => <button key={i} disabled={i >= tiles.length || feedback !== null}
          aria-label={i < tiles.length ? `移除第 ${i + 1} 個字母 ${question.choices[tiles[i]]}` : `第 ${i + 1} 格，尚未選字母`}
          className={`${question.answer.targetRanges.some(({ start, end }) => i >= start && i < end) ? "is-vowel" : ""} ${feedback === true ? "is-correct" : ""}`}
          onClick={() => setTiles(tiles.filter((_, position) => position !== i))} lang="en">{i < tiles.length ? question.choices[tiles[i]] : <span aria-hidden="true">·</span>}</button>)}
      </div>
      <div className="phonics-letter-bank" role="group" aria-label="可選的字母">{question.choices.map((letter, i) =>
        <button key={i} disabled={tiles.includes(i) || tiles.length >= question.answer.word.length || feedback !== null}
          onClick={() => setTiles([...tiles, i])} aria-label={`加入字母 ${letter}`} lang="en">{letter}</button>)}</div>
      <button className="phonics-text-button" disabled={tiles.length === 0 || feedback !== null} onClick={() => setTiles([])}>清除重排</button>
    </div>}
    {feedback !== null && <div className={`phonics-feedback ${feedback ? "is-correct" : "is-incorrect"}`} role="status">
      <strong>{feedback ? "答對了！" : "再留意一下這個字。"}</strong>
      <span><MarkedWord word={question.answer.word} /> <span className="phonics-feedback-meaning">{question.answer.meaning}</span></span>
      {!feedback && <p>{question.kind === "spell" ? "跟著正確順序，再試著讀一次。" : "重聽一次，比較字首與字尾的聲音。"}</p>}
    </div>}
    <div className="phonics-check-actions">{feedback === null ? <button className="btn btn--primary" disabled={!ready} onClick={check}>確認答案</button>
      : <><button className="btn btn--primary" onClick={next}>{index + 1 === questions.length ? "看看練習結果" : "下一題"}<NextIcon size={16} /></button>
        {feedback === false && <button className="btn btn--ghost" onClick={() => { player.stop(); clearAnswer(); }}>再試一次</button>}</>}
    </div>
    <p className="phonics-practice-note">可以重聽，不用趕。每題以第一次作答計算本輪結果。</p>
  </section>;
}

function CheckMark() {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>;
}

function SentenceReading({ player }: { player: Player }) {
  const [sentence, setSentence] = useState(0);
  const [translation, setTranslation] = useState(false);
  const [completed, setCompleted] = useState(false);
  const current = shortASentences[sentence];
  return <section className="phonics-reading" aria-labelledby="phonics-reading-title">
    <div className="phonics-reading-copy"><h2 id="phonics-reading-title">換你讀讀這個短句</h2>
      <p className="phonics-instruction">先自己讀，再聽示範。點選重點單字也可以單獨聽。</p>
      <p className="phonics-sentence" lang="en">{current.text.split(/\s+/u).map((part, i) => {
        const match = part.match(/^([A-Za-z]+)([.!?,;:]*)$/u);
        const bare = match?.[1].toLowerCase() ?? "";
        return <span key={`${sentence}-${i}`}>{i > 0 && " "}{current.wordKeys.includes(bare)
          ? <button onClick={() => void player.play(bare)} aria-label={`聽單字 ${bare}`}><MarkedWord word={match![1]} />{match![2]}</button>
          : part}</span>;
      })}</p>
      <div className="phonics-audio-actions"><AudioButton player={player} audioKey={current.audioKey} label="聽完整短句" primary />
        <button className="phonics-text-button" aria-expanded={translation} onClick={() => setTranslation(!translation)}>{translation ? "收起中文" : "看看中文"}</button></div>
      {translation && <p className="phonics-translation">{current.translation}</p>}
      <p className="phonics-inline-tip">{current.supportNote}</p>
      <div className="phonics-reading-switch"><span>短句 {sentence + 1} / {shortASentences.length}</span><button className="btn btn--ghost" onClick={() => {
        player.stop(); setSentence((sentence + 1) % shortASentences.length); setTranslation(false); setCompleted(false);
      }}>{sentence + 1 < shortASentences.length ? "讀下一句" : "回到第一句"}<NextIcon size={15} /></button></div>
      <button className={`btn ${completed ? "btn--ghost" : "btn--primary"}`} onClick={() => { player.stop(); setCompleted(true); }}>
        <CheckMark />{completed ? "已完成一次朗讀" : "我已讀過一次"}</button>
      {completed && <p role="status" className="phonics-reading-done">讀完後可以重聽核對，或回到練習再挑戰一次。</p>}
    </div>{sentence === 0 ? <CatOnMat /> : <ManOnMat />}
  </section>;
}

const steps = ["認識聲音", "看字拼讀", "動手練習", "讀個短句"];
export function PhonicsLearning({ lessonOpen }: { lessonOpen: boolean }) {
  const [step, setStep] = useState(0);
  const player = usePhonicsAudio();
  const stageHeading = useRef<HTMLDivElement>(null);
  const changeStep = (next: number) => {
    player.stop(); setStep(next);
  };
  useEffect(() => { if (lessonOpen) stageHeading.current?.focus(); }, [lessonOpen, step]);
  if (!lessonOpen) return <PhonicsOverview />;
  return <main className="wrap phonics-page phonics-lesson">
    <a className="phonics-back" href="#/phonics"><PrevIcon size={15} /> 自然發音</a>
    <header className="phonics-lesson-heading"><div><h1>短母音 <span lang="en">a</span></h1><p>聽一聽、讀一讀，把聲音連起來。</p></div>
      <span className="phonics-preview-label">教材試作</span></header>
    <nav className="phonics-steps" aria-label="學習階段">{steps.map((label, i) => <button key={label}
      aria-current={step === i ? "step" : undefined} onClick={() => changeStep(i)}><span>{i + 1}</span>{label}</button>)}</nav>
    <div className="phonics-workspace" ref={stageHeading} tabIndex={-1} aria-label={steps[step]}>
      {step === 0 && <SoundIntroduction player={player} />}
      {step === 1 && <WordBlending player={player} />}
      {step === 2 && <Practice player={player} onContinue={() => changeStep(3)} />}
      {step === 3 && <SentenceReading player={player} />}
      {player.state === "error" && <div className="phonics-audio-error" role="alert">音訊暫時無法播放，請再按一次播放按鈕重試。</div>}
    </div>
    <footer className="phonics-step-footer"><span>第 {step + 1} / 4 階段</span><div>
      {step > 0 && <button className="btn btn--ghost" onClick={() => changeStep(step - 1)}><PrevIcon size={16} /> 上一步</button>}
      {step < 3 ? <button className="btn btn--primary" onClick={() => changeStep(step + 1)}>{step === 0 ? "試著拼讀" : step === 1 ? "開始練習" : "讀個短句"}<NextIcon size={16} /></button>
        : <a className="btn btn--ghost" href="#/phonics">回到教材總覽</a>}
    </div></footer>
  </main>;
}
