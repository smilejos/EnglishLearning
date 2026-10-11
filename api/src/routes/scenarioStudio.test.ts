import { beforeAll,beforeEach,afterEach,afterAll,describe,it,expect } from "vitest";
import { mkdtemp,mkdir,readFile,rm,symlink,writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { createPool,parseWordbankDocument,importWordbankEntries,emptyStudioDraft,StudioEditableSchema,createStudioDraft,getStudioDraft,updateStudioDraft,enqueueStudioJob,claimStudioJob,heartbeatStudioJob,beginStudioAttempt,finishStudioJob,recoverStudioJobs,cancelStudioJob,getStudioJob,analyzeStudioStory,studioInputHash,loadImageModelCatalog,DEFAULT_GENERATION_SETTINGS,withStudioDraftLock,storeStudioStoryCandidate,type StudioDraft,type StudioEditable,type WordbankEntry } from "@el/shared";
import { resolveTestDatabaseUrl } from "@el/shared/testing";
import { buildApp } from "../app";
import type { ScenarioStudioRouteDeps } from "./scenarioStudio";

let pool:ReturnType<typeof createPool>,admin:ReturnType<typeof buildApp>,reader:ReturnType<typeof buildApp>,reviewer:ReturnType<typeof buildApp>,directory:string,deps:ScenarioStudioRouteDeps,input:StudioEditable;
let entries:WordbankEntry[];
const base="/scenarios/studio";
const config={cfAccess:null,devAuthBypass:true,devUserEmail:"reader@studio.test",adminEmails:[] as string[]};
beforeAll(async()=>{
  pool=createPool(resolveTestDatabaseUrl());
  const pkg=JSON.parse(await readFile(new URL("../../../docs/scenarios/packages/living-room-15-v1/scenario.json",import.meta.url),"utf8"));
  input={...emptyStudioDraft("studio-living-room",DEFAULT_GENERATION_SETTINGS.image.model),titleZh:pkg.titleZh,sceneDescription:"溫暖午後客廳",targets:pkg.targets,story:pkg.story};
  const refs=new Set([...pkg.targets,...pkg.story.sentences.flatMap((s:any)=>s.wordLinks)].map((l:any)=>l.entryGuid));
  entries=parseWordbankDocument(JSON.parse(await readFile(new URL("../../../source/vocabulary-database.json",import.meta.url),"utf8"))).filter(e=>refs.has(e.guid));
});
beforeEach(async()=>{
  await pool.query("TRUNCATE users,wordbank_entries,scenario_studio_drafts,learning_scenarios CASCADE");
  await importWordbankEntries(pool,entries);
  directory=await mkdtemp(path.join(os.tmpdir(),"scenario-studio-test-"));const roots={studioDir:path.join(directory,"studio"),imageDir:path.join(directory,"images"),audioDir:path.join(directory,"audio")};for(const root of Object.values(roots))await mkdir(root);
  deps={...roots,catalog:loadImageModelCatalog(new URL("../../../config/image-models.json",import.meta.url).pathname,new URL("../../../config/image-pricing.json",import.meta.url).pathname),resolveSettings:async()=>DEFAULT_GENERATION_SETTINGS,getAvailability:()=>({google:true,openai:true,localQwen:true})};
  admin=buildApp({pool,config:{...config,devUserEmail:"admin@studio.test",adminEmails:["admin@studio.test"]},scenarioStudio:deps,scenarios:roots});reader=buildApp({pool,config,scenarioStudio:deps,scenarios:roots});
  await pool.query("INSERT INTO users(email,role) VALUES('reviewer@studio.test','reviewer')");reviewer=buildApp({pool,config:{...config,devUserEmail:"reviewer@studio.test"},scenarioStudio:deps,scenarios:roots});
});
afterEach(async()=>{await Promise.all([admin.close(),reader.close(),reviewer.close()]);await rm(directory,{recursive:true,force:true});});
afterAll(async()=>{await pool.end();});
const post=(url:string,payload:unknown)=>admin.inject({method:"POST",url,payload:payload as any});
async function create(){const r=await post(`${base}/drafts`,structuredClone(input));expect(r.statusCode).toBe(200);return r.json().draft as StudioDraft;}
async function job(draft:StudioDraft,key="one"){return enqueueStudioJob(pool,draft.id,draft.version,{kind:"story",inputHash:studioInputHash(draft,"story"),input:{draft},idempotencyKey:key});}
function editFields(draft:StudioDraft){return StudioEditableSchema.parse(Object.fromEntries(Object.keys(StudioEditableSchema.shape).map(k=>[k,(draft as any)[k]])));}

describe("情境工作台管理權限、選詞與草稿",()=>{
  it("reader及reviewer不能讀寫任何studio路由，拒絕時沒有建立草稿或生成工作",async()=>{
    const id="00000000-0000-4000-8000-000000000001";
    const requests=[{method:"GET",url:"/options"},{method:"GET",url:"/words"},{method:"POST",url:"/words/resolve"},{method:"GET",url:"/drafts"},{method:"POST",url:"/drafts"},{method:"GET",url:`/drafts/${id}`},{method:"PUT",url:`/drafts/${id}`},{method:"POST",url:"/drafts/fork"},{method:"POST",url:`/drafts/${id}/quote`},{method:"POST",url:`/drafts/${id}/jobs`},{method:"GET",url:`/drafts/${id}/jobs`},{method:"POST",url:`/jobs/${id}/retry`},{method:"POST",url:`/jobs/${id}/cancel`},{method:"POST",url:`/drafts/${id}/assets`},{method:"GET",url:`/drafts/${id}/media/${id}`}];
    for(const app of [reader,reviewer])for(const r of requests)expect((await app.inject({method:r.method as any,url:base+r.url})).statusCode).toBe(403);
    expect((await pool.query("SELECT (SELECT count(*)::int FROM scenario_studio_drafts) drafts,(SELECT count(*)::int FROM scenario_studio_jobs) jobs")).rows[0]).toEqual({drafts:0,jobs:0});
  });
  it("讀取options與草稿不排工作；Textarea明示重複、查無、級別外與多筆同字",async()=>{
    const sofa=entries.find(e=>e.word==="sofa")!;
    await importWordbankEntries(pool,[{...sofa,id:100000,guid:"00000000-0000-4000-8000-000000000002"},{...sofa,id:100001,guid:"00000000-0000-4000-8000-000000000003",word:"expertword",level:{...sofa.level,list:"expert"}}]);
    const result=await post(`${base}/words/resolve`,{words:["sofa","SOFA","doesnotexist","expertword","read"],levels:["basic","advance"]});expect(result.statusCode).toBe(200);expect(result.json().results.map((r:any)=>r.status)).toEqual(["ambiguous","duplicate","unknown","out-of-level","matched"]);
    expect((await admin.inject(`${base}/words?q=sofa&levels=basic&limit=1`)).json()).toMatchObject({total:2,entries:[{word:"sofa"}]});
    expect((await admin.inject(`${base}/words?levels=expert`)).statusCode).toBe(400);
    expect((await admin.inject(`${base}/options`)).json()).toMatchObject({speech:{voice:"Serena",provider:"local-qwen"},workerOnline:false});
    await create();await admin.inject(`${base}/drafts`);expect((await pool.query("SELECT count(*)::int n FROM scenario_studio_jobs")).rows[0].n).toBe(0);
  });
  it("保存CAS拒絕旧版本，不改新內容；場景、故事、圖、座標變更作廢各自驗收",async()=>{
    const draft=await createStudioDraft(pool,{...structuredClone(input),review:{story:true,image:true,coordinates:true,audio:true}});
    const next={...editFields(draft),sceneDescription:"改成晚上"};const saved=await updateStudioDraft(pool,draft.id,draft.version,next);expect(saved.review).toMatchObject({story:false,image:false});
    await expect(updateStudioDraft(pool,draft.id,draft.version,{...next,titleZh:"舊分頁"})).rejects.toThrow("已更新");expect((await getStudioDraft(pool,draft.id))!.titleZh).toBe(input.titleZh);
    const fields=editFields(saved);fields.story!.sentences[0].en="It is a quiet morning at home.";fields.review={story:true,image:true,coordinates:true,audio:true};
    const res=await admin.inject({method:"PUT",url:`${base}/drafts/${saved.id}`,payload:{...fields,version:saved.version}});expect(res.statusCode).toBe(200);expect(res.json().draft.review).toMatchObject({story:false,audio:false});
    expect((await admin.inject({method:"PUT",url:`${base}/drafts/${saved.id}`,payload:{...fields,version:saved.version}})).statusCode).toBe(409);
  });
  it("故事詞形重建GUID與span，unknown及範圍外保留待修，不建立字庫詞條",async()=>{
    const initial=await analyzeStudioStory(pool,input);expect(initial.checks).toEqual([]);expect(initial.story!.sentences.flatMap(s=>s.wordLinks).find(l=>l.surface==="reads")).toMatchObject({word:"read",isTarget:true});
    const before=(await pool.query("SELECT count(*)::int n FROM wordbank_entries")).rows[0].n;
    const bad=structuredClone(input);bad.story!.sentences[0].en="Unicorns.";bad.story!.sentences[0].baseWords=["unicorn"];bad.story!.sentences[0].wordLinks=[];const result=await analyzeStudioStory(pool,bad);expect(result.checks.some(c=>c.code==="story-unresolved"&&c.surface==="Unicorns")).toBe(true);expect(result.story!.sentences[0].en).toBe("Unicorns.");expect(result.story!.sentences[0].wordLinks).toEqual([]);
    const read=entries.find(e=>e.word==="read")!;await pool.query("UPDATE wordbank_entries SET level='{\"list\":\"expert\"}' WHERE guid=$1",[read.guid]);expect((await analyzeStudioStory(pool,input)).checks.some(c=>c.code==="story-out-of-level")).toBe(true);expect((await pool.query("SELECT count(*)::int n FROM wordbank_entries")).rows[0].n).toBe(before);
  });
});

describe("持久工作、防雙送、租約及發布gate",()=>{
  it("生成必須用當版估價；同operation冪等，版本不同不可沿用估價",async()=>{
    const d=await create();const target=`${base}/drafts/${d.id}`;
    expect((await post(`${target}/jobs`,{version:d.version,kind:"image",idempotencyKey:"img"})).statusCode).toBe(409);
    const quote=(await post(`${target}/quote`,{version:d.version,kind:"image"})).json();expect(quote.estimatedCostUsdMicros).toBeGreaterThan(0);
    const first=await post(`${target}/jobs`,{version:d.version,kind:"image",idempotencyKey:"img",quoteHash:quote.quoteHash});expect(first.statusCode).toBe(202);const again=await post(`${target}/jobs`,{version:d.version,kind:"image",idempotencyKey:"img",quoteHash:quote.quoteHash});expect(again.json().job.id).toBe(first.json().job.id);
    await cancelStudioJob(pool,first.json().job.id);await updateStudioDraft(pool,d.id,d.version,{...editFields(d),titleZh:"新標題"});expect((await post(`${target}/jobs`,{version:d.version+1,kind:"image",idempotencyKey:"new-img",quoteHash:quote.quoteHash})).statusCode).toBe(409);
    expect((await pool.query("SELECT count(*)::int n FROM scenario_studio_jobs")).rows[0].n).toBe(1);
  });
  it("兩個worker只有一個取得claim；過期sending轉uncertain，沒有自動重送",async()=>{
    const d=await create();const queued=await job(d);const claims=await Promise.all([claimStudioJob(pool),claimStudioJob(pool)]);expect(claims.filter(Boolean)).toHaveLength(1);const claim=claims.find(Boolean)!;
    await beginStudioAttempt(pool,claim.job.id,claim.leaseToken,{provider:"fake",model:"fake"});await pool.query("UPDATE scenario_studio_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[queued.id]);expect(await recoverStudioJobs(pool)).toBe(1);expect((await getStudioJob(pool,queued.id))!.status).toBe("uncertain");expect(await claimStudioJob(pool)).toBeNull();expect(await heartbeatStudioJob(pool,queued.id,claim.leaseToken)).toBe(false);
    const noack=await post(`${base}/jobs/${queued.id}/retry`,{version:d.version,idempotencyKey:"retry"});expect(noack.statusCode).toBe(409);
    const ack=await post(`${base}/jobs/${queued.id}/retry`,{version:d.version,idempotencyKey:"retry",ackUncertain:true});expect(ack.statusCode).toBe(202);expect(ack.json().job.id).not.toBe(queued.id);
  });
  it("編輯中的新草稿不被晚到生成覆寫；取消後舊lease不能保存完成結果",async()=>{
    const d=await create();await job(d);const claim=(await claimStudioJob(pool))!;const newer=await updateStudioDraft(pool,d.id,d.version,{...editFields(d),titleZh:"保持新稿"});expect(await finishStudioJob(pool,claim.job.id,claim.leaseToken,{status:"done",draftPatch:{titleZh:"舊結果"},output:{candidate:"retained"}})).toBe(true);expect((await getStudioDraft(pool,d.id))!.titleZh).toBe("保持新稿");
    const queued=await job(newer,"cancel");const active=(await claimStudioJob(pool))!;await cancelStudioJob(pool,queued.id);expect(await finishStudioJob(pool,active.job.id,active.leaseToken,{status:"done",draftPatch:{titleZh:"取消結果"}})).toBe(false);expect((await getStudioDraft(pool,d.id))!.titleZh).toBe("保持新稿");
  });
  it("取消已送出的請求保留未知費用；retry或新job都需ack，沒有sending的取消可正常重試",async()=>{
    const d=await create();const queued=await job(d);const active=(await claimStudioJob(pool))!;await beginStudioAttempt(pool,queued.id,active.leaseToken,{provider:"fake-paid",model:"fake"});
    const cancelled=await post(`${base}/jobs/${queued.id}/cancel`,{});expect(cancelled.json().job).toMatchObject({status:"cancelled",requiresUncertainAcknowledgement:true});expect(cancelled.json().job.error).toContain("重複計費");
    const noack=await post(`${base}/jobs/${queued.id}/retry`,{version:d.version,idempotencyKey:"noack"});expect(noack.statusCode).toBe(409);expect(noack.json().requiresUncertainAcknowledgement).toBe(true);
    const fresh=await post(`${base}/drafts/${d.id}/jobs`,{version:d.version,kind:"wordbank-audio",idempotencyKey:"fresh"});expect(fresh.statusCode).toBe(409);expect(fresh.json().requiresUncertainAcknowledgement).toBe(true);await expect(job(d,"direct-noack")).rejects.toThrow("重複計費");
    const ack=await post(`${base}/jobs/${queued.id}/retry`,{version:d.version,idempotencyKey:"ack",ackUncertain:true});expect(ack.statusCode).toBe(202);
    const clean=await create();const neverSent=await job(clean);await cancelStudioJob(pool,neverSent.id);expect((await post(`${base}/jobs/${neverSent.id}/retry`,{version:clean.version,idempotencyKey:"safe-retry"})).statusCode).toBe(202);
  });
  it("固定教材臨界區與改稿／取消共用鎖，完成固定前不讓晚到操作插入",async()=>{
    const d=await create();const queued=await job(d);const active=(await claimStudioJob(pool))!;
    let unlock!:()=>void,entered!:()=>void;const gate=new Promise<void>(resolve=>{unlock=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
    const finalizing=withStudioDraftLock(pool,d.id,async()=>{entered();await gate;await finishStudioJob(pool,active.job.id,active.leaseToken,{status:"done",materializedRevision:1});});await started;
    let editSettled=false,cancelSettled=false;const editing=updateStudioDraft(pool,d.id,d.version,{...editFields(d),titleZh:"不該修改"}).then(()=>{editSettled=true;return null;},error=>{editSettled=true;return error;});const cancelling=cancelStudioJob(pool,queued.id).then(result=>{cancelSettled=true;return result;});
    await new Promise(resolve=>setTimeout(resolve,25));expect(editSettled).toBe(false);expect(cancelSettled).toBe(false);unlock();await finalizing;expect(await editing).toBeInstanceOf(Error);expect((await cancelling)!.status).toBe("done");expect((await getStudioDraft(pool,d.id))!.titleZh).toBe(d.titleZh);
  });
  it("取消或租約失效的晚到故事仍留在output候選，不修改草稿或工作狀態",async()=>{
    for(const condition of ["cancelled","stale"]as const){
      const d=await create();const queued=await job(d);const claim=(await claimStudioJob(pool))!;
      await pool.query("UPDATE scenario_studio_jobs SET output='{\"retained\":true}'::jsonb WHERE id=$1",[queued.id]);
      if(condition==="cancelled")await cancelStudioJob(pool,queued.id);else{await pool.query("UPDATE scenario_studio_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[queued.id]);await recoverStudioJobs(pool);}
      const before=await getStudioJob(pool,queued.id),candidate=structuredClone(input.story!);candidate.sentences[0].zh="這是晚到、可手動選用的故事。";candidate.textZh=candidate.sentences.map(s=>s.zh).join("");
      expect(await storeStudioStoryCandidate(pool,queued.id,candidate)).toBe(true);expect(await finishStudioJob(pool,queued.id,claim.leaseToken,{status:"done",draftPatch:{story:candidate}})).toBe(false);
      const after=await getStudioJob(pool,queued.id);expect(after!.status).toBe(before!.status);expect(after!.leaseToken).toBe(before!.leaseToken);expect(after!.output).toMatchObject({retained:true,story:candidate});expect((await getStudioDraft(pool,d.id))!.story).toEqual(d.story);expect((await getStudioDraft(pool,d.id))!.version).toBe(d.version);
    }
  });
  it("候選故事保存後工作失敗可保留output，失敗資訊不清空已付費內容",async()=>{
    const d=await create();await job(d);const claim=(await claimStudioJob(pool))!;await storeStudioStoryCandidate(pool,claim.job.id,input.story!);
    expect(await finishStudioJob(pool,claim.job.id,claim.leaseToken,{status:"failed",error:"後續寫入失敗"})).toBe(true);expect((await getStudioJob(pool,claim.job.id))!.output).toMatchObject({story:input.story});expect((await getStudioDraft(pool,d.id))!.story).toEqual(d.story);
  });
  it("故事未驗收不可產音；缺圖音座標及驗收不可finalize，沒有匯入或發布",async()=>{
    const d=await create(),target=`${base}/drafts/${d.id}`;
    expect((await post(`${target}/jobs`,{version:d.version,kind:"story-audio",idempotencyKey:"audio"})).statusCode).toBe(400);
    const result=await post(`${target}/jobs`,{version:d.version,kind:"finalize",idempotencyKey:"final"});expect(result.statusCode).toBe(400);expect(result.json().checks.map((c:any)=>c.code)).toEqual(expect.arrayContaining(["image-missing","audio-missing","review-story"]));
    expect((await pool.query("SELECT (SELECT count(*)::int FROM scenario_revisions) revisions,(SELECT count(*)::int FROM scenario_studio_jobs) jobs")).rows[0]).toEqual({revisions:0,jobs:0});
  });
  it("固定成revision後後端也禁止改稿，需要明確複製新草稿",async()=>{
    const d=await create();await pool.query("UPDATE scenario_studio_drafts SET materialized_revision=1 WHERE id=$1",[d.id]);
    const res=await admin.inject({method:"PUT",url:`${base}/drafts/${d.id}`,payload:{...editFields(d),version:d.version,titleZh:"不該寫入"}});expect(res.statusCode).toBe(409);expect(res.json().error).toContain("新草稿");expect((await getStudioDraft(pool,d.id))!.titleZh).toBe(d.titleZh);
    expect((await post(`${base}/drafts/${d.id}/quote`,{version:d.version,kind:"image"})).statusCode).toBe(409);await expect(job(d)).rejects.toThrow("新草稿");
  });
});

describe("受保護素材上傳與安全路徑",()=>{
  it("解碼圖片、保存hash並隔離draft，reader不可讀、壞格式不能上傳",async()=>{
    const d=await create(),other=await create();const image=await sharp({create:{width:16,height:9,channels:3,background:"white"}}).png().toBuffer();
    const res=await post(`${base}/drafts/${d.id}/assets`,{version:d.version,kind:"image",dataBase64:image.toString("base64"),contentType:"image/png"});expect(res.statusCode).toBe(200);const asset=res.json().assets[0];expect(asset).toMatchObject({width:16,height:9,bytes:image.length});
    expect((await admin.inject(asset.url)).rawPayload).toEqual(image);expect((await reader.inject(asset.url)).statusCode).toBe(403);
    expect((await admin.inject({method:"PUT",url:`${base}/drafts/${other.id}`,payload:{...editFields(other),version:other.version,selectedImageId:asset.id}})).statusCode).toBe(400);
    expect((await post(`${base}/drafts/${d.id}/assets`,{version:d.version,kind:"image",dataBase64:image.toString("base64"),contentType:"image/jpeg"})).statusCode).toBe(400);
    expect((await post(`${base}/drafts/${d.id}/assets`,{version:d.version,kind:"image",dataBase64:image.toString("base64"),contentType:"image/png",path:"../../secret"})).statusCode).toBe(400);
  });
  it("檔案被替換為symlink或內容hash變動時拒絕媒體，不讀外部檔案",async()=>{
    const d=await create();const image=await sharp({create:{width:16,height:9,channels:3,background:"white"}}).png().toBuffer();const result=await post(`${base}/drafts/${d.id}/assets`,{version:d.version,kind:"image",dataBase64:image.toString("base64"),contentType:"image/png"});expect(result.statusCode).toBe(200);const asset=result.json().assets[0],filename=path.join(deps.studioDir,asset.relativePath);
    await writeFile(filename,"changed");expect((await admin.inject(asset.url)).statusCode).toBe(404);await rm(filename);const outside=path.join(directory,"outside.png");await writeFile(outside,image);await symlink(outside,filename);expect((await admin.inject(asset.url)).statusCode).toBe(404);
  });
  it("上傳旁白需當下故事hash並實際解碼MP3，偽裝ID3內容不接受",async()=>{
    const d=await create();expect((await post(`${base}/drafts/${d.id}/assets`,{version:d.version,kind:"story-audio",dataBase64:Buffer.from("ID3fake").toString("base64"),contentType:"audio/mpeg",textSha256:"0".repeat(64)})).statusCode).toBe(400);
  });
});
