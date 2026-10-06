const S={cases:[],filtered:[],page:1,pageSize:25,charts:[],integrity:new Map(),integrityMeta:null,compassMode:"",ncFlow:new Map(),ncFlowData:null,ncSelected:""};
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const fmt=n=>new Intl.NumberFormat("th-TH").format(n||0);
const parseDMY=(s,year)=>{if(!s)return null;const p=String(s).split("/").map(Number);if(p.length<2)return null;let y=p[2]||year;if(y>2400)y-=543;if(y<100)y+=y<50?2000:2500;return new Date(y,p[1]-1,p[0]);};
const pct=(a,b)=>a?((b-a)/a*100):null;
const cutoff={2568:new Date(2025,8,30,23,59,59),2569:new Date(2026,8,30,23,59,59)};
const ytd=y=>S.cases.filter(c=>c.year_be===y&&(()=>{const d=parseDMY(c.issue_date,y===2568?2025:2026);return d&&d<=cutoff[y]})());
const count=(arr,key,val)=>arr.filter(x=>x[key]===val).length;
const countSev=(arr,vals)=>arr.filter(x=>vals.includes(x.severity)).length;
const mkChart=(id,cfg)=>{const ch=new Chart($(id),cfg);S.charts.push(ch);return ch};
Chart.defaults.color="#9fb4c5";
Chart.defaults.borderColor="rgba(100,140,170,.15)";
Chart.defaults.font.family='"Noto Sans Thai",system-ui,sans-serif';
const COLOR_68="#4aa3ff",COLOR_69="#61e0d1",COLOR_RED="#ff7b86",COLOR_AMBER="#ffca6a",COLOR_GREEN="#62d79c";

function initTabs(){document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{
 document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");
 if(b.dataset.target==="explorer"&&S.compassMode){S.compassMode="";S.page=1;applyFilters();}
 $(b.dataset.target).scrollIntoView({behavior:"smooth",block:"start"});
}));}


