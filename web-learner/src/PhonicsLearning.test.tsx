import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhonicsLearning } from "./PhonicsLearning";
import { lessonWords, phonicsLessons, shortAFamilies, shortAQuestions, studyWords } from "./phonicsLesson";
import { _resetAudioBus, claimAudio } from "./lib/audioBus";

type FakeAudio = {
  url: string; playbackRate: number; pause: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn>;
  onended: null | (() => void); onerror: null | (() => void);
};
const mockAssets = (lessonId: string) => {
  const lesson = phonicsLessons.find(({ id }) => id === lessonId)!;
  const keys = [...new Set([...lessonWords(lesson).map(({ word }) => word), ...lesson.sentences.flatMap((sentence) => [sentence.audioKey, ...(sentence.supportWords ?? []).map(({ audioKey }) => audioKey)])])];
  return Object.fromEntries(keys.map((key) => [key, { url: assetUrl(lessonId, key), text: key, assetGuid: "00000000-0000-4000-8000-000000000001" }]));
};
const assetUrl = (lessonId: string, key: string) => {
  const number = [...`${lessonId}/${key}`].reduce((hash, letter) => ((hash * 31) + letter.charCodeAt(0)) >>> 0, 0);
  return `/audio/wordbank/09eeb3d17582e855/00000000-0000-4000-8000-${String(number).padStart(12, "0")}.mp3`;
};
let audios: FakeAudio[];
beforeEach(() => {
  _resetAudioBus(); audios = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const lessonId = url.split("/").at(-1)!;
    return { ok: true, json: async () => ({ assets: mockAssets(lessonId) }) };
  }));
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
  it("短母音章節提供可直接開啟的課程連結與實際教材範圍", () => {
    render(<PhonicsLearning lessonOpen={false} chapterId="short-vowels" />);
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
    expect(audios[0].url).toBe(assetUrl("short-a", "cat"));
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
    expect(audios[0].url).toBe(assetUrl("short-a", "hat"));
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
    expect(audios[1].url).toBe(assetUrl("short-a", "ran"));
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
      expect(audios[i].url).toBe(assetUrl("short-a", word));
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
    expect(audios[2].url).toBe(assetUrl("short-a", "hat"));
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
    expect(audios[1].url).toBe(assetUrl("short-a", "cap"));
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
    await act(async () => {});
    const oldEnded = audios[0].onended;
    const oldError = audios[0].onerror;
    chooseFamily("-an");
    expect(audios[0].pause).toHaveBeenCalledOnce();
    playFamily("-an");
    await act(async () => { resolveOld(); oldEnded?.(); oldError?.(); await vi.advanceTimersByTimeAsync(1000); });
    expect(audios).toHaveLength(2);
    expect(audios[1].url).toBe(assetUrl("short-a", "can"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("-an 字族：正在播放 1 / 5：can");
    await act(async () => { audios[1].onended?.(); await vi.advanceTimersByTimeAsync(650); });
    expect(audios).toHaveLength(3);
    expect(audios[2].url).toBe(assetUrl("short-a", "fan"));
  });

  it("認識聲音提供跨三個字族的示範，點選立即播放", async () => {
    const { container } = render(<PhonicsLearning lessonOpen />);
    const examples = Array.from(container.querySelectorAll<HTMLButtonElement>(".phonics-example-words button"));
    expect(examples.map((button) => button.textContent)).toEqual(["cat", "man", "map"]);
    fireEvent.click(examples[1]);
    await act(async () => {});
    expect(audios[0].url).toBe(assetUrl("short-a", "man"));
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
    expect(audios[2].url).toBe(assetUrl("short-a", "mat"));
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
    await act(async () => {});
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
    expect(audios[0].url).toBe(assetUrl("short-a", "sentence-1"));
    fireEvent.click(screen.getByRole("button", { name: "聽單字 cat" }));
    await act(async () => {});
    expect(audios[0].pause).toHaveBeenCalledOnce();
    expect(audios[1].url).toBe(assetUrl("short-a", "cat"));
    fireEvent.click(screen.getByRole("button", { name: "讀下一句" }));
    expect(audios[1].pause).toHaveBeenCalledOnce();
    expect(screen.getByText("短句 2 / 2")).toBeTruthy();
    expect(screen.queryByText("一隻貓坐下了。")).toBeNull();
    expect(screen.queryByRole("img", { name: "一隻貓坐在墊子上" })).toBeNull();
    expect(screen.getByRole("img", { name: "一名男子坐在墊子上" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "看看中文" }).getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "聽完整短句" }));
    await act(async () => {});
    expect(audios[2].url).toBe(assetUrl("short-a", "sentence-family-2"));
    fireEvent.click(screen.getByRole("button", { name: "聽單字 man" }));
    await act(async () => {});
    expect(audios[2].pause).toHaveBeenCalledOnce();
    expect(audios[3].url).toBe(assetUrl("short-a", "man"));
    fireEvent.click(screen.getByRole("button", { name: "看看中文" }));
    expect(screen.getByText("一位男子坐在墊子上。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "我已讀過一次" }));
    expect(screen.getByRole("status").textContent).toContain("讀完後可以重聽核對");
  });
});


