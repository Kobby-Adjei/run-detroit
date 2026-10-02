/* ==========================================================
   Run Detroit — interactive concept
   Real coordinates (OpenStreetMap), real aerial imagery (Esri),
   real basemap tiles (CARTO/OSM via Leaflet).
   ========================================================== */
(() => {
"use strict";

/* ---------- Elements ---------- */
const screen   = document.getElementById("screen");
const scroller = document.getElementById("scroller");
const view     = document.getElementById("view");
const navbar   = document.getElementById("navbar");
const navTitle = document.getElementById("navTitle");
const backBtn  = document.getElementById("backBtn");
const chip     = document.getElementById("pointsChip");
const pointsVal= document.getElementById("pointsVal");
const tabbar   = document.getElementById("tabbar");
const overlay  = document.getElementById("overlay");
const toastHost= document.getElementById("toastHost");
const fx       = document.getElementById("fx");
const sheetHost= document.getElementById("sheetHost");

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const darkMQ  = window.matchMedia("(prefers-color-scheme: dark)");

/* ---------- State ---------- */
const DEFAULTS = {
  route:"fanzone", points:1250, streak:2, weeksActive:2,
  checkedIn:false, checkedInCourt:null,
  shotsFired:false, submitted:false,
  stops:[true,false,false],
  courtsVisited:[],
  seenReward:false
};
let state = load();

function load(){
  try{
    const raw = localStorage.getItem("run-detroit-v3");
    if(raw) return Object.assign({}, DEFAULTS, JSON.parse(raw), {route:"fanzone"});
  }catch(e){}
  return Object.assign({}, DEFAULTS);
}
let account = null;            // Supabase user, or null when signed out
let syncTimer = 0;

function save(){
  try{ localStorage.setItem("run-detroit-v3", JSON.stringify(state)); }catch(e){}
  if(account && window.RD?.enabled){
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => RD.saveState(state).catch(()=>{}), 450);
  }
}

const isGuest = () => !!account && (account.is_anonymous || !account.email);
const accountLabel = () => !account ? "Signed out" : (account.email || "Guest account");
const initials = () => {
  if(account?.email) return account.email.slice(0,2).toUpperCase();
  return "RD";
};

/* ---------- Real data ----------
   Court coordinates come from OpenStreetMap basketball pitches inside
   Detroit; neighborhood names and ZIPs are from Nominatim reverse
   geocoding. Aerial stills are Esri World Imagery at those coordinates.
----------------------------------------------------------------- */
const USER = { lat: 42.35830, lon: -83.06960, label: "Midtown Detroit" };

const COURTS = [
  { id:"davison", name:"Davison Courts", hood:"Davison", zip:"48212", side:"North End",
    lat:42.41498, lon:-83.05244, photo:"assets/photos/court-davison.jpg",
    hoops:8, lit:true, surface:"Acrylic", players:188, pts:8920, rank:1, live:true },
  { id:"chandler", name:"Chandler Park", hood:"Chandler Park", zip:"48215", side:"East Side",
    lat:42.39250, lon:-82.97603, photo:"assets/photos/court-chandler.jpg",
    hoops:8, lit:true, surface:"Acrylic", players:142, pts:8610, rank:2, live:true },
  { id:"collegepark", name:"College Park Courts", hood:"College Park", zip:"48235", side:"Northwest",
    lat:42.42375, lon:-83.19581, photo:"assets/photos/court-collegepark.jpg",
    hoops:6, lit:true, surface:"Asphalt", players:119, pts:8240, rank:3, live:false },
  { id:"russellwoods", name:"Russell Woods Courts", hood:"Russell Woods", zip:"48238", side:"Central",
    lat:42.38863, lon:-83.13303, photo:"assets/photos/court-russellwoods.jpg",
    hoops:4, lit:false, surface:"Asphalt", players:96, pts:7980, rank:4, live:false },
  { id:"westwood", name:"Westwood Park", hood:"Westwood Park", zip:"48219", side:"West Side",
    lat:42.39635, lon:-83.23606, photo:"assets/photos/court-westwood.jpg",
    hoops:4, lit:false, surface:"Asphalt", players:84, pts:7440, rank:5, live:false }
];

const HOME_COURT = "chandler";
let selectedCourt = HOME_COURT;

/* Real Detroit landmarks for the 313 Challenge */
const STOPS = [
  { icon:"i-city",  title:"Spirit of Detroit",   place:"Woodward & Jefferson · Downtown",
    lat:42.32903, lon:-83.04574, copy:"Scan the marker at the plaza, then answer three Pistons questions.", pts:100 },
  { icon:"i-users", title:"Eastern Market",      place:"Shed 3 · Russell Street",
    lat:42.34789, lon:-83.03990, copy:"Check in at an approved community partner event.", pts:100 },
  { icon:"i-basketball", title:"Belle Isle Park",place:"Belle Isle · Detroit River",
    lat:42.33900, lon:-82.98000, copy:"Complete any verified activity at the island courts.", pts:100 }
];

const SHOT_SCRIPT = [1,1,0,1,1,1,0,1,1,0]; // 7 of 10

/* Four-week pilot calendar (team production brief). */
const WEEKS = [
  { n:1, name:"Free Throw Challenge",  need:"Make 7 of 10",            evidence:"Staff verified at a pilot event",        pts:150, level:2, live:true },
  { n:2, name:"Around the World",      need:"Complete 5 spots",        evidence:"Staff verified at a pilot event",        pts:200, level:2 },
  { n:3, name:"Court Hopper",          need:"Visit 2 courts",          evidence:"Two rotating QR scans + coarse location",pts:250, level:1 },
  { n:4, name:"Rep Your Court",        need:"Group challenge",         evidence:"Staff check-in at the event",            pts:300, level:2 }
];

/* Verification tiers. Video stays out of V1 by design. */
const LEVELS = [
  { n:1, title:"Rotating QR + location",  copy:"A code that changes on a timer, paired with coarse location so a check-in can only happen on site.", v1:true },
  { n:2, title:"Court host verification", copy:"A Pistons staffer or approved community partner confirms the result at a pilot event.",               v1:true },
  { n:3, title:"Consent-based video",     copy:"Reviewed separately for safety, moderation and minors. Deliberately out of scope for V1.",            v1:false }
];

const BADGES = [
  { id:"rookie-runner", name:"Rookie Runner", earn:(st)=> st.submitted || (st.courtsVisited||[]).length > 0, hint:"First verified check-in" },
  { id:"hot-hand",      name:"Hot Hand",      earn:(st)=> st.streak >= 3,                                    hint:(st)=>`${st.streak} of 3 weeks` },
  { id:"court-hopper",  name:"Court Hopper",  earn:(st)=> (st.courtsVisited||[]).length >= 2,                hint:(st)=>`${(st.courtsVisited||[]).length} of 2 courts` },
  { id:"313-explorer",  name:"313 Explorer",  earn:(st)=> st.stops.every(Boolean),                           hint:(st)=>`${st.stops.filter(Boolean).length} of 3 stops` },
  { id:"community-mvp", name:"Community MVP", earn:()=> false,                                               hint:"Week 4 group event" }
];

/* ---------- Helpers ---------- */
const num = n => n.toLocaleString("en-US");
const ic  = (id, cls="icon") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#${id}"/></svg>`;
const court = id => COURTS.find(c => c.id === id) || COURTS[0];
const placeOf = c => c.name.includes(c.hood) ? `${c.hood}, Detroit ${c.zip}` : `${c.hood}, Detroit ${c.zip}`;
const whereOf = c => c.name.includes(c.hood) ? `Detroit ${c.zip}` : c.hood;
const sleep = ms => new Promise(r => setTimeout(r, reduced ? Math.min(ms,60) : ms));

function miles(aLat,aLon,bLat,bLon){
  const R = 3958.8, t = Math.PI/180;
  const dLat = (bLat-aLat)*t, dLon = (bLon-aLon)*t;
  const h = Math.sin(dLat/2)**2 + Math.cos(aLat*t)*Math.cos(bLat*t)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
const distTo = c => miles(USER.lat, USER.lon, c.lat, c.lon);
const distLabel = c => `${distTo(c).toFixed(1)} mi`;
const byDistance = () => [...COURTS].sort((a,b) => distTo(a) - distTo(b));

function daysLeft(){ const wd = new Date().getDay(); return wd === 0 ? 0 : 7 - wd; }
function deadlineCopy(){ const n = daysLeft(); return n === 0 ? "Ends tonight" : n === 1 ? "1 day left" : `${n} days left`; }
function haptic(ms=12){ if(navigator.vibrate && !reduced) navigator.vibrate(ms); }

function toast(msg, icon="i-check"){
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `${ic(icon)}<span>${msg}</span>`;
  toastHost.appendChild(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 320); }, 2300);
}

function countUp(node, from, to, dur=900){
  if(!node) return;
  if(reduced || from === to){ node.textContent = num(to); return; }
  const t0 = performance.now();
  (function step(now){
    const p = Math.min(1, (now - t0) / dur);
    node.textContent = num(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 4))));
    if(p < 1) requestAnimationFrame(step);
  })(t0);
}

