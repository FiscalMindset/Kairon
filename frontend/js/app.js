let sessionId = null;
let rollNo = null;
let autoOcrTried = false;
let captchaIssuedAt = 0;
let appConfig = {};
let currentAnalysis = null;
let dashboardFilters = {
    subject: 'all',
    semester: 'all',
    status: 'all',
    from: '',
    to: '',
    search: ''
};

const App = {
    async init() {
        await this.loadConfig();
        const savedRollNo = localStorage.getItem('nsut_rollno') || appConfig.default_rollno || '';
        if (savedRollNo) {
            this.checkCache(savedRollNo);
        } else {
            this.renderLogin();
        }
    },

    async loadConfig() {
        try {
            const res = await fetch('/api/config');
            if (!res.ok) {
                throw new Error('Backend config endpoint unavailable');
            }
            appConfig = await res.json();
        } catch (e) {
            appConfig = { backend_stale: true };
        }
    },

    escapeAttr(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    },

    async autoScrape(rollno, password) {
        try {
            const res = await fetch('/api/captcha', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId, captcha: '', cookie_reuse: true, rollno, password })
            });
            const data = await res.json();

            if (data.success) {
                localStorage.setItem('nsut_rollno', rollNo);
                this.renderChat(data.data);
                this.addBotMessage("Session reused from saved cookies. " + data.message + "\n\nType **HI** for the full dashboard, **PLAN** for priorities, or **CODES** for shortcuts.");
            } else {
                this.renderLogin(rollNo);
                this.addBotMessage("Saved session expired. Please login again.");
            }
        } catch (e) {
            this.renderLogin(rollNo);
        }
    },

    async autoOcr() {
        if (autoOcrTried) return;
        autoOcrTried = true;
        const ocrBtn = document.getElementById('autoOcrBtn');
        const verifyBtn = document.getElementById('verifyBtn');
        const progressEl = document.getElementById('ocrProgress');
        const capInput = document.getElementById('captchaInput');

        if (ocrBtn) { ocrBtn.disabled = true; }
        if (verifyBtn) { verifyBtn.disabled = true; }
        if (progressEl) { progressEl.style.display = 'block'; progressEl.textContent = '⏳ OCR attempt 1/3...'; }

        const roll = document.getElementById('rollno').value;
        const pwd = document.getElementById('password').value;
        try {
            const res = await fetch('/api/captcha', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId, auto_ocr: true, rollno: roll, password: pwd })
            });
            const data = await res.json();

            if (data.success) {
                if (progressEl) { progressEl.textContent = '✅ OCR succeeded! Loading dashboard...'; }
                localStorage.setItem('nsut_rollno', rollNo);
                this.renderChat(data.data);
                const warning = data.live_sync_warning
                    ? `\n\n**Live sync note:** ${data.live_sync_warning}. Debug folder: ${data.debug_dir || 'not available'}`
                    : "";
                this.addBotMessage("CAPTCHA auto-solved with OCR. " + data.message + warning + "\n\nType **HI** for the full dashboard, **PLAN** for priorities, or **CODES** for shortcuts.");
            } else {
                if (data.ocr_attempts && progressEl) {
                    let lines = ['❌ OCR failed. Attempts:'];
                    data.ocr_attempts.forEach((t, i) => lines.push(`  ${i+1}. "${t || 'empty'}"`));
                    lines.push(`Result: ${data.message}`);
                    progressEl.textContent = lines.join('\n');
                } else if (progressEl) {
                    progressEl.textContent = '❌ OCR failed. ' + (data.message || '');
                }
                if (capInput) { capInput.placeholder = 'Enter CAPTCHA manually'; }
                if (ocrBtn) { ocrBtn.innerHTML = '🤖 OCR'; ocrBtn.disabled = false; }
                if (verifyBtn) { verifyBtn.disabled = false; }
                if (data.retryable && data.captcha_base64) {
                    document.getElementById('captchaImg').src = data.captcha_base64;
                    captchaIssuedAt = Date.now();
                }
                autoOcrTried = false;
            }
        } catch (e) {
            if (progressEl) { progressEl.textContent = '❌ OCR error: ' + e.message; }
            if (ocrBtn) { ocrBtn.innerHTML = '🤖 OCR'; ocrBtn.disabled = false; }
            if (verifyBtn) { verifyBtn.disabled = false; }
            autoOcrTried = false;
        }
    },

    escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    },

    initials(name) {
        const clean = String(name || '').trim();
        if (!clean) return 'AA';
        return clean
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0].toUpperCase())
            .join('');
    },

    number(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    },

    percentage(value) {
        return Math.round(this.number(value) * 100) / 100;
    },

    subjectLabel(subject) {
        const code = subject && subject.code ? String(subject.code) : '';
        const name = subject && subject.subject ? String(subject.subject) : '';
        if (code && name && code !== name) return `${code} - ${name}`;
        return name || code || 'Subject';
    },

    subjectSemester(subject) {
        const source = currentAnalysis && currentAnalysis.source ? currentAnalysis.source : {};
        const student = currentAnalysis && currentAnalysis.student ? currentAnalysis.student : {};
        return String(subject.semester || source.semester || student.semester || 'Current');
    },

    subjectFilterValue(subject) {
        return [
            subject.academic_year || '',
            this.subjectSemester(subject),
            subject.code || subject.subject || 'subject'
        ].join('|');
    },

    studentAvatar(student, name) {
        const photo = student.photo_base64 || student.photo_data_url || '';
        if (photo && String(photo).startsWith('data:image/')) {
            return `<img class="student-avatar-img" src="${this.escapeAttr(photo)}" alt="${this.escapeAttr(name || 'Student photo')}">`;
        }
        return `<div class="student-avatar" title="Student profile">${this.escapeHtml(this.initials(name))}</div>`;
    },

    getSubjects() {
        if (!currentAnalysis || !Array.isArray(currentAnalysis.attendance)) return [];
        return currentAnalysis.attendance;
    },

    getSemesterOptions(subjects) {
        return [...new Set(subjects.map((subject) => this.subjectSemester(subject)).filter(Boolean))];
    },

    inDateRange(date) {
        if (!date) return false;
        const key = String(date).slice(0, 10);
        if (dashboardFilters.from && key < dashboardFilters.from) return false;
        if (dashboardFilters.to && key > dashboardFilters.to) return false;
        return true;
    },

    eventClassCount(event) {
        const explicit = this.number(event.class_count);
        if (explicit > 0) return explicit;
        return this.number(event.present_count) + this.number(event.absent_count);
    },

    windowStats(subject) {
        const dayWise = Array.isArray(subject.day_wise) ? subject.day_wise : [];
        const hasDateFilter = Boolean(dashboardFilters.from || dashboardFilters.to);
        const events = dayWise.filter((event) => !hasDateFilter || this.inDateRange(event.date));

        if (hasDateFilter) {
            const attended = events.reduce((sum, event) => sum + this.number(event.present_count), 0);
            const absent = events.reduce((sum, event) => sum + this.number(event.absent_count), 0);
            const total = events.reduce((sum, event) => sum + this.eventClassCount(event), 0);
            return {
                attended,
                absent,
                total,
                percentage: total ? this.percentage((attended / total) * 100) : 0,
                events,
                windowed: true
            };
        }

        const attended = this.number(subject.attended);
        const total = this.number(subject.total);
        const absent = this.number(subject.absent || Math.max(total - attended, 0));
        return {
            attended,
            absent,
            total,
            percentage: this.percentage(subject.percentage || (total ? (attended / total) * 100 : 0)),
            events,
            windowed: false
        };
    },

    statusFor(percentage) {
        if (percentage < 75) return 'risk';
        if (percentage < 80) return 'watch';
        return 'safe';
    },

    dashboardRows() {
        const search = dashboardFilters.search.trim().toLowerCase();
        const rows = this.getSubjects()
            .filter((subject) => {
                const value = this.subjectFilterValue(subject);
                return dashboardFilters.subject === 'all' || value === dashboardFilters.subject;
            })
            .filter((subject) => dashboardFilters.semester === 'all' || this.subjectSemester(subject) === dashboardFilters.semester)
            .filter((subject) => {
                if (!search) return true;
                return this.subjectLabel(subject).toLowerCase().includes(search);
            })
            .map((subject) => {
                const stats = this.windowStats(subject);
                return { subject, stats, status: this.statusFor(stats.percentage) };
            });

        if (dashboardFilters.status === 'all') return rows;
        return rows.filter((row) => row.status === dashboardFilters.status);
    },

    dashboardSummary(rows) {
        const total = rows.reduce((sum, row) => sum + row.stats.total, 0);
        const attended = rows.reduce((sum, row) => sum + row.stats.attended, 0);
        const absent = rows.reduce((sum, row) => sum + row.stats.absent, 0);
        const safeSkip = rows.reduce((sum, row) => sum + this.number(row.subject.skippable_75), 0);
        return {
            total,
            attended,
            absent,
            safeSkip,
            percentage: total ? this.percentage((attended / total) * 100) : 0,
            riskCount: rows.filter((row) => row.status === 'risk').length,
            watchCount: rows.filter((row) => row.status === 'watch').length
        };
    },

    renderTrendChart(rows) {
        const grouped = {};
        rows.forEach((row) => {
            const events = row.stats.events || [];
            events.forEach((event) => {
                if (!event.date || !this.inDateRange(event.date)) return;
                const key = String(event.date).slice(0, 10);
                grouped[key] = grouped[key] || { present: 0, total: 0 };
                grouped[key].present += this.number(event.present_count);
                grouped[key].total += this.eventClassCount(event);
            });
        });

        const dates = Object.keys(grouped).sort();
        let chartTitle = 'Cumulative attendance trend';
        let points = [];

        if (dates.length) {
            let runningPresent = 0;
            let runningTotal = 0;
            points = dates.map((date) => {
                runningPresent += grouped[date].present;
                runningTotal += grouped[date].total;
                return {
                    label: date,
                    percentage: runningTotal ? this.percentage((runningPresent / runningTotal) * 100) : 0
                };
            });
        } else {
            if (!rows.length) {
                return `<div class="empty-state">No line chart data available for the selected filters.</div>`;
            }
            chartTitle = 'Subject attendance line';
            points = rows.map((row) => ({
                label: row.subject.code || row.subject.subject || 'Subject',
                percentage: row.stats.percentage
            }));
        }

        const width = 520;
        const height = 160;
        const pad = 22;
        const xStep = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
        const coordinates = points.map((point, index) => {
            const x = pad + index * xStep;
            const y = height - pad - ((Math.min(Math.max(point.percentage, 0), 100) / 100) * (height - pad * 2));
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        });
        const path = coordinates.join(' ');
        const latest = points[points.length - 1];
        const lastPoint = coordinates[coordinates.length - 1].split(',');

        return `
            <div class="chart-head">
                <span>${chartTitle}</span>
                <strong>${latest.percentage}%</strong>
            </div>
            <svg class="trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Attendance trend line">
                <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" />
                <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" />
                <polyline points="${path}" />
                <circle cx="${lastPoint[0]}" cy="${lastPoint[1]}" r="4"></circle>
            </svg>
            <div class="chart-foot">
                <span>${this.escapeHtml(points[0].label)}</span>
                <span>${this.escapeHtml(latest.label)}</span>
            </div>
        `;
    },

    renderSubjectBars(rows) {
        if (!rows.length) return `<div class="empty-state">No subjects match the filters.</div>`;
        return [...rows]
            .sort((a, b) => a.stats.percentage - b.stats.percentage)
            .map((row) => {
                const width = Math.min(Math.max(row.stats.percentage, 0), 100);
                return `
                    <div class="subject-bar-row">
                        <div class="bar-label">
                            <span>${this.escapeHtml(this.subjectLabel(row.subject))}</span>
                            <strong>${row.stats.percentage}%</strong>
                        </div>
                        <div class="bar-track">
                            <div class="bar-fill ${row.status}" style="width: ${width}%"></div>
                        </div>
                    </div>
                `;
            }).join('');
    },

    renderSubjectTable(rows) {
        if (!rows.length) return `<div class="empty-state">No subject table data for this selection.</div>`;
        return `
            <div class="table-scroll">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Subject</th>
                            <th>Sem</th>
                            <th>Attendance</th>
                            <th>Present</th>
                            <th>Absent</th>
                            <th>75% Action</th>
                            <th>65% Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((row) => `
                            <tr>
                                <td>${this.escapeHtml(this.subjectLabel(row.subject))}</td>
                                <td>${this.escapeHtml(this.subjectSemester(row.subject))}</td>
                                <td><span class="status-pill ${row.status}">${row.stats.percentage}%</span></td>
                                <td>${row.stats.attended}/${row.stats.total}</td>
                                <td>${row.stats.absent}</td>
                                <td>${row.subject.status_75 === 'danger' ? `Attend ${this.number(row.subject.needed_75)}` : `Skip ${this.number(row.subject.skippable_75)}`}</td>
                                <td>${row.subject.status_65 === 'danger' ? `Attend ${this.number(row.subject.needed_65)}` : `Skip ${this.number(row.subject.skippable_65)}`}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    renderEventTable(rows) {
        const events = [];
        rows.forEach((row) => {
            (row.stats.events || []).forEach((event) => {
                if (!event.date || !this.inDateRange(event.date)) return;
                events.push({
                    ...event,
                    subject: this.subjectLabel(row.subject),
                    code: row.subject.code || ''
                });
            });
        });

        const visible = events
            .sort((a, b) => String(b.date).localeCompare(String(a.date)))
            .slice(0, 80);

        if (!visible.length) return `<div class="empty-state">No date-wise rows match the current filters.</div>`;
        return `
            <div class="table-scroll event-table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Subject</th>
                            <th>Status</th>
                            <th>Raw mark</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${visible.map((event) => {
                            const status = event.status || (event.absent_count > 0 ? 'absent' : 'present');
                            const statusClass = String(status).toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
                            return `
                                <tr>
                                    <td>${this.escapeHtml(event.date)}</td>
                                    <td>${this.escapeHtml(event.subject)}</td>
                                    <td><span class="mark-pill ${this.escapeAttr(statusClass)}">${this.escapeHtml(status)}</span></td>
                                    <td>${this.escapeHtml(event.raw || event.tokens || '')}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    renderDashboard() {
        const panel = document.getElementById('dashboardPanel');
        if (!panel || !currentAnalysis) return;

        const student = currentAnalysis.student || {};
        const source = currentAnalysis.source || {};
        const subjects = this.getSubjects();
        const rows = this.dashboardRows();
        const summary = this.dashboardSummary(rows);
        const semesterOptions = this.getSemesterOptions(subjects);
        const syncDate = currentAnalysis.synced_at ? new Date(currentAnalysis.synced_at) : null;
        const syncLabel = syncDate && !Number.isNaN(syncDate.getTime())
            ? syncDate.toLocaleString()
            : 'Not synced';
        const subjectOptions = subjects.map((subject) => {
            const value = this.subjectFilterValue(subject);
            const label = semesterOptions.length > 1
                ? `Sem ${this.subjectSemester(subject)} - ${this.subjectLabel(subject)}`
                : this.subjectLabel(subject);
            return `<option value="${this.escapeAttr(value)}" ${dashboardFilters.subject === value ? 'selected' : ''}>${this.escapeHtml(label)}</option>`;
        }).join('');

        panel.innerHTML = `
            <div class="dashboard-topline">
                <div>
                    <p class="eyebrow">Live analysis workspace</p>
                    <h3>Attendance dashboard</h3>
                    <p>${this.escapeHtml(source.academic_year || student.academic_year || 'Academic year')} - Sem ${this.escapeHtml(source.semester || student.semester || 'Current')} - Synced ${this.escapeHtml(syncLabel)}</p>
                </div>
                <span class="photo-chip">${student.photo_base64 || student.photo_data_url ? 'Photo loaded' : (student.photo_available ? 'Photo detected' : 'No photo cached')}</span>
            </div>

            <div class="filter-grid">
                <label class="dashboard-control">
                    <span>Subject</span>
                    <select id="dashSubject">
                        <option value="all" ${dashboardFilters.subject === 'all' ? 'selected' : ''}>All subjects</option>
                        ${subjectOptions}
                    </select>
                </label>
                <label class="dashboard-control">
                    <span>Semester</span>
                    <select id="dashSemester">
                        <option value="all" ${dashboardFilters.semester === 'all' ? 'selected' : ''}>All semesters</option>
                        ${semesterOptions.map((semester) => `<option value="${this.escapeAttr(semester)}" ${dashboardFilters.semester === semester ? 'selected' : ''}>${this.escapeHtml(semester)}</option>`).join('')}
                    </select>
                </label>
                <label class="dashboard-control">
                    <span>From</span>
                    <input id="dashFrom" type="date" value="${this.escapeAttr(dashboardFilters.from)}">
                </label>
                <label class="dashboard-control">
                    <span>To</span>
                    <input id="dashTo" type="date" value="${this.escapeAttr(dashboardFilters.to)}">
                </label>
                <label class="dashboard-control">
                    <span>Status</span>
                    <select id="dashStatus">
                        <option value="all" ${dashboardFilters.status === 'all' ? 'selected' : ''}>All</option>
                        <option value="risk" ${dashboardFilters.status === 'risk' ? 'selected' : ''}>Below 75%</option>
                        <option value="watch" ${dashboardFilters.status === 'watch' ? 'selected' : ''}>75-80%</option>
                        <option value="safe" ${dashboardFilters.status === 'safe' ? 'selected' : ''}>80%+</option>
                    </select>
                </label>
                <label class="dashboard-control dashboard-search">
                    <span>Search</span>
                    <input id="dashSearch" type="search" placeholder="Code or subject" value="${this.escapeAttr(dashboardFilters.search)}">
                </label>
                <button id="dashReset" class="secondary-button" type="button">Reset</button>
            </div>

            <div class="metric-grid">
                <div class="metric-card">
                    <span>Overall</span>
                    <strong>${summary.percentage}%</strong>
                    <small>${summary.attended}/${summary.total} classes</small>
                </div>
                <div class="metric-card">
                    <span>Absent</span>
                    <strong>${summary.absent}</strong>
                    <small>Filtered window</small>
                </div>
                <div class="metric-card">
                    <span>Safe skips</span>
                    <strong>${summary.safeSkip}</strong>
                    <small>75% threshold</small>
                </div>
                <div class="metric-card">
                    <span>Watchlist</span>
                    <strong>${summary.riskCount + summary.watchCount}</strong>
                    <small>${summary.riskCount} below 75%</small>
                </div>
            </div>

            <div class="dashboard-grid">
                <section class="analysis-panel">${this.renderTrendChart(rows)}</section>
                <section class="analysis-panel">
                    <div class="chart-head"><span>Subject comparison</span><strong>${rows.length}</strong></div>
                    ${this.renderSubjectBars(rows)}
                </section>
            </div>

            <section class="analysis-panel table-panel">
                <div class="chart-head"><span>Subject table</span><strong>${rows.length}</strong></div>
                ${this.renderSubjectTable(rows)}
            </section>

            <section class="analysis-panel table-panel">
                <div class="chart-head"><span>Date-wise records</span><strong>Latest 80</strong></div>
                ${this.renderEventTable(rows)}
            </section>
        `;

        this.bindDashboardControls();
    },

    bindDashboardControls() {
        const bind = (id, key, eventName = 'change') => {
            const element = document.getElementById(id);
            if (!element) return;
            element.addEventListener(eventName, () => {
                dashboardFilters[key] = element.value;
                this.renderDashboard();
            });
        };

        bind('dashSubject', 'subject');
        bind('dashSemester', 'semester');
        bind('dashFrom', 'from');
        bind('dashTo', 'to');
        bind('dashStatus', 'status');
        bind('dashSearch', 'search', 'input');

        const reset = document.getElementById('dashReset');
        if (reset) {
            reset.addEventListener('click', () => {
                dashboardFilters = {
                    subject: 'all',
                    semester: 'all',
                    status: 'all',
                    from: '',
                    to: '',
                    search: ''
                };
                this.renderDashboard();
            });
        }
    },

    async checkCache(rollno) {
        this.renderLoading("Verifying local cache...");
        try {
            const res = await fetch('/api/check_cache', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rollno })
            });
            const data = await res.json();
            if (data.success) {
                sessionId = data.session_id;
                rollNo = rollno;
                this.renderChat(data.analysis);
                const cacheNote = data.cache_needs_refresh
                    ? "\n\n**Cache note:** this is an older totals-only cache. Type **TOTAL**, **SAFE**, or **RISK** now, but login once with CAPTCHA to rebuild the v2 cache for absent dates, profile, calendar marks, and portal data surfaces."
                    : "";
                this.addBotMessage("Welcome back! I've loaded your attendance from the local cache." + cacheNote + "\n\nType **HI** for a summary, **PLAN** for attendance priorities, **CODES** for shortcuts, or **SW** for subject-wise details.");
            } else {
                this.renderLogin(rollno);
            }
        } catch (e) {
            this.renderLogin(rollno);
        }
    },

    renderLoading(text) {
        document.getElementById('app').innerHTML = `
            <div class="glass-panel" style="margin: auto; padding: 3rem; text-align: center;">
                <div class="loader"></div>
                <p style="margin-top: 1rem; color: var(--text-secondary);">${text}</p>
            </div>
        `;
    },

    renderLogin(initialRoll = '') {
        const savedPassword = localStorage.getItem('nsut_portal_password') || appConfig.default_password || '';
        const savedPasswordChecked = savedPassword ? 'checked' : '';
        const savedPasswordValue = this.escapeAttr(savedPassword);
        const savedRollValue = this.escapeAttr(initialRoll || localStorage.getItem('nsut_rollno') || appConfig.default_rollno || '');

        document.getElementById('app').innerHTML = `
            <div class="glass-panel auth-container">
                <h1>Attendance Assistant</h1>
                <p style="color: var(--text-secondary)">Connect once, then use the cached assistant workspace.</p>
                <div class="input-group">
                    <input type="text" id="rollno" placeholder="Roll number" value="${savedRollValue}">
                </div>
                <div class="input-group password-wrapper">
                    <input type="password" id="password" placeholder="Password" value="${savedPasswordValue}">
                    <button type="button" id="togglePassword" class="password-toggle" title="Show password">👁</button>
                </div>
                <label class="check-row">
                    <input type="checkbox" id="rememberPassword" ${savedPasswordChecked}>
                    <span>Remember password on this device</span>
                </label>
                <button id="loginBtn">Connect to Portal</button>
                <div id="captchaArea" style="display: none; flex-direction: column; gap: 1rem; margin-top: 1rem;">
                    <img id="captchaImg" style="border-radius: 8px; border: 1px solid var(--glass-border);">
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <input type="text" id="captchaInput" placeholder="Enter Captcha" style="flex: 1;">
                        <button id="refreshCaptchaBtn" style="flex: 0; padding: 0.5rem 1rem; background: rgba(255, 220, 120, 0.25); border: 1px solid rgba(255, 220, 120, 0.5); cursor: pointer; border-radius: 8px; color: #ffd166; font-weight: bold;" title="Refresh CAPTCHA">↻</button>
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <button id="verifyBtn" style="flex: 1;">Verify & Deep Scrape</button>
                        <button id="autoOcrBtn" style="flex: 0; padding: 0.5rem 1rem; background: rgba(100, 200, 255, 0.3); border: 1px solid rgba(100, 200, 255, 0.5); cursor: pointer; border-radius: 8px; color: #64c8ff; font-weight: bold;">🤖 OCR</button>
                    </div>
                    <div id="ocrProgress" style="display: none; color: var(--text-secondary); font-size: 0.85rem; background: rgba(100, 200, 255, 0.1); border: 1px solid rgba(100, 200, 255, 0.2); border-radius: 8px; padding: 0.5rem 1rem; white-space: pre-wrap; font-family: monospace;"></div>
                    <div id="errorMessage" style="display: none; color: #ff6b6b; background: rgba(255, 107, 107, 0.1); border: 1px solid rgba(255, 107, 107, 0.3); border-radius: 8px; padding: 0.5rem 1rem; font-size: 0.9rem;"></div>
                    <small style="color: var(--accent)">Enter the CAPTCHA number from the image above, or click 🤖 OCR to auto-read it.</small>
                </div>
            </div>
        `;

        document.getElementById('togglePassword').addEventListener('click', () => {
            const pwdInput = document.getElementById('password');
            const toggle = document.getElementById('togglePassword');
            if (pwdInput.type === 'password') {
                pwdInput.type = 'text';
                toggle.textContent = '🙈';
                toggle.title = 'Hide password';
            } else {
                pwdInput.type = 'password';
                toggle.textContent = '👁';
                toggle.title = 'Show password';
            }
        });

        document.getElementById('loginBtn').addEventListener('click', async () => {
            const btn = document.getElementById('loginBtn');
            btn.innerHTML = '<div class="loader"></div>';
            
            const roll = document.getElementById('rollno').value;
            const pwd = document.getElementById('password').value;
            const rememberPassword = document.getElementById('rememberPassword').checked;

            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rollno: roll, password: pwd })
            });
            const data = await res.json();
            
            if (data.success) {
                sessionId = data.session_id;
                rollNo = data.rollno || roll;
                localStorage.setItem('nsut_rollno', rollNo);
                if (rememberPassword && pwd) {
                    localStorage.setItem('nsut_portal_password', pwd);
                } else if (!rememberPassword) {
                    localStorage.removeItem('nsut_portal_password');
                }
                autoOcrTried = false;

                if (data.cookie_reused) {
                    btn.innerHTML = '<div class="loader"></div> Reusing session...';
                    await this.autoScrape(roll, pwd);
                } else {
                    btn.style.display = 'none';
                    document.getElementById('captchaArea').style.display = 'flex';
                    document.getElementById('captchaImg').src = data.captcha_base64;
                    captchaIssuedAt = Date.now();
                }
            } else {
                btn.innerHTML = 'Connect to Portal';
                alert(data.message);
            }
        });

        document.getElementById('refreshCaptchaBtn').addEventListener('click', async () => {
            const btn = document.getElementById('refreshCaptchaBtn');
            const previous = btn.innerHTML;
            btn.innerHTML = '...';
            btn.disabled = true;

            try {
                const res = await fetch('/api/captcha/refresh', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_id: sessionId })
                });
                const data = await res.json();
                if (data.success && data.captcha_base64) {
                    document.getElementById('captchaImg').src = data.captcha_base64;
                    document.getElementById('captchaInput').value = '';
                    captchaIssuedAt = Date.now();
                } else {
                    const dbg = data.debug_dir ? `\n\nDebug folder: ${data.debug_dir}` : '';
                    alert((data.message || 'Could not refresh captcha') + dbg);
                }
            } catch (e) {
                alert('Refresh failed: ' + e.message);
            } finally {
                btn.innerHTML = previous;
                btn.disabled = false;
            }
        });

        document.getElementById('verifyBtn').addEventListener('click', async () => {
            const btn = document.getElementById('verifyBtn');
            btn.innerHTML = '<div class="loader"></div>';

            if (captchaIssuedAt && (Date.now() - captchaIssuedAt) > 45000) {
                try {
                    const refreshRes = await fetch('/api/captcha/refresh', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ session_id: sessionId })
                    });
                    const refreshData = await refreshRes.json();
                    if (refreshData.success && refreshData.captcha_base64) {
                        document.getElementById('captchaImg').src = refreshData.captcha_base64;
                        document.getElementById('captchaInput').value = '';
                        document.getElementById('captchaInput').placeholder = 'Enter Captcha';
                        captchaIssuedAt = Date.now();
                        btn.innerHTML = 'Verify & Deep Scrape';
                        return;
                    }
                } catch (e) {
                    // fallback to existing flow
                }
            }
            
            const cap = document.getElementById('captchaInput').value;
            const roll = document.getElementById('rollno').value;
            const pwd = document.getElementById('password').value;
            const res = await fetch('/api/captcha', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId, captcha: cap, rollno: roll, password: pwd })
            });
            const data = await res.json();
            
            if (data.success) {
                localStorage.setItem('nsut_rollno', rollNo);
                this.renderChat(data.data);
                const warning = data.live_sync_warning
                    ? `\n\n**Live sync note:** ${data.live_sync_warning}. Debug folder: ${data.debug_dir || 'not available'}`
                    : "";
                this.addBotMessage(data.message + warning + "\n\nType **HI** for the full dashboard, **PLAN** for attendance priorities, **PROFILE** for student info, **CODES** for shortcuts, or ask a subject code like **MEMEC303**.");
            } else {
                btn.innerHTML = 'Verify & Deep Scrape';
                if (data.retryable && data.captcha_base64) {
                    document.getElementById('captchaImg').src = data.captcha_base64;
                    captchaIssuedAt = Date.now();
                }
                const dbg = data.debug_dir ? `\n[Debug folder: ${data.debug_dir}]` : '';
                const errMsg = document.getElementById('errorMessage');
                if (errMsg) {
                    errMsg.textContent = (data.message || 'Verification failed') + ' ' + dbg;
                    errMsg.style.display = 'block';
                } else {
                    this.addBotMessage("**Login failed:** " + (data.message || 'Verification failed') + dbg + "\n\nPlease refresh the CAPTCHA and try again.");
                }
            }
        });
       
        document.getElementById('autoOcrBtn').addEventListener('click', async () => {
            document.getElementById('captchaInput').value = '';
            document.getElementById('captchaInput').placeholder = 'OCR running...';
            document.getElementById('autoOcrBtn').disabled = true;
            document.getElementById('autoOcrBtn').innerHTML = '⏳ OCR...';
            const progressEl = document.getElementById('ocrProgress');
            progressEl.style.display = 'block';
            progressEl.textContent = '⏳ OCR attempt 1/3...';
            autoOcrTried = false;
            await this.autoOcr();
        });
    },

    renderChat(analysis = null) {
        currentAnalysis = analysis;
        const insights = analysis && analysis.insights ? analysis.insights : null;
        const student = analysis && analysis.student ? analysis.student : {};
        const source = analysis && analysis.source ? analysis.source : {};
        const headerMeta = insights
            ? `${insights.overall_percentage || 0}% - ${insights.total_attended || 0}/${insights.total_classes || 0} - ${insights.total_absent || 0} absent${source.legacy_cache ? ' - legacy cache' : ''}`
            : 'Smart attendance workspace';
        const studentName = student.name || 'Attendance Assistant';
        const safeStudentName = this.escapeHtml(studentName);
        const avatarHtml = this.studentAvatar(student, studentName);
        const rollLabel = student.rollno || rollNo || '';
        const headerLine = rollLabel ? `${headerMeta} - ${rollLabel}` : headerMeta;

        document.getElementById('app').innerHTML = `
            <div class="glass-panel chat-container workspace-container">
                <div class="chat-header">
                    <div class="student-heading">
                        ${avatarHtml}
                        <div>
                            <h2 style="margin: 0; font-size: 1.2rem;">${safeStudentName}</h2>
                            <div class="chat-subtitle">${this.escapeHtml(headerLine)}</div>
                        </div>
                    </div>
                    <button id="logoutBtn" style="padding: 0.5rem 1rem; font-size: 0.9rem; background: rgba(255,255,255,0.1); border-radius: 8px; color: white; border: none; cursor: pointer;">Log Out</button>
                </div>
                <div class="workspace-body">
                    <section class="dashboard-panel" id="dashboardPanel"></section>
                    <section class="chat-panel">
                        <div class="chat-messages" id="chatMessages"></div>
                        <div class="quick-actions">
                            <button class="quick-chip" data-message="HI">HI</button>
                            <button class="quick-chip" data-message="SW">SW</button>
                            <button class="quick-chip" data-message="TOTAL">TOTAL</button>
                            <button class="quick-chip" data-message="ABSENT">ABSENT</button>
                            <button class="quick-chip" data-message="SAFE">SAFE</button>
                            <button class="quick-chip" data-message="RISK">RISK</button>
                            <button class="quick-chip" data-message="PLAN">PLAN</button>
                            <button class="quick-chip" data-message="PROFILE">PROFILE</button>
                            <button class="quick-chip" data-message="SEMESTERS">SEMESTERS</button>
                            <button class="quick-chip" data-message="CODES">CODES</button>
                        </div>
                        <div class="chat-input-area">
                            <input type="text" id="chatInput" placeholder="Ask about plan, total, absences, semesters, profile...">
                            <button id="sendBtn">Send</button>
                        </div>
                    </section>
                </div>
            </div>
        `;
        this.renderDashboard();

        document.getElementById('logoutBtn').addEventListener('click', () => {
            sessionId = null;
            this.renderLogin(rollNo);
        });

        const sendMsg = async () => {
            const input = document.getElementById('chatInput');
            const msg = input.value.trim();
            if (!msg) return;

            this.addUserMessage(msg);
            input.value = '';

            try {
                const res = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_id: sessionId, message: msg })
                });
                const data = await res.json();
                this.addBotMessage(data.reply);
            } catch (e) {
                this.addBotMessage("Error connecting to server.");
            }
        };

        document.getElementById('sendBtn').addEventListener('click', sendMsg);
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMsg();
        });
        document.querySelectorAll('.quick-chip').forEach((button) => {
            button.addEventListener('click', () => {
                document.getElementById('chatInput').value = button.dataset.message;
                sendMsg();
            });
        });
    },

    addUserMessage(text) {
        const div = document.createElement('div');
        div.className = 'message user';
        div.textContent = text;
        document.getElementById('chatMessages').appendChild(div);
        this.scrollToBottom();
    },

    addBotMessage(markdown) {
        const div = document.createElement('div');
        div.className = 'message bot';
        
        // Very simple markdown parser for bold, lists, and tables
        let html = markdown
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
        
        // Handle tables (basic implementation)
        if (html.includes('|')) {
            const lines = html.split('<br>');
            let inTable = false;
            let tableHtml = '<table style="width:100%; border-collapse: collapse; margin-top: 10px;">';
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith('|')) {
                    inTable = true;
                    if (line.includes('---')) {
                        lines[i] = ''; 
                        continue; 
                    }
                    
                    const cells = line.split('|').filter(c => c.trim() !== '');
                    tableHtml += '<tr>';
                    cells.forEach(c => {
                        tableHtml += `<td style="border: 1px solid var(--glass-border); padding: 8px;">${c.trim()}</td>`;
                    });
                    tableHtml += '</tr>';
                    lines[i] = ''; // clear line
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

        div.innerHTML = html;
        document.getElementById('chatMessages').appendChild(div);
        this.scrollToBottom();
    },

    scrollToBottom() {
        const msgs = document.getElementById('chatMessages');
        msgs.scrollTop = msgs.scrollHeight;
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
