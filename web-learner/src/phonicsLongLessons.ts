import type { PhonicsFamily, PhonicsLesson, PhonicsQuestion, PhonicsSentence, PhonicsWord } from "./phonicsLesson";

/** 長母音教材：字形位置與音素結構分開，不能由字母數推論 C/V。 */
type Entry = [word: string, meaning: string, structure: string, phonemes: string[]];
function family(vowel: string, spelling: string, suffix: string, rime: string, description: string, entries: Entry[], variant = ""): PhonicsFamily {
  const id = `long-${vowel}-${spelling}-${suffix}${variant ? `-${variant}` : ""}`;
  return {
    id, spelling, label: `-${suffix}${variant ? `（/${variant === "ju" ? "juː" : "uː"}/）` : ""}`, rime, description,
    words: entries.map(([word, meaning, structure, phonemes]): PhonicsWord => {
      const split = spelling.includes("_");
      const start = word.indexOf(spelling[0]);
      const end = split ? start + 1 : start + spelling.length;
      const targetRanges = split ? [{ start, end }, { start: word.length - 1, end: word.length }] : [{ start, end }];
      const graphemes = [
        ...Array.from(word.slice(0, start), (text, index) => ({ text, kind: "consonant" as const, ranges: [{ start: index, end: index + 1 }] })),
        { text: spelling, kind: "vowel" as const, ranges: targetRanges },
        ...Array.from(word.slice(end, split ? -1 : undefined), (text, index) => ({ text, kind: "consonant" as const, ranges: [{ start: end + index, end: end + index + 1 }] })),
      ];
      return { word, meaning, familyId: id, structure, phonemes, graphemes, targetRanges,
        spellingUnits: split ? Array.from(word) : graphemes.map(({ text }) => text) };
    }),
  };
}
function lookup(families: PhonicsFamily[], text: string): PhonicsWord {
  const found = families.flatMap(({ words }) => words).find(({ word }) => word === text);
  if (!found) throw new Error(`長母音教材缺少單字：${text}`);
  return found;
}
function questions(id: string, families: PhonicsFamily[], specs: ["listen" | "spell", string, string[]][]): PhonicsQuestion[] {
  return specs.map(([kind, answer, choices], index) => ({ id: `${id}-${index + 1}-${kind}`, kind, answer: lookup(families, answer), choices }));
}
const support = (word: string, meaning: string, text: string, audioKey: string) => ({ word, meaning, text, audioKey });
const note = "先聽支援詞片語，再跟讀整句；冠詞與常用詞不當成本課新規則的解碼考核。";
const aFamilies = [
  family("a", "a_e", "ake", "/eɪk/", "a 與字尾 e 一起表示 /eɪ/，中間 k 仍讀 /k/；字尾 e 不另外發音。", [
    ["cake", "蛋糕", "CVC", ["k", "eɪ", "k"]], ["make", "製作", "CVC", ["m", "eɪ", "k"]], ["lake", "湖", "CVC", ["l", "eɪ", "k"]],
  ]),
  family("a", "a_e", "ame", "/eɪm/", "沿用 a_e 的 /eɪ/，這次字尾子音是 /m/。", [
    ["name", "名字", "CVC", ["n", "eɪ", "m"]], ["game", "遊戲", "CVC", ["ɡ", "eɪ", "m"]], ["same", "相同的", "CVC", ["s", "eɪ", "m"]],
  ]),
  family("a", "ai", "ain", "/eɪn/", "新拼法 ai：兩字母一起讀 /eɪ/；train 先把 /t/、/r/ 接起來。", [
    ["rain", "雨", "CVC", ["r", "eɪ", "n"]], ["pain", "疼痛", "CVC", ["p", "eɪ", "n"]], ["train", "火車", "CCVC", ["t", "r", "eɪ", "n"]],
  ]),
  family("a", "ay", "ay", "/eɪ/", "新拼法 ay：本組在字尾讀 /eɪ/；play 的 /p/、/l/ 都要讀出。", [
    ["day", "一天；白天", "CV", ["d", "eɪ"]], ["say", "說", "CV", ["s", "eɪ"]], ["play", "玩；演奏", "CCV", ["p", "l", "eɪ"]],
  ]),
];
const eFamilies = [
  family("e", "ee", "ee", "/iː/", "ee 兩字母表示一個 /iː/；tree 的 /t/、/r/ 要逐音拼合。", [
    ["see", "看見", "CV", ["s", "iː"]], ["bee", "蜜蜂", "CV", ["b", "iː"]], ["tree", "樹", "CCV", ["t", "r", "iː"]],
  ]),
  family("e", "ee", "eed", "/iːd/", "沿用 ee，再接上字尾 /d/；不是把兩個 e 各讀一次。", [
    ["seed", "種子", "CVC", ["s", "iː", "d"]], ["feed", "餵食", "CVC", ["f", "iː", "d"]], ["need", "需要", "CVC", ["n", "iː", "d"]],
  ]),
  family("e", "ea", "eat", "/iːt/", "新拼法 ea：本組一起讀 /iː/，最後接 /t/；不把 bread、head 混入。", [
    ["meat", "肉", "CVC", ["m", "iː", "t"]], ["seat", "座位", "CVC", ["s", "iː", "t"]], ["heat", "熱；熱度", "CVC", ["h", "iː", "t"]],
  ]),
  family("e", "ea", "eam", "/iːm/", "沿用 ea 的 /iː/，字尾改成 /m/；dream 保留 /d/、/r/ 兩音。", [
    ["team", "隊伍", "CVC", ["t", "iː", "m"]], ["beam", "光束", "CVC", ["b", "iː", "m"]], ["dream", "夢", "CCVC", ["d", "r", "iː", "m"]],
  ]),
];
const iFamilies = [
  family("i", "i_e", "ike", "/aɪk/", "i 與字尾 e 一起表示 /aɪ/；中間 k 讀 /k/，e 不另發音。", [
    ["bike", "腳踏車", "CVC", ["b", "aɪ", "k"]], ["like", "喜歡", "CVC", ["l", "aɪ", "k"]], ["hike", "健行", "CVC", ["h", "aɪ", "k"]],
  ]),
  family("i", "i_e", "ide", "/aɪd/", "沿用 i_e，最後接 /d/；與 -ike 比較字尾聲音。", [
    ["ride", "騎乘", "CVC", ["r", "aɪ", "d"]], ["hide", "躲藏", "CVC", ["h", "aɪ", "d"]], ["wide", "寬的", "CVC", ["w", "aɪ", "d"]],
  ]),
  family("i", "igh", "igh", "/aɪ/", "新拼法 igh：三個字母一起表示 /aɪ/，不另外讀 g 或 h。", [
    ["high", "高的", "CV", ["h", "aɪ"]], ["sigh", "嘆氣", "CV", ["s", "aɪ"]],
  ]),
  family("i", "igh", "ight", "/aɪt/", "沿用 igh 的 /aɪ/，再接上 /t/。", [
    ["light", "光；燈光", "CVC", ["l", "aɪ", "t"]], ["night", "夜晚", "CVC", ["n", "aɪ", "t"]], ["right", "右邊的；正確的", "CVC", ["r", "aɪ", "t"]],
  ]),
];
const oFamilies = [
  family("o", "o_e", "ope", "/oʊp/", "o 與字尾 e 一起表示美式 /oʊ/；中間 p 仍讀 /p/。", [
    ["hope", "希望", "CVC", ["h", "oʊ", "p"]], ["rope", "繩子", "CVC", ["r", "oʊ", "p"]],
  ]),
  family("o", "o_e", "one", "/oʊn/", "沿用 o_e，最後是 /n/；one、done 不符合本組讀音。", [
    ["bone", "骨頭", "CVC", ["b", "oʊ", "n"]], ["cone", "圓錐體", "CVC", ["k", "oʊ", "n"]], ["stone", "石頭", "CCVC", ["s", "t", "oʊ", "n"]],
  ]),
  family("o", "oa", "oat", "/oʊt/", "新拼法 oa：兩字母一起讀 /oʊ/，再接字尾 /t/。", [
    ["boat", "小船", "CVC", ["b", "oʊ", "t"]], ["coat", "外套", "CVC", ["k", "oʊ", "t"]], ["goat", "山羊", "CVC", ["ɡ", "oʊ", "t"]],
  ]),
  family("o", "ow", "ow", "/oʊ/", "新拼法 ow：本組在字尾讀 /oʊ/；cow、how 的 /aʊ/ 不在本課。", [
    ["low", "低的", "CV", ["l", "oʊ"]], ["slow", "慢的", "CCV", ["s", "l", "oʊ"]], ["snow", "雪", "CCV", ["s", "n", "oʊ"]], ["grow", "生長", "CCV", ["ɡ", "r", "oʊ"]],
  ]),
];
const uFamilies = [
  family("u", "u_e", "ute", "/juːt/", "u_e 在 cute、mute 表示 /j/ 接 /uː/；/j/ 是子音，所以有四個音素。", [
    ["cute", "可愛的", "CCVC", ["k", "j", "uː", "t"]], ["mute", "靜音；使安靜", "CCVC", ["m", "j", "uː", "t"]],
  ], "ju"),
  family("u", "u_e", "ube", "/juːb/", "cube 保留 /k/、/j/、/uː/、/b/ 四音；不因字形只有 u 就省略 /j/。", [
    ["cube", "立方體", "CCVC", ["k", "j", "uː", "b"]],
  ], "ju"),
  family("u", "u_e", "ube", "/uːb/", "美式 tube 讀 /t/、/uː/、/b/，沒有 /j/；與 cube 分開比較。", [
    ["tube", "管子", "CVC", ["t", "uː", "b"]],
  ], "u"),
  family("u", "u_e", "une", "/uːn/", "本課採美式 tune /tuːn/、dune /duːn/；英式可能保留 /j/，本課不混用。", [
    ["tune", "曲調", "CVC", ["t", "uː", "n"]], ["dune", "沙丘", "CVC", ["d", "uː", "n"]],
  ], "u"),
  family("u", "u_e", "ude", "/uːd/", "rude 的 u_e 讀 /uː/；以熟悉單字比較，不為湊詞加入較難詞。", [
    ["rude", "沒禮貌的", "CVC", ["r", "uː", "d"]],
  ], "u"),
  family("u", "u_e", "ute", "/uːt/", "flute 的 u_e 讀 /uː/；與 cute、mute 的 /juː/ 分族，/f/、/l/ 都要讀出。", [
    ["flute", "長笛", "CCVC", ["f", "l", "uː", "t"]],
  ], "u"),
];
function sentence(id: string, number: number, text: string, translation: string, wordKeys: string[], supportWords: NonNullable<PhonicsSentence["supportWords"]>): PhonicsSentence {
  return { id: `${id}-sentence-${number}`, audioKey: `sentence-${number}`, text, translation, wordKeys, supportNote: note, supportWords };
}

