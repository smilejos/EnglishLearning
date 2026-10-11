import { describe,it,expect } from "vitest";
import { emptyStudioDraft,studioCompiledPrompt,studioInputHash,StudioEditableSchema } from "./contracts";
describe("情境草稿契約與無文字底圖設定",()=>{
  it("不完整草稿可保存，預設basic+advance且無伺服器路徑或憑證欄位",()=>{
    const draft=emptyStudioDraft("living-room");expect(StudioEditableSchema.parse(draft)).toEqual(draft);expect(draft.vocabularyFilter).toEqual({system:"list",levels:["basic","advance"]});expect(StudioEditableSchema.safeParse({...draft,endpoint:"https://example.com"}).success).toBe(false);
  });
  it("目標與標籤文字固定由網頁處理，不能自訂block混入圖內文字",()=>{
    const draft=emptyStudioDraft("living-room");draft.promptSettings.blocks.targetVocabulary="wrongword";draft.promptSettings.blocks.annotationStyle="Paint sofa label";draft.promptSettings.blocks.textRules="Add words";
    const prompt=studioCompiledPrompt(draft);expect(prompt).toContain("No rendered annotations");expect(prompt).toContain("No words, lettering");expect(prompt).not.toContain("wrongword");expect(prompt).not.toContain("Paint sofa label");expect(prompt).not.toContain("Add words");expect(prompt).toContain("Wide 16:9");
  });
  it("工作hash對目前輸入與模型快照敏感，物件key順序不造成新工作",()=>{
    const draft=emptyStudioDraft("living-room");const before=studioInputHash(draft,"image",{model:"one"});expect(studioInputHash({...draft,titleZh:"新標題"},"image",{model:"one"})).not.toBe(before);expect(studioInputHash(draft,"image",{model:"two"})).not.toBe(before);expect(studioInputHash(draft,"image",{a:1,b:2})).toBe(studioInputHash(draft,"image",{b:2,a:1}));
  });
});
