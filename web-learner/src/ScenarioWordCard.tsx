import type { WordbankEntry } from "./wordbankTypes";
import type { ScenarioTarget } from "./scenarioTypes";
import { ScenarioAudioButton } from "./ScenarioAudio";

export function ScenarioWordCard({ entry, target }: { entry: WordbankEntry; target?: ScenarioTarget }) {
  return <>
    <div className="scenario-card-title"><h3>{entry.word}</h3>
      <ScenarioAudioButton path={entry.wordAudioUrl} label={`${entry.word} 單字`} /></div>
    <p className="scenario-word-meta">{entry.partsOfSpeech.join(" / ")} · {entry.level.list ?? "未分類"}</p>
    {target && <p className="scenario-sense">本情境：{target.senseZh}（{target.teachingPos}）</p>}
    <p className="scenario-definition">{entry.definition || "中文釋義待補"}</p>
    <section aria-label="字庫英文解釋" className="scenario-word-section"><h4>英文解釋</h4>
      {!entry.explains.length && <p>英文解釋待補。</p>}
      {entry.explains.slice(0, 1).map(item => <div key={item.guid}><p>{item.en}</p>
        <ScenarioAudioButton path={item.audioUrl} label={`${entry.word} 英文解釋`} /></div>)}
      {entry.explains.length > 1 && <details><summary>更多英文解釋</summary>
        {entry.explains.slice(1).map(item => <div key={item.guid}><p>{item.en}</p>
          <ScenarioAudioButton path={item.audioUrl} label={`${entry.word} 英文解釋`} /></div>)}</details>}
    </section>
    <section aria-label="字庫既有例句" className="scenario-word-section"><h4>字庫例句</h4>
      {!entry.examples.length && <p>例句待補。</p>}
      {entry.examples.slice(0, 1).map(item => <div key={item.guid}><p>{item.en}</p><p className="scenario-example-zh">{item.zh}</p>
        <ScenarioAudioButton path={item.audioUrl} label={`${entry.word} 英文例句`} /></div>)}
      {entry.examples.length > 1 && <details><summary>更多例句（{entry.examples.length - 1}）</summary>
        {entry.examples.slice(1).map(item => <div key={item.guid}><p>{item.en}</p><p className="scenario-example-zh">{item.zh}</p>
          <ScenarioAudioButton path={item.audioUrl} label={`${entry.word} 英文例句`} /></div>)}</details>}
    </section>
  </>;
}
