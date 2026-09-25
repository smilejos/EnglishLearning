import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const ProviderSchema = z.enum(["google", "openai"]);
export type GenerationProvider = z.infer<typeof ProviderSchema>;
const choice = z.object({ provider: ProviderSchema, model: z.string().min(1) }).strict();
const modelOption = choice.extend({ label: z.string().min(1) });
export const GenerationSettingsSchema = z.object({
  text: choice,
  speech: choice.extend({ voiceEn: z.string().min(1), voiceZh: z.string().min(1) }),
  image: choice,
}).strict();
export type GenerationSettings = z.infer<typeof GenerationSettingsSchema>;

const GenerationModelCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  text: z.array(modelOption).min(1),
  speech: z.array(modelOption).min(1),
  voices: z.object({ google: z.array(z.string().min(1)), openai: z.array(z.string().min(1)) }).strict(),
  defaults: GenerationSettingsSchema.omit({ image: true }),
}).strict();
export type GenerationModelCatalog = z.infer<typeof GenerationModelCatalogSchema>;
const purposes = ["text", "speech"] as const;

export function parseGenerationModelCatalog(input: unknown): GenerationModelCatalog {
  const catalog = GenerationModelCatalogSchema.parse(input);
  for (const purpose of purposes) {
    const keys = catalog[purpose].map(({ provider, model }) => `${provider}:${model}`);
    if (new Set(keys).size !== keys.length) throw new Error(`${purpose}: duplicate provider/model`);
    const selected = catalog.defaults[purpose];
    if (!keys.includes(`${selected.provider}:${selected.model}`))
      throw new Error(`${purpose}: default provider/model is not in catalog`);
  }
  for (const provider of ProviderSchema.options) {
    const voices = catalog.voices[provider];
    if (new Set(voices).size !== voices.length) throw new Error(`${provider}: duplicate voice`);
  }
  const { provider, voiceEn, voiceZh } = catalog.defaults.speech;
  if (!catalog.voices[provider].includes(voiceEn) || !catalog.voices[provider].includes(voiceZh))
    throw new Error("speech: default voice is not in catalog");
  return catalog;
}

export function loadGenerationModelCatalog(filePath: string): GenerationModelCatalog {
  return parseGenerationModelCatalog(JSON.parse(readFileSync(filePath, "utf8")));
}

const defaultCatalogPath = fileURLToPath(new URL("../../config/generation-models.json", import.meta.url));
export const GENERATION_MODEL_CATALOG = loadGenerationModelCatalog(
  process.env.GENERATION_MODELS_FILE ?? defaultCatalogPath,
);
export const GENERATION_OPTIONS = {
  text: GENERATION_MODEL_CATALOG.text,
  speech: GENERATION_MODEL_CATALOG.speech,
  voices: GENERATION_MODEL_CATALOG.voices,
};
export const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
  ...GENERATION_MODEL_CATALOG.defaults,
  image: { provider: "openai", model: "openai-gpt-image-2" },
};

export function validateGenerationSettings(
  input: unknown,
  catalog: GenerationModelCatalog = GENERATION_MODEL_CATALOG,
): GenerationSettings {
  const settings = GenerationSettingsSchema.parse(input);
  for (const purpose of purposes) {
    const selected = settings[purpose];
    if (!catalog[purpose].some((option) => option.provider === selected.provider && option.model === selected.model))
      throw new Error(`${purpose}: unsupported provider/model`);
  }
  const voices = catalog.voices[settings.speech.provider];
  if (!voices.includes(settings.speech.voiceEn) || !voices.includes(settings.speech.voiceZh))
    throw new Error("speech: unsupported voice for provider");
  return settings;
}
