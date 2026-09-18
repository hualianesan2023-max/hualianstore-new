import React, { useState, useMemo, useRef } from 'react';
import { useStore } from '../data/store';
import { showAlert, showConfirm } from '../utils/alerts';
import logoImg from '../assets/logo.png';
import './Repair.css';

// ── Status Config ─────────────────────────────────────────
const STATUSES = [
  { value: 'รอนัดวัน',     label: 'รอนัดวัน',     color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  icon: '🕐' },
  { value: 'รอซ่อม',       label: 'รอซ่อม',       color: '#6366f1', bg: 'rgba(99,102,241,0.15)', icon: '🔧' },
  { value: 'รออะไหล่เข้า', label: 'รออะไหล่เข้า', color: '#f97316', bg: 'rgba(249,115,22,0.15)', icon: '📦' },
  { value: 'เสร็จแล้ว',    label: 'เสร็จแล้ว',    color: '#10b981', bg: 'rgba(16,185,129,0.15)', icon: '✅' },
  { value: 'ยกเลิก',       label: 'ยกเลิก',       color: '#6b7280', bg: 'rgba(107,114,128,0.15)', icon: '❌' },
];

const getStatus = (val) => STATUSES.find(s => s.value === val) || STATUSES[0];

// ── Running ID Generator ──────────────────────────────────
function generateRepairId(existingList, prefix) {
  const now = new Date();
  const yy = String(now.getFullYear() + 543).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const monthPrefix = `${prefix}${yy}${mm}-`;
  const inMonth = (existingList || []).filter(r => r.id && r.id.startsWith(monthPrefix));
  let maxNum = 0;
  inMonth.forEach(r => {
    const n = parseInt(r.id.slice(monthPrefix.length), 10);
    if (!isNaN(n) && n > maxNum) maxNum = n;
  });
  let nextNum = maxNum + 1;
  let finalId = `${monthPrefix}${String(nextNum).padStart(3, '0')}`;
  let attempt = 0;
  while ((existingList || []).some(r => r.id === finalId) && attempt < 100) {
    nextNum++;
    finalId = `${monthPrefix}${String(nextNum).padStart(3, '0')}`;
    attempt++;
  }
  return finalId;
}

// ── Date formatter (Thai Buddhist Era) ─────────────────────
const formatDateThai = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year  = d.getFullYear() + 543;
  return `${day}/${month}/${year}`;
};