describe("五個短母音課程", () => {
  it("章節依教學順序提供五課與實際範圍", () => {
    render(<PhonicsLearning lessonOpen={false} chapterId="short-vowels" />);
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
    expect(audios[0].url).toBe(assetUrl(lessonId, lesson.introductionWords[0].word));
    enterBlending();
    const firstFamily = lesson.families[0];
    expect(container.querySelectorAll(".phonics-word-picker button")).toHaveLength(firstFamily.words.length);
    expect(container.querySelector(".phonics-grapheme.is-vowel")?.textContent).toBe(lesson.vowel);
    expect(screen.getByRole("button", { name: `播放單字 ${firstFamily.words[0].word}` }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: `全部播放 ${firstFamily.label} 字族，共 ${firstFamily.words.length} 詞` }));
    await act(async () => {});
    expect(audios[1].url).toBe(assetUrl(lessonId, firstFamily.words[0].word));
    const secondFamily = lesson.families[1];
    fireEvent.click(screen.getByRole("button", { name: `${secondFamily.label} 字族，${secondFamily.words.length} 個單字` }));
    expect(audios[1].pause).toHaveBeenCalledOnce();
    expect(audios).toHaveLength(2);
    enterPractice();
    expect(screen.getByText("第 1 / 8 題")).toBeTruthy();
    expect(screen.queryByText(lesson.questions[0].answer.meaning)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "播放題目" }));
    await act(async () => {});
    expect(audios[2].url).toBe(assetUrl(lessonId, lesson.questions[0].answer.word));
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

describe("長母音字形與詞表操作", () => {
  it("拼法與結構篩選取消字間連播、依實際詞表重設，CV／CCV 預設均可見，空篩選不提供播放", async () => {
    vi.useFakeTimers();
    const makeWord = (word: string, familyId: string, structure: string) => ({
      word, familyId, structure, meaning: "測試詞", phonemes: ["s", "iː"],
      graphemes: [{ text: word, kind: "vowel" as const, ranges: [{ start: 0, end: word.length }] }], targetRanges: [{ start: 1, end: word.length }],
    });
    const fixture = {
      ...phonicsLessons[0], id: "test-spellings", title: "字形測試", spellingLabel: "ee／ea",
      families: [
        { id: "test-ee", spelling: "ee", label: "-ee", rime: "/iː/", description: "ee", words: [makeWord("see", "test-ee", "CV"), makeWord("tree", "test-ee", "CCV")] },
        { id: "test-ea", spelling: "ea", label: "-ea", rime: "/iː/", description: "ea", words: [makeWord("tea", "test-ea", "CV")] },
      ],
    };
    phonicsLessons.push(fixture);
    try {
      const { container } = render(<PhonicsLearning lessonOpen lessonId={fixture.id} />);
      enterBlending();
      expect((screen.getByRole("combobox", { name: "篩選單字結構" }) as HTMLSelectElement).value).toBe("all");
      expect(container.querySelectorAll(".phonics-word-picker button")).toHaveLength(2);
      fireEvent.click(screen.getByRole("button", { name: "全部播放 -ee 字族，共 2 詞" }));
      await act(async () => {});
      act(() => audios[0].onended?.());
      fireEvent.change(screen.getByRole("combobox", { name: "篩選單字結構" }), { target: { value: "CCV" } });
      await act(async () => { vi.advanceTimersByTime(700); });
      expect(audios).toHaveLength(1);
      expect(screen.getByRole("button", { name: "播放單字 tree" }).getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByRole("button", { name: "全部播放 -ee 字族，共 1 詞" })).toBeTruthy();
      fireEvent.click(within(screen.getByRole("group", { name: "選擇拼法" })).getByRole("button", { name: "ea" }));
      expect(screen.getByRole("status").textContent).toContain("調整結構篩選");
      expect(screen.queryByRole("button", { name: "聽完整單字" })).toBeNull();
      expect(container.querySelector(".phonics-word-picker")).toBeNull();
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "all" } });
      expect(screen.getByRole("button", { name: "播放單字 tea" }).getAttribute("aria-pressed")).toBe("true");
      fireEvent.click(screen.getByRole("button", { name: "全部播放 -ea 字族，共 1 詞" }));
      await act(async () => {});
      fireEvent.click(within(screen.getByRole("group", { name: "選擇拼法" })).getByRole("button", { name: "ee" }));
      expect(audios[1].pause).toHaveBeenCalledOnce();
      expect(screen.getByRole("button", { name: "播放單字 see" }).getAttribute("aria-pressed")).toBe("true");
      expect(audios).toHaveLength(2);
    } finally { phonicsLessons.pop(); }
  });

  it("多字母作答塊以實際塊數完成，重複塊可獨立取用、移除與重排", () => {
    const answer = {
      word: "peep", meaning: "偷看", familyId: "test-eep", structure: "CVC", phonemes: ["p", "iː", "p"],
      graphemes: [{ text: "p", kind: "consonant" as const, ranges: [{ start: 0, end: 1 }] }, { text: "ee", kind: "vowel" as const, ranges: [{ start: 1, end: 3 }] }, { text: "p", kind: "consonant" as const, ranges: [{ start: 3, end: 4 }] }],
      targetRanges: [{ start: 1, end: 3 }], spellingUnits: ["p", "ee", "p"],
    };
    const fixture = { ...phonicsLessons[0], id: "test-tiles", families: [{ id: "test-eep", label: "-eep", rime: "/iːp/", description: "測試", words: [answer] }], questions: [{ id: "test-peep", kind: "spell" as const, answer, choices: ["p", "ee", "p", "a"] }] };
    phonicsLessons.push(fixture);
    try {
      render(<PhonicsLearning lessonOpen lessonId={fixture.id} />);
      enterPractice();
      expect(within(screen.getByRole("group", { name: "已排列的字母" })).getAllByRole("button")).toHaveLength(3);
      expect(screen.queryByText("偷看")).toBeNull();
      const [firstP, secondP] = screen.getAllByRole<HTMLButtonElement>("button", { name: "加入字母 p" });
      fireEvent.click(firstP);
      fireEvent.click(screen.getByRole("button", { name: "加入字母 ee" }));
      expect(screen.getByRole<HTMLButtonElement>("button", { name: "確認答案" }).disabled).toBe(true);
      fireEvent.click(secondP);
      expect(screen.getByRole<HTMLButtonElement>("button", { name: "確認答案" }).disabled).toBe(false);
      fireEvent.click(screen.getByRole("button", { name: "移除第 1 個字母 p" }));
      expect(firstP.disabled).toBe(false);
      expect(secondP.disabled).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "清除重排" }));
      fireEvent.click(firstP); fireEvent.click(screen.getByRole("button", { name: "加入字母 ee" })); fireEvent.click(secondP);
      fireEvent.click(screen.getByRole("button", { name: "確認答案" }));
      expect(screen.getByText("答對了！")).toBeTruthy();
    } finally { phonicsLessons.pop(); }
  });
});

