/* ============================================================
   Банк инициатив граждан — аналитика (полный app.js)
   ============================================================ */

let RAW = [];
let FILTERED = [];
const charts = {};
let MANUAL_EFFECTS = {};

const PALETTE = ['#1C2E4A','#52677D','#2E7D52','#B23A3A','#8A6D3B','#3B5A8A','#6B4C9A','#2A7F8A','#A85A3B','#4A6B3B'];

const ECON_BASE = {
  'инфраструктура':15000000,'экономика':25000000,'здравоохранение':12000000,
  'образование':8000000,'экология':10000000,'цифровизация':18000000,
  'социальное':6000000,'культура':5000000,'безопасность':7000000,'другое':3000000
};

const ECON_KEYWORDS = {
  'инфраструктура':['дорог','тротуар','мост','транспорт','жкх','водоснабж','канализац','благоустрой','строительств','остановк','свет','электросет','ремонт'],
  'экономика':['инвестиц','предприят','завод','производств','агро','ферм','туризм','логистик','бизнес','рабочих мест','налог','врп','экспорт','импортозамещ'],
  'здравоохранение':['больниц','поликлиник','медиц','врач','фap','скорой','хоспис','реабилитац','здоров'],
  'образование':['школ','детсад','детский сад','вуз','колледж','образован','университет','училищ','стипенд'],
  'экология':['эколог','мусор','отход','переработ','чист','река','дон','озелен','парк','зелен','амбрози','свалк'],
  'цифровизация':['цифров','it ','ит-','блокчейн','крипт','программ','платформ','приложен','интернет','связь','автоматизац'],
  'социальное':['семь','демограф','рождаем','пенсион','инвалид','ветеран','молодеж','молодёж','социальн','льгот','выплат','поддержк'],
  'культура':['культур','музей','театр','библиотек','музык','казач','традиц','фестивал','искусств'],
  'безопасность':['безопасн','мошенник','преступ','полици','мвд','пожарн','чс','терроризм','наркотик'],
  'другое':[]
};

/* ---------- УТИЛИТЫ ---------- */
const fmt = n => new Intl.NumberFormat('ru-RU').format(n);
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2200);
}
function parseDate(str){
  if(!str) return null;
  const p = str.split('.');
  if(p.length===3) return new Date(+p[2],+p[1]-1,+p[0]);
  return null;
}
function download(filename, content, mime){
  const blob = new Blob([content],{type:mime});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}
function shorten(s,n=40){ return s && s.length>n ? s.slice(0,n)+'…' : (s||''); }
function simpleHash(str){
  let h=0; for(let i=0;i<str.length;i++){h=((h<<5)-h)+str.charCodeAt(i);h|=0;}
  return 'h'+Math.abs(h);
}

/* ---------- ЭКОНОМИКА ---------- */
function detectCategory(item){
  const hay = ((item.text||'')+' '+(item.subtheme||'')+' '+(item.theme||'')).toLowerCase();
  let best='другое', bestScore=0;
  for(const [cat,words] of Object.entries(ECON_KEYWORDS)){
    let score=0; words.forEach(w=>{ if(hay.includes(w)) score++; });
    if(score>bestScore){ bestScore=score; best=cat; }
  }
  return best;
}
function textMultiplier(text){
  const len=(text||'').length;
  if(len>2000)return 2.5; if(len>1000)return 1.8; if(len>500)return 1.3; if(len>200)return 1.0; return .6;
}
function statusMultiplier(status){
  if(!status||!status.trim())return 1.0;
  const s=status.toLowerCase();
  if(s.includes('заверш')||s.includes('выполн')||s.includes('реализ'))return 1.5;
  if(s.includes('нестратег')||s.includes('отклон'))return .3;
  return 1.2;
}
function estimateEffect(item,index){
  if(MANUAL_EFFECTS[index]!==undefined) return MANUAL_EFFECTS[index];
  const hash = simpleHash((item.text||'')+(item.city||''));
  if(MANUAL_EFFECTS[hash]!==undefined) return MANUAL_EFFECTS[hash];
  const cat = detectCategory(item);
  const base = ECON_BASE[cat]||ECON_BASE['другое'];
  return Math.round(base * textMultiplier(item.text) * statusMultiplier(item.status));
}
function formatMoney(n){
  if(n>=1e9) return (n/1e9).toFixed(2)+' млрд ₽';
  if(n>=1e6) return (n/1e6).toFixed(2)+' млн ₽';
  if(n>=1e3) return (n/1e3).toFixed(1)+' тыс. ₽';
  return fmt(n)+' ₽';
}

