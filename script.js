// ===== 설정 =====
const DATA_MAP = {
  ko: { G1: 'data/ko_G1.json', G2: 'data/ko_G2.json' },
  en: { G1: 'data/en_G1.json', G2: 'data/en_G2.json' },
};
const REWARD = { ko: 100, en: 200 }; // 정답 1개당 지급
const STORAGE_KEY = 'dictation_records_v1';
const LAST_KEY = 'dictation_last_selection_v1';

// ===== 상태 =====
let voices = [];
let pool = []; // 현재 급수 문제들
let session = { list: [], idx: 0, score: 0, money: 0, lang: 'ko', grade: 'G1', n: 10 };

// ===== 유틸 =====
const $ = (id) => document.getElementById(id);
const fmtKRW = (n) => `${n.toLocaleString('ko-KR')}원`;
const nowStr = () => new Date().toLocaleString();

function saveLastSelection(name, lang, grade){
  localStorage.setItem(LAST_KEY, JSON.stringify({name, lang, grade}));
}
function loadLastSelection(){
  try{ return JSON.parse(localStorage.getItem(LAST_KEY)) || null; }catch{ return null }
}

function getRecords(){
  try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }catch{ return {} }
}
function setRecords(recs){ localStorage.setItem(STORAGE_KEY, JSON.stringify(recs)); }

function pushHistory(child, lang, grade, item, input, correct){
  const recs = getRecords();
  recs[child] = recs[child] || {};
  recs[child][lang] = recs[child][lang] || { attempted:0, correct:0, earned:0, history:[] };
  recs[child][lang].attempted += 1;
  if(correct){
    recs[child][lang].correct += 1;
    recs[child][lang].earned += REWARD[lang];
  }
  recs[child][lang].history.unshift({ ts: nowStr(), grade, item, input, correct });
  // 히스토리는 최근 200개까지만
  if(recs[child][lang].history.length>200) recs[child][lang].history.length = 200;
  setRecords(recs);
}

function clearRecords(){ localStorage.removeItem(STORAGE_KEY); }

// 텍스트 정규화 (언어별 비교 규칙)
function normalize(text, lang){
  if(!text) return '';
  if(lang==='en'){
    return text.toLowerCase().replace(/[\p{P}\p{S}]/gu,'').replace(/\s+/g,' ').trim();
  } else { // ko
    return text.replace(/[\p{P}\p{S}]/gu,'').replace(/\s+/g,'').trim();
  }
}

// 음성 합성
function loadVoices(){ voices = window.speechSynthesis.getVoices(); fillVoiceSelect(); }
function pickDefaultVoice(lang){
  const prefix = lang==='en' ? 'en' : 'ko';
  return voices.find(v => v.lang && v.lang.toLowerCase().startsWith(prefix));
}
function speak(text, lang){
  if(!('speechSynthesis' in window)){
    alert('이 브라우저는 음성 합성을 지원하지 않습니다.');
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = parseFloat($('#rate').value || '1.0');
  u.lang = (lang==='en') ? 'en-US' : 'ko-KR';
  const sel = $('#voice').value;
  let voice = voices.find(v => v.name === sel);
  if(!voice) voice = pickDefaultVoice(lang);
  if(voice) u.voice = voice;
  window.speechSynthesis.speak(u);
}

function fillVoiceSelect(){
  const el = $('#voice');
  const lang = $('#lang').value;
  const prefix = (lang==='en') ? 'en' : 'ko';
  const avail = voices.filter(v => (v.lang||'').toLowerCase().startsWith(prefix));
  const saved = el.value;
  el.innerHTML = '<option value="">(자동 선택)</option>' +
    avail.map(v => `<option value="${v.name}">${v.name} — ${v.lang}</option>`).join('');
  if(saved){ el.value = saved; }
}

// 데이터 로드
async function loadData(lang, grade){
  const path = DATA_MAP[lang]?.[grade];
  if(!path) throw new Error('데이터 경로가 없습니다.');
  const res = await fetch(path, {cache:'no-store'});
  if(!res.ok) throw new Error('데이터를 불러올 수 없습니다.');
  const json = await res.json();
  if(!Array.isArray(json.items)) throw new Error('데이터 형식 오류');
  pool = json.items.slice();
}

function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }
  return arr;
}

function updateSummaries(){
  const child = $('#childName').value.trim();
  const recs = getRecords();
  const ko = recs[child]?.ko || {attempted:0,correct:0,earned:0,history:[]};
  const en = recs[child]?.en || {attempted:0,correct:0,earned:0,history:[]};
  $('#summary-ko').innerHTML = `시도 ${ko.attempted} · 정답 ${ko.correct} · 정확도 ${(ko.attempted? Math.round(ko.correct/ko.attempted*100) : 0)}% · 용돈 ${fmtKRW(ko.earned)}`;
  $('#summary-en').innerHTML = `시도 ${en.attempted} · 정답 ${en.correct} · 정확도 ${(en.attempted? Math.round(en.correct/en.attempted*100) : 0)}% · 용돈 ${fmtKRW(en.earned)}`;
  fillTable('ko', ko.history);
  fillTable('en', en.history);
}

function fillTable(lang, hist){
  const tbody = document.querySelector(`#table-${lang} tbody`);
  tbody.innerHTML = (hist||[]).slice(0,50).map(h => `
    <tr>
      <td>${h.ts}</td>
      <td>${h.grade}</td>
      <td>${escapeHtml(h.item)}</td>
      <td>${escapeHtml(h.input)}</td>
      <td>${h.correct ? '⭕' : '❌'}</td>
    </tr>
  `).join('');
}

