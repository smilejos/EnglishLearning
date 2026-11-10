import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AudioAssetKeySchema, AudioAssetScopeSchema, getAudioAssets, type DbPool } from "@el/shared";

export function registerAudioAssetRoutes(app: FastifyInstance, pool: DbPool): void {
  app.get("/audio-assets/:scope/:lessonId", async (request, reply) => {
    const params = z.object({ scope: AudioAssetScopeSchema, lessonId: AudioAssetKeySchema }).safeParse(request.params);
    if (!params.success || !z.object({}).strict().safeParse(request.query).success)
      return reply.code(400).send({ error: "invalid query" });
    const result = await getAudioAssets(pool, params.data.scope, params.data.lessonId);
    return result ?? reply.code(404).send({ error: "audio assets not found" });
  });
}