function avg(arr,key){
 const xs=arr.map(x=>Number(x[key])).filter(Number.isFinite);
 return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
}
function gateState(value,max){
 const p=max?value/max:0;
 if(p>=.75)return ["CONTROLLED","good"];
 if(p>=.60)return ["WATCH","warn"];
 return ["RISK","risk"];
}
function setGate(id,value,max){
 const [label,cls]=gateState(value,max),el=$(id);
 el.textContent=label;el.className="gate-state "+cls;
}
function buildCompass(data){
 const rows=data.cases||[];
 const opening=avg(rows,"opening_quality"),root=avg(rows,"root_cause_quality"),
       action=avg(rows,"corrective_action_quality"),effect=avg(rows,"effectiveness_quality"),
       health=Number(data.meta?.avg_integrity_score||0);
 $("processHealth").textContent=health.toFixed(1)+" / 100";
 $("processHealthNote").textContent=health>=75?"ระบบอยู่ในช่วงควบคุมได้ แต่ยังต้องเฝ้าระวัง":"ต้องใช้ QMR Gate เข้มขึ้นก่อนอนุมัติปิด";
 $("compassState").textContent="357 CAR · QMR process view · "+(data.meta?.analysis_states?.VISION_REVIEW_REQUIRED||0)+" เคสมีหลักฐานภาพรอทบทวน";
 $("gateOpeningAvg").textContent=opening.toFixed(1); $("gateRootAvg").textContent=root.toFixed(1);
 $("gateActionAvg").textContent=action.toFixed(1); $("gateEffectAvg").textContent=effect.toFixed(1);
 setGate("gateOpeningState",opening,20);setGate("gateRootState",root,30);
 setGate("gateActionState",action,30);setGate("gateEffectState",effect,20);

 const gaps={
  opening:rows.filter(x=>Number(x.opening_quality)<12).length,
  root:rows.filter(x=>Number(x.root_cause_quality)<15).length,
  action:rows.filter(x=>Number(x.corrective_action_quality)<15).length,
  effectiveness:rows.filter(x=>Number(x.effectiveness_quality)<10).length,
  evidence:rows.filter(x=>x.analysis_state==="VISION_REVIEW_REQUIRED").length
 };
 const priorities=[
  {k:"root",n:gaps.root,title:"Root Cause Gate",desc:"เคสที่ Root Cause ต่ำกว่าเกณฑ์ ต้อง challenge ว่าเจอสาเหตุระบบจริงหรือยัง",level:"risk"},
  {k:"action",n:gaps.action,title:"System Action Gate",desc:"เคสที่ Action ยังไม่แข็งแรง ต้องตรวจ Cause ↔ Action และหลีกเลี่ยงการปิดด้วยการสื่อสารอย่างเดียว",level:"risk"},
  {k:"effectiveness",n:gaps.effectiveness,title:"Effectiveness Gate",desc:"ห้ามเท่ากับ Action Completed ต้องมี verification และ recurrence check",level:"warn"},
  {k:"opening",n:gaps.opening,title:"Opening Quality",desc:"ย้อนตรวจ Problem Statement, Evidence และ Requirement ตั้งแต่ต้นน้ำ",level:"warn"},
  {k:"evidence",n:gaps.evidence,title:"Evidence Completeness",desc:"หลักฐานภาพ/ไฟล์แนบที่ยังต้องทบทวนก่อน Final QMR Verdict",level:"review"}
 ].sort((a,b)=>b.n-a.n);
 $("qmrPriorities").innerHTML=priorities.map((x,i)=>'<button class="priority '+x.level+'" data-compass-action="'+x.k+'"><span class="priority-rank">'+(i+1)+'</span><span class="priority-copy"><b>'+esc(x.title)+'</b><small>'+esc(x.desc)+'</small></span><strong>'+fmt(x.n)+'</strong></button>').join("");

 const verdicts=data.meta?.verdicts||{},weak=(verdicts.WEAK_CLOSURE_RISK||0),rootGap=(verdicts.ROOT_CAUSE_GAP_RISK||0),effGap=(verdicts.EFFECTIVENESS_GAP_RISK||0);
 const weakTermCases=rows.filter(x=>(x.weak_action_hits||[]).length).length;
 const radar=[
  ["Root Cause Gap",rootGap,"CAR ที่ต้อง challenge สาเหตุ"],
  ["Weak Closure",weak,"เสี่ยงปิดด้วย Action ที่ไม่เปลี่ยนระบบ"],
  ["Effectiveness Gap",effGap,"ดำเนินการแล้ว แต่หลักฐานประสิทธิผลยังไม่พอ"],
  ["Communication-only signal",weakTermCases,"พบคำประเภท อบรม/KYT/เน้นย้ำ/กำชับ"],
  ["Evidence review",gaps.evidence,"ต้องตรวจหลักฐานภาพก่อน Final Verdict"]
 ];
 $("riskRadar").innerHTML=radar.map(x=>'<div class="radar-row"><div><b>'+esc(x[0])+'</b><small>'+esc(x[2])+'</small></div><strong>'+fmt(x[1])+'</strong></div>').join("");

 document.querySelectorAll("[data-compass-action]").forEach(btn=>btn.addEventListener("click",()=>{
   S.compassMode=btn.dataset.compassAction||"";
   if($("auditFilter")) $("auditFilter").value="";
   S.page=1;applyFilters();
   $("explorer").scrollIntoView({behavior:"smooth",block:"start"});
 }));
}


