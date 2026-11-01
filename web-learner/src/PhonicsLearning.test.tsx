import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhonicsLearning } from "./PhonicsLearning";
import { phonicsLessons, shortAFamilies, shortAQuestions, studyWords } from "./phonicsLesson";
import { _resetAudioBus, claimAudio } from "./lib/audioBus";

type FakeAudio = {
  url: string; playbackRate: number; pause: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn>;
  onended: null | (() => void); onerror: null | (() => void);
};
let audios: FakeAudio[];
beforeEach(() => {
  _resetAudioBus(); audios = [];
  vi.stubGlobal("Audio", vi.fn((url: string) => {
    const audio = { url, playbackRate: 1, pause: vi.fn(), play: vi.fn().mockResolvedValue(undefined), onended: null, onerror: null };
    audios.push(audio); return audio;
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function enterPractice() {
  fireEvent.click(screen.getByRole("button", { name: "3 動手練習" }));
}
function enterBlending() {
  fireEvent.click(screen.getByRole("button", { name: "2 看字拼讀" }));
}
function chooseFamily(label: string) {
  const family = shortAFamilies.find((item) => item.label === label)!;
  fireEvent.click(screen.getByRole("button", { name: `${label} 字族，${family.words.length} 個單字` }));
}
function playFamily(label = "-at") {
  const family = shortAFamilies.find((item) => item.label === label)!;
  fireEvent.click(screen.getByRole("button", { name: `全部播放 ${label} 字族，共 ${family.words.length} 詞` }));
}
function answerQuestion(index: number, correct = true) {
  const question = shortAQuestions[index];
  if (question.kind === "listen") {
    const choice = correct ? question.answer.word : question.choices.find((item) => item !== question.answer.word)!;
    fireEvent.click(within(screen.getByRole("group", { name: "單字選項" })).getByRole("button", { name: choice }));
  } else {
    const letters = correct ? question.answer.word.split("") : [...question.answer.word].reverse();
    for (const letter of letters) fireEvent.click(screen.getByRole("button", { name: `加入字母 ${letter}` }));
  }
  fireEvent.click(screen.getByRole("button", { name: "確認答案" }));
}

describe("短母音 a 教材", () => {
  it("總覽提供可直接開啟的課程連結與實際教材範圍", () => {
    render(<PhonicsLearning lessonOpen={false} />);
    expect(screen.getByRole("link", { name: "開始短母音 a 這一課" }).getAttribute("href")).toBe("#/phonics/short-a");
    const shortACourse = screen.getByRole("link", { name: "開始短母音 a 這一課" }).closest("section")!;
    expect(within(shortACourse).getByText("3 個字族・14 個單字")).toBeTruthy();
    expect(screen.getAllByText("8 題練習")).toHaveLength(5);
    expect(audios).toHaveLength(0);
  });

  it("整字示範與外部音源互斥，切階段及離頁會停止播放", async () => {
    const { unmount } = render(<PhonicsLearning lessonOpen />);
    const externalStop = vi.fn(); claimAudio(externalStop);
    fireEvent.click(screen.getByRole("button", { name: "聽單字示範" }));
    await act(async () => {});
    expect(externalStop).toHaveBeenCalledOnce();
    expect(audios[0].url).toBe("/phonics/short-a/cat.mp3");
    fireEvent.click(screen.getByRole("button", { name: "2 看字拼讀" }));
    expect(audios[0].pause).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "放慢聽" }));
    await act(async () => {});
    expect(audios[1].playbackRate).toBe(0.8);
    unmount();
    expect(audios[1].pause).toHaveBeenCalledOnce();
  });

  it("預設 at 五詞，切換 an 五詞與 ap 四詞會停止舊音訊並重設第一詞，不自動播放", async () => {
    const { container } = render(<PhonicsLearning lessonOpen />);
    enterBlending();
    const picker = container.querySelector(".phonics-word-picker")!;
    expect(Array.from(picker.querySelectorAll("button")).map((button) => button.getAttribute("aria-label"))).toEqual(
      ["cat", "bat", "hat", "mat", "sat"].map((word) => `播放單字 ${word}`),
    );
    expect(screen.getByRole("button", { name: "-at 字族，5 個單字" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "播放單字 cat" }).getAttribute("aria-pressed")).toBe("true");
    expect(audios).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "播放單字 hat" }));
    await act(async () => {});
    expect(audios[0].url).toBe("/phonics/short-a/hat.mp3");
    expect(container.querySelectorAll(".phonics-grapheme")).toHaveLength(3);
    expect(container.querySelector(".phonics-grapheme.is-vowel")?.textContent).toBe("a");
    chooseFamily("-an");
    expect(audios[0].pause).toHaveBeenCalledOnce();
    expect(audios).toHaveLength(1);
    expect(picker.querySelectorAll("button")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "播放單字 can" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: "播放單字 hat" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "播放單字 ran" }));
    await act(async () => {});
    expect(audios[1].url).toBe("/phonics/short-a/ran.mp3");
    chooseFamily("-ap");
    expect(audios[1].pause).toHaveBeenCalledOnce();
    expect(audios).toHaveLength(2);
    expect(picker.querySelectorAll("button")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "播放單字 cap" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("status").textContent).toContain("共 4 個單字");
  });

  it.each(shortAFamilies)("全部播放只依序播放 $label 字族，進度依實際詞數更新並在最後停止", async (family) => {
    vi.useFakeTimers();
    render(<PhonicsLearning lessonOpen />);
    enterBlending();
    chooseFamily(family.label);
    playFamily(family.label);
    await act(async () => {});
    for (let i = 0; i < family.words.length; i++) {
      const { word } = family.words[i];
      expect(audios).toHaveLength(i + 1);
      expect(audios[i].url).toBe(`/phonics/short-a/${word}.mp3`);
      expect(screen.getByRole("button", { name: `播放單字 ${word}` }).getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByRole("status").textContent).toContain(`${family.label} 字族：正在播放 ${i + 1} / ${family.words.length}：${word}`);
      await act(async () => { audios[i].onended?.(); await vi.advanceTimersByTimeAsync(650); });
    }
    expect(audios).toHaveLength(family.words.length);
    expect(screen.getByRole("button", { name: `全部播放 ${family.label} 字族，共 ${family.words.length} 詞` })).toBeTruthy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("全部播放可在字間停止，點個別單字會取消佇列而改播指定詞", async () => {
    vi.useFakeTimers();
    render(<PhonicsLearning lessonOpen />);
    fireEvent.click(screen.getByRole("button", { name: "2 看字拼讀" }));
    playFamily();
    await act(async () => {});
    act(() => audios[0].onended?.());
    fireEvent.click(screen.getByRole("button", { name: "停止字族連播" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(audios).toHaveLength(1);
    playFamily();
    await act(async () => {});
    act(() => audios[1].onended?.());
    fireEvent.click(screen.getByRole("button", { name: "播放單字 hat" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(audios).toHaveLength(3);
    expect(audios[2].url).toBe("/phonics/short-a/hat.mp3");
    expect(screen.getByRole("button", { name: "全部播放 -at 字族，共 5 詞" })).toBeTruthy();
    act(() => audios[2].onended?.());
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(audios).toHaveLength(3);
  });

  it("字間等待時切換字族會取消下一詞，選取新族第一詞且不自動發聲", async () => {
    vi.useFakeTimers();
    render(<PhonicsLearning lessonOpen />);
    enterBlending(); playFamily();
    await act(async () => {});
    const oldEnded = audios[0].onended;
    act(() => audios[0].onended?.());
    expect(vi.getTimerCount()).toBe(1);
    chooseFamily("-ap");
    expect(screen.getByRole("button", { name: "播放單字 cap" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("status").textContent).toContain("共 4 個單字");
    await act(async () => { oldEnded?.(); await vi.advanceTimersByTimeAsync(1000); });
    expect(audios).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.getByRole("button", { name: "全部播放 -ap 字族，共 4 詞" })).toBeTruthy();
    playFamily("-ap");
    await act(async () => {});
    expect(audios[1].url).toBe("/phonics/short-a/cap.mp3");
  });

  it("切字族後舊 ended、error 與 play promise 都不會干擾新字族連播", async () => {
    vi.useFakeTimers();
    let resolveOld!: () => void;
    vi.mocked(Audio).mockImplementationOnce((url?: string) => {
      const audio: FakeAudio = { url: url!, playbackRate: 1, pause: vi.fn(),
        play: vi.fn(() => new Promise<void>((resolve) => { resolveOld = resolve; })), onended: null, onerror: null };
      audios.push(audio); return audio as unknown as HTMLAudioElement;
    });
    render(<PhonicsLearning lessonOpen />);
    enterBlending(); playFamily();
    const oldEnded = audios[0].onended;
    const oldError = audios[0].onerror;
    chooseFamily("-an");
    expect(audios[0].pause).toHaveBeenCalledOnce();
    playFamily("-an");
    await act(async () => { resolveOld(); oldEnded?.(); oldError?.(); await vi.advanceTimersByTimeAsync(1000); });
    expect(audios).toHaveLength(2);
    expect(audios[1].url).toBe("/phonics/short-a/can.mp3");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("-an 字族：正在播放 1 / 5：can");
    await act(async () => { audios[1].onended?.(); await vi.advanceTimersByTimeAsync(650); });
    expect(audios).toHaveLength(3);
    expect(audios[2].url).toBe("/phonics/short-a/fan.mp3");
  });

  it("認識聲音提供跨三個字族的示範，點選立即播放", async () => {
    const { container } = render(<PhonicsLearning lessonOpen />);
    const examples = Array.from(container.querySelectorAll<HTMLButtonElement>(".phonics-example-words button"));
    expect(examples.map((button) => button.textContent)).toEqual(["cat", "man", "map"]);
    fireEvent.click(examples[1]);
    await act(async () => {});
    expect(audios[0].url).toBe("/phonics/short-a/man.mp3");
    expect(examples[1].getAttribute("aria-pressed")).toBe("true");
  });

  it("字形與母音依教材呈現，文字重點使用 targetRanges 而非硬標字母 a", () => {
    const cat = studyWords.find((entry) => entry.word === "cat")!;
    const originalRanges = cat.targetRanges;
    // 同一詞若拿來教字首 c，重點必須隨教材範圍改變；母音身分仍由字形資料決定。
    cat.targetRanges = [{ start: 0, end: 1 }];
    try {
      const { container } = render(<PhonicsLearning lessonOpen />);
      enterBlending();
      expect(Array.from(container.querySelectorAll(".phonics-grapheme")).map((element) => element.textContent)).toEqual(["c", "a", "t"]);
      expect(container.querySelector(".phonics-grapheme.is-vowel")?.textContent).toBe("a");
      expect(container.querySelector(".phonics-whole-word em")?.textContent).toBe("c");
      expect(container.querySelector(".phonics-word-structure")?.textContent).toContain("CVC");
    } finally { cat.targetRanges = originalRanges; }
  });

  it("其他音源、換階段與離頁都取消字間等待，不會繼續播放下一詞", async () => {
    vi.useFakeTimers();
    const { unmount } = render(<PhonicsLearning lessonOpen />);
    fireEvent.click(screen.getByRole("button", { name: "2 看字拼讀" }));
    playFamily();
    await act(async () => {});
    act(() => { audios[0].onended?.(); claimAudio(vi.fn()); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(audios).toHaveLength(1);
    playFamily();
    await act(async () => {});
    act(() => audios[1].onended?.());
    enterPractice();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(audios).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "2 看字拼讀" }));
    playFamily();
    await act(async () => {});
    act(() => audios[2].onended?.());
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(audios).toHaveLength(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("連播中播放失敗會停止後續詞，重播後舊事件不會干擾新音源", async () => {
    vi.useFakeTimers();
    render(<PhonicsLearning lessonOpen />);
    fireEvent.click(screen.getByRole("button", { name: "2 看字拼讀" }));
    playFamily();
    await act(async () => {});
    const oldEnded = audios[0].onended;
    const oldError = audios[0].onerror;
    await act(async () => { audios[0].onended?.(); await vi.advanceTimersByTimeAsync(650); });
    act(() => audios[1].onerror?.());
    expect(screen.getByRole("alert").textContent).toContain("重試");
    expect(screen.getByRole("button", { name: "全部播放 -at 字族，共 5 詞" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "播放單字 mat" }));
    await act(async () => { oldEnded?.(); oldError?.(); await vi.advanceTimersByTimeAsync(1000); });
    expect(audios).toHaveLength(3);
    expect(audios[2].url).toBe("/phonics/short-a/mat.mp3");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "停止聽完整單字" })).toBeTruthy();
  });

  it("舊播放 promise 完成不會覆蓋新階段，音訊失敗能重試", async () => {
    let resolveOld!: () => void;
    render(<PhonicsLearning lessonOpen />);
    vi.mocked(Audio).mockImplementationOnce((url?: string) => {
      const audio: FakeAudio = { url: url!, playbackRate: 1, pause: vi.fn(),
        play: vi.fn(() => new Promise<void>((resolve) => { resolveOld = resolve; })), onended: null, onerror: null };
      audios.push(audio); return audio as unknown as HTMLAudioElement;
    });
    fireEvent.click(screen.getByRole("button", { name: "聽單字示範" }));
    enterPractice();
    await act(async () => resolveOld());
    expect(screen.getByRole("button", { name: "播放題目" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "播放題目" }));
    await act(async () => {});
    act(() => audios[1].onerror?.());
    expect(screen.getByRole("alert").textContent).toContain("請再按一次播放按鈕重試");
    fireEvent.click(screen.getByRole("button", { name: "播放題目" }));
    await act(async () => {});
    expect(screen.queryByRole("alert")).toBeNull();
    expect(audios).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "4 讀個短句" }));
    expect(audios[2].pause).toHaveBeenCalledOnce();
  });

  it("選字前不能送出且不標示正解，答錯可重試，第一次結果仍列為錯題", () => {
    const { container } = render(<PhonicsLearning lessonOpen />);
    enterPractice();
    expect((screen.getByRole("button", { name: "確認答案" }) as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector(".is-correct")).toBeNull();
    answerQuestion(0, false);
    expect(screen.getByRole("status").textContent).toContain("再留意一下這個字");
    expect(screen.getByRole("status").textContent).toContain("墊子");
    fireEvent.click(screen.getByRole("button", { name: "再試一次" }));
    answerQuestion(0);
    expect(screen.getByRole("status").textContent).toContain("答對了");
    fireEvent.click(screen.getByRole("button", { name: "下一題" }));
    for (let i = 1; i < shortAQuestions.length; i++) {
      answerQuestion(i);
      fireEvent.click(screen.getByRole("button", { name: i === shortAQuestions.length - 1 ? "看看練習結果" : "下一題" }));
    }
    expect(screen.getByText("7 / 8")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "再練這 1 題" }));
    expect(screen.getByText("第 1 / 1 題")).toBeTruthy();
    answerQuestion(0);
    fireEvent.click(screen.getByRole("button", { name: "看看練習結果" }));
    expect(screen.getByText("1 / 1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /再練這/ })).toBeNull();
  });

  it("拼字揭曉前不顯示完整答案，字母可移除重排，換題會停止音訊", async () => {
    const { container } = render(<PhonicsLearning lessonOpen />);
    enterPractice(); answerQuestion(0);
    fireEvent.click(screen.getByRole("button", { name: "下一題" }));
    expect(container.textContent).not.toContain("map");
    expect(container.textContent).not.toContain("地圖");
    fireEvent.click(screen.getByRole("button", { name: "加入字母 p" }));
    fireEvent.click(screen.getByRole("button", { name: "移除第 1 個字母 p" }));
    expect((screen.getByRole("button", { name: "加入字母 p" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "播放題目" }));
    await act(async () => {});
    answerQuestion(1);
    expect(audios[0].pause).toHaveBeenCalledOnce();
    expect(screen.getByRole("status").textContent).toContain("地圖");
    fireEvent.click(screen.getByRole("button", { name: "下一題" }));
    expect(screen.getByText("第 3 / 8 題")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect((screen.getByRole("button", { name: "確認答案" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("短句中文預設收起，切句重設翻譯，播放短句與查詞互斥", async () => {
    render(<PhonicsLearning lessonOpen />);
    fireEvent.click(screen.getByRole("button", { name: "4 讀個短句" }));
    expect(screen.queryByText("一隻貓坐下了。")).toBeNull();
    expect(screen.getByRole("img", { name: "一隻貓坐在墊子上" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "看看中文" }));
    expect(screen.getByText("一隻貓坐下了。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "聽完整短句" }));
    await act(async () => {});
    expect(audios[0].url).toBe("/phonics/short-a/sentence-1.mp3");
    fireEvent.click(screen.getByRole("button", { name: "聽單字 cat" }));
    await act(async () => {});
    expect(audios[0].pause).toHaveBeenCalledOnce();
    expect(audios[1].url).toBe("/phonics/short-a/cat.mp3");
    fireEvent.click(screen.getByRole("button", { name: "讀下一句" }));
    expect(audios[1].pause).toHaveBeenCalledOnce();
    expect(screen.getByText("短句 2 / 2")).toBeTruthy();
    expect(screen.queryByText("一隻貓坐下了。")).toBeNull();
    expect(screen.queryByRole("img", { name: "一隻貓坐在墊子上" })).toBeNull();
    expect(screen.getByRole("img", { name: "一名男子坐在墊子上" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "看看中文" }).getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "聽完整短句" }));
    await act(async () => {});
    expect(audios[2].url).toBe("/phonics/short-a/sentence-family-2.mp3");
    fireEvent.click(screen.getByRole("button", { name: "聽單字 man" }));
    await act(async () => {});
    expect(audios[2].pause).toHaveBeenCalledOnce();
    expect(audios[3].url).toBe("/phonics/short-a/man.mp3");
    fireEvent.click(screen.getByRole("button", { name: "看看中文" }));
    expect(screen.getByText("一位男子坐在墊子上。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "我已讀過一次" }));
    expect(screen.getByRole("status").textContent).toContain("讀完後可以重聽核對");
  });
});


describe("五個短母音課程", () => {
  it("總覽依教學順序提供五課與實際範圍", () => {
    render(<PhonicsLearning lessonOpen={false} />);
    expect(screen.getAllByRole("link", { name: /開始短母音/ }).map((link) => link.getAttribute("href"))).toEqual(
      ["a", "e", "i", "o", "u"].map((vowel) => `#/phonics/short-${vowel}`),
    );
  });

  it.each(["short-e", "short-i", "short-o", "short-u"])("%s 使用本課字族、題目、短句與音訊", async (lessonId) => {
    const lesson = phonicsLessons.find((item) => item.id === lessonId)!;
    const { container } = render(<PhonicsLearning lessonOpen lessonId={lessonId} />);
    expect(screen.getByRole("heading", { name: `短母音 ${lesson.vowel}`, level: 1 })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "聽單字示範" }));
    await act(async () => {});
    expect(audios[0].url).toBe(`/phonics/${lessonId}/${lesson.introductionWords[0].word}.mp3`);
    enterBlending();
    const firstFamily = lesson.families[0];
    expect(container.querySelectorAll(".phonics-word-picker button")).toHaveLength(firstFamily.words.length);
    expect(container.querySelector(".phonics-grapheme.is-vowel")?.textContent).toBe(lesson.vowel);
    expect(screen.getByRole("button", { name: `播放單字 ${firstFamily.words[0].word}` }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: `全部播放 ${firstFamily.label} 字族，共 ${firstFamily.words.length} 詞` }));
    await act(async () => {});
    expect(audios[1].url).toBe(`/phonics/${lessonId}/${firstFamily.words[0].word}.mp3`);
    const secondFamily = lesson.families[1];
    fireEvent.click(screen.getByRole("button", { name: `${secondFamily.label} 字族，${secondFamily.words.length} 個單字` }));
    expect(audios[1].pause).toHaveBeenCalledOnce();
    expect(audios).toHaveLength(2);
    enterPractice();
    expect(screen.getByText("第 1 / 8 題")).toBeTruthy();
    expect(screen.queryByText(lesson.questions[0].answer.meaning)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "播放題目" }));
    await act(async () => {});
    expect(audios[2].url).toBe(`/phonics/${lessonId}/${lesson.questions[0].answer.word}.mp3`);
    for (const [index, question] of lesson.questions.entries()) {
      if (question.kind === "listen") {
        fireEvent.click(within(screen.getByRole("group", { name: "單字選項" })).getByRole("button", { name: question.answer.word }));
      } else {
        for (const letter of question.answer.word) {
          const tile = screen.getAllByRole<HTMLButtonElement>("button", { name: `加入字母 ${letter}` }).find((button) => !button.disabled)!;
          fireEvent.click(tile);
        }
      }
      fireEvent.click(screen.getByRole("button", { name: "確認答案" }));
      fireEvent.click(screen.getByRole("button", { name: index === 7 ? "看看練習結果" : "下一題" }));
    }
    expect(screen.getByText("8 / 8")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "4 讀個短句" }));
    expect(container.querySelector(".phonics-sentence")?.textContent).toBe(lesson.sentences[0].text);
    expect(screen.queryByText(lesson.sentences[0].translation)).toBeNull();
    expect(screen.getByRole("navigation", { name: "學習階段" })).toBeTruthy();
  });

  it("切換課程取消字間連播、重設階段且不自動播放", async () => {
    vi.useFakeTimers();
    const { rerender } = render(<PhonicsLearning lessonOpen lessonId="short-a" />);
    enterBlending(); playFamily();
    await act(async () => {});
    act(() => audios[0].onended?.());
    rerender(<PhonicsLearning lessonOpen lessonId="short-e" />);
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(audios).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "聽聽 e 在單字裡的聲音" })).toBeTruthy();
    enterBlending();
    const firstWord = phonicsLessons.find((lesson) => lesson.id === "short-e")!.families[0].words[0].word;
    expect(screen.getByRole("button", { name: `播放單字 ${firstWord}` }).getAttribute("aria-pressed")).toBe("true");
    expect(audios).toHaveLength(1);
  });
});


it("空字族不選取不存在的第一詞，並停止提供播放操作", () => {
  const firstFamily = shortAFamilies[0];
  const originalWords = firstFamily.words;
  firstFamily.words = [];
  try {
    render(<PhonicsLearning lessonOpen />);
    enterBlending();
    expect(screen.getByRole("status").textContent).toContain("這個字族還沒有可練習的單字");
    expect(screen.queryByRole("button", { name: "聽完整單字" })).toBeNull();
    expect(audios).toHaveLength(0);
    chooseFamily("-an");
    expect(screen.getByRole("button", { name: "播放單字 can" }).getAttribute("aria-pressed")).toBe("true");
  } finally { firstFamily.words = originalWords; }
});
