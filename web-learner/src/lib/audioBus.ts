// 全域單音源仲裁：登記目前播放者的停止函式；新播放會先停掉前一個，避免疊音。
type Stopper = () => void;

let current: Stopper | null = null;

/** 開始播放前呼叫：停掉其他音源並登記自己的停止函式。 */
export function claimAudio(stop: Stopper): void {
  if (current && current !== stop) current();
  current = stop;
}

/** 播放結束或主動停止時呼叫：若仍是目前持有者則釋放。 */
export function releaseAudio(stop: Stopper): void {
  if (current === stop) current = null;
}

/** 測試用：重置模組狀態。 */
export function _resetAudioBus(): void {
  current = null;
}
