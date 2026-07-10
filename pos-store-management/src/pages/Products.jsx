import React, { useState, useMemo, useEffect } from 'react';
import { useStore } from '../data/store';
import { categories as categoryList } from '../data/mockData';
import './Products.css';

// ─── Product Types (Brands) ───────────────────────────────────────────
const PRODUCT_TYPES = [
  { id: 'Dingye', name: 'Dingye', prefix: 'DY' },
  { id: 'Hualian', name: 'Hualian', prefix: 'HL' },
  { id: 'Brother', name: 'Brother', prefix: 'BR' },
  { id: 'บรรจุน้ำ', name: 'บรรจุน้ำ', prefix: 'GD' },
  { id: 'ไลน์บรรจุน้ำ', name: 'ไลน์บรรจุน้ำ', prefix: 'CGF' },
  { id: 'NB', name: 'NB', prefix: 'NB' },
  { id: 'เครื่องสีข้าว', name: 'เครื่องสีข้าว', prefix: 'RICE' },
  { id: 'BESPACKER', name: 'BESPACKER', prefix: 'BP' },
  { id: 'เครื่องห่อแนวนอน', name: 'เครื่องห่อแนวนอน', prefix: 'CY' },
  { id: 'ZHEJIANG HUILI', name: 'ZHEJIANG HUILI', prefix: 'ZH' },
];

const getTypeFromBarcode = (barcode) => {
  if (!barcode) return 'Dingye';
  const clean = barcode.toUpperCase();
  if (clean.startsWith('DY')) return 'Dingye';
  if (clean.startsWith('HL')) return 'Hualian';
  if (clean.startsWith('BR')) return 'Brother';
  if (clean.startsWith('GD')) return 'บรรจุน้ำ';
  if (clean.startsWith('CGF')) return 'ไลน์บรรจุน้ำ';
  if (clean.startsWith('NB')) return 'NB';
  if (clean.startsWith('RICE')) return 'เครื่องสีข้าว';
  if (clean.startsWith('BP')) return 'BESPACKER';
  if (clean.startsWith('CY')) return 'เครื่องห่อแนวนอน';
  if (clean.startsWith('ZH')) return 'ZHEJIANG HUILI';
  return 'Dingye';
};

// ─── Generate Barcode based on product type prefix ────────────────────
const generateBarcode = (typeVal, productsList) => {
  const typeObj = PRODUCT_TYPES.find((t) => t.id === typeVal);
  if (!typeObj) return '';
  const prefix = typeObj.prefix;
  
  // Find all barcodes starting with prefix (case insensitive, ignoring hyphen)
  const matches = productsList
    .map((p) => p.barcode || '')
    .filter((b) => b.toUpperCase().startsWith(prefix.toUpperCase()));
    
  let maxNum = 0;
  matches.forEach((b) => {
    // Remove the prefix from the matched barcode
    const remaining = b.slice(prefix.length);
    // Strip non-digits
    const numStr = remaining.replace(/\D/g, '');
    const numPart = parseInt(numStr, 10);
    if (!isNaN(numPart) && numPart > maxNum) {
      maxNum = numPart;
    }
  });
  
  const nextNum = maxNum + 1;
  const formattedNum = String(nextNum).padStart(3, '0');
  return `${prefix}-${formattedNum}`;
};