function ncCaseId(x){return "CAR-"+String(x.year_be).slice(-2)+"-"+String(Number(x.case_no||0)).padStart(4,"0");}
function ncDecisionLabel(v){
 const m={REOPEN_RECOMMENDED:"Reopen Recommended",RETURN_FOR_CORRECTION:"Return for Correction",VERIFY_BEFORE_CLOSE:"Verify Before Close",CLOSE_CANDIDATE:"Close Candidate"};
 return m[v]||v||"—";
}
function ncDecisionClass(v){
 if(v==="CLOSE_CANDIDATE")return "good";
 if(v==="VERIFY_BEFORE_CLOSE")return "warn";
 return "risk";
}
function ncStatusLabel(v){return v==="pass"?"PASS":v==="warn"?"WATCH":"FAIL";}
function buildNCFlow(data){
 S.ncFlowData=data; S.ncFlow=new Map((data.cases||[]).map(x=>[ncCaseId(x),x]));
 const q=data.meta?.qmr_decisions||{};
 $("ncReopen").textContent=fmt(q.REOPEN_RECOMMENDED||0);
 $("ncReturn").textContent=fmt(q.RETURN_FOR_CORRECTION||0);
 $("ncVerify").textContent=fmt(q.VERIFY_BEFORE_CLOSE||0);
 $("ncClose").textContent=fmt(q.CLOSE_CANDIDATE||0);
 $("ncFlowSnapshot").textContent=fmt(data.meta?.cases||0)+" CAR · วิเคราะห์ครบทุกฉบับจาก Database";

 const stageTitles=["Opening / Qualification","Root Cause","Corrective Action","Effectiveness / Closure"];
 const sc=data.meta?.stage_counts||{};
 $("ncAggregateFlow").innerHTML=stageTitles.map((t,i)=>{
   const pass=sc[t+"|pass"]||0,warn=sc[t+"|warn"]||0,fail=sc[t+"|fail"]||0,total=pass+warn+fail||1;
   const failPct=Math.round(fail*100/total),warnPct=Math.round(warn*100/total);
   return '<div class="nc-stage-card"><div class="nc-stage-no">'+String(i+1).padStart(2,"0")+'</div><h4>'+esc(t)+'</h4><div class="nc-stage-bars"><span class="bar fail" style="width:'+failPct+'%"></span><span class="bar warn" style="width:'+warnPct+'%"></span></div><div class="nc-stage-stats"><b class="fail">'+fmt(fail)+' Fail</b><b class="warn">'+fmt(warn)+' Watch</b><b class="pass">'+fmt(pass)+' Pass</b></div><small>'+esc(i===0?"ตั้งโจทย์ / Requirement / Classification":i===1?"วิเคราะห์ให้ถึง System Cause":i===2?"Cause ↔ Action และ System Control":"Verification / Recurrence / QMR Closure")+'</small></div>';
 }).join("");

 fillNCSelector();
 $("ncDecisionFilter").addEventListener("change",fillNCSelector);
 $("ncCaseSelect").addEventListener("change",()=>renderNCFlowCase($("ncCaseSelect").value));
 $("ncOpenCase").addEventListener("click",()=>{if(S.ncSelected)openCase(S.ncSelected);});
 const first=(data.cases||[]).find(x=>x.qmr_decision==="REOPEN_RECOMMENDED")||data.cases?.[0];
 if(first)renderNCFlowCase(ncCaseId(first));
}
function fillNCSelector(){
 const filter=$("ncDecisionFilter")?.value||"";
 const xs=(S.ncFlowData?.cases||[]).filter(x=>!filter||x.qmr_decision===filter);
 $("ncCaseSelect").innerHTML=xs.map(x=>{
   const id=ncCaseId(x),c=S.cases.find(z=>z.case_id===id);
   return '<option value="'+esc(id)+'">'+esc(id+(c?.car_number?" · "+c.car_number:"")+" · "+ncDecisionLabel(x.qmr_decision))+'</option>';
 }).join("");
 if(xs.length){
   const id=ncCaseId(xs[0]);$("ncCaseSelect").value=id;renderNCFlowCase(id);
 } else {
   $("ncCaseTitle").textContent="ไม่พบ CAR ตามตัวกรอง";$("ncFlowMap").innerHTML="";$("ncChainSummary").textContent="";$("ncDecisionBadge").textContent="—";$("ncQmrAction").innerHTML="";
 }
}
function renderNCFlowCase(id){
 const x=S.ncFlow.get(id); if(!x)return;
 S.ncSelected=id; if($("ncCaseSelect"))$("ncCaseSelect").value=id;
 const c=S.cases.find(z=>z.case_id===id);
 $("ncCaseTitle").textContent=id+(c?.car_number?" · "+c.car_number:"");
 $("ncChainSummary").textContent=x.chain_summary||"—";
 $("ncDecisionBadge").className="nc-decision "+ncDecisionClass(x.qmr_decision);
 $("ncDecisionBadge").textContent=ncDecisionLabel(x.qmr_decision);
 const labels=["ต้นน้ำ","วิเคราะห์","แก้ระบบ","ปิด/ทวนสอบ"];
 $("ncFlowMap").innerHTML=(x.stages||[]).map((s,i)=>
   '<article class="nc-node '+esc(s.status)+'"><div class="nc-node-head"><span>'+labels[i]+'</span><b>'+ncStatusLabel(s.status)+'</b></div><h4>'+esc(s.title)+'</h4><div class="nc-node-block"><small>พลาดตรงไหน</small><p>'+esc(s.finding)+'</p></div><div class="nc-node-block"><small>ทำไมสำคัญ</small><p>'+esc(s.why_it_matters)+'</p></div><div class="nc-node-block next"><small>ลามต่อไป</small><p>'+esc(s.next_risk)+'</p></div>'+(s.score!=null?'<div class="nc-score">Score '+esc(s.score)+'</div>':'')+'</article>'
 ).join("");
 const actions={
  REOPEN_RECOMMENDED:["QMR Action: REOPEN / VERIFY ใหม่","CAR ถูกปิดแล้วแต่ยังพบ Process Failure อย่างน้อย 1 Gate — ควรย้อนตรวจ Root Cause ↔ Action ↔ Effectiveness ก่อนยอมรับการปิด"],
  RETURN_FOR_CORRECTION:["QMR Action: RETURN","ยังไม่ควรเดินต่อ ให้เจ้าของ CAR แก้จุดที่ Fail ก่อนส่งกลับมา QMR Gate"],
  VERIFY_BEFORE_CLOSE:["QMR Action: VERIFY","ไม่มี Fail สำคัญแต่ยังมี Warning ต้องเพิ่มหลักฐานหรือทวนสอบก่อนปิด"],
  CLOSE_CANDIDATE:["QMR Action: CLOSE CANDIDATE","ผ่าน Rule Screen ทุก Gate แต่ QMR ยังต้องยืนยันหลักฐานต้นฉบับก่อนอนุมัติจริง"]
 };
 const a=actions[x.qmr_decision]||["QMR Action","Review"];
 $("ncQmrAction").innerHTML='<b>'+esc(a[0])+'</b><p>'+esc(a[1])+'</p>';
}