/* ---------- Confetti ---------- */
const ctx = fx.getContext("2d");
let particles = [], raf = 0;
function sizeFx(){
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  fx.width = fx.clientWidth * dpr; fx.height = fx.clientHeight * dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener("resize", () => { sizeFx(); if(map) map.invalidateSize(); });

function confetti(){
  if(reduced) return;
  sizeFx();
  const W = fx.clientWidth, colors = ["#C8102E","#E1213C","#1D42BA","#FFFFFF","#E8B33C","#4B79FF"];
  for(let i=0;i<140;i++){
    particles.push({
      x: W/2 + (Math.random()-.5)*90, y: fx.clientHeight*0.30 + (Math.random()-.5)*30,
      vx:(Math.random()-.5)*8.5, vy:-(5+Math.random()*10), g:.26+Math.random()*.16,
      w:5+Math.random()*6, h:8+Math.random()*8, r:Math.random()*Math.PI, vr:(Math.random()-.5)*.36,
      c:colors[(Math.random()*colors.length)|0], life:1
    });
  }
  if(!raf) raf = requestAnimationFrame(tick);
}
function tick(){
  ctx.clearRect(0,0,fx.clientWidth,fx.clientHeight);
  particles = particles.filter(p => p.life > 0 && p.y < fx.clientHeight + 40);
  for(const p of particles){
    p.vy += p.g; p.vx *= .992; p.x += p.vx; p.y += p.vy; p.r += p.vr;
    if(p.y > fx.clientHeight*.75) p.life -= .018;
    ctx.save(); ctx.globalAlpha = Math.max(0,p.life);
    ctx.translate(p.x,p.y); ctx.rotate(p.r);
    ctx.fillStyle = p.c; ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h); ctx.restore();
  }
  if(particles.length) raf = requestAnimationFrame(tick);
  else { raf = 0; ctx.clearRect(0,0,fx.clientWidth,fx.clientHeight); }
}

/* ---------- Award ---------- */
function award(amount, label){
  const from = state.points;
  state.points += amount; save();
  countUp(pointsVal, from, state.points, 1100);
  chip.classList.remove("pulse"); void chip.offsetWidth; chip.classList.add("pulse");
  haptic([14,50,22]);
  if(label) toast(label, "i-bolt-fill");
}

/* ==========================================================
   Leaflet map
   ========================================================== */
let map = null, markers = [];
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/";
const TILES = {
  light:     ESRI + "Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  dark:      ESRI + "Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  satellite: ESRI + "World_Imagery/MapServer/tile/{z}/{y}/{x}"
};
const LABELS = {
  light: ESRI + "Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
  dark:  ESRI + "Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
  satellite: ESRI + "Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
};
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &middot; Esri';
let tileLayer = null, labelLayer = null, mapStyle = "canvas";
const baseKey = () => mapStyle === "satellite" ? "satellite" : (darkMQ.matches ? "dark" : "light");

function destroyMap(){
  if(map){ map.remove(); map = null; markers = []; tileLayer = null; labelLayer = null; }
}

function buildMap(node, opts){
  if(typeof L === "undefined") return null;
  map = L.map(node, {
    zoomControl:false, attributionControl:false,
    scrollWheelZoom:false, doubleClickZoom:true, tap:true,
    zoomAnimation:!reduced, fadeAnimation:!reduced,
    center:opts.center, zoom:opts.zoom
  });
  const k = baseKey();
  tileLayer  = L.tileLayer(TILES[k],  { attribution:ATTR, maxZoom:19, crossOrigin:true }).addTo(map);
  labelLayer = L.tileLayer(LABELS[k], { maxZoom:19, crossOrigin:true, opacity:.95, pane:"shadowPane" }).addTo(map);
  L.control.attribution({ position:"topright", prefix:false }).addAttribution(ATTR).addTo(map);
  node.closest(".leafwrap")?.classList.toggle("sat", k === "satellite");
  return map;
}

function youIcon(){
  return L.divIcon({ className:"", html:`<span class="youmark"><span></span></span>`, iconSize:[18,18], iconAnchor:[9,9] });
}
function pinIcon(c){
  const cls = `pinmark${c.id === HOME_COURT ? " home" : ""}${c.id === selectedCourt ? " sel" : ""}`;
  return L.divIcon({ className:"", html:`<span class="${cls}"><i><b>${c.rank}</b></i></span>`, iconSize:[34,34], iconAnchor:[17,34] });
}

function mountCourtsMap(){
  const node = document.getElementById("leafmap");
  if(!node) return;
  destroyMap();
  const m = buildMap(node, { center:[42.3760,-83.1050], zoom:11 });
  if(!m){ node.innerHTML = `<div class="map-chip" style="margin:12px">Map unavailable offline</div>`; return; }

  L.marker([USER.lat, USER.lon], { icon:youIcon(), interactive:false, zIndexOffset:-100 }).addTo(m);

  COURTS.forEach((c,i) => {
    const mk = L.marker([c.lat,c.lon], { icon:pinIcon(c), title:c.name, riseOnHover:true, opacity:0 }).addTo(m);
    mk.on("click", () => { haptic(8); selectedCourt = c.id; go("court"); });
    setTimeout(() => mk.setOpacity(1), reduced ? 0 : 120 + i*90);
    markers.push(mk);
  });

  const bounds = L.latLngBounds(COURTS.map(c => [c.lat, c.lon]));
  m.invalidateSize();
  m.fitBounds(bounds.pad(0.26), { animate:false });
  const target = m.getZoom();
  m.setZoom(Math.max(9, target - 2), { animate:false });
  setTimeout(() => {
    if(!map) return;
    map.invalidateSize();
    map.flyToBounds(bounds.pad(0.26), { duration: reduced ? 0 : 1.4, easeLinearity:.25 });
  }, 260);

  const btn = document.getElementById("locBtn");
  if(btn) btn.onclick = () => { haptic(8); map.flyTo([USER.lat,USER.lon], 14, { duration: reduced ? 0 : 1.1 }); };
}

function mountCourtMap(){
  const node = document.getElementById("leafmini");
  if(!node) return;
  destroyMap();
  const c = court(selectedCourt);
  const prev = mapStyle; mapStyle = "satellite";
  const m = buildMap(node, { center:[c.lat,c.lon], zoom:16 });
  mapStyle = prev;
  if(!m) return;
  L.circle([c.lat,c.lon], {
    radius:140, color:"#FFFFFF", weight:1.6, opacity:.9, fillColor:"#C8102E", fillOpacity:.18
  }).addTo(m);
  L.marker([c.lat,c.lon], { icon:pinIcon(c), interactive:false }).addTo(m);
  m.invalidateSize();
  m.setView([c.lat,c.lon], 14, { animate:false });
  setTimeout(() => {
    if(!map) return;
    map.invalidateSize();
    map.flyTo([c.lat,c.lon], 18, { duration: reduced ? 0 : 1.5 });
  }, 260);
}

function applyMapStyle(){
  const k = baseKey();
  if(tileLayer)  tileLayer.setUrl(TILES[k]);
  if(labelLayer) labelLayer.setUrl(LABELS[k]);
  document.querySelector(".leafwrap:has(#leafmap)")?.classList.toggle("sat", mapStyle === "satellite");
  document.querySelectorAll("[data-action=mapstyle] span").forEach(s => {
    s.textContent = mapStyle === "satellite" ? "Satellite" : "Map";
  });
}
darkMQ.addEventListener?.("change", applyMapStyle);

/* ==========================================================
   Views
   ========================================================== */

function vFanZone(){
  return `
  <h1 class="large-title" data-a>Fan Zone</h1>
  <p class="sub" data-a>Everything Pistons, in one place.</p>

  <div class="section" data-a>
    <button class="promo pressable" data-go="home" aria-label="Open Run Detroit">
      <span class="promo-glow" aria-hidden="true"></span>
      <span class="promo-ball" id="promoBall" aria-hidden="true">
        <img class="promo-mark" src="assets/mark-run-detroit.svg" alt="" width="104" height="104">
      </span>
      <span class="promo-copy">
        <span class="badge-new">New this season</span>
        <strong>Run Detroit</strong>
        <span class="promo-sub">Play basketball. Explore the city. Rep your court.</span>
        <span class="promo-cta">Open ${ic("i-arrow-ur")}</span>
      </span>
    </button>
  </div>

  <div class="section" data-a>
    <div class="section-head"><h2>Your Fan Zone</h2></div>
    <div class="list">
      <button class="row" data-go="tickets">
        <span class="glyph red">${ic("i-ticket-fill")}</span>
        <span><span class="row-title">Tickets</span><span class="row-sub">2 passes ready · next Friday</span></span>
        ${ic("i-chev-right","row-chev")}
      </button>
      <button class="row" data-go="rewards">
        <span class="glyph gold">${ic("i-gift-fill")}</span>
        <span><span class="row-title">Pistons Rewards</span><span class="row-sub">${num(state.points)} points to spend</span></span>
        ${ic("i-chev-right","row-chev")}
      </button>
      <button class="row" data-go="schedule">
        <span class="glyph">${ic("i-calendar-fill")}</span>
        <span><span class="row-title">Schedule</span><span class="row-sub">Next: vs. Chicago, Friday 7:00 PM</span></span>
        ${ic("i-chev-right","row-chev")}
      </button>
      <button class="row" data-action="arcade">
        <span class="glyph slate">${ic("i-gamepad-fill")}</span>
        <span><span class="row-title">Arcade</span><span class="row-sub">Play and compete</span></span>
        ${ic("i-chev-right","row-chev")}
      </button>
    </div>
  </div>

  <div class="note" data-a>
    ${ic("i-info")}
    <p>Run Detroit is designed to live inside the existing Pistons app, not beside it — the same account, the same Pistons Points, one entry point.</p>
  </div>

  <div class="section" data-a>
    <button class="reset-link" data-action="reset" aria-label="Reset the demo">${ic("i-clock")}Reset demo</button>
  </div>`;
}

