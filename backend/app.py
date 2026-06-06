import traceback as _traceback
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from scraper import AttendanceScraper
from chatbot import ChatbotEngine
from logging_config import setup_logging
import os
import json
import socket
import uuid
import cookie_store

app = Flask(__name__)
CORS(app)


def _load_local_env():
    """Load simple key=value pairs from .env files.

    Order (later overrides):
      1. Root .env (../.env) — dev convenience
      2. backend/.env — production / Render overrides
    """
    candidates = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"),
    ]
    for env_path in candidates:
        if not os.path.exists(env_path):
            continue
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, value = line.split("=", 1)
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    os.environ.setdefault(key, value)
        except:
            pass


_load_local_env()

# Configure logging
setup_logging(app)

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
APP_VERSION = "data-analysis-assistant-v3"

if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)

FRONTEND_DIST = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist"
)
SERVE_FRONTEND = os.path.isfile(os.path.join(FRONTEND_DIST, "index.html"))

user_sessions = {}

FRONTEND_URL = os.getenv("FRONTEND_URL", "")

if SERVE_FRONTEND:
    print(f"[PRODUCTION] Serving frontend from {FRONTEND_DIST}")

    @app.route("/")
    def serve_index():
        return send_from_directory(FRONTEND_DIST, "index.html")

    @app.route("/assets/<path:filename>")
    def serve_assets(filename):
        return send_from_directory(os.path.join(FRONTEND_DIST, "assets"), filename)

    @app.route("/models/<path:filename>")
    def serve_vlm_models(filename):
        return send_from_directory(
            os.path.join(FRONTEND_DIST, "..", "public", "models"), filename
        )

    @app.route("/<path:filename>")
    def serve_static(filename):
        if filename.startswith("api/"):
            return jsonify({"error": "Not found"}), 404
        filepath = os.path.join(FRONTEND_DIST, filename)
        if os.path.exists(filepath) and os.path.isfile(filepath):
            return send_from_directory(FRONTEND_DIST, filename)
        return send_from_directory(FRONTEND_DIST, "index.html")
else:
    print("[DEVELOPMENT] API-only mode. Frontend served by Vite on port 5173")

    @app.route("/")
    def api_only_root():
        url = FRONTEND_URL or "http://localhost:5173"
        return (
            f"""<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Kairon API</title>
<style>body{{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0f0f23;color:#e0e0e0}}a{{color:#64c8ff}}.card{{max-width:500px;padding:2rem;background:rgba(255,255,255,0.05);border-radius:12px;border:1px solid rgba(255,255,255,0.1);text-align:center}}code{{background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;font-size:0.9em}}</style></head>
<body><div class="card"><h1>⚡ Kairon API</h1><p>This is the <strong>backend API server</strong>. Open the <a href="{url}">frontend →</a> to use the app.</p><p>API endpoints are at <code>/api/*</code>.</p></div></body></html>""",
            200,
            {"Content-Type": "text/html; charset=utf-8"},
        )


def _default_rollno():
    return (
        os.getenv("roll_no")
        or os.getenv("ROLL_NO")
        or os.getenv("student_id")
        or os.getenv("STUDENT_ID")
        or ""
    )


def _default_password():
    return (
        os.getenv("password")
        or os.getenv("PASSWORD")
        or os.getenv("student_password")
        or os.getenv("STUDENT_PASSWORD")
        or ""
    )


def _cache_file_for(rollno):
    return os.path.join(DATA_DIR, f"{rollno}.json") if rollno else ""


def _cache_schema_version(cached_data):
    return cached_data.get("schema_version", 1) if isinstance(cached_data, dict) else 1


def _load_cached_analysis(rollno):
    cache_file = _cache_file_for(rollno)
    if not cache_file or not os.path.exists(cache_file):
        return None
    with open(cache_file, "r", encoding="utf-8") as f:
        return json.load(f)