/* ---------- СТАТУСЫ ---------- */
function classifyStatus(status){
  if(!status||!status.trim())return 'progress';
  const s=status.toLowerCase();
  if(s.includes('заверш')||s.includes('выполн')||s.includes('реализ'))return 'done';
  if(s.includes('нестратег')||s.includes('отклон')||s.includes('отказ'))return 'rejected';
  if(s.includes('обработ')||s.includes('рассмотр')||s.includes('очеред'))return 'progress';
  return 'unknown';
}
function statusLabel(code){
  return {done:'Завершено',progress:'В обработке',rejected:'Нестратегическое',unknown:'Другое'}[code]||code;
}

/* ---------- ЗАГРУЗКА ---------- */
async function loadData(){
  try{
    try{
      const ef = await fetch('effects.json');
      if(ef.ok) MANUAL_EFFECTS = await ef.json();
    }catch(_){}
    const res = await fetch('data.json');
    if(!res.ok) throw new Error('data.json не найден (статус '+res.status+')');
    RAW = await res.json();
    if(!Array.isArray(RAW)) throw new Error('data.json должен быть массивом');
    FILTERED = [...RAW];
    buildFilters();
    renderAll();
  }catch(e){
    console.error(e);
    document.getElementById('errorBox').innerHTML =
      '<div class="error-box">Ошибка: '+e.message+'<br>Проверьте, что data.json лежит рядом с index.html и открывается в браузере.</div>';
  }
}

/* ---------- ФИЛЬТРЫ ---------- */
function buildFilters(){
  const themes=[...new Set(RAW.map(r=>r.theme).filter(Boolean))].sort();
  const cities=[...new Set(RAW.map(r=>r.city).filter(Boolean))].sort();
  const subs=[...new Set(RAW.map(r=>r.subtheme).filter(Boolean))].sort();
  const tSel=document.getElementById('fTheme'), cSel=document.getElementById('fCity'), sSel=document.getElementById('fSub');
  themes.forEach(t=>{const o=document.createElement('option');o.value=t;o.textContent=t.length>60?t.slice(0,60)+'…':t;o.title=t;tSel.appendChild(o);});
  cities.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;cSel.appendChild(o);});
  subs.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;sSel.appendChild(o);});
}
function applyFilters(){
  const theme=document.getElementById('fTheme').value;
  const city=document.getElementById('fCity').value;
  const sub=document.getElementById('fSub').value;
  const from=document.getElementById('fFrom').value;
  const to=document.getElementById('fTo').value;
  const search=document.getElementById('fSearch').value.trim().toLowerCase();
  const fileF=document.getElementById('fFile').value;
  FILTERED = RAW.filter(r=>{
    if(theme && r.theme!==theme) return false;
    if(city && r.city!==city) return false;
    if(sub && r.subtheme!==sub) return false;
    if(search && !(r.text||'').toLowerCase().includes(search)) return false;
    if(fileF==='yes' && !(r.file&&r.file.trim())) return false;
    if(fileF==='no' && (r.file&&r.file.trim())) return false;
    if(from||to){
      const d=parseDate(r.date); if(!d) return false;
      if(from && d<new Date(from)) return false;
      if(to && d>new Date(to)) return false;
    }
    return true;
  });
  renderAll();
  showToast('Найдено: '+FILTERED.length+' из '+RAW.length);
}
function resetFilters(){
  document.querySelectorAll('.filters select,.filters input').forEach(el=>el.value='');
  FILTERED=[...RAW]; renderAll(); showToast('Фильтры сброшены');
}

