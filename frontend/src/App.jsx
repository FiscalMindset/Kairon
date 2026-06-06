import React, { useState, useEffect, useCallback } from 'react';
import LoginView from './components/LoginView';
import ChatView from './components/ChatView';
import Promotion from './components/Promotion';
import * as api from './services/api';

export default function App() {
  const [sessionId, setSessionId] = useState(null);
  const [rollno, setRollno] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [view, setView] = useState('loading');
  const [config, setConfig] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.fetchConfig();
        setConfig(cfg);
      } catch { setConfig({ backend_stale: true }); }
      const savedRoll = localStorage.getItem('nsut_rollno') || '';
      if (savedRoll) {
        setRollno(savedRoll);
        try {
          const data = await api.checkCache(savedRoll);
          if (data.success) {
            setSessionId(data.session_id);
            setAnalysis(data.analysis);
            setView('chat');
            return;
          }
        } catch { /* fall through */ }
      }
      setView('login');
    })();
  }, []);

  const handleLoginSuccess = useCallback((sid, analysisData, roll) => {
    setSessionId(sid);
    setRollno(roll);
    setAnalysis(analysisData);
    setView('chat');
  }, []);

  const handleLogout = useCallback(() => {
    setSessionId(null);
    setAnalysis(null);
    setView('login');
  }, []);

  const mainContent = () => {
    if (view === 'loading') {
      return (
        <div className="glass-panel" style={{ margin: 'auto', padding: '3rem', textAlign: 'center' }}>
          <div className="loader" />
          <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Checking saved session...</p>
        </div>
      );
    }
    if (view === 'login') {
      return (
        <LoginView
          initialRollno={rollno}
          config={config}
          onSuccess={handleLoginSuccess}
        />
      );
    }
    return (
      <ChatView
        sessionId={sessionId}
        rollno={rollno}
        analysis={analysis}
        onLogout={handleLogout}
      />
    );
  };

  return (
    <>
      {mainContent()}
      <Promotion />
    </>
  );
}
