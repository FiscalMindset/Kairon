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
_browser_launch_count = 0
_max_relaunches = 5


def _browser_args():
    """Return hardened Chromium launch args for headless Render-like environments."""
    return [
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


def get_browser():
    """Return a launched browser instance or None on failure.

    Retries up to 3 times with exponential backoff on transient failures.
    """
    global _playwright, _browser, _last_error, _browser_launch_count
    with _lock:
        for attempt in range(3):
            if _playwright is None:
                try:
                    _playwright = sync_playwright().start()
                except Exception as exc:
                    _last_error = f"Could not start Playwright runtime: {exc}"
                    _playwright = None
                    return None

            if _browser is None:
                try:
                    _browser = _playwright.chromium.launch(
                        headless=True,
                        args=_browser_args(),
                    )
                    _last_error = None
                    _browser_launch_count += 1
                except Exception as exc:
                    _last_error = str(exc)
                    _browser = None
                    # Try restarting Playwright runtime on next iteration
                    try:
                        _playwright.stop()
                    except Exception:
                        pass
                    _playwright = None
                    if attempt < 2:
                        time.sleep(1 * (attempt + 1))
                    continue

            return _browser

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
