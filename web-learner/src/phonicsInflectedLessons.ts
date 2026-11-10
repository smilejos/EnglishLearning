import type { PhonicsFamily, PhonicsLesson, PhonicsQuestion, PhonicsSentence, PhonicsWord } from "./phonicsLesson";

/** 字形與音素分開：x 有 /k s/，雙寫子音只有一個聲音，ng 是 /ŋ/。 */
type Entry = [word: string, base: string, meaning: string, units: string, sounds: string, note?: string];
const vowels = new Set(["æ", "ɛ", "ɪ", "ɑ", "ʌ", "iː", "eɪ", "aɪ"]);
function group(id: string, suffix: string, label: string, sound: string, description: string, entries: Entry[]): PhonicsFamily {
  return {
    id, spelling: suffix, label, rime: sound, description,
    words: entries.map(([word, baseWord, meaning, units, sounds, note]) => {
      const chunks = units.split(" ");
      // 每個 | 對應一個字形，單一字形內可含多個音素（例如 x）。
      const chunkSounds = sounds.split("|");
      const phonemes = chunkSounds.flatMap((chunk) => chunk.split(" "));
      let position = 0;
      return {
        word, meaning, familyId: id, phonemes,
        structure: phonemes.map((sound) => vowels.has(sound) ? "V" : "C").join(""),
        graphemes: chunks.map((text, index) => {
          const start = position;
          position += text.length;
          return { text, kind: vowels.has(chunkSounds[index]) ? "vowel" as const : "consonant" as const, ranges: [{ start, end: position }] };
        }),
        targetRanges: [{ start: word.length - suffix.length, end: word.length }],
        spellingUnits: chunks,
        inflection: { baseWord, suffix: `-${suffix}`, note: note ?? `在 ${baseWord} 後加 -${suffix}，保留原形的拼寫。` },
      };
    }),
  };
}
const sFamilies = [
  group("endings-s-unvoiced", "s", "-s → /s/", "/s/", "原形最後是無聲子音 /p t k f θ/ 時加 /s/；不另加母音。本組先練 /t p/。", [
    ["cats", "cat", "貓（複數）", "c a t s", "k|æ|t|s"],
    ["caps", "cap", "帽子（複數）", "c a p s", "k|æ|p|s"],
    ["maps", "map", "地圖（複數）", "m a p s", "m|æ|p|s"],
    ["cups", "cup", "杯子（複數）", "c u p s", "k|ʌ|p|s"],
  ]),
  group("endings-s-voiced", "s", "-s → /z/", "/z/", "原形最後是母音或有聲子音（咝音除外）時加 /z/；喉部振動，不多一音節。", [
    ["pigs", "pig", "豬（複數）", "p i g s", "p|ɪ|ɡ|z"],
    ["dogs", "dog", "狗（複數）", "d o g s", "d|ɑ|ɡ|z"],
    ["pens", "pen", "筆（複數）", "p e n s", "p|ɛ|n|z"],
    ["beds", "bed", "床（複數）", "b e d s", "b|ɛ|d|z"],
  ]),
];
const esFamilies = [
  group("endings-es-s-sh", "es", "-s／-sh + es", "/ɪz/", "原形以 s 或 sh 結尾，本組加 -es，讀 /ɪz/，多一音節。看的是原形最後的聲音。", [
    ["buses", "bus", "公車（複數）", "b u s e s", "b|ʌ|s|ɪ|z"],
    ["dishes", "dish", "盤子（複數）", "d i sh e s", "d|ɪ|ʃ|ɪ|z"],
    ["wishes", "wish", "願望（複數）", "w i sh e s", "w|ɪ|ʃ|ɪ|z"],
  ]),
  group("endings-es-x", "es", "-x + es", "/ɪz/", "x 在這些原形讀 /k s/；最後的 /s/ 後加 /ɪz/。x 的兩個聲音仍要保留。", [
    ["foxes", "fox", "狐狸（複數）", "f o x e s", "f|ɑ|k s|ɪ|z"],
    ["boxes", "box", "箱子（複數）", "b o x e s", "b|ɑ|k s|ɪ|z"],
  ]),
  group("endings-es-ch", "es", "-ch／-tch + es", "/ɪz/", "原形最後是 /tʃ/，拼 ch 或 tch，本組都加 -es，讀 /ɪz/。", [
    ["matches", "match", "火柴（複數）", "m a tch e s", "m|æ|tʃ|ɪ|z"],
    ["catches", "catch", "接住（第三人稱單數）", "c a tch e s", "k|æ|tʃ|ɪ|z", "catch → catches：動詞第三人稱單數也可加 -es；不是複數動詞。"],
    ["benches", "bench", "長椅（複數）", "b e n ch e s", "b|ɛ|n|tʃ|ɪ|z"],
  ]),
];
const edFamilies = [
  group("endings-ed-t", "ed", "-ed → /t/", "/t/", "原形最後是無聲子音（/t/ 除外），-ed 讀 /t/，不多一音節。", [
    ["tapped", "tap", "輕拍了（tap 的過去式）", "t a pp ed", "t|æ|p|t", "tap → tapped：單音節、單一短母音後只有一個字尾子音，雙寫 p 再加 -ed；pp 仍只讀一個 /p/。"],
    ["packed", "pack", "打包了（pack 的過去式）", "p a ck ed", "p|æ|k|t", "pack → packed：直接加 -ed；ck 已有兩個子音字母，且一起讀 /k/，不再雙寫。"],
    ["jumped", "jump", "跳了（jump 的過去式）", "j u m p ed", "dʒ|ʌ|m|p|t"],
  ]),
  group("endings-ed-d", "ed", "-ed → /d/", "/d/", "原形最後是母音或有聲子音（/d/ 除外），-ed 讀 /d/，不多一音節。", [
    ["filled", "fill", "裝滿了（fill 的過去式）", "f i ll ed", "f|ɪ|l|d", "fill → filled：原形已有 ll，直接加 -ed；ll 只讀一個 /l/。"],
    ["hummed", "hum", "哼唱了（hum 的過去式）", "h u mm ed", "h|ʌ|m|d", "hum → hummed：單音節、單一短母音後只有一個字尾子音，雙寫 m 再加 -ed；mm 只讀一個 /m/。"],
    ["played", "play", "玩了（play 的過去式）", "p l ay ed", "p|l|eɪ|d", "play → played：保留 ay 的 y，直接加 -ed；y 前是母音字母 a。"],
  ]),
  group("endings-ed-id", "ed", "-ed → /ɪd/", "/ɪd/", "原形最後是 /t/ 或 /d/，-ed 讀 /ɪd/，多一音節。部分口音近 /əd/。", [
    ["landed", "land", "降落了（land 的過去式）", "l a n d e d", "l|æ|n|d|ɪ|d"],
    ["rested", "rest", "休息了（rest 的過去式）", "r e s t e d", "r|ɛ|s|t|ɪ|d"],
    ["needed", "need", "需要了（need 的過去式）", "n ee d e d", "n|iː|d|ɪ|d"],
  ]),
];
const ingFamilies = [
  group("endings-ing-add", "ing", "直接加 -ing", "/ɪŋ/", "原形已有兩個字尾子音，直接加 -ing；i 是 /ɪ/，ng 合起來是 /ŋ/，不另讀 /ɡ/。", [
    ["jumping", "jump", "正在跳", "j u m p i ng", "dʒ|ʌ|m|p|ɪ|ŋ"],
    ["resting", "rest", "正在休息", "r e s t i ng", "r|ɛ|s|t|ɪ|ŋ"],
  ]),
  group("endings-ing-double", "ing", "雙寫後加 -ing", "/ɪŋ/", "本組單音節原形，單一短母音後只有一個字尾子音，雙寫該字母再加 -ing。不把這條套到 w、x、y。", [
    ["running", "run", "正在跑", "r u nn i ng", "r|ʌ|n|ɪ|ŋ", "run → running：雙寫 n 再加 -ing；nn 仍只有一個 /n/。"],
    ["hopping", "hop", "正在單腳跳", "h o pp i ng", "h|ɑ|p|ɪ|ŋ", "hop → hopping：雙寫 p 再加 -ing；pp 仍只有一個 /p/。留意 hop 和 hope 不同。"],
    ["sitting", "sit", "正在坐著", "s i tt i ng", "s|ɪ|t|ɪ|ŋ", "sit → sitting：雙寫 t 再加 -ing；tt 只有一個音素 /t/，自然美語中可聽到閃音。"],
  ]),
  group("endings-ing-drop-e", "ing", "去掉不發音 e", "/ɪŋ/", "make、ride 去掉字尾不發音 e，再加 -ing；原形的長母音保留。不是所有結尾 e 都要刪除，例如 see → seeing。", [
    ["making", "make", "正在製作", "m a k i ng", "m|eɪ|k|ɪ|ŋ", "make → making：去掉不發音 e 再加 -ing；a 仍讀 /eɪ/，不是短 a。"],
    ["riding", "ride", "正在騎乘", "r i d i ng", "r|aɪ|d|ɪ|ŋ", "ride → riding：去掉不發音 e 再加 -ing；前面的 i 仍讀 /aɪ/，字尾 i 讀 /ɪ/。"],
  ]),
  group("endings-ing-keep-y", "ing", "保留 y 加 -ing", "/ɪŋ/", "play 保留 y，直接加 -ing；ay 的 /eɪ/ 保留。不把 -ing 的拼法套成 -ies。", [
    ["playing", "play", "正在玩", "p l ay i ng", "p|l|eɪ|ɪ|ŋ", "play → playing：保留 y，直接加 -ing。"],
  ]),
];
function word(families: PhonicsFamily[], text: string): PhonicsWord {
  const result = families.flatMap(({ words }) => words).find(({ word }) => word === text);
  if (!result) throw new Error(`字尾教材引用不存在的詞：${text}`);
  return result;
}
/** 題目選項明列，不從未教詞庫抽取。 */
function questions(id: string, families: PhonicsFamily[], items: [string, string[]][]): PhonicsQuestion[] {
  return items.map(([text, choices], index) => ({ id: `${id}-${index + 1}`, kind: index % 2 === 0 ? "listen" : "spell", answer: word(families, text), choices }));
}
function sentence(id: string, index: number, text: string, translation: string, wordKeys: string[], supports: [string, string, string][]): PhonicsSentence {
  return { id: `${id}-sentence-${index}`, audioKey: `sentence-${index}`, text, translation, wordKeys,
    supportNote: "先聽支援片語，再跟讀整句；常用詞與弱讀不作本課新規則考核。",
    supportWords: supports.map(([word, meaning, text], i) => ({ word, meaning, text, audioKey: `support-${index}-${i + 1}` })) };
}
const prerequisites = ["已學五長短母音、基本子音、子音混合與 sh／ch／tch。", "原形與變化詞分開看；本課依最後的聲音選字尾讀法，不能只看最後一個字母。"];
export const inflectedLessons: PhonicsLesson[] = [
  {
    id: "endings-s", vowel: "s", sound: "/s/、/z/", title: "字尾 -s：兩種聲音", groupLabel: "詞組",
    description: "從複數名詞認識 -s，分辨 /s/ 和 /z/，不多加母音。",
    introductionText: "聽 cats、pigs、pens 的完整單字，留意標色的 -s。這些名詞加 -s 表示不只一個；字尾可以讀 /s/ 或 /z/。",
    pronunciationNote: "/s/ 只有氣流，/z/ 喉部振動；兩者都不多一音節。規則也適用規則動詞第三人稱單數，但不把複數名詞與單數動詞混成同一意思。咝音後的 /ɪz/ 留到下一課。",
    spellingLabel: "-s", prerequisites, families: sFamilies,
    introductionWords: [word(sFamilies, "cats"), word(sFamilies, "pigs"), word(sFamilies, "pens")],
    questions: questions("endings-s", sFamilies, [
      ["cats", ["cats", "caps", "maps"]], ["caps", ["s", "p", "a", "c", "t"]],
      ["pigs", ["pens", "pigs", "dogs"]], ["cups", ["s", "p", "u", "c", "a"]],
      ["beds", ["pens", "dogs", "beds"]], ["pens", ["s", "n", "e", "p", "a"]],
      ["maps", ["caps", "maps", "cats"]], ["dogs", ["s", "g", "o", "d", "a"]],
    ]),
    sentences: [
      sentence("endings-s", 1, "The cats nap.", "這些貓在小睡。", ["cats"], [["the", "the 常弱讀；nap 是已學短 a 詞，表示小睡。", "the cats nap"]]),
      sentence("endings-s", 2, "The pigs sit on the beds.", "這些豬坐在床上。", ["pigs", "beds"], [["the", "the 常弱讀；sit on 表示坐在……上。", "the pigs sit on the beds"]]),
    ],
  },
  {
    id: "endings-es", vowel: "es", sound: "/ɪz/", title: "字尾 -es：多一音節", groupLabel: "詞組",
    description: "原形以 s、sh、x、ch、tch 結尾，加 -es 並讀 /ɪz/。",
    introductionText: "聽 buses、boxes、matches 的完整單字。標色的 es 讀 /ɪz/，原形後多一音節；不是讀字母 e、s 的名稱。",
    pronunciationNote: "原形最後是咝音 /s z ʃ ʒ tʃ dʒ/ 時，規則字尾讀 /ɪz/（也可近 /əz/）。本課只教 s／sh／x／ch／tch 加 es；已有不發音 e 的詞常只加 s，不能把 /ɪz/ 和 es 拼法當成完全一對一。不是所有 -es 都讀 /ɪz/，如 goes；本課不考那些詞。",
    spellingLabel: "-es", prerequisites: [...prerequisites, "已學 -s 的 /s z/；x 在 box／fox 裡是一個字形、兩個音 /k s/。"], families: esFamilies,
    introductionWords: [word(esFamilies, "buses"), word(esFamilies, "boxes"), word(esFamilies, "matches")],
    questions: questions("endings-es", esFamilies, [
      ["buses", ["buses", "boxes", "benches"]], ["dishes", ["s", "e", "sh", "i", "d", "a"]],
      ["wishes", ["dishes", "wishes", "matches"]], ["foxes", ["s", "e", "x", "o", "f", "a"]],
      ["matches", ["catches", "matches", "benches"]], ["boxes", ["s", "e", "x", "o", "b", "a"]],
      ["catches", ["benches", "wishes", "catches"]], ["benches", ["s", "e", "ch", "n", "e", "b", "a"]],
    ]),
    sentences: [
      sentence("endings-es", 1, "The foxes run.", "這些狐狸在跑。", ["foxes"], [["the", "the 常弱讀；run 是已學短 u 詞。", "the foxes run"]]),
      sentence("endings-es", 2, "The dishes are in the boxes.", "這些盤子在箱子裡。", ["dishes", "boxes"], [["are", "are 表示是／在；搭配複數主詞，句中常弱讀。the 是冠詞，in 表示在……裡。", "the dishes are in the boxes"]]),
    ],
  },
  {
    id: "endings-ed", vowel: "ed", sound: "/t/、/d/、/ɪd/", title: "字尾 -ed：三種聲音", groupLabel: "詞組",
    description: "用規則動詞過去式，比較 -ed 的 /t/、/d/ 和 /ɪd/。",
    introductionText: "聽 tapped、filled、landed 的完整單字，留意相同 -ed 的三種讀音。這些詞表示過去做過的動作。",
    pronunciationNote: "先聽原形最後一個聲音：/t d/ 後加 /ɪd/；其他無聲子音後加 /t/；其他母音或有聲子音後加 /d/。只有 /ɪd/ 多一音節。不要把所有 -ed 都讀成 /ɛd/；本課不用形容詞例外或不規則過去式。",
    spellingLabel: "-ed", prerequisites: [...prerequisites, "已分辨無聲／有聲；本課另示範 tap／hum 的雙寫及 ck、ll；它們不增加子音音素。", "need 的 ee 與 play 的 ay 是已學長母音；本課只教表中規則過去式，未教 -ied 或字尾 e 只加 d 的拼字。"], families: edFamilies,
    introductionWords: [word(edFamilies, "tapped"), word(edFamilies, "filled"), word(edFamilies, "landed")],
    questions: questions("endings-ed", edFamilies, [
      ["tapped", ["tapped", "packed", "jumped"]], ["packed", ["ed", "ck", "a", "p", "e"]],
      ["filled", ["hummed", "filled", "played"]], ["hummed", ["ed", "mm", "u", "h", "a"]],
      ["landed", ["rested", "landed", "needed"]], ["rested", ["d", "e", "t", "s", "e", "r", "a"]],
      ["needed", ["landed", "needed", "played"]], ["played", ["ed", "ay", "l", "p", "a"]],
    ]),
    sentences: [
      sentence("endings-ed", 1, "The dog jumped.", "這隻狗跳了。", ["jumped"], [["the", "the 常弱讀；dog 是狗，這裡用單數。", "the dog jumped"]]),
      sentence("endings-ed", 2, "I rested and played.", "我休息了，也玩了。", ["rested", "played"], [["I", "I 讀 /aɪ/，表示我；and 表示和／也，句中常弱讀。", "I rested and played"]]),
    ],
  },
  {
    id: "endings-ing", vowel: "ing", sound: "/ɪŋ/", title: "字尾 -ing：讀音與拼字", groupLabel: "詞組",
    description: "認識 /ɪŋ/，比較直接加、雙寫、去掉 e 與保留 y。",
    introductionText: "聽 jumping、running、making 的完整單字，留意 -ing。i 讀 /ɪ/，ng 合起來讀 /ŋ/，不是 /n ɡ/。",
    pronunciationNote: "/ŋ/ 發音時舌後部抬起，氣流從鼻腔通過，不在結尾多加 /ɡ/ 或額外母音。本課用 am／is + -ing 表示正在做；-ing 也有其他用途，不是每個 -ing 詞都單獨表示現在進行。",
    spellingLabel: "-ing", prerequisites: [...prerequisites, "先完成 -ed 的雙寫示例；本課新增 ng=/ŋ/ 與雙音節拼讀。", "本課只示範單音節短母音的雙寫；多音節重音、-ie → -ying 等規則留待後續。", "make／ride 去掉不發音 e 後保留長母音；play 保留 y。自然美語 sitting 的 t 可閃音化。"], families: ingFamilies,
    introductionWords: [word(ingFamilies, "jumping"), word(ingFamilies, "running"), word(ingFamilies, "making")],
    questions: questions("endings-ing", ingFamilies, [
      ["jumping", ["jumping", "resting", "running"]], ["resting", ["ng", "i", "t", "s", "e", "r", "a"]],
      ["running", ["hopping", "running", "sitting"]], ["hopping", ["ng", "i", "pp", "o", "h", "a"]],
      ["making", ["riding", "making", "playing"]], ["sitting", ["ng", "i", "tt", "i", "s", "a"]],
      ["riding", ["playing", "jumping", "riding"]], ["playing", ["ng", "i", "ay", "l", "p", "a"]],
    ]),
    sentences: [
      sentence("endings-ing", 1, "The cat is running.", "這隻貓正在跑。", ["running"], [["is", "is + running 表示正在跑；the 常弱讀，cat 是貓。", "the cat is running"]]),
      sentence("endings-ing", 2, "I am making a map.", "我正在製作一張地圖。", ["making"], [["am", "I am + making 表示我正在製作；a 是弱讀冠詞，map 是地圖。", "I am making a map"]]),
    ],
  },
];
