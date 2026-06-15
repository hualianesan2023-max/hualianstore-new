import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useStore } from '../data/store';
import './Users.css';
import { supabase } from '../data/supabaseClient';

const Users = () => {
  const { state, dispatch } = useStore();
  const { currentUser } = state || {};

  const [usersList, setUsersList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [currentUserEdit, setCurrentUserEdit] = useState(null); // null for add, object for edit
  const [toastMessage, setToastMessage] = useState('');

  // Form State
  const [form, setForm] = useState({
    username: '',
    password: '',
    name: '',
    role: 'user',
    avatar: '👤',
  });

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Fetch users from Supabase directly
  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('id', { ascending: true });
      if (error) throw error;
      setUsersList(data || []);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Filter users
  const filteredUsers = useMemo(() => {
    return (usersList || []).filter((u) => {
      const query = searchQuery.toLowerCase().trim();
      if (!query) return true;
      return (
        (u.username && u.username.toLowerCase().includes(query)) ||
        (u.name && u.name.toLowerCase().includes(query))
      );
    });
  }, [usersList, searchQuery]);

  // Open Modal for Add
  const handleOpenAdd = () => {
    setCurrentUserEdit(null);
    setForm({
      username: '',
      password: '',
      name: '',
      role: 'user',
      avatar: '👤',
    });
    setShowModal(true);
  };

  // Open Modal for Edit
  const handleOpenEdit = (user) => {
    setCurrentUserEdit(user);
    setForm({
      username: user.username || '',
      password: user.password || '',
      name: user.name || '',
      role: user.role || 'user',
      avatar: user.avatar || '👤',
    });
    setShowModal(true);
  };

  // Handle Submit Form
  const handleSubmit = async (e) => {
    e.preventDefault();

    const usernameTrim = form.username.trim().toLowerCase();
    if (!usernameTrim || !form.password.trim() || !form.name.trim()) {
      alert('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    // Check duplicate username (except when editing the same user)
    const isDuplicate = usersList.some(
      (u) => u.username.toLowerCase() === usernameTrim && (!currentUserEdit || u.id !== currentUserEdit.id)
    );

    if (isDuplicate) {
      alert('❌ ชื่อผู้ใช้งานนี้มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น');
      return;
    }

    const payload = {
      username: form.username.trim(),
      password: form.password.trim(),
      name: form.name.trim(),
      role: form.role,
      avatar: form.avatar,
    };

    if (currentUserEdit) {
      // Edit Mode
      await dispatch({
        type: 'UPDATE_USER',
        payload: {
          id: currentUserEdit.id,
          ...payload,
        },
      });
      showToast('💾 อัปเดตข้อมูลผู้ใช้งานเรียบร้อยแล้ว');
      fetchUsers(); // Refresh list in real-time
      
      // If editing currently logged-in user, update current session info as well
      if (currentUser && currentUser.username === currentUserEdit.username) {
        dispatch({
          type: 'LOGIN_USER',
          payload: {
            username: form.username.trim(),
            name: form.name.trim(),
            role: form.role,
            avatar: form.avatar,
          }
        });
      }
    } else {
      // Add Mode
      await dispatch({
        type: 'ADD_USER',
        payload: {
          id: 'U' + Date.now(),
          ...payload,
        },
      });
      showToast('🔑 เพิ่มผู้ใช้งานใหม่เรียบร้อยแล้ว');
      fetchUsers(); // Refresh list in real-time
    }

    setShowModal(false);
  };

  // Handle Delete User
  const handleDelete = async (id, usernameVal, nameVal) => {
    // Prevent deleting primary admin account
    if (usernameVal.toLowerCase() === 'admin') {
      alert('❌ ไม่สามารถลบบัญชีหลัก "admin" ได้ เพื่อความปลอดภัยของระบบ');
      return;
    }

    // Prevent self-deletion
    if (currentUser && currentUser.username === usernameVal) {
      alert('❌ ไม่สามารถลบบัญชีที่คุณกำลังใช้งานอยู่ในขณะนี้ได้');
      return;
    }

    if (window.confirm(`คุณต้องการลบผู้ใช้งาน "${nameVal} (${usernameVal})" ใช่หรือไม่?`)) {
      await dispatch({
        type: 'DELETE_USER',
        payload: id,
      });
      showToast('🗑️ ลบข้อมูลผู้ใช้งานเรียบร้อยแล้ว');
      fetchUsers(); // Refresh list in real-time
    }
  };

  // Map roles for display
  const getRoleLabel = (role) => {
    if (role === 'admin') return { text: 'ผู้ดูแลระบบ (Admin)', className: 'role-admin' };
    if (role === 'sale') return { text: 'พนักงานขาย (Sale)', className: 'role-sale' };
    return { text: 'พนักงานทั่วไป (User)', className: 'role-user' };
  };

  const avatarsList = ['👤', '👑', '👩‍💼', '👨‍💼', '💼', '💻', '🛠️', '⚙️', '🏪', '⚡'];

  return (
    <div className="page-container">
      {/* Toast Alert */}
      {toastMessage && <div className="users-toast">{toastMessage}</div>}

      {/* Page Header */}
      <div className="page-header flex justify-between items-center" style={{ marginBottom: 'var(--space-lg)' }}>
        <div>
          <h1 className="page-title">🔑 จัดการผู้ใช้งาน</h1>
          <p className="page-subtitle">จัดการบัญชีผู้ใช้งาน กำหนดสิทธิ์การเข้าถึง และการเข้าใช้งานในระบบ HUALIAN</p>
        </div>
        <button className="btn btn-primary" onClick={handleOpenAdd}>
          ➕ เพิ่มผู้ใช้งานใหม่
        </button>
      </div>

      {/* Toolbar */}
      <div className="card users-controls" style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="input-group" style={{ maxWidth: '400px', margin: 0 }}>
          <input
            type="text"
            className="input input-search"
            placeholder="ค้นหาชื่อผู้ใช้ หรือชื่อพนักงาน..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ width: '80px', textAlign: 'center' }}>โปรไฟล์</th>
                <th>ชื่อผู้ใช้ (Username)</th>
                <th>ชื่อพนักงาน</th>
                <th>รหัสผ่าน (Password)</th>
                <th>สิทธิ์การใช้งาน</th>
                <th style={{ width: '120px', textAlign: 'center' }}>การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length > 0 ? (
                filteredUsers.map((u) => {
                  const roleInfo = getRoleLabel(u.role);
                  const isCurrent = currentUser && currentUser.username === u.username;

                  return (
                    <tr key={u.id}>
                      <td style={{ textAlign: 'center', fontSize: '1.6rem' }}>
                        {u.avatar || '👤'}
                      </td>
                      <td style={{ fontWeight: '600', fontFamily: 'monospace', fontSize: '14px' }}>
                        {u.username} {isCurrent && <span className="current-user-tag">(คุณ)</span>}
                      </td>
                      <td>{u.name}</td>
                      <td style={{ fontFamily: 'monospace', color: '#94a3b8' }}>
                        {u.password}
                      </td>
                      <td>
                        <span className={`badge-role ${roleInfo.className}`}>
                          {roleInfo.text}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="flex justify-center gap-xs">
                          <button
                            className="btn btn-secondary btn-sm"
                            title="แก้ไข"
                            onClick={() => handleOpenEdit(u)}
                          >
                            ✏️
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            title="ลบ"
                            onClick={() => handleDelete(u.id, u.username, u.name)}
                            disabled={u.username === 'admin' || isCurrent}
                            style={{
                              opacity: (u.username === 'admin' || isCurrent) ? 0.35 : 1,
                              cursor: (u.username === 'admin' || isCurrent) ? 'not-allowed' : 'pointer'
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }}>🔍</div>
                    <div style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>
                      ไม่พบข้อมูลผู้ใช้งานที่ค้นหา
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{currentUserEdit ? '✏️ แก้ไขข้อมูลผู้ใช้งาน' : '➕ เพิ่มผู้ใช้งานใหม่'}</h2>
              <button className="btn-close-modal" onClick={() => setShowModal(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              {/* Profile Avatar Selection */}
              <div className="form-group full-width">
                <label>เลือกอิโมจิโปรไฟล์</label>
                <div className="avatar-selector">
                  {avatarsList.map((av) => (
                    <button
                      key={av}
                      type="button"
                      className={`avatar-option-btn ${form.avatar === av ? 'active' : ''}`}
                      onClick={() => setForm({ ...form, avatar: av })}
                    >
                      {av}
                    </button>
                  ))}
                </div>
              </div>

              {/* Username */}
              <div className="form-group full-width">
                <label>ชื่อผู้ใช้งาน (Username) *</label>
                <input
                  type="text"
                  placeholder="เช่น somchai_d, user_pos"
                  required
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  disabled={currentUserEdit && currentUserEdit.username.toLowerCase() === 'admin'}
                  style={{
                    background: (currentUserEdit && currentUserEdit.username.toLowerCase() === 'admin') ? '#1e293b' : undefined,
                    cursor: (currentUserEdit && currentUserEdit.username.toLowerCase() === 'admin') ? 'not-allowed' : undefined,
                    color: (currentUserEdit && currentUserEdit.username.toLowerCase() === 'admin') ? '#94a3b8' : undefined
                  }}
                />
                {currentUserEdit && currentUserEdit.username.toLowerCase() === 'admin' && (
                  <span style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    ℹ️ บัญชี admin หลักไม่สามารถแก้ไขชื่อผู้ใช้ได้
                  </span>
                )}
              </div>

              {/* Password */}
              <div className="form-group full-width">
                <label>รหัสผ่าน (Password) *</label>
                <input
                  type="text"
                  placeholder="กรอกรหัสผ่านสำหรับเข้าใช้งาน..."
                  required
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>

              {/* Name */}
              <div className="form-group full-width">
                <label>ชื่อจริง/ชื่อพนักงาน *</label>
                <input
                  type="text"
                  placeholder="เช่น นายสมชาย รักดี, น้องกิ๊ฟ"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              {/* Role */}
              <div className="form-group full-width">
                <label>สิทธิ์การใช้งานระบบ *</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  required
                  disabled={currentUserEdit && currentUserEdit.username.toLowerCase() === 'admin'}
                  style={{
                    background: (currentUserEdit && currentUserEdit.username.toLowerCase() === 'admin') ? '#1e293b' : undefined,
                    cursor: (currentUserEdit && currentUserEdit.username.toLowerCase() === 'admin') ? 'not-allowed' : undefined,
                    color: (currentUserEdit && currentUserEdit.username.toLowerCase() === 'admin') ? '#94a3b8' : undefined
                  }}
                >
                  <option value="admin">🔑 ผู้ดูแลระบบ (Admin) - เข้าใช้งานได้ทุกส่วน</option>
                  <option value="user">👤 พนักงานทั่วไป (User) - เข้าใช้งานหน้าร้าน/สินค้าได้</option>
                  <option value="sale">💼 พนักงานขาย (Sale) - ดูได้เฉพาะสินค้าและรายงาน</option>
                </select>
                {currentUserEdit && currentUserEdit.username.toLowerCase() === 'admin' && (
                  <span style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    ℹ️ ไม่สามารถแก้ไขสิทธิ์ของบัญชี admin หลักได้
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="modal-actions">
                <button type="submit" className="btn btn-primary">
                  {currentUserEdit ? '💾 บันทึกการแก้ไข' : '✅ บันทึกผู้ใช้งาน'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  ยกเลิก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