/* ---------- СТАТИСТИКА ---------- */
function computeStats(){
  const total=FILTERED.length;
  const withFile=FILTERED.filter(r=>r.file&&r.file.trim()).length;
  const processed=FILTERED.filter(r=>r.status&&r.status.trim()).length;
  const byTheme={},byCity={},bySub={},byDate={};
  FILTERED.forEach(r=>{
    byTheme[r.theme]=(byTheme[r.theme]||0)+1;
    byCity[r.city]=(byCity[r.city]||0)+1;
    bySub[r.subtheme]=(bySub[r.subtheme]||0)+1;
    if(r.date) byDate[r.date]=(byDate[r.date]||0)+1;
  });
  const dates=Object.keys(byDate).sort((a,b)=>{
    const da=parseDate(a),db=parseDate(b); return (da||0)-(db||0);
  });
  let cum=0;
  const cumulativeData=dates.map(d=>{cum+=byDate[d];return cum;});
  return {total,withFile,processed,themes:Object.keys(byTheme).length,cities:Object.keys(byCity).length,subs:Object.keys(bySub).length,byTheme,byCity,bySub,byDate,dates,cumulativeData};
}

/* ---------- KPI ---------- */
function renderKPI(){
  const s=computeStats();
  const pct=s.total?Math.round(s.processed/s.total*100):0;
  const cards=[
    {label:'Всего инициатив',value:fmt(s.total)},
    {label:'Уникальных тем',value:fmt(s.themes)},
    {label:'Городов / районов',value:fmt(s.cities)},
    {label:'Подтем',value:fmt(s.subs)},
    {label:'С документом',value:fmt(s.withFile)},
    {label:'Обработано',value:pct+'%'}
  ];
  document.getElementById('kpiGrid').innerHTML = cards.map(c=>
    '<div class="kpi-card"><div class="label">'+c.label+'</div><div class="value">'+c.value+'</div></div>'
  ).join('');
}

function renderCompletedKPI(){
  const total=FILTERED.length;
  const counts={done:0,progress:0,rejected:0,unknown:0};
  FILTERED.forEach(r=>{counts[classifyStatus(r.status)]++;});
  const pct=total?Math.round(counts.done/total*100):0;
  const pPct=total?Math.round(counts.progress/total*100):0;
  const cards=[
    {label:' Завершено',value:fmt(counts.done),sub:pct+'% от всех'},
    {label:' В обработке',value:fmt(counts.progress),sub:pPct+'% от всех'},
    {label:' Нестратегические',value:fmt(counts.rejected),sub:''},
    {label:' Без статуса',value:fmt(counts.unknown),sub:''}
  ];
  document.getElementById('completedGrid').innerHTML = cards.map(c=>
    '<div class="kpi-card"><div class="label">'+c.label+'</div><div class="value">'+c.value+'</div>'+
    (c.sub?'<div style="font-size:.78rem;color:#52677D;margin-top:6px;font-weight:600">'+c.sub+'</div>':'')+
    '</div>'
  ).join('');
}

/* ---------- ЭКОНОМИКА: ПАНЕЛЬ ---------- */
function computeEconomicEffect(){
  const byCategory={}, items=[];
  let total=0;
  FILTERED.forEach(r=>{
    const gi=RAW.indexOf(r);
    const effect=estimateEffect(r,gi);
    const cat=detectCategory(r);
    byCategory[cat]=(byCategory[cat]||0)+effect;
    total+=effect;
    items.push(Object.assign({},r,{_effect:effect,_category:cat,_index:gi}));
  });
  items.sort((a,b)=>b._effect-a._effect);
  return {total,byCategory,items};
}
function
