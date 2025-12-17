const API_URL = 'https://script.google.com/macros/s/AKfycbw8Lgr5wFFoqHsTssL4WCpKuw8LI76M4dVs-Ns8LQBywjxo4i2a_pod5Y2hxJbML_Pj/exec';

const STORE_SECRETS = {
  'CL-001': 'HV-SECRET-2025',
  'CL-002': 'BR-SECRET-2025'
};

function getStoreFromQuery(){
  const m = /[?&]store=([^&]+)/i.exec(location.search);
  return m ? decodeURIComponent(m[1]) : null;
}
const STORE_ID = getStoreFromQuery();
const STORE_SECRET = STORE_ID ? (STORE_SECRETS[STORE_ID] || '') : '';

function $(id){ return document.getElementById(id); }

function toast(title, body){
  $('mTitle').innerText = title || 'Note';
  $('mBody').innerText  = body || '';
  $('modal').classList.remove('hidden');
}
function closeModal(){ $('modal').classList.add('hidden'); }

function deviceId(){
  let v = localStorage.getItem('cl_device_id');
  if(!v){
    v = 'TAB-' + Math.random().toString(36).slice(2,10).toUpperCase();
    localStorage.setItem('cl_device_id', v);
  }
  return v;
}

async function apiGet(params){
  const url = API_URL + '?' + new URLSearchParams(params).toString();
  const res = await fetch(url, { method:'GET' });
  const text = await res.text();
  if(!res.ok) throw new Error(`API HTTP ${res.status}: ${text.slice(0,160)}`);
  return JSON.parse(text);
}

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

let CFG = null;
let wheelRotation = 0;
let spinning = false;

const IMG_CACHE = new Map();
function loadImage(url){
  return new Promise((resolve)=>{
    if(!url) return resolve(null);
    if(IMG_CACHE.has(url)) return resolve(IMG_CACHE.get(url));
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = ()=>{ IMG_CACHE.set(url, img); resolve(img); };
    img.onerror = ()=> resolve(null);
    img.src = url;
  });
}

document.addEventListener('DOMContentLoaded', async ()=>{
  try{
    if(!STORE_ID){
      toast('Missing store', 'Your link must include ?store=CL-001');
      return;
    }
    if(!STORE_SECRET){
      toast('Missing StoreSecret', `No secret found for ${STORE_ID}. Add it in app.js (STORE_SECRETS).`);
      return;
    }
    if(!API_URL.includes('/exec')){
      toast('Bad API_URL', 'API_URL must be your Apps Script /exec URL.');
      return;
    }

    CFG = await apiGet({
      action:'getconfig',
      storeId: STORE_ID,
      storeSecret: STORE_SECRET,
      deviceId: deviceId()
    });

    if(!CFG.ok){
      toast('Config error', JSON.stringify(CFG));
      return;
    }

    $('storeName').innerText = CFG.store.name;
    $('storeTarget').innerText = `Target: R${CFG.store.qualifyAmount}`;

    await drawWheel(CFG.prizes);
    wireValidation();

  }catch(e){
    toast('Setup error', e.message);
  }
});

function wireValidation(){
  const ids = ['wName','wSurname','wEmail','wPhone','wReceipt','wAmount','wPin','wPopia','wMarketing'];
  ids.forEach(id=>{
    const el = $(id);
    el.addEventListener(el.type==='checkbox' ? 'change' : 'input', ()=>{
      $('spinBtn').disabled = !isEligible();
    });
  });
}

function isEligible(){
  if(!CFG) return false;

  const q = Number(CFG.store.qualifyAmount || 0);
  const amount = Number($('wAmount').value || 0);

  if(amount < q){
    $('wheelMsg').textContent = `Basket below target (R${q}).`;
    return false;
  }

  for(const id of ['wName','wSurname','wEmail','wPhone','wReceipt','wAmount','wPin']){
    if(!$(id).value.trim()){
      $('wheelMsg').textContent = 'Please complete all fields.';
      return false;
    }
  }

  if(!$('wPopia').checked || !$('wMarketing').checked){
    $('wheelMsg').textContent = 'POPIA + marketing consent required.';
    return false;
  }

  $('wheelMsg').textContent = '';
  return true;
}