function buildExecutive(meta){
 const a=ytd(2568),b=ytd(2569),totA=a.length,totB=b.length;
 const formalA=countSev(a,["Major","Minor"]),formalB=countSev(b,["Major","Minor"]);
 const compA=count(a,"category","Complaint"),compB=count(b,"category","Complaint");
 const overdue=S.cases.filter(c=>c.year_be===2569&&c.status==="Overdue").length;
 $("heroCases").textContent=fmt(meta.source_cases);$("heroDocs").textContent=fmt(meta.documents_indexed);
 $("snapshotText").textContent="Snapshot "+meta.snapshot+" · public-safe";
 $("kpiTotal").textContent=fmt(totB);$("kpiTotalSub").textContent="2568 "+totA+" → 2569 "+totB+" · "+pct(totA,totB).toFixed(1)+"%";
 $("kpiFormal").textContent=fmt(formalB);$("kpiFormalSub").textContent="2568 "+formalA+" → 2569 "+formalB+" · "+pct(formalA,formalB).toFixed(1)+"%";
 $("kpiComplaint").textContent=fmt(compB);$("kpiComplaintSub").textContent="2568 "+compA+" → 2569 "+compB+" · "+(compB-compA>=0?"+":"")+(compB-compA);
 $("kpiOverdue").textContent=fmt(overdue);
 const cats=["Internal Audit","Process","Complaint","Legal","Other"];
 mkChart("categoryChart",{type:"bar",data:{labels:cats,datasets:[{label:"2568",data:cats.map(x=>count(a,"category",x)),backgroundColor:COLOR_68,borderColor:COLOR_68,borderWidth:1,borderRadius:6},{label:"2569",data:cats.map(x=>count(b,"category",x)),backgroundColor:COLOR_69,borderColor:COLOR_69,borderWidth:1,borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"top"}},scales:{x:{grid:{display:false}},y:{beginAtZero:true}}}});
 const sevs=["Major","Minor","OBS","OFI"];
 mkChart("severityChart",{type:"bar",data:{labels:sevs,datasets:[{label:"2568",data:sevs.map(x=>count(a,"severity",x)),backgroundColor:COLOR_68,borderColor:COLOR_68,borderWidth:1,borderRadius:6},{label:"2569",data:sevs.map(x=>count(b,"severity",x)),backgroundColor:COLOR_69,borderColor:COLOR_69,borderWidth:1,borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"top"}},scales:{x:{grid:{display:false}},y:{beginAtZero:true}}}});
 const obsA=count(a,"severity","OBS"),obsB=count(b,"severity","OBS");
 const engA=a.filter(c=>c.functional_groups.includes("Engineering / Design / Innovation / Planning")&&c.severity==="Major").length;
 const engB=b.filter(c=>c.functional_groups.includes("Engineering / Design / Innovation / Planning")&&c.severity==="Major").length;
 const sig=[["good","Total CAR ลด",totA+" → "+totB+" หรือ "+pct(totA,totB).toFixed(1)+"% YoY"],["warn","Complaint ยังไม่ลด",compA+" → "+compB+" เคส ต้องแยกดูผลกระทบลูกค้าจาก Audit finding"],["warn","OBS เพิ่ม",obsA+" → "+obsB+" ("+pct(obsA,obsB).toFixed(1)+"%) ควรติดตาม classification mix"],["risk","Engineering Major",engA+" → "+engB+" เคส เป็นสัญญาณที่ควร drill-down ต่อ"]];
 $("signals").innerHTML=sig.map(x=>'<div class="signal '+x[0]+'"><b>'+esc(x[1])+'</b><p>'+esc(x[2])+'</p></div>').join("");
}


