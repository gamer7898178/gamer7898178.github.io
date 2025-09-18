// app.firebase-ui.js - Firebase-backed PotatoDownloads (modular SDK)
// This module wires the UI to Firebase. It expects window.FIREBASE_CONFIG to be filled in index.html
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.6.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.6.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, addDoc, getDoc, getDocs, query, where, orderBy, onSnapshot, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.6.0/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.6.0/firebase-storage.js";
import JSZip from "https://cdn.jsdelivr.net/npm/jszip@3.10.0/dist/jszip.min.js";
import { saveAs } from "https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js";

const cfg = window.FIREBASE_CONFIG || null;
let app, auth, db, storage;
if(cfg && cfg.apiKey && cfg.projectId){
  app = initializeApp(cfg);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
} else {
  console.warn('FIREBASE_CONFIG not set — Firebase disabled. Please paste your config in index.html');
}

// owners rule
const OWNERS = ['gamer7898178','gamer7898179'];

// helper $
const $ = id => document.getElementById(id);
const uid = ()=> 'id_'+Math.random().toString(36).slice(2,9);
const escapeHtml = s => s? s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])) : '';

// local fallback store (if firebase disabled)
function readLocal(){ try{ return JSON.parse(localStorage.getItem('potato_local_store')||'[]') }catch(e){ return [] } }
function writeLocal(v){ localStorage.setItem('potato_local_store', JSON.stringify(v)) }

// file helpers
function fileToDataURL(file){ return new Promise((res,rej)=>{ if(!file) return res(null); const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); }) }
function dataURLtoBlob(dataurl){ const arr=dataurl.split(','); const mime=arr[0].match(/:(.*?);/)[1]; const bstr=atob(arr[1]); let n=bstr.length; const u8=new Uint8Array(n); while(n--) u8[n]=bstr.charCodeAt(n); return new Blob([u8],{type:mime}); }

// Firebase wrappers
async function uploadFileToStorage(path, file){ if(!storage) throw new Error('Storage not configured'); const ref = storageRef(storage, path); await uploadBytes(ref, file); return await getDownloadURL(ref); }

async function saveAppToFirestore(docId, data){ if(!db) throw new Error('Firestore not configured'); await setDoc(doc(db,'apps',docId), data); }

async function fetchPublishedApps(){ if(db){ const q = query(collection(db,'apps'), where('published','==', true), orderBy('created','desc')); const snap = await getDocs(q); return snap.docs.map(d=>({id:d.id, ...d.data()})); } else { return readLocal().filter(a=>a.published); } }

async function fetchAllAppsRealtime(onUpdate){ if(db){ const q = query(collection(db,'apps'), orderBy('created','desc')); return onSnapshot(q, snap=>{ const arr = snap.docs.map(d=>({id:d.id, ...d.data()})); onUpdate(arr); }); } else { onUpdate(readLocal()); return ()=>{} } }

// download ZIP from app doc (storage urls)
async function downloadAppAsZip(appDoc){
  const zip = new JSZip();
  const meta = { id: appDoc.id, name: appDoc.name, short: appDoc.short, desc: appDoc.desc, uploader: appDoc.uploaderName };
  zip.file('metadata.json', JSON.stringify(meta,null,2));
  if(appDoc.iconUrl){ const r = await fetch(appDoc.iconUrl); const b = await r.blob(); zip.file('icon'+guessExt(appDoc.iconUrl), b); }
  if(appDoc.fileUrl){ const r2 = await fetch(appDoc.fileUrl); const b2 = await r2.blob(); zip.file(appDoc.filename || 'appfile.bin', b2); }
  const content = await zip.generateAsync({type:'blob'});
  saveAs(content, sanitizeFilename((appDoc.name||'app') + '_potatodownload.zip'));
}

function guessExt(url){ const m = url.match(/\.(png|jpe?g|gif|webp)(\?|$)/i); return m?'.'+m[1].replace('jpeg','jpg') : '.png'; }
function sanitizeFilename(n){ return n.replace(/[^a-z0-9_.-]/gi,'_') }