const formatNow = () => {
  const now = new Date();
  const day   = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year  = now.getFullYear() + 543;
  const h     = String(now.getHours()).padStart(2, '0');
  const m     = String(now.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${h}:${m}`;
};

// ── Repair Job Receipt (ใบรับซ่อม) ───────────────────────────
const RepairJobReceipt = ({ record, store, onClose }) => {
  const receiptRef = useRef(null);

  const handlePrint = () => {
    window.print();
  };

  if (!record) return null;

  const statusObj = getStatus(record.status);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="repair-receipt-modal" onClick={e => e.stopPropagation()}>
        {/* Action Bar */}
        <div className="repair-receipt-actions">
          <span className="repair-receipt-actions-title">🖨️ ใบรับซ่อม</span>
          <div style={{ display:'flex', gap: 8 }}>
            <button className="repair-btn repair-btn-save" onClick={handlePrint}>
              🖨️ พิมพ์
            </button>
            <button className="repair-btn repair-btn-cancel" onClick={onClose}>
              ✕ ปิด
            </button>
          </div>
        </div>

        {/* A4/A5 Paper */}
        <div className="repair-receipt-paper-wrap">
          <div className="repair-receipt-paper" ref={receiptRef} id="repair-receipt-printable">
            {/* Header */}
            <div className="rr-header">
              <div className="rr-logo-wrap">
                <img src={logoImg} alt="Logo" className="rr-logo" />
              </div>
              <div className="rr-company">
                <div className="rr-company-name">{store?.name || 'HUALIAN ESAN LTD.,PART.'}</div>
                <div className="rr-company-addr">{store?.address}</div>
                <div className="rr-company-contact">โทร: {store?.phone} | เลขผู้เสียภาษี: {store?.taxId}</div>
              </div>
            </div>

            <div className="rr-title-bar">
              <span>ใบรับซ่อม / REPAIR RECEIPT</span>
            </div>

            {/* Job Info */}
            <div className="rr-info-grid">
              <div className="rr-info-row">
                <span className="rr-label">รหัสงาน:</span>
                <span className="rr-value rr-job-id">{record.id}</span>
                <span className="rr-label">วันที่รับ:</span>
                <span className="rr-value">{formatDateThai(record.date)}</span>
              </div>
              <div className="rr-info-row">
                <span className="rr-label">ชื่อลูกค้า:</span>
                <span className="rr-value">{record.customerName}</span>
                <span className="rr-label">เบอร์โทร:</span>
                <span className="rr-value">{record.customerPhone || '-'}</span>
              </div>
              {record.customerAddress && (
                <div className="rr-info-row">
                  <span className="rr-label">ที่อยู่:</span>
                  <span className="rr-value" style={{ gridColumn: 'span 3' }}>{record.customerAddress}</span>
                </div>
              )}
            </div>

            {/* Repair Details */}
            <div className="rr-section">
              <div className="rr-section-title">รายละเอียดการซ่อม</div>
              <table className="rr-table">
                <tbody>
                  <tr>
                    <td className="rr-td-label">รุ่นเครื่อง / รายการซ่อม</td>
                    <td className="rr-td-value">{record.machineModel}</td>
                  </tr>
                  <tr>
                    <td className="rr-td-label">อาการเสีย / ปัญหา</td>
                    <td className="rr-td-value">{record.symptoms || '-'}</td>
                  </tr>
                  <tr>
                    <td className="rr-td-label">ช่างผู้รับผิดชอบ</td>
                    <td className="rr-td-value">{record.technician || '-'}</td>
                  </tr>
                  <tr>
                    <td className="rr-td-label">สถานะ</td>
                    <td className="rr-td-value">
                      <span className="rr-status-tag" style={{ color: statusObj.color, border: `1px solid ${statusObj.color}` }}>
                        {statusObj.icon} {statusObj.label}
                      </span>
                    </td>
                  </tr>
                  {record.notes && (
                    <tr>
                      <td className="rr-td-label">หมายเหตุ</td>
                      <td className="rr-td-value">{record.notes}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Cost Box */}
            <div className="rr-cost-box">
              <div className="rr-cost-row">
                <span>ค่าซ่อมประเมิน</span>
                <span>{Number(record.estimatedCost) > 0 ? `฿${Number(record.estimatedCost).toLocaleString('th-TH', {minimumFractionDigits:2})}` : '-'}</span>
              </div>
              <div className="rr-cost-row rr-cost-actual">
                <span>ค่าซ่อมจริง</span>
                <span>{Number(record.actualCost) > 0 ? `฿${Number(record.actualCost).toLocaleString('th-TH', {minimumFractionDigits:2})}` : 'รอประเมิน'}</span>
              </div>
            </div>

            {/* Signatures */}
            <div className="rr-signatures">
              <div className="rr-sig-col">
                <div className="rr-sig-line"></div>
                <div className="rr-sig-label">ผู้รับซ่อม</div>
              </div>
              <div className="rr-sig-col">
                <div className="rr-sig-line"></div>
                <div className="rr-sig-label">ลูกค้า / ผู้ฝากซ่อม</div>
              </div>
            </div>

            <div className="rr-footer">
              <div>กรุณาเก็บใบรับซ่อมนี้ไว้เป็นหลักฐานในการรับเครื่องคืน</div>
              <div className="rr-timestamp">พิมพ์เมื่อ: {formatNow()}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Status Badge ──────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const s = getStatus(status);
  return (
    <span
      className="repair-status-badge"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.color}40` }}
    >
      {s.icon} {s.label}
    </span>
  );
};

// ── Empty State ───────────────────────────────────────────
const EmptyState = ({ text }) => (
  <div className="repair-empty">
    <span style={{ fontSize: 48 }}>🔧</span>
    <p>{text}</p>
  </div>
);

