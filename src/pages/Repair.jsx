import React, { useState, useMemo, useRef } from 'react';
import { useStore } from '../data/store';
import { showAlert, showConfirm } from '../utils/alerts';
import logoImg from '../assets/logo.png';
import './Repair.css';

// ── Technician List (รายชื่อช่างประจำ 4 คน) ─────────────────
export const TECHNICIANS = [
  'ช่างนัท',
  'ช่างโน่',
  'ช่างต้า',
  'ช่างเท่ง',
];

// ── Thai Provinces List (รายชื่อจังหวัด 77 จังหวัด) ───────────
export const THAI_PROVINCES = [
  'นครราชสีมา', 'ขอนแก่น', 'บุรีรัมย์', 'สุรินทร์', 'อุบลราชธานี',
  'อุดรธานี', 'ชัยภูมิ', 'มหาสารคาม', 'ร้อยเอ็ด', 'ศรีสะเกษ',
  'สกลนคร', 'นครพนม', 'มุกดาหาร', 'ยโสธร', 'หนองคาย',
  'หนองบัวลำภู', 'อำนาจเจริญ', 'บึงกาฬ', 'เลย', 'กาฬสินธุ์',
  'กรุงเทพมหานคร', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ', 'สมุทรสาคร',
  'พระนครศรีอยุธยา', 'สระบุรี', 'ลพบุรี', 'นครนายก', 'ปราจีนบุรี',
  'ฉะเชิงเทรา', 'ชลบุรี', 'ระยอง', 'จันทบุรี', 'ตราด',
  'สระแก้ว', 'เพชรบูรณ์', 'พิษณุโลก', 'นครสวรรค์', 'กำแพงเพชร',
  'พิจิตร', 'สุโขทัย', 'อุทัยธานี', 'ตาก', 'เชียงใหม่',
  'เชียงราย', 'ลำปาง', 'ลำพูน', 'แพร่', 'น่าน',
  'พะเยา', 'แม่ฮ่องสอน', 'กาญจนบุรี', 'ราชบุรี', 'สุพรรณบุรี',
  'เพชรบุรี', 'ประจวบคีรีขันธ์', 'สมุทรสงคราม', 'นครปฐม', 'สิงห์บุรี',
  'อ่างทอง', 'ชัยนาท', 'นครศรีธรรมราช', 'สงขลา', 'สุราษฎร์ธานี',
  'ภูเก็ต', 'กระบี่', 'พังงา', 'ตรัง', 'พัทลุง',
  'ชุมพร', 'ระนอง', 'สตูล', 'ปัตตานี', 'ยะลา', 'นราธิวาส'
];

export const QUICK_PROVINCES = [
  'นครราชสีมา', 'ขอนแก่น', 'บุรีรัมย์', 'สุรินทร์', 'อุบลราชธานี', 'สระบุรี', 'อุดรธานี', 'กรุงเทพมหานคร'
];

// Helper: ดึงหรือตรวจหาชื่อจังหวัดจาก record หรือ address
export const detectProvince = (record) => {
  if (record?.province && String(record.province).trim()) {
    let p = String(record.province).trim().replace(/^จ\.|^จังหวัด/, '').trim();
    if (p === 'โคราช') p = 'นครราชสีมา';
    if (p === 'กทม' || p === 'กทม.') p = 'กรุงเทพมหานคร';
    if (p === 'อยุธยา') p = 'พระนครศรีอยุธยา';
    return p;
  }
  const textPool = [
    record?.customerAddress,
    record?.customerName,
    record?.notes,
    record?.symptoms,
    record?.locationUrl
  ].filter(Boolean).join(' ');

  if (!textPool) return '';
  if (textPool.includes('โคราช')) return 'นครราชสีมา';
  if (textPool.includes('กทม') || textPool.includes('กรุงเทพ')) return 'กรุงเทพมหานคร';
  if (textPool.includes('อยุธยา')) return 'พระนครศรีอยุธยา';
  for (const p of THAI_PROVINCES) {
    if (textPool.includes(p)) return p;
  }
  return '';
};