// UI rendering
async function renderStoreGrid(){ const grid = $('steamGrid'); if(!grid) return; grid.innerHTML = '<div class="muted">Loading...</div>'; const apps = await fetchPublishedApps(); grid.innerHTML = ''; if(!apps.length) { grid.innerHTML = '<div class="muted">No published apps yet</div>'; return; } apps.forEach(item=>{ const banner = document.createElement('div'); banner.className='banner card'; const img = document.createElement('img'); img.src = item.iconUrl || item.icon || 'placeholder_banner.png'; img.alt=''; const info = document.createElement('div'); info.style.flex='1'; const title = document.createElement('h3'); title.textContent = item.name; const short = document.createElement('div'); short.className='muted'; short.textContent = item.short || ''; const cats = document.createElement('div'); cats.className='muted small'; cats.textContent = item.category || 'Uncategorized'; const avg = item.ratingAvg ? Number(item.ratingAvg).toFixed(1) : (item.reviewsCount? '—' : '—'); const rightRow = document.createElement('div'); rightRow.style.marginTop='12px'; rightRow.innerHTML = `<button class="btn steam-cta" data-id="${item.id}">View</button> <span class="muted" style="margin-left:10px">${avg} ★</span>`; info.appendChild(title); info.appendChild(short); info.appendChild(cats); info.appendChild(rightRow); banner.appendChild(img); banner.appendChild(info); banner.querySelector('.steam-cta').onclick = ()=>{ location.href = 'app.html?id='+item.id; }; grid.appendChild(banner); }); }

// Auth helpers (Firebase + simple local fallback)
async function signupFirebase(displayName, email, password){
  if(!auth) throw new Error('Auth not configured');
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName });
  // create user doc
  await setDoc(doc(db,'users',cred.user.uid), { uid:cred.user.uid, email, username:displayName, role: OWNERS.includes(displayName)?'owner':'user', created: serverTimestamp() });
  return cred.user;
}