def _merge_live_profile(analysis, scraper):
    if not isinstance(analysis, dict):
        return analysis
    portal_catalog = getattr(scraper, "_last_portal_catalog", {}) or {}
    attendance_payload = getattr(scraper, "_last_attendance_payload", {}) or {}
    live_student = {
        **(portal_catalog.get("student_profile") or {}),
        **(attendance_payload.get("student") or {}),
    }
    live_student = {key: value for key, value in live_student.items() if value}
    if live_student:
        analysis["student"] = {**live_student, **(analysis.get("student") or {})}
        analysis["portal"] = analysis.get("portal") or portal_catalog
        source = analysis.setdefault("source", {})
        source["profile_source"] = "live_portal"
    return analysis


def _create_cached_session(session_id, rollno, cached_data, source_scraper=None):
    scraper = AttendanceScraper(use_mock=True)
    scraper.cached_analysis = cached_data
    chatbot = ChatbotEngine(scraper)
    analysis = chatbot.analysis_payload()
    analysis = (
        _merge_live_profile(analysis, source_scraper) if source_scraper else analysis
    )
    scraper.cached_analysis = analysis
    chatbot = ChatbotEngine(scraper)
    user_sessions[session_id] = {
        "scraper": scraper,
        "chatbot": chatbot,
        "rollno": rollno,
    }
    return analysis, _cache_schema_version(cached_data)


@app.route("/api/config", methods=["GET"])
def config():
    rollno = _default_rollno()
    cache_file = _cache_file_for(rollno)
    cache_schema_version = None
    if cache_file and os.path.exists(cache_file):
        try:
            cache_schema_version = _cache_schema_version(_load_cached_analysis(rollno))
        except:
            cache_schema_version = None
    return jsonify(
        {
            "assistant_version": APP_VERSION,
            "default_rollno": rollno,
            "has_saved_password": bool(_default_password()),
            "default_password": _default_password() or "",
            "has_cached_data": bool(cache_file and os.path.exists(cache_file)),
            "cache_schema_version": cache_schema_version,
            "cache_needs_refresh": bool(
                cache_schema_version and cache_schema_version < 3
            ),
        }
    )


@app.route("/api/login", methods=["POST"])
def login():
    data = request.json or {}
    rollno = data.get("rollno") or _default_rollno()
    password = data.get("password") or _default_password()
    if not rollno or not password:
        missing = "roll number" if not rollno else "password"
        return jsonify(
            {
                "success": False,
                "message": f"{missing} required. Enter it once or set it in .env.",
                "needs_password": not bool(password),
            }
        ), 400

    scraper = AttendanceScraper(use_mock=False)
    result = scraper.start_login(rollno, password)

    if result.get("success"):
        session_id = result["session_id"]
        user_sessions[session_id] = {
            "scraper": scraper,
            "chatbot": ChatbotEngine(scraper),
            "rollno": rollno,
        }
        result["rollno"] = rollno
        if result.get("cookie_reused"):
            result["message"] = "Session cookie reused \u2014 bypassing CAPTCHA"
        return jsonify(result)
    else:
        return jsonify(
            {
                "success": False,
                "message": result.get("message", "Failed to load login page."),
            }
        ), 401


@app.route("/api/check_cache", methods=["POST"])
def check_cache():
    data = request.json or {}
    rollno = data.get("rollno") or _default_rollno()

    if not rollno:
        return jsonify({"success": False, "message": "Roll number required"})

    cache_file = _cache_file_for(rollno)
    if os.path.exists(cache_file):
        cached_data = _load_cached_analysis(rollno)
        session_id = str(uuid.uuid4())
        analysis, cache_schema_version = _create_cached_session(
            session_id, rollno, cached_data
        )
        return jsonify(
            {
                "success": True,
                "session_id": session_id,
                "message": "Loaded from cache",
                "assistant_version": APP_VERSION,
                "cache_schema_version": cache_schema_version,
                "cache_needs_refresh": cache_schema_version < 3,
                "analysis": analysis,
            }
        )

    return jsonify({"success": False, "message": "No cache found"})


