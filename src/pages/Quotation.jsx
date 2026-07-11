import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../data/store';
import logoImg from '../assets/logo.png';
import './Quotation.css';

// ── Thai Baht Text Conversion ───────────────────────────────────
const bahtText = (num) => {
  if (num === null || num === undefined || isNaN(num)) return 'ศูนย์บาทถ้วน';
  num = Math.round(num * 100) / 100;
  if (num === 0) return 'ศูนย์บาทถ้วน';
  
  const textNumber = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const textDigit = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];
  
  const parts = num.toString().split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1] || '';
  
  let bahtStr = '';
  const length = integerPart.length;
  
  for (let i = 0; i < length; i++) {
    const digit = parseInt(integerPart.charAt(i), 10);
    const place = length - 1 - i;
    
    if (digit !== 0) {
      if (place % 6 === 0 && digit === 1 && i > 0) {
        bahtStr += 'เอ็ด';
      } else if (place % 6 === 1 && digit === 2) {
        bahtStr += 'ยี่สิบ';
      } else if (place % 6 === 1 && digit === 1) {
        bahtStr += 'สิบ';
      } else {
        bahtStr += textNumber[digit] + textDigit[place % 6];
      }
    }
    
    if (place % 6 === 0 && place > 0) {
      bahtStr += 'ล้าน';
    }
  }
  
  if (bahtStr !== '') {
    bahtStr += 'บาท';
  }
  
  let satangStr = '';
  if (decimalPart && parseInt(decimalPart, 10) > 0) {
    const paddedDecimal = decimalPart.padEnd(2, '0');
    const d1 = parseInt(paddedDecimal.charAt(0), 10) || 0;
    const d2 = parseInt(paddedDecimal.charAt(1), 10) || 0;
    
    if (d1 === 2) satangStr += 'ยี่สิบ';
    else if (d1 > 2 || (d1 === 1 && d2 > 0)) satangStr += textNumber[d1];
    
    if (d1 > 0) satangStr += 'สิบ';
    
    if (d2 > 0) {
      if (d2 === 1 && d1 > 0) satangStr += 'เอ็ด';
      else satangStr += textNumber[d2];
    }
    satangStr += 'สตางค์';
  } else {
    satangStr += 'ถ้วน';
  }
  
  return bahtStr + satangStr;
};

// ── Date Formatters ──────────────────────────────────────────────
const formatDateThaiShort = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const day = d.getDate();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear() + 543;
  return `${day}/${month}/${year}`;
};

const formatDateThaiLong = (dateStr) => {
  if (!dateStr) return '-';
  const months = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  const d = new Date(dateStr);
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear() + 543;
  return `${day} ${month} ${year}`;
};

