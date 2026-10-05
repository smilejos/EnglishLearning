import { HeadphonesIcon } from "./icons";
import "./WordbankPractice.css";

export function LearningHome() {
  return <main className="wrap learning-home">
    <div className="greet">
      <h1 className="greet__hi">今天，想怎麼練習英文？</h1>
      <p className="greet__sub">從文章理解語境，或從一個單字開始練習。</p>
    </div>
    <nav className="learning-paths" aria-label="學習功能">
      <a className="learning-path" href="#/articles">
        <div><h2>文章閱讀</h2><p>閱讀與聆聽課文，點選生字查詢解釋與發音。</p></div>
        <span className="learning-path__action">開始閱讀 <span aria-hidden="true">→</span></span>
      </a>
      <a className="learning-path learning-path--practice" href="#/practice">
        <div><h2>單字練習</h2><p>選擇程度，以單純練習、聽力或英文解釋挑戰自己。</p></div>
        <span className="learning-path__action">開始練習 <span aria-hidden="true">→</span></span>
      </a>
      <div className="learning-path learning-path--soon" aria-disabled="true">
        <div><h2>情境模擬</h2><p>在生活情境中運用英文。</p></div>
        <span className="learning-path__action">即將推出</span>
      </div>
    </nav>
    <a className="learning-home__review" href="#/review"><HeadphonesIcon size={18} /> 回到我的單字複習 <span aria-hidden="true">→</span></a>
  </main>;
}
