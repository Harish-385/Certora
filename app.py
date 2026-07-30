from flask import Flask, request, jsonify, send_file, render_template_string
from flask_cors import CORS
import pandas as pd
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
# Enable CORS for all routes so the React frontend can talk to us
CORS(app)
app.secret_key = "super_secret_certificate_key_for_flashing_messages"

# ── PostgreSQL Database Setup ───────────────────────────────────────────────
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "email_generation")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")

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


# Run database initialization
init_db()


UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# File that persists "Sent" statuses across Flask restarts
STATUS_FILE = os.path.join(UPLOAD_FOLDER, "sent_status.json")

# In-memory store for background ZIP generation tasks
zip_tasks = {}
# In-memory store for background email tasks
email_tasks = {}

students_data = []
qr_position = "center-bottom"
text_fields_config = [
    {"key": "Name", "x_percent": 50.0, "y_percent": 50.0, "font_size": 60, "align": "center", "color": "#000000"}
]

# ── Persistence helpers ──────────────────────────────────────────────────────

def _student_key(student):
    """Unique key for a student based on Name + Email (same hash used for cert ID)."""
    name = str(student.get("Name", "")).strip()
    email = str(student.get("Email", "")).strip()
    return hashlib.sha256(f"{name}{email}".encode()).hexdigest()[:10].upper()

def save_sent_statuses():
    """Write all 'Sent' student keys to disk so restarts don't lose progress."""
    try:
        statuses = {_student_key(s): "Sent" for s in students_data if s.get("Status") == "Sent"}
        with open(STATUS_FILE, "w") as f:
            json.dump(statuses, f)
    except Exception:
        pass  # never crash the app over a save failure

def load_and_apply_sent_statuses():
    """Restore 'Sent' statuses from disk onto the current students_data."""
    if not os.path.exists(STATUS_FILE):
        return
    try:
        with open(STATUS_FILE, "r") as f:
            statuses = json.load(f)
        for student in students_data:
            if _student_key(student) in statuses:
                student["Status"] = "Sent"
    except Exception:
        pass



# ── SMTP helper ───────────────────────────────────────────────────────────────
def _make_smtp():
    # Use port 465 directly to perfectly circumvent standard firewall timeout drops,
    # enabling instantaneous connectivity.
    server = smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=15)
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

def generate_cert_image(student, template_path):
    name = student.get("Name", "Unknown Name")
    email = student.get("Email", "no-email@example.com")

    # Generate unique ID based on Name + Email
    unique_id = hashlib.sha256(f"{name}{email}".encode()).hexdigest()[:10].upper()

    with Image.open(template_path) as base_img:
        img = base_img.convert('RGB')
    
    draw = ImageDraw.Draw(img)
    width, height = img.size

    # Scale fonts relative to image width so "size 60" looks the same
    # regardless of template resolution. Baseline = 1000px wide.
    img_scale = width / 1000.0

    scaled_verify_size = max(10, int(25 * img_scale))
    try:
        verify_font = ImageFont.truetype("cambriab.ttf", scaled_verify_size)
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
            fnt = ImageFont.truetype("cambriab.ttf", scaled_font_size)
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
    # Scale QR code dynamically relative to the template width (8%)
    target_qr_width = max(55, int(width * 0.08))
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

@app.route("/api/upload", methods=["POST"])
def api_upload():
    global students_data
    file = request.files.get("file")
    user_id = request.form.get("user_id")
    if file:
        filename = file.filename.lower()
        if not (filename.endswith(".xlsx") or filename.endswith(".xls") or filename.endswith(".csv")):
            return jsonify({"error": "Unsupported file format. Please upload an Excel (.xlsx, .xls) or CSV (.csv) file."}), 400

        path = os.path.join(app.config["UPLOAD_FOLDER"], file.filename)
        file.save(path)
        try:
            if filename.endswith(".csv"):
                df = pd.read_csv(path)
            else:
                df = pd.read_excel(path)

            # Fix missing records and duplication
            df = df.dropna(how='all')
            df = df.drop_duplicates()
            df = df.fillna('')

            students_data = df.to_dict(orient="records")
            # add default status if missing
            for s in students_data:
                if "Status" not in s:
                    s["Status"] = "Pending"
            # Restore any previously saved "Sent" statuses so re-uploads
            # don't wipe out progress made before a restart.
            load_and_apply_sent_statuses()
            
            log_audit_event(user_id, "Excel Uploaded", f"Successfully uploaded spreadsheet '{file.filename}' containing {len(students_data)} records.")
            return jsonify({"message": "File uploaded successfully", "students": students_data})
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
        return jsonify({"message": "Text fields config updated", "fields": text_fields_config})
    return jsonify({"fields": text_fields_config})