for (const lesson of phonicsLessons.filter(({ id }) => !id.startsWith("short-"))) {
  it(`${lesson.id} 四階段使用自己的內容，八題按實際作答塊可完成且不提早揭曉答案`, async () => {
    const { container } = render(<PhonicsLearning lessonOpen lessonId={lesson.id} />);
    expect(screen.getByRole("heading", { name: lesson.title, level: 1 })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "聽單字示範" }));
    await act(async () => {});
    expect(audios[0].url).toBe(assetUrl(lesson.id, lesson.introductionWords[0].word));
    enterBlending();
    const family = lesson.families[0];
    const first = family.words[0];
    expect(container.querySelectorAll(".phonics-word-picker button")).toHaveLength(family.words.length);
    expect(screen.getByRole("button", { name: `播放單字 ${first.word}` }).getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelectorAll(".phonics-whole-word em").length).toBe(first.targetRanges.reduce((count, range) => count + range.end - range.start, 0));
    if (first.graphemes.some(({ ranges }) => ranges.length > 1)) expect(screen.getByText(/底線表示兩個字母中間隔著其他字母/)).toBeTruthy();
    enterPractice();
    expect(screen.queryByText(lesson.questions[0].answer.meaning)).toBeNull();
    for (const [index, question] of lesson.questions.entries()) {
      if (question.kind === "listen") {
        fireEvent.click(within(screen.getByRole("group", { name: "單字選項" })).getByRole("button", { name: question.answer.word }));
      } else {
        for (const unit of question.answer.spellingUnits ?? Array.from(question.answer.word)) {
          const tile = screen.getAllByRole<HTMLButtonElement>("button", { name: `加入字母 ${unit}` }).find((button) => !button.disabled)!;
          expect(tile).toBeTruthy(); fireEvent.click(tile);
        }
      }
      fireEvent.click(screen.getByRole("button", { name: "確認答案" }));
      expect(screen.getByText("答對了！")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: index === 7 ? "看看練習結果" : "下一題" }));
    }
    expect(screen.getByText("8 / 8")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "4 讀個短句" }));
    expect(container.querySelector(".phonics-sentence")?.textContent).toBe(lesson.sentences[0].text);
    expect(screen.queryByText(lesson.sentences[0].translation)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "聽完整短句" }));
    await act(async () => {});
    expect(audios.at(-1)!.url).toBe(assetUrl(lesson.id, lesson.sentences[0].audioKey));
  });
}


