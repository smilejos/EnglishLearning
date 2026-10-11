import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir,open,lstat,readFile,realpath,unlink,link } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { scenarioHash,scenarioSafePath } from "../scenarios";
import type { StudioAsset } from "./contracts";
const execute=promisify(execFile);
export async function validateStudioMp3(filename:string):Promise<{durationSeconds:number;bytes:number}>{
  const {stdout,stderr}=await execute("ffprobe",["-v","error","-show_entries","format=duration:stream=codec_name","-of","json",filename],{timeout:30000,maxBuffer:1024*1024});
  if(stderr.trim())throw new Error("音檔格式檢查失敗");const info=JSON.parse(stdout),durationSeconds=Number(info.format?.duration);
  if(!Number.isFinite(durationSeconds)||durationSeconds<=0||!info.streams?.some((s:any)=>s.codec_name==="mp3"))throw new Error("音檔必須為有效 MP3");
  const decoded=await execute("ffmpeg",["-v","error","-i",filename,"-f","null","-"],{timeout:60000,maxBuffer:1024*1024});if(decoded.stderr.trim())throw new Error("MP3 無法完整解碼");
  return {durationSeconds,bytes:(await lstat(filename)).size};
}
export async function writeStudioMedia(root:string,draftId:string,kind:StudioAsset["kind"],bytes:Buffer,contentType:StudioAsset["contentType"]):Promise<Omit<StudioAsset,"id"|"createdAt"|"inputHash"|"metadata"|"url">>{
  if(!/^[a-f0-9-]{36}$/.test(draftId)||bytes.length===0||bytes.length>16*1024*1024)throw new Error("素材格式或大小無效（上限16MB）");
  const extensions:{[key:string]:string}={"image/png":"png","image/jpeg":"jpg","image/webp":"webp","audio/mpeg":"mp3"};
  const ext=extensions[contentType];if(!ext||(kind==="image")!==contentType.startsWith("image/"))throw new Error("素材種類與格式不符");
  const base=await realpath(root),sha256=scenarioHash(bytes),relativePath=`studio/${draftId}/${kind}/${sha256}.${ext}`;let directory=base;
  for(const part of relativePath.split("/").slice(0,-1)){directory=path.join(directory,part);await mkdir(directory).catch(e=>{if(e.code!=="EEXIST")throw e;});const stat=await lstat(directory);if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error("素材路徑不可使用symlink");}
  const filename=path.join(base,relativePath);let created=false;
  const temporary=path.join(directory,`.${sha256}-${randomUUID()}.tmp`);
  try{const handle=await open(temporary,"wx");try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}try{await link(temporary,filename);created=true;}catch(e){if((e as NodeJS.ErrnoException).code!=="EEXIST")throw e;const old=await readFile(await scenarioSafePath(base,relativePath));if(scenarioHash(old)!==sha256)throw new Error("素材hash不符");}}finally{await unlink(temporary).catch(e=>{if(e.code!=="ENOENT")throw e;});}
  try{const result={draftId,kind,relativePath,sha256,bytes:bytes.length,contentType};
    if(kind==="image"){const image=await sharp(bytes,{limitInputPixels:40_000_000}).metadata(),formats:Record<string,string>={png:"image/png",jpeg:"image/jpeg",webp:"image/webp"};if(!image.width||!image.height||formats[image.format??""]!==contentType||image.pages&&image.pages>1)throw new Error("圖片格式不符或為多頁圖片");await sharp(bytes,{limitInputPixels:40_000_000}).raw().toBuffer();return {...result,width:image.width,height:image.height};}
    return {...result,...await validateStudioMp3(filename)};
  }catch(e){if(created)await unlink(filename);throw e;}
}
export async function readStudioMedia(root:string,asset:StudioAsset):Promise<Buffer>{const bytes=await readFile(await scenarioSafePath(root,asset.relativePath));if(bytes.length!==asset.bytes||scenarioHash(bytes)!==asset.sha256)throw new Error("素材已損毀");return bytes;}
