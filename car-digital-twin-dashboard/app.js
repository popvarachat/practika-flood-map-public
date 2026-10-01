const S={cases:[],filtered:[],page:1,pageSize:25,charts:[]};
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

function initTabs(){document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");$(b.dataset.target).scrollIntoView({behavior:"smooth",block:"start"});}));}

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
 ["searchInput","yearFilter","categoryFilter","severityFilter","statusFilter"].forEach(id=>$(id).addEventListener(id==="searchInput"?"input":"change",()=>{S.page=1;applyFilters();}));
 $("clearFilters").addEventListener("click",()=>{$("searchInput").value="";["yearFilter","categoryFilter","severityFilter","statusFilter"].forEach(id=>$(id).value="");S.page=1;applyFilters();});
 $("prevPage").addEventListener("click",()=>{if(S.page>1){S.page--;renderTable();}});
 $("nextPage").addEventListener("click",()=>{if(S.page<Math.ceil(S.filtered.length/S.pageSize)){S.page++;renderTable();}});
 applyFilters();
}
function applyFilters(){
 const q=$("searchInput").value.trim().toLowerCase(),yr=$("yearFilter").value,cat=$("categoryFilter").value,sev=$("severityFilter").value,st=$("statusFilter").value;
 S.filtered=S.cases.filter(c=>{const hay=[c.case_id,c.car_code,c.car_number,c.recipient_scope,c.receiving_unit,c.receiving_best,c.category,c.severity,c.issue_detail,c.requirement].join(" ").toLowerCase();return(!q||hay.includes(q))&&(!yr||String(c.year_be)===yr)&&(!cat||c.category===cat)&&(!sev||c.severity===sev)&&(!st||c.status===st);});
 renderTable();
}
function renderTable(){
 const start=(S.page-1)*S.pageSize,rows=S.filtered.slice(start,start+S.pageSize),pages=Math.max(1,Math.ceil(S.filtered.length/S.pageSize));
 $("resultCount").textContent="พบ "+fmt(S.filtered.length)+" CAR";$("pageText").textContent="หน้า "+S.page+" / "+pages;$("prevPage").disabled=S.page<=1;$("nextPage").disabled=S.page>=pages;
 $("caseRows").innerHTML=rows.map(c=>'<tr data-id="'+esc(c.case_id)+'"><td><b>'+esc(c.case_id)+'</b><br><small>'+esc(c.car_code||"")+'</small></td><td>'+esc(c.issue_date||"—")+'</td><td>'+esc(c.receiving_best||"—")+'</td><td>'+esc(c.category||"—")+'</td><td><span class="chip sev-'+esc(c.severity)+'">'+esc(c.severity||"—")+'</span></td><td><span class="chip status-'+esc(c.status)+'">'+esc(c.status)+'</span></td><td>›</td></tr>').join("");
 document.querySelectorAll("#caseRows tr").forEach(tr=>tr.addEventListener("click",()=>openCase(tr.dataset.id)));
}
function openCase(id){
 const c=S.cases.find(x=>x.case_id===id);if(!c)return;
 const flags=(c.data_quality_flags||[]).map(x=>'<span class="chip">'+esc(x)+'</span>').join(" ");
 const docs=(c.documents||[]).map(d=>'<div class="doc"><small>'+esc(d.role||"revision")+'<br>'+esc((d.modified||"").slice(0,10))+'</small><div>'+esc(d.title||"Document revision")+'</div></div>').join("");
 let h='<div class="detail-head"><span class="eyebrow">CASE TWIN</span><h2>'+esc(c.case_id)+'</h2><div class="detail-meta"><span class="chip sev-'+esc(c.severity)+'">'+esc(c.severity||"—")+'</span><span class="chip">'+esc(c.category||"—")+'</span><span class="chip status-'+esc(c.status)+'">'+esc(c.status)+'</span></div></div>';
 h+='<div class="detail-grid"><div class="detail-box"><span>CAR Number</span><b>'+esc(c.car_number||"—")+'</b></div><div class="detail-box"><span>ออกให้ / Recipient Scope</span><b>'+esc(c.recipient_scope||"—")+'</b></div><div class="detail-box"><span>Specific Unit</span><b>'+esc(c.receiving_unit||"—")+'</b></div><div class="detail-box"><span>Functional Group</span><b>'+esc((c.functional_groups||[]).join(", "))+'</b></div><div class="detail-box"><span>Problem Date</span><b>'+esc(c.problem_date||"—")+'</b></div><div class="detail-box"><span>Issue Date</span><b>'+esc(c.issue_date||"—")+'</b></div><div class="detail-box"><span>Due Date</span><b>'+esc(c.due_date||"—")+'</b></div><div class="detail-box"><span>Revisions Indexed</span><b>'+fmt((c.documents||[]).length)+'</b></div></div>';
 h+='<div class="detail-section"><h4>Issue Detail · ข้อมูลจาก CAR</h4><div class="detail-text">'+esc(c.issue_detail||"ไม่มีข้อความในต้นฉบับ")+'</div></div><div class="detail-section"><h4>Requirement / Clause</h4><div class="detail-text">'+esc(c.requirement||"ไม่ระบุ")+'</div></div>';
 if(flags)h+='<div class="detail-section"><h4>Data Quality Flags</h4><div>'+flags+'</div></div>';
 h+='<div class="detail-section"><h4>Document Twin · Revision Timeline</h4><div class="timeline">'+(docs||"<div class='detail-text'>ไม่มี revision metadata</div>")+'</div></div><div class="public-note">Public-safe view: ลิงก์ Google Drive, File ID, raw form fields และข้อมูลระบุตัวตนถูกซ่อน การตรวจหลักฐานต้นฉบับเต็มรูปแบบต้องใช้ Internal/Admin view</div>';
 $("caseDetail").innerHTML=h;$("modal").classList.add("open");$("modal").setAttribute("aria-hidden","false");
}
function initModal(){document.querySelectorAll("[data-close]").forEach(x=>x.addEventListener("click",()=>{$("modal").classList.remove("open");$("modal").setAttribute("aria-hidden","true");}));document.addEventListener("keydown",e=>{if(e.key==="Escape")$("modal").classList.remove("open");});}
async function boot(){try{const res=await fetch("./cases-public.json",{cache:"no-store"});if(!res.ok)throw new Error("Data "+res.status);const data=await res.json();S.cases=data.cases;initTabs();buildExecutive(data.meta);buildAnalysis();initExplorer();initModal();}catch(e){document.body.innerHTML='<div style="padding:40px;color:white;font-family:sans-serif"><h2>CAR Digital Twin</h2><p>โหลดข้อมูลไม่สำเร็จ: '+esc(e.message)+'</p></div>';}}
boot();