describe("自然發音章節導覽", () => {
  it("總覽提供六個章節，不列出小課或播放音訊", () => {
    render(<PhonicsLearning lessonOpen={false} />);
    const navigation = screen.getByRole("navigation", { name: "自然發音章節" });
    expect(within(navigation).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "#/phonics/short-vowels", "#/phonics/long-vowels", "#/phonics/blends", "#/phonics/digraphs", "#/phonics/r-controlled", "#/phonics/endings",
    ]);
    expect(within(navigation).getByRole("link", { name: "短母音" })).toBeTruthy();
    expect(within(navigation).getByRole("link", { name: "長母音" })).toBeTruthy();
    expect(screen.getAllByText(/5 堂小課/)).toHaveLength(3);
    expect(screen.getByText(/7 堂小課/)).toBeTruthy();
    expect(screen.getByText(/3 堂小課/)).toBeTruthy();
    expect(screen.getByText(/4 堂小課/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /開始.*這一課/ })).toBeNull();
    expect(audios).toHaveLength(0);
  });

  it.each([
    ["short-vowels", "短母音", "short"], ["long-vowels", "長母音", "long"],
  ])("%s 只列出所屬五課，並能回到章節總覽", (chapterId, title, prefix) => {
    render(<PhonicsLearning lessonOpen={false} chapterId={chapterId} />);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /開始.*這一課/ }).map((link) => link.getAttribute("href"))).toEqual(
      ["a", "e", "i", "o", "u"].map((vowel) => `#/phonics/${prefix}-${vowel}`),
    );
    expect(screen.getByRole("link", { name: "自然發音" }).getAttribute("href")).toBe("#/phonics");
    expect(audios).toHaveLength(0);
  });

  it.each(phonicsLessons)("$id 頂端與最後階段都回到所屬章節", (lesson) => {
    render(<PhonicsLearning lessonOpen lessonId={lesson.id} />);
    const [title, target] = lesson.id.startsWith("long-") ? ["長母音", "long-vowels"]
      : lesson.id.startsWith("blends-") ? ["子音混合", "blends"]
      : lesson.id.startsWith("digraph-") ? ["子音字母組合", "digraphs"]
      : lesson.id.startsWith("r-") ? ["r 控制母音", "r-controlled"]
      : lesson.id.startsWith("endings-") ? ["字尾變化", "endings"] : ["短母音", "short-vowels"];
    expect(screen.getByRole("link", { name: `回到${title}章節` }).getAttribute("href")).toBe(`#/phonics/${target}`);
    fireEvent.click(screen.getByRole("button", { name: "4 讀個短句" }));
    expect(screen.getAllByRole("link", { name: `回到${title}章節` }).map((link) => link.getAttribute("href"))).toEqual([
      `#/phonics/${target}`, `#/phonics/${target}`,
    ]);
  });
});


