import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../auth";
import { getGenerationSettings, emptyStudioDraft, StudioEditableSchema, StudioJobKindSchema, ScenarioKeySchema,
  STUDIO_BLOCKS,STUDIO_PRESETS,STUDIO_SERENA,studioInputHash,studioCompiledPrompt, scenarioHash,readScenarioAsset,getScenarioRevision,
  createStudioDraft,getStudioDraft,listStudioDrafts,updateStudioDraft,listStudioAssets,listStudioJobs,getStudioJob,enqueueStudioJob,cancelStudioJob,
  listStudioWorkers,getStudioAsset,insertStudioAsset,writeStudioMedia,readStudioMedia,analyzeStudioStory,studioDraftChecks,validateStudioTargets,studioMissingAudioPlan,
  searchStudioWords,resolveStudioWords,StudioConflictError,StudioUncertainChargeError,studioHasUncertainCharge,estimateImageCost,plannerCost,plannerForSelection,
  listWordbankEntries,compileScenarioStoryPrompt,
  type DbPool,type ImageCatalog,type GenerationSettings,type StudioDraft,type StudioEditable,type StudioJobKind } from "@el/shared";

export interface ScenarioStudioRouteDeps {
  studioDir:string;imageDir:string;audioDir:string;catalog?:ImageCatalog;
  resolveSettings?:()=>Promise<GenerationSettings>;
  getAvailability?:()=>{google:boolean;openai:boolean;localQwen:boolean};
}
const UUID=z.string().uuid(), Version=z.number().int().positive();
const Levels=z.array(z.enum(["basic","advance"])).min(1).max(2);
const Empty=z.object({}).strict();
const DraftParams=z.object({id:UUID}).strict();
export function registerScenarioStudioRoutes(app:FastifyInstance,pool:DbPool,deps:ScenarioStudioRouteDeps):void{
  const base="/scenarios/studio";
  const add=(method:"GET"|"POST"|"PUT",url:string,handler:any,extra:Record<string,unknown>={})=>app.route({method,url:base+url,preHandler:requireAdmin,handler,...extra});
  const editable=(draft:StudioDraft):StudioEditable=>StudioEditableSchema.parse(Object.fromEntries(Object.keys(StudioEditableSchema.shape).map(k=>[k,(draft as any)[k]])));
  const settings=async()=>deps.resolveSettings?deps.resolveSettings():(await getGenerationSettings(pool)).settings;
  const availability=()=>deps.getAvailability?.()??{google:false,openai:false,localQwen:false};
  const detail=async(draft:StudioDraft)=>{
    const assets=(await listStudioAssets(pool,draft.id)).map(a=>({...a,url:`${base}/drafts/${draft.id}/media/${a.id}`}));
    const missingAudioPlan=await studioMissingAudioPlan(pool,draft,deps.audioDir);
    const checks=await studioDraftChecks(pool,draft,assets);
    if(missingAudioPlan.length)checks.push({code:"wordbank-audio-missing",message:`目標字庫還缺 ${missingAudioPlan.length} 段錄音`,blocking:true});
    const pub=(await pool.query("SELECT published_revision FROM learning_scenarios WHERE scenario_key=$1",[draft.scenarioKey])).rows[0];
    return {draft,assets,jobs:await listStudioJobs(pool,draft.id),checks,compiledPrompt:studioCompiledPrompt(draft),missingAudioPlan,publishedRevision:pub?.published_revision??null};
  };
  const getDraft=async(request:any,reply:any)=>{const p=DraftParams.safeParse(request.params);if(!p.success||!Empty.safeParse(request.query).success){reply.code(400).send({error:"invalid request"});return null;}const d=await getStudioDraft(pool,p.data.id);if(!d)reply.code(404).send({error:"draft not found"});return d;};
  const guard=async(reply:any,fn:()=>Promise<unknown>)=>{try{return await fn();}catch(e){if(e instanceof StudioConflictError)return reply.code(409).send({error:e.message,...(e instanceof StudioUncertainChargeError?{requiresUncertainAcknowledgement:true}:{})});if(e instanceof z.ZodError)return reply.code(400).send({error:"invalid studio content"});throw e;}};
  const snapshot=async(draft:StudioDraft,kind:StudioJobKind)=>{
    if(draft.materializedRevision!==null)throw new StudioConflictError("教材已固定為版本，請複製成新草稿再生成");
    const selectedSettings=await settings(),imageModel=deps.catalog?.models.find(m=>m.enabled&&m.id===(draft.promptSettings.imageModelKey||selectedSettings.image.model));
    let inputHash=studioInputHash(editable(draft),kind,selectedSettings,imageModel),storyPrompt:string|undefined;
    let estimatedCostUsdMicros=0,modelLabel="本機素材處理",localCompute=true;
    if(kind==="image"){
      if(!imageModel||!deps.catalog)throw new StudioConflictError("尚未設定圖片模型");
      const allowed=availability();if(!(imageModel.provider==="openai"?allowed.openai:allowed.google))throw new StudioConflictError("圖片供應商尚未設定憑證");
      const pricing=deps.catalog.pricing.find(p=>p.id===imageModel.pricingProfileId)!;
      estimatedCostUsdMicros=estimateImageCost(imageModel,pricing,"cover",Buffer.byteLength(studioCompiledPrompt(draft)),false);modelLabel=imageModel.label;localCompute=false;
    }else if(kind==="story"){
      if(!availability()[selectedSettings.text.provider])throw new StudioConflictError("文字供應商尚未設定憑證");
      if(!deps.catalog)throw new StudioConflictError("尚未設定文字模型費率");
      const planner=plannerForSelection(deps.catalog.planner,selectedSettings.text,deps.catalog.plannerProfiles);
      const dictionary=(await listWordbankEntries(pool)).filter(e=>draft.vocabularyFilter.levels.includes(e.level.list as "basic"|"advance"));
      storyPrompt=compileScenarioStoryPrompt({titleZh:draft.titleZh,targets:draft.targets,imageSettings:{sceneDescription:draft.sceneDescription}},dictionary);
      inputHash=scenarioHash(inputHash+storyPrompt);
      estimatedCostUsdMicros=plannerCost(planner,Buffer.byteLength(storyPrompt));modelLabel=selectedSettings.text.model;localCompute=false;
    }else if(kind==="story-audio"||kind==="wordbank-audio"){
      if(!availability().localQwen)throw new StudioConflictError("本機 Qwen TTS 尚未啟用");modelLabel="本機 Qwen／Serena";
    }
    return {inputHash,settings:selectedSettings,imageModel,storyPrompt,quote:{kind,version:draft.version,inputHash,estimatedCostUsdMicros,localCompute,modelLabel}};
  };
  add("GET","/options",async(request:any,reply:any)=>{
    if(!Empty.safeParse(request.query).success)return reply.code(400).send({error:"invalid query"});
    const selected=await settings(),available=availability(),workers=await listStudioWorkers(pool);
    return {presets:STUDIO_PRESETS,blocks:STUDIO_BLOCKS,imageModels:deps.catalog?.models.filter(m=>m.enabled).map(m=>({id:m.id,label:m.label,provider:m.provider,available:m.provider==="openai"?available.openai:available.google}))??[],speech:{provider:"local-qwen",...STUDIO_SERENA,available:available.localQwen},text:{...selected.text,available:available[selected.text.provider]},workers,workerOnline:workers.length>0,defaultImageModelKey:selected.image.model};
  });
  add("GET","/words",async(request:any,reply:any)=>{const q=z.object({q:z.string().max(200).default(""),levels:z.string().default("basic,advance"),pos:z.enum(["n","v","adj"]).optional(),limit:z.coerce.number().int().min(1).max(100).default(30),offset:z.coerce.number().int().nonnegative().max(10000).default(0)}).strict().safeParse(request.query);if(!q.success)return reply.code(400).send({error:"invalid query"});const levels=Levels.safeParse(q.data.levels.split(","));if(!levels.success)return reply.code(400).send({error:"invalid levels"});return searchStudioWords(pool,q.data.q,levels.data,q.data.pos,q.data.limit,q.data.offset);});
  add("POST","/words/resolve",async(request:any,reply:any)=>{const b=z.object({words:z.array(z.string().trim().min(1).max(200)).max(100),levels:Levels}).strict().safeParse(request.body);if(!b.success)return reply.code(400).send({error:"invalid words"});return resolveStudioWords(pool,b.data.words,b.data.levels);});
  add("GET","/drafts",async(request:any,reply:any)=>Empty.safeParse(request.query).success?{drafts:await listStudioDrafts(pool)}:reply.code(400).send({error:"invalid query"}));
  add("POST","/drafts",async(request:any,reply:any)=>guard(reply,async()=>{
    const full=StudioEditableSchema.safeParse(request.body),minimal=z.object({scenarioKey:ScenarioKeySchema}).strict().safeParse(request.body);if(!full.success&&!minimal.success)return reply.code(400).send({error:"invalid draft"});
    const input=full.success?full.data:emptyStudioDraft(minimal.data!.scenarioKey,(await settings()).image.model);return detail(await createStudioDraft(pool,input,request.user.id));
  }));
  add("GET","/drafts/:id",async(request:any,reply:any)=>{const d=await getDraft(request,reply);return d?detail(d):undefined;});
  add("PUT","/drafts/:id",async(request:any,reply:any)=>guard(reply,async()=>{
    const d=await getDraft(request,reply);if(!d)return;const b=StudioEditableSchema.extend({version:Version}).strict().safeParse(request.body);if(!b.success)return reply.code(400).send({error:"invalid draft"});const{version,...input}=b.data;
    const owned=await listStudioAssets(pool,d.id);for(const [id,kind]of [[input.selectedImageId,"image"],[input.selectedAudioId,"story-audio"]])if(id&&!owned.some(a=>a.id===id&&a.kind===kind))return reply.code(400).send({error:"asset does not belong to this draft"});
    const analyzed=await analyzeStudioStory(pool,input);input.story=analyzed.story;
    return detail(await updateStudioDraft(pool,d.id,version,input));
  }));
  add("POST","/drafts/fork",async(request:any,reply:any)=>guard(reply,async()=>{
    const b=z.object({sourceKey:ScenarioKeySchema,sourceRevision:Version}).strict().safeParse(request.body);if(!b.success)return reply.code(400).send({error:"invalid source"});const source=await getScenarioRevision(pool,b.data.sourceKey,b.data.sourceRevision,true);if(!source)return reply.code(404).send({error:"source not found"});
    const input=emptyStudioDraft(source.content.scenarioKey,(await settings()).image.model);Object.assign(input,{titleZh:source.content.titleZh,vocabularyFilter:source.content.vocabularyFilter,targets:source.content.targets,story:source.content.story,sceneDescription:source.content.titleZh});
    const draft=await createStudioDraft(pool,input,request.user.id);
    const assets=[];for(const kind of ["image","audio"]as const){const sourceAsset=source.media[kind],bytes=await readScenarioAsset(kind==="image"?deps.imageDir:deps.audioDir,sourceAsset);const asset=await insertStudioAsset(pool,{...await writeStudioMedia(deps.studioDir,draft.id,kind==="image"?"image":"story-audio",bytes,sourceAsset.contentType),inputHash:studioInputHash(input,kind==="image"?"image":"story-audio"),metadata:{sourceKey:b.data.sourceKey,sourceRevision:b.data.sourceRevision},...(kind==="audio"?{textSha256:scenarioHash(input.story!.textEn)}:{})});assets.push(asset);}
    return detail(await updateStudioDraft(pool,draft.id,draft.version,{...input,selectedImageId:assets.find(a=>a.kind==="image")!.id,selectedAudioId:assets.find(a=>a.kind==="story-audio")!.id}));
  }));
  add("POST","/drafts/:id/quote",async(request:any,reply:any)=>guard(reply,async()=>{
    const d=await getDraft(request,reply);if(!d)return;const b=z.object({version:Version,kind:StudioJobKindSchema}).strict().safeParse(request.body);if(!b.success)return reply.code(400).send({error:"invalid quote"});if(b.data.version!==d.version)throw new StudioConflictError("草稿版本已更新");
    const s=await snapshot(d,b.data.kind);const row=(await pool.query("INSERT INTO scenario_studio_quotes(draft_id,kind,input_version,input_hash,snapshot) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING id,expires_at",[d.id,b.data.kind,d.version,s.inputHash,JSON.stringify(s)])).rows[0];return {...s.quote,quoteHash:row.id,expiresAt:new Date(row.expires_at).toISOString()};
  }));
  add("POST","/drafts/:id/jobs",async(request:any,reply:any)=>guard(reply,async()=>{
    const d=await getDraft(request,reply);if(!d)return;const b=z.object({version:Version,kind:StudioJobKindSchema,idempotencyKey:z.string().min(1).max(200),quoteHash:UUID.optional(),ackUncertain:z.boolean().optional()}).strict().safeParse(request.body);if(!b.success)return reply.code(400).send({error:"invalid job"});
    // 先回同一操作的既有結果；不因生成成功後草稿版本遞增而重送。
    const prior=(await pool.query("SELECT id,input_version,kind FROM scenario_studio_jobs WHERE draft_id=$1 AND idempotency_key=$2",[d.id,b.data.idempotencyKey])).rows[0];if(prior){if(prior.input_version!==b.data.version||prior.kind!==b.data.kind)throw new StudioConflictError("操作編號已用於另一份輸入");return reply.code(202).send({job:await getStudioJob(pool,prior.id)});}
    if(d.version!==b.data.version)throw new StudioConflictError("草稿版本已更新");
    const targetChecks=await validateStudioTargets(pool,d);if(targetChecks.length&&b.data.kind!=="finalize")return reply.code(400).send({error:"請先完成目標詞選擇",checks:targetChecks});
    if(b.data.kind==="story-audio"&&(!d.story||!d.review.story||(await analyzeStudioStory(pool,d)).checks.length))return reply.code(400).send({error:"請先修正並驗收故事與字庫映射"});
    const uncertain=await studioHasUncertainCharge(pool,d.id);if(uncertain&&!b.data.ackUncertain)return reply.code(409).send({error:"先前請求或已取消請求結果不明；重送前請接受可能的重複費用",requiresUncertainAcknowledgement:true});
    const s=await snapshot(d,b.data.kind);
    if(b.data.kind==="story"||b.data.kind==="image"){const quote=b.data.quoteHash&&(await pool.query("SELECT * FROM scenario_studio_quotes WHERE id=$1 AND draft_id=$2 AND expires_at>now()",[b.data.quoteHash,d.id])).rows[0];if(!quote||quote.kind!==b.data.kind||quote.input_version!==d.version||quote.input_hash!==s.inputHash)throw new StudioConflictError("請重新查看此版本的生成估價");}
    const missingAudioPlan=await studioMissingAudioPlan(pool,d,deps.audioDir,b.data.kind==="wordbank-audio"||b.data.kind==="finalize");
    if(b.data.kind==="finalize"){const checks=await studioDraftChecks(pool,d,await listStudioAssets(pool,d.id));if(checks.length||missingAudioPlan.length)return reply.code(400).send({error:"教材尚有未完成項目",checks,missingAudioPlan});}
    if(b.data.kind==="wordbank-audio"&&!missingAudioPlan.length)return reply.code(400).send({error:"目標字庫錄音已完整"});
    const job=await enqueueStudioJob(pool,d.id,d.version,{kind:b.data.kind,inputHash:s.inputHash,input:{draft:d,settings:s.settings,imageModel:s.imageModel,storyPrompt:s.storyPrompt,quote:s.quote,missingAudioPlan},idempotencyKey:b.data.idempotencyKey,ackUncertain:b.data.ackUncertain});return reply.code(202).send({job});
  }));
  add("GET","/drafts/:id/jobs",async(request:any,reply:any)=>{const d=await getDraft(request,reply);return d?{jobs:await listStudioJobs(pool,d.id)}:undefined;});
  add("POST","/jobs/:id/cancel",async(request:any,reply:any)=>{const p=DraftParams.safeParse(request.params);if(!p.success||request.body!==undefined&&!Empty.safeParse(request.body).success)return reply.code(400).send({error:"invalid request"});const job=await cancelStudioJob(pool,p.data.id);return job?{job}:reply.code(404).send({error:"job not found"});});
  add("POST","/jobs/:id/retry",async(request:any,reply:any)=>guard(reply,async()=>{
    const p=DraftParams.safeParse(request.params),b=z.object({version:Version,idempotencyKey:z.string().min(1).max(200),ackUncertain:z.boolean().optional()}).strict().safeParse(request.body);if(!p.success||!b.success)return reply.code(400).send({error:"invalid retry"});const job=await getStudioJob(pool,p.data.id);if(!job)return reply.code(404).send({error:"job not found"});if(!["failed","uncertain","cancelled"].includes(job.status))throw new StudioConflictError("此工作不可重試");if(await studioHasUncertainCharge(pool,job.draftId)&&!b.data.ackUncertain)return reply.code(409).send({error:"結果不明，可能重複計費",requiresUncertainAcknowledgement:true});const draft=await getStudioDraft(pool,job.draftId);if(!draft||draft.version!==b.data.version||job.inputVersion!==draft.version)throw new StudioConflictError("草稿已改動，請以目前內容建立新工作");return reply.code(202).send({job:await enqueueStudioJob(pool,job.draftId,draft.version,{kind:job.kind,inputHash:job.inputHash,input:job.input,idempotencyKey:b.data.idempotencyKey,ackUncertain:b.data.ackUncertain})});
  }));
  add("POST","/drafts/:id/assets",async(request:any,reply:any)=>guard(reply,async()=>{
    const d=await getDraft(request,reply);if(!d)return;if(d.materializedRevision!==null)throw new StudioConflictError("教材已固定為版本，請複製成新草稿再上傳素材");const b=z.object({version:Version,kind:z.enum(["image","story-audio"]),dataBase64:z.string().min(1).max(24_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),contentType:z.enum(["image/png","image/jpeg","image/webp","audio/mpeg"]),textSha256:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict().safeParse(request.body);if(!b.success)return reply.code(400).send({error:"invalid upload"});if(d.version!==b.data.version)throw new StudioConflictError("草稿版本已更新");
    if(b.data.kind==="story-audio"&&(!d.story||b.data.textSha256!==scenarioHash(d.story.textEn)))return reply.code(400).send({error:"旁白必須對應目前故事文字"});
    let media;try{media=await writeStudioMedia(deps.studioDir,d.id,b.data.kind,Buffer.from(b.data.dataBase64,"base64"),b.data.contentType);}catch{return reply.code(400).send({error:"素材解碼失敗或格式不符，上限16MB"});}
    await insertStudioAsset(pool,{...media,inputHash:studioInputHash(editable(d),b.data.kind==="image"?"image":"story-audio"),metadata:{source:"upload"},...(b.data.textSha256?{textSha256:b.data.textSha256}:{})});return detail((await getStudioDraft(pool,d.id))!);
  }),{bodyLimit:25*1024*1024});
  add("GET","/drafts/:id/media/:assetId",async(request:any,reply:any)=>{
    const p=z.object({id:UUID,assetId:UUID}).strict().safeParse(request.params);if(!p.success||!Empty.safeParse(request.query).success)return reply.code(400).send({error:"invalid request"});const a=await getStudioAsset(pool,p.data.id,p.data.assetId);if(!a)return reply.code(404).send({error:"asset not found"});try{const bytes=await readStudioMedia(deps.studioDir,a);return reply.header("Cache-Control","private, no-store").header("Content-Type",a.contentType).header("X-Content-Type-Options","nosniff").send(bytes);}catch{return reply.code(404).send({error:"asset unavailable"});}
  });
}
