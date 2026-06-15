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
import './App.css';

function AppContent() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { state } = useStore();
  const currentUser = state?.currentUser;

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