describe("第三至五章教學標示與詞組操作", () => {
  it.each([
    ["blends", "子音混合", "blends-", 5], ["digraphs", "子音字母組合", "digraph-", 7], ["r-controlled", "r 控制母音", "r-", 3], ["endings", "字尾變化", "endings-", 4],
  ])("%s 只列所屬小課，使用詞組與聲音說明", (chapterId, title, prefix, count) => {
    render(<PhonicsLearning lessonOpen={false} chapterId={String(chapterId)} />);
    expect(screen.getByRole("heading", { name: String(title), level: 1 })).toBeTruthy();
    const links = screen.getAllByRole("link", { name: /開始.*這一課/ });
    expect(links).toHaveLength(Number(count));
    expect(links.map((link) => link.getAttribute("href"))).toEqual(phonicsLessons.filter(({ id }) => id.startsWith(String(prefix))).map(({ id }) => `#/phonics/${id}`));
    expect(screen.queryByText(/聽見這一課的母音/)).toBeNull();
    expect(screen.queryByText(/個字族/)).toBeNull();
  });

  it.each(["blends-l", "digraph-sh", "r-ar", "r-ore-oar"])("%s 依目標範圍標示字形，詞組操作不假稱同韻尾", (id) => {
    const lesson = phonicsLessons.find((lesson) => lesson.id === id)!;
    const { container } = render(<PhonicsLearning lessonOpen lessonId={id} />);
    enterBlending();
    expect(screen.getByRole("group", { name: "選擇詞組" })).toBeTruthy();
    expect(screen.queryByText(/字尾一樣/)).toBeNull();
    const entry = lesson.families[0].words[0];
    const marked = entry.graphemes.filter(({ ranges }) => ranges.some((range) => entry.targetRanges.some((target) => range.start < target.end && range.end > target.start)));
    expect(Array.from(container.querySelectorAll(".phonics-grapheme.is-target")).map((node) => node.textContent)).toEqual(marked.map(({ text }) => text));
    expect(marked.length).toBeGreaterThan(0);
  });

  it("詞組連播遇到換組與切課會取消字間等待，不自動續播", async () => {
    vi.useFakeTimers();
    const lesson = phonicsLessons.find(({ id }) => id === "blends-l")!;
    const { rerender } = render(<PhonicsLearning lessonOpen lessonId={lesson.id} />);
    enterBlending();
    const first = lesson.families[0];
    fireEvent.click(screen.getByRole("button", { name: `全部播放 ${first.label} 詞組，共 ${first.words.length} 詞` }));
    await act(async () => {});
    act(() => audios[0].onended?.());
    const second = lesson.families[1];
    // 多拼法課先換拼法，再切到該拼法的詞組；兩者均不能接續舊佇列。
    fireEvent.click(screen.getByRole("button", { name: second.spelling! }));
    expect(screen.getByRole("button", { name: `播放單字 ${second.words[0].word}` }).getAttribute("aria-pressed")).toBe("true");
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(audios).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: `全部播放 ${second.label} 詞組，共 ${second.words.length} 詞` }));
    await act(async () => {});
    act(() => audios[1].onended?.());
    rerender(<PhonicsLearning lessonOpen lessonId="digraph-sh" />);
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(audios).toHaveLength(2);
    expect(screen.getByRole("heading", { name: /聽聽.*sh.*單字裡的聲音/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "1 認識聲音" }).getAttribute("aria-current")).toBe("step");
  });
});