/* Real-feeling existing Pistons surfaces, so nothing in Fan Zone is a dead tap. */
const GAMES = [
  { opp:"Chicago Bulls",       code:"CHI", home:true,  date:"Fri, Oct 24", time:"7:00 PM", venue:"Little Caesars Arena" },
  { opp:"Cleveland Cavaliers", code:"CLE", home:false, date:"Sun, Oct 26", time:"6:00 PM", venue:"Rocket Arena" },
  { opp:"Milwaukee Bucks",     code:"MIL", home:true,  date:"Wed, Oct 29", time:"7:00 PM", venue:"Little Caesars Arena" },
  { opp:"Indiana Pacers",      code:"IND", home:true,  date:"Sat, Nov 1",  time:"7:00 PM", venue:"Little Caesars Arena" },
  { opp:"New York Knicks",     code:"NYK", home:false, date:"Tue, Nov 4",  time:"7:30 PM", venue:"Madison Square Garden" }
];

function vTickets(){
  const g = GAMES[0];
  return `
  <h1 class="large-title" data-a>Tickets</h1>
  <p class="sub" data-a>Your passes live here. Tap a pass at the gate.</p>

  <div class="section" data-a>
    <div class="pass">
      <div class="pass-top">
        <span class="pass-eyebrow">${g.home ? "Home game" : "Away game"} · ${g.date}</span>
        <h3>Pistons ${g.home ? "vs." : "@"} ${g.opp}</h3>
        <p>${g.time} · ${g.venue}</p>
      </div>
      <div class="pass-rip"><i></i><i></i></div>
      <div class="pass-seat">
        <div><strong>112</strong><span>Section</span></div>
        <div><strong>7</strong><span>Row</span></div>
        <div><strong>14</strong><span>Seat</span></div>
      </div>
      <div class="pass-code"><span class="bars" aria-hidden="true"></span><span>PST-0042-8817-DET</span></div>
    </div>
  </div>

  <div class="section" data-a>
    <div class="list">
      <button class="row" data-go="rewards">
        <span class="glyph gold">${ic("i-star-fill")}</span>
        <span><span class="row-title">Earn points at this game</span><span class="row-sub">Scanning your pass credits Pistons Rewards</span></span>
        ${ic("i-chev-right","row-chev")}
      </button>
      <button class="row" data-go="schedule">
        <span class="glyph">${ic("i-calendar-fill")}</span>
        <span><span class="row-title">Full schedule</span><span class="row-sub">See every upcoming game</span></span>
        ${ic("i-chev-right","row-chev")}
      </button>
    </div>
  </div>

  <div class="note" data-a>${ic("i-info")}<p>Illustrative pass. Ticketing is an existing Pistons surface and is shown here only to place Run Detroit inside the app fans already use.</p></div>`;
}

function vSchedule(){
  return `
  <h1 class="large-title" data-a>Schedule</h1>
  <p class="sub" data-a>Next five games.</p>

  <div class="section" data-a>
    <div class="list">
      ${GAMES.map(g=>`
        <button class="row" data-go="tickets">
          <span class="gamedate"><strong>${g.date.split(", ")[1].split(" ")[1]}</strong><span>${g.date.split(", ")[1].split(" ")[0]}</span></span>
          <span>
            <span class="row-title">${g.home ? "vs." : "@"} ${g.opp}</span>
            <span class="row-sub">${g.date.split(",")[0]} · ${g.time} · ${g.venue}</span>
          </span>
          <span style="text-align:right">
            <span class="pill ${g.home?"red":""}">${g.home?"Home":"Away"}</span>
          </span>
        </button>`).join("")}
    </div>
  </div>

  <div class="section" data-a>
    <div class="card">
      <span class="pill blue">${ic("i-info")}Concept note</span>
      <h3 style="margin-top:9px">Illustrative fixture list</h3>
      <p>These games stand in for the live schedule feed. The point is where Run Detroit sits: one tab away from the things fans already open this app for.</p>
    </div>
  </div>`;
}

function vHome(){
  const c = court(HOME_COURT);
  const ready = state.checkedIn, done = state.submitted;
  return `
  <div class="hero" data-a>
    <img class="hero-mark" src="assets/mark-run-detroit.svg" alt="">
    <span class="hero-eyebrow">Powered by Pistons Rewards</span>
    <h1>Run<br>Detroit</h1>
    <p>Play basketball. Explore Detroit. Rep your court.</p>
    <div class="hero-stats">
      <div><strong>${num(state.points)}</strong><span>Points</span></div>
      <div><strong>${state.streak}</strong><span>Week streak</span></div>
      <div><strong>#${c.rank}</strong><span>${c.hood}</span></div>
    </div>
  </div>

  <div class="section" data-a>
    <div class="section-head">
      <h2>This week</h2>
      <span class="countdown">${ic("i-clock")}${deadlineCopy()}</span>
    </div>
    <div class="challenge">
      <div class="challenge-head">
        <div>
          <span class="pill">Weekly Challenge</span>
          <h3>Free Throw Challenge</h3>
          <p>Make 7 of 10 at a participating court.</p>
        </div>
      </div>
      <div class="chal-meta">
        <div><strong>7 / 10</strong><span>Goal</span></div>
        <div><strong>+150</strong><span>Points</span></div>
        <div><strong>${done ? "Done" : "1×"}</strong><span>${done ? "This week" : "Per week"}</span></div>
      </div>
      <button class="btn" data-go="${done ? "result" : ready ? "challenge" : "courts"}">
        ${done ? ic("i-check") : ic("i-basketball")}
        ${done ? "View your result" : ready ? "Start challenge" : "Find a court"}
      </button>
    </div>
  </div>

  <div class="section" data-a>
    <div class="section-head">
      <h2>Your court</h2>
      <button class="link" data-go="leaderboard">Standings ${ic("i-chev-right")}</button>
    </div>
    <div class="card flush pressable" data-court="${c.id}">
      <div class="photo r169">
        <img src="${c.photo}" alt="Aerial view of ${c.name}" loading="lazy">
        <div class="grad"></div>
        ${c.live ? `<span class="tagtop"><i class="dot-live"></i>Active now</span>` : ""}
        <span class="tagtop right">${distLabel(c)}</span>
        <div class="cap"><h3>${c.name}</h3><p>${c.hood} · ${c.players} players this month</p></div>
      </div>
      <div class="row" style="grid-template-columns:1fr auto">
        <span class="row-sub">Ranked #${c.rank} in Detroit · ${num(c.pts)} court points</span>
        ${ic("i-chev-right","row-chev")}
      </div>
    </div>
  </div>

  <div class="section" data-a>
    <div class="section-head"><h2>Keep going</h2></div>
    <div class="list">
      <button class="row" data-go="season">
        <span class="glyph red">${ic("i-calendar-dots")}</span>
        <span><span class="row-title">Four-week season</span><span class="row-sub">Week 1 of 4 · 900 points on the table</span></span>
        ${ic("i-chev-right","row-chev")}
      </button>
      <button class="row" data-go="c313">
        <span class="glyph">${ic("i-map-fill")}</span>
        <span><span class="row-title">The 313 Challenge</span><span class="row-sub">${state.stops.filter(Boolean).length} of 3 stops this month</span></span>
        ${ic("i-chev-right","row-chev")}
      </button>
      <button class="row" data-go="leaderboard">
        <span class="glyph gold">${ic("i-trophy-fill")}</span>
        <span><span class="row-title">Court Standings</span><span class="row-sub">Week 3 of the 4-week season</span></span>
        ${ic("i-chev-right","row-chev")}
      </button>
      <button class="row" data-go="rewards">
        <span class="glyph red">${ic("i-star-fill")}</span>
        <span><span class="row-title">Rewards &amp; Badges</span><span class="row-sub">Hot Hand is one week away</span></span>
        ${ic("i-chev-right","row-chev")}
      </button>
    </div>
  </div>

  <div class="note" data-a>
    ${ic("i-lock")}
    <p>Concept prototype. QR scanning, host verification and Pistons Points transfers are simulated — no real rewards ledger is touched. Court locations, maps and aerial imagery are real, and your demo account is a real one.</p>
  </div>`;
}

