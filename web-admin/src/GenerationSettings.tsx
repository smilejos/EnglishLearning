import { useEffect, useState } from "react";
import { req } from "./api";
import "./GenerationSettings.css";

type Provider = "google" | "openai";
type ModelChoice = { provider: Provider; model: string; label: string };
type Purpose = "text" | "speech" | "image";
type ModelSetting = { provider: Provider; model: string };

export interface GenerationSettingsValue {
  text: ModelSetting;
  speech: ModelSetting & { voiceEn: string; voiceZh: string };
  image: ModelSetting;
}

interface SettingsResponse {
  settings: GenerationSettingsValue;
  version: number;
  options: Record<Purpose, ModelChoice[]> & { voices: Record<Provider, string[]> };
  availability: Record<Provider, boolean>;
}

const purposes: { key: Purpose; title: string; help: string }[] = [
  { key: "text", title: "文字", help: "共用於文章翻譯、單字解釋和插圖全文規劃。" },
  { key: "speech", title: "語音", help: "用於文章朗讀、單字發音與解釋音檔。" },
  { key: "image", title: "圖片", help: "用於角色參考圖、封面與段落插圖。" },
];

const providerName: Record<Provider, string> = { google: "Google", openai: "OpenAI" };

export function GenerationSettings() {
  const [response, setResponse] = useState<SettingsResponse | null>(null);
  const [draft, setDraft] = useState<GenerationSettingsValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await req<SettingsResponse>("/generation-settings");
      setResponse(data);
      setDraft(data.settings);
      setSaved(false);
    } catch (e) {
      setError(`無法載入生成設定：${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function patchModel(key: Purpose, provider: Provider, model: string) {
    if (!draft || !response) return;
    setSaved(false);
    if (key === "speech") {
      const voices = response.options.voices[provider] ?? [];
      setDraft({ ...draft, speech: {
        provider, model,
        voiceEn: voices.includes(draft.speech.voiceEn) ? draft.speech.voiceEn : (voices[0] ?? ""),
        voiceZh: voices.includes(draft.speech.voiceZh) ? draft.speech.voiceZh : (voices[0] ?? ""),
      } });
    } else {
      setDraft({ ...draft, [key]: { provider, model } });
    }
  }

  if (loading && !response) return <p role="status" className="status-line">正在載入生成設定…</p>;
  if (!response || !draft) return (
    <section className="panel generation-settings">
      <h1 className="h-title">生成設定</h1>
      <p role="alert" className="generation-settings__error">{error}</p>
      <button type="button" className="btn btn--ghost" onClick={() => void load()}>重新載入</button>
    </section>
  );

  const invalid = purposes.some(({ key }) => {
    const setting = draft[key];
    return !response.availability[setting.provider] || !response.options[key].some(
      (item) => item.provider === setting.provider && item.model === setting.model,
    );
  }) || ![draft.speech.voiceEn, draft.speech.voiceZh].every(
    (voice) => response.options.voices[draft.speech.provider]?.includes(voice),
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(response.settings);

  async function save() {
    if (!response || !draft || saving || invalid || !dirty) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await req("/generation-settings", {
        method: "PUT", body: JSON.stringify({ settings: draft, version: response.version }),
      });
      setSaved(true);
    } catch (e) {
      const message = (e as Error).message;
      setError(message.startsWith("409 ")
        ? "設定已在其他視窗更新。請重新載入後再儲存。"
        : `儲存失敗，請確認設定後重試：${message}`);
      setSaving(false);
      return;
    }
    try {
      const result = await req<SettingsResponse>("/generation-settings");
      setResponse(result);
      setDraft(result.settings);
    } catch (e) {
      setError(`設定已儲存，但無法重新載入：${(e as Error).message}。請重新載入頁面確認。`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="generation-settings" aria-labelledby="generation-settings-title">
      <header className="generation-settings__head">
        <h1 id="generation-settings-title" className="h-title">生成設定</h1>
        <p>設定各項生成工作使用的供應商與模型。儲存後套用於新工作；既有內容不會自動重生。</p>
      </header>
      <div className="generation-settings__providers" aria-label="供應商憑證狀態">
        {(["google", "openai"] as Provider[]).map((provider) => (
          <span key={provider} className={response.availability[provider] ? "generation-settings__available" : "generation-settings__unavailable"}>
            {providerName[provider]}：{response.availability[provider] ? "已設定憑證" : "缺少憑證"}
          </span>
        ))}
      </div>
      <div className="generation-settings__list">
        {purposes.map(({ key, title, help }) => {
          const setting = draft[key];
          const models = response.options[key].filter((item) => item.provider === setting.provider);
          const voices = key === "speech" ? (response.options.voices[setting.provider] ?? []) : [];
          const validModel = models.some((item) => item.model === setting.model);
          return (
            <fieldset key={key} className="panel generation-settings__group" disabled={saving}>
              <legend>{title}</legend>
              <p>{help}</p>
              <div className="generation-settings__controls">
                <label>供應商
                  <select className="field" value={setting.provider} onChange={(e) => {
                    const provider = e.target.value as Provider;
                    const first = response.options[key].find((item) => item.provider === provider);
                    patchModel(key, provider, first?.model ?? "");
                  }}>
                    <option value="google">Google</option><option value="openai">OpenAI</option>
                  </select>
                </label>
                <label>模型
                  <select className="field" value={setting.model} onChange={(e) => patchModel(key, setting.provider, e.target.value)}>
                    {!validModel && <option value={setting.model}>{setting.model || "沒有可用模型"}</option>}
                    {models.map((item) => <option key={item.model} value={item.model}>{item.label}</option>)}
                  </select>
                </label>
              </div>
              {!response.availability[setting.provider] && <p role="alert" className="generation-settings__error">{providerName[setting.provider]} 尚未設定憑證，請先在伺服器環境設定 API Key。</p>}
              {!validModel && <p role="alert" className="generation-settings__error">目前模型無法使用，請選擇可用模型。</p>}
              {key === "speech" && (
                <div className="generation-settings__controls generation-settings__voices">
                  {(["voiceEn", "voiceZh"] as const).map((field) => (
                    <label key={field}>{field === "voiceEn" ? "英文聲線" : "中文聲線"}
                      <select className="field" value={draft.speech[field]} onChange={(e) => {
                        setDraft({ ...draft, speech: { ...draft.speech, [field]: e.target.value } });
                        setSaved(false);
                      }}>
                        {!voices.includes(draft.speech[field]) && <option value={draft.speech[field]}>{draft.speech[field] || "沒有可用聲線"}</option>}
                        {voices.map((voice) => <option key={voice} value={voice}>{voice}</option>)}
                      </select>
                    </label>
                  ))}
                  {!voices.length && <p role="alert" className="generation-settings__error">此供應商沒有可用聲線。</p>}
                </div>
              )}
            </fieldset>
          );
        })}
      </div>
      {error && <p role="alert" className="generation-settings__error">{error}</p>}
      <div className="generation-settings__actions">
        <button type="button" className="btn btn--primary" onClick={() => void save()} disabled={!dirty || invalid || saving}>
          {saving ? "儲存中…" : "儲存生成設定"}
        </button>
        {saved && <span role="status" className="save-note">設定已儲存</span>}
        {dirty && !saving && <span className="cell-muted">尚未儲存的變更</span>}
        {error.startsWith("設定已在其他視窗更新") && <button type="button" className="btn btn--ghost" onClick={() => void load()}>重新載入設定</button>}
      </div>
    </section>
  );
}