it.each(["digraph-ph", "long-o"])("%s 的不連續字形提示與本課實際標色目標一致", (id) => {
  const lesson = phonicsLessons.find((lesson) => lesson.id === id)!;
  const { container } = render(<PhonicsLearning lessonOpen lessonId={id} />);
  enterBlending();
  const note = screen.getByText("底線表示兩個字母中間隔著其他字母；例如 a_e 的 e 不另發音。標色部分是本課目標字形。");
  expect(note).toBeTruthy();
  expect(screen.queryByText(/標色的母音與字尾 e/)).toBeNull();
  const entry = lesson.families[0].words[0];
  expect(entry.graphemes.some(({ ranges }) => ranges.length > 1)).toBe(true);
  const expected = entry.graphemes.filter(({ ranges }) => ranges.some((range) => entry.targetRanges.some((target) => range.start < target.end && range.end > target.start))).map(({ text }) => text);
  expect(Array.from(container.querySelectorAll(".phonics-grapheme.is-target")).map((node) => node.textContent)).toEqual(expected);
  if (id === "digraph-ph") expect(expected).toEqual(["ph"]);
  else expect(expected).toEqual(["o_e"]);
});


it.each(["r-ar", "r-ore-oar"])("%s 將目標字形標示母音加 r，仍保留 r 音素與子音結構", (id) => {
  const lesson = phonicsLessons.find((lesson) => lesson.id === id)!;
  const { container } = render(<PhonicsLearning lessonOpen lessonId={id} />);
  enterBlending();
  const entry = lesson.families[0].words[0];
  const target = container.querySelector(".phonics-grapheme.is-target")!;
  expect(target.parentElement!.querySelector(".phonics-grapheme-label")?.textContent).toBe("母音＋r");
  expect(entry.phonemes).toContain("r");
  expect(entry.phonemes).toHaveLength(entry.structure.length);
  expect(entry.structure).toContain("C");
  expect(container.querySelector(".phonics-phonemes")?.textContent).toBe(entry.phonemes.map((sound) => `/${sound}/`).join(" → "));
  expect(container.querySelector(".phonics-word-structure")?.textContent).toContain(entry.structure);
});