// ── Repair Form Modal ─────────────────────────────────────
const RepairFormModal = ({ mode, record, onClose, onSave, isCustomer }) => {
  const [form, setForm] = useState({
    customerName:    record?.customerName    || '',
    customerPhone:   record?.customerPhone   || '',
    customerAddress: record?.customerAddress || '',
    locationUrl:     record?.locationUrl     || '',
    appointmentDate: record?.appointmentDate || '',
    machineModel:    record?.machineModel    || '',
    symptoms:        record?.symptoms        || '',
    technician:      record?.technician      || '',
    status:          record?.status          || 'รอนัดวัน',
    estimatedCost:   record?.estimatedCost   || '',
    actualCost:      record?.actualCost      || '',
    notes:           record?.notes           || '',
  });

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.customerName.trim()) { showAlert('กรุณากรอกชื่อลูกค้า', '', 'warning'); return; }
    if (!form.machineModel.trim()) { showAlert('กรุณากรอกรุ่นเครื่อง/รายการซ่อม', '', 'warning'); return; }
    onSave(form);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="repair-modal" onClick={e => e.stopPropagation()}>
        <div className="repair-modal-header">
          <h3>{mode === 'add' ? '➕ เพิ่มงานซ่อมใหม่' : '✏️ แก้ไขงานซ่อม'}</h3>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="repair-form">
          {/* Customer Info */}
          <div className="repair-form-section">
            <span className="repair-form-section-title">👤 ข้อมูลลูกค้า</span>
            <div className="repair-form-row">
              <div className="repair-form-group">
                <label>ชื่อลูกค้า *</label>
                <input value={form.customerName} onChange={set('customerName')} placeholder="ชื่อ-นามสกุล" required />
              </div>
              <div className="repair-form-group">
                <label>เบอร์โทร</label>
                <input value={form.customerPhone} onChange={set('customerPhone')} placeholder="0xx-xxx-xxxx" />
              </div>
            </div>
            <div className="repair-form-group">
              <label>ที่อยู่</label>
              <textarea value={form.customerAddress} onChange={set('customerAddress')} rows={2}
                placeholder="ที่อยู่สำหรับออกไปซ่อม/จัดส่ง" />
            </div>
            {isCustomer && (
              <div className="repair-form-group">
                <label>📍 ลิงก์โลเคชั่น (Google Maps)</label>
                <input value={form.locationUrl} onChange={set('locationUrl')}
                  placeholder="https://maps.google.com/..." />
              </div>
            )}
          </div>

          {/* Repair Details */}
          <div className="repair-form-section">
            <span className="repair-form-section-title">🔧 รายละเอียดงานซ่อม</span>
            <div className="repair-form-row">
              <div className="repair-form-group">
                <label>รุ่นเครื่อง / รายการซ่อม *</label>
                <input value={form.machineModel} onChange={set('machineModel')}
                  placeholder="เช่น FR-900S, เครื่องซีลสายพาน" required />
              </div>
              <div className="repair-form-group">
                <label>ช่างผู้รับผิดชอบ</label>
                <input value={form.technician} onChange={set('technician')} placeholder="ชื่อช่าง" />
              </div>
            </div>
            <div className="repair-form-group">
              <label>อาการเสีย / รายละเอียดปัญหา</label>
              <textarea value={form.symptoms} onChange={set('symptoms')} rows={3}
                placeholder="อธิบายอาการเสียหรือสิ่งที่ต้องซ่อม..." />
            </div>
            {isCustomer && (
              <div className="repair-form-group">
                <label>📅 วันนัดหมาย</label>
                <input type="date" value={form.appointmentDate} onChange={set('appointmentDate')} />
              </div>
            )}
          </div>

          {/* Cost & Status */}
          <div className="repair-form-section">
            <span className="repair-form-section-title">💰 ค่าใช้จ่ายและสถานะ</span>
            <div className="repair-form-row">
              <div className="repair-form-group">
                <label>สถานะ</label>
                <select value={form.status} onChange={set('status')}>
                  {STATUSES.map(s => <option key={s.value} value={s.value}>{s.icon} {s.label}</option>)}
                </select>
              </div>
              <div className="repair-form-group">
                <label>ค่าซ่อมประเมิน (บาท)</label>
                <input type="number" value={form.estimatedCost} onChange={set('estimatedCost')} placeholder="0" min="0" />
              </div>
              <div className="repair-form-group">
                <label>ค่าซ่อมจริง (บาท)</label>
                <input type="number" value={form.actualCost} onChange={set('actualCost')} placeholder="0" min="0" />
              </div>
            </div>
            <div className="repair-form-group">
              <label>หมายเหตุ</label>
              <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="หมายเหตุเพิ่มเติม..." />
            </div>
          </div>

          <div className="repair-form-footer">
            <button type="button" className="repair-btn repair-btn-cancel" onClick={onClose}>ยกเลิก</button>
            <button type="submit" className="repair-btn repair-btn-save">💾 บันทึก</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Repair Table ──────────────────────────────────────────
