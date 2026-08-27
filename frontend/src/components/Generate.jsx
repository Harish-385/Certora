import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { UploadCloud, CheckCircle, Eye, AlertTriangle, Save, X } from './SvgIcons';
import { API_BASE } from '../config';


const DEFAULT_FIELD = { key: 'Name', x_percent: 50.0, y_percent: 50.0, font_size: 60, align: 'center', color: 'var(--text-primary)' };
const MARKER_COLORS = ['#6366F1', '#EC4899', '#10B981', '#F59E0B', '#3B82F6', '#8B5CF6', '#EF4444'];
const mc = (idx) => MARKER_COLORS[idx % MARKER_COLORS.length];

/* ─── Version History Panel (Item 7) ─────────────────────────────────────── */
function VersionHistoryPanel({ userId, open, onClose, onRestore }) {
  const [versions, setVersions] = useState([]);
  const [restoring, setRestoring] = useState(null);

  useEffect(() => {
    if (!open) return;
    const url = userId
      ? `${API_BASE}/api/versions?user_id=${userId}`
      : `${API_BASE}/api/versions`;
    axios.get(url).then(res => setVersions(res.data.versions || [])).catch(() => {});
  }, [open, userId]);

  const handleRestore = async (v) => {
    setRestoring(v.id);
    try {
      const res = await axios.post(`${API_BASE}/api/versions/${v.id}/restore`);
      onRestore(res.data.fields || []);
      onClose();
    } catch (e) {
      alert('Restore failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setRestoring(null);
    }
  };

  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: '340px',
      background: 'var(--surface)',
      borderLeft: '1px solid var(--border)',
      boxShadow: '-8px 0 32px rgba(0,0,0,0.18)',
      zIndex: 9999,
      display: 'flex', flexDirection: 'column',
      animation: 'slideInRight 0.25s ease',
    }}>
      <style>{`@keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>🕐 Version History</h3>
          <p style={{ margin: '0.1rem 0 0', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Like Figma — restore any saved state</p>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1.2rem', padding: '0.25rem' }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
        {versions.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '2rem', fontSize: '0.85rem' }}>
            No versions saved yet.<br />
            <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>Save your config to create a version.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {versions.map((v, i) => (
              <div key={v.id} style={{
                padding: '0.85rem 1rem',
                background: 'var(--bg-color)',
                border: '1px solid var(--border)',
                borderRadius: '0.65rem',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                transition: 'border-color 0.2s',
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '0.45rem',
                    background: i === 0 ? 'rgba(200,160,122,0.2)' : 'var(--surface-hover)',
                    border: i === 0 ? '1px solid rgba(200,160,122,0.4)' : '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.75rem', fontWeight: 800, color: i === 0 ? 'var(--accent)' : 'var(--text-secondary)',
                    flexShrink: 0,
                  }}>{v.version_num}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{v.label}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{v.created_at ? new Date(v.created_at).toLocaleString() : '—'}</div>
                  </div>
                </div>
                <button
                  onClick={() => handleRestore(v)}
                  disabled={restoring === v.id}
                  style={{
                    padding: '0.3rem 0.75rem', borderRadius: '0.4rem', border: 'none',
                    background: i === 0 ? 'rgba(200,160,122,0.15)' : 'var(--surface-hover)',
                    color: 'var(--text-primary)', fontSize: '0.72rem', fontWeight: 700,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >{restoring === v.id ? '...' : 'Restore'}</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Generate({ active = true }) {
  const [status, setStatus] = useState({ winner_exists: false, participant_exists: false });
  const [winnerFile, setWinnerFile] = useState(null);
  const [participantFile, setParticipantFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState([]);
  const [columns, setColumns] = useState([]);
  const [showPreviews, setShowPreviews] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [qrPosition, setQrPosition] = useState('center-bottom');
  const [fontStyle, setFontStyle] = useState('');
  const [fontLoading, setFontLoading] = useState(false);

  // Text field placement state
  const [activeFieldIndex, setActiveFieldIndex] = useState(0);
  const [previewKey, setPreviewKey] = useState(Date.now());
  const [isSaving, setIsSaving] = useState(false);
  const [textFieldsConfig, setTextFieldsConfig] = useState([{ ...DEFAULT_FIELD }]);
  const [editingTemplateIdx, setEditingTemplateIdx] = useState(null);
  const previewRef = useRef(null);

  // Version history (Item 7)
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [undoStack, setUndoStack] = useState([]); // local undo states
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  // Toast
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const notify = useCallback((type, msg) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ type, msg });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchStatus = async () => {
    try {
      const category = new URLSearchParams(window.location.search).get('category') || localStorage.getItem('cert_category') || 'events';
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const uid = user.id ?? '';
      
      const res = await axios.get(`${API_BASE}/api/templates/status?category=${category}`);
      setStatus(res.data);

      const resDash = await axios.get(`${API_BASE}/api/dashboard?category=${category}&user_id=${uid}&_=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
      if (resDash.data.students) {
        setStudents(resDash.data.students);
        if (resDash.data.students.length > 0) {
          const keys = Object.keys(resDash.data.students[0]).filter(
            k => !['Status', 'Verified_On_Chain'].includes(k)
          );
          setColumns(keys);
        }
      }

      const resConfig = await axios.get(`${API_BASE}/api/config/qr-position`);

      const resFont = await axios.get(`${API_BASE}/api/config/font-style`);
      if (resFont.data.font) setFontStyle(resFont.data.font);

      setQrPosition(resConfig.data.position || 'center-bottom');

      const resText = await axios.get(`${API_BASE}/api/config/text-fields`);
      if (resText.data.fields && resText.data.fields.length > 0) {
        setTextFieldsConfig(resText.data.fields);
        setActiveFieldIndex(0);
      }
      setPreviewKey(Date.now());
      return resDash.data.students || [];
    } catch (err) {
      console.error(err);
      return [];
    }
  };

  useEffect(() => { if (active) fetchStatus(); }, [active]);

  // Re-fetch immediately whenever Excel is uploaded from the Upload tab,
  // even if this component is currently hidden (active=false / display:none).
  // This keeps the column dropdowns (colOptions) in sync without a tab switch.
  useEffect(() => {
    const handleExcelUpload = () => {
      fetchStatus();
    };
    window.addEventListener('excel_uploaded', handleExcelUpload);
    return () => window.removeEventListener('excel_uploaded', handleExcelUpload);
  }, []);

  // ── Template upload ──────────────────────────────────────────────────────
  const handleUpload = async (type, file) => {
    if (!file) return;
    setLoading(true);
    const category = new URLSearchParams(window.location.search).get('category') || localStorage.getItem('cert_category') || 'events';
    const formData = new FormData();
    formData.append('template_type', type);
    formData.append('template_file', file);
    formData.append('category', category);
    try {
      await axios.post(`${API_BASE}/api/templates/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      fetchStatus();
      notify('success', `${type.charAt(0).toUpperCase() + type.slice(1)} template uploaded successfully!`);
    } catch (err) {
      notify('error', `Upload failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadPreviews = async () => {
    const latestStudents = await fetchStatus();
    if (latestStudents.length === 0) {
      notify('warn', 'No students uploaded yet. Please upload an Excel file first.');
      return;
    }
    setShowPreviews(true);
  };

  
  const applyFont = async () => {
    if (!fontStyle.trim()) return;
    setFontLoading(true);
    try {
      await axios.post(`${API_BASE}/api/config/font-style`, { font: fontStyle.trim() });
      setPreviewKey(Date.now());
      showToast('success', `Successfully applied font: ${fontStyle}`);
    } catch (err) {
      showToast('error', err.response?.data?.error || 'Failed to apply font');
    } finally {
      setFontLoading(false);
    }
  };

  const handlePositionChange = async (e) => {
    const pos = e.target.value;
    setQrPosition(pos);
    try { await axios.post(`${API_BASE}/api/config/qr-position`, { position: pos }); }
    catch (err) { console.error(err); }
  };

  // ── Text field helpers ───────────────────────────────────────────────────
  const category = new URLSearchParams(window.location.search).get('category') || localStorage.getItem('cert_category') || 'events';
  const colOptions = columns.length > 0 ? columns : ['Name', 'Email', 'Category'];

  const updateField = (idx, key, value) => {
    setTextFieldsConfig(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [key]: value };
      return updated;
    });
  };

  const addField = () => {
    const newField = {
      key: colOptions[0] || 'Name',
      x_percent: 50.0,
      y_percent: Math.min(90, 55.0 + textFieldsConfig.length * 10),
      font_size: 50,
      align: 'center',
      color: 'var(--text-primary)',
    };
    setTextFieldsConfig(prev => [...prev, newField]);
    setActiveFieldIndex(textFieldsConfig.length); // focus new field
  };

  const removeField = (idx) => {
    if (textFieldsConfig.length <= 1) return;
    setTextFieldsConfig(prev => prev.filter((_, i) => i !== idx));
    setActiveFieldIndex(prev => Math.max(0, prev >= idx ? prev - 1 : prev));
  };

  // Click on preview → set position of active field
  const handleTemplateClick = (e) => {
    if (!previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const x = parseFloat((((e.clientX - rect.left) / rect.width) * 100).toFixed(1));
    const y = parseFloat((((e.clientY - rect.top) / rect.height) * 100).toFixed(1));
    updateField(activeFieldIndex, 'x_percent', x);
    updateField(activeFieldIndex, 'y_percent', y);
  };

  const handleSaveTextConfig = async () => {
    setIsSaving(true);
    // Push current state onto undo stack before saving
    setUndoStack(prev => [...prev.slice(-20), textFieldsConfig]);
    try {
      const sanitised = textFieldsConfig.map(f => ({
        key: String(f.key || 'Name'),
        x_percent: isNaN(f.x_percent) ? 50.0 : Number(f.x_percent),
        y_percent: isNaN(f.y_percent) ? 50.0 : Number(f.y_percent),
        font_size: isNaN(f.font_size) || f.font_size < 10 ? 60 : Number(f.font_size),
        align: f.align || 'center',
        color: f.color || '#000000',
        template: String(f.template || ''),
        wrap_width: f.wrap_width && !isNaN(f.wrap_width) ? Number(f.wrap_width) : null
      }));
      await axios.post(
        `${API_BASE}/api/config/text-fields`,
        { fields: sanitised, user_id: user.id },
        { headers: { 'Content-Type': 'application/json' } }
      );
      setPreviewKey(Date.now());
      notify('success', 'Text field config saved! Certificate previews refreshed.');
    } catch (err) {
      const isNetwork = !err.response;
      const detail = err.response?.data?.error || err.message || 'Unknown error';
      notify('error', isNetwork
        ? 'Cannot reach the backend. Is the Flask server running on port 5000?'
        : `Save failed: ${detail}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Ctrl+Z undo (Item 7)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        setUndoStack(prev => {
          if (prev.length === 0) return prev;
          const newStack = [...prev];
          const previous = newStack.pop();
          setTextFieldsConfig(previous);
          setPreviewKey(Date.now());
          notify('info', 'Undo — restored previous field config');
          return newStack;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [notify]);

  // ── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative' }}>
      <h2>Templates Setup</h2>

      {/* Version History Panel (Item 7) */}
      <VersionHistoryPanel
        userId={user.id}
        open={showVersionHistory}
        onClose={() => setShowVersionHistory(false)}
        onRestore={(fields) => {
          setUndoStack(prev => [...prev, textFieldsConfig]);
          setTextFieldsConfig(fields);
          setPreviewKey(Date.now());
          notify('success', 'Version restored!');
        }}
      />
      {showVersionHistory && <div onClick={() => setShowVersionHistory(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.3)' }} />}

      {/* Toast */}
      <div style={{
        position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 99999,
        pointerEvents: toast ? 'auto' : 'none',
      }}>
        {toast && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
            padding: '0.9rem 1.1rem', borderRadius: '0.75rem',
            minWidth: '300px', maxWidth: '420px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
            border: `1px solid ${toast.type === 'success' ? '#10B981' : toast.type === 'error' ? '#EF4444' : '#F59E0B'}`,
            background: 'var(--surface)',
            animation: 'slideIn 0.25s ease',
          }}>
            <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>
              {toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : '⚠️'}
            </span>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-primary)', lineHeight: 1.5, flex: 1 }}>
              {toast.msg}
            </p>
            <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: 0 }}>
              <X size={16} />
            </button>
          </div>
        )}
      </div>
      <style>{`@keyframes slideIn { from { opacity:0; transform:translateX(2rem); } to { opacity:1; transform:translateX(0); } }`}</style>

      {/* ── QR Code Alignment ─────────────────────────────────────────────── */}
      <div className="sleek-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="animated-icon">📐</span> QR Code Alignment
            </h3>
            <p style={{ color: 'var(--text-secondary)', margin: 0, marginTop: '0.4rem', fontSize: '0.9rem' }}>
              Position the unique verification QR code dynamically.
            </p>
          </div>
          <select
            value={qrPosition}
            onChange={handlePositionChange}
            className="premium-select"
          >
            <option value="center-bottom">Center Bottom (Default)</option>
            <option value="center-right">Center Right</option>
            <option value="center-left">Center Left</option>
            <option value="bottom-right">Bottom Right</option>
            <option value="bottom-left">Bottom Left</option>
            <option value="top-right">Top Right</option>
            <option value="top-left">Top Left</option>
          </select>
        </div>
      </div>

      {/* ── Font Style ─────────────────────────────────────────────── */}
      <div className="sleek-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="animated-icon" style={{ animationDelay: '0.5s' }}>🔤</span> Google Fonts
            </h3>
            <p style={{ color: 'var(--text-secondary)', margin: 0, marginTop: '0.4rem', fontSize: '0.9rem' }}>
              Type any font name from Google Fonts (e.g. "Dancing Script").
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <input
              type="text"
              value={fontStyle}
              onChange={(e) => setFontStyle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyFont()}
              placeholder="e.g. Montserrat"
              className="premium-input"
            />
            <button
              onClick={applyFont}
              disabled={fontLoading || !fontStyle.trim()}
              className="premium-btn"
            >
              {fontLoading ? (
                <>
                  <span className="spin" style={{ display: 'inline-block' }}>🌀</span> Loading...
                </>
              ) : 'Apply Font'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Text Field Placement ───────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <h3 style={{ margin: 0 }}>Text Field Placement</h3>
            <p style={{ color: '#94A3B8', margin: '0.3rem 0 0', fontSize: '0.875rem' }}>
              Pick a data column for each field, then{' '}
              <strong style={{ color: '#818CF8' }}>click on the certificate preview</strong> to position it.
              Use <strong style={{ color: '#818CF8' }}>+ Add Field</strong> next to the column selector to add more fields.
              <span style={{ display: 'inline-block', marginLeft: '0.5rem', fontSize: '0.72rem', opacity: 0.6 }}>· Ctrl+Z to undo</span>
            </p>
          </div>
          {/* Version History Button (Item 7) */}
          <button
            onClick={() => setShowVersionHistory(true)}
            title="View Version History"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.45rem 0.9rem', borderRadius: '0.5rem',
              background: 'rgba(200,160,122,0.1)',
              border: '1px solid rgba(200,160,122,0.35)',
              color: 'var(--accent)', fontSize: '0.78rem', fontWeight: 700,
              cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            🕐 History {undoStack.length > 0 ? `(${undoStack.length})` : ''}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '2rem' }}>

          {/* Left: Dynamic field list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '520px', overflowY: 'auto', paddingRight: '0.5rem' }}>
            {textFieldsConfig.map((field, idx) => {
              const isActive = activeFieldIndex === idx;
              const color = mc(idx);
              const isLast = idx === textFieldsConfig.length - 1;
              return (
                <div
                  key={idx}
                  onClick={() => setActiveFieldIndex(idx)}
                  style={{
                    background: isActive ? `${color}10` : 'var(--surface-hover)',
                    border: `1px solid ${isActive ? color : 'var(--border)'}`,
                    borderRadius: '0.85rem', padding: '1.25rem', cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {/* Header row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                      <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>Field {idx + 1}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{
                        fontSize: '0.72rem', padding: '0.2rem 0.65rem', borderRadius: '9999px',
                        background: isActive ? `${color}20` : 'var(--border)',
                        color: isActive ? color : 'var(--text-secondary)',
                      }}>
                        {isActive ? '● active' : 'click to select'}
                      </span>
                      {textFieldsConfig.length > 1 && (
                        <button
                          onClick={e => { e.stopPropagation(); removeField(idx); }}
                          title="Remove this field"
                          style={{
                            background: 'rgba(239,68,68,0.1)', border: '1px solid #EF444455',
                            color: '#F87171', borderRadius: '0.35rem', width: '1.75rem', height: '1.75rem',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '1.1rem', lineHeight: 1, flexShrink: 0,
                          }}
                        >×</button>
                      )}
                    </div>
                  </div>

                  {/* Data Column + Add Field inline */}
                  <label style={{ color: '#64748B', fontSize: '0.72rem', display: 'block', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Data Column
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.9rem', alignItems: 'center' }}>
                    <select
                      value={field.key}
                      onChange={e => { e.stopPropagation(); updateField(idx, 'key', e.target.value); }}
                      onClick={e => e.stopPropagation()}
                      style={{ flex: 1, padding: '0.5rem 0.75rem', background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '0.5rem', outline: 'none' }}
                    >
                      {colOptions.map(col => <option key={col} value={col}>{col}</option>)}
                    </select>

                    {/* "+ Add Field" only on the last field */}
                    {isLast && (
                      <button
                        onClick={e => { e.stopPropagation(); addField(); }}
                        title="Add another text field"
                        style={{
                          padding: '0.5rem 0.85rem', background: 'rgba(99,102,241,0.15)',
                          border: '1px solid #6366F1', color: '#818CF8',
                          borderRadius: '0.45rem', cursor: 'pointer', whiteSpace: 'nowrap',
                          fontSize: '0.82rem', fontWeight: 600, flexShrink: 0,
                          transition: 'all 0.2s',
                        }}
                        onMouseOver={e => e.currentTarget.style.background = 'rgba(99,102,241,0.3)'}
                        onMouseOut={e => e.currentTarget.style.background = 'rgba(99,102,241,0.15)'}
                      >+ Add Field</button>
                    )}
                  </div>

                  {/* X / Y */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.9rem' }}>
                    {['x_percent', 'y_percent'].map(axis => (
                      <div key={axis}>
                        <label style={{ color: '#64748B', fontSize: '0.72rem', display: 'block', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {axis === 'x_percent' ? 'X (%)' : 'Y (%)'}
                        </label>
                        <input
                          type="number" min="0" max="100" step="0.5"
                          value={parseFloat((field[axis] || 50).toFixed(1))}
                          onChange={e => { e.stopPropagation(); updateField(idx, axis, parseFloat(e.target.value) || 0); }}
                          onClick={e => e.stopPropagation()}
                          style={{ width: '100%', padding: '0.5rem', background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '0.5rem', outline: 'none' }}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Font size & Color */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.9rem' }}>
                    <div>
                      <label style={{ color: '#64748B', fontSize: '0.72rem', display: 'block', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Font Size</label>
                      <input
                        type="number" min="10" max="200"
                        value={field.font_size || 60}
                        onChange={e => { e.stopPropagation(); updateField(idx, 'font_size', parseInt(e.target.value) || 60); }}
                        onClick={e => e.stopPropagation()}
                        style={{ width: '100%', padding: '0.5rem', background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '0.5rem', outline: 'none' }}
                      />
                    </div>
                    <div>
                      <label style={{ color: '#64748B', fontSize: '0.72rem', display: 'block', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Color</label>
                      <input
                        type="color"
                        value={field.color || '#000000'}
                        onChange={e => { e.stopPropagation(); updateField(idx, 'color', e.target.value); }}
                        onClick={e => e.stopPropagation()}
                        style={{ width: '100%', height: '2.25rem', padding: '0.1rem 0.2rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0.5rem', cursor: 'pointer' }}
                      />
                    </div>
                  </div>

                  {/* Alignment */}
                  <label style={{ color: '#64748B', fontSize: '0.72rem', display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Alignment (from anchor)
                  </label>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    {[{ val: 'left', icon: '⬅ Left' }, { val: 'center', icon: '↔ Center' }, { val: 'right', icon: 'Right ➡' }].map(({ val, icon }) => (
                      <button
                        key={val}
                        onClick={e => { e.stopPropagation(); updateField(idx, 'align', val); }}
                        style={{
                          flex: 1, padding: '0.4rem 0.2rem', fontSize: '0.75rem',
                          background: field.align === val ? `${color}20` : 'var(--surface)',
                          border: `1px solid ${field.align === val ? color : 'var(--border)'}`,
                          color: field.align === val ? color : '#64748B',
                          borderRadius: '0.4rem', cursor: 'pointer', transition: 'all 0.2s',
                        }}
                      >{icon}</button>
                    ))}
                  </div>

                  {/* Paragraph Template Popup Trigger */}
                  {category === 'project' && (
                    <div style={{ marginTop: '0.9rem' }}>
                      <button
                        onClick={e => { e.stopPropagation(); setEditingTemplateIdx(idx); }}
                        style={{
                          width: '100%',
                          padding: '0.65rem',
                          backgroundColor: field.template ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.1)',
                          border: `1px solid ${field.template ? '#10B98155' : '#6366F155'}`,
                          color: field.template ? '#10B981' : '#818CF8',
                          borderRadius: '0.5rem',
                          fontSize: '0.82rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.4rem',
                          transition: 'all 0.2s',
                        }}
                        onMouseOver={e => e.currentTarget.style.transform = 'scale(1.02)'}
                        onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                      >
                        <span>📝</span>
                        {field.template ? 'Edit Certificate Content popup' : 'Set Certificate Content popup'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Save */}
            <button
              className="btn"
              onClick={handleSaveTextConfig}
              disabled={isSaving}
              style={{ width: '100%', justifyContent: 'center', gap: '0.5rem' }}
            >
              <Save size={16} />
              {isSaving ? 'Saving…' : 'Save & Apply Text Config'}
            </button>
          </div>

          {/* Right: Interactive preview */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: mc(activeFieldIndex) }} />
              <p style={{ color: '#94A3B8', fontSize: '0.82rem', margin: 0 }}>
                Click anywhere below to position{' '}
                <strong style={{ color: mc(activeFieldIndex) }}>Field {activeFieldIndex + 1}</strong>.
                Crosshairs show current positions.
              </p>
            </div>

            <div
              ref={previewRef}
              onClick={handleTemplateClick}
              style={{
                position: 'relative', cursor: 'crosshair', userSelect: 'none',
                border: '2px dashed var(--border)', borderRadius: '0.85rem', overflow: 'hidden',
                background: 'var(--surface-hover)', minHeight: '220px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {(status.winner_exists || status.participant_exists) ? (
                <img
                  src={`${API_BASE}/api/preview_cert/0?category=${new URLSearchParams(window.location.search).get('category') || localStorage.getItem('cert_category') || 'events'}&user_id=${JSON.parse(localStorage.getItem('user') || '{}').id || ''}&t=${previewKey}`}
                  alt="Template Preview"
                  style={{ width: '100%', display: 'block', pointerEvents: 'none' }}
                  draggable={false}
                />
              ) : (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#475569' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🖼️</div>
                  <div style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
                    Upload a certificate template and an Excel file<br />
                    to enable the interactive position picker.
                  </div>
                </div>
              )}

              {/* Crosshair markers */}
              {textFieldsConfig.map((field, idx) => {
                const isActive = activeFieldIndex === idx;
                const color = mc(idx);
                return (
                  <div
                    key={idx}
                    style={{
                      position: 'absolute',
                      left: `${field.x_percent}%`,
                      top: `${field.y_percent}%`,
                      transform: 'translate(-50%, -50%)',
                      pointerEvents: 'none',
                      zIndex: 10,
                    }}
                  >
                    <div style={{ position: 'absolute', left: '-24px', top: '50%', width: '48px', height: '1.5px', background: color, opacity: isActive ? 1 : 0.55 }} />
                    <div style={{ position: 'absolute', top: '-24px', left: '50%', width: '1.5px', height: '48px', background: color, opacity: isActive ? 1 : 0.55 }} />
                    <div style={{ width: '13px', height: '13px', borderRadius: '50%', background: color, border: '2.5px solid white', boxShadow: `0 0 10px ${color}`, opacity: isActive ? 1 : 0.7 }} />
                    <div style={{
                      position: 'absolute', top: '16px', left: '50%', transform: 'translateX(-50%)',
                      background: 'rgba(0,0,0,0.8)', color: 'var(--text-primary)',
                      fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: '0.2rem',
                      whiteSpace: 'nowrap', border: `1px solid ${color}`,
                    }}>
                      F{idx + 1}: {field.key}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
              {textFieldsConfig.map((field, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: '#64748B' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: mc(idx) }} />
                  F{idx + 1} – {field.key} @ ({(field.x_percent || 0).toFixed(1)}%, {(field.y_percent || 0).toFixed(1)}%)
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Template Upload Cards ──────────────────────────────────────────── */}
      {(() => {
        const category = new URLSearchParams(window.location.search).get('category') || localStorage.getItem('cert_category') || 'events';
        if (category === 'course') {
          return (
            <div className="grid grid-1" style={{ marginBottom: '2rem' }}>
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <h3>Course Template</h3>
                  {status.winner_exists || status.participant_exists
                    ? <span style={{ color: '#10B981', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><CheckCircle size={18} /> Uploaded</span>
                    : <span style={{ color: '#F59E0B', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><AlertTriangle size={18} /> Missing</span>
                  }
                </div>
                <div style={{ marginBottom: '1rem', border: '2px dashed var(--border)', padding: '1.5rem', textAlign: 'center', borderRadius: '0.75rem', background: 'var(--surface-hover)' }}>
                  <UploadCloud size={32} color="var(--text-secondary)" style={{ marginBottom: '1rem' }} />
                  <input type="file" accept=".png,.jpg,.jpeg" onChange={e => setWinnerFile(e.target.files[0])} style={{ border: 'none', background: 'transparent' }} />
                </div>
                <button className="btn" disabled={!winnerFile || loading} onClick={() => handleUpload('winner', winnerFile)} style={{ width: '100%', justifyContent: 'center' }}>
                  Upload Course Image
                </button>
              </div>
            </div>
          );
        } else if (category === 'project') {
          return (
            <div className="grid grid-1" style={{ marginBottom: '2rem' }}>
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <h3>Project Template</h3>
                  {status.winner_exists || status.participant_exists
                    ? <span style={{ color: '#10B981', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><CheckCircle size={18} /> Uploaded</span>
                    : <span style={{ color: '#F59E0B', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><AlertTriangle size={18} /> Missing</span>
                  }
                </div>
                <div style={{ marginBottom: '1rem', border: '2px dashed var(--border)', padding: '1.5rem', textAlign: 'center', borderRadius: '0.75rem', background: 'var(--surface-hover)' }}>
                  <UploadCloud size={32} color="var(--text-secondary)" style={{ marginBottom: '1rem' }} />
                  <input type="file" accept=".png,.jpg,.jpeg" onChange={e => setWinnerFile(e.target.files[0])} style={{ border: 'none', background: 'transparent' }} />
                </div>
                <button className="btn" disabled={!winnerFile || loading} onClick={() => handleUpload('winner', winnerFile)} style={{ width: '100%', justifyContent: 'center' }}>
                  Upload Project Image
                </button>
              </div>
            </div>
          );
        } else {
          return (
            <div className="grid grid-2" style={{ marginBottom: '2rem' }}>
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <h3>Winner Template</h3>
                  {status.winner_exists
                    ? <span style={{ color: '#10B981', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><CheckCircle size={18} /> Uploaded</span>
                    : <span style={{ color: '#F59E0B', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><AlertTriangle size={18} /> Missing</span>
                  }
                </div>
                <div style={{ marginBottom: '1rem', border: '2px dashed var(--border)', padding: '1.5rem', textAlign: 'center', borderRadius: '0.75rem', background: 'var(--surface-hover)' }}>
                  <UploadCloud size={32} color="var(--text-secondary)" style={{ marginBottom: '1rem' }} />
                  <input type="file" accept=".png,.jpg,.jpeg" onChange={e => setWinnerFile(e.target.files[0])} style={{ border: 'none', background: 'transparent' }} />
                </div>
                <button className="btn" disabled={!winnerFile || loading} onClick={() => handleUpload('winner', winnerFile)} style={{ width: '100%', justifyContent: 'center' }}>
                  Upload Winner Image
                </button>
              </div>

              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <h3>Participant Template</h3>
                  {status.participant_exists
                    ? <span style={{ color: '#10B981', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><CheckCircle size={18} /> Uploaded</span>
                    : <span style={{ color: '#F59E0B', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><AlertTriangle size={18} /> Missing</span>
                  }
                </div>
                <div style={{ marginBottom: '1rem', border: '2px dashed var(--border)', padding: '1.5rem', textAlign: 'center', borderRadius: '0.75rem', background: 'var(--surface-hover)' }}>
                  <UploadCloud size={32} color="var(--text-secondary)" style={{ marginBottom: '1rem' }} />
                  <input type="file" accept=".png,.jpg,.jpeg" onChange={e => setParticipantFile(e.target.files[0])} style={{ border: 'none', background: 'transparent' }} />
                </div>
                <button className="btn" disabled={!participantFile || loading} onClick={() => handleUpload('participant', participantFile)} style={{ width: '100%', justifyContent: 'center' }}>
                  Upload Participant Image
                </button>
              </div>
            </div>
          );
        }
      })()}

      {/* ── Live Previews Grid ─────────────────────────────────────────────── */}
      <div className="card">
        <h3>Live Certificates Grid</h3>
        <p style={{ color: '#94A3B8', marginBottom: '1rem' }}>Generate and preview all certificates at a glance based on the currently uploaded templates.</p>

        <div className="flex-gap" style={{ marginBottom: '1rem' }}>
          <button className="btn" onClick={loadPreviews}>
            <Eye size={18} /> Load All Previews
          </button>
          {showPreviews && (
            <button className="btn btn-secondary" onClick={() => setShowPreviews(false)}>Hide Previews</button>
          )}
        </div>

        {showPreviews && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem', marginTop: '2rem' }}>
            {students.map((student, idx) => (
              <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden', background: 'var(--surface)', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                <div style={{ background: 'var(--surface-hover)', textAlign: 'center', padding: '1rem', borderBottom: '1px solid var(--border)' }}>
                  <img
                    src={`${API_BASE}/api/preview_cert/${idx}?pos=${qrPosition}&category=${new URLSearchParams(window.location.search).get('category') || localStorage.getItem('cert_category') || 'events'}&user_id=${JSON.parse(localStorage.getItem('user') || '{}').id || ''}&t=${previewKey}`}
                    alt={`Certificate for ${student.Name}`}
                    style={{ width: '100%', height: 'auto', maxHeight: '200px', objectFit: 'contain', cursor: 'pointer', transition: 'transform 0.2s' }}
                    loading="lazy"
                    onClick={() => setSelectedImage(idx)}
                    onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
                    onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                  />
                </div>
                <div style={{ padding: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>{student.Name}</h4>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{student.Email}</span>
                    <span className={`status-badge ${student.Category === 'Winner' ? 'status-Generated' : 'status-Pending'}`}>
                      {student.Category}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Fullscreen Modal ───────────────────────────────────────────────── */}
      {selectedImage !== null && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
          onClick={() => setSelectedImage(null)}
        >
          <div style={{ position: 'relative', width: '90%', maxWidth: '1200px', maxHeight: '90vh', display: 'flex', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setSelectedImage(null)}
              style={{ position: 'absolute', top: '-40px', right: 0, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '2.5rem', cursor: 'pointer' }}
            >&times;</button>
            <img
              src={`${API_BASE}/api/preview_cert/${selectedImage}?pos=${qrPosition}&category=${new URLSearchParams(window.location.search).get('category') || localStorage.getItem('cert_category') || 'events'}&user_id=${JSON.parse(localStorage.getItem('user') || '{}').id || ''}&t=${previewKey}`}
              alt="Expanded Certificate"
              style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: '0.5rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}
            />
          </div>
        </div>
      )}

      {/* ── Paragraph Template Modal ─────────────────────────────────────── */}
      {editingTemplateIdx !== null && (() => {
        const field = textFieldsConfig[editingTemplateIdx];
        if (!field) return null;
        return (
          <div
            style={{
              position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
              backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
              zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center'
            }}
            onClick={() => setEditingTemplateIdx(null)}
          >
            <div
              style={{
                width: '95%', maxWidth: '950px', maxHeight: '90vh', backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: '1rem',
                padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                overflowY: 'auto'
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.08)', paddingBottom: '1rem' }}>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.5rem', fontWeight: 800 }}>
                  <span>📝</span> Certificate Content Setup
                </h3>
                <button
                  onClick={() => setEditingTemplateIdx(null)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: 0.8 }}
                >&times;</button>
              </div>

              <div>
                <label style={{ color: 'var(--text-primary)', fontSize: '0.8rem', display: 'block', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                  Custom Paragraph Template
                </label>
                <textarea
                  id="template-textarea"
                  rows={8}
                  placeholder="Type the certificate text here. Use brackets to insert Excel columns. e.g. This is to certify that {Name} has successfully completed project titled {Project_Title}."
                  value={field.template || ''}
                  onChange={e => updateField(editingTemplateIdx, 'template', e.target.value)}
                  style={{
                    width: '100%', padding: '1rem', backgroundColor: 'var(--bg-color)',
                    color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '0.75rem',
                    outline: 'none', fontSize: '0.95rem', lineHeight: 1.6, resize: 'vertical',
                    fontFamily: 'inherit', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.05)'
                  }}
                />
              </div>

              {/* Dynamic Column Placeholder Insertion Pills */}
              <div>
                <label style={{ color: 'var(--text-primary)', fontSize: '0.8rem', display: 'block', marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                  Click to Insert Dynamic Column Placeholders
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                  {(columns.length > 0 ? columns : ['Name', 'Category', 'Email']).map(col => (
                    <button
                      key={col}
                      onClick={() => {
                        const txt = document.getElementById('template-textarea');
                        if (txt) {
                          const start = txt.selectionStart;
                          const end = txt.selectionEnd;
                          const val = field.template || '';
                          const newVal = val.slice(0, start) + `{${col}}` + val.slice(end);
                          updateField(editingTemplateIdx, 'template', newVal);
                          // Set focus back
                          setTimeout(() => {
                            txt.focus();
                            txt.setSelectionRange(start + col.length + 2, start + col.length + 2);
                          }, 50);
                        } else {
                          updateField(editingTemplateIdx, 'template', (field.template || '') + `{${col}}`);
                        }
                      }}
                      style={{
                        padding: '0.4rem 0.85rem', backgroundColor: 'var(--bg-color)',
                        border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: '0.5rem',
                        fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer', transition: 'all 0.15s',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = 'var(--surface)';
                        e.currentTarget.style.color = '#ffffff';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = '#ffffff';
                        e.currentTarget.style.color = 'var(--text-primary)';
                      }}
                    >
                      +{col}
                    </button>
                  ))}
                </div>
              </div>

              {/* Line Wrap Width */}
              <div>
                <label style={{ color: 'var(--text-primary)', fontSize: '0.8rem', display: 'block', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                  Line wrapping (Max characters per line)
                </label>
                <input
                  type="number" min="10" max="200"
                  value={field.wrap_width || ''}
                  onChange={e => updateField(editingTemplateIdx, 'wrap_width', parseInt(e.target.value) || '')}
                  placeholder="e.g. 70 (leave empty for no wrapping)"
                  style={{
                    width: '100%', padding: '0.8rem 1rem', backgroundColor: 'var(--bg-color)',
                    color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '0.75rem',
                    outline: 'none', fontSize: '0.95rem', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.05)'
                  }}
                />
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block', marginTop: '0.4rem', fontWeight: 500 }}>
                  Recommended: 60 to 75 for standard certificate paragraph layouts.
                </span>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <button
                  className="btn"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={async () => {
                    setEditingTemplateIdx(null);
                    // Automatically trigger save configuration on Apply
                    setTimeout(() => {
                      handleSaveTextConfig();
                    }, 50);
                  }}
                >
                  Apply & Preview
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => setEditingTemplateIdx(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
