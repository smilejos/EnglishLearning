// 把整篇文章的逐段音檔串成一條可拖曳的連續時間軸（沿用 article2speech 設計）。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface PlayerItem {
  paragraphId: number;
  url: string;
}

export interface ArticlePlayer {
  index: number; // 目前段落於 items 的索引；尚未播放為 -1
  currentParagraphId: number | null; // 目前播放中的段落 id（供高亮）
  playing: boolean;
  position: number; // 全篇累計秒數
  duration: number; // 全篇總秒數
  speed: number;
  active: boolean; // 是否顯示播放列
  /** 播放第 i 段；continuous（預設）會自動接續下一段。 */
  playParagraph: (i: number, continuous?: boolean) => void;
  toggle: () => void;
  prev: () => void;
  next: () => void;
  seek: (fraction: number) => void;
  setSpeed: (speed: number) => void;
  repeat: boolean;
  toggleRepeat: () => void;
}

/** 可選播放速度，由慢到快。 */
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function useArticlePlayer(
  items: PlayerItem[],
  initialSpeed = 1,
): ArticlePlayer {
  const audio = useMemo(() => new Audio(), []);
  const [durations, setDurations] = useState<number[]>(() => items.map(() => 0));
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [posInPara, setPosInPara] = useState(0);
  const [speed, setSpeed] = useState(initialSpeed || 1);
  const pendingSeek = useRef<number | null>(null);
  const indexRef = useRef(-1);
  indexRef.current = index;
  const continuousRef = useRef(true);
  const [repeat, setRepeat] = useState(false);
  const repeatRef = useRef(false);
  repeatRef.current = repeat;

  // 預載 metadata 取得各段真實長度，組出時間軸。
  useEffect(() => {
    setDurations(items.map(() => 0));
    const probes = items.map((it, i) => {
      const a = new Audio();
      a.preload = "metadata";
      a.src = it.url;
      const onMeta = () =>
        setDurations((d) => {
          const n = [...d];
          n[i] = a.duration || 0;
          return n;
        });
      a.addEventListener("loadedmetadata", onMeta);
      return { a, onMeta };
    });
    return () =>
      probes.forEach(({ a, onMeta }) => {
        a.removeEventListener("loadedmetadata", onMeta);
        a.src = "";
      });
  }, [items]);

  const starts = useMemo(() => {
    const s: number[] = [];
    let t = 0;
    for (const d of durations) {
      s.push(t);
      t += d;
    }
    return s;
  }, [durations]);
  const total = useMemo(() => durations.reduce((a, b) => a + b, 0), [durations]);

  const playParagraph = useCallback(
    (i: number, continuous = true) => {
      if (i < 0 || i >= items.length) return;
      continuousRef.current = continuous;
      setIndex(i);
      audio.src = items[i].url;
      audio.currentTime = 0;
      audio.playbackRate = speed;
      setPosInPara(0);
      void audio.play();
      setPlaying(true);
    },
    [audio, items, speed],
  );

  useEffect(() => {
    const onTime = () => setPosInPara(audio.currentTime);
    const onEnded = () => {
      if (!continuousRef.current) {
        setPlaying(false);
        return;
      }
      const next = indexRef.current + 1;
      if (next < items.length) playParagraph(next, true);
      else if (repeatRef.current) playParagraph(0, true); // 重複：整篇循環
      else setPlaying(false);
    };
    const onMeta = () => {
      if (pendingSeek.current != null) {
        audio.currentTime = pendingSeek.current;
        pendingSeek.current = null;
      }
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("loadedmetadata", onMeta);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("loadedmetadata", onMeta);
    };
  }, [audio, items, playParagraph]);

  useEffect(() => {
    audio.playbackRate = speed;
  }, [audio, speed]);
  useEffect(() => () => audio.pause(), [audio]);

  const toggle = useCallback(() => {
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    if (index < 0) {
      playParagraph(0);
      return;
    }
    void audio.play();
    setPlaying(true);
  }, [audio, playing, index, playParagraph]);

  const prev = useCallback(
    () =>
      playParagraph(Math.max(0, (indexRef.current < 0 ? 0 : indexRef.current) - 1)),
    [playParagraph],
  );
  const next = useCallback(
    () => playParagraph(Math.min(items.length - 1, indexRef.current + 1)),
    [playParagraph, items.length],
  );

  const seek = useCallback(
    (fraction: number) => {
      if (total <= 0) return;
      const target = Math.max(0, Math.min(1, fraction)) * total;
      let i = 0;
      for (let k = 0; k < starts.length; k++)
        if (target >= starts[k] - 1e-3) i = k;
      const off = target - starts[i];
      if (i === indexRef.current) {
        audio.currentTime = off;
        setPosInPara(off);
      } else {
        setIndex(i);
        pendingSeek.current = off;
        audio.src = items[i].url;
        audio.playbackRate = speed;
        setPosInPara(off);
        if (playing) void audio.play();
      }
    },
    [audio, items, starts, total, playing, speed],
  );

  const toggleRepeat = useCallback(() => setRepeat((v) => !v), []);

  const position = (index >= 0 ? starts[index] ?? 0 : 0) + posInPara;
  return {
    index,
    currentParagraphId: index >= 0 ? items[index]?.paragraphId ?? null : null,
    playing,
    position,
    duration: total,
    speed,
    active: playing || index >= 0,
    playParagraph,
    toggle,
    prev,
    next,
    seek,
    setSpeed,
    repeat,
    toggleRepeat,
  };
}
