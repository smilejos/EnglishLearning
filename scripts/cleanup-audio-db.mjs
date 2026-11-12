// 六個業務來源全部保留：不依發布指標、是否綁定或字庫優先順序排除 metadata。
export const AUDIO_REFERENCE_TABLES = ['paragraphs', 'words', 'word_explanations', 'wordbank_audio', 'audio_assets', 'scenario_revisions'];
export async function cleanupDatabaseIdentity(db) {
  return (await db.query(`SELECT current_database() AS database, inet_server_addr()::text AS address,
    inet_server_port() AS port, current_schema() AS schema`)).rows[0];
}
export async function readAudioReferences(db) {
  const invalid = await db.query(`SELECT count(*)::int AS count FROM scenario_revisions
    WHERE jsonb_typeof(media->'audio'->'relativePath') IS DISTINCT FROM 'string'
      OR btrim(media->'audio'->>'relativePath') = ''`);
  if (invalid.rows[0].count) throw new Error('情境版本缺少有效 audio.relativePath，無法完整判斷引用，停止清理');
  const result = await db.query(`SELECT path FROM (
    SELECT unnest(ARRAY[en_audio_path, zh_audio_path]) AS path FROM paragraphs
    UNION ALL SELECT en_audio_path FROM words
    UNION ALL SELECT unnest(ARRAY[en_explanation_audio_path, en_example_audio_path,
      zh_translation_audio_path, zh_explanation_audio_path, zh_example_audio_path]) FROM word_explanations
    UNION ALL SELECT relative_path FROM wordbank_audio
    UNION ALL SELECT relative_path FROM audio_assets
    UNION ALL SELECT media->'audio'->>'relativePath' FROM scenario_revisions
  ) refs WHERE path IS NOT NULL`);
  return result.rows.map(row => row.path);
}
export async function withAudioCleanupSnapshot(pool, { apply = false } = {}, callback) {
  const client = await pool.connect();
  let completedReport;
  let disconnected;
  const connectionLost = error => { disconnected = error instanceof Error ? error : new Error('清理 DB 連線已中斷，停止刪檔'); };
  client.on?.('error', connectionLost);
  client.on?.('end', connectionLost);
  try {
    // apply 的鎖全部取得後才讀最新 READ COMMITTED snapshot；不可在等鎖前固定舊 snapshot。
    await client.query(apply ? 'BEGIN ISOLATION LEVEL READ COMMITTED' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    if (apply) {
      await client.query("SET LOCAL lock_timeout = '3s'");
      const lock = await client.query('SELECT pg_try_advisory_xact_lock(1782740846, 20261112) AS locked');
      if (!lock.rows[0].locked) throw new Error('另一個音檔清理正在執行');
      await client.query(`LOCK TABLE ${AUDIO_REFERENCE_TABLES.join(', ')} IN SHARE MODE`);
    }
    const snapshot = { target: await cleanupDatabaseIdentity(client), references: await readAudioReferences(client),
      assertConnection: async () => {
        if (disconnected) throw disconnected;
        await client.query('SELECT 1');
        if (disconnected) throw disconnected;
      } };
    const result = await callback(snapshot);
    if (apply) completedReport = result;
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    // FS unlink 不會隨 DB rollback 還原；COMMIT/連線失敗仍保留已刪數量。
    if (completedReport && typeof completedReport.deleted === 'number') {
      completedReport.failed.push(error.message);
      error.cleanupReport = completedReport;
    }
    throw error;
  } finally {
    client.removeListener?.('error', connectionLost); client.removeListener?.('end', connectionLost);
    client.release();
  }
}
