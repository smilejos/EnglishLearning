export function remainingOptions(args, realOptIn) {
  if (args.length !== 1 || args[0] !== '--execute' || realOptIn !== '1') throw Error('執行06–40須 SCENARIO_REAL_TTS=1 produce-remaining.mjs --execute；不接受擴大範圍參數');
  return {start: 6, end: 40};
}
export function verifyImageGate(gate, {id, key, imagePath, sha256}) {
  if (gate.id !== id || gate.scenarioKey !== key || gate.reviewed !== true || gate.imagePath !== imagePath || gate.sha256 !== sha256) throw Error('人工影像 gate 的場次／圖檔／hash／審閱狀態不符，禁止匯入');
}
export function verifyUiGate(gate, {id, key, contentHash}) {
  // UI gate 證据由主 agent 寫入；不由driver推測或生成。
  if (gate.id !== id || gate.scenarioKey !== key || gate.revision !== 1 || gate.reviewed !== true || gate.contentHash !== undefined && gate.contentHash !== contentHash) throw Error('UI gate 場次／不可覆寫版本／審閱狀態不符，禁止下一場');
}
