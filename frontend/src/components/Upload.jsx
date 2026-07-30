import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { UploadCloud, CheckCircle, AlertTriangle } from 'lucide-react';

export default function Upload() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState([]);
  const [message, setMessage] = useState('');

  const fetchStatus = async () => {
    try {
      const resDash = await axios.get(`http://${window.location.hostname}:5000/api/dashboard`);
      if (resDash.data.students && resDash.data.students.length > 0) {
        setStudents(resDash.data.students);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    formData.append('user_id', user.id || '');
    try {
      const res = await axios.post(`http://${window.location.hostname}:5000/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setStudents(res.data.students);
      setMessage(res.data.message);
    } catch (err) {
      setMessage(err.response?.data?.error || "Error uploading file");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Upload Excel Sheet</h2>
      <div className="card" style={{ maxWidth: '500px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3>Excel Data</h3>
          {students.length > 0 ? 
            <span style={{ color: '#10B981', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><CheckCircle size={18} /> Uploaded</span> :
            <span style={{ color: '#F59E0B', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><AlertTriangle size={18} /> Missing</span>
          }
        </div>
        <form onSubmit={handleUpload}>
          <div style={{ marginBottom: '1rem', border: '2px dashed var(--border)', padding: '2rem', textAlign: 'center', borderRadius: '0.75rem', backgroundColor: 'var(--surface-hover)' }}>
            <UploadCloud size={48} color="var(--text-secondary)" style={{ marginBottom: '1rem' }} />
            <input type="file" required accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files[0])} style={{ border: 'none', background: 'transparent' }} />
          </div>
          <button type="submit" className="btn" disabled={!file || loading} style={{ width: '100%', justifyContent: 'center' }}>
            {loading ? 'Uploading...' : 'Submit Data'}
          </button>
        </form>
        {message && <div style={{ marginTop: '1rem', color: '#10B981', display: 'flex', gap: '0.5rem' }}><CheckCircle size={20} /> {message}</div>}
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
