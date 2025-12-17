/*****************************************************
 * Chicken Licken Soul Spin - Frontend (GitHub Pages)
 *
 * KEY IDEAS:
 * 1) We use JSONP to call Apps Script so CORS never breaks.
 * 2) Each store has its own URL: ?store=CL-001
 * 3) Each tablet/device can be fixed using: &device=TAB-A9-HIGHVELD-01
 * 4) The wheel spins by rotating a DIV wrapper (#wheelRotator)
 *****************************************************/

/** ====== IMPORTANT: PASTE YOUR APPS SCRIPT /exec URL HERE ======
 * Example:
 * const API_URL = 'https://script.google.com/macros/s/XXXXXXX/exec';
 */
const API_URL = 'https://script.google.com/macros/s/AKfycbw8Lgr5wFFoqHsTssL4WCpKuw8LI76M4dVs-Ns8LQBywjxo4i2a_pod5Y2hxJbML_Pj/exec';

/** Store secrets (must match your Google Sheet Stores tab StoreSecret column)
 * Add more stores here.
 */
const STORE_SECRETS = {
  'CL-001': 'HV-SECRET-2025',
  // 'CL-002': 'BR-SECRET-2025',
};

function $(id){ return document.getElementById(id); }

/** Read store from URL: ?store=CL-001 */
function getStoreFromQuery(){
  const m = /[?&]store=([^&]+)/i.exec(location.search);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Read device from URL: ?device=TAB-A9-HIGHVELD-01 */
function getDeviceFromQuery(){
  const m = /[?&]device=([^&]+)/i.exec(location.search);
  return m ? decodeURIComponent(m[1]) : null;
}

const STORE_ID = getStoreFromQuery();
const STORE_SECRET = STORE_ID ? (STORE_SECRETS[STORE_ID] || '') : '';

/** Modal helper */
function toast(title, body){
  $('mTitle').innerText = title || 'Note';
  $('mBody').innerText  = body || '';
  $('modal').classList.remove('hidden');
}
function closeModal(){ $('modal').classList.add('hidden'); }

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

/** ====== DEVICE ID BINDING (IMPORTANT) ======
 * We want to ALWAYS know which tablet is used.
 * Strategy:
 * - If URL contains &device=..., we store it in localStorage (locked).
 * - If not, we use previously stored value.
 * - If neither exists, we generate one and store it.
 *
 * To set each store tablet properly:
 * - Open the kiosk URL ON THAT TABLET with &device=... once.
 *   Example:
 *   https://yourgithubpage/?store=CL-001&device=TAB-A9-HIGHVELD-01
 */
function getOrSetDeviceId(){
  const fromUrl = getDeviceFromQuery();
  if(fromUrl){
    localStorage.setItem('cl_device_id', fromUrl);
    return fromUrl;
  }

  let v = localStorage.getItem('cl_device_id');
  if(!v){
    v = 'TAB-' + Math.random().toString(36).slice(2,10).toUpperCase();
    localStorage.setItem('cl_device_id', v);
  }
  return v;
}

const DEVICE_ID = getOrSetDeviceId();

/** Show device id on both screens */
function showDeviceBadges(){
  if($('deviceBadgeStart')) $('deviceBadgeStart').innerText = `Device: ${DEVICE_ID}`;
  if($('deviceBadgePlay')) $('deviceBadgePlay').innerText = `Device: ${DEVICE_ID}`;
}

/** ====== JSONP CALL (CORS FIX) ======
 * GitHub Pages -> Apps Script fetch() often fails due to CORS.
 * JSONP avoids CORS by injecting a <script src="...">.
 */
function apiJSONP(params){
  return new Promise((resolve) => {
    const cbName = `cb_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const qs = new URLSearchParams({ ...params, callback: cbName }).toString();
    const url = `${API_URL}?${qs}`;

    window[cbName] = (data) => {
      try { resolve(data); } finally {
        delete window[cbName];
        script.remove();
      }
    };

    const script = document.createElement('script');
    script.src = url;
    script.onerror = () => {
      delete window[cbName];
      script.remove();
      resolve({ ok:false, error:'network', detail:'Failed to reach API. Check API_URL (/exec) and deployment access.' });
    };
    document.body.appendChild(script);
  });
}

/** ====== State ====== */
let CFG = null;
let wheelRotation = 0;
let spinning = false;

document.addEventListener('DOMContentLoaded', async ()=>{
  showDeviceBadges();

  // Navigation buttons
  $('btnEnter').addEventListener('click', () => showPlay());
  $('btnBack').addEventListener('click', () => showStart());

  try{
    // Basic configuration checks
    if(!STORE_ID){
      toast('Missing store', 'Your link must include ?store=CL-001 (must match Stores.StoreID exactly).');
      return;
    }
    if(!STORE_SECRET){
      toast('Missing StoreSecret', `No secret found in STORE_SECRETS for ${STORE_ID}. Add it in app.js.`);
      return;
    }
    if(!API_URL.includes('/exec')){
      toast('Bad API_URL', 'API_URL must be your Apps Script /exec URL.');
      return;
    }

    // Load store config + prizes from backend
    CFG = await apiJSONP({
      action:'getconfig',
      storeId: STORE_ID,
      storeSecret: STORE_SECRET,
      deviceId: DEVICE_ID
    });

    if(!CFG.ok){
      toast('Setup error', CFG.detail || JSON.stringify(CFG));
      return;
    }

    // Update UI labels
    $('storeName').innerText = CFG.store.name;
    $('storeTarget').innerText = `Target: R${CFG.store.qualifyAmount}`;
    $('startStoreLine').innerText = `${CFG.store.name} • Target: R${CFG.store.qualifyAmount}`;

    // Draw the wheel (shows BEFORE the user spins)
    drawWheel(CFG.prizes);

    // Enable/disable spin button based on form
    wireValidation();

  }catch(e){
    toast('Setup error', e.message);
  }
});

function showStart(){
  $('screenPlay').classList.add('hidden');
  $('screenStart').classList.remove('hidden');
}
function showPlay(){
  $('screenStart').classList.add('hidden');
  $('screenPlay').classList.remove('hidden');
}

/** ====== Form validation ======
 * This controls whether the SPIN button is enabled.
 * Change messages here if you want different wording.
 */
function wireValidation(){
  const ids = ['wName','wSurname','wEmail','wPhone','wReceipt','wAmount','wPin','wPopia','wMarketing'];
  ids.forEach(id=>{
    const el = $(id);
    el.addEventListener(el.type==='checkbox' ? 'change' : 'input', updateSpinEnabled);
  });

  updateSpinEnabled();
}

function updateSpinEnabled(){
  const ok = isEligible();

  // We only use the center wheel button (requested).
  $('wheelSpinBtn').disabled = !ok;

  // Keep this in sync (even though it is hidden by default)
  $('spinBtn').disabled = !ok;
}

function isEligible(){
  if(!CFG) return false;

  const q = Number(CFG.store.qualifyAmount || 0);
  const amount = Number($('wAmount').value || 0);

  // Must meet target
  if(amount < q){
    $('wheelMsg').textContent = `Spend at least R${q} to qualify.`;
    return false;
  }

  // Required fields
  for(const id of ['wName','wSurname','wEmail','wPhone','wReceipt','wAmount','wPin']){
    if(!$(id).value.trim()){
      $('wheelMsg').textContent = 'Complete all fields to unlock spin.';
      return false;
    }
  }

  // Consent required (not optional)
  if(!$('wPopia').checked || !$('wMarketing').checked){
    $('wheelMsg').textContent = 'POPIA + marketing consent is required.';
    return false;
  }

  $('wheelMsg').textContent = '';
  return true;
}

/** ====== Wheel drawing ======
 * - Always uses the first 10 prizes returned from the backend.
 * - Alternates wedge fill: logo pattern vs plain
 *
 * If you want to change how wedges look:
 * - adjust pattern opacity, or wedge colors below.
 * - you can also swap in your prize images via Google Sheet column ImageURL.
 */
function drawWheel(prizes){
  const svg = $('wheelSvg');
  svg.innerHTML = '';

  const wedges = prizes.slice(0, 10);
  const cx=200, cy=200, r=190;
  const n=wedges.length;
  const angleStep=(Math.PI*2)/n;

  // SVG defs for logo pattern
  const defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
  svg.appendChild(defs);

  const pattern = document.createElementNS('http://www.w3.org/2000/svg','pattern');
  pattern.setAttribute('id','clLogoPattern');
  pattern.setAttribute('patternUnits','userSpaceOnUse');
  pattern.setAttribute('width','78');
  pattern.setAttribute('height','78');

  const pImg = document.createElementNS('http://www.w3.org/2000/svg','image');
  // CHANGE THIS IF YOUR LOGO FILE NAME CHANGES
  pImg.setAttributeNS(null,'href','img/cl-logo.jpg');
  pImg.setAttribute('x','0'); pImg.setAttribute('y','0');
  pImg.setAttribute('width','78'); pImg.setAttribute('height','78');
  pImg.setAttribute('opacity','0.20'); // CHANGE LOGO OVERLAY OPACITY HERE
  pattern.appendChild(pImg);
  defs.appendChild(pattern);

  for(let i=0;i<n;i++){
    const start = -Math.PI/2 + i*angleStep;
    const end   = start + angleStep;

    // Alternate wedge backgrounds (logo overlay vs plain)
    const fill = (i % 2 === 0) ? 'url(#clLogoPattern)' : '#fff';

    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d', wedgePath(cx,cy,r,start,end));
    path.setAttribute('fill', fill);
    path.setAttribute('stroke', '#ffffff');
    path.setAttribute('stroke-width', '4');
    svg.appendChild(path);

    // Text label (kept small so it doesn’t look ugly)
    const mid = (start+end)/2;
    const tx = cx + Math.cos(mid)*128;
    const ty = cy + Math.sin(mid)*128;

    const text = document.createElementNS('http://www.w3.org/2000/svg','text');
    text.setAttribute('x', tx);
    text.setAttribute('y', ty);
    text.setAttribute('text-anchor','middle');
    text.setAttribute('dominant-baseline','middle');
    text.setAttribute('font-size','13');     // CHANGE LABEL SIZE HERE
    text.setAttribute('font-weight','1000');
    text.setAttribute('fill','#111');

    const rot = (mid * 180/Math.PI) + 90;
    text.setAttribute('transform', `rotate(${rot} ${tx} ${ty})`);
    text.textContent = shorten(wedges[i].name, 12); // CHANGE TRUNCATION HERE
    svg.appendChild(text);
  }
}

function wedgePath(cx,cy,r,start,end){
  const x1 = cx + Math.cos(start)*r;
  const y1 = cy + Math.sin(start)*r;
  const x2 = cx + Math.cos(end)*r;
  const y2 = cy + Math.sin(end)*r;
  const largeArc = (end-start) > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}
function shorten(s,max){
  s=String(s||'');
  return s.length<=max ? s : (s.slice(0,max-1)+'…');
}

/** ====== Spin behavior ======
 * - Prevent spam clicks
 * - Spin animation happens instantly
 * - API save happens in background
 * - After animation, show result message
 */
async function spin(){
  if(spinning) return;

  if(!isEligible()){
    toast('Not ready', 'Complete all fields and meet the target amount.');
    return;
  }

  spinning = true;

  // Disable the center button while spinning
  $('wheelSpinBtn').disabled = true;

  // Start wheel animation instantly
  const turns = 5 + Math.random()*2;
  wheelRotation += turns*360 + Math.random()*360;

  const rotator = $('wheelRotator');
  rotator.style.transform = `rotate(${wheelRotation}deg)`;

  // Send to backend (writes to Google Sheet + sends emails)
  const apiPromise = apiJSONP({
    action:'spin',
    storeId: STORE_ID,
    storeSecret: STORE_SECRET,
    deviceId: DEVICE_ID,

    // Form fields
    name: $('wName').value.trim(),
    surname: $('wSurname').value.trim(),
    email: $('wEmail').value.trim(),
    phone: $('wPhone').value.trim(),
    receiptNumber: $('wReceipt').value.trim(),
    basketAmount: Number($('wAmount').value||0),

    // Required consents
    popia: $('wPopia').checked ? 'true' : 'false',
    marketing: $('wMarketing').checked ? 'true' : 'false',

    // Staff verification
    cashierPin: $('wPin').value.trim()
  });

  // Wait for both: API + animation duration
  const [res] = await Promise.all([apiPromise, sleep(4200)]);

  showResult(res);

  spinning = false;

  // Re-enable if still eligible (they might edit fields after)
  updateSpinEnabled();
}

function showResult(res){
  if(!res || !res.ok){
    const map = {
      bad_secret: 'This wheel is not authorised for this store.',
      bad_pin: 'Cashier PIN is incorrect.',
      consent_required: 'You must accept POPIA and marketing consent.',
      missing_fields: 'All details are required to spin.',
      rate_limit: 'Too many tries. Please wait a moment.',
      store_not_found: 'This store is not active.',
      network: 'Network/API not reachable. Check API_URL (/exec) and deployment access.'
    };
    toast('Something went wrong 😕', map[res?.error] || (res?.detail || res?.error || 'Please try again.'));
    return;
  }

  // You can change ALL messages below to be more “Chicken Licken funky”
  if(res.result === 'Win'){
    toast(
      '🍗 SOUL GOOD! YOU WON!',
      `You won: ${res.prizeName}

Prize code: ${res.prizeCode}

We emailed your code.
Keep your receipt and show both at the counter.`
    );
    return;
  }

  if(res.result === 'GrandEntry'){
    toast(
      '🔥 YOU’RE IN THE DRAW!',
      `You’ve been entered into: ${res.prizeName}

Entry code: ${res.prizeCode}

We emailed your code.
Keep your receipt and drop it in the draw box.`
    );
    return;
  }

  const q = Number(CFG?.store?.qualifyAmount || 0);
  toast(
    '😅 NOT THIS TIME…',
    `No prize on this spin.

Spend at least R${q} again to qualify for another spin.
More chicken = more chances. 🍗`
  );
}
