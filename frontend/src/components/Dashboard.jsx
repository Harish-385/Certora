import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';
import { DownloadCloud, Loader, Mail, RefreshCw } from './SvgIcons';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

const PAGE_SIZE = 10;

/* ─── Tracking Status Badge (Item 6) ────────────────────────────────────────── */
const STATUS_STYLES = {
  Queued:    { bg: 'rgba(245,158,11,0.12)',  color: '#b45309', border: 'rgba(245,158,11,0.3)',  label: '⏳ Queued' },
  Delivered: { bg: 'rgba(59,130,246,0.12)',  color: '#1d4ed8', border: 'rgba(59,130,246,0.3)',  label: '📬 Delivered' },
  Opened:    { bg: 'rgba(16,185,129,0.12)',  color: '#065f46', border: 'rgba(16,185,129,0.3)',  label: '👁 Opened' },
  Downloaded:{ bg: 'rgba(139,92,246,0.12)', color: '#5b21b6', border: 'rgba(139,92,246,0.3)', label: '⬇ Downloaded' },
  Clicked:   { bg: 'rgba(249,115,22,0.12)',  color: '#c2410c', border: 'rgba(249,115,22,0.3)',  label: '🖱 Clicked' },
  Verify:    { bg: 'rgba(20,184,166,0.12)',  color: '#0f766e', border: 'rgba(20,184,166,0.3)',  label: '✅ Verified' },
  Pending:   { bg: 'rgba(107,114,128,0.1)',  color: '#4b5563', border: 'rgba(107,114,128,0.2)', label: 'Pending' },
  Generated: { bg: 'rgba(16,185,129,0.1)',   color: '#059669', border: 'rgba(16,185,129,0.25)', label: '⚙ Generated' },
  Sent:      { bg: 'rgba(59,130,246,0.1)',   color: '#2563eb', border: 'rgba(59,130,246,0.25)', label: '📨 Sent' },
};
function TrackingStatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.Pending;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
      padding: '0.2rem 0.6rem', borderRadius: '1rem',
      background: s.bg, color: s.color,
      border: `1px solid ${s.border}`,
      fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap',
    }}>{s.label}</span>
  );
}

