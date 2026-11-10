import { describe, expect, it } from "vitest";
import audioPlan from "../../docs/phonics/preparation/short-vowels/audio-plan.json";
import longAudioPlan from "../../docs/phonics/preparation/long-vowels/audio-plan.json";
import chapter345AudioPlan from "../../docs/phonics/preparation/phonics-345/audio-plan.json";
import { getPhonicsLesson, lessonWords, phonicsLessons, shortAFamilies, shortAIntroductionWords, shortAQuestions, shortASentences, studyWords } from "./phonicsLesson";

const shortLessons = phonicsLessons.filter(({ id }) => id.startsWith("short-"));

describe("短母音 a 字族教材完整性", () => {
  it("三個字族保留使用者指定的 5／5／4 詞，課程共十四個不重複詞", () => {
    expect(shortAFamilies.map(({ label, words }) => [label, words.length])).toEqual([["-at", 5], ["-an", 5], ["-ap", 4]]);
    expect(new Set(shortAFamilies.map(({ id }) => id)).size).toBe(3);
    expect(studyWords).toHaveLength(14);
    expect(new Set(studyWords.map(({ word }) => word)).size).toBe(14);
    for (const family of shortAFamilies) {
      for (const entry of family.words) {
        expect(entry.familyId).toBe(family.id);
        expect(entry.word.endsWith(family.label.slice(1).split("（")[0])).toBe(true);
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

describe("五短母音課程資料", () => {
  it("音訊製作計畫與五課所有實際播放用途完全一致，不多產、漏音或配錯文字", () => {
    expect(audioPlan.lessons.map(({ id }) => id).sort()).toEqual(shortLessons.map(({ id }) => id).sort());
    for (const lesson of shortLessons) {
      type Requirement = { key: string; kind: string; text: string };
      const requirements = new Map<string, Requirement>();
      const add = (requirement: Requirement) => {
        const previous = requirements.get(requirement.key);
        // 同一整字可跨階段重用，同一 key 不得對應不同用途或文字。
        if (previous) expect(previous).toEqual(requirement);
        requirements.set(requirement.key, requirement);
      };
      const words = lessonWords(lesson);
      const dictionary = new Map(words.map((word) => [word.word, word]));
      for (const word of [...words, ...lesson.introductionWords, ...lesson.questions.map(({ answer }) => answer)]) {
        add({ key: word.word, kind: "word", text: word.word });
      }
      for (const sentence of lesson.sentences) {
        add({ key: sentence.audioKey, kind: "sentence", text: sentence.text });
        for (const key of sentence.wordKeys) {
          expect(dictionary.has(key)).toBe(true);
          add({ key, kind: "word", text: dictionary.get(key)!.word });
        }
        for (const support of sentence.supportWords ?? []) add({ key: support.audioKey, kind: "support", text: support.text });
      }
      const plan = audioPlan.lessons.find(({ id }) => id === lesson.id)!;
      expect(new Set(plan.jobs.map(({ key }) => key)).size).toBe(plan.jobs.length);
      const byKey = (left: Requirement, right: Requirement) => left.key.localeCompare(right.key);
      expect(plan.jobs.map(({ key, kind, text }) => ({ key, kind, text })).sort(byKey)).toEqual([...requirements.values()].sort(byKey));
    }
  });

  it("保留短 a 並依 A／E／I／O／U 順序提供獨立課程", () => {
    expect(shortLessons.map(({ id }) => id)).toEqual(["short-a", "short-e", "short-i", "short-o", "short-u"]);
    expect(shortLessons.map((lesson) => lessonWords(lesson).length)).toEqual([14, 11, 12, 8, 11]);
    expect(getPhonicsLesson("short-a")!.families).toBe(shortAFamilies);
    expect(getPhonicsLesson("unknown")).toBeUndefined();
  });

  for (const lesson of shortLessons) {
    it(`${lesson.id} 的字族、完整拼讀與實際目標母音一致`, () => {
      const words = lessonWords(lesson);
      expect(new Set(words.map(({ word }) => word)).size).toBe(words.length);
      expect(lesson.introductionWords).toHaveLength(3);
      expect(lesson.prerequisites.length).toBeGreaterThan(0);
      expect(lesson.introductionText).toContain(lesson.sound);
      expect(lesson.pronunciationNote).toContain(lesson.sound);
      for (const family of lesson.families) {
        expect(family.words.length).toBeGreaterThan(0);
        for (const entry of family.words) {
          expect(entry.familyId).toBe(family.id);
          expect(entry.meaning.length).toBeGreaterThan(0);
          expect(entry.word.endsWith(family.label.slice(1).split("（")[0])).toBe(true);
          expect(`/${entry.phonemes.slice(1).join("")}/`).toBe(family.rime);
          expect(entry.structure).toBe("CVC");
          expect(entry.graphemes.map(({ text }) => text).join("")).toBe(entry.word);
          expect(entry.graphemes.map(({ ranges }) => ranges)).toEqual([
            [{ start: 0, end: 1 }], [{ start: 1, end: 2 }], [{ start: 2, end: 3 }],
          ]);
          expect(entry.targetRanges).toEqual([{ start: 1, end: 2 }]);
          expect(entry.word.slice(1, 2)).toBe(lesson.vowel);
          expect(entry.phonemes).toHaveLength(3);
          expect(`/${entry.phonemes[1]}/`).toBe(lesson.sound);
        }
      }
      for (const introduction of lesson.introductionWords) expect(words).toContain(introduction);
    });

    it(`${lesson.id} 八題正解唯一、拼字塊足夠，兩句的支援詞另有可聽片語`, () => {
      const dictionary = new Map(lessonWords(lesson).map((entry) => [entry.word, entry]));
      expect(lesson.questions).toHaveLength(8);
      expect(lesson.questions.filter(({ kind }) => kind === "listen")).toHaveLength(4);
      expect(lesson.questions.filter(({ kind }) => kind === "spell")).toHaveLength(4);
      expect(new Set(lesson.questions.map(({ id }) => id)).size).toBe(8);
      for (const question of lesson.questions) {
        expect(dictionary.get(question.answer.word)).toBe(question.answer);
        if (question.kind === "listen") {
          expect(question.choices.filter((choice) => choice === question.answer.word)).toHaveLength(1);
          expect(new Set(question.choices).size).toBe(question.choices.length);
          for (const choice of question.choices) {
            expect(dictionary.has(choice)).toBe(true);
            if (choice !== question.answer.word) expect(dictionary.get(choice)!.phonemes).not.toEqual(question.answer.phonemes);
          }
        } else {
          const available = [...question.choices];
          for (const letter of question.answer.word) {
            const index = available.indexOf(letter);
            expect(index).toBeGreaterThanOrEqual(0);
            available.splice(index, 1);
          }
        }
      }
      expect(lesson.sentences).toHaveLength(2);
      expect(new Set(lesson.sentences.map(({ audioKey }) => audioKey)).size).toBe(2);
      for (const sentence of lesson.sentences) {
        const tokens = sentence.text.toLowerCase().match(/[a-z]+/gu)!;
        expect(sentence.translation.length).toBeGreaterThan(0);
        expect(sentence.supportNote.length).toBeGreaterThan(0);
        for (const word of sentence.wordKeys) {
          expect(tokens).toContain(word);
          expect(dictionary.has(word)).toBe(true);
        }
        const supportWords = sentence.supportWords ?? [];
        for (const support of supportWords) {
          expect(tokens).toContain(support.word);
          expect(support.text.toLowerCase().split(" ")).toContain(support.word);
          expect(support.meaning.length).toBeGreaterThan(0);
          expect(support.audioKey.startsWith("support-")).toBe(true);
          expect(sentence.wordKeys).not.toContain(support.word);
        }
        for (const token of tokens) {
          expect([...sentence.wordKeys, ...supportWords.map(({ word }) => word)]).toContain(token);
        }
      }
    });
  }

  it("pop 的兩個 p 各自佔一個可取用作答塊", () => {
    const question = getPhonicsLesson("short-o")!.questions.find(({ answer, kind }) => answer.word === "pop" && kind === "spell")!;
    expect(question.choices.filter((letter) => letter === "p")).toHaveLength(2);
  });
});

describe("五長母音教材完整性", () => {
  it("五長課共55個不重複目標詞，實際音訊計畫與每個播放用途逐項一致", () => {
    const lessons = phonicsLessons.filter(({ id }) => id.startsWith("long-"));
    const words = lessons.flatMap(lessonWords);
    expect(words).toHaveLength(55);
    expect(new Set(words.map(({ word }) => word)).size).toBe(55);
    expect(longAudioPlan.lessons.map(({ id }) => id).sort()).toEqual(lessons.map(({ id }) => id).sort());
    for (const lesson of lessons) {
      const requirements = new Map<string, { key: string; kind: string; text: string }>();
      const add = (key: string, kind: string, text: string) => {
        const item = { key, kind, text };
        if (requirements.has(key)) expect(requirements.get(key)).toEqual(item);
        requirements.set(key, item);
      };
      for (const word of [...lessonWords(lesson), ...lesson.introductionWords, ...lesson.questions.map(({ answer }) => answer)]) add(word.word, "word", word.word);
      for (const sentence of lesson.sentences) {
        add(sentence.audioKey, "sentence", sentence.text);
        for (const word of sentence.wordKeys) add(word, "word", word);
        for (const support of sentence.supportWords ?? []) add(support.audioKey, "support", support.text);
      }
      const jobs = longAudioPlan.lessons.find(({ id }) => id === lesson.id)!.jobs;
      expect(new Set(jobs.map(({ key }) => key)).size).toBe(jobs.length);
      const byKey = (a: { key: string }, b: { key: string }) => a.key.localeCompare(b.key);
      expect(jobs.map(({ key, kind, text }) => ({ key, kind, text })).sort(byKey)).toEqual([...requirements.values()].sort(byKey));
    }
  });
  it("保留五短課，長 A／E／I／O／U 使用獨立課程", () => {
    expect(phonicsLessons.slice(0, 10).map(({ id }) => id)).toEqual(["short-a", "short-e", "short-i", "short-o", "short-u", "long-a", "long-e", "long-i", "long-o", "long-u"]);
    for (const vowel of ["a", "e", "i", "o", "u"]) {
      expect(getPhonicsLesson(`long-${vowel}`)).toBeDefined();
    }
  });

  for (const lesson of phonicsLessons.filter(({ id }) => id.startsWith("long-"))) {
    it(`${lesson.id} 拼法、字族、音素、字形位置與作答塊完整，八題與兩句只用已教詞`, () => {
      const words = lessonWords(lesson);
      const dictionary = new Map(words.map((entry) => [entry.word, entry]));
      expect(dictionary.size).toBe(words.length);
      expect(lesson.introductionWords).toHaveLength(3);
      expect(lesson.prerequisites.length).toBeGreaterThan(0);
      for (const entry of lesson.introductionWords) expect(dictionary.get(entry.word)).toBe(entry);
      for (const family of lesson.families) {
        expect(family.spelling?.length).toBeGreaterThan(0);
        expect(family.words.length).toBeGreaterThan(0);
        for (const entry of family.words) {
          expect(entry.familyId).toBe(family.id);
          expect(entry.word.endsWith(family.label.slice(1).split("（")[0])).toBe(true);
          expect(entry.meaning.length).toBeGreaterThan(0);
          expect(entry.structure).toMatch(/^[CV]+$/);
          expect(entry.phonemes).toHaveLength(entry.structure.length);
          const positions = entry.graphemes.flatMap(({ ranges }) => ranges.flatMap(({ start, end }) => Array.from({ length: end - start }, (_, i) => start + i)));
          expect(positions.sort((a, b) => a - b)).toEqual(Array.from({ length: entry.word.length }, (_, i) => i));
          for (const grapheme of entry.graphemes) {
            expect(grapheme.ranges.map(({ start, end }) => entry.word.slice(start, end)).join("")).toBe(grapheme.text.replace(/_/g, ""));
          }
          for (const range of entry.targetRanges) {
            expect(range.start).toBeGreaterThanOrEqual(0);
            expect(range.end).toBeGreaterThan(range.start);
            expect(range.end).toBeLessThanOrEqual(entry.word.length);
          }
          expect((entry.spellingUnits ?? Array.from(entry.word)).join("")).toBe(entry.word);
        }
      }
      expect(lesson.questions).toHaveLength(8);
      expect(lesson.questions.filter(({ kind }) => kind === "listen")).toHaveLength(4);
      expect(lesson.questions.filter(({ kind }) => kind === "spell")).toHaveLength(4);
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
          for (const unit of question.answer.spellingUnits ?? Array.from(question.answer.word)) {
            const index = remaining.indexOf(unit);
            expect(index).toBeGreaterThanOrEqual(0);
            remaining.splice(index, 1);
          }
        }
      }
      expect(lesson.sentences).toHaveLength(2);
      for (const sentence of lesson.sentences) {
        const tokens = sentence.text.toLowerCase().match(/[a-z]+/gu)!;
        for (const key of sentence.wordKeys) { expect(dictionary.has(key)).toBe(true); expect(tokens).toContain(key); }
        const supports = sentence.supportWords ?? [];
        for (const token of tokens) expect([...sentence.wordKeys, ...supports.flatMap(({ word }) => word.toLowerCase().match(/[a-z]+/gu) ?? [])]).toContain(token);
        for (const support of supports) {
          const supportTokens = support.text.toLowerCase().match(/[a-z]+/gu) ?? [];
          for (const token of support.word.toLowerCase().match(/[a-z]+/gu) ?? []) expect(supportTokens).toContain(token);
          expect(support.meaning.length).toBeGreaterThan(0);
        }
      }
    });
  }
});


describe("第三至五章教材完整性", () => {
  const newLessons = phonicsLessons.filter(({ id }) => /^(blends-|digraph-|r-)/.test(id));
  it("第三至五章音訊計畫逐項對應全部四階段用途，不缺件或為同一詞重複產音", () => {
    expect(chapter345AudioPlan.lessons.map(({ id }) => id).sort()).toEqual(newLessons.map(({ id }) => id).sort());
    for (const lesson of newLessons) {
      type Requirement = { key: string; kind: string; text: string };
      const requirements = new Map<string, Requirement>();
      const add = (item: Requirement) => {
        const previous = requirements.get(item.key);
        if (previous) expect(previous).toEqual(item);
        requirements.set(item.key, item);
      };
      for (const word of [...lessonWords(lesson), ...lesson.introductionWords, ...lesson.questions.map(({ answer }) => answer)]) add({ key: word.word, kind: "word", text: word.word });
      for (const sentence of lesson.sentences) {
        add({ key: sentence.audioKey, kind: "sentence", text: sentence.text });
        for (const support of sentence.supportWords ?? []) add({ key: support.audioKey, kind: "support", text: support.text });
      }
      const plan = chapter345AudioPlan.lessons.find(({ id }) => id === lesson.id)!;
      expect(new Set(plan.jobs.map(({ key }) => key)).size).toBe(plan.jobs.length);
      const byKey = (left: Requirement, right: Requirement) => left.key.localeCompare(right.key);
      expect(plan.jobs.map(({ key, kind, text }) => ({ key, kind, text })).sort(byKey)).toEqual([...requirements.values()].sort(byKey));
    }
  });
  it("保留前十課並依教學順序提供十五個新課程", () => {
    expect(phonicsLessons).toHaveLength(29);
    expect(newLessons.map(({ id }) => id)).toEqual([
      "blends-l", "blends-r", "blends-s", "blends-final", "blends-three",
      "digraph-sh", "digraph-ch", "digraph-th-voiceless", "digraph-th-voiced", "digraph-wh", "digraph-ph", "digraph-tch",
      "r-ar", "r-or", "r-ore-oar",
    ]);
    expect(new Set(phonicsLessons.map(({ id }) => id)).size).toBe(29);
  });
  for (const lesson of newLessons) {
    it(`${lesson.id} 所有字形有明確目標、音素結構與完整拼字塊，練習和短句只引用本課詞`, () => {
      const words = lessonWords(lesson);
      const dictionary = new Map(words.map((entry) => [entry.word, entry]));
      expect(dictionary.size).toBe(words.length);
      expect(lesson.prerequisites.length).toBeGreaterThan(0);
      expect(lesson.introductionWords).toHaveLength(3);
      for (const entry of lesson.introductionWords) expect(dictionary.get(entry.word)).toBe(entry);
      expect(new Set(lesson.families.map(({ id }) => id)).size).toBe(lesson.families.length);
      for (const family of lesson.families) {
        expect(family.words.length).toBeGreaterThan(0);
        for (const entry of family.words) {
          expect(entry.familyId).toBe(family.id);
          expect(entry.meaning.length).toBeGreaterThan(0);
          expect(entry.structure).toMatch(/^[CV]+$/);
          expect(entry.phonemes).toHaveLength(entry.structure.length);
          const positions = entry.graphemes.flatMap(({ ranges }) => ranges.flatMap(({ start, end }) => Array.from({ length: end - start }, (_, i) => start + i)));
          expect(positions.sort((a, b) => a - b)).toEqual(Array.from({ length: entry.word.length }, (_, i) => i));
          for (const grapheme of entry.graphemes) expect(grapheme.ranges.map(({ start, end }) => entry.word.slice(start, end)).join("")).toBe(grapheme.text.replace(/_/g, ""));
          expect(entry.targetRanges.length).toBeGreaterThan(0);
          for (const { start, end } of entry.targetRanges) {
            expect(Number.isInteger(start) && Number.isInteger(end)).toBe(true);
            expect(start).toBeGreaterThanOrEqual(0);
            expect(end).toBeGreaterThan(start);
            expect(end).toBeLessThanOrEqual(entry.word.length);
          }
          expect((entry.spellingUnits ?? Array.from(entry.word)).join("")).toBe(entry.word);
        }
      }
      expect(lesson.questions).toHaveLength(8);
      expect(lesson.questions.filter(({ kind }) => kind === "listen")).toHaveLength(4);
      expect(lesson.questions.filter(({ kind }) => kind === "spell")).toHaveLength(4);
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
          for (const unit of question.answer.spellingUnits ?? Array.from(question.answer.word)) {
            const index = remaining.indexOf(unit);
            expect(index).toBeGreaterThanOrEqual(0);
            remaining.splice(index, 1);
          }
        }
      }
      expect(lesson.sentences).toHaveLength(2);
      expect(new Set(lesson.sentences.map(({ audioKey }) => audioKey)).size).toBe(2);
      for (const sentence of lesson.sentences) {
        const tokens = sentence.text.toLowerCase().match(/[a-z]+/gu)!;
        expect(sentence.translation.length).toBeGreaterThan(0);
        for (const key of sentence.wordKeys) { expect(dictionary.has(key)).toBe(true); expect(tokens).toContain(key); }
        const supports = sentence.supportWords ?? [];
        // 累積式教材容許先前已教詞；支援詞按實際可播放的完整片語檢查，不能只看按鈕標籤。
        const previouslyTaught = phonicsLessons.slice(0, phonicsLessons.indexOf(lesson)).flatMap(lessonWords).map(({ word }) => word);
        const demonstrated = [...sentence.wordKeys, ...previouslyTaught, ...supports.flatMap(({ text }) => text.toLowerCase().match(/[a-z]+/gu) ?? [])];
        for (const token of tokens) expect(demonstrated).toContain(token);
        for (const support of supports) {
          const supportTokens = support.text.toLowerCase().match(/[a-z]+/gu) ?? [];
          for (const token of support.word.toLowerCase().match(/[a-z]+/gu) ?? []) expect(supportTokens).toContain(token);
          expect(support.meaning.length).toBeGreaterThan(0);
        }
      }
    });
  }
});
