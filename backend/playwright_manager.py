"""Playwright browser manager for the Kairon scraper.

Keeps a single Playwright instance and browser to avoid repeated
start/stop overhead and provides safe startup/teardown helpers.
"""

from playwright.sync_api import sync_playwright
import threading
import time

_playwright = None
_browser = None
_last_error = None
_lock = threading.Lock()


def _browser_args():
    """Return stable Chromium launch args for headless environments."""
    return [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-setuid-sandbox",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--disable-translate",
        "--metrics-recording-only",
        "--mute-audio",
        "--no-default-browser-check",
    ]


def _is_browser_alive(browser):
    """Check if the browser process is still running."""
    try:
        browser.contexts
        return True
    except Exception:
        return False


def _start_playwright():
    """Start or restart the Playwright runtime."""
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
    """Launch a fresh Chromium browser instance."""
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
    """Return a launched browser instance or None on failure.

    Checks if existing browser is alive before reusing.
    Retries up to 3 times with backoff on failure.
    """
    global _playwright, _browser, _last_error
    with _lock:
        # Reuse existing browser if alive
        if _browser and _is_browser_alive(_browser):
            return _browser

        # Browser is dead or missing — relaunch
        _browser = None

        for attempt in range(3):
            if _playwright is None:
                if not _start_playwright():
                    _last_error = "Could not start Playwright runtime"
                    return None

            if _launch_browser():
                return _browser

            # Failed — restart Playwright runtime for next attempt
            try:
                _playwright.stop()
            except Exception:
                pass
            _playwright = None
            if attempt < 2:
                time.sleep(1 * (attempt + 1))

    return None


def get_browser_error():
    """Return the most recent Playwright launch failure."""
    return _last_error


def stop_browser():
    """Stop and clean up Playwright/browser resources."""
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
