import { useCallback, useEffect, useRef, useState } from "react";
import { claimAudio, releaseAudio } from "./lib/audioBus";
import { PauseIcon, SoundIcon } from "./icons";
import { scenarioMediaUrl } from "./api";

/** 仲裁只暫停旁白，保留播放位置；離頁才釋放媒體。 */
export function useScenarioNarration(path?: string | null) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const generation = useRef(0);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [position, setPosition] = useState(0);
  const [rate, setRate] = useState(1);
  const pause = useCallback(() => {
    generation.current++;
    audio.current?.pause();
    setState("idle");
    releaseAudio(pause);
  }, []);
  useEffect(() => () => {
    pause();
    audio.current = null;
  }, [path, pause]);
  const play = async (restart = false) => {
    if (!path) return;
    const current = audio.current ?? new Audio(scenarioMediaUrl(path));
    audio.current = current;
    if (restart) { current.currentTime = 0; setPosition(0); }
    current.playbackRate = rate;
    const ticket = ++generation.current;
    current.ontimeupdate = () => { if (audio.current === current) setPosition(current.currentTime); };
    current.onended = () => { if (ticket === generation.current) { pause(); current.currentTime = 0; setPosition(0); } };
    const fail = () => { if (ticket === generation.current) { pause(); setState("error"); } };
    current.onerror = fail;
    claimAudio(pause);
    setState("loading");
    try { await current.play(); if (ticket === generation.current) setState("playing"); } catch { fail(); }
  };
  return { state, position, rate, pause, play, setRate: (value: number) => {
    setRate(value); if (audio.current) audio.current.playbackRate = value;
  } };
}

export function ScenarioAudioButton({ path, label }: { path: string | null; label: string }) {
  const player = useScenarioNarration(path);
  return <span className="scenario-audio">
    <button className="btn btn--ghost btn--sm" disabled={!path || player.state === "loading"}
      onClick={() => player.state === "playing" ? player.pause() : void player.play(true)}
      aria-label={`${player.state === "playing" ? "暫停" : player.state === "error" ? "重試" : "播放"}${label}`}>
      {player.state === "playing" ? <PauseIcon /> : <SoundIcon />}
      {!path ? "音檔待準備" : player.state === "loading" ? "載入中…" : player.state === "playing" ? "暫停" : player.state === "error" ? "重試播放" : "播放"}
    </button>
    {player.state === "error" && <span role="status" className="scenario-error">播放失敗，請重試。</span>}
  </span>;
}
