import { describe, expect, it } from "vitest";
import { shortAFamilies, shortAIntroductionWords, shortAQuestions, shortASentences, studyWords } from "./phonicsLesson";

describe("短母音 a 字族教材完整性", () => {
  it("三個字族保留使用者指定的 5／5／4 詞，課程共十四個不重複詞", () => {
    expect(shortAFamilies.map(({ label, words }) => [label, words.length])).toEqual([["-at", 5], ["-an", 5], ["-ap", 4]]);
    expect(new Set(shortAFamilies.map(({ id }) => id)).size).toBe(3);
    expect(studyWords).toHaveLength(14);
    expect(new Set(studyWords.map(({ word }) => word)).size).toBe(14);
    for (const family of shortAFamilies) {
      for (const entry of family.words) {
        expect(entry.familyId).toBe(family.id);
        expect(entry.word.endsWith(family.label.slice(1))).toBe(true);
      }
    }
    expect(new Set(shortAIntroductionWords.map(({ familyId }) => familyId)).size).toBe(3);
  });

  it("每詞字形範圍完整覆蓋原拼寫，目標母音及聲音結構彼此一致", () => {
    for (const entry of studyWords) {
      const covered = new Set<number>();
      let structure = "";
      for (const grapheme of entry.graphemes) {
        const chunks: string[] = [];
        for (const { start, end } of grapheme.ranges) {
          expect(Number.isInteger(start) && Number.isInteger(end)).toBe(true);
          expect(start).toBeGreaterThanOrEqual(0);
          expect(end).toBeGreaterThan(start);
          expect(end).toBeLessThanOrEqual(entry.word.length);
          chunks.push(entry.word.slice(start, end));
          for (let position = start; position < end; position++) {
            expect(covered.has(position)).toBe(false);
            covered.add(position);
          }
        }
        expect(chunks.join("")).toBe(grapheme.text);
        structure += grapheme.kind === "vowel" ? "V" : "C";
      }
      expect(covered.size).toBe(entry.word.length);
      expect(structure).toBe(entry.structure);
      expect(entry.phonemes).toHaveLength(entry.structure.length);
      expect(entry.phonemes.filter((phoneme) => phoneme === "æ")).toHaveLength(1);
      expect(entry.targetRanges.map(({ start, end }) => entry.word.slice(start, end)).join("")).toBe("a");
      expect(entry.targetRanges).toEqual(entry.graphemes.find(({ kind }) => kind === "vowel")!.ranges);
    }
  });

  it("八題及兩短句只引用本課有效詞，選字正解唯一且拼字所需字母足夠", () => {
    const dictionary = new Map(studyWords.map((entry) => [entry.word, entry]));
    expect(shortAQuestions).toHaveLength(8);
    expect(new Set(shortAQuestions.map(({ id }) => id)).size).toBe(8);
    expect(shortAQuestions.filter(({ kind }) => kind === "listen")).toHaveLength(4);
    expect(shortAQuestions.filter(({ kind }) => kind === "spell")).toHaveLength(4);
    for (const question of shortAQuestions) {
      expect(dictionary.get(question.answer.word)).toBe(question.answer);
      if (question.kind === "listen") {
        expect(question.choices.filter((choice) => choice === question.answer.word)).toHaveLength(1);
        expect(new Set(question.choices).size).toBe(question.choices.length);
        for (const choice of question.choices) {
          expect(dictionary.has(choice)).toBe(true);
          if (choice !== question.answer.word) expect(dictionary.get(choice)!.phonemes).not.toEqual(question.answer.phonemes);
        }
      } else {
        const remaining = [...question.choices];
        for (const letter of question.answer.word) {
          const available = remaining.indexOf(letter);
          expect(available).toBeGreaterThanOrEqual(0);
          remaining.splice(available, 1);
        }
      }
    }
    expect(shortASentences).toHaveLength(2);
    expect(new Set(shortASentences.map(({ audioKey }) => audioKey)).size).toBe(2);
    for (const sentence of shortASentences) {
      const tokens = sentence.text.toLowerCase().match(/[a-z]+/gu)!;
      expect(sentence.translation.length).toBeGreaterThan(0);
      expect(sentence.supportNote.length).toBeGreaterThan(0);
      for (const word of sentence.wordKeys) {
        expect(tokens).toContain(word);
        expect(dictionary.has(word)).toBe(true);
      }
    }
  });
});