const Products = () => {
  const { state, dispatch } = useStore();
  const isUserRole = state?.currentUser?.role === 'user' || state?.currentUser?.role === 'sale';
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [formData, setFormData] = useState({
    name: '',
    barcode: '',
    type: 'Dingye',
    category: categoryList[0]?.id || 'sealer',
    costPrice: '',
    sellPrice: '',
    branchPrice: '',
    stockOffice: '0',
    stockKookkai: '0',
    stockBig: '0',
    minStock: '10',
    image: '📦',
    unit: 'เครื่อง',
  });

  // Reset page when search, category filter, or stock filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, categoryFilter, stockFilter]);

  // ─── Derive categories from store ──────────────────────────────────
  const categories = state.categories || categoryList;

  // Build a quick lookup: category id → { name, icon }
  const categoryMap = useMemo(() => {
    const map = {};
    categories.forEach((c) => {
      if (typeof c === 'string') {
        map[c] = { name: c, icon: '' };
      } else {
        map[c.id] = { name: c.name, icon: c.icon || '' };
      }
    });
    return map;
  }, [categories]);

  const categoryIds = useMemo(() => {
    return categories.map((c) => (typeof c === 'string' ? c : c.id));
  }, [categories]);

  // ─── Normalise product fields (support both schemas) ──────────────
  const normaliseProduct = (p) => {
    const stockOffice = Number(p.stockOffice ?? (p.location === 'ออฟฟิศ' ? (p.stock ?? 0) : 0));
    const stockKookkai = Number(p.stockKookkai ?? (p.location === 'โกดังกุ๊กไก่' ? (p.stock ?? 0) : 0));
    const stockBig = Number(p.stockBig ?? (p.location === 'โกดังใหญ่' || !p.location ? (p.stock ?? 0) : 0));
    const totalStock = stockOffice + stockKookkai + stockBig;
    return {
      ...p,
      sellPrice: p.sellPrice ?? p.price ?? 0,
      costPrice: p.costPrice ?? p.cost ?? 0,
      branchPrice: p.branchPrice ?? p.sellPrice ?? p.price ?? 0,
      image: p.image || '📦',
      minStock: p.minStock ?? 10,
      unit: p.unit || 'ชิ้น',
      location: p.location || 'โกดังใหญ่',
      stockOffice,
      stockKookkai,
      stockBig,
      stock: totalStock,
    };
  };

  // ─── Filtered products ─────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    return state.products
      .map(normaliseProduct)
      .filter((p) => {
        const q = search.toLowerCase();
        const matchSearch =
          p.name.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.includes(search));
        const matchCategory =
          categoryFilter === 'all' || p.category === categoryFilter;

        let matchStock = true;
        if (stockFilter === 'low') {
          matchStock = p.stock > 0 && p.stock < p.minStock;
        } else if (stockFilter === 'out') {
          matchStock = p.stock === 0;
        }

        return matchSearch && matchCategory && matchStock;
      });
  }, [state.products, search, categoryFilter, stockFilter]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);

  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProducts, currentPage]);

  // Count per category
  const categoryCounts = useMemo(() => {
    const counts = { all: state.products.length };
    state.products.forEach((p) => {
      counts[p.category] = (counts[p.category] || 0) + 1;
    });
    return counts;
  }, [state.products]);

  // Count per stock status
  const stockCounts = useMemo(() => {
    let low = 0;
    let out = 0;
    state.products.forEach((p) => {
      const normalised = normaliseProduct(p);
      if (normalised.stock === 0) {
        out += 1;
      } else if (normalised.stock < normalised.minStock) {
        low += 1;
      }
    });
    return { low, out };
  }, [state.products]);

  // Count per location
  const locationCounts = useMemo(() => {
    const counts = {
      'โกดังใหญ่': { products: 0, stock: 0 },
      'ออฟฟิศ': { products: 0, stock: 0 },
      'โกดังกุ๊กไก่': { products: 0, stock: 0 }
    };
    state.products.forEach((p) => {
      const normalised = normaliseProduct(p);
      if (normalised.stockBig > 0) {
        counts['โกดังใหญ่'].products += 1;
        counts['โกดังใหญ่'].stock += normalised.stockBig;
      }
      if (normalised.stockOffice > 0) {
        counts['ออฟฟิศ'].products += 1;
        counts['ออฟฟิศ'].stock += normalised.stockOffice;
      }
      if (normalised.stockKookkai > 0) {
        counts['โกดังกุ๊กไก่'].products += 1;
        counts['โกดังกุ๊กไก่'].stock += normalised.stockKookkai;
      }
    });
    return counts;
  }, [state.products]);

  // Summary stats for footer
  const summaryStats = useMemo(() => {
    const lowStock = filteredProducts.filter(
      (p) => p.stock > 0 && p.stock < p.minStock
    ).length;
    const outOfStock = filteredProducts.filter((p) => p.stock === 0).length;
    const totalValue = filteredProducts.reduce(
      (sum, p) => sum + p.sellPrice * p.stock,
      0
    );
    return { lowStock, outOfStock, totalValue };
  }, [filteredProducts]);

  // ─── CRUD handlers ─────────────────────────────────────────────────
  const handleSubmit = (e) => {
    e.preventDefault();
    const catObj = categoryMap[formData.category] || { icon: '📦' };
    const stockOffice = Number(formData.stockOffice || 0);
    const stockKookkai = Number(formData.stockKookkai || 0);
    const stockBig = Number(formData.stockBig || 0);
    const totalStock = stockOffice + stockKookkai + stockBig;

    const payload = {
      ...formData,
      image: catObj.icon || '📦',
      costPrice: Number(formData.costPrice),
      sellPrice: Number(formData.sellPrice),
      branchPrice: Number(formData.branchPrice || formData.sellPrice),
      // Also set price/cost for backward compat with store.jsx schema
      price: Number(formData.sellPrice),
      cost: Number(formData.costPrice),
      stockOffice,
      stockKookkai,
      stockBig,
      stock: totalStock,
      minStock: Number(formData.minStock),
      location: stockBig > 0 ? 'โกดังใหญ่' : stockKookkai > 0 ? 'โกดังกุ๊กไก่' : stockOffice > 0 ? 'ออฟฟิศ' : 'โกดังใหญ่',
    };

    if (editingProduct) {
      dispatch({
        type: 'UPDATE_PRODUCT',
        payload: { ...payload, id: editingProduct.id },
      });
    } else {
      const generatedId = formData.barcode ? formData.barcode.trim().toUpperCase() : ('P-' + Date.now());
      dispatch({
        type: 'ADD_PRODUCT',
        payload: { ...payload, id: generatedId },
      });
    }
    closeModal();
  };

  const handleEdit = (product) => {
    const p = normaliseProduct(product);
    setEditingProduct(p);
    setFormData({
      name: p.name,
      barcode: p.barcode || '',
      type: p.type || getTypeFromBarcode(p.barcode),
      category: p.category,
      costPrice: String(p.costPrice),
      sellPrice: String(p.sellPrice),
      branchPrice: String(p.branchPrice ?? p.sellPrice),
      stockOffice: String(p.stockOffice ?? 0),
      stockKookkai: String(p.stockKookkai ?? 0),
      stockBig: String(p.stockBig ?? 0),
      minStock: String(p.minStock),
      image: p.image,
      unit: p.unit,
    });
    setShowModal(true);
  };

  const handleDelete = (id) => {
    if (window.confirm('คุณต้องการลบสินค้านี้หรือไม่?')) {
      dispatch({ type: 'DELETE_PRODUCT', payload: id });
    }
  };

  const openAddModal = () => {
    setEditingProduct(null);
    const initialCategory = categoryIds[0] || 'sealer';
    const initialType = 'Dingye';
    const autoBarcode = generateBarcode(initialType, state.products);
    setFormData({
      name: '',
      barcode: autoBarcode,
      type: initialType,
      category: initialCategory,
      costPrice: '',
      sellPrice: '',
      branchPrice: '',
      stockOffice: '0',
      stockKookkai: '0',
      stockBig: '0',
      minStock: '10',
      image: '📦',
      unit: 'เครื่อง',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingProduct(null);
  };

  const handleFormChange = (field, value) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      
      // Auto-generate barcode if type changes during ADD mode
      if (field === 'type' && !editingProduct) {
        updated.barcode = generateBarcode(value, state.products);
      }
      
      return updated;
    });
  };

  // ─── Stock status helper ───────────────────────────────────────────
  const getStockStatus = (stock, minStock) => {
    if (stock === 0) return { label: 'หมด', className: 'badge-danger', icon: '🔴' };
    if (stock < minStock) return { label: 'ใกล้หมด', className: 'badge-warning', icon: '🟡' };
    return { label: 'ปกติ', className: 'badge-success', icon: '🟢' };
  };

  // ─── Format price ──────────────────────────────────────────────────
  const formatPrice = (amount) => {
    return `฿${Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 0 })}`;
  };

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="products-page">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div className="products-header">
        <h1>
          <span className="icon">📋</span>
          จัดการสินค้า
          <span className="product-count">({state.products.length} รายการ)</span>
        </h1>
        <button 
          className="btn-add-product" 
          onClick={openAddModal}
          disabled={isUserRole}
          style={isUserRole ? { opacity: 0.5, cursor: 'not-allowed', background: '#334155' } : {}}
          title={isUserRole ? "เฉพาะผู้ดูแลระบบเท่านั้น" : "เพิ่มสินค้าใหม่"}
        >
          <span>{isUserRole ? '🔒' : '➕'}</span>
          เพิ่มสินค้าใหม่ {isUserRole && '(จำกัดสิทธิ์)'}
        </button>
      </div>



      {/* ─── Toolbar: Search + Category + Stock Filters ─────────── */}
      <div className="products-toolbar">
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
          <div className="search-bar" style={{ flex: '1', minWidth: '280px', margin: 0 }}>
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="ค้นหาสินค้า... (ชื่อ หรือ บาร์โค้ด)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Stock Filters */}
          <div className="stock-filters" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className={`category-pill ${stockFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStockFilter('all')}
              style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', height: '40px', padding: '0 16px' }}
            >
              🟢 ทั้งหมด ({state.products.length})
            </button>
            <button
              className={`category-pill ${stockFilter === 'low' ? 'active' : ''}`}
              onClick={() => setStockFilter('low')}
              style={{
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                height: '40px',
                padding: '0 16px',
                borderColor: stockFilter === 'low' ? '#fbbf24' : '#2d3148',
                color: stockFilter === 'low' ? '#fbbf24' : '#94a3b8',
                background: stockFilter === 'low' ? 'rgba(251, 191, 36, 0.15)' : '#1a1d2e',
                fontWeight: stockFilter === 'low' ? '600' : '500'
              }}
            >
              🟡 ใกล้หมด ({stockCounts.low})
            </button>
            <button
              className={`category-pill ${stockFilter === 'out' ? 'active' : ''}`}
              onClick={() => setStockFilter('out')}
              style={{
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                height: '40px',
                padding: '0 16px',
                borderColor: stockFilter === 'out' ? '#f87171' : '#2d3148',
                color: stockFilter === 'out' ? '#f87171' : '#94a3b8',
                background: stockFilter === 'out' ? 'rgba(248, 113, 113, 0.15)' : '#1a1d2e',
                fontWeight: stockFilter === 'out' ? '600' : '500'
              }}
            >
              🔴 สินค้าหมด ({stockCounts.out})
            </button>
          </div>
        </div>

        {/* Category Filters */}
        <div className="category-filters" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', width: '100%', borderTop: '1px solid #1e2235', paddingTop: '12px', marginTop: '4px' }}>
          <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '600', marginRight: '4px' }}>📁 ประเภทเครื่องจักร:</span>
          <button
            className={`category-pill ${categoryFilter === 'all' ? 'active' : ''}`}
            onClick={() => setCategoryFilter('all')}
            style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', height: '40px', padding: '0 16px' }}
          >
            🏪 ทั้งหมด ({categoryCounts.all || 0})
          </button>
          
          <select
            className="input"
            value={categoryFilter === 'all' ? '' : categoryFilter}
            onChange={(e) => {
              const val = e.target.value;
              setCategoryFilter(val || 'all');
            }}
            style={{
              maxWidth: '280px',
              height: '40px',
              padding: '0 14px',
              background: '#0f172a',
              border: '1.5px solid #334155',
              borderRadius: '10px',
              color: '#f8fafc',
              cursor: 'pointer',
              outline: 'none',
              fontSize: '13.5px'
            }}
          >
            <option value="">📁 เลือกประเภทเครื่องจักรอื่นๆ...</option>
            {categoryIds.map((catId) => {
              const cat = categoryMap[catId];
              const count = categoryCounts[catId] || 0;
              return (
                <option key={catId} value={catId}>
                  {cat.icon} {cat.name} ({count})
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* ─── Products Table ─────────────────────────────────────── */}
      <div className="products-table-wrapper">
        {filteredProducts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <h3>ไม่พบสินค้า</h3>
            <p>
              {search || categoryFilter !== 'all'
                ? 'ลองเปลี่ยนคำค้นหาหรือตัวกรองหมวดหมู่'
                : 'ยังไม่มีสินค้าในระบบ กดปุ่ม "เพิ่มสินค้าใหม่" เพื่อเริ่มต้น'}
            </p>
          </div>
        ) : (
          <>
            <div className="products-table-scroll">
              <table className="products-table">
                <thead>
                  <tr>
                    <th>สินค้า</th>
                    <th>ราคาทุน</th>
                    <th>ราคาสาขา</th>
                    <th>ราคาขาย</th>
                    <th>หมวดหมู่</th>
                    <th style={{ textAlign: 'center' }}>ที่อยู่ออฟฟิต</th>
                    <th style={{ textAlign: 'center' }}>ที่อยู่โกดังกุ๊กไก่</th>
                    <th style={{ textAlign: 'center' }}>ที่อยู่โกดังใหญ่</th>
                    <th style={{ textAlign: 'center', color: '#a5b4fc' }}>รวมสินค้า</th>
                    <th>สถานะ</th>
                    <th>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedProducts.map((product) => {
                    const status = getStockStatus(product.stock, product.minStock);
                    const cat = categoryMap[product.category];
                    return (
                      <tr key={product.id}>
                        <td>
                          <div className="product-info">
                            <div className="product-emoji">{product.image}</div>
                            <div>
                              <div className="product-name">{product.name}</div>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
                                <span className="product-barcode">{product.barcode || '—'}</span>
                                {(() => {
                                  const locs = [];
                                  if (product.stockBig > 0) locs.push('โกดังใหญ่');
                                  if (product.stockKookkai > 0) locs.push('โกดังกุ๊กไก่');
                                  if (product.stockOffice > 0) locs.push('ออฟฟิศ');
                                  if (locs.length === 0) return null;
                                  return (
                                    <span style={{
                                      fontSize: '11px',
                                      padding: '1px 6px',
                                      borderRadius: '6px',
                                      background: 'rgba(99, 102, 241, 0.15)',
                                      color: '#a5b4fc',
                                      border: '1px solid rgba(99, 102, 241, 0.25)',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      whiteSpace: 'nowrap'
                                    }}>
                                      📍 {locs.join(', ')}
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="price-cost">{formatPrice(product.costPrice)}</span>
                        </td>
                        <td>
                          <span className="price-branch">{formatPrice(product.branchPrice)}</span>
                        </td>
                        <td>
                          <span className="price-sell">{formatPrice(product.sellPrice)}</span>
                        </td>
                        <td>
                          <span className="category-badge">
                            {cat?.icon} {cat?.name || product.category}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="stock-number" style={{ color: product.stockOffice > 0 ? '#f1f5f9' : '#475569' }}>
                            {product.stockOffice.toLocaleString()} {product.unit}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="stock-number" style={{ color: product.stockKookkai > 0 ? '#f1f5f9' : '#475569' }}>
                            {product.stockKookkai.toLocaleString()} {product.unit}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="stock-number" style={{ color: product.stockBig > 0 ? '#f1f5f9' : '#475569' }}>
                            {product.stockBig.toLocaleString()} {product.unit}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="stock-number" style={{ color: '#a5b4fc', fontWeight: 'bold' }}>
                            {product.stock.toLocaleString()} {product.unit}
                          </span>
                        </td>
                        <td>
                          <span className={`stock-badge ${status.className}`}>
                            {status.icon} {status.label}
                          </span>
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button
                              className="btn-action btn-edit"
                              title={isUserRole ? "แก้ไข (จำกัดสิทธิ์เฉพาะผู้ดูแล)" : "แก้ไข"}
                              onClick={() => !isUserRole && handleEdit(product)}
                              disabled={isUserRole}
                              style={isUserRole ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
                            >
                              ✏️
                            </button>
                            <button
                              className="btn-action btn-delete"
                              title={isUserRole ? "ลบ (จำกัดสิทธิ์เฉพาะผู้ดูแล)" : "ลบ"}
                              onClick={() => !isUserRole && handleDelete(product.id)}
                              disabled={isUserRole}
                              style={isUserRole ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
                background: '#151823',
                borderBottom: '1px solid #1e2235',
                borderTop: '1px solid #1e2235'
              }}>
                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  style={{
                    background: currentPage === 1 ? 'transparent' : 'rgba(99, 102, 241, 0.15)',
                    border: currentPage === 1 ? '1px solid #334155' : '1px solid rgba(99, 102, 241, 0.3)',
                    color: currentPage === 1 ? '#475569' : '#a5b4fc',
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
                <span style={{ fontSize: '13.5px', color: '#94a3b8', fontWeight: '500' }}>
                  หน้า {currentPage} จาก {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  style={{
                    background: currentPage === totalPages ? 'transparent' : 'rgba(99, 102, 241, 0.15)',
                    border: currentPage === totalPages ? '1px solid #334155' : '1px solid rgba(99, 102, 241, 0.3)',
                    color: currentPage === totalPages ? '#475569' : '#a5b4fc',
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

            {/* Table Footer */}
            <div className="table-footer">
              <span>แสดง {paginatedProducts.length} รายการ (จากทั้งหมด {filteredProducts.length} รายการ)</span>
              <div className="summary-stats">
                <div className="stat">
                  🟡 ใกล้หมด: <span className="stat-value">{summaryStats.lowStock}</span>
                </div>
                <div className="stat">
                  🔴 หมดสต็อก: <span className="stat-value">{summaryStats.outOfStock}</span>
                </div>
                <div className="stat">
                  💰 มูลค่ารวม: <span className="stat-value">{formatPrice(summaryStats.totalValue)}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ─── Add / Edit Modal ───────────────────────────────────── */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="modal-header">
              <h2>
                {editingProduct ? '✏️ แก้ไขสินค้า' : '➕ เพิ่มสินค้าใหม่'}
              </h2>
              <button className="btn-close-modal" onClick={closeModal}>
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form className="modal-form" onSubmit={handleSubmit}>
              {/* Type + Barcode */}
              <div className="form-row">
                <div className="form-group">
                  <label>ประเภท *</label>
                  <select
                    value={formData.type}
                    onChange={(e) => handleFormChange('type', e.target.value)}
                    required
                    disabled={!!editingProduct}
                  >
                    {PRODUCT_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>รหัสเครื่อง *</label>
                  <input
                    type="text"
                    placeholder="รหัสเครื่องจะสร้างให้อัตโนมัติ"
                    value={formData.barcode}
                    readOnly
                    style={{ background: '#1e293b', cursor: 'not-allowed', color: '#94a3b8' }}
                  />
                  <span style={{ fontSize: '11px', color: '#10b981', marginTop: '2px', display: 'block' }}>
                    ℹ️ สร้างรหัสอัตโนมัติตามประเภท (ไม่สามารถแก้ไขได้)
                  </span>
                </div>
              </div>

              {/* Name */}
              <div className="form-group full-width">
                <label>ชื่อสินค้า *</label>
                <input
                  type="text"
                  placeholder="เช่น เครื่องซีลสายพาน, เครื่องซีลสูญญากาศ"
                  value={formData.name}
                  onChange={(e) => handleFormChange('name', e.target.value)}
                  required
                />
              </div>

              {/* Category */}
              <div className="form-row">
                <div className="form-group full-width">
                  <label>หมวดหมู่ *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => handleFormChange('category', e.target.value)}
                    required
                  >
                    {categoryIds.map((catId) => {
                      const cat = categoryMap[catId];
                      return (
                        <option key={catId} value={catId}>
                          {cat.icon} {cat.name}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Unit */}
              <div className="form-row">
                <div className="form-group full-width">
                  <label>หน่วยนับ</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => handleFormChange('unit', e.target.value)}
                  >
                    <option value="เครื่อง">เครื่อง</option>
                    <option value="ชิ้น">ชิ้น</option>
                    <option value="กล่อง">กล่อง</option>
                    <option value="ถุง">ถุง</option>
                    <option value="แพ็ค">แพ็ค</option>
                    <option value="กิโลกรัม">กิโลกรัม</option>
                    <option value="ลิตร">ลิตร</option>
                  </select>
                </div>
              </div>

              {/* Cost Price + Branch Price + Sell Price */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <div className="form-group">
                  <label>ราคาทุน (฿) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.costPrice}
                    onChange={(e) => handleFormChange('costPrice', e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>ราคาสาขา (฿) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.branchPrice}
                    onChange={(e) => handleFormChange('branchPrice', e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>ราคาขาย (฿) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.sellPrice}
                    onChange={(e) => handleFormChange('sellPrice', e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Stocks by Location */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label>จำนวนที่อยู่ออฟฟิต *</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={formData.stockOffice}
                    onChange={(e) => handleFormChange('stockOffice', e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>จำนวนที่อยู่โกดังกุ๊กไก่ *</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={formData.stockKookkai}
                    onChange={(e) => handleFormChange('stockKookkai', e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>จำนวนที่อยู่โกดังใหญ่ *</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={formData.stockBig}
                    onChange={(e) => handleFormChange('stockBig', e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Total Stock Summary & Min Stock */}
              <div className="form-row">
                <div className="form-group">
                  <label>สต็อกรวมทั้งหมด (คำนวณอัตโนมัติ)</label>
                  <div
                    style={{
                      padding: '11px 14px',
                      background: '#1e293b',
                      border: '1.5px solid #334155',
                      borderRadius: '10px',
                      color: '#94a3b8',
                      fontSize: '14px',
                      fontWeight: '700',
                      fontFamily: 'Consolas, monospace',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '42px',
                    }}
                  >
                    {(Number(formData.stockOffice || 0) + Number(formData.stockKookkai || 0) + Number(formData.stockBig || 0)).toLocaleString()} {formData.unit}
                  </div>
                </div>
                <div className="form-group">
                  <label>สต็อกขั้นต่ำ (แจ้งเตือน)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="10"
                    value={formData.minStock}
                    onChange={(e) => handleFormChange('minStock', e.target.value)}
                  />
                </div>
              </div>

              {/* Profit Preview */}
              <div className="form-row">
                <div className="form-group full-width">
                  <label>กำไรต่อหน่วย</label>
                  <div
                    style={{
                      padding: '11px 14px',
                      background: '#151823',
                      border: '1.5px solid #2d3148',
                      borderRadius: '10px',
                      color:
                        Number(formData.sellPrice) - Number(formData.costPrice) > 0
                          ? '#34d399'
                          : '#f87171',
                      fontSize: '14px',
                      fontWeight: '700',
                      fontFamily: 'Consolas, monospace',
                      textAlign: 'center',
                    }}
                  >
                    {formData.sellPrice && formData.costPrice
                      ? formatPrice(Number(formData.sellPrice) - Number(formData.costPrice))
                      : '—'}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="modal-actions">
                <button type="submit" className="btn-submit">
                  {editingProduct ? '💾 บันทึกการแก้ไข' : '✅ เพิ่มสินค้า'}
                </button>
                <button type="button" className="btn-cancel" onClick={closeModal}>
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

export default Products;
