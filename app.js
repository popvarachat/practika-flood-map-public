let runtimeData = {};
let routeMode = false;
let routePoints = [];
let routeMarkers = [];
const ROUTER_ENDPOINT = "https://router.project-osrm.org";

const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors"
      }
    },
    layers: [{ id: "osm", type: "raster", source: "osm", paint:{
      "raster-opacity":0.86,
      "raster-saturation":-0.22,
      "raster-brightness-max":0.96,
      "raster-contrast":-0.06
    }}]
  },
  center: [100.65, 13.92],
  zoom: 10
});
map.addControl(new maplibregl.NavigationControl(), "bottom-right");const files = {
  road: "./data/l1_road_status_main.geojson",
  soi: "./data/l2_hyperlocal_soi.geojson",
  sensor: "./data/l3_sensors_qc_clean.geojson",
  flood: "./data/flood_area.geojson",
  closure: "./data/road_closures.geojson",
  watercontrol: "./data/water_control_points.geojson",
  riverflow: "./data/river_flow_stations.geojson",
  canal: "./data/canal_impact_areas.geojson",
  hokwa: "./data/khlong_hokwa_overflow_area.geojson",
  canalmaster: "./data/bangkok_canals_master.geojson",
  liveflood: "./data/live_road_flood_points.geojson"
};

function updateLoading(done,total,detail="") {
  const pct=Math.max(0,Math.min(100,Math.round((done/Math.max(total,1))*100)));
  const t=document.getElementById("loadingText");
  const b=document.getElementById("loadingBar");
  const d=document.getElementById("loadingDetail");
  if(t) t.textContent="Loading map data… "+pct+"%";
  if(b) b.style.width=pct+"%";
  if(d && detail) d.textContent=detail;
}
function finishLoading(detail="Ready") {
  updateLoading(100,100,detail);
  setTimeout(()=>document.getElementById("loadingOverlay")?.classList.add("done"),250);
}
async function fetchJsonTimeout(url,ms=10000) {
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),ms);
  try {
    const res=await fetch(url,{signal:ctrl.signal,cache:"no-store"});
    if(!res.ok) throw new Error(url+" HTTP "+res.status);
    return await res.json();
  } finally { clearTimeout(timer); }
}
function extendBounds(bounds, geometry) {
  if (!geometry) return;
  const walk = c => {
    if (typeof c[0] === "number") bounds.extend(c);
    else c.forEach(walk);
  };
  walk(geometry.coordinates);
}