@app.route("/api/captcha", methods=["POST"])
def verify_captcha():
    data = request.json or {}
    session_id = data.get("session_id")
    captcha_text = data.get("captcha", "").strip()
    auto_ocr = data.get("auto_ocr", False)

    if not session_id:
        return jsonify({"success": False, "message": "session_id required"}), 400

    if session_id not in user_sessions:
        return jsonify(
            {"success": False, "message": "Session expired or invalid."}
        ), 401

    scraper = user_sessions[session_id]["scraper"]
    if not scraper.has_session(session_id):
        # Keep app + scraper session stores in sync.
        try:
            del user_sessions[session_id]
        except:
            pass
        return jsonify(
            {"success": False, "message": "Session expired. Please login again."}
        ), 401

    # Pass fresh credentials from frontend so captcha submission uses what the user sees
    fresh_rollno = data.get("rollno")
    fresh_password = data.get("password")
    print(
        f"[CAPTCHA] Submitting for rollno={fresh_rollno}, auto_ocr={auto_ocr}, captcha_len={len(captcha_text or '')}"
    )
    try:
        result = scraper.submit_captcha_and_scrape(
            session_id,
            captcha_text=captcha_text,
            auto_ocr=auto_ocr,
            override_rollno=fresh_rollno,
            override_password=fresh_password,
        )
    except Exception as e:
        _traceback.print_exc()
        print(f"[CAPTCHA] Unhandled exception in submit_captcha_and_scrape: {e}")
        return jsonify(
            {
                "success": False,
                "message": f"Scraper error: {str(e)[:300]}",
                "retryable": True,
            }
        ), 500

    if result.get("success"):
        # Save to cache
        try:
            rollno = user_sessions[session_id]["rollno"]
            with open(os.path.join(DATA_DIR, f"{rollno}.json"), "w") as f:
                json.dump(scraper.cached_analysis, f)
        except:
            pass

        return jsonify(
            {
                "success": True,
                "message": "✓ Login successful! Attendance data fetched.",
                "data": scraper.get_full_analysis(),
            }
        )
    else:
        debug_dir = scraper.get_session_debug_dir(session_id)
        rollno = user_sessions[session_id]["rollno"]
        if "No attendance records found" in (result.get("message") or ""):
            try:
                cached_data = _load_cached_analysis(rollno)
                if cached_data:
                    analysis, cache_schema_version = _create_cached_session(
                        session_id,
                        rollno,
                        cached_data,
                        source_scraper=scraper,
                    )
                    try:
                        scraper.close_session(session_id)
                    except:
                        pass
                    return jsonify(
                        {
                            "success": True,
                            "message": "✓ Login accepted, but the live portal returned an empty attendance report. I loaded the last valid local cache instead.",
                            "live_sync_warning": "Portal returned no non-zero attendance records for the tested year/semester filters.",
                            "debug_dir": debug_dir,
                            "cache_schema_version": cache_schema_version,
                            "cache_needs_refresh": cache_schema_version < 3,
                            "data": analysis,
                        }
                    )
            except:
                pass

        # Retryable failures should keep session alive so user can retry without password.
        if result.get("retryable"):
            error_msg = result.get("message", "Captcha failed.")
            print(f"[CAPTCHA] Retryable failure: {error_msg}")
            return jsonify(
                {
                    "success": False,
                    "message": error_msg,
                    "retryable": True,
                    "captcha_base64": result.get("captcha_base64"),
                    "debug_dir": debug_dir,
                }
            ), 401

        try:
            del user_sessions[session_id]
        except:
            pass
        return jsonify(
            {
                "success": False,
                "message": result.get("message", "Captcha or login failed."),
                "retryable": False,
                "debug_dir": debug_dir,
            }
        ), 401


@app.route("/api/captcha/refresh", methods=["POST"])
def refresh_captcha():
    data = request.json or {}
    session_id = data.get("session_id")

    if not session_id:
        return jsonify({"success": False, "message": "session_id required"}), 400

    if session_id not in user_sessions:
        return jsonify(
            {"success": False, "message": "Session expired or invalid."}
        ), 401

    scraper = user_sessions[session_id]["scraper"]
    if not scraper.has_session(session_id):
        try:
            del user_sessions[session_id]
        except:
            pass
        return jsonify(
            {"success": False, "message": "Session expired. Please login again."}
        ), 401

    result = scraper.refresh_captcha(session_id)
    if result.get("success"):
        return jsonify(
            {"success": True, "captcha_base64": result.get("captcha_base64")}
        ), 200

    return jsonify(
        {
            "success": False,
            "message": result.get("message", "Failed to refresh captcha."),
            "debug_dir": scraper.get_session_debug_dir(session_id),
        }
    ), 500


