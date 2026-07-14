import React, { useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { StoreProvider, useStore } from './data/store';
import Sidebar from './components/Sidebar';
import POS from './pages/POS';
import Products from './pages/Products';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Customers from './pages/Customers';
import ProfitLoss from './pages/ProfitLoss';
import Users from './pages/Users';
import Quotation from './pages/Quotation';
import { showAlert } from './utils/alerts';
import './App.css';

function AppContent() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { state, dispatch } = useStore();
  const currentUser = state?.currentUser;

  // Inactivity timeout handler (30 minutes)
  React.useEffect(() => {
    if (!currentUser) return;

    let timeoutId;
    const timeoutDuration = 30 * 60 * 1000; // 30 minutes

    const resetTimer = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(handleLogout, timeoutDuration);
    };

    const handleLogout = () => {
      dispatch({ type: 'LOGOUT_USER' });
      showAlert(
        'หมดเวลาการใช้งาน',
        'ระบบทำการออกจากระบบอัตโนมัติเนื่องจากไม่มีการเคลื่อนไหวเป็นเวลา 30 นาที',
        'info'
      );
    };

    // Events to monitor for activity
    const activityEvents = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart'
    ];

    // Add listeners
    activityEvents.forEach((event) => {
      window.addEventListener(event, resetTimer);
    });

    // Start timer initially
    resetTimer();

    // Cleanup listeners and timer
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      activityEvents.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [currentUser, dispatch]);

  if (!currentUser) {
    return <Login />;
  }

  const isUserRole = currentUser?.role === 'user';
  const isSaleRole = currentUser?.role === 'sale';
  const defaultHome = isSaleRole ? "/products" : "/pos";

  return (
    <Router>
      <div className={`app-container ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <Sidebar collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} />
        
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to={defaultHome} replace />} />
            <Route path="/pos" element={isSaleRole ? <Navigate to="/products" replace /> : <POS />} />
            <Route path="/products" element={<Products />} />
            <Route path="/quotation" element={<Quotation />} />
            <Route path="/customers" element={isSaleRole ? <Navigate to="/products" replace /> : <Customers />} />
            <Route path="/profit-loss" element={<ProfitLoss />} />
            <Route path="/users" element={(isUserRole || isSaleRole) ? <Navigate to={defaultHome} replace /> : <Users />} />
            <Route path="/settings" element={(isUserRole || isSaleRole) ? <Navigate to={defaultHome} replace /> : <Settings />} />
            {/* Fallback route */}
            <Route path="*" element={<Navigate to={defaultHome} replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

function App() {
  return (
    <StoreProvider>
      <AppContent />
    </StoreProvider>
  );
}

export default App;
