import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutDashboard, UploadCloud, Settings, LogOut, Award, ChevronDown } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Upload from './components/Upload';
import Generate from './components/Generate';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import './App.css';

// Guard component that redirects to /login if user is not authenticated
function AuthGuard({ children }) {
  const isAuthenticated = !!localStorage.getItem('user');
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

// Layout wrapper for authenticated users containing the Sidebar
function AuthenticatedLayout() {
  const navigate = useNavigate();
  const [category, setCategory] = useState(localStorage.getItem('cert_category') || 'events');
  const [isOpen, setIsOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleCategoryClick = (val) => {
    setCategory(val);
    localStorage.setItem('cert_category', val);
    // Reload dynamically to refresh all API states
    window.location.reload();
  };

  const categories = {
    events: { label: 'General Events', icon: '🏆' },
    course: { label: 'Course Completion', icon: '🎓' },
    project: { label: 'Project Completion', icon: '💻' }
  };
  const currentCat = categories[category] || categories.events;

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const role = user.role || 'user';

  if (role === 'admin') {
    return (
      <div className="admin-layout-container">
        <div className="admin-navbar-wrapper">
          <div className="admin-navbar-pill">
            <div className="admin-nav-logo">
              <Award size={20} style={{ color: 'var(--accent)' }} />
              <span>Certora Admin</span>
            </div>
            
            <div className="admin-nav-links">
              <NavLink to="/admin-dashboard" className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}>
                Dashboard
              </NavLink>
              <NavLink to="/dashboard" className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}>
                Certificates
              </NavLink>
              <NavLink to="/upload" className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}>
                Upload Excel
              </NavLink>
              <NavLink to="/generate" className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}>
                Templates Setup
              </NavLink>
            </div>
            
            <button className="admin-logout-btn" onClick={handleLogout}>
              <LogOut size={14} /> Logout
            </button>
          </div>
        </div>
        
        <div className="admin-main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/admin-dashboard" replace />} />
            <Route path="/admin-dashboard" element={<AdminDashboard />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/generate" element={<Generate />} />
          </Routes>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="sidebar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 2rem 0.5rem' }}>
          <Award size={26} style={{ color: 'var(--accent)' }} />
          <h2 style={{ color: '#fff', margin: 0, fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Certora</h2>
        </div>
        
        {/* Category Switcher - Modern Custom Tab Buttons */}
        <div style={{ margin: '0 0 2rem 0.5rem', position: 'relative' }}>
          <span style={{ color: '#e9e7e1', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.8, display: 'block', marginBottom: '0.4rem' }}>
            Active Category
          </span>
          <button
            onClick={() => setIsOpen(!isOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '0.65rem 0.85rem',
              backgroundColor: '#2f3b3c',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '0.75rem',
              color: '#fff',
              fontWeight: '600',
              fontSize: '0.86rem',
              cursor: 'pointer',
              outline: 'none',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>{currentCat.icon}</span>
              <span>{currentCat.label}</span>
            </div>
            <ChevronDown size={15} style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none', opacity: 0.8 }} />
          </button>

          {isOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '0.5rem',
                backgroundColor: '#232d2e',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '0.75rem',
                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3), 0 8px 10px -6px rgba(0,0,0,0.3)',
                zIndex: 999,
                overflow: 'hidden',
              }}
            >
              {Object.entries(categories).map(([key, value]) => (
                <div
                  key={key}
                  onClick={() => {
                    handleCategoryClick(key);
                    setIsOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.65rem 0.85rem',
                    color: category === key ? 'var(--accent)' : '#fff',
                    backgroundColor: category === key ? 'rgba(255,255,255,0.05)' : 'transparent',
                    fontSize: '0.86rem',
                    fontWeight: category === key ? '700' : '500',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = category === key ? 'rgba(255,255,255,0.05)' : 'transparent'}
                >
                  <span>{value.icon}</span>
                  <span>{value.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>
          <LayoutDashboard size={20} /> Dashboard
        </NavLink>
        <NavLink to="/upload" className={({ isActive }) => (isActive ? 'active' : '')}>
          <UploadCloud size={20} /> Upload Excel
        </NavLink>
        <NavLink to="/generate" className={({ isActive }) => (isActive ? 'active' : '')}>
          <Settings size={20} /> Templates Setup
        </NavLink>


        {/* Logout button at bottom of sidebar */}
        <button className="logout-sidebar-btn" onClick={handleLogout}>
          <LogOut size={20} /> Logout
        </button>
      </div>

      <div className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/generate" element={<Generate />} />
        </Routes>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <AuthGuard>
              <AuthenticatedLayout />
            </AuthGuard>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

