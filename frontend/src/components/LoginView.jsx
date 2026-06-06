import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as api from '../services/api';
import { loadVlmModel, solveCaptcha, isVlmAvailable, isVlmLoading } from '../services/vlmSolver';

export default function LoginView({ initialRollno, config, onSuccess }) {
  const [rollnoVal, setRollnoVal] = useState(initialRollno || localStorage.getItem('nsut_rollno') || config.default_rollno || '');
  const [password, setPassword] = useState(localStorage.getItem('nsut_portal_password') || config.default_password || '');
  const [rememberPwd, setRememberPwd] = useState(!!localStorage.getItem('nsut_portal_password'));
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [captchaImg, setCaptchaImg] = useState(null);
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaIssuedAt, setCaptchaIssuedAt] = useState(0);
  const [error, setError] = useState('');
  const [ocrProgress, setOcrProgress] = useState('');
  const [ocrRunning, setOcrRunning] = useState(false);
  const [vlmStatus, setVlmStatus] = useState('idle');
  const autoOcrTried = useRef(false);

  const handleLogin = useCallback(async () => {
    if (!rollnoVal || !password) {
      setError('Roll number and password required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api.login(rollnoVal, password);
      if (data.success) {
        const sid = data.session_id;
        setSessionId(sid);
        localStorage.setItem('nsut_rollno', data.rollno || rollnoVal);
        if (rememberPwd && password) {
          localStorage.setItem('nsut_portal_password', password);
        } else {
          localStorage.removeItem('nsut_portal_password');
        }
        if (data.cookie_reused) {
          const scrapeData = await api.submitCaptcha(sid, '', { rollno: rollnoVal, password });
          if (scrapeData.success) {
            onSuccess(sid, scrapeData.data, data.rollno || rollnoVal);
          } else {
            setLoading(false);
            setError(scrapeData.message || 'Session expired');
          }
        } else {
          setCaptchaImg(data.captcha_base64);
          setCaptchaIssuedAt(Date.now());
          setLoading(false);
        }
      } else {
        setLoading(false);
        setError(data.message || 'Login failed');
      }
    } catch (e) {
      setLoading(false);
      setError('Network error: ' + e.message);
    }
  }, [rollnoVal, password, rememberPwd, onSuccess]);

  const handleVerify = useCallback(async () => {
    if (!sessionId || !captchaInput.trim()) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.submitCaptcha(sessionId, captchaInput.trim(), { rollno: rollnoVal, password });
      if (data.success) {
        onSuccess(sessionId, data.data, rollnoVal);
      } else {
        setLoading(false);
        if (data.retryable && data.captcha_base64) {
          setCaptchaImg(data.captcha_base64);
          setCaptchaIssuedAt(Date.now());
        }
        setError(data.message || 'Verification failed');
      }
    } catch (e) {
      setLoading(false);
      setError('Error: ' + e.message);
    }
  }, [sessionId, captchaInput, rollnoVal, password, onSuccess]);

  const handleRefreshCaptcha = useCallback(async () => {
    if (!sessionId) return;
    try {
      const data = await api.refreshCaptcha(sessionId);
      if (data.success && data.captcha_base64) {
        setCaptchaImg(data.captcha_base64);
        setCaptchaInput('');
        setCaptchaIssuedAt(Date.now());
      }
    } catch {}
  }, [sessionId]);

  const handleOcr = useCallback(async () => {
    if (!sessionId || ocrRunning) return;
    setOcrRunning(true);
    setOcrProgress('⏳ OCR attempt 1/3...');
    try {
      const data = await api.submitCaptcha(sessionId, '', { autoOcr: true, rollno: rollnoVal, password });
      if (data.success) {
        setOcrProgress('✅ OCR succeeded!');
        onSuccess(sessionId, data.data, rollnoVal);
      } else {
        const lines = data.ocr_attempts
          ? ['❌ OCR failed. Attempts:', ...data.ocr_attempts.map((t, i) => `  ${i+1}. "${t || 'empty'}"`), `Result: ${data.message}`]
          : ['❌ ' + (data.message || 'OCR failed')];
        setOcrProgress(lines.join('\n'));
        if (data.retryable && data.captcha_base64) {
          setCaptchaImg(data.captcha_base64);
          setCaptchaIssuedAt(Date.now());
        }
        setOcrRunning(false);
      }
    } catch (e) {
      setOcrProgress('❌ OCR error: ' + e.message);
      setOcrRunning(false);
    }
  }, [sessionId, rollnoVal, password, onSuccess, ocrRunning]);

  const handleVlmSolve = useCallback(async () => {
    if (!captchaImg) return;
    setVlmStatus('loading');
    setError('');

    try {
      const ready = isVlmAvailable() || await loadVlmModel((pct) => {
        setVlmStatus(`downloading: ${(pct * 100).toFixed(0)}%`);
      });

      if (!ready) {
        setVlmStatus('failed');
        setError('VLM model could not be loaded. Check browser console for details.');
        return;
      }

      setVlmStatus('solving');
      const digits = await solveCaptcha(captchaImg);
      if (digits) {
        setCaptchaInput(digits);
        setVlmStatus('solved');
        setTimeout(() => handleVerify(), 300);
      } else {
        setVlmStatus('failed');
        setError('VLM could not read the CAPTCHA. Try OCR or manual entry.');
      }
    } catch (e) {
      setVlmStatus('failed');
      setError('VLM error: ' + e.message);
    }
  }, [captchaImg, handleVerify]);

  useEffect(() => {
    if (captchaIssuedAt && Date.now() - captchaIssuedAt > 45000) {
      handleRefreshCaptcha();
    }
  }, [captchaIssuedAt, handleRefreshCaptcha, captchaInput]);

  const captchaArea = captchaImg ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
      <img src={captchaImg} alt="CAPTCHA" style={{ borderRadius: 8, border: '1px solid var(--glass-border)' }} />
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Enter Captcha"
          value={captchaInput}
          onChange={(e) => setCaptchaInput(e.target.value)}
          style={{ flex: 1 }}
        />
        <button onClick={handleRefreshCaptcha} style={{ flex: 0, padding: '0.5rem 1rem', background: 'rgba(255,220,120,0.25)', border: '1px solid rgba(255,220,120,0.5)', cursor: 'pointer', borderRadius: 8, color: '#ffd166', fontWeight: 'bold' }}>
          ↻
        </button>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button onClick={handleVerify} disabled={loading || !captchaInput.trim()} style={{ flex: 1 }}>
          {loading ? <span><span className="loader" style={{ width: 16, height: 16, borderWidth: 2, marginRight: 6 }} /> Verifying...</span> : 'Verify & Deep Scrape'}
        </button>
        <button onClick={handleOcr} disabled={ocrRunning} style={{ padding: '0.5rem 1rem', background: 'rgba(100,200,255,0.3)', border: '1px solid rgba(100,200,255,0.5)', cursor: 'pointer', borderRadius: 8, color: '#64c8ff', fontWeight: 'bold' }}>
          {ocrRunning ? '⏳ OCR...' : '🤖 OCR'}
        </button>
        <button
          onClick={handleVlmSolve}
          disabled={vlmStatus === 'loading' || vlmStatus === 'solving'}
          style={{ padding: '0.5rem 1rem', background: vlmStatus === 'solved' ? 'rgba(45,212,191,0.3)' : 'rgba(168,85,247,0.3)', border: `1px solid ${vlmStatus === 'solved' ? 'rgba(45,212,191,0.5)' : 'rgba(168,85,247,0.5)'}`, cursor: 'pointer', borderRadius: 8, color: vlmStatus === 'solved' ? '#99f6e4' : '#c084fc', fontWeight: 'bold' }}
          title="Use on-device AI vision model to read CAPTCHA"
        >
          {vlmStatus === 'loading' ? '⏳ Loading AI...' :
           vlmStatus === 'downloading' ? '⬇️ Downloading...' :
           vlmStatus === 'solving' ? '🧠 Solving...' :
           vlmStatus === 'solved' ? '✅ Solved' :
           vlmStatus === 'failed' ? '🔄 Retry AI' :
           '🧠 AI Solve'}
        </button>
      </div>
      {ocrProgress && (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', background: 'rgba(100,200,255,0.1)', border: '1px solid rgba(100,200,255,0.2)', borderRadius: 8, padding: '0.5rem 1rem', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
          {ocrProgress}
        </div>
      )}
      {error && (
        <div style={{ color: '#ff6b6b', background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: 8, padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}
      <small style={{ color: 'var(--accent)' }}>Enter the CAPTCHA numbers, click 🤖 OCR to auto-read, or 🧠 AI Solve for on-device vision model.</small>
    </div>
  ) : null;

  return (
    <div className="glass-panel auth-container">
      <h1>Attendance Assistant</h1>
      <p style={{ color: 'var(--text-secondary)' }}>Connect once, then use the cached assistant workspace.</p>
      <div className="input-group">
        <input type="text" placeholder="Roll number" value={rollnoVal} onChange={(e) => setRollnoVal(e.target.value)} />
      </div>
      <div className="input-group password-wrapper">
        <input type={showPwd ? 'text' : 'password'} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="button" className="password-toggle" onClick={() => setShowPwd(!showPwd)} title={showPwd ? 'Hide password' : 'Show password'}>
          {showPwd ? '🙈' : '👁'}
        </button>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={rememberPwd} onChange={(e) => setRememberPwd(e.target.checked)} />
        <span>Remember password on this device</span>
      </label>
      <button onClick={handleLogin} disabled={loading}>
        {loading ? <span><span className="loader" style={{ width: 16, height: 16, borderWidth: 2, marginRight: 6 }} /> Connecting...</span> : 'Connect to Portal'}
      </button>
      {captchaArea}
    </div>
  );
}