export const longVowelLessons: PhonicsLesson[] = [
  {
    id: "long-a", vowel: "a", sound: "/eɪ/", title: "長母音 A",
    description: "先學 a_e，再比較 ai、ay，從四個字族拼讀長 A。",
    introductionText: "聽 cake、rain、day 的完整單字，留意相同的 /eɪ/。先在各拼法中逐音拼合，再做混合練習。",
    pronunciationNote: "a_e 的 a 與 e 相隔一個子音；ai、ay 是相連字形。都不拆成兩個母音讀。冠詞 a 常弱讀，另聽片語。",
    spellingLabel: "a_e → ai → ay",
    prerequisites: ["先熟悉五短母音與基本單字母子音。", "train 的 tr、play 的 pl 各保留兩個子音；先聽整字並逐音接讀。"],
    families: aFamilies, introductionWords: [lookup(aFamilies, "cake"), lookup(aFamilies, "rain"), lookup(aFamilies, "day")],
    questions: questions("long-a", aFamilies, [
      ["listen", "cake", ["lake", "cake", "make"]], ["spell", "name", ["m", "a", "e", "n", "k"]],
      ["listen", "rain", ["rain", "pain", "train"]], ["spell", "day", ["ay", "s", "d", "m"]],
      ["listen", "game", ["same", "name", "game"]], ["spell", "train", ["n", "ai", "r", "p", "t"]],
      ["listen", "play", ["day", "play", "say"]], ["spell", "cake", ["e", "c", "a", "k", "m"]],
    ]),
    sentences: [
      sentence("long-a", 1, "Make a cake.", "做一個蛋糕。", ["make", "cake"], [support("a", "一個；冠詞常弱讀，不當作長 A。", "a cake", "support-a-cake")]),
      sentence("long-a", 2, "The train is late.", "火車誤點了。", ["train"], [support("the", "這個／那個；冠詞常弱讀。", "the train", "support-the-train"), support("is late", "遲到了；late 的 a_e 也讀 /eɪ/，本課先聽示範。", "is late", "support-is-late")]),
    ],
  },
  {
    id: "long-e", vowel: "e", sound: "/iː/", title: "長母音 E",
    description: "先學 ee，再學 ea，從四個字族拼讀長 E。",
    introductionText: "聽 see、seed、meat 的完整單字，留意 /iː/；ee、ea 在本課都一起表示這個聲音。",
    pronunciationNote: "ee、ea 不逐字母拆讀。本課 ea 讀 /iː/，不推論所有 ea 都同音；head、bread 不在本課。",
    spellingLabel: "ee → ea",
    prerequisites: ["沿用長 A 的多字母字形概念與基本子音。", "tree 的 tr、dream 的 dr 各保留兩個子音，先聽整字再逐音拼合。"],
    families: eFamilies, introductionWords: [lookup(eFamilies, "see"), lookup(eFamilies, "seed"), lookup(eFamilies, "meat")],
    questions: questions("long-e", eFamilies, [
      ["listen", "bee", ["see", "bee", "tree"]], ["spell", "seed", ["d", "ee", "s", "t"]],
      ["listen", "seat", ["seat", "meat", "heat"]], ["spell", "tree", ["r", "ee", "s", "t"]],
      ["listen", "need", ["feed", "seed", "need"]], ["spell", "team", ["m", "ea", "t", "b"]],
      ["listen", "dream", ["beam", "dream", "team"]], ["spell", "see", ["ee", "b", "s", "t"]],
    ]),
    sentences: [
      sentence("long-e", 1, "I see a bee.", "我看見一隻蜜蜂。", ["see", "bee"], [support("I", "我；先聽完整片語，不在本課考核長 I。", "I see", "support-i-see"), support("a", "一隻；冠詞常弱讀。", "a bee", "support-a-bee")]),
      sentence("long-e", 2, "The seed is in the sun.", "種子在陽光下。", ["seed"], [support("the", "這個／那個；先聽冠詞。", "the seed", "support-the-seed"), support("is in the sun", "在陽光下；in、sun 可複習短母音，is、the 先聽片語。", "is in the sun", "support-is-in-the-sun")]),
    ],
  },
  {
    id: "long-i", vowel: "i", sound: "/aɪ/", title: "長母音 I",
    description: "先學 i_e，再學 igh，從四個字族拼讀長 I。",
    introductionText: "聽 bike、high、light 的完整單字，留意 /aɪ/；先比較 i_e，再認識 igh。",
    pronunciationNote: "i_e 的 e 不另發音；igh 三個字母合起來讀 /aɪ/，g、h 不另外拼讀。",
    spellingLabel: "i_e → igh",
    prerequisites: ["沿用長 A 的不連續母音字形概念，以及前課的多字母字形。", "本課只有基本單子音，先確認 /w/、/r/、/h/ 的字音。"],
    families: iFamilies, introductionWords: [lookup(iFamilies, "bike"), lookup(iFamilies, "high"), lookup(iFamilies, "light")],
    questions: questions("long-i", iFamilies, [
      ["listen", "bike", ["hike", "bike", "like"]], ["spell", "ride", ["d", "i", "e", "r", "h"]],
      ["listen", "high", ["high", "sigh", "hide"]], ["spell", "night", ["t", "igh", "l", "n"]],
      ["listen", "wide", ["hide", "ride", "wide"]], ["spell", "light", ["igh", "r", "t", "l"]],
      ["listen", "right", ["night", "right", "light"]], ["spell", "bike", ["e", "b", "i", "k", "r"]],
    ]),
    sentences: [
      sentence("long-i", 1, "I like the bike.", "我喜歡這輛腳踏車。", ["like", "bike"], [support("I", "我；固定大寫，先聽片語。", "I like", "support-i-like"), support("the", "這個／那個；冠詞常弱讀。", "the bike", "support-the-bike")]),
      sentence("long-i", 2, "The light is on at night.", "燈在夜裡亮著。", ["light", "night"], [support("the", "這個／那個；冠詞常弱讀。", "the light", "support-the-light"), support("is on", "開著／亮著；先聽片語。", "is on", "support-is-on"), support("at", "在……時；本句 at night 指在夜裡。", "at night", "support-at-night")]),
    ],
  },
  {
    id: "long-o", vowel: "o", sound: "/oʊ/", title: "長母音 O",
    description: "先學 o_e，再比較 oa、ow，從四個字族拼讀長 O。",
    introductionText: "聽 hope、boat、snow 的完整單字，留意美式 /oʊ/；三種拼法分組學習後再比較。",
    pronunciationNote: "本課採美式 /oʊ/。o_e 的 e 不另發音；ow 在 snow、grow 讀 /oʊ/，cow 的 /aʊ/ 另課處理。",
    spellingLabel: "o_e → oa → ow",
    prerequisites: ["沿用長 A、I 的不連續字形與長 E 的相連母音字形。", "stone、slow、snow、grow 各保留兩個字首子音；先逐音接讀。"],
    families: oFamilies, introductionWords: [lookup(oFamilies, "hope"), lookup(oFamilies, "boat"), lookup(oFamilies, "snow")],
    questions: questions("long-o", oFamilies, [
      ["listen", "rope", ["hope", "rope", "bone"]], ["spell", "boat", ["t", "oa", "b", "g"]],
      ["listen", "cone", ["cone", "bone", "stone"]], ["spell", "snow", ["ow", "n", "s", "l"]],
      ["listen", "goat", ["boat", "coat", "goat"]], ["spell", "hope", ["e", "o", "p", "h", "r"]],
      ["listen", "grow", ["slow", "grow", "snow"]], ["spell", "stone", ["n", "s", "e", "o", "t", "r"]],
    ]),
    sentences: [
      sentence("long-o", 1, "The goat is in the boat.", "山羊在小船裡。", ["goat", "boat"], [support("the", "這個／那個；冠詞常弱讀。", "the goat", "support-the-goat"), support("is in", "在……裡面；先聽完整片語。", "is in the boat", "support-is-in-the-boat")]),
      sentence("long-o", 2, "The boat is slow.", "這艘小船很慢。", ["boat", "slow"], [support("the", "這個／那個；冠詞常弱讀。", "the boat", "support-the-boat"), support("is", "是；在本句連接主詞和形容詞。", "is slow", "support-is-slow")]),
    ],
  },
  {
    id: "long-u", vowel: "u", sound: "/juː/、/uː/", title: "長母音 U",
    description: "同是 u_e，分清 cute 的 /juː/ 與美式 tube 的 /uː/。",
    introductionText: "聽 cute、cube、tube 的完整單字。cute、cube 有 /j/ 接 /uː/；本課美式 tube 只有 /uː/。先分組學，再比較。",
    pronunciationNote: "長 U 在本課分兩種讀法。/juː/ 含子音 /j/，不是單一母音；cute、cube 標 CCVC。美式 tube、tune 不加 /j/，標 CVC。",
    spellingLabel: "u_e：/juː/ → /uː/",
    prerequisites: ["先熟悉長 A、I、O 的不連續母音字形。", "新增 /j/ 滑音：由 cute、cube 的整詞示範聽辨，再與 tube 比較。", "flute 字首保留 /f/、/l/ 兩個子音；dune 沙丘先看詞義並聽整詞。"],
    families: uFamilies, introductionWords: [lookup(uFamilies, "cute"), lookup(uFamilies, "cube"), lookup(uFamilies, "tube")],
    questions: questions("long-u", uFamilies, [
      ["listen", "cute", ["mute", "cute", "flute"]], ["spell", "cube", ["e", "u", "c", "b", "t"]],
      ["listen", "tube", ["tube", "cube", "tune"]], ["spell", "tune", ["e", "n", "t", "u", "d"]],
      ["listen", "rude", ["tube", "dune", "rude"]], ["spell", "flute", ["e", "l", "u", "f", "t", "r"]],
      ["listen", "mute", ["rude", "mute", "cute"]], ["spell", "cute", ["e", "c", "u", "t", "m"]],
    ]),
    sentences: [
      sentence("long-u", 1, "The cube is red.", "這個立方體是紅色的。", ["cube"], [support("the", "這個／那個；冠詞常弱讀。", "the cube", "support-the-cube"), support("is red", "是紅色的；red 可複習短 E，is 先聽片語。", "is red", "support-is-red")]),
      sentence("long-u", 2, "Play a tune on the flute.", "用長笛演奏一段曲調。", ["tune", "flute"], [support("play", "演奏；複習長 A 的 ay，先聽片語。", "play a tune", "support-play-a-tune"), support("a", "一段；冠詞常弱讀。", "a tune", "support-a-tune"), support("on the", "用這件樂器演奏；先聽片語中的冠詞。", "on the flute", "support-on-the-flute")]),
    ],
  },
];
