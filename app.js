/************** EDIT THESE **************/
const API_URL = "PASTE_YOUR_APPS_SCRIPT_EXEC_URL_HERE"; // must end with /exec

const STORE_SECRETS = {
  "CL-001": "HV-SECRET-2025"
};
/***************************************/

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function getParam(name){
  const m = new RegExp(`[?&]${name}=([^&]+)`, "i").exec(location.search);
  return m ? decodeURIComponent(m[1]) : null;
}
function sanitizePhone(raw){ return String(raw||"").replace(/\D+/g,""); }
function isValidPhone10(d){ return /^\d{10}$/.test(d); }
function isValidEmail(e){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e||"").trim()); }

function openModal(title, body){
  $("mTitle").innerText = title;
  $("mBody").innerText = body;
  $("modal").classList.remove("hidden");
}
function closeModal(){ $("modal").classList.add("hidden"); }

function setOnlineUI(on){
  const pill = $("onlinePill");
  const dot = pill.querySelector(".dot");
  $("onlineText").innerText = on ? "Online" : "Offline";
  dot.style.background = on ? "#34c759" : "#ff3b30";
  dot.style.boxShadow = on ? "0 0 0 4px rgba(52,199,89,.18)" : "0 0 0 4px rgba(255,59,48,.18)";
}