function vCourts(){
  const list = byDistance();
  return `
  <h1 class="large-title" data-a>Courts</h1>
  <p class="sub" data-a>Five pilot courts across Detroit. Check in on site to unlock this week's challenge.</p>

  <div class="section" data-a>
    <div class="leafwrap tall">
      <div id="leafmap"></div>
      <div class="map-overlay">
        <span class="map-chip">${ic("i-navigation")}${USER.label}</span>
        <button class="map-chip tap" data-action="mapstyle" type="button">${ic("i-city")}<span>Map</span></button>
      </div>
      <button class="map-btn" id="locBtn" type="button" aria-label="Center on me">${ic("i-navigation")}</button>
    </div>
  </div>

  <div class="section" data-a>
    <div class="section-head"><h2>Nearest to you</h2><span class="pill green">${ic("i-bolt-fill")}Pilot</span></div>
    <div class="list">
      ${list.map(c=>`
        <button class="row" data-court="${c.id}">
          <span class="thumb"><img src="${c.photo}" alt="" loading="lazy"></span>
          <span>
            <span class="row-title">${c.name}</span>
            <span class="row-sub">${c.hood} · ${c.side} · ${c.players} active</span>
          </span>
          <span style="text-align:right">
            <span class="row-val">${distLabel(c)}</span>
            <span class="lb-delta" style="color:${c.live?"var(--green)":"var(--label-3)"}">${c.live?"Active":`#${c.rank}`}</span>
          </span>
        </button>`).join("")}
    </div>
  </div>

  <p class="credits" data-a>Map data © OpenStreetMap contributors · Tiles © CARTO · Aerial stills © Esri World Imagery</p>`;
}

function vCourt(){
  const c = court(selectedCourt);
  const here = state.checkedIn && state.checkedInCourt === c.id;
  return `
  <div class="section" style="padding-top:14px" data-a>
    <div class="card flush">
      <div class="photo r43">
        <img src="${c.photo}" alt="Aerial view of ${c.name}">
        <div class="grad"></div>
        ${c.live ? `<span class="tagtop"><i class="dot-live"></i>Active now</span>` : ""}
        <span class="tagtop right">${distLabel(c)} away</span>
        <div class="cap"><h3>${c.name}</h3><p>${placeOf(c)} · ${c.side}</p></div>
      </div>
    </div>
  </div>

  <div class="section" data-a>
    <div class="stats">
      <div class="stat"><strong>#${c.rank}</strong><span>City rank</span></div>
      <div class="stat"><strong>${c.players}</strong><span>Active</span></div>
      <div class="stat"><strong>${c.hoops}</strong><span>Hoops</span></div>
    </div>
  </div>

  <div class="section" data-a>
    <div class="leafwrap short">
      <div id="leafmini"></div>
      <div class="map-overlay"><span class="map-chip">${ic("i-lock")}Check-in radius 140 m</span></div>
    </div>
  </div>

  <div class="section" data-a>
    <div class="card">
      <span class="pill ${here ? "green" : "red"}">${here ? ic("i-check") : ic("i-viewfinder")}${here ? "Checked in" : "Verification required"}</span>
      <h3 style="margin-top:9px">${here ? "You're on the court" : "Check in to play"}</h3>
      <p>${here
        ? `Your session at ${c.name} is active. Weekly challenge unlocked.`
        : "Scan the rotating code posted at the court. The pilot pairs it with approximate location, so a check-in can only happen on site."}</p>
      <button class="btn ${here ? "btn-navy" : "btn-primary"}" data-action="${here ? "go-challenge" : "scan"}">
        ${here ? ic("i-basketball") : ic("i-qr")}${here ? "Start the challenge" : "Scan court code"}
      </button>
      ${here ? "" : `<button class="btn btn-quiet" data-go="leaderboard">${ic("i-trophy")}See where this court ranks</button>`}
    </div>
  </div>

  <div class="section" data-a>
    <div class="list">
      <div class="row" style="cursor:default">
        <span class="glyph ${c.lit?"green":"slate"}">${ic("i-bolt-fill")}</span>
        <span><span class="row-title">${c.lit ? "Lit until 10 PM" : "Daylight hours"}</span><span class="row-sub">${c.surface} surface · ${c.hoops} hoops</span></span>
      </div>
      <div class="row" style="cursor:default">
        <span class="glyph">${ic("i-users-fill")}</span>
        <span><span class="row-title">${c.players} players this month</span><span class="row-sub">${num(c.pts)} court points earned</span></span>
      </div>
      <div class="row" style="cursor:default">
        <span class="glyph slate">${ic("i-map-fill")}</span>
        <span><span class="row-title">${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}</span><span class="row-sub">Verified against OpenStreetMap</span></span>
      </div>
    </div>
  </div>`;
}

function vCheckin(){
  const c = court(state.checkedInCourt || selectedCourt);
  return `
  <div class="result" data-a>
    <div class="seal">
      <svg viewBox="0 0 104 104">
        <circle class="seal-bg" cx="52" cy="52" r="49"/>
        <circle class="seal-ring" cx="52" cy="52" r="49"/>
        <path class="seal-tick" d="M33 53.5 46 66.5 72 40"/>
      </svg>
    </div>
    <h1>You're in.</h1>
    <p>Checked in at ${c.name}, ${whereOf(c)}. Your session is active for the next two hours.</p>
  </div>

  <div class="section" data-a>
    <div class="challenge">
      <span class="pill">Unlocked</span>
      <h3>Free Throw Challenge</h3>
      <p>Make 7 of 10. Worth 150 Pistons Points, once per week.</p>
      <button class="btn" data-go="challenge">${ic("i-basketball")}Start now</button>
    </div>
  </div>

  <div class="section" data-a>
    <button class="btn btn-quiet" data-go="courts">${ic("i-map")}Back to courts</button>
  </div>`;
}

function ringMarkup(made, total){
  const R = 68, C = 2*Math.PI*R, off = C * (1 - made/total);
  return `
  <div class="ring" id="ring">
    <svg viewBox="0 0 168 168">
      <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#E1213C"/><stop offset="1" stop-color="#8C0720"/>
      </linearGradient></defs>
      <circle class="track" cx="84" cy="84" r="${R}"/>
      <circle class="prog" cx="84" cy="84" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/>
    </svg>
    <div class="ring-val"><strong id="ringNum">${made}</strong><span>of ${total} made</span></div>
  </div>`;
}

function vChallenge(){
  const c = court(state.checkedInCourt || HOME_COURT);
  const fired = state.shotsFired;
  return `
  <h1 class="large-title" data-a>Free Throw<br>Challenge</h1>
  <p class="sub" data-a>${c.name} · Make 7 of 10 to earn 150 Pistons Points.</p>

  <div class="section" style="padding-bottom:0" data-a>
    <div class="court-stage" style="margin:0">
      <img class="stage-bg" src="${c.photo}" alt="" aria-hidden="true">
      <span class="rim">${ic("i-hoop")}</span>
      <span class="swish" id="swish">${ic("i-sparkle")}</span>
      <span class="ball" id="ball"></span>
    </div>
  </div>

  <div class="section" data-a>
    ${ringMarkup(fired ? 7 : 0, 10)}
    <div class="shots" id="shots">
      ${SHOT_SCRIPT.map((s,i)=>`<span class="shot ${fired ? (s ? "make" : "miss") : ""}" data-shot="${i}">${ic("i-check")}</span>`).join("")}
    </div>
  </div>

  <div class="section" data-a>
    <div class="card">
      <span class="pill red">${ic("i-bolt-fill")}+150 points</span>
      <h3 style="margin-top:9px" id="chalTitle">${fired ? "7 of 10 — you passed" : "Ten attempts. One round."}</h3>
      <p id="chalCopy">${fired
        ? `Result captured. A court host confirms it before any points are awarded.`
        : "Each attempt is logged as you shoot. In a live pilot, a court host or event staffer confirms the round."}</p>
      <button class="btn btn-primary" id="chalBtn" data-action="${fired ? "verify" : "shoot"}">
        ${fired ? ic("i-seal-check") : ic("i-basketball")}${fired ? "Get it verified" : "Begin attempt"}
      </button>
    </div>
  </div>

  <div class="note" data-a>${ic("i-info")}<p>Scores are simulated here. V1 proposes no camera, sensor or motion tracking — a court host confirms the round instead.</p></div>`;
}


