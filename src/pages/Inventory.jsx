import React, { useState, useMemo } from 'react';
import { useStore } from '../data/store';
import './Inventory.css';

const Inventory = () => {
  const { state, dispatch, getLowStockProducts, getOutOfStockProducts } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, low, out
  const [adjustProduct, setAdjustProduct] = useState(null);
  const [adjustLocation, setAdjustLocation] = useState('โกดังใหญ่');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('รับสินค้าเข้า');

  // Computed values
  const totalProductsCount = state.products.length;
  const lowStockProductsCount = getLowStockProducts().length;
  const outOfStockProductsCount = getOutOfStockProducts().length;

  const filteredProducts = useMemo(() => {
    return state.products.filter((product) => {
      // Filter by search query
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        product.barcode.includes(query) ||
        product.id.toLowerCase().includes(query);

      // Filter by status
      let matchesStatus = true;
      if (statusFilter === 'low') {
        matchesStatus = product.stock <= product.minStock && product.stock > 0;
      } else if (statusFilter === 'out') {
        matchesStatus = product.stock === 0;
      }

      return matchesSearch && matchesStatus;
    });
  }, [state.products, searchQuery, statusFilter]);

  // Adjust stock handler
  const handleAdjustStockSubmit = (e) => {
    e.preventDefault();
    if (!adjustProduct || !adjustAmount) return;

    const amount = parseInt(adjustAmount);
    if (isNaN(amount)) return;

    // Get current stock of the chosen location
    let currentLocStock = 0;
    if (adjustLocation === 'โกดังกุ๊กไก่') {
      currentLocStock = Number(adjustProduct.stockKookkai || 0);
    } else if (adjustLocation === 'ออฟฟิศ') {
      currentLocStock = Number(adjustProduct.stockOffice || 0);
    } else {
      currentLocStock = Number(adjustProduct.stockBig || 0);
    }

    const newStock = Math.max(0, currentLocStock + amount);

    dispatch({
      type: 'SET_STOCK',
      payload: { 
        id: adjustProduct.id, 
        stock: newStock, 
        location: adjustLocation 
      },
    });

    setAdjustProduct(null);
    setAdjustAmount('');
    setAdjustReason('รับสินค้าเข้า');
  };

  // Quick adjust (+10, -1, etc.)
  const handleQuickAdjust = (product, delta) => {
    // Adjust only the primary warehouse (stockBig) and preserve others
    const newStockBig = Math.max(0, Number(product.stockBig || 0) + delta);
    dispatch({
      type: 'SET_STOCK',
      payload: { 
        id: product.id, 
        stock: newStockBig, 
        location: 'โกดังใหญ่' 
      },
    });
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">🏪 สต็อกสินค้า</h1>
          <p className="page-subtitle">จัดการระดับสินค้าคงคลังและรายการปรับสต็อก</p>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="kpi-grid">
        <div className="card kpi-card clickable" onClick={() => setStatusFilter('all')}>
          <div className="kpi-icon">📦</div>
          <div className="kpi-value">{totalProductsCount}</div>
          <div className="kpi-label">สินค้าทั้งหมด</div>
        </div>
        <div className="card kpi-card clickable alert-warning-card" onClick={() => setStatusFilter('low')}>
          <div className="kpi-icon">⚠️</div>
          <div className="kpi-value text-warning">{lowStockProductsCount}</div>
          <div className="kpi-label">สต็อกต่ำกว่าเกณฑ์</div>
        </div>
        <div className="card kpi-card clickable alert-danger-card" onClick={() => setStatusFilter('out')}>
          <div className="kpi-icon">🚨</div>
          <div className="kpi-value text-danger">{outOfStockProductsCount}</div>
          <div className="kpi-label">สินค้าหมด</div>
        </div>
      </div>

      {/* Filters & Actions */}
      <div className="card inventory-controls" style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="flex justify-between items-center gap-md" style={{ flexWrap: 'wrap' }}>
          {/* Search bar */}
          <div className="input-group" style={{ flex: '1', minWidth: '260px' }}>
            <input
              type="text"
              className="input input-search"
              placeholder="ค้นหารหัส, ชื่อสินค้า หรือ บาร์โค้ด..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Status Filter Pills */}
          <div className="status-filters flex gap-sm">
            <button
              className={`btn btn-secondary btn-sm ${statusFilter === 'all' ? 'btn-primary' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              ทั้งหมด
            </button>
            <button
              className={`btn btn-secondary btn-sm ${statusFilter === 'low' ? 'btn-primary' : ''}`}
              onClick={() => setStatusFilter('low')}
            >
              ⚠️ ใกล้หมด
            </button>
            <button
              className={`btn btn-secondary btn-sm ${statusFilter === 'out' ? 'btn-primary' : ''}`}
              onClick={() => setStatusFilter('out')}
            >
              🚨 หมดแล้ว
            </button>
          </div>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ width: '80px', textAlign: 'center' }}>รูป</th>
                <th>สินค้า</th>
                <th>บาร์โค้ด</th>
                <th>หมวดหมู่</th>
                <th style={{ textAlign: 'right' }}>เกณฑ์ขั้นต่ำ</th>
                <th style={{ textAlign: 'right', width: '150px' }}>จำนวนในสต็อก</th>
                <th>ระดับสต็อก</th>
                <th style={{ width: '220px', textAlign: 'center' }}>ปรับสต็อกด่วน</th>
                <th style={{ width: '100px', textAlign: 'center' }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length > 0 ? (
                filteredProducts.map((product) => {
                  const isOut = product.stock === 0;
                  const isLow = product.stock <= product.minStock && product.stock > 0;
                  
                  // Calculate stock percentage for progress bar (max reference 100 or minStock * 3)
                  const maxRef = Math.max(100, product.minStock * 4);
                  const stockPct = Math.min(100, (product.stock / maxRef) * 100);

                  return (
                    <tr key={product.id}>
                      <td style={{ textAlign: 'center', fontSize: '1.5rem' }}>
                        {product.image || '📦'}
                      </td>
                      <td>
                        <div style={{ fontWeight: '600' }}>{product.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          ID: {product.id}
                        </div>
                      </td>
                      <td style={{ fontFamily: 'monospace' }}>{product.barcode}</td>
                      <td>
                        <span className="badge badge-info">{product.category}</span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '600' }}>
                        {product.minStock} {product.unit || 'ชิ้น'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '800' }}>
                        <span className={isOut ? 'text-danger' : isLow ? 'text-warning' : 'text-success'}>
                          {product.stock} {product.unit || 'ชิ้น'}
                        </span>
                      </td>
                      <td>
                        <div className="stock-level-bar-container">
                          <div
                            className={`stock-level-bar ${isOut ? 'out' : isLow ? 'low' : 'good'}`}
                            style={{ width: `${stockPct}%` }}
                          />
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                          {isOut ? (
                            <span className="text-danger font-bold">⚠️ สต็อกหมด</span>
                          ) : isLow ? (
                            <span className="text-warning font-bold">⚠️ ควรเติมสินค้า</span>
                          ) : (
                            <span className="text-success">ปกติ</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="flex justify-center gap-xs">
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleQuickAdjust(product, -1)}
                            disabled={product.stock <= 0}
                          >
                            -1
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleQuickAdjust(product, 1)}
                          >
                            +1
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleQuickAdjust(product, 10)}
                          >
                            +10
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleQuickAdjust(product, 50)}
                          >
                            +50
                          </button>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn btn-primary btn-sm btn-icon"
                          title="ปรับสต็อกละเอียด"
                          onClick={() => {
                            setAdjustProduct(product);
                            setAdjustLocation('โกดังใหญ่');
                          }}
                        >
                          ⚙️
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }}>🔍</div>
                    <div style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>
                      ไม่พบสินค้าคงคลังตามเงื่อนไขที่เลือก
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Adjust Stock Modal */}
      {adjustProduct && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">⚙️ ปรับปรุงยอดสต็อก</h3>
              <button className="modal-close" onClick={() => setAdjustProduct(null)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleAdjustStockSubmit}>
              <div className="modal-body">
                <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '2.5rem' }}>{adjustProduct.image || '📦'}</span>
                  <div>
                    <h4 style={{ margin: '0' }}>{adjustProduct.name}</h4>
                    <p style={{ margin: '0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      บาร์โค้ด: {adjustProduct.barcode}
                    </p>
                    <p style={{ margin: '0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      สต็อกปัจจุบัน: <strong>{adjustProduct.stock} {adjustProduct.unit || 'ชิ้น'}</strong>
                    </p>
                  </div>
                </div>

                <div className="input-group">
                  <label htmlFor="adjust-location">เลือกโกดังที่ต้องการปรับปรุง *</label>
                  <select
                    id="adjust-location"
                    className="input"
                    value={adjustLocation}
                    onChange={(e) => setAdjustLocation(e.target.value)}
                    required
                  >
                    <option value="โกดังใหญ่">🏢 โกดังใหญ่ (คงเหลือ: {adjustProduct.stockBig ?? 0})</option>
                    <option value="โกดังกุ๊กไก่">🐓 โกดังกุ๊กไก่ (คงเหลือ: {adjustProduct.stockKookkai ?? 0})</option>
                    <option value="ออฟฟิศ">💼 ออฟฟิศ (คงเหลือ: {adjustProduct.stockOffice ?? 0})</option>
                  </select>
                </div>

                <div className="input-group">
                  <label htmlFor="adjust-amount">จำนวนที่ปรับปรุง (ใช้ค่าติดลบเพื่อลดสต็อก)</label>
                  <input
                    type="number"
                    id="adjust-amount"
                    className="input"
                    placeholder="เช่น 50 หรือ -10"
                    required
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                  />
                </div>

                <div className="input-group">
                  <label htmlFor="adjust-reason">เหตุผลการปรับปรุงสต็อก</label>
                  <select
                    id="adjust-reason"
                    className="input"
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                  >
                    <option value="รับสินค้าเข้า">📥 รับสินค้าเข้า (ซื้อเพิ่ม)</option>
                    <option value="ปรับปรุงยอดตกหล่น">✏️ ปรับปรุงยอด (ตรวจนับใหม่)</option>
                    <option value="ตัดสต็อกสินค้าเสียหาย">❌ ตัดสต็อกสินค้าเสียหาย/หมดอายุ</option>
                    <option value="คืนสินค้าให้ซัพพลายเออร์">📤 ส่งคืนซัพพลายเออร์</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setAdjustProduct(null)}>
                  ยกเลิก
                </button>
                <button type="submit" className="btn btn-primary">
                  บันทึกการเปลี่ยนแปลง
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
