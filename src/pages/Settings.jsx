import React, { useState } from 'react';
import { useStore } from '../data/store';
import './Settings.css';
import { showAlert, showConfirm } from '../utils/alerts';

const Settings = () => {
  const { state, dispatch, resetToDefaults } = useStore();
  const { storeInfo, promotions } = state;

  // Store Info form state
  const [storeForm, setStoreForm] = useState({
    name: storeInfo.name || '',
    address: storeInfo.address || '',
    phone: storeInfo.phone || '',
    taxId: storeInfo.taxId || '',
    taxRate: storeInfo.taxRate || 7,
  });

  // New promotion form state
  const [promoForm, setPromoForm] = useState({
    code: '',
    name: '',
    type: 'percent',
    value: '',
    minPurchase: '',
    active: true,
  });

  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Handle store info save
  const handleStoreInfoSubmit = (e) => {
    e.preventDefault();
    dispatch({
      type: 'UPDATE_STORE_INFO',
      payload: {
        ...storeForm,
        taxRate: Number(storeForm.taxRate),
      },
    });
    showToast('💾 บันทึกข้อมูลร้านค้าเรียบร้อยแล้ว');
  };

  // Handle add promotion
  const handleAddPromo = (e) => {
    e.preventDefault();
    if (!promoForm.code.trim() || !promoForm.name.trim() || !promoForm.value) return;

    dispatch({
      type: 'ADD_PROMO',
      payload: {
        id: 'promo_' + Date.now(),
        code: promoForm.code.trim().toUpperCase(),
        name: promoForm.name.trim(),
        type: promoForm.type,
        value: Number(promoForm.value),
        minPurchase: Number(promoForm.minPurchase || 0),
        active: promoForm.active,
      },
    });

    setPromoForm({
      code: '',
      name: '',
      type: 'percent',
      value: '',
      minPurchase: '',
      active: true,
    });
    showToast('🎉 เพิ่มโปรโมชั่นใหม่สำเร็จ');
  };

  // Handle toggle promotion
  const handleTogglePromo = (promoId) => {
    dispatch({
      type: 'TOGGLE_PROMO',
      payload: promoId,
    });
    showToast('🔄 อัปเดตสถานะโปรโมชั่น');
  };

  // Handle delete promotion
  const handleDeletePromo = async (promoId) => {
    const confirmed = await showConfirm(
      'คุณแน่ใจที่จะลบโปรโมชั่นนี้?',
      'ข้อมูลโปรโมชั่นจะถูกลบออกจากระบบอย่างถาวร',
      'ใช่, ลบเลย',
      'ยกเลิก'
    );
    if (confirmed) {
      dispatch({
        type: 'DELETE_PROMO',
        payload: promoId,
      });
      showToast('🗑️ ลบโปรโมชั่นแล้ว');
    }
  };

  // Handle reset system to defaults
  const handleResetSystem = async () => {
    const confirmed = await showConfirm(
      'คุณต้องการรีเซ็ตข้อมูลทั้งหมดกลับเป็นค่าเริ่มต้นหรือไม่?',
      '⚠️ คำเตือน: ข้อมูลการขายและสินค้าที่คุณเพิ่มจะถูกเปลี่ยนกลับทั้งหมดและไม่สามารถกู้คืนได้!',
      'ใช่, รีเซ็ตเลย',
      'ยกเลิก'
    );
    if (confirmed) {
      resetToDefaults();
      // Reload page to re-fill form states
      window.location.reload();
    }
  };

  return (
    <div className="page-container">
      {/* Toast Alert */}
      {toastMessage && <div className="settings-toast">{toastMessage}</div>}

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">⚙️ ตั้งค่าระบบ</h1>
          <p className="page-subtitle">จัดการรายละเอียดร้านค้า สาขา และโปรโมชั่น/ส่วนลด</p>
        </div>
        <button className="btn btn-danger" onClick={handleResetSystem}>
          ⚠️ รีเซ็ตข้อมูลเริ่มต้น
        </button>
      </div>

      <div className="settings-grid">
        {/* Left Column - Store Details & Branches */}
        <div className="settings-column">
          {/* Store Info Card */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: 'var(--space-md)' }}>🏪 รายละเอียดร้านค้า</h3>
            <form onSubmit={handleStoreInfoSubmit} className="settings-form">
              <div className="input-group">
                <label>ชื่อร้านค้า</label>
                <input
                  type="text"
                  className="input"
                  value={storeForm.name}
                  onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="input-group">
                <label>ที่อยู่ร้านค้า</label>
                <textarea
                  className="input"
                  style={{ minHeight: '80px', resize: 'vertical' }}
                  value={storeForm.address}
                  onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })}
                  required
                />
              </div>

              <div className="input-group-row">
                <div className="input-group">
                  <label>เบอร์โทรศัพท์</label>
                  <input
                    type="text"
                    className="input"
                    value={storeForm.phone}
                    onChange={(e) => setStoreForm({ ...storeForm, phone: e.target.value })}
                    required
                  />
                </div>
                <div className="input-group">
                  <label>อัตราภาษีมูลค่าเพิ่ม (%)</label>
                  <input
                    type="number"
                    className="input"
                    value={storeForm.taxRate}
                    onChange={(e) => setStoreForm({ ...storeForm, taxRate: e.target.value })}
                    min="0"
                    max="100"
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label>เลขประจำตัวผู้เสียภาษี (Tax ID)</label>
                <input
                  type="text"
                  className="input"
                  value={storeForm.taxId}
                  onChange={(e) => setStoreForm({ ...storeForm, taxId: e.target.value })}
                />
              </div>

              <button type="submit" className="btn btn-primary btn-block">
                💾 บันทึกข้อมูลร้านค้า
              </button>
            </form>
          </div>


        </div>

        {/* Right Column - Promotions */}
        <div className="settings-column">
          {/* Promotions list Card */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: 'var(--space-md)' }}>🏷️ โค้ดส่วนลด & โปรโมชั่น</h3>

            {/* Add Promotion Form */}
            <form onSubmit={handleAddPromo} className="settings-form promo-form">
              <h4 className="section-subtitle">➕ เพิ่มโปรโมชั่นใหม่</h4>
              
              <div className="input-group-row">
                <div className="input-group">
                  <label>โค้ดส่วนลด (เช่น SALE20)</label>
                  <input
                    type="text"
                    className="input"
                    style={{ textTransform: 'uppercase' }}
                    placeholder="SALE20"
                    value={promoForm.code}
                    onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value })}
                    required
                  />
                </div>
                <div className="input-group">
                  <label>ชื่อ/รายละเอียดโปรโมชั่น</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="ส่วนลดพิเศษ"
                    value={promoForm.name}
                    onChange={(e) => setPromoForm({ ...promoForm, name: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="input-group-row">
                <div className="input-group">
                  <label>ประเภทส่วนลด</label>
                  <select
                    className="input"
                    value={promoForm.type}
                    onChange={(e) => setPromoForm({ ...promoForm, type: e.target.value, value: '' })}
                  >
                    <option value="percent">เปอร์เซ็นต์ (%)</option>
                    <option value="fixed">จำนวนเงินคงที่ (บาท)</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>{promoForm.type === 'percent' ? 'มูลค่าลด (%)' : 'มูลค่าลด (บาท)'}</label>
                  <input
                    type="number"
                    className="input"
                    min="1"
                    max={promoForm.type === 'percent' ? '100' : '9999'}
                    placeholder={promoForm.type === 'percent' ? '10' : '50'}
                    value={promoForm.value}
                    onChange={(e) => setPromoForm({ ...promoForm, value: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="input-group-row">
                <div className="input-group">
                  <label>ยอดซื้อขั้นต่ำ (บาท)</label>
                  <input
                    type="number"
                    className="input"
                    min="0"
                    placeholder="0"
                    value={promoForm.minPurchase}
                    onChange={(e) => setPromoForm({ ...promoForm, minPurchase: e.target.value })}
                  />
                </div>
                <div className="input-group" style={{ justifyContent: 'center', alignItems: 'flex-start', paddingTop: '20px' }}>
                  <label className="toggle-label flex items-center gap-sm" style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={promoForm.active}
                      onChange={(e) => setPromoForm({ ...promoForm, active: e.target.checked })}
                    />
                    เปิดใช้งานทันที
                  </label>
                </div>
              </div>

              <button type="submit" className="btn btn-primary btn-block">
                ➕ เพิ่มโค้ดส่วนลด
              </button>
            </form>

            <div className="receipt-divider" style={{ margin: 'var(--space-lg) 0' }}>- - - - - - - - - - - - - - -</div>

            <h4 className="section-subtitle" style={{ marginBottom: 'var(--space-sm)' }}>📋 รายการส่วนลดทั้งหมด</h4>
            <div className="promo-list">
              {promotions && promotions.map((promo) => (
                <div key={promo.id} className={`promo-item flex justify-between items-center ${!promo.active ? 'inactive' : ''}`}>
                  <div className="promo-info">
                    <div className="flex items-center gap-sm">
                      <span className="promo-badge">{promo.code}</span>
                      <strong className="promo-title">{promo.name}</strong>
                    </div>
                    <div className="promo-details">
                      ลด: {promo.type === 'percent' ? `${promo.value}%` : `฿${promo.value}`} | ขั้นต่ำ: ฿{promo.minPurchase}
                    </div>
                  </div>
                  <div className="promo-actions flex items-center gap-md">
                    <label className="switch-container">
                      <input
                        type="checkbox"
                        checked={promo.active}
                        onChange={() => handleTogglePromo(promo.id)}
                      />
                      <span className="switch-slider"></span>
                    </label>
                    <button
                      className="btn-delete-item"
                      onClick={() => handleDeletePromo(promo.id)}
                      title="ลบโปรโมชั่น"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
