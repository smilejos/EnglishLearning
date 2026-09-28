-- Up Migration
ALTER TABLE article_visual_runs
  ADD COLUMN legacy_imported boolean NOT NULL DEFAULT false;

-- Kept as an idempotent database operation so test fixtures can exercise the
-- same conversion that runs during deployment. New application runs use v2.
CREATE FUNCTION import_legacy_illustration_runs() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE converted_count integer;
BEGIN
  -- Lock before checking jobs: the worker claims jobs under the run lock.
  PERFORM 1 FROM article_visual_runs WHERE workflow_version=1 FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM illustration_jobs j
    JOIN article_visual_runs r ON r.id=j.run_id
    WHERE r.workflow_version=1 AND j.status IN ('pending','processing')
  ) THEN
    RAISE EXCEPTION 'Legacy illustration jobs are still active; finish or resolve them before migrating';
  END IF;

  -- A failed full-article plan may have created no slots at all. Reconstruct
  -- only the empty editable slots from the saved source; do not invent prompts.
  INSERT INTO illustration_slots(run_id,kind)
  SELECT r.id,'cover' FROM article_visual_runs r
  WHERE r.workflow_version=1
    AND NOT EXISTS (SELECT 1 FROM illustration_slots s WHERE s.run_id=r.id AND s.kind='cover');
  INSERT INTO illustration_slots(run_id,kind,paragraph_id)
  SELECT r.id,'paragraph',p.id FROM article_visual_runs r
  JOIN LATERAL jsonb_array_elements(r.source_json->'paragraphs') item ON true
  JOIN paragraphs p ON p.id=(item->>'id')::bigint AND p.article_id=r.article_id
  WHERE r.workflow_version=1
    AND NOT EXISTS (
      SELECT 1 FROM illustration_slots s
      WHERE s.run_id=r.id AND s.kind='paragraph' AND s.paragraph_id=p.id
    );

  -- Copy only a saved, actual candidate prompt. Unknown content stays blank.
  WITH chosen AS (
    SELECT s.id,c.prompt_json,c.alt_text
    FROM illustration_slots s
    JOIN article_visual_runs r ON r.id=s.run_id AND r.workflow_version=1
    JOIN LATERAL (
      SELECT candidate.prompt_json,candidate.alt_text
      FROM illustration_candidates candidate
      WHERE candidate.slot_id=s.id
      ORDER BY (candidate.id=s.selected_candidate_id) DESC,candidate.candidate_no DESC
      LIMIT 1
    ) c ON true
  )
  UPDATE illustration_slots s
  SET prompt_draft=NULLIF(btrim(c.prompt_json->>'prompt'), ''),
      prompt_alt_text=NULLIF(btrim(c.alt_text), ''),
      prompt_revision=CASE WHEN NULLIF(btrim(c.prompt_json->>'prompt'), '') IS NULL THEN 0 ELSE 1 END,
      prompt_status=CASE WHEN NULLIF(btrim(c.prompt_json->>'prompt'), '') IS NULL THEN 'empty' ELSE 'ready' END
  FROM chosen c WHERE s.id=c.id;

  -- An absent reference remains absent and never queues a paid provider job.
  UPDATE illustration_slots s
  SET required=false,skip_reason=COALESCE(NULLIF(s.skip_reason, ''), '舊版未建立參考圖')
  FROM article_visual_runs r
  WHERE s.run_id=r.id AND r.workflow_version=1 AND s.kind='reference'
    AND NOT EXISTS (
      SELECT 1 FROM illustration_candidates selected
      WHERE selected.id=s.selected_candidate_id AND selected.status='approved'
    );

  INSERT INTO illustration_slots(run_id,kind,required,skip_reason)
  SELECT r.id,'reference',false,'舊版未建立參考圖'
  FROM article_visual_runs r
  WHERE r.workflow_version=1
    AND NOT EXISTS (SELECT 1 FROM illustration_slots s WHERE s.run_id=r.id AND s.kind='reference');

  -- Publication, candidates, assets, attempts and historical costs stay put.
  UPDATE article_visual_runs r
  SET workflow_version=2,
      legacy_imported=true,
      visual_bible=COALESCE(
        r.visual_bible,
        CASE WHEN r.plan_json IS NOT NULL THEN
          jsonb_build_object(
            'style', r.plan_json->'styleBible',
            'characters', r.plan_json->'characterBible',
            'cover', r.plan_json->'coverBrief',
            'summary', r.plan_json->'articleSummary'
          )::text
        END
      ),
      status=CASE
        WHEN r.status IN ('published','superseded','cancelled') THEN r.status
        WHEN NOT EXISTS (
          SELECT 1 FROM illustration_slots s
          LEFT JOIN illustration_candidates c ON c.id=s.selected_candidate_id
          WHERE s.run_id=r.id AND s.required AND c.status IS DISTINCT FROM 'approved'
        ) THEN 'review'
        WHEN EXISTS (
          SELECT 1 FROM illustration_slots s
          JOIN illustration_candidates c ON c.id=s.selected_candidate_id
          WHERE s.run_id=r.id AND s.kind='reference' AND s.required AND c.status='ready'
        ) THEN 'waiting_reference_review'
        WHEN EXISTS (
          SELECT 1 FROM illustration_slots s
          JOIN illustration_candidates c ON c.id=s.selected_candidate_id
          WHERE s.run_id=r.id AND c.status IN ('failed','uncertain')
        ) THEN 'partial_failed'
        ELSE 'pending'
      END,
      updated_at=CASE WHEN r.status IN ('published','superseded','cancelled') THEN r.updated_at ELSE now() END
  WHERE r.workflow_version=1;
  GET DIAGNOSTICS converted_count=ROW_COUNT;
  RETURN converted_count;
END $$;

SELECT import_legacy_illustration_runs();

-- Down Migration
-- Imported edits may use v2-only data and cannot safely be reinterpreted as v1.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM article_visual_runs WHERE legacy_imported) THEN
    RAISE EXCEPTION 'Imported illustration runs cannot be downgraded automatically';
  END IF;
END $$;
DROP FUNCTION import_legacy_illustration_runs();
ALTER TABLE article_visual_runs DROP COLUMN legacy_imported;
