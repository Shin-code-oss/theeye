/* THE EYE — MVP logic (client-only) */

/* ---- DOM refs ---- */
const listEl = document.getElementById('list');
const searchEl = document.getElementById('search');
const tagsEl = document.getElementById('tags');
const showFollowedEl = document.getElementById('showFollowed');
const sortByEl = document.getElementById('sortBy');
const dialogEl = document.getElementById('issueDialog');
const dialogContentEl = document.getElementById('dialogContent');
const dialogCloseEl = document.getElementById('dialogClose');
const langSelect = document.getElementById('langSelect');

document.getElementById('year').textContent = new Date().getFullYear();

/* ---- State ---- */
let DATA = [];
let activeTags = new Set();
let followed = new Set(JSON.parse(localStorage.getItem('the-eye:followed') || '[]'));

/* ---- Language selection & data load ---- */
function getPreferredLang(){
  const saved = localStorage.getItem('the-eye:lang');
  if (saved && saved !== 'auto') return saved;

  const nav = navigator.language || 'ko';
  if (nav.startsWith('ko')) return 'ko';
  if (nav.startsWith('ja')) return 'ja';
  return 'en';
}

async function load(){
  const uiLang = localStorage.getItem('the-eye:lang') || 'auto';
  if (langSelect) langSelect.value = uiLang;

  let lang = uiLang === 'auto' ? getPreferredLang() : uiLang;
  let url = `issues.${lang}.json`;

  try{
    const res = await fetch(url, {cache:'no-store'});
    if(!res.ok) throw new Error('not found');
    DATA = await res.json();
  }catch(e){
    // 폴백: 한국어 원본
    const res = await fetch('issues.ko.json', {cache:'no-store'});
    DATA = await res.json();
    lang = 'ko';
  }

  renderTags();
  render();
}

langSelect?.addEventListener('change', ()=>{
  localStorage.setItem('the-eye:lang', langSelect.value);
  location.reload();
});

/* ---- Rendering ---- */
function renderTags(){
  const all = new Set();
  DATA.forEach(i => (i.tags||[]).forEach(t => all.add(t)));
  const tags = Array.from(all).sort((a,b)=>a.localeCompare(b));
  tagsEl.innerHTML = '';
  tags.forEach(tag => {
    const b = document.createElement('button');
    b.className = 'tag';
    b.type = 'button';
    b.textContent = tag;
    b.setAttribute('aria-pressed', activeTags.has(tag) ? 'true' : 'false');
    b.addEventListener('click', ()=>{
      if(activeTags.has(tag)) activeTags.delete(tag); else activeTags.add(tag);
      render();
      renderTags();
    });
    tagsEl.appendChild(b);
  });
}

function matchQuery(issue, q){
  if(!q) return true;
  const hay = (issue.title + ' ' + (issue.summary||'') + ' ' + (issue.tags||[]).join(' ')).toLowerCase();
  return hay.includes(q.toLowerCase());
}

function matchTags(issue){
  if(activeTags.size === 0) return true;
  return (issue.tags||[]).some(t => activeTags.has(t));
}

function render(){
  const q = searchEl.value.trim();
  const followedOnly = showFollowedEl.checked;
  const sortBy = sortByEl.value;

  let items = DATA
    .filter(i => matchQuery(i, q))
    .filter(i => matchTags(i))
    .filter(i => !followedOnly || followed.has(i.id));

  items.sort((a,b)=>{
    if(sortBy === 'priority') return (b.priority||0) - (a.priority||0);
    if(sortBy === 'title') return a.title.localeCompare(b.title);
    if(sortBy === 'status') return String(a.status).localeCompare(String(b.status));
    return 0;
  });

  listEl.innerHTML = items.map(toCardHTML).join('');
  attachCardEvents();
}

function toCardHTML(i){
  const isFollowed = followed.has(i.id);
  return `
    <article class="card" data-id="${i.id}">
      <h3>${escapeHTML(i.title)}</h3>
      <div class="meta">
        <span class="badge" title="Status">${escapeHTML(i.status||'unresolved')}</span>
        <span class="badge" title="Urgency">Urgency: ${i.priority||0}/5</span>
        ${i.region ? `<span class="badge" title="Region">${escapeHTML(i.region)}</span>` : ''}
      </div>
      <p class="summary">${escapeHTML(i.summary||'')}</p>
      <div class="meta">
        ${(i.tags||[]).map(t => `<span class="badge">#${escapeHTML(t)}</span>`).join(' ')}
      </div>
      <div class="actions">
        <button class="btn details">Details</button>
        <button class="btn follow" aria-pressed="${isFollowed}">${isFollowed ? 'Following' : 'Follow'}</button>
        ${i.share !== false ? `<a class="btn" href="${shareURL(i)}" target="_blank" rel="noopener">Share</a>` : ''}
      </div>
    </article>
  `;
}

function attachCardEvents(){
  document.querySelectorAll('.card .details').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const id = e.target.closest('.card').dataset.id;
      openDialog(id);
    });
  });
  document.querySelectorAll('.card .follow').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const id = e.target.closest('.card').dataset.id;
      toggleFollow(id, e.target);
    });
  });
}

function toggleFollow(id, btn){
  if(followed.has(id)) followed.delete(id); else followed.add(id);
  localStorage.setItem('the-eye:followed', JSON.stringify(Array.from(followed)));
  btn.setAttribute('aria-pressed', followed.has(id));
  btn.textContent = followed.has(id) ? 'Following' : 'Follow';
}

function openDialog(id){
  const i = DATA.find(x => x.id === id);
  if(!i) return;
  dialogContentEl.innerHTML = `
    <h3>${escapeHTML(i.title)}</h3>
    <div class="dialog-body">
      <div><strong>Status:</strong> ${escapeHTML(i.status||'unresolved')}</div>
      <div><strong>Urgency:</strong> ${i.priority||0}/5</div>
      ${i.region ? `<div><strong>Region:</strong> ${escapeHTML(i.region)}</div>` : ''}
      ${i.updated ? `<div><strong>Last updated:</strong> ${escapeHTML(i.updated)}</div>` : ''}
      ${i.summary ? `<p>${escapeHTML(i.summary)}</p>` : ''}
      ${i.details ? `<p>${escapeHTML(i.details)}</p>` : ''}
      ${Array.isArray(i.sources) && i.sources.length ? `
        <div class="sources">
          <strong>Sources:</strong>
          ${i.sources.map(s => `<a href="${escapeAttr(s.url)}" target="_blank" rel="noopener">${escapeHTML(s.title||s.url)}</a>`).join('')}
        </div>` : ''}
    </div>
  `;
  dialogEl.showModal();
}

dialogCloseEl.addEventListener('click', ()=> dialogEl.close());
dialogEl.addEventListener('click', (e)=>{
  const rect = dialogEl.getBoundingClientRect();
  const inDialog = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
  if(!inDialog) dialogEl.close();
});

function shareURL(i){
  const url = typeof window !== 'undefined' ? window.location.href.split('#')[0] : '';
  const text = `Keep this in sight: ${i.title}`;
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

function escapeHTML(str=''){
  return String(str).replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s]));
}
function escapeAttr(str=''){ return escapeHTML(str).replace(/"/g, '&quot;'); }

/* ---- Events ---- */
searchEl.addEventListener('input', render);
showFollowedEl.addEventListener('change', render);
sortByEl.addEventListener('change', render);

/* ---- Kickoff ---- */
load();
