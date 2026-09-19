import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import type { ImageResult } from "./providers";
import type { Queryable } from "../repo/types";

export interface StoredFile {
  variant: string;
  objectKey: string;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
}
export interface StoredAsset {
  id: string;
  sha256: string;
  files: StoredFile[];
}
export interface ImageStorage {
  save(
    result: ImageResult,
    articleId: number,
    runId: number,
    cover: boolean,
  ): Promise<StoredAsset>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
export class LocalImageStorage implements ImageStorage {
  constructor(
    private root: string,
    private journal?: Queryable,
  ) {}
  private path(key: string) {
    if (
      !/^[a-zA-Z0-9/_.-]+$/.test(key) ||
      key.split("/").some((p) => p === ".." || p === ".")
    )
      throw new Error("invalid image key");
    const path = resolve(this.root, key);
    if (!path.startsWith(resolve(this.root) + sep))
      throw new Error("invalid image key");
    return path;
  }
  read(key: string) {
    return readFile(this.path(key));
  }
  async remove(key: string) {
    await unlink(this.path(key)).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
  async save(
    result: ImageResult,
    articleId: number,
    runId: number,
    cover: boolean,
  ): Promise<StoredAsset> {
    if (result.bytes.length > 30_000_000)
      throw new Error("image exceeds 30MB limit");
    const metadata = await sharp(result.bytes, {
      limitInputPixels: 40_000_000,
    }).metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      !["png", "jpeg", "webp"].includes(metadata.format ?? "") ||
      (metadata.pages ?? 1) > 1
    )
      throw new Error("unsupported image bytes");
    const id = randomUUID();
    const base = `articles/${articleId}/runs/${runId}/${id}`;
    const asset: StoredAsset = {
      id,
      sha256: createHash("sha256").update(result.bytes).digest("hex"),
      files: [],
    };
    const outputs: Array<{
      variant: string;
      bytes: Buffer;
      width: number;
      height: number;
      ext: string;
    }> = [
      {
        variant: "master",
        bytes: result.bytes,
        width: metadata.width,
        height: metadata.height,
        ext: metadata.format!,
      },
    ];
    // Paragraph web preserves its full composition; anchors are relative to this exact image.
    const web = await sharp(result.bytes)
      .rotate()
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    outputs.push({
      variant: "web",
      bytes: web.data,
      width: web.info.width,
      height: web.info.height,
      ext: "webp",
    });
    if (cover)
      for (const [variant, width, height] of [
        ["cover-card", 640, 360],
        ["cover-hero", 1280, 720],
        ["cover-player", 160, 160],
      ] as const) {
        const image = await sharp(result.bytes)
          .rotate()
          .resize(width, height, { fit: "cover", position: "centre" })
          .webp({ quality: 85 })
          .toBuffer();
        outputs.push({ variant, bytes: image, width, height, ext: "webp" });
      }
    try {
      for (const output of outputs) {
        const objectKey = `${base}/${output.variant}.${output.ext}`;
        // Journal before writing. A hard crash cannot orphan an unregistered file forever.
        // Delay exceeds the job lease; successful asset commit removes the entry atomically.
        if (this.journal)
          await this.journal.query(
            "INSERT INTO illustration_cleanup_jobs(object_key,available_at) VALUES($1,now()+interval '1 day') ON CONFLICT DO NOTHING",
            [objectKey],
          );
        const path = this.path(objectKey);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, output.bytes, { flag: "wx" });
        asset.files.push({
          variant: output.variant,
          objectKey,
          mimeType: `image/${output.ext}`,
          width: output.width,
          height: output.height,
          byteSize: output.bytes.length,
        });
      }
    } catch (error) {
      await Promise.allSettled(
        asset.files.map((f) => this.remove(f.objectKey)),
      );
      throw error;
    }
    return asset;
  }
}
export async function recordAsset(db: Queryable, asset: StoredAsset) {
  await db.query("INSERT INTO illustration_assets(id,sha256) VALUES($1,$2)", [
    asset.id,
    asset.sha256,
  ]);
  for (const f of asset.files)
    await db.query(
      "INSERT INTO illustration_asset_files(asset_id,variant,object_key,mime_type,width,height,byte_size) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        asset.id,
        f.variant,
        f.objectKey,
        f.mimeType,
        f.width,
        f.height,
        f.byteSize,
      ],
    );
  await db.query(
    "DELETE FROM illustration_cleanup_jobs WHERE object_key=ANY($1::text[])",
    [asset.files.map((f) => f.objectKey)],
  );
}
