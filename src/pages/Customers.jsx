import React, { useState, useMemo, useEffect } from 'react';
import { useStore } from '../data/store';
import './Customers.css';

const Customers = () => {
  const { state, dispatch } = useStore();
  const { customers = [] } = state;

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [currentCustomer, setCurrentCustomer] = useState(null); // null for add, object for edit
  const [toastMessage, setToastMessage] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  // Reset page when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Form State
  const [form, setForm] = useState({
    name: '',
    phone: '',
    taxId: '',
    address: '',
  });

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Filter customers
  const filteredCustomers = customers.filter((customer) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      (customer.name && customer.name.toLowerCase().includes(query)) ||
      (customer.phone && customer.phone.includes(query)) ||
      (customer.taxId && customer.taxId.includes(query))
    );
  });

  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);

  const paginatedCustomers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredCustomers.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredCustomers, currentPage]);

  // Open Modal for Add
  const handleOpenAdd = () => {
    setCurrentCustomer(null);
    setForm({
      name: '',
      phone: '',
      taxId: '',
      address: '',
    });
    setShowModal(true);
  };

  // Open Modal for Edit
  const handleOpenEdit = (customer) => {
    setCurrentCustomer(customer);
    setForm({
      name: customer.name || '',
      phone: customer.phone || '',
      taxId: customer.taxId || '',
      address: customer.address || '',
    });
    setShowModal(true);
  };

  const generateCustomerId = (customersList) => {
    const prefix = 'XL-';
    let maxNum = 0;
    customersList.forEach((c) => {
      if (c.id && c.id.toUpperCase().startsWith(prefix)) {
        const numPartStr = c.id.slice(prefix.length);
        const numPart = parseInt(numPartStr, 10);
        if (!isNaN(numPart) && numPart > maxNum) {
          maxNum = numPart;
        }
      }
    });
    const nextNum = maxNum + 1;
    return `${prefix}${String(nextNum).padStart(5, '0')}`;
  };

  // Handle Submit Form
  const handleSubmit = (e) => {
    e.preventDefault();

    if (!form.name.trim() || !form.phone.trim()) {
      alert('กรุณากรอกชื่อและเบอร์โทรศัพท์');
      return;
    }

    if (currentCustomer) {
      // Edit mode
      dispatch({
        type: 'UPDATE_CUSTOMER',
        payload: {
          id: currentCustomer.id,
          ...form,
        },
      });
      showToast('💾 อัปเดตข้อมูลลูกค้าเรียบร้อยแล้ว');
    } else {
      // Add mode
      const newId = generateCustomerId(customers);
      dispatch({
        type: 'ADD_CUSTOMER',
        payload: {
          id: newId,
          ...form,
        },
      });
      showToast('👤 เพิ่มลูกค้าใหม่เรียบร้อยแล้ว');
    }

    setShowModal(false);
  };

  // Handle Delete
  const handleDelete = (id, name) => {
    if (window.confirm(`คุณต้องการลบลูกค้า "${name}" ใช่หรือไม่?`)) {
      dispatch({
        type: 'DELETE_CUSTOMER',
        payload: id,
      });
      showToast('🗑️ ลบข้อมูลลูกค้าเรียบร้อยแล้ว');
    }
  };

  return (
    <div className="page-container">
      {/* Toast Alert */}
      {toastMessage && <div className="customers-toast">{toastMessage}</div>}

      {/* Page Header */}
      <div className="page-header flex justify-between items-center" style={{ marginBottom: 'var(--space-lg)' }}>
        <div>
          <h1 className="page-title">👥 จัดการข้อมูลลูกค้า</h1>
          <p className="page-subtitle">จัดการรายชื่อ ที่อยู่ เบอร์โทรศัพท์ และเลขประจำตัวผู้เสียภาษีของลูกค้า</p>
        </div>
        <button className="btn btn-primary" onClick={handleOpenAdd}>
          ➕ เพิ่มลูกค้าใหม่
        </button>
      </div>

      {/* Control Bar (Search) */}
      <div className="card" style={{ marginBottom: 'var(--space-md)', padding: 'var(--space-md)' }}>
        <div className="customers-search-bar">
          <input
            type="text"
            className="input input-search"
            placeholder="ค้นหาชื่อลูกค้า, เบอร์โทรศัพท์ หรือเลขผู้เสียภาษี..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Customers List Card */}
      <div className="card no-padding overflow-hidden">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ width: '110px' }}>รหัสลูกค้า</th>
                <th style={{ width: '200px' }}>ชื่อ-นามสกุล</th>
                <th style={{ width: '130px' }}>เบอร์โทรศัพท์</th>
                <th style={{ width: '150px' }}>เลขผู้เสียภาษี (Tax ID)</th>
                <th>ที่อยู่</th>
                <th style={{ width: '120px', textAlign: 'center' }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {paginatedCustomers.length > 0 ? (
                paginatedCustomers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <span className="customer-id-badge">{customer.id}</span>
                    </td>
                    <td className="font-bold">{customer.name}</td>
                    <td>{customer.phone}</td>
                    <td>{customer.taxId ? customer.taxId : <span className="text-muted">—</span>}</td>
                    <td className="text-secondary customer-address-cell">{customer.address}</td>
                    <td>
                      <div className="flex justify-center gap-xs">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleOpenEdit(customer)}
                          title="แก้ไข"
                        >
                          ✏️
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(customer.id, customer.name)}
                          title="ลบ"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
                    <div className="empty-state">
                      <span className="empty-state-icon">👥</span>
                      <p className="empty-state-title">ไม่พบข้อมูลลูกค้า</p>
                      <p className="empty-state-text">ทดลองค้นหาด้วยคำอื่น หรือกดปุ่ม "เพิ่มลูกค้าใหม่"</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="pagination-container" style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '16px',
            padding: '16px',
            background: 'var(--bg-secondary)',
            borderTop: '1px solid var(--border-color)',
            borderBottom: '1px solid var(--border-color)'
          }}>
            <button
              type="button"
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              style={{
                background: currentPage === 1 ? 'transparent' : 'rgba(16, 185, 129, 0.15)',
                border: currentPage === 1 ? '1px solid var(--border-color)' : '1px solid rgba(16, 185, 129, 0.3)',
                color: currentPage === 1 ? 'var(--text-muted)' : 'var(--accent-primary)',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                borderRadius: '8px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }}
            >
              ◀ ย้อนกลับ
            </button>
            <span style={{ fontSize: '13.5px', color: 'var(--text-secondary)', fontWeight: '500' }}>
              หน้า {currentPage} จาก {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              style={{
                background: currentPage === totalPages ? 'transparent' : 'rgba(16, 185, 129, 0.15)',
                border: currentPage === totalPages ? '1px solid var(--border-color)' : '1px solid rgba(16, 185, 129, 0.3)',
                color: currentPage === totalPages ? 'var(--text-muted)' : 'var(--accent-primary)',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                borderRadius: '8px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }}
            >
              ถัดไป ▶
            </button>
          </div>
        )}
      </div>

      {/* Modal Form for Add/Edit */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '550px' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {currentCustomer ? '✏️ แก้ไขข้อมูลลูกค้า' : '👥 เพิ่มลูกค้าใหม่'}
              </h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="input-group">
                  <label>ชื่อ-นามสกุล <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input
                    type="text"
                    className="input"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="เช่น นายสมชาย ดีเลิศ"
                    required
                  />
                </div>

                <div className="input-group">
                  <label>เบอร์โทรศัพท์ <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input
                    type="text"
                    className="input"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="เช่น 081-234-5678"
                    required
                  />
                </div>

                <div className="input-group">
                  <label>เลขประจำตัวผู้เสียภาษี (Tax ID)</label>
                  <input
                    type="text"
                    className="input"
                    value={form.taxId}
                    onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                    placeholder="เช่น 1234567890123"
                  />
                </div>

                <div className="input-group">
                  <label>ที่อยู่</label>
                  <textarea
                    className="input"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="เลขที่, ถนน, ตำบล, อำเภอ, จังหวัด..."
                    style={{ minHeight: '100px', resize: 'vertical' }}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  ยกเลิก
                </button>
                <button type="submit" className="btn btn-primary">
                  💾 บันทึกข้อมูล
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
