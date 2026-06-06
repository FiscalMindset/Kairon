import React, { useState, useMemo } from 'react';

function n(value) {
  const p = Number(value);
  return Number.isFinite(p) ? p : 0;
}

function pct(value) {
  return Math.round(n(value) * 100) / 100;
}

function statusFor(p) {
  if (p < 75) return 'risk';
  if (p < 80) return 'watch';
  return 'safe';
}

function label(subject) {
  const code = subject?.code ? String(subject.code) : '';
  const name = subject?.subject ? String(subject.subject) : '';
  if (code && name && code !== name) return `${code} - ${name}`;
  return name || code || 'Subject';
}

function TrendChart({ points }) {
  if (!points.length) return <div className="empty-state">No chart data.</div>;
  const width = 520, height = 160, pad = 22;
  const xStep = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = pad + i * xStep;
    const y = height - pad - ((Math.min(Math.max(p.percentage, 0), 100) / 100) * (height - pad * 2));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = coords[coords.length - 1]?.split(',') || [];
  return (
    <>
      <div className="chart-head">
        <span>Cumulative attendance trend</span>
        <strong>{pct(points[points.length - 1]?.percentage)}%</strong>
      </div>
      <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`}>
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} />
        <polyline points={coords.join(' ')} />
        {last.length >= 2 && <circle cx={last[0]} cy={last[1]} r={4} />}
      </svg>
      <div className="chart-foot">
        <span>{points[0]?.label || ''}</span>
        <span>{points[points.length - 1]?.label || ''}</span>
      </div>
    </>
  );
}

function SubjectBars({ rows }) {
  if (!rows.length) return <div className="empty-state">No subjects match filters.</div>;
  return [...rows].sort((a, b) => a.pct - b.pct).map(row => (
    <div className="subject-bar-row" key={row.code}>
      <div className="bar-label">
        <span>{row.label}</span>
        <strong>{row.pct}%</strong>
      </div>
      <div className="bar-track">
        <div className={`bar-fill ${row.status}`} style={{ width: `${Math.min(Math.max(row.pct, 0), 100)}%` }} />
      </div>
    </div>
  ));
}

export default function Dashboard({ analysis }) {
  const [filters, setFilters] = useState({ subject: 'all', semester: 'all', status: 'all', from: '', to: '', search: '' });

  const subjects = useMemo(() => analysis?.attendance || [], [analysis]);
  const insights = useMemo(() => analysis?.insights || {}, [analysis]);
  const student = useMemo(() => analysis?.student || {}, [analysis]);
  const source = useMemo(() => analysis?.source || {}, [analysis]);

  const semesterOptions = useMemo(() => {
    return [...new Set(subjects.map(s => s.semester).filter(Boolean))];
  }, [subjects]);

  const rows = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return subjects
      .filter(s => filters.subject === 'all' || s.code === filters.subject)
      .filter(s => filters.semester === 'all' || s.semester === filters.semester)
      .filter(s => !search || label(s).toLowerCase().includes(search))
      .map(s => {
        const attended = n(s.attended);
        const total = n(s.total);
        const absent = n(s.absent || Math.max(total - attended, 0));
        const p = pct(s.percentage || (total ? (attended / total) * 100 : 0));
        return { subject: s, attended, absent, total, pct: p, status: statusFor(p), label: label(s), code: s.code || 'none' };
      })
      .filter(r => filters.status === 'all' || r.status === filters.status);
  }, [subjects, filters]);

  const summary = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.total, 0);
    const attended = rows.reduce((s, r) => s + r.attended, 0);
    const absent = rows.reduce((s, r) => s + r.absent, 0);
    const safeSkip = rows.reduce((s, r) => s + n(r.subject.skippable_75), 0);
    return {
      total, attended, absent, safeSkip,
      percentage: total ? pct((attended / total) * 100) : 0,
      riskCount: rows.filter(r => r.status === 'risk').length,
      watchCount: rows.filter(r => r.status === 'watch').length,
    };
  }, [rows]);

  const chartPoints = useMemo(() => {
    const grouped = {};
    rows.forEach(r => {
      (r.subject.day_wise || []).forEach(e => {
        if (!e.date) return;
        const key = String(e.date).slice(0, 10);
        if (filters.from && key < filters.from) return;
        if (filters.to && key > filters.to) return;
        grouped[key] = grouped[key] || { present: 0, total: 0 };
        grouped[key].present += n(e.present_count);
        grouped[key].total += n(e.class_count) || n(e.present_count) + n(e.absent_count) || 1;
      });
    });
    const dates = Object.keys(grouped).sort();
    if (!dates.length) return [];
    let runningPresent = 0, runningTotal = 0;
    return dates.map(d => {
      runningPresent += grouped[d].present;
      runningTotal += grouped[d].total;
      return { label: d, percentage: runningTotal ? pct((runningPresent / runningTotal) * 100) : 0 };
    });
  }, [rows, filters.from, filters.to]);

  const resetFilters = () => setFilters({ subject: 'all', semester: 'all', status: 'all', from: '', to: '', search: '' });

  const syncDate = analysis?.synced_at ? new Date(analysis.synced_at) : null;

  if (!analysis) return null;

  return (
    <div>
      <div className="dashboard-topline">
        <div>
          <p className="eyebrow">Live analysis workspace</p>
          <h3>Attendance dashboard</h3>
          <p>{source.academic_year || student.academic_year || 'Academic year'} - Sem {source.semester || student.semester || 'Current'}{syncDate ? ` - Synced ${syncDate.toLocaleString()}` : ''}</p>
        </div>
        <span className="photo-chip">{student.photo_available ? 'Photo cached' : 'No photo'}</span>
      </div>

      <div className="filter-grid">
        <label className="dashboard-control">
          <span>Subject</span>
          <select value={filters.subject} onChange={e => setFilters(f => ({ ...f, subject: e.target.value }))}>
            <option value="all">All subjects</option>
            {subjects.map(s => (
              <option key={s.code || s.subject} value={s.code}>{label(s)}</option>
            ))}
          </select>
        </label>
        <label className="dashboard-control">
          <span>Semester</span>
          <select value={filters.semester} onChange={e => setFilters(f => ({ ...f, semester: e.target.value }))}>
            <option value="all">All semesters</option>
            {semesterOptions.map(sem => (
              <option key={sem} value={sem}>{sem}</option>
            ))}
          </select>
        </label>
        <label className="dashboard-control">
          <span>From</span>
          <input type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
        </label>
        <label className="dashboard-control">
          <span>To</span>
          <input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
        </label>
        <label className="dashboard-control">
          <span>Status</span>
          <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
            <option value="all">All</option>
            <option value="risk">Below 75%</option>
            <option value="watch">75-80%</option>
            <option value="safe">80%+</option>
          </select>
        </label>
        <label className="dashboard-control dashboard-search">
          <span>Search</span>
          <input type="search" placeholder="Code or subject" value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
        </label>
        <button className="secondary-button" type="button" onClick={resetFilters}>Reset</button>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <span>Overall</span>
          <strong>{summary.percentage}%</strong>
          <small>{summary.attended}/{summary.total} classes</small>
        </div>
        <div className="metric-card">
          <span>Absent</span>
          <strong>{summary.absent}</strong>
          <small>Filtered window</small>
        </div>
        <div className="metric-card">
          <span>Safe skips</span>
          <strong>{summary.safeSkip}</strong>
          <small>75% threshold</small>
        </div>
        <div className="metric-card">
          <span>Watchlist</span>
          <strong>{summary.riskCount + summary.watchCount}</strong>
          <small>{summary.riskCount} below 75%</small>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="analysis-panel">
          <TrendChart points={chartPoints} />
        </section>
        <section className="analysis-panel">
          <div className="chart-head"><span>Subject comparison</span><strong>{rows.length}</strong></div>
          <SubjectBars rows={rows} />
        </section>
      </div>

      <section className="analysis-panel table-panel">
        <div className="chart-head"><span>Subject table</span><strong>{rows.length}</strong></div>
        {rows.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Sem</th>
                  <th>Attendance</th>
                  <th>Present</th>
                  <th>Absent</th>
                  <th>75%</th>
                  <th>65%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.code}>
                    <td>{r.label}</td>
                    <td>{r.subject.semester}</td>
                    <td><span className={`status-pill ${r.status}`}>{r.pct}%</span></td>
                    <td>{r.attended}/{r.total}</td>
                    <td>{r.absent}</td>
                    <td>{r.subject.status_75 === 'danger' ? `Attend ${n(r.subject.needed_75)}` : `Skip ${n(r.subject.skippable_75)}`}</td>
                    <td>{r.subject.status_65 === 'danger' ? `Attend ${n(r.subject.needed_65)}` : `Skip ${n(r.subject.skippable_65)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state">No subjects match the filters.</div>}
      </section>

      <section className="analysis-panel table-panel">
        <div className="chart-head"><span>Date-wise records</span><strong>Latest 80</strong></div>
        {(() => {
          const events = [];
          rows.forEach(r => {
            (r.subject.day_wise || []).forEach(e => {
              if (!e.date) return;
              const key = String(e.date).slice(0, 10);
              if (filters.from && key < filters.from) return;
              if (filters.to && key > filters.to) return;
              events.push({ ...e, subjectLabel: r.label, status: e.status || (e.absent_count > 0 ? 'absent' : 'present') });
            });
          });
          events.sort((a, b) => String(b.date).localeCompare(String(a.date)));
          const visible = events.slice(0, 80);
          if (!visible.length) return <div className="empty-state">No date-wise rows match filters.</div>;
          return (
            <div className="table-scroll event-table-wrap">
              <table className="data-table">
                <thead><tr><th>Date</th><th>Subject</th><th>Status</th><th>Raw</th></tr></thead>
                <tbody>
                  {visible.map((e, i) => (
                    <tr key={i}>
                      <td>{e.date}</td>
                      <td>{e.subjectLabel}</td>
                      <td><span className={`mark-pill ${String(e.status).toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}`}>{e.status}</span></td>
                      <td>{e.raw || e.tokens || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </section>
    </div>
  );
}
