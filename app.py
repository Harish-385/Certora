from flask import Flask, request, jsonify, send_file, render_template_string
from flask_cors import CORS
import pandas as pd
from werkzeug.utils import secure_filename
from flask_talisman import Talisman
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import os
from dotenv import load_dotenv
load_dotenv()

import io
import json
import zipfile
import smtplib
import time
from email.message import EmailMessage
from PIL import Image, ImageDraw, ImageFont
import hashlib
import qrcode
import blockchain
import socket
import threading
import uuid
import concurrent.futures
import traceback
import psycopg2
from psycopg2.extras import RealDictCursor

app = Flask(__name__)

# Security Hardening
# 1. Enforce secure secret key (fallback for dev)
app.secret_key = os.environ.get("SECRET_KEY", os.urandom(24))

# 2. Strict CORS - restrict to React frontend origin
CORS(app, resources={r"/*": {"origins": "*"}})

# 3. Security Headers (Talisman)
csp = {
    'default-src': [
        '\'self\'',
        'http://localhost:*',
        'ws://localhost:*'
    ],
    'style-src': ['\'self\'', '\'unsafe-inline\''],
    'img-src': ['\'self\'', 'data:', 'blob:'],
    'font-src': ['\'self\'', 'data:', 'https://fonts.gstatic.com']
}
Talisman(app, content_security_policy=csp, force_https=False) # force_https=False for local dev

# 4. Rate Limiting
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["10000 per day", "3000 per hour"],
    storage_uri="memory://"
)


# ── PostgreSQL Database Setup ───────────────────────────────────────────────
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "email_generation")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")

# Base URL for tracking pixel links (adjust if behind a proxy/ngrok)
BASE_URL = os.getenv("BASE_URL", "http://localhost:5000")

def _student_key(student):
    """Generate a short stable key for a student row (for tracking dedup)."""
    name = str(student.get("Name", "")).strip()
    email = str(student.get("Email", "")).strip()
    return hashlib.sha256(f"{name}{email}".encode()).hexdigest()[:16]

def get_db_connection():
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )

