from playwright.sync_api import sync_playwright
import threading
import time
import stealth

_playwright = None
_browser = None
_last_error = None
_lock = threading.Lock()


def _browser_args():
    args = [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-setuid-sandbox",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--disable-translate",
        "--metrics-recording-only",
        "--mute-audio",
        "--no-default-browser-check",
    ]
    if stealth.ENABLE_STEALTH:
        args.extend(
            [
                "--disable-blink-features=AutomationControlled",
                "--disable-automation",
                "--disable-web-security",
            ]
        )
    return args


def _is_browser_alive(browser):
    try:
        browser.contexts
        return True
    except Exception:
        return False


def _start_playwright():
    global _playwright
    try:
        if _playwright:
            try:
                _playwright.stop()
            except Exception:
                pass
        _playwright = sync_playwright().start()
        return True
    except Exception as exc:
        _playwright = None
        return False


def _launch_browser():
    global _browser, _last_error
    try:
        _browser = _playwright.chromium.launch(
            headless=True,
            args=_browser_args(),
        )
        _last_error = None
        return True
    except Exception as exc:
        _last_error = str(exc)
        _browser = None
        return False


def get_browser():
    global _playwright, _browser, _last_error
    with _lock:
        if _browser and _is_browser_alive(_browser):
            return _browser

        _browser = None

        for attempt in range(3):
            if _playwright is None:
                if not _start_playwright():
                    _last_error = "Could not start Playwright runtime"
                    return None

            if _launch_browser():
                return _browser

            try:
                _playwright.stop()
            except Exception:
                pass
            _playwright = None
            if attempt < 2:
                time.sleep(1 * (attempt + 1))

    return None


def get_browser_error():
    return _last_error


def stop_browser():
    global _playwright, _browser
    with _lock:
        try:
            if _browser:
                _browser.close()
        except Exception:
            pass
        try:
            if _playwright:
                _playwright.stop()
        except Exception:
            pass
        _browser = None
        _playwright = None