async function drawWheel(prizes){
  const svg = $('wheelSvg');
  svg.innerHTML = '';

  const wedges = prizes.slice(0, 10);

  const cx=200, cy=200, r=190;
  const n=wedges.length;
  const angleStep=(Math.PI*2)/n;

  const defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
  svg.appendChild(defs);

  const imgs = await Promise.all(wedges.map(w => loadImage(w.imageUrl)));

  for(let i=0;i<n;i++){
    const start = -Math.PI/2 + i*angleStep;
    const end   = start + angleStep;

    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d', wedgePath(cx,cy,r,start,end));
    path.setAttribute('fill', i%2===0 ? '#fff' : '#ffe1c5');
    path.setAttribute('stroke', '#ffffff');
    path.setAttribute('stroke-width', '4');
    svg.appendChild(path);

    const clipId = `clip${i}`;
    const clip = document.createElementNS('http://www.w3.org/2000/svg','clipPath');
    clip.setAttribute('id', clipId);
    const clipPath = document.createElementNS('http://www.w3.org/2000/svg','path');
    clipPath.setAttribute('d', wedgePath(cx,cy,r,start,end));
    clip.appendChild(clipPath);
    defs.appendChild(clip);

    if(imgs[i] && wedges[i].imageUrl){
      const image = document.createElementNS('http://www.w3.org/2000/svg','image');
      image.setAttributeNS(null,'href', wedges[i].imageUrl);
      image.setAttribute('x', 110);
      image.setAttribute('y', 40);
      image.setAttribute('width', 180);
      image.setAttribute('height', 180);
      image.setAttribute('clip-path', `url(#${clipId})`);
      image.setAttribute('opacity', '0.95');
      svg.appendChild(image);
    }

    const mid = (start+end)/2;
    const tx = cx + Math.cos(mid)*130;
    const ty = cy + Math.sin(mid)*130;

    const text = document.createElementNS('http://www.w3.org/2000/svg','text');
    text.setAttribute('x', tx);
    text.setAttribute('y', ty);
    text.setAttribute('text-anchor','middle');
    text.setAttribute('dominant-baseline','middle');
    text.setAttribute('font-size','18');
    text.setAttribute('font-weight','900');
    text.setAttribute('fill','#111');

    const rot = (mid * 180/Math.PI) + 90;
    text.setAttribute('transform', `rotate(${rot} ${tx} ${ty})`);
    text.textContent = shorten(wedges[i].name, 16);
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

async function spin(){
  if(spinning) return;

  if(!isEligible()){
    toast('Not ready', 'Complete all fields + meet the target amount.');
    return;
  }

  spinning = true;

  const btn = $('spinBtn');
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = 'SPINNING…';

  const turns = 5 + Math.random()*2;
  wheelRotation += turns*360 + Math.random()*360;
  $('wheelSvg').style.transform = `rotate(${wheelRotation}deg)`;

  const apiPromise = apiGet({
    action:'spin',
    storeId: STORE_ID,
    storeSecret: STORE_SECRET,
    deviceId: deviceId(),

    name: $('wName').value.trim(),
    surname: $('wSurname').value.trim(),
    email: $('wEmail').value.trim(),
    phone: $('wPhone').value.trim(),
    receiptNumber: $('wReceipt').value.trim(),
    basketAmount: Number($('wAmount').value||0),

    popia: $('wPopia').checked ? 'true' : 'false',
    marketing: $('wMarketing').checked ? 'true' : 'false',

    cashierPin: $('wPin').value.trim()
  }).catch(err => ({ ok:false, error:'network', detail: err.message }));

  const [res] = await Promise.all([apiPromise, sleep(4200)]);

  if(res && res.ok === false && res.error === 'network'){
    toast('Network issue', res.detail || 'Could not reach server.');
  } else {
    showResult(res);
  }

  btn.textContent = originalText;
  spinning = false;
  btn.disabled = !isEligible();
}

function showResult(res){
  if(!res || !res.ok){
    const map = {
      bad_secret: 'This wheel is not authorised for this store.',
      bad_pin: 'Oops! Cashier PIN is incorrect.',
      consent_required: 'You must accept POPIA and marketing consent.',
      missing_fields: 'All details are required to spin.',
      rate_limit: 'Too many tries. Please wait a moment.',
      store_not_found: 'This store is not active.'
    };
    toast('Something went wrong 😕', map[res?.error] || (res?.error || 'Please try again.'));
    return;
  }

  if(res.result === 'Win'){
    toast(
      '🍗 SOUL GOOD! YOU WON!',
      `Nice one! 🎉

You won:
${res.prizeName}

Your unique prize code:
${res.prizeCode}

📧 We emailed this code to you.
📄 Keep your receipt.
👉 Show both at the counter to claim.

Thanks for choosing Chicken Licken!`
    );
    return;
  }

  if(res.result === 'GrandEntry'){
    toast(
      '🔥 YOU’RE IN THE DRAW!',
      `Well played! 👏

You’ve been entered into:
${res.prizeName}

Your entry confirmation code:
${res.prizeCode}

📧 We emailed this as proof.
📄 Keep your receipt safe.
📦 Drop your receipt in the in-store draw box.

More chicken = more chances. 🍗🔥`
    );
    return;
  }

  const q = Number(CFG?.store?.qualifyAmount || 0);
  toast(
    '😅 NOT THIS TIME…',
    `Ahhh, so close!

No prize on this spin.
But don’t stress – the wheel is always hungry 🍗

💡 Tip:
Spend at least R${q} again,
and you’ll qualify for another spin.

More chicken = more chances.
Come back soon and try again! 🔥`
  );
}