/* ─── Email Analytics Modal (Item 6) ────────────────────────────────────────── */
function EmailAnalyticsModal({ open, onClose, userId }) {
  const [analytics, setAnalytics] = useState(null);
  const [records, setRecords] = useState([]);
  const backdropRef = useRef(null);

  const fetchAnalytics = () => {
    const url = userId
      ? `http://${window.location.hostname}:5000/api/email_analytics?user_id=${userId}`
      : `http://${window.location.hostname}:5000/api/email_analytics`;
    axios.get(url).then(res => {
      setAnalytics(res.data);
      setRecords(res.data.records || []);
    }).catch(() => {});
  };

  useEffect(() => {
    if (!open) return;
    fetchAnalytics();
    const iv = setInterval(fetchAnalytics, 10000);
    return () => clearInterval(iv);
  }, [open, userId]);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const rates = analytics ? [
    { label: 'Delivery Rate', value: analytics.delivery_rate, color: '#3B82F6', icon: '📬' },
    { label: 'Open Rate',     value: analytics.open_rate,     color: '#10B981', icon: '👁' },
    { label: 'Bounce Rate',   value: analytics.bounce_rate,   color: '#EF4444', icon: '↩' },
    { label: 'Spam Rate',     value: analytics.spam_rate,     color: '#F59E0B', icon: '⚠️' },
  ] : [];

  return (
    <div
      ref={backdropRef}
      onClick={e => { if (e.target === backdropRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(10,14,20,0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem',
        animation: 'fadeIn 0.15s ease'
      }}
    >
      <div style={{
        width: '96vw', maxWidth: '1100px',
        maxHeight: '90vh',
        background: 'var(--surface)',
        borderRadius: '1.25rem',
        boxShadow: '0 40px 100px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.08)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        animation: 'slideUpModal 0.22s cubic-bezier(0.34,1.56,0.64,1)'
      }}>

        {/* ── Modal Header ── */}
        <div style={{
          padding: '1.1rem 1.75rem',
          background: 'linear-gradient(135deg, #0f2027 0%, #1a3040 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.07)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '0.65rem', background: 'linear-gradient(135deg,#3B82F6,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0, boxShadow: '0 4px 12px rgba(59,130,246,0.35)' }}>📊</div>
            <div>
              <h2 style={{ margin: 0, color: '#f1f5f9', fontSize: '1.15rem', fontWeight: 800 }}>Email Tracking Analytics</h2>
              <p style={{ margin: 0, color: 'rgba(255,255,255,0.45)', fontSize: '0.75rem', marginTop: '0.1rem' }}>
                {analytics ? `${analytics.total} emails tracked · ${analytics.delivered} delivered · ${analytics.opened} opened` : 'Loading…'}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={fetchAnalytics}
              title="Refresh"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', width: '34px', height: '34px', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.16)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            >↻</button>
            <button
              onClick={onClose}
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', width: '34px', height: '34px', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.35)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            >✕</button>
          </div>
        </div>

        {/* ── Modal Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.75rem' }}>
          {!analytics ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading analytics…</div>
          ) : analytics.total === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>📭</div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.05rem' }}>No emails tracked yet</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.35rem' }}>Send some certificates first to see tracking data here.</div>
            </div>
          ) : (
            <>
              {/* Rate Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                {rates.map(r => (
                  <div key={r.label} style={{
                    background: 'var(--bg-color)', border: '1px solid var(--border)',
                    borderRadius: '1rem', padding: '1.25rem 1.1rem',
                    position: 'relative', overflow: 'hidden',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                    transition: 'transform 0.15s, box-shadow 0.15s'
                  }}
                    onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 8px 24px rgba(0,0,0,0.1)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.06)'; }}
                  >
                    <div style={{ position: 'absolute', top: '0.85rem', right: '0.9rem', fontSize: '1.6rem', opacity: 0.4 }}>{r.icon}</div>
                    <div style={{ fontSize: '2.2rem', fontWeight: 900, color: r.color, lineHeight: 1 }}>{r.value}%</div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginTop: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.label}</div>
                    <div style={{ marginTop: '0.6rem', height: '5px', background: 'var(--border)', borderRadius: '9999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, r.value)}%`, background: r.color, borderRadius: '9999px', transition: 'width 1s ease' }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Records Table */}
              {records.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: '0.85rem' }}>📋 Tracking Records</div>
                  <div style={{ overflowX: 'auto', borderRadius: '0.75rem', border: '1px solid var(--border)', overflow: 'hidden' }}>
                    <table style={{ margin: 0 }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-color)' }}>
                          <th>Name</th><th>Email</th><th>Status</th><th>Sent</th><th>Opened</th><th>Clicked</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map(r => (
                          <tr key={r.id}>
                            <td style={{ fontWeight: 600 }}>{r.student_name || '—'}</td>
                            <td style={{ fontSize: '0.8rem' }}>{r.student_email || '—'}</td>
                            <td><TrackingStatusBadge status={r.status} /></td>
                            <td style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{r.delivered_at ? new Date(r.delivered_at).toLocaleString() : '—'}</td>
                            <td style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{r.opened_at ? new Date(r.opened_at).toLocaleString() : '—'}</td>
                            <td style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{r.clicked_at ? new Date(r.clicked_at).toLocaleString() : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Modal Footer ── */}
        <div style={{ padding: '0.9rem 1.75rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', background: 'var(--bg-color)', flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{ background: 'linear-gradient(135deg,#1d2627,#2f3839)', color: '#d1d5db', border: 'none', padding: '0.6rem 1.75rem', borderRadius: '0.6rem', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 700 }}
            onMouseEnter={e => e.currentTarget.style.opacity='0.88'}
            onMouseLeave={e => e.currentTarget.style.opacity='1'}
          >Close</button>
        </div>
      </div>

      <style>{`
        @keyframes slideUpModal {
          from { transform: translateY(24px) scale(0.97); opacity: 0; }
          to   { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/* ─── Email Composer Modal ─────────────────────────────────────────────────── */
function EmailComposerModal({ open, onClose, subject, setSubject, body, setBody }) {
  const backdropRef = useRef(null);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const placeholders = ['{Name}', '{Email}', '{Category}'];

  const insertPlaceholder = (ph) => {
    if (bodyRef.current) {
      const el = bodyRef.current;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const newVal = body.slice(0, start) + ph + body.slice(end);
      setBody(newVal);
      setTimeout(() => { el.focus(); el.setSelectionRange(start + ph.length, start + ph.length); }, 0);
    } else {
      setBody(prev => prev + ph);
    }
  };

  const previewBody = body
    .replace(/\{Name\}/g, 'John Smith')
    .replace(/\{Email\}/g, 'john@college.edu')
    .replace(/\{Category\}/g, 'Winner');

  return (
    <div
      ref={backdropRef}
      onClick={e => { if (e.target === backdropRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(10, 14, 20, 0.78)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem',
        animation: 'fadeIn 0.15s ease'
      }}
    >
      <div style={{
        width: '95vw', maxWidth: '1160px',
        height: '92vh',
        background: 'var(--surface)',
        borderRadius: '1.25rem',
        boxShadow: '0 40px 100px rgba(0,0,0,0.4), 0 0 0 1px rgba(0,0,0,0.06)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        animation: 'slideUpModal 0.22s cubic-bezier(0.34,1.56,0.64,1)'
      }}>
        {/* ── Modal Header ─────────────────────────────────────────────── */}
        <div style={{
          padding: '1.1rem 1.75rem',
          background: 'linear-gradient(135deg, #1d2627 0%, #2f3839 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '0.6rem', background: 'linear-gradient(135deg,#c8a07a,#e0bc96)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>✉️</div>
            <div>
              <h2 style={{ margin: 0, color: '#888888', fontSize: '1.1rem', fontWeight: 800 }}>Compose Email Template</h2>
              <p style={{ margin: 0, color: '#888888', fontSize: '0.75rem' }}>Customize subject & body — certificate is attached automatically</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#888888', width: '34px', height: '34px', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          >✕</button>
        </div>

        {/* ── Two-Column Body ───────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden', minHeight: 0 }}>

          {/* LEFT: Composer */}
          <div style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem', gap: '1rem', overflowY: 'auto', borderRight: '1px solid #f0f0f0' }}>
            {/* Placeholders */}
            <div style={{ background: 'linear-gradient(135deg,#eff6ff,#f0fdf4)', border: '1px solid #bfdbfe', borderRadius: '0.65rem', padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.77rem', fontWeight: 700, color: '#1d4ed8', marginBottom: '0.45rem' }}>💡 Click a placeholder to insert into body</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                {placeholders.map(ph => (
                  <code key={ph} onClick={() => insertPlaceholder(ph)} style={{ background: '#dbeafe', color: '#1d4ed8', padding: '0.18rem 0.5rem', borderRadius: '0.35rem', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', border: '1px solid #93c5fd', userSelect: 'none' }} title={`Insert ${ph}`}>{ph}</code>
                ))}
                <span style={{ fontSize: '0.72rem', color: '#888888' }}>+ any Excel column in {'{}'}</span>
              </div>
            </div>

            {/* Subject */}
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#888888', marginBottom: '0.4rem' }}>📌 Subject</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Congratulations! Here is your Certificate 🎉"
                style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem 0.9rem', borderRadius: '0.6rem', border: '2px solid #e5e7eb', background: '#fafafa', fontSize: '0.9rem', color: '#888888', fontWeight: 600, outline: 'none' }}
                onFocus={e => e.target.style.borderColor = '#c8a07a'}
                onBlur={e => e.target.style.borderColor = '#e5e7eb'}
              />
            </div>

            {/* Body */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#888888' }}>📝 Body</label>
                <span style={{ fontSize: '0.7rem', color: '#888888' }}>{body.length} chars</span>
              </div>
              <textarea
                ref={bodyRef}
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Write your email body here..."
                style={{ flex: 1, width: '100%', boxSizing: 'border-box', padding: '0.85rem', borderRadius: '0.6rem', border: '2px solid #e5e7eb', background: '#fafafa', fontSize: '0.88rem', color: '#888888', lineHeight: 1.65, fontFamily: "'Inter','Segoe UI',sans-serif", resize: 'none', outline: 'none', minHeight: '260px' }}
                onFocus={e => e.target.style.borderColor = '#c8a07a'}
                onBlur={e => e.target.style.borderColor = '#e5e7eb'}
              />
            </div>
          </div>

          {/* RIGHT: Live Preview */}
          <div style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem', gap: '1rem', overflowY: 'auto', background: 'var(--bg-color)' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#888888' }}>
              👁 Live Preview — sample data
            </div>

            {/* Email envelope mock */}
            <div style={{ background: 'var(--surface)', borderRadius: '0.75rem', border: '1px solid var(--border)', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              {/* Email header bar */}
              <div style={{ background: 'linear-gradient(135deg,#1d2627,#2f3839)', padding: '0.75rem 1rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.2rem' }}>To: John Smith &lt;john@college.edu&gt;</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#888888' }}>{subject || '(no subject)'}</div>
              </div>
              {/* Body content */}
              <div style={{ flex: 1, padding: '1.25rem', overflowY: 'auto' }}>
                <div style={{ fontSize: '0.85rem', color: '#888888', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                  {previewBody || <span style={{ color: '#d1d5db', fontStyle: 'italic' }}>Start typing to see preview…</span>}
                </div>
              </div>
              {/* Attachment mock */}
              <div style={{ borderTop: '1px solid #f0f0f0', padding: '0.65rem 1rem', display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'var(--bg-color)' }}>
                <span style={{ fontSize: '1.1rem' }}>📎</span>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#888888' }}>John_Smith.png</div>
                  <div style={{ fontSize: '0.68rem', color: '#888888' }}>Certificate · auto-generated</div>
                </div>
              </div>
            </div>

            {/* Tips */}
            <div style={{ background: 'var(--surface)', borderRadius: '0.65rem', border: '1px solid var(--border)', padding: '0.85rem 1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#888888', marginBottom: '0.4rem' }}>📋 What gets sent</div>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.77rem', color: '#888888', lineHeight: 1.8 }}>
                <li>The email above with your custom subject & body</li>
                <li>Each recipient's certificate auto-attached as PNG</li>
                <li><code style={{ fontSize: '0.73rem', background: 'var(--surface-hover)', padding: '0.1rem 0.3rem', borderRadius: '0.25rem' }}>{'{Name}'}</code> etc. replaced per recipient</li>
              </ul>
            </div>
          </div>
        </div>

        {/* ── Modal Footer ──────────────────────────────────────────────── */}
        <div style={{ padding: '1rem 1.75rem', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa', flexShrink: 0 }}>
          <button onClick={() => { setSubject('Congratulations! Here is your Certificate 🎉'); setBody('Dear {Name},\n\nPlease find attached your hard-earned certificate.\n\nBest regards,\nCertora Team'); }}
            style={{ background: 'transparent', border: '1px solid #d1d5db', color: '#888888', padding: '0.6rem 1.1rem', borderRadius: '0.55rem', cursor: 'pointer', fontSize: '0.83rem', fontWeight: 600 }}
            onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#374151'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6b7280'; }}
          >↺ Reset</button>
          <button onClick={onClose}
            style={{ background: 'linear-gradient(135deg,#1d2627,#2f3839)', color: '#888888', border: 'none', padding: '0.65rem 2rem', borderRadius: '0.6rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 700, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >✓ Save & Close</button>
        </div>
      </div>

      <style>{`
        @keyframes slideUpModal {
          from { transform: translateY(20px) scale(0.97); opacity: 0; }
          to   { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/* ─── Main Dashboard ───────────────────────────────────────────────────────── */
export default function Dashboard({ active = true }) {
  const [data, setData] = useState({ students: [], stats: {} });
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [zipProgress, setZipProgress] = useState(null);

  const [emailAccounts, setEmailAccounts] = useState([{ email: 'harish9123456@gmail.com', password: 'wyrb fxdp mufh yaah', testStatus: null }]);
  const [emailSubject, setEmailSubject] = useState(() => localStorage.getItem('cert_email_subject') || 'Congratulations! Here is your Certificate 🎉');
  const [emailBody, setEmailBody] = useState(() => localStorage.getItem('cert_email_body') || 'Dear {Name},\n\nPlease find attached your hard-earned certificate for your active participation and victory.\n\nBest regards,\nCertora Team');
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailProgress, setEmailProgress] = useState(null);
  const [message, setMessage] = useState('');
  const [testRunLoading, setTestRunLoading] = useState(false);
  const [testRunStatus, setTestRunStatus] = useState(null);

  const [downloadFormat, setDownloadFormat] = useState('png');
  const [downloadOrientation, setDownloadOrientation] = useState('landscape');

  const [activeTasks, setActiveTasks] = useState([]);
  const [dismissedTaskIds, setDismissedTaskIds] = useState([]);
  const [refreshingTasks, setRefreshingTasks] = useState(false);

  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleType, setScheduleType] = useState('tomorrow');

  const getTomorrow9AM = () => {
    const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(9, 0, 0, 0);
    return (new Date(t - t.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
  };

  const [scheduleTime, setScheduleTime] = useState(getTomorrow9AM());
  const [scheduleTimezone, setScheduleTimezone] = useState('Asia/Kolkata');
  const now = new Date();
  const [schedDay, setSchedDay] = useState(now.getDate());
  const [schedMonth, setSchedMonth] = useState(now.getMonth() + 1);
  const [schedYear, setSchedYear] = useState(now.getFullYear());
  const [schedHour, setSchedHour] = useState(now.getHours() % 12 || 12);
  const [schedMin, setSchedMin] = useState(Math.ceil(now.getMinutes() / 5) * 5 % 60);
  const [schedPeriod, setSchedPeriod] = useState(now.getHours() >= 12 ? 'PM' : 'AM');

  useEffect(() => {
    if (scheduleType === 'custom') {
      const h24 = schedPeriod === 'PM' ? (schedHour === 12 ? 12 : schedHour + 12) : (schedHour === 12 ? 0 : schedHour);
      const date = new Date(schedYear, schedMonth - 1, schedDay, h24, schedMin, 0);
      setScheduleTime((new Date(date - date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16));
    }
  }, [schedDay, schedMonth, schedYear, schedHour, schedMin, schedPeriod, scheduleType]);

  const [currentPage, setCurrentPage] = useState(1);
  const [scheduledJobs, setScheduledJobs] = useState([]);

  const fetchScheduledJobs = async () => {
    try {
      const res = await axios.get(`http://${window.location.hostname}:5000/api/schedule_emails/list`);
      setScheduledJobs(res.data.jobs || []);
    } catch (err) { console.error(err); }
  };

  const handleCancelJob = async (jobId) => {
    if (!window.confirm('Cancel this scheduled batch?')) return;
    try {
      await axios.delete(`http://${window.location.hostname}:5000/api/schedule_emails/cancel/${jobId}`);
      fetchScheduledJobs();
      setMessage('✅ Scheduled job cancelled.');
    } catch (err) { alert(err.response?.data?.error || err.message); }
  };

  const fetchData = async () => {
    try {
      const cat  = localStorage.getItem('cert_category') || 'events';
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const uid  = user.id ?? '';
      const res  = await axios.get(`http://${window.location.hostname}:5000/api/dashboard?category=${cat}&user_id=${uid}&_=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
      setData(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const fetchActiveTasks = async () => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (user.id === undefined || user.id === null || user.id === '') return;
      const res = await axios.get(`http://${window.location.hostname}:5000/api/active_email_tasks/${user.id}`);
      setActiveTasks(res.data || []);
      // If we find an active task, we can sync it with emailProgress if it's the one we just started,
      // but rendering activeTasks separately is cleaner.
    } catch (err) { console.error(err); }
  };

  const handleRefreshTasks = async () => {
    setRefreshingTasks(true);
    try { await Promise.all([fetchActiveTasks(), fetchData()]); }
    finally { setTimeout(() => setRefreshingTasks(false), 400); }
  };

  const handleDismissTask = (taskId) => {
    setDismissedTaskIds(prev => [...prev, taskId]);
  };

  useEffect(() => {
    if (!active) return;
    fetchData();
    fetchScheduledJobs();
    fetchActiveTasks();
    const interval = setInterval(() => {
      fetchActiveTasks();
    }, 3000);
    return () => clearInterval(interval);
  }, [active]);

  // Re-fetch immediately whenever Excel is uploaded from the Upload tab,
  // even if this component is currently hidden (active=false / display:none).
  useEffect(() => {
    const handleExcelUpload = () => {
      fetchData();
    };
    window.addEventListener('excel_uploaded', handleExcelUpload);
    return () => window.removeEventListener('excel_uploaded', handleExcelUpload);
  }, []);

  const addAccount    = () => setEmailAccounts(p => [...p, { email: '', password: '', testStatus: null }]);
  const removeAccount = i  => setEmailAccounts(p => p.filter((_, j) => j !== i));
  const updateAccount = (i, f, v) => setEmailAccounts(p => p.map((a, j) => j === i ? { ...a, [f]: v, testStatus: null } : a));

  const testAccount = async (idx) => {
    const acc = emailAccounts[idx];
    if (!acc.email.trim() || !acc.password.trim()) {
      setEmailAccounts(p => p.map((a, j) => j === idx ? { ...a, testStatus: { ok: false, msg: 'Enter email and password first' } } : a));
      return;
    }
    setEmailAccounts(p => p.map((a, j) => j === idx ? { ...a, testStatus: { ok: null, msg: 'Testing…' } } : a));
    try {
      const res = await axios.post(`http://${window.location.hostname}:5000/api/test_smtp`, { email: acc.email, password: acc.password });
      setEmailAccounts(p => p.map((a, j) => j === idx ? { ...a, testStatus: { ok: true, msg: res.data.message } } : a));
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message;
      setEmailAccounts(p => p.map((a, j) => j === idx ? { ...a, testStatus: { ok: false, msg: errMsg } } : a));
    }
  };

  const handleTestRun = async () => {
    const acc = emailAccounts.find(a => a.email.trim() && a.password.trim());
    if (!acc) {
      setTestRunStatus({ ok: false, msg: 'Enter a Sender Account email and password first' });
      return;
    }
    setTestRunLoading(true); setTestRunStatus(null);
    try {
      const res = await axios.post(`http://${window.location.hostname}:5000/api/test_run`, { email: acc.email, password: acc.password, email_subject: emailSubject, email_body: emailBody });
      setTestRunStatus({ ok: true, msg: res.data.message });
    } catch (err) {
      setTestRunStatus({ ok: false, msg: err.response?.data?.error || err.message });
    } finally {
      setTestRunLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true); setZipProgress(null);
    try {
      const cat  = localStorage.getItem('cert_category') || 'events';
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const sr   = await axios.post(`http://${window.location.hostname}:5000/api/generate_zip_start`, { category: cat, user_id: user.id, format: downloadFormat, orientation: downloadOrientation });
      const tid  = sr.data.task_id;
      while (true) {
        const pr = await axios.get(`http://${window.location.hostname}:5000/api/generate_zip_progress/${tid}`);
        if (pr.data.error) throw new Error(pr.data.error);
        if (pr.data.status === 'completed') { setZipProgress(null); break; }
        if (pr.data.status === 'error') throw new Error(pr.data.error);
        setZipProgress({ progress: pr.data.progress, total: pr.data.total });
        await new Promise(r => setTimeout(r, 1000));
      }
      const link = document.createElement('a'); link.href = `http://${window.location.hostname}:5000/api/download_zip/${tid}`; link.setAttribute('download', 'certificates.zip');
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      fetchData();
    } catch (err) { alert('Error: ' + (err.response?.data?.error || err.message)); }
    finally { setDownloading(false); setZipProgress(null); }
  };

  const handleSendEmails = async (e) => {
    e.preventDefault(); setSending(true); setMessage(''); setEmailProgress(null);
    try {
      const cat   = localStorage.getItem('cert_category') || 'events';
      const user  = JSON.parse(localStorage.getItem('user') || '{}');
      const valid = emailAccounts.filter(a => a.email.trim() && a.password.trim());
      if (!valid.length) { setMessage('⚠️ Add at least one sender account.'); setSending(false); return; }

      const payload = { email_accounts: valid, email_subject: emailSubject, email_body: emailBody, category: cat, user_id: user.id };

      if (isScheduled) {
        if (!scheduleTime) throw new Error('Please specify a schedule time.');
        const res = await axios.post(`http://${window.location.hostname}:5000/api/schedule_emails`, { ...payload, sender_email: valid[0].email, app_password: valid[0].password, schedule_time: new Date(scheduleTime).toISOString(), timezone: scheduleTimezone });
        setMessage('🎉 ' + res.data.message); setSending(false); fetchScheduledJobs(); return;
      }

      const sr = await axios.post(`http://${window.location.hostname}:5000/api/send_emails_start`, payload);
      const tid = sr.data.task_id;
      if (!tid) { setMessage(sr.data.message || 'Done'); setSending(false); fetchData(); return; }

      while (true) {
        const pr = await axios.get(`http://${window.location.hostname}:5000/api/send_emails_progress/${tid}`);
        if (pr.data.error) throw new Error(pr.data.error);
        if (pr.data.status === 'completed') { setEmailProgress(null); setMessage(pr.data.message); break; }
        if (pr.data.status === 'error') throw new Error(pr.data.error || 'Error');
        setEmailProgress({ sent: pr.data.sent, failed: pr.data.failed_count, total: pr.data.total });
        fetchData(); await new Promise(r => setTimeout(r, 1000));
      }
    } catch (err) { setMessage(err.response?.data?.error || err.message || 'Error sending emails'); }
    finally { setSending(false); setEmailProgress(null); fetchData(); }
  };

  if (loading) return <div>Loading dashboard...</div>;

  const totalPages  = Math.max(1, Math.ceil(data.students.length / PAGE_SIZE));
  const safePage    = Math.min(currentPage, totalPages);
  const pageStudents = data.students.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const pieData = {
    labels: ['Pending', 'Generated', 'Sent'],
    datasets: [{ data: [data.stats.total - data.stats.generated - (data.stats.sent || 0), data.stats.generated, data.stats.sent || 0], backgroundColor: ['#F59E0B', '#10B981', '#3B82F6'], borderWidth: 0 }]
  };
  const barData = {
    labels: ['Winners', 'Participants'],
    datasets: [{ label: 'Count', data: [data.stats.winners, data.stats.participants], backgroundColor: ['#8B5CF6', '#EC4899'], borderRadius: 4 }]
  };

  const selSt = { padding: '0 0.75rem', borderRadius: '0.5rem', background: 'var(--surface)', border: '1px solid #d1d5db', color: '#888888', fontWeight: 600, outline: 'none', height: '40px', cursor: 'pointer', fontSize: '0.85rem' };

  return (
    <>
      {/* Email Composer Modal */}
      <EmailComposerModal
        open={showEmailComposer}
        onClose={() => {
          localStorage.setItem('cert_email_subject', emailSubject);
          localStorage.setItem('cert_email_body', emailBody);
          setShowEmailComposer(false);
        }}
        subject={emailSubject} setSubject={setEmailSubject}
        body={emailBody}    setBody={setEmailBody}
      />

      {/* Email Analytics Modal */}
      <EmailAnalyticsModal
        open={showAnalytics}
        onClose={() => setShowAnalytics(false)}
        userId={JSON.parse(localStorage.getItem('user') || '{}').id}
      />

      <div>
        {/* Header Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ margin: 0 }}>Analytics Dashboard</h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {/* Email Analytics Popup Button */}
            <button
              onClick={() => setShowAnalytics(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.45rem',
                padding: '0.5rem 0.9rem', borderRadius: '0.5rem',
                background: 'linear-gradient(135deg,#3B82F6,#6366f1)',
                border: 'none', color: '#fff',
                fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                boxShadow: '0 3px 10px rgba(59,130,246,0.35)',
                transition: 'opacity 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >📊 Email Analytics</button>
            <select value={downloadFormat} onChange={e => setDownloadFormat(e.target.value)} style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', color: '#888888', fontWeight: 'bold' }}>
              <option value="png">PNG Format</option>
              <option value="pdf">PDF Format</option>
            </select>
            {downloadFormat === 'pdf' && (
              <select value={downloadOrientation} onChange={e => setDownloadOrientation(e.target.value)} style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', color: '#888888', fontWeight: 'bold' }}>
                <option value="landscape">Landscape (A4)</option>
                <option value="portrait">Portrait (A4)</option>
              </select>
            )}
            <button className="btn" onClick={handleDownload} disabled={downloading || data.students.length === 0} style={{ minWidth: '180px' }}>
              {downloading && !zipProgress ? <Loader className="spin" size={18} /> :
               downloading && zipProgress ? <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>{Math.round((zipProgress.progress / Math.max(1, zipProgress.total)) * 100)}%</span> :
               <DownloadCloud size={18} />}
              {downloading && zipProgress ? ' Generating...' : ' Bulk Download (ZIP)'}
            </button>
          </div>
        </div>

        {/* Live Active Tasks Widget */}
        {activeTasks.filter(t => !dismissedTaskIds.includes(t.task_id)).length > 0 && (
          <div style={{ marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleRefreshTasks}
                disabled={refreshingTasks}
                title="Refresh status"
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  color: 'var(--text-primary)', borderRadius: '0.5rem',
                  padding: '0.4rem 0.85rem', fontSize: '0.78rem', fontWeight: 700,
                  cursor: refreshingTasks ? 'default' : 'pointer', opacity: refreshingTasks ? 0.7 : 1
                }}
              >
                <RefreshCw size={15} className={refreshingTasks ? 'spin' : ''} />
                Refresh
              </button>
            </div>
            {activeTasks.filter(t => !dismissedTaskIds.includes(t.task_id)).map(task => {
              const isProcessing = task.status === 'processing';
              const progressPct = Math.round((task.sent / Math.max(1, task.total)) * 100);
              const isError = task.status === 'error';

              const accent = isError ? 'var(--status-error)' : (isProcessing ? 'var(--status-info)' : 'var(--status-success)');

              return (
                <div key={task.task_id} style={{
                  position: 'relative',
                  background: 'var(--surface)',
                  border: `1px solid ${accent}`,
                  borderLeft: `4px solid ${accent}`,
                  borderRadius: '0.85rem', padding: '1.25rem 1.5rem',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.12)'
                }}>
                  {/* Dismiss / Cancel button */}
                  <button
                    type="button"
                    onClick={() => handleDismissTask(task.task_id)}
                    title="Dismiss this notification"
                    style={{
                      position: 'absolute', top: '0.9rem', right: '0.9rem',
                      width: '28px', height: '28px', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'var(--surface-hover)', border: '1px solid var(--border)',
                      color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = accent; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                  >✕</button>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', paddingRight: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--surface-hover)', border: `1px solid ${accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
                        {isError ? '❌' : (isProcessing ? '🔄' : '✅')}
                      </div>
                      <div>
                        <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.05rem' }}>
                          {isError ? 'Email Batch Failed' : (isProcessing ? 'Sending Emails...' : 'Email Batch Completed')}
                        </h3>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                          Category: {task.category.toUpperCase()} • Started: {new Date(task.started_at * 1000).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {task.sent} / {task.total}
                      </div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--status-error)' }}>
                        {task.failed_count} failed
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="premium-progress-track">
                    <div
                      className={`premium-progress-fill ${isProcessing ? 'processing' : (isError ? 'error' : 'completed')}`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>

                  {/* Message & Errors */}
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                    {task.message}
                  </div>

                  {task.failed && task.failed.length > 0 && (
                    <div style={{ marginTop: '1rem', background: 'var(--bg-color)', borderRadius: '0.5rem', padding: '0.75rem', border: '1px solid var(--status-error)' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--status-error)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>⚠️ Failed Recipients</div>
                      <div style={{ maxHeight: '100px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {task.failed.map((f, i) => (
                          <div key={i} style={{ fontSize: '0.75rem', color: 'var(--text-primary)' }}>
                            <span style={{ fontWeight: 700 }}>{f.name}</span> ({f.email}): {f.error}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}



        {/* Stat Cards (Item 1 - fixed icons) */}
        <div className="grid grid-4" style={{ marginBottom: '2rem' }}>
          {[
            { label: 'Total Students', value: data.stats.total || 0, color: '#3B82F6', icon: '👥', bg: 'rgba(59,130,246,0.12)' },
            { label: 'Winners', value: data.stats.winners || 0, color: '#8B5CF6', icon: '🏆', bg: 'rgba(139,92,246,0.12)' },
            { label: 'Generated', value: data.stats.generated || 0, color: '#10B981', icon: '⚙️', bg: 'rgba(16,185,129,0.12)' },
            { label: 'Emails Sent', value: data.stats.sent || 0, color: '#F59E0B', icon: '📨', bg: 'rgba(245,158,11,0.12)' },
          ].map(s => (
            <div key={s.label} className="stat-card" style={{ position: 'relative', overflow: 'hidden' }}>
              <div style={{
                position: 'absolute', top: '0.75rem', right: '0.85rem',
                fontSize: '1.5rem',
                width: '38px', height: '38px',
                borderRadius: '0.5rem',
                background: s.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{s.icon}</div>
              <h3 style={{ color: s.color }}>{s.value}</h3>
              <p>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-2" style={{ marginBottom: '2rem' }}>
          <div className="card">
            <h3 style={{ marginBottom: '1rem', color: '#888888' }}>Status Distribution</h3>
            <div style={{ height: '250px', display: 'flex', justifyContent: 'center' }}>
              <Pie data={pieData} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#888888', font: { family: 'Inter', size: 12, weight: '600' }, padding: 15, usePointStyle: true } } } }} />
            </div>
          </div>
          <div className="card">
            <h3 style={{ marginBottom: '1rem', color: '#888888' }}>Category Distribution</h3>
            <div style={{ height: '250px' }}>
              <Bar data={barData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: '#888888' }, grid: { color: '#d8d6cf' } }, x: { ticks: { color: '#888888' }, grid: { display: false } } } }} />
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════ */}
        {/*  EMAIL PANEL — redesigned                                              */}
        {/* ═══════════════════════════════════════════════════════════════════════ */}
        <div className="card" style={{ marginBottom: '2rem', padding: 0, overflow: 'hidden' }}>

          {/* Panel Header — Item 2 dark theme fix */}
          <div style={{
            padding: '1.4rem 1.75rem',
            background: 'var(--primary)',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '0.6rem', background: 'rgba(200,160,122,0.2)', border: '1px solid rgba(200,160,122,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
                📬
              </div>
              <div>
                <h3 style={{ margin: 0, color: 'var(--accent)', fontSize: '1.05rem', fontWeight: 800 }}>Send Emails / Bulk Scheduler</h3>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.1rem' }}>
                  Configure sender accounts and dispatch certificates in bulk
                </p>
              </div>
            </div>
            {/* Limits Badge */}
            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
              {[{ label: 'Free Gmail', val: '500/day' }, { label: 'Workspace', val: '2,000/day' }].map(b => (
                <div key={b.label} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '0.5rem', padding: '0.4rem 0.75rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{b.label}</div>
                  <div style={{ fontSize: '0.88rem', color: '#c8a07a', fontWeight: 800 }}>{b.val}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: '1.75rem' }}>
            {message && (
              <div style={{ padding: '0.85rem 1rem', marginBottom: '1.25rem', background: message.startsWith('✅') || message.startsWith('🎉') ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${message.startsWith('✅') || message.startsWith('🎉') ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`, borderRadius: '0.65rem', color: message.startsWith('✅') || message.startsWith('🎉') ? '#065f46' : '#7f1d1d', fontWeight: 600, fontSize: '0.9rem' }}>
                {message}
              </div>
            )}

            <form onSubmit={handleSendEmails}>

              {/* ── Section A: Sender Accounts ─────────────────────────────────── */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#888888' }}>Sender Account(s)</div>
                    <div style={{ fontSize: '0.74rem', color: '#888888', marginTop: '0.1rem' }}>Accounts rotate automatically after 450 emails each</div>
                  </div>
                  <button type="button" onClick={addAccount} style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    background: 'linear-gradient(135deg, #f3e8ff, #ede9fe)',
                    color: '#7c3aed', border: '1px solid #ddd6fe',
                    padding: '0.45rem 0.9rem', borderRadius: '0.5rem',
                    cursor: 'pointer', fontWeight: 800, fontSize: '0.82rem',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#ddd6fe'}
                  onMouseLeave={e => e.currentTarget.style.background = 'linear-gradient(135deg,#f3e8ff,#ede9fe)'}
                  >
                    <span style={{ fontSize: '1rem' }}>＋</span> Add Account
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {emailAccounts.map((acc, idx) => (
                    <div key={idx} style={{
                      display: 'flex',
                      gap: '0.65rem', alignItems: 'center',
                      background: 'var(--bg-color)',
                      border: '1px solid var(--border)',
                      borderRadius: '0.65rem',
                      padding: '0.75rem 0.9rem'
                    }}>
                      {/* Email input */}
                      <div style={{ flex: 1, position: 'relative' }}>
                        {emailAccounts.length > 1 && (
                          <span style={{ position: 'absolute', top: '-0.05rem', left: '0.5rem', zIndex: 1, fontSize: '0.6rem', fontWeight: 800, color: '#7c3aed', background: '#ede9fe', padding: '0 0.3rem', borderRadius: '0.25rem', lineHeight: '1.4' }}>
                            #{idx + 1}
                          </span>
                        )}
                        <input
                          type="email"
                          placeholder={`sender${idx + 1}@gmail.com`}
                          value={acc.email}
                          onChange={e => updateAccount(idx, 'email', e.target.value)}
                          required
                          style={{ width: '100%', boxSizing: 'border-box', height: '44px', paddingLeft: emailAccounts.length > 1 ? '2rem' : '0.85rem', paddingRight: '0.85rem', borderRadius: '0.5rem', border: '1.5px solid var(--border)', background: 'var(--surface)', fontSize: '0.88rem', color: 'var(--text-primary)', fontWeight: 500, outline: 'none' }}
                          onFocus={e => e.target.style.borderColor = '#c8a07a'}
                          onBlur={e => e.target.style.borderColor = 'var(--border)'}
                        />
                      </div>
                      {/* App password input */}
                      <div style={{ flex: 1 }}>
                        <input
                          type="text"
                          placeholder="App Password  (e.g. wyrb fxdp mufh yaah)"
                          value={acc.password}
                          onChange={e => updateAccount(idx, 'password', e.target.value)}
                          required
                          style={{ width: '100%', boxSizing: 'border-box', height: '44px', padding: '0 0.85rem', borderRadius: '0.5rem', border: '1.5px solid var(--border)', background: 'var(--surface)', fontSize: '0.85rem', color: 'var(--text-primary)', fontFamily: 'monospace', letterSpacing: '0.04em', outline: 'none' }}
                          onFocus={e => e.target.style.borderColor = '#c8a07a'}
                          onBlur={e => e.target.style.borderColor = 'var(--border)'}
                        />
                      </div>
                      {emailAccounts.length > 1 && (
                        <button type="button" onClick={() => removeAccount(idx)} style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '0.45rem', cursor: 'pointer', fontWeight: 800, fontSize: '0.95rem', flexShrink: 0 }}>✕</button>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.72rem', color: '#888888' }}>💡 Spaces in app passwords are stripped automatically</span>
                  <code style={{ fontSize: '0.7rem', background: 'var(--surface-hover)', color: '#888888', padding: '0.1rem 0.4rem', borderRadius: '0.3rem', border: '1px solid var(--border)' }}>wyrb fxdp mufh yaah → wyrbfxdpmufhyaah</code>
                </div>
              </div>

              {/* ── Divider ────────────────────────────────────────────────────── */}
              <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, #e5e7eb, transparent)', margin: '0 -1.75rem 1.5rem', width: 'calc(100% + 3.5rem)' }} />

              {/* ── Section B: Email Content + Schedule Row ─────────────────────── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', alignItems: 'start', marginBottom: '1.5rem' }}>

                {/* Compose Button — opens modal */}
                <button
                  type="button"
                  onClick={() => setShowEmailComposer(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.85rem',
                    background: 'var(--surface)', border: '1.5px solid #e5e7eb',
                    borderRadius: '0.65rem', padding: '0.85rem 1.1rem',
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.18s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#c8a07a'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(200,160,122,0.18)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; }}
                >
                  <div style={{ width: '40px', height: '40px', borderRadius: '0.55rem', background: 'linear-gradient(135deg, #fef3c7, #fde68a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>
                    ✏️
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#888888' }}>Customize Email Content</div>
                    <div style={{ fontSize: '0.76rem', color: '#888888', marginTop: '0.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Subject: {emailSubject}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#c8a07a', flexShrink: 0, padding: '0.3rem 0.65rem', background: 'rgba(200,160,122,0.1)', borderRadius: '0.4rem', border: '1px solid rgba(200,160,122,0.25)' }}>
                    Edit →
                  </div>
                </button>

                {/* Schedule Toggle Pill */}
                <label style={{
                  display: 'flex', alignItems: 'center', gap: '0.65rem',
                  background: isScheduled ? 'rgba(79,70,229,0.06)' : '#fff',
                  border: `1.5px solid ${isScheduled ? '#818cf8' : '#e5e7eb'}`,
                  borderRadius: '0.65rem', padding: '0.85rem 1.1rem',
                  cursor: 'pointer', transition: 'all 0.18s', userSelect: 'none',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                }}>
                  <div style={{
                    width: '42px', height: '24px', borderRadius: '9999px',
                    background: isScheduled ? '#4f46e5' : '#d1d5db',
                    position: 'relative', transition: 'background 0.2s', flexShrink: 0
                  }}>
                    <div style={{
                      position: 'absolute', top: '3px',
                      left: isScheduled ? '21px' : '3px',
                      width: '18px', height: '18px', borderRadius: '50%',
                      background: 'var(--surface)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      transition: 'left 0.2s'
                    }} />
                    <input type="checkbox" id="schedule-toggle" checked={isScheduled} onChange={e => setIsScheduled(e.target.checked)} style={{ opacity: 0, position: 'absolute', inset: 0, margin: 0, cursor: 'pointer' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.86rem', fontWeight: 700, color: isScheduled ? '#4338ca' : '#374151' }}>⏰ Schedule Later</div>
                    <div style={{ fontSize: '0.73rem', color: '#888888' }}>Graduation ceremony</div>
                  </div>
                </label>
              </div>

              {/* Schedule Picker (only when toggled) */}
              {isScheduled && (
                <div style={{
                  background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)',
                  border: '1.5px solid #c4b5fd',
                  borderRadius: '0.75rem', padding: '1.25rem 1.4rem',
                  marginBottom: '1.5rem',
                  animation: 'fadeIn 0.2s ease'
                }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#5b21b6', marginBottom: '1rem' }}>Schedule Configuration</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '0.05em' }}>When to Send</label>
                      <select value={scheduleType} onChange={e => { setScheduleType(e.target.value); if (e.target.value === 'tomorrow') setScheduleTime(getTomorrow9AM()); else setScheduleTime(''); }} style={selSt}>
                        <option value="tomorrow">Tomorrow (9:00 AM)</option>
                        <option value="custom">Specific Date & Time</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Timezone</label>
                      <select value={scheduleTimezone} onChange={e => setScheduleTimezone(e.target.value)} style={selSt}>
                        <option value="Asia/Kolkata">IST (Asia/Kolkata)</option>
                        <option value="UTC">UTC</option>
                        <option value="America/New_York">EST/EDT (New York)</option>
                        <option value="Europe/London">GMT/BST (London)</option>
                        <option value="Asia/Singapore">SGT (Singapore)</option>
                        <option value="Australia/Sydney">AEST/AEDT (Sydney)</option>
                      </select>
                    </div>
                    {scheduleType === 'custom' && (
                      <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date & Time</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.45rem' }}>
                          {[
                            { vals: Array.from({ length: 31 }, (_, i) => ({ v: i + 1, l: String(i + 1).padStart(2, '0') })), val: schedDay, set: setSchedDay, label: 'DD' },
                            { vals: [{v:1,l:'Jan'},{v:2,l:'Feb'},{v:3,l:'Mar'},{v:4,l:'Apr'},{v:5,l:'May'},{v:6,l:'Jun'},{v:7,l:'Jul'},{v:8,l:'Aug'},{v:9,l:'Sep'},{v:10,l:'Oct'},{v:11,l:'Nov'},{v:12,l:'Dec'}], val: schedMonth, set: setSchedMonth, label: 'MM' },
                            { vals: [2026,2027,2028,2029,2030].map(y => ({v:y,l:String(y)})), val: schedYear, set: setSchedYear, label: 'YY' },
                            { vals: Array.from({ length: 12 }, (_, i) => ({ v: i + 1, l: String(i + 1).padStart(2, '0') })), val: schedHour, set: setSchedHour, label: 'HH' },
                            { vals: Array.from({ length: 60 }, (_, i) => ({ v: i, l: String(i).padStart(2, '0') })), val: schedMin, set: setSchedMin, label: 'MM' },
                            { vals: [{v:'AM',l:'AM'},{v:'PM',l:'PM'}], val: schedPeriod, set: setSchedPeriod, label: 'AM/PM' },
                          ].map((s, i) => (
                            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#7c3aed', textAlign: 'center' }}>{s.label}</span>
                              <select value={s.val} onChange={e => s.set(isNaN(parseInt(e.target.value)) ? e.target.value : parseInt(e.target.value))} style={{ ...selSt, textAlign: 'center' }}>
                                {s.vals.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Section C: Action Bar ───────────────────────────────────────── */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                gap: '1rem',
                padding: '1rem 1.25rem',
                background: 'var(--bg-color)', borderRadius: '0.75rem',
                border: '1px solid var(--border)'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={handleTestRun}
                    disabled={testRunLoading}
                    style={{ minWidth: '160px', padding: '0.75rem 1.25rem', fontSize: '0.85rem', fontWeight: 800, background: 'transparent', border: '1.5px solid var(--accent, #7c3aed)', color: 'var(--accent, #7c3aed)' }}
                  >
                    {testRunLoading ? <Loader className="spin" size={16} /> : <Mail size={16} />}
                    {' '}
                    {testRunLoading ? 'Testing…' : 'Test Run'}
                  </button>
                  {testRunStatus && (
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: testRunStatus.ok ? '#10B981' : '#ef4444', maxWidth: '260px' }}>
                      {testRunStatus.msg}
                    </span>
                  )}
                </div>

                {emailProgress && (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ flex: 1, height: '6px', background: '#e5e7eb', borderRadius: '9999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.round((emailProgress.sent / Math.max(1, emailProgress.total)) * 100)}%`, background: 'linear-gradient(90deg, #10B981, #3B82F6)', borderRadius: '9999px', transition: 'width 0.5s ease' }} />
                    </div>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#888888', whiteSpace: 'nowrap' }}>
                      {emailProgress.sent}/{emailProgress.total}
                      {emailProgress.failed > 0 && <span style={{ color: '#ef4444' }}> · {emailProgress.failed} failed</span>}
                    </span>
                  </div>
                )}
                <button type="submit" className="btn" disabled={sending || data.students.length === 0} style={{ minWidth: '220px', padding: '0.75rem 1.5rem', fontSize: '0.9rem', fontWeight: 800 }}>
                  {sending && !emailProgress ? <Loader className="spin" size={18} /> : <Mail size={18} />}
                  {' '}
                  {sending ? (isScheduled ? 'Scheduling...' : 'Sending...') : (isScheduled ? '📅 Confirm Schedule' : '🚀 Send Emails Now')}
                </button>
              </div>
            </form>

            {/* Scheduled Jobs */}
            {scheduledJobs.length > 0 && (
              <div style={{ marginTop: '1.75rem', borderTop: '1px solid #e5e7eb', paddingTop: '1.5rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#888888', marginBottom: '0.85rem' }}>Scheduled Batches</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {scheduledJobs.map(job => (
                    <div key={job.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-color)', border: '1px solid var(--border)', borderRadius: '0.65rem', padding: '0.9rem 1.1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: job.status === 'Pending' ? '#F59E0B' : job.status === 'Completed' ? '#10B981' : '#EF4444', flexShrink: 0, boxShadow: `0 0 6px ${job.status === 'Pending' ? '#F59E0B' : job.status === 'Completed' ? '#10B981' : '#EF4444'}` }} />
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#888888' }}>{job.category.toUpperCase()} BATCH <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '1rem', background: job.status === 'Pending' ? '#fef3c7' : job.status === 'Completed' ? '#d1fae5' : '#fee2e2', color: job.status === 'Pending' ? '#92400e' : job.status === 'Completed' ? '#065f46' : '#991b1b', fontWeight: 700 }}>{job.status}</span></div>
                          <div style={{ fontSize: '0.77rem', color: '#888888', marginTop: '0.15rem' }}>📅 {new Date(job.schedule_time).toLocaleString()} · 👥 {job.recipient_count} recipients · {job.sender_email}</div>
                        </div>
                      </div>
                      {job.status === 'Pending' && (
                        <button type="button" onClick={() => handleCancelJob(job.id)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '0.4rem', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Students Table */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>Students List</h3>
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage === 1} style={{ padding: '0.3rem 0.75rem', borderRadius: '0.4rem', border: '1px solid var(--border)', background: safePage === 1 ? '#f9fafb' : 'var(--accent)', color: safePage === 1 ? '#9ca3af' : '#fff', cursor: safePage === 1 ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>← Prev</button>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#888888' }}>Page {safePage} / {totalPages}</span>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} style={{ padding: '0.3rem 0.75rem', borderRadius: '0.4rem', border: '1px solid var(--border)', background: safePage === totalPages ? '#f9fafb' : 'var(--accent)', color: safePage === totalPages ? '#9ca3af' : '#fff', cursor: safePage === totalPages ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>Next →</button>
              </div>
            )}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>S.No</th>
                  {data.students.length > 0 && Object.keys(data.students[0]).filter(k => k !== 'Status').map(k => <th key={k}>{k}</th>)}
                  {data.students.length === 0 && (<><th>Name</th><th>Email</th><th>Category</th></>)}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pageStudents.map((student, idx) => (
                  <tr key={idx}>
                    <td>{(safePage - 1) * PAGE_SIZE + idx + 1}</td>
                    {Object.keys(student).filter(k => k !== 'Status').map(k => <td key={k}>{String(student[k] || '')}</td>)}
                    <td><TrackingStatusBadge status={student.Status || 'Pending'} /></td>
                  </tr>
                ))}
                {data.students.length === 0 && (
                  <tr><td colSpan="5" style={{ textAlign: 'center', color: '#94A3B8', padding: '2rem' }}>No data uploaded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem', marginTop: '1rem' }}>
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage === 1} style={{ padding: '0.3rem 0.7rem', borderRadius: '0.4rem', border: '1px solid var(--border)', background: safePage === 1 ? '#f9fafb' : 'var(--accent)', color: safePage === 1 ? '#9ca3af' : '#fff', cursor: safePage === 1 ? 'not-allowed' : 'pointer', fontWeight: 700 }}>←</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setCurrentPage(p)} style={{ padding: '0.3rem 0.6rem', borderRadius: '0.4rem', border: '1px solid var(--border)', background: p === safePage ? 'var(--accent)' : '#fff', color: p === safePage ? '#fff' : '#374151', cursor: 'pointer', fontWeight: p === safePage ? 800 : 500, minWidth: '2rem' }}>{p}</button>
              ))}
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} style={{ padding: '0.3rem 0.7rem', borderRadius: '0.4rem', border: '1px solid var(--border)', background: safePage === totalPages ? '#f9fafb' : 'var(--accent)', color: safePage === totalPages ? '#9ca3af' : '#fff', cursor: safePage === totalPages ? 'not-allowed' : 'pointer', fontWeight: 700 }}>→</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
