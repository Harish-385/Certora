import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { LayoutDashboard, UploadCloud, Settings, LogOut, Award, ChevronDown } from './components/SvgIcons';
import Dashboard from './components/Dashboard';
import Upload from './components/Upload';
import Generate from './components/Generate';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import VerifyPortal from './components/VerifyPortal';
import ThemeToggle from './components/ThemeToggle';
import './App.css';

// Guard component that redirects to /login if user is not authenticated
function AuthGuard({ children }) {
  const isAuthenticated = !!localStorage.getItem('user');
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

// Keeps each page mounted once visited so switching tabs doesn't reset its state/refetch data.
// Instead of <Routes> unmounting the previous page, we render every visited page and just
// show/hide them with CSS, matching the current URL.
function PersistentPages({ pages, defaultPath }) {
  const location = useLocation();
  const activePath = pages[location.pathname] ? location.pathname : defaultPath;
  const [visited, setVisited] = useState(() => new Set([activePath]));

  React.useEffect(() => {
    if (!visited.has(activePath)) {
      setVisited(prev => new Set(prev).add(activePath));
    }
  }, [activePath, visited]);

  return (
    <>
      {[...visited].filter(path => pages[path]).map(path => {
        const Page = pages[path];
        return (
          <div key={path} style={{ display: path === activePath ? 'block' : 'none' }}>
            <Page active={path === activePath} />
          </div>
        );
      })}
    </>
  );
}

// Layout wrapper for authenticated users containing the Sidebar
function AuthenticatedLayout({ theme, toggleTheme }) {
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

  const toggleUserRole = () => {
    const newRole = role === 'admin' ? 'user' : 'admin';
    const updatedUser = { ...user, role: newRole };
    localStorage.setItem('user', JSON.stringify(updatedUser));
    
    if (newRole === 'admin') {
      window.location.href = '/admin-dashboard';
    } else {
      window.location.href = '/dashboard';
    }
  };

  const isOriginalAdmin = user.email === 'admin@gmail.com' || user.email === 'admin';
  // A regular DB user with role='admin' promoted by admin CAN access admin view
  // but should NOT be able to self-toggle (only the master admin can toggle)
  // The toggleUserRole for the user sidebar is only rendered if isOriginalAdmin, so this is already safe.

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
            
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
              <button 
                onClick={toggleUserRole}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  padding: '0.5rem 0.9rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
              >
                Switch User View
              </button>
              <button className="admin-logout-btn" onClick={handleLogout}>
                <LogOut size={14} /> Logout
              </button>
            </div>
          </div>
        </div>
        
        <div className="admin-main-content">
          <PersistentPages
            defaultPath="/admin-dashboard"
            pages={{
              '/admin-dashboard': AdminDashboard,
              '/dashboard': Dashboard,
              '/upload': Upload,
              '/generate': Generate,
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="sidebar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1.25rem 0.5rem' }}>
          <Award size={26} style={{ color: 'var(--accent)' }} />
          <h2 style={{ color: '#fff', margin: 0, fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Certora</h2>
        </div>
        
        {/* Category Switcher - Premium Custom Dropdown */}
        <div style={{ margin: '0 0 1.25rem 0', position: 'relative' }}>
          <span style={{ color: '#e9e7e1', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.8, display: 'block', marginBottom: '0.45rem', paddingLeft: '0.25rem' }}>
            Active Category
          </span>
          <button
            onClick={() => setIsOpen(!isOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '0.7rem 0.95rem',
              backgroundColor: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '0.6rem',
              color: '#fff',
              fontWeight: '700',
              fontSize: '0.86rem',
              cursor: 'pointer',
              outline: 'none',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', color: 'var(--accent)' }}>
                {currentCat.icon}
              </span>
              <span>{currentCat.label}</span>
            </div>
            <ChevronDown size={14} style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none', opacity: 0.8 }} />
          </button>

          {isOpen && (
            <>
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }} onClick={() => setIsOpen(false)} />
              <div
                style={{
                  position: 'absolute',
                  top: '105%',
                  left: 0,
                  right: 0,
                  backgroundColor: '#262f30',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '0.6rem',
                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3), 0 8px 10px -6px rgba(0,0,0,0.3)',
                  zIndex: 999,
                  overflow: 'hidden',
                  padding: '4px'
                }}
              >
                {Object.entries(categories).map(([key, value]) => (
                  <button
                    key={key}
                    onClick={() => {
                      handleCategoryClick(key);
                      setIsOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                      width: '100%',
                      padding: '0.65rem 0.85rem',
                      backgroundColor: category === key ? 'var(--accent)' : 'transparent',
                      border: 'none',
                      borderRadius: '0.4rem',
                      color: category === key ? '#1d2627' : '#fff',
                      fontWeight: '700',
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s'
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', color: category === key ? '#1d2627' : 'rgba(255,255,255,0.6)' }}>
                      {value.icon}
                    </span>
                    <span>{value.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>


        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
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

        {isOriginalAdmin && (
          <button 
            onClick={toggleUserRole}
            style={{
              background: 'rgba(200, 159, 132, 0.1)',
              color: 'var(--accent)',
              border: '1px solid rgba(200, 159, 132, 0.3)',
              padding: '0.75rem 1rem',
              borderRadius: '0.75rem',
              fontSize: '0.86rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              marginTop: 'auto',
              marginBottom: '0.5rem',
              transition: 'all 0.2s',
              textAlign: 'left',
              width: '100%'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--accent)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(200, 159, 132, 0.1)';
              e.currentTarget.style.color = 'var(--accent)';
            }}
          >
            <Settings size={18} /> Switch to Admin
          </button>
        )}

        {/* Username + Logout button at bottom of sidebar */}
        <div style={{ marginTop: isOriginalAdmin ? '0' : 'auto' }}>
          {/* Username display with circular avatar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem 1rem',
            marginBottom: '0.6rem',
            borderRadius: '0.85rem',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)'
          }}>
            <div style={{ flex: 1, overflow: 'hidden', marginRight: '0.5rem' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.4)', marginBottom: '0.2rem' }}>Logged in as</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.register_number || user.email || 'User'}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.email}
              </div>
            </div>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: '#C9A47A',
              color: '#252525',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1rem',
              flexShrink: 0
            }}>
              {(user.register_number || user.email || 'H')[0].toUpperCase()}
            </div>
          </div>

          <button 
            className="logout-sidebar-btn" 
            onClick={handleLogout}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <LogOut size={20} /> Logout
            </div>
            
            {/* Subtle decorative dot shapes next to Logout */}
            <div style={{ opacity: 0.25, display: 'flex', gap: '2px', alignItems: 'center' }}>
              <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: '#fff' }}></span>
              <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: '#fff' }}></span>
              <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: '#fff' }}></span>
            </div>
          </button>
        </div>
      </div>

      <div className="main-content">
        <PersistentPages
          defaultPath="/dashboard"
          pages={{
            '/dashboard': Dashboard,
            '/upload': Upload,
            '/generate': Generate,
          }}
        />
      </div>
    </div>
  );
}

function App() {
  const [theme, setTheme] = React.useState(localStorage.getItem('theme') || 'light');

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/verify" element={<VerifyPortal theme={theme} toggleTheme={toggleTheme} />} />
        <Route path="/verify/:unique_id" element={<VerifyPortal theme={theme} toggleTheme={toggleTheme} />} />
        <Route
          path="/*"
          element={
            <AuthGuard>
              <AuthenticatedLayout theme={theme} toggleTheme={toggleTheme} />
            </AuthGuard>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

