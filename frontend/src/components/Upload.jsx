import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { UploadCloud, CheckCircle, AlertTriangle, RefreshCw } from './SvgIcons';
import { API_BASE } from '../config';

// ── Simple broadcast: signal all mounted tabs that Excel data changed ─────────
export function broadcastExcelRefresh() {
  // 1) localStorage flag so other pages/tabs (even hidden) detect it
  localStorage.setItem('excel_upload_ts', Date.now().toString());
  // 2) Custom event for same-page components that are hidden (display:none)
  window.dispatchEvent(new CustomEvent('excel_uploaded'));
}

export default function Upload({ active = true }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = async () => {
    try {
      const cat = localStorage.getItem('cert_category') || 'events';
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const uid = user.id ?? '';
      if (uid === '') return;
      const resDash = await axios.get(`${API_BASE}/api/dashboard?category=${cat}&user_id=${uid}&_=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
      if (resDash.data.students && resDash.data.students.length > 0) {
        setStudents(resDash.data.students);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (active) fetchStatus();
  }, [active]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await fetchStatus(); }
    finally { setTimeout(() => setRefreshing(false), 400); }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError('');
    setMessage('');
    const formData = new FormData();
    formData.append('file', file);
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const uid = user.id ?? '';
    if (uid === '') {
      setError('User session expired. Please log in again.');
      setLoading(false);
      return;
    }
    formData.append('user_id', uid);
    try {
      const res = await axios.post(`${API_BASE}/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setStudents(res.data.students);
      setMessage(res.data.message);

      // ── Notify Dashboard & Generate to re-fetch immediately ──────────────
      broadcastExcelRefresh();
    } catch (err) {
      setError(err.response?.data?.error || 'Error uploading file');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Upload Excel Sheet</h2>
      <div className="card" style={{ maxWidth: '500px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3>Excel Data</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {students.length > 0 ?
              <span style={{ color: '#10B981', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><CheckCircle size={18} /> Uploaded</span> :
              <span style={{ color: '#F59E0B', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><AlertTriangle size={18} /> Missing</span>
            }
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh status"
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                background: 'var(--surface-hover)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', borderRadius: '0.5rem',
                padding: '0.35rem 0.7rem', fontSize: '0.78rem', fontWeight: 700,
                cursor: refreshing ? 'default' : 'pointer', opacity: refreshing ? 0.7 : 1
              }}
            >
              <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
        <form onSubmit={handleUpload}>
          <div style={{ marginBottom: '1rem', border: '2px dashed var(--border)', padding: '2rem', textAlign: 'center', borderRadius: '0.75rem', backgroundColor: 'var(--surface-hover)' }}>
            <UploadCloud size={48} color="var(--text-secondary)" style={{ marginBottom: '1rem' }} />
            <input type="file" required accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files[0])} style={{ border: 'none', background: 'transparent' }} />
          </div>
          <button type="submit" className="btn" disabled={!file || loading} style={{ width: '100%', justifyContent: 'center' }}>
            {loading ? 'Uploading...' : 'Submit Data'}
          </button>
        </form>
        {message && <div style={{ marginTop: '1rem', color: '#10B981', display: 'flex', gap: '0.5rem' }}><CheckCircle size={20} /> {message}</div>}
        {error && <div style={{ marginTop: '1rem', color: '#EF4444', display: 'flex', gap: '0.5rem' }}><AlertTriangle size={20} /> {error}</div>}
      </div>

      {students.length > 0 && (
        <div className="card" style={{ marginTop: '2rem' }}>
          <h3>Extracted Data Preview ({students.length} Records)</h3>
          <div style={{ overflowX: 'auto', maxHeight: '400px' }}>
            <table>
              <thead>
                <tr>
                  {Object.keys(students[0]).filter(k => k !== 'Status').map((key) => (
                    <th key={key}>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((st, i) => (
                  <tr key={i}>
                    {Object.keys(students[0]).filter(k => k !== 'Status').map((key) => (
                      <td key={key}>{String(st[key] || '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