function escapeHtml(s=''){
  return s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

// 세션 제어
function resetSessionUI(){
  $('#qIdx').textContent = '1';
  $('#qTotal').textContent = String(session.n);
  $('#score').textContent = String(session.score);
  $('#money').textContent = fmtKRW(session.money);
  $('#answer').value = '';
  $('#feedback').textContent = '';
  $('#feedback').className = 'feedback';
  $('#nextBtn').disabled = true;
}

function startSession(){
  const child = $('#childName').value.trim();
  const lang = $('#lang').value;
  const grade = $('#grade').value;
  const n = Math.max(3, Math.min(30, parseInt($('#numQuestions').value||'10',10)));
  if(!child){ alert('아이 이름을 입력해 주세요.'); return; }
  if(pool.length===0){ alert('데이터가 비어 있습니다.'); return; }
  session = { lang, grade, n, score:0, money:0, list: shuffle(pool.slice()).slice(0,n), idx:0 };
  saveLastSelection(child, lang, grade);
  $('#qTotal').textContent = String(n);
  $('#playCard').hidden = false;
  resetSessionUI();
  // 첫 문제 자동 읽기
  setTimeout(()=> speak(session.list[0], session.lang), 150);
}

function checkAnswer(){
  const child = $('#childName').value.trim();
  const input = $('#answer').value || '';
  const item = session.list[session.idx];
  const ok = normalize(input, session.lang) === normalize(item, session.lang);
  if(ok){
    session.score += 1;
    session.money += REWARD[session.lang];
    $('#feedback').className = 'feedback ok';
    $('#feedback').textContent = '정답이에요! 잘했어요 👏';
  }else{
    $('#feedback').className = 'feedback no';
    $('#feedback').textContent = `아쉽어요 😅 정답: "${item}"`;
  }
  $('#score').textContent = String(session.score);
  $('#money').textContent = fmtKRW(session.money);
  $('#nextBtn').disabled = false;
  pushHistory(child, session.lang, session.grade, item, input, ok);
  updateSummaries();
}

function nextQuestion(){
  if(session.idx < session.list.length-1){
    session.idx += 1;
    $('#qIdx').textContent = String(session.idx+1);
    $('#answer').value = '';
    $('#feedback').textContent = '';
    $('#feedback').className = 'feedback';
    $('#nextBtn').disabled = true;
    speak(session.list[session.idx], session.lang);
  } else {
    // 세션 종료
    $('#feedback').className = 'feedback ok';
    $('#feedback').textContent = `세션 완료! 점수 ${session.score}/${session.n}, 용돈 ${fmtKRW(session.money)}`;
  }
}

// 이벤트 바인딩
window.addEventListener('DOMContentLoaded', async ()=>{
  // 급수 목록 채우기
  refreshGrades();
  const last = loadLastSelection();
  if(last){
    $('#childName').value = last.name || '';
    $('#lang').value = last.lang || 'ko';
    refreshGrades();
    if(last.grade) $('#grade').value = last.grade;
  }
  updateAllowanceInfo();
  updateSummaries();

  // 음성
  loadVoices();
  if(typeof speechSynthesis !== 'undefined'){
    speechSynthesis.onvoiceschanged = loadVoices;
  }

  // 데이터 선로드
  await safeLoadCurrentData();

  // 핸들러들
  $('#rate').addEventListener('input', ()=> $('#rateVal').textContent = `${parseFloat($('#rate').value).toFixed(1)}x`);
  $('#lang').addEventListener('change', async ()=>{
    refreshGrades(); fillVoiceSelect(); updateAllowanceInfo(); await safeLoadCurrentData(); });
  $('#grade').addEventListener('change', async ()=>{ await safeLoadCurrentData(); });
  $('#startBtn').addEventListener('click', startSession);
  $('#speakBtn').addEventListener('click', ()=> speak(session.list[session.idx] || (pool[0]||''), $('#lang').value));
  $('#checkBtn').addEventListener('click', checkAnswer);
  $('#nextBtn').addEventListener('click', nextQuestion);
  $('#resetBtn').addEventListener('click', ()=>{ if(confirm('정말 기록을 모두 삭제할까요?')){ clearRecords(); updateSummaries(); }});
  $('#childName').addEventListener('change', ()=>{ saveLastSelection($('#childName').value.trim(), $('#lang').value, $('#grade').value); updateSummaries(); });

  // 탭
  document.querySelectorAll('.tab').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tabpanel').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
      $('#tab-'+btn.dataset.tab).classList.add('active');
    });
  });
});

function updateAllowanceInfo(){
  const lang = $('#lang').value;
  $('#allowanceInfo').textContent = `한글: ${REWARD.ko}원 / 영어: ${REWARD.en}원 (정답 1개당) — 현재: ${lang==='ko'?'한글':''}${lang==='en'?'영어':''}`;
}

function refreshGrades(){
  const lang = $('#lang').value;
  const g = $('#grade');
  const entries = Object.keys(DATA_MAP[lang]||{});
  g.innerHTML = entries.map(k=>`<option value="${k}">${k}</option>`).join('');
}

async function safeLoadCurrentData(){
  try{
    await loadData($('#lang').value, $('#grade').value);
  }catch(e){
    console.error(e);
    alert('문제 데이터를 불러오는 중 오류가 발생했습니다. data 폴더와 JSON 파일을 확인해 주세요.');
  }
}
