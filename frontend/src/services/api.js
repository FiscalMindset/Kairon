const BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export async function fetchConfig() {
  const res = await fetch(`${BASE}/config`);
  if (!res.ok) throw new Error('Config unavailable');
  return res.json();
}

export async function login(rollno, password) {
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rollno, password }),
  });
  return res.json();
}

export async function checkCache(rollno) {
  const res = await fetch(`${BASE}/check_cache`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rollno }),
  });
  return res.json();
}

export async function submitCaptcha(sessionId, captcha, { autoOcr, rollno, password } = {}) {
  const res = await fetch(`${BASE}/captcha`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      captcha,
      auto_ocr: autoOcr || false,
      cookie_reuse: !captcha && !autoOcr,
      rollno,
      password,
    }),
  });
  return res.json();
}

export async function refreshCaptcha(sessionId) {
  const res = await fetch(`${BASE}/captcha/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  return res.json();
}

export async function sendChat(sessionId, message) {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, message }),
  });
  return res.json();
}

export async function getAnalysis(sessionId) {
  const res = await fetch(`${BASE}/analysis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  return res.json();
}
