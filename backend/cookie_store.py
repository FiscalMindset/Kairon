import os
import json
import time
from datetime import datetime

COOKIE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cookies")
MAX_SESSION_AGE_HOURS = float(os.getenv("COOKIE_MAX_AGE_HOURS", "72").strip())
ENFORCE_COOKIE_REUSE = os.getenv("ENFORCE_COOKIE_REUSE", "1").strip().lower() not in {
    "0",
    "false",
    "no",
    "off",
}


def _ensure_dir():
    os.makedirs(COOKIE_DIR, exist_ok=True)


def cookie_path(rollno):
    _ensure_dir()
    safe = "".join(c if c.isalnum() else "_" for c in str(rollno))
    return os.path.join(COOKIE_DIR, f"{safe}.json")


def save_cookies(rollno, cookies, metadata=None):
    path = cookie_path(rollno)
    payload = {
        "rollno": str(rollno),
        "saved_at": datetime.utcnow().isoformat() + "Z",
        "saved_at_ts": time.time(),
        "cookies": cookies,
        "metadata": metadata or {},
    }
    with open(path, "w") as f:
        json.dump(payload, f, indent=2)
    return payload


def load_cookies(rollno):
    path = cookie_path(rollno)
    if not os.path.exists(path):
        return None
    try:
        with open(path) as f:
            data = json.load(f)
        saved_ts = data.get("saved_at_ts", 0)
        age_hours = (time.time() - saved_ts) / 3600
        if age_hours > MAX_SESSION_AGE_HOURS:
            print(
                f"[COOKIE] Session for {rollno} expired ({age_hours:.1f}h > {MAX_SESSION_AGE_HOURS}h max)"
            )
            return None
        print(f"[COOKIE] Loaded valid session for {rollno} ({age_hours:.1f}h old)")
        return data["cookies"]
    except Exception as e:
        print(f"[COOKIE] Error loading cookies: {e}")
        return None


def delete_cookies(rollno):
    path = cookie_path(rollno)
    if os.path.exists(path):
        os.remove(path)
        return True
    return False


def has_valid_session(rollno):
    return load_cookies(rollno) is not None


def cookie_age_hours(rollno):
    path = cookie_path(rollno)
    if not os.path.exists(path):
        return None
    try:
        with open(path) as f:
            data = json.load(f)
        return (time.time() - data.get("saved_at_ts", 0)) / 3600
    except:
        return None
