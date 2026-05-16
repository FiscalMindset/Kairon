let sessionId = null;
let rollNo = null;
let autoOcrTried = false;
let captchaIssuedAt = 0;
let appConfig = {};
let currentAnalysis = null;

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
                this.addBotMessage("Welcome back! I've loaded your attendance from the local cache." + cacheNote + "\n\nType **HI** for a summary, **CODES** for shortcuts, or **SW** for subject-wise details.");
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
        const savedPassword = localStorage.getItem('nsut_portal_password') || '';
        const passwordPlaceholder = appConfig.has_saved_password ? 'Password saved in .env' : 'Password';
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
                <div class="input-group">
                    <input type="password" id="password" placeholder="${passwordPlaceholder}" value="${savedPasswordValue}">
                </div>
                <label class="check-row">
                    <input type="checkbox" id="rememberPassword" ${savedPasswordChecked}>
                    <span>Remember password on this device</span>
                </label>
                <button id="loginBtn">Connect to Portal</button>
                <div id="captchaArea" style="display: none; flex-direction: column; gap: 1rem; margin-top: 1rem;">
                    <img id="captchaImg" style="border-radius: 8px; border: 1px solid var(--glass-border);">
                    <input type="text" id="captchaInput" placeholder="Enter Captcha">
                       <div style="display: flex; gap: 0.5rem;">
                           <button id="verifyBtn" style="flex: 1;">Verify & Deep Scrape</button>
                           <button id="autoOcrBtn" title="Use OCR to automatically read CAPTCHA" style="flex: 0; padding: 0.5rem 1rem; background: rgba(100, 200, 255, 0.3); border: 1px solid rgba(100, 200, 255, 0.5); cursor: pointer; border-radius: 8px; color: #64c8ff; font-weight: bold;">🤖 OCR</button>
                           <button id="refreshCaptchaBtn" title="Refresh to latest CAPTCHA from portal" style="flex: 0; padding: 0.5rem 1rem; background: rgba(255, 220, 120, 0.25); border: 1px solid rgba(255, 220, 120, 0.5); cursor: pointer; border-radius: 8px; color: #ffd166; font-weight: bold;">↻</button>
                       </div>
                       <small style="color: var(--accent)">💡 Tip: Use ↻ before entering CAPTCHA to ensure latest image, then Verify. OCR is optional.</small>
                </div>
            </div>
        `;

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
                btn.style.display = 'none';
                document.getElementById('captchaArea').style.display = 'flex';
                document.getElementById('captchaImg').src = data.captcha_base64;
                captchaIssuedAt = Date.now();
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
                        captchaIssuedAt = Date.now();
                        btn.innerHTML = 'Verify & Deep Scrape';
                        alert('Captcha was refreshed because previous one got old. Please type the new captcha and submit again.');
                        return;
                    }
                } catch (e) {
                    // fallback to existing flow
                }
            }
            
            const cap = document.getElementById('captchaInput').value;
            const res = await fetch('/api/captcha', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId, captcha: cap })
            });
            const data = await res.json();
            
            if (data.success) {
                localStorage.setItem('nsut_rollno', rollNo);
                this.renderChat(data.data);
                const warning = data.live_sync_warning
                    ? `\n\n**Live sync note:** ${data.live_sync_warning}. Debug folder: ${data.debug_dir || 'not available'}`
                    : "";
                this.addBotMessage(data.message + warning + "\n\nType **HI** for the full dashboard, **PROFILE** for student info, **CODES** for shortcuts, or ask a subject code like **MEMEC303**.");
            } else {
                btn.innerHTML = 'Verify & Deep Scrape';
                if (data.retryable && data.captcha_base64) {
                    document.getElementById('captchaImg').src = data.captcha_base64;
                    captchaIssuedAt = Date.now();
                }
                const dbg = data.debug_dir ? `\n\nDebug folder: ${data.debug_dir}` : '';
                alert((data.message || 'Verification failed') + dbg);
            }
        });
       
           document.getElementById('autoOcrBtn').addEventListener('click', async () => {
               const btn = document.getElementById('autoOcrBtn');
               const originalText = btn.innerHTML;
               btn.innerHTML = '⏳ Reading...';
               btn.disabled = true;
           
               try {
                   const res = await fetch('/api/captcha', {
                       method: 'POST',
                       headers: { 'Content-Type': 'application/json' },
                       body: JSON.stringify({ session_id: sessionId, auto_ocr: true })
                   });
                   const data = await res.json();
               
                   if (data.success) {
                       localStorage.setItem('nsut_rollno', rollNo);
                       this.renderChat(data.data);
                       const warning = data.live_sync_warning
                           ? `\n\n**Live sync note:** ${data.live_sync_warning}. Debug folder: ${data.debug_dir || 'not available'}`
                           : "";
                       this.addBotMessage("CAPTCHA auto-read with OCR. " + data.message + warning + "\n\nType **HI** for the full dashboard or **CODES** for shortcuts.");
                   } else {
                       btn.innerHTML = originalText;
                       btn.disabled = false;
                       if (data.retryable && data.captcha_base64) {
                           document.getElementById('captchaImg').src = data.captcha_base64;
                           captchaIssuedAt = Date.now();
                       }
                       const dbg = data.debug_dir ? `\n\nDebug folder: ${data.debug_dir}` : '';
                       alert("❌ OCR failed: " + data.message + "\n\nYou can retry OCR or enter CAPTCHA manually without re-login." + dbg);
                   }
               } catch (e) {
                   btn.innerHTML = originalText;
                   btn.disabled = false;
                   alert("❌ Error: " + e.message);
               }
           });
    },

    formatNumber(value, fallback = 0) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    },

    subjectLabel(subject) {
        const code = subject.code || '';
        const name = subject.subject || code || 'Subject';
        return code && code !== name ? `${code} - ${name}` : name;
    },

    subjectsFromAnalysis(analysis) {
        const attendance = analysis && analysis.attendance;
        if (Array.isArray(attendance)) return attendance;
        if (attendance && Array.isArray(attendance.subjects)) return attendance.subjects;
        return [];
    },

    statusText(subject) {
        const status = subject.status_75 || subject.status || '';
        if (status === 'safe') return 'Safe';
        if (status === 'borderline') return 'Borderline';
        if (status === 'danger') return 'Short';
        return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
    },

    avatarMarkup(student, className = '') {
        const name = student && student.name ? student.name : 'Attendance Assistant';
        const classes = `student-avatar ${className}`.trim();
        if (student && student.photo_data_url) {
            return `<img class="${classes}" src="${this.escapeAttr(student.photo_data_url)}" alt="${this.escapeAttr(name)} profile photo">`;
        }
        return `<div class="${classes}" title="Student profile">${this.escapeHtml(this.initials(name))}</div>`;
    },

    profileField(label, value) {
        if (value === undefined || value === null || value === '') return '';
        const isWide = String(label || '').toLowerCase().includes('address') || String(value || '').length > 42;
        const className = isWide ? 'profile-field profile-field-wide' : 'profile-field';
        return `
            <div class="${className}">
                <span>${this.escapeHtml(label)}</span>
                <strong>${this.escapeHtml(value)}</strong>
            </div>
        `;
    },

    renderProfilePanel(analysis) {
        const student = analysis && analysis.student ? analysis.student : {};
        const source = analysis && analysis.source ? analysis.source : {};
        const name = student.name || 'Attendance Assistant';
        const photoNote = student.photo_data_url
            ? 'Portal photo loaded'
            : (student.photo_available ? 'Portal photo detected; image will appear after next fresh sync' : 'Photo not available in cache');

        const baseFields = [
            ['Roll no', student.rollno],
            ['Student ID', student.student_id],
            ['Degree', student.degree],
            ['Department', student.department],
            ['Semester', source.semester || student.semester],
            ['Academic year', source.academic_year || student.academic_year],
            ['Synced at', analysis && analysis.synced_at ? new Date(analysis.synced_at).toLocaleString() : 'Local cache'],
        ];

        const hidden = new Set([
            'name',
            'rollno',
            'student_id',
            'degree',
            'department',
            'semester',
            'academic_year',
            'photo_available',
            'photo_data_url',
        ]);
        const allowedExtra = new Set([
            'father_name',
            'mother_name',
            'date_of_birth',
            'mobile',
            'email',
            'institute_email',
            'personal_email',
            'blood_group',
            'batch',
            'admission_year',
            'admission_no',
            'admission_type',
            'category',
            'gender',
            'address',
            'permanent_address',
            'correspondence_address',
            'guardian_name',
            'father_mobile',
            'mother_mobile',
        ]);
        const extraFields = Object.entries(student)
            .filter(([key, value]) => (
                !hidden.has(key)
                && allowedExtra.has(key)
                && value !== undefined
                && value !== null
                && value !== ''
            ))
            .slice(0, 10)
            .map(([key, value]) => [key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), value]);

        return `
            <section class="profile-panel">
                ${this.avatarMarkup(student, 'student-avatar-large')}
                <div class="profile-main">
                    <div class="profile-title-row">
                        <div>
                            <h2>${this.escapeHtml(name)}</h2>
                            <p>${this.escapeHtml(photoNote)}</p>
                        </div>
                        <button class="mini-action" data-message="PROFILE">Profile</button>
                    </div>
                    <div class="profile-grid">
                        ${baseFields.map(([label, value]) => this.profileField(label, value)).join('')}
                        ${extraFields.map(([label, value]) => this.profileField(label, value)).join('')}
                    </div>
                </div>
            </section>
        `;
    },

    metricCard(label, value, detail) {
        return `
            <div class="metric-card">
                <span>${this.escapeHtml(label)}</span>
                <strong>${this.escapeHtml(value)}</strong>
                <small>${this.escapeHtml(detail || '')}</small>
            </div>
        `;
    },

    renderMetrics(analysis) {
        const insights = analysis && analysis.insights ? analysis.insights : {};
        return `
            <section class="metrics-grid">
                ${this.metricCard('Overall', `${insights.overall_percentage || 0}%`, `${insights.total_attended || 0}/${insights.total_classes || 0} present`)}
                ${this.metricCard('Absent', insights.total_absent || 0, 'total missed classes')}
                ${this.metricCard('Safe skips', insights.total_skippable_75 || 0, 'at 75% threshold')}
                ${this.metricCard('Risk subjects', insights.risky_subject_count || 0, 'near or below 75%')}
            </section>
        `;
    },

    renderBarChart(subjects) {
        if (!subjects || subjects.length === 0) {
            return '<div class="empty-chart">No subject data available.</div>';
        }
        const width = 680;
        const height = 220;
        const chartLeft = 38;
        const chartRight = 18;
        const chartTop = 18;
        const chartBottom = 44;
        const chartWidth = width - chartLeft - chartRight;
        const chartHeight = height - chartTop - chartBottom;
        const gap = 12;
        const barWidth = Math.max(24, (chartWidth - gap * (subjects.length - 1)) / subjects.length);
        const bars = subjects.map((subject, index) => {
            const pct = Math.max(0, Math.min(100, this.formatNumber(subject.percentage)));
            const barHeight = (pct / 100) * chartHeight;
            const x = chartLeft + index * (barWidth + gap);
            const y = chartTop + chartHeight - barHeight;
            const color = pct < 75 ? '#ef4444' : pct < 80 ? '#f59e0b' : '#14b8a6';
            return `
                <g>
                    <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="5" fill="${color}"></rect>
                    <text x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle" class="chart-value">${pct.toFixed(1)}%</text>
                    <text x="${x + barWidth / 2}" y="${height - 18}" text-anchor="middle" class="chart-label">${this.escapeHtml(subject.code || String(index + 1))}</text>
                </g>
            `;
        }).join('');

        return `
            <svg class="chart-svg bar-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Subject attendance bar chart">
                <line x1="${chartLeft}" y1="${chartTop + chartHeight * 0.25}" x2="${width - chartRight}" y2="${chartTop + chartHeight * 0.25}" class="chart-grid-line"></line>
                <line x1="${chartLeft}" y1="${chartTop + chartHeight}" x2="${width - chartRight}" y2="${chartTop + chartHeight}" class="chart-axis"></line>
                <line x1="${chartLeft}" y1="${chartTop + chartHeight * 0.25}" x2="${width - chartRight}" y2="${chartTop + chartHeight * 0.25}" class="threshold-line"></line>
                <text x="${width - chartRight}" y="${chartTop + chartHeight * 0.25 - 6}" text-anchor="end" class="chart-note">75%</text>
                ${bars}
            </svg>
        `;
    },

    buildTrendSeries(subjects) {
        const byDate = new Map();
        (subjects || []).forEach((subject) => {
            (subject.day_wise || []).forEach((event) => {
                if (!event.date) return;
                const current = byDate.get(event.date) || { present: 0, total: 0 };
                current.present += this.formatNumber(event.present_count);
                current.total += this.formatNumber(event.class_count);
                byDate.set(event.date, current);
            });
        });

        let cumulativePresent = 0;
        let cumulativeTotal = 0;
        return Array.from(byDate.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, value]) => {
                cumulativePresent += value.present;
                cumulativeTotal += value.total;
                return {
                    date,
                    percentage: cumulativeTotal ? (cumulativePresent / cumulativeTotal) * 100 : null,
                };
            })
            .filter((point) => point.percentage !== null)
            .slice(-45);
    },

    renderLineChart(subjects) {
        const series = this.buildTrendSeries(subjects);
        if (series.length < 2) {
            return '<div class="empty-chart">Fresh v2 day-wise data is needed for the attendance trend line.</div>';
        }
        const width = 680;
        const height = 220;
        const left = 42;
        const right = 18;
        const top = 16;
        const bottom = 38;
        const plotWidth = width - left - right;
        const plotHeight = height - top - bottom;
        const min = Math.min(70, ...series.map((point) => point.percentage));
        const max = 100;
        const yFor = (pct) => top + ((max - pct) / Math.max(max - min, 1)) * plotHeight;
        const xFor = (index) => left + (index / Math.max(series.length - 1, 1)) * plotWidth;
        const points = series.map((point, index) => `${xFor(index)},${yFor(point.percentage)}`).join(' ');
        const first = series[0];
        const last = series[series.length - 1];

        return `
            <svg class="chart-svg line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Attendance trend line chart">
                <line x1="${left}" y1="${yFor(75)}" x2="${width - right}" y2="${yFor(75)}" class="threshold-line"></line>
                <text x="${width - right}" y="${yFor(75) - 6}" text-anchor="end" class="chart-note">75%</text>
                <line x1="${left}" y1="${top + plotHeight}" x2="${width - right}" y2="${top + plotHeight}" class="chart-axis"></line>
                <polyline points="${points}" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
                <circle cx="${xFor(series.length - 1)}" cy="${yFor(last.percentage)}" r="5" fill="#38bdf8"></circle>
                <text x="${left}" y="${height - 14}" class="chart-label">${this.escapeHtml(first.date)}</text>
                <text x="${width - right}" y="${height - 14}" text-anchor="end" class="chart-label">${this.escapeHtml(last.date)}</text>
                <text x="${width - right}" y="${yFor(last.percentage) - 12}" text-anchor="end" class="chart-value">${last.percentage.toFixed(1)}%</text>
            </svg>
        `;
    },

    renderSubjectRows(subjects) {
        if (!subjects || subjects.length === 0) {
            return '<tr><td colspan="9">No subjects match this filter.</td></tr>';
        }
        return subjects.map((subject) => {
            const status = this.statusText(subject);
            const action75 = subject.status_75 === 'danger'
                ? `Attend ${subject.needed_75 || 0}`
                : `Skip ${subject.skippable_75 || 0}`;
            return `
                <tr>
                    <td>${this.escapeHtml(subject.code || '')}</td>
                    <td>${this.escapeHtml(subject.subject || '')}</td>
                    <td>${this.escapeHtml(status)}</td>
                    <td>${this.escapeHtml(subject.percentage || 0)}%</td>
                    <td>${this.escapeHtml(subject.attended || 0)}</td>
                    <td>${this.escapeHtml(subject.total || 0)}</td>
                    <td>${this.escapeHtml(subject.absent || 0)}</td>
                    <td>${this.escapeHtml(action75)}</td>
                    <td>${this.escapeHtml((subject.recent_activity || [])[0]?.raw || '-')}</td>
                </tr>
            `;
        }).join('');
    },

    filteredSubjects() {
        const subjects = this.subjectsFromAnalysis(currentAnalysis);
        const search = (document.getElementById('subjectSearch')?.value || '').trim().toLowerCase();
        const status = document.getElementById('statusFilter')?.value || 'all';
        return subjects.filter((subject) => {
            const haystack = `${subject.code || ''} ${subject.subject || ''}`.toLowerCase();
            const matchesSearch = !search || haystack.includes(search);
            const pct = this.formatNumber(subject.percentage);
            const matchesStatus =
                status === 'all'
                || (status === 'risk' && subject.status_75 !== 'safe')
                || (status === 'safe' && subject.status_75 === 'safe')
                || (status === 'below80' && pct < 80)
                || (status === 'absent' && this.formatNumber(subject.absent) > 0);
            return matchesSearch && matchesStatus;
        });
    },

    renderSubjectTable(subjects) {
        return `
            <div class="table-scroll">
                <table class="analysis-table subject-table">
                    <thead>
                        <tr>
                            <th>Code</th>
                            <th>Subject</th>
                            <th>Status</th>
                            <th>%</th>
                            <th>Present</th>
                            <th>Total</th>
                            <th>Absent</th>
                            <th>75% action</th>
                            <th>Latest mark</th>
                        </tr>
                    </thead>
                    <tbody>${this.renderSubjectRows(subjects)}</tbody>
                </table>
            </div>
        `;
    },

    renderPortalSummary(analysis) {
        const portal = analysis && analysis.portal ? analysis.portal : {};
        const surfaces = portal.data_surfaces || (analysis && analysis.source && analysis.source.data_surfaces) || [];
        const tables = portal.tables || [];
        const sections = portal.sections || [];
        const tableCards = tables.slice(0, 6).map((table) => {
            const title = table.title || table.surface || 'Portal table';
            const columns = (table.columns || []).slice(0, 8);
            return `
                <div class="portal-table-item">
                    <strong>${this.escapeHtml(title)}</strong>
                    <span>${this.escapeHtml(table.surface || 'portal')} - ${this.escapeHtml(table.row_count || (table.rows || []).length || 0)} row(s)</span>
                    <p>${columns.length ? this.escapeHtml(columns.join(', ')) : 'Columns are captured when the portal table exposes headers.'}</p>
                </div>
            `;
        }).join('');
        return `
            <section class="portal-panel portal-summary">
                <div>
                    <h3>Portal surfaces</h3>
                    <div class="surface-list">
                        ${surfaces.map((surface) => `<span>${this.escapeHtml(surface.replace(/_/g, ' '))}</span>`).join('') || '<span>No authenticated menu cached</span>'}
                    </div>
                </div>
                <div>
                    <h3>Captured tables</h3>
                    <p>${this.escapeHtml(tables.length)} table(s) captured from profile/course/timetable pages when available.</p>
                    <p>${this.escapeHtml(sections.length)} menu section(s) mapped from the authenticated portal.</p>
                </div>
                <div class="portal-table-list">
                    ${tableCards || '<div class="portal-table-item"><strong>No extra portal tables cached yet</strong><span>Fresh login will try ID card, registered courses, and timetable pages.</span></div>'}
                </div>
            </section>
        `;
    },

    renderDashboard(analysis) {
        const subjects = this.subjectsFromAnalysis(analysis);
        const source = analysis && analysis.source ? analysis.source : {};
        const cacheNote = source.legacy_cache
            ? '<div class="sync-banner">Legacy cache loaded. Fresh login rebuilds day-wise charts, profile fields, portal tables, and photo data.</div>'
            : '';
        return `
            ${cacheNote}
            ${this.renderProfilePanel(analysis || {})}
            ${this.renderMetrics(analysis || {})}
            <section class="chart-grid">
                <div class="analysis-card">
                    <div class="card-title-row">
                        <h3>Subject percentages</h3>
                        <span>75% threshold</span>
                    </div>
                    ${this.renderBarChart(subjects)}
                </div>
                <div class="analysis-card">
                    <div class="card-title-row">
                        <h3>Attendance trend</h3>
                        <span>cumulative</span>
                    </div>
                    ${this.renderLineChart(subjects)}
                </div>
            </section>
            <section class="analysis-card">
                <div class="card-title-row">
                    <h3>Subject table</h3>
                    <div class="filter-row">
                        <input type="search" id="subjectSearch" placeholder="Filter subject or code">
                        <select id="statusFilter">
                            <option value="all">All</option>
                            <option value="risk">Risk</option>
                            <option value="safe">Safe</option>
                            <option value="below80">Below 80%</option>
                            <option value="absent">Has absences</option>
                        </select>
                    </div>
                </div>
                <div id="subjectTableWrap">${this.renderSubjectTable(subjects)}</div>
            </section>
            ${this.renderPortalSummary(analysis || {})}
        `;
    },

    updateSubjectTable() {
        const target = document.getElementById('subjectTableWrap');
        if (target) {
            target.innerHTML = this.renderSubjectTable(this.filteredSubjects());
        }
    },

    renderChat(analysis = null) {
        currentAnalysis = analysis;
        const insights = analysis && analysis.insights ? analysis.insights : null;
        const student = analysis && analysis.student ? analysis.student : {};
        const source = analysis && analysis.source ? analysis.source : {};
        const headerMeta = insights
            ? `${student.rollno ? `${student.rollno} - ` : ''}${insights.overall_percentage || 0}% - ${insights.total_attended || 0}/${insights.total_classes || 0} - ${insights.total_absent || 0} absent${source.legacy_cache ? ' - legacy cache' : ''}`
            : 'Smart attendance workspace';
        const studentName = student.name || 'Attendance Assistant';
        const safeStudentName = this.escapeHtml(studentName);

        document.getElementById('app').innerHTML = `
            <div class="glass-panel chat-container">
                <div class="chat-header">
                    <div class="student-heading">
                        ${this.avatarMarkup(student)}
                        <div>
                            <h2 style="margin: 0; font-size: 1.2rem;">${safeStudentName}</h2>
                            <div class="chat-subtitle">${this.escapeHtml(headerMeta)}</div>
                        </div>
                    </div>
                    <button id="logoutBtn" style="padding: 0.5rem 1rem; font-size: 0.9rem; background: rgba(255,255,255,0.1); border-radius: 8px; color: white; border: none; cursor: pointer;">Log Out</button>
                </div>
                <div class="workspace-grid">
                    <div class="dashboard-scroll">
                        ${this.renderDashboard(analysis || {})}
                    </div>
                    <aside class="assistant-panel">
                        <div class="chat-messages" id="chatMessages"></div>
                        <div class="quick-actions">
                            <button class="quick-chip" data-message="HI">HI</button>
                            <button class="quick-chip" data-message="SW">SW</button>
                            <button class="quick-chip" data-message="TOTAL">TOTAL</button>
                            <button class="quick-chip" data-message="ABSENT">ABSENT</button>
                            <button class="quick-chip" data-message="SAFE">SAFE</button>
                            <button class="quick-chip" data-message="RISK">RISK</button>
                            <button class="quick-chip" data-message="PROFILE">PROFILE</button>
                        </div>
                        <div class="chat-input-area">
                            <input type="text" id="chatInput" placeholder="Type HI for summary, SW for subject-wise...">
                            <button id="sendBtn">Send</button>
                        </div>
                    </aside>
                </div>
            </div>
        `;

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
        document.querySelectorAll('.mini-action').forEach((button) => {
            button.addEventListener('click', () => {
                document.getElementById('chatInput').value = button.dataset.message;
                sendMsg();
            });
        });
        document.getElementById('subjectSearch')?.addEventListener('input', () => this.updateSubjectTable());
        document.getElementById('statusFilter')?.addEventListener('change', () => this.updateSubjectTable());
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
