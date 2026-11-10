import path from 'node:path';
import { stat } from 'node:fs/promises';

function validateLesson(lesson) {
  if (typeof lesson !== 'string' || !/^[a-z0-9-]+$/.test(lesson)) throw new Error('自然發音課程識別不合法');
}

/** 新產音只能寫入離線備料；匯入後由共用 audio volume 提供播放。 */
export function phonicsPreparationDirectory(root, lesson) {
  validateLesson(lesson);
  return path.resolve(root, 'data/audio-preparation/phonics', lesson);
}

async function hasManifest(directory) {
  try { return (await stat(path.join(directory, 'manifest.json'))).isFile(); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

/** legacy public 僅供搬遷／重用舊素材讀取，不能當作新產音目的地。 */
export async function phonicsSourceDirectory(root, lesson) {
  const preparation = phonicsPreparationDirectory(root, lesson);
  if (await hasManifest(preparation)) return preparation;
  const legacy = path.resolve(root, 'web-learner/public/phonics', lesson);
  return await hasManifest(legacy) ? legacy : preparation;
}