@app.route("/api/cookies/status", methods=["POST"])
def cookie_status():
    data = request.json or {}
    rollno = data.get("rollno") or _default_rollno()
    if not rollno:
        return jsonify({"success": False, "message": "Roll number required"}), 400
    return jsonify(
        {
            "success": True,
            "has_valid_session": cookie_store.has_valid_session(rollno),
            "age_hours": cookie_store.cookie_age_hours(rollno),
            "max_age_hours": cookie_store.MAX_SESSION_AGE_HOURS,
        }
    )


@app.route("/api/cookies/clear", methods=["POST"])
def cookie_clear():
    data = request.json or {}
    rollno = data.get("rollno") or _default_rollno()
    if rollno:
        cookie_store.delete_cookies(rollno)
    return jsonify({"success": True, "message": "Cookies cleared"})


def _analysis_subjects(analysis):
    if isinstance(analysis, list):
        return analysis
    if isinstance(analysis, dict):
        return analysis.get("attendance") or []
    return []


def _analysis_dict(analysis):
    return analysis if isinstance(analysis, dict) else {}


def _session_source_kind(session_data):
    scraper = session_data.get("scraper")
    return "cache" if getattr(scraper, "use_mock", False) else "live_scrape"


def _session_analysis(session_id):
    session_data = user_sessions.get(session_id)
    if not session_data:
        return None, None
    scraper = session_data.get("scraper")
    if not scraper:
        return session_data, None
    try:
        return session_data, scraper.get_full_analysis()
    except:
        return session_data, None


def _session_has_browser(session_id, session_data):
    scraper = session_data.get("scraper")
    if not scraper:
        return False
    try:
        return bool(scraper.has_session(session_id))
    except:
        return False


def _subject_coral_row(session_id, session_data, subject):
    rollno = session_data.get("rollno", "")
    source_kind = _session_source_kind(session_data)
    absent = subject.get(
        "absent", max(subject.get("total", 0) - subject.get("attended", 0), 0)
    )
    return {
        "session_id": session_id,
        "rollno": rollno,
        "source_kind": source_kind,
        "academic_year": subject.get("academic_year", ""),
        "semester": subject.get("semester", ""),
        "subject": subject.get("subject", ""),
        "code": subject.get("code", ""),
        "attended": subject.get("attended", 0),
        "total": subject.get("total", 0),
        "absent": absent,
        "attended_days": subject.get("attended_days", 0),
        "absent_days": subject.get("absent_days", 0),
        "percentage": subject.get("percentage", 0),
        "status_75": subject.get("status_75", subject.get("status", "")),
        "skippable_75": subject.get("skippable_75", 0),
        "needed_75": subject.get("needed_75", 0),
        "status_65": subject.get("status_65", ""),
        "skippable_65": subject.get("skippable_65", 0),
        "needed_65": subject.get("needed_65", 0),
        "status": subject.get("status", ""),
        "message": subject.get("message_75") or subject.get("message", ""),
        "details_link": subject.get("details_link") or "",
        "day_wise_count": len(subject.get("day_wise") or []),
        "special_event_count": len(subject.get("special_events") or []),
    }


def _session_not_found_response(collection_name):
    return jsonify(
        {"success": False, "message": "Unknown session_id", collection_name: []}
    ), 404


def _session_base_row(session_id, session_data):
    return {
        "session_id": session_id,
        "rollno": session_data.get("rollno", ""),
        "source_kind": _session_source_kind(session_data),
    }


def _event_special_codes(event):
    codes = []
    for code in event.get("special_codes") or []:
        text = str(code or "").strip()
        if text and text not in codes:
            codes.append(text)
    for token in event.get("tokens") or []:
        text = str(token or "").strip()
        if text and not text.isdigit() and text not in codes:
            codes.append(text)
    raw = str(event.get("raw") or "").strip()
    if not codes and raw:
        for token in raw.replace("+", " ").replace(",", " ").split():
            token = token.strip()
            if token and not token.isdigit() and token not in codes:
                codes.append(token)
    return codes


