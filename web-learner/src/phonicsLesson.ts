/** 自然發音試作：明列教材資料，不呼叫生成 API，也不保存跨次作答紀錄。 */
export type PhonicsRange = { start: number; end: number };
export type PhonicsGrapheme = {
  text: string;
  kind: "vowel" | "consonant";
  ranges: PhonicsRange[];
};
export type PhonicsWord = {
  word: string;
  meaning: string;
  familyId: string;
  structure: string;
  /** 音素使用不含斜線的 IPA 字串；整字錄音不代表逐音錄音。 */
  phonemes: string[];
  graphemes: PhonicsGrapheme[];
  targetRanges: PhonicsRange[];
};
export type PhonicsFamily = {
  id: string;
  label: string;
  rime: string;
  description: string;
  words: PhonicsWord[];
};

/** 只用於本課已明列的三字母 CVC；renderer 不必猜字形或母音位置。 */
function shortACvcWord(
  word: string, meaning: string, familyId: string,
  letters: [string, string, string], phonemes: [string, string, string],
): PhonicsWord {
  return {
    word, meaning, familyId, structure: "CVC", phonemes,
    graphemes: [
      { text: letters[0], kind: "consonant", ranges: [{ start: 0, end: 1 }] },
      { text: letters[1], kind: "vowel", ranges: [{ start: 1, end: 2 }] },
      { text: letters[2], kind: "consonant", ranges: [{ start: 2, end: 3 }] },
    ],
    targetRanges: [{ start: 1, end: 2 }],
  };
}

export const shortAFamilies: PhonicsFamily[] = [
  {
    id: "short-a-a-at", label: "-at", rime: "/æt/",
    description: "字尾都是 at，換個字首，聽聽聲音的變化。",
    words: [
      shortACvcWord("cat", "貓", "short-a-a-at", ["c", "a", "t"], ["k", "æ", "t"]),
      shortACvcWord("bat", "球棒", "short-a-a-at", ["b", "a", "t"], ["b", "æ", "t"]),
      shortACvcWord("hat", "帽子", "short-a-a-at", ["h", "a", "t"], ["h", "æ", "t"]),
      shortACvcWord("mat", "墊子", "short-a-a-at", ["m", "a", "t"], ["m", "æ", "t"]),
      shortACvcWord("sat", "坐（sit 的過去式）", "short-a-a-at", ["s", "a", "t"], ["s", "æ", "t"]),
    ],
  },
  {
    id: "short-a-a-an", label: "-an", rime: "/æn/",
    description: "保留 an 的聲音，從字首開始，完整讀出單字。",
    words: [
      shortACvcWord("can", "罐子", "short-a-a-an", ["c", "a", "n"], ["k", "æ", "n"]),
      shortACvcWord("fan", "風扇", "short-a-a-an", ["f", "a", "n"], ["f", "æ", "n"]),
      shortACvcWord("man", "男人", "short-a-a-an", ["m", "a", "n"], ["m", "æ", "n"]),
      shortACvcWord("pan", "平底鍋", "short-a-a-an", ["p", "a", "n"], ["p", "æ", "n"]),
      shortACvcWord("ran", "跑（run 的過去式）", "short-a-a-an", ["r", "a", "n"], ["r", "æ", "n"]),
    ],
  },
  {
    id: "short-a-a-ap", label: "-ap", rime: "/æp/",
    description: "這一組最後是 ap，留意結尾的 p。",
    words: [
      shortACvcWord("cap", "帽子", "short-a-a-ap", ["c", "a", "p"], ["k", "æ", "p"]),
      shortACvcWord("map", "地圖", "short-a-a-ap", ["m", "a", "p"], ["m", "æ", "p"]),
      shortACvcWord("nap", "小睡", "short-a-a-ap", ["n", "a", "p"], ["n", "æ", "p"]),
      shortACvcWord("tap", "輕拍", "short-a-a-ap", ["t", "a", "p"], ["t", "æ", "p"]),
    ],
  },
];
export const studyWords = shortAFamilies.flatMap((family) => family.words);
export const shortAWords = studyWords;
export type PhonicsQuestion = {
  id: string;
  kind: "listen" | "spell";
  answer: PhonicsWord;
  choices: string[];
};
const word = (text: string) => shortAWords.find((entry) => entry.word === text)!;
export const shortAIntroductionWords = [word("cat"), word("man"), word("map")];
export const shortAQuestions: PhonicsQuestion[] = [
  { id: "listen-mat", kind: "listen", answer: word("mat"), choices: ["sat", "mat", "cat"] },
  { id: "spell-map", kind: "spell", answer: word("map"), choices: ["p", "t", "a", "m"] },
  { id: "listen-cap", kind: "listen", answer: word("cap"), choices: ["cat", "can", "cap"] },
  { id: "spell-sat", kind: "spell", answer: word("sat"), choices: ["a", "m", "t", "s"] },
  { id: "listen-man", kind: "listen", answer: word("man"), choices: ["man", "mat", "map"] },
  { id: "spell-fan", kind: "spell", answer: word("fan"), choices: ["n", "f", "p", "a"] },
  { id: "listen-pan", kind: "listen", answer: word("pan"), choices: ["man", "pan", "can"] },
  { id: "spell-nap", kind: "spell", answer: word("nap"), choices: ["p", "t", "n", "a"] },
];

export type PhonicsSentence = {
  id: string;
  audioKey: string;
  text: string;
  translation: string;
  supportNote: string;
  wordKeys: string[];
};
export const shortASentences: PhonicsSentence[] = [
  {
    id: "short-a-family-sentence-1", audioKey: "sentence-1", text: "A cat sat.",
    translation: "一隻貓坐下了。",
    supportNote: "句首的 A 是搭配使用的常用詞，常會弱讀，和 cat 裡的 a 不同。",
    wordKeys: ["cat", "sat"],
  },
  {
    id: "short-a-family-sentence-2", audioKey: "sentence-family-2", text: "A man sat on a mat.",
    translation: "一位男子坐在墊子上。",
    supportNote: "A / a 和 on 是搭配使用的常用詞；先聽示範再跟讀。a 在句中常弱讀，和 man 裡的 a 不同。",
    wordKeys: ["man", "sat", "mat"],
  },
];
export const phonicsAudioPath = (key: string) => `/phonics/short-a/${key}.mp3`;
