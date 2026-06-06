import React, { useState, useRef, useEffect, useCallback } from 'react';
import Dashboard from './Dashboard';
import * as api from '../services/api';

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function markdownToHtml(markdown) {
  let html = markdown.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  if (html.includes('|')) {
    const lines = html.split('<br>');
    let inTable = false;
    let tableHtml = '<table style="width:100%;border-collapse:collapse;margin-top:10px">';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('|')) {
        inTable = true;
        if (line.includes('---')) { lines[i] = ''; continue; }
        const cells = line.split('|').filter(c => c.trim() !== '');
        tableHtml += '<tr>' + cells.map(c => `<td style="border:1px solid var(--glass-border);padding:8px">${c.trim()}</td>`).join('') + '</tr>';
        lines[i] = '';
      } else if (inTable) {
        inTable = false;
        tableHtml += '</table>';
        lines[i] = tableHtml + '<br>' + lines[i];
        tableHtml = '';
      }
    }
    if (inTable) tableHtml += '</table>';
    html = lines.filter(l => l !== '').join('<br>');
    if (inTable) html += tableHtml;
  }
  return html;
}

const QUICK_CHIPS = ['HI', 'SW', 'TOTAL', 'ABSENT', 'SAFE', 'RISK', 'PLAN', 'PROFILE', 'SEMESTERS', 'CODES'];

function Message({ role, content }) {
  if (role === 'ad') {
    const ad = content;
    const isPink = ad.color === 'pink';
    return (
      <a href={ad.url} target="_blank" rel="noopener noreferrer" className={`message-ad ${isPink ? 'ad-pink' : 'ad-blue'}`}>
        <span className="message-ad-badge">{isPink ? 'Sponsored' : 'Promoted'}</span>
        <span className="message-ad-emoji">{ad.emoji}</span>
        <div className="message-ad-body">
          <strong className="message-ad-title">{ad.title}</strong>
          <span className="message-ad-desc">{ad.desc}</span>
          <span className="message-ad-cta">{isPink ? 'Claim →' : 'Follow →'}</span>
        </div>
      </a>
    );
  }
  const html = role === 'bot' ? markdownToHtml(content) : escapeHtml(content);
  return (
    <div className={`message ${role}`} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

export default function ChatView({ sessionId, rollno, analysis, onLogout }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [thinking, setThinking] = useState(false);
  const msgsRef = useRef(null);

  useEffect(() => {
    if (analysis && messages.length === 0) {
      const insights = analysis.insights || {};
      const student = analysis.student || {};
      const studentName = student.name || 'Attendance Assistant';
      const semesters = new Set((analysis.attendance || []).map(s => s.semester).filter(Boolean));
      const semesterStr = semesters.size ? ` (Sem: ${[...semesters].join(', ')})` : '';
      const greeting = `Welcome back! I've loaded your attendance data.\n\n**${studentName}** — ${insights.overall_percentage || 0}% overall${semesterStr}\n\nType **HI** for a summary, **PLAN** for attendance priorities, **PROFILE** for student info, **CODES** for shortcuts, or ask a subject code like **MEMEC303**.`;
      setMessages([{ role: 'bot', content: greeting }]);
    }
  }, [analysis]);

  useEffect(() => {
    setTimeout(() => {
      if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
    }, 80);
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
    }, 50);
  }, []);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || sending) return;
    setSending(true);
    setThinking(true);
    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    const thinkingTimeout = setTimeout(() => {
      setMessages(prev => [...prev, { role: 'bot', content: '*Still thinking...*' }]);
    }, 5000);

    const ads = [
      { title: 'Slice Card — ₹200 Free', desc: 'Use code VICKY72764 at signup & get ₹200 cashback.', url: 'https://slice.bank.in/t?c=1S4jZ0e&ic=VICKY72764', emoji: '💳', color: 'pink' },
      { title: 'GitHub — @fiscalmindset', desc: 'Open-source projects, AI tools, full-stack apps.', url: 'https://github.com/fiscalmindset', emoji: '🧑‍💻', color: 'blue' },
    ];
    const ad = ads[Math.floor(Math.random() * ads.length)];

    try {
      const data = await api.sendChat(sessionId, text);
      clearTimeout(thinkingTimeout);
      setMessages(prev => prev.filter(m => m.content !== '*Still thinking*...'));
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'bot', content: data.reply }]);
      }
      setMessages(prev => [...prev, { role: 'ad', content: ad }]);
    } catch {
      clearTimeout(thinkingTimeout);
      setMessages(prev => prev.filter(m => m.content !== '*Still thinking...*'));
      setMessages(prev => [...prev, { role: 'bot', content: 'Error connecting to server.' }]);
      setMessages(prev => [...prev, { role: 'ad', content: ads[0] }]);
    } finally {
      setSending(false);
      setThinking(false);
    }
  }, [sessionId, sending]);

  const student = analysis?.student || {};
  const source = analysis?.source || {};
  const insights = analysis?.insights || {};
  const studentName = student.name || 'Attendance Assistant';
  const headerMeta = insights.overall_percentage != null
    ? `${insights.overall_percentage}% - ${insights.total_attended}/${insights.total_classes} - ${insights.total_absent} absent`
    : 'Smart attendance workspace';

  const photoData = student.photo_base64;
  const hasPhoto = photoData && (photoData.startsWith('data:image/') || photoData.startsWith('/'));
  const initials = (studentName || 'AA').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
  const avatarHtml = hasPhoto
    ? `<img class="student-avatar-img" src="${escapeAttr(photoData)}" alt="${escapeAttr(studentName)}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.35)" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'" /><div class="student-avatar" style="display:none;width:44px;height:44px;border-radius:50%;place-items:center;background:linear-gradient(135deg,rgba(59,130,246,0.95),rgba(20,184,166,0.9));color:white;font-weight:800">${initials}</div>`
    : `<div class="student-avatar" style="width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,rgba(59,130,246,0.95),rgba(20,184,166,0.9));color:white;font-weight:800">${initials}</div>`;

  return (
    <div className="glass-panel chat-container workspace-container">
      <div className="chat-header">
        <div className="student-heading">
          <div dangerouslySetInnerHTML={{ __html: avatarHtml }} />
          <div>
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{studentName}</h2>
            <div className="chat-subtitle">{headerMeta} - {student.rollno || rollno || ''}</div>
          </div>
        </div>
        <button onClick={onLogout} style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', background: 'rgba(255,255,255,0.1)', borderRadius: 8, color: 'white', border: 'none', cursor: 'pointer' }}>
          Log Out
        </button>
      </div>
      <div className="workspace-body">
        <section className="dashboard-panel" id="dashboardPanel">
          <Dashboard analysis={analysis} />
        </section>
        <section className="chat-panel">
          <div className="chat-messages" ref={msgsRef}>
            {messages.map((msg, i) => (
              <Message key={i} role={msg.role} content={msg.content} />
            ))}
            {thinking && (
              <div className="message bot" style={{ opacity: 0.6 }}>
                <div className="loader" style={{ width: 18, height: 18, borderWidth: 2, margin: 0 }} />
              </div>
            )}
          </div>
          <div className="quick-actions">
            {QUICK_CHIPS.map(chip => (
              <button key={chip} className="quick-chip" onClick={() => sendMessage(chip)}>
                {chip}
              </button>
            ))}
          </div>
          <div className="chat-input-area">
            <input
              type="text"
              placeholder="Ask about plan, total, absences, semesters, profile..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            />
            <button id="sendBtn" onClick={() => sendMessage(input)} disabled={sending || !input.trim()}>
              Send
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