function vSeason(){
  return `
  <h1 class="large-title" data-a>Challenges</h1>
  <p class="sub" data-a>A four-week season. One reason to come back every week, with a capped award so nobody can farm it.</p>

  <div class="section" data-a>
    <div class="list">
      ${WEEKS.map(w=>{
        const done = w.n === 1 && state.submitted;
        const live = !!w.live;
        return `
        <button class="row" ${live ? `data-go="${state.checkedIn ? "challenge" : "courts"}"` : `data-action="week-locked"`}>
          <span class="weeknum ${done?"done":live?"live":""}">${done ? ic("i-check") : `<strong>${w.n}</strong><span>Wk</span>`}</span>
          <span>
            <span class="row-title">${w.name}</span>
            <span class="row-sub">${w.need} · ${w.evidence}</span>
            <span class="evidence">${ic("i-seal-check")}Level ${w.level} evidence</span>
          </span>
          <span style="text-align:right">
            <span class="row-val" style="color:var(--red)">+${w.pts}</span>
            <span class="lb-delta" style="color:var(--label-3)">Once weekly</span>
          </span>
        </button>`;
      }).join("")}
    </div>
  </div>

  <div class="section" data-a>
    <div class="section-head"><h2>How a result is trusted</h2></div>
    <div class="list">
      ${LEVELS.map(l=>`
        <div class="row" style="cursor:default">
          <span class="glyph ${l.v1?"green":"slate"}">${ic(l.v1 ? "i-seal-check" : "i-lock-fill")}</span>
          <span>
            <span class="row-title">Level ${l.n} · ${l.title}</span>
            <span class="row-sub">${l.copy}</span>
          </span>
          <span class="pill ${l.v1?"green":""}">${l.v1 ? "In V1" : "Future"}</span>
        </div>`).join("")}
    </div>
  </div>

  <div class="section" data-a>
    <div class="card">
      <span class="pill blue">${ic("i-info")}Points budget</span>
      <h3 style="margin-top:9px">900 points across four weeks</h3>
      <p>Each challenge pays once per week per account. Court standings count capped, verified contributions, so a large group cannot outscore a small one by repeat scanning.</p>
    </div>
  </div>

  <div class="section" data-a>
    <div class="list">
      <div class="row" style="cursor:default">
        <span class="glyph slate">${ic("i-users-fill")}</span>
        <span><span class="row-title">Connect</span><span class="row-sub">Organised pickup and opt-in player profiles. Held back until moderation and safety review.</span></span>
        <span class="pill">Post-pilot</span>
      </div>
      <div class="row" style="cursor:default">
        <span class="glyph slate">${ic("i-city-fill")}</span>
        <span><span class="row-title">Winter programming</span><span class="row-sub">Moves to approved indoor rec centres and university gyms.</span></span>
        <span class="pill">Planned</span>
      </div>
    </div>
  </div>`;
}