@app.route("/verify/<unique_id>", methods=["GET"])
def public_verify(unique_id):
    from datetime import datetime
    result = blockchain.verify_certificate_on_chain(unique_id)
    
    # Build a beautiful mobile-friendly verification page
    VERIFY_PAGE = '''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Certificate Verification</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap" rel="stylesheet"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', sans-serif;
      background: #0F172A;
      color: #F1F5F9;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .card {
      background: #1E293B;
      border-radius: 1.25rem;
      padding: 2.5rem 2rem;
      max-width: 480px;
      width: 100%;
      text-align: center;
      border: 1px solid #334155;
      box-shadow: 0 25px 50px rgba(0,0,0,0.5);
    }
    .icon { font-size: 5rem; margin-bottom: 1rem; }
    .title { font-size: 1.75rem; font-weight: 900; margin-bottom: 0.5rem; }
    .subtitle { color: #94A3B8; font-size: 0.95rem; margin-bottom: 2rem; }
    .info-row {
      background: #0F172A;
      border-radius: 0.75rem;
      padding: 1rem;
      margin-bottom: 0.75rem;
      text-align: left;
    }
    .info-label { font-size: 0.75rem; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem; }
    .info-value { font-size: 0.95rem; font-weight: 600; word-break: break-all; }
    .badge-valid { color: #10B981; }
    .badge-invalid { color: #EF4444; }
    .badge-error { color: #F59E0B; }
    .divider { border: none; border-top: 1px solid #334155; margin: 1.5rem 0; }
    .network-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: rgba(99,102,241,0.15);
      color: #818CF8;
      padding: 0.4rem 0.9rem;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 600;
      margin-top: 1rem;
    }
  </style>
</head>
<body>
  <div class="card">
    {% if error %}
      <div class="icon">⚠️</div>
      <div class="title badge-error">Verification Error</div>
      <div class="subtitle">Could not connect to blockchain or contract error.</div>
      <div class="info-row">
        <div class="info-label">Error Detail</div>
        <div class="info-value" style="color:#F87171;">{{ error }}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Certificate ID</div>
        <div class="info-value">{{ unique_id }}</div>
      </div>
    {% elif is_valid %}
      <div class="icon">✅</div>
      <div class="title badge-valid">Certificate Verified</div>
      <div class="subtitle">This certificate is authentic and permanently recorded on the blockchain.</div>
      <div class="info-row">
        <div class="info-label">Certificate ID</div>
        <div class="info-value">{{ unique_id }}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Issued On</div>
        <div class="info-value">{{ issued_date }}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Status</div>
        <div class="info-value badge-valid">● Active &amp; Valid</div>
      </div>
      <hr class="divider"/>
      <div class="network-badge">⬡ Ethereum Sepolia Testnet</div>
    {% else %}
      <div class="icon">❌</div>
      <div class="title badge-invalid">Not Found</div>
      <div class="subtitle">This certificate ID does not exist on the blockchain or has been revoked.</div>
      <div class="info-row">
        <div class="info-label">Certificate ID Scanned</div>
        <div class="info-value">{{ unique_id }}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Possible Reasons</div>
        <div class="info-value" style="color:#94A3B8; font-weight:400;">Certificate not yet issued, ID was tampered, or certificate was revoked.</div>
      </div>
      <hr class="divider"/>
      <div class="network-badge">⬡ Ethereum Sepolia Testnet</div>
    {% endif %}
  </div>
</body>
</html>'''

    error_msg = result.get("error")
    is_valid = result.get("isValid", False)
    timestamp = result.get("timestamp", 0)
    issued_date = datetime.utcfromtimestamp(timestamp).strftime('%d %B %Y, %H:%M UTC') if timestamp else "Unknown"
    
    return render_template_string(
        VERIFY_PAGE,
        error=error_msg,
        is_valid=is_valid,
        unique_id=unique_id,
        issued_date=issued_date
    )

