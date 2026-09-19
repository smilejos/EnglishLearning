import { readFileSync } from "node:fs";
import { z } from "zod";
import { canonicalJson } from "./contracts";

const positive = z.number().finite().positive();
const amount = z.number().finite().nonnegative();
const OpenAIOptions = z
  .object({
    size: z.enum(["1024x1024", "1536x1024", "1024x1536"]),
    quality: z.enum(["low", "medium", "high"]),
  })
  .strict();
const GeminiOptions = z
  .object({
    aspectRatio: z.enum(["1:1", "16:9", "4:3"]),
    imageSize: z.literal("1K"),
  })
  .strict();
const profile = (options: z.ZodTypeAny) =>
  z
    .object({
      deliveryAspectRatio: z.enum(["1:1", "16:9", "4:3"]),
      providerOptions: options,
    })
    .strict();
const modelBase = {
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string().min(1),
  apiModel: z.string().regex(/^[a-zA-Z0-9._-]+$/),
  enabled: z.boolean(),
  pricingProfileId: z.string().min(1),
};
export const ImageModelSchema = z.discriminatedUnion("provider", [
  z
    .object({
      ...modelBase,
      provider: z.literal("openai"),
      adapter: z.literal("openai-images-v1"),
      profiles: z
        .object({
          cover: profile(OpenAIOptions),
          paragraph: profile(OpenAIOptions),
          reference: profile(OpenAIOptions),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...modelBase,
      provider: z.literal("google-gemini"),
      adapter: z.literal("gemini-generate-content-v1beta"),
      profiles: z
        .object({
          cover: profile(GeminiOptions),
          paragraph: profile(GeminiOptions),
          reference: profile(GeminiOptions),
        })
        .strict(),
    })
    .strict(),
]);
const rateBase = {
  id: z.string().min(1),
  version: z.number().int().positive(),
  provider: z.enum(["openai", "google-gemini"]),
  adapter: z.string().min(1),
  currency: z.literal("USD"),
  sourceUrl: z.string().url(),
  effectiveAt: z.string().datetime(),
  lastVerifiedAt: z.string().datetime(),
};
const tokenRates = z
  .object({
    textInput: amount,
    cachedTextInput: amount,
    imageInput: amount,
    cachedImageInput: amount,
    textOutput: amount,
    imageOutput: amount,
  })
  .strict();
const outputRate = z
  .object({
    options: z.record(z.union([z.string(), z.number()])),
    outputTokens: positive,
    imageUsdMicros: positive,
  })
  .strict();
export const PricingSchema = z.discriminatedUnion("billingModel", [
  z
    .object({
      ...rateBase,
      billingModel: z.literal("per-image"),
      rates: z.array(outputRate).min(1),
    })
    .strict(),
  z
    .object({
      ...rateBase,
      billingModel: z.literal("token-based"),
      rates: tokenRates,
      outputs: z.array(outputRate).min(1),
    })
    .strict(),
  z
    .object({
      ...rateBase,
      billingModel: z.literal("hybrid"),
      rates: tokenRates,
      outputs: z.array(outputRate).min(1),
    })
    .strict(),
]);
export const PlannerConfigSchema = z
  .object({
    apiModel: z.string().regex(/^[a-zA-Z0-9._-]+$/),
    inputUsdPerMillion: positive,
    outputUsdPerMillion: positive,
    maxOutputTokens: z.number().int().min(1024).max(32768),
    sourceUrl: z.string().url(),
    lastVerifiedAt: z.string().datetime(),
  })
  .strict();
export type ImageModel = z.infer<typeof ImageModelSchema>;
export type ImagePricing = z.infer<typeof PricingSchema>;
export type PlannerConfig = z.infer<typeof PlannerConfigSchema>;
export type ImagePurpose = "cover" | "paragraph" | "reference";
export interface ImageCatalog {
  defaultModelId: string;
  models: ImageModel[];
  pricing: ImagePricing[];
  planner: PlannerConfig;
}
export function parseImageCatalog(
  modelsInput: unknown,
  pricingInput: unknown,
): ImageCatalog {
  const m = z
    .object({
      schemaVersion: z.literal(1),
      defaultModelId: z.string(),
      models: z.array(ImageModelSchema).min(1),
    })
    .strict()
    .safeParse(modelsInput);
  const p = z
    .object({
      schemaVersion: z.literal(1),
      profiles: z.array(PricingSchema).min(1),
      planner: PlannerConfigSchema,
    })
    .strict()
    .safeParse(pricingInput);
  const errors: string[] = [];
  if (!m.success) errors.push(m.error.message);
  if (!p.success) errors.push(p.error.message);
  if (!m.success || !p.success)
    throw new Error(`Invalid image catalog:\n${errors.join("\n")}`);
  if (new Set(m.data.models.map((v) => v.id)).size !== m.data.models.length)
    errors.push("duplicate model ID");
  if (new Set(p.data.profiles.map((v) => v.id)).size !== p.data.profiles.length)
    errors.push("duplicate pricing ID");
  if (!m.data.models.some((v) => v.id === m.data.defaultModelId && v.enabled))
    errors.push("default model must exist and be enabled");
  for (const model of m.data.models) {
    const pricing = p.data.profiles.find(
      (v) => v.id === model.pricingProfileId,
    );
    if (
      !pricing ||
      pricing.provider !== model.provider ||
      pricing.adapter !== model.adapter
    ) {
      errors.push(`${model.id}: incompatible pricing profile`);
      continue;
    }
    for (const purpose of ["cover", "paragraph", "reference"] as const) {
      try {
        imageOutputRate(model, pricing, purpose);
      } catch {
        errors.push(`${model.id}/${purpose}: missing exact output rate`);
      }
    }
  }
  if (errors.length)
    throw new Error(`Invalid image catalog:\n${errors.join("\n")}`);
  return {
    defaultModelId: m.data.defaultModelId,
    models: m.data.models,
    pricing: p.data.profiles,
    planner: p.data.planner,
  };
}
export function loadImageModelCatalog(
  modelsFile: string,
  pricingFile: string,
): ImageCatalog {
  return parseImageCatalog(
    JSON.parse(readFileSync(modelsFile, "utf8")),
    JSON.parse(readFileSync(pricingFile, "utf8")),
  );
}
export function imageOutputRate(
  model: ImageModel,
  pricing: ImagePricing,
  purpose: ImagePurpose,
) {
  const outputs =
    pricing.billingModel === "per-image" ? pricing.rates : pricing.outputs;
  const row = outputs.find(
    (r) =>
      canonicalJson(r.options) ===
      canonicalJson(model.profiles[purpose].providerOptions),
  );
  if (!row) throw new Error("No exact price for requested provider options");
  return row;
}
/** Upper input estimates use UTF-8 bytes, plus an allowance for one reference image. */
export function estimateImageCost(
  model: ImageModel,
  pricing: ImagePricing,
  purpose: ImagePurpose,
  promptBytes: number,
  reference: boolean,
): number {
  const row = imageOutputRate(model, pricing, purpose);
  if (pricing.billingModel === "per-image")
    return Math.ceil(row.imageUsdMicros);
  const output =
    pricing.billingModel === "hybrid"
      ? row.imageUsdMicros
      : row.outputTokens * pricing.rates.imageOutput;
  return Math.ceil(
    output +
      promptBytes * pricing.rates.textInput +
      (reference ? 8192 * pricing.rates.imageInput : 0) +
      4096 * pricing.rates.textOutput,
  );
}
export function plannerCost(
  planner: PlannerConfig,
  promptBytes: number,
): number {
  return Math.ceil(
    promptBytes * planner.inputUsdPerMillion +
      planner.maxOutputTokens * planner.outputUsdPerMillion,
  );
}