function verdictLabel(v){
 const m={
  "WEAK_CLOSURE_RISK":"Weak Closure",
  "ROOT_CAUSE_GAP_RISK":"Root Cause Gap",
  "EFFECTIVENESS_GAP_RISK":"Effectiveness Gap",
  "SYSTEMIC_CLOSURE_CANDIDATE":"Systemic Candidate",
  "EVIDENCE_INCOMPLETE":"Vision Review",
  "REVIEW_REQUIRED":"Review Required"
 };
 return m[v]||v||"Not analyzed";
}
function verdictClass(v){
 if(v==="SYSTEMIC_CLOSURE_CANDIDATE")return "good";
 if(v==="EVIDENCE_INCOMPLETE")return "vision";
 if(v==="WEAK_CLOSURE_RISK"||v==="ROOT_CAUSE_GAP_RISK"||v==="EFFECTIVENESS_GAP_RISK")return "risk";
 return "review";
}
function buildIntegrity(data){
 const m=data.meta||{}, vs=m.verdicts||{};
 $("heroCoverage").textContent=fmt(m.documents||0)+" PDF";
 $("integritySnapshot").textContent="DB "+fmt(m.documents||0)+" PDF · "+fmt(m.attachments||0)+" attachments · Vision queue "+fmt(m.vision_queue||0);
 $("kpiIntegrityAvg").textContent=(m.avg_integrity_score??"—")+(m.avg_integrity_score!=null?" / 100":"");
 $("kpiWeakClosure").textContent=fmt(vs.WEAK_CLOSURE_RISK||0);
 $("kpiRootGap").textContent=fmt(vs.ROOT_CAUSE_GAP_RISK||0);
 $("kpiVisionQueue").textContent=fmt(m.vision_queue||0);
 const order=["WEAK_CLOSURE_RISK","ROOT_CAUSE_GAP_RISK","EFFECTIVENESS_GAP_RISK","REVIEW_REQUIRED","SYSTEMIC_CLOSURE_CANDIDATE","EVIDENCE_INCOMPLETE"];
 const colors=[COLOR_RED,COLOR_AMBER,"#f0a75d",COLOR_68,COLOR_GREEN,"#9c88ff"];
 mkChart("verdictChart",{type:"bar",data:{labels:order.map(verdictLabel),datasets:[{label:"CAR",data:order.map(x=>vs[x]||0),backgroundColor:colors,borderColor:colors,borderWidth:1,borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{beginAtZero:true}}}});
 const wc={};
 data.cases.forEach(x=>(x.weak_action_hits||[]).forEach(t=>wc[t]=(wc[t]||0)+1));
 $("weakTerms").innerHTML=Object.entries(wc).sort((a,b)=>b[1]-a[1]).map((x,i)=>'<div class="rank"><span>'+(i+1)+'. '+esc(x[0])+'</span><b>'+fmt(x[1])+' CAR</b></div>').join("")||'<div class="detail-text">ไม่พบคำ Red Flag ใน public-safe rule screen</div>';
}

function buildAnalysis(){
 const a=ytd(2568),b=ytd(2569);
 const groups=[...new Set(S.cases.flatMap(c=>c.functional_groups))].filter(x=>x!=="Other / Unclassified");
 const ca=g=>a.filter(c=>c.functional_groups.includes(g)).length,cb=g=>b.filter(c=>c.functional_groups.includes(g)).length;
 const sorted=groups.map(g=>({g:g,a:ca(g),b:cb(g)})).sort((x,y)=>(y.a+y.b)-(x.a+x.b)).slice(0,10);
 mkChart("functionChart",{type:"bar",data:{labels:sorted.map(x=>x.g),datasets:[{label:"2568",data:sorted.map(x=>x.a),backgroundColor:COLOR_68,borderColor:COLOR_68,borderWidth:1,borderRadius:6},{label:"2569",data:sorted.map(x=>x.b),backgroundColor:COLOR_69,borderColor:COLOR_69,borderWidth:1,borderRadius:6}]},options:{indexAxis:"y",responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"top"}},scales:{x:{beginAtZero:true},y:{grid:{display:false}}}}});
 const y69=S.cases.filter(c=>c.year_be===2569),unitCounts={};y69.forEach(c=>{const u=c.receiving_best||"Unspecified";unitCounts[u]=(unitCounts[u]||0)+1;});
 $("topUnits").innerHTML=Object.entries(unitCounts).sort((a,b)=>b[1]-a[1]).slice(0,12).map((x,i)=>'<div class="rank"><span>'+(i+1)+'. '+esc(x[0])+'</span><b>'+x[1]+'</b></div>').join("");
 const sts=["Closed","Open / Not Due","Overdue"];
 mkChart("statusChart",{type:"doughnut",data:{labels:sts,datasets:[{data:sts.map(x=>y69.filter(c=>c.status===x).length),backgroundColor:[COLOR_GREEN,COLOR_AMBER,COLOR_RED],borderColor:"#0d2032",borderWidth:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"bottom"}}}});
}

