import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs"; import { execFile } from "node:child_process"; import { promisify } from "node:util";
const ex=promisify(execFile);
const DD=process.cwd()+"/test-output/broll-motion"; fs.rmSync(DD,{recursive:true,force:true});
const env={...process.env,MP_DATA_DIR:DD,MP_PORT:"0"}; delete env.AUTH_TOKENS; delete env.SESSION_SECRET;
const t=new StdioClientTransport({command:"node",args:[process.cwd()+"/dist/index.js"],env,stderr:"inherit"});
const c=new Client({name:"bm",version:"1"},{capabilities:{}}); await c.connect(t); const J=x=>JSON.parse(x.content[0].text);
const poll=async(id,ms)=>{const s=Date.now();let l="";while(Date.now()-s<ms){const r=J(await c.callTool({name:"job",arguments:{action:"status",job_id:id}}));if(r.progress&&`${r.progress.step}`!==l){l=`${r.progress.step}`;console.log("  ..."+l);}if(r.status==="completed"||r.status==="failed")return r;await new Promise(x=>setTimeout(x,4000));}throw new Error("timeout");};
console.log(">>> generate(full) travel brand film (motion-required b-roll)...");
const g=J(await c.callTool({name:"generate",arguments:{tenant_id:"bm",mode:"full",target:"video",prompt:"A cinematic 18-second brand film for a sustainable travel startup: open on wanderlust and open roads, introduce the app, show trip planning, end on an aspirational call to explore.",voiceover:false,brief:{video_type:"brand",target_duration:18}}}));
const gj=await poll(g.job_id,1800000); console.log(">>> generate:",gj.status,gj.error||"");
const pid=fs.readdirSync(`${DD}/bm/projects`).filter(d=>d.startsWith("proj_")).map(d=>({d,t:fs.statSync(`${DD}/bm/projects/${d}`).mtimeMs})).sort((a,b)=>b.t-a.t)[0].d;
const proj=JSON.parse(fs.readFileSync(`${DD}/bm/projects/${pid}/project.json`));
proj.plan.scenes.forEach((s,i)=>{if(s.broll_query)console.log(`>>> b-roll scene ${i+1}: "${s.broll_query}"`);});
console.log(">>> render...");
const r=J(await c.callTool({name:"render",arguments:{tenant_id:"bm",project_id:pid,quality:"preview"}}));
const rj=await poll(r.job_id,1800000); console.log(">>> render:",rj.status);
// measure motion per scene (account for ~0.5s transitions between scenes)
const OUT=rj.outputPath; let t0=0;
for (let i=0;i<proj.scenes.length;i++){
  const s=proj.scenes[i]; const dur=s.duration_seconds; const start=t0+0.6; const md=Math.max(1,dur-1.2);
  const out=(await ex("ffmpeg",["-ss",String(start),"-t",String(md),"-i",OUT,"-vf","crop=iw:140:0:0,tblend=all_mode=difference,signalstats,metadata=print","-f","null","-"],{maxBuffer:1e8})).stderr||"";
  const vals=(out.match(/lavfi.signalstats.YAVG=([0-9.]+)/g)||[]).map(x=>parseFloat(x.split("=")[1]));
  const avg=vals.length?(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2):"?";
  console.log(`>>> scene ${i+1} ${s.background_video?"[B-ROLL]":"[graphics]"} motion=${avg}`);
  t0+=dur;
}
fs.mkdirSync("/tmp/motion2",{recursive:true});const d=parseFloat((await ex("ffprobe",["-v","error","-show_entries","format=duration","-of","default=nk=1:nw=1",OUT])).stdout);for(let i=0;i<6;i++){await ex("ffmpeg",["-y","-ss",String(Math.max(0.1,d*(i+0.5)/6)),"-i",OUT,"-frames:v","1","/tmp/motion2/f"+i+".png"]);}
await c.close();