@app.route("/api/coral/health", methods=["GET"])
def coral_health():
    return jsonify(
        {
            "success": True,
            "service": "kairon",
            "assistant_version": APP_VERSION,
            "session_count": len(user_sessions),
            "default_rollno": _default_rollno(),
            "has_saved_password": bool(_default_password()),
        }
    )


@app.route("/api/coral/sessions", methods=["GET"])
def coral_sessions():
    rows = []
    for session_id, session_data in user_sessions.items():
        _, analysis_data = _session_analysis(session_id)
        subjects = _analysis_subjects(analysis_data)
        scraper = session_data.get("scraper")
        try:
            debug_dir = scraper.get_session_debug_dir(session_id) if scraper else ""
        except:
            debug_dir = ""
        analysis = _analysis_dict(analysis_data)
        insights = analysis.get("insights") or {}
        student = analysis.get("student") or {}
        source = analysis.get("source") or {}
        rows.append(
            {
                "session_id": session_id,
                "rollno": session_data.get("rollno", ""),
                "source_kind": _session_source_kind(session_data),
                "has_analysis": bool(subjects),
                "subject_count": len(subjects),
                "has_browser_session": _session_has_browser(session_id, session_data),
                "debug_dir": debug_dir or "",
                "student_name": student.get("name", ""),
                "overall_percentage": insights.get("overall_percentage"),
                "total_attended": insights.get("total_attended", 0),
                "total_classes": insights.get("total_classes", 0),
                "total_absent": insights.get("total_absent", 0),
                "synced_at": analysis.get("synced_at", ""),
                "schema_version": analysis.get("schema_version", 1),
                "academic_year": source.get("academic_year", ""),
                "semester": source.get("semester", ""),
                "available_years": source.get("available_years", []),
                "available_semesters": source.get("available_semesters", []),
                "synced_filters": source.get("synced_filters", []),
            }
        )
    return jsonify({"success": True, "sessions": rows})


@app.route("/api/coral/attendance_subjects", methods=["GET"])
def coral_attendance_subjects():
    session_id = request.args.get("session_id", "").strip()
    session_data, analysis_data = _session_analysis(session_id)
    if not session_data:
        return jsonify(
            {"success": False, "message": "Unknown session_id", "subjects": []}
        ), 404

    subjects = [
        _subject_coral_row(session_id, session_data, subject)
        for subject in _analysis_subjects(analysis_data)
    ]
    return jsonify({"success": True, "subjects": subjects})


@app.route("/api/coral/attendance_days", methods=["GET"])
def coral_attendance_days():
    session_id = request.args.get("session_id", "").strip()
    session_data, analysis_data = _session_analysis(session_id)
    if not session_data:
        return jsonify(
            {"success": False, "message": "Unknown session_id", "days": []}
        ), 404

    rows = []
    rollno = session_data.get("rollno", "")
    source_kind = _session_source_kind(session_data)
    for subject in _analysis_subjects(analysis_data):
        for event in subject.get("day_wise") or []:
            rows.append(
                {
                    "session_id": session_id,
                    "rollno": rollno,
                    "source_kind": source_kind,
                    "academic_year": subject.get("academic_year", ""),
                    "semester": subject.get("semester", ""),
                    "subject": subject.get("subject", ""),
                    "code": subject.get("code", ""),
                    "date": event.get("date", ""),
                    "label": event.get("label", ""),
                    "status": event.get("status", ""),
                    "present_count": event.get("present_count", 0),
                    "absent_count": event.get("absent_count", 0),
                    "special_count": event.get("special_count", 0),
                    "special_codes": ",".join(_event_special_codes(event)),
                    "class_count": event.get("class_count", 0),
                    "raw": event.get("raw", ""),
                }
            )
    return jsonify({"success": True, "days": rows})


