import { longVowelLessons } from "./phonicsLongLessons";
import { blendLessons } from "./phonicsBlendLessons";
import { digraphLessons } from "./phonicsDigraphLessons";
import { rControlledLessons } from "./phonicsRControlledLessons";
import { inflectedLessons } from "./phonicsInflectedLessons";

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
  /** 拼字作答塊；未指定時沿用單字元字母。 */
  spellingUnits?: string[];
  /** 屈折字尾教材明列原形與拼字變化，不由畫面猜測。 */
  inflection?: { baseWord: string; suffix: string; note: string };
};
export type PhonicsFamily = {
  id: string;
  label: string;
  rime: string;
  /** 表示目標聲音的拼法；既有單拼法課程可省略。 */
  spelling?: string;
  description: string;
  words: PhonicsWord[];
};

/** 只用於教材已明列的三字母 CVC；renderer 不必猜字形或母音位置。 */
function cvcWord(
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
      cvcWord("cat", "貓", "short-a-a-at", ["c", "a", "t"], ["k", "æ", "t"]),
      cvcWord("bat", "球棒", "short-a-a-at", ["b", "a", "t"], ["b", "æ", "t"]),
      cvcWord("hat", "帽子", "short-a-a-at", ["h", "a", "t"], ["h", "æ", "t"]),
      cvcWord("mat", "墊子", "short-a-a-at", ["m", "a", "t"], ["m", "æ", "t"]),
      cvcWord("sat", "坐（sit 的過去式）", "short-a-a-at", ["s", "a", "t"], ["s", "æ", "t"]),
    ],
  },
  {
    id: "short-a-a-an", label: "-an", rime: "/æn/",
    description: "保留 an 的聲音，從字首開始，完整讀出單字。",
    words: [
      cvcWord("can", "罐子", "short-a-a-an", ["c", "a", "n"], ["k", "æ", "n"]),
      cvcWord("fan", "風扇", "short-a-a-an", ["f", "a", "n"], ["f", "æ", "n"]),
      cvcWord("man", "男人", "short-a-a-an", ["m", "a", "n"], ["m", "æ", "n"]),
      cvcWord("pan", "平底鍋", "short-a-a-an", ["p", "a", "n"], ["p", "æ", "n"]),
      cvcWord("ran", "跑（run 的過去式）", "short-a-a-an", ["r", "a", "n"], ["r", "æ", "n"]),
    ],
  },
  {
    id: "short-a-a-ap", label: "-ap", rime: "/æp/",
    description: "這一組最後是 ap，留意結尾的 p。",
    words: [
      cvcWord("cap", "帽子", "short-a-a-ap", ["c", "a", "p"], ["k", "æ", "p"]),
      cvcWord("map", "地圖", "short-a-a-ap", ["m", "a", "p"], ["m", "æ", "p"]),
      cvcWord("nap", "小睡", "short-a-a-ap", ["n", "a", "p"], ["n", "æ", "p"]),
      cvcWord("tap", "輕拍", "short-a-a-ap", ["t", "a", "p"], ["t", "æ", "p"]),
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
  supportWords?: { word: string; meaning: string; audioKey: string; text: string }[];
  illustration?: "cat" | "man";
};
export const shortASentences: PhonicsSentence[] = [
  {
    id: "short-a-family-sentence-1", audioKey: "sentence-1", text: "A cat sat.",
    translation: "一隻貓坐下了。",
    supportNote: "句首的 A 是搭配使用的常用詞，常會弱讀，和 cat 裡的 a 不同。",
    wordKeys: ["cat", "sat"],
    illustration: "cat",
    supportWords: [{ word: "a", meaning: "一個／一隻；聽片語中的弱讀，不當作短 a。", audioKey: "support-a-cat", text: "a cat" }],
  },
  {
    id: "short-a-family-sentence-2", audioKey: "sentence-family-2", text: "A man sat on a mat.",
    translation: "一位男子坐在墊子上。",
    supportNote: "A / a 和 on 是搭配使用的常用詞；先聽示範再跟讀。a 在句中常弱讀，和 man 裡的 a 不同。",
    wordKeys: ["man", "sat", "mat"],
    illustration: "man",
    supportWords: [
      { word: "a", meaning: "一個；聽片語中的弱讀，不當作短 a。", audioKey: "support-a-man", text: "a man" },
      { word: "on", meaning: "在……上面；本課先聽示範，不考核短 o。", audioKey: "support-on-a-mat", text: "on a mat" },
    ],
  },
];

export type PhonicsLesson = {
  id: string;
  vowel: string;
  sound: string;
  title: string;
  description: string;
  introductionText: string;
  pronunciationNote: string;
  spellingLabel: string;
  /** 子音或 r 控制母音依教學目標分詞組，不假稱相同韻尾字族。 */
  groupLabel?: "字族" | "詞組";
  prerequisites: string[];
  families: PhonicsFamily[];
  introductionWords: PhonicsWord[];
  questions: PhonicsQuestion[];
  sentences: PhonicsSentence[];
};

export const shortALesson: PhonicsLesson = {
  id: "short-a", vowel: "a", sound: "/æ/", title: "短母音 a",
  description: "從 -at、-an、-ap 字族，聽辨並拼讀短母音 a。",
  introductionText: "先聽完整單字，留意 a 的 /æ/，再試著把每個聲音從左到右連起來讀。",
  pronunciationNote: "本課 a 讀 /æ/，不讀字母名稱 /eɪ/；句中的冠詞 a 常弱讀，另外先聽片語示範。",
  spellingLabel: "a", prerequisites: ["先認識基本單字母子音；若不熟悉，先聽整字示範，再練習逐音拼合。"],
  families: shortAFamilies, introductionWords: shortAIntroductionWords,
  questions: shortAQuestions, sentences: shortASentences,
};

function cvcFamily(vowel: string, suffix: string, rime: string, entries: [string, string, [string, string, string]][]): PhonicsFamily {
  const id = `short-${vowel}-${vowel}-${suffix}`;
  return {
    id, label: `-${suffix}`, rime,
    description: `保留 ${suffix} 的韻尾，逐音拼合，換字首比較聲音。`,
    words: entries.map(([word, meaning, phonemes]) => cvcWord(word, meaning, id, [word[0], word[1], word[2]], phonemes)),
  };
}

function lessonWord(families: PhonicsFamily[], text: string): PhonicsWord {
  const found = families.flatMap(({ words }) => words).find(({ word }) => word === text);
  if (!found) throw new Error(`教材引用不存在的詞：${text}`);
  return found;
}

export const shortEFamilies: PhonicsFamily[] = [
  cvcFamily("e", "en", "/ɛn/", [
    ["hen", "母雞", ["h", "ɛ", "n"]],
    ["pen", "筆", ["p", "ɛ", "n"]],
    ["ten", "十", ["t", "ɛ", "n"]],
    ["men", "男人們（man 的複數）", ["m", "ɛ", "n"]],
  ]),
  cvcFamily("e", "et", "/ɛt/", [
    ["pet", "寵物", ["p", "ɛ", "t"]],
    ["net", "網子", ["n", "ɛ", "t"]],
    ["wet", "濕的", ["w", "ɛ", "t"]],
    ["get", "拿取；取得", ["ɡ", "ɛ", "t"]],
  ]),
  cvcFamily("e", "ed", "/ɛd/", [
    ["bed", "床", ["b", "ɛ", "d"]],
    ["red", "紅色的", ["r", "ɛ", "d"]],
    ["fed", "餵食（feed 的過去式）", ["f", "ɛ", "d"]],
  ]),
];
const eWord = (text: string) => lessonWord(shortEFamilies, text);
export const shortELesson: PhonicsLesson = {
  id: "short-e",
  vowel: "e",
  sound: "/ɛ/",
  title: "短母音 e",
  description: "從 -en、-et、-ed 字族，聽辨並拼讀短母音 e。",
  introductionText: "先聽完整單字，留意 e 的 /ɛ/，再試著把每個聲音從左到右連起來讀。",
  pronunciationNote: "本課 e 讀 /ɛ/，不讀字母名稱 /iː/。bed、red、fed 的 -ed 是字族，不代表所有過去式字尾的讀音。",
  spellingLabel: "e",
  prerequisites: ["先完成短 a 的逐音拼讀；新用到 d、g（/ɡ/）等子音若尚不熟悉，先聽整字示範。"],
  families: shortEFamilies,
  introductionWords: [eWord("hen"), eWord("pet"), eWord("bed")],
  questions: [
    { id: "short-e-listen-pen", kind: "listen", answer: eWord("pen"), choices: ["hen", "pen", "ten"] },
    { id: "short-e-spell-wet", kind: "spell", answer: eWord("wet"), choices: ["t", "n", "e", "w"] },
    { id: "short-e-listen-red", kind: "listen", answer: eWord("red"), choices: ["red", "bed", "fed"] },
    { id: "short-e-spell-net", kind: "spell", answer: eWord("net"), choices: ["t", "e", "p", "n"] },
    { id: "short-e-listen-pet", kind: "listen", answer: eWord("pet"), choices: ["pen", "get", "pet"] },
    { id: "short-e-spell-bed", kind: "spell", answer: eWord("bed"), choices: ["d", "t", "b", "e"] },
    { id: "short-e-listen-hen", kind: "listen", answer: eWord("hen"), choices: ["men", "hen", "pen"] },
    { id: "short-e-spell-get", kind: "spell", answer: eWord("get"), choices: ["e", "n", "t", "g"] },
  ],
  sentences: [
    {
      "id": "short-e-sentence-1",
      "audioKey": "sentence-1",
      "text": "Get a red pen.",
      "translation": "拿一支紅筆。",
      "supportNote": "先聽下方支援詞的片語示範，再跟讀整句；支援詞不當作本課新的拼讀考題。",
      "wordKeys": [
        "get",
        "red",
        "pen"
      ],
      "supportWords": [
        {
          "word": "a",
          "meaning": "一個；聽片語中的冠詞弱讀。",
          "audioKey": "support-a-red-pen",
          "text": "a red pen"
        }
      ]
    },
    {
      "id": "short-e-sentence-2",
      "audioKey": "sentence-2",
      "text": "The hen is on the bed.",
      "translation": "母雞在床上。",
      "supportNote": "先聽下方支援詞的片語示範，再跟讀整句；支援詞不當作本課新的拼讀考題。",
      "wordKeys": [
        "hen",
        "bed"
      ],
      "supportWords": [
        {
          "word": "the",
          "meaning": "這個／那個；聽片語中的弱讀。",
          "audioKey": "support-the-hen",
          "text": "the hen"
        },
        {
          "word": "is",
          "meaning": "是／在；句中讀 /ɪz/，先跟讀，不考短 i。",
          "audioKey": "support-is-on-the-bed",
          "text": "is on the bed"
        },
        {
          "word": "on",
          "meaning": "在……上面；先聽示範，不考短 o。",
          "audioKey": "support-on-the-bed",
          "text": "on the bed"
        }
      ]
    }
  ],
};

export const shortIFamilies: PhonicsFamily[] = [
  cvcFamily("i", "ig", "/ɪɡ/", [
    ["pig", "豬", ["p", "ɪ", "ɡ"]],
    ["big", "大的", ["b", "ɪ", "ɡ"]],
    ["dig", "挖", ["d", "ɪ", "ɡ"]],
    ["wig", "假髮", ["w", "ɪ", "ɡ"]],
  ]),
  cvcFamily("i", "in", "/ɪn/", [
    ["pin", "別針", ["p", "ɪ", "n"]],
    ["fin", "魚鰭", ["f", "ɪ", "n"]],
    ["bin", "箱子；垃圾桶", ["b", "ɪ", "n"]],
    ["tin", "金屬罐", ["t", "ɪ", "n"]],
  ]),
  cvcFamily("i", "it", "/ɪt/", [
    ["sit", "坐", ["s", "ɪ", "t"]],
    ["hit", "打；擊中", ["h", "ɪ", "t"]],
    ["fit", "合身；合適", ["f", "ɪ", "t"]],
    ["kit", "成套工具", ["k", "ɪ", "t"]],
  ]),
];
const iWord = (text: string) => lessonWord(shortIFamilies, text);
export const shortILesson: PhonicsLesson = {
  id: "short-i",
  vowel: "i",
  sound: "/ɪ/",
  title: "短母音 i",
  description: "從 -ig、-in、-it 字族，聽辨並拼讀短母音 i。",
  introductionText: "先聽完整單字，留意 i 的 /ɪ/，再試著把每個聲音從左到右連起來讀。",
  pronunciationNote: "本課 i 讀短促的 /ɪ/，留意它與字母名稱 /aɪ/ 不同。每詞仍從左到右拼合三個音。",
  spellingLabel: "i",
  prerequisites: ["沿用短 a、e 的單字母子音與逐音拼合；w 若尚不熟悉，先聽 wig 示範。"],
  families: shortIFamilies,
  introductionWords: [iWord("pig"), iWord("pin"), iWord("sit")],
  questions: [
    { id: "short-i-listen-pig", kind: "listen", answer: iWord("pig"), choices: ["big", "pig", "wig"] },
    { id: "short-i-spell-pin", kind: "spell", answer: iWord("pin"), choices: ["n", "t", "i", "p"] },
    { id: "short-i-listen-sit", kind: "listen", answer: iWord("sit"), choices: ["sit", "hit", "fit"] },
    { id: "short-i-spell-big", kind: "spell", answer: iWord("big"), choices: ["i", "d", "g", "b"] },
    { id: "short-i-listen-tin", kind: "listen", answer: iWord("tin"), choices: ["fin", "bin", "tin"] },
    { id: "short-i-spell-dig", kind: "spell", answer: iWord("dig"), choices: ["g", "p", "d", "i"] },
    { id: "short-i-listen-fit", kind: "listen", answer: iWord("fit"), choices: ["kit", "fit", "hit"] },
    { id: "short-i-spell-bin", kind: "spell", answer: iWord("bin"), choices: ["n", "b", "i", "t"] },
  ],
  sentences: [
    {
      "id": "short-i-sentence-1",
      "audioKey": "sentence-1",
      "text": "The pig is big.",
      "translation": "這隻豬很大。",
      "supportNote": "先聽下方支援詞的片語示範，再跟讀整句；支援詞不當作本課新的拼讀考題。",
      "wordKeys": [
        "pig",
        "big"
      ],
      "supportWords": [
        {
          "word": "the",
          "meaning": "這個／那個；聽片語中的弱讀。",
          "audioKey": "support-the-pig",
          "text": "the pig"
        },
        {
          "word": "is",
          "meaning": "是；英語用 is 連接主詞與形容詞。",
          "audioKey": "support-is-big",
          "text": "is big"
        }
      ]
    },
    {
      "id": "short-i-sentence-2",
      "audioKey": "sentence-2",
      "text": "The pig can sit.",
      "translation": "這隻豬會坐下。",
      "supportNote": "先聽下方支援詞的片語示範，再跟讀整句；支援詞不當作本課新的拼讀考題。",
      "wordKeys": [
        "pig",
        "sit"
      ],
      "supportWords": [
        {
          "word": "the",
          "meaning": "這個／那個；聽片語中的弱讀。",
          "audioKey": "support-the-pig",
          "text": "the pig"
        },
        {
          "word": "can",
          "meaning": "能夠；這裡不是短 a 課的「罐子」，句中可弱讀。",
          "audioKey": "support-can-sit",
          "text": "can sit"
        }
      ]
    }
  ],
};

export const shortOFamilies: PhonicsFamily[] = [
  cvcFamily("o", "op", "/ɑp/", [
    ["hop", "單腳跳", ["h", "ɑ", "p"]],
    ["mop", "拖把", ["m", "ɑ", "p"]],
    ["top", "頂端", ["t", "ɑ", "p"]],
    ["pop", "發出啵的一聲", ["p", "ɑ", "p"]],
  ]),
  cvcFamily("o", "ot", "/ɑt/", [
    ["pot", "鍋子", ["p", "ɑ", "t"]],
    ["hot", "熱的", ["h", "ɑ", "t"]],
    ["dot", "小圓點", ["d", "ɑ", "t"]],
    ["cot", "簡易床", ["k", "ɑ", "t"]],
  ]),
];
const oWord = (text: string) => lessonWord(shortOFamilies, text);
export const shortOLesson: PhonicsLesson = {
  id: "short-o",
  vowel: "o",
  sound: "/ɑ/",
  title: "短母音 o",
  description: "從 -op、-ot 字族，聽辨並拼讀短母音 o。",
  introductionText: "先聽完整單字，留意 o 的 /ɑ/，再試著把每個聲音從左到右連起來讀。",
  pronunciationNote: "本課採美式短 o /ɑ/；英式常見 /ɒ/。不把兩種口音的音值當成同一錄音，也不混入 dog 等口音差異較大的詞。",
  spellingLabel: "o",
  prerequisites: ["沿用前三課的單字母子音與 CVC 拼合；o 的新聲音先從整字聽辨。"],
  families: shortOFamilies,
  introductionWords: [oWord("hop"), oWord("top"), oWord("pot")],
  questions: [
    { id: "short-o-listen-hop", kind: "listen", answer: oWord("hop"), choices: ["mop", "hop", "pop"] },
    { id: "short-o-spell-pot", kind: "spell", answer: oWord("pot"), choices: ["t", "m", "o", "p"] },
    { id: "short-o-listen-hot", kind: "listen", answer: oWord("hot"), choices: ["hot", "pot", "dot"] },
    { id: "short-o-spell-mop", kind: "spell", answer: oWord("mop"), choices: ["p", "o", "t", "m"] },
    { id: "short-o-listen-top", kind: "listen", answer: oWord("top"), choices: ["hop", "pop", "top"] },
    { id: "short-o-spell-dot", kind: "spell", answer: oWord("dot"), choices: ["o", "p", "t", "d"] },
    { id: "short-o-listen-cot", kind: "listen", answer: oWord("cot"), choices: ["pot", "cot", "hot"] },
    { id: "short-o-spell-pop", kind: "spell", answer: oWord("pop"), choices: ["p", "t", "o", "p"] },
  ],
  sentences: [
    {
      "id": "short-o-sentence-1",
      "audioKey": "sentence-1",
      "text": "The pot is hot.",
      "translation": "這個鍋子很燙。",
      "supportNote": "先聽下方支援詞的片語示範，再跟讀整句；支援詞不當作本課新的拼讀考題。",
      "wordKeys": [
        "pot",
        "hot"
      ],
      "supportWords": [
        {
          "word": "the",
          "meaning": "這個／那個；聽片語中的弱讀。",
          "audioKey": "support-the-pot",
          "text": "the pot"
        },
        {
          "word": "is",
          "meaning": "是；英語用 is 連接主詞與形容詞。",
          "audioKey": "support-is-hot",
          "text": "is hot"
        }
      ]
    },
    {
      "id": "short-o-sentence-2",
      "audioKey": "sentence-2",
      "text": "Hop to the top.",
      "translation": "單腳跳到頂端。",
      "supportNote": "先聽下方支援詞的片語示範，再跟讀整句；支援詞不當作本課新的拼讀考題。",
      "wordKeys": [
        "hop",
        "top"
      ],
      "supportWords": [
        {
          "word": "to",
          "meaning": "到……；聽片語中的弱讀，不能當作短 o。",
          "audioKey": "support-to-the-top",
          "text": "to the top"
        },
        {
          "word": "the",
          "meaning": "這個／那個；聽片語中的弱讀。",
          "audioKey": "support-the-top",
          "text": "the top"
        }
      ]
    }
  ],
};

export const shortUFamilies: PhonicsFamily[] = [
  cvcFamily("u", "ug", "/ʌɡ/", [
    ["bug", "小蟲", ["b", "ʌ", "ɡ"]],
    ["rug", "小地毯", ["r", "ʌ", "ɡ"]],
    ["mug", "馬克杯", ["m", "ʌ", "ɡ"]],
    ["hug", "擁抱", ["h", "ʌ", "ɡ"]],
  ]),
  cvcFamily("u", "un", "/ʌn/", [
    ["sun", "太陽", ["s", "ʌ", "n"]],
    ["run", "跑", ["r", "ʌ", "n"]],
    ["fun", "樂趣", ["f", "ʌ", "n"]],
    ["bun", "小圓麵包", ["b", "ʌ", "n"]],
  ]),
  cvcFamily("u", "ut", "/ʌt/", [
    ["nut", "堅果", ["n", "ʌ", "t"]],
    ["cut", "切", ["k", "ʌ", "t"]],
    ["hut", "小屋", ["h", "ʌ", "t"]],
  ]),
];
const uWord = (text: string) => lessonWord(shortUFamilies, text);
export const shortULesson: PhonicsLesson = {
  id: "short-u",
  vowel: "u",
  sound: "/ʌ/",
  title: "短母音 u",
  description: "從 -ug、-un、-ut 字族，聽辨並拼讀短母音 u。",
  introductionText: "先聽完整單字，留意 u 的 /ʌ/，再試著把每個聲音從左到右連起來讀。",
  pronunciationNote: "本課 u 讀 /ʌ/，不讀字母名稱 /juː/。不把 put 或 bush 的 /ʊ/ 混入本課。",
  spellingLabel: "u",
  prerequisites: ["沿用前四課的單字母子音與逐音拼合；u 的新聲音先從整字聽辨。"],
  families: shortUFamilies,
  introductionWords: [uWord("bug"), uWord("sun"), uWord("nut")],
  questions: [
    { id: "short-u-listen-rug", kind: "listen", answer: uWord("rug"), choices: ["bug", "rug", "mug"] },
    { id: "short-u-spell-sun", kind: "spell", answer: uWord("sun"), choices: ["n", "t", "u", "s"] },
    { id: "short-u-listen-cut", kind: "listen", answer: uWord("cut"), choices: ["cut", "nut", "hut"] },
    { id: "short-u-spell-bug", kind: "spell", answer: uWord("bug"), choices: ["g", "u", "r", "b"] },
    { id: "short-u-listen-bun", kind: "listen", answer: uWord("bun"), choices: ["sun", "run", "bun"] },
    { id: "short-u-spell-nut", kind: "spell", answer: uWord("nut"), choices: ["t", "h", "n", "u"] },
    { id: "short-u-listen-hug", kind: "listen", answer: uWord("hug"), choices: ["mug", "hug", "bug"] },
    { id: "short-u-spell-run", kind: "spell", answer: uWord("run"), choices: ["u", "b", "n", "r"] },
  ],
  sentences: [
    {
      "id": "short-u-sentence-1",
      "audioKey": "sentence-1",
      "text": "Run in the sun.",
      "translation": "在陽光下跑步。",
      "supportNote": "先聽下方支援詞的片語示範，再跟讀整句；支援詞不當作本課新的拼讀考題。",
      "wordKeys": [
        "run",
        "sun"
      ],
      "supportWords": [
        {
          "word": "in",
          "meaning": "在……裡／之中；這裡指在陽光下。",
          "audioKey": "support-in-the-sun",
          "text": "in the sun"
        },
        {
          "word": "the",
          "meaning": "這個／那個；聽片語中的弱讀。",
          "audioKey": "support-the-sun",
          "text": "the sun"
        }
      ]
    },
    {
      "id": "short-u-sentence-2",
      "audioKey": "sentence-2",
      "text": "The bug is on the rug.",
      "translation": "小蟲在小地毯上。",
      "supportNote": "先聽下方支援詞的片語示範，再跟讀整句；支援詞不當作本課新的拼讀考題。",
      "wordKeys": [
        "bug",
        "rug"
      ],
      "supportWords": [
        {
          "word": "the",
          "meaning": "這個／那個；聽片語中的弱讀。",
          "audioKey": "support-the-bug",
          "text": "the bug"
        },
        {
          "word": "is",
          "meaning": "是／在；句中讀 /ɪz/，不是短 u 示範。",
          "audioKey": "support-is-on-the-rug",
          "text": "is on the rug"
        },
        {
          "word": "on",
          "meaning": "在……上面；先聽片語示範。",
          "audioKey": "support-on-the-rug",
          "text": "on the rug"
        }
      ]
    }
  ],
};

export const phonicsLessons: PhonicsLesson[] = [shortALesson, shortELesson, shortILesson, shortOLesson, shortULesson, ...longVowelLessons, ...blendLessons, ...digraphLessons, ...rControlledLessons, ...inflectedLessons];
export const getPhonicsLesson = (id: string) => phonicsLessons.find((lesson) => lesson.id === id);
export const lessonWords = (lesson: PhonicsLesson) => lesson.families.flatMap(({ words }) => words);
