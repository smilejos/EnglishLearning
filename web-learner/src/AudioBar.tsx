// 底部貼齊播放列（沿用 article2speech）：重複、上/下一段、播放/暫停、進度拖曳、速度。
import { useRef } from "react";
import { SPEEDS } from "./useArticlePlayer";
import {
  PlayIcon,
  PauseIcon,
  PrevIcon,
  NextIcon,
  RepeatIcon,
  HeadphonesIcon,
} from "./icons";

function fmt(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

export interface AudioBarProps {
  show: boolean;
  /** 封面 emoji＋漸層（與文章卡片一致）；未提供時用預設。 */
  cover?: { emoji: string; gradient: string };
  title: string;
  index: number;
  total: number;
  playing: boolean;
  position: number;
  duration: number;
  speed: number;
  repeat: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (fraction: number) => void;
  onSetSpeed: (speed: number) => void;
  onToggleRepeat: () => void;
}

export function AudioBar(props: AudioBarProps) {
  const { show, title, index, total, playing, position, duration, speed, repeat } =
    props;
  const trackRef = useRef<HTMLDivElement>(null);
  const frac = duration ? Math.min(1, position / duration) : 0;

  const seekTo = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    props.onSeek(Math.min(1, Math.max(0, (clientX - r.left) / r.width)));
  };

  return (
    <div className={"audiobar" + (show ? " show" : "")}>
      <div className="audiobar__in">
        <div className="ab-now">
          <div
            className="ab-now__art"
            style={props.cover ? { background: props.cover.gradient } : undefined}
          >
            {props.cover?.emoji ?? "🌱"}
          </div>
          <div className="ab-now__txt">
            <div className="ab-now__t">{title}</div>
            <div className="ab-now__s">
              第 {Math.max(0, index) + 1} / {total} 段
            </div>
          </div>
        </div>

        <div className="ab-mid">
          <div className="ab-controls">
            <button
              className={"ab-ctl" + (repeat ? " is-on" : "")}
              onClick={props.onToggleRepeat}
              aria-label="重複播放"
              aria-pressed={repeat}
              title={repeat ? "重複播放：開" : "重複播放：關"}
            >
              <RepeatIcon />
            </button>
            <button className="ab-ctl" onClick={props.onPrev} aria-label="上一段">
              <PrevIcon />
            </button>
            <button
              className="ab-ctl ab-ctl--main"
              onClick={props.onToggle}
              aria-label={playing ? "暫停" : "播放"}
            >
              {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
            </button>
            <button className="ab-ctl" onClick={props.onNext} aria-label="下一段">
              <NextIcon />
            </button>
          </div>
          <div className="ab-seek">
            <span className="ab-time">{fmt(position)}</span>
            <div
              className="scrub"
              ref={trackRef}
              onMouseDown={(ev) => {
                seekTo(ev.clientX);
                const mv = (m: MouseEvent) => seekTo(m.clientX);
                const up = () => {
                  window.removeEventListener("mousemove", mv);
                  window.removeEventListener("mouseup", up);
                };
                window.addEventListener("mousemove", mv);
                window.addEventListener("mouseup", up);
              }}
            >
              <div className="scrub__track" />
              <div className="scrub__fill" style={{ width: frac * 100 + "%" }} />
              <div className="scrub__knob" style={{ left: frac * 100 + "%" }} />
            </div>
            <span className="ab-time">{fmt(duration)}</span>
          </div>
        </div>

        <div className="ab-right">
          <div className="ab-speed">
            <span className="ab-speed__val">{speed}×</span>
            <input
              className="ab-speed__slider"
              type="range"
              min={0}
              max={SPEEDS.length - 1}
              step={1}
              value={Math.max(0, SPEEDS.indexOf(speed))}
              onChange={(e) => props.onSetSpeed(SPEEDS[Number(e.target.value)])}
              aria-label="播放速度"
            />
          </div>
          <div className="ab-badge">
            <HeadphonesIcon />
          </div>
        </div>
      </div>
    </div>
  );
}