@app.route("/api/coral/session_summary", methods=["GET"])
def coral_session_summary():
    session_id = request.args.get("session_id", "").strip()
    session_data, analysis_data = _session_analysis(session_id)
    if not session_data:
        return _session_not_found_response("summaries")

    analysis = _analysis_dict(analysis_data)
    insights = analysis.get("insights") or {}
    source = analysis.get("source") or {}
    subjects = _analysis_subjects(analysis_data)
    row = {
        **_session_base_row(session_id, session_data),
        "schema_version": analysis.get("schema_version", 1),
        "synced_at": analysis.get("synced_at", ""),
        "academic_year": source.get("academic_year", ""),
        "semester": source.get("semester", ""),
        "available_year_count": len(source.get("available_years") or []),
        "available_semester_count": len(source.get("available_semesters") or []),
        "synced_filter_count": len(source.get("synced_filters") or []),
        "surface_count": len(source.get("data_surfaces") or []),
        "subject_count": insights.get("subject_count", len(subjects)),
        "total_attended": insights.get(
            "total_attended", sum(item.get("attended", 0) for item in subjects)
        ),
        "total_absent": insights.get(
            "total_absent",
            sum(
                item.get(
                    "absent", max(item.get("total", 0) - item.get("attended", 0), 0)
                )
                for item in subjects
            ),
        ),
        "total_classes": insights.get(
            "total_classes", sum(item.get("total", 0) for item in subjects)
        ),
        "overall_percentage": insights.get("overall_percentage", 0),
        "risky_subject_count": insights.get(
            "risky_subject_count",
            len([item for item in subjects if item.get("status_75") != "safe"]),
        ),
        "total_skippable_75": insights.get("total_skippable_75", 0),
    }
    return jsonify({"success": True, "summaries": [row]})


@app.route("/api/coral/student_profile", methods=["GET"])
def coral_student_profile():
    session_id = request.args.get("session_id", "").strip()
    session_data, analysis_data = _session_analysis(session_id)
    if not session_data:
        return _session_not_found_response("profiles")

    analysis = _analysis_dict(analysis_data)
    student = analysis.get("student") or {}
    source = analysis.get("source") or {}
    row = {
        **_session_base_row(session_id, session_data),
        "name": student.get("name", ""),
        "student_id": student.get("student_id", ""),
        "degree": student.get("degree", ""),
        "department": student.get("department", ""),
        "semester": source.get("semester") or student.get("semester", ""),
        "academic_year": source.get("academic_year")
        or student.get("academic_year", ""),
        "photo_available": bool(student.get("photo_available")),
        "photo_cached": bool(
            student.get("photo_base64") or student.get("photo_data_url")
        ),
    }
    return jsonify({"success": True, "profiles": [row]})


@app.route("/api/coral/synced_filters", methods=["GET"])
def coral_synced_filters():
    session_id = request.args.get("session_id", "").strip()
    session_data, analysis_data = _session_analysis(session_id)
    if not session_data:
        return _session_not_found_response("filters")

    analysis = _analysis_dict(analysis_data)
    source = analysis.get("source") or {}
    rows = []
    for index, item in enumerate(source.get("synced_filters") or [], start=1):
        rows.append(
            {
                **_session_base_row(session_id, session_data),
                "position": index,
                "academic_year": item.get("year", ""),
                "semester": item.get("semester", ""),
                "filter_attempt": item.get("filter_attempt", 0),
            }
        )
    return jsonify({"success": True, "filters": rows})


@app.route("/api/coral/portal_surfaces", methods=["GET"])
def coral_portal_surfaces():
    session_id = request.args.get("session_id", "").strip()
    session_data, analysis_data = _session_analysis(session_id)
    if not session_data:
        return _session_not_found_response("surfaces")

    analysis = _analysis_dict(analysis_data)
    source = analysis.get("source") or {}
    portal = analysis.get("portal") or {}
    surfaces = source.get("data_surfaces") or portal.get("data_surfaces") or []
    rows = [
        {
            **_session_base_row(session_id, session_data),
            "position": index,
            "surface": surface,
        }
        for index, surface in enumerate(surfaces, start=1)
    ]
    return jsonify({"success": True, "surfaces": rows})


