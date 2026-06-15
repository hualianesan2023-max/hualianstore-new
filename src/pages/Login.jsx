import React, { useState } from 'react';
import { useStore } from '../data/store';
import './Login.css';
import logoImg from '../assets/logo.png';
import { supabase } from '../data/supabaseClient';

const Login = () => {
  const { dispatch } = useStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Query Supabase directly
      const { data: foundUser, error: dbError } = await supabase
        .from('users')
        .select('*')
        .eq('username', username.trim())
        .single();

      if (dbError) {
        console.error('Database error during login:', dbError);
        setError('❌ ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง');
        setIsLoading(false);
        return;
      }

      if (foundUser && foundUser.password === password) {
        dispatch({
          type: 'LOGIN_USER',
          payload: {
            username: foundUser.username,
            name: foundUser.name,
            role: foundUser.role,
            avatar: foundUser.avatar || '👤',
          },
        });
      } else {
        setError('❌ ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง');
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Connection error during login:', err);
      setError('❌ เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล');
      setIsLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-stars"></div>
      <div className="login-container">
        {/* Brand/Logo */}
        <div className="login-logo">
          <img src={logoImg} className="logo-icon" alt="HUALIAN Logo" />
          <h1>ระบบจัดการเครื่อง HUALIAN</h1>
          <p>HUALIAN Retail POS & Management System</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="login-form">
          <h2 className="form-title">เข้าสู่ระบบ</h2>
          
          {error && <div className="login-error">{error}</div>}

          <div className="login-input-group">
            <label htmlFor="username">ชื่อผู้ใช้งาน</label>
            <div className="input-with-icon">
              <span className="input-icon">👤</span>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="กรอกชื่อผู้ใช้งาน..."
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="login-input-group">
            <label htmlFor="password">รหัสผ่าน</label>
            <div className="input-with-icon">
              <span className="input-icon">🔒</span>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="กรอกรหัสผ่าน..."
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <button type="submit" className="login-submit-btn" disabled={isLoading}>
            {isLoading ? (
              <span className="loading-spinner">กำลังเข้าสู่ระบบ...</span>
            ) : (
              'เข้าสู่ระบบ 🚀'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