async function loginFirebase(email, password){
  if(!auth) throw new Error('Auth not configured');
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

// local fallback auth
function signupLocal(displayName, email, password){
  const users = JSON.parse(localStorage.getItem('pd_users_local')||'[]');
  if(users.find(u=>u.email===email)) throw new Error('User exists');
  const u = { id: uid(), displayName, email, pass: password, role: OWNERS.includes(displayName)?'owner':'user', created: Date.now() };
  users.push(u); localStorage.setItem('pd_users_local', JSON.stringify(users)); localStorage.setItem('pd_current_user', JSON.stringify(u)); return u;
}
function loginLocal(email, password){
  const users = JSON.parse(localStorage.getItem('pd_users_local')||'[]');
  const found = users.find(u=>u.email===email && u.pass===password);
  if(!found) throw new Error('Wrong credentials');
  localStorage.setItem('pd_current_user', JSON.stringify(found)); return found;
}

function getLocalCurrentUser(){ try{ return JSON.parse(localStorage.getItem('pd_current_user')||'null') }catch(e){ return null } }

// UI wiring
document.addEventListener('DOMContentLoaded', async ()=>{
  const burger = $('burger'); const sidebar = document.querySelector('.sidebar');
  const navStore = $('navStore'); const navUpload = $('navUpload'); const navProfile = $('navProfile');
  const loginBtn = $('loginBtn'); const userInfo = $('userInfo'); const userInfoUpload = $('userInfoUpload'); const userInfoApp = $('userInfoApp');
  const search = $('search'); const categoryFilter = $('categoryFilter');
  const exportBtn = $('exportBtn'); const importBtn = $('importBtn'); const importFile = $('importFile');
  const modal = $('loginModal'); const backdrop = $('modalBackdrop'); const closeModal = $('closeModal');
  const doLogin = $('doLogin'); const doSignup = $('doSignup'); const guestBtn = $('guestBtn');
  const displayName = $('displayName'); const email = $('email'); const password = $('password');
  const u_save = $('u_save'); const u_publish = $('u_publish');
  const u_name = $('u_name'); const u_short = $('u_short'); const u_category = $('u_category'); const u_desc = $('u_desc'); const u_icon = $('u_icon'); const u_appfile = $('u_appfile');

  // Sidebar
  burger.onclick = ()=> sidebar.classList.toggle('open');
  navStore.onclick = ()=> { sidebar.classList.remove('open'); location.href='index.html' }
  navUpload.onclick = ()=> { sidebar.classList.remove('open'); location.href='upload.html' }
  navProfile.onclick = ()=> { sidebar.classList.remove('open'); location.href='profile.html' }

  // Auth state
  if(auth){
    onAuthStateChanged(auth, user=>{
      if(user){ localStorage.setItem('pd_current_user', JSON.stringify({ uid:user.uid, displayName: user.displayName || user.email.split('@')[0], email: user.email })); renderUserInfo(user); }
      else { localStorage.removeItem('pd_current_user'); renderUserInfo(null); }
    });
  } else {
    renderUserInfo(getLocalCurrentUser());
  }

  function renderUserInfo(user){
    const cur = user || getLocalCurrentUser();
    if(cur){ userInfo.innerHTML = `<span class="muted">Hi, ${escapeHtml(cur.displayName||cur.username||cur.email.split('@')[0])}</span> <button id="logoutBtn" class="btn small ghost">Logout</button>`; const lb = document.getElementById('logoutBtn'); if(lb) lb.onclick = async ()=>{ if(auth) await signOut(auth); localStorage.removeItem('pd_current_user'); location.reload(); }; } else userInfo.innerHTML='';
    if(userInfoUpload) userInfoUpload.innerHTML = userInfo.innerHTML;
    if(userInfoApp) userInfoApp.innerHTML = userInfo.innerHTML;
  }

  // Login modal
  loginBtn.onclick = ()=> openModal();
  closeModal.onclick = ()=> closeModalFunc();
  backdrop.onclick = ()=> closeModalFunc();
  function openModal(){ modal.classList.remove('hidden'); backdrop.classList.remove('hidden'); }
  function closeModalFunc(){ modal.classList.add('hidden'); backdrop.classList.add('hidden'); }

  // signup/login handlers (modal)
  doSignup.onclick = async ()=>{
    const dn = displayName.value.trim(); const em = email.value.trim(); const pw = password.value;
    if(!dn||!em||!pw) return alert('Fill all fields');
    try{
      if(auth){ await signupFirebase(dn,em,pw); alert('Signed up (firebase)'); closeModalFunc(); }
      else { signupLocal(dn,em,pw); alert('Signed up (local)'); closeModalFunc(); renderUserInfo(getLocalCurrentUser()); }
    }catch(e){ alert('Signup failed: '+e.message); }
  };
  doLogin.onclick = async ()=>{
    const em = email.value.trim(); const pw = password.value; if(!em||!pw) return alert('Fill email & password');
    try{
      if(auth){ await loginFirebase(em,pw); alert('Logged in (firebase)'); closeModalFunc(); }
      else { loginLocal(em,pw); alert('Logged in (local)'); closeModalFunc(); renderUserInfo(getLocalCurrentUser()); renderStoreGrid(); }
    }catch(e){ alert('Login failed: '+e.message); }
  };
  guestBtn.onclick = ()=>{ localStorage.removeItem('pd_current_user'); closeModalFunc(); renderUserInfo(null); renderStoreGrid(); };

  // upload handlers (upload.html)
  if(u_publish){
    u_publish.onclick = async ()=>{
      const cur = auth ? auth.currentUser : getLocalCurrentUser();
      if(!cur) return alert('Please log in to upload');
      const name = u_name.value.trim(); if(!name) return alert('Name required');
      const short = u_short.value.trim(); const desc = u_desc.value.trim(); const category = u_category.value.trim()||'Uncategorized';
      const iconFile = u_icon.files[0]; const appFile = u_appfile.files[0];
      try{
        if(storage && db && auth){ // upload to Firebase Storage + Firestore
          const appId = uid();
          const created = serverTimestamp ? serverTimestamp() : Date.now();
          const iconUrl = iconFile ? await (async ()=>{ const path = `apps/${appId}/icon_${Date.now()}`; const url = await uploadFileToStorage(path, iconFile); return url; })() : null;
          const fileUrl = appFile ? await (async ()=>{ const path = `apps/${appId}/binary_${Date.now()}_${appFile.name}`; const url = await uploadFileToStorage(path, appFile); return url; })() : null;
          const doc = { id: appId, name, short, desc, category, iconUrl, fileUrl, filename: appFile?appFile.name:null, published: true, uploaderId: auth.currentUser.uid, uploaderName: auth.currentUser.displayName||auth.currentUser.email.split('@')[0], created: created, updated: created, reviewsCount:0, ratingAvg:0 };
          await saveAppToFirestore(appId, doc);
          alert('Uploaded to Firebase'); location.href='index.html';
        } else {
          // local fallback: save base64 in localStorage
          const iconData = iconFile ? await fileToDataURL(iconFile) : null;
          const appData = appFile ? { name: appFile.name, data: await fileToDataURL(appFile) } : null;
          const rec = { id: uid(), name, short, desc, category, icon: iconData, appFile: appData, published: true, created: Date.now(), updated: Date.now(), uploader: cur.displayName || cur.email || 'anonymous', reviews: [] };
          const local = readLocal(); local.unshift(rec); writeLocal(local); alert('Saved locally'); location.href='index.html';
        }
      }catch(e){ alert('Upload failed: '+e.message); }
    };
  }

  // export/import JSON (client-side)
  exportBtn.onclick = async ()=>{
    if(db){ // fetch from firestore
      const apps = await fetchPublishedApps();
      const blob = new Blob([JSON.stringify(apps,null,2)], {type:'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'potatodownloads_site.json'; document.body.appendChild(a); a.click(); a.remove();
    } else { const data = readLocal(); const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'potatodownloads_site.json'; document.body.appendChild(a); a.click(); a.remove(); }
  };
  importBtn.onclick = ()=> importFile.click();
  importFile.onchange = (ev)=>{ const f = ev.target.files[0]; if(!f) return; const r = new FileReader(); r.onload = ()=>{ try{ const data = JSON.parse(r.result); if(!Array.isArray(data)) return alert('Invalid JSON'); if(db){ alert('Import to Firestore is not supported here.'); } else { const local = readLocal(); const unpub = local.filter(l=>!l.published); const merged = [...unpub]; data.forEach(r=> merged.push(r)); writeLocal(merged); renderStoreGrid(); populateCategories(); alert('Imported'); } }catch(e){ alert('Invalid JSON: '+e.message); } }; r.readAsText(f); };

  // render store
  renderStoreGrid();
  populateCategories();
  if(search) search.addEventListener('input', renderStoreGrid);
  if(categoryFilter) categoryFilter.addEventListener('change', renderStoreGrid);

  // profile page rendering
  if(location.pathname.endsWith('profile.html')){
    const cur = auth? auth.currentUser : getLocalCurrentUser();
    const el = $('profileCard'); if(!el) return;
    if(!cur){ el.innerHTML = '<div class="muted">Not logged in. <a href="index.html">Log in</a></div>'; return; }
    // show uploader score & apps
    const apps = db ? await fetchPublishedApps() : readLocal();
    const myApps = apps.filter(a=> a.uploaderName === (cur.displayName||cur.username||cur.email?.split('@')[0]) );
    const score = myApps.length ? (myApps.reduce((s,a)=> s + (a.reviewsCount||0),0)/myApps.length).toFixed(2) : '0.00';
    el.innerHTML = `<h2>${escapeHtml(cur.displayName||cur.username||cur.email)}</h2><div class="muted">Role: ${OWNERS.includes((cur.displayName||cur.username||cur.email))?'Owner':'User'}</div><div class="muted">Uploader score: ${score}</div><h3>Your apps</h3>`;
    myApps.forEach(a=>{ const d = document.createElement('div'); d.className='app-card card'; d.innerHTML = `<strong>${escapeHtml(a.name)}</strong><div class="muted">${escapeHtml(a.short||'')}</div><div class="row"><a class="btn small" href="app.html?id=${a.id}">Open</a></div>`; el.appendChild(d); });
  }

  // app page rendering
  if(location.pathname.endsWith('app.html')){
    const params = new URLSearchParams(location.search); const id = params.get('id'); if(!id) return;
    if(db){
      const d = await getDoc(doc(db,'apps',id)); if(!d.exists()){ $('appCard').innerText = 'App not found'; } else { const appDoc = { id:d.id, ...d.data() }; renderAppDetail(appDoc); }
    } else {
      const local = readLocal(); const appDoc = local.find(a=>a.id===id); if(!appDoc) { $('appCard').innerText='App not found'; } else renderAppDetail(appDoc);
    }
  }

  function renderAppDetail(appDoc){
    const card = $('appCard'); card.innerHTML = `<div style="display:flex;gap:18px"><img src="${appDoc.iconUrl||appDoc.icon||'placeholder_banner.png'}" style="width:220px;height:140px;border-radius:8px"><div style="flex:1"><h2>${escapeHtml(appDoc.name)}</h2><div class="muted">${escapeHtml(appDoc.short||'')}</div><div style="margin-top:10px">${escapeHtml(appDoc.desc||'')}</div><div style="margin-top:12px" class="row"><div class="muted">Category: ${escapeHtml(appDoc.category||'Uncategorized')}</div><div style="margin-left:auto" class="row"><button id="downloadZip" class="btn small">Download ZIP</button></div></div></div></div>`;
    const reviewsEl = $('reviews'); reviewsEl.innerHTML = ''; if(appDoc.reviews && appDoc.reviews.length){ appDoc.reviews.forEach(r=>{ const d = document.createElement('div'); d.className='muted'; d.textContent = `${r.username||r.user||'anon'} — ${r.stars}★ — ${r.text||''}`; reviewsEl.appendChild(d); }); } else reviewsEl.textContent='No reviews yet';
    const user = auth? auth.currentUser : getLocalCurrentUser(); const leave = $('leaveReviewArea'); leave.innerHTML=''; if(user){ leave.innerHTML = `<label>Stars<select id="reviewStars"><option>5</option><option>4</option><option>3</option><option>2</option><option>1</option></select></label><label>Comment<textarea id="reviewText" rows="2"></textarea></label><div class="row"><button id="submitReview" class="btn">Submit Review</button></div>`; $('submitReview').onclick = async ()=>{ const stars = Number($('reviewStars').value); const text = $('reviewText').value.trim(); if(db){ await addDoc(collection(db,'apps',appDoc.id,'reviews'), { userId: auth.currentUser.uid, username: auth.currentUser.displayName||auth.currentUser.email.split('@')[0], stars, text, created: serverTimestamp() }); alert('Review submitted'); location.reload(); } else { appDoc.reviews = appDoc.reviews||[]; appDoc.reviews.push({ username: user.displayName||user.email, stars, text, created: Date.now() }); const s = readLocal(); const idx = s.findIndex(x=>x.id===appDoc.id); if(idx>=0){ s[idx]=appDoc; writeLocal(s); alert('Review added (local)'); renderAppDetail(appDoc); } } }; } else { leave.innerHTML = `<div class="muted">Please <a href="index.html">log in</a> to leave a review.</div>`; }
    if($('downloadZip')) $('downloadZip').onclick = async ()=>{ if(db && appDoc.fileUrl){ await downloadAppAsZip(appDoc); } else if(appDoc.appFile && appDoc.appFile.data){ const zip = new JSZip(); zip.file('metadata.json', JSON.stringify({id:appDoc.id,name:appDoc.name,short:appDoc.short,desc:appDoc.desc},null,2)); if(appDoc.icon) zip.file('icon.png', dataURLtoBlob(appDoc.icon)); zip.file(appDoc.appFile.name || 'appfile.bin', dataURLtoBlob(appDoc.appFile.data)); const blob = await zip.generateAsync({type:'blob'}); saveAs(blob, sanitizeFilename((appDoc.name||'app') + '_potatodownload.zip')); } else alert('No file attached'); };
  }

  // small helper: populate categories based on data
  async function populateCategories(){ let apps = []; if(db) apps = await fetchPublishedApps(); else apps = readLocal(); const cats = Array.from(new Set(apps.map(a=>a.category||'Uncategorized'))).sort(); if(!categoryFilter) return; categoryFilter.innerHTML = '<option value="all">All categories</option>'; cats.forEach(c=>{ const o = document.createElement('option'); o.value = c; o.textContent = c; categoryFilter.appendChild(o); }); }
});
