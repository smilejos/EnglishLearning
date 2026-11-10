import type { PhonicsFamily, PhonicsLesson, PhonicsWord } from "./phonicsLesson";

/** 音素結構與字形數量分開；同一單詞物件供各階段重用。 */
function word(families: PhonicsFamily[], text: string): PhonicsWord {
  const found = families.flatMap(({ words }) => words).find(({ word }) => word === text);
  if (!found) throw new Error(`教材缺少單字：${text}`);
  return found;
}

const r_arFamilies: PhonicsFamily[] = [
  { "label": "-ar", "rime": "/ɑr/", "spelling": "ar", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "r-ar-ar-1", words: [
    {"word": "car", "meaning": "汽車", "structure": "CVC", "phonemes": ["k", "ɑ", "r"], "graphemes": [{"text": "c", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "ar", "kind": "vowel", "ranges": [{"start": 1, "end": 3}]}], "targetRanges": [{"start": 1, "end": 3}], "spellingUnits": ["c", "ar"], "familyId": "r-ar-ar-1"},
    {"word": "bar", "meaning": "長條；欄杆", "structure": "CVC", "phonemes": ["b", "ɑ", "r"], "graphemes": [{"text": "b", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "ar", "kind": "vowel", "ranges": [{"start": 1, "end": 3}]}], "targetRanges": [{"start": 1, "end": 3}], "spellingUnits": ["b", "ar"], "familyId": "r-ar-ar-1"},
    {"word": "far", "meaning": "遠的", "structure": "CVC", "phonemes": ["f", "ɑ", "r"], "graphemes": [{"text": "f", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "ar", "kind": "vowel", "ranges": [{"start": 1, "end": 3}]}], "targetRanges": [{"start": 1, "end": 3}], "spellingUnits": ["f", "ar"], "familyId": "r-ar-ar-1"},
    {"word": "star", "meaning": "星星", "structure": "CCVC", "phonemes": ["s", "t", "ɑ", "r"], "graphemes": [{"text": "s", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "t", "kind": "consonant", "ranges": [{"start": 1, "end": 2}]}, {"text": "ar", "kind": "vowel", "ranges": [{"start": 2, "end": 4}]}], "targetRanges": [{"start": 2, "end": 4}], "spellingUnits": ["s", "t", "ar"], "familyId": "r-ar-ar-1"},
  ] },
  { "label": "-arm", "rime": "/ɑrm/", "spelling": "ar", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "r-ar-ar-2", words: [
    {"word": "arm", "meaning": "手臂", "structure": "VCC", "phonemes": ["ɑ", "r", "m"], "graphemes": [{"text": "ar", "kind": "vowel", "ranges": [{"start": 0, "end": 2}]}, {"text": "m", "kind": "consonant", "ranges": [{"start": 2, "end": 3}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["ar", "m"], "familyId": "r-ar-ar-2"},
    {"word": "farm", "meaning": "農場", "structure": "CVCC", "phonemes": ["f", "ɑ", "r", "m"], "graphemes": [{"text": "f", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "ar", "kind": "vowel", "ranges": [{"start": 1, "end": 3}]}, {"text": "m", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 1, "end": 3}], "spellingUnits": ["f", "ar", "m"], "familyId": "r-ar-ar-2"},
  ] },
  { "label": "-ark", "rime": "/ɑrk/", "spelling": "ar", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "r-ar-ar-3", words: [
    {"word": "park", "meaning": "公園", "structure": "CVCC", "phonemes": ["p", "ɑ", "r", "k"], "graphemes": [{"text": "p", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "ar", "kind": "vowel", "ranges": [{"start": 1, "end": 3}]}, {"text": "k", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 1, "end": 3}], "spellingUnits": ["p", "ar", "k"], "familyId": "r-ar-ar-3"},
    {"word": "dark", "meaning": "黑暗的", "structure": "CVCC", "phonemes": ["d", "ɑ", "r", "k"], "graphemes": [{"text": "d", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "ar", "kind": "vowel", "ranges": [{"start": 1, "end": 3}]}, {"text": "k", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 1, "end": 3}], "spellingUnits": ["d", "ar", "k"], "familyId": "r-ar-ar-3"},
    {"word": "mark", "meaning": "記號", "structure": "CVCC", "phonemes": ["m", "ɑ", "r", "k"], "graphemes": [{"text": "m", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "ar", "kind": "vowel", "ranges": [{"start": 1, "end": 3}]}, {"text": "k", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 1, "end": 3}], "spellingUnits": ["m", "ar", "k"], "familyId": "r-ar-ar-3"},
    {"word": "shark", "meaning": "鯊魚", "structure": "CVCC", "phonemes": ["ʃ", "ɑ", "r", "k"], "graphemes": [{"text": "sh", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "ar", "kind": "vowel", "ranges": [{"start": 2, "end": 4}]}, {"text": "k", "kind": "consonant", "ranges": [{"start": 4, "end": 5}]}], "targetRanges": [{"start": 2, "end": 4}], "spellingUnits": ["sh", "ar", "k"], "familyId": "r-ar-ar-3"},
  ] },
];

const r_orFamilies: PhonicsFamily[] = [
  { "label": "-orn", "rime": "/ɔrn/", "spelling": "or", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "r-or-or-1", words: [
    {"word": "corn", "meaning": "玉米", "structure": "CVCC", "phonemes": ["k", "ɔ", "r", "n"], "graphemes": [{"text": "c", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "or", "kind": "vowel", "ranges": [{"start": 1, "end": 3}]}, {"text": "n", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 1, "end": 3}], "spellingUnits": ["c", "or", "n"], "familyId": "r-or-or-1"},
    {"word": "horn", "meaning": "角；喇叭", "structure": "CVCC", "phonemes": ["h", "ɔ", "r", "n"], "graphemes": [{"text": "h", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "or", "kind": "vowel", "ranges": [{"start": 1, "end": 3}]}, {"text": "n", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 1, "end": 3}], "spellingUnits": ["h", "or", "n"], "familyId": "r-or-or-1"},
    {"word": "born", "meaning": "出生的", "structure": "CVCC", "phonemes": ["b", "ɔ", "r", "n"], "graphemes": [{"text": "b", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "or", "kind": "vowel", "ranges": [{"start": 1, "end": 3}]}, {"text": "n", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 1, "end": 3}], "spellingUnits": ["b", "or", "n"], "familyId": "r-or-or-1"},
  ] },
  { "label": "-ork", "rime": "/ɔrk/", "spelling": "or", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "r-or-or-2", words: [
    {"word": "fork", "meaning": "叉子", "structure": "CVCC", "phonemes": ["f", "ɔ", "r", "k"], "graphemes": [{"text": "f", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "or", "kind": "vowel", "ranges": [{"start": 1, "end": 3}]}, {"text": "k", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 1, "end": 3}], "spellingUnits": ["f", "or", "k"], "familyId": "r-or-or-2"},
    {"word": "pork", "meaning": "豬肉", "structure": "CVCC", "phonemes": ["p", "ɔ", "r", "k"], "graphemes": [{"text": "p", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "or", "kind": "vowel", "ranges": [{"start": 1, "end": 3}]}, {"text": "k", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 1, "end": 3}], "spellingUnits": ["p", "or", "k"], "familyId": "r-or-or-2"},
  ] },
  { "label": "-orm", "rime": "/ɔrm/", "spelling": "or", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "r-or-or-3", words: [
    {"word": "form", "meaning": "表格；形狀", "structure": "CVCC", "phonemes": ["f", "ɔ", "r", "m"], "graphemes": [{"text": "f", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "or", "kind": "vowel", "ranges": [{"start": 1, "end": 3}]}, {"text": "m", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 1, "end": 3}], "spellingUnits": ["f", "or", "m"], "familyId": "r-or-or-3"},
    {"word": "storm", "meaning": "暴風雨", "structure": "CCVCC", "phonemes": ["s", "t", "ɔ", "r", "m"], "graphemes": [{"text": "s", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "t", "kind": "consonant", "ranges": [{"start": 1, "end": 2}]}, {"text": "or", "kind": "vowel", "ranges": [{"start": 2, "end": 4}]}, {"text": "m", "kind": "consonant", "ranges": [{"start": 4, "end": 5}]}], "targetRanges": [{"start": 2, "end": 4}], "spellingUnits": ["s", "t", "or", "m"], "familyId": "r-or-or-3"},
  ] },
  { "label": "-ort", "rime": "/ɔrt/", "spelling": "or", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "r-or-or-4", words: [
    {"word": "short", "meaning": "短的", "structure": "CVCC", "phonemes": ["ʃ", "ɔ", "r", "t"], "graphemes": [{"text": "sh", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "or", "kind": "vowel", "ranges": [{"start": 2, "end": 4}]}, {"text": "t", "kind": "consonant", "ranges": [{"start": 4, "end": 5}]}], "targetRanges": [{"start": 2, "end": 4}], "spellingUnits": ["sh", "or", "t"], "familyId": "r-or-or-4"},
    {"word": "sport", "meaning": "運動", "structure": "CCVCC", "phonemes": ["s", "p", "ɔ", "r", "t"], "graphemes": [{"text": "s", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "p", "kind": "consonant", "ranges": [{"start": 1, "end": 2}]}, {"text": "or", "kind": "vowel", "ranges": [{"start": 2, "end": 4}]}, {"text": "t", "kind": "consonant", "ranges": [{"start": 4, "end": 5}]}], "targetRanges": [{"start": 2, "end": 4}], "spellingUnits": ["s", "p", "or", "t"], "familyId": "r-or-or-4"},
  ] },
];

const r_ore_oarFamilies: PhonicsFamily[] = [
  { "label": "-ore", "rime": "/ɔr/", "spelling": "ore", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "r-ore-oar-ore-1", words: [
    {"word": "more", "meaning": "更多的", "structure": "CVC", "phonemes": ["m", "ɔ", "r"], "graphemes": [{"text": "m", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "ore", "kind": "vowel", "ranges": [{"start": 1, "end": 4}]}], "targetRanges": [{"start": 1, "end": 4}], "spellingUnits": ["m", "ore"], "familyId": "r-ore-oar-ore-1"},
    {"word": "sore", "meaning": "疼痛的", "structure": "CVC", "phonemes": ["s", "ɔ", "r"], "graphemes": [{"text": "s", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "ore", "kind": "vowel", "ranges": [{"start": 1, "end": 4}]}], "targetRanges": [{"start": 1, "end": 4}], "spellingUnits": ["s", "ore"], "familyId": "r-ore-oar-ore-1"},
    {"word": "core", "meaning": "核心；果核", "structure": "CVC", "phonemes": ["k", "ɔ", "r"], "graphemes": [{"text": "c", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "ore", "kind": "vowel", "ranges": [{"start": 1, "end": 4}]}], "targetRanges": [{"start": 1, "end": 4}], "spellingUnits": ["c", "ore"], "familyId": "r-ore-oar-ore-1"},
    {"word": "shore", "meaning": "岸邊", "structure": "CVC", "phonemes": ["ʃ", "ɔ", "r"], "graphemes": [{"text": "sh", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "ore", "kind": "vowel", "ranges": [{"start": 2, "end": 5}]}], "targetRanges": [{"start": 2, "end": 5}], "spellingUnits": ["sh", "ore"], "familyId": "r-ore-oar-ore-1"},
    {"word": "store", "meaning": "商店", "structure": "CCVC", "phonemes": ["s", "t", "ɔ", "r"], "graphemes": [{"text": "s", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "t", "kind": "consonant", "ranges": [{"start": 1, "end": 2}]}, {"text": "ore", "kind": "vowel", "ranges": [{"start": 2, "end": 5}]}], "targetRanges": [{"start": 2, "end": 5}], "spellingUnits": ["s", "t", "ore"], "familyId": "r-ore-oar-ore-1"},
  ] },
  { "label": "-oar", "rime": "/ɔr/", "spelling": "oar", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "r-ore-oar-oar-2", words: [
    {"word": "oar", "meaning": "船槳", "structure": "VC", "phonemes": ["ɔ", "r"], "graphemes": [{"text": "oar", "kind": "vowel", "ranges": [{"start": 0, "end": 3}]}], "targetRanges": [{"start": 0, "end": 3}], "spellingUnits": ["oar"], "familyId": "r-ore-oar-oar-2"},
    {"word": "roar", "meaning": "吼叫", "structure": "CVC", "phonemes": ["r", "ɔ", "r"], "graphemes": [{"text": "r", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "oar", "kind": "vowel", "ranges": [{"start": 1, "end": 4}]}], "targetRanges": [{"start": 1, "end": 4}], "spellingUnits": ["r", "oar"], "familyId": "r-ore-oar-oar-2"},
    {"word": "soar", "meaning": "高飛；翱翔", "structure": "CVC", "phonemes": ["s", "ɔ", "r"], "graphemes": [{"text": "s", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "oar", "kind": "vowel", "ranges": [{"start": 1, "end": 4}]}], "targetRanges": [{"start": 1, "end": 4}], "spellingUnits": ["s", "oar"], "familyId": "r-ore-oar-oar-2"},
  ] },
  { "label": "-oard", "rime": "/ɔrd/", "spelling": "oar", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "r-ore-oar-oar-3", words: [
    {"word": "board", "meaning": "木板", "structure": "CVCC", "phonemes": ["b", "ɔ", "r", "d"], "graphemes": [{"text": "b", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "oar", "kind": "vowel", "ranges": [{"start": 1, "end": 4}]}, {"text": "d", "kind": "consonant", "ranges": [{"start": 4, "end": 5}]}], "targetRanges": [{"start": 1, "end": 4}], "spellingUnits": ["b", "oar", "d"], "familyId": "r-ore-oar-oar-3"},
  ] },
];

export const rControlledLessons: PhonicsLesson[] = [
  {
    id: "r-ar",
    vowel: "ar",
    sound: "/ɑ/＋/r/",
    title: "R 控制母音 ar",
    description: "認識ar的美式讀音，從短詞逐步加入連綴。",
    introductionText: "聽 car、arm、park 的完整單字，留意 /ɑ/＋/r/；先看本課目標字形，再完整逐音拼合。",
    pronunciationNote: "ar整組表示/ɑ/接/r/；/r/不是省略音，結構中另算C。ar字形可對應兩個音素，不依字形塊數推算結構。",
    spellingLabel: "ar",
    prerequisites: ["已學五長短母音、第3章連綴與第4章sh/ch等子音字形。", "本章採美式捲舌讀音；/r/明列為一個子音C，字形與音素不要求一對一。"],
    families: r_arFamilies,
    introductionWords: [word(r_arFamilies, "car"), word(r_arFamilies, "arm"), word(r_arFamilies, "park")],
    questions: [
      { id: "r-ar-1-listen", kind: "listen", answer: word(r_arFamilies, "car"), choices: ["bar", "car", "far"] },
      { id: "r-ar-2-spell", kind: "spell", answer: word(r_arFamilies, "star"), choices: ["ar", "t", "s", "p"] },
      { id: "r-ar-3-listen", kind: "listen", answer: word(r_arFamilies, "farm"), choices: ["farm", "arm", "far"] },
      { id: "r-ar-4-spell", kind: "spell", answer: word(r_arFamilies, "park"), choices: ["k", "ar", "p", "n"] },
      { id: "r-ar-5-listen", kind: "listen", answer: word(r_arFamilies, "dark"), choices: ["dark", "mark", "park"] },
      { id: "r-ar-6-spell", kind: "spell", answer: word(r_arFamilies, "shark"), choices: ["k", "ar", "sh", "p"] },
      { id: "r-ar-7-listen", kind: "listen", answer: word(r_arFamilies, "arm"), choices: ["arm", "farm", "car"] },
      { id: "r-ar-8-spell", kind: "spell", answer: word(r_arFamilies, "mark"), choices: ["k", "ar", "m", "p"] },
    ],
    sentences: [
      {"text": "The car is in the park.", "translation": "汽車在公園裡。", "wordKeys": ["car", "park"], "supportWords": [{"word": "the", "meaning": "這個／那個；冠詞通常弱讀。", "text": "the car", "audioKey": "support-1-1"}, {"word": "is", "meaning": "是／在；s在此讀/z/，先聽片語。", "text": "is in the park", "audioKey": "support-1-2"}], "id": "r-ar-sentence-1", "audioKey": "sentence-1", "supportNote": "先聽支援片語再讀整句；冠詞弱讀、功能詞與特別提示不作本課新規則考核。"},
      {"text": "A shark has a dark fin.", "translation": "一隻鯊魚有深色的鰭。", "wordKeys": ["shark", "dark"], "supportWords": [{"word": "a", "meaning": "一個／一隻；冠詞通常弱讀。", "text": "a shark", "audioKey": "support-2-1"}, {"word": "has", "meaning": "有；s在has讀/z/，先聽片語。", "text": "has a dark fin", "audioKey": "support-2-2"}], "id": "r-ar-sentence-2", "audioKey": "sentence-2", "supportNote": "先聽支援片語再讀整句；冠詞弱讀、功能詞與特別提示不作本課新規則考核。"},
    ],
  },
  {
    id: "r-or",
    vowel: "or",
    sound: "/ɔ/＋/r/",
    title: "R 控制母音 or",
    description: "認識or的美式讀音，和前課ar分開比較。",
    introductionText: "聽 corn、fork、short 的完整單字，留意 /ɔ/＋/r/；先看本課目標字形，再完整逐音拼合。",
    pronunciationNote: "or在本課表示/ɔ/接/r/；/r/算一個C。與長O的/oʊ/不同，不把word等不同讀音收入。",
    spellingLabel: "or",
    prerequisites: ["已學五長短母音、第3章連綴與第4章sh/ch等子音字形。", "本章採美式捲舌讀音；/r/明列為一個子音C，字形與音素不要求一對一。", "已教ar；or的/ɔ/是本課新增對應，不套用短O或長O。"],
    families: r_orFamilies,
    introductionWords: [word(r_orFamilies, "corn"), word(r_orFamilies, "fork"), word(r_orFamilies, "short")],
    questions: [
      { id: "r-or-1-listen", kind: "listen", answer: word(r_orFamilies, "corn"), choices: ["horn", "corn", "born"] },
      { id: "r-or-2-spell", kind: "spell", answer: word(r_orFamilies, "fork"), choices: ["k", "or", "f", "p"] },
      { id: "r-or-3-listen", kind: "listen", answer: word(r_orFamilies, "pork"), choices: ["fork", "pork", "form"] },
      { id: "r-or-4-spell", kind: "spell", answer: word(r_orFamilies, "storm"), choices: ["m", "or", "t", "s", "p"] },
      { id: "r-or-5-listen", kind: "listen", answer: word(r_orFamilies, "short"), choices: ["short", "sport", "storm"] },
      { id: "r-or-6-spell", kind: "spell", answer: word(r_orFamilies, "horn"), choices: ["n", "or", "h", "p"] },
      { id: "r-or-7-listen", kind: "listen", answer: word(r_orFamilies, "form"), choices: ["storm", "form", "fork"] },
      { id: "r-or-8-spell", kind: "spell", answer: word(r_orFamilies, "sport"), choices: ["t", "or", "p", "s", "n"] },
    ],
    sentences: [
      {"text": "The corn is on the fork.", "translation": "玉米在叉子上。", "wordKeys": ["corn", "fork"], "supportWords": [{"word": "the", "meaning": "這個／那個；冠詞通常弱讀。", "text": "the corn", "audioKey": "support-1-1"}, {"word": "is", "meaning": "是／在；s在此讀/z/，先聽片語。", "text": "is on the fork", "audioKey": "support-1-2"}], "id": "r-or-sentence-1", "audioKey": "sentence-1", "supportNote": "先聽支援片語再讀整句；冠詞弱讀、功能詞與特別提示不作本課新規則考核。"},
      {"text": "The storm is short.", "translation": "這場暴風雨持續的時間很短。", "wordKeys": ["storm", "short"], "supportWords": [{"word": "the", "meaning": "這個／那個；冠詞通常弱讀。", "text": "the storm", "audioKey": "support-2-1"}, {"word": "is", "meaning": "是／在；s在此讀/z/，先聽片語。", "text": "is short", "audioKey": "support-2-2"}], "id": "r-or-sentence-2", "audioKey": "sentence-2", "supportNote": "先聽支援片語再讀整句；冠詞弱讀、功能詞與特別提示不作本課新規則考核。"},
    ],
  },
  {
    id: "r-ore-oar",
    vowel: "ore-oar",
    sound: "/ɔ/＋/r/",
    title: "R 控制母音 ore／oar",
    description: "沿用or的聲音，比較ore與oar兩種拼法。",
    introductionText: "聽 store、oar、board 的完整單字，留意 /ɔ/＋/r/；先看本課目標字形，再完整逐音拼合。",
    pronunciationNote: "ore與oar在本課都表示/ɔ/接/r/，整組字形可對應兩音；/r/仍算C。ore不拆成長O的o_e，oar也不套用oa=/oʊ/。",
    spellingLabel: "ore → oar",
    prerequisites: ["已學五長短母音、第3章連綴與第4章sh/ch等子音字形。", "本章採美式捲舌讀音；/r/明列為一個子音C，字形與音素不要求一對一。", "已教ar、or及sh/st連綴；本課新增ore/oar同音拼法。", "sore與soar同音，聽音選字不把兩者放在同一題；拼字依本課目標單詞文字對應示範。"],
    families: r_ore_oarFamilies,
    introductionWords: [word(r_ore_oarFamilies, "store"), word(r_ore_oarFamilies, "oar"), word(r_ore_oarFamilies, "board")],
    questions: [
      { id: "r-ore-oar-1-listen", kind: "listen", answer: word(r_ore_oarFamilies, "store"), choices: ["shore", "store", "more"] },
      { id: "r-ore-oar-2-spell", kind: "spell", answer: word(r_ore_oarFamilies, "board"), choices: ["d", "oar", "b", "p"] },
      { id: "r-ore-oar-3-listen", kind: "listen", answer: word(r_ore_oarFamilies, "core"), choices: ["core", "more", "sore"] },
      { id: "r-ore-oar-4-spell", kind: "spell", answer: word(r_ore_oarFamilies, "roar"), choices: ["oar", "r", "p"] },
      { id: "r-ore-oar-5-listen", kind: "listen", answer: word(r_ore_oarFamilies, "soar"), choices: ["oar", "board", "soar"] },
      { id: "r-ore-oar-6-spell", kind: "spell", answer: word(r_ore_oarFamilies, "shore"), choices: ["ore", "sh", "p"] },
      { id: "r-ore-oar-7-listen", kind: "listen", answer: word(r_ore_oarFamilies, "more"), choices: ["more", "core", "store"] },
      { id: "r-ore-oar-8-spell", kind: "spell", answer: word(r_ore_oarFamilies, "oar"), choices: ["oar", "p"] },
    ],
    sentences: [
      {"text": "The oar is on the shore.", "translation": "船槳在岸邊。", "wordKeys": ["oar", "shore"], "supportWords": [{"word": "the", "meaning": "這個／那個；冠詞通常弱讀。", "text": "the oar", "audioKey": "support-1-1"}, {"word": "is", "meaning": "是／在；s在此讀/z/，先聽片語。", "text": "is on the shore", "audioKey": "support-1-2"}], "id": "r-ore-oar-sentence-1", "audioKey": "sentence-1", "supportNote": "先聽支援片語再讀整句；冠詞弱讀、功能詞與特別提示不作本課新規則考核。"},
      {"text": "The board is in the store.", "translation": "木板在商店裡。", "wordKeys": ["board", "store"], "supportWords": [{"word": "the", "meaning": "這個／那個；冠詞通常弱讀。", "text": "the board", "audioKey": "support-2-1"}, {"word": "is", "meaning": "是／在；s在此讀/z/，先聽片語。", "text": "is in the store", "audioKey": "support-2-2"}], "id": "r-ore-oar-sentence-2", "audioKey": "sentence-2", "supportNote": "先聽支援片語再讀整句；冠詞弱讀、功能詞與特別提示不作本課新規則考核。"},
    ],
  },
];
