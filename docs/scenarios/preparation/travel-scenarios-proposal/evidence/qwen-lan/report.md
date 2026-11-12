# LAN Qwen3-TTS 唯讀探索

- 位置：`http://192.168.1.124:8000`，Gradio 6.17.3。
- 已GET `/config`、`/gradio_api/info`、`/openapi.json`、`/gradio_api/login_check`、`/gradio_api/queue/status`；沒有POST、沒有產音、沒有登入或更改服務。
- 伺服器明示checkpoint：`Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice`，model type `custom_voice`。
- 可用聲線包含Serena；預設聲線其實是Vivian，必須明確傳入Serena。
- 實際參數順序：`text, lang_disp, spk_disp, instruct`；語言可明確選English。

## 服務自己公布的呼叫協定

- named API：`/run_instruct`。
- v2：`POST /gradio_api/call/v2/run_instruct`，JSON `{text,lang_disp,spk_disp,instruct}`。
- 舊式同樣有schema：`POST /gradio_api/call/run_instruct`，JSON `{data:[text,"English","Serena",instruct]}`。
- 回傳event id後，以`GET /gradio_api/call/run_instruct/<event_id>`接收事件結果；此為伺服器產生的bash範例，尚未實際觸發。
- 結果是Audio FileData與Status字串；有file下載路由。
- Audio設定為numpy後端、format未指定，不能在未產樣本前宣稱container或sample rate。首次真正生成後要用ffprobe確認並轉MP3。

## 整合限制

- 不是OpenAI `/v1/audio/speech`；既有generateBatch需要明示Gradio協定適配器。
- 使用實際LAN endpoint與明確host allowlist，不假裝localhost。
- 既有generateScenarioAudio只允許loopback，應明示適配使用者提供的LAN服務，不用proxy繞過guard。
- 新音訊必須記實際1.7B模型、Serena及新profile hash，不能冒稱MLX 0.6B錄音。
- GET端點及login_check都200、api_visibility=public；沒有測POST推論，不能假稱推論已成功。
- GET時queue_size=0，不代表後續固定空閒。