function fmtNumber(v,digits=2) {
  if(v===null || v===undefined || v==="") return "n/a";
  const n=Number(v);
  if(!Number.isFinite(n)) return "n/a";
  return n.toLocaleString("en-US",{maximumFractionDigits:digits});
}
function signed(v,digits=2) {
  if(v===null || v===undefined || v==="") return "n/a";
  const n=Number(v);
  if(!Number.isFinite(n)) return "n/a";
  return (n>0?"+":"")+fmtNumber(n,digits);
}
function trendArrow(t) {
  return t==="up" ? "↑" : t==="down" ? "↓" : t==="steady" ? "→" : "?";
}
function popupHtml(feature) {
  const p=feature.properties || {};
  const name=p.name || p.canal_name || "Unnamed";
  if(p.closure_confirmed===false && "depth_cm" in p) {
    const cls=p.status==="critical"?"danger":"warn";
    return '<div class="gis-popup"><div class="pop-head">'+name+'</div><div class="pop-body">'+
      '<div class="'+cls+'">ระดับน้ำ '+fmtNumber(p.depth_cm,1)+' cm</div>'+
      '<div>ถนน: '+(p.road||"n/a")+'</div>'+
      '<div>เขต: '+(p.district||"n/a")+'</div>'+
      '<div>Peak: '+fmtNumber(p.peak_cm,1)+' cm</div>'+
      '<div>สถานะ: '+(p.status||"n/a")+'</div>'+
      '<div class="muted">เวลา: '+(p.observed_at||"n/a")+'</div>'+
      '<div class="muted">หมายเหตุ: มีน้ำท่วมถนน ≠ ประกาศปิดถนน</div></div></div>';
  }
  if(p.canal_name) {
    return '<div class="gis-popup"><div class="pop-head">'+p.canal_name+'</div><div class="pop-body">'+
      '<div><b>สถานะ:</b> '+(p.risk_status||"monitor")+'</div>'+
      '<div>จาก: '+(p.from_des||"n/a")+' → '+(p.to_des||"n/a")+'</div>'+
      '<div>หลักฐาน: '+(p.evidence||"n/a")+'</div>'+
      '<div class="muted">วันที่สถานะ: '+(p.status_date||"n/a")+'</div></div></div>';
  }
  if(p.id_flood) {
    const level = p.water_level_m==null ? "N/A" : fmtNumber(p.water_level_m,2)+" m MSL "+trendArrow(p.water_level_trend)+" "+signed(p.water_level_delta_m,2)+" m";
    const q = p.discharge_cms==null ? "N/A" : fmtNumber(p.discharge_cms,2)+" m³/s";
    return "<b>"+name+"</b>"+
      "<br>ระดับน้ำ: "+level+
      "<br>ระดับวิกฤติ: "+(p.critical_level_m==null?"N/A":fmtNumber(p.critical_level_m,2)+" m MSL")+
      "<br>Flow / discharge: "+q+
      "<br>สถานะ: "+(p.status||"inventory")+
      "<br>เวลา: "+(p.observed_at||"ไม่มีค่าปัจจุบัน")+
      "<br>ตำแหน่ง: "+(p.location||"")+
      (p.discharge_note ? "<br><i>"+p.discharge_note+"</i>" : "");
  }
  if(p.area_type==="canal_impact") {
    return "<b>"+name+"</b>"+
      "<br>สถานะ: "+(p.status||"n/a")+
      "<br>พื้นที่ corridor: "+fmtNumber(p.area_km2,3)+" km²"+
      "<br>Buffer: "+fmtNumber(p.buffer_m,0)+" m"+
      (p.evidence ? "<br>หลักฐาน: "+p.evidence : "")+
      (p.evidence_date ? "<br>วันที่หลักฐาน: "+p.evidence_date : "")+
      "<br><i>"+(p.disclaimer||"")+"</i>";
  }
  if(p.layer==="L2 FLOOD AREA CURRENT" || (feature.geometry && ["Polygon","MultiPolygon"].includes(feature.geometry.type))) {
    let area="n/a";
    try { area=fmtNumber(turf.area(feature)/1000000,3)+" km²"; } catch(e) {}
    return "<b>"+name+"</b><br>พื้นที่น้ำท่วม: "+area+
      (p.severity ? "<br>Severity: "+p.severity : "")+
      (p.observed_at ? "<br>เวลา: "+p.observed_at : "");
  }
  if("discharge_cms" in p && "water_level_m" in p) {
    return "<b>"+name+"</b>"+
      "<br>Q: "+fmtNumber(p.discharge_cms,2)+" m³/s "+trendArrow(p.discharge_trend||p.trend)+" "+signed(p.discharge_delta_cms,2)+" m³/s"+
      "<br>ระดับน้ำ: "+fmtNumber(p.water_level_m,3)+" m "+trendArrow(p.water_level_trend)+" "+signed(p.water_level_delta_m,3)+" m"+
      (p.observed_at ? "<br>เวลา: "+p.observed_at : "");
  }
  if("discharge_cms" in p) {
    return "<b>"+name+"</b>"+
      "<br>ปล่อยน้ำ: "+fmtNumber(p.discharge_cms,2)+" m³/s "+trendArrow(p.trend)+" "+signed(p.discharge_delta_cms,2)+" m³/s"+
      (p.observed_at ? "<br>เวลา: "+p.observed_at : "");
  }
  const layer=p.layer || "";
  const desc=p.description || "";
  return "<b>"+name+"</b><br>"+layer+(desc ? "<br>"+desc : "");
}map.on("load", async () => {
  const data = {};
  const bounds = new maplibregl.LngLatBounds();

  const entries=Object.entries(files);
  let loaded=0;
  const errors=[];
  updateLoading(0,entries.length,"Loading local GIS sources");
  for (const [key,url] of entries) {
    try {
      data[key]=await fetchJsonTimeout(url,10000);
      (data[key].features||[]).forEach(f=>extendBounds(bounds,f.geometry));
    } catch(err) {
      errors.push(key+": "+err.message);
      data[key]={type:"FeatureCollection",features:[]};
    }
    map.addSource(key,{type:"geojson",data:data[key]});
    loaded++;
    updateLoading(loaded,entries.length,"Loaded "+key+" ("+loaded+"/"+entries.length+")");
  }
  runtimeData=data;
  map.addSource("route",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
  map.addLayer({id:"route-line",type:"line",source:"route",paint:{"line-color":"#7c3aed","line-width":6,"line-opacity":0.9}});

  map.addLayer({
    id:"canal-master-line", type:"line", source:"canalmaster",
    layout:{"visibility":"none"},
    paint:{
      "line-color":["match",["get","risk_status"],
        "critical_gate","#991B1B",
        "high_decreasing","#DC2626",
        "watch_improving","#F59E0B",
        "improving_recent","#EAB308",
        "#3B82F6"],
      "line-width":["interpolate",["linear"],["zoom"],8,1,13,3],
      "line-opacity":["match",["get","risk_status"],"monitor",0.38,0.82]
    }
  });
  map.addLayer({
    id:"live-flood-circle", type:"circle", source:"liveflood",
    paint:{
      "circle-radius":["interpolate",["linear"],["coalesce",["get","depth_cm"],0],0,5,20,11],
      "circle-color":["match",["get","status"],"critical","#DC2626","warning","#F59E0B","#EAB308"],
      "circle-stroke-color":"#ffffff",
      "circle-stroke-width":1.5
    }
  });

  map.addLayer({
    id:"live-flood-label", type:"symbol", source:"liveflood",
    minzoom:11,
    layout:{
      "text-field":["concat",["to-string",["coalesce",["get","depth_cm"],0]]," cm"],
      "text-size":11,
      "text-offset":[0,1.35],
      "text-anchor":"top",
      "text-allow-overlap":false
    },
    paint:{"text-color":"#991B1B","text-halo-color":"#ffffff","text-halo-width":2}
  });

  map.addLayer({
    id:"road-line", type:"line", source:"road",
    paint:{
      "line-color":["match",["get","risk_status"],
        "safe","#00A651",
        "caution","#FFD400",
        "flooded","#DC2626",
        "#666666"],
      "line-width":["interpolate",["linear"],["zoom"],9,2,14,5],
      "line-opacity":0.9
    }
  });  map.addLayer({
    id:"soi-line", type:"line", source:"soi",
    layout:{"visibility":"none"},
    paint:{"line-color":"#666666","line-width":4,"line-opacity":0.8}
  });

  map.addLayer({
    id:"flood-fill", type:"fill", source:"flood",
    paint:{
      "fill-color":["match",["get","severity"],
        "pending","#DC2626",
        "estimated","#F59E0B",
        "#2196F3"],
      "fill-opacity":["match",["get","severity"],"pending",0.34,"estimated",0.24,0.28]
    }
  });

  map.addLayer({
    id:"flood-outline", type:"line", source:"flood",
    paint:{
      "line-color":["match",["get","severity"],"pending","#991B1B","estimated","#B45309","#0D47A1"],
      "line-width":2
    }
  });

  map.addLayer({
    id:"closure-line", type:"line", source:"closure",
    paint:{"line-color":"#DC2626","line-width":7,"line-opacity":0.95}
  });


  map.addLayer({
    id:"watercontrol-circle", type:"circle", source:"watercontrol",
    paint:{
      "circle-radius":8,
      "circle-color":["match",["get","status"],"critical","#DC2626","warning","#F59E0B","#0EA5E9"],
      "circle-stroke-color":"#ffffff",
      "circle-stroke-width":2
    }
  });
  map.addLayer({
    id:"watercontrol-label", type:"symbol", source:"watercontrol",
    layout:{
      "text-field":["concat",["coalesce",["get","name"],""]," ",
        ["case",["==",["get","water_level_trend"],"up"],"↑",["==",["get","water_level_trend"],"down"],"↓",["==",["get","water_level_trend"],"steady"],"→","?"],
        " ",["to-string",["coalesce",["get","water_level_m"],""]]," m ",
        ["case",["!=",["get","water_level_delta_m"],null],["concat","Δ ",["to-string",["get","water_level_delta_m"]]," m"],""]],
      "text-size":12,
      "text-offset":[0,1.4],
      "text-anchor":"top"
    },
    filter:["!=",["get","status"],"inventory"],
    paint:{"text-color":"#0C4A6E","text-halo-color":"#ffffff","text-halo-width":1.5}
  });

  map.addLayer({
    id:"riverflow-circle", type:"circle", source:"riverflow",
    paint:{
      "circle-radius":7,
      "circle-color":"#2563EB",
      "circle-stroke-color":"#ffffff",
      "circle-stroke-width":2
    }
  });
  map.addLayer({
    id:"riverflow-label", type:"symbol", source:"riverflow",
    layout:{
      "text-field":["concat",["coalesce",["get","name"],""]," ",
        ["case",["==",["get","trend"],"up"],"↑",["==",["get","trend"],"down"],"↓",["==",["get","trend"],"steady"],"→","?"],
        " Q ",["to-string",["coalesce",["get","discharge_cms"],""]]," m³/s ",
        ["case",["has","discharge_delta_cms"],["concat","Δ ",["to-string",["get","discharge_delta_cms"]]," m³/s"],""]],
      "text-size":12,
      "text-offset":[0,1.4],
      "text-anchor":"top"
    },
    paint:{"text-color":"#1E3A8A","text-halo-color":"#ffffff","text-halo-width":1.5}
  });


  map.addLayer({
    id:"canal-impact-fill", type:"fill", source:"canal",
    paint:{
      "fill-color":["match",["get","status"],
        "critical_gate","#7F1D1D",
        "high_decreasing","#DC2626",
        "watch_improving","#F59E0B",
        "improving_recent","#EAB308",
        "overflow_impact","#DC2626",
        "tributary_impact","#F97316",
        "tributary_watch","#EAB308",
        "watch","#2563EB",
        "#64748B"],
      "fill-opacity":["match",["get","status"],
        "critical_gate",0.26,
        "high_decreasing",0.22,
        "watch_improving",0.16,
        "improving_recent",0.12,
        "overflow_impact",0.22,
        "tributary_impact",0.18,
        "tributary_watch",0.14,
        "watch",0.12,0.10]
    }
  });
  map.addLayer({
    id:"canal-impact-outline", type:"line", source:"canal",
    paint:{
      "line-color":["match",["get","status"],
        "critical_gate","#7F1D1D",
        "high_decreasing","#991B1B",
        "watch_improving","#B45309",
        "improving_recent","#A16207",
        "overflow_impact","#991B1B",
        "tributary_impact","#C2410C",
        "tributary_watch","#A16207",
        "watch","#1D4ED8",
        "#475569"],
      "line-width":2,
      "line-dasharray":[3,2]
    }
  });


  map.addLayer({
    id:"hokwa-fill", type:"fill", source:"hokwa",
    paint:{
      "fill-color":"#DC2626",
      "fill-opacity":0.24
    }
  });
  map.addLayer({
    id:"hokwa-outline", type:"line", source:"hokwa",
    paint:{
      "line-color":"#7F1D1D",
      "line-width":3,
      "line-dasharray":[2,1]
    }
  });

  map.addLayer({
    id:"sensor-circle", type:"circle", source:"sensor",
    layout:{"visibility":"none"},
    paint:{
      "circle-radius":6,
      "circle-color":"#0288D1",
      "circle-stroke-color":"#ffffff",
      "circle-stroke-width":1.5
    }
  });  ["canal-master-line","live-flood-circle","road-line","soi-line","sensor-circle","flood-fill","closure-line","watercontrol-circle","riverflow-circle","canal-impact-fill","hokwa-fill"].forEach(id => {
    map.on("click", id, e => {
      const f = e.features && e.features[0];
      if (!f) return;
      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(popupHtml(f))
        .addTo(map);
    });
    map.on("mouseenter", id, () => map.getCanvas().style.cursor="pointer");
    map.on("mouseleave", id, () => map.getCanvas().style.cursor="");
  });

  if (!bounds.isEmpty()) map.fitBounds(bounds,{padding:50,maxZoom:14});

  let meta={};
  try { meta=await fetchJsonTimeout("./data/live_status.json",5000); } catch(e) {}
  const updated=meta.updated_at||"unknown";
  document.getElementById("lastUpdated").textContent="อัปเดต "+updated;
  document.getElementById("kpiFloodRoads").textContent=data.liveflood.features.length;
  document.getElementById("kpiGates").textContent=data.watercontrol.features.length;
  document.getElementById("kpiCorridors").textContent=data.canal.features.length+data.hokwa.features.length;
  document.getElementById("kpiClosures").textContent=data.closure.features.length;
  document.getElementById("stats").innerHTML =
    "BMA canal segments: "+data.canalmaster.features.length+"<br>"+
    "Live flooded roads: "+data.liveflood.features.length+"<br>"+
    "Road: "+data.road.features.length+"<br>"+
    "Soi: "+data.soi.features.length+"<br>"+
    "Sensors: "+data.sensor.features.length+"<br>"+
    "Flood polygons: "+data.flood.features.length+"<br>"+
    "Confirmed road closures: "+data.closure.features.length+"<br>"+
    "Floodgates: "+data.watercontrol.features.length+"<br>"+
    "Hydrology readings: "+data.riverflow.features.length+"<br>"+
    "Canal impact areas: "+data.canal.features.length+"<br>"+
    "Hok Wa overflow areas: "+data.hokwa.features.length+
    (errors.length ? "<br><b>Load warnings:</b> "+errors.join("; ") : "");
  finishLoading(errors.length ? "Ready with "+errors.length+" warning(s)" : "Ready");
});const groups = {
  canalmaster:["canal-master-line"],
  liveflood:["live-flood-circle","live-flood-label"],
  road:["road-line"],
  soi:["soi-line"],
  sensor:["sensor-circle"],
  flood:["flood-fill","flood-outline"],
  closure:["closure-line"],
  watercontrol:["watercontrol-circle","watercontrol-label"],
  riverflow:["riverflow-circle","riverflow-label"],
  canal:["canal-impact-fill","canal-impact-outline"],
  hokwa:["hokwa-fill","hokwa-outline"]
};

document.querySelectorAll("input[data-layer]").forEach(cb => {
  cb.addEventListener("change", () => {
    (groups[cb.dataset.layer] || []).forEach(id => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id,"visibility",cb.checked ? "visible" : "none");
      }
    });
  });
});