function fillSelect(id,vals){$(id).innerHTML+=[...new Set(vals.filter(Boolean))].sort().map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join("");}
function initExplorer(){
 fillSelect("categoryFilter",S.cases.map(x=>x.category));fillSelect("severityFilter",S.cases.map(x=>x.severity));fillSelect("statusFilter",S.cases.map(x=>x.status));
 ["searchInput","yearFilter","categoryFilter","severityFilter","statusFilter","auditFilter"].forEach(id=>$(id).addEventListener(id==="searchInput"?"input":"change",()=>{S.compassMode="";S.page=1;applyFilters();}));
 $("clearFilters").addEventListener("click",()=>{$("searchInput").value="";["yearFilter","categoryFilter","severityFilter","statusFilter","auditFilter"].forEach(id=>$(id).value="");S.compassMode="";S.page=1;applyFilters();});
 $("prevPage").addEventListener("click",()=>{if(S.page>1){S.page--;renderTable();}});
 $("nextPage").addEventListener("click",()=>{if(S.page<Math.ceil(S.filtered.length/S.pageSize)){S.page++;renderTable();}});
 applyFilters();
}
function applyFilters(){
 const q=$("searchInput").value.trim().toLowerCase(),yr=$("yearFilter").value,cat=$("categoryFilter").value,sev=$("severityFilter").value,st=$("statusFilter").value,audit=$("auditFilter").value;
 S.filtered=S.cases.filter(c=>{
  const i=c.integrity||{},hay=[c.case_id,c.car_code,c.car_number,c.recipient_scope,c.receiving_unit,c.receiving_best,c.category,c.severity,c.issue_detail,c.requirement,i.verdict,verdictLabel(i.verdict),i.integrity_score,(i.weak_action_hits||[]).join(" ")].join(" ").toLowerCase();
  let special=true;
  if(S.compassMode==="opening")special=Number(i.opening_quality)<16;
  else if(S.compassMode==="root")special=i.verdict==="ROOT_CAUSE_GAP_RISK"||Number(i.root_cause_quality)<15;
  else if(S.compassMode==="action")special=i.verdict==="WEAK_CLOSURE_RISK"||Number(i.corrective_action_quality)<15;
  else if(S.compassMode==="effectiveness")special=i.verdict==="EFFECTIVENESS_GAP_RISK"||Number(i.effectiveness_quality)<10;
  else if(S.compassMode==="evidence")special=i.analysis_state==="VISION_REVIEW_REQUIRED";
  return special&&(!q||hay.includes(q))&&(!yr||String(c.year_be)===yr)&&(!cat||c.category===cat)&&(!sev||c.severity===sev)&&(!st||c.status===st)&&(!audit||i.verdict===audit);
 });
 renderTable();
}
function renderTable(){
 const start=(S.page-1)*S.pageSize,rows=S.filtered.slice(start,start+S.pageSize),pages=Math.max(1,Math.ceil(S.filtered.length/S.pageSize));
 $("resultCount").textContent="พบ "+fmt(S.filtered.length)+" CAR"+(S.compassMode?" · QMR Focus: "+S.compassMode+" · กด CAR Explorer หรือ Clear เพื่อดูทั้งหมด":"");$("pageText").textContent="หน้า "+S.page+" / "+pages;$("prevPage").disabled=S.page<=1;$("nextPage").disabled=S.page>=pages;
 $("caseRows").innerHTML=rows.map(c=>{const i=c.integrity||{};return '<tr data-id="'+esc(c.case_id)+'"><td><b>'+esc(c.case_id)+'</b><br><small>'+esc(c.car_code||"")+'</small></td><td>'+esc(c.issue_date||"—")+'</td><td>'+esc(c.receiving_best||"—")+'</td><td>'+esc(c.category||"—")+'</td><td><span class="chip sev-'+esc(c.severity)+'">'+esc(c.severity||"—")+'</span></td><td><span class="chip status-'+esc(c.status)+'">'+esc(c.status)+'</span></td><td><span class="score '+(i.integrity_score>=80?"score-good":i.integrity_score>=60?"score-mid":"score-risk")+'">'+esc(i.integrity_score??"—")+'</span></td><td><span class="audit-chip '+verdictClass(i.verdict)+'">'+esc(verdictLabel(i.verdict))+'</span></td><td>›</td></tr>'}).join("");
 document.querySelectorAll("#caseRows tr").forEach(tr=>tr.addEventListener("click",()=>openCase(tr.dataset.id)));
}
function openCase(id){
 const c=S.cases.find(x=>x.case_id===id);if(!c)return;
 const i=c.integrity||{},ncf=S.ncFlow.get(id)||null;
 const flags=(c.data_quality_flags||[]).map(x=>'<span class="chip">'+esc(x)+'</span>').join(" ");
 const docs=(c.documents||[]).map(d=>'<div class="doc"><small>'+esc(d.role||"revision")+'<br>'+esc((d.modified||"").slice(0,10))+'</small><div>'+esc(d.title||"Document revision")+'</div></div>').join("");
 let h='<div class="detail-head"><span class="eyebrow">CASE TWIN</span><h2>'+esc(c.case_id)+'</h2><div class="detail-meta"><span class="chip sev-'+esc(c.severity)+'">'+esc(c.severity||"—")+'</span><span class="chip">'+esc(c.category||"—")+'</span><span class="chip status-'+esc(c.status)+'">'+esc(c.status)+'</span></div></div>';
 h+='<div class="detail-grid"><div class="detail-box"><span>CAR Number</span><b>'+esc(c.car_number||"—")+'</b></div><div class="detail-box"><span>ออกให้ / Recipient Scope</span><b>'+esc(c.recipient_scope||"—")+'</b></div><div class="detail-box"><span>Specific Unit</span><b>'+esc(c.receiving_unit||"—")+'</b></div><div class="detail-box"><span>Functional Group</span><b>'+esc((c.functional_groups||[]).join(", "))+'</b></div><div class="detail-box"><span>Problem Date</span><b>'+esc(c.problem_date||"—")+'</b></div><div class="detail-box"><span>Issue Date</span><b>'+esc(c.issue_date||"—")+'</b></div><div class="detail-box"><span>Due Date</span><b>'+esc(c.due_date||"—")+'</b></div><div class="detail-box"><span>Revisions Indexed</span><b>'+fmt((c.documents||[]).length)+'</b></div></div>';
 if(i.verdict){
  const weak=(i.weak_action_hits||[]).map(x=>'<span class="chip">'+esc(x)+'</span>').join(" ");
  h+='<div class="detail-section"><h4>CAR Integrity Audit · Rule Screen</h4><div class="integrity-grid"><div class="integrity-score"><span>Total</span><b>'+esc(i.integrity_score??"—")+'</b><small>/ 100</small></div><div class="mini-score"><span>Opening</span><b>'+esc(i.opening_quality??"—")+'/20</b></div><div class="mini-score"><span>Root Cause</span><b>'+esc(i.root_cause_quality??"—")+'/30</b></div><div class="mini-score"><span>System Action</span><b>'+esc(i.corrective_action_quality??"—")+'/30</b></div><div class="mini-score"><span>Effectiveness</span><b>'+esc(i.effectiveness_quality??"—")+'/20</b></div></div><div class="audit-verdict '+verdictClass(i.verdict)+'"><b>'+esc(verdictLabel(i.verdict))+'</b><span>'+esc(i.analysis_state==="VISION_REVIEW_REQUIRED"?"ยังมีภาพ/หลักฐานที่ต้องอ่านด้วย Vision ก่อน Final Verdict":"ผ่านการ Rule Screen จากข้อมูล PDF/Database")+'</span></div>'+(weak?'<div class="weak-box"><b>Closure Red Flag:</b> '+weak+'</div>':'')+'<div class="public-note">คะแนนนี้ใช้จัดลำดับ Audit Priority ไม่ใช่การอนุมัติปิด CAR อัตโนมัติ — QMR ต้องตรวจ Root Cause ↔ Corrective Action ↔ Effectiveness กับหลักฐานต้นฉบับ</div></div>';
 }
 h+='<div class="detail-section"><h4>Issue Detail · ข้อมูลจาก CAR</h4><div class="detail-text">'+esc(c.issue_detail||"ไม่มีข้อความในต้นฉบับ")+'</div></div><div class="detail-section"><h4>Requirement / Clause</h4><div class="detail-text">'+esc(c.requirement||"ไม่ระบุ")+'</div></div>';
 if(ncf){
  h+='<div class="detail-section"><h4>NC Flow · Process Failure Map</h4><div class="mini-nc-grid">'+ncf.stages.map(s=>'<div class="mini-nc '+esc(s.status)+'"><b>'+esc(s.title)+'</b><small>'+esc(ncStatusLabel(s.status))+'</small><p>'+esc(s.finding)+'</p></div>').join("")+'</div><div class="audit-verdict '+ncDecisionClass(ncf.qmr_decision)+'"><b>'+esc(ncDecisionLabel(ncf.qmr_decision))+'</b><span>'+esc(ncf.chain_summary)+'</span></div></div>';
 }
 if(flags)h+='<div class="detail-section"><h4>Data Quality Flags</h4><div>'+flags+'</div></div>';
 h+='<div class="detail-section"><h4>Document Twin · Revision Timeline</h4><div class="timeline">'+(docs||"<div class='detail-text'>ไม่มี revision metadata</div>")+'</div></div><div class="public-note">Public-safe view: ลิงก์ Google Drive, File ID, raw form fields และข้อมูลระบุตัวตนถูกซ่อน การตรวจหลักฐานต้นฉบับเต็มรูปแบบต้องใช้ Internal/Admin view</div>';
 $("caseDetail").innerHTML=h;$("modal").classList.add("open");$("modal").setAttribute("aria-hidden","false");
}
function initModal(){document.querySelectorAll("[data-close]").forEach(x=>x.addEventListener("click",()=>{$("modal").classList.remove("open");$("modal").setAttribute("aria-hidden","true");}));document.addEventListener("keydown",e=>{if(e.key==="Escape")$("modal").classList.remove("open");});}
async function boot(){try{const [res,ires,nres]=await Promise.all([fetch("./cases-public.json",{cache:"no-store"}),fetch("./car-integrity-public.json",{cache:"no-store"}),fetch("./car-nc-flow-public.json",{cache:"no-store"})]);if(!res.ok)throw new Error("Case data "+res.status);if(!ires.ok)throw new Error("Integrity data "+ires.status);if(!nres.ok)throw new Error("NC Flow data "+nres.status);const data=await res.json(),integ=await ires.json(),nc=await nres.json();S.integrityMeta=integ.meta;S.integrity=new Map(integ.cases.map(x=>[x.case_id,x]));S.cases=data.cases.map(c=>({...c,integrity:S.integrity.get(c.case_id)||null}));initTabs();buildCompass(integ);buildNCFlow(nc);buildExecutive(data.meta);buildIntegrity(integ);buildAnalysis();initExplorer();initModal();}catch(e){document.body.innerHTML='<div style="padding:40px;color:white;font-family:sans-serif"><h2>QMR Compass · CAR Digital Twin</h2><p>โหลดข้อมูลไม่สำเร็จ: '+esc(e.message)+'</p></div>';}}
boot();