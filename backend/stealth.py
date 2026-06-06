import os
import random
import time

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
]

VIEWPORTS = [
    {"width": 1280, "height": 720},
    {"width": 1366, "height": 768},
    {"width": 1440, "height": 900},
    {"width": 1536, "height": 864},
    {"width": 1920, "height": 1080},
]

LOCALES = ["en-US", "en-GB", "en-IN", "en-AU"]
TIMEZONES = [
    "Asia/Kolkata",
    "Asia/Karachi",
    "Asia/Dhaka",
    "Asia/Kathmandu",
]

ENABLE_STEALTH = os.getenv("ENABLE_STEALTH", "1").strip().lower() not in {
    "0",
    "false",
    "no",
    "off",
}


def random_user_agent():
    return random.choice(USER_AGENTS)


def random_viewport():
    return random.choice(VIEWPORTS)


def random_locale():
    return random.choice(LOCALES)


def random_timezone_id():
    return random.choice(TIMEZONES)


def random_delay(base=0.5, jitter=0.3):
    delay = base + random.uniform(-jitter, jitter)
    time.sleep(max(delay, 0.1))


def human_type_delay():
    time.sleep(random.uniform(0.05, 0.15))


def context_options():
    if not ENABLE_STEALTH:
        return {}
    vp = random_viewport()
    return {
        "viewport": vp,
        "user_agent": random_user_agent(),
        "locale": random_locale(),
        "timezone_id": random_timezone_id(),
        "geolocation": None,
        "permissions": [],
        "color_scheme": random.choice(["light", "dark"]),
        "reduced_motion": "no-preference",
        "forced_colors": "none",
    }