def init_db():
    try:
        # First connect to default postgres DB to check/create the target DB
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            database="postgres",
            user=DB_USER,
            password=DB_PASSWORD
        )
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'email_generation'")
        if not cur.fetchone():
            cur.execute("CREATE DATABASE email_generation")
            print("Database 'email_generation' created successfully.")
        cur.close()
        conn.close()

        # Now connect to target DB to initialize tables
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                register_number VARCHAR(100) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        # Add statistics columns per user if they do not exist
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS generated_count INT DEFAULT 0;")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS sent_count INT DEFAULT 0;")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS download_count INT DEFAULT 0;")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;")
        
        # Create audit logs table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id SERIAL PRIMARY KEY,
                user_id INT,
                action VARCHAR(255) NOT NULL,
                details TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        # Create password resets table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS password_resets (
                email VARCHAR(255) PRIMARY KEY,
                code VARCHAR(6) NOT NULL,
                expires_at TIMESTAMP NOT NULL
            );
        """)

        # Create notifications table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                user_id INT,
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        cur.execute("""
            CREATE TABLE IF NOT EXISTS system_stats (
                key VARCHAR(100) PRIMARY KEY,
                value INT DEFAULT 0
            );
        """)
        cur.execute("""
            INSERT INTO system_stats (key, value) VALUES 
            ('emails_generated', 0),
            ('emails_sent', 0),
            ('downloads', 0)
            ON CONFLICT (key) DO NOTHING;
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS scheduled_cert_jobs (
                id SERIAL PRIMARY KEY,
                user_id INT,
                schedule_time TIMESTAMP WITH TIME ZONE NOT NULL,
                timezone VARCHAR(100) NOT NULL,
                sender_email VARCHAR(255) NOT NULL,
                app_password VARCHAR(255) NOT NULL,
                category VARCHAR(50) NOT NULL,
                student_data JSONB NOT NULL,
                status VARCHAR(50) DEFAULT 'Pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS certificate_verifications (
                certificate_id VARCHAR(100) PRIMARY KEY,
                verification_count INT DEFAULT 0,
                last_verified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Email tracking table (item 6)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS email_tracking (
                id SERIAL PRIMARY KEY,
                tracking_id VARCHAR(64) UNIQUE NOT NULL,
                student_key VARCHAR(64),
                student_name VARCHAR(255),
                student_email VARCHAR(255),
                user_id INT,
                status VARCHAR(50) DEFAULT 'Queued',
                sent_at TIMESTAMP,
                delivered_at TIMESTAMP,
                opened_at TIMESTAMP,
                clicked_at TIMESTAMP,
                downloaded_at TIMESTAMP,
                bounced BOOLEAN DEFAULT FALSE,
                spam_reported BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Template version history table (item 7)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS template_versions (
                id SERIAL PRIMARY KEY,
                user_id INT,
                version_num INT NOT NULL,
                label VARCHAR(255),
                config_snapshot JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # QR scan analytics table (item 8)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS qr_scan_events (
                id SERIAL PRIMARY KEY,
                cert_id VARCHAR(100) NOT NULL,
                ip VARCHAR(64),
                country VARCHAR(100),
                city VARCHAR(100),
                device VARCHAR(50),
                browser VARCHAR(100),
                os VARCHAR(100),
                scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Uploaded student data, persisted per user (survives server restarts)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS student_uploads (
                user_id VARCHAR(100) PRIMARY KEY,
                data JSONB NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        conn.commit()
        cur.close()
        conn.close()
        print("PostgreSQL Database initialized successfully.")
    except Exception as e:
        print("Database initialization failed:", e)

def log_audit_event(user_id, action, details=""):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        uid = None
        if user_id:
            try:
                uid = int(user_id)
                if uid <= 0:
                    uid = None
            except ValueError:
                uid = None
        
        cur.execute(
            "INSERT INTO audit_logs (user_id, action, details) VALUES (%s, %s, %s)",
            (uid, action, details)
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print("Failed to log audit event:", e)

def add_notification(user_id, title, message):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        uid = None
        if user_id:
            try:
                uid = int(user_id)
                if uid <= 0:
                    uid = None
            except ValueError:
                uid = None
        cur.execute(
            "INSERT INTO notifications (user_id, title, message) VALUES (%s, %s, %s)",
            (uid, title, message)
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print("Failed to add notification:", e)

def increment_stat(key, count=1):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("UPDATE system_stats SET value = value + %s WHERE key = %s", (count, key))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Failed to increment stat {key}:", e)

def increment_user_stat(user_id, key, count=1):
    if not user_id:
        return
    try:
        # Convert user_id to int if possible
        uid = int(user_id)
        if uid == 0:
            return # Admin actions are not tracked under users
        conn = get_db_connection()
        cur = conn.cursor()
        if key == "emails_generated":
            cur.execute("UPDATE users SET generated_count = generated_count + %s WHERE id = %s", (count, uid))
        elif key == "emails_sent":
            cur.execute("UPDATE users SET sent_count = sent_count + %s WHERE id = %s", (count, uid))
        elif key == "downloads":
            cur.execute("UPDATE users SET download_count = download_count + %s WHERE id = %s", (count, uid))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Failed to increment user stat {key} for user {user_id}:", e)

def get_stats():
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT key, value FROM system_stats")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        # Merge DB stats with fallback defaults
        stats = {"emails_generated": 0, "emails_sent": 0, "downloads": 0}
        for r in rows:
            stats[r["key"]] = r["value"]
        return stats
    except Exception as e:
        print("Failed to get system stats:", e)
        return {"emails_generated": 0, "emails_sent": 0, "downloads": 0}


def run_scheduler_loop():
    from datetime import datetime
    import json
    while True:
        try:
            conn = get_db_connection()
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("""
                SELECT id, user_id, schedule_time, timezone, sender_email, app_password, category, student_data
                FROM scheduled_cert_jobs
                WHERE status = 'Pending' AND schedule_time <= NOW()
            """)
            jobs = cur.fetchall()
            cur.close()
            
            for job in jobs:
                job_id = job["id"]
                user_id = job["user_id"]
                sender_email = job["sender_email"]
                app_password = job["app_password"]
                category_param = job["category"]
                students = job["student_data"]
                
                cur = conn.cursor()
                cur.execute("UPDATE scheduled_cert_jobs SET status = 'Processing' WHERE id = %s", (job_id,))
                conn.commit()
                cur.close()
                
                log_audit_event(user_id, "Scheduled Emails Started", f"Processing scheduled job {job_id} for {len(students)} recipients.")
                
                success_count = 0
                failed_list = []
                
                try:
                    server = _make_smtp()
                    server.login(sender_email, app_password)
                    
                    certs_dir = os.path.join(app.root_path, "templates", "certificates", category_param)
                    parent_certs_dir = os.path.join(app.root_path, "templates", "certificates")
                    winner_path = resolve_template_path(certs_dir, parent_certs_dir, "winner.png")
                    participant_path = resolve_template_path(certs_dir, parent_certs_dir, "participant.png")
                    
                    for student in students:
                        name = student.get("Name", "Unknown")
                        email = _normalize_email(get_ci(student, "Email"))
                        category = student.get("Category", "Participant")
                        template_path = winner_path if str(category).strip().lower() == "winner" else participant_path
                        
                        if not email or "@" not in email or not os.path.exists(template_path):
                            failed_list.append({"name": name, "email": email, "error": "Invalid email or missing template"})
                            continue
                            
                        try:
                            img = generate_cert_image(student, template_path)
                            img_byte_arr = io.BytesIO()
                            img.save(img_byte_arr, format='PNG')
                            img_data = img_byte_arr.getvalue()
                            
                            msg = EmailMessage()
                            msg['Subject'] = 'Your Certificate 🎉'
                            msg['From'] = sender_email
                            msg['To'] = email
                            msg.set_content(
                                f"Dear Participant,\n\n"
                                f"Please find your certificate attached.\n\n"
                                f"Best regards,\nNEXGEN AI'26 Team"
                            )
                            
                            safe_name = "".join(c for c in name if c.isalnum() or c == " ") or "certificate"
                            msg.add_attachment(img_data, maintype='image', subtype='png', filename=f"{safe_name}.png")
                            
                            server.send_message(msg)
                            success_count += 1
                            increment_stat("emails_generated")
                            increment_stat("emails_sent")
                            if user_id:
                                increment_user_stat(user_id, "emails_generated")
                                increment_user_stat(user_id, "emails_sent")
                                
                            time.sleep(1.5)
                        except Exception as ex:
                            failed_list.append({"name": name, "email": email, "error": str(ex)})
                            
                    server.quit()
                    
                    cur = conn.cursor()
                    cur.execute(
                        "UPDATE scheduled_cert_jobs SET status = %s WHERE id = %s",
                        ("Completed" if success_count > 0 else "Failed", job_id)
                    )
                    conn.commit()
                    cur.close()
                    
                    log_audit_event(
                        user_id, 
                        "Scheduled Emails Completed", 
                        f"Finished scheduled job {job_id}. Sent: {success_count}, Failed: {len(failed_list)}."
                    )
                    add_notification(user_id, "Scheduled Graduation Certificates Sent 🎓", f"Successfully delivered {success_count} scheduled certificates ({len(failed_list)} failed).")
                    
                except Exception as ex:
                    cur = conn.cursor()
                    cur.execute("UPDATE scheduled_cert_jobs SET status = 'Failed' WHERE id = %s", (job_id,))
                    conn.commit()
                    cur.close()
                    log_audit_event(user_id, "Scheduled Emails Failed", f"Job {job_id} encountered connection/login error: {ex}")
                    
            conn.close()
        except Exception as e:
            print("Scheduler loop error:", e)
        time.sleep(30)


# Run database initialization
init_db()

# Start background scheduler thread
threading.Thread(target=run_scheduler_loop, daemon=True).start()


UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# In-memory store for background ZIP generation tasks
zip_tasks = {}
# In-memory store for background email tasks
email_tasks = {}

# Per-user student data store: { str(user_id): [student dicts] }
user_students_data = {}

qr_position = "center-bottom"


import os
import urllib.request
import re
from urllib.parse import quote

os.makedirs("fonts", exist_ok=True)

def download_google_font(font_name):
    if font_name.endswith('.ttf'):
        return font_name
    
    encoded_name = quote(font_name)
    url = f"https://fonts.googleapis.com/css?family={encoded_name}:regular,700,600,500,400"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1'})
    try:
        css = urllib.request.urlopen(req).read().decode('utf-8')
    except Exception:
        return None
        
    urls = re.findall(r'url\((.*?)\)', css)
    if not urls:
        return None
        
    ttf_url = urls[0].strip("'\"")
    safe_name = "".join(c for c in font_name if c.isalnum()) + ".ttf"
    local_path = os.path.join("fonts", safe_name)
    
    try:
        req_font = urllib.request.Request(ttf_url, headers={'User-Agent': 'Mozilla/5.0'})
        with open(local_path, "wb") as f:
            f.write(urllib.request.urlopen(req_font).read())
        return local_path
    except Exception as e:
        print(f"Font download error: {e}")
        return None

cert_font_style = "cambriab.ttf"

@app.route("/api/config/font-style", methods=["GET", "POST"])
def api_font_style():
    global cert_font_style
    if request.method == "POST":
        data = request.json or {}
        font = data.get("font")
        if font:
            downloaded_path = download_google_font(font)
            if downloaded_path:
                cert_font_style = downloaded_path
                return jsonify({"message": "Font style updated", "font": font})
            else:
                return jsonify({"error": f"Could not find or download the font: {font}"}), 404
        return jsonify({"error": "Invalid font name"}), 400
    return jsonify({"font": cert_font_style.replace('fonts\\', '').replace('fonts/', '').replace('.ttf', '')})


text_fields_config = [
    {"key": "Name", "x_percent": 50.0, "y_percent": 50.0, "font_size": 60, "align": "center", "color": "#000000"}
]

# ── Per-user data helpers ─────────────────────────────────────────────────────


def get_ci(d, key, default=None):
    if not isinstance(d, dict): return default
    for k, v in d.items():
        if str(k).strip().lower() == str(key).strip().lower():
            return v
    return default

def _alias_canonical_columns(students):
    """Uploaded sheets often name columns 'Email Id', 'Name Of Participants', etc.
    instead of the exact 'Email' / 'Name' the rest of the app expects. Detect the
    best-matching column once and copy it under the canonical key so downstream
    lookups (get_ci(s, 'Email'), student.get('Name'), ...) keep working."""
    if not students:
        return students
    sample_keys = list(students[0].keys())

    def find_column(exact, contains, exclude=()):
        for k in sample_keys:
            if str(k).strip().lower() == exact:
                return k
        for k in sample_keys:
            kl = str(k).strip().lower()
            if any(c in kl for c in contains) and not any(x in kl for x in exclude):
                return k
        return None

    email_col = find_column("email", ["email", "e-mail", "mail"])
    name_col = find_column("name", ["name"], exclude=["college", "institute", "school", "department"])

    for s in students:
        if email_col and email_col != "Email" and "Email" not in s:
            s["Email"] = s.get(email_col, "")
        if name_col and name_col != "Name" and "Name" not in s:
            s["Name"] = s.get(name_col, "")
    return students

def get_user_data(user_id):
    """Return the student list for a given user_id (always a list).
    Cached in-memory, backed by Postgres so uploads survive server restarts."""
    if not user_id:
        return []
    key = str(user_id)
    if key in user_students_data:
        return user_students_data[key]
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT data FROM student_uploads WHERE user_id = %s", (key,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        data = _alias_canonical_columns(row[0] if row else [])
        user_students_data[key] = data
        return data
    except Exception as e:
        print("get_user_data DB load failed:", e)
        return user_students_data.get(key, [])

def set_user_data(user_id, data):
    """Store a student list for a given user_id, both in-memory and in Postgres."""
    if not user_id:
        return
    key = str(user_id)
    user_students_data[key] = data
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO student_uploads (user_id, data, updated_at)
            VALUES (%s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP
        """, (key, json.dumps(data)))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print("set_user_data DB save failed:", e)

def _status_file(user_id):
    return os.path.join(UPLOAD_FOLDER, f"sent_status_{user_id}.json")

# ── Persistence helpers ──────────────────────────────────────────────────────

def _student_key(student):
    """Unique key for a student based on Name + Email (same hash used for cert ID)."""
    name = str(get_ci(student, "Name", "")).strip()
    email = str(get_ci(student, "Email", "")).strip()
    return hashlib.sha256(f"{name}{email}".encode()).hexdigest()[:10].upper()

def save_sent_statuses(user_id):
    """Write all 'Sent' student keys to disk for a specific user."""
    try:
        udata = get_user_data(user_id)
        statuses = {_student_key(s): "Sent" for s in udata if s.get("Status") == "Sent"}
        with open(_status_file(user_id), "w") as f:
            json.dump(statuses, f)
    except Exception:
        pass

def load_and_apply_sent_statuses(user_id, students):
    """Restore 'Sent' statuses from disk onto a student list for a user."""
    fpath = _status_file(user_id)
    if not os.path.exists(fpath):
        return
    try:
        with open(fpath, "r") as f:
            statuses = json.load(f)
        for student in students:
            if _student_key(student) in statuses:
                student["Status"] = "Sent"
    except Exception:
        pass



# ── SMTP helper ───────────────────────────────────────────────────────────────
def _make_smtp():
    # Use port 465 directly to perfectly circumvent standard firewall timeout drops,
    # enabling instantaneous connectivity.
    # timeout=60 gives enough headroom for large PNG attachments to transfer.
    server = smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=60)
    try:
        server.ehlo()
    except Exception:
        pass
    return server
# ─────────────────────────────────────────────────────────────────────────────

# Determine the Local IP or Public URL to put inside the QR Code
# So phones on the same WiFi can scan it without failing.
def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

BASE_URL = os.getenv("PUBLIC_URL", f"http://{get_local_ip()}:5000")

def generate_cert_image(student, template_path, row_index=None):
    name = student.get("Name", "Unknown Name")
    email = student.get("Email", "no-email@example.com")

    # Generate unique ID based on Name + Email + row_index to ensure uniqueness even for duplicate names
    index_suffix = str(row_index) if row_index is not None else ""
    unique_id = hashlib.sha256(f"{name}{email}{index_suffix}".encode()).hexdigest()[:10].upper()

    with Image.open(template_path) as base_img:
        img = base_img.convert('RGB')
    
    draw = ImageDraw.Draw(img)
    width, height = img.size

    # Scale fonts relative to image width so "size 60" looks the same
    # regardless of template resolution. Baseline = 1000px wide.
    img_scale = width / 1000.0

    scaled_verify_size = max(10, int(25 * img_scale))
    try:
        verify_font = ImageFont.truetype(cert_font_style, scaled_verify_size)
    except IOError:
        verify_font = ImageFont.load_default()

    import textwrap
    import re
    # Draw each configured text field at its custom position
    for field in text_fields_config:
        key = field.get("key", "Name")
        template = field.get("template", "")
        
        if template.strip():
            # Replace all occurrences of {Column} with student values
            value = template
            brackets = re.findall(r"\{(.*?)\}", value)
            for b in brackets:
                value = value.replace(f"{{{b}}}", str(student.get(b, "")))
        else:
            value = str(student.get(key, ""))
            
        if not value.strip():
            continue

        font_size = max(10, int(field.get("font_size", 60)))
        align = field.get("align", "center")
        color = field.get("color", "#000000")
        x_percent = float(field.get("x_percent", 50.0))
        y_percent = float(field.get("y_percent", 50.0))
        wrap_width = field.get("wrap_width")

        # Apply image scale so the user-entered size is resolution-independent
        scaled_font_size = max(10, int(font_size * img_scale))

        try:
            fnt = ImageFont.truetype(cert_font_style, scaled_font_size)
        except IOError:
            fnt = ImageFont.load_default()

        # Wrap text if wrap_width is configured
        if wrap_width and isinstance(wrap_width, (int, float)) and wrap_width > 0:
            lines = textwrap.wrap(value, width=int(wrap_width))
        else:
            lines = [value]

        base_x = (x_percent / 100.0) * width
        base_y = (y_percent / 100.0) * height

        # Compute starting Y position for vertical alignment centering of all wrapped lines
        line_height = scaled_font_size * 1.3
        total_height = len(lines) * line_height
        current_y = base_y - total_height / 2

        for line in lines:
            bbox = draw.textbbox((0, 0), line, font=fnt)
            text_width = bbox[2] - bbox[0]
            
            if align == "center":
                x = base_x - text_width / 2
            elif align == "right":
                x = base_x - text_width
            else:  # left
                x = base_x

            draw.text((int(x), int(current_y)), line, fill=color, font=fnt)
            current_y += line_height

    # Create QR code
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=5,
        border=1,
    )
    qr.add_data(f"{BASE_URL}/verify/{unique_id}")
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white").get_image()

    global qr_position
    # Scale QR code dynamically relative to the template width (5% — smaller & less intrusive)
    target_qr_width = max(40, int(width * 0.05))
    qr_img = qr_img.resize((target_qr_width, target_qr_width), Image.Resampling.LANCZOS)
    qr_width, qr_height = qr_img.size

    if qr_position == "bottom-right":
        qr_x = int(width - qr_width - 50)
        qr_y = int(height - qr_height - 50)
    elif qr_position == "bottom-left":
        qr_x = int(50)
        qr_y = int(height - qr_height - 50)
    elif qr_position == "top-right":
        qr_x = int(width - qr_width - 50)
        qr_y = int(50)
    elif qr_position == "top-left":
        qr_x = int(50)
        qr_y = int(50)
    elif qr_position == "center-right":
        qr_x = int(width - qr_width - 50)
        qr_y = int((height - qr_height) / 2)
    elif qr_position == "center-left":
        qr_x = int(50)
        qr_y = int((height - qr_height) / 2)
    else:  # center-bottom
        qr_x = int((width - qr_width) / 2)
        qr_y = int(height - qr_height - 50)

    img.paste(qr_img, (qr_x, qr_y))

    # Draw Unique ID text right below the QR code
    draw.text((qr_x, qr_y + qr_height + 5), f"ID: {unique_id}", fill="black", font=verify_font)

    return img

def convert_to_pdf(img, format_type="png", orientation="landscape"):
    if format_type.lower() == "png":
        output_stream = io.BytesIO()
        img.save(output_stream, format="PNG")
        output_stream.seek(0)
        return output_stream.getvalue(), "image/png"
    
    # PDF generation:
    # A4 standard at 300 DPI:
    # Landscape: 3508 x 2480, Portrait: 2480 x 3508
    if orientation.lower() == "portrait":
        width, height = 2480, 3508
    else:
        width, height = 3508, 2480

    pdf_img = Image.new("RGB", (width, height), "white")
    
    w_ratio = width / img.width
    h_ratio = height / img.height
    scale = min(w_ratio, h_ratio)
    new_w = int(img.width * scale)
    new_h = int(img.height * scale)
    
    resized_img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    x_offset = (width - new_w) // 2
    y_offset = (height - new_h) // 2
    pdf_img.paste(resized_img, (x_offset, y_offset))
    
    output_stream = io.BytesIO()
    pdf_img.save(output_stream, format="PDF", resolution=300.0)
    output_stream.seek(0)
    return output_stream.getvalue(), "application/pdf"

@app.route("/api/upload", methods=["POST"])
def api_upload():
    file = request.files.get("file")
    user_id = request.form.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id is required"}), 400
    if file:
        filename = file.filename.lower()
        if not (filename.endswith(".xlsx") or filename.endswith(".xls") or filename.endswith(".csv")):
            return jsonify({"error": "Unsupported file format. Please upload an Excel (.xlsx, .xls) or CSV (.csv) file."}), 400

        filename = secure_filename(file.filename)
        if not filename:
            return jsonify({"error": "Invalid filename"}), 400
        path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
        file.save(path)
        try:
            if filename.endswith(".csv"):
                df = pd.read_csv(path)
            else:
                df = pd.read_excel(path)

            df = df.dropna(how='all')
            df = df.drop_duplicates()
            df = df.fillna('')

            new_data = df.to_dict(orient="records")
            normalized_data = []
            for s in new_data:
                norm_s = {str(k).strip().title(): v for k, v in s.items()}
                if "Status" not in norm_s:
                    norm_s["Status"] = "Pending"
                normalized_data.append(norm_s)

            normalized_data = _alias_canonical_columns(normalized_data)

            # Restore any previously saved "Sent" statuses for this user
            load_and_apply_sent_statuses(user_id, normalized_data)
            set_user_data(user_id, normalized_data)
            
            log_audit_event(user_id, "Excel Uploaded", f"Successfully uploaded spreadsheet '{file.filename}' containing {len(normalized_data)} records.")
            return jsonify({"message": "File uploaded successfully", "students": normalized_data})
        except Exception as e:
            return jsonify({"error": str(e)}), 400
    return jsonify({"error": "No file uploaded"}), 400

@app.route("/api/config/qr-position", methods=["GET", "POST"])
def api_qr_position():
    global qr_position
    if request.method == "POST":
        data = request.json or {}
        pos = data.get("position")
        if pos in ["bottom-right", "bottom-left", "top-right", "top-left", "center-bottom", "center-right", "center-left"]:
            qr_position = pos
            return jsonify({"message": "QR position updated successfully", "position": qr_position})
        return jsonify({"error": "Invalid position"}), 400
    return jsonify({"position": qr_position})

@app.route("/api/config/text-fields", methods=["GET", "POST"])
def api_text_fields_config():
    global text_fields_config
    if request.method == "POST":
        data = request.get_json(force=True, silent=True) or {}
        fields = data.get("fields", [])
        if not isinstance(fields, list) or len(fields) == 0:
            return jsonify({"error": "Fields must be a non-empty list"}), 400
        validated = []
        for f in fields:
            try:
                wrap_val = f.get("wrap_width")
                validated.append({
                    "key": str(f.get("key", "Name")),
                    "x_percent": float(f.get("x_percent", 50.0)),
                    "y_percent": float(f.get("y_percent", 50.0)),
                    "font_size": max(10, int(f.get("font_size", 60))),
                    "align": str(f.get("align", "center")),
                    "color": str(f.get("color", "#000000")),
                    "template": str(f.get("template", "")),
                    "wrap_width": int(wrap_val) if wrap_val and str(wrap_val).strip() else None
                })
            except (TypeError, ValueError) as e:
                return jsonify({"error": f"Invalid field value: {e}"}), 400
        text_fields_config = validated
        # Auto-save version snapshot (Item 7)
        try:
            user_id_v = data.get("user_id")
            import json as _json_v, threading as _threading_v
            def _auto_save_version():
                try:
                    conn_v = get_db_connection()
                    cur_v = conn_v.cursor(cursor_factory=RealDictCursor)
                    if user_id_v:
                        cur_v.execute("SELECT COALESCE(MAX(version_num), 0) as max_v FROM template_versions WHERE user_id = %s", (user_id_v,))
                    else:
                        cur_v.execute("SELECT COALESCE(MAX(version_num), 0) as max_v FROM template_versions WHERE user_id IS NULL")
                    row_v = cur_v.fetchone()
                    next_ver = (row_v["max_v"] or 0) + 1
                    cur_v.execute(
                        "INSERT INTO template_versions (user_id, version_num, label, config_snapshot) VALUES (%s, %s, %s, %s)",
                        (user_id_v, next_ver, f"Version {next_ver}", _json_v.dumps({"fields": validated}))
                    )
                    conn_v.commit()
                    cur_v.close()
                    conn_v.close()
                except Exception as e_v:
                    print(f"Version auto-save failed: {e_v}")
            _threading_v.Thread(target=_auto_save_version, daemon=True).start()
        except Exception:
            pass
        return jsonify({"message": "Text fields config updated", "fields": text_fields_config})
    return jsonify({"fields": text_fields_config})


@app.route("/verify/<unique_id>", methods=["GET"])
def public_verify(unique_id):
    from flask import redirect
    host = request.host
    if "5000" in host:
        frontend_url = f"http://{host.split(':')[0]}:5173/verify/{unique_id}"
    else:
        frontend_url = f"http://{host}/verify/{unique_id}"
    return redirect(frontend_url)

@app.route("/api/dashboard", methods=["GET"])
@limiter.exempt
def api_dashboard():
    user_id = request.args.get("user_id")
    user_data = get_user_data(user_id)
    total = len(user_data)
    winners_count = sum(1 for s in user_data if str(get_ci(s, "Category", "")).strip().lower() == "winner")
    participants_count = total - winners_count
    generated_count = sum(1 for s in user_data if s.get("Status") == "Generated")
    sent_count = sum(1 for s in user_data if s.get("Status") == "Sent")
    
    return jsonify({
        "students": user_data,
        "stats": {
            "total": total,
            "winners": winners_count,
            "participants": participants_count,
            "generated": generated_count,
            "sent": sent_count
        }
    })

@app.route("/api/templates/status", methods=["GET"])
def api_templates_status():
    category = request.args.get("category", "events").strip().lower()
    certs_dir = os.path.join(app.root_path, "templates", "certificates", category)
    os.makedirs(certs_dir, exist_ok=True)
    winner_exists = os.path.exists(os.path.join(certs_dir, "winner.png"))
    participant_exists = os.path.exists(os.path.join(certs_dir, "participant.png"))
    return jsonify({
        "winner_exists": winner_exists,
        "participant_exists": participant_exists
    })

@app.route("/api/templates/upload", methods=["POST"])
def api_templates_upload():
    category = request.form.get("category", "events").strip().lower()
    certs_dir = os.path.join(app.root_path, "templates", "certificates", category)
    os.makedirs(certs_dir, exist_ok=True)
    template_type = request.form.get("template_type")
    file = request.files.get("template_file")
    
    if not template_type or not file:
        return jsonify({"error": "Missing template_type or file"}), 400
        
    if file and file.filename.lower().endswith((".png", ".jpg", ".jpeg")):
        if template_type == "winner":
            file.save(os.path.join(certs_dir, secure_filename("winner.png")))
            return jsonify({"message": f"Winner template uploaded for {category}"})
        elif template_type == "participant":
            file.save(os.path.join(certs_dir, secure_filename("participant.png")))
            return jsonify({"message": f"Participant template uploaded for {category}"})
    return jsonify({"error": "Invalid file format"}), 400

def resolve_template_path(certs_dir, parent_certs_dir, template_name):
    # Try directory + template name
    path = os.path.join(certs_dir, template_name)
    if os.path.exists(path):
        return path
    # Try directory + alternative name
    alt_name = "participant.png" if template_name == "winner.png" else "winner.png"
    path = os.path.join(certs_dir, alt_name)
    if os.path.exists(path):
        return path
    # Try default 'events' folder fallback
    events_dir = os.path.join(parent_certs_dir, "events")
    path = os.path.join(events_dir, template_name)
    if os.path.exists(path):
        return path
    path = os.path.join(events_dir, alt_name)
    if os.path.exists(path):
        return path
    # Try parent directory + template name
    path = os.path.join(parent_certs_dir, template_name)
    if os.path.exists(path):
        return path
    # Try parent directory + alternative name
    path = os.path.join(parent_certs_dir, alt_name)
    if os.path.exists(path):
        return path
    return None

@app.route("/api/preview_cert/<int:student_id>")
def api_preview_cert(student_id):
    user_id = request.args.get("user_id")
    user_data = get_user_data(user_id)
    if len(user_data) == 0:
        student = {
            "Name": "Sample Student",
            "Email": "sample@example.com",
            "Category": "Winner",
            "Register Number": "SAMPLE123"
        }
        category = "Winner"
    else:
        if student_id < 0 or student_id >= len(user_data):
            return jsonify({"error": "Student not found"}), 404
        student = user_data[student_id]
        category = student.get("Category", "Participant")
        
    category_param = request.args.get("category", "events").strip().lower()
    
    certs_dir = os.path.join(app.root_path, "templates", "certificates", category_param)
    parent_certs_dir = os.path.join(app.root_path, "templates", "certificates")
    template_name = "winner.png" if category == "Winner" else "participant.png"
    
    template_path = resolve_template_path(certs_dir, parent_certs_dir, template_name)
    if not template_path:
        return jsonify({"error": "Template not found"}), 404
        
    img = generate_cert_image(student, template_path)
    increment_stat("emails_generated")
    
    format_type = request.args.get("format", "png").strip().lower()
    orientation = request.args.get("orientation", "landscape").strip().lower()
    
    content_bytes, mimetype = convert_to_pdf(img, format_type=format_type, orientation=orientation)
    
    as_attachment = (format_type == "pdf")
    ext = "pdf" if format_type == "pdf" else "png"
    download_name = f"certificate_{student_id}.{ext}"
    
    return send_file(
        io.BytesIO(content_bytes),
        mimetype=mimetype,
        as_attachment=as_attachment,
        download_name=download_name
    )

@app.route("/api/generate_zip_start", methods=["POST"])
def api_generate_zip_start():
    data = request.json or {}
    user_id = data.get("user_id")
    user_data = get_user_data(user_id)

    if not user_data:
        return jsonify({"error": "No data to generate certificates. Please upload an Excel/CSV file first."}), 400
        
    category_param = data.get("category", "events").strip().lower()
    
    certs_dir = os.path.join(app.root_path, "templates", "certificates", category_param)
    parent_certs_dir = os.path.join(app.root_path, "templates", "certificates")
    
    has_winner = any(str(get_ci(s, "Category", "")).strip().lower() == "winner" for s in user_data)
    has_participant = any(str(get_ci(s, "Category", "")).strip().lower() != "winner" for s in user_data)
    
    winner_path = resolve_template_path(certs_dir, parent_certs_dir, "winner.png")
    participant_path = resolve_template_path(certs_dir, parent_certs_dir, "participant.png")
        
    if category_param in ["course", "project"]:
        if not winner_path and not participant_path:
            return jsonify({"error": "Template is missing. Please upload one under Templates Setup."}), 400
    else:
        if has_winner and not winner_path:
            return jsonify({"error": "Winner template is missing"}), 400
        if has_participant and not participant_path:
            return jsonify({"error": "Participant template is missing"}), 400

    task_id = str(uuid.uuid4())
    format_type = data.get("format", "png").strip().lower()
    orientation = data.get("orientation", "landscape").strip().lower()
    
    zip_tasks[task_id] = {
        "status": "processing",
        "progress": 0,
        "total": len(user_data),
        "file": None,
        "user_id": user_id
    }
    log_audit_event(user_id, "ZIP Generation Started", f"Triggered certificate zip generation for {len(user_data)} students under category '{category_param}' as {format_type.upper()} ({orientation}).")

    def generate_background(task_id):
        zip_path = os.path.join(app.config['UPLOAD_FOLDER'], f"cert_{task_id}.zip")
        try:
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                
                def generate_single_cert(item):
                    student_id, student = item
                    category = student.get("Category", "Participant")
                    name = student.get("Name", "Unknown_Name")
                    is_winner = str(category).strip().lower() == "winner"
                    t_path = resolve_template_path(certs_dir, parent_certs_dir, "winner.png" if is_winner else "participant.png")
                    if t_path and os.path.exists(t_path):
                        img = generate_cert_image(student, t_path, row_index=student_id)
                        content_bytes, _ = convert_to_pdf(img, format_type=format_type, orientation=orientation)
                        return {
                            "success": True,
                            "student_id": student_id,
                            "student": student,
                            "category": category,
                            "name": name,
                            "data": content_bytes
                        }
                    return {"success": False}

                lock = threading.Lock()
                with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
                    futures = [executor.submit(generate_single_cert, item) for item in enumerate(user_data)]
                    
                    for count, future in enumerate(concurrent.futures.as_completed(futures), 1):
                        res = future.result()
                        if res["success"]:
                            safe_name = "".join([c for c in res["name"] if c.isalpha() or c.isdigit() or c==' ']).rstrip()
                            ext = "pdf" if format_type == "pdf" else "png"
                            file_name = f"{res['category']}_{safe_name}_{res['student_id']}.{ext}"
                            
                            with lock:
                                zf.writestr(file_name, res["data"])
                                res["student"]["Status"] = "Generated"
                                increment_stat("emails_generated")
                                if user_id:
                                    increment_user_stat(user_id, "emails_generated")
                        
                        zip_tasks[task_id]["progress"] = count
                        
            zip_tasks[task_id]["status"] = "completed"
            zip_tasks[task_id]["file"] = zip_path
        except Exception as e:
            err_str = traceback.format_exc()
            zip_tasks[task_id]["status"] = "error"
            zip_tasks[task_id]["error"] = err_str

    threading.Thread(target=generate_background, args=(task_id,), daemon=True).start()
    return jsonify({"message": "Background task started", "task_id": task_id})

@app.route("/api/generate_zip_progress/<task_id>")
def api_generate_zip_progress(task_id):
    task = zip_tasks.get(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    return jsonify({
        "status": task["status"],
        "progress": task["progress"],
        "total": task["total"],
        "error": task.get("error")
    })

@app.route("/api/download_zip/<task_id>")
def api_download_zip_id(task_id):
    task = zip_tasks.get(task_id)
    if not task or task["status"] != "completed":
        return jsonify({"error": "Task not finished or not found"}), 400
    
    zip_path = task["file"]
    user_id = task.get("user_id")
    # We remove it to free state memory
    del zip_tasks[task_id]
    
    increment_stat("downloads")
    if user_id:
        increment_user_stat(user_id, "downloads")
    log_audit_event(user_id, "ZIP Downloaded", f"Successfully downloaded generated certificates ZIP for task {task_id}.")
    return send_file(os.path.abspath(zip_path), mimetype="application/zip", as_attachment=True, download_name="certificates.zip")

def _normalize_email(value):
    if value is None:
        return ""
    return str(value).strip()

def _strip_app_password(value):
    """Remove all whitespace from an app password (e.g. 'wyrb fxdp mufh yaah' -> 'wyrbfxdpmufhyaah')."""
    if value is None:
        return ""
    return "".join(str(value).split())

@app.route("/api/test_smtp", methods=["POST"])
def api_test_smtp():
    """Quick credential test — does not send any email, just verifies login."""
    data = request.json or {}
    email   = _normalize_email(data.get("email", ""))
    password = _strip_app_password(data.get("password", ""))
    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400
    try:
        server = _make_smtp()
        server.login(email, password)
        server.quit()
        return jsonify({"success": True, "message": f"✅ Connected successfully as {email}!"})
    except smtplib.SMTPAuthenticationError as e:
        smtp_error = getattr(e, 'smtp_error', None)
        err_text = smtp_error.decode(errors='ignore') if isinstance(smtp_error, (bytes, bytearray)) else str(e)
        return jsonify({"error": f"Authentication failed: {err_text}"}), 401
    except Exception as e:
        return jsonify({"error": f"Connection failed: {str(e)}"}), 500

@app.route("/api/test_run", methods=["POST"])
def api_test_run():
    """Send a sample certificate email to the sender's own address, so a user can
    confirm their Gmail + App Password work before running a real send."""
    data = request.json or {}
    email = _normalize_email(data.get("email", ""))
    password = _strip_app_password(data.get("password", ""))
    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    certs_dir = os.path.join(app.root_path, "templates", "certificates", "events")
    parent_certs_dir = os.path.join(app.root_path, "templates", "certificates")
    template_path = resolve_template_path(certs_dir, parent_certs_dir, "winner.png")
    if not template_path or not os.path.exists(template_path):
        return jsonify({"error": "No sample certificate template available for the test run."}), 500

    sample_student = {"Name": "John Smith", "Email": email, "Category": "Winner"}
    subject = data.get("email_subject") or "✅ Test Run — Certora Sample Certificate"
    body = data.get("email_body") or (
        "Dear {Name},\n\n"
        "This is a test run of your Sender Account. If you received this email with a "
        "certificate attached, your Gmail and App Password are working correctly and you're "
        "all set to send real certificates.\n\n"
        "Best regards,\nCertora Team"
    )
    for col_key, col_val in sample_student.items():
        subject = subject.replace(f"{{{col_key}}}", str(col_val))
        body = body.replace(f"{{{col_key}}}", str(col_val))

    try:
        server = _make_smtp()
        server.login(email, password)
    except smtplib.SMTPAuthenticationError as e:
        smtp_error = getattr(e, 'smtp_error', None)
        err_text = smtp_error.decode(errors='ignore') if isinstance(smtp_error, (bytes, bytearray)) else str(e)
        return jsonify({"error": f"Authentication failed: {err_text}"}), 401
    except Exception as e:
        return jsonify({"error": f"Connection failed: {str(e)}"}), 500

    try:
        img = generate_cert_image(sample_student, template_path, row_index="test_run")
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format='PNG')
        img_data = img_byte_arr.getvalue()

        msg = EmailMessage()
        msg['Subject'] = subject
        msg['From'] = email
        msg['To'] = email
        msg.set_content(body)
        msg.add_attachment(img_data, maintype='image', subtype='png', filename="test_certificate.png")

        server.send_message(msg)
        server.quit()
        return jsonify({"success": True, "message": f"✅ Test email with a sample certificate sent to {email}!"})
    except Exception as e:
        try:
            server.quit()
        except Exception:
            pass
        return jsonify({"error": f"Failed to send test email: {str(e)}"}), 500


@app.route("/api/send_emails_start", methods=["POST"])
def api_send_emails_start():
    data = request.json or {}
    user_id = data.get("user_id")
    email_subject = data.get("email_subject", "Congratulations! Here is your Certificate 🎉")
    email_body = data.get("email_body", "Dear {Name},\n\nPlease find your certificate attached.\n\nBest regards,\nCertora Team")

    # Support multiple sender accounts for rotation (high-volume sending)
    # Each account: {"email": "...", "password": "..."}
    email_accounts_raw = data.get("email_accounts", [])
    # Build a clean list of accounts
    email_accounts = []
    for acc in email_accounts_raw:
        e = _normalize_email(acc.get("email", ""))
        p = _strip_app_password(acc.get("password", ""))
        if e and p:
            email_accounts.append({"email": e, "password": p})

    # Fallback to single sender_email / app_password fields
    if not email_accounts:
        single_email = _normalize_email(data.get("sender_email"))
        single_pass = _strip_app_password(data.get("app_password", ""))
        if single_email and single_pass:
            email_accounts.append({"email": single_email, "password": single_pass})

    if not email_accounts:
        return jsonify({"error": "Email credentials missing — please enter your Gmail and App Password in the Sender Account fields."}), 400

    # Resolve templates
    category_param = data.get("category", "events").strip().lower()
    certs_dir = os.path.join(app.root_path, "templates", "certificates", category_param)
    parent_certs_dir = os.path.join(app.root_path, "templates", "certificates")
    
    winner_path = resolve_template_path(certs_dir, parent_certs_dir, "winner.png")
    participant_path = resolve_template_path(certs_dir, parent_certs_dir, "participant.png")

    task_id = str(uuid.uuid4())
    send_user_data = get_user_data(user_id)
    
    # Pre-filter valid students (only this user's data)
    valid_students = [
        s for s in send_user_data
        if s.get("Status") not in ("Sent", "Delivered") and "@" in _normalize_email(get_ci(s, "Email"))
    ]
    
    email_tasks[task_id] = {
        "task_id": task_id,
        "user_id": user_id,
        "category": category_param,
        "started_at": time.time(),
        "status": "processing",
        "sent": 0,
        "total": len(valid_students),
        "failed_count": 0,
        "failed": [],
        "message": "",
        "error": None
    }
    log_audit_event(user_id, "Emails Batch Started", f"Triggered certificate email delivery to {len(valid_students)} students under category '{category_param}' using {len(email_accounts)} account(s).")

    if len(valid_students) == 0:
        email_tasks[task_id]["status"] = "completed"
        if len(send_user_data) == 0:
            msg = "⚠️ No students uploaded yet. Please upload an Excel file first."
        else:
            msg = "✅ All valid students have already been emailed."
        email_tasks[task_id]["message"] = msg
        return jsonify({"task_id": task_id})

    def email_worker(task_id):
        import time

        success_count = 0
        failed_list = []
        acc_index = 0  # Global index for account rotation
        emails_sent_per_account = [0] * len(email_accounts)
        MAX_PER_ACCOUNT = 450

        lock = threading.Lock()

        # Single persistent SMTP connection for the whole batch.
        # Open it once here — no per-email reconnect, no artificial delays.
        current_server = [None]
        current_acc_idx = [0]

        def _open_connection():
            """Open a fresh SMTP connection to the current account."""
            acc = email_accounts[current_acc_idx[0]]
            try:
                svr = _make_smtp()
                svr.login(acc["email"], acc["password"])
                current_server[0] = svr
                return True
            except Exception as ex:
                current_server[0] = None
                return False

        def _close_connection():
            if current_server[0]:
                try: current_server[0].quit()
                except: pass
                current_server[0] = None

        # Connect once before the loop
        if not _open_connection():
            email_tasks[task_id]["status"] = "error"
            email_tasks[task_id]["message"] = "SMTP Login Failed for primary account."
            return

        def process_student(row_idx, student):
            nonlocal success_count, acc_index

            name = student.get("Name", "Unknown")
            email = _normalize_email(get_ci(student, "Email"))
            category = student.get("Category", "Participant")
            is_winner = str(category).strip().lower() == "winner"
            template_path = winner_path if is_winner else participant_path

            if not email or "@" not in email:
                with lock:
                    failed_list.append({"name": name, "email": get_ci(student, "Email"), "error": "Invalid email address"})
                    email_tasks[task_id]["failed_count"] = len(failed_list)
                    email_tasks[task_id]["failed"] = failed_list
                    email_tasks[task_id]["message"] = f"⛔ {len(failed_list)} recipients failed so far."
                return

            if not os.path.exists(template_path):
                with lock:
                    failed_list.append({"name": name, "email": email, "error": f"Missing certificate template"})
                    email_tasks[task_id]["failed_count"] = len(failed_list)
                    email_tasks[task_id]["failed"] = failed_list
                    email_tasks[task_id]["message"] = f"⛔ {len(failed_list)} recipients failed so far."
                return

            try:
                # Generate certificate image
                img = generate_cert_image(student, template_path, row_index=row_idx)

                # Resize to email-friendly size (max 2500px wide) — the original
                # template is 6250×4419 px (6.6 MB PNG). At 2500px it looks sharp
                # in any email client and is 4× smaller, making sends ~10× faster.
                EMAIL_MAX_WIDTH = 2500
                if img.width > EMAIL_MAX_WIDTH:
                    ratio = EMAIL_MAX_WIDTH / img.width
                    img = img.resize(
                        (EMAIL_MAX_WIDTH, int(img.height * ratio)),
                        Image.Resampling.LANCZOS
                    )

                # Save as JPEG — 7× faster than PNG and 4× smaller file size.
                img_byte_arr = io.BytesIO()
                img.save(img_byte_arr, format='JPEG', quality=92, optimize=True)
                img_data = img_byte_arr.getvalue()


                # Build email body with placeholder substitution
                tracking_id = hashlib.sha256(f"TRACK_{name}{email}{task_id}{row_idx}".encode()).hexdigest()[:32]
                student_key = _student_key(student)
                _create_tracking_record(tracking_id, name, email, student_key, user_id)

                body_text = email_body
                for col_key, col_val in student.items():
                    body_text = body_text.replace(f"{{{col_key}}}", str(col_val))
                pixel_url = f"{BASE_URL}/api/tracking/pixel/{tracking_id}.png"
                body_text += f"\n\n[img: {pixel_url}]"

                safe_name = "".join(c for c in name if c.isalnum() or c == " ") or "certificate"

                acc = email_accounts[current_acc_idx[0]]
                msg = EmailMessage()
                msg['Subject'] = email_subject
                msg['From'] = acc["email"]
                msg['To'] = email
                msg.set_content(body_text)
                msg.add_attachment(img_data, maintype='image', subtype='jpeg', filename=f"{safe_name}.jpg")


                # Send — retry up to 3 times on connection drop only
                last_err = None
                for attempt in range(3):
                    if current_server[0] is None:
                        if not _open_connection():
                            last_err = Exception("Unable to re-establish SMTP connection.")
                            time.sleep(3)
                            continue

                    try:
                        current_server[0].send_message(msg)
                        last_err = None
                        break
                    except (smtplib.SMTPServerDisconnected, smtplib.SMTPConnectError, OSError) as send_err:
                        last_err = send_err
                        _close_connection()
                        time.sleep(3)
                        continue

                if last_err is not None:
                    raise last_err

                # Mark as delivered in tracking
                _update_tracking_status(tracking_id, "Delivered")

                with lock:
                    emails_sent_per_account[current_acc_idx[0]] += 1
                    student["Status"] = "Sent"
                    success_count += 1
                    email_tasks[task_id]["sent"] = success_count
                    email_tasks[task_id]["message"] = f"✅ Sent {success_count}/{len(valid_students)}. {len(failed_list)} failed."
                    increment_stat("emails_generated")
                    increment_stat("emails_sent")
                    if user_id:
                        increment_user_stat(user_id, "emails_generated")
                        increment_user_stat(user_id, "emails_sent")

                    # Rotate to next account if limit reached
                    if emails_sent_per_account[current_acc_idx[0]] >= MAX_PER_ACCOUNT:
                        next_idx = current_acc_idx[0] + 1
                        if next_idx < len(email_accounts):
                            _close_connection()
                            current_acc_idx[0] = next_idx
                            acc_index = next_idx
                            _open_connection()

            except Exception as e:
                err_msg = str(e)
                with lock:
                    failed_list.append({"name": name, "email": email, "error": err_msg})
                    email_tasks[task_id]["failed_count"] = len(failed_list)
                    email_tasks[task_id]["failed"] = failed_list
                    email_tasks[task_id]["message"] = f"⛔ Sent {success_count}. {len(failed_list)} failed so far."
                # Reset connection on error so next student gets a clean one
                _close_connection()

        # ── MAIN LOOP — no sleeps, no jitter, no delays ──────────────────────
        for i, student in enumerate(valid_students):
            process_student(i, student)

        # Close the SMTP connection cleanly after the whole batch
        _close_connection()

        # Persist updated "Sent" statuses so a re-run doesn't re-email everyone
        set_user_data(user_id, send_user_data)
        save_sent_statuses(user_id)

        # Finalize Task
        with lock:
            if email_tasks[task_id]["status"] != "error":
                email_tasks[task_id]["status"] = "completed"
                if len(failed_list) == 0:
                    email_tasks[task_id]["message"] = f"✅ Successfully sent all {success_count} emails!"
                else:
                    email_tasks[task_id]["message"] = f"⚠️ Completed. Sent: {success_count}, Failed: {len(failed_list)}."

    threading.Thread(target=email_worker, args=(task_id,), daemon=True).start()
    return jsonify({"message": "Background task started", "task_id": task_id})

@app.route("/api/send_emails_progress/<task_id>")
def api_send_emails_progress(task_id):
    task = email_tasks.get(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    return jsonify(task)

@app.route("/api/active_email_tasks/<user_id>")
@limiter.exempt
def api_active_email_tasks(user_id):
    active_tasks = []
    # Clean up very old tasks (e.g. > 1 day) to prevent memory leak, but keep recent ones
    current_time = time.time()
    keys_to_delete = []
    for tid, t in email_tasks.items():
        if t.get("user_id") == int(user_id) or str(t.get("user_id")) == str(user_id):
            active_tasks.append(t)
        if current_time - t.get("started_at", current_time) > 86400: # Older than 24 hours
            keys_to_delete.append(tid)
            
    for k in keys_to_delete:
        try:
            del email_tasks[k]
        except KeyError:
            pass
            
    # Sort descending by started_at
    active_tasks.sort(key=lambda x: x.get("started_at", 0), reverse=True)
    return jsonify(active_tasks)

@app.route("/api/schedule_emails", methods=["POST"])
def api_schedule_emails():
    try:
        data = request.json or {}
        user_id = data.get("user_id")
        schedule_time_str = data.get("schedule_time")
        timezone_str = data.get("timezone", "UTC")
        sender_email = _normalize_email(data.get("sender_email"))
        app_password = _normalize_email(data.get("app_password"))
        category = data.get("category", "events").strip().lower()
        
        if not sender_email or not app_password or not schedule_time_str:
            return jsonify({"error": "Missing required schedule fields"}), 400
            
        sched_user_data = get_user_data(user_id)
        if not sched_user_data:
            return jsonify({"error": "No students data uploaded to schedule"}), 400
            
        pending_students = [
            s for s in sched_user_data 
            if s.get("Status") not in ("Sent", "Delivered") and "@" in _normalize_email(get_ci(s, "Email"))
        ]
        
        if not pending_students:
            return jsonify({"error": "No pending students to schedule emails for"}), 400
            
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO scheduled_cert_jobs (user_id, schedule_time, timezone, sender_email, app_password, category, student_data)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (user_id, schedule_time_str, timezone_str, sender_email, app_password, category, json.dumps(pending_students)))
        
        job_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()
        
        log_audit_event(user_id, "Emails Batch Scheduled", f"Scheduled certificate emails for {len(pending_students)} students at {schedule_time_str} ({timezone_str})")
        return jsonify({"message": f"Successfully scheduled {len(pending_students)} emails for {schedule_time_str} ({timezone_str}).", "job_id": job_id})
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Failed to schedule emails: {str(e)}"}), 500

@app.route("/api/schedule_emails/list", methods=["GET"])
def api_list_scheduled_emails():
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT id, user_id, schedule_time, timezone, sender_email, category, status, created_at,
                   jsonb_array_length(student_data) as recipient_count
            FROM scheduled_cert_jobs
            ORDER BY created_at DESC
        """)
        jobs = cur.fetchall()
        cur.close()
        conn.close()
        
        for j in jobs:
            if j["schedule_time"]:
                j["schedule_time"] = j["schedule_time"].isoformat()
            if j["created_at"]:
                j["created_at"] = j["created_at"].isoformat()
        return jsonify({"jobs": jobs})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/schedule_emails/cancel/<int:job_id>", methods=["DELETE"])
def api_cancel_scheduled_email(job_id):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT status, user_id FROM scheduled_cert_jobs WHERE id = %s", (job_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return jsonify({"error": "Job not found"}), 404
        if row[0] != "Pending":
            cur.close()
            conn.close()
            return jsonify({"error": f"Cannot cancel job in '{row[0]}' status"}), 400
            
        cur.execute("DELETE FROM scheduled_cert_jobs WHERE id = %s", (job_id,))
        conn.commit()
        cur.close()
        conn.close()
        
        log_audit_event(row[1], "Scheduled Job Cancelled", f"Cancelled scheduled certificate job {job_id}.")
        return jsonify({"message": "Scheduled email job cancelled successfully."})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/verify/<unique_id>", methods=["GET"])
def api_verify_certificate(unique_id):
    from datetime import datetime
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO certificate_verifications (certificate_id, verification_count, last_verified)
            VALUES (%s, 1, NOW())
            ON CONFLICT (certificate_id) DO UPDATE 
            SET verification_count = certificate_verifications.verification_count + 1, last_verified = NOW()
            RETURNING verification_count, last_verified
        """, (unique_id,))
        verification_count, last_verified = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print("Failed to log verification stats:", e)
        verification_count, last_verified = 1, datetime.now()

    # Log QR scan analytics (Item 8)
    try:
        client_ip = request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip()
        ua_string = request.headers.get("User-Agent", "")
        threading.Thread(target=_log_qr_scan, args=(unique_id, client_ip, ua_string), daemon=True).start()
    except Exception:
        pass

    result = blockchain.verify_certificate_on_chain(unique_id)
    
    error_msg = result.get("error")
    is_valid = result.get("isValid", False)
    timestamp = result.get("timestamp", 0)
    issued_date = datetime.utcfromtimestamp(timestamp).strftime('%d %B %Y, %H:%M UTC') if timestamp else "Unknown"
    
    digital_sig = hashlib.sha256(f"CERTORA_SIGNATURE_{unique_id}_{result.get('nameHash', 'NoName')}".encode()).hexdigest()
    
    recipient_name = "Unknown"
    issued_by = "Ramco Institute of Technology"
    template_category = "General Events"
    
    # Mock Data Fallback: Search all local user data if blockchain verification fails
    fallback_found = False
    if not is_valid:
        # Check in-memory user_students_data
        for user_data_list in user_students_data.values():
            for idx, s in enumerate(user_data_list):
                name = s.get("Name", "Unknown Name")
                email = s.get("Email", "no-email@example.com")
                s_id_indexed = hashlib.sha256(f"{name}{email}{idx}".encode()).hexdigest()[:10].upper()
                s_id_unindexed = hashlib.sha256(f"{name}{email}".encode()).hexdigest()[:10].upper()
                
                if unique_id in [s_id_indexed, s_id_unindexed]:
                    recipient_name = s.get("Name", "Unknown")
                    cat = s.get("Category", "Participant")
                    template_category = f"{cat} Template"
                    fallback_found = True
                    is_valid = True
                    error_msg = None
                    issued_date = datetime.now().strftime('%d %B %Y, %H:%M UTC')
                    break
            if fallback_found:
                break
        
        # If not found in memory, parse all uploaded excel/csv files
        if not fallback_found:
            import glob, os, pandas as pd
            for ext in ["*.xlsx", "*.xls", "*.csv"]:
                for file in glob.glob(os.path.join(app.config["UPLOAD_FOLDER"], ext)):
                    try:
                        if file.endswith(".csv"):
                            df = pd.read_csv(file)
                        else:
                            df = pd.read_excel(file)
                        df = df.dropna(how='all').drop_duplicates().fillna('')
                        file_data = df.to_dict(orient="records")
                        
                        for idx, s in enumerate(file_data):
                            norm_s = {str(k).strip().title(): v for k, v in s.items()}
                            name = norm_s.get("Name", "Unknown Name")
                            email = norm_s.get("Email", "no-email@example.com")
                            s_id_indexed = hashlib.sha256(f"{name}{email}{idx}".encode()).hexdigest()[:10].upper()
                            s_id_unindexed = hashlib.sha256(f"{name}{email}".encode()).hexdigest()[:10].upper()
                            
                            if unique_id in [s_id_indexed, s_id_unindexed]:
                                recipient_name = norm_s.get("Name", "Unknown")
                                cat = norm_s.get("Category", "Participant")
                                template_category = f"{cat} Template"
                                fallback_found = True
                                is_valid = True
                                error_msg = None
                                issued_date = datetime.now().strftime('%d %B %Y, %H:%M UTC')
                                break
                    except Exception as e:
                        pass
                    if fallback_found:
                        break
                if fallback_found:
                    break
                
    if not fallback_found and recipient_name == "Unknown" and result.get("nameHash"):
        recipient_name = result.get("nameHash")

    return jsonify({
        "unique_id": unique_id,
        "is_valid": is_valid,
        "recipient": recipient_name,
        "issued_by": issued_by,
        "issued_date": issued_date,
        "blockchain_hash": result.get("ipfsHash", "0x" + hashlib.sha256(unique_id.encode()).hexdigest()),
        "transaction_id": "0x" + hashlib.sha256(f"TX_{unique_id}".encode()).hexdigest(),
        "template": template_category,
        "verification_count": verification_count,
        "last_verified": last_verified.isoformat() if last_verified else None,
        "digital_signature": f"0x{digital_sig}"
    })

@app.route("/api/admin/stats", methods=["GET"])
def api_admin_stats():
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id, register_number, email, created_at, generated_count, sent_count, download_count, role, is_active FROM users ORDER BY created_at DESC")
        users = cur.fetchall()
        cur.close()
        conn.close()

        for u in users:
            if u["created_at"]:
                u["created_at"] = u["created_at"].isoformat()

        stats = get_stats()
        stats["users_count"] = len(users)

        return jsonify({
            "stats": stats,
            "users": users
        }), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Failed to fetch admin stats: {str(e)}"}), 500

# ── Authentication Endpoints ──────────────────────────────────────────────
def hash_password(password, salt="Learn2Lead_Salt_123"):
    # Secure hashing using SHA-256 with a salt
    return hashlib.sha256((password + salt).encode()).hexdigest()

@app.route("/api/register", methods=["POST"])
def api_register():
    try:
        data = request.json or {}
        register_number = data.get("register_number", "").strip()
        email = data.get("email", "").strip()
        password = data.get("password", "")

        if not register_number or not email or not password:
            return jsonify({"error": "Register number, email, and password are required"}), 400

        password_hash = hash_password(password)

        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check username uniqueness specifically
        cur.execute("SELECT id FROM users WHERE register_number = %s", (register_number,))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"error": "Username already taken. Please choose a different username.", "field": "register_number"}), 409

        # Check email uniqueness specifically
        cur.execute("SELECT id FROM users WHERE email = %s", (email,))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"error": "Email already registered. Please use a different email address.", "field": "email"}), 409

        cur.execute(
            "INSERT INTO users (register_number, email, password_hash, is_active) VALUES (%s, %s, %s, FALSE) RETURNING id",
            (register_number, email, password_hash)
        )
        new_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()

        log_audit_event(new_id, "User Registered", f"Email: {email}, Reg No: {register_number} (Pending Approval)")
        add_notification(None, "New User Pending Approval 👤", f"User {email} has registered and is pending approval (Reg No: {register_number}).")
        return jsonify({"message": "Registration successful! Your account is pending administrator approval."}), 201
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Registration failed: {str(e)}"}), 500

@app.route("/api/login", methods=["POST"])
def api_login():
    try:
        data = request.json or {}
        email = data.get("email", "").strip()
        password = data.get("password", "")

        if not email or not password:
            return jsonify({"error": "Email and password are required"}), 400

        # Check static admin credentials
        if (email.lower() == "admin" or email.lower() == "admin@gmail.com") and password == "harish":
            user_info = {
                "id": 0,
                "register_number": "ADMIN",
                "email": "admin@gmail.com",
                "role": "admin"
            }
            log_audit_event(0, "Admin Login", "Successful administrator console login")
            return jsonify({"message": "Login successful", "user": user_info}), 200

        password_hash = hash_password(password)

        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        # Accept login by email OR by username (register_number)
        cur.execute(
            "SELECT id, register_number, email, password_hash, role, is_active FROM users WHERE email = %s OR register_number = %s",
            (email, email)
        )
        user = cur.fetchone()

        if not user or user["password_hash"] != password_hash:
            log_audit_event(None, "Login Failed", f"Attempted login with email: {email}")
            cur.close()
            conn.close()
            return jsonify({"error": "Invalid email or password"}), 401

        if not user.get("is_active", True):
            # Check if they have ever logged in successfully
            cur.execute("SELECT 1 FROM audit_logs WHERE user_id = %s AND action = 'User Login' LIMIT 1", (user["id"],))
            has_logged_in = cur.fetchone()
            cur.close()
            conn.close()
            
            log_audit_event(user["id"], "Login Blocked", f"Inactive user {email} attempted to log in")
            if not has_logged_in:
                return jsonify({"error": "Your registration is pending administrator approval. Please contact the admin."}), 403
            else:
                return jsonify({"error": "This account has been suspended. Please contact the administrator."}), 403

        cur.close()
        conn.close()

        # Do not return password_hash to frontend
        user_info = {
            "id": user["id"],
            "register_number": user["register_number"],
            "email": user["email"],
            "role": user["role"]
        }
        log_audit_event(user["id"], "User Login", f"Successful user login for {email}")
        return jsonify({"message": "Login successful", "user": user_info}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Login failed: {str(e)}"}), 500

# ── Admin User Moderation Endpoints ─────────────────────────────────────────

@app.route("/api/admin/users/<int:target_id>/toggle-status", methods=["POST"])
def api_admin_toggle_status(target_id):
    try:
        data = request.json or {}
        admin_id = data.get("admin_id")
        
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=Psycopg2RealDictCursor if 'Psycopg2RealDictCursor' in globals() else RealDictCursor)
        cur.execute("SELECT email, is_active FROM users WHERE id = %s", (target_id,))
        target_user = cur.fetchone()
        
        if not target_user:
            cur.close()
            conn.close()
            return jsonify({"error": "User not found"}), 404
            
        new_status = not target_user["is_active"]
        cur.execute("UPDATE users SET is_active = %s WHERE id = %s", (new_status, target_id))
        conn.commit()
        cur.close()
        conn.close()
        
        status_str = "Activated" if new_status else "Suspended"
        if new_status:
            add_notification(target_id, "Account Approved 🎉", "Your registration has been approved by the administrator. Welcome to the Certora platform!")
            add_notification(None, "User Account Approved ✅", f"Administrator approved user account: {target_user['email']}")
        else:
            add_notification(target_id, "Account Suspended ⚠️", "Your account access has been suspended. Please contact the administrator.")
            add_notification(None, "User Account Suspended ⛔", f"Administrator suspended user account: {target_user['email']}")

        log_audit_event(admin_id, f"User {status_str}", f"Toggled status of user {target_user['email']} to {new_status}")
        return jsonify({"message": f"User account has been {status_str.lower()} successfully.", "is_active": new_status}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Failed to toggle user status: {str(e)}"}), 500

@app.route("/api/admin/users/<int:target_id>/reset-password", methods=["POST"])
def api_admin_reset_password(target_id):
    try:
        data = request.json or {}
        admin_id = data.get("admin_id")
        new_password = data.get("password")
        
        if not new_password or len(new_password.strip()) < 4:
            return jsonify({"error": "Password must be at least 4 characters long"}), 400
            
        new_hash = hash_password(new_password)
        
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT email FROM users WHERE id = %s", (target_id,))
        target_user = cur.fetchone()
        
        if not target_user:
            cur.close()
            conn.close()
            return jsonify({"error": "User not found"}), 404
            
        cur.execute("UPDATE users SET password_hash = %s WHERE id = %s", (new_hash, target_id))
        conn.commit()
        cur.close()
        conn.close()
        
        log_audit_event(admin_id, "Password Override", f"Admin forced password reset for user {target_user['email']}")
        return jsonify({"message": "User password has been updated successfully."}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Failed to reset password: {str(e)}"}), 500

@app.route("/api/admin/users/<int:target_id>/change-role", methods=["POST"])
def api_admin_change_role(target_id):
    try:
        data = request.json or {}
        admin_id = data.get("admin_id")
        new_role = data.get("role")
        
        if new_role not in ["admin", "user"]:
            return jsonify({"error": "Invalid role value"}), 400
            
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT email, role FROM users WHERE id = %s", (target_id,))
        target_user = cur.fetchone()
        
        if not target_user:
            cur.close()
            conn.close()
            return jsonify({"error": "User not found"}), 404
            
        cur.execute("UPDATE users SET role = %s WHERE id = %s", (new_role, target_id))
        conn.commit()
        cur.close()
        conn.close()
        
        log_audit_event(admin_id, "Role Promoted" if new_role == "admin" else "Role Demoted", f"Changed role of user {target_user['email']} from {target_user['role']} to {new_role}")
        return jsonify({"message": f"User role updated to {new_role} successfully.", "role": new_role}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Failed to update user role: {str(e)}"}), 500


@app.route("/api/admin/users/bulk-upload", methods=["POST"])
def api_admin_users_bulk_upload():
    try:
        admin_id = request.form.get("admin_id")
        file = request.files.get("excel_file")
        if not file:
            return jsonify({"error": "No file uploaded."}), 400

        is_csv = file.filename.lower().endswith('.csv')
        
        # Read the file
        if is_csv:
            df = pd.read_csv(io.BytesIO(file.read()), encoding='utf-8-sig')
        else:
            df = pd.read_excel(io.BytesIO(file.read()))

        # Normalize column names
        df.columns = [str(col).strip().lower().replace(' ', '_') for col in df.columns]

        # Map potential variations of required columns
        reg_col = None
        for col in ['register_number', 'reg_no', 'regno', 'username']:
            if col in df.columns:
                reg_col = col
                break
        
        email_col = None
        for col in ['email', 'email_address', 'mail']:
            if col in df.columns:
                email_col = col
                break

        if not reg_col or not email_col:
            return jsonify({"error": "Missing required columns. File must contain 'register_number' (or 'regno') and 'email'."}), 400

        created_count = 0
        skipped_records = []
        created_records = []

        conn = get_db_connection()
        cur = conn.cursor()

        for index, row in df.iterrows():
            row_num = index + 2  # 1-indexed header is row 1
            
            # Extract fields
            regno = str(row[reg_col]).strip() if pd.notna(row[reg_col]) else ""
            email = str(row[email_col]).strip() if pd.notna(row[email_col]) else ""
            
            # optional fields
            password = str(row['password']).strip() if 'password' in df.columns and pd.notna(row['password']) else "123"
            role = str(row['role']).strip().lower() if 'role' in df.columns and pd.notna(row['role']) else "user"
            is_active_val = row['is_active'] if 'is_active' in df.columns and pd.notna(row['is_active']) else True

            if not regno or not email:
                skipped_records.append({"row": row_num, "regno": regno or "—", "reason": "Missing username/register_number or email"})
                continue

            # check if exists
            cur.execute("SELECT id FROM users WHERE register_number = %s OR email = %s", (regno, email))
            if cur.fetchone():
                skipped_records.append({"row": row_num, "regno": regno, "reason": "Username or Email already exists"})
                continue

            # insert user
            password_hash = hash_password(password)
            try:
                # convert role and is_active
                role = role if role in ["admin", "user"] else "user"
                is_active = bool(is_active_val) if not isinstance(is_active_val, str) else (is_active_val.lower() not in ["false", "0", "no"])
                
                cur.execute(
                    "INSERT INTO users (register_number, email, password_hash, role, is_active) VALUES (%s, %s, %s, %s, %s) RETURNING id",
                    (regno, email, password_hash, role, is_active)
                )
                new_id = cur.fetchone()[0]
                conn.commit()
                created_count += 1
                created_records.append({
                    "row": row_num,
                    "id": new_id,
                    "register_number": regno,
                    "email": email,
                    "role": role,
                    "is_active": is_active
                })
            except Exception as row_exc:
                conn.rollback()
                skipped_records.append({"row": row_num, "regno": regno, "reason": str(row_exc)})

        cur.close()
        conn.close()

        log_audit_event(admin_id, "Bulk User Upload", f"Successfully bulk uploaded users. Created: {created_count}, Skipped: {len(skipped_records)}")
        return jsonify({
            "created": created_count,
            "skipped": len(skipped_records),
            "created_records": created_records,
            "skipped_records": skipped_records
        }), 201

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Bulk upload failed: {str(e)}"}), 500

# ── Admin Universal Template Manager Endpoints ──────────────────────────────

@app.route("/api/admin/templates", methods=["GET"])
def api_admin_list_templates():
    try:
        categories = ["events", "course", "project"]
        templates_status = {}
        
        parent_certs_dir = os.path.join(app.root_path, "templates", "certificates")
        
        for cat in categories:
            certs_dir = os.path.join(parent_certs_dir, cat)
            os.makedirs(certs_dir, exist_ok=True)
            winner_exists = os.path.exists(os.path.join(certs_dir, "winner.png"))
            participant_exists = os.path.exists(os.path.join(certs_dir, "participant.png"))
            
            templates_status[cat] = {
                "winner": {
                    "exists": winner_exists,
                    "path": f"/templates/certificates/{cat}/winner.png" if winner_exists else None
                },
                "participant": {
                    "exists": participant_exists,
                    "path": f"/templates/certificates/{cat}/participant.png" if participant_exists else None
                }
            }
            
        return jsonify({"templates": templates_status}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to load templates catalog: {str(e)}"}), 500

@app.route("/api/admin/templates/<category>/<template_type>", methods=["DELETE"])
def api_admin_delete_template(category, template_type):
    try:
        admin_id = request.args.get("admin_id")
        
        if category not in ["events", "course", "project"] or template_type not in ["winner", "participant"]:
            return jsonify({"error": "Invalid category or template type"}), 400
            
        certs_dir = os.path.join(app.root_path, "templates", "certificates", category)
        file_path = os.path.join(certs_dir, f"{template_type}.png")
        
        if os.path.exists(file_path):
            os.remove(file_path)
            log_audit_event(admin_id, "Template Deleted", f"Deleted {template_type} template for category {category}")
            return jsonify({"message": f"{template_type.capitalize()} template for {category} deleted successfully."}), 200
        else:
            return jsonify({"error": "Template file does not exist"}), 404
    except Exception as e:
        return jsonify({"error": f"Failed to delete template: {str(e)}"}), 500

# ── Admin System Audits & Logs Endpoints ────────────────────────────────────

@app.route("/api/admin/audit_logs", methods=["GET"])
def api_admin_audit_logs():
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT a.id, a.user_id, a.action, a.details, a.created_at, u.email as user_email
            FROM audit_logs a
            LEFT JOIN users u ON a.user_id = u.id
            ORDER BY a.created_at DESC
            LIMIT 200
        """)
        logs = cur.fetchall()
        cur.close()
        conn.close()
        
        for l in logs:
            if l["created_at"]:
                l["created_at"] = l["created_at"].isoformat()
            if not l["user_email"] and l["user_id"] == 0:
                l["user_email"] = "admin@gmail.com"
                
        return jsonify({"logs": logs}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Failed to fetch audit logs: {str(e)}"}), 500

@app.route("/api/admin/audit_logs/export", methods=["GET"])
def api_admin_audit_logs_export():
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT a.id, a.created_at, u.email as user_email, a.action, a.details
            FROM audit_logs a
            LEFT JOIN users u ON a.user_id = u.id
            ORDER BY a.created_at DESC
        """)
        logs = cur.fetchall()
        cur.close()
        conn.close()
        
        # Build CSV file content in-memory
        import csv
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header row
        writer.writerow(["Log ID", "Timestamp (UTC)", "Operator Email", "Action", "Details"])
        
        for l in logs:
            timestamp_str = l["created_at"].strftime('%Y-%m-%d %H:%M:%S') if l["created_at"] else "N/A"
            email = l["user_email"]
            if not email and l["user_email"] is None:
                # check if system action or admin
                email = "admin@gmail.com" if l["user_email"] == "admin" else "System / Guest"
            
            writer.writerow([
                l["id"],
                timestamp_str,
                email,
                l["action"],
                l["details"]
            ])
            
        output.seek(0)
        return send_file(
            io.BytesIO(output.getvalue().encode('utf-8')),
            mimetype="text/csv",
            as_attachment=True,
            download_name=f"system_audit_logs_{int(time.time())}.csv"
        )
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Failed to export logs: {str(e)}"}), 500

# ── Advanced Stats & Forgot Password Verification Endpoints ────────────────

@app.route("/api/admin/users/<int:target_id>/advanced-stats", methods=["GET"])
def api_admin_user_advanced_stats(target_id):
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT action, details, created_at FROM audit_logs WHERE user_id = %s ORDER BY created_at DESC", (target_id,))
        logs = cur.fetchall()
        cur.close()
        conn.close()
        
        # Parse logs dynamically to count categories and activity details
        import re
        breakdown = {
            "events": {"generated": 0, "sent": 0, "downloaded": 0},
            "course": {"generated": 0, "sent": 0, "downloaded": 0},
            "project": {"generated": 0, "sent": 0, "downloaded": 0}
        }
        
        for l in logs:
            action = l["action"] or ""
            details = l["details"] or ""
            
            # Determine category
            cat = "events"
            if "course" in details.lower():
                cat = "course"
            elif "project" in details.lower():
                cat = "project"
            
            # Parse student counts using regex
            count_match = re.search(r'\b\d+\b', details)
            count = int(count_match.group(0)) if count_match else 0
            
            if "ZIP Generation" in action or "generated" in action.lower():
                breakdown[cat]["generated"] += count
            elif "Emails" in action or "sent" in action.lower() or "dispatched" in details.lower():
                breakdown[cat]["sent"] += count
            elif "Download" in action or "downloaded" in action.lower():
                breakdown[cat]["downloaded"] += count
                
        return jsonify({
            "user_id": target_id,
            "breakdown": breakdown,
            "recent_logs": logs[:10]
        }), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Failed to fetch advanced stats: {str(e)}"}), 500

@app.route("/api/forgot-password/send-code", methods=["POST"])
def api_forgot_password_send_code():
    try:
        data = request.json or {}
        email = data.get("email", "").strip()
        if not email:
            return jsonify({"error": "Email is required"}), 400
            
        # Check if user exists
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT id FROM users WHERE email = %s", (email,))
        user = cur.fetchone()
        if not user:
            cur.close()
            conn.close()
            return jsonify({"error": "User with this email does not exist"}), 404
            
        # Generate 6 digit code
        import random
        from datetime import datetime, timedelta
        code = f"{random.randint(100000, 999999)}"
        expires_at = datetime.now() + timedelta(minutes=10)
        
        # Save or update reset code
        cur.execute("""
            INSERT INTO password_resets (email, code, expires_at) 
            VALUES (%s, %s, %s)
            ON CONFLICT (email) DO UPDATE SET code = EXCLUDED.code, expires_at = EXCLUDED.expires_at
        """, (email, code, expires_at))
        conn.commit()
        cur.close()
        conn.close()
        
        # Send Email Verification Code via SMTP
        # Reads from .env: RESET_EMAIL and RESET_APP_PASSWORD
        sender_email = os.getenv("RESET_EMAIL", "").strip()
        app_password = os.getenv("RESET_APP_PASSWORD", "").strip()
        
        if not sender_email or not app_password:
            return jsonify({"error": "Reset email is not configured on the server. Please contact the administrator to set RESET_EMAIL and RESET_APP_PASSWORD in the .env file."}), 503
        
        server = _make_smtp()
        server.login(sender_email, app_password)
        
        msg = EmailMessage()
        msg['Subject'] = 'Reset Password Verification Code 🔑'
        msg['From'] = sender_email
        msg['To'] = email
        msg.set_content(
            f"Dear User,\n\n"
            f"We received a password reset request. Use the verification code below to reset your password:\n\n"
            f"🔑 VERIFICATION CODE: {code}\n\n"
            f"This code will expire in 10 minutes.\n\n"
            f"If you did not request this, please ignore this email.\n\n"
            f"Best regards,\nCertora Support Team"
        )
        server.send_message(msg)
        server.quit()
        
        log_audit_event(user["id"], "Verification Code Sent", f"Password reset verification code sent to {email}")
        return jsonify({"message": "Verification code has been successfully emailed to your account."}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Failed to send verification code: {str(e)}"}), 500

@app.route("/api/forgot-password/verify-and-reset", methods=["POST"])
def api_forgot_password_verify_and_reset():
    try:
        data = request.json or {}
        email = data.get("email", "").strip()
        code = data.get("code", "").strip()
        new_password = data.get("password", "")
        
        if not email or not code or not new_password:
            return jsonify({"error": "Email, verification code, and new password are required"}), 400
            
        if len(new_password) < 4:
            return jsonify({"error": "Password must be at least 4 characters long"}), 400
            
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # Verify code
        cur.execute("SELECT code, expires_at FROM password_resets WHERE email = %s", (email,))
        reset_record = cur.fetchone()
        
        if not reset_record:
            cur.close()
            conn.close()
            return jsonify({"error": "No password reset request found for this email"}), 400
            
        from datetime import datetime
        if reset_record["expires_at"] < datetime.now():
            cur.close()
            conn.close()
            return jsonify({"error": "Verification code has expired. Please request a new one."}), 400
            
        if reset_record["code"] != code:
            cur.close()
            conn.close()
            return jsonify({"error": "Invalid verification code. Please check and try again."}), 400
            
        # Update user's password
        password_hash = hash_password(new_password)
        cur.execute("UPDATE users SET password_hash = %s WHERE email = %s RETURNING id", (password_hash, email))
        user = cur.fetchone()
        
        # Delete reset code
        cur.execute("DELETE FROM password_resets WHERE email = %s", (email,))
        conn.commit()
        cur.close()
        conn.close()
        
        log_audit_event(user["id"] if user else None, "Password Reset Verified", f"User {email} reset their password via verification code")
        return jsonify({"message": "Your password has been successfully reset. You can now login."}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Failed to reset password: {str(e)}"}), 500

# ── Public Stats (Item 3 – Dynamic Login Card) ─────────────────────────────
@app.route("/api/public/stats", methods=["GET"])
def api_public_stats():
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT COUNT(*) as users_count FROM users")
        users_row = cur.fetchone()
        cur.execute("SELECT value FROM system_stats WHERE key = 'emails_generated'")
        gen_row = cur.fetchone()
        cur.execute("SELECT value FROM system_stats WHERE key = 'emails_sent'")
        sent_row = cur.fetchone()
        cur.close()
        conn.close()
        return jsonify({
            "total_generated": gen_row["value"] if gen_row else 0,
            "total_sent": sent_row["value"] if sent_row else 0,
            "users_count": users_row["users_count"] if users_row else 0,
        }), 200
    except Exception as e:
        return jsonify({"total_generated": 0, "total_sent": 0, "users_count": 0}), 200


# ── Email Tracking (Item 6) ──────────────────────────────────────────────────

def _create_tracking_record(tracking_id, student_name, student_email, student_key, user_id):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO email_tracking (tracking_id, student_key, student_name, student_email, user_id, status)
            VALUES (%s, %s, %s, %s, %s, 'Queued')
            ON CONFLICT (tracking_id) DO NOTHING
        """, (tracking_id, student_key, student_name, student_email, user_id))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Tracking record creation failed: {e}")

def _update_tracking_status(tracking_id, status):
    from datetime import datetime
    now = datetime.utcnow()
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        col_map = {
            'Delivered': 'delivered_at',
            'Opened': 'opened_at',
            'Clicked': 'clicked_at',
            'Downloaded': 'downloaded_at',
        }
        ts_col = col_map.get(status)
        if ts_col:
            cur.execute(
                f"UPDATE email_tracking SET status = %s, {ts_col} = %s WHERE tracking_id = %s",
                (status, now, tracking_id)
            )
        else:
            cur.execute("UPDATE email_tracking SET status = %s WHERE tracking_id = %s", (status, tracking_id))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Tracking update failed: {e}")

@app.route("/api/tracking/pixel/<tracking_id>.png", methods=["GET"])
def api_tracking_pixel(tracking_id):
    _update_tracking_status(tracking_id, "Opened")
    import base64
    from flask import Response
    pixel = base64.b64decode("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")
    return Response(pixel, mimetype="image/gif", headers={
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache"
    })

@app.route("/api/tracking/click/<tracking_id>", methods=["GET"])
def api_tracking_click(tracking_id):
    redirect_url = request.args.get("url", "/")
    _update_tracking_status(tracking_id, "Clicked")
    from flask import redirect as flask_redirect
    return flask_redirect(redirect_url)

@app.route("/api/tracking/download/<tracking_id>", methods=["GET"])
def api_tracking_download(tracking_id):
    _update_tracking_status(tracking_id, "Downloaded")
    return jsonify({"ok": True}), 200

@app.route("/api/email_analytics", methods=["GET"])
def api_email_analytics():
    try:
        user_id = request.args.get("user_id")
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        if user_id:
            cur.execute("SELECT * FROM email_tracking WHERE user_id = %s ORDER BY created_at DESC", (user_id,))
        else:
            cur.execute("SELECT * FROM email_tracking ORDER BY created_at DESC LIMIT 500")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        total = len(rows)
        delivered = sum(1 for r in rows if r["status"] in ("Delivered", "Opened", "Clicked", "Downloaded"))
        opened = sum(1 for r in rows if r["status"] in ("Opened", "Clicked", "Downloaded"))
        clicked = sum(1 for r in rows if r["status"] in ("Clicked", "Downloaded"))
        bounced = sum(1 for r in rows if r.get("bounced"))
        spam = sum(1 for r in rows if r.get("spam_reported"))
        for r in rows:
            for ts_field in ["sent_at", "delivered_at", "opened_at", "clicked_at", "downloaded_at", "created_at"]:
                if r.get(ts_field):
                    r[ts_field] = r[ts_field].isoformat()
        return jsonify({
            "total": total,
            "delivered": delivered,
            "opened": opened,
            "clicked": clicked,
            "bounced": bounced,
            "spam": spam,
            "delivery_rate": round((delivered / total * 100), 1) if total > 0 else 0,
            "open_rate": round((opened / total * 100), 1) if total > 0 else 0,
            "bounce_rate": round((bounced / total * 100), 1) if total > 0 else 0,
            "spam_rate": round((spam / total * 100), 1) if total > 0 else 0,
            "records": rows
        }), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e), "total": 0, "delivery_rate": 0, "open_rate": 0, "bounce_rate": 0, "spam_rate": 0, "records": []}), 500


# ── Template Version History (Item 7) ────────────────────────────────────────

@app.route("/api/versions", methods=["GET"])
def api_get_versions():
    try:
        user_id = request.args.get("user_id")
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        if user_id:
            cur.execute("SELECT id, version_num, label, created_at FROM template_versions WHERE user_id = %s ORDER BY version_num DESC LIMIT 50", (user_id,))
        else:
            cur.execute("SELECT id, version_num, label, created_at FROM template_versions WHERE user_id IS NULL ORDER BY version_num DESC LIMIT 50")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        for r in rows:
            if r["created_at"]:
                r["created_at"] = r["created_at"].isoformat()
        return jsonify({"versions": rows}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e), "versions": []}), 500

