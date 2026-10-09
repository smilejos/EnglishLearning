import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getRandomWordbankPracticeEntry, getWordbankPracticeEntry, getWordbankPracticeOptions, WORDBANK_LEVELS, type DbPool, type WordbankPracticeFilter } from "@el/shared";

const Query = z.object({
  system: z.enum(["all", "list", "cefr", "tw_7000"]).default("all"),
  levels: z.string().max(200).optional(),
}).strict();

export function parseWordbankRandomQuery(query: unknown): { filter?: WordbankPracticeFilter } | null {
  const parsed = Query.safeParse(query);
  if (!parsed.success) return null;
  const { system, levels } = parsed.data;
  if (levels === undefined || levels === "all") return {};
  if (system === "all") return null;
  const selected = levels.split(",").map((level) => level.trim());
  const allowed: string[] = [...WORDBANK_LEVELS[system], "unclassified"];
  if (!selected.length || selected.some((level) => !allowed.includes(level))) return null;
  return { filter: { system, levels: [...new Set(selected)].map((level) => level === "unclassified" ? null : level) } };
}

export function registerWordbankRoutes(app: FastifyInstance, pool: DbPool): void {
  app.get("/wordbank/entries/:guid", async (request, reply) => {
    const params = z.object({ guid: z.string().uuid() }).safeParse(request.params);
    if (!params.success || !z.object({}).strict().safeParse(request.query).success) return reply.code(400).send({ error: "invalid query" });
    const entry = await getWordbankPracticeEntry(pool, params.data.guid);
    return entry ?? reply.code(404).send({ error: "entry not found" });
  });
  app.get("/wordbank/options", async (request, reply) => {
    if (!z.object({}).strict().safeParse(request.query).success) return reply.code(400).send({ error: "invalid query" });
    return getWordbankPracticeOptions(pool);
  });
  app.get("/wordbank/random", async (request, reply) => {
    const query = parseWordbankRandomQuery(request.query);
    if (!query) return reply.code(400).send({ error: "invalid query" });
    return getRandomWordbankPracticeEntry(pool, query.filter);
  });
}