// ── Status Config ─────────────────────────────────────────
const STATUSES = [
  { value: 'รอนัดวัน',     label: 'รอนัดวัน',     color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  icon: '🕐' },
  { value: 'รอซ่อม',       label: 'รอซ่อม/รอส่ง', color: '#6366f1', bg: 'rgba(99,102,241,0.15)', icon: '🔧' },
  { value: 'รออะไหล่เข้า', label: 'รออะไหล่เข้า', color: '#f97316', bg: 'rgba(249,115,22,0.15)', icon: '📦' },
  { value: 'เสร็จแล้ว',    label: 'เสร็จแล้ว/ส่งแล้ว', color: '#10b981', bg: 'rgba(16,185,129,0.15)', icon: '✅' },
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
  const province = detectProvince(record);

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

        {/* Paper Canvas */}
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
                <span className="rr-value">{record.customerName} {province ? `(จ.${province})` : ''}</span>
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

// ── Repair / Delivery Form Modal ──────────────────────────
const RepairFormModal = ({ mode, record, onClose, onSave, activeTab }) => {
  const isCustomer = activeTab === 'customer';
  const isDelivery = activeTab === 'delivery';

  // Initialize custom technician state if technician is not in pre-set list
  const initialTech = record?.technician || '';
  const isCustomTech = initialTech !== '' && !TECHNICIANS.includes(initialTech);

  const [techSelect, setTechSelect] = useState(isCustomTech ? '__custom__' : initialTech);
  const [customTechName, setCustomTechName] = useState(isCustomTech ? initialTech : '');

  const [form, setForm] = useState({
    customerName:    record?.customerName    || '',
    customerPhone:   record?.customerPhone   || '',
    customerAddress: record?.customerAddress || '',
    province:        record?.province        || detectProvince(record) || '',
    locationUrl:     record?.locationUrl     || '',
    appointmentDate: record?.appointmentDate || '',
    machineModel:    record?.machineModel    || '',
    symptoms:        record?.symptoms        || '',
    technician:      initialTech,
    status:          record?.status          || 'รอนัดวัน',
    estimatedCost:   record?.estimatedCost   || '',
    actualCost:      record?.actualCost      || '',
    notes:           record?.notes           || '',
  });

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const handleTechSelectChange = (e) => {
    const val = e.target.value;
    setTechSelect(val);
    if (val !== '__custom__') {
      setForm(f => ({ ...f, technician: val }));
    } else {
      setForm(f => ({ ...f, technician: customTechName }));
    }
  };

  const handleCustomTechChange = (e) => {
    const val = e.target.value;
    setCustomTechName(val);
    setForm(f => ({ ...f, technician: val }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.customerName.trim()) { showAlert('กรุณากรอกชื่อลูกค้า', '', 'warning'); return; }
    if (!form.machineModel.trim()) {
      showAlert(isDelivery ? 'กรุณากรอกรุ่นเครื่อง/รายการที่ส่งมอบ' : 'กรุณากรอกรุ่นเครื่อง/รายการซ่อม', '', 'warning');
      return;
    }
    onSave(form);
  };

  const modalTitle = mode === 'add'
    ? (isDelivery ? '➕ เพิ่มรายการส่งเครื่องลูกค้า' : '➕ เพิ่มงานซ่อมใหม่')
    : (isDelivery ? '✏️ แก้ไขรายการส่งเครื่องลูกค้า' : '✏️ แก้ไขงานซ่อม');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="repair-modal" onClick={e => e.stopPropagation()}>
        <div className="repair-modal-header">
          <h3>{modalTitle}</h3>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="repair-form">
          {/* Customer Info */}
          <div className="repair-form-section">
            <span className="repair-form-section-title">👤 ข้อมูลลูกค้าและสถานที่</span>
            <div className="repair-form-row">
              <div className="repair-form-group">
                <label>ชื่อลูกค้า *</label>
                <input value={form.customerName} onChange={set('customerName')} placeholder="ชื่อ-นามสกุล / บริษัท" required />
              </div>
              <div className="repair-form-group">
                <label>เบอร์โทร</label>
                <input value={form.customerPhone} onChange={set('customerPhone')} placeholder="0xx-xxx-xxxx" />
              </div>
            </div>

            <div className="repair-form-row">
              <div className="repair-form-group">
                <label>📍 จังหวัด (ปลายทางที่จะไป)</label>
                <input
                  list="provinces-list"
                  value={form.province}
                  onChange={set('province')}
                  placeholder="พิมพ์หรือเลือกจังหวัด เช่น ขอนแก่น, โคราช, สระบุรี..."
                />
                <datalist id="provinces-list">
                  {THAI_PROVINCES.map(p => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
                <div className="repair-quick-provinces">
                  <span className="repair-quick-label">⚡ เลือกด่วน:</span>
                  {QUICK_PROVINCES.map(p => (
                    <button
                      key={p}
                      type="button"
                      className={`repair-quick-prov-btn ${form.province === p ? 'active' : ''}`}
                      onClick={() => setForm(f => ({ ...f, province: p }))}
                    >
                      {p === 'นครราชสีมา' ? 'โคราช' : p === 'กรุงเทพมหานคร' ? 'กทม.' : p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="repair-form-group">
                {(isCustomer || isDelivery) ? (
                  <>
                    <label>📍 ลิงก์โลเคชั่นแผนที่ (Google Maps)</label>
                    <input value={form.locationUrl} onChange={set('locationUrl')}
                      placeholder="https://maps.app.goo.gl/... หรือ พิกัด GPS" />
                  </>
                ) : (
                  <div></div>
                )}
              </div>
            </div>

            <div className="repair-form-group">
              <label>ที่อยู่ {isDelivery ? 'จัดส่ง' : 'ออกไปซ่อม'}</label>
              <textarea value={form.customerAddress} onChange={set('customerAddress')} rows={2}
                placeholder={isDelivery ? "ที่อยู่สำหรับจัดส่งเครื่องและติดตั้ง..." : "ที่อยู่สำหรับออกไปซ่อม/จัดส่ง..."} />
            </div>
          </div>

          {/* Machine / Work Details */}
          <div className="repair-form-section">
            <span className="repair-form-section-title">
              {isDelivery ? '🚚 รายละเอียดการส่งมอบเครื่อง' : '🔧 รายละเอียดงานซ่อม'}
            </span>
            <div className="repair-form-row">
              <div className="repair-form-group">
                <label>{isDelivery ? 'รุ่นเครื่อง / รายการส่งมอบ *' : 'รุ่นเครื่อง / รายการซ่อม *'}</label>
                <input value={form.machineModel} onChange={set('machineModel')}
                  placeholder={isDelivery ? "เช่น FR-900S, DZ-400 (พร้อมของแถม)" : "เช่น FR-900S, เครื่องซีลสายพาน"} required />
              </div>
              <div className="repair-form-group">
                <label>ช่างผู้รับผิดชอบ {isDelivery ? '/ ผู้ส่ง' : ''}</label>
                <select value={techSelect} onChange={handleTechSelectChange} className="repair-tech-select">
                  <option value="">-- เลือกช่างผู้รับผิดชอบ --</option>
                  {TECHNICIANS.map((tech, idx) => (
                    <option key={tech} value={tech}>
                      {idx + 1}. {tech}
                    </option>
                  ))}
                  <option value="__custom__">➕ กรอกชื่อช่างอื่น...</option>
                </select>
                {techSelect === '__custom__' && (
                  <input
                    style={{ marginTop: 6 }}
                    value={customTechName}
                    onChange={handleCustomTechChange}
                    placeholder="พิมพ์ชื่อช่าง..."
                    autoFocus
                  />
                )}
              </div>
            </div>
            <div className="repair-form-group">
              <label>{isDelivery ? 'รายละเอียดการส่ง / งานติดตั้ง / ของแถม' : 'อาการเสีย / รายละเอียดปัญหา'}</label>
              <textarea value={form.symptoms} onChange={set('symptoms')} rows={3}
                placeholder={isDelivery ? "รายละเอียดของแถม, สิ่งที่ต้องสอนใช้งาน หรือจุดติดตั้ง..." : "อธิบายอาการเสียหรือสิ่งที่ต้องซ่อม..."} />
            </div>
            {(isCustomer || isDelivery) && (
              <div className="repair-form-group">
                <label>{isDelivery ? '📅 วันนัดส่งมอบ' : '📅 วันนัดหมายซ่อม'}</label>
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
                <label>{isDelivery ? 'ค่าส่ง/บริการประเมิน (บาท)' : 'ค่าซ่อมประเมิน (บาท)'}</label>
                <input type="number" value={form.estimatedCost} onChange={set('estimatedCost')} placeholder="0" min="0" />
              </div>
              <div className="repair-form-group">
                <label>{isDelivery ? 'ค่าส่ง/บริการจริง (บาท)' : 'ค่าซ่อมจริง (บาท)'}</label>
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

// ── Repair / Delivery Table ───────────────────────────────
const RepairTable = ({
  items,
  onEdit,
  onDelete,
  onStatusChange,
  activeTab,
  sortBy,
  sortOrder,
  onToggleDateSort
}) => {
  const isCustomer = activeTab === 'customer';
  const isDelivery = activeTab === 'delivery';

  if (items.length === 0) {
    return <EmptyState text={isDelivery ? "ยังไม่มีรายการส่งเครื่องลูกค้า" : "ยังไม่มีรายการซ่อม"} />;
  }

  return (
    <div className="repair-table-wrap">
      <table className="repair-table">
        <thead>
          <tr>
            <th>รหัสงาน</th>
            <th>ลูกค้า</th>
            <th className="repair-th-province">📍 จังหวัดที่จะไป</th>
            <th>{isDelivery ? 'เครื่อง / รายการส่ง' : 'เครื่อง / อาการ'}</th>
            {(isCustomer || isDelivery) && (
              <th
                className="repair-th-date sortable"
                onClick={onToggleDateSort}
                title="คลิกเพื่อเรียงลำดับตามวันนัดหมาย"
              >
                <div className="repair-th-sortable-inner">
                  <span>📅 {isDelivery ? 'วันนัดส่ง' : 'วันนัด'}</span>
                  <span className="repair-sort-icon">
                    {sortBy === 'appointmentDate' ? (sortOrder === 'asc' ? ' 🔼' : ' 🔽') : ' ⇅'}
                  </span>
                </div>
              </th>
            )}
            <th>{isDelivery ? 'ช่างผู้ส่ง' : 'ช่าง'}</th>
            <th>{isDelivery ? 'ค่าส่ง/บริการ' : 'ค่าซ่อม'}</th>
            <th>สถานะ</th>
            <th>จัดการ</th>
          </tr>
        </thead>
        <tbody>
          {items.map(r => {
            const province = detectProvince(r);
            return (
              <tr key={r.id}>
                <td className="repair-id-cell">
                  <span className="repair-id">{r.id}</span>
                  <span className="repair-date-sub">{r.date}</span>
                </td>
                <td>
                  <div className="repair-customer-cell">
                    <span className="repair-cust-name">{r.customerName}</span>
                    {r.customerPhone && <span className="repair-cust-phone">📞 {r.customerPhone}</span>}
                    {(isCustomer || isDelivery) && r.locationUrl && (
                      <a href={r.locationUrl} target="_blank" rel="noreferrer" className="repair-location-link">
                        📍 โลเคชั่น
                      </a>
                    )}
                  </div>
                </td>
                <td className="repair-province-cell">
                  {province ? (
                    <div className="repair-province-badge-large" title={`จังหวัด: ${province}`}>
                      <span className="repair-province-pin">📍</span>
                      <span className="repair-province-name">จ.{province}</span>
                    </div>
                  ) : (
                    <span className="repair-province-none">
                      {activeTab === 'shop' ? '🏪 ซ่อมหน้าร้าน' : '— ไม่ระบุ —'}
                    </span>
                  )}
                </td>
                <td>
                  <div className="repair-machine-cell">
                    <span className="repair-machine-name">{r.machineModel}</span>
                    {r.symptoms && <span className="repair-symptoms-sub">{r.symptoms}</span>}
                  </div>
                </td>
                {(isCustomer || isDelivery) && (
                  <td className="repair-date-cell">
                    {r.appointmentDate ? (
                      <div className="repair-date-badge-large" title={`วันนัด: ${r.appointmentDate}`}>
                        <span className="repair-date-pin">📅</span>
                        <span className="repair-date-text">{r.appointmentDate}</span>
                      </div>
                    ) : (
                      <span className="repair-date-none">
                        ⏳ รอนัดวัน
                      </span>
                    )}
                  </td>
                )}
                <td>
                  <span className="repair-tech-badge">{r.technician || '-'}</span>
                </td>
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ── Main Repair Page ──────────────────────────────────────
const Repair = () => {
  const { state, dispatch } = useStore();
  const customerRepairs    = state.customerRepairs || [];
  const shopRepairs        = state.shopRepairs     || [];
  const customerDeliveries = state.customerDeliveries || [];
  const store              = state.storeInfo;

  // 3 Tabs: 'customer' | 'shop' | 'delivery'
  const [activeTab, setActiveTab] = useState('customer');
  const [showModal, setShowModal]   = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [searchQuery, setSearchQuery]   = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [datePreset, setDatePreset]     = useState('all'); // 'all' | 'today' | 'tomorrow' | 'this_week' | 'this_month' | 'no_date' | 'custom'
  const [customDate, setCustomDate]     = useState('');
  const [sortBy, setSortBy]             = useState('appointmentDate'); // 'appointmentDate' | 'id'
  const [sortOrder, setSortOrder]       = useState('asc'); // 'asc' | 'desc'
  const [receiptRecord, setReceiptRecord] = useState(null); // ← ใบรับซ่อม

  const currentList = useMemo(() => {
    if (activeTab === 'customer') return customerRepairs;
    if (activeTab === 'shop') return shopRepairs;
    return customerDeliveries;
  }, [activeTab, customerRepairs, shopRepairs, customerDeliveries]);

  const actionPrefix = useMemo(() => {
    if (activeTab === 'customer') return 'CUSTOMER_REPAIR';
    if (activeTab === 'shop') return 'SHOP_REPAIR';
    return 'CUSTOMER_DELIVERY';
  }, [activeTab]);

  const idPrefix = useMemo(() => {
    if (activeTab === 'customer') return 'SR';
    if (activeTab === 'shop') return 'WS';
    return 'DL';
  }, [activeTab]);

  const getTodayStr = () => {
    const d = new Date();
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };

  const getTomorrowStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };

  const getNext7DaysStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };

  const filteredList = useMemo(() => {
    let list = [...currentList];

    // 1. Status Filter
    if (statusFilter !== 'all') {
      list = list.filter(r => r.status === statusFilter);
    }

    // 2. Appointment Date Filter
    const today = getTodayStr();
    const tomorrow = getTomorrowStr();
    const next7Days = getNext7DaysStr();
    const ym = today.slice(0, 7);

    if (datePreset === 'today') {
      list = list.filter(r => r.appointmentDate === today);
    } else if (datePreset === 'tomorrow') {
      list = list.filter(r => r.appointmentDate === tomorrow);
    } else if (datePreset === 'this_week') {
      list = list.filter(r => r.appointmentDate && r.appointmentDate >= today && r.appointmentDate <= next7Days);
    } else if (datePreset === 'this_month') {
      list = list.filter(r => r.appointmentDate && r.appointmentDate.startsWith(ym));
    } else if (datePreset === 'no_date') {
      list = list.filter(r => !r.appointmentDate);
    } else if (datePreset === 'custom' && customDate) {
      list = list.filter(r => r.appointmentDate === customDate);
    }

    // 3. Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(r => {
        const prov = detectProvince(r).toLowerCase();
        return (
          r.customerName?.toLowerCase().includes(q) ||
          r.customerPhone?.includes(q) ||
          r.machineModel?.toLowerCase().includes(q) ||
          r.technician?.toLowerCase().includes(q) ||
          r.province?.toLowerCase().includes(q) ||
          prov.includes(q) ||
          r.appointmentDate?.includes(q) ||
          r.date?.includes(q) ||
          r.id?.toLowerCase().includes(q)
        );
      });
    }

    // 4. Sorting
    list.sort((a, b) => {
      if (sortBy === 'appointmentDate') {
        if (!a.appointmentDate && !b.appointmentDate) return (b.id || '').localeCompare(a.id || '');
        if (!a.appointmentDate) return 1;
        if (!b.appointmentDate) return -1;
        return sortOrder === 'asc'
          ? a.appointmentDate.localeCompare(b.appointmentDate)
          : b.appointmentDate.localeCompare(a.appointmentDate);
      }
      return (b.id || '').localeCompare(a.id || '');
    });

    return list;
  }, [currentList, statusFilter, datePreset, customDate, searchQuery, sortBy, sortOrder]);

  const statusCounts = useMemo(() => {
    const counts = { all: currentList.length };
    STATUSES.forEach(s => { counts[s.value] = currentList.filter(r => r.status === s.value).length; });
    return counts;
  }, [currentList]);

  const dateCounts = useMemo(() => {
    const today = getTodayStr();
    const tomorrow = getTomorrowStr();
    const next7Days = getNext7DaysStr();
    const ym = today.slice(0, 7);

    return {
      all: currentList.length,
      today: currentList.filter(r => r.appointmentDate === today).length,
      tomorrow: currentList.filter(r => r.appointmentDate === tomorrow).length,
      this_week: currentList.filter(r => r.appointmentDate && r.appointmentDate >= today && r.appointmentDate <= next7Days).length,
      this_month: currentList.filter(r => r.appointmentDate && r.appointmentDate.startsWith(ym)).length,
      no_date: currentList.filter(r => !r.appointmentDate).length,
    };
  }, [currentList]);

  const handleToggleDateSort = () => {
    if (sortBy === 'appointmentDate') {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy('appointmentDate');
      setSortOrder('asc');
    }
  };

  const handleDelete = async (id) => {
    const title = activeTab === 'delivery' ? 'ลบรายการส่งเครื่องนี้?' : 'ลบงานซ่อมนี้?';
    const ok = await showConfirm(title, 'ข้อมูลจะถูกลบถาวร', 'ใช่, ลบ', 'ยกเลิก');
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
      // Update
      await dispatch({ type: `UPDATE_${actionPrefix}`, payload: { ...editRecord, ...formData } });
      setShowModal(false);
      setEditRecord(null);
    } else {
      const newId = generateRepairId(currentList, idPrefix);
      const newRecord = { id: newId, date: today, ...formData };
      await dispatch({ type: `ADD_${actionPrefix}`, payload: newRecord });
      setShowModal(false);
      setEditRecord(null);
      // Show receipt popup only when adding a new in-store shop repair
      if (activeTab === 'shop') {
        setReceiptRecord(newRecord);
      }
    }
  };

  const switchTab = (tab) => {
    setActiveTab(tab);
    setStatusFilter('all');
    setDatePreset('all');
    setCustomDate('');
    setSearchQuery('');
  };

  const pageSubtitle = activeTab === 'delivery'
    ? 'จัดการรายการส่งมอบเครื่องจักรและติดตั้งให้ลูกค้า'
    : (activeTab === 'shop' ? 'จัดการเครื่องซ่อมหน้าร้านและออกใบรับซ่อม' : 'จัดการงานนัดหมายซ่อมเครื่องนอกสถานที่');

  const isAppointmentTab = activeTab === 'customer' || activeTab === 'delivery';

  return (
    <div className="repair-page">
      {/* Header */}
      <div className="repair-page-header">
        <div>
          <h1 className="repair-page-title">🔧 งานซ่อม & ส่งเครื่อง</h1>
          <p className="repair-page-subtitle">{pageSubtitle}</p>
        </div>
        <button className="repair-btn repair-btn-primary" onClick={() => { setEditRecord(null); setShowModal(true); }}>
          {activeTab === 'delivery' ? '➕ เพิ่มรายการส่งเครื่อง' : '➕ เพิ่มงานซ่อม'}
        </button>
      </div>

      {/* 3 Tabs */}
      <div className="repair-tabs">
        <button className={`repair-tab-btn ${activeTab === 'customer' ? 'active' : ''}`} onClick={() => switchTab('customer')}>
          🏠 นัดซ่อมลูกค้า
          <span className="repair-tab-count">{customerRepairs.length}</span>
        </button>
        <button className={`repair-tab-btn ${activeTab === 'shop' ? 'active' : ''}`} onClick={() => switchTab('shop')}>
          🏪 เครื่องซ่อมหน้าร้าน
          <span className="repair-tab-count">{shopRepairs.length}</span>
        </button>
        <button className={`repair-tab-btn ${activeTab === 'delivery' ? 'active' : ''}`} onClick={() => switchTab('delivery')}>
          🚚 ส่งเครื่องลูกค้า
          <span className="repair-tab-count">{customerDeliveries.length}</span>
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

      {/* Date Filter Bar for Customer Repair & Delivery Tabs */}
      {isAppointmentTab && (
        <div className="repair-date-filter-bar">
          <div className="repair-date-filter-left">
            <span className="repair-date-filter-label">📅 ฟิลเตอร์วันนัด:</span>
            <div className="repair-date-chips">
              <button
                className={`repair-date-chip ${datePreset === 'all' && !customDate ? 'active' : ''}`}
                onClick={() => { setDatePreset('all'); setCustomDate(''); }}
              >
                ทั้งหมด <span className="date-chip-count">{dateCounts.all}</span>
              </button>
              <button
                className={`repair-date-chip ${datePreset === 'today' ? 'active' : ''}`}
                onClick={() => { setDatePreset('today'); setCustomDate(''); }}
              >
                ⚡ วันนี้ <span className="date-chip-count">{dateCounts.today}</span>
              </button>
              <button
                className={`repair-date-chip ${datePreset === 'tomorrow' ? 'active' : ''}`}
                onClick={() => { setDatePreset('tomorrow'); setCustomDate(''); }}
              >
                พรุ่งนี้ <span className="date-chip-count">{dateCounts.tomorrow}</span>
              </button>
              <button
                className={`repair-date-chip ${datePreset === 'this_week' ? 'active' : ''}`}
                onClick={() => { setDatePreset('this_week'); setCustomDate(''); }}
              >
                7 วันข้างหน้า <span className="date-chip-count">{dateCounts.this_week}</span>
              </button>
              <button
                className={`repair-date-chip ${datePreset === 'this_month' ? 'active' : ''}`}
                onClick={() => { setDatePreset('this_month'); setCustomDate(''); }}
              >
                เดือนนี้ <span className="date-chip-count">{dateCounts.this_month}</span>
              </button>
              <button
                className={`repair-date-chip ${datePreset === 'no_date' ? 'active' : ''}`}
                onClick={() => { setDatePreset('no_date'); setCustomDate(''); }}
              >
                ⏳ รอนัดวัน <span className="date-chip-count">{dateCounts.no_date}</span>
              </button>
            </div>
          </div>

          <div className="repair-date-filter-right">
            <div className="repair-date-picker-wrap">
              <span className="repair-date-picker-icon">📆</span>
              <input
                type="date"
                className="repair-date-input"
                value={customDate}
                onChange={(e) => {
                  setCustomDate(e.target.value);
                  if (e.target.value) setDatePreset('custom');
                  else setDatePreset('all');
                }}
                title="เลือกวันที่ระบุเพื่อฟิลเตอร์"
              />
              {customDate && (
                <button
                  className="repair-date-clear-btn"
                  onClick={() => { setCustomDate(''); setDatePreset('all'); }}
                  title="ล้างวันที่เลือก"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              className={`repair-sort-btn ${sortBy === 'appointmentDate' ? 'active' : ''}`}
              onClick={handleToggleDateSort}
              title="สลับการเรียงลำดับวันนัดหมาย"
            >
              ⇅ เรียงตามวันนัด {sortBy === 'appointmentDate' ? (sortOrder === 'asc' ? '⬆️ (เร็ว-ช้า)' : '⬇️ (ช้า-เร็ว)') : ''}
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="repair-search-bar">
        <span className="repair-search-icon">🔍</span>
        <input
          className="repair-search-input"
          placeholder="ค้นหาชื่อลูกค้า, จังหวัด, วันนัด (เช่น 2026-09), เบอร์, รุ่นเครื่อง, ช่าง, รหัสงาน..."
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
        activeTab={activeTab}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onToggleDateSort={handleToggleDateSort}
      />

      {/* Modal Form */}
      {showModal && (
        <RepairFormModal
          mode={editRecord ? 'edit' : 'add'}
          record={editRecord}
          onClose={() => { setShowModal(false); setEditRecord(null); }}
          onSave={handleSave}
          activeTab={activeTab}
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


