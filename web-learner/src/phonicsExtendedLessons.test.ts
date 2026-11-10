import { describe, expect, it } from "vitest";
import { digraphLessons } from "./phonicsDigraphLessons";
import { rControlledLessons } from "./phonicsRControlledLessons";

const lessons = [...digraphLessons, ...rControlledLessons];
const vowelPhonemes = new Set(["æ", "ɛ", "ɪ", "ɑ", "ɔ", "ʌ", "iː", "eɪ", "aɪ", "oʊ", "uː"]);
const targetSounds: Record<string, string> = { sh: "ʃ", ch: "tʃ", th: "θ", wh: "w", ph: "f", tch: "tʃ" };

describe("第4、5章教材的音形與練習完整性", () => {
  it("各課按確認順序提供，未擴入其他R控制母音", () => {
    expect(digraphLessons.map(({ id }) => id)).toEqual(["digraph-sh", "digraph-ch", "digraph-th-voiceless", "digraph-th-voiced", "digraph-wh", "digraph-ph", "digraph-tch"]);
    expect(rControlledLessons.map(({ id }) => id)).toEqual(["r-ar", "r-or", "r-ore-oar"]);
  });

  for (const lesson of lessons) {
    const words = lesson.families.flatMap(({ words }) => words);
    const dictionary = new Map(words.map((word) => [word.word, word]));
    it(`${lesson.id} 的字形完整覆蓋拼寫，音素數與結構一致`, () => {
      expect(new Set(words.map(({ word }) => word)).size).toBe(words.length);
      expect(new Set(lesson.families.map(({ id }) => id)).size).toBe(lesson.families.length);
      expect(lesson.prerequisites.length).toBeGreaterThan(0);
      for (const family of lesson.families) {
        expect(family.words.length).toBeGreaterThan(0);
        for (const word of family.words) {
          expect(word.familyId).toBe(family.id);
          expect(word.word.endsWith(family.label.slice(1))).toBe(true);
          const positions = new Set<number>();
          for (const grapheme of word.graphemes) {
            expect(grapheme.ranges.map(({ start, end }) => word.word.slice(start, end)).join("")).toBe(grapheme.text.replace("_", ""));
            for (const { start, end } of grapheme.ranges) {
              expect(start).toBeGreaterThanOrEqual(0);
              expect(end).toBeGreaterThan(start);
              expect(end).toBeLessThanOrEqual(word.word.length);
              for (let p = start; p < end; p++) {
                expect(positions.has(p)).toBe(false);
                positions.add(p);
              }
            }
          }
          expect([...positions].sort((a, b) => a - b)).toEqual(Array.from({ length: word.word.length }, (_, i) => i));
          expect(word.phonemes.map((p) => vowelPhonemes.has(p) ? "V" : "C").join("")).toBe(word.structure);
          expect(word.spellingUnits!.join("")).toBe(word.word);
          const target = word.targetRanges.map(({ start, end }) => word.word.slice(start, end)).join("");
          expect(target).toBe(family.spelling);
          if (lesson.id.startsWith("digraph-")) {
            const sound = lesson.id === "digraph-th-voiced" ? "ð" : targetSounds[target];
            expect(word.phonemes).toContain(sound);
            expect(word.phonemes.filter((p) => p === sound)).toHaveLength(1);
            expect(word.graphemes.find(({ text }) => text === target)?.kind).toBe("consonant");
          } else {
            const vowelIndex = word.phonemes.indexOf(lesson.id === "r-ar" ? "ɑ" : "ɔ");
            expect(vowelIndex).toBeGreaterThanOrEqual(0);
            expect(word.phonemes[vowelIndex + 1]).toBe("r");
            expect(word.structure[vowelIndex + 1]).toBe("C");
          }
        }
      }
    });

    it(`${lesson.id} 的三示範、八題、兩句引用已教內容且答案可唯一作答`, () => {
      expect(lesson.introductionWords).toHaveLength(3);
      expect(lesson.questions).toHaveLength(8);
      expect(lesson.questions.filter(({ kind }) => kind === "listen")).toHaveLength(4);
      expect(lesson.questions.filter(({ kind }) => kind === "spell")).toHaveLength(4);
      expect(new Set(lesson.questions.map(({ id }) => id)).size).toBe(8);
      for (const word of lesson.introductionWords) expect(dictionary.get(word.word)).toBe(word);
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
          const available = [...question.choices];
          for (const unit of question.answer.spellingUnits!) {
            const i = available.indexOf(unit);
            expect(i).toBeGreaterThanOrEqual(0);
            available.splice(i, 1);
          }
        }
      }
      expect(lesson.sentences).toHaveLength(2);
      const audioKeys = new Set<string>();
      for (const sentence of lesson.sentences) {
        expect(sentence.translation.length).toBeGreaterThan(0);
        expect(sentence.supportNote.length).toBeGreaterThan(0);
        expect(audioKeys.has(sentence.audioKey)).toBe(false);
        audioKeys.add(sentence.audioKey);
        const tokens = sentence.text.toLowerCase().match(/[a-z]+/gu)!;
        for (const key of sentence.wordKeys) {
          expect(dictionary.has(key)).toBe(true);
          expect(tokens).toContain(key);
        }
        for (const support of sentence.supportWords ?? []) {
          expect(sentence.text.toLowerCase()).toContain(support.text.toLowerCase());
          expect(support.meaning.length).toBeGreaterThan(0);
          expect(audioKeys.has(support.audioKey)).toBe(false);
          audioKeys.add(support.audioKey);
        }
      }
    });
  }

  it("分開有聲/無聲th；bathe的不連續母音與目標th彼此獨立", () => {
    const voiced = digraphLessons.find(({ id }) => id === "digraph-th-voiced")!;
    const clear = digraphLessons.find(({ id }) => id === "digraph-th-voiceless")!;
    expect(voiced.families.flatMap(({ words }) => words).every(({ phonemes }) => phonemes.includes("ð") && !phonemes.includes("θ"))).toBe(true);
    expect(clear.families.flatMap(({ words }) => words).every(({ phonemes }) => phonemes.includes("θ") && !phonemes.includes("ð"))).toBe(true);
    const bathe = voiced.families.flatMap(({ words }) => words).find(({ word }) => word === "bathe")!;
    expect(bathe.graphemes.find(({ text }) => text === "a_e")?.ranges).toEqual([{ start: 1, end: 2 }, { start: 4, end: 5 }]);
    expect(bathe.targetRanges).toEqual([{ start: 2, end: 4 }]);
    expect(bathe.spellingUnits).toEqual(["b", "a", "th", "e"]);
  });

  it("wh採美式/w/並排除who；phone保留已教o_e；tch只計一個C", () => {
    const all = new Map(lessons.flatMap(({ families }) => families.flatMap(({ words }) => words)).map((word) => [word.word, word]));
    expect(all.has("who")).toBe(false);
    expect(all.get("white")!.phonemes).toEqual(["w", "aɪ", "t"]);
    expect(all.get("phone")!.graphemes.find(({ text }) => text === "o_e")?.ranges).toEqual([{ start: 2, end: 3 }, { start: 4, end: 5 }]);
    expect(all.get("catch")!.structure).toBe("CVC");
    expect(all.get("itch")!.structure).toBe("VC");
  });

  it("ore/oar是相連字形的/ɔ/加/r/，不誤套o_e且同音詞不造成選字雙解", () => {
    const lesson = rControlledLessons[2];
    const words = lesson.families.flatMap(({ words }) => words);
    for (const word of words) expect(word.graphemes.some(({ text }) => text === "o_e")).toBe(false);
    const oar = words.find(({ word }) => word === "oar")!;
    expect(oar.phonemes).toEqual(["ɔ", "r"]);
    expect(oar.structure).toBe("VC");
    expect(oar.graphemes).toHaveLength(1);
    expect(words.find(({ word }) => word === "sore")!.phonemes).toEqual(words.find(({ word }) => word === "soar")!.phonemes);
    for (const q of lesson.questions.filter(({ kind }) => kind === "listen")) expect(q.choices.includes("sore") && q.choices.includes("soar")).toBe(false);
  });
});
