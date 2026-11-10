import type { PhonicsFamily, PhonicsLesson, PhonicsWord } from "./phonicsLesson";

/** 音素結構與字形數量分開；同一單詞物件供各階段重用。 */
function word(families: PhonicsFamily[], text: string): PhonicsWord {
  const found = families.flatMap(({ words }) => words).find(({ word }) => word === text);
  if (!found) throw new Error(`教材缺少單字：${text}`);
  return found;
}

const digraph_shFamilies: PhonicsFamily[] = [
  { "label": "-ip", "rime": "/ɪp/", "spelling": "sh", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-sh-sh-1", words: [
    {"word": "ship", "meaning": "船", "structure": "CVC", "phonemes": ["ʃ", "ɪ", "p"], "graphemes": [{"text": "sh", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "i", "kind": "vowel", "ranges": [{"start": 2, "end": 3}]}, {"text": "p", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["sh", "i", "p"], "familyId": "digraph-sh-sh-1"},
  ] },
  { "label": "-op", "rime": "/ɑp/", "spelling": "sh", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-sh-sh-2", words: [
    {"word": "shop", "meaning": "商店", "structure": "CVC", "phonemes": ["ʃ", "ɑ", "p"], "graphemes": [{"text": "sh", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "o", "kind": "vowel", "ranges": [{"start": 2, "end": 3}]}, {"text": "p", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["sh", "o", "p"], "familyId": "digraph-sh-sh-2"},
  ] },
  { "label": "-ed", "rime": "/ɛd/", "spelling": "sh", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-sh-sh-3", words: [
    {"word": "shed", "meaning": "棚屋", "structure": "CVC", "phonemes": ["ʃ", "ɛ", "d"], "graphemes": [{"text": "sh", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "e", "kind": "vowel", "ranges": [{"start": 2, "end": 3}]}, {"text": "d", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["sh", "e", "d"], "familyId": "digraph-sh-sh-3"},
  ] },
  { "label": "-ut", "rime": "/ʌt/", "spelling": "sh", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-sh-sh-4", words: [
    {"word": "shut", "meaning": "關上", "structure": "CVC", "phonemes": ["ʃ", "ʌ", "t"], "graphemes": [{"text": "sh", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "u", "kind": "vowel", "ranges": [{"start": 2, "end": 3}]}, {"text": "t", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["sh", "u", "t"], "familyId": "digraph-sh-sh-4"},
  ] },
  { "label": "-ish", "rime": "/ɪʃ/", "spelling": "sh", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-sh-sh-5", words: [
    {"word": "fish", "meaning": "魚", "structure": "CVC", "phonemes": ["f", "ɪ", "ʃ"], "graphemes": [{"text": "f", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "i", "kind": "vowel", "ranges": [{"start": 1, "end": 2}]}, {"text": "sh", "kind": "consonant", "ranges": [{"start": 2, "end": 4}]}], "targetRanges": [{"start": 2, "end": 4}], "spellingUnits": ["f", "i", "sh"], "familyId": "digraph-sh-sh-5"},
    {"word": "dish", "meaning": "盤子", "structure": "CVC", "phonemes": ["d", "ɪ", "ʃ"], "graphemes": [{"text": "d", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "i", "kind": "vowel", "ranges": [{"start": 1, "end": 2}]}, {"text": "sh", "kind": "consonant", "ranges": [{"start": 2, "end": 4}]}], "targetRanges": [{"start": 2, "end": 4}], "spellingUnits": ["d", "i", "sh"], "familyId": "digraph-sh-sh-5"},
    {"word": "wish", "meaning": "希望", "structure": "CVC", "phonemes": ["w", "ɪ", "ʃ"], "graphemes": [{"text": "w", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "i", "kind": "vowel", "ranges": [{"start": 1, "end": 2}]}, {"text": "sh", "kind": "consonant", "ranges": [{"start": 2, "end": 4}]}], "targetRanges": [{"start": 2, "end": 4}], "spellingUnits": ["w", "i", "sh"], "familyId": "digraph-sh-sh-5"},
  ] },
  { "label": "-ash", "rime": "/æʃ/", "spelling": "sh", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-sh-sh-6", words: [
    {"word": "cash", "meaning": "現金", "structure": "CVC", "phonemes": ["k", "æ", "ʃ"], "graphemes": [{"text": "c", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "a", "kind": "vowel", "ranges": [{"start": 1, "end": 2}]}, {"text": "sh", "kind": "consonant", "ranges": [{"start": 2, "end": 4}]}], "targetRanges": [{"start": 2, "end": 4}], "spellingUnits": ["c", "a", "sh"], "familyId": "digraph-sh-sh-6"},
    {"word": "rash", "meaning": "皮疹", "structure": "CVC", "phonemes": ["r", "æ", "ʃ"], "graphemes": [{"text": "r", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "a", "kind": "vowel", "ranges": [{"start": 1, "end": 2}]}, {"text": "sh", "kind": "consonant", "ranges": [{"start": 2, "end": 4}]}], "targetRanges": [{"start": 2, "end": 4}], "spellingUnits": ["r", "a", "sh"], "familyId": "digraph-sh-sh-6"},
  ] },
  { "label": "-ush", "rime": "/ʌʃ/", "spelling": "sh", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-sh-sh-7", words: [
    {"word": "rush", "meaning": "趕緊；匆忙", "structure": "CVC", "phonemes": ["r", "ʌ", "ʃ"], "graphemes": [{"text": "r", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "u", "kind": "vowel", "ranges": [{"start": 1, "end": 2}]}, {"text": "sh", "kind": "consonant", "ranges": [{"start": 2, "end": 4}]}], "targetRanges": [{"start": 2, "end": 4}], "spellingUnits": ["r", "u", "sh"], "familyId": "digraph-sh-sh-7"},
    {"word": "hush", "meaning": "安靜下來", "structure": "CVC", "phonemes": ["h", "ʌ", "ʃ"], "graphemes": [{"text": "h", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "u", "kind": "vowel", "ranges": [{"start": 1, "end": 2}]}, {"text": "sh", "kind": "consonant", "ranges": [{"start": 2, "end": 4}]}], "targetRanges": [{"start": 2, "end": 4}], "spellingUnits": ["h", "u", "sh"], "familyId": "digraph-sh-sh-7"},
  ] },
];

const digraph_chFamilies: PhonicsFamily[] = [
  { "label": "-ip", "rime": "/ɪp/", "spelling": "ch", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-ch-ch-1", words: [
    {"word": "chip", "meaning": "薄片；洋芋片", "structure": "CVC", "phonemes": ["tʃ", "ɪ", "p"], "graphemes": [{"text": "ch", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "i", "kind": "vowel", "ranges": [{"start": 2, "end": 3}]}, {"text": "p", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["ch", "i", "p"], "familyId": "digraph-ch-ch-1"},
  ] },
  { "label": "-in", "rime": "/ɪn/", "spelling": "ch", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-ch-ch-2", words: [
    {"word": "chin", "meaning": "下巴", "structure": "CVC", "phonemes": ["tʃ", "ɪ", "n"], "graphemes": [{"text": "ch", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "i", "kind": "vowel", "ranges": [{"start": 2, "end": 3}]}, {"text": "n", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["ch", "i", "n"], "familyId": "digraph-ch-ch-2"},
  ] },
  { "label": "-at", "rime": "/æt/", "spelling": "ch", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-ch-ch-3", words: [
    {"word": "chat", "meaning": "聊天", "structure": "CVC", "phonemes": ["tʃ", "æ", "t"], "graphemes": [{"text": "ch", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "a", "kind": "vowel", "ranges": [{"start": 2, "end": 3}]}, {"text": "t", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["ch", "a", "t"], "familyId": "digraph-ch-ch-3"},
  ] },
  { "label": "-op", "rime": "/ɑp/", "spelling": "ch", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-ch-ch-4", words: [
    {"word": "chop", "meaning": "切碎", "structure": "CVC", "phonemes": ["tʃ", "ɑ", "p"], "graphemes": [{"text": "ch", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "o", "kind": "vowel", "ranges": [{"start": 2, "end": 3}]}, {"text": "p", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["ch", "o", "p"], "familyId": "digraph-ch-ch-4"},
  ] },
  { "label": "-ich", "rime": "/ɪtʃ/", "spelling": "ch", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-ch-ch-5", words: [
    {"word": "rich", "meaning": "富有的", "structure": "CVC", "phonemes": ["r", "ɪ", "tʃ"], "graphemes": [{"text": "r", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "i", "kind": "vowel", "ranges": [{"start": 1, "end": 2}]}, {"text": "ch", "kind": "consonant", "ranges": [{"start": 2, "end": 4}]}], "targetRanges": [{"start": 2, "end": 4}], "spellingUnits": ["r", "i", "ch"], "familyId": "digraph-ch-ch-5"},
  ] },
  { "label": "-uch", "rime": "/ʌtʃ/", "spelling": "ch", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-ch-ch-6", words: [
    {"word": "much", "meaning": "許多", "structure": "CVC", "phonemes": ["m", "ʌ", "tʃ"], "graphemes": [{"text": "m", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "u", "kind": "vowel", "ranges": [{"start": 1, "end": 2}]}, {"text": "ch", "kind": "consonant", "ranges": [{"start": 2, "end": 4}]}], "targetRanges": [{"start": 2, "end": 4}], "spellingUnits": ["m", "u", "ch"], "familyId": "digraph-ch-ch-6"},
    {"word": "such", "meaning": "這樣的", "structure": "CVC", "phonemes": ["s", "ʌ", "tʃ"], "graphemes": [{"text": "s", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "u", "kind": "vowel", "ranges": [{"start": 1, "end": 2}]}, {"text": "ch", "kind": "consonant", "ranges": [{"start": 2, "end": 4}]}], "targetRanges": [{"start": 2, "end": 4}], "spellingUnits": ["s", "u", "ch"], "familyId": "digraph-ch-ch-6"},
  ] },
  { "label": "-unch", "rime": "/ʌntʃ/", "spelling": "ch", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-ch-ch-7", words: [
    {"word": "lunch", "meaning": "午餐", "structure": "CVCC", "phonemes": ["l", "ʌ", "n", "tʃ"], "graphemes": [{"text": "l", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "u", "kind": "vowel", "ranges": [{"start": 1, "end": 2}]}, {"text": "n", "kind": "consonant", "ranges": [{"start": 2, "end": 3}]}, {"text": "ch", "kind": "consonant", "ranges": [{"start": 3, "end": 5}]}], "targetRanges": [{"start": 3, "end": 5}], "spellingUnits": ["l", "u", "n", "ch"], "familyId": "digraph-ch-ch-7"},
  ] },
  { "label": "-ench", "rime": "/ɛntʃ/", "spelling": "ch", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-ch-ch-8", words: [
    {"word": "bench", "meaning": "長椅", "structure": "CVCC", "phonemes": ["b", "ɛ", "n", "tʃ"], "graphemes": [{"text": "b", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "e", "kind": "vowel", "ranges": [{"start": 1, "end": 2}]}, {"text": "n", "kind": "consonant", "ranges": [{"start": 2, "end": 3}]}, {"text": "ch", "kind": "consonant", "ranges": [{"start": 3, "end": 5}]}], "targetRanges": [{"start": 3, "end": 5}], "spellingUnits": ["b", "e", "n", "ch"], "familyId": "digraph-ch-ch-8"},
  ] },
];

const digraph_th_voicelessFamilies: PhonicsFamily[] = [
  { "label": "-in", "rime": "/ɪn/", "spelling": "th", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-th-voiceless-th-1", words: [
    {"word": "thin", "meaning": "薄的；瘦的", "structure": "CVC", "phonemes": ["θ", "ɪ", "n"], "graphemes": [{"text": "th", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "i", "kind": "vowel", "ranges": [{"start": 2, "end": 3}]}, {"text": "n", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["th", "i", "n"], "familyId": "digraph-th-voiceless-th-1"},
  ] },
  { "label": "-ath", "rime": "/æθ/", "spelling": "th", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-th-voiceless-th-2", words: [
    {"word": "bath", "meaning": "澡；浴缸", "structure": "CVC", "phonemes": ["b", "æ", "θ"], "graphemes": [{"text": "b", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "a", "kind": "vowel", "ranges": [{"start": 1, "end": 2}]}, {"text": "th", "kind": "consonant", "ranges": [{"start": 2, "end": 4}]}], "targetRanges": [{"start": 2, "end": 4}], "spellingUnits": ["b", "a", "th"], "familyId": "digraph-th-voiceless-th-2"},
    {"word": "math", "meaning": "數學", "structure": "CVC", "phonemes": ["m", "æ", "θ"], "graphemes": [{"text": "m", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "a", "kind": "vowel", "ranges": [{"start": 1, "end": 2}]}, {"text": "th", "kind": "consonant", "ranges": [{"start": 2, "end": 4}]}], "targetRanges": [{"start": 2, "end": 4}], "spellingUnits": ["m", "a", "th"], "familyId": "digraph-th-voiceless-th-2"},
    {"word": "path", "meaning": "小路", "structure": "CVC", "phonemes": ["p", "æ", "θ"], "graphemes": [{"text": "p", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "a", "kind": "vowel", "ranges": [{"start": 1, "end": 2}]}, {"text": "th", "kind": "consonant", "ranges": [{"start": 2, "end": 4}]}], "targetRanges": [{"start": 2, "end": 4}], "spellingUnits": ["p", "a", "th"], "familyId": "digraph-th-voiceless-th-2"},
  ] },
  { "label": "-oth", "rime": "/ɑθ/", "spelling": "th", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-th-voiceless-th-3", words: [
    {"word": "moth", "meaning": "蛾", "structure": "CVC", "phonemes": ["m", "ɑ", "θ"], "graphemes": [{"text": "m", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "o", "kind": "vowel", "ranges": [{"start": 1, "end": 2}]}, {"text": "th", "kind": "consonant", "ranges": [{"start": 2, "end": 4}]}], "targetRanges": [{"start": 2, "end": 4}], "spellingUnits": ["m", "o", "th"], "familyId": "digraph-th-voiceless-th-3"},
  ] },
  { "label": "-oth", "rime": "/ɑθ/", "spelling": "th", "description": "cloth採美式/klɑθ/，沿用短O；部分口音讀/klɔθ/，不混在本課同題中比較。", "id": "digraph-th-voiceless-th-4", words: [
    {"word": "cloth", "meaning": "布", "structure": "CCVC", "phonemes": ["k", "l", "ɑ", "θ"], "graphemes": [{"text": "c", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "l", "kind": "consonant", "ranges": [{"start": 1, "end": 2}]}, {"text": "o", "kind": "vowel", "ranges": [{"start": 2, "end": 3}]}, {"text": "th", "kind": "consonant", "ranges": [{"start": 3, "end": 5}]}], "targetRanges": [{"start": 3, "end": 5}], "spellingUnits": ["c", "l", "o", "th"], "familyId": "digraph-th-voiceless-th-4"},
  ] },
  { "label": "-eft", "rime": "/ɛft/", "spelling": "th", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-th-voiceless-th-5", words: [
    {"word": "theft", "meaning": "偷竊", "structure": "CVCC", "phonemes": ["θ", "ɛ", "f", "t"], "graphemes": [{"text": "th", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "e", "kind": "vowel", "ranges": [{"start": 2, "end": 3}]}, {"text": "f", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}, {"text": "t", "kind": "consonant", "ranges": [{"start": 4, "end": 5}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["th", "e", "f", "t"], "familyId": "digraph-th-voiceless-th-5"},
  ] },
];

const digraph_th_voicedFamilies: PhonicsFamily[] = [
  { "label": "-is", "rime": "/ɪs/", "spelling": "th", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-th-voiced-th-1", words: [
    {"word": "this", "meaning": "這個", "structure": "CVC", "phonemes": ["ð", "ɪ", "s"], "graphemes": [{"text": "th", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "i", "kind": "vowel", "ranges": [{"start": 2, "end": 3}]}, {"text": "s", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["th", "i", "s"], "familyId": "digraph-th-voiced-th-1"},
  ] },
  { "label": "-at", "rime": "/æt/", "spelling": "th", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-th-voiced-th-2", words: [
    {"word": "that", "meaning": "那個", "structure": "CVC", "phonemes": ["ð", "æ", "t"], "graphemes": [{"text": "th", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "a", "kind": "vowel", "ranges": [{"start": 2, "end": 3}]}, {"text": "t", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["th", "a", "t"], "familyId": "digraph-th-voiced-th-2"},
  ] },
  { "label": "-em", "rime": "/ɛm/", "spelling": "th", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-th-voiced-th-3", words: [
    {"word": "them", "meaning": "他們；她們；它們", "structure": "CVC", "phonemes": ["ð", "ɛ", "m"], "graphemes": [{"text": "th", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "e", "kind": "vowel", "ranges": [{"start": 2, "end": 3}]}, {"text": "m", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["th", "e", "m"], "familyId": "digraph-th-voiced-th-3"},
  ] },
  { "label": "-en", "rime": "/ɛn/", "spelling": "th", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-th-voiced-th-4", words: [
    {"word": "then", "meaning": "然後；那時", "structure": "CVC", "phonemes": ["ð", "ɛ", "n"], "graphemes": [{"text": "th", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "e", "kind": "vowel", "ranges": [{"start": 2, "end": 3}]}, {"text": "n", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["th", "e", "n"], "familyId": "digraph-th-voiced-th-4"},
  ] },
  { "label": "-an", "rime": "/æn/", "spelling": "th", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-th-voiced-th-5", words: [
    {"word": "than", "meaning": "比", "structure": "CVC", "phonemes": ["ð", "æ", "n"], "graphemes": [{"text": "th", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "a", "kind": "vowel", "ranges": [{"start": 2, "end": 3}]}, {"text": "n", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["th", "a", "n"], "familyId": "digraph-th-voiced-th-5"},
  ] },
  { "label": "-ose", "rime": "/oʊz/", "spelling": "th", "description": "those的o_e表示/oʊ/，s在此讀/z/，先示範這個詞的讀音。", "id": "digraph-th-voiced-th-6", words: [
    {"word": "those", "meaning": "那些", "structure": "CVC", "phonemes": ["ð", "oʊ", "z"], "graphemes": [{"text": "th", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "o_e", "kind": "vowel", "ranges": [{"start": 2, "end": 3}, {"start": 4, "end": 5}]}, {"text": "s", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["th", "o", "s", "e"], "familyId": "digraph-th-voiced-th-6"},
  ] },
  { "label": "-athe", "rime": "/eɪð/", "spelling": "th", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-th-voiced-th-7", words: [
    {"word": "bathe", "meaning": "洗澡", "structure": "CVC", "phonemes": ["b", "eɪ", "ð"], "graphemes": [{"text": "b", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "a_e", "kind": "vowel", "ranges": [{"start": 1, "end": 2}, {"start": 4, "end": 5}]}, {"text": "th", "kind": "consonant", "ranges": [{"start": 2, "end": 4}]}], "targetRanges": [{"start": 2, "end": 4}], "spellingUnits": ["b", "a", "th", "e"], "familyId": "digraph-th-voiced-th-7"},
  ] },
];

const digraph_whFamilies: PhonicsFamily[] = [
  { "label": "-en", "rime": "/ɛn/", "spelling": "wh", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-wh-wh-1", words: [
    {"word": "when", "meaning": "何時", "structure": "CVC", "phonemes": ["w", "ɛ", "n"], "graphemes": [{"text": "wh", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "e", "kind": "vowel", "ranges": [{"start": 2, "end": 3}]}, {"text": "n", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["wh", "e", "n"], "familyId": "digraph-wh-wh-1"},
  ] },
  { "label": "-ip", "rime": "/ɪp/", "spelling": "wh", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-wh-wh-2", words: [
    {"word": "whip", "meaning": "鞭子；抽打", "structure": "CVC", "phonemes": ["w", "ɪ", "p"], "graphemes": [{"text": "wh", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "i", "kind": "vowel", "ranges": [{"start": 2, "end": 3}]}, {"text": "p", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["wh", "i", "p"], "familyId": "digraph-wh-wh-2"},
  ] },
  { "label": "-eel", "rime": "/iːl/", "spelling": "wh", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-wh-wh-3", words: [
    {"word": "wheel", "meaning": "輪子", "structure": "CVC", "phonemes": ["w", "iː", "l"], "graphemes": [{"text": "wh", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "ee", "kind": "vowel", "ranges": [{"start": 2, "end": 4}]}, {"text": "l", "kind": "consonant", "ranges": [{"start": 4, "end": 5}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["wh", "ee", "l"], "familyId": "digraph-wh-wh-3"},
  ] },
  { "label": "-eat", "rime": "/iːt/", "spelling": "wh", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-wh-wh-4", words: [
    {"word": "wheat", "meaning": "小麥", "structure": "CVC", "phonemes": ["w", "iː", "t"], "graphemes": [{"text": "wh", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "ea", "kind": "vowel", "ranges": [{"start": 2, "end": 4}]}, {"text": "t", "kind": "consonant", "ranges": [{"start": 4, "end": 5}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["wh", "ea", "t"], "familyId": "digraph-wh-wh-4"},
  ] },
  { "label": "-ite", "rime": "/aɪt/", "spelling": "wh", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-wh-wh-5", words: [
    {"word": "white", "meaning": "白色的", "structure": "CVC", "phonemes": ["w", "aɪ", "t"], "graphemes": [{"text": "wh", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "i_e", "kind": "vowel", "ranges": [{"start": 2, "end": 3}, {"start": 4, "end": 5}]}, {"text": "t", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["wh", "i", "t", "e"], "familyId": "digraph-wh-wh-5"},
  ] },
  { "label": "-ale", "rime": "/eɪl/", "spelling": "wh", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-wh-wh-6", words: [
    {"word": "whale", "meaning": "鯨魚", "structure": "CVC", "phonemes": ["w", "eɪ", "l"], "graphemes": [{"text": "wh", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "a_e", "kind": "vowel", "ranges": [{"start": 2, "end": 3}, {"start": 4, "end": 5}]}, {"text": "l", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["wh", "a", "l", "e"], "familyId": "digraph-wh-wh-6"},
  ] },
  { "label": "-ine", "rime": "/aɪn/", "spelling": "wh", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-wh-wh-7", words: [
    {"word": "whine", "meaning": "哀鳴；抱怨", "structure": "CVC", "phonemes": ["w", "aɪ", "n"], "graphemes": [{"text": "wh", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "i_e", "kind": "vowel", "ranges": [{"start": 2, "end": 3}, {"start": 4, "end": 5}]}, {"text": "n", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["wh", "i", "n", "e"], "familyId": "digraph-wh-wh-7"},
  ] },
];

const digraph_phFamilies: PhonicsFamily[] = [
  { "label": "-one", "rime": "/oʊn/", "spelling": "ph", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-ph-ph-1", words: [
    {"word": "phone", "meaning": "電話", "structure": "CVC", "phonemes": ["f", "oʊ", "n"], "graphemes": [{"text": "ph", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "o_e", "kind": "vowel", "ranges": [{"start": 2, "end": 3}, {"start": 4, "end": 5}]}, {"text": "n", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["ph", "o", "n", "e"], "familyId": "digraph-ph-ph-1"},
  ] },
  { "label": "-aph", "rime": "/æf/", "spelling": "ph", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-ph-ph-2", words: [
    {"word": "graph", "meaning": "圖表", "structure": "CCVC", "phonemes": ["ɡ", "r", "æ", "f"], "graphemes": [{"text": "g", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "r", "kind": "consonant", "ranges": [{"start": 1, "end": 2}]}, {"text": "a", "kind": "vowel", "ranges": [{"start": 2, "end": 3}]}, {"text": "ph", "kind": "consonant", "ranges": [{"start": 3, "end": 5}]}], "targetRanges": [{"start": 3, "end": 5}], "spellingUnits": ["g", "r", "a", "ph"], "familyId": "digraph-ph-ph-2"},
  ] },
  { "label": "-ase", "rime": "/eɪz/", "spelling": "ph", "description": "phase與phrase都用a_e；s讀/z/。phrase的/f/、/r/都保留，與phase比較字首。", "id": "digraph-ph-ph-3", words: [
    {"word": "phase", "meaning": "階段", "structure": "CVC", "phonemes": ["f", "eɪ", "z"], "graphemes": [{"text": "ph", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "a_e", "kind": "vowel", "ranges": [{"start": 2, "end": 3}, {"start": 4, "end": 5}]}, {"text": "s", "kind": "consonant", "ranges": [{"start": 3, "end": 4}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["ph", "a", "s", "e"], "familyId": "digraph-ph-ph-3"},
    {"word": "phrase", "meaning": "片語", "structure": "CCVC", "phonemes": ["f", "r", "eɪ", "z"], "graphemes": [{"text": "ph", "kind": "consonant", "ranges": [{"start": 0, "end": 2}]}, {"text": "r", "kind": "consonant", "ranges": [{"start": 2, "end": 3}]}, {"text": "a_e", "kind": "vowel", "ranges": [{"start": 3, "end": 4}, {"start": 5, "end": 6}]}, {"text": "s", "kind": "consonant", "ranges": [{"start": 4, "end": 5}]}], "targetRanges": [{"start": 0, "end": 2}], "spellingUnits": ["ph", "r", "a", "s", "e"], "familyId": "digraph-ph-ph-3"},
  ] },
];

const digraph_tchFamilies: PhonicsFamily[] = [
  { "label": "-atch", "rime": "/ætʃ/", "spelling": "tch", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-tch-tch-1", words: [
    {"word": "catch", "meaning": "接住", "structure": "CVC", "phonemes": ["k", "æ", "tʃ"], "graphemes": [{"text": "c", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "a", "kind": "vowel", "ranges": [{"start": 1, "end": 2}]}, {"text": "tch", "kind": "consonant", "ranges": [{"start": 2, "end": 5}]}], "targetRanges": [{"start": 2, "end": 5}], "spellingUnits": ["c", "a", "tch"], "familyId": "digraph-tch-tch-1"},
    {"word": "match", "meaning": "火柴；相配", "structure": "CVC", "phonemes": ["m", "æ", "tʃ"], "graphemes": [{"text": "m", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "a", "kind": "vowel", "ranges": [{"start": 1, "end": 2}]}, {"text": "tch", "kind": "consonant", "ranges": [{"start": 2, "end": 5}]}], "targetRanges": [{"start": 2, "end": 5}], "spellingUnits": ["m", "a", "tch"], "familyId": "digraph-tch-tch-1"},
    {"word": "patch", "meaning": "補丁", "structure": "CVC", "phonemes": ["p", "æ", "tʃ"], "graphemes": [{"text": "p", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "a", "kind": "vowel", "ranges": [{"start": 1, "end": 2}]}, {"text": "tch", "kind": "consonant", "ranges": [{"start": 2, "end": 5}]}], "targetRanges": [{"start": 2, "end": 5}], "spellingUnits": ["p", "a", "tch"], "familyId": "digraph-tch-tch-1"},
    {"word": "hatch", "meaning": "孵化", "structure": "CVC", "phonemes": ["h", "æ", "tʃ"], "graphemes": [{"text": "h", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "a", "kind": "vowel", "ranges": [{"start": 1, "end": 2}]}, {"text": "tch", "kind": "consonant", "ranges": [{"start": 2, "end": 5}]}], "targetRanges": [{"start": 2, "end": 5}], "spellingUnits": ["h", "a", "tch"], "familyId": "digraph-tch-tch-1"},
  ] },
  { "label": "-etch", "rime": "/ɛtʃ/", "spelling": "tch", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-tch-tch-2", words: [
    {"word": "fetch", "meaning": "取來", "structure": "CVC", "phonemes": ["f", "ɛ", "tʃ"], "graphemes": [{"text": "f", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "e", "kind": "vowel", "ranges": [{"start": 1, "end": 2}]}, {"text": "tch", "kind": "consonant", "ranges": [{"start": 2, "end": 5}]}], "targetRanges": [{"start": 2, "end": 5}], "spellingUnits": ["f", "e", "tch"], "familyId": "digraph-tch-tch-2"},
  ] },
  { "label": "-itch", "rime": "/ɪtʃ/", "spelling": "tch", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-tch-tch-3", words: [
    {"word": "itch", "meaning": "發癢", "structure": "VC", "phonemes": ["ɪ", "tʃ"], "graphemes": [{"text": "i", "kind": "vowel", "ranges": [{"start": 0, "end": 1}]}, {"text": "tch", "kind": "consonant", "ranges": [{"start": 1, "end": 4}]}], "targetRanges": [{"start": 1, "end": 4}], "spellingUnits": ["i", "tch"], "familyId": "digraph-tch-tch-3"},
    {"word": "pitch", "meaning": "投擲", "structure": "CVC", "phonemes": ["p", "ɪ", "tʃ"], "graphemes": [{"text": "p", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "i", "kind": "vowel", "ranges": [{"start": 1, "end": 2}]}, {"text": "tch", "kind": "consonant", "ranges": [{"start": 2, "end": 5}]}], "targetRanges": [{"start": 2, "end": 5}], "spellingUnits": ["p", "i", "tch"], "familyId": "digraph-tch-tch-3"},
  ] },
  { "label": "-ich", "rime": "/ɪtʃ/", "spelling": "ch", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-tch-ch-4", words: [
    {"word": "rich", "meaning": "富有的", "structure": "CVC", "phonemes": ["r", "ɪ", "tʃ"], "graphemes": [{"text": "r", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "i", "kind": "vowel", "ranges": [{"start": 1, "end": 2}]}, {"text": "ch", "kind": "consonant", "ranges": [{"start": 2, "end": 4}]}], "targetRanges": [{"start": 2, "end": 4}], "spellingUnits": ["r", "i", "ch"], "familyId": "digraph-tch-ch-4"},
  ] },
  { "label": "-uch", "rime": "/ʌtʃ/", "spelling": "ch", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-tch-ch-5", words: [
    {"word": "much", "meaning": "許多", "structure": "CVC", "phonemes": ["m", "ʌ", "tʃ"], "graphemes": [{"text": "m", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "u", "kind": "vowel", "ranges": [{"start": 1, "end": 2}]}, {"text": "ch", "kind": "consonant", "ranges": [{"start": 2, "end": 4}]}], "targetRanges": [{"start": 2, "end": 4}], "spellingUnits": ["m", "u", "ch"], "familyId": "digraph-tch-ch-5"},
  ] },
  { "label": "-unch", "rime": "/ʌntʃ/", "spelling": "ch", "description": "先保留共同韻尾，換字首逐音拼合；目標字形合起來讀，不拆成字母名稱。", "id": "digraph-tch-ch-6", words: [
    {"word": "lunch", "meaning": "午餐", "structure": "CVCC", "phonemes": ["l", "ʌ", "n", "tʃ"], "graphemes": [{"text": "l", "kind": "consonant", "ranges": [{"start": 0, "end": 1}]}, {"text": "u", "kind": "vowel", "ranges": [{"start": 1, "end": 2}]}, {"text": "n", "kind": "consonant", "ranges": [{"start": 2, "end": 3}]}, {"text": "ch", "kind": "consonant", "ranges": [{"start": 3, "end": 5}]}], "targetRanges": [{"start": 3, "end": 5}], "spellingUnits": ["l", "u", "n", "ch"], "familyId": "digraph-tch-ch-6"},
  ] },
];

export const digraphLessons: PhonicsLesson[] = [
  {
    id: "digraph-sh",
    vowel: "sh",
    sound: "/ʃ/",
    title: "子音字形 sh",
    description: "在字首或字尾找出sh，兩字母表示一個子音。",
    introductionText: "聽 ship、fish、rush 的完整單字，留意 /ʃ/；先看本課目標字形，再完整逐音拼合。",
    pronunciationNote: "sh讀/ʃ/，只算一個C；不要拆成/s/與/h/。本課只播完整單字，沒有孤立音素錄音。",
    spellingLabel: "sh",
    prerequisites: ["已學五長短母音、基本單字母子音及第3章雙子音連綴。", "同一字形可含多個字母；拼字作答塊與音素數量分開看。"],
    families: digraph_shFamilies,
    introductionWords: [word(digraph_shFamilies, "ship"), word(digraph_shFamilies, "fish"), word(digraph_shFamilies, "rush")],
    questions: [
      { id: "digraph-sh-1-listen", kind: "listen", answer: word(digraph_shFamilies, "ship"), choices: ["ship", "shop", "shed"] },
      { id: "digraph-sh-2-spell", kind: "spell", answer: word(digraph_shFamilies, "dish"), choices: ["sh", "i", "d", "p"] },
      { id: "digraph-sh-3-listen", kind: "listen", answer: word(digraph_shFamilies, "shut"), choices: ["shut", "shed", "shop"] },
      { id: "digraph-sh-4-spell", kind: "spell", answer: word(digraph_shFamilies, "cash"), choices: ["sh", "a", "c", "p"] },
      { id: "digraph-sh-5-listen", kind: "listen", answer: word(digraph_shFamilies, "fish"), choices: ["fish", "wish", "dish"] },
      { id: "digraph-sh-6-spell", kind: "spell", answer: word(digraph_shFamilies, "rush"), choices: ["sh", "u", "r", "p"] },
      { id: "digraph-sh-7-listen", kind: "listen", answer: word(digraph_shFamilies, "rash"), choices: ["rush", "cash", "rash"] },
      { id: "digraph-sh-8-spell", kind: "spell", answer: word(digraph_shFamilies, "wish"), choices: ["sh", "i", "w", "p"] },
    ],
    sentences: [
      {"text": "The fish is in the dish.", "translation": "魚在盤子裡。", "wordKeys": ["fish", "dish"], "supportWords": [{"word": "the", "meaning": "這個／那個；冠詞通常弱讀。", "text": "the fish", "audioKey": "support-1-1"}, {"word": "is", "meaning": "是／在；s在此讀/z/，先聽片語。", "text": "is in the dish", "audioKey": "support-1-2"}], "id": "digraph-sh-sentence-1", "audioKey": "sentence-1", "supportNote": "先聽支援片語再讀整句；冠詞弱讀、功能詞與特別提示不作本課新規則考核。"},
      {"text": "Shut the shop.", "translation": "把商店關上。", "wordKeys": ["shut", "shop"], "supportWords": [{"word": "the", "meaning": "這個／那個；冠詞通常弱讀。", "text": "the shop", "audioKey": "support-2-1"}], "id": "digraph-sh-sentence-2", "audioKey": "sentence-2", "supportNote": "先聽支援片語再讀整句；冠詞弱讀、功能詞與特別提示不作本課新規則考核。"},
    ],
  },
  {
    id: "digraph-ch",
    vowel: "ch",
    sound: "/tʃ/",
    title: "子音字形 ch",
    description: "從字首到字尾，認識ch的一個子音。",
    introductionText: "聽 chip、rich、lunch 的完整單字，留意 /tʃ/；先看本課目標字形，再完整逐音拼合。",
    pronunciationNote: "ch在本課讀/tʃ/，只算一個C；不推論所有ch都同音。本課不收chef或school。",
    spellingLabel: "ch",
    prerequisites: ["已學五長短母音、基本單字母子音及第3章雙子音連綴。", "同一字形可含多個字母；拼字作答塊與音素數量分開看。", "sh已教；本課只處理ch的/tʃ/，不加入tch拼法。"],
    families: digraph_chFamilies,
    introductionWords: [word(digraph_chFamilies, "chip"), word(digraph_chFamilies, "rich"), word(digraph_chFamilies, "lunch")],
    questions: [
      { id: "digraph-ch-1-listen", kind: "listen", answer: word(digraph_chFamilies, "chip"), choices: ["chin", "chip", "chop"] },
      { id: "digraph-ch-2-spell", kind: "spell", answer: word(digraph_chFamilies, "chat"), choices: ["t", "a", "ch", "p"] },
      { id: "digraph-ch-3-listen", kind: "listen", answer: word(digraph_chFamilies, "rich"), choices: ["rich", "much", "such"] },
      { id: "digraph-ch-4-spell", kind: "spell", answer: word(digraph_chFamilies, "chin"), choices: ["n", "i", "ch", "p"] },
      { id: "digraph-ch-5-listen", kind: "listen", answer: word(digraph_chFamilies, "lunch"), choices: ["lunch", "bench", "chop"] },
      { id: "digraph-ch-6-spell", kind: "spell", answer: word(digraph_chFamilies, "bench"), choices: ["ch", "n", "e", "b", "p"] },
      { id: "digraph-ch-7-listen", kind: "listen", answer: word(digraph_chFamilies, "much"), choices: ["such", "rich", "much"] },
      { id: "digraph-ch-8-spell", kind: "spell", answer: word(digraph_chFamilies, "chop"), choices: ["p", "o", "ch", "n"] },
    ],
    sentences: [
      {"text": "The rich man can chat.", "translation": "這位富有的男子會聊天。", "wordKeys": ["rich", "chat"], "supportWords": [{"word": "the", "meaning": "這個／那個；冠詞通常弱讀。", "text": "the rich man", "audioKey": "support-1-1"}], "id": "digraph-ch-sentence-1", "audioKey": "sentence-1", "supportNote": "先聽支援片語再讀整句；冠詞弱讀、功能詞與特別提示不作本課新規則考核。"},
      {"text": "I had lunch on the bench.", "translation": "我坐在長椅上吃了午餐。", "wordKeys": ["lunch", "bench"], "supportWords": [{"word": "I", "meaning": "我；固定大寫，讀/aɪ/。", "text": "I had lunch", "audioKey": "support-2-1"}, {"word": "the", "meaning": "這個／那個；冠詞通常弱讀。", "text": "on the bench", "audioKey": "support-2-2"}], "id": "digraph-ch-sentence-2", "audioKey": "sentence-2", "supportNote": "先聽支援片語再讀整句；冠詞弱讀、功能詞與特別提示不作本課新規則考核。"},
    ],
  },
  {
    id: "digraph-th-voiceless",
    vowel: "th-voiceless",
    sound: "/θ/",
    title: "子音字形 th：無聲",
    description: "舌尖靠近上齒，讓氣流通過，認識無聲th。",
    introductionText: "聽 thin、bath、moth 的完整單字，留意 /θ/；先看本課目標字形，再完整逐音拼合。",
    pronunciationNote: "th在本課讀/θ/，喉部不振動；與/s/、/t/分開。七詞依常用度與先備選取，不加入oo或未教多音節湊數。",
    spellingLabel: "th",
    prerequisites: ["已學五長短母音、基本單字母子音及第3章雙子音連綴。", "同一字形可含多個字母；拼字作答塊與音素數量分開看。", "先學sh、ch；bath/path採美式/æ/；cloth採美式/ɑ/，沿用短O。"],
    families: digraph_th_voicelessFamilies,
    introductionWords: [word(digraph_th_voicelessFamilies, "thin"), word(digraph_th_voicelessFamilies, "bath"), word(digraph_th_voicelessFamilies, "moth")],
    questions: [
      { id: "digraph-th-voiceless-1-listen", kind: "listen", answer: word(digraph_th_voicelessFamilies, "thin"), choices: ["thin", "bath", "path"] },
      { id: "digraph-th-voiceless-2-spell", kind: "spell", answer: word(digraph_th_voicelessFamilies, "math"), choices: ["th", "a", "m", "p"] },
      { id: "digraph-th-voiceless-3-listen", kind: "listen", answer: word(digraph_th_voicelessFamilies, "bath"), choices: ["math", "bath", "moth"] },
      { id: "digraph-th-voiceless-4-spell", kind: "spell", answer: word(digraph_th_voicelessFamilies, "path"), choices: ["th", "a", "p", "n"] },
      { id: "digraph-th-voiceless-5-listen", kind: "listen", answer: word(digraph_th_voicelessFamilies, "moth"), choices: ["moth", "cloth", "math"] },
      { id: "digraph-th-voiceless-6-spell", kind: "spell", answer: word(digraph_th_voicelessFamilies, "theft"), choices: ["t", "f", "e", "th", "p"] },
      { id: "digraph-th-voiceless-7-listen", kind: "listen", answer: word(digraph_th_voicelessFamilies, "theft"), choices: ["thin", "theft", "cloth"] },
      { id: "digraph-th-voiceless-8-spell", kind: "spell", answer: word(digraph_th_voicelessFamilies, "thin"), choices: ["n", "i", "th", "p"] },
    ],
    sentences: [
      {"text": "A thin cat is on the path.", "translation": "一隻瘦貓在小路上。", "wordKeys": ["thin", "path"], "supportWords": [{"word": "a", "meaning": "一個／一隻；冠詞通常弱讀。", "text": "a thin cat", "audioKey": "support-1-1"}, {"word": "is", "meaning": "是／在；s在此讀/z/，先聽片語。", "text": "is on the path", "audioKey": "support-1-2"}, {"word": "the", "meaning": "這個／那個；冠詞通常弱讀。", "text": "the path", "audioKey": "support-1-3"}], "id": "digraph-th-voiceless-sentence-1", "audioKey": "sentence-1", "supportNote": "先聽支援片語再讀整句；冠詞弱讀、功能詞與特別提示不作本課新規則考核。"},
      {"text": "A moth is on the cloth.", "translation": "一隻蛾在布上。", "wordKeys": ["moth", "cloth"], "supportWords": [{"word": "a", "meaning": "一個／一隻；冠詞通常弱讀。", "text": "a moth", "audioKey": "support-2-1"}, {"word": "is", "meaning": "是／在；s在此讀/z/，先聽片語。", "text": "is on the cloth", "audioKey": "support-2-2"}, {"word": "the", "meaning": "這個／那個；冠詞通常弱讀。", "text": "the cloth", "audioKey": "support-2-3"}], "id": "digraph-th-voiceless-sentence-2", "audioKey": "sentence-2", "supportNote": "先聽支援片語再讀整句；冠詞弱讀、功能詞與特別提示不作本課新規則考核。"},
    ],
  },
  {
    id: "digraph-th-voiced",
    vowel: "th-voiced",
    sound: "/ð/",
    title: "子音字形 th：有聲",
    description: "沿用th的舌位，加上喉部振動，認識有聲th。",
    introductionText: "聽 this、them、bathe 的完整單字，留意 /ð/；先看本課目標字形，再完整逐音拼合。",
    pronunciationNote: "th在本課讀/ð/，喉部會振動；與前課/θ/分開。本課then/them/than用完整重讀形式，句中可能弱讀。bathe的a_e表示/eɪ/，th仍是/ð/。",
    spellingLabel: "th",
    prerequisites: ["已學五長短母音、基本單字母子音及第3章雙子音連綴。", "同一字形可含多個字母；拼字作答塊與音素數量分開看。", "已學無聲th；本課新增有聲/ð/。", "those的s=/z/是本詞提示；不收with的口音變體，也不為湊八詞加入未教母音。"],
    families: digraph_th_voicedFamilies,
    introductionWords: [word(digraph_th_voicedFamilies, "this"), word(digraph_th_voicedFamilies, "them"), word(digraph_th_voicedFamilies, "bathe")],
    questions: [
      { id: "digraph-th-voiced-1-listen", kind: "listen", answer: word(digraph_th_voicedFamilies, "this"), choices: ["this", "that", "those"] },
      { id: "digraph-th-voiced-2-spell", kind: "spell", answer: word(digraph_th_voicedFamilies, "them"), choices: ["m", "e", "th", "p"] },
      { id: "digraph-th-voiced-3-listen", kind: "listen", answer: word(digraph_th_voicedFamilies, "then"), choices: ["than", "then", "them"] },
      { id: "digraph-th-voiced-4-spell", kind: "spell", answer: word(digraph_th_voicedFamilies, "that"), choices: ["t", "a", "th", "p"] },
      { id: "digraph-th-voiced-5-listen", kind: "listen", answer: word(digraph_th_voicedFamilies, "those"), choices: ["those", "this", "them"] },
      { id: "digraph-th-voiced-6-spell", kind: "spell", answer: word(digraph_th_voicedFamilies, "bathe"), choices: ["e", "th", "a", "b", "p"] },
      { id: "digraph-th-voiced-7-listen", kind: "listen", answer: word(digraph_th_voicedFamilies, "than"), choices: ["them", "than", "then"] },
      { id: "digraph-th-voiced-8-spell", kind: "spell", answer: word(digraph_th_voicedFamilies, "those"), choices: ["e", "s", "o", "th", "p"] },
    ],
    sentences: [
      {"text": "This is my bag.", "translation": "這是我的袋子。", "wordKeys": ["this"], "supportWords": [{"word": "is", "meaning": "是／在；s在此讀/z/，先聽片語。", "text": "this is", "audioKey": "support-1-1"}, {"word": "my", "meaning": "我的；y在此讀/aɪ/，先聽片語，不當成本課拼讀規則。", "text": "my bag", "audioKey": "support-1-2"}], "id": "digraph-th-voiced-sentence-1", "audioKey": "sentence-1", "supportNote": "先聽支援片語再讀整句；冠詞弱讀、功能詞與特別提示不作本課新規則考核。"},
      {"text": "That man can bathe.", "translation": "那位男子可以洗澡。", "wordKeys": ["that", "bathe"], "supportWords": [], "id": "digraph-th-voiced-sentence-2", "audioKey": "sentence-2", "supportNote": "先聽支援片語再讀整句；冠詞弱讀、功能詞與特別提示不作本課新規則考核。"},
    ],
  },
  {
    id: "digraph-wh",
    vowel: "wh",
    sound: "/w/",
    title: "子音字形 wh",
    description: "採美式常見/w/，學習wh的拼字與整詞讀音。",
    introductionText: "聽 when、wheel、white 的完整單字，留意 /w/；先看本課目標字形，再完整逐音拼合。",
    pronunciationNote: "本課採美式常見的wh=/w/，h不另讀；部分口音保留/ʍ/，不當作發音錯誤。who不讀/w/，不收入本課。",
    spellingLabel: "wh",
    prerequisites: ["已學五長短母音、基本單字母子音及第3章雙子音連綴。", "同一字形可含多個字母；拼字作答塊與音素數量分開看。", "已教ee/ea、i_e/a_e；wh不提供不同於/w/的新口型，重點是字形。"],
    families: digraph_whFamilies,
    introductionWords: [word(digraph_whFamilies, "when"), word(digraph_whFamilies, "wheel"), word(digraph_whFamilies, "white")],
    questions: [
      { id: "digraph-wh-1-listen", kind: "listen", answer: word(digraph_whFamilies, "when"), choices: ["when", "whip", "wheel"] },
      { id: "digraph-wh-2-spell", kind: "spell", answer: word(digraph_whFamilies, "whip"), choices: ["p", "i", "wh", "n"] },
      { id: "digraph-wh-3-listen", kind: "listen", answer: word(digraph_whFamilies, "wheel"), choices: ["wheel", "whale", "wheat"] },
      { id: "digraph-wh-4-spell", kind: "spell", answer: word(digraph_whFamilies, "white"), choices: ["e", "t", "i", "wh", "p"] },
      { id: "digraph-wh-5-listen", kind: "listen", answer: word(digraph_whFamilies, "whale"), choices: ["white", "whale", "whine"] },
      { id: "digraph-wh-6-spell", kind: "spell", answer: word(digraph_whFamilies, "wheat"), choices: ["t", "ea", "wh", "p"] },
      { id: "digraph-wh-7-listen", kind: "listen", answer: word(digraph_whFamilies, "whine"), choices: ["when", "wheat", "whine"] },
      { id: "digraph-wh-8-spell", kind: "spell", answer: word(digraph_whFamilies, "whale"), choices: ["e", "l", "a", "wh", "p"] },
    ],
    sentences: [
      {"text": "The white whale is big.", "translation": "這隻白鯨很大。", "wordKeys": ["white", "whale"], "supportWords": [{"word": "the", "meaning": "這個／那個；冠詞通常弱讀。", "text": "the white whale", "audioKey": "support-1-1"}, {"word": "is", "meaning": "是／在；s在此讀/z/，先聽片語。", "text": "is big", "audioKey": "support-1-2"}], "id": "digraph-wh-sentence-1", "audioKey": "sentence-1", "supportNote": "先聽支援片語再讀整句；冠詞弱讀、功能詞與特別提示不作本課新規則考核。"},
      {"text": "When can I spin the wheel?", "translation": "我什麼時候可以轉動這個輪子？", "wordKeys": ["when", "wheel"], "supportWords": [{"word": "I", "meaning": "我；固定大寫，讀/aɪ/。", "text": "can I spin", "audioKey": "support-2-1"}, {"word": "the", "meaning": "這個／那個；冠詞通常弱讀。", "text": "the wheel", "audioKey": "support-2-2"}], "id": "digraph-wh-sentence-2", "audioKey": "sentence-2", "supportNote": "先聽支援片語再讀整句；冠詞弱讀、功能詞與特別提示不作本課新規則考核。"},
    ],
  },
  {
    id: "digraph-ph",
    vowel: "ph",
    sound: "/f/",
    title: "子音字形 ph",
    description: "用四個合適單詞認識ph=/f/，不以多音節湊數。",
    introductionText: "聽 phone、graph、phrase 的完整單字，留意 /f/；先看本課目標字形，再完整逐音拼合。",
    pronunciationNote: "ph在本課讀/f/，只算一個C。phase/phrase的a_e讀/eɪ/，s在這兩詞讀/z/，先聽整字提示。phone的o_e是已學長O。",
    spellingLabel: "ph",
    prerequisites: ["已學五長短母音、基本單字母子音及第3章雙子音連綴。", "同一字形可含多個字母；拼字作答塊與音素數量分開看。", "已學長A的a_e、長O的o_e以及gr/fr連綴。", "phase/phrase的s=/z/先明示，本課不將photo、dolphin等尚未教音節規則列為考題。"],
    families: digraph_phFamilies,
    introductionWords: [word(digraph_phFamilies, "phone"), word(digraph_phFamilies, "graph"), word(digraph_phFamilies, "phrase")],
    questions: [
      { id: "digraph-ph-1-listen", kind: "listen", answer: word(digraph_phFamilies, "phone"), choices: ["graph", "phone", "phase"] },
      { id: "digraph-ph-2-spell", kind: "spell", answer: word(digraph_phFamilies, "phone"), choices: ["e", "n", "o", "ph", "p"] },
      { id: "digraph-ph-3-listen", kind: "listen", answer: word(digraph_phFamilies, "graph"), choices: ["graph", "phase", "phrase"] },
      { id: "digraph-ph-4-spell", kind: "spell", answer: word(digraph_phFamilies, "graph"), choices: ["ph", "a", "r", "g", "p"] },
      { id: "digraph-ph-5-listen", kind: "listen", answer: word(digraph_phFamilies, "phase"), choices: ["phrase", "phone", "phase"] },
      { id: "digraph-ph-6-spell", kind: "spell", answer: word(digraph_phFamilies, "phase"), choices: ["e", "s", "a", "ph", "p"] },
      { id: "digraph-ph-7-listen", kind: "listen", answer: word(digraph_phFamilies, "phrase"), choices: ["phase", "phrase", "graph"] },
      { id: "digraph-ph-8-spell", kind: "spell", answer: word(digraph_phFamilies, "phrase"), choices: ["e", "s", "a", "r", "ph", "p"] },
    ],
    sentences: [
      {"text": "The phone is on the desk.", "translation": "電話在書桌上。", "wordKeys": ["phone"], "supportWords": [{"word": "the", "meaning": "這個／那個；冠詞通常弱讀。", "text": "the phone", "audioKey": "support-1-1"}, {"word": "is", "meaning": "是／在；s在此讀/z/，先聽片語。", "text": "is on the desk", "audioKey": "support-1-2"}], "id": "digraph-ph-sentence-1", "audioKey": "sentence-1", "supportNote": "先聽支援片語再讀整句；冠詞弱讀、功能詞與特別提示不作本課新規則考核。"},
      {"text": "Say the phrase.", "translation": "說出這個片語。", "wordKeys": ["phrase"], "supportWords": [{"word": "the", "meaning": "這個／那個；冠詞通常弱讀。", "text": "the phrase", "audioKey": "support-2-1"}], "id": "digraph-ph-sentence-2", "audioKey": "sentence-2", "supportNote": "先聽支援片語再讀整句；冠詞弱讀、功能詞與特別提示不作本課新規則考核。"},
    ],
  },
  {
    id: "digraph-tch",
    vowel: "tch",
    sound: "/tʃ/",
    title: "子音字形 tch：比較 ch",
    description: "比較ch與tch同音的拼法；先聽完整單詞再選字形。",
    introductionText: "聽 catch、pitch、rich 的完整單字，留意 /tʃ/；先看本課目標字形，再完整逐音拼合。",
    pronunciationNote: "tch三字母一起表示/tʃ/，只算一個C。本課單音節詞在單一短母音後常見tch；much/rich是ch拼法，不教成毫無例外的規則。",
    spellingLabel: "tch → ch（複習）",
    prerequisites: ["已學五長短母音、基本單字母子音及第3章雙子音連綴。", "同一字形可含多個字母；拼字作答塊與音素數量分開看。", "已教ch=/tʃ/；本課另比較tch，不加入watch的特殊a讀音。"],
    families: digraph_tchFamilies,
    introductionWords: [word(digraph_tchFamilies, "catch"), word(digraph_tchFamilies, "pitch"), word(digraph_tchFamilies, "rich")],
    questions: [
      { id: "digraph-tch-1-listen", kind: "listen", answer: word(digraph_tchFamilies, "catch"), choices: ["catch", "match", "patch"] },
      { id: "digraph-tch-2-spell", kind: "spell", answer: word(digraph_tchFamilies, "match"), choices: ["tch", "a", "m", "p"] },
      { id: "digraph-tch-3-listen", kind: "listen", answer: word(digraph_tchFamilies, "fetch"), choices: ["pitch", "fetch", "hatch"] },
      { id: "digraph-tch-4-spell", kind: "spell", answer: word(digraph_tchFamilies, "pitch"), choices: ["tch", "i", "p", "n"] },
      { id: "digraph-tch-5-listen", kind: "listen", answer: word(digraph_tchFamilies, "rich"), choices: ["itch", "rich", "pitch"] },
      { id: "digraph-tch-6-spell", kind: "spell", answer: word(digraph_tchFamilies, "patch"), choices: ["tch", "a", "p", "n"] },
      { id: "digraph-tch-7-listen", kind: "listen", answer: word(digraph_tchFamilies, "lunch"), choices: ["much", "fetch", "lunch"] },
      { id: "digraph-tch-8-spell", kind: "spell", answer: word(digraph_tchFamilies, "itch"), choices: ["tch", "i", "p"] },
    ],
    sentences: [
      {"text": "Catch the ball.", "translation": "接住球。", "wordKeys": ["catch"], "supportWords": [{"word": "the", "meaning": "這個／那個；冠詞通常弱讀。", "text": "the ball", "audioKey": "support-1-1"}, {"word": "ball", "meaning": "球；all的母音尚未在本課教，先聽片語。", "text": "catch the ball", "audioKey": "support-1-2"}], "id": "digraph-tch-sentence-1", "audioKey": "sentence-1", "supportNote": "先聽支援片語再讀整句；冠詞弱讀、功能詞與特別提示不作本課新規則考核。"},
      {"text": "The patch is on the hat.", "translation": "補丁在帽子上。", "wordKeys": ["patch"], "supportWords": [{"word": "the", "meaning": "這個／那個；冠詞通常弱讀。", "text": "the patch", "audioKey": "support-2-1"}, {"word": "is", "meaning": "是／在；s在此讀/z/，先聽片語。", "text": "is on the hat", "audioKey": "support-2-2"}], "id": "digraph-tch-sentence-2", "audioKey": "sentence-2", "supportNote": "先聽支援片語再讀整句；冠詞弱讀、功能詞與特別提示不作本課新規則考核。"},
    ],
  },
];