describe("字尾變化的原形對照與多音素字尾", () => {
  it("es標色完整字尾，仍分母音與子音；原形含x不丟掉/k s/", async () => {
    const { container } = render(<PhonicsLearning lessonOpen lessonId="endings-es" />);
    enterBlending();
    expect(screen.getByLabelText("bus 變成 buses")).toBeTruthy();
    const targets = container.querySelectorAll(".phonics-grapheme.is-target");
    expect(Array.from(targets).map((element) => element.textContent)).toEqual(["e", "s"]);
    expect(targets[0].classList.contains("is-vowel")).toBe(true);
    expect(targets[1].classList.contains("is-vowel")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "-x + es 詞組，2 個單字" }));
    expect(screen.getByLabelText("fox 變成 foxes")).toBeTruthy();
    expect(screen.getByLabelText("逐音拼合").textContent).toBe("/f/ → /ɑ/ → /k/ → /s/ → /ɪ/ → /z/");
    expect(audios).toHaveLength(0);
  });

  it("ing按2／3／2／1詞組切換，呈現雙寫和刪e並保留長母音", async () => {
    vi.useFakeTimers();
    const { container } = render(<PhonicsLearning lessonOpen lessonId="endings-ing" />);
    enterBlending();
    expect(container.querySelectorAll(".phonics-word-picker button")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "全部播放 直接加 -ing 詞組，共 2 詞" }));
    await act(async () => {});
    act(() => audios[0].onended?.());
    fireEvent.click(screen.getByRole("button", { name: "雙寫後加 -ing 詞組，3 個單字" }));
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(audios).toHaveLength(1);
    expect(screen.getByLabelText("run 變成 running")).toBeTruthy();
    expect(container.querySelectorAll(".phonics-word-picker button")).toHaveLength(3);
    expect(screen.getByText(/nn 仍只有一個/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "去掉不發音 e 詞組，2 個單字" }));
    expect(screen.getByLabelText("make 變成 making")).toBeTruthy();
    expect(screen.getByLabelText("逐音拼合").textContent).toBe("/m/ → /eɪ/ → /k/ → /ɪ/ → /ŋ/");
    expect(container.querySelectorAll(".phonics-grapheme.is-target")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "保留 y 加 -ing 詞組，1 個單字" }));
    expect(screen.getByLabelText("play 變成 playing")).toBeTruthy();
    expect(container.querySelectorAll(".phonics-word-picker button")).toHaveLength(1);
    expect(audios).toHaveLength(1);
  });

  it("ing結構篩選可產生空詞表，切組後依篩選重設且不自動播放", () => {
    render(<PhonicsLearning lessonOpen lessonId="endings-ing" />);
    enterBlending();
    fireEvent.change(screen.getByRole("combobox", { name: "篩選單字結構" }), { target: { value: "CVCVC" } });
    expect(screen.getByText(/這個詞組還沒有可練習的單字/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "聽完整單字" })).toBeNull();
    expect(screen.queryByLabelText("原形與字尾變化")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "雙寫後加 -ing 詞組，3 個單字" }));
    expect(screen.getByRole("button", { name: "播放單字 running" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("run 變成 running")).toBeTruthy();
    expect(audios).toHaveLength(0);
  });
});

describe("共用音訊清單", () => {
  it("同課多次播放只讀取一次清單，所有播放使用 API 回傳位置", async () => {
    render(<PhonicsLearning lessonOpen />);
    fireEvent.click(screen.getByRole("button", { name: "聽單字示範" }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "2 看字拼讀" }));
    fireEvent.click(screen.getByRole("button", { name: "播放單字 hat" }));
    await act(async () => {});
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/audio-assets/phonics/short-a");
    expect(audios.map(({ url }) => url)).toEqual([assetUrl("short-a", "cat"), assetUrl("short-a", "hat")]);
  });

  it("清單載入失敗時不讀靜態音檔，按播放可重新載入", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    render(<PhonicsLearning lessonOpen />);
    fireEvent.click(screen.getByRole("button", { name: "聽單字示範" }));
    await act(async () => {});
    expect(audios).toHaveLength(0);
    expect(screen.getByRole("alert").textContent).toContain("重試");
    fireEvent.click(screen.getByRole("button", { name: "聽單字示範" }));
    await act(async () => {});
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(audios[0].url).toBe(assetUrl("short-a", "cat"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("清單缺少指定 key 時顯示錯誤，不猜檔名或回退舊路徑", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ assets: {} }) } as Response);
    render(<PhonicsLearning lessonOpen />);
    fireEvent.click(screen.getByRole("button", { name: "聽單字示範" }));
    await act(async () => {});
    expect(audios).toHaveLength(0);
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("清單尚未回覆時換階段或離頁，回覆後不會突然播放", async () => {
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { unmount } = render(<PhonicsLearning lessonOpen />);
    fireEvent.click(screen.getByRole("button", { name: "聽單字示範" }));
    expect(screen.getByRole("button", { name: "聽單字示範" }).textContent).toContain("載入中");
    enterPractice();
    unmount();
    await act(async () => { finish({ ok: true, json: async () => ({ assets: mockAssets("short-a") }) } as Response); });
    expect(audios).toHaveLength(0);
  });
});
