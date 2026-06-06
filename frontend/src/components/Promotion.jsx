import React, { useState } from 'react';

export default function Promotion() {
  const [avatarErr, setAvatarErr] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="promo-float">
      <button className="promo-float-close" onClick={() => setDismissed(true)} aria-label="Close ad">✕</button>

      <div className="promo-float-creator">
        <div className="promo-float-avatar">
          {!avatarErr ? (
            <img src="https://github.com/fiscalmindset.png" alt="" className="promo-float-avatar-img" onError={() => setAvatarErr(true)} />
          ) : (
            <span className="promo-float-avatar-fallback">VK</span>
          )}
        </div>
        <div className="promo-float-info">
          <strong>vicky kjumar</strong>
          <div className="promo-float-links">
            <a href="https://github.com/fiscalmindset" target="_blank" rel="noopener noreferrer">GitHub</a>
            <span>·</span>
            <a href="https://linkedin.com/in/algsoch" target="_blank" rel="noopener noreferrer">LinkedIn</a>
            <span>·</span>
            <a href="mailto:npdimagine@gmail.com">Email</a>
          </div>
        </div>
      </div>

      <div className="promo-float-divider" />

      <a href="https://slice.bank.in/t?c=1S4jZ0e&ic=VICKY72764" target="_blank" rel="noopener noreferrer" className="promo-float-ad">
        <span className="promo-float-ad-badge">Ad</span>
        <span className="promo-float-ad-emoji">💳</span>
        <span className="promo-float-ad-text">Slice: Use <strong>VICKY72764</strong> → ₹200</span>
        <span className="promo-float-ad-arrow">→</span>
      </a>

      <a href="https://github.com/fiscalmindset" target="_blank" rel="noopener noreferrer" className="promo-float-ad">
        <span className="promo-float-ad-badge">Ad</span>
        <span className="promo-float-ad-emoji">🧑‍💻</span>
        <span className="promo-float-ad-text">Open-source on <strong>@fiscalmindset</strong></span>
        <span className="promo-float-ad-arrow">→</span>
      </a>

      <div className="promo-float-footer">Built by vicky kjumar · NSUT · {new Date().getFullYear()}</div>
    </div>
  );
}