function vResult(){
  const c = court(state.checkedInCourt || HOME_COURT);
  const leader = [...COURTS].sort((a,b) => b.pts - a.pts)[0];
  return `
  <div class="result" data-a>
    <div class="seal">
      <svg viewBox="0 0 104 104">
        <circle class="seal-bg" cx="52" cy="52" r="49"/>
        <circle class="seal-ring" cx="52" cy="52" r="49"/>
        <path class="seal-tick" d="M33 53.5 46 66.5 72 40"/>
      </svg>
    </div>
    <h1>Challenge complete</h1>
    <div class="payout"><span id="payout">0</span></div>
    <div class="payout-label">Pistons Points earned</div>
  </div>

  <div class="section" data-a>
    <div class="stats">
      <div class="stat"><strong id="totalPts">${num(state.points)}</strong><span>Total</span></div>
      <div class="stat"><strong>${state.streak}</strong><span>Week streak</span></div>
      <div class="stat"><strong>#${c.rank}</strong><span>Court rank</span></div>
    </div>
  </div>

  <div class="section" data-a>
    <div class="card">
      <span class="pill gold">${ic("i-sparkle-fill")}Badge progress</span>
      <h3 style="margin-top:9px">Hot Hand</h3>
      <p>Complete the weekly challenge three weeks in a row. You're at ${state.streak} of 3.</p>
      <div class="bar gold"><i data-w="${Math.round(state.streak/3*100)}"></i></div>
    </div>
    <div class="card">
      <span class="pill blue">${ic("i-users-fill")}Court contribution</span>
      <h3 style="margin-top:9px">${c.name} +150</h3>
      <p>${leader.id === c.id
        ? `Your round extends ${c.name}'s lead at the top of the table.`
        : `Your round counted toward the season total. ${leader.name} still leads by ${num(leader.pts - c.pts)}.`}</p>
      <div class="bar blue"><i data-w="${Math.round(c.pts/leader.pts*100)}"></i></div>
    </div>
  </div>

  <div class="section" data-a>
    <button class="btn btn-navy" data-go="leaderboard">${ic("i-trophy")}See court standings</button>
    <button class="btn btn-quiet" data-go="home">${ic("i-house")}Back to Run Detroit</button>
  </div>`;
}

function vLeaderboard(){
  const rows = [...COURTS].sort((a,b) => b.pts - a.pts);
  const top = rows[0].pts;
  const deltas = { davison:"+310", chandler:"+240", collegepark:"+180", russellwoods:"+120", westwood:"+90" };
  return `
  <h1 class="large-title" data-a>Standings</h1>
  <p class="sub" data-a>Court vs. court. Week 3 of a 4-week season, scored on verified participation.</p>

  <div class="section" data-a>
    <div class="list">
      ${rows.map((c,i)=>`
        <button class="lb-row ${c.id===HOME_COURT?"me":""}" data-court="${c.id}">
          <span class="lb-place">${i+1}</span>
          <span class="lb-name">
            <strong>${c.name}${c.id===HOME_COURT?` <span class="pill red" style="height:18px;font-size:9.5px;margin-left:4px">You</span>`:""}</strong>
            <span class="row-sub">${c.hood} · ${c.players} active</span>
            <span class="bar"><i data-w="${Math.round(c.pts/top*100)}"></i></span>
          </span>
          <span><span class="lb-pts">${num(c.pts)}</span><span class="lb-delta">${deltas[c.id]}</span></span>
        </button>`).join("")}
    </div>
  </div>

  <div class="section" data-a>
    <div class="card">
      <span class="pill blue">${ic("i-info")}How scoring works</span>
      <h3 style="margin-top:9px">Activity, not headcount</h3>
      <p>A court earns points from verified check-ins and completed challenges, divided by its registered roster. A small court can beat a big one by showing up.</p>
    </div>
  </div>`;
}

function v313(){
  const done = state.stops.filter(Boolean).length;
  return `
  <div class="hero photo-hero" data-a>
    <div class="bg"><img src="assets/photos/skyline.jpg" alt="Detroit skyline from the river"></div>
    <div class="veil"></div>
    <div class="inner">
      <span class="hero-eyebrow">Season-long city challenge</span>
      <h1>The 313<br>Challenge</h1>
      <div class="hero-stats">
        <div><strong>${done}/3</strong><span>Stops</span></div>
        <div><strong>${done*100}</strong><span>Earned</span></div>
        <div><strong>+200</strong><span>Bonus</span></div>
      </div>
    </div>
  </div>

  <div class="section" data-a>
    <div class="section-head"><h2>This month's stops</h2><span class="pill ${done===3?"green":"red"}">${done} of 3</span></div>
    <div class="timeline">
      ${STOPS.map((s,i)=>{
        const isDone = state.stops[i];
        const isNext = !isDone && state.stops.slice(0,i).every(Boolean);
        return `
        <div class="tl-item ${isDone?"done":isNext?"active":""}">
          <span class="tl-dot">${ic(isDone ? "i-check" : s.icon)}</span>
          <div class="tl-body ${isNext?"pressable":""}" ${isNext?`data-action="stop-${i}"`:""}>
            <span class="tl-pts">+${s.pts}</span>
            <strong>${s.title}</strong>
            <p>${isDone ? "Completed this month." : s.copy}</p>
            <p style="margin-top:4px;font-size:11px;color:var(--label-3)">${s.place} · ${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}</p>
          </div>
        </div>`;
      }).join("")}
    </div>
  </div>

  <div class="section" data-a>
    <div class="card">
      <span class="pill gold">${ic("i-sparkle-fill")}Monthly bonus</span>
      <h3 style="margin-top:9px">Finish all three</h3>
      <p>Clear the full set before the month ends for an extra 200 points and the City Runner badge.</p>
      <div class="bar gold"><i data-w="${Math.round(done/3*100)}"></i></div>
    </div>
  </div>

  <p class="credits" data-a>Skyline photograph: Detroit Skyline (CC0) via Wikimedia Commons</p>`;
}

function vRewards(){
  const hotHand = state.streak >= 3;
  const cityRunner = state.stops.every(Boolean);
  return `
  <h1 class="large-title" data-a>Rewards</h1>
  <p class="sub" data-a>Everything you earn in Run Detroit lands in your existing Pistons Points balance.</p>

  <div class="section" data-a>
    <div class="hero photo-hero" style="margin:0;min-height:190px">
      <div class="bg"><img src="assets/photos/downtown.jpg" alt="Downtown Detroit from above"></div>
      <div class="veil"></div>
      <div class="inner">
        <span class="hero-eyebrow">Pistons Points</span>
        <h1 style="font-size:44px" id="balance">${num(state.points)}</h1>
        <p style="margin-top:4px">Earned across ${state.weeksActive + (state.submitted?1:0)} active weeks.</p>
      </div>
    </div>
  </div>

  <div class="section" data-a>
    <div class="section-head"><h2>Badges</h2><span class="pill">${BADGES.filter(b=>b.earn(state)).length} of ${BADGES.length}</span></div>
    <div class="badges">
      ${BADGES.map(b=>{
        const got = b.earn(state);
        const hint = typeof b.hint === "function" ? b.hint(state) : b.hint;
        return `<div class="badge ${got?"":"locked"}" ${b.id==="hot-hand"?'id="badgeHot"':""} data-action="badge">
          <img src="assets/badge-${b.id}.svg" alt="${b.name} badge">
          <strong>${b.name}</strong><span>${got ? "Earned" : hint}</span>
        </div>`;
      }).join("")}
    </div>
    <p class="credits" style="margin:12px 0 0">Badges carry recognition, not monetary value.</p>
  </div>

  <div class="section" data-a>
    <div class="section-head"><h2>Redeem</h2></div>
    <div class="list">
      <button class="row">
        <span class="glyph red">${ic("i-ticket")}</span>
        <span><span class="row-title">Upper bowl ticket drawing</span><span class="row-sub">Little Caesars Arena · enter with 500</span></span>
        <span class="row-val">500</span>
      </button>
      <button class="row">
        <span class="glyph gold">${ic("i-hoodie")}</span>
        <span><span class="row-title">Run Detroit court tee</span><span class="row-sub">Limited neighborhood drop</span></span>
        <span class="row-val">1,200</span>
      </button>
      <button class="row">
        <span class="glyph">${ic("i-seat")}</span>
        <span><span class="row-title">Shootaround pass</span><span class="row-sub">Pre-game, Little Caesars Arena</span></span>
        <span class="row-val">3,000</span>
      </button>
    </div>
  </div>

  <div class="note" data-a>${ic("i-info")}<p>Rewards shown are illustrative. Any live catalog would be set and approved by Pistons Rewards.</p></div>`;
}

function vProfile(){
  const c = court(HOME_COURT);
  return `
  <div class="section" style="padding-top:20px" data-a>
    <div class="card" style="text-align:center">
      <div class="avatar">${initials()}</div>
      <h3 style="margin-top:12px;font-size:20px">${account ? (isGuest() ? "Guest player" : account.email.split("@")[0]) : "Not signed in"}</h3>
      <p>Home court · ${c.name}, ${whereOf(c)}</p>
      <div class="stats" style="margin-top:16px">
        <div class="stat"><strong>${num(state.points)}</strong><span>Points</span></div>
        <div class="stat"><strong>${state.submitted?4:3}</strong><span>Challenges</span></div>
        <div class="stat"><strong>${state.streak>=3?2:1}</strong><span>Badges</span></div>
      </div>
    </div>
  </div>

  <div class="section" data-a>
    <div class="section-head"><h2>Activity</h2></div>
    <div class="list">
      ${state.submitted ? `
      <div class="row" style="cursor:default">
        <span class="glyph green">${ic("i-check")}</span>
        <span><span class="row-title">Free Throw Challenge</span><span class="row-sub">Today · ${c.name}</span></span>
        <span class="row-val" style="color:var(--green)">+150</span>
      </div>` : ""}
      <div class="row" style="cursor:default">
        <span class="glyph">${ic("i-map-fill")}</span>
        <span><span class="row-title">Spirit of Detroit stop</span><span class="row-sub">Sep 14 · Downtown</span></span>
        <span class="row-val" style="color:var(--green)">+100</span>
      </div>
      <div class="row" style="cursor:default">
        <span class="glyph red">${ic("i-basketball")}</span>
        <span><span class="row-title">Free Throw Challenge</span><span class="row-sub">Sep 8 · ${c.name}</span></span>
        <span class="row-val" style="color:var(--green)">+150</span>
      </div>
    </div>
  </div>

  <div class="section" data-a>
    <div class="section-head"><h2>Account</h2>${RD?.enabled ? "" : `<span class="pill">Offline</span>`}</div>
    <div class="list">
      <div class="row" style="cursor:default">
        <span class="glyph ${account ? (isGuest() ? "gold" : "green") : "slate"}">${ic(account ? "i-person-fill" : "i-lock")}</span>
        <span>
          <span class="row-title acct"><span class="acct-dot ${account ? (isGuest() ? "guest" : "") : "off"}"></span>${accountLabel()}</span>
          <span class="row-sub">${account
            ? (isGuest() ? "Progress syncs to this device's guest account" : "Progress syncs across every device")
            : "Sign in to save your progress"}</span>
        </span>
      </div>
      ${account
        ? (isGuest()
            ? `<button class="row" data-action="link-email">
                 <span class="glyph red">${ic("i-sparkle")}</span>
                 <span><span class="row-title">Save my progress</span><span class="row-sub">Add an email and keep everything</span></span>
                 ${ic("i-chev-right","row-chev")}
               </button>`
            : "")
        : `<button class="row" data-action="sign-in">
             <span class="glyph red">${ic("i-arrow-ur")}</span>
             <span><span class="row-title">Sign in</span><span class="row-sub">Guest or email, takes a second</span></span>
             ${ic("i-chev-right","row-chev")}
           </button>`}
      ${account ? `<button class="row" data-action="sign-out">
             <span class="glyph slate">${ic("i-lock")}</span>
             <span><span class="row-title">Sign out</span><span class="row-sub">Your progress stays on your account</span></span>
             ${ic("i-chev-right","row-chev")}
           </button>` : ""}
    </div>
  </div>

  <div class="section" data-a>
    <div class="section-head"><h2>Privacy</h2></div>
    <div class="list">
      <div class="row" style="cursor:default">
        <span class="glyph slate">${ic("i-lock-fill")}</span>
        <span><span class="row-title">Private profile</span><span class="row-sub">Public player profiles are out of scope for the pilot</span></span>
      </div>
      <div class="row" style="cursor:default">
        <span class="glyph slate">${ic("i-map-fill")}</span>
        <span><span class="row-title">Location used once</span><span class="row-sub">Checked at scan time only, never tracked in background</span></span>
      </div>
    </div>
  </div>

  <div class="section" data-a>
    <button class="btn btn-quiet" data-action="reset">${ic("i-clock")}Reset demo</button>
    <p class="credits" style="margin:10px 0 0">Presenting? Hold the points chip for a second, press <b>R</b>, or open the page with <b>?reset</b>.</p>
  </div>`;
}

/* ==========================================================
   Router
   ========================================================== */
const ROUTES = {
  fanzone:     { render:vFanZone,    title:"Fan Zone",      tab:null,     root:true },
  home:        { render:vHome,       title:"Run Detroit",   tab:"home",   root:true },
  tickets:     { render:vTickets,    title:"Tickets",       tab:null },
  schedule:    { render:vSchedule,   title:"Schedule",      tab:null },
  courts:      { render:vCourts,     title:"Courts",        tab:"courts", root:true, map:mountCourtsMap },
  court:       { render:vCourt,      title:"Court",         tab:"courts",            map:mountCourtMap },
  checkin:     { render:vCheckin,    title:"Checked in",    tab:"courts" },
  challenge:   { render:vChallenge,  title:"Free Throw",    tab:"play" },
  season:      { render:vSeason,     title:"Challenges",    tab:"play" },
  result:      { render:vResult,     title:"Complete",      tab:"play" },
  leaderboard: { render:vLeaderboard,title:"Standings",     tab:"courts" },
  c313:        { render:v313,        title:"313 Challenge", tab:"rewards" },
  rewards:     { render:vRewards,    title:"Rewards",       tab:"rewards",root:true },
  profile:     { render:vProfile,    title:"You",           tab:"profile",root:true }
};

const FAN_ZONE_ROUTES = new Set(["fanzone","tickets","schedule"]);
let stack = [];

function go(route, opts={}){
  if(!ROUTES[route] || route === state.route) return;
  if(ROUTES[route].root) stack = route === "fanzone" ? [] : ["fanzone"];
  else if(!opts.replace) stack.push(state.route);
  state.route = route; save();
  paint();
}
function back(){
  const prev = stack.pop();
  state.route = prev || "fanzone"; save();
  paint();
}

function paint(){
  const r = ROUTES[state.route] || ROUTES.home;
  destroyMap();
  navTitle.textContent = r.title;
  backBtn.hidden = state.route === "fanzone" || (r.root && stack.length === 0);

  view.classList.remove("enter");
  view.innerHTML = r.render();
  void view.offsetWidth;
  view.classList.add("enter");
  view.querySelectorAll("[data-a]").forEach((el,i) => { el.style.animationDelay = `${i*58}ms`; });

  scroller.scrollTop = 0;
  navbar.classList.remove("scrolled");
  pointsVal.textContent = num(state.points);
  syncTabs(r.tab);

  if(r.map) requestAnimationFrame(() => setTimeout(r.map, 40));
  afterPaint();
}

function syncTabs(active){
  tabbar.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.tab === active));
  tabbar.style.display = FAN_ZONE_ROUTES.has(state.route) ? "none" : "";
}

let ball3d = null;
function mountBall3D(){
  const host = document.getElementById("promoBall");
  if(!host || !window.RunDetroitBall) return;
  if(ball3d){ ball3d.destroy?.(); ball3d = null; }
  const fallback = `<img class="promo-mark" src="assets/mark-run-detroit.svg" alt="" width="104" height="104">`;
  host.innerHTML = "";
  try{
    ball3d = window.RunDetroitBall.mount(host);
  }catch(e){ ball3d = null; }
  if(ball3d) host.classList.add("live");
  else { host.classList.remove("live"); host.innerHTML = fallback; }
}
window.addEventListener("ball-ready", () => { if(state.route === "fanzone") mountBall3D(); });

function afterPaint(){
  if(state.route === "fanzone") mountBall3D();
  else if(ball3d){ ball3d.destroy?.(); ball3d = null; }

  requestAnimationFrame(() => {
    view.querySelectorAll(".bar > i[data-w]").forEach((el,i) => {
      setTimeout(() => { el.style.width = el.dataset.w + "%"; }, 220 + i*90);
    });
  });

  if(state.route === "result"){
    setTimeout(() => {
      confetti();
      countUp(document.getElementById("payout"), 0, 150, 1000);
      countUp(document.getElementById("totalPts"), state.points - 150, state.points, 1100);
    }, 340);
  }

  if(state.route === "rewards" && state.streak >= 3 && !state.seenReward){
    state.seenReward = true; save();
    const b = document.getElementById("badgeHot");
    if(b) setTimeout(() => { b.classList.add("unlocking"); haptic(18); }, 500);
  }
}

/* ==========================================================
   Account sheet
   ========================================================== */
let sheetMode = "welcome", pendingEmail = "", sheetBusy = false, sheetError = "";

function sheetHTML(){
  if(sheetMode === "email"){
    return `
      <div class="sheet" id="sheet">
        <div class="sheet-grip"></div>
        <h2>What's your email?</h2>
        <p>A six-digit code keeps your courts, points and streak on every device you use.</p>
        <input class="field" id="emailField" type="email" inputmode="email" autocomplete="email"
               placeholder="you@example.com" value="${pendingEmail}">
        <button class="btn btn-primary" data-sheet="send">${sheetBusy ? `<span class="spin"></span>` : ic("i-arrow-ur")}Send my code</button>
        ${sheetError ? `<p class="sheet-err">${sheetError}</p>` : ""}
        <button class="sheet-back" data-sheet="welcome">${ic("i-chev-left")}Back</button>
      </div>`;
  }
  if(sheetMode === "code"){
    return `
      <div class="sheet" id="sheet">
        <div class="sheet-grip"></div>
        <h2>Check your inbox</h2>
        <p>We sent a six-digit code to <strong>${pendingEmail}</strong>.</p>
        <input class="field code" id="codeField" type="text" inputmode="numeric" autocomplete="one-time-code"
               maxlength="6" placeholder="000000">
        <button class="btn btn-primary" data-sheet="verify">${sheetBusy ? `<span class="spin"></span>` : ic("i-check")}Verify and continue</button>
        <button class="btn btn-quiet" data-sheet="send">${ic("i-clock")}Send another code</button>
        ${sheetError ? `<p class="sheet-err">${sheetError}</p>` : ""}
        <button class="sheet-back" data-sheet="email">${ic("i-chev-left")}Use a different email</button>
      </div>`;
  }
  if(sheetMode === "verify"){
    const c = court(state.checkedInCourt || HOME_COURT);
    return `
      <div class="sheet" id="sheet">
        <div class="sheet-grip"></div>
        <h2>Verify this round</h2>
        <p>Week 1 pays out on Level 2 evidence: a court host confirms the result on site.</p>
        <div class="vlist">
          ${LEVELS.map(l=>{
            const state_ = l.n === 1 ? "done" : l.n === 2 ? "active" : "off";
            const tag = l.n === 1 ? "Done at check-in" : l.n === 2 ? "Needed now" : "Not in V1";
            return `<div class="vrow ${state_}">
              <span class="vdot">${ic(l.n===3 ? "i-lock-fill" : l.n===1 ? "i-check" : "i-person-fill")}</span>
              <span><strong>Level ${l.n} · ${l.title}</strong><span>${l.copy}</span></span>
              <span class="pill ${l.n===1?"green":l.n===2?"red":""}">${tag}</span>
            </div>`;
          }).join("")}
        </div>
        <button class="btn btn-primary" data-sheet="host-confirm">${sheetBusy ? `<span class="spin"></span>` : ic("i-seal-check")}Court host confirms 7 of 10</button>
        <p class="sheet-note">${c.name} · host ID shown to staff only. No video is captured or uploaded.</p>
        <button class="sheet-back" data-sheet="close">${ic("i-chev-left")}Not yet</button>
      </div>`;
  }
  if(sheetMode === "link"){
    return `
      <div class="sheet" id="sheet">
        <div class="sheet-grip"></div>
        <h2>Keep your progress</h2>
        <p>Add an email to turn this guest account into a permanent one. Nothing you've earned is lost.</p>
        <input class="field" id="emailField" type="email" inputmode="email" autocomplete="email"
               placeholder="you@example.com" value="${pendingEmail}">
        <button class="btn btn-primary" data-sheet="link">${sheetBusy ? `<span class="spin"></span>` : ic("i-sparkle")}Save my account</button>
        ${sheetError ? `<p class="sheet-err">${sheetError}</p>` : ""}
        <button class="sheet-back" data-sheet="close">${ic("i-chev-left")}Not now</button>
      </div>`;
  }
  return `
    <div class="sheet" id="sheet">
      <div class="sheet-grip"></div>
      <img class="sheet-mark" src="assets/mark-run-detroit.svg" alt="" width="58" height="58">
      <h2>Welcome to Run Detroit</h2>
      <p>Your courts, your points, your streak — saved to your account and waiting next time.</p>
      <button class="btn btn-primary" data-sheet="guest">${sheetBusy ? `<span class="spin"></span>` : ic("i-bolt-fill")}Start playing</button>
      <div class="or">or</div>
      <button class="btn btn-quiet" data-sheet="email">${ic("i-person")}Continue with email</button>
      ${sheetError ? `<p class="sheet-err">${sheetError}</p>` : ""}
      <p class="sheet-note">Starting creates a private guest account. Add an email any time from the You tab.</p>
    </div>`;
}

function renderSheet(){
  sheetHost.innerHTML = `<div class="sheet-scrim" data-sheet="scrim"></div>${sheetHTML()}`;
  const f = sheetHost.querySelector("#emailField") || sheetHost.querySelector("#codeField");
  if(f) setTimeout(() => f.focus(), 340);
}
function openSheet(mode = "welcome"){
  sheetMode = mode; sheetError = ""; sheetBusy = false;
  sheetHost.classList.add("open");
  sheetHost.setAttribute("aria-hidden","false");
  renderSheet();
}
function closeSheet(){
  const el = sheetHost.querySelector(".sheet");
  if(el) el.classList.add("out");
  setTimeout(() => {
    sheetHost.classList.remove("open");
    sheetHost.setAttribute("aria-hidden","true");
    sheetHost.innerHTML = "";
  }, 280);
}
function sheetFail(e){
  sheetBusy = false;
  const m = String(e?.message || e || "Something went wrong.");
  sheetError = /rate|limit|seconds|60/i.test(m)
    ? "Too many codes for now. Wait a minute, or start as a guest instead."
    : /offline|fetch|network/i.test(m)
    ? "Can't reach the server. You can keep playing offline."
    : m;
  renderSheet();
}

async function adoptUser(user, { greet = true } = {}){
  account = user;
  const remote = await RD.loadState().catch(() => null);
  if(remote){
    state = Object.assign({}, state, remote, { route: state.route });
    try{ localStorage.setItem("run-detroit-v3", JSON.stringify(state)); }catch(e){}
  } else {
    await RD.saveState(state).catch(() => {});
  }
  paint();
  if(greet) toast(isGuest() ? "Guest account ready" : `Signed in as ${account.email}`, "i-check");
}

sheetHost.addEventListener("click", async (e) => {
  const act = e.target.closest("[data-sheet]")?.dataset.sheet;
  if(!act || sheetBusy) return;
  haptic(8);

  if(act === "scrim" || act === "close"){ closeSheet(); return; }
  if(act === "welcome" || act === "email" || act === "link"){
    if(act !== "welcome"){
      const f = sheetHost.querySelector("#emailField");
      if(f) pendingEmail = f.value.trim();
    }
    sheetMode = act; sheetError = ""; renderSheet(); return;
  }

  if(act === "host-confirm"){
    sheetBusy = true; renderSheet();
    setTimeout(() => {
      closeSheet();
      if(!state.submitted){
        state.submitted = true; state.streak = 3; state.weeksActive = 3;
        award(150);
        RD?.logEvent(state.checkedInCourt || HOME_COURT, 150, "challenge");
      }
      go("result");
    }, 850);
    return;
  }
  if(act === "guest"){
    sheetBusy = true; renderSheet();
    try{
      const u = await RD.signInGuest();
      closeSheet();
      await adoptUser(u);
    }catch(err){ sheetFail(err); }
    return;
  }

  if(act === "send"){
    const f = sheetHost.querySelector("#emailField");
    if(f) pendingEmail = f.value.trim();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(pendingEmail)){
      sheetError = "That email doesn't look right."; renderSheet(); return;
    }
    sheetBusy = true; sheetError = ""; renderSheet();
    try{
      await RD.sendCode(pendingEmail);
      sheetBusy = false; sheetMode = "code"; renderSheet();
    }catch(err){ sheetFail(err); }
    return;
  }

  if(act === "verify"){
    const f = sheetHost.querySelector("#codeField");
    const code = (f?.value || "").replace(/\D/g,"");
    if(code.length < 6){ sheetError = "Enter all six digits."; renderSheet(); return; }
    sheetBusy = true; sheetError = ""; renderSheet();
    try{
      const u = await RD.verifyCode(pendingEmail, code);
      closeSheet();
      await adoptUser(u);
    }catch(err){ sheetFail(err); }
    return;
  }

  if(act === "link"){
    const f = sheetHost.querySelector("#emailField");
    if(f) pendingEmail = f.value.trim();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(pendingEmail)){
      sheetError = "That email doesn't look right."; renderSheet(); return;
    }
    sheetBusy = true; sheetError = ""; renderSheet();
    try{
      await RD.linkEmail(pendingEmail);
      closeSheet();
      toast("Check your inbox to confirm", "i-check");
    }catch(err){ sheetFail(err); }
    return;
  }
});

/* ---------- Reset ----------
   Reachable without navigating: long-press the points chip, press R,
   or load the page with ?reset — so a demo can restart mid-pitch. */
function resetDemo(quiet){
  try{ localStorage.removeItem("run-detroit-v3"); }catch(e){}
  state = Object.assign({}, DEFAULTS);
  stack = []; selectedCourt = HOME_COURT;
  shooting = false;
  if(sheetHost.classList.contains("open")) closeSheet();
  if(overlay.classList.contains("open")) closeScanner();
  if(account) RD?.saveState(state).catch(()=>{});
  paint();
  if(!quiet){ haptic([12,40,12]); toast("Demo reset", "i-clock"); }
}

/* ---------- Scanner ---------- */
function openScanner(){
  const c = court(selectedCourt);
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden","false");
  overlay.innerHTML = `
    <div class="scanner">
      <button class="scan-close" id="scanClose" type="button" aria-label="Cancel">${ic("i-x")}</button>
      <div class="scan-frame">
        <span class="corner c1"></span><span class="corner c2"></span>
        <span class="corner c3"></span><span class="corner c4"></span>
        <span class="qr">${ic("i-qr")}</span>
        <span class="scan-line"></span>
      </div>
      <h2>Hold steady</h2>
      <p>Point at the rotating code posted at ${c.name}, ${whereOf(c)}.</p>
      <div class="scan-progress"><i id="scanBar"></i></div>
      <span class="scan-lock">${ic("i-lock")}Location checked once, then discarded</span>
    </div>`;
  document.getElementById("scanClose").onclick = closeScanner;

  const bar = document.getElementById("scanBar");
  let p = 0;
  const iv = setInterval(() => {
    p += 6 + Math.random()*9;
    bar.style.width = Math.min(100,p) + "%";
    if(p >= 100){
      clearInterval(iv); haptic([10,40,18]);
      setTimeout(() => {
        closeScanner();
        state.checkedIn = true; state.checkedInCourt = selectedCourt;
        state.courtsVisited = [...new Set([...(state.courtsVisited||[]), selectedCourt])];
        save();
        RD?.logEvent(selectedCourt, 0, "check_in");
        go("checkin");
        toast(`Checked in at ${c.name}`);
      }, 260);
    }
  }, reduced ? 40 : 150);
  overlay.dataset.iv = iv;
}
function closeScanner(){
  clearInterval(Number(overlay.dataset.iv));
  overlay.classList.remove("open");
  overlay.setAttribute("aria-hidden","true");
  overlay.innerHTML = "";
}

/* ---------- Shot sequence ---------- */
let shooting = false;
async function runShots(){
  if(shooting) return;
  shooting = true;

  const btn = document.getElementById("chalBtn");
  const ball = document.getElementById("ball");
  const swish = document.getElementById("swish");
  const ringNum = document.getElementById("ringNum");
  const prog = view.querySelector(".ring .prog");
  const dots = [...view.querySelectorAll(".shot")];
  const title = document.getElementById("chalTitle");
  const copy = document.getElementById("chalCopy");
  const C = 2*Math.PI*68;

  btn.disabled = true;
  btn.innerHTML = `${ic("i-basketball-fill")}Shooting…`;
  title.textContent = "Round in progress";
  copy.textContent = "Ten attempts, logged as they land.";

  let made = 0;
  for(let i=0;i<SHOT_SCRIPT.length;i++){
    const hit = !!SHOT_SCRIPT[i];
    ball.className = "ball"; void ball.offsetWidth;
    ball.classList.add(hit ? "shoot-make" : "shoot-miss");
    await sleep(hit ? 420 : 470);
    if(hit){
      made++;
      swish.classList.remove("on"); void swish.offsetWidth; swish.classList.add("on");
      ringNum.textContent = made;
      prog.style.strokeDashoffset = (C*(1-made/10)).toFixed(1);
      haptic(9);
    }
    dots[i].classList.add(hit ? "make" : "miss", "pop");
    await sleep(160);
  }

  ball.className = "ball";
  const c = court(state.checkedInCourt || HOME_COURT);
  title.textContent = "7 of 10 — you passed";
  copy.textContent = "Result captured. A court host confirms it before any points are awarded.";
  btn.disabled = false;
  btn.dataset.action = "verify";
  btn.innerHTML = `${ic("i-seal-check")}Get it verified`;
  state.shotsFired = true; save();
  haptic([12,40,12]);
  toast("7 of 10 made — goal cleared");
  shooting = false;
}

/* ==========================================================
   Events
   ========================================================== */
screen.addEventListener("click", async (e) => {
  const tab = e.target.closest(".tabbar [data-tab]");
  if(tab){
    haptic(8);
    const t = tab.dataset.tab;
    if(t === "play") go(state.submitted ? "result" : state.checkedIn ? "challenge" : "courts");
    else go(t, {replace:true});
    return;
  }

  const goEl = e.target.closest("[data-go]");
  if(goEl){ haptic(8); go(goEl.dataset.go); return; }

  const courtEl = e.target.closest("[data-court]");
  if(courtEl){ haptic(8); selectedCourt = courtEl.dataset.court; go("court"); return; }

  const act = e.target.closest("[data-action]")?.dataset.action;
  if(!act) return;

  if(act === "scan"){ haptic(10); openScanner(); return; }
  if(act === "go-challenge"){ go("challenge"); return; }
  if(act === "shoot"){ runShots(); return; }
  if(act === "verify"){
    if(state.submitted){ go("result"); return; }
    pendingEmail = ""; openSheet("verify");
    return;
  }
  if(act.startsWith("stop-")){
    const i = Number(act.split("-")[1]);
    if(!state.stops[i]){
      state.stops[i] = true;
      award(100, "Stop verified · +100 points");
      RD?.logEvent("313:" + i, 100, "city_stop");
      if(state.stops.every(Boolean)) setTimeout(() => { award(200, "All three stops · +200 bonus"); confetti(); }, 900);
    }
    paint();
    return;
  }
  if(act === "mapstyle"){
    haptic(8);
    mapStyle = mapStyle === "satellite" ? "canvas" : "satellite";
    applyMapStyle();
    return;
  }
  if(act === "week-locked"){
    haptic(8);
    toast("Unlocks in its scheduled week", "i-clock");
    return;
  }
  if(act === "arcade"){
    haptic(10);
    toast("Pistons Arcade is an existing app surface", "i-gamepad-fill");
    return;
  }
  if(act === "sign-in"){ openSheet("welcome"); return; }
  if(act === "link-email"){ pendingEmail = ""; openSheet("link"); return; }
  if(act === "sign-out"){
    await RD.signOut().catch(()=>{});
    account = null;
    state = Object.assign({}, DEFAULTS, { route:"profile" });
    try{ localStorage.removeItem("run-detroit-v3"); }catch(e){}
    paint(); toast("Signed out", "i-lock");
    return;
  }
  if(act === "badge"){ haptic(10); return; }
  if(act === "reset"){ resetDemo(); return; }
});

backBtn.addEventListener("click", () => { haptic(8); back(); });
let holdTimer = 0, heldFired = false, holdX = 0, holdY = 0;
chip.addEventListener("pointerdown", (e) => {
  heldFired = false; holdX = e.clientX; holdY = e.clientY;
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => { heldFired = true; resetDemo(); }, 600);
});
chip.addEventListener("pointermove", (e) => {
  if(Math.hypot(e.clientX - holdX, e.clientY - holdY) > 10) clearTimeout(holdTimer);
});
["pointerup","pointercancel","pointerleave"].forEach(ev =>
  chip.addEventListener(ev, () => clearTimeout(holdTimer)));
chip.addEventListener("click", (e) => {
  if(heldFired){ heldFired = false; e.preventDefault(); return; }
  go("rewards", {replace:true});
});
scroller.addEventListener("scroll", () => {
  navbar.classList.toggle("scrolled", scroller.scrollTop > 16);
}, {passive:true});
document.addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable;
  if(e.key === "Escape"){
    if(sheetHost.classList.contains("open")) closeSheet();
    else if(overlay.classList.contains("open")) closeScanner();
    else back();
    return;
  }
  if(!typing && (e.key === "r" || e.key === "R") && !e.metaKey && !e.ctrlKey && !e.altKey){
    e.preventDefault(); resetDemo();
  }
});

/* ---------- Boot ---------- */
sizeFx();
const PRESENTER_RESET = /(^|[?&#])reset\b/.test(location.search + location.hash);
if(PRESENTER_RESET){
  try{ localStorage.removeItem("run-detroit-v3"); }catch(e){}
  state = Object.assign({}, DEFAULTS);
}
state.route = "fanzone";
paint();

(async () => {
  if(!window.RD?.enabled) return;
  try{
    const user = await RD.currentUser();
    if(user && PRESENTER_RESET){
      account = user;
      await RD.saveState(state).catch(() => {});
      paint();
    }
    else if(user) await adoptUser(user, { greet:false });
    else setTimeout(() => openSheet("welcome"), 650);
  }catch(e){
    console.warn("auth boot", e);
  }
})();

})();
