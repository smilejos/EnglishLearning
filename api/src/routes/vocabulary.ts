import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listVocabulary, saveVocabulary, setVocabularyStatus, deleteVocabulary, type DbPool } from "@el/shared";

const Id = z.number().int().positive().safe();
const SaveBody = z.object({
  word: z.string().trim().min(1).max(200),
  articleId: Id,
  paragraphId: Id,
}).strict();
const StatusBody = z.object({ status: z.enum(["active", "mastered"]) }).strict();
const Params = z.object({ id: z.coerce.number().int().positive().safe() });

export function registerVocabularyRoutes(app: FastifyInstance, pool: DbPool): void {
  app.get("/vocabulary", async (request) => listVocabulary(pool, request.user!.id));
  app.post("/vocabulary", async (request, reply) => {
    const body = SaveBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "invalid body" });
    const item = await saveVocabulary(pool, request.user!.id, body.data);
    if (!item) return reply.code(404).send({ error: "article or paragraph not found" });
    return item;
  });
  app.patch("/vocabulary/:id", async (request, reply) => {
    const params = Params.safeParse(request.params);
    const body = StatusBody.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "invalid request" });
    const item = await setVocabularyStatus(pool, request.user!.id, params.data.id, body.data.status);
    if (!item) return reply.code(404).send({ error: "vocabulary not found" });
    return item;
  });
  app.delete("/vocabulary/:id", async (request, reply) => {
    const params = Params.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "invalid id" });
    if (!await deleteVocabulary(pool, request.user!.id, params.data.id)) return reply.code(404).send({ error: "vocabulary not found" });
    return reply.code(204).send();
  });
}
