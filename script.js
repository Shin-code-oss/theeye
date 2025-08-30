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
const aboutLink = document.getElementById('aboutLink');
const howToHelpLink = document.getElementById('howToHelpLink');
const staticDialog = document.getElementById('staticDialog');
const staticContent = document.getElementById('staticContent');
const staticClose = document.getElementById('staticClose');

/* ---- Supabase Auth/DB ---- */
const SUPABASE_URL = 'https://qiimjthkrrfxbjdeoopo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpaW1qdGhrcnJmeGJqZGVvb3BvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1Njc3ODgsImV4cCI6MjA3MjE0Mzc4OH0.mcZ96mSOP1aKFcLPJiWNrzsxeOa0sKwSvGu3TPqKb2Y';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
sb.auth.onAuthStateChange(() => refreshAuth()); // 전역 1회 등록

const authBtn = document.getElementById('authBtn');
const submitLink = document.getElementById('submitLink');

const submitDialog = document.getElementById('submitDialog');
const submitClose = document.getElementById('submitClose');
const submitForm = document.getElementById('submitForm');

const loginDialog = document.getElementById('loginDialog');
const loginClose = document.getElementById('loginClose');
const loginForm = document.getElementById('loginForm');
const goSignup = document.getElementById('goSignup');

let CURRENT_LANG = 'ko';
let CURRENT_USER = null;

document.getElementById('year').textContent = new Date().getFullYear();

/* ---- State ---- */
let DATA = [];
let activeTags = new Set();
let followed = new Set(JSON.parse(localStorage.getItem('the-eye:followed') || '[]'));

/* ---- Language selection & helpers ---- */
function getPreferredLang(){
  const saved = localStorage.getItem('the-eye:lang');
  if (saved && saved !== 'auto') return saved;
  const nav = navigator.language || 'ko';
  if (nav.startsWith('ko')) return 'ko';
  if (nav.startsWith('ja')) return 'ja';
  return 'en';
}
function normalizeLang(v){ return v === 'jp' ? 'ja' : v; }

/* ---- URL <-> UI state sync (filters) ---- */
function parseStateFromURL(){
  const p = new URLSearchParams(location.search);
  const q = p.get('q') || '';
  const tags = (p.get('tags') || '').split(',').filter(Boolean);
  const sort = p.get('sort') || 'priority';
  const followedOnly = p.get('followed') === '1';

  searchEl.value = q;
  activeTags = new Set(tags);
  sortByEl.value = sort;
  showFollowedEl.checked = followedOnly;
}
function syncURL(){
  const p = new URLSearchParams(location.search);
  const tags = Array.from(activeTags);
  if (searchEl.value) p.set('q', searchEl.value); else p.delete('q');
  if (tags.length) p.set('tags', tags.join(',')); else p.delete('tags');
  if (sortByEl.value !== 'priority') p.set('sort', sortByEl.value); else p.delete('sort');
  if (showFollowedEl.checked) p.set('followed', '1'); else p.delete('followed');
  history.replaceState(null, '', `${location.pathname}?${p.toString()}${location.hash}`);
}

/* ---- Data load ---- */
async function load(){
  // 언어 결정 + 보정
  const uiLangRaw = localStorage.getItem('the-eye:lang') || 'auto';
  const uiLang = normalizeLang(uiLangRaw);
  if (uiLangRaw !== uiLang) localStorage.setItem('the-eye:lang', uiLang);
  if (langSelect) langSelect.value = uiLang;

  let lang = uiLang === 'auto' ? getPreferredLang() : uiLang;
  lang = normalizeLang(lang);
  let url = `issues.${lang}.json`;
  CURRENT_LANG = lang;

  try{
    const res = await fetch(url, { cache:'no-store' });
    if(!res.ok) throw new Error('not found');
    DATA = await res.json();
  }catch(e){
    const res = await fetch('issues.ko.json', { cache:'no-store' });
    DATA = await res.json();
    lang = 'ko';
    CURRENT_LANG = 'ko';
    if (langSelect) langSelect.value = 'ko';
  }

  // URL의 필터 상태를 먼저 UI에 반영 → 1차 렌더
  parseStateFromURL();
  renderTags();
  render();

  // 승인된 DB 제보를 합쳐서 2차 렌더
  await loadApprovedSubmissions();

  // 해시로 진입 시(딥링크) 모달 열기
  openFromHashOnce();
} // load 끝

