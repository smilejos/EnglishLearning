# 端對端驗證（Task 7.2）

本檔記錄全流程的端對端驗證清單，分為三層：

1. **自動化測試覆蓋**（已綠，CI/本機可重跑）
2. **整合堆疊煙霧測試**（docker compose，不需真實 Gemini 金鑰）
3. **完整功能 e2e**（需真實 `GEMINI_API_KEY`，手動清單）

---

## 1. 自動化測試覆蓋（程式正確性把關）

全工作區測試與型別檢查（需先啟動 db 並 `npm run migrate:up`）：

```bash
docker compose up -d db
DATABASE_URL="postgres://app:app@localhost:5432/english_learning" npm run migrate:up
DATABASE_URL="postgres://app:app@localhost:5432/english_learning" npm test
npm run typecheck
```

最後一次結果：**104 passed**（shared 73 / api 28 / worker 3）、typecheck 全 5 workspace 全綠。

關鍵邏輯已由整合測試以 **mock LLM/TTS** 覆蓋：

- `api/src/routes/lookups.test.ts`：重新解釋首呼產生 6 音檔（word 發音 + 5 解釋音檔）並寫入解釋；**二次同 (word, article) 命中快取且 LLM/TTS 呼叫次數為 0**。
- `worker/src/processor.test.ts`：兩段文章逐段翻譯 + 中英 TTS → 段落 done、文章 done；TTS 拋錯 → 段落/文章 failed、job attempts++。
- `api/src/routes/articles.test.ts`：上傳（admin only）、查詢、重試。
- `shared/src/repo/repo.test.ts`：repo 一致性、唯一鍵、`claimNextJob` 原子認領、`listExplanationsByWord` 跨文章累積。

---

## 2. 整合堆疊煙霧測試（不需金鑰）

```bash
docker compose build
docker compose up -d
docker compose ps          # db/api/worker/web-admin/web-learner 皆 healthy；migrate 已 Exited(0)
curl -s localhost:8080/healthz             # {"ok":true,"service":"api"}
curl -s -o /dev/null -w '%{http_code}\n' localhost:8081/   # web-admin 200
curl -s -o /dev/null -w '%{http_code}\n' localhost:8082/   # web-learner 200
curl -s -o /dev/null -w '%{http_code}\n' localhost:8081/articles  # 經 nginx proxy 到 api → 200
```

共用 audio volume 讀寫（worker 寫、api 經 /audio 讀）：

```bash
docker compose exec -T worker sh -c 'mkdir -p /data/audio/x && printf RIFFok > /data/audio/x/a.wav'
curl -s localhost:8080/audio/x/a.wav       # RIFFok
docker compose exec -T worker rm -f /data/audio/x/a.wav
```

以上於 2026-06-30 本機 arm64 實測通過。

---

## 3. 完整功能 e2e（需真實 GEMINI_API_KEY）

> worker 翻譯／TTS 與 `POST /lookups` 的重新解釋會實際呼叫 Gemini，
> 因此本節需要有效金鑰。請建立 `.env`（勿提交）後重啟堆疊：

```bash
cat > .env <<'EOF'
GEMINI_API_KEY=<你的金鑰>
GEMINI_TTS_VOICE_EN=Kore
GEMINI_TTS_VOICE_ZH=Kore
ADMIN_EMAILS=dev@example.com   # 讓 dev bypass 身分成為 admin 以便上傳
DEV_AUTH_BYPASS=1
EOF
docker compose up -d
```

### 步驟與預期

1. **上傳文章**（web-admin `:8081`）：填標題與多段英文內文 → 送出。
   - 預期：清單出現該文章，狀態 `pending`→`processing`→`done`（worker 逐段處理）。
2. **逐段產出**：文章詳情每段顯示翻譯與中英兩個音檔播放器，皆可播放。
   - 對應檔案：`AUDIO_DIR/articles/<id>/p<idx>.en.wav` 與 `.zh.wav`。
3. **學習者閱讀**（web-learner `:8082`）：開啟文章，逐段英/中朗讀可播、可切換翻譯顯示。
4. **點單字「用本篇重新解釋」**：彈窗新增一筆解釋，含解釋／例句中英文字與 **6 個語音鈕**（單字英/中、解釋英/中、例句英/中）皆可播。
5. **快取命中**：同段同字再次「重新解釋」→ 立即回傳、**不產生新音檔、無新 LLM 呼叫**（可由 worker/api log 與 `word_explanations` 列數不變佐證）。
6. **跨文章累積**：於另一篇文章點同一單字 → 彈窗列出多份解釋（含先前來源），來源連結可跳回該文章。

### 佐證查詢

```bash
# 某單字的解釋累積
docker compose exec -T db psql -U app -d english_learning -c \
  "SELECT we.id, a.title, we.zh_translation FROM word_explanations we JOIN articles a ON a.id=we.article_id JOIN words w ON w.id=we.word_id WHERE w.normalized_word='habit' ORDER BY we.created_at;"
# 音檔
docker compose exec -T api sh -c 'ls -R /data/audio | head'
```

---

## 已知限制

- 本倉庫的自動化測試不呼叫真實 Gemini（以 mock 覆蓋邏輯與快取行為）；第 3 節需人工搭配真實金鑰執行。
- `material_type=extracurricular` 的 `category_id`/`tags` 分類於 schema、repo 已就緒，前端上傳表單目前以課業內欄位為主（可後續擴充）。
