import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title, PointElement, LineElement } from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';
import { Users, Mail, Download, RefreshCw, Layers, ChevronDown, UploadCloud } from './SvgIcons';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title, PointElement, LineElement);

export default function AdminDashboard() {
  const [data, setData] = useState({ stats: {}, users: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all'); // 'all', 'events', 'course', 'project'
  const [dropdownOpen, setDropdownOpen] = useState(false);
  
  // Custom features states
  const [activeTab, setActiveTab] = useState('users'); // 'users', 'templates', 'logs'
  const [selectedUserStats, setSelectedUserStats] = useState(null);
  const [passwordResetUser, setPasswordResetUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  
  const [templates, setTemplates] = useState({});
  const [logs, setLogs] = useState([]);

  const [advancedStats, setAdvancedStats] = useState(null);
  const [statsFilter, setStatsFilter] = useState('all'); // 'all', 'events', 'course', 'project'

  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkError, setBulkError] = useState('');

  const handleViewStatsClick = async (user) => {
    setSelectedUserStats(user);
    setStatsFilter('all');
    setAdvancedStats(null); // Reset previous state
    try {
      const res = await axios.get(`http://${window.location.hostname}:5000/api/admin/users/${user.id}/advanced-stats`);
      setAdvancedStats(res.data);
    } catch (err) {
      console.error("Failed to load advanced stats:", err);
    }
  };

  const fetchAdminStats = async () => {
    setRefreshing(true);
    try {
      const res = await axios.get(`http://${window.location.hostname}:5000/api/admin/stats`);
      setData(res.data);
    } catch (err) {
      console.error("Failed to fetch admin stats:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await axios.get(`http://${window.location.hostname}:5000/api/admin/templates`);
      setTemplates(res.data.templates || {});
    } catch (err) {
      console.error("Failed to fetch templates catalog:", err);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await axios.get(`http://${window.location.hostname}:5000/api/admin/audit_logs`);
      setLogs(res.data.logs || []);
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    }
  };

  const handleToggleStatus = async (user) => {
    try {
      const admin = JSON.parse(localStorage.getItem('user') || '{}');
      const res = await axios.post(`http://${window.location.hostname}:5000/api/admin/users/${user.id}/toggle-status`, { admin_id: admin.id });
      fetchAdminStats();
      fetchLogs();
      alert(res.data.message);
    } catch (err) {
      alert("Failed to toggle status: " + (err.response?.data?.error || err.message));
    }
  };

  const handlePasswordResetSubmit = async (e) => {
    e.preventDefault();
    if (!passwordResetUser || !newPassword) return;
    try {
      const admin = JSON.parse(localStorage.getItem('user') || '{}');
      const res = await axios.post(`http://${window.location.hostname}:5000/api/admin/users/${passwordResetUser.id}/reset-password`, { 
        admin_id: admin.id,
        password: newPassword
      });
      setPasswordResetUser(null);
      setNewPassword('');
      fetchLogs();
      alert(res.data.message);
    } catch (err) {
      alert("Failed to reset password: " + (err.response?.data?.error || err.message));
    }
  };

  const handleBulkFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setBulkFile(file);
      setBulkError('');
      setBulkResult(null);
    }
  };

  const handleBulkUploadSubmit = async (e) => {
    e.preventDefault();
    if (!bulkFile) return;
    setBulkUploading(true);
    setBulkError('');
    setBulkResult(null);

    const formData = new FormData();
    formData.append('excel_file', bulkFile);
    
    const admin = JSON.parse(localStorage.getItem('user') || '{}');
    formData.append('admin_id', admin.id);

    try {
      const res = await axios.post(`http://${window.location.hostname}:5000/api/admin/users/bulk-upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setBulkResult(res.data);
      setBulkFile(null);
      fetchAdminStats(); // refresh user directory
      fetchLogs(); // refresh logs
    } catch (err) {
      setBulkError(err.response?.data?.error || err.message || 'Bulk upload failed.');
    } finally {
      setBulkUploading(false);
    }
  };

  const handleChangeRole = async (user) => {
    const nextRole = user.role === 'admin' ? 'user' : 'admin';
    if (!window.confirm(`Are you sure you want to change role of user ${user.email} to ${nextRole}?`)) return;
    try {
      const admin = JSON.parse(localStorage.getItem('user') || '{}');
      const res = await axios.post(`http://${window.location.hostname}:5000/api/admin/users/${user.id}/change-role`, { 
        admin_id: admin.id,
        role: nextRole
      });
      fetchAdminStats();
      fetchLogs();
      alert(res.data.message);
    } catch (err) {
      alert("Failed to update role: " + (err.response?.data?.error || err.message));
    }
  };

  const handleDeleteTemplate = async (category, type) => {
    if (!window.confirm(`Are you sure you want to delete the ${type} template for ${category}?`)) return;
    try {
      const admin = JSON.parse(localStorage.getItem('user') || '{}');
      const res = await axios.delete(`http://${window.location.hostname}:5000/api/admin/templates/${category}/${type}?admin_id=${admin.id}`);
      fetchTemplates();
      fetchLogs();
      alert(res.data.message);
    } catch (err) {
      alert("Failed to delete template: " + (err.response?.data?.error || err.message));
    }
  };

  const handleExportCSV = () => {
    window.location.href = `http://${window.location.hostname}:5000/api/admin/audit_logs/export`;
  };

  useEffect(() => {
    fetchAdminStats();
    fetchTemplates();
    fetchLogs();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--text-primary)' }}>
        <RefreshCw className="spin" size={36} style={{ color: 'var(--accent)', marginBottom: '1rem' }} />
        <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>Loading Administrator Console...</p>
      </div>
    );
  }

  const stats = data.stats || {};
  const users = data.users || [];

  const getActiveStats = () => {
    if (categoryFilter === 'all') {
      return {
        users_count: stats.users_count || 0,
        emails_generated: stats.emails_generated || 0,
        emails_sent: stats.emails_sent || 0,
        downloads: stats.downloads || 0
      };
    }
    const breakdown = data.breakdown || {};
    const catData = breakdown[categoryFilter] || { generated: 0, sent: 0, downloaded: 0 };
    return {
      users_count: stats.users_count || 0,
      emails_generated: catData.generated || 0,
      emails_sent: catData.sent || 0,
      downloads: catData.downloaded || 0
    };
  };

  const activeStats = getActiveStats();

  const getFilteredCounts = () => {
    if (!selectedUserStats) return { generated: 0, sent: 0, downloaded: 0 };
    if (statsFilter === 'all') {
      return {
        generated: selectedUserStats.generated_count || 0,
        sent: selectedUserStats.sent_count || 0,
        downloaded: selectedUserStats.download_count || 0
      };
    }
    if (advancedStats && advancedStats.breakdown && advancedStats.breakdown[statsFilter]) {
      return {
        generated: advancedStats.breakdown[statsFilter].generated || 0,
        sent: advancedStats.breakdown[statsFilter].sent || 0,
        downloaded: advancedStats.breakdown[statsFilter].downloaded || 0
      };
    }
    return { generated: 0, sent: 0, downloaded: 0 };
  };

  const currentCounts = getFilteredCounts();

  // Charts Config
  const statsPieData = {
    labels: ['Generated', 'Sent via Email', 'Downloaded'],
    datasets: [{
      data: [
        activeStats.emails_generated || 0,
        activeStats.emails_sent || 0,
        activeStats.downloads || 0
      ],
      backgroundColor: ['#c89f84', '#768782', '#3e4c4e'],
      borderColor: 'rgba(255, 255, 255, 0.1)',
      borderWidth: 1,
    }]
  };

  const usersBarData = {
    labels: ['Registered Users', 'Certificates Activity'],
    datasets: [{
      label: 'System Metrics',
      data: [
        activeStats.users_count || 0,
        (activeStats.emails_generated || 0) + (activeStats.downloads || 0)
      ],
      backgroundColor: ['#c89f84', '#768782'],
      borderRadius: 6,
    }]
  };

  return (
    <div className="admin-dashboard-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <div>
          <h1 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-0.03em' }}>System Analytics</h1>
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Real-time status overview of system users and certificate delivery metrics.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                padding: '0.6rem 1.2rem',
                borderRadius: '0.6rem',
                backgroundColor: 'var(--surface)',
                border: '1px solid rgba(0,0,0,0.12)',
                color: 'var(--text-primary)',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: 'pointer',
                outline: 'none',
                minWidth: '210px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', color: 'var(--accent)' }}>
                  {categoryFilter === 'all' ? <Layers size={16} /> : categoryFilter === 'events' ? <Mail size={16} /> : categoryFilter === 'course' ? <Download size={16} /> : <Users size={16} />}
                </span>
                <span>
                  {categoryFilter === 'all' ? 'All Categories' : categoryFilter === 'events' ? 'General Events' : categoryFilter === 'course' ? 'Course Completion' : 'Project Completion'}
                </span>
              </div>
              <ChevronDown size={14} style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.7 }} />
            </button>

            {dropdownOpen && (
              <>
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }} onClick={() => setDropdownOpen(false)} />
                <div style={{
                  position: 'absolute',
                  top: '105%',
                  right: 0,
                  width: '220px',
                  backgroundColor: 'var(--bg-color)',
                  border: '1px solid rgba(0,0,0,0.08)',
                  borderRadius: '0.6rem',
                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
                  zIndex: 999,
                  overflow: 'hidden',
                  padding: '4px'
                }}>
                  {[
                    { key: 'all', label: 'All Categories', icon: <Layers size={16} /> },
                    { key: 'events', label: 'General Events', icon: <Mail size={16} /> },
                    { key: 'course', label: 'Course Completion', icon: <Download size={16} /> },
                    { key: 'project', label: 'Project Completion', icon: <Users size={16} /> }
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setCategoryFilter(item.key);
                        setDropdownOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        width: '100%',
                        padding: '0.65rem 0.85rem',
                        backgroundColor: categoryFilter === item.key ? 'rgba(53, 62, 67, 0.05)' : 'transparent',
                        border: 'none',
                        borderRadius: '0.4rem',
                        color: categoryFilter === item.key ? 'var(--primary)' : 'var(--text-secondary)',
                        fontWeight: categoryFilter === item.key ? '700' : '600',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s'
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', color: categoryFilter === item.key ? 'var(--primary)' : 'var(--text-secondary)' }}>
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button 
            className="btn" 
            onClick={() => {
              fetchAdminStats();
              fetchTemplates();
              fetchLogs();
            }} 
            disabled={refreshing} 
            style={{ 
              backgroundColor: 'var(--primary-hover)', 
              border: '1px solid var(--border)', 
              padding: '0.6rem 1.2rem', 
              borderRadius: '0.6rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Syncing...' : 'Sync Data'}
          </button>
        </div>
      </div>

      {/* Admin stats widgets */}
      <div className="grid grid-4" style={{ marginBottom: '2.5rem' }}>
        <div className="stat-card admin-stat-widget">
          <div className="widget-header">
            <span className="widget-icon-bg"><Users size={20} color="var(--accent)" /></span>
            <span className="widget-trend">+100%</span>
          </div>
          <h3>{activeStats.users_count || 0}</h3>
          <p>Total Registered Users</p>
        </div>
        <div className="stat-card admin-stat-widget">
          <div className="widget-header">
            <span className="widget-icon-bg"><Layers size={20} color="var(--accent)" /></span>
          </div>
          <h3>{activeStats.emails_generated || 0}</h3>
          <p>Certificates Generated</p>
        </div>
        <div className="stat-card admin-stat-widget">
          <div className="widget-header">
            <span className="widget-icon-bg"><Mail size={20} color="var(--accent)" /></span>
          </div>
          <h3>{activeStats.emails_sent || 0}</h3>
          <p>Successful Transmissions</p>
        </div>
        <div className="stat-card admin-stat-widget">
          <div className="widget-header">
            <span className="widget-icon-bg"><Download size={20} color="var(--accent)" /></span>
          </div>
          <h3>{activeStats.downloads || 0}</h3>
          <p>Bulk Downloads</p>
        </div>
      </div>

      {/* Tab system navigation */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        borderBottom: '2px solid var(--border)',
        marginBottom: '2rem',
        paddingBottom: '0.2rem'
      }}>
        <button
          onClick={() => setActiveTab('users')}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'users' ? 'var(--primary)' : 'var(--text-secondary)',
            fontWeight: 700,
            fontSize: '1rem',
            padding: '0.65rem 1.25rem',
            cursor: 'pointer',
            borderBottom: activeTab === 'users' ? '3px solid var(--primary)' : '3px solid transparent',
            marginBottom: '-0.35rem',
            transition: 'all 0.2s'
          }}
        >
          User Manager & Analytics
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'templates' ? 'var(--primary)' : 'var(--text-secondary)',
            fontWeight: 700,
            fontSize: '1rem',
            padding: '0.65rem 1.25rem',
            cursor: 'pointer',
            borderBottom: activeTab === 'templates' ? '3px solid var(--primary)' : '3px solid transparent',
            marginBottom: '-0.35rem',
            transition: 'all 0.2s'
          }}
        >
          Universal Templates Catalog
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'logs' ? 'var(--primary)' : 'var(--text-secondary)',
            fontWeight: 700,
            fontSize: '1rem',
            padding: '0.65rem 1.25rem',
            cursor: 'pointer',
            borderBottom: activeTab === 'logs' ? '3px solid var(--primary)' : '3px solid transparent',
            marginBottom: '-0.35rem',
            transition: 'all 0.2s'
          }}
        >
          System Audit Trail & Logs
        </button>
      </div>

      {/* Conditional rendering based on selected Tab */}
      {activeTab === 'users' && (
        <>
          {/* Admin charts */}
          <div className="grid grid-2" style={{ marginBottom: '2.5rem' }}>
            <div className="card admin-chart-card">
              <h3>Activity Distribution</h3>
              <div style={{ height: '260px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <Pie 
                  data={statsPieData} 
                  options={{ 
                    maintainAspectRatio: false, 
                    plugins: { 
                      legend: { 
                        position: 'bottom', 
                        labels: { 
                          color: 'var(--text-secondary)', 
                          font: { family: 'Inter', size: 11, weight: '500' },
                          padding: 15,
                          usePointStyle: true
                        } 
                      },
                      tooltip: {
                        backgroundColor: '#1a2324',
                        titleFont: { family: 'Inter', size: 12, weight: 'bold' },
                        bodyFont: { family: 'Inter', size: 11 },
                        padding: 10,
                        borderRadius: 8
                      }
                    } 
                  }} 
                />
              </div>
            </div>
            <div className="card admin-chart-card">
              <h3>Growth & Volumetrics</h3>
              <div style={{ height: '260px' }}>
                <Bar 
                  data={usersBarData} 
                  options={{ 
                    maintainAspectRatio: false, 
                    plugins: { 
                      legend: { display: false },
                      tooltip: {
                        backgroundColor: '#1a2324',
                        titleFont: { family: 'Inter', size: 12, weight: 'bold' },
                        bodyFont: { family: 'Inter', size: 11 },
                        padding: 10,
                        borderRadius: 8
                      }
                    }, 
                    scales: { 
                      y: { 
                        ticks: { color: 'var(--text-secondary)', font: { family: 'Inter', size: 10, weight: '500' } }, 
                        grid: { color: 'var(--border)' } 
                      }, 
                      x: { 
                        ticks: { color: 'var(--text-secondary)', font: { family: 'Inter', size: 10, weight: '500' } }, 
                        grid: { display: false } 
                      } 
                    } 
                  }} 
                />
              </div>
            </div>
          </div>

          {/* User Directory & Control */}
          <div className="card admin-table-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div>
                <h3 style={{ margin: 0 }}>Registered User Directory</h3>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Authorized credentials with system console privileges.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <button
                  onClick={() => setShowBulkModal(true)}
                  style={{
                    background: 'var(--primary)',
                    color: 'var(--text-primary)',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    transition: 'opacity 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = 0.9}
                  onMouseLeave={e => e.currentTarget.style.opacity = 1}
                >
                  <UploadCloud size={14} />
                  Bulk Upload Users
                </button>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, background: 'rgba(200, 159, 132, 0.1)', color: 'var(--accent)', padding: '0.35rem 0.75rem', borderRadius: '2rem' }}>
                  {users.length} Active Accounts
                </span>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <th>UID</th>
                    <th>Institutional Register No.</th>
                    <th>Email Address</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, idx) => (
                    <tr key={user.id}>
                      <td>{idx + 1}</td>
                      <td style={{ fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 600 }}>#{user.id}</td>
                      <td>{user.register_number}</td>
                      <td>{user.email}</td>
                      <td>
                        <span style={{ 
                          fontSize: '0.75rem', 
                          fontWeight: '700', 
                          textTransform: 'uppercase',
                          color: user.role === 'admin' ? '#ef4444' : '#64748b',
                          background: user.role === 'admin' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(100, 116, 139, 0.08)',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px'
                        }}>
                          {user.role}
                        </span>
                      </td>
                      <td>
                        <span style={{ 
                          fontSize: '0.75rem', 
                          fontWeight: '700', 
                          color: user.is_active !== false ? '#10b981' : '#f59e0b',
                          background: user.is_active !== false ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px'
                        }}>
                          {user.is_active !== false ? 'Active' : 'Pending Approval / Suspended'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button 
                            onClick={() => handleViewStatsClick(user)} 
                            style={{ 
                              background: 'rgba(62, 76, 78, 0.05)', 
                              color: 'var(--primary)', 
                              border: '1px solid rgba(62, 76, 78, 0.3)', 
                              padding: '0.35rem 0.75rem', 
                              borderRadius: '0.4rem', 
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: '700',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = 'var(--primary)';
                              e.currentTarget.style.color = '#fff';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = 'rgba(62, 76, 78, 0.05)';
                              e.currentTarget.style.color = 'var(--primary)';
                            }}
                          >
                            View Stats
                          </button>
                          <button 
                            onClick={() => handleToggleStatus(user)} 
                            style={{ 
                              background: user.is_active !== false ? 'rgba(239, 68, 68, 0.05)' : 'rgba(16, 185, 129, 0.05)', 
                              color: user.is_active !== false ? '#dc2626' : '#16a34a', 
                              border: user.is_active !== false ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)', 
                              padding: '0.35rem 0.75rem', 
                              borderRadius: '0.4rem', 
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: '700',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = user.is_active !== false ? '#dc2626' : '#16a34a';
                              e.currentTarget.style.color = '#fff';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = user.is_active !== false ? 'rgba(239, 68, 68, 0.05)' : 'rgba(16, 185, 129, 0.05)';
                              e.currentTarget.style.color = user.is_active !== false ? '#dc2626' : '#16a34a';
                            }}
                          >
                            {user.is_active !== false ? 'Suspend' : 'Approve / Activate'}
                          </button>
                          <button 
                            onClick={() => handleChangeRole(user)} 
                            style={{ 
                              background: 'rgba(100, 116, 139, 0.05)', 
                              color: '#475569', 
                              border: '1px solid rgba(100, 116, 139, 0.3)', 
                              padding: '0.35rem 0.75rem', 
                              borderRadius: '0.4rem', 
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: '700',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = '#475569';
                              e.currentTarget.style.color = '#fff';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = 'rgba(100, 116, 139, 0.05)';
                              e.currentTarget.style.color = '#475569';
                            }}
                          >
                            Toggle Role
                          </button>
                          <button 
                            onClick={() => setPasswordResetUser(user)} 
                            style={{ 
                              background: 'rgba(217, 119, 6, 0.05)', 
                              color: '#d97706', 
                              border: '1px solid rgba(217, 119, 6, 0.3)', 
                              padding: '0.35rem 0.75rem', 
                              borderRadius: '0.4rem', 
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: '700',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = '#d97706';
                              e.currentTarget.style.color = '#fff';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = 'rgba(217, 119, 6, 0.05)';
                              e.currentTarget.style.color = '#d97706';
                            }}
                          >
                            Reset Password
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '3rem' }}>
                        No users registered in the database.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'templates' && (
        <div className="card">
          <h3 style={{ marginBottom: '0.5rem', fontWeight: 800 }}>Universal Templates Catalog</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '2rem' }}>
            Browse and moderate certificate design backgrounds currently stored on the server for all category configurations.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {Object.entries(templates).map(([category, types]) => (
              <div key={category} style={{ border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.5rem', background: 'var(--surface-hover)' }}>
                <h4 style={{ margin: '0 0 1.25rem 0', textTransform: 'capitalize', fontSize: '1.2rem', color: 'var(--primary)', fontWeight: 800 }}>
                  Category: {category === 'events' ? 'General Events' : category === 'course' ? 'Course Completion' : 'Project Completion'}
                </h4>
                
                <div className={category === 'events' ? 'grid grid-2' : 'grid grid-1'}>
                  {/* Winner / Main Certificate Template */}
                  <div style={{ background: 'var(--surface)', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                        {category === 'events' ? 'Winner Template' : 'Certificate Template'}
                      </span>
                      <span style={{ 
                        fontSize: '0.7rem', 
                        fontWeight: '700', 
                        padding: '0.2rem 0.5rem', 
                        borderRadius: '12px',
                        background: types.winner.exists ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: types.winner.exists ? '#10b981' : '#ef4444'
                      }}>
                        {types.winner.exists ? 'Available' : 'Missing'}
                      </span>
                    </div>
                    {types.winner.exists ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <img 
                          src={`http://${window.location.hostname}:5000/api/preview_cert/0?category=${category}`} 
                          alt="Winner Template Preview" 
                          style={{ width: '100%', height: '140px', objectFit: 'contain', background: '#f1f5f9', borderRadius: '0.5rem', border: '1px solid var(--border)' }} 
                        />
                        <button 
                          onClick={() => handleDeleteTemplate(category, 'winner')}
                          style={{ width: '100%', padding: '0.5rem', background: '#ef4444', color: 'var(--text-primary)', border: 'none', borderRadius: '0.5rem', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem' }}
                        >
                          Delete Template
                        </button>
                      </div>
                    ) : (
                      <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border)', borderRadius: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        No file uploaded.
                      </div>
                    )}
                  </div>

                  {/* Participant Template - Only for General Events */}
                  {category === 'events' && (
                    <div style={{ background: 'var(--surface)', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Participant Template</span>
                        <span style={{ 
                          fontSize: '0.7rem', 
                          fontWeight: '700', 
                          padding: '0.2rem 0.5rem', 
                          borderRadius: '12px',
                          background: types.participant.exists ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          color: types.participant.exists ? '#10b981' : '#ef4444'
                        }}>
                          {types.participant.exists ? 'Available' : 'Missing'}
                        </span>
                      </div>
                      {types.participant.exists ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <img 
                            src={`http://${window.location.hostname}:5000/api/preview_cert/0?category=${category}`} 
                            alt="Participant Template Preview" 
                            style={{ width: '100%', height: '140px', objectFit: 'contain', background: '#f1f5f9', borderRadius: '0.5rem', border: '1px solid var(--border)' }} 
                          />
                          <button 
                            onClick={() => handleDeleteTemplate(category, 'participant')}
                            style={{ width: '100%', padding: '0.5rem', background: '#ef4444', color: 'var(--text-primary)', border: 'none', borderRadius: '0.5rem', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem' }}
                          >
                            Delete Participant Template
                          </button>
                        </div>
                      ) : (
                        <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border)', borderRadius: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          No file uploaded.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h3 style={{ margin: 0, fontWeight: 800 }}>System Audit Trail</h3>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Immutable historical event logs tracking operator signups, logins, and certificate issuances.
              </p>
            </div>
            <button 
              onClick={handleExportCSV}
              style={{
                background: 'var(--text-primary)',
                color: 'var(--text-primary)',
                border: 'none',
                padding: '0.6rem 1.25rem',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: '700',
                fontSize: '0.85rem',
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              Export Logs (CSV)
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Log ID</th>
                  <th>Timestamp</th>
                  <th>Operator Email</th>
                  <th>Action</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 600 }}>#{log.id}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td style={{ fontWeight: 600 }}>{log.user_email || 'System / Guest'}</td>
                    <td>
                      <span style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: '700', 
                        color: log.action.includes('Failed') || log.action.includes('Suspended') ? '#ef4444' : '#10b981',
                        background: log.action.includes('Failed') || log.action.includes('Suspended') ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px'
                      }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{log.details}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '3rem' }}>
                      No audit events recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View User Activity Stats Modal */}
      {selectedUserStats && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '1.25rem',
            padding: '2.5rem',
            maxWidth: '520px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
            color: 'var(--text-primary)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1.5rem', fontWeight: 800 }}>
              User Activity Stats
            </h3>
            <p style={{ margin: '0 0 1.25rem 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
              Detailed activity log for institutional ID: <strong style={{ color: 'var(--accent)' }}>{selectedUserStats.register_number}</strong> ({selectedUserStats.email})
            </p>

            {/* Category Filter Pills */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
              {['all', 'events', 'course', 'project'].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatsFilter(tab)}
                  style={{
                    background: statsFilter === tab ? 'var(--primary)' : 'var(--surface-hover)',
                    color: statsFilter === tab ? '#fff' : 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '20px',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    letterSpacing: '0.02em',
                    transition: 'all 0.2s'
                  }}
                >
                  {tab === 'all' ? 'All categories' : tab}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.85rem 1.1rem', background: 'var(--surface-hover)', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Generated Certificates</span>
                <span style={{ fontWeight: 800, color: 'var(--primary)' }}>{currentCounts.generated}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.85rem 1.1rem', background: 'var(--surface-hover)', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Emailed to Recipients (Received)</span>
                <span style={{ fontWeight: 800, color: '#10b981' }}>{currentCounts.sent}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.85rem 1.1rem', background: 'var(--surface-hover)', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Bulk Downloads</span>
                <span style={{ fontWeight: 800, color: 'var(--accent)' }}>{currentCounts.downloaded}</span>
              </div>
            </div>

            {/* Recent Activity Trail */}
            <h4 style={{ fontSize: '0.9rem', fontWeight: 800, margin: '0.5rem 0 0.5rem 0', color: 'var(--text-primary)' }}>
              Recent Activity Trail
            </h4>
            <div style={{
              maxHeight: '150px',
              overflowY: 'auto',
              border: '1px solid var(--border)',
              borderRadius: '0.5rem',
              padding: '0.5rem 0.75rem',
              background: 'var(--surface-hover)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
              marginBottom: '1.5rem'
            }}>
              {advancedStats && advancedStats.recent_logs && advancedStats.recent_logs.length > 0 ? (
                advancedStats.recent_logs.map((log, lidx) => (
                  <div key={lidx} style={{ fontSize: '0.78rem', borderBottom: lidx < advancedStats.recent_logs.length - 1 ? '1px solid var(--border)' : 'none', paddingBottom: '0.4rem', marginBottom: '0.2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--text-primary)' }}>
                      <span>{log.action}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{new Date(log.created_at).toLocaleDateString()}</span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', marginTop: '0.1rem' }}>{log.details}</div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', padding: '1rem' }}>
                  {advancedStats ? 'No recent activity logs.' : 'Loading activity logs...'}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => {
                  setSelectedUserStats(null);
                  setAdvancedStats(null);
                }}
                style={{
                  background: 'var(--text-primary)',
                  color: 'var(--text-primary)',
                  border: 'none',
                  padding: '0.6rem 1.5rem',
                  borderRadius: '0.65rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                Close Stats
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {passwordResetUser && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <form onSubmit={handlePasswordResetSubmit} style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '1.25rem',
            padding: '2.5rem',
            maxWidth: '460px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
            color: 'var(--text-primary)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1.5rem', fontWeight: 800 }}>
              Reset User Password
            </h3>
            <p style={{ margin: '0 0 1.5rem 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
              Forcing password reset for: <strong style={{ color: 'var(--accent)' }}>{passwordResetUser.email}</strong>
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '2rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>New Password</label>
              <input 
                type="text" 
                placeholder="Enter new password (min. 4 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  border: '1px solid var(--border)',
                  borderRadius: '0.5rem',
                  background: 'var(--surface)',
                  color: 'var(--text-primary)'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button 
                type="button"
                onClick={() => {
                  setPasswordResetUser(null);
                  setNewPassword('');
                }}
                style={{
                  background: 'var(--surface-hover)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                  padding: '0.6rem 1.25rem',
                  borderRadius: '0.65rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                Cancel
              </button>
              <button 
                type="submit"
                style={{
                  background: 'var(--primary)',
                  color: 'var(--text-primary)',
                  border: 'none',
                  padding: '0.6rem 1.5rem',
                  borderRadius: '0.65rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                Reset Password
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bulk User Upload Modal */}
      {showBulkModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '1.25rem',
            padding: '2rem',
            maxWidth: '520px',
            width: '90%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
            color: 'var(--text-primary)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1.5rem', fontWeight: 800 }}>
              Bulk Upload Users
            </h3>
            <p style={{ margin: '0 0 1.5rem 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
              Upload an Excel (.xlsx/.xls) or CSV (.csv) file containing user records.
            </p>

            <div style={{
              background: 'var(--surface-hover)',
              border: '1px solid var(--border)',
              borderRadius: '0.75rem',
              padding: '1rem',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              marginBottom: '1.5rem',
              lineHeight: '1.4'
            }}>
              <strong>Required format columns:</strong><br />
              • <code style={{ color: 'var(--accent)' }}>register_number</code> (Unique username/student ID)<br />
              • <code style={{ color: 'var(--accent)' }}>email</code> (Unique email address)<br />
              • <code style={{ color: 'var(--accent)' }}>password</code> (Optional, default is 123)<br />
              • <code style={{ color: 'var(--accent)' }}>role</code> (Optional: user or admin)<br />
              • <code style={{ color: 'var(--accent)' }}>is_active</code> (Optional, default is true)
            </div>

            <form onSubmit={handleBulkUploadSubmit}>
              <div 
                onClick={() => document.getElementById('admin-bulk-file-input').click()}
                style={{
                  border: '2px dashed var(--border)',
                  borderRadius: '0.75rem',
                  padding: '2rem 1.5rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: 'var(--surface-hover)',
                  marginBottom: '1.5rem',
                  transition: 'border-color 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <UploadCloud size={36} color="var(--text-secondary)" style={{ marginBottom: '0.75rem' }} />
                <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: '600' }}>
                  {bulkFile ? bulkFile.name : 'Click to select or drag Excel/CSV file here'}
                </p>
                {bulkFile && (
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    {(bulkFile.size / 1024).toFixed(1)} KB
                  </p>
                )}
                <input 
                  id="admin-bulk-file-input"
                  type="file" 
                  accept=".csv,.xlsx,.xls"
                  onChange={handleBulkFileChange}
                  style={{ display: 'none' }}
                />
              </div>

              {bulkUploading && (
                <div style={{ textAlign: 'center', margin: '1rem 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                  <RefreshCw className="spin" size={24} style={{ color: 'var(--accent)', marginBottom: '0.5rem' }} /><br />
                  Parsing spreadsheet and creating user accounts...
                </div>
              )}

              {bulkError && (
                <div style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '0.5rem',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#dc2626',
                  fontSize: '0.82rem',
                  marginBottom: '1.5rem'
                }}>
                  {bulkError}
                </div>
              )}

              {bulkResult && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div style={{ flex: 1, background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '0.5rem', padding: '0.75rem', textAlign: 'center' }}>
                      <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981', display: 'block' }}>{bulkResult.created}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Created</span>
                    </div>
                    <div style={{ flex: 1, background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '0.5rem', padding: '0.75rem', textAlign: 'center' }}>
                      <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f59e0b', display: 'block' }}>{bulkResult.skipped}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Skipped</span>
                    </div>
                  </div>

                  {bulkResult.skipped_records?.length > 0 && (
                    <div style={{
                      maxHeight: '120px',
                      overflowY: 'auto',
                      border: '1px solid var(--border)',
                      borderRadius: '0.5rem',
                      padding: '0.5rem',
                      background: 'var(--surface-hover)',
                      fontSize: '0.75rem'
                    }}>
                      <div style={{ fontWeight: 700, marginBottom: '0.25rem', color: '#f59e0b' }}>Skipped Rows:</div>
                      {bulkResult.skipped_records.map((r, i) => (
                        <div key={i} style={{ borderBottom: i < bulkResult.skipped_records.length - 1 ? '1px solid var(--border)' : 'none', padding: '0.2rem 0' }}>
                          Row {r.row} ({r.regno}): <span style={{ color: '#dc2626' }}>{r.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button 
                  type="button"
                  onClick={() => {
                    setShowBulkModal(false);
                    setBulkFile(null);
                    setBulkResult(null);
                    setBulkError('');
                  }}
                  style={{
                    background: 'var(--surface-hover)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                    padding: '0.6rem 1.25rem',
                    borderRadius: '0.65rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '0.9rem'
                  }}
                >
                  {bulkResult ? 'Close' : 'Cancel'}
                </button>
                {!bulkResult && (
                  <button 
                    type="submit"
                    disabled={!bulkFile || bulkUploading}
                    style={{
                      background: 'var(--primary)',
                      color: 'var(--text-primary)',
                      border: 'none',
                      padding: '0.6rem 1.5rem',
                      borderRadius: '0.65rem',
                      fontWeight: '700',
                      cursor: !bulkFile || bulkUploading ? 'not-allowed' : 'pointer',
                      fontSize: '0.9rem',
                      opacity: !bulkFile || bulkUploading ? 0.6 : 1
                    }}
                  >
                    Upload Users
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