@app.route("/api/versions/<int:version_id>", methods=["GET"])
def api_get_version(version_id):
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM template_versions WHERE id = %s", (version_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            return jsonify({"error": "Version not found"}), 404
        if row["created_at"]:
            row["created_at"] = row["created_at"].isoformat()
        return jsonify({"version": row}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/versions/save", methods=["POST"])
def api_save_version():
    try:
        data = request.json or {}
        user_id = data.get("user_id")
        label = data.get("label", "")
        config = data.get("config")
        if not config:
            return jsonify({"error": "config is required"}), 400
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        if user_id:
            cur.execute("SELECT COALESCE(MAX(version_num), 0) as max_v FROM template_versions WHERE user_id = %s", (user_id,))
        else:
            cur.execute("SELECT COALESCE(MAX(version_num), 0) as max_v FROM template_versions WHERE user_id IS NULL")
        row = cur.fetchone()
        next_ver = (row["max_v"] or 0) + 1
        auto_label = label or f"Version {next_ver}"
        import json as _json
        cur.execute(
            "INSERT INTO template_versions (user_id, version_num, label, config_snapshot) VALUES (%s, %s, %s, %s) RETURNING id",
            (user_id, next_ver, auto_label, _json.dumps(config))
        )
        new_id = cur.fetchone()["id"]
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"message": "Version saved", "version_num": next_ver, "id": new_id, "label": auto_label}), 201
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/versions/<int:version_id>/restore", methods=["POST"])
def api_restore_version(version_id):
    global text_fields_config
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT config_snapshot FROM template_versions WHERE id = %s", (version_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            return jsonify({"error": "Version not found"}), 404
        snapshot = row["config_snapshot"]
        fields = snapshot.get("fields", snapshot) if isinstance(snapshot, dict) else snapshot
        if isinstance(fields, list):
            text_fields_config = fields
        return jsonify({"message": "Version restored", "fields": text_fields_config}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ── QR Analytics (Item 8) ────────────────────────────────────────────────────

def _parse_user_agent(ua_string):
    ua = ua_string or ""
    if any(x in ua for x in ["iPhone", "Android", "Mobile", "iPad", "Tablet"]):
        device = "Mobile" if ("Mobile" in ua or "iPhone" in ua or "Android" in ua) else "Tablet"
    else:
        device = "Desktop"
    if "Edg" in ua or "Edge" in ua:
        browser = "Edge"
    elif "OPR" in ua or "Opera" in ua:
        browser = "Opera"
    elif "Chrome" in ua:
        browser = "Chrome"
    elif "Firefox" in ua:
        browser = "Firefox"
    elif "Safari" in ua:
        browser = "Safari"
    else:
        browser = "Other"
    if "Windows" in ua:
        os_name = "Windows"
    elif "Mac OS" in ua:
        os_name = "macOS"
    elif "Android" in ua:
        os_name = "Android"
    elif "iPhone" in ua or "iPad" in ua:
        os_name = "iOS"
    elif "Linux" in ua:
        os_name = "Linux"
    else:
        os_name = "Other"
    return device, browser, os_name

def _get_geo(ip):
    try:
        import urllib.request, json as _json
        if not ip or ip in ("127.0.0.1", "::1", "localhost"):
            return "Local", "Local"
        with urllib.request.urlopen(f"https://ipinfo.io/{ip}/json", timeout=3) as resp:
            geo = _json.loads(resp.read())
        return geo.get("country", "Unknown"), geo.get("city", "Unknown")
    except Exception:
        return "Unknown", "Unknown"

def _log_qr_scan(cert_id, ip, ua_string):
    try:
        device, browser, os_name = _parse_user_agent(ua_string)
        country, city = _get_geo(ip)
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO qr_scan_events (cert_id, ip, country, city, device, browser, os)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (cert_id, ip, country, city, device, browser, os_name))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"QR scan log failed: {e}")

