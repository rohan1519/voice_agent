/* ─────────────────────────────────────────────────────────────────
   AI Interview Agent — Junior SDE Screener
   Stack: Web Speech API (STT/TTS) + Vercel Serverless Backend
   Voice path: browser-native (zero-cost, unlimited)
───────────────────────────────────────────────────────────────── */

'use strict';

// ── Constants ──────────────────────────────────────────────────────────

const COMPETENCIES = [
  'problem_solving',
  'data_structures',
  'debugging_approach',
  'code_quality_and_communication',
];

const COMPETENCY_LABELS = {
  problem_solving:               'Problem Solving',
  data_structures:               'Data Structures',
  debugging_approach:            'Debugging Approach',
  code_quality_and_communication:'Code Quality & Communication',
};

const SCORE_LABELS = { 5:'Exceptional', 4:'Strong', 3:'Adequate', 2:'Weak', 1:'Missing' };

// ── Voice output UI states ─────────────────────────────────────────────

const UI_STATE = { IDLE:'idle', LISTENING:'listening', THINKING:'thinking', SPEAKING:'speaking' };

// ── Text → Speech cleanup ──────────────────────────────────────────────

function sanitizeForSpeech(text) {
  return text
    .replace(/[*_#`~]/g, '')
    .replace(/^\d+\.\s/gm, '')
    .replace(/^[-•–]\s/gm, '')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────
// UI layer
// ─────────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const els = {
  // Setup screen
  setupScreen:       $('setup-screen'),
  startBtn:          $('start-btn'),
  // Interview screen
  interviewScreen:   $('interview-screen'),
  statusDot:         $('status-dot'),
  statusText:        $('status-text'),
  timerEl:           $('timer'),
  progressBar:       $('progress-bar'),
  topicBadges:       $('topic-badges'),
  waveform:          $('waveform'),
  stateLabel:        $('state-label'),
  micBtn:            $('mic-btn'),
  micIcon:           $('mic-icon'),
  stopIcon:          $('stop-icon'),
  spinnerIcon:       $('spinner-icon'),
  transcript:        $('transcript'),
  liveTranscript:    $('live-transcript'),
  endBtn:            $('end-btn'),
  browserWarn:       $('browser-warn'),
  // Scorecard screen
  scorecardScreen:   $('scorecard-screen'),
  scorecardContent:  $('scorecard-content'),
  newSessionBtn:     $('new-session-btn'),
};

// ── App state ──────────────────────────────────────────────────────────

let uiState          = UI_STATE.IDLE;
let conversationHistory = [];   // {role, content}[] — full transcript
let interviewState   = getInitialState();
let sessionStartMs   = null;
let sessionTimerRef  = null;
let recognition      = null;
let isSpeaking       = false;
const synth          = window.speechSynthesis;

function getInitialState() {
  return {
    phase: 'pre-interview',
    competencyIndex: 0,
    turnsOnTopic: 0,
    rephraseUsed: false,
    totalTurns: 0,
    coveredTopics: []
  };
}

// ── Voice recognition setup ────────────────────────────────────────────

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function initRecognition() {
  if (!SpeechRecognition) {
    els.browserWarn.classList.remove('hidden');
    return false;
  }
  recognition = new SpeechRecognition();
  recognition.continuous      = false;
  recognition.interimResults  = true;
  recognition.lang            = 'en-US';
  recognition.maxAlternatives = 1;

  recognition.onresult = (e) => {
    let interim = '';
    let final   = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    if (interim) els.liveTranscript.textContent = interim;
    if (final)   onCandidateFinishedSpeaking(final.trim());
  };

  recognition.onerror = (e) => {
    console.warn('Recognition error:', e.error);
    if (e.error === 'no-speech') {
      els.liveTranscript.textContent = 'No speech detected — try again.';
      setTimeout(() => { els.liveTranscript.textContent = ''; }, 2500);
    }
    setUIState(UI_STATE.IDLE);
  };

  recognition.onend = () => {
    if (uiState === UI_STATE.LISTENING) setUIState(UI_STATE.IDLE);
  };

  return true;
}

// ── UI state machine ───────────────────────────────────────────────────

function setUIState(state) {
  uiState = state;

  els.waveform.className = 'waveform ' + (
    state === UI_STATE.LISTENING ? 'listening' :
    state === UI_STATE.SPEAKING  ? 'speaking'  : ''
  );

  if (state === UI_STATE.LISTENING || state === UI_STATE.SPEAKING) {
    document.querySelectorAll('.bar').forEach(bar => {
      bar.style.setProperty('--h', `${8 + Math.random() * 28}px`);
    });
  }

  els.micBtn.className = 'mic-btn ' + (
    state === UI_STATE.LISTENING ? 'listening'  :
    state === UI_STATE.THINKING  ? 'processing' :
    state === UI_STATE.SPEAKING  ? 'speaking'   : ''
  );

  els.micIcon.classList.toggle('hidden',    state !== UI_STATE.IDLE);
  els.stopIcon.classList.toggle('hidden',   state !== UI_STATE.LISTENING);
  els.spinnerIcon.classList.toggle('hidden',
    state !== UI_STATE.THINKING && state !== UI_STATE.SPEAKING);

  const statusMap = {
    [UI_STATE.IDLE]:      ['Ready — tap mic to answer', ''],
    [UI_STATE.LISTENING]: ['Listening…', 'active'],
    [UI_STATE.THINKING]:  ['Alex is thinking…', 'processing'],
    [UI_STATE.SPEAKING]:  ['Alex is speaking…', 'speaking'],
  };
  const [text, dotClass] = statusMap[state];
  els.statusText.textContent = text;
  els.statusDot.className = 'status-dot ' + dotClass;

  const stateLabels = {
    [UI_STATE.IDLE]:      'Press to answer',
    [UI_STATE.LISTENING]: 'Listening — speak now',
    [UI_STATE.THINKING]:  'Processing your answer…',
    [UI_STATE.SPEAKING]:  'Alex is responding',
  };
  els.stateLabel.textContent = stateLabels[state];

  els.micBtn.disabled = state === UI_STATE.THINKING;
}

// ── Topic progress badges ──────────────────────────────────────────────

function updateTopicBadges() {
  els.topicBadges.innerHTML = '';
  COMPETENCIES.forEach((key, i) => {
    const badge = document.createElement('div');
    badge.className = 'topic-badge';

    if (interviewState.coveredTopics.includes(key)) {
      badge.classList.add('done');
    } else if (i === interviewState.competencyIndex) {
      badge.classList.add('active');
    }

    badge.textContent = COMPETENCY_LABELS[key];
    els.topicBadges.appendChild(badge);
  });
}

// ── Session timer ──────────────────────────────────────────────────────

function startSessionTimer() {
  sessionStartMs = Date.now();
  sessionTimerRef = setInterval(() => {
    const secs = Math.floor((Date.now() - sessionStartMs) / 1000);
    const m = Math.floor(secs / 60);
    const s = String(secs % 60).padStart(2, '0');
    els.timerEl.textContent = `${m}:${s}`;

    // Progress bar: 10 min = 600s
    const pct = Math.min(100, (secs / 600) * 100);
    els.progressBar.style.width = pct + '%';
    if (pct > 80) els.progressBar.classList.add('urgent');
  }, 1000);
}

function stopSessionTimer() {
  clearInterval(sessionTimerRef);
}

function elapsedMinutes() {
  if (!sessionStartMs) return 0;
  return Math.round((Date.now() - sessionStartMs) / 60000);
}

// ── Transcript rendering ───────────────────────────────────────────────

function appendTranscriptTurn(role, text) {
  const empty = els.transcript.querySelector('.transcript-empty');
  if (empty) empty.remove();

  const turn = document.createElement('div');
  turn.className = `turn ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'turn-avatar';
  avatar.textContent = role === 'user' ? 'You' : 'AI';

  const body = document.createElement('div');
  body.className = 'turn-body';

  const roleLabel = document.createElement('div');
  roleLabel.className = 'turn-role';
  roleLabel.textContent = role === 'user' ? 'You (Candidate)' : 'Alex (Interviewer)';

  const textEl = document.createElement('div');
  textEl.className = 'turn-text';
  textEl.textContent = text;

  body.append(roleLabel, textEl);
  turn.append(avatar, body);
  els.transcript.append(turn);
  els.transcript.scrollTop = els.transcript.scrollHeight;
}

// ── Speech synthesis ───────────────────────────────────────────────────

function speak(text, onDone) {
  synth.cancel();
  setUIState(UI_STATE.SPEAKING);
  isSpeaking = true;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate   = 1.0;
  utterance.pitch  = 1.0;
  utterance.volume = 1;
  utterance.lang   = 'en-US';

  const voices = synth.getVoices();
  // Prefer a natural, non-Google en-US voice
  const preferred =
    voices.find(v => /en-US/i.test(v.lang) && !/Google/i.test(v.name)) ||
    voices.find(v => /en/i.test(v.lang)) ||
    null;
  if (preferred) utterance.voice = preferred;

  utterance.onend = () => {
    isSpeaking = false;
    setUIState(UI_STATE.IDLE);
    onDone?.();
  };

  utterance.onerror = () => {
    isSpeaking = false;
    setUIState(UI_STATE.IDLE);
    onDone?.();
  };

  synth.speak(utterance);
  if (synth.paused) synth.resume(); // Safari fix
}

function stopSpeaking() {
  synth.cancel();
  isSpeaking = false;
  setUIState(UI_STATE.IDLE);
}

// ── Mic button ─────────────────────────────────────────────────────────

els.micBtn.addEventListener('click', () => {
  if (uiState === UI_STATE.IDLE) {
    startListening();
  } else if (uiState === UI_STATE.LISTENING) {
    recognition?.stop();
    setUIState(UI_STATE.IDLE);
  } else if (uiState === UI_STATE.SPEAKING) {
    stopSpeaking();
  }
});

function startListening() {
  if (!recognition) return;
  synth.cancel();
  els.liveTranscript.textContent = '';
  setUIState(UI_STATE.LISTENING);
  try {
    recognition.start();
  } catch (e) {
    console.warn('Recognition start error:', e);
    setUIState(UI_STATE.IDLE);
  }
}

// ── Core conversation loop ─────────────────────────────────────────────

async function onCandidateFinishedSpeaking(text) {
  if (!text || text.length < 2) {
    setUIState(UI_STATE.IDLE);
    return;
  }

  els.liveTranscript.textContent = '';
  appendTranscriptTurn('user', text);
  conversationHistory.push({ role: 'user', content: text });

  setUIState(UI_STATE.THINKING);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: conversationHistory,
        stateData: interviewState,
        isKickoff: false
      })
    });
    
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 429) throw new Error('RATE_LIMIT');
      throw new Error(data.error || 'Server error');
    }
    
    // Update local state from server
    Object.assign(interviewState, data.state);
    updateTopicBadges();

    const reply = sanitizeForSpeech(data.reply);
    conversationHistory.push({ role: 'assistant', content: reply });
    appendTranscriptTurn('assistant', reply);

    speak(reply, () => {
      if (data.isDone) {
        stopSessionTimer();
        generateScorecard();
      }
    });
  } catch (err) {
    console.error('Chat error:', err);
    let fallback = 'Sorry, I had a connection issue. Could you repeat that?';
    if (err.message === 'RATE_LIMIT') {
      fallback = 'This demo is receiving high traffic right now, please try again shortly.';
    }
    appendTranscriptTurn('assistant', fallback);
    speak(fallback);
  }
}

// ── Opening kickoff ────────────────────────────────────────────────────

async function kickoffInterview() {
  setUIState(UI_STATE.THINKING);
  startSessionTimer();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Start the interview now with your opening line.' }],
        stateData: interviewState,
        isKickoff: true
      })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Server error');
    
    Object.assign(interviewState, data.state);
    updateTopicBadges();

    const opening = sanitizeForSpeech(data.reply);
    conversationHistory.push({ role: 'assistant', content: opening });
    appendTranscriptTurn('assistant', opening);
    speak(opening);
  } catch (err) {
    console.error('Opening failed:', err);
    const fallback = "Hi, I'm Alex — thanks for making time today. Let's dive right in. How would you find a duplicate in an array of integers?";
    conversationHistory.push({ role: 'assistant', content: fallback });
    appendTranscriptTurn('assistant', fallback);
    speak(fallback);
  }
}

// ── Scorecard generation ───────────────────────────────────────────────

async function generateScorecard() {
  showScreen('scorecard');
  els.scorecardContent.innerHTML = `
    <div class="scorecard-loading">
      <div class="spinner-large"></div>
      <p>Alex is reviewing your interview…</p>
    </div>`;

  try {
    const controller = new AbortController();
    // Vercel hobby tier default is 10s (max 60s). Assuming standard 10-15s range,
    // we use 13s to timeout just before a 15s edge or right after a 10s gateway timeout.
    const timeoutId = setTimeout(() => controller.abort(), 13000);

    const res = await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: conversationHistory,
        durationMinutes: elapsedMinutes()
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    const scorecard = await res.json();
    if (!res.ok) throw new Error(scorecard.error || 'Server error');
    
    if (!scorecard || !scorecard.competencies) {
      throw new Error("We couldn't generate your evaluation. Please try again.");
    }
    
    renderScorecard(scorecard);
  } catch (err) {
    console.error('Scorecard generation failed:', err);
    let errorMsg = err.message;
    if (err.name === 'AbortError') {
      errorMsg = "The evaluation is taking longer than expected. Please try again.";
    }
    
    els.scorecardContent.innerHTML = `
      <div class="scorecard-error">
        <h3>Couldn't generate scorecard</h3>
        <p>${errorMsg}</p>
        <p>
          The full transcript is saved in the session.
          <br><br>
          <button id="retry-evaluate-btn" class="btn">Retry Evaluation</button>
        </p>
      </div>`;
      
    document.getElementById('retry-evaluate-btn')?.addEventListener('click', () => {
      generateScorecard();
    });
  }
}

// ── Render scorecard ───────────────────────────────────────────────────

function renderScorecard(sc) {
  const recClass = {
    STRONG_HIRE: 'rec-strong',
    HIRE:        'rec-hire',
    HOLD:        'rec-hold',
    NO_HIRE:     'rec-no',
  }[sc.overall_recommendation] || '';

  const competencyHTML = Object.entries(sc.competencies)
    .map(([key, c]) => `
      <div class="competency-card">
        <div class="competency-header">
          <span class="competency-name">${COMPETENCY_LABELS[key] || key}</span>
          <div class="score-badge score-${c.score}">${c.score}/5 — ${SCORE_LABELS[c.score] || ''}</div>
        </div>
        <div class="score-bar-wrap">
          <div class="score-bar" style="width:${(c.score / 5) * 100}%"></div>
        </div>
        ${c.evidence ? `<blockquote class="evidence">"${c.evidence}"</blockquote>` : ''}
        ${c.strengths?.length ? `<p class="strength-list"><strong>Strengths:</strong> ${c.strengths.join(' · ')}</p>` : ''}
        ${c.concerns?.length  ? `<p class="concern-list"><strong>Concerns:</strong> ${c.concerns.join(' · ')}</p>` : ''}
      </div>`)
    .join('');

  const redFlagsHTML = sc.red_flags?.length
    ? `<div class="flags-section">
        <h4>⚠ Red Flags</h4>
        <ul>${sc.red_flags.map(f => `<li>${f}</li>`).join('')}</ul>
       </div>`
    : '';

  const positivesHTML = sc.notable_positives?.length
    ? `<div class="positives-section">
        <h4>★ Notable Positives</h4>
        <ul>${sc.notable_positives.map(p => `<li>${p}</li>`).join('')}</ul>
       </div>`
    : '';

  els.scorecardContent.innerHTML = `
    <div class="scorecard-header">
      <div>
        <h2>Evaluation Complete</h2>
        <p class="scorecard-meta">${sc.role} · ${sc.interview_duration_minutes} min · Overall: ${sc.overall_score}/5</p>
      </div>
      <div class="recommendation ${recClass}">${sc.overall_recommendation.replace('_', ' ')}</div>
    </div>

    <div class="scorecard-summary">
      <p>${sc.summary}</p>
    </div>

    <div class="competencies-grid">
      ${competencyHTML}
    </div>

    ${redFlagsHTML}
    ${positivesHTML}

    <div class="scorecard-json-toggle">
      <button id="toggle-json" class="btn-ghost">View raw JSON</button>
      <pre id="raw-json" class="raw-json hidden">${JSON.stringify(sc, null, 2)}</pre>
    </div>`;

  $('toggle-json')?.addEventListener('click', () => {
    $('raw-json')?.classList.toggle('hidden');
  });
}

// ── Screen switching ───────────────────────────────────────────────────

function showScreen(name) {
  els.setupScreen.classList.toggle('hidden',    name !== 'setup');
  els.interviewScreen.classList.toggle('hidden', name !== 'interview');
  els.scorecardScreen.classList.toggle('hidden', name !== 'scorecard');
}

// ── End interview early ────────────────────────────────────────────────

els.endBtn.addEventListener('click', () => {
  if (uiState === UI_STATE.LISTENING) recognition?.stop();
  stopSpeaking();
  stopSessionTimer();
  interviewState.phase = 'done';
  generateScorecard();
});

// ── New session ────────────────────────────────────────────────────────

els.newSessionBtn.addEventListener('click', () => {
  conversationHistory = [];
  interviewState = getInitialState();
  synth.cancel();
  els.transcript.innerHTML = `
    <div class="transcript-empty">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
      <span>Interview transcript will appear here</span>
    </div>`;
  els.liveTranscript.textContent = '';
  els.timerEl.textContent = '0:00';
  els.progressBar.style.width = '0%';
  els.progressBar.classList.remove('urgent');
  showScreen('setup');
  setUIState(UI_STATE.IDLE);
});

// ── Waveform animation ────────────────────────────────────────────────

setInterval(() => {
  if (uiState === UI_STATE.LISTENING || uiState === UI_STATE.SPEAKING) {
    document.querySelectorAll('.bar').forEach(bar => {
      bar.style.setProperty('--h', `${6 + Math.random() * 32}px`);
    });
  }
}, 350);

// ── Start setup ──────────────────────────────────────────────

els.startBtn.addEventListener('click', () => {
  if (!initRecognition()) return;
  showScreen('interview');
  setUIState(UI_STATE.IDLE);
  kickoffInterview();
});

// ── Boot ───────────────────────────────────────────────────────────────

window.addEventListener('load', () => {
  showScreen('setup');
});
