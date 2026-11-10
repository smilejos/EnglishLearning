import { describe, expect, it } from "vitest";
import { inflectedLessons } from "./phonicsInflectedLessons";

const vowels = new Set(["æ", "ɛ", "ɪ", "ɑ", "ʌ", "iː", "eɪ", "aɪ"]);
const allWords = inflectedLessons.flatMap(({ families }) => families.flatMap(({ words }) => words));
const byWord = new Map(allWords.map((word) => [word.word, word]));
describe("字尾變化教材", () => {
  it("四課依先備排序，按字尾聲音與拼字分組，不假稱同韻尾字族", () => {
    expect(inflectedLessons.map(({ id }) => id)).toEqual(["endings-s", "endings-es", "endings-ed", "endings-ing"]);
    expect(inflectedLessons.map(({ families }) => families.flatMap(({ words }) => words).length)).toEqual([8, 8, 9, 8]);
    expect(byWord.size).toBe(33);
    for (const lesson of inflectedLessons) expect(lesson.groupLabel).toBe("詞組");
  });
  for (const lesson of inflectedLessons) {
    const words = lesson.families.flatMap(({ words }) => words);
    const dictionary = new Map(words.map((word) => [word.word, word]));
    it(`${lesson.id} 的字尾位置、完整音素與所有字形可對應`, () => {
      for (const family of lesson.families) for (const word of family.words) {
        expect(word.familyId).toBe(family.id);
        expect(word.phonemes.map((p) => vowels.has(p) ? "V" : "C").join("")).toBe(word.structure);
        const covered: number[] = [];
        for (const { text, ranges } of word.graphemes) {
          expect(ranges.map(({ start, end }) => word.word.slice(start, end)).join("")).toBe(text);
          for (const { start, end } of ranges) {
            expect(start).toBeGreaterThanOrEqual(0);
            expect(end).toBeGreaterThan(start);
            expect(end).toBeLessThanOrEqual(word.word.length);
            for (let i = start; i < end; i++) covered.push(i);
          }
        }
        expect(covered.sort((a, b) => a - b)).toEqual(Array.from({ length: word.word.length }, (_, i) => i));
        expect(word.targetRanges).toEqual([{ start: word.word.length - family.spelling!.length, end: word.word.length }]);
        expect(word.word.slice(word.targetRanges[0].start)).toBe(family.spelling);
        expect(word.spellingUnits!.join("")).toBe(word.word);
        expect(word.inflection?.suffix).toBe(`-${family.spelling}`);
        expect(word.inflection?.baseWord).toBeTruthy();
        expect(word.inflection?.note).toBeTruthy();
      }
    });
    it(`${lesson.id} 三示範八題兩句，選字答案唯一且拼字塊足夠`, () => {
      expect(lesson.introductionWords).toHaveLength(3);
      for (const word of lesson.introductionWords) expect(dictionary.get(word.word)).toBe(word);
      expect(lesson.questions).toHaveLength(8);
      expect(lesson.questions.filter(({ kind }) => kind === "listen")).toHaveLength(4);
      expect(new Set(lesson.questions.map(({ id }) => id)).size).toBe(8);
      for (const question of lesson.questions) {
        expect(dictionary.get(question.answer.word)).toBe(question.answer);
        if (question.kind === "listen") {
          expect(new Set(question.choices).size).toBe(question.choices.length);
          expect(question.choices.filter((choice) => choice === question.answer.word)).toHaveLength(1);
          for (const choice of question.choices) {
            expect(dictionary.has(choice)).toBe(true);
            if (choice !== question.answer.word) expect(dictionary.get(choice)!.phonemes).not.toEqual(question.answer.phonemes);
          }
        } else {
          const remaining = [...question.choices];
          for (const unit of question.answer.spellingUnits!) {
            const i = remaining.indexOf(unit);
            expect(i).toBeGreaterThanOrEqual(0);
            remaining.splice(i, 1);
          }
        }
      }
      expect(lesson.sentences).toHaveLength(2);
      for (const sentence of lesson.sentences) {
        const tokens = sentence.text.toLowerCase().match(/[a-z]+/g)!;
        expect(sentence.translation).toBeTruthy();
        for (const key of sentence.wordKeys) {
          expect(dictionary.has(key)).toBe(true);
          expect(tokens).toContain(key);
        }
        for (const support of sentence.supportWords ?? []) {
          expect(sentence.text.toLowerCase()).toContain(support.text.toLowerCase());
          expect(support.meaning).toBeTruthy();
        }
        const supported = sentence.supportWords!.flatMap(({ text }) => text.toLowerCase().match(/[a-z]+/g)!);
        for (const token of tokens) expect([...sentence.wordKeys, ...supported]).toContain(token);
      }
    });
  }
  it("不把字母數當音素數：x兩個C、tch和雙寫子音一個C，ng只有/ŋ/", () => {
    expect(byWord.get("boxes")!.phonemes).toEqual(["b", "ɑ", "k", "s", "ɪ", "z"]);
    expect(byWord.get("matches")!.phonemes).toEqual(["m", "æ", "tʃ", "ɪ", "z"]);
    expect(byWord.get("tapped")!.phonemes).toEqual(["t", "æ", "p", "t"]);
    expect(byWord.get("making")!.phonemes).toEqual(["m", "eɪ", "k", "ɪ", "ŋ"]);
    expect(byWord.get("riding")!.phonemes).toEqual(["r", "aɪ", "d", "ɪ", "ŋ"]);
    for (const word of inflectedLessons[3].families.flatMap(({ words }) => words)) {
      expect(word.phonemes.slice(-2)).toEqual(["ɪ", "ŋ"]);
      expect(word.graphemes.slice(-2).map(({ kind }) => kind)).toEqual(["vowel", "consonant"]);
    }
  });
  it("-s與-ed依最後聲音分讀法，es與多音節ed不誤標單一C", () => {
    for (const [index, sound] of ["s", "z"].entries())
      for (const word of inflectedLessons[0].families[index].words) expect(word.phonemes.at(-1)).toBe(sound);
    for (const word of inflectedLessons[1].families.flatMap(({ words }) => words)) {
      expect(word.phonemes.slice(-2)).toEqual(["ɪ", "z"]);
      expect(word.graphemes.slice(-2).map(({ kind }) => kind)).toEqual(["vowel", "consonant"]);
    }
    for (const [index, ending] of [["t"], ["d"], ["ɪ", "d"]].entries())
      for (const word of inflectedLessons[2].families[index].words) expect(word.phonemes.slice(-ending.length)).toEqual(ending);
  });
});
