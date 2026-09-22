import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useStore } from '../data/store';
import './Customers.css';
import { showAlert, showConfirm } from '../utils/alerts';

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

  // Import Excel State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [previewList, setPreviewList] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

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

  const generateCustomerId = (customersList, offset = 0) => {
    const prefix = 'XL-';
    let maxNum = 0;
    (customersList || []).forEach((c) => {
      if (c.id && c.id.toUpperCase().startsWith(prefix)) {
        const numPartStr = c.id.slice(prefix.length);
        const numPart = parseInt(numPartStr, 10);
        if (!isNaN(numPart) && numPart > maxNum) {
          maxNum = numPart;
        }
      }
    });
    const nextNum = maxNum + 1 + offset;
    return `${prefix}${String(nextNum).padStart(5, '0')}`;
  };

  // Download Sample Excel Template
  const handleDownloadTemplate = () => {
    const sampleData = [
      {
        'ชื่อ-นามสกุล / บริษัท': 'บริษัท ทีเค แพ็ค จำกัด',
        'เบอร์โทรศัพท์': '0833748061',
        'เลขประจำตัวผู้เสียภาษี': '0105554116298',
        'ที่อยู่': '981/89-90 ถนนบางขุนเทียน-ชายทะเล แขวงแสมดำ เขตบางขุนเทียน กรุงเทพฯ 10150'
      },
      {
        'ชื่อ-นามสกุล / บริษัท': 'คุณสมชาย ดีเลิศ',
        'เบอร์โทรศัพท์': '0812345678',
        'เลขประจำตัวผู้เสียภาษี': '1234567890123',
        'ที่อยู่': '123/45 ถ.พหลโยธิน แขวงสามเสนใน เขตพญาไท กรุงเทพฯ 10400'
      },
      {
        'ชื่อ-นามสกุล / บริษัท': 'ห้างหุ้นส่วนจำกัด อึ้งย่งไถ่',
        'เบอร์โทรศัพท์': '0929595947',
        'เลขประจำตัวผู้เสียภาษี': '0303547004494',
        'ที่อยู่': '841/7 หมู่ 5 ต.หนองจะบก อ.เมือง จ.นครราชสีมา 30000'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    worksheet['!cols'] = [
      { wch: 32 }, // Name
      { wch: 18 }, // Phone
      { wch: 24 }, // Tax ID
      { wch: 55 }  // Address
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'รายชื่อลูกค้า');
    XLSX.writeFile(workbook, 'customer_import_template.xlsx');
  };

  // Parse Excel File
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processExcelFile(file);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processExcelFile(e.dataTransfer.files[0]);
    }
  };

  const processExcelFile = (file) => {
    if (!file) return;
    setImportFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          showAlert('ไม่พบข้อมูลในไฟล์', 'กรุณาตรวจสอบว่ามีข้อมูลในแผ่นงานแรกของไฟล์ Excel หรือไม่', 'warning');
          return;
        }

        const prefix = 'XL-';
        let currentMaxNum = 0;
        customers.forEach((c) => {
          if (c.id && c.id.toUpperCase().startsWith(prefix)) {
            const numPart = parseInt(c.id.slice(prefix.length), 10);
            if (!isNaN(numPart) && numPart > currentMaxNum) currentMaxNum = numPart;
          }
        });

        const mapped = [];
        let newGeneratedCount = 0;

        rawJson.forEach((row) => {
          const nameKey = Object.keys(row).find(k => {
            const key = k.trim().toLowerCase();
            return key.includes('ชื่อ') || key.includes('name') || key.includes('company') || key.includes('บริษัท') || key.includes('ลูกค้า');
          });

          const phoneKey = Object.keys(row).find(k => {
            const key = k.trim().toLowerCase();
            return key.includes('โทร') || key.includes('phone') || key.includes('tel') || key.includes('mobile');
          });

          const taxKey = Object.keys(row).find(k => {
            const key = k.trim().toLowerCase();
            return key.includes('ภาษี') || key.includes('tax');
          });

          const addrKey = Object.keys(row).find(k => {
            const key = k.trim().toLowerCase();
            return key.includes('ที่อยู่') || key.includes('address') || key.includes('addr');
          });

          const idKey = Object.keys(row).find(k => {
            const key = k.trim().toLowerCase();
            return key === 'รหัส' || key === 'รหัสลูกค้า' || key === 'id' || key === 'customer id' || key === 'code';
          });

          const name = nameKey ? String(row[nameKey]).trim() : '';
          const phone = phoneKey ? String(row[phoneKey]).trim() : '-';
          const taxId = taxKey ? String(row[taxKey]).trim() : '-';
          const address = addrKey ? String(row[addrKey]).trim() : '-';
          let custId = idKey ? String(row[idKey]).trim() : '';

          if (name) {
            if (!custId) {
              newGeneratedCount++;
              custId = `${prefix}${String(currentMaxNum + newGeneratedCount).padStart(5, '0')}`;
            }

            mapped.push({
              id: custId,
              name,
              phone: phone || '-',
              taxId: taxId || '-',
              address: address || '-'
            });
          }
        });

        if (mapped.length === 0) {
          showAlert('ไม่พบข้อมูลชื่อลูกค้า', 'กรุณาตรวจสอบว่ามีคอลัมน์ชื่อลูกค้า (เช่น "ชื่อ-นามสกุล / บริษัท" หรือ "Customer Name") หรือไม่', 'warning');
          return;
        }

        setPreviewList(mapped);
      } catch (err) {
        console.error('Error parsing Excel file:', err);
        showAlert('เกิดข้อผิดพลาดในการอ่านไฟล์', err.message || 'ไฟล์เสียหายหรือไม่ถูกต้อง', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Confirm Import Customers
  const handleConfirmImport = async () => {
    if (!previewList || previewList.length === 0) return;
    setIsImporting(true);

    try {
      await dispatch({
        type: 'ADD_CUSTOMERS_BULK',
        payload: previewList
      });

      showAlert('นำเข้าข้อมูลสำเร็จ! 🎉', `นำเข้าข้อมูลลูกค้าเรียบร้อยแล้วทั้งหมด ${previewList.length} รายการ`, 'success');
      setShowImportModal(false);
      setPreviewList([]);
      setImportFileName('');
    } catch (err) {
      console.error('Error importing customers:', err);
      showAlert('เกิดข้อผิดพลาดในการนำเข้าข้อมูล', err.message || 'กรุณาลองใหม่อีกครั้ง', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  // Handle Submit Form
  const handleSubmit = (e) => {
    e.preventDefault();

    if (!form.name.trim() || !form.phone.trim()) {
      showAlert('กรุณากรอกชื่อและเบอร์โทรศัพท์', '', 'warning');
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
  const handleDelete = async (id, name) => {
    const confirmed = await showConfirm(
      `คุณต้องการลบลูกค้า "${name}" ใช่หรือไม่?`,
      'ข้อมูลของลูกค้าจะถูกลบออกจากฐานข้อมูลอย่างถาวร',
      'ใช่, ลบเลย',
      'ยกเลิก'
    );
    if (confirmed) {
      dispatch({
        type: 'DELETE_CUSTOMER',
        payload: id,
      });
      showToast('🗑️ ลบข้อมูลลูกค้าเรียบร้อยแล้ว');
    }
  };

  return (
    <div className="page-container customers-page">
      {/* Toast Alert */}
      {toastMessage && <div className="customers-toast">{toastMessage}</div>}

      {/* Page Header */}
      <div className="page-header customers-header flex justify-between items-center" style={{ marginBottom: 'var(--space-lg)', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="page-title">👥 จัดการข้อมูลลูกค้า</h1>
          <p className="page-subtitle">จัดการรายชื่อ ที่อยู่ เบอร์โทรศัพท์ และเลขประจำตัวผู้เสียภาษีของลูกค้า</p>
        </div>
        <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
          <button 
            className="btn btn-secondary btn-import-excel" 
            onClick={() => { setPreviewList([]); setImportFileName(''); setShowImportModal(true); }}
            title="นำเข้าไฟล์ Excel หรือ CSV"
          >
            📥 นำเข้า Excel
          </button>
          <button className="btn btn-primary" onClick={handleOpenAdd}>
            ➕ เพิ่มลูกค้าใหม่
          </button>
        </div>
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
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '550px' }}>
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

      {/* Modal for Excel Import */}
      {showImportModal && (
        <div className="modal-overlay">
          <div className="modal excel-import-modal" style={{ maxWidth: '780px', width: '95%' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                📥 นำเข้ารายชื่อลูกค้าจากไฟล์ Excel
              </h3>
              <button 
                className="modal-close" 
                onClick={() => { setShowImportModal(false); setPreviewList([]); setImportFileName(''); }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Template Download Banner */}
              <div className="excel-template-banner">
                <div className="excel-template-info">
                  <span className="excel-template-icon">📄</span>
                  <div>
                    <strong style={{ display: 'block', color: 'var(--text-primary)', fontSize: '14px' }}>
                      ยังไม่มีแบบฟอร์ม?
                    </strong>
                    <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                      ดาวน์โหลดไฟล์เทมเพลต Excel ตัวอย่างที่มีหัวคอลัมน์มาตรฐานครบถ้วน
                    </span>
                  </div>
                </div>
                <button 
                  type="button" 
                  className="btn btn-secondary btn-sm btn-download-template"
                  onClick={handleDownloadTemplate}
                >
                  ⬇️ ดาวน์โหลดไฟล์ตัวอย่าง (.xlsx)
                </button>
              </div>

              {/* Upload Dropzone */}
              <div 
                className={`excel-dropzone ${dragActive ? 'drag-active' : ''} ${importFileName ? 'has-file' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  ref={fileInputRef}
                  type="file" 
                  accept=".xlsx, .xls, .csv" 
                  style={{ display: 'none' }} 
                  onChange={handleFileChange}
                />
                <div className="excel-dropzone-content">
                  <span className="excel-dropzone-icon">📊</span>
                  <div className="excel-dropzone-text">
                    {importFileName ? (
                      <>
                        <strong className="excel-filename">{importFileName}</strong>
                        <span>คลิกเพื่อเลือกไฟล์ใหม่</span>
                      </>
                    ) : (
                      <>
                        <strong>ลากและวางไฟล์ Excel (.xlsx, .xls, .csv) ที่นี่</strong>
                        <span>หรือ <span className="browse-link">คลิกเพื่อเลือกไฟล์จากเครื่อง</span></span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Preview Table */}
              {previewList.length > 0 && (
                <div className="excel-preview-section">
                  <div className="excel-preview-header">
                    <span className="excel-preview-title">
                      👁️ ตัวอย่างข้อมูลที่อ่านได้
                    </span>
                    <span className="excel-preview-badge">
                      พร้อมนำเข้า {previewList.length} รายการ
                    </span>
                  </div>

                  <div className="excel-preview-table-wrap">
                    <table className="excel-preview-table">
                      <thead>
                        <tr>
                          <th style={{ width: '100px' }}>รหัสลูกค้า</th>
                          <th style={{ width: '200px' }}>ชื่อ / บริษัท</th>
                          <th style={{ width: '120px' }}>เบอร์โทรศัพท์</th>
                          <th style={{ width: '130px' }}>เลขผู้เสียภาษี</th>
                          <th>ที่อยู่</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewList.slice(0, 10).map((row, idx) => (
                          <tr key={idx}>
                            <td><span className="customer-id-badge">{row.id}</span></td>
                            <td className="font-bold">{row.name}</td>
                            <td>{row.phone}</td>
                            <td>{row.taxId !== '-' ? row.taxId : <span className="text-muted">—</span>}</td>
                            <td className="text-secondary customer-address-cell">{row.address}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {previewList.length > 10 && (
                      <div className="excel-preview-more">
                        ... และอีก {previewList.length - 10} รายการ
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => { setShowImportModal(false); setPreviewList([]); setImportFileName(''); }}
                disabled={isImporting}
              >
                ยกเลิก
              </button>
              <button 
                type="button" 
                className="btn btn-primary"
                onClick={handleConfirmImport}
                disabled={previewList.length === 0 || isImporting}
              >
                {isImporting ? '⏳ กำลังบันทึกข้อมูล...' : `✔ ยืนยันการนำเข้า (${previewList.length} รายการ)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