function setRouteStatus(text, level="neutral") {
  const el=document.getElementById("routeStatus");
  if(!el) return;
  el.textContent=text;
  el.className="route-status"+(level==="neutral" ? "" : " "+level);
}

function clearRoute() {
  routePoints=[];
  routeMarkers.forEach(m=>m.remove());
  routeMarkers=[];
  if(map.getSource("route")) map.getSource("route").setData({type:"FeatureCollection",features:[]});
  setRouteStatus("คลิก Route mode แล้วเลือกต้นทางและปลายทาง");
}

function assessRouteRisk(routeFeature) {
  const roads=(runtimeData.road && runtimeData.road.features) || [];
  let caution=0, flooded=0;
  for(const f of roads) {
    const status=f.properties && f.properties.risk_status;
    if(status!=="caution" && status!=="flooded") continue;
    try {
      if(turf.lineIntersect(routeFeature,f).features.length>0) {
        if(status==="flooded") flooded++;
        else caution++;
      }
    } catch(e) {}
  }
  return {caution,flooded};
}

async function buildRoute() {
  if(routePoints.length!==2) return;
  const [a,b]=routePoints;
  setRouteStatus("กำลังคำนวณเส้นทาง…");
  const url=ROUTER_ENDPOINT+"/route/v1/driving/"+a.join(",")+";"+b.join(",")+"?overview=full&geometries=geojson&steps=false";
  const res=await fetch(url);
  if(!res.ok) throw new Error("OSRM HTTP "+res.status);
  const json=await res.json();
  if(json.code!=="Ok" || !json.routes || !json.routes[0]) throw new Error("ไม่พบเส้นทาง");
  const r=json.routes[0];
  const feature={type:"Feature",properties:{},geometry:r.geometry};
  map.getSource("route").setData({type:"FeatureCollection",features:[feature]});
  const risk=assessRouteRisk(feature);
  const km=(r.distance/1000).toFixed(1);
  const min=Math.round(r.duration/60);
  const riskText=risk.flooded>0
    ? "Flooded/Closure "+risk.flooded+" ช่วง · Caution "+risk.caution+" ช่วง"
    : "Caution "+risk.caution+" ช่วง · Flooded/Closure 0";
  const level=risk.flooded>0 ? "danger" : (risk.caution>0 ? "warn" : "good");
  setRouteStatus(km+" km · "+min+" นาที · "+riskText+" · Risk assessment only",level);
}

