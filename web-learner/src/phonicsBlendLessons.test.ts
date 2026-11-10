import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { blendLessons } from "./phonicsBlendLessons";

const entries = JSON.parse(readFileSync(resolve("../source/vocabulary-database.json"), "utf8")).entries as { word: string; guid: string }[];
const dictionary = new Map(entries.map((entry) => [entry.word.toLowerCase(), entry]));
const vowels = new Set(["æ", "ɛ", "ɪ", "ɑ", "ʌ", "eɪ", "aɪ", "oʊ", "iː", "uː"]);

describe("第三章子音連音教材", () => {
  it("依 L、R、S、字尾、三子音漸進，完整涵蓋指定連音組且不稱字族", () => {
    expect(blendLessons.map(({ id }) => id)).toEqual(["blends-l", "blends-r", "blends-s", "blends-final", "blends-three"]);
    expect(blendLessons.map(({ families }) => families.map(({ label }) => label))).toEqual([
      ["bl-", "cl-", "fl-", "gl-", "pl-", "sl-"],
      ["br-", "cr-", "dr-", "fr-", "gr-", "pr-", "tr-"],
      ["sk-", "sm-", "sn-", "sp-", "st-", "sw-"],
      ["-nd", "-nt", "-mp", "-st", "-ft"], ["scr-", "spl-", "spr-", "str-"],
    ]);
    expect(blendLessons.map(({ families }) => families.flatMap(({ words }) => words).length)).toEqual([12, 14, 12, 10, 6]);
    for (const lesson of blendLessons) for (const group of lesson.families) expect(group.description).toContain("連音組");
  });

  for (const lesson of blendLessons) {
    const words = lesson.families.flatMap(({ words }) => words);
    const byWord = new Map(words.map((word) => [word.word, word]));
    it(`${lesson.id} 的音形完整，目標位置指向實際字首或字尾，且全為已有詞條`, () => {
      expect(new Set(words.map(({ word }) => word)).size).toBe(words.length);
      for (const group of lesson.families) for (const word of group.words) {
        expect(dictionary.get(word.word)?.guid).toMatch(/^[a-f0-9-]{36}$/u);
        expect(word.familyId).toBe(group.id);
        expect(word.phonemes.map((phoneme) => vowels.has(phoneme) ? "V" : "C").join("")).toBe(word.structure);
        const covered = new Set<number>();
        for (const grapheme of word.graphemes) {
          const text = grapheme.ranges.map(({ start, end }) => {
            expect(start).toBeGreaterThanOrEqual(0);
            expect(end).toBeGreaterThan(start);
            expect(end).toBeLessThanOrEqual(word.word.length);
            for (let position = start; position < end; position++) {
              expect(covered.has(position)).toBe(false);
              covered.add(position);
            }
            return word.word.slice(start, end);
          }).join("");
          expect(text).toBe(grapheme.text.replace("_", ""));
        }
        expect(covered.size).toBe(word.word.length);
        expect(word.graphemes.map(({ kind }) => kind === "vowel" ? "V" : "C").join("")).toBe(word.structure);
        expect(word.targetRanges.map(({ start, end }) => word.word.slice(start, end)).join("")).toBe(group.spelling);
        const target = word.targetRanges[0];
        if (lesson.id === "blends-final") expect(target.end).toBe(word.word.length);
        else expect(target.start).toBe(0);
        expect((word.spellingUnits ?? []).join("")).toBe(word.word);
        // 不把後續章節的多字母子音或 r 母音偷渡成前課練習先備。
        expect(word.word).not.toMatch(/sh|ch|th|ph|wh|tch|ck|ng|ar|or|er|ir|ur/u);
      }
    });

    it(`${lesson.id} 有三示範及八題；聽辨只用本課詞，拼字含足夠獨立作答塊`, () => {
      expect(lesson.introductionWords).toHaveLength(3);
      for (const word of lesson.introductionWords) expect(byWord.get(word.word)).toBe(word);
      expect(lesson.questions).toHaveLength(8);
      expect(lesson.questions.filter(({ kind }) => kind === "listen")).toHaveLength(4);
      expect(lesson.questions.filter(({ kind }) => kind === "spell")).toHaveLength(4);
      expect(new Set(lesson.questions.map(({ id }) => id)).size).toBe(8);
      for (const question of lesson.questions) {
        expect(byWord.get(question.answer.word)).toBe(question.answer);
        if (question.kind === "listen") {
          expect(question.choices.filter((word) => word === question.answer.word)).toHaveLength(1);
          expect(new Set(question.choices).size).toBe(question.choices.length);
          for (const choice of question.choices) {
            expect(byWord.has(choice)).toBe(true);
            if (choice !== question.answer.word) expect(byWord.get(choice)!.phonemes).not.toEqual(question.answer.phonemes);
          }
        } else {
          const remaining = [...question.choices];
          for (const unit of question.answer.spellingUnits!) {
            const index = remaining.indexOf(unit);
            expect(index).toBeGreaterThanOrEqual(0);
            remaining.splice(index, 1);
          }
        }
      }
    });

    it(`${lesson.id} 的兩短句有有效重點詞，額外用詞皆有可播放片語示範`, () => {
      expect(lesson.sentences).toHaveLength(2);
      for (const sentence of lesson.sentences) {
        expect(sentence.translation.length).toBeGreaterThan(0);
        const tokens = sentence.text.toLowerCase().match(/[a-z]+/gu)!;
        for (const word of sentence.wordKeys) {
          expect(byWord.has(word)).toBe(true);
          expect(tokens).toContain(word);
        }
        const supportedTokens = sentence.supportWords!.flatMap(({ text, audioKey, meaning }) => {
          expect(audioKey).toMatch(/^support-/u);
          expect(meaning.length).toBeGreaterThan(0);
          return text.toLowerCase().match(/[a-z]+/gu)!;
        });
        for (const token of tokens) expect([...sentence.wordKeys, ...supportedTokens]).toContain(token);
      }
    });
  }

  it("保留 VCC、CCV、CCCV 及重複字母，並對自然美語連讀提供說明", () => {
    const words = blendLessons.flatMap(({ families }) => families.flatMap(({ words }) => words));
    expect(words.find(({ word }) => word === "ant")!.structure).toBe("VCC");
    expect(words.find(({ word }) => word === "tree")!.structure).toBe("CCV");
    expect(words.find(({ word }) => word === "spray")!.structure).toBe("CCCV");
    const tent = blendLessons[3].questions.find(({ kind, answer }) => kind === "spell" && answer.word === "tent")!;
    expect(tent.choices.filter((unit) => unit === "t")).toHaveLength(2);
    expect(blendLessons[1].pronunciationNote).toContain("[tʃɹ]");
    expect(blendLessons[1].pronunciationNote).toContain("[dʒɹ]");
    expect(blendLessons[2].pronunciationNote).toContain("不送氣");
  });
});
