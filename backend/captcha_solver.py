import base64
import json
import os
import time
import urllib.request
import urllib.error


TWOCAPTCHA_API_KEY = os.getenv("TWOCAPTCHA_API_KEY", "").strip()
CAPSOLVER_API_KEY = os.getenv("CAPSOLVER_API_KEY", "").strip()
CAPSOLVER_API_URL = os.getenv("CAPSOLVER_API_URL", "https://api.capsolver.com")


def _solve_2captcha(image_bytes):
    if not TWOCAPTCHA_API_KEY:
        return None
    try:
        b64 = base64.b64encode(image_bytes).decode()
        payload = json.dumps(
            {
                "key": TWOCAPTCHA_API_KEY,
                "method": "base64",
                "body": b64,
                "numeric": 1,
                "min_len": 4,
                "max_len": 6,
                "phrase": 0,
                "case_sensitive": 0,
            }
        ).encode()
        req = urllib.request.Request(
            "https://2captcha.com/in.php",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = resp.read().decode().strip()

        if not result.startswith("OK|"):
            print(f"[2CAPTCHA] Submit failed: {result}")
            return None

        captcha_id = result[3:]
        print(f"[2CAPTCHA] Submitted, id={captcha_id}, waiting...")

        for _ in range(30):
            time.sleep(3)
            poll_url = (
                f"https://2captcha.com/res.php?key={TWOCAPTCHA_API_KEY}"
                f"&action=get&id={captcha_id}&json=1"
            )
            with urllib.request.urlopen(poll_url, timeout=15) as resp:
                poll_data = json.loads(resp.read().decode())

            if poll_data.get("status") == 1:
                text = poll_data.get("request", "")
                cleaned = "".join(c for c in text if c.isdigit())
                if 4 <= len(cleaned) <= 6:
                    print(f"[2CAPTCHA] Solved: '{cleaned}'")
                    return cleaned
                print(f"[2CAPTCHA] Solved but invalid format: '{text}'")
                return None

            if poll_data.get("request") and "ERROR" in str(
                poll_data.get("request", "")
            ):
                print(f"[2CAPTCHA] Error: {poll_data}")
                return None

        print("[2CAPTCHA] Timeout")
        return None
    except Exception as e:
        print(f"[2CAPTCHA] Exception: {e}")
        return None


def _solve_capsolver(image_bytes):
    if not CAPSOLVER_API_KEY:
        return None
    try:
        b64 = base64.b64encode(image_bytes).decode()
        task_payload = {
            "clientKey": CAPSOLVER_API_KEY,
            "task": {
                "type": "ImageToTextTask",
                "body": b64,
                "scale": True,
                "case": False,
                "number": 1,
            },
        }
        req = urllib.request.Request(
            f"{CAPSOLVER_API_URL}/createTask",
            data=json.dumps(task_payload).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode())

        task_id = result.get("taskId")
        if not task_id:
            print(f"[CAPSOLVER] Create failed: {result}")
            return None

        print(f"[CAPSOLVER] Submitted, taskId={task_id}, waiting...")
        for _ in range(30):
            time.sleep(2)
            poll_payload = {
                "clientKey": CAPSOLVER_API_KEY,
                "taskId": task_id,
            }
            poll_req = urllib.request.Request(
                f"{CAPSOLVER_API_URL}/getTaskResult",
                data=json.dumps(poll_payload).encode(),
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(poll_req, timeout=15) as resp:
                poll_data = json.loads(resp.read().decode())

            if poll_data.get("status") == "ready":
                text = poll_data.get("solution", {}).get("text", "")
                cleaned = "".join(c for c in text if c.isdigit())
                if 4 <= len(cleaned) <= 6:
                    print(f"[CAPSOLVER] Solved: '{cleaned}'")
                    return cleaned
                print(f"[CAPSOLVER] Solved but invalid format: '{text}'")
                return None

        print("[CAPSOLVER] Timeout")
        return None
    except Exception as e:
        print(f"[CAPSOLVER] Exception: {e}")
        return None


def solve_captcha(image_bytes, solver_hint=None):
    order = solver_hint or os.getenv("CAPTCHA_SOLVER", "auto").strip().lower()

    if order == "auto":
        if TWOCAPTCHA_API_KEY:
            print("[CAPTCHA] Trying 2Captcha...")
            result = _solve_2captcha(image_bytes)
            if result:
                return result
        if CAPSOLVER_API_KEY:
            print("[CAPTCHA] Trying CapSolver...")
            result = _solve_capsolver(image_bytes)
            if result:
                return result
        print("[CAPTCHA] No professional solver configured, falling through")
        return None

    if order == "2captcha":
        return _solve_2captcha(image_bytes)
    if order == "capsolver":
        return _solve_capsolver(image_bytes)

    return None