/* ---- 승인된 제보 불러오기(DB → 화면 합치기) ---- */
async function loadApprovedSubmissions(){
  try{
    const { data, error } = await sb
      .from('submissions')
      .select('id, created_at, title, summary, details, tags, region, priority, status, sources, lang')
      .eq('approved', true)
      .eq('lang', CURRENT_LANG);

    if (error) {
      console.warn('loadApprovedSubmissions error:', error.message);
      return;
    }

    const extra = (data || []).map(r => ({
      id: `sub_${r.id}`, // 충돌 방지
      title: r.title,
      summary: r.summary || '',
      details: r.details || '',
      tags: Array.isArray(r.tags) ? r.tags : [],
      region: r.region || '',
      priority: Number.isFinite(r.priority) ? r.priority : 0,
      status: r.status || 'unresolved',
      sources: r.sources || [],
      updated: (r.created_at || '').slice(0,10),
      share: true
    }));

    if (extra.length){
      const ids = new Set(DATA.map(i=>i.id));
      DATA = DATA.concat(extra.filter(i=>!ids.has(i.id)));
      renderTags();
      render();
    }
  }catch(err){
    console.warn('loadApprovedSubmissions ex:', err);
  }
}

/* ---- Auth helpers (전역) ---- */
async function refreshAuth(){
  const { data: { user } } = await sb.auth.getUser();
  CURRENT_USER = user;
  if (authBtn) authBtn.textContent = user ? 'Sign out' : 'Sign in';
}
function openLogin(){ loginDialog?.showModal(); }
function closeLogin(){ loginDialog?.close(); }
function openSubmit(){ submitDialog?.showModal(); }
function closeSubmit(){ submitDialog?.close(); }

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
  syncURL();
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
        <button class="btn copylink" data-id="${i.id}">Copy link</button>
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
  document.querySelectorAll('.card .copylink').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const id = e.target.closest('.card').dataset.id;
      const url = `${location.origin}${location.pathname}#${id}`;
      (async ()=>{
        try{
          await navigator.clipboard.writeText(url);
          e.target.textContent = 'Copied!';
        }catch(_){
          window.prompt('Copy this link', url);
        }
        setTimeout(()=> e.target.textContent = 'Copy link', 1200);
      })();
    });
  });
}

function toggleFollow(id, btn){
  if(followed.has(id)) followed.delete(id); else followed.add(id);
  localStorage.setItem('the-eye:followed', JSON.stringify(Array.from(followed)));
  btn.setAttribute('aria-pressed', followed.has(id));
  btn.textContent = followed.has(id) ? 'Following' : 'Follow';
}

