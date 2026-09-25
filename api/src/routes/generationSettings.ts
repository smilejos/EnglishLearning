import type { FastifyInstance } from "fastify";
import {
  GENERATION_OPTIONS,
  getGenerationSettings,
  updateGenerationSettings,
  validateGenerationSettings,
  plannerForSelection,
  type DbPool,
  type ImageCatalog,
  type GenerationProvider,
} from "@el/shared";
import { requireAdmin } from "../auth";

export interface GenerationSettingsRouteDeps {
  catalog: ImageCatalog;
  availableModelIds: () => Promise<string[]>;
  getAvailability: () => { google: boolean; openai: boolean };
}

const providerForImage = (provider: string): GenerationProvider =>
  provider === "google-gemini" ? "google" : "openai";

export function registerGenerationSettingsRoutes(
  app: FastifyInstance,
  pool: DbPool,
  deps: GenerationSettingsRouteDeps,
): void {
  const admin = { preHandler: requireAdmin };
  app.get("/generation-settings", admin, async () => {
    const { settings, version } = await getGenerationSettings(pool);
    return {
      settings,
      version,
      options: {
        ...GENERATION_OPTIONS,
        image: deps.catalog.models.filter((model) => model.enabled).map((model) => ({
          provider: providerForImage(model.provider),
          model: model.id,
          label: model.label,
        })),
      },
      availability: deps.getAvailability(),
    };
  });

  app.put("/generation-settings", admin, async (request, reply) => {
    const body = request.body as { settings?: unknown; version?: unknown } | null;
    if (!body || Object.keys(body).some((key) => key !== "settings" && key !== "version") || !Number.isSafeInteger(body.version) || Number(body.version) < 1) {
      return reply.code(400).send({ error: "invalid generation settings request" });
    }
    let settings;
    try {
      settings = validateGenerationSettings(body.settings);
    } catch {
      return reply.code(400).send({ error: "unsupported generation settings" });
    }
    const image = deps.catalog.models.find((model) => model.id === settings.image.model && model.enabled);
    if (!image || providerForImage(image.provider) !== settings.image.provider) {
      return reply.code(400).send({ error: "image model unavailable in catalog" });
    }
    try {
      plannerForSelection(deps.catalog.planner, settings.text, deps.catalog.plannerProfiles);
    } catch {
      return reply.code(400).send({ error: "planner model has no pricing profile" });
    }
    const availability = deps.getAvailability();
    for (const selected of Object.values(settings)) {
      if (!availability[selected.provider]) {
        return reply.code(400).send({ error: `${selected.provider} credentials unavailable` });
      }
    }
    const current = await getGenerationSettings(pool);
    if (current.settings.image.model !== image.id && !(await deps.availableModelIds()).includes(image.id)) {
      return reply.code(400).send({ error: "image model unavailable in image worker" });
    }
    const updated = await updateGenerationSettings(pool, settings, Number(body.version));
    if (!updated) return reply.code(409).send({ error: "generation settings changed; reload and retry" });
    return updated;
  });
}