const formatPrintTimestamp = () => {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear() + 543; // BE Year
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

// ── Number Formatter ─────────────────────────────────────────────
const formatCurrency = (amount) => {
  if (amount == null || isNaN(amount)) return '0.00';
  return Number(amount).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const Quotation = () => {
  const { state } = useStore();
  const store = state?.storeInfo || {
    name: 'ห้างหุ้นส่วนจำกัด หัวเหรียญ อีสาน HUALIAN ESAN LTD.,PART.',
    address: 'สำนักงานใหญ่ : 841/7 หมู่ 5 ต.หนองจะบก อ.เมืองนครราชสีมา จ.นครราชสีมา 30000',
    phone: '044-002716 , 084-1844310 (บัญชี) แฟ็ก. 044-248869',
    taxId: '0303547004494',
    taxRate: 7,
  };
  const currentUser = state?.currentUser;

  // Local storage quotations list
  const [quotations, setQuotations] = useState([]);
  const [activeTab, setActiveTab] = useState('history'); // history | create
  
  // Search & filter states
  const [historySearch, setHistorySearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  // Form states for creating/editing quotation
  const [editId, setEditId] = useState(null);
  const [quotationNo, setQuotationNo] = useState('');
  const [quotationDate, setQuotationDate] = useState('');
  const [customerType, setCustomerType] = useState('general'); // general | company
  const [selectedCustId, setSelectedCustId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerTaxId, setCustomerTaxId] = useState('');
  const [companyBranch, setCompanyBranch] = useState('สำนักงานใหญ่');
  
  const [validityDays, setValidityDays] = useState('30 วัน');
  const [deliveryDays, setDeliveryDays] = useState('7 วัน');
  const [paymentTerms, setPaymentTerms] = useState('โอนเงินเข้าบัญชี');
  const [salesperson, setSalesperson] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [vatType, setVatType] = useState('inclusive'); // inclusive | exclusive | none
  const [items, setItems] = useState([]);

  // Custom Item Modal State
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customQty, setCustomQty] = useState(1);
  const [customUnit, setCustomUnit] = useState('เครื่อง');

  // Preview state
  const [previewQuotation, setPreviewQuotation] = useState(null);

  // Load quotations list
  useEffect(() => {
    const saved = localStorage.getItem('pos_quotations');
    if (saved) {
      try {
        setQuotations(JSON.parse(saved));
      } catch (err) {
        console.error('Error parsing quotations:', err);
      }
    }
  }, []);

  // Sync to local storage
  const saveToLocalStorage = (newList) => {
    setQuotations(newList);
    localStorage.setItem('pos_quotations', JSON.stringify(newList));
  };

  // Generate Quotation Number
  const generateQuotationNo = (dateStr) => {
    const d = dateStr ? new Date(dateStr) : new Date();
    const yy = String(d.getFullYear() + 543).slice(-2); // BE Year short
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const prefix = `QT${yy}${mm}-`;
    
    // Find matching items from this month
    const matchPrefix = quotations.filter(q => q.id.startsWith(prefix));
    let nextNum = 1;
    if (matchPrefix.length > 0) {
      const numbers = matchPrefix.map(q => parseInt(q.id.replace(prefix, ''), 10)).filter(n => !isNaN(n));
      if (numbers.length > 0) {
        nextNum = Math.max(...numbers) + 1;
      }
    }
    return `${prefix}${String(nextNum).padStart(3, '0')}`;
  };

  // Trigger form setup on creating new
  const startNewQuotation = () => {
    const today = new Date().toISOString().split('T')[0];
    setEditId(null);
    setQuotationDate(today);
    setQuotationNo(generateQuotationNo(today));
    setCustomerType('general');
    setSelectedCustId('');
    setCustomerName('');
    setCustomerAddress('');
    setCustomerPhone('');
    setCustomerTaxId('');
    setCompanyBranch('สำนักงานใหญ่');
    setValidityDays('30 วัน');
    setDeliveryDays('7 วัน');
    setPaymentTerms('โอนเงินเข้าบัญชี');
    setSalesperson(currentUser?.name || 'ฝ่ายขาย');
    setDiscountAmount(0);
    setVatType('inclusive');
    setItems([]);
    setActiveTab('create');
  };

  // Customer Search Modal states
  const [showCustomerSearchModal, setShowCustomerSearchModal] = useState(false);
  const [customerModalQuery, setCustomerModalQuery] = useState('');
  const [customerTypeFilter, setCustomerTypeFilter] = useState('all'); // all | general | company
  const customerModalRef = useRef(null);

  // Filtered customers inside modal
  const filteredCustomersInModal = React.useMemo(() => {
    const q = customerModalQuery.toLowerCase().trim();
    let list = state.customers || [];
    if (customerTypeFilter === 'general') list = list.filter(c => c.type !== 'company');
    else if (customerTypeFilter === 'company') list = list.filter(c => c.type === 'company');
    if (!q) return list;
    return list.filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q)) ||
      (c.taxId && c.taxId.includes(q))
    );
  }, [state.customers, customerModalQuery, customerTypeFilter]);

  // Select customer from modal
  const handleSelectCustomerFromModal = (cust) => {
    setSelectedCustId(cust.id);
    setCustomerName(cust.name || '');
    setCustomerAddress(cust.address || '');
    setCustomerPhone(cust.phone || '');
    setCustomerTaxId(cust.taxId || '');
    setCustomerType(cust.type === 'company' ? 'company' : 'general');
    setShowCustomerSearchModal(false);
    setCustomerModalQuery('');
  };

  // Clear customer
  const handleClearCustomer = () => {
    setSelectedCustId('');
    setCustomerName('');
    setCustomerAddress('');
    setCustomerPhone('');
    setCustomerTaxId('');
  };

  // Legacy dropdown Customer Select (keep for backward compat)
  const handleCustomerSelect = (custId) => {
    setSelectedCustId(custId);
    if (!custId) {
      setCustomerName('');
      setCustomerAddress('');
      setCustomerPhone('');
      setCustomerTaxId('');
      return;
    }
    const cust = state.customers.find(c => c.id === custId);
    if (cust) {
      setCustomerName(cust.name);
      setCustomerAddress(cust.address || '');
      setCustomerPhone(cust.phone || '');
      setCustomerTaxId(cust.taxId || '');
    }
  };

  // Add Item to Quotation
  const addItemToQuotation = (product, priceType = 'sellPrice') => {
    // Check if product already in items
    const existingIdx = items.findIndex(item => item.productId === product.id);
    if (existingIdx !== -1) {
      const newItems = [...items];
      newItems[existingIdx].quantity += 1;
      setItems(newItems);
    } else {
      const price = priceType === 'branchPrice' ? product.branchPrice : (priceType === 'costPrice' ? product.costPrice : product.sellPrice);
      setItems([...items, {
        productId: product.id,
        name: product.name,
        barcode: product.barcode,
        quantity: 1,
        sellPrice: price,
        unit: product.unit || 'เครื่อง'
      }]);
    }
  };

  // Add Custom Manual Item
  const handleAddCustomItem = (e) => {
    e.preventDefault();
    if (!customName.trim() || isNaN(customPrice) || Number(customPrice) < 0) return;

    setItems([...items, {
      productId: `custom-${Date.now()}`,
      name: customName.trim(),
      barcode: 'CUSTOM',
      quantity: Number(customQty) || 1,
      sellPrice: Number(customPrice),
      unit: customUnit || 'เครื่อง'
    }]);

    // Reset modal fields
    setCustomName('');
    setCustomPrice('');
    setCustomQty(1);
    setCustomUnit('เครื่อง');
    setShowCustomModal(false);
  };

  // Update Item Property
  const updateItemProp = (idx, prop, val) => {
    const newItems = [...items];
    newItems[idx][prop] = val;
    setItems(newItems);
  };

  // Remove Item
  const removeItem = (idx) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  // Calculate Subtotal, VAT, Total
  const calculateTotals = (currentItems, discount, currentVatType) => {
    const rawSubtotal = currentItems.reduce((sum, item) => sum + (item.sellPrice * item.quantity), 0);
    const postDiscount = Math.max(0, rawSubtotal - Number(discount || 0));
    
    let subtotal = postDiscount;
    let tax = 0;
    let total = postDiscount;

    if (currentVatType === 'inclusive') {
      subtotal = postDiscount / 1.07;
      tax = postDiscount - subtotal;
      total = postDiscount;
    } else if (currentVatType === 'exclusive') {
      subtotal = postDiscount;
      tax = postDiscount * 0.07;
      total = postDiscount + tax;
    } else {
      subtotal = postDiscount;
      tax = 0;
      total = postDiscount;
    }

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      total: Math.round(total * 100) / 100,
      rawSubtotal
    };
  };

  const totals = calculateTotals(items, discountAmount, vatType);

  // Save Quotation Handler
  const handleSaveQuotation = (e) => {
    e.preventDefault();
    if (!customerName.trim()) {
      alert('กรุณากรอกชื่อลูกค้าหรือชื่อบริษัท');
      return;
    }
    if (items.length === 0) {
      alert('กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ');
      return;
    }

    const { subtotal, tax, total } = totals;
    
    const newQuotation = {
      id: quotationNo.trim() || generateQuotationNo(quotationDate),
      date: quotationDate,
      customerType,
      customerId: selectedCustId || null,
      customerName: customerName.trim(),
      customerAddress: customerAddress.trim(),
      customerPhone: customerPhone.trim(),
      customerTaxId: customerTaxId.trim(),
      companyBranch: customerType === 'company' ? companyBranch.trim() : null,
      validityDays,
      deliveryDays,
      paymentTerms,
      salesperson,
      discountAmount: Number(discountAmount),
      vatType,
      subtotal,
      tax,
      total,
      items
    };

    let updatedList = [];
    if (editId) {
      // Edit existing
      updatedList = quotations.map(q => q.id === editId ? newQuotation : q);
    } else {
      // Add new
      // Check duplicate Quotation ID
      const dup = quotations.some(q => q.id === newQuotation.id);
      if (dup) {
        newQuotation.id = generateQuotationNo(quotationDate);
      }
      updatedList = [newQuotation, ...quotations];
    }

    saveToLocalStorage(updatedList);
    setEditId(null);
    setActiveTab('history');
  };

  // Edit Quotation (Load into form)
  const handleEditQuotation = (q) => {
    setEditId(q.id);
    setQuotationNo(q.id);
    setQuotationDate(q.date);
    setCustomerType(q.customerType || 'general');
    setSelectedCustId(q.customerId || '');
    setCustomerName(q.customerName || '');
    setCustomerAddress(q.customerAddress || '');
    setCustomerPhone(q.customerPhone || '');
    setCustomerTaxId(q.customerTaxId || '');
    setCompanyBranch(q.companyBranch || 'สำนักงานใหญ่');
    setValidityDays(q.validityDays || '30 วัน');
    setDeliveryDays(q.deliveryDays || '7 วัน');
    setPaymentTerms(q.paymentTerms || 'โอนเงินเข้าบัญชี');
    setSalesperson(q.salesperson || '');
    setDiscountAmount(q.discountAmount || 0);
    setVatType(q.vatType || 'inclusive');
    setItems(q.items || []);
    setActiveTab('create');
  };

  // Delete Quotation
  const handleDeleteQuotation = (id) => {
    if (window.confirm(`ต้องการลบใบเสนอราคาเลขที่ ${id} ใช่หรือไม่?`)) {
      const newList = quotations.filter(q => q.id !== id);
      saveToLocalStorage(newList);
    }
  };

  // Filter products catalog
  const filteredProducts = state.products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(productSearch.toLowerCase()) || 
                          p.id.toLowerCase().includes(productSearch.toLowerCase()) ||
                          p.barcode.toLowerCase().includes(productSearch.toLowerCase());
    const matchesCategory = selectedCategory ? p.category === selectedCategory : true;
    return matchesSearch && matchesCategory;
  });

  // Filter history quotations list
  const filteredHistory = quotations.filter(q => {
    return q.id.toLowerCase().includes(historySearch.toLowerCase()) ||
           q.customerName.toLowerCase().includes(historySearch.toLowerCase()) ||
           (q.salesperson && q.salesperson.toLowerCase().includes(historySearch.toLowerCase()));
  });

  return (
    <div className="quotation-page">
      <div className="quotation-header">
        <h1>
          <span className="icon">📄</span>
          ใบเสนอราคา
          <span className="subtitle">Quotation Management</span>
        </h1>
        
        <div className="tab-buttons">
          <button 
            className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            📋 ประวัติใบเสนอราคา
          </button>
          <button 
            className={`tab-btn ${activeTab === 'create' ? 'active' : ''}`}
            onClick={startNewQuotation}
          >
            ➕ ออกใบเสนอราคาใหม่
          </button>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────── */}
      {/* TAB: HISTORY LIST */}
      {/* ──────────────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="history-tab-content">
          <div className="toolbar-section">
            <div className="search-box">
              <span className="search-icon">🔍</span>
              <input 
                type="text" 
                placeholder="ค้นหาเลขที่, ชื่อลูกค้า, หรือผู้เสนอราคา..." 
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
            </div>
            <div className="total-badge">
              ใบเสนอราคาทั้งหมด: {filteredHistory.length} รายการ
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📄</div>
              <h3>ยังไม่มีข้อมูลใบเสนอราคา</h3>
              <p>สามารถกดปุ่ม "ออกใบเสนอราคาใหม่" เพื่อเริ่มสร้างได้ทันที</p>
              <button className="btn-primary" onClick={startNewQuotation}>
                เริ่มสร้างใบเสนอราคา
              </button>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="quotation-history-table">
                <thead>
                  <tr>
                    <th>เลขที่เอกสาร</th>
                    <th>วันที่ออก</th>
                    <th>ลูกค้า / บริษัท</th>
                    <th style={{ textAlign: 'center' }}>ประเภทลูกค้า</th>
                    <th style={{ textAlign: 'right' }}>ยอดรวมสุทธิ</th>
                    <th>ผู้เสนอราคา</th>
                    <th style={{ textAlign: 'center' }}>การจัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((q) => (
                    <tr key={q.id}>
                      <td className="font-bold text-indigo">{q.id}</td>
                      <td>{formatDateThaiShort(q.date)}</td>
                      <td>
                        <div className="cust-info-cell">
                          <span className="name">{q.customerName}</span>
                          {q.companyBranch && <span className="branch">({q.companyBranch})</span>}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${q.customerType === 'company' ? 'company' : 'personal'}`}>
                          {q.customerType === 'company' ? '🏢 บริษัท' : '👤 บุคคลธรรมดา'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }} className="font-bold text-emerald">
                        ฿{formatCurrency(q.total)}
                      </td>
                      <td>{q.salesperson || '-'}</td>
                      <td>
                        <div className="action-buttons">
                          <button 
                            className="btn-action view" 
                            title="พิมพ์ใบเสนอราคา"
                            onClick={() => setPreviewQuotation(q)}
                          >
                            🖨️ พิมพ์
                          </button>
                          <button 
                            className="btn-action edit" 
                            title="แก้ไข"
                            onClick={() => handleEditQuotation(q)}
                          >
                            ✏️ แก้ไข
                          </button>
                          <button 
                            className="btn-action delete" 
                            title="ลบ"
                            onClick={() => handleDeleteQuotation(q.id)}
                          >
                            🗑️ ลบ
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* TAB: CREATE / EDIT */}
      {/* ──────────────────────────────────────────────────────── */}
      {activeTab === 'create' && (
        <form className="create-tab-content" onSubmit={handleSaveQuotation}>
          
          <div className="quotation-grid-layout">
            
            {/* COLUMN LEFT: CUSTOMER DETAILS & TERMS */}
            <div className="grid-col-left card-glass">
              <h2 className="section-title">
                <span>👤</span> ข้อมูลลูกค้าและข้อกำหนดเอกสาร
              </h2>

              {/* Customer Type Selector */}
              <div className="form-group">
                <label className="input-label">ประเภทลูกค้า</label>
                <div className="segmented-selector">
                  <button 
                    type="button"
                    className={`seg-btn ${customerType === 'general' ? 'active' : ''}`}
                    onClick={() => setCustomerType('general')}
                  >
                    👤 ลูกค้าบุคคลธรรมดา
                  </button>
                  <button 
                    type="button"
                    className={`seg-btn ${customerType === 'company' ? 'active' : ''}`}
                    onClick={() => setCustomerType('company')}
                  >
                    🏢 ลูกค้าบริษัท / ห้างร้าน
                  </button>
                </div>
              </div>


              {/* Customer Search Bar (replaces old dropdown) */}
              <div className="form-group">
                <label className="input-label">ดึงข้อมูลลูกค้าเก่า (ถ้ามี)</label>

                {/* If customer already selected, show customer chip */}
                {selectedCustId ? (
                  <div className="customer-chip">
                    <div className="customer-chip-left">
                      <span className="cust-chip-icon">{customerType === 'company' ? '🏢' : '👤'}</span>
                      <div className="cust-chip-info">
                        <span className="cust-chip-name">{customerName}</span>
                        <span className="cust-chip-meta">{customerPhone || 'ไม่มีเบอร์โทร'} · <span className={`cust-type-mini ${customerType}`}>{customerType === 'company' ? 'บริษัท' : 'บุคคลธรรมดา'}</span></span>
                      </div>
                    </div>
                    <div className="cust-chip-actions">
                      <button type="button" className="cust-chip-change" onClick={() => setShowCustomerSearchModal(true)} title="เปลี่ยนลูกค้า">
                        🔄 เปลี่ยน
                      </button>
                      <button type="button" className="cust-chip-clear" onClick={handleClearCustomer} title="ล้างข้อมูล">
                        ✕
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="cust-search-bar">
                    <button
                      type="button"
                      className="cust-search-input-btn"
                      onClick={() => setShowCustomerSearchModal(true)}
                    >
                      <span className="cust-search-placeholder-icon">🔍</span>
                      <span className="cust-search-placeholder-text">พิมพ์ชื่อ, บริษัท หรือเบอร์โทรเพื่อค้นหาลูกค้า...</span>
                      <span className="cust-search-open-icon">↗</span>
                    </button>
                  </div>
                )}
              </div>


              {/* Customer Info Form */}
              <div className="customer-info-inputs">
                <div className="form-group">
                  <label className="input-label required">
                    {customerType === 'company' ? 'ชื่อบริษัท/นิติบุคคล' : 'ชื่อลูกค้า/ผู้ติดต่อ'}
                  </label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder={customerType === 'company' ? 'เช่น บริษัท หัวเหรียญ จำกัด' : 'เช่น นายสมชาย ดีเลิศ'}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                  />
                </div>

                {customerType === 'company' && (
                  <div className="form-group">
                    <label className="input-label">สาขา</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="เช่น สำนักงานใหญ่ หรือ สาขาที่ 00001"
                      value={companyBranch}
                      onChange={(e) => setCompanyBranch(e.target.value)}
                    />
                  </div>
                )}

                <div className="form-group">
                  <label className="input-label">ที่อยู่จัดส่ง/ออกเอกสาร</label>
                  <textarea 
                    className="form-input" 
                    rows="3"
                    placeholder="เลขที่ หมู่บ้าน ตำบล อำเภอ จังหวัด..."
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="input-label">เบอร์โทรศัพท์</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="0xx-xxxxxxx"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="input-label">เลขประจำตัวผู้เสียภาษี (TAX ID)</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="เลข 13 หลัก"
                      value={customerTaxId}
                      onChange={(e) => setCustomerTaxId(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="divider-line" />

              <h2 className="section-title">
                <span>📅</span> ข้อกำหนดใบเสนอราคา
              </h2>

              <div className="form-row">
                <div className="form-group">
                  <label className="input-label required">เลขที่ใบเสนอราคา</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={quotationNo}
                    readOnly
                    style={{ backgroundColor: '#161925', cursor: 'not-allowed', color: '#94a3b8' }}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="input-label required">วันที่ออกเอกสาร</label>
                  <input 
                    type="date" 
                    className="form-input" 
                    value={quotationDate}
                    readOnly
                    style={{ backgroundColor: '#161925', cursor: 'not-allowed', color: '#94a3b8' }}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="input-label">ยืนยันราคาภายใน</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="เช่น 30 วัน"
                    value={validityDays}
                    readOnly
                    style={{ backgroundColor: '#161925', cursor: 'not-allowed', color: '#94a3b8' }}
                  />
                </div>
                <div className="form-group">
                  <label className="input-label">กำหนดส่งของ</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="เช่น ภายใน 7 วัน"
                    value={deliveryDays}
                    readOnly
                    style={{ backgroundColor: '#161925', cursor: 'not-allowed', color: '#94a3b8' }}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="input-label">เงื่อนไขการชำระเงิน</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="เช่น โอนเงินเข้าบัญชี หรือ เครดิต 30 วัน"
                    value={paymentTerms}
                    readOnly
                    style={{ backgroundColor: '#161925', cursor: 'not-allowed', color: '#94a3b8' }}
                  />
                </div>
                <div className="form-group">
                  <label className="input-label">ผู้เสนอราคา (ฝ่ายขาย)</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="ชื่อผู้ทำเอกสาร"
                    value={salesperson}
                    readOnly
                    style={{ backgroundColor: '#161925', cursor: 'not-allowed', color: '#94a3b8' }}
                  />
                </div>
              </div>

            </div>

            {/* COLUMN RIGHT: PRODUCTS SELECTOR & BASKET */}
            <div className="grid-col-right card-glass">
              <h2 className="section-title">
                <span>🛒</span> เลือกเครื่องจักร / สินค้า
              </h2>

              <div className="product-selector-box">
                {/* Product Search Filters */}
                <div className="product-search-inputs">
                  <input 
                    type="text" 
                    className="product-search-input"
                    placeholder="พิมพ์ค้นหา ชื่อเครื่อง หรือ รหัส..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                  <select
                    className="product-category-select"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                  >
                    <option value="">ทุกหมวดหมู่</option>
                    {state.categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                  <button 
                    type="button" 
                    className="btn-custom-item"
                    onClick={() => setShowCustomModal(true)}
                  >
                    ✍️ เพิ่มรายการพิเศษเอง
                  </button>
                </div>

                {/* Products Dropdown Scroll list */}
                <div className="product-dropdown-list">
                  {filteredProducts.length === 0 ? (
                    <div className="p-list-empty">ไม่พบสินค้าในระบบคลัง</div>
                  ) : (
                    filteredProducts.slice(0, 10).map(product => {
                      const stockTotal = (product.stockOffice || 0) + (product.stockKookkai || 0) + (product.stockBig || 0);
                      return (
                        <div key={product.id} className="catalog-product-row">
                          <div className="product-details">
                            <span className="prod-name font-bold">{product.name}</span>
                            <span className="prod-meta">
                              รหัส: {product.id} | คงเหลือ: {stockTotal} {product.unit}
                            </span>
                          </div>
                          <div className="price-add-actions">
                            <button 
                              type="button"
                              className="btn-price-select sell"
                              onClick={() => addItemToQuotation(product, 'sellPrice')}
                              title="เพิ่มด้วย ราคาขายปกติ"
                            >
                              ขาย: ฿{formatCurrency(product.sellPrice)}
                            </button>
                            <button 
                              type="button"
                              className="btn-price-select branch"
                              onClick={() => addItemToQuotation(product, 'branchPrice')}
                              title="เพิ่มด้วย ราคาสาขา"
                            >
                              สาขา: ฿{formatCurrency(product.branchPrice)}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="divider-line" />

              <h2 className="section-title">
                <span>📝</span> รายการสินค้าในใบเสนอราคา
              </h2>

              {/* Basket Items Table */}
              <div className="basket-table-wrapper">
                {items.length === 0 ? (
                  <div className="basket-empty-msg">ยังไม่มีสินค้าในรายการจัดทำใบเสนอราคา</div>
                ) : (
                  <table className="basket-table">
                    <thead>
                      <tr>
                        <th style={{ width: '5%' }}>#</th>
                        <th style={{ width: '45%' }}>รายการเครื่องจักร</th>
                        <th style={{ width: '15%', textAlign: 'center' }}>จำนวน</th>
                        <th style={{ width: '10%' }}>หน่วย</th>
                        <th style={{ width: '15%', textAlign: 'right' }}>ราคา/หน่วย</th>
                        <th style={{ width: '10%' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={item.productId}>
                          <td>{idx + 1}</td>
                          <td>
                            <div className="basket-item-desc">
                              <span className="font-bold">{item.name}</span>
                              <span className="sub-code">รหัส: {item.productId}</span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input 
                              type="number" 
                              className="table-qty-input"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateItemProp(idx, 'quantity', parseInt(e.target.value, 10) || 1)}
                            />
                          </td>
                          <td>
                            <input 
                              type="text" 
                              className="table-unit-input"
                              value={item.unit}
                              onChange={(e) => updateItemProp(idx, 'unit', e.target.value)}
                            />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <input 
                              type="number" 
                              className="table-price-input"
                              value={item.sellPrice}
                              onChange={(e) => updateItemProp(idx, 'sellPrice', parseFloat(e.target.value) || 0)}
                            />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button 
                              type="button" 
                              className="btn-row-delete"
                              onClick={() => removeItem(idx)}
                            >
                              ❌
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Basket Financial Footer Calculations */}
              <div className="basket-totals-card">
                
                {/* VAT Select option */}
                <div className="vat-discount-row">
                  <div className="form-group flex-1">
                    <label className="input-label">การคำนวณภาษี (VAT)</label>
                    <select
                      className="form-input"
                      value={vatType}
                      onChange={(e) => setVatType(e.target.value)}
                    >
                      <option value="inclusive">รวมภาษีมูลค่าเพิ่ม 7% แล้ว (VAT Inclusive)</option>
                      <option value="exclusive">แยกภาษีมูลค่าเพิ่ม 7% (VAT Exclusive)</option>
                      <option value="none">ไม่มีภาษีมูลค่าเพิ่ม / ยกเว้น VAT</option>
                    </select>
                  </div>
                  
                  <div className="form-group flex-1">
                    <label className="input-label">ส่วนลดพิเศษท้ายบิล (บาท)</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      min="0"
                      value={discountAmount}
                      onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <div className="calculation-lines border-top">
                  <div className="calc-line">
                    <span>รวมราคาสินค้าดิบ (ก่อนส่วนลด):</span>
                    <span>฿{formatCurrency(totals.rawSubtotal)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="calc-line text-red font-bold">
                      <span>หักส่วนลดพิเศษ:</span>
                      <span>-฿{formatCurrency(discountAmount)}</span>
                    </div>
                  )}
                  <div className="calc-line">
                    <span>มูลค่าราคาสินค้าก่อน VAT:</span>
                    <span>฿{formatCurrency(totals.subtotal)}</span>
                  </div>
                  <div className="calc-line">
                    <span>ภาษีมูลค่าเพิ่ม (VAT 7%):</span>
                    <span>{totals.tax > 0 ? `฿${formatCurrency(totals.tax)}` : 'ยกเว้น'}</span>
                  </div>
                  <div className="calc-line total highlight-net">
                    <span>ยอดเงินสุทธิทั้งสิ้น (Net Grand Total):</span>
                    <span>฿{formatCurrency(totals.total)}</span>
                  </div>
                </div>

                {/* Form Action buttons */}
                <div className="form-footer-buttons">
                  <button 
                    type="button"
                    className="btn-secondary"
                    onClick={() => setActiveTab('history')}
                  >
                    ยกเลิก / ย้อนกลับ
                  </button>
                  <button 
                    type="button" 
                    className="btn-accent"
                    onClick={() => {
                      if (items.length === 0) {
                        alert('กรุณาเพิ่มรายการสินค้าก่อนกดยืนยัน');
                        return;
                      }
                      setPreviewQuotation({
                        id: quotationNo.trim() || generateQuotationNo(quotationDate),
                        date: quotationDate,
                        customerType,
                        customerId: selectedCustId || null,
                        customerName: customerName.trim(),
                        customerAddress: customerAddress.trim(),
                        customerPhone: customerPhone.trim(),
                        customerTaxId: customerTaxId.trim(),
                        companyBranch: customerType === 'company' ? companyBranch.trim() : null,
                        validityDays,
                        deliveryDays,
                        paymentTerms,
                        salesperson,
                        discountAmount: Number(discountAmount),
                        vatType,
                        subtotal: totals.subtotal,
                        tax: totals.tax,
                        total: totals.total,
                        items
                      });
                    }}
                  >
                    👁️ ดูตัวอย่างใบเสนอราคา A4
                  </button>
                  <button 
                    type="submit" 
                    className="btn-primary"
                  >
                    💾 บันทึกเอกสาร
                  </button>
                </div>

              </div>

            </div>

          </div>

        </form>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* MODAL: ADD CUSTOM SPECIAL ITEM */}
      {/* ──────────────────────────────────────────────────────── */}
      {showCustomModal && (
        <div className="modal-overlay" onClick={() => setShowCustomModal(false)}>
          <div className="modal-content card-glass" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">✍️ เพิ่มรายการพิเศษ / บริการอื่น</h3>
            <form onSubmit={handleAddCustomItem}>
              <div className="form-group">
                <label className="input-label required">รายการรายละเอียดสินค้า/บริการ</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="เช่น มัดเครื่องซ้าย-ขวา หรือ แท่นรองพลาสติกสำหรับซีล"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="input-label required">ราคาต่อหน่วย (บาท)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    placeholder="0.00"
                    min="0"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="input-label required">จำนวน</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    min="1"
                    value={customQty}
                    onChange={(e) => setCustomQty(parseInt(e.target.value, 10) || 1)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="input-label">หน่วย</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer-buttons">
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={() => setShowCustomModal(false)}
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit" 
                  className="btn-primary"
                >
                  ➕ เพิ่มลงใบเสนอราคา
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* FULL SCREEN MODAL: A4 QUOTATION PREVIEW & PRINT */}
      {/* ──────────────────────────────────────────────────────── */}
      {previewQuotation && (
        <QuotationPreviewModal 
          quotation={previewQuotation} 
          store={store} 
          onClose={() => setPreviewQuotation(null)} 
        />
      )}

    </div>
  );
};

// ─── CHILD COMPONENT: QUOTATION PREVIEW MODAL ─────────────────────────
const QuotationPreviewModal = ({ quotation, store, onClose }) => {
  const modalContainerRef = useRef(null);
  const quotationPaperRef = useRef(null);
  const [scale, setScale] = useState(0.65);

  useEffect(() => {
    const updateScale = () => {
      if (!modalContainerRef.current) return;
      const h = modalContainerRef.current.clientHeight;
      const w = modalContainerRef.current.clientWidth;
      
      const a4H = 1123;
      const a4W = 794;
      
      const scaleH = (h - 40) / a4H;
      const scaleW = (w - 40) / a4W;
      
      setScale(Math.min(scaleH, scaleW, 1));
    };

    const timer = setTimeout(updateScale, 50);
    window.addEventListener('resize', updateScale);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateScale);
    };
  }, [quotation]);

  const handlePrint = () => {
    window.print();
  };

  // Pad items table to at least 7 rows for beautiful A4 layout
  const minTableRows = 8;
  const paddedItems = [...quotation.items];
  while (paddedItems.length < minTableRows) {
    paddedItems.push(null);
  }

  const isVatType = quotation.vatType;

  return (
    <div className="quotation-modal-overlay" onClick={onClose}>
      <div className="quotation-modal-box" onClick={(e) => e.stopPropagation()}>
        
        {/* Scale Container Preview */}
        <div className="quotation-paper-viewport" ref={modalContainerRef}>
          <div 
            className="quotation-print-paper" 
            ref={quotationPaperRef}
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'center center'
            }}
          >
            {/* Header info */}
            <div className="q-letterhead">
              <div className="q-logo-col">
                <img src={logoImg} alt="Logo" className="q-logo-img" />
              </div>
              <div className="q-company-info">
                <h1 className="q-company-name">{store.name}</h1>
                <p className="q-company-details">
                  {store.address} <br/>
                  เลขประจำตัวผู้เสียภาษี: {store.taxId} | โทร: {store.phone}
                </p>
              </div>
            </div>

            {/* Document Title */}
            <div className="q-title-banner">
              <h2>ใบเสนอราคา / QUOTATION</h2>
            </div>

            {/* Customer & Document Information Grid */}
            <div className="q-details-grid">
              
              {/* Customer Box */}
              <div className="q-cust-info-box">
                <div className="q-info-line">
                  <span className="lbl font-bold">ลูกค้า / Customer :</span>
                  <span className="val font-bold text-indigo">{quotation.customerName}</span>
                </div>
                {quotation.customerType === 'company' && quotation.companyBranch && (
                  <div className="q-info-line">
                    <span className="lbl font-bold">สาขา / Branch :</span>
                    <span className="val">{quotation.companyBranch}</span>
                  </div>
                )}
                <div className="q-info-line">
                  <span className="lbl">ที่อยู่ / Address :</span>
                  <span className="val">{quotation.customerAddress || '-'}</span>
                </div>
                <div className="q-info-line">
                  <span className="lbl">โทรศัพท์ / Tel :</span>
                  <span className="val">{quotation.customerPhone || '-'}</span>
                </div>
                <div className="q-info-line">
                  <span className="lbl">เลขผู้เสียภาษี / TAX ID :</span>
                  <span className="val">{quotation.customerTaxId || '-'}</span>
                </div>
              </div>

              {/* Quotation Info Box */}
              <div className="q-doc-info-box">
                <div className="q-info-line split">
                  <span className="lbl font-bold">เลขที่ / Quotation No. :</span>
                  <span className="val font-bold text-indigo">{quotation.id}</span>
                </div>
                <div className="q-info-line split border-top">
                  <span className="lbl">วันที่ / Date :</span>
                  <span className="val">{formatDateThaiLong(quotation.date)}</span>
                </div>
                <div className="q-info-line split border-top">
                  <span className="lbl">ยืนยันราคา / Validity :</span>
                  <span className="val">{quotation.validityDays || '30 วัน'}</span>
                </div>
                <div className="q-info-line split border-top">
                  <span className="lbl">ส่งของ / Delivery Time :</span>
                  <span className="val">{quotation.deliveryDays || '7 วัน'}</span>
                </div>
                <div className="q-info-line split border-top">
                  <span className="lbl">เงื่อนไขชำระเงิน / Payment :</span>
                  <span className="val">{quotation.paymentTerms || 'โอนเงินสด'}</span>
                </div>
              </div>

            </div>

            {/* Table of items */}
            <table className="q-items-table">
              <thead>
                <tr>
                  <th style={{ width: '7%', textAlign: 'center' }}>ลำดับ<br/>No.</th>
                  <th style={{ width: '18%', textAlign: 'center' }}>รหัสเครื่อง<br/>Code</th>
                  <th style={{ width: '40%', textAlign: 'left' }}>รายการสินค้า / รายละเอียดเครื่องจักร<br/>Description</th>
                  <th style={{ width: '10%', textAlign: 'center' }}>จำนวน<br/>Qty</th>
                  <th style={{ width: '10%', textAlign: 'center' }}>หน่วย<br/>Unit</th>
                  <th style={{ width: '15%', textAlign: 'right' }}>ราคาต่อหน่วย<br/>Price/Unit</th>
                  <th style={{ width: '15%', textAlign: 'right' }}>จำนวนเงิน<br/>Amount</th>
                </tr>
              </thead>
              <tbody>
                {paddedItems.map((item, idx) => {
                  if (item) {
                    const priceUnit = isVatType === 'inclusive' ? (item.sellPrice / 1.07) : item.sellPrice;
                    const amountTotal = priceUnit * item.quantity;
                    return (
                      <tr key={item.productId || idx}>
                        <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                        <td style={{ textAlign: 'center' }}>{item.productId.startsWith('custom-') ? 'CUSTOM' : item.productId}</td>
                        <td className="desc-cell">{item.name}</td>
                        <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                        <td style={{ textAlign: 'center' }}>{item.unit}</td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(priceUnit)}</td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(amountTotal)}</td>
                      </tr>
                    );
                  } else {
                    return (
                      <tr key={`empty-${idx}`} className="empty-row">
                        <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                      </tr>
                    );
                  }
                })}
              </tbody>
            </table>

            {/* Bottom calculation blocks */}
            <div className="q-bottom-grid">
              
              {/* Left Column: Baht text & bank account */}
              <div className="q-bottom-left">
                <div className="q-baht-text-row">
                  <span className="font-bold">ตัวอักษร / Thai Baht :</span>
                  <span className="baht-val italic font-bold">{bahtText(quotation.total)}</span>
                </div>

                <div className="q-remarks-box border-top">
                  <span className="font-bold block-title">ข้อมูลโอนเงินเข้าบัญชีธนาคาร:</span>
                  <div className="bank-account-info">
                    <strong>ธนาคาร:</strong> กสิกรไทย (KBANK) &nbsp;&nbsp;
                    <strong>สาขา:</strong> มิตรภาพ (นครราชสีมา) <br/>
                    <strong>ชื่อบัญชี:</strong> หจก.หัวเหรียญ อีสาน <br/>
                    <strong>เลขที่บัญชี:</strong> 200-2-14611-2
                  </div>
                  <div className="q-terms-notice">
                    * หวังเป็นอย่างยิ่งว่าจะได้รับการอนุมัติสั่งซื้อและพร้อมให้บริการที่ดีที่สุดแก่ท่าน
                  </div>
                </div>
              </div>

              {/* Right Column: Financial summations */}
              <div className="q-bottom-right">
                <div className="calc-field">
                  <span className="lbl font-bold">รวมเป็นเงิน / Subtotal :</span>
                  <span className="val">{formatCurrency(quotation.subtotal)}</span>
                </div>
                
                {quotation.discountAmount > 0 && (
                  <div className="calc-field border-top">
                    <span className="lbl font-bold">หักส่วนลดพิเศษ / Discount :</span>
                    <span className="val text-red font-bold">-{formatCurrency(quotation.discountAmount)}</span>
                  </div>
                )}

                <div className="calc-field border-top">
                  <span className="lbl font-bold">ภาษีมูลค่าเพิ่ม / VAT (7%) :</span>
                  <span className="val">{quotation.tax > 0 ? formatCurrency(quotation.tax) : 'ยกเว้นภาษี'}</span>
                </div>

                <div className="calc-field border-top highlight-grand">
                  <span className="lbl font-bold">ยอดเงินสุทธิ / Grand Total :</span>
                  <span className="val text-emerald font-bold">฿{formatCurrency(quotation.total)}</span>
                </div>
              </div>

            </div>

            {/* Footer / Disclaimer notice */}
            <div className="q-footer-notes">
              เอกสารใบเสนอราคานี้ได้รับการจัดเตรียมด้วยระบบอัตโนมัติของ หจก.หัวเหรียญ อีสาน ข้อมูลทั้งหมดมีความสมบูรณ์
            </div>

            {/* Signatures block */}
            <div className="q-signatures-row">
              <div className="sig-col">
                <div className="sig-placeholder"></div>
                <div className="sig-line"></div>
                <span className="sig-title">ผู้รับใบเสนอราคา / Customer Accepted</span>
                <span className="sig-date">วันที่ / Date: ................................</span>
              </div>
              <div className="sig-col">
                <div className="sig-name-text font-bold">{quotation.salesperson || 'ฝ่ายขาย'}</div>
                <div className="sig-line"></div>
                <span className="sig-title">ผู้เสนอราคา / Prepared By</span>
                <span className="sig-date">วันที่ / Date: {formatDateThaiShort(quotation.date)}</span>
              </div>
              <div className="sig-col">
                <div className="sig-placeholder"></div>
                <div className="sig-line"></div>
                <span className="sig-title">ผู้อนุมัติสั่งซื้อ / Authorized Approval</span>
                <span className="sig-date">วันที่ / Date: ................................</span>
              </div>
            </div>

            {/* Print timestamp corner */}
            <div className="q-print-timestamp">
              พิมพ์เมื่อ: {formatPrintTimestamp()}
            </div>

          </div>
        </div>

        {/* Action Controls */}
        <div className="quotation-modal-actions">
          <button className="btn btn-primary" onClick={handlePrint}>
            🖨️ สั่งพิมพ์ใบเสนอราคา A4
          </button>
          <button className="btn btn-secondary" onClick={onClose}>
            ✕ ปิดพรีวิว
          </button>
        </div>

      </div>
      {/* โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€ */}
      {/* FULL SCREEN MODAL: CUSTOMER SEARCH */}
      {/* โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€ */}
      {showCustomerSearchModal && (
        <div className="cust-modal-overlay" onClick={() => setShowCustomerSearchModal(false)}>
          <div className="cust-modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="cust-modal-header">
              <div className="cust-modal-title">
                <span>๐‘ฅ</span>
                <span>เธเนเธเธซเธฒเนเธฅเธฐเน€เธฅเธทเธญเธเธฅเธนเธเธเนเธฒ</span>
                <span className="cust-modal-count">
                  {filteredCustomersInModal.length} / {(state.customers || []).length} เธฃเธฒเธขเธเธฒเธฃ
                </span>
              </div>
              <button type="button" className="cust-modal-close" onClick={() => setShowCustomerSearchModal(false)}>โ• เธเธดเธ”</button>
            </div>
            <div className="cust-modal-search-bar">
              <div className="cust-modal-search-input-wrap">
                <span className="cust-modal-search-icon">๐”</span>
                <input
                  type="text"
                  autoFocus
                  className="cust-modal-search-input"
                  placeholder="เธเนเธเธซเธฒเธเธทเนเธญ, เธเธฃเธดเธฉเธฑเธ—, เน€เธเธญเธฃเนเนเธ—เธฃ เธซเธฃเธทเธญ TAX ID..."
                  value={customerModalQuery}
                  onChange={(e) => setCustomerModalQuery(e.target.value)}
                />
                {customerModalQuery && (
                  <button type="button" className="cust-modal-clear-btn" onClick={() => setCustomerModalQuery('')}>โ•</button>
                )}
              </div>
              <div className="cust-modal-type-tabs">
                <button type="button" className={cust-type-tab } onClick={() => setCustomerTypeFilter('all')}>๐‘ฅ เธ—เธฑเนเธเธซเธกเธ”</button>
                <button type="button" className={cust-type-tab } onClick={() => setCustomerTypeFilter('general')}>๐‘ค เธเธธเธเธเธฅเธเธฃเธฃเธกเธ”เธฒ</button>
                <button type="button" className={cust-type-tab } onClick={() => setCustomerTypeFilter('company')}>๐ข เธเธฃเธดเธฉเธฑเธ—/เธซเนเธฒเธเธฃเนเธฒเธ</button>
              </div>
            </div>
            <div className="cust-modal-grid-wrapper">
              {filteredCustomersInModal.length === 0 ? (
                <div className="cust-modal-empty">
                  <div className="cust-modal-empty-icon">๐”</div>
                  <p>เนเธกเนเธเธเธฅเธนเธเธเนเธฒเธ—เธตเนเธ•เธฃเธเธเธฑเธเธเธฒเธฃเธเนเธเธซเธฒ</p>
                  <span>เธฅเธญเธเน€เธเธฅเธตเนเธขเธเธเธณเธเนเธเธซเธฒเธซเธฃเธทเธญเธ•เธฑเธงเธเธฃเธญเธเธเธฃเธฐเน€เธ เธ—เธฅเธนเธเธเนเธฒ</span>
                </div>
              ) : (
                <table className="cust-datagrid">
                  <thead>
                    <tr>
                      <th style={{ width: '50px' }}>เธฅเธณเธ”เธฑเธ</th>
                      <th>เธเธทเนเธญ / เธเธฃเธดเธฉเธฑเธ—</th>
                      <th style={{ width: '130px' }}>เน€เธเธญเธฃเนเนเธ—เธฃ</th>
                      <th style={{ width: '140px' }}>TAX ID</th>
                      <th>เธ—เธตเนเธญเธขเธนเน</th>
                      <th style={{ width: '100px', textAlign: 'center' }}>เธเธฃเธฐเน€เธ เธ—</th>
                      <th style={{ width: '100px', textAlign: 'center' }}>เน€เธฅเธทเธญเธ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomersInModal.map((cust, idx) => (
                      <tr key={cust.id} onDoubleClick={() => handleSelectCustomerFromModal(cust)}>
                        <td className="cust-dg-idx">{idx + 1}</td>
                        <td className="cust-dg-name"><span className="cust-dg-name-text">{cust.name}</span></td>
                        <td className="cust-dg-phone">{cust.phone || '-'}</td>
                        <td className="cust-dg-tax">{cust.taxId || '-'}</td>
                        <td className="cust-dg-address">{cust.address || '-'}</td>
                        <td className="cust-dg-type">
                          <span className={cust-dg-badge }>
                            {cust.type === 'company' ? '๐ข เธเธฃเธดเธฉเธฑเธ—' : '๐‘ค เธเธธเธเธเธฅ'}
                          </span>
                        </td>
                        <td className="cust-dg-action">
                          <button type="button" className="cust-dg-select-btn" onClick={() => handleSelectCustomerFromModal(cust)}>โ” เน€เธฅเธทเธญเธ</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="cust-modal-footer">
              <span>๐’ก เธ”เธฑเธเน€เธเธดเนเธฅเธเธฅเธดเธเธ—เธตเนเนเธ–เธงเน€เธเธทเนเธญเน€เธฅเธทเธญเธเธฅเธนเธเธเนเธฒเนเธ”เนเธ—เธฑเธเธ—เธต</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Quotation;