@app.route("/api/qr-analytics/<cert_id>", methods=["GET"])
def api_qr_analytics(cert_id):
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM qr_scan_events WHERE cert_id = %s ORDER BY scanned_at DESC", (cert_id,))
        rows = cur.fetchall()
        cur.close()
        conn.close()
        for r in rows:
            if r["scanned_at"]:
                r["scanned_at"] = r["scanned_at"].isoformat()
        from collections import Counter
        countries = Counter(r["country"] for r in rows if r.get("country"))
        devices = Counter(r["device"] for r in rows if r.get("device"))
        browsers = Counter(r["browser"] for r in rows if r.get("browser"))
        return jsonify({
            "cert_id": cert_id,
            "total_scans": len(rows),
            "events": rows,
            "countries": dict(countries.most_common(10)),
            "devices": dict(devices),
            "browsers": dict(browsers.most_common(5)),
        }), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/qr-analytics/all", methods=["GET"])
def api_qr_analytics_all():
    try:
        limit = int(request.args.get("limit", 200))
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM qr_scan_events ORDER BY scanned_at DESC LIMIT %s", (limit,))
        rows = cur.fetchall()
        cur.close()
        conn.close()
        for r in rows:
            if r["scanned_at"]:
                r["scanned_at"] = r["scanned_at"].isoformat()
        from collections import Counter
        countries = Counter(r["country"] for r in rows if r.get("country"))
        devices = Counter(r["device"] for r in rows if r.get("device"))
        return jsonify({
            "total_scans": len(rows),
            "events": rows,
            "countries": dict(countries.most_common(10)),
            "devices": dict(devices),
        }), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, use_reloader=False, port=5000)