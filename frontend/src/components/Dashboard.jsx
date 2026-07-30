import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';
import { DownloadCloud, Loader, Mail } from 'lucide-react';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

export default function Dashboard() {
  const [data, setData] = useState({ students: [], stats: {} });
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [zipProgress, setZipProgress] = useState(null);
  const [emailForm, setEmailForm] = useState({ sender_email: 'harish9123456@gmail.com', app_password: 'ighc wzao pksm taug' });
  const [sending, setSending] = useState(false);
  const [emailProgress, setEmailProgress] = useState(null);
  const [message, setMessage] = useState('');

  const fetchData = async () => {
    try {
      const category = localStorage.getItem('cert_category') || 'events';
      const res = await axios.get(`http://${window.location.hostname}:5000/api/dashboard?category=${category}`);
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDownload = async () => {
    setDownloading(true);
    setZipProgress(null);
    try {
      const category = localStorage.getItem('cert_category') || 'events';
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const startRes = await axios.post(`http://${window.location.hostname}:5000/api/generate_zip_start`, { category, user_id: user.id });
      const taskId = startRes.data.task_id;

      while (true) {
        const progressRes = await axios.get(`http://${window.location.hostname}:5000/api/generate_zip_progress/${taskId}`);
        if (progressRes.data.error) throw new Error(progressRes.data.error);
        if (progressRes.data.status === 'completed') {
          setZipProgress(null);
          break;
        } else if (progressRes.data.status === 'error') {
          throw new Error(progressRes.data.error);
        }

        setZipProgress({ progress: progressRes.data.progress, total: progressRes.data.total });
        await new Promise(r => setTimeout(r, 1000));
      }

      const downloadUrl = `http://${window.location.hostname}:5000/api/download_zip/${taskId}`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', 'certificates.zip');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      fetchData();
    } catch (err) {
      alert("Error downloading ZIP (" + (err.response?.data?.error || err.message) + "). Are templates uploaded?");
    } finally {
      setDownloading(false);
      setZipProgress(null);
    }
  };

  const handleSendEmails = async (e) => {
    e.preventDefault();
    setSending(true);
    setMessage('');
    setEmailProgress(null);
    try {
      const category = localStorage.getItem('cert_category') || 'events';
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const startRes = await axios.post(`http://${window.location.hostname}:5000/api/send_emails_start`, { ...emailForm, category, user_id: user.id });
      const taskId = startRes.data.task_id;
      
      if (!taskId) {
        setMessage(startRes.data.message || "Done");
        setSending(false);
        fetchData();
        return;
      }

      while (true) {
        const progressRes = await axios.get(`http://${window.location.hostname}:5000/api/send_emails_progress/${taskId}`);
        if (progressRes.data.error) throw new Error(progressRes.data.error);
        
        if (progressRes.data.status === 'completed') {
          setEmailProgress(null);
          setMessage(progressRes.data.message);
          break;
        } else if (progressRes.data.status === 'error') {
          throw new Error(progressRes.data.error || "Generation error");
        }

        setEmailProgress({ sent: progressRes.data.sent, failed: progressRes.data.failed_count, total: progressRes.data.total });
        fetchData(); 
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (err) {
      setMessage(err.response?.data?.error || err.message || "Error sending emails");
    } finally {
      setSending(false);
      setEmailProgress(null);
      fetchData();
    }
  };

  if (loading) return <div>Loading dashboard...</div>;

  const pieData = {
    labels: ['Pending', 'Generated', 'Sent'],
    datasets: [{
      data: [
        data.stats.total - data.stats.generated - (data.stats.sent || 0),
        data.stats.generated,
        (data.stats.sent || 0)
      ],
      backgroundColor: ['#F59E0B', '#10B981', '#3B82F6'],
      borderWidth: 0,
    }]
  };

  const barData = {
    labels: ['Winners', 'Participants'],
    datasets: [{
      label: 'Count',
      data: [data.stats.winners, data.stats.participants],
      backgroundColor: ['#8B5CF6', '#EC4899'],
      borderRadius: 4,
    }]
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ margin: 0 }}>Analytics Dashboard</h2>
        <button className="btn" onClick={handleDownload} disabled={downloading || data.students.length === 0} style={{ minWidth: '180px' }}>
          {downloading && !zipProgress ? <Loader className="spin" size={18} /> :
            downloading && zipProgress ? <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>{Math.round((zipProgress.progress / Math.max(1, zipProgress.total)) * 100)}%</span> :
              <DownloadCloud size={18} />}
          {downloading && zipProgress ? ' Generating...' : ' Bulk Download (ZIP)'}
        </button>
      </div>

      <div className="grid grid-4" style={{ marginBottom: '2rem' }}>
        <div className="stat-card">
          <h3>{data.stats.total || 0}</h3>
          <p>Total Students</p>
        </div>
        <div className="stat-card">
          <h3>{data.stats.winners || 0}</h3>
          <p>Winners</p>
        </div>
        <div className="stat-card">
          <h3>{data.stats.generated || 0}</h3>
          <p>Generated</p>
        </div>
        <div className="stat-card">
          <h3>{data.stats.sent || 0}</h3>
          <p>Emails Sent</p>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: '2rem' }}>
        <div className="card">
          <h3 style={{ marginBottom: '1rem', color: '#2f3839' }}>Status Distribution</h3>
          <div style={{ height: '250px', display: 'flex', justifyContent: 'center' }}>
            <Pie 
              data={pieData} 
              options={{ 
                maintainAspectRatio: false, 
                plugins: { 
                  legend: { 
                    position: 'bottom', 
                    labels: { 
                      color: '#5c6b6c', 
                      font: { family: 'Inter', size: 12, weight: '600' },
                      padding: 15,
                      usePointStyle: true
                    } 
                  },
                  tooltip: {
                    backgroundColor: '#3e4c4e',
                    titleFont: { family: 'Inter', size: 12, weight: 'bold' },
                    bodyFont: { family: 'Inter', size: 11 },
                    padding: 8,
                    borderRadius: 6
                  }
                } 
              }} 
            />
          </div>
        </div>
        <div className="card">
          <h3 style={{ marginBottom: '1rem', color: '#2f3839' }}>Category Distribution</h3>
          <div style={{ height: '250px' }}>
            <Bar 
              data={barData} 
              options={{ 
                maintainAspectRatio: false, 
                plugins: { 
                  legend: { display: false },
                  tooltip: {
                    backgroundColor: '#3e4c4e',
                    titleFont: { family: 'Inter', size: 12, weight: 'bold' },
                    bodyFont: { family: 'Inter', size: 11 },
                    padding: 8,
                    borderRadius: 6
                  }
                }, 
                scales: { 
                  y: { 
                    ticks: { color: '#5c6b6c', font: { family: 'Inter', size: 10, weight: '500' } }, 
                    grid: { color: '#d8d6cf' } 
                  }, 
                  x: { 
                    ticks: { color: '#5c6b6c', font: { family: 'Inter', size: 10, weight: '500' } }, 
                    grid: { display: false } 
                  } 
                } 
              }} 
            />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3>Send Emails Setup</h3>
        {message && <div style={{ padding: '0.75rem', marginBottom: '1rem', background: 'var(--surface-hover)', border: '1px solid var(--border)', borderRadius: '0.5rem', color: 'var(--text-primary)', fontWeight: '500' }}>{message}</div>}
        <form onSubmit={handleSendEmails} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <input type="text" placeholder="Sender Email" required value={emailForm.sender_email} onChange={e => setEmailForm({ ...emailForm, sender_email: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <input type="password" placeholder="App Password" required value={emailForm.app_password} onChange={e => setEmailForm({ ...emailForm, app_password: e.target.value })} />
          </div>
          <button type="submit" className="btn" disabled={sending || data.students.length === 0} style={{ minWidth: '160px' }}>
            {sending && !emailProgress ? <Loader className="spin" size={18} /> : 
             sending && emailProgress ? <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>
               {emailProgress.sent}/{emailProgress.total} {emailProgress.failed > 0 && <span style={{color: '#F87171'}}>(✗ {emailProgress.failed})</span>}
             </span> : 
             <Mail size={18} />}
            {sending && emailProgress ? ' Sending...' : ' Send Emails'}
          </button>
        </form>
      </div>

      <div className="card">
        <h3>Students List</h3>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>S.No</th>
                {data.students.length > 0 && Object.keys(data.students[0]).filter(k => k !== 'Status').map((key) => (
                  <th key={key}>{key}</th>
                ))}
                {data.students.length === 0 && (
                  <>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Category</th>
                  </>
                )}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.students.map((student, idx) => (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  {Object.keys(student).filter(k => k !== 'Status').map((key) => (
                    <td key={key}>{String(student[key] || '')}</td>
                  ))}
                  <td><span className={`status-badge status-${student.Status || 'Pending'}`}>{student.Status || 'Pending'}</span></td>
                </tr>
              ))}
              {data.students.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', color: '#94A3B8', padding: '2rem' }}>No data uploaded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