document.getElementById("refreshDataBtn").addEventListener("click",()=>{
  document.getElementById("refreshState").textContent="Public snapshot · reload page";
  location.reload();
});

document.getElementById("routeModeBtn").addEventListener("click",e=>{
  routeMode=!routeMode;
  e.currentTarget.classList.toggle("active",routeMode);
  setRouteStatus(routeMode ? "Route mode เปิด: คลิกต้นทาง แล้วคลิกปลายทาง" : "Route mode ปิด");
});

document.getElementById("routeClearBtn").addEventListener("click",clearRoute);

map.on("click",async e=>{
  if(!routeMode) return;
  if(routePoints.length>=2) clearRoute();
  const p=[e.lngLat.lng,e.lngLat.lat];
  routePoints.push(p);
  routeMarkers.push(new maplibregl.Marker({color:routePoints.length===1 ? "#16a34a" : "#dc2626"}).setLngLat(p).addTo(map));
  if(routePoints.length===1) {
    setRouteStatus("ได้ต้นทางแล้ว คลิกปลายทาง");
    return;
  }
  try { await buildRoute(); }
  catch(err) { setRouteStatus("Route error: "+err.message); }
});

const controlPanel=document.getElementById("controlPanel");
const panelToggle=document.getElementById("panelToggle");
const panelClose=document.getElementById("panelClose");
function setPanelCollapsed(v){
  if(!controlPanel) return;
  controlPanel.classList.toggle("collapsed",v);
  if(panelToggle) panelToggle.style.display=v?"block":"";
}
panelClose?.addEventListener("click",()=>setPanelCollapsed(true));
panelToggle?.addEventListener("click",()=>setPanelCollapsed(false));
