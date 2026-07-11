import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useStore } from '../data/store';
import './Sidebar.css';
import logoImg from '../assets/logo.png';

const Sidebar = ({ collapsed, setCollapsed }) => {
  const { state, dispatch } = useStore();
  const currentUser = state?.currentUser || { name: 'แอดมิน', role: 'เจ้าของร้าน', avatar: '👤' };
  const [localCollapsed, setLocalCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const isCollapsed = collapsed !== undefined ? collapsed : localCollapsed;
  const setIsCollapsed = setCollapsed || setLocalCollapsed;

  const isUserRole = currentUser?.role === 'user';
  const isSaleRole = currentUser?.role === 'sale';

  const hualianItems = [
    { path: '/pos', icon: '🛒', label: 'ขายสินค้า', disabled: isSaleRole },
    { path: '/products', icon: '📦', label: 'สินค้า', disabled: false },
    { path: '/quotation', icon: '📄', label: 'ใบเสนอราคา', disabled: false },
  ];

  const generalItems = [
    { path: '/customers', icon: '👥', label: 'ลูกค้า', disabled: isSaleRole },
    { path: '/profit-loss', icon: '📊', label: 'รายงาน', disabled: false },
    { path: '/users', icon: '🔑', label: 'การจัดการผู้ใช้งาน', disabled: isUserRole || isSaleRole },
    { path: '/settings', icon: '⚙️', label: 'ตั้งค่าข้อมูลของร้านเอง', disabled: isUserRole || isSaleRole },
  ];

  const renderNavItem = (item) => {
    if (item.disabled) {
      return (
        <div
          key={item.path}
          className="sidebar-link disabled"
          data-tooltip={`${item.label} (เฉพาะผู้ดูแล)`}
          style={{ opacity: 0.45, cursor: 'not-allowed' }}
        >
          <span className="sidebar-icon">{item.icon}</span>
          <span className="sidebar-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span>{item.label}</span>
            <span style={{ fontSize: '12px', marginLeft: 'auto' }}>🔒</span>
          </span>
        </div>
      );
    }
    return (
      <NavLink
        key={item.path}
        to={item.path}
        className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        onClick={() => setMobileOpen(false)}
        data-tooltip={item.label}
      >
        <span className="sidebar-icon">{item.icon}</span>
        <span className="sidebar-label">{item.label}</span>
        {/* Active indicator bar */}
        <span className="sidebar-active-indicator" />
      </NavLink>
    );
  };

  return (
    <>
      {/* Mobile Hamburger Button */}
      <button
        className="sidebar-mobile-toggle"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
      >
        <span className={`hamburger-icon ${mobileOpen ? 'open' : ''}`}>
          <span />
          <span />
          <span />
        </span>
      </button>

      {/* Mobile Overlay */}
      <div
        className={`sidebar-overlay ${mobileOpen ? 'visible' : ''}`}
        onClick={() => setMobileOpen(false)}
      />

      <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <img src={logoImg} className="logo-icon" alt="HUALIAN Logo" style={{ objectFit: 'contain' }} />
          <span className="logo-text">HUALIAN STORE</span>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <div className="sidebar-group-header">จัดการเครื่อง HUALIAN</div>
          {hualianItems.map(renderNavItem)}

          <div className="sidebar-group-header" style={{ marginTop: 'var(--space-md)' }}>ทั่วไป</div>
          {generalItems.map(renderNavItem)}
        </nav>

        {/* Spacer pushes bottom content down */}
        <div className="sidebar-spacer" />

        {/* Collapse Button (desktop only) */}
        <button
          className="sidebar-collapse-btn"
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
        >
          <span className={`collapse-arrow ${isCollapsed ? 'pointing-right' : ''}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </span>
          <span className="collapse-label">{isCollapsed ? '' : 'ย่อเมนู'}</span>
        </button>

        {/* User Info & Logout */}
        <div className="sidebar-user-container">
          <div className="sidebar-user">
            <div className="user-avatar">
              <span className="avatar-emoji">{currentUser.avatar || '👤'}</span>
              <span className="user-status-dot" />
            </div>
            <div className="user-info">
              <span className="user-name">{currentUser.name || 'แอดมิน'}</span>
              <span className="user-role">
                {currentUser.role === 'admin' ? 'ผู้ดูแลระบบ' : currentUser.role === 'user' ? 'พนักงานทั่วไป' : currentUser.role === 'sale' ? 'พนักงานขาย' : (currentUser.role || 'เจ้าของร้าน')}
              </span>
            </div>
          </div>
          <button
            className="sidebar-logout-btn"
            onClick={() => dispatch({ type: 'LOGOUT_USER' })}
            title="ออกจากระบบ"
          >
            <span className="logout-icon">🚪</span>
            <span className="logout-label">ออกจากระบบ</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