@app.route("/api/dashboard", methods=["GET"])
def api_dashboard():
    total = len(students_data)
    winners_count = sum(1 for s in students_data if s.get("Category") == "Winner")
    participants_count = total - winners_count
    generated_count = sum(1 for s in students_data if s.get("Status") == "Generated")
    sent_count = sum(1 for s in students_data if s.get("Status") == "Sent")
    
    return jsonify({
        "students": students_data,
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
            file.save(os.path.join(certs_dir, "winner.png"))
            return jsonify({"message": f"Winner template uploaded for {category}"})
        elif template_type == "participant":
            file.save(os.path.join(certs_dir, "participant.png"))
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
    if len(students_data) == 0:
        student = {
            "Name": "Sample Student",
            "Email": "sample@example.com",
            "Category": "Winner",
            "Register Number": "SAMPLE123"
        }
        category = "Winner"
    else:
        if student_id < 0 or student_id >= len(students_data):
            return jsonify({"error": "Student not found"}), 404
        student = students_data[student_id]
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
    
    output_stream = io.BytesIO()
    img.save(output_stream, format="PNG")
    output_stream.seek(0)
    
    return send_file(output_stream, mimetype="image/png", as_attachment=False)

@app.route("/api/generate_zip_start", methods=["POST"])
def api_generate_zip_start():
    if not students_data:
        return jsonify({"error": "No data to generate certificates"}), 400
        
    data = request.json or {}
    category_param = data.get("category", "events").strip().lower()
    
    certs_dir = os.path.join(app.root_path, "templates", "certificates", category_param)
    parent_certs_dir = os.path.join(app.root_path, "templates", "certificates")
    
    has_winner = any(s.get("Category") == "Winner" for s in students_data)
    has_participant = any(s.get("Category") != "Winner" for s in students_data)
    
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
    user_id = data.get("user_id")
    zip_tasks[task_id] = {
        "status": "processing",
        "progress": 0,
        "total": len(students_data),
        "file": None,
        "user_id": user_id
    }
    log_audit_event(user_id, "ZIP Generation Started", f"Triggered certificate zip generation for {len(students_data)} students under category '{category_param}'.")

    def generate_background(task_id):
        zip_path = os.path.join(app.config['UPLOAD_FOLDER'], f"cert_{task_id}.zip")
        try:
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                
                # We use ThreadPoolExecutor to generate images in parallel!
                def generate_single_cert(item):
                    student_id, student = item
                    category = student.get("Category", "Participant")
                    name = student.get("Name", "Unknown_Name")
                    
                    t_path = resolve_template_path(certs_dir, parent_certs_dir, "winner.png" if category == "Winner" else "participant.png")
                    if t_path and os.path.exists(t_path):
                        img = generate_cert_image(student, t_path)
                        img_byte_arr = io.BytesIO()
                        img.save(img_byte_arr, format='PNG')
                        return {
                            "success": True,
                            "student_id": student_id,
                            "student": student,
                            "category": category,
                            "name": name,
                            "data": img_byte_arr.getvalue()
                        }
                    return {"success": False}

                lock = threading.Lock()
                with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
                    futures = [executor.submit(generate_single_cert, item) for item in enumerate(students_data)]
                    
                    for count, future in enumerate(concurrent.futures.as_completed(futures), 1):
                        res = future.result()
                        if res["success"]:
                            safe_name = "".join([c for c in res["name"] if c.isalpha() or c.isdigit() or c==' ']).rstrip()
                            file_name = f"{res['category']}_{safe_name}_{res['student_id']}.png"
                            
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

@app.route("/api/send_emails_start", methods=["POST"])
def api_send_emails_start():
    if not students_data:
        return jsonify({"error": "No data to process"}), 400

    data = request.json or {}
    sender_email = _normalize_email(data.get("sender_email"))
    app_password = _normalize_email(data.get("app_password"))
    user_id = data.get("user_id")

    if not sender_email or not app_password:
        return jsonify({"error": "Email credentials missing"}), 400

    category_param = data.get("category", "events").strip().lower()
    certs_dir = os.path.join(app.root_path, "templates", "certificates", category_param)
    parent_certs_dir = os.path.join(app.root_path, "templates", "certificates")
    
    winner_path = resolve_template_path(certs_dir, parent_certs_dir, "winner.png")
    participant_path = resolve_template_path(certs_dir, parent_certs_dir, "participant.png")

    task_id = str(uuid.uuid4())
    
    # Pre-filter valid students
    valid_students = [
        s for s in students_data 
        if s.get("Status") != "Sent" and "@" in _normalize_email(s.get("Email"))
    ]
    
    email_tasks[task_id] = {
        "status": "processing",
        "sent": 0,
        "total": len(valid_students),
        "failed_count": 0,
        "failed": [],
        "message": "",
        "error": None
    }
    log_audit_event(user_id, "Emails Batch Started", f"Triggered certificate email delivery to {len(valid_students)} students under category '{category_param}'.")

    if len(valid_students) == 0:
        email_tasks[task_id]["status"] = "completed"
        email_tasks[task_id]["message"] = "✅ All valid students have already been emailed."
        return jsonify({"task_id": task_id})

    # Test login first to fail fast
    try:
        server = _make_smtp()
        server.login(sender_email, app_password)
        server.quit()
    except smtplib.SMTPAuthenticationError as e:
        smtp_error = getattr(e, 'smtp_error', None)
        err_text = smtp_error.decode(errors='ignore') if isinstance(smtp_error, (bytes, bytearray)) else str(e)
        return jsonify({"error": f"SMTP authentication failed: {err_text}"}), 500
    except Exception as e:
        return jsonify({"error": f"SMTP connection failed: {str(e)}"}), 500

    def email_worker(task_id):
        success_count = 0
        failed_list = []

        try:
            server = _make_smtp()
            server.login(sender_email, app_password)
        except smtplib.SMTPAuthenticationError as e:
            smtp_error = getattr(e, 'smtp_error', None)
            err_text = smtp_error.decode(errors='ignore') if isinstance(smtp_error, (bytes, bytearray)) else str(e)
            email_tasks[task_id]["status"] = "error"
            email_tasks[task_id]["message"] = f"SMTP Login Failed: {err_text}"
            email_tasks[task_id]["error"] = err_text
            return
        except Exception as e:
            err_text = str(e)
            email_tasks[task_id]["status"] = "error"
            email_tasks[task_id]["message"] = f"SMTP Login Failed: {err_text}"
            email_tasks[task_id]["error"] = err_text
            return

        for student in valid_students:
            name = student.get("Name", "Unknown")
            email = _normalize_email(student.get("Email"))
            category = student.get("Category", "Participant")
            template_path = winner_path if category == "Winner" else participant_path

            if not email or "@" not in email:
                err_msg = "Invalid email address"
                failed_list.append({"name": name, "email": student.get("Email"), "error": err_msg})
                email_tasks[task_id]["failed_count"] = len(failed_list)
                email_tasks[task_id]["failed"] = failed_list
                email_tasks[task_id]["message"] = f"⛔ {len(failed_list)} recipients failed so far."
                continue

            if not os.path.exists(template_path):
                err_msg = f"Missing certificate template: {template_path}"
                failed_list.append({"name": name, "email": email, "error": err_msg})
                email_tasks[task_id]["failed_count"] = len(failed_list)
                email_tasks[task_id]["failed"] = failed_list
                email_tasks[task_id]["message"] = f"⛔ {len(failed_list)} recipients failed so far."
                continue

            try:
                # 🎨 Generate certificate
                img = generate_cert_image(student, template_path)
                img_byte_arr = io.BytesIO()
                img.save(img_byte_arr, format='PNG')
                img_data = img_byte_arr.getvalue()

                # 📧 Email setup
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
                msg.add_attachment(
                    img_data, maintype='image', subtype='png', filename=f"{safe_name}.png"
                )

                # Send directly
                server.send_message(msg)

                student["Status"] = "Sent"
                success_count += 1
                email_tasks[task_id]["sent"] = success_count
                email_tasks[task_id]["message"] = f"✅ Sent {success_count}. {len(failed_list)} failed so far."
                increment_stat("emails_generated")
                increment_stat("emails_sent")
                if user_id:
                    increment_user_stat(user_id, "emails_generated")
                    increment_user_stat(user_id, "emails_sent")

                # Pace sending 1.5 seconds so Google doesn't trigger bot limits
                time.sleep(1.5)

            except Exception as e:
                err_msg = str(e)
                failed_list.append({"name": name, "email": email, "error": err_msg})
                email_tasks[task_id]["failed_count"] = len(failed_list)
                email_tasks[task_id]["failed"] = failed_list
                email_tasks[task_id]["message"] = f"⛔ Sent {success_count}. {len(failed_list)} failed so far."
                
                # Auto-reconnection logic if disconnected
                try:
                    server.quit()
                except: pass
                
                time.sleep(2)
                try:
                    server = _make_smtp()
                    server.login(sender_email, app_password)
                except Exception:
                    pass
                
                if "550" in err_msg and "Daily user sending limit" in err_msg:
                    break

            if success_count % 10 == 0:
                save_sent_statuses()

        try:
            server.quit()
        except: pass

        save_sent_statuses()
        email_tasks[task_id]["status"] = "completed"
        email_tasks[task_id]["failed"] = failed_list
        email_tasks[task_id]["message"] = f"✅ Sent {success_count} emails. {len(failed_list)} failed."
        log_audit_event(user_id, "Emails Batch Completed", f"Successfully dispatched {success_count} emails, {len(failed_list)} failed under category '{category_param}'.")

    threading.Thread(target=email_worker, args=(task_id,), daemon=True).start()
    return jsonify({"message": "Background task started", "task_id": task_id})

@app.route("/api/send_emails_progress/<task_id>")
def api_send_emails_progress(task_id):
    task = email_tasks.get(task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    return jsonify(task)

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
        
        # Check if register number or email already exists
        cur.execute("SELECT id FROM users WHERE register_number = %s OR email = %s", (register_number, email))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"error": "Register number or email already registered"}), 400

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
        cur.execute("SELECT id, register_number, email, password_hash, role, is_active FROM users WHERE email = %s", (email,))
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
        sender_email = "harish9123456@gmail.com"
        app_password = "ighc wzao pksm taug"
        
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

if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, use_reloader=False, port=5000)