import type { PhonicsFamily, PhonicsLesson, PhonicsQuestion, PhonicsSentence, PhonicsWord } from "./phonicsLesson";

/** 第三章按字首／字尾連音分組；family 欄位沿用容器契約，不表示共同韻尾。 */
type Entry = [word: string, meaning: string, structure: string, phonemes: string[], units: string[]];
function group(lessonId: string, spelling: string, position: "initial" | "final", sound: string, entries: Entry[]): PhonicsFamily {
  const id = `${lessonId}-${spelling}`;
  return {
    id, spelling, label: position === "initial" ? `${spelling}-` : `-${spelling}`, rime: sound,
    description: `${position === "initial" ? "字首" : "字尾"} ${spelling} 的各個子音依序接讀；這是連音組，不是共同韻尾字族。`,
    words: entries.map(([word, meaning, structure, phonemes, units]): PhonicsWord => {
      let cursor = 0;
      const graphemes = units.map((text) => {
        const split = text.includes("_");
        const start = cursor;
        cursor += split ? 1 : text.length;
        return {
          text, kind: /[aeiou]/u.test(text) ? "vowel" as const : "consonant" as const,
          ranges: split ? [{ start, end: start + 1 }, { start: word.length - 1, end: word.length }] : [{ start, end: cursor }],
        };
      });
      const start = position === "initial" ? 0 : word.length - spelling.length;
      return { word, meaning, familyId: id, structure, phonemes, graphemes,
        targetRanges: [{ start, end: start + spelling.length }],
        spellingUnits: units.some((unit) => unit.includes("_")) ? Array.from(word) : units };
    }),
  };
}
const find = (families: PhonicsFamily[], word: string) => {
  const entry = families.flatMap(({ words }) => words).find((entry) => entry.word === word);
  if (!entry) throw new Error(`子音連音課缺少單字：${word}`);
  return entry;
};
function questions(id: string, families: PhonicsFamily[], specs: ["listen" | "spell", string, string[]][]): PhonicsQuestion[] {
  return specs.map(([kind, word, choices], index) => ({ id: `${id}-${index + 1}-${kind}`, kind, answer: find(families, word), choices }));
}
const support = (word: string, meaning: string, text: string, audioKey: string) => ({ word, meaning, text, audioKey });
function sentence(id: string, index: number, text: string, translation: string, wordKeys: string[], supportWords: PhonicsSentence["supportWords"]): PhonicsSentence {
  return { id: `${id}-sentence-${index}`, audioKey: `sentence-${index}`, text, translation, wordKeys, supportWords,
    supportNote: "先聽支援片語，再跟讀整句；冠詞、常用詞與片語中的未教讀音只做示範，不列入本課解碼考核。" };
}
const lGroups = [
  group("blends-l", "bl", "initial", "/bl/", [
    ["blade", "刀刃", "CCVC", ["b", "l", "eɪ", "d"], ["b", "l", "a_e", "d"]],
    ["blame", "責怪", "CCVC", ["b", "l", "eɪ", "m"], ["b", "l", "a_e", "m"]],
  ]),
  group("blends-l", "cl", "initial", "/kl/", [
    ["clap", "拍手", "CCVC", ["k", "l", "æ", "p"], ["c", "l", "a", "p"]],
    ["clam", "蛤蜊", "CCVC", ["k", "l", "æ", "m"], ["c", "l", "a", "m"]],
  ]),
  group("blends-l", "fl", "initial", "/fl/", [
    ["flat", "平坦的", "CCVC", ["f", "l", "æ", "t"], ["f", "l", "a", "t"]],
    ["flute", "長笛", "CCVC", ["f", "l", "uː", "t"], ["f", "l", "u_e", "t"]],
  ]),
  group("blends-l", "gl", "initial", "/ɡl/", [
    ["glad", "高興的", "CCVC", ["ɡ", "l", "æ", "d"], ["g", "l", "a", "d"]],
    ["glide", "滑行", "CCVC", ["ɡ", "l", "aɪ", "d"], ["g", "l", "i_e", "d"]],
  ]),
  group("blends-l", "pl", "initial", "/pl/", [
    ["plan", "計畫", "CCVC", ["p", "l", "æ", "n"], ["p", "l", "a", "n"]],
    ["plum", "李子", "CCVC", ["p", "l", "ʌ", "m"], ["p", "l", "u", "m"]],
  ]),
  group("blends-l", "sl", "initial", "/sl/", [
    ["slam", "砰地關上", "CCVC", ["s", "l", "æ", "m"], ["s", "l", "a", "m"]],
    ["slim", "纖細的", "CCVC", ["s", "l", "ɪ", "m"], ["s", "l", "i", "m"]],
  ]),
];
const rGroups = [
  group("blends-r", "br", "initial", "/br/", [
    ["brain", "大腦", "CCVC", ["b", "r", "eɪ", "n"], ["b", "r", "ai", "n"]],
    ["brave", "勇敢的", "CCVC", ["b", "r", "eɪ", "v"], ["b", "r", "a_e", "v"]],
  ]),
  group("blends-r", "cr", "initial", "/kr/", [
    ["crab", "螃蟹", "CCVC", ["k", "r", "æ", "b"], ["c", "r", "a", "b"]],
    ["crop", "農作物", "CCVC", ["k", "r", "ɑ", "p"], ["c", "r", "o", "p"]],
  ]),
  group("blends-r", "dr", "initial", "/dr/", [
    ["drip", "滴下", "CCVC", ["d", "r", "ɪ", "p"], ["d", "r", "i", "p"]],
    ["drum", "鼓", "CCVC", ["d", "r", "ʌ", "m"], ["d", "r", "u", "m"]],
  ]),
  group("blends-r", "fr", "initial", "/fr/", [
    ["frog", "青蛙", "CCVC", ["f", "r", "ɑ", "ɡ"], ["f", "r", "o", "g"]],
    ["free", "自由的", "CCV", ["f", "r", "iː"], ["f", "r", "ee"]],
  ]),
  group("blends-r", "gr", "initial", "/ɡr/", [
    ["grin", "咧嘴笑", "CCVC", ["ɡ", "r", "ɪ", "n"], ["g", "r", "i", "n"]],
    ["grab", "抓住", "CCVC", ["ɡ", "r", "æ", "b"], ["g", "r", "a", "b"]],
  ]),
  group("blends-r", "pr", "initial", "/pr/", [
    ["prop", "支撐物", "CCVC", ["p", "r", "ɑ", "p"], ["p", "r", "o", "p"]],
    ["pray", "祈禱", "CCV", ["p", "r", "eɪ"], ["p", "r", "ay"]],
  ]),
  group("blends-r", "tr", "initial", "/tr/", [
    ["trap", "陷阱", "CCVC", ["t", "r", "æ", "p"], ["t", "r", "a", "p"]],
    ["tree", "樹", "CCV", ["t", "r", "iː"], ["t", "r", "ee"]],
  ]),
];
const sGroups = [
  group("blends-s", "sk", "initial", "/sk/", [
    ["skip", "蹦跳；跳過", "CCVC", ["s", "k", "ɪ", "p"], ["s", "k", "i", "p"]],
    ["skin", "皮膚", "CCVC", ["s", "k", "ɪ", "n"], ["s", "k", "i", "n"]],
  ]),
  group("blends-s", "sm", "initial", "/sm/", [
    ["smog", "霧霾", "CCVC", ["s", "m", "ɑ", "ɡ"], ["s", "m", "o", "g"]],
    ["smile", "微笑", "CCVC", ["s", "m", "aɪ", "l"], ["s", "m", "i_e", "l"]],
  ]),
  group("blends-s", "sn", "initial", "/sn/", [
    ["snap", "啪地折斷", "CCVC", ["s", "n", "æ", "p"], ["s", "n", "a", "p"]],
    ["snow", "雪", "CCV", ["s", "n", "oʊ"], ["s", "n", "ow"]],
  ]),
  group("blends-s", "sp", "initial", "/sp/", [
    ["spin", "旋轉", "CCVC", ["s", "p", "ɪ", "n"], ["s", "p", "i", "n"]],
    ["spot", "地點；斑點", "CCVC", ["s", "p", "ɑ", "t"], ["s", "p", "o", "t"]],
  ]),
  group("blends-s", "st", "initial", "/st/", [
    ["stop", "停下", "CCVC", ["s", "t", "ɑ", "p"], ["s", "t", "o", "p"]],
    ["step", "一步；台階", "CCVC", ["s", "t", "ɛ", "p"], ["s", "t", "e", "p"]],
  ]),
  group("blends-s", "sw", "initial", "/sw/", [
    ["swim", "游泳", "CCVC", ["s", "w", "ɪ", "m"], ["s", "w", "i", "m"]],
    ["sweet", "甜的", "CCVC", ["s", "w", "iː", "t"], ["s", "w", "ee", "t"]],
  ]),
];
const finalGroups = [
  group("blends-final", "nd", "final", "/nd/", [
    ["hand", "手", "CVCC", ["h", "æ", "n", "d"], ["h", "a", "n", "d"]],
    ["sand", "沙", "CVCC", ["s", "æ", "n", "d"], ["s", "a", "n", "d"]],
  ]),
  group("blends-final", "nt", "final", "/nt/", [
    ["tent", "帳篷", "CVCC", ["t", "ɛ", "n", "t"], ["t", "e", "n", "t"]],
    ["ant", "螞蟻", "VCC", ["æ", "n", "t"], ["a", "n", "t"]],
  ]),
  group("blends-final", "mp", "final", "/mp/", [
    ["lamp", "檯燈", "CVCC", ["l", "æ", "m", "p"], ["l", "a", "m", "p"]],
    ["camp", "營地", "CVCC", ["k", "æ", "m", "p"], ["c", "a", "m", "p"]],
  ]),
  group("blends-final", "st", "final", "/st/", [
    ["nest", "鳥巢", "CVCC", ["n", "ɛ", "s", "t"], ["n", "e", "s", "t"]],
    ["vest", "背心", "CVCC", ["v", "ɛ", "s", "t"], ["v", "e", "s", "t"]],
  ]),
  group("blends-final", "ft", "final", "/ft/", [
    ["gift", "禮物", "CVCC", ["ɡ", "ɪ", "f", "t"], ["g", "i", "f", "t"]],
    ["left", "左邊的", "CVCC", ["l", "ɛ", "f", "t"], ["l", "e", "f", "t"]],
  ]),
];
const threeGroups = [
  group("blends-three", "scr", "initial", "/skr/", [
    ["scrap", "碎片；廢料", "CCCVC", ["s", "k", "r", "æ", "p"], ["s", "c", "r", "a", "p"]],
    ["scrub", "用力刷洗", "CCCVC", ["s", "k", "r", "ʌ", "b"], ["s", "c", "r", "u", "b"]],
  ]),
  group("blends-three", "spl", "initial", "/spl/", [
    ["split", "分開；分割", "CCCVC", ["s", "p", "l", "ɪ", "t"], ["s", "p", "l", "i", "t"]],
  ]),
  group("blends-three", "spr", "initial", "/spr/", [
    ["spray", "噴灑；噴霧", "CCCV", ["s", "p", "r", "eɪ"], ["s", "p", "r", "ay"]],
  ]),
  group("blends-three", "str", "initial", "/str/", [
    ["strap", "帶子；肩帶", "CCCVC", ["s", "t", "r", "æ", "p"], ["s", "t", "r", "a", "p"]],
    ["strip", "長條", "CCCVC", ["s", "t", "r", "ɪ", "p"], ["s", "t", "r", "i", "p"]],
  ]),
];

