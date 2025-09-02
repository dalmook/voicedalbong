// ===== 설정 =====
const DATA_MAP = {
  ko: { G1: 'data/ko_G1.json', G2: 'data/ko_G2.json' },
  en: { G1: 'data/en_G1.json', G2: 'data/en_G2.json' },
};
const REWARD = { ko: 100, en: 200 };
const STORAGE_KEY = 'dictation_records_v1';
const LAST_KEY = 'dictation_last_selection_v1';

let voices = [];
let pool = [];
let session = { list: [], idx: 0, score: 0, money: 0, lang: 'ko', grade: 'G1', n: 10 };

const $ = (id) => document.getElementById(id);
const fmtKRW = (n) => `${n.toLocaleString('ko-KR')}원`;
const nowStr = () => new Date().toLocaleString();

// 기록 관리
function getRecords(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }catch{ return {}; } }
function setRecords(r){ localStorage.setItem(STORAGE_KEY, JSON.stringify(r)); }
function clearRecords(){ localStorage.removeItem(STORAGE_KEY); }

function saveLastSelection(name, lang, grade){
  localStorage.setItem(LAST_KEY, JSON.stringify({ name, lang, grade }));
}
function loadLastSelection(){
  try { return JSON.parse(localStorage.getItem(LAST_KEY)) || null; } catch { return null; }
}

// 음성 합성
function loadVoices(){ voices = window.speechSynthesis.getVoices(); fillVoiceSelect(); }
function pickDefaultVoice(lang){
  const prefix = lang==='en' ? 'en' : 'ko';
  return voices.find(v => v.lang && v.lang.toLowerCase().startsWith(prefix));
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
function speak(text, lang){
  if(!('speechSynthesis' in window)){ alert('브라우저가 음성 합성을 지원하지 않습니다.'); return; }
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

// 데이터
async function loadData(lang, grade){
  const path = DATA_MAP[lang]?.[grade];
  if(!path) throw new Error('데이터 경로가 없습니다.');
  const res = await fetch(path, { cache: 'no-store' });
  if(!res.ok) throw new Error(`데이터 로드 실패: ${path}`);
  const json = await res.json();
  if(!Array.isArray(json.items)) throw new Error('데이터 형식 오류');
  pool = json.items.slice();
}

function refreshGrades(){
  const lang = $('#lang').value;
  const g = $('#grade');
  const entries = Object.keys(DATA_MAP[lang]||{});
  // 옵션 채우기
  g.innerHTML = entries.map(k=>`<option value="${k}">${k}</option>`).join('');
  // 기본 선택값 보정: 기존 값이 없거나 목록에 없으면 첫 항목으로 고정
  const first = entries[0];
  if(!g.value || !entries.includes(g.value)){
    g.value = first || '';
  }
  return g.value; // 현재 선택된 급수 반환
}

// 세션 제어 (생략: 기존 코드 유지)
// ... checkAnswer, nextQuestion, updateSummaries 등 기존 로직 동일

// 초기화
window.addEventListener('DOMContentLoaded', async ()=>{
  // 급수 목록 채우기
  let selGrade;
  refreshGrades();
  const last = loadLastSelection();
  if(last){
    $('#childName').value = last.name || '';
    $('#lang').value = last.lang || 'ko';
    selGrade = refreshGrades();
    if(last.grade && Array.from($('#grade').options).some(o=>o.value===last.grade)){
      $('#grade').value = last.grade;
      selGrade = last.grade;
    }
  } else {
    selGrade = refreshGrades();
  }
  updateAllowanceInfo();
  updateSummaries();

  // 음성
  loadVoices();
  if(typeof speechSynthesis !== 'undefined'){
    speechSynthesis.onvoiceschanged = loadVoices;
  }

  // 데이터 선로드 (언어/급수 모두 확정된 뒤 호출)
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
  const last = loadLastSelection();
  if(last){
    $('#childName').value = last.name || '';
    $('#lang').value = last.lang || 'ko';
    refreshGrades();
    if(last.grade && DATA_MAP[last.lang]?.[last.grade]){
      $('#grade').value = last.grade;
    }
  }
  loadVoices();
  if(typeof speechSynthesis !== 'undefined') speechSynthesis.onvoiceschanged = loadVoices;
  await safeLoadCurrentData();
});

async function safeLoadCurrentData(){
  try{ await loadData($('#lang').value, $('#grade').value); }
  catch(e){ console.error(e); alert('데이터 불러오기 실패'); }
}