const RepairTable = ({ items, onEdit, onDelete, onStatusChange, isCustomer }) => {
  if (items.length === 0) return <EmptyState text="ยังไม่มีรายการซ่อม" />;
  return (
    <div className="repair-table-wrap">
      <table className="repair-table">
        <thead>
          <tr>
            <th>รหัสงาน</th>
            <th>ลูกค้า</th>
            <th>เครื่อง / อาการ</th>
            {isCustomer && <th>วันนัด</th>}
            <th>ช่าง</th>
            <th>ค่าซ่อม</th>
            <th>สถานะ</th>
            <th>จัดการ</th>
          </tr>
        </thead>
        <tbody>
          {items.map(r => (
            <tr key={r.id}>
              <td className="repair-id-cell">
                <span className="repair-id">{r.id}</span>
                <span className="repair-date-sub">{r.date}</span>
              </td>
              <td>
                <div className="repair-customer-cell">
                  <span className="repair-cust-name">{r.customerName}</span>
                  {r.customerPhone && <span className="repair-cust-phone">📞 {r.customerPhone}</span>}
                  {isCustomer && r.locationUrl && (
                    <a href={r.locationUrl} target="_blank" rel="noreferrer" className="repair-location-link">
                      📍 โลเคชั่น
                    </a>
                  )}
                </div>
              </td>
              <td>
                <div className="repair-machine-cell">
                  <span className="repair-machine-name">{r.machineModel}</span>
                  {r.symptoms && <span className="repair-symptoms-sub">{r.symptoms}</span>}
                </div>
              </td>
              {isCustomer && <td className="repair-date-cell">{r.appointmentDate || '-'}</td>}
              <td>{r.technician || '-'}</td>
              <td>
                <div className="repair-cost-cell">
                  {Number(r.actualCost) > 0
                    ? <span className="repair-cost-actual">฿{Number(r.actualCost).toLocaleString()}</span>
                    : Number(r.estimatedCost) > 0
                      ? <span className="repair-cost-est">~฿{Number(r.estimatedCost).toLocaleString()}</span>
                      : <span className="repair-cost-none">-</span>
                  }
                </div>
              </td>
              <td>
                <div className="repair-status-wrap">
                  <StatusBadge status={r.status} />
                  <select
                    className="repair-status-mini-select"
                    value={r.status}
                    onChange={(e) => onStatusChange(r.id, e.target.value)}
                    title="เปลี่ยนสถานะ"
                  >
                    {STATUSES.map(s => <option key={s.value} value={s.value}>{s.icon} {s.label}</option>)}
                  </select>
                </div>
              </td>
              <td>
                <div className="repair-action-btns">
                  <button className="repair-action-btn edit" onClick={() => onEdit(r)} title="แก้ไข">✏️</button>
                  <button className="repair-action-btn delete" onClick={() => onDelete(r.id)} title="ลบ">🗑️</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ── Main Repair Page ──────────────────────────────────────
const Repair = () => {
  const { state, dispatch } = useStore();
  const customerRepairs = state.customerRepairs || [];
  const shopRepairs     = state.shopRepairs     || [];
  const store           = state.storeInfo;

  const [activeTab, setActiveTab] = useState('customer');
  const [showModal, setShowModal]   = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [searchQuery, setSearchQuery]   = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [receiptRecord, setReceiptRecord] = useState(null); // ← ใบรับซ่อม

  const isCustomer   = activeTab === 'customer';
  const currentList  = isCustomer ? customerRepairs : shopRepairs;
  const actionPrefix = isCustomer ? 'CUSTOMER_REPAIR' : 'SHOP_REPAIR';
  const idPrefix     = isCustomer ? 'SR' : 'WS';

  const filteredList = useMemo(() => {
    let list = [...currentList].sort((a, b) => b.id.localeCompare(a.id));
    if (statusFilter !== 'all') list = list.filter(r => r.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(r =>
        r.customerName?.toLowerCase().includes(q) ||
        r.customerPhone?.includes(q) ||
        r.machineModel?.toLowerCase().includes(q) ||
        r.id?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [currentList, statusFilter, searchQuery]);

  const statusCounts = useMemo(() => {
    const counts = { all: currentList.length };
    STATUSES.forEach(s => { counts[s.value] = currentList.filter(r => r.status === s.value).length; });
    return counts;
  }, [currentList]);

  const handleDelete = async (id) => {
    const ok = await showConfirm('ลบงานซ่อมนี้?', 'ข้อมูลจะถูกลบถาวร', 'ใช่, ลบ', 'ยกเลิก');
    if (!ok) return;
    await dispatch({ type: `DELETE_${actionPrefix}`, payload: id });
  };

  const handleStatusChange = async (id, newStatus) => {
    const record = currentList.find(r => r.id === id);
    if (!record) return;
    await dispatch({ type: `UPDATE_${actionPrefix}`, payload: { ...record, status: newStatus } });
  };

  const handleSave = async (formData) => {
    const today = new Date().toISOString().split('T')[0];
    if (editRecord) {
      // Update — no receipt needed
      await dispatch({ type: `UPDATE_${actionPrefix}`, payload: { ...editRecord, ...formData } });
      setShowModal(false);
      setEditRecord(null);
    } else {
      const newId = generateRepairId(currentList, idPrefix);
      const newRecord = { id: newId, date: today, ...formData };
      const success = await dispatch({ type: `ADD_${actionPrefix}`, payload: newRecord });
      setShowModal(false);
      setEditRecord(null);
      // Show receipt only for shop repairs (in-store)
      if (!isCustomer) {
        setReceiptRecord(newRecord);
      }
    }
  };

  const switchTab = (tab) => {
    setActiveTab(tab);
    setStatusFilter('all');
    setSearchQuery('');
  };

  return (
    <div className="repair-page">
      {/* Header */}
      <div className="repair-page-header">
        <div>
          <h1 className="repair-page-title">🔧 งานซ่อม</h1>
          <p className="repair-page-subtitle">จัดการงานซ่อมลูกค้าและเครื่องหน้าร้าน</p>
        </div>
        <button className="repair-btn repair-btn-primary" onClick={() => { setEditRecord(null); setShowModal(true); }}>
          ➕ เพิ่มงานซ่อม
        </button>
      </div>

      {/* Tabs */}
      <div className="repair-tabs">
        <button className={`repair-tab-btn ${activeTab === 'customer' ? 'active' : ''}`} onClick={() => switchTab('customer')}>
          🏠 นัดซ่อมลูกค้า
          <span className="repair-tab-count">{customerRepairs.length}</span>
        </button>
        <button className={`repair-tab-btn ${activeTab === 'shop' ? 'active' : ''}`} onClick={() => switchTab('shop')}>
          🏪 เครื่องซ่อมหน้าร้าน
          <span className="repair-tab-count">{shopRepairs.length}</span>
        </button>
      </div>

      {/* Status Filter Chips */}
      <div className="repair-status-chips">
        <button
          className={`repair-status-chip ${statusFilter === 'all' ? 'active' : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          ทั้งหมด <span className="chip-count">{statusCounts.all}</span>
        </button>
        {STATUSES.map(s => (
          <button
            key={s.value}
            className={`repair-status-chip ${statusFilter === s.value ? 'active' : ''}`}
            style={statusFilter === s.value ? { borderColor: s.color, color: s.color, background: s.bg } : {}}
            onClick={() => setStatusFilter(s.value)}
          >
            {s.icon} {s.label} <span className="chip-count">{statusCounts[s.value] || 0}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="repair-search-bar">
        <span className="repair-search-icon">🔍</span>
        <input
          className="repair-search-input"
          placeholder="ค้นหาชื่อลูกค้า, เบอร์, รุ่นเครื่อง, รหัสงาน..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button className="repair-search-clear" onClick={() => setSearchQuery('')}>✕</button>
        )}
      </div>

      {/* Table */}
      <RepairTable
        items={filteredList}
        onEdit={(r) => { setEditRecord(r); setShowModal(true); }}
        onDelete={handleDelete}
        onStatusChange={handleStatusChange}
        isCustomer={isCustomer}
      />

      {/* Modal */}
      {showModal && (
        <RepairFormModal
          mode={editRecord ? 'edit' : 'add'}
          record={editRecord}
          onClose={() => { setShowModal(false); setEditRecord(null); }}
          onSave={handleSave}
          isCustomer={isCustomer}
        />
      )}

      {/* ใบรับซ่อม (Shop Repair Receipt) */}
      {receiptRecord && (
        <RepairJobReceipt
          record={receiptRecord}
          store={store}
          onClose={() => setReceiptRecord(null)}
        />
      )}
    </div>
  );
};

export default Repair;