export const blendLessons: PhonicsLesson[] = [
  {
    id: "blends-l", vowel: "l", title: "字首 L 連音", sound: "/bl kl fl ɡl pl sl/",
    description: "將字首兩個子音接起來，依 bl、cl、fl、gl、pl、sl 分組。",
    introductionText: "聽 blade、clap、plum 的完整單字，留意字首兩個子音。從左到右接讀，不在兩音中間多加母音。",
    pronunciationNote: "連音中每個子音都保留；cl 的 c 讀 /k/。長母音沿用已學規則，flute 沿用美式 /uː/。本課只播放整字示範，不是孤立音素錄音。",
    spellingLabel: "bl → cl → fl → gl → pl → sl",
    prerequisites: ["已學五短母音、長母音 a_e／i_e／u_e 及基本單子音。", "各組是字首連音組；先聽整字，再逐音接讀。"],
    families: lGroups, introductionWords: [find(lGroups, "blade"), find(lGroups, "clap"), find(lGroups, "plum")],
    questions: questions("blends-l", lGroups, [
      ["listen", "clap", ["clam", "clap", "flat"]], ["spell", "plan", ["n", "l", "p", "a", "m"]],
      ["listen", "blade", ["blade", "blame", "glide"]], ["spell", "plum", ["m", "u", "l", "p", "a"]],
      ["listen", "slim", ["slam", "glad", "slim"]], ["spell", "flute", ["e", "l", "u", "f", "t", "a"]],
      ["listen", "glad", ["flat", "glad", "clap"]], ["spell", "clam", ["m", "a", "l", "c", "p"]],
    ]),
    sentences: [
      sentence("blends-l", 1, "I am glad.", "我很高興。", ["glad"], [support("I am", "我是／我感到；I 是常用詞，先聽片語。", "I am", "support-i-am")]),
      sentence("blends-l", 2, "Put the plum on the plate.", "把李子放到盤子上。", ["plum"], [support("put the", "把這個……放好；put 的 u 讀 /ʊ/，先聽片語，不當短 u。", "put the plum", "support-put-the-plum"), support("on the plate", "在盤子上；plate 沿用 a_e，冠詞常弱讀。", "on the plate", "support-on-the-plate")]),
    ],
  },
  {
    id: "blends-r", vowel: "r", title: "字首 R 連音", sound: "/br kr dr fr ɡr pr tr/",
    description: "依 br、cr、dr、fr、gr、pr、tr，練習兩個字首子音接讀。",
    introductionText: "聽 brain、drum、tree 的完整單字，留意字首先有一個子音，再接 /r/，中間不插入母音。",
    pronunciationNote: "本課採美式讀音。/r/ 不加額外母音；tr、dr 在自然美語中常帶近似 [tʃɹ]、[dʒɹ] 的連讀，仍保留 t／r、d／r 的拼合教學，不寫成 ch／j，也不強求機械分離。frog 示範採 /frɑɡ/，其他口音可能不同。",
    spellingLabel: "br → cr → dr → fr → gr → pr → tr",
    prerequisites: ["先完成字首 L 連音，熟悉兩子音接讀。", "沿用短母音與已學 ai／ay／ee／a_e；本課 r 在母音前，不引入 r 控制母音。"],
    families: rGroups, introductionWords: [find(rGroups, "brain"), find(rGroups, "drum"), find(rGroups, "tree")],
    questions: questions("blends-r", rGroups, [
      ["listen", "crab", ["grab", "crab", "trap"]], ["spell", "drum", ["m", "r", "u", "d", "i"]],
      ["listen", "brain", ["brain", "brave", "pray"]], ["spell", "tree", ["ee", "r", "t", "f"]],
      ["listen", "prop", ["crop", "trap", "prop"]], ["spell", "grab", ["b", "a", "r", "g", "c"]],
      ["listen", "drip", ["grin", "drip", "drum"]], ["spell", "pray", ["ay", "r", "p", "b"]],
    ]),
    sentences: [
      sentence("blends-r", 1, "The frog is in the tree.", "青蛙在樹上。", ["frog", "tree"], [support("the", "這隻／這棵；冠詞常弱讀。", "the frog", "support-the-frog"), support("is in the", "在……裡；本句 in the tree 表示在樹上，先聽片語。", "is in the tree", "support-is-in-the-tree")]),
      sentence("blends-r", 2, "Grab the drum and play.", "拿起鼓來演奏。", ["grab", "drum"], [support("the", "這個；冠詞常弱讀。", "the drum", "support-the-drum"), support("and play", "並演奏；play 複習先前的 ay。", "and play", "support-and-play")]),
    ],
  },
  {
    id: "blends-s", vowel: "s", title: "字首 S 連音", sound: "/sk sm sn sp st sw/",
    description: "從 sk、sm、sn、sp、st、sw，練習 /s/ 接下一個子音。",
    introductionText: "聽 skip、spin、swim 的完整單字。保留字首 /s/，直接接上下一個子音，不在字首加母音。",
    pronunciationNote: "sk／sp／st 的 /k p t/ 接在 /s/ 後通常不送氣；仍是原來的子音，不改寫成 /ɡ b d/。smile、snow、sweet 的母音沿用 i_e／ow／ee，並非本課新規則。",
    spellingLabel: "sk → sm → sn → sp → st → sw",
    prerequisites: ["先完成字首 L、R 連音。", "沿用短母音與長母音 i_e／ow（/oʊ/）／ee；不加入尚未教的 sh 或 r 控制母音。"],
    families: sGroups, introductionWords: [find(sGroups, "skip"), find(sGroups, "spin"), find(sGroups, "swim")],
    questions: questions("blends-s", sGroups, [
      ["listen", "skin", ["spin", "skin", "skip"]], ["spell", "swim", ["m", "i", "w", "s", "n"]],
      ["listen", "stop", ["stop", "spot", "step"]], ["spell", "spin", ["n", "p", "i", "s", "k"]],
      ["listen", "snow", ["smile", "snap", "snow"]], ["spell", "sweet", ["t", "ee", "w", "s", "n"]],
      ["listen", "spot", ["stop", "spot", "smog"]], ["spell", "smile", ["e", "l", "i", "m", "s", "n"]],
    ]),
    sentences: [
      sentence("blends-s", 1, "I can swim.", "我會游泳。", ["swim"], [support("I can", "我會；can 在片語中可能弱讀。", "I can", "support-i-can")]),
      sentence("blends-s", 2, "Stop and spin on the spot.", "停下來，並在原地旋轉。", ["stop", "spin", "spot"], [support("and", "並且；連接兩個動作，常弱讀。", "stop and spin", "support-stop-and-spin"), support("on the", "在……；on the spot 是在原地。", "on the spot", "support-on-the-spot")]),
    ],
  },
  {
    id: "blends-final", vowel: "final", title: "字尾子音連音", sound: "/nd nt mp st ft/",
    description: "把 nd、nt、mp、st、ft 的尾音完整接讀。",
    introductionText: "聽 hand、tent、gift 的完整單字，留意字尾的兩個子音，不漏音，也不在字尾加一個母音。",
    pronunciationNote: "字尾塞音可能不明顯爆破，但要保留收尾位置，不必誇張加上母音。ant 沒有字首子音，結構是 VCC；st 在 nest 是字尾，與上一課 stop 的字首位置不同。ng／ck 不當成兩個音的連音。",
    spellingLabel: "nd → nt → mp → st → ft",
    prerequisites: ["已學五短母音及基本子音。", "能從字首兩子音接讀，轉向注意字尾；本課每詞皆不需新的母音拼法。"],
    families: finalGroups, introductionWords: [find(finalGroups, "hand"), find(finalGroups, "tent"), find(finalGroups, "gift")],
    questions: questions("blends-final", finalGroups, [
      ["listen", "hand", ["sand", "hand", "camp"]], ["spell", "tent", ["t", "n", "e", "t", "d"]],
      ["listen", "nest", ["nest", "vest", "left"]], ["spell", "lamp", ["p", "m", "a", "l", "c"]],
      ["listen", "gift", ["left", "vest", "gift"]], ["spell", "sand", ["d", "n", "a", "s", "h"]],
      ["listen", "ant", ["tent", "ant", "hand"]], ["spell", "left", ["t", "f", "e", "l", "v"]],
    ]),
    sentences: [
      sentence("blends-final", 1, "The ant is on my hand.", "螞蟻在我的手上。", ["ant", "hand"], [support("the", "這隻；冠詞常弱讀。", "the ant", "support-the-ant"), support("is on my", "在我的……上面；my 先聽片語。", "is on my hand", "support-is-on-my-hand")]),
      sentence("blends-final", 2, "Put the lamp in the tent.", "把檯燈放進帳篷裡。", ["lamp", "tent"], [support("put the", "把這個……放好；put 的 u 讀 /ʊ/，先聽片語。", "put the lamp", "support-put-the-lamp"), support("in the", "在……裡面；冠詞常弱讀。", "in the tent", "support-in-the-tent")]),
    ],
  },
  {
    id: "blends-three", vowel: "three", title: "字首三子音連音", sound: "/skr spl spr str/",
    description: "把已學的兩子音連音，擴展到 scr、spl、spr、str。",
    introductionText: "聽 scrap、split、spray 的完整單字，留意字首三個子音依序接讀，三個音之間不加母音。",
    pronunciationNote: "scr 的 c 讀 /k/；三個字母各保留一個子音，不能當成 sh 那樣的一個音。str 的 tr 自然連讀沿用 R 連音說明。spray 沒有字尾子音，按音素標 CCCV。只聽完整單字，不宣稱有孤立音素錄音。",
    spellingLabel: "scr → spl → spr → str",
    prerequisites: ["先完成前三堂字首兩子音與字尾連音。", "spray 沿用長 A 的 ay；其餘用已學短母音。不以尚未教的 sh、ng、ck 或 r 控制母音當先備。"],
    families: threeGroups, introductionWords: [find(threeGroups, "scrap"), find(threeGroups, "split"), find(threeGroups, "spray")],
    questions: questions("blends-three", threeGroups, [
      ["listen", "scrap", ["strap", "scrap", "scrub"]], ["spell", "split", ["t", "i", "l", "p", "s", "r"]],
      ["listen", "spray", ["spray", "strap", "strip"]], ["spell", "scrub", ["b", "u", "r", "c", "s", "a"]],
      ["listen", "strip", ["strap", "split", "strip"]], ["spell", "spray", ["ay", "r", "p", "s", "t"]],
      ["listen", "strap", ["scrap", "strap", "strip"]], ["spell", "scrap", ["p", "a", "r", "c", "s", "u"]],
    ]),
    sentences: [
      sentence("blends-three", 1, "Cut a strip.", "剪下一條長條。", ["strip"], [support("cut a", "剪下一條；cut 用已學短 u，冠詞 a 常弱讀。", "cut a", "support-cut-a")]),
      sentence("blends-three", 2, "Spray the tub and scrub.", "朝浴缸噴灑清潔噴霧，再用力刷洗。", ["spray", "scrub"], [support("the tub", "這個浴缸；tub 用已學短 u，冠詞常弱讀。", "the tub", "support-the-tub"), support("and", "並且；連接兩個動作，常弱讀。", "and scrub", "support-and-scrub")]),
    ],
  },
];