/* JSONP call */
function apiJSONP(params, timeoutMs=6500){
  return new Promise((resolve) => {
    const cbName = `cb_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const qs = new URLSearchParams({ ...params, callback: cbName }).toString();
    const url = `${API_URL}?${qs}`;

    let done = false;
    const timer = setTimeout(() => {
      if(done) return;
      done = true;
      cleanup();
      resolve({ ok:false, error:"timeout", detail:"API timeout" });
    }, timeoutMs);

    function cleanup(){
      clearTimeout(timer);
      try { delete window[cbName]; } catch(e){}
      try { script.remove(); } catch(e){}
    }

    window[cbName] = (data) => {
      if(done) return;
      done = true;
      cleanup();
      resolve(data);
    };

    const script = document.createElement("script");
    script.src = url;
    script.onerror = () => {
      if(done) return;
      done = true;
      cleanup();
      resolve({ ok:false, error:"network", detail:"Could not reach API" });
    };

    document.body.appendChild(script);
  });
}

/*
  URL format you will use on tablet:
  https://YOUR_GITHUB_USERNAME.github.io/soul-spin/?store=CL-001&device=TAB-A9-HIGHVELD-01
*/
const STORE_ID = getParam("store") || "";

/*
  Device ID behaviour:
  - If URL has &device=XXXX it saves it in localStorage
  - Next time device stays remembered
*/
const DEVICE_ID = (function(){
  const fromUrl = getParam("device");
  if(fromUrl){
    localStorage.setItem("cl_device_id", fromUrl);
    return fromUrl;
  }
  return localStorage.getItem("cl_device_id") || "UNKNOWN";
})();

let CFG = null;
let spinning = false;
let wheelRotation = 0;

document.addEventListener("DOMContentLoaded", async () => {
  $("deviceName").innerText = DEVICE_ID || "UNKNOWN";
  $("mOk").addEventListener("click", closeModal);
  $("centerSpin").addEventListener("click", spin);
  $("spinBtn").addEventListener("click", spin);

  drawWheelFallback();
  wireValidation();

  if(!STORE_ID){
    setOnlineUI(false);
    openModal("Missing store", "URL must include ?store=CL-001&device=TAB-A9-HIGHVELD-01");
    return;
  }

  const secret = STORE_SECRETS[STORE_ID];
  if(!secret){
    setOnlineUI(false);
    openModal("Missing secret", `No StoreSecret configured in app.js for ${STORE_ID}`);
    return;
  }

  if(!API_URL.includes("/exec")){
    setOnlineUI(false);
    openModal("Bad API URL", "API_URL must be your Apps Script /exec link.");
    return;
  }

  const res = await apiJSONP({
    action: "getconfig",
    storeId: STORE_ID,
    storeSecret: secret,
    deviceId: DEVICE_ID
  }, 6500);

  if(!res.ok){
    setOnlineUI(false);
    openModal("Setup blocked", `${res.error}\n${res.detail || ""}\n\nVersion: ${res._version || "unknown"}`);
    return;
  }

  CFG = res;
  setOnlineUI(true);

  $("storeName").innerText = CFG.store.name;
  $("minAmountLabel").innerText = `R${CFG.store.qualifyAmount}`;
  $("qualAmount").innerText = `R${CFG.store.qualifyAmount}+`;

  drawWheelFromConfig(CFG.prizes);
  validateAndUpdate();
});

function wireValidation(){
  const ids = ["wName","wSurname","wEmail","wPhone","wReceipt","wAmount","wPin","wPopia","wMarketing"];
  ids.forEach(id => {
    const el = $(id);
    el.addEventListener(el.type==="checkbox" ? "change" : "input", () => {
      if(id==="wPhone") el.value = sanitizePhone(el.value);
      validateAndUpdate();
    });
  });
}

function validateAndUpdate(){
  $("errEmail").innerText = "";
  $("errPhone").innerText = "";

  const name = $("wName").value.trim();
  const surname = $("wSurname").value.trim();
  const email = $("wEmail").value.trim();
  const phone = sanitizePhone($("wPhone").value);
  const receipt = $("wReceipt").value.trim();
  const amount = Number($("wAmount").value || 0);
  const pin = $("wPin").value.trim();
  const popia = $("wPopia").checked;
  const marketing = $("wMarketing").checked;

  if(!CFG){
    setStatus("Loading store rules…", false);
    $("spinBtn").disabled = true;
    $("centerSpin").disabled = true;
    return;
  }

  if(!name || !surname || !email || !phone || !receipt || !amount || !pin){
    setStatus("Complete all fields to spin", false);
    $("spinBtn").disabled = true;
    $("centerSpin").disabled = true;
    return;
  }

  if(!isValidEmail(email)){
    $("errEmail").innerText = "Enter a valid email.";
    setStatus("Fix email to continue", false);
    $("spinBtn").disabled = true;
    $("centerSpin").disabled = true;
    return;
  }

  if(!isValidPhone10(phone)){
    $("errPhone").innerText = "Phone must be exactly 10 digits.";
    setStatus("Fix phone to continue", false);
    $("spinBtn").disabled = true;
    $("centerSpin").disabled = true;
    return;
  }

  if(!popia || !marketing){
    setStatus("Consent required to spin", false);
    $("spinBtn").disabled = true;
    $("centerSpin").disabled = true;
    return;
  }

  if(amount < Number(CFG.store.qualifyAmount)){
    setStatus(`Not qualified. Min R${CFG.store.qualifyAmount}`, false);
    $("spinBtn").disabled = true;
    $("centerSpin").disabled = true;
    return;
  }

  setStatus("Ready to spin", true);
  $("spinBtn").disabled = false;
  $("centerSpin").disabled = false;
}

function setStatus(msg, ok){
  $("spinStatus").innerText = msg;
  $("statusRight").innerText = msg;
  $("statusRight").style.color = ok ? "#34c759" : "#ff6a00";
  $("wheelSub").innerText = ok ? "Tap SPIN to play" : "Fill in all details to unlock";
}

function drawWheelFallback(){
  const demo = [
    {name:"FREE CHIPS", imageUrl:""},
    {name:"TRY AGAIN", imageUrl:""},
    {name:"TRY AGAIN", imageUrl:""},
    {name:"FREE WINGS", imageUrl:""},
    {name:"TRY AGAIN", imageUrl:""},
    {name:"TRY AGAIN", imageUrl:""},
    {name:"TRY AGAIN", imageUrl:""},
    {name:"DRAW ENTRY", imageUrl:""},
    {name:"TRY AGAIN", imageUrl:""},
    {name:"GRAND DRAW", imageUrl:""}
  ];
  drawWheel(demo);
}

function drawWheelFromConfig(prizes){
  const wedges = (prizes||[]).slice(0,10).map(p => ({
    name: p.name || "TRY AGAIN",
    imageUrl: (p.imageUrl || "").trim()
  }));
  while(wedges.length < 10) wedges.push({name:"TRY AGAIN", imageUrl:""});
  drawWheel(wedges);
}

/*
  WEDGE IMAGES LATER:
  Put a public URL in Prizes.ImageURL (e.g. GitHub Pages image URL).
  It will render inside the wedge.
*/
function drawWheel(wedges){
  const svg = $("wheelSvg");
  svg.innerHTML = "";

  const n=10, cx=200, cy=200, r=190;
  const step=(Math.PI*2)/n;

  const fills = ["#ff6a00","#ffffff","#ff6a00","#ffffff","#ff6a00","#ffffff","#ff6a00","#ffffff","#e5392d","#cfcfcf"];

  for(let i=0;i<n;i++){
    const start = -Math.PI/2 + i*step;
    const end = start + step;

    const path = document.createElementNS("http://www.w3.org/2000/svg","path");
    path.setAttribute("d", wedgePath(cx,cy,r,start,end));
    path.setAttribute("fill", fills[i % fills.length]);
    path.setAttribute("stroke","#111");
    path.setAttribute("stroke-width","2");
    svg.appendChild(path);

    const label = (wedges[i]?.name || "TRY AGAIN");
    const imgUrl = (wedges[i]?.imageUrl || "").trim();
    const textColor = (fills[i]==="#ffffff" || fills[i]==="#cfcfcf") ? "#111" : "#fff";
    const mid=(start+end)/2;

    if(imgUrl){
      const ix = cx + Math.cos(mid)*118 - 28;
      const iy = cy + Math.sin(mid)*118 - 28;

      const img = document.createElementNS("http://www.w3.org/2000/svg","image");
      img.setAttributeNS("http://www.w3.org/1999/xlink","href", imgUrl);
      img.setAttribute("x", ix);
      img.setAttribute("y", iy);
      img.setAttribute("width", "56");
      img.setAttribute("height", "56");

      const rot=(mid*180/Math.PI)+90;
      img.setAttribute("transform", `rotate(${rot} ${ix+28} ${iy+28})`);
      svg.appendChild(img);
    }

    const tx=cx + Math.cos(mid)*125;
    const ty=cy + Math.sin(mid)*125;

    const text = document.createElementNS("http://www.w3.org/2000/svg","text");
    text.setAttribute("x",tx);
    text.setAttribute("y",ty);
    text.setAttribute("text-anchor","middle");
    text.setAttribute("dominant-baseline","middle");
    text.setAttribute("font-size","11");
    text.setAttribute("font-weight","1000");
    text.setAttribute("fill",textColor);

    const rot=(mid*180/Math.PI)+90;
    text.setAttribute("transform",`rotate(${rot} ${tx} ${ty})`);

    const words = String(label).split(" ");
    const line1 = words.slice(0,2).join(" ").toUpperCase();
    const line2 = words.slice(2).join(" ").toUpperCase();

    const t1 = document.createElementNS("http://www.w3.org/2000/svg","tspan");
    t1.setAttribute("x",tx);
    t1.textContent = line1;
    text.appendChild(t1);

    if(line2){
      const t2 = document.createElementNS("http://www.w3.org/2000/svg","tspan");
      t2.setAttribute("x",tx);
      t2.setAttribute("dy","12");
      t2.textContent = line2;
      text.appendChild(t2);
    }

    svg.appendChild(text);
  }

  const ring = document.createElementNS("http://www.w3.org/2000/svg","circle");
  ring.setAttribute("cx",cx); ring.setAttribute("cy",cy); ring.setAttribute("r","78");
  ring.setAttribute("fill","rgba(0,0,0,.25)");
  ring.setAttribute("stroke","rgba(255,255,255,.25)");
  ring.setAttribute("stroke-width","2");
  svg.appendChild(ring);
}

function wedgePath(cx,cy,r,start,end){
  const x1=cx+Math.cos(start)*r, y1=cy+Math.sin(start)*r;
  const x2=cx+Math.cos(end)*r, y2=cy+Math.sin(end)*r;
  const largeArc=(end-start)>Math.PI?1:0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

async function spin(){
  if(spinning) return;
  if($("spinBtn").disabled) return;

  spinning = true;
  $("spinBtn").disabled = true;
  $("centerSpin").disabled = true;

  // Instant spin (UI first)
  wheelRotation += (6*360) + Math.random()*360;
  $("wheelRotator").style.transform = `rotate(${wheelRotation}deg)`;

  const resPromise = apiJSONP({
    action: "spin",
    storeId: STORE_ID,
    storeSecret: STORE_SECRETS[STORE_ID],
    deviceId: DEVICE_ID,

    name: $("wName").value.trim(),
    surname: $("wSurname").value.trim(),
    email: $("wEmail").value.trim(),
    phone: sanitizePhone($("wPhone").value),
    receiptNumber: $("wReceipt").value.trim(),
    basketAmount: Number($("wAmount").value || 0),

    popia: $("wPopia").checked ? "true" : "false",
    marketing: $("wMarketing").checked ? "true" : "false",
    cashierPin: $("wPin").value.trim()
  }, 6500);

  const [res] = await Promise.all([resPromise, sleep(3900)]);

  if(!res.ok){
    setOnlineUI(false);
    openModal("Spin blocked", `${res.error}\n${res.detail || ""}\n\nVersion: ${res._version || "unknown"}`);
    spinning = false;
    validateAndUpdate();
    return;
  }

  setOnlineUI(true);

  if(res.result === "Win"){
    openModal("🍗 SOUL GOOD! YOU WON!",
      `Prize: ${res.prizeName}\n\nCode: ${res.prizeCode}\n\nWe emailed your code.\nKeep your receipt.`);
  } else if(res.result === "GrandEntry"){
    openModal("🔥 YOU’RE IN THE DRAW!",
      `Entry: ${res.prizeName}\n\nEntry Code: ${res.prizeCode}\n\nWe emailed your code.\nDrop your receipt in the draw box.`);
  } else {
    openModal("😅 NOT THIS TIME…",
      `No prize on this spin.\n\nSpend R${res.qualifyAmount}+ again to qualify.\nMore chicken = more chances. 🍗`);
  }

  spinning = false;
  validateAndUpdate();
}