/* ---- Issue modal (details) ---- */
function openDialog(id){
  const i = DATA.find(x => x.id === id);
  if(!i) return;
  history.replaceState(null, '', `${location.pathname}${location.search}#${id}`);
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

dialogCloseEl.addEventListener('click', ()=>{
  dialogEl.close();
  history.replaceState(null, '', location.pathname + location.search);
});
dialogEl.addEventListener('click', (e)=>{
  const rect = dialogEl.getBoundingClientRect();
  const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
  if(!inside) dialogEl.close();
});

/* ---- Static modal (About / How to help) ---- */
function openStatic(title, html){
  if (!staticDialog || !staticContent) return;
  staticContent.innerHTML = `
    <h3 style="margin:0;padding:16px;border-bottom:1px solid var(--border)">${title}</h3>
    <div class="dialog-body">${html}</div>`;
  staticDialog.showModal();
}
staticClose?.addEventListener('click', ()=> staticDialog.close());
staticDialog?.addEventListener('click', (e)=>{
  const r = staticDialog.getBoundingClientRect();
  const inside = e.clientX>=r.left && e.clientX<=r.right && e.clientY>=r.top && e.clientY<=r.bottom;
  if(!inside) staticDialog.close();
});
aboutLink?.addEventListener('click', (e)=>{
  e.preventDefault();
  openStatic('About', `
    <p><strong>The Eye</strong>는 해결되지 않은 사회 이슈를 계속 보여주기 위한 흑백 웹사이트입니다.</p>
    <p>검색·태그·팔로우·출처 공유로 이슈를 잊지 않게 만듭니다.</p>
  `);
});
howToHelpLink?.addEventListener('click', (e)=>{
  e.preventDefault();
  openStatic('How to help', `
    <ul>
      <li><strong>제보하기:</strong> 상단 <em>Submit</em>으로 신뢰 가능한 출처와 함께 이슈를 보내주세요.</li>
      <li><strong>팔로우:</strong> 관심 이슈만 모아 보고 주기적으로 확인하세요.</li>
      <li><strong>연결하기:</strong> 관련 단체/자료/캠페인 링크를 함께 남겨 주세요.</li>
    </ul>
  `);
});

/* ---- Submit/Login dialogs: backdrop click to close ---- */
submitDialog?.addEventListener('click', (e)=>{
  const r = submitDialog.getBoundingClientRect();
  const inside = e.clientX>=r.left && e.clientX<=r.right && e.clientY>=r.top && e.clientY<=r.bottom;
  if(!inside) closeSubmit();
});
loginDialog?.addEventListener('click', (e)=>{
  const r = loginDialog.getBoundingClientRect();
  const inside = e.clientX>=r.left && e.clientX<=r.right && e.clientY>=r.top && e.clientY<=r.bottom;
  if(!inside) closeLogin();
});

/* ---- Sharing helpers ---- */
function shareURL(i){
  const url = typeof window !== 'undefined' ? window.location.href.split('#')[0] : '';
  const text = `Keep this in sight: ${i.title}`;
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}
function escapeHTML(str=''){
  return String(str).replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s]));
}
function escapeAttr(str=''){ return escapeHTML(str).replace(/"/g, '&quot;'); }

/* ---- Deep link via hash (#id) ---- */
window.addEventListener('hashchange', ()=>{
  const id = location.hash.slice(1);
  if (id) openDialog(id);
});
function openFromHashOnce(){
  const id = location.hash.slice(1);
  if (id) setTimeout(()=>openDialog(id), 0);
}

/* ---- Events ---- */
searchEl.addEventListener('input', render);
showFollowedEl.addEventListener('change', render);
sortByEl.addEventListener('change', render);

// Auth 버튼: 로그인/로그아웃 토글
authBtn?.addEventListener('click', async ()=>{
  if (CURRENT_USER){
    await sb.auth.signOut();
    CURRENT_USER = null;
    authBtn.textContent = 'Sign in';
  } else {
    openLogin();
  }
});

// Submit 링크: 로그인 필요 → 로그인 안 되어 있으면 로그인 모달
submitLink?.addEventListener('click', (e)=>{
  e.preventDefault();
  if (!CURRENT_USER) return openLogin();
  openSubmit();
});

// Login
loginClose?.addEventListener('click', closeLogin);
loginForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { alert('Sign in failed: ' + error.message); return; }
  // onAuthStateChange에서 refreshAuth 호출됨
  closeLogin();
  openSubmit();
});

// Signup
goSignup?.addEventListener('click', async ()=>{
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) return alert('Enter email & password first.');
  const { error } = await sb.auth.signUp({ email, password });
  if (error) { alert('Sign up failed: ' + error.message); return; }
  alert('Check your inbox to verify your email.');
});

// Submit
submitClose?.addEventListener('click', closeSubmit);
submitForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  if (!CURRENT_USER) { openLogin(); return; }

  const title = document.getElementById('subTitle').value.trim();
  const summary = document.getElementById('subSummary').value.trim();
  const details = document.getElementById('subDetails').value.trim();
  const tagsStr = document.getElementById('subTags').value.trim();
  const region = document.getElementById('subRegion').value.trim();
  const priority = parseInt(document.getElementById('subPriority').value || '0', 10);
  const srcTitle = document.getElementById('subSourceTitle').value.trim();
  const srcUrl = document.getElementById('subSourceUrl').value.trim();

  const tags = tagsStr ? tagsStr.split(',').map(s=>s.trim()).filter(Boolean) : [];
  const sources = srcUrl ? [{ title: srcTitle || srcUrl, url: srcUrl }] : [];

  const payload = {
    created_by: CURRENT_USER.id,
    lang: CURRENT_LANG || 'ko',
    title, summary, details, tags, region, priority,
    status: 'unresolved',
    sources,
    approved: false
  };

  const { error } = await sb.from('submissions').insert(payload);
  if (error) { alert('Submit failed: ' + error.message); return; }

  alert('제출 완료! 운영자 승인 후 공개됩니다.');
  submitForm.reset();
  closeSubmit();
});

/* ---- Kickoff ---- */
refreshAuth();
load();