@app.route("/api/coral/portal_links", methods=["GET"])
def coral_portal_links():
    session_id = request.args.get("session_id", "").strip()
    session_data, analysis_data = _session_analysis(session_id)
    if not session_data:
        return _session_not_found_response("links")

    analysis = _analysis_dict(analysis_data)
    portal = analysis.get("portal") or {}
    rows = []
    for index, item in enumerate(portal.get("links") or [], start=1):
        rows.append(
            {
                **_session_base_row(session_id, session_data),
                "position": index,
                "section": item.get("section", ""),
                "text": item.get("text", ""),
                "target": item.get("target", ""),
            }
        )
    return jsonify({"success": True, "links": rows})


@app.route("/api/coral/status_legend", methods=["GET"])
def coral_status_legend():
    session_id = request.args.get("session_id", "").strip()
    session_data, analysis_data = _session_analysis(session_id)
    if not session_data:
        return _session_not_found_response("legend")

    analysis = _analysis_dict(analysis_data)
    source = analysis.get("source") or {}
    legend = source.get("status_legend") or {}
    rows = [
        {
            **_session_base_row(session_id, session_data),
            "code": code,
            "description": description,
        }
        for code, description in sorted(legend.items())
    ]
    return jsonify({"success": True, "legend": rows})


@app.route("/api/coral/attendance_marks", methods=["GET"])
def coral_attendance_marks():
    session_id = request.args.get("session_id", "").strip()
    session_data, analysis_data = _session_analysis(session_id)
    if not session_data:
        return _session_not_found_response("marks")

    analysis = _analysis_dict(analysis_data)
    source = analysis.get("source") or {}
    legend = source.get("status_legend") or {}
    rows = []
    for subject in _analysis_subjects(analysis_data):
        for event in subject.get("day_wise") or []:
            for code in _event_special_codes(event):
                rows.append(
                    {
                        **_session_base_row(session_id, session_data),
                        "academic_year": subject.get("academic_year", ""),
                        "semester": subject.get("semester", ""),
                        "subject": subject.get("subject", ""),
                        "subject_code": subject.get("code", ""),
                        "date": event.get("date", ""),
                        "label": event.get("label", ""),
                        "mark": code,
                        "description": legend.get(code, ""),
                        "raw": event.get("raw", ""),
                    }
                )
    return jsonify({"success": True, "marks": rows})


def _find_available_port(preferred_port):
    """Return preferred_port if free; otherwise return an OS-assigned free port."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        probe.bind(("0.0.0.0", preferred_port))
        return preferred_port
    except OSError:
        pass
    finally:
        probe.close()

    fallback = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        fallback.bind(("0.0.0.0", 0))
        return fallback.getsockname()[1]
    finally:
        fallback.close()


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.json or {}
    session_id = data.get("session_id")
    user_message = data.get("message", "")

    if session_id not in user_sessions:
        return jsonify({"reply": "Please login first. Session expired."}), 401

    chatbot = user_sessions[session_id]["chatbot"]
    reply = chatbot.process_message(user_message)
    return jsonify({"reply": reply, "assistant_version": APP_VERSION})


@app.route("/api/analysis", methods=["POST"])
def analysis():
    data = request.json or {}
    session_id = data.get("session_id")
    if not session_id or session_id not in user_sessions:
        return jsonify(
            {"success": False, "message": "Invalid or missing session_id"}
        ), 401

    scraper = user_sessions[session_id]["scraper"]
    return jsonify({"success": True, "analysis": scraper.get_full_analysis()})


@app.errorhandler(Exception)
def _handle_global_error(error):
    print(f"[FATAL] Unhandled exception: {error}")
    _traceback.print_exc()
    return jsonify(
        {"success": False, "message": f"Server error: {str(error)[:200]}"}
    ), 500


if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    preferred_port = int(os.getenv("PORT", "5000"))
    port = _find_available_port(preferred_port)
    print(f"[STARTUP] Preferred port {preferred_port}; using port {port}")
    print(f"[STARTUP] Starting on {host}:{port}")
    app.run(host=host, debug=True, port=port, threaded=False, use_reloader=False)
