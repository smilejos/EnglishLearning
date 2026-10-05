import { z } from "zod";

const Text = z.string();
const ExampleSchema = z.object({ guid: z.string().uuid(), en: Text, zh: Text.default("") }).passthrough();
const ExplainSchema = z.object({ guid: z.string().uuid(), en: Text }).passthrough();

/** 缺少內容可後補，但穩定 GUID 與單字必須存在。 */
export const WordbankEntrySchema = z.object({
  id: z.number().int().positive(),
  guid: z.string().uuid(),
  word: z.string().refine((word) => word.trim().length > 0, "單字不可空白"),
  parts_of_speech: z.array(Text).default([]),
  definition: Text.nullish().transform((value) => value ?? ""),
  explains: z.array(ExplainSchema).default([]),
  examples: z.array(ExampleSchema).default([]),
  level: z.object({
    cefr: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).nullish().transform((value) => value ?? null),
    tw_7000: z.number().int().min(1).max(6).nullish().transform((value) => value ?? null),
    list: z.enum(["basic", "advance", "expert"]).nullish().transform((value) => value ?? null),
  }).default({}),
  category: z.array(Text).default([]),
  scenario: z.array(Text).default([]),
});
export type WordbankEntry = z.infer<typeof WordbankEntrySchema>;
export type WordbankLevelScheme = "cefr" | "tw_7000" | "list";

export function parseWordbankDocument(input: unknown): WordbankEntry[] {
  const { entries } = z.object({ entries: z.array(WordbankEntrySchema) }).parse(input);
  const guids = new Set<string>();
  for (const entry of entries) {
    if (guids.has(entry.guid)) throw new Error(`字庫 GUID 重複：${entry.guid}`);
    guids.add(entry.guid);
  }
  return entries;
}

const nonempty = (value: unknown): boolean => value !== null && value !== undefined && value !== "" && !(typeof value === "string" && value.trim() === "");

function mergeItems<T extends { guid: string }>(current: T[], incoming: T[]): T[] {
  const merged = new Map(current.map((item) => [item.guid, { ...item }]));
  for (const item of incoming) {
    const previous = merged.get(item.guid);
    if (!previous) merged.set(item.guid, { ...item });
    else {
      const filled = { ...item, ...previous };
      for (const [key, value] of Object.entries(item)) {
        if (!nonempty((previous as Record<string, unknown>)[key])) (filled as Record<string, unknown>)[key] = value;
      }
      merged.set(item.guid, filled);
    }
  }
  return [...merged.values()];
}

/** 重匯僅補缺：保留已人工補齊的文字／分級，GUID 相同的例句補空欄，新 GUID 追加。 */
export function mergeWordbankEntry(current: WordbankEntry, incoming: WordbankEntry): WordbankEntry {
  return {
    ...current,
    definition: current.definition.trim() ? current.definition : incoming.definition,
    parts_of_speech: [...new Set([...current.parts_of_speech, ...incoming.parts_of_speech])],
    category: [...new Set([...current.category, ...incoming.category])],
    scenario: [...new Set([...current.scenario, ...incoming.scenario])],
    examples: mergeItems(current.examples, incoming.examples),
    explains: mergeItems(current.explains, incoming.explains),
    level: {
      cefr: current.level.cefr ?? incoming.level.cefr,
      tw_7000: current.level.tw_7000 ?? incoming.level.tw_7000,
      list: current.level.list ?? incoming.level.list,
    },
  };
}
