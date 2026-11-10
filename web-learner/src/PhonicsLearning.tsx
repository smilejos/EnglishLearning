import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { claimAudio, releaseAudio } from "./lib/audioBus";
import { getAudioAssets, type AudioAssets } from "./lib/audioAssets";
import { NextIcon, PauseIcon, PrevIcon, RepeatIcon, SoundIcon } from "./icons";
import { getPhonicsLesson, lessonWords, phonicsLessons, type PhonicsLesson, type PhonicsQuestion } from "./phonicsLesson";
import "./PhonicsLearning.css";

const LessonContext = createContext<PhonicsLesson | null>(null);
function useLesson() {
  const lesson = useContext(LessonContext);
  if (!lesson) throw new Error("自然發音教材尚未選取");
  return lesson;
}

/** 播放票號避免舊 play promise／媒體事件覆蓋新的播放狀態。 */
function usePhonicsAudio(lessonId: string) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const assets = useRef<AudioAssets | null>(null);
  const pendingAssets = useRef<Promise<AudioAssets> | null>(null);
  const loadAssets = useCallback(() => {
    if (assets.current) return Promise.resolve(assets.current);
    if (!pendingAssets.current) {
      pendingAssets.current = getAudioAssets("phonics", lessonId).then((loaded) => {
        assets.current = loaded;
        return loaded;
      }).finally(() => { pendingAssets.current = null; });
    }
    return pendingAssets.current;
  }, [lessonId]);
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
  useEffect(() => {
    void loadAssets().catch(() => { /* 點播放時提供可重試錯誤。 */ });
    return () => stop();
  }, [loadAssets, stop]);
  const playTracks = (keys: string[], rate: number, onTrack?: (index: number) => void) => {
    stop();
    if (keys.length === 0) return;
    const ownTicket = ++ticket.current;
    setSequenceActive(keys.length > 1);
    claimAudio(stop);
    const startTrack = async (index: number): Promise<void> => {
      if (ticket.current !== ownTicket) return;
      nextTrack.current = null;
      setActive(keys[index]);
      setState("loading");
      let loaded: AudioAssets;
      try { loaded = assets.current ?? await loadAssets(); }
      catch {
        if (ticket.current === ownTicket) { stop(); setState("error"); }
        return;
      }
      if (ticket.current !== ownTicket) return;
      const asset = loaded[keys[index]];
      if (!asset) { assets.current = null; stop(); setState("error"); return; }
      const current = new Audio(asset.url);
      current.playbackRate = rate;
      audio.current = current;
      onTrack?.(index);
      const isCurrent = () => ticket.current === ownTicket && audio.current === current;
      const fail = () => {
        if (!isCurrent()) return;
        // 下次重試重新查詢共用紀錄，可取得已修復或更新的字庫錄音。
        assets.current = null;
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

function MarkedWord({ word }: { word: string }) {
  const lesson = useLesson();
  const ranges = lessonWords(lesson).find((entry) => entry.word.toLowerCase() === word.toLowerCase())?.targetRanges ?? [];
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

const phonicsChapters = [
  { id: "short-vowels", title: "短母音", prefix: "short-", summary: "a、e、i、o、u", description: "從簡單的單字開始，認識 a、e、i、o、u 的短母音。", instruction: "依 a、e、i、o、u 的順序，選一堂小課；先聽聲音，再按字族拼讀。" },
  { id: "long-vowels", title: "長母音", prefix: "long-", summary: "a、e、i、o、u", description: "接著學習長母音，認識不同拼法與聲音的關係。", instruction: "依 a、e、i、o、u 的順序，選一堂小課；先聽聲音，再按拼法與字族拼讀。" },
  { id: "blends", title: "子音混合", prefix: "blends-", summary: "字首、字尾與三子音", description: "把相鄰子音的聲音連起來，每個聲音都保留。", instruction: "先練字首 l、r、s 類，再練字尾與三子音；沿用已學母音拼讀。" },
  { id: "digraphs", title: "子音字母組合", prefix: "digraph-", summary: "sh、ch、th、wh、ph、tch", description: "認識多個字母表示一個子音的拼法。", instruction: "從 sh、ch 開始，分開練 th 的兩個聲音，再認識 wh、ph、tch。" },
  { id: "r-controlled", title: "r 控制母音", prefix: "r-", summary: "ar、or、ore、oar", description: "留意 r 和前方母音一起出現時的聲音與拼法。", instruction: "依 ar、or、ore／oar 的順序，逐組聽辨、拼讀，再比較已學拼法。" },
  { id: "endings", title: "字尾變化", prefix: "endings-", summary: "-s、-es、-ed、-ing", description: "從原形出發，聽懂字尾的不同聲音，認識拼字與意思的變化。", instruction: "依 -s、-es、-ed、-ing 的順序，先聽字尾，再比較原形與變化詞。" },
];
const groupLabel = (lesson: PhonicsLesson) => lesson.groupLabel ?? (/^(blends-|digraph-|r-)/.test(lesson.id) ? "詞組" : "字族");
const isVowelLesson = (lesson: PhonicsLesson) => /^(short|long)-/.test(lesson.id);
const displaySpelling = (lesson: PhonicsLesson) => isVowelLesson(lesson) ? lesson.vowel : lesson.families[0]?.spelling ?? lesson.vowel;
function chapterForLesson(lesson: PhonicsLesson) {
  return phonicsChapters.find(({ prefix }) => lesson.id.startsWith(prefix)) ?? phonicsChapters[0];
}

function PhonicsOverview() {
  return <main className="wrap phonics-page">
    <a className="phonics-back" href="#"><PrevIcon size={15} /> 回首頁</a>
    <header className="phonics-page-heading">
      <div className="phonics-title-line"><h1>自然發音</h1><span className="phonics-preview-label">教材試作</span></div>
      <p>認識字母與聲音的關係，一步一步，自己讀出單字。</p>
    </header>
    <p className="phonics-instruction">先選擇章節，再進入各別小課。完成長短母音後，接著練子音混合、子音字母組合、r 控制母音與字尾變化。</p>
    <nav className="phonics-chapter-list" aria-label="自然發音章節">{phonicsChapters.map((chapter) =>
      <a className="phonics-chapter" key={chapter.id} href={`#/phonics/${chapter.id}`} aria-labelledby={`${chapter.id}-title`}>
        <div className="phonics-chapter-copy">
          <h2 id={`${chapter.id}-title`}>{chapter.title}</h2>
          <p>{chapter.description}</p>
          <span className="phonics-chapter-facts">{phonicsLessons.filter(({ id }) => id.startsWith(chapter.prefix)).length} 堂小課・<span>{chapter.summary}</span></span>
        </div>
        <span className="phonics-chapter-action">進入章節 <NextIcon size={18} /></span>
      </a>)}</nav>
  </main>;
}

function PhonicsChapter({ chapter }: { chapter: typeof phonicsChapters[number] }) {
  return <main className="wrap phonics-page">
    <a className="phonics-back" href="#/phonics"><PrevIcon size={15} /> 自然發音</a>
    <header className="phonics-page-heading">
      <div className="phonics-title-line"><h1>{chapter.title}</h1><span className="phonics-preview-label">教材試作</span></div>
      <p>{chapter.description}</p>
    </header>
    <p className="phonics-instruction">{chapter.instruction}</p>
    <div className="phonics-course-list">{phonicsLessons.filter(({ id }) => id.startsWith(chapter.prefix)).map((lesson) => <LessonContext.Provider key={lesson.id} value={lesson}>
      <section className="phonics-course" aria-labelledby={`${lesson.id}-title`}>
        <div className="phonics-course-copy">
          <h2 id={`${lesson.id}-title`}>{lesson.title}<span className="phonics-course-sound" lang="en">{lesson.sound}</span></h2>
          <p className="phonics-course-lead">從 <MarkedWord word={lesson.introductionWords[0].word} /> 開始，<br />聽見這一課的聲音。</p>
          <p className="phonics-course-description">{lesson.description}</p>
          <div className="phonics-course-facts"><span>{lesson.families.length} 個{groupLabel(lesson)}・{lessonWords(lesson).length} 個單字</span><span>{lesson.questions.length} 題練習</span><span>{lesson.sentences.length} 個短句</span></div>
          <a className="btn btn--primary phonics-start" href={`#/phonics/${lesson.id}`} aria-label={`開始${lesson.title} 這一課`}>開始這一課 <NextIcon size={17} /></a>
        </div>
        <div className="phonics-course-art">{lesson.id === "short-a" ? <><span className="phonics-art-letter" lang="en" aria-hidden="true">a</span><CatOnMat /></> : <LetterIllustration lesson={lesson} />}</div>
      </section>
    </LessonContext.Provider>)}</div>
    <section className="phonics-course-plan" aria-labelledby="phonics-plan-title">
      <h2 id="phonics-plan-title">這一課，怎麼學？</h2>
      <ol><li><span>01</span><div><strong>認識聲音</strong><p>聽聽目標字形在單字中的發音。</p></div></li>
        <li><span>02</span><div><strong>看字拼讀</strong><p>選一組單字，把每個音連起來讀。</p></div></li>
        <li><span>03</span><div><strong>動手練習</strong><p>比較本課單字，聽音選字與拼字。</p></div></li>
        <li><span>04</span><div><strong>讀個短句</strong><p>把剛學的單字放進句子裡。</p></div></li></ol>
    </section>
    <p className="phonics-footnote">每堂小課都有四個學習階段，練習紀錄只保留在本輪。</p>
  </main>;
}

function LetterIllustration({ lesson }: { lesson: PhonicsLesson }) {
  return <div className={`phonics-letter-illustration ${isVowelLesson(lesson) ? "" : "phonics-letter-illustration--pattern"}`} aria-hidden="true"><span lang="en">{displaySpelling(lesson)}</span><span lang="en">{lesson.sound}</span></div>;
}

function SoundIntroduction({ player }: { player: Player }) {
  const lesson = useLesson();
  const [example, setExample] = useState(lesson.introductionWords[0].word);
  return <section className="phonics-introduction" aria-labelledby="phonics-sound-title">
    <div className="phonics-intro-main">
      <h2 id="phonics-sound-title">聽聽 {isVowelLesson(lesson) ? lesson.vowel : lesson.spellingLabel} 在單字裡的聲音</h2>
      <p className="phonics-instruction">{lesson.introductionText}</p>
      <div className="phonics-sound-display"><span className={`phonics-big-letter ${isVowelLesson(lesson) ? "" : "phonics-big-letter--pattern"}`} lang="en">{displaySpelling(lesson)}</span><span className="phonics-ipa">目標聲音 <span lang="en">{lesson.sound}</span></span></div>
      <AudioButton player={player} audioKey={example} label="聽單字示範" primary />
      <div className="phonics-example-words" aria-label="選擇示範單字">{lesson.introductionWords.map(({ word }) =>
        <button key={word} aria-pressed={word === example} onClick={() => { setExample(word); void player.play(word); }}>
          <MarkedWord word={word} /><SoundIcon size={15} />
        </button>)}</div>
    </div>
    <aside className="phonics-intro-aside">{lesson.id === "short-a" ? <CatOnMat /> : <LetterIllustration lesson={lesson} />}<div className="phonics-teaching-note"><h3>留意標色的字形</h3>
      <p>{lesson.introductionWords.map(({ word }, i) => <span key={word}>{i > 0 && "、"}<MarkedWord word={word} /></span>)} 標色的字形，都對應這一課要學的聲音。</p>
      <p>這裡播放完整單字。聽完後，試著自己讀一次。</p><p>{lesson.pronunciationNote}</p><p>先備：{lesson.prerequisites.join("；")}</p></div></aside>
  </section>;
}

function WordBlending({ player }: { player: Player }) {
  const lesson = useLesson();
  const group = groupLabel(lesson);
  const spellingFor = (family: PhonicsLesson["families"][number]) => family.spelling ?? lesson.spellingLabel;
  const spellings = [...new Set(lesson.families.map(spellingFor))];
  const [spelling, setSpelling] = useState(spellings[0] ?? "");
  const [familyId, setFamilyId] = useState(lesson.families[0]?.id ?? "");
  const [structure, setStructure] = useState("all");
  const [index, setIndex] = useState(0);
  const families = lesson.families.filter((family) => spellingFor(family) === spelling);
  const family = families.find(({ id }) => id === familyId) ?? families[0];
  const structures = [...new Set(lessonWords(lesson).map(({ structure }) => structure))];
  const words = (family?.words ?? []).filter((entry) => structure === "all" || entry.structure === structure);
  const entry = words[index];
  const chooseSpelling = (next: string) => {
    player.stop(); setSpelling(next); setFamilyId(lesson.families.find((family) => spellingFor(family) === next)?.id ?? ""); setIndex(0);
  };
  const chooseFamily = (id: string) => {
    player.stop(); setFamilyId(id); setIndex(0);
  };
  return <section className={`phonics-blending ${lesson.id.startsWith("endings-") ? "phonics-blending--endings" : ""}`} aria-labelledby="phonics-blend-title">
    <h2 id="phonics-blend-title">看字形，試著連起來讀</h2>
    <p className="phonics-instruction">本課拼法：<span lang="en">{lesson.spellingLabel}</span>。先選一個{group}，留意標色的字形，再把每個音連起來讀。</p>
    {spellings.length > 1 && <div className="phonics-family-picker" role="group" aria-label="選擇拼法">{spellings.map((item) =>
      <button key={item} lang="en" aria-pressed={spelling === item} onClick={() => chooseSpelling(item)}>{item}</button>)}</div>}
    <div className="phonics-family-picker" role="group" aria-label={`選擇${group}`}>{families.map((item) =>
      <button key={item.id} aria-label={`${item.label} ${group}，${item.words.length} 個單字`} aria-pressed={family?.id === item.id} onClick={() => chooseFamily(item.id)}>
        <span lang={lesson.id.startsWith("endings-") ? undefined : "en"}>{item.label}</span><span>{item.words.length} 詞</span>
      </button>)}</div>
    {structures.length > 1 && <label className="phonics-structure-filter">單字結構
      <select aria-label="篩選單字結構" value={structure} onChange={(event) => { player.stop(); setStructure(event.target.value); setIndex(0); }}>
        <option value="all">全部結構</option>{structures.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>}
    {family && <p className="phonics-family-description"><span lang="en">{family.label}</span> {group}<span aria-hidden="true"> · </span>{family.description}</p>}
    {entry && family ? <>
    <div className={`phonics-graphemes ${entry.graphemes.length > 3 ? "phonics-graphemes--long" : ""}`} aria-label={`${entry.word} 的 ${entry.graphemes.length} 個字形`}>
      {entry.graphemes.map((grapheme, i) => <div key={`${entry.word}-${i}`}>
        <span className={`phonics-grapheme ${grapheme.kind === "vowel" ? "is-vowel" : ""} ${grapheme.ranges.some((range) => entry.targetRanges.some((target) => range.start < target.end && range.end > target.start)) ? "is-target" : ""} ${grapheme.text.length > 1 ? "is-complex" : ""}`} lang="en">{grapheme.text}</span>
        <span className="phonics-grapheme-label">{lesson.id.startsWith("r-") && grapheme.ranges.some((range) => entry.targetRanges.some((target) => range.start < target.end && range.end > target.start)) ? "母音＋r" : grapheme.kind === "vowel" ? "母音" : "子音"}</span>
      </div>)}
    </div>
    {entry.graphemes.some(({ ranges }) => ranges.length > 1) && <p className="phonics-inline-tip">底線表示兩個字母中間隔著其他字母；例如 a_e 的 e 不另發音。標色部分是本課目標字形。</p>}
    <div className="phonics-whole-word"><MarkedWord word={entry.word} /><span>{entry.meaning}</span></div>
    {entry.inflection && <div className="phonics-inflection" aria-label="原形與字尾變化">
      <p lang="en" aria-label={`${entry.inflection.baseWord} 變成 ${entry.word}`}><span>{entry.inflection.baseWord}</span><span aria-hidden="true"> → </span><MarkedWord word={entry.word} /></p>
      <p>{entry.inflection.note}</p>
    </div>}
    <p className="phonics-phonemes" aria-label="逐音拼合" lang="en">{entry.phonemes.map((sound) => `/${sound}/`).join(" → ")}</p>
    <p className="phonics-word-structure"><span lang="en">{entry.structure}</span><span aria-hidden="true"> · </span>{entry.phonemes.length} 個聲音，從左到右連起來讀</p>
    <div className="phonics-audio-actions"><AudioButton player={player} audioKey={entry.word} label="聽完整單字" primary />
      <button className="btn btn--ghost" onClick={() => void player.play(entry.word, 0.8)}><SoundIcon /> 放慢聽</button>
      <button className="btn btn--ghost" aria-label={player.sequenceActive ? `停止${group}連播` : `全部播放 ${family.label} ${group}，共 ${words.length} 詞`}
        onClick={() => player.sequenceActive ? player.stop() : void player.playSequence(words.map(({ word }) => word), setIndex)}>
        {player.sequenceActive ? <PauseIcon /> : <RepeatIcon size={18} />}{player.sequenceActive ? "停止全部播放" : "全部播放"}</button></div>
    <p className="phonics-playback-status" role="status">{player.sequenceActive ? `${family.label} ${group}：正在播放 ${index + 1} / ${words.length}：${entry.word}` : `目前詞表共 ${words.length} 個單字，點單字就能聽。`}</p>
    <div className="phonics-word-picker" aria-label="選擇拼讀單字">{words.map(({ word }, i) =>
      <button key={word} aria-label={`播放單字 ${word}`} aria-pressed={index === i} onClick={() => { setIndex(i); void player.play(word); }}><MarkedWord word={word} /><SoundIcon size={14} /></button>)}</div>
    <p className="phonics-inline-tip">{group === "字族" ? "字尾一樣，字首不一樣。" : "留意本組的目標字形與聲音。"}仍然要把每個音都讀出來，再連成完整單字。</p>
    </> : <p className="phonics-instruction" role="status">這個{group}還沒有可練習的單字，請選擇其他{group}或調整結構篩選。</p>}
  </section>;
}

function Practice({ player, onContinue }: { player: Player; onContinue: () => void }) {
  const lesson = useLesson();
  const [questions, setQuestions] = useState(lesson.questions);
  const [index, setIndex] = useState(0);
  const [selection, setSelection] = useState<string | null>(null);
  const [tiles, setTiles] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [finished, setFinished] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const question = questions[index];
  const units = question.answer.spellingUnits ?? Array.from(question.answer.word);
  const answer = question.kind === "listen" ? selection : tiles.map((i) => question.choices[i]).join("");
  const ready = question.kind === "listen" ? selection !== null : tiles.length === units.length;
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
      <div className="phonics-summary-actions"><button className="btn btn--ghost" onClick={() => restart(lesson.questions)}>全部再練一次</button>
        <button className={`btn ${missed.length ? "btn--ghost" : "btn--primary"}`} onClick={onContinue}>讀個短句 <NextIcon size={16} /></button></div>
    </section>;
  }
  return <section className="phonics-practice" aria-labelledby="phonics-question-title">
    <div className="phonics-question-meta"><span>{question.kind === "listen" ? "聽音選字" : "聽音拼字"}</span><span>第 {index + 1} / {questions.length} 題</span></div>
    <div className="phonics-question-progress" aria-hidden="true">{questions.map((item, i) => <span key={item.id} className={i <= index ? "is-reached" : ""} />)}</div>
    <h2 id="phonics-question-title" ref={heading} tabIndex={-1}>{question.kind === "listen" ? "你聽到哪一個單字？" : "聽一聽，把單字拼出來"}</h2>
    <p className="phonics-instruction">{question.kind === "listen" ? "按下播放，選出你聽到的單字。" : "按順序點選字母或字形塊；點上方的方塊可以放回。"}</p>
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
        {Array.from({ length: units.length }, (_, i) => <button key={i} disabled={i >= tiles.length || feedback !== null}
          aria-label={i < tiles.length ? `移除第 ${i + 1} 個字母 ${question.choices[tiles[i]]}` : `第 ${i + 1} 格，尚未選字母`}
          className={`${question.answer.targetRanges.some(({ start, end }) => { const offset = units.slice(0, i).join("").length; return offset < end && offset + units[i].length > start; }) ? "is-vowel" : ""} ${feedback === true ? "is-correct" : ""}`}
          onClick={() => setTiles(tiles.filter((_, position) => position !== i))} lang="en">{i < tiles.length ? question.choices[tiles[i]] : <span aria-hidden="true">·</span>}</button>)}
      </div>
      <div className="phonics-letter-bank" role="group" aria-label="可選的字母">{question.choices.map((letter, i) =>
        <button key={i} disabled={tiles.includes(i) || tiles.length >= units.length || feedback !== null}
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
  const lesson = useLesson();
  const [sentence, setSentence] = useState(0);
  const [translation, setTranslation] = useState(false);
  const [completed, setCompleted] = useState(false);
  const current = lesson.sentences[sentence];
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
      {!!current.supportWords?.length && <div className="phonics-support-words" aria-label="短句支援詞"><p>先聽這些搭配用詞，再讀短句：</p>{current.supportWords.map((support) => <button className="btn btn--ghost" key={support.word} onClick={() => void player.play(support.audioKey)} aria-label={`聽支援詞 ${support.word}`}><SoundIcon size={16} /><span lang="en">{support.text}</span><span>{support.meaning}</span></button>)}</div>}
      <div className="phonics-reading-switch"><span>短句 {sentence + 1} / {lesson.sentences.length}</span><button className="btn btn--ghost" onClick={() => {
        player.stop(); setSentence((sentence + 1) % lesson.sentences.length); setTranslation(false); setCompleted(false);
      }}>{sentence + 1 < lesson.sentences.length ? "讀下一句" : "回到第一句"}<NextIcon size={15} /></button></div>
      <button className={`btn ${completed ? "btn--ghost" : "btn--primary"}`} onClick={() => { player.stop(); setCompleted(true); }}>
        <CheckMark />{completed ? "已完成一次朗讀" : "我已讀過一次"}</button>
      {completed && <p role="status" className="phonics-reading-done">讀完後可以重聽核對，或回到練習再挑戰一次。</p>}
    </div>{current.illustration === "cat" ? <CatOnMat /> : current.illustration === "man" ? <ManOnMat /> : <LetterIllustration lesson={lesson} />}
  </section>;
}

const steps = ["認識聲音", "看字拼讀", "動手練習", "讀個短句"];
export function PhonicsLearning({ lessonOpen, lessonId = "short-a", chapterId }: { lessonOpen: boolean; lessonId?: string; chapterId?: string }) {
  if (!lessonOpen) {
    const chapter = phonicsChapters.find(({ id }) => id === chapterId);
    return chapter ? <PhonicsChapter chapter={chapter} /> : <PhonicsOverview />;
  }
  const lesson = getPhonicsLesson(lessonId);
  if (!lesson) return <main className="wrap phonics-page"><h1>找不到這一課</h1><a href="#/phonics">回到教材總覽</a></main>;
  return <LessonContext.Provider value={lesson}><LessonLearning key={lesson.id} /></LessonContext.Provider>;
}

function LessonLearning() {
  const lesson = useLesson();
  const chapter = chapterForLesson(lesson);
  const [step, setStep] = useState(0);
  const player = usePhonicsAudio(lesson.id);
  const stageHeading = useRef<HTMLDivElement>(null);
  const changeStep = (next: number) => {
    player.stop(); setStep(next);
  };
  useEffect(() => { stageHeading.current?.focus(); }, [step]);
  return <main className="wrap phonics-page phonics-lesson">
    <a className="phonics-back" href={`#/phonics/${chapter.id}`}><PrevIcon size={15} /> 回到{chapter.title}章節</a>
    <header className="phonics-lesson-heading"><div><h1>{lesson.title}</h1><p>聽一聽、讀一讀，把聲音連起來。</p></div>
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
        : <a className="btn btn--ghost" href={`#/phonics/${chapter.id}`}>回到{chapter.title}章節</a>}
    </div></footer>
  </main>;
}
