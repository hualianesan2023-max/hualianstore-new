import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../data/store';
import logoImg from '../assets/logo.png';
import './Receipt.css';

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

    if (d1 === 2) satangStr += 'ยี่';
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

const formatDateThaiPrepared = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear() + 543;
  return `${day}/${month}/${year}`;
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

// ── Vector Barcode Generator ─────────────────────────────────────
const BarcodeSvg = ({ value }) => {
  const str = String(value || 'IVS0000-000');
  const bars = [];
  let currentX = 10;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    const pattern = [
      (code % 2) + 1,
      ((code >> 1) % 2) + 1,
      ((code >> 2) % 2) + 1,
      ((code >> 3) % 2) + 1,
    ];
    for (let p = 0; p < pattern.length; p++) {
      const w = pattern[p];
      if (p % 2 === 0) {
        bars.push(
          <rect
            key={`${i}-${p}`}
            x={currentX}
            y={2}
            width={w * 1.6}
            height={36}
            fill="#111827"
          />
        );
      }
      currentX += w * 1.6 + 1.2;
    }
    currentX += 2.5;
  }
  return (
    <svg
      width={Math.max(currentX + 10, 160)}
      height={42}
      viewBox={`0 0 ${currentX + 10} 42`}
      style={{ display: 'block', margin: '0 auto' }}
    >
      {bars}
    </svg>
  );
};

const Receipt = ({ sale, onClose }) => {
  const { state } = useStore();
  const store = state.storeInfo;
  const containerRef = useRef(null);

  // Determine whether this sale is a spare parts sale (อะไหล่) or machine sale (เครื่องจักร)
  // รายการอะไหล่: มีทั้งใบเสร็จ + ใบปะหน้ากล่องพัสดุ (2 หน้า)
  // รายการเครื่องจักร: มีเฉพาะใบเสร็จรับเงินอย่างเดียว (1 หน้า A4) ไม่เอาใบปะหน้า
  const isSparePartsSale = Boolean(
    sale?.isSpareParts ||
    sale?.saleType === 'spare_parts' ||
    sale?.type === 'spare_parts' ||
    (sale?.id && String(sale.id).toUpperCase().startsWith('IVS')) ||
    (sale?.items && sale.items.some((it) =>
      Boolean(it?.partId || it?.part_code || String(it?.productId || it?.id || '').toUpperCase().startsWith('HL-'))
    ))
  );

  // Tabs: 'both' (ดูทั้ง 2 หน้า) | 'receipt' (หน้า 1 ใบเสร็จ) | 'shipping' (หน้า 2 ใบปะหน้า)
  const [previewTab, setPreviewTab] = useState(isSparePartsSale ? 'both' : 'receipt');
  const [scale, setScale] = useState(0.62);

  // ── Calculate Viewport Scale ──────────────────────────────────
  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      const containerHeight = containerRef.current.clientHeight;
      const containerWidth = containerRef.current.clientWidth;

      // A4 dimensions in pixels at 96dpi: width=794, height=1123
      const a4Height = 1123;
      const a4Width = 794;

      if (previewTab === 'both') {
        // Fit width comfortably so user can scroll through both pages
        const scaleW = (containerWidth - 50) / a4Width;
        const newScale = Math.min(Math.max(scaleW, 0.45), 0.76);
        setScale(newScale);
      } else if (previewTab === 'receipt') {
        // Fit single page inside the available viewport
        const scaleH = (containerHeight - 50) / a4Height;
        const scaleW = (containerWidth - 40) / a4Width;
        const newScale = Math.min(scaleH, scaleW, 0.95);
        setScale(newScale);
      } else if (previewTab === 'shipping') {
        // Shipping label is compact (~520px) so scale comfortably
        const scaleH = (containerHeight - 50) / 520;
        const scaleW = (containerWidth - 40) / a4Width;
        const newScale = Math.min(scaleH, scaleW, 0.95);
        setScale(Math.max(newScale, 0.65));
      }
    };

    const timer = setTimeout(updateScale, 50);
    window.addEventListener('resize', updateScale);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateScale);
    };
  }, [sale, previewTab]);

  // Handle print active class and native Ctrl+P listeners
  useEffect(() => {
    document.body.classList.add('print-receipt-active');

    const handleBeforePrint = () => {
      document.body.classList.remove('print-receipt-only', 'print-shipping-only');
      if (previewTab === 'receipt') {
        document.body.classList.add('print-receipt-only');
      } else if (previewTab === 'shipping') {
        document.body.classList.add('print-shipping-only');
      }
    };

    const handleAfterPrint = () => {
      document.body.classList.remove('print-receipt-only', 'print-shipping-only');
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      document.body.classList.remove('print-receipt-active', 'print-receipt-only', 'print-shipping-only');
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [previewTab]);

  // ── Print Handlers ───────────────────────────────────────────
  const handlePrint = (mode = 'both') => {
    document.body.classList.remove('print-receipt-only', 'print-shipping-only');
    if (mode === 'receipt') {
      document.body.classList.add('print-receipt-only');
    } else if (mode === 'shipping') {
      document.body.classList.add('print-shipping-only');
    }

    const cleanup = () => {
      document.body.classList.remove('print-receipt-only', 'print-shipping-only');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);

    window.print();
    setTimeout(cleanup, 1500);
  };

  if (!sale) return null;

  // ── Calculations ─────────────────────────────────────────────
  const showPreVat = sale.applyVat && sale.isVatInclusive;

  const baseSubtotal = (sale.items || []).reduce((sum, item) => {
    const itemTotal = item.subtotal ?? (item.sellPrice ?? item.price ?? 0) * (item.quantity ?? 1);
    return sum + itemTotal;
  }, 0);

  const subtotal = sale.subtotal ?? (showPreVat ? baseSubtotal / 1.07 : baseSubtotal);
  const discountAmount = sale.discountAmount ?? sale.discount ?? 0;
  const tax = sale.tax ?? 0;
  const shippingCost = sale.shippingCost ?? 0;
  const installationCost = sale.installationCost ?? 0;
  const total = sale.total ?? (subtotal - discountAmount + tax + shippingCost + installationCost);
  const cashReceived = sale.cashReceived ?? 0;
  const remainingBalance = cashReceived < total && cashReceived > 0 ? total - cashReceived : 0;

  // ── Padded rows for Page 1 A4 layout ─────────────────────────
  const minTableRows = 7;
  const paddedItems = [...(sale.items || [])];
  while (paddedItems.length < minTableRows) {
    paddedItems.push(null);
  }

  const modalContent = (
    <div className="modal-overlay receipt-modal-overlay" onClick={onClose}>
      <div className="receipt-modal" onClick={(e) => e.stopPropagation()}>
        {/* ─── Modal Top Header Bar ────────────────────────────── */}
        <div className="receipt-modal-header">
          <div className="receipt-modal-title-wrap">
            <span className="receipt-modal-icon">🖨️</span>
            <div>
              <h3 className="receipt-modal-main-title">
                {isSparePartsSale ? `พิมพ์เอกสารการขายอะไหล่ #${sale.id}` : `พิมพ์ใบเสร็จรับเงิน #${sale.id}`}
              </h3>
              <span className="receipt-modal-sub-title">
                {isSparePartsSale
                  ? 'หน้า 1: ใบเสร็จรับเงิน A4  |  หน้า 2: ใบปะหน้ากล่องพัสดุ'
                  : 'ใบเสร็จรับเงิน / ใบกำกับภาษีอย่างย่อ (A4)'}
              </span>
            </div>
          </div>

          {/* View Mode Tabs (Screen Preview - เฉพาะรายการอะไหล่ที่มี 2 หน้า) */}
          {isSparePartsSale && (
            <div className="receipt-view-tabs">
              <button
                type="button"
                className={`receipt-view-tab ${previewTab === 'both' ? 'active' : ''}`}
                onClick={() => setPreviewTab('both')}
              >
                📑 ดูทั้ง 2 หน้า
              </button>
              <button
                type="button"
                className={`receipt-view-tab ${previewTab === 'receipt' ? 'active' : ''}`}
                onClick={() => setPreviewTab('receipt')}
              >
                📄 หน้า 1: ใบเสร็จ
              </button>
              <button
                type="button"
                className={`receipt-view-tab ${previewTab === 'shipping' ? 'active' : ''}`}
                onClick={() => setPreviewTab('shipping')}
              >
                📦 หน้า 2: ใบปะหน้ากล่อง
              </button>
            </div>
          )}

          <button
            type="button"
            className="receipt-modal-close-btn"
            onClick={onClose}
            title="ปิดหน้าต่าง"
          >
            ✕
          </button>
        </div>

        {/* ─── Paper Viewport Container ────────────────────────── */}
        <div className="receipt-paper-container" ref={containerRef}>
          <div className="receipt-pages-scroll-area">
            {/* ═══════════════════════════════════════════════════════ */}
            {/* ── PAGE 1: ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อ ────────── */}
            {/* ═══════════════════════════════════════════════════════ */}
            <div
              className={`receipt-paper-wrapper receipt-wrapper-page-1 ${
                previewTab === 'shipping' ? 'screen-hidden-tab' : ''
              }`}
              style={{
                width: `${794 * scale}px`,
                height: `${1123 * scale}px`,
              }}
            >
              {previewTab === 'both' && (
                <div className="receipt-page-indicator">
                  📄 หน้า 1 : ใบเสร็จรับเงิน / ใบกำกับภาษีอย่างย่อ
                </div>
              )}

              <div
                className="receipt-paper receipt-page-1"
                style={{
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                }}
              >
                {/* ── Letterhead (Header) ── */}
                <div className="receipt-letterhead">
                  <div className="receipt-logo-container">
                    <img src={logoImg} alt="HUALIAN Logo" className="receipt-logo-img" />
                  </div>

                  <div className="receipt-company-info">
                    <h1 className="company-name">
                      {store.name || 'ห้างหุ้นส่วนจำกัด หัวเหรียญ อีสาน HUALIAN ESAN LTD.,PART.'}
                    </h1>
                    <p className="company-address">
                      {store.address ||
                        'สำนักงานใหญ่ : 841/7 หมู่ 5 ต.หนองจะบก อ.เมืองนครราชสีมา จ.นครราชสีมา 30000'}
                    </p>
                    <p className="company-contact">
                      เลขประจำตัวผู้เสียภาษี {store.taxId || '0303547004494'} โทร.{' '}
                      {store.phone || '044-002716 , 085-4957093'}
                    </p>
                  </div>
                </div>

                {/* ── Document Title ── */}
                <div className="receipt-title-block">
                  <h2 className="title-th">ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อ</h2>
                  <h3 className="title-en">Receipt/Abbreviated Tax Invoice</h3>
                </div>

                {/* ── Customer & Invoice Grid ── */}
                <div className="receipt-grid">
                  {/* Customer Details */}
                  <div className="grid-customer-box">
                    <div className="info-row">
                      <span className="info-label font-bold">ชื่อลูกค้า</span>
                      <span className="info-val">: {sale.customer ? sale.customer.name : 'ลูกค้าทั่วไป'}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label font-bold">ที่อยู่ (Address)</span>
                      <span className="info-val">: {sale.customer?.address || '-'}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label font-bold">เบอร์โทร (Tel.)</span>
                      <span className="info-val">: {sale.customer?.phone || '-'}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label font-bold">เลขประจำตัวผู้เสียภาษี (TAX ID)</span>
                      <span className="info-val">: {sale.customer?.taxId || '-'}</span>
                    </div>
                  </div>

                  {/* Bill Details */}
                  <div className="grid-invoice-box">
                    <div className="info-row split">
                      <span className="info-label font-bold">เลขที่ (No.)</span>
                      <span className="info-val font-bold">{sale.id}</span>
                    </div>
                    <div className="info-row split border-top">
                      <span className="info-label font-bold">วันที่ (Date)</span>
                      <span className="info-val">{formatDateThaiShort(sale.date)}</span>
                    </div>
                    <div className="info-row split border-top">
                      <span className="info-label font-bold">กำหนดชำระเงิน</span>
                      <span className="info-val">{formatDateThaiShort(sale.date)}</span>
                    </div>
                    <div className="info-row split border-top">
                      <span className="info-label font-bold">พนักงานขาย (Sale)</span>
                      <span className="info-val text-blue font-bold">{sale.employee || 'หน้าร้าน'}</span>
                    </div>
                  </div>
                </div>

                {/* ── Items Table ── */}
                <table className="receipt-items-table">
                  <thead>
                    <tr>
                      <th style={{ width: '6%' }}>
                        ลำดับ<br />
                        <span className="sub-th">(Item)</span>
                      </th>
                      <th style={{ width: '12%' }}>
                        รหัสสินค้า<br />
                        <span className="sub-th">(Article Number)</span>
                      </th>
                      <th style={{ width: '39%', textAlign: 'left' }}>
                        รายการ<br />
                        <span className="sub-th">(Article Description)</span>
                      </th>
                      <th style={{ width: '8%' }}>
                        จำนวน<br />
                        <span className="sub-th">(Qty)</span>
                      </th>
                      <th style={{ width: '7%' }}>
                        หน่วย<br />
                        <span className="sub-th">(Unit)</span>
                      </th>
                      <th style={{ width: '13%' }}>
                        ราคา/หน่วย<br />
                        <span className="sub-th">(Price/Unit)</span>
                      </th>
                      <th style={{ width: '15%' }}>
                        จำนวนเงิน<br />
                        <span className="sub-th">(Amount)</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paddedItems.map((item, idx) => {
                      if (item) {
                        const catalogPrice = item.sellPrice ?? item.price ?? 0;
                        const qty = item.quantity ?? 1;
                        const catalogTotal = item.subtotal ?? catalogPrice * qty;

                        const itemPrice = showPreVat ? catalogPrice / 1.07 : catalogPrice;
                        const itemTotal = showPreVat ? catalogTotal / 1.07 : catalogTotal;
                        const itemCode = item.productId || item.id || '';
                        const isSparePart = Boolean(
                          (sale.id && String(sale.id).startsWith('IVS')) ||
                            item.partId ||
                            String(itemCode).toUpperCase().startsWith('HL-')
                        );
                        const productUnit =
                          item.unit ||
                          state.products.find((p) => p.id === itemCode)?.unit ||
                          (isSparePart ? 'ตัว' : 'เครื่อง');

                        return (
                          <tr key={itemCode || idx}>
                            <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                            <td style={{ textAlign: 'center' }}>{itemCode || '-'}</td>
                            <td className="item-description-cell">
                              {item.name}
                              {sale.discountAmount > 0 && idx === 0 && (
                                <span className="item-discount-label"> (ส่วนลดโปรโมชั่น/คูปอง)</span>
                              )}
                            </td>
                            <td style={{ textAlign: 'center' }}>{qty}</td>
                            <td style={{ textAlign: 'center' }}>{productUnit}</td>
                            <td style={{ textAlign: 'right' }}>{formatCurrency(itemPrice)}</td>
                            <td style={{ textAlign: 'right' }}>{formatCurrency(itemTotal)}</td>
                          </tr>
                        );
                      } else {
                        // Empty row padding
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

                {/* ── Bottom Grid ── */}
                <div className="receipt-bottom-grid">
                  {/* Left: Word amount, payment terms */}
                  <div className="bottom-left-box">
                    <div className="word-amount-row">
                      <span className="font-bold">(ตัวอักษร)</span>
                      <span className="word-amount-val italic font-bold">{bahtText(total)}</span>
                    </div>
                    <div className="payment-terms-box border-top">
                      <span className="terms-title font-bold">เงื่อนไขชำระเงิน</span>
                      <div className="checkbox-row">
                        <label className="checkbox-container">
                          <input type="checkbox" checked={sale.paymentMethod === 'cash'} readOnly />
                          <span className="checkmark"></span>
                          เงินสด
                        </label>
                        <label className="checkbox-container">
                          <input type="checkbox" checked={false} readOnly />
                          <span className="checkmark"></span>
                          เช็คเลขที่........................................ธนาคาร............................วันที่....................
                        </label>
                      </div>
                      <div className="checkbox-row transfer-row">
                        <label className="checkbox-container">
                          <input
                            type="checkbox"
                            checked={sale.paymentMethod === 'transfer' || sale.paymentMethod === 'qr'}
                            readOnly
                          />
                          <span className="checkmark"></span>
                          โอน
                        </label>
                        <span className="bank-info-details">
                          ธนาคาร: กสิกรไทย สาขา: มิตรภาพ (นครราชสีมา) <br />
                          ชื่อบัญชี: หจก.หัวเหรียญ อีสาน &nbsp;&nbsp; เลขที่: 200-2-14611-2
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Calculations */}
                  <div className="bottom-right-box">
                    <div className="calc-row">
                      <span className="calc-label font-bold">ราคาสินค้าทั้งสิ้น</span>
                      <span className="calc-val">{formatCurrency(subtotal)}</span>
                    </div>
                    {shippingCost > 0 && (
                      <div className="calc-row border-top">
                        <span className="calc-label font-bold">ค่าจัดส่ง</span>
                        <span className="calc-val">{formatCurrency(shippingCost)}</span>
                      </div>
                    )}
                    {installationCost > 0 && (
                      <div className="calc-row border-top">
                        <span className="calc-label font-bold">ค่าติดตั้ง</span>
                        <span className="calc-val">{formatCurrency(installationCost)}</span>
                      </div>
                    )}
                    {discountAmount > 0 && (
                      <div className="calc-row border-top">
                        <span className="calc-label font-bold">ส่วนลดพิเศษ</span>
                        <span className="calc-val text-red font-bold">
                          -{formatCurrency(discountAmount)}
                        </span>
                      </div>
                    )}
                    <div className="calc-row border-top">
                      <span className="calc-label font-bold">ภาษีมูลค่าเพิ่ม 7 %</span>
                      <span className="calc-val">{tax > 0 ? formatCurrency(tax) : '-'}</span>
                    </div>
                    <div className="calc-row border-top highlight-paid">
                      <span className="calc-label font-bold">ยอดที่ชำระแล้ว</span>
                      <span className="calc-val text-red font-bold">
                        {formatCurrency(cashReceived > 0 ? cashReceived : total)}
                      </span>
                    </div>
                    <div className="calc-row border-top highlight-balance">
                      <span className="calc-label font-bold">ยอดคงเหลือสุทธิ</span>
                      <span className="calc-val text-blue font-bold">
                        {formatCurrency(remainingBalance)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ── Footer Notice ── */}
                <div className="receipt-footer-notice">
                  <p>ได้รับสินค้าตรงตามรายการข้างต้นนี้โดยไม่มีสิ่งใดเสียหาย</p>
                  <p className="sub-notice">Received the goods in good order and condition</p>
                </div>

                {/* ── Signatures ── */}
                <div className="receipt-signatures-container">
                  <div className="signature-column">
                    <div className="signature-line-name"></div>
                    <div className="signature-line-border"></div>
                    <span className="signature-label font-bold">ผู้จัดทำเอกสาร</span>
                    <div className="signature-date">
                      วันที่/Date &nbsp;&nbsp;&nbsp;&nbsp;{formatDateThaiPrepared(sale.date)}
                    </div>
                  </div>

                  <div className="signature-column">
                    <div className="signature-line-name"></div>
                    <div className="signature-line-border"></div>
                    <span className="signature-label font-bold">ผู้รับเงิน</span>
                    <div className="signature-date">
                      วันที่/Date &nbsp;&nbsp;&nbsp;&nbsp;............................
                    </div>
                  </div>

                  <div className="signature-column">
                    <div className="signature-line-name"></div>
                    <div className="signature-line-border"></div>
                    <span className="signature-label font-bold">ผู้จ่ายเงิน</span>
                    <div className="signature-date">
                      วันที่/Date &nbsp;&nbsp;&nbsp;&nbsp;............................
                    </div>
                  </div>
                </div>

                {/* ── Print Timestamp ── */}
                <div className="receipt-print-timestamp">{formatPrintTimestamp()}</div>
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════════ */}
            {/* ── PAGE 2: ใบปะหน้ากล่องพัสดุ (เฉพาะรายการขายอะไหล่) ──── */}
            {/* ═══════════════════════════════════════════════════════ */}
            {isSparePartsSale && (
              <div
                className={`receipt-paper-wrapper receipt-wrapper-page-2 ${
                  previewTab === 'receipt' ? 'screen-hidden-tab' : ''
                }`}
                style={{
                  width: `${794 * scale}px`,
                  height: previewTab === 'shipping' ? 'auto' : `${1123 * scale}px`,
                }}
              >
                {previewTab === 'both' && (
                  <div className="receipt-page-indicator shipping-indicator">
                    📦 หน้า 2 : ใบปะหน้ากล่องพัสดุ (สำหรับติดหน้ากล่อง)
                  </div>
                )}

                <div
                  className="receipt-paper receipt-page-2"
                  style={{
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                  }}
                >
                  {/* ── Shipping Header ── */}
                  <div className="shipping-header">
                    <div className="shipping-logo-wrap">
                      <img src={logoImg} alt="HUALIAN Logo" className="shipping-logo" />
                      <div className="shipping-company-titles">
                        <h2 className="shipping-company-name">
                          {store.name || 'ห้างหุ้นส่วนจำกัด หัวเหรียญ อีสาน HUALIAN ESAN LTD.,PART.'}
                        </h2>
                        <p className="shipping-company-sub">
                          ศูนย์จำหน่ายเครื่องจักรบรรจุภัณฑ์และอะไหล่แท้ HUALIAN มาตรฐานโรงงาน
                        </p>
                      </div>
                    </div>
                    <div className="shipping-doc-badge">
                      <div className="shipping-badge-title">📦 ใบปะหน้ากล่องพัสดุ</div>
                      <div className="shipping-badge-en">PARCEL SHIPPING LABEL</div>
                      <div className="shipping-barcode-wrap">
                        <BarcodeSvg value={sale.id} />
                        <span className="shipping-barcode-text">*{sale.id}*</span>
                      </div>
                    </div>
                  </div>

                  {/* ── Sender & Order Info Grid ── */}
                  <div className="shipping-info-grid">
                    {/* Left: Sender Card */}
                    <div className="shipping-card shipping-sender-card">
                      <div className="shipping-card-header sender-header">
                        <span className="card-tag">📌 ผู้ส่ง (FROM / SENDER)</span>
                      </div>
                      <div className="shipping-card-body">
                        <div className="shipping-party-name">
                          {store.name || 'ห้างหุ้นส่วนจำกัด หัวเหรียญ อีสาน HUALIAN ESAN LTD.,PART.'}
                        </div>
                        <div className="shipping-party-address">
                          {store.address ||
                            'สำนักงานใหญ่ : 841/7 หมู่ 5 ต.หนองจะบก อ.เมืองนครราชสีมา จ.นครราชสีมา 30000'}
                        </div>
                        <div className="shipping-party-phone font-bold">
                          📞 โทร: {store.phone || '044-002716 , 085-4957093'}
                        </div>
                        <div className="shipping-sender-staff">
                          ผู้จัดเตรียมพัสดุ: <b>{sale.employee || 'หน้าร้าน'}</b>
                        </div>
                      </div>
                    </div>

                    {/* Right: Order Meta Card */}
                    <div className="shipping-card shipping-order-card">
                      <div className="shipping-card-header order-header">
                        <span className="card-tag">📋 ข้อมูลการจัดส่ง (SHIPMENT DETAILS)</span>
                      </div>
                      <div className="shipping-card-body">
                        <div className="shipping-meta-row">
                          <span className="lbl">เลขที่คำสั่งซื้อ:</span>
                          <span className="val font-bold text-blue">{sale.id}</span>
                        </div>
                        <div className="shipping-meta-row">
                          <span className="lbl">วันที่จัดส่ง:</span>
                          <span className="val">{formatDateThaiShort(sale.date)}</span>
                        </div>
                        <div className="shipping-meta-row">
                          <span className="lbl">เวลาที่พิมพ์:</span>
                          <span className="val">{formatPrintTimestamp()}</span>
                        </div>
                        <div className="shipping-meta-row">
                          <span className="lbl">วิธีส่ง:</span>
                          <span className="val font-bold text-emerald">🚚 พัสดุด่วน (Express Courier)</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Recipient Card (PROMINENT FOR COURIER) ── */}
                  <div className="shipping-recipient-card">
                    <div className="shipping-recipient-header">
                      <span className="recipient-tag">📥 นำส่งถึง (DELIVER TO / RECIPIENT)</span>
                      <span className="recipient-priority">⚡ พัสดุด่วนพิเศษ (PRIORITY PARCEL)</span>
                    </div>
                    <div className="shipping-recipient-body">
                      <div className="recipient-main-row">
                        <div className="recipient-name-col">
                          <span className="recipient-label">ชื่อผู้รับ / บริษัท:</span>
                          <div className="recipient-name-text">
                            {sale.customer ? sale.customer.name : 'ลูกค้าทั่วไป'}
                          </div>
                        </div>
                        <div className="recipient-phone-box">
                          <span className="phone-label">เบอร์โทรศัพท์ติดต่อผู้รับ:</span>
                          <div className="phone-number-text">
                            📞 {sale.customer?.phone || '-'}
                          </div>
                        </div>
                      </div>

                      <div className="recipient-address-wrap">
                        <span className="address-label">📍 ที่อยู่จัดส่งพัสดุ (DELIVERY ADDRESS):</span>
                        <div className="recipient-address-text">
                          {sale.customer?.address || 'ลูกค้ามารับสินค้าเองที่หน้าร้าน / ไม่ระบุที่อยู่จัดส่ง'}
                        </div>
                      </div>

                      <div className="recipient-tax-text">
                        เลขประจำตัวผู้เสียภาษี (TAX ID): {sale.customer?.taxId ?? '0'}
                      </div>
                    </div>
                  </div>

                  {/* ── Cut Guide Line below label ── */}
                  <div className="shipping-cut-guide">
                    <span className="cut-icon">✂️</span>
                    <span className="cut-dashed-line"></span>
                    <span className="cut-text">ตัดตามรอยประเพื่อติดหน้ากล่องพัสดุ (Cut along dotted line to paste on parcel box)</span>
                    <span className="cut-dashed-line"></span>
                    <span className="cut-icon">✂️</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── Modal Action Buttons Bar ────────────────────────── */}
        <div className="receipt-actions">
          <div className="receipt-actions-left">
            {isSparePartsSale ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-print-all"
                  onClick={() => handlePrint('both')}
                  title="พิมพ์ทั้ง 2 หน้า: หน้า 1 ใบเสร็จ + หน้า 2 ใบปะหน้ากล่อง"
                >
                  🖨️ พิมพ์ใบเสร็จ + ใบปะหน้า (2 หน้า)
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-shipping"
                  onClick={() => handlePrint('shipping')}
                  title="พิมพ์เฉพาะใบปะหน้ากล่องพัสดุ (หน้า 2)"
                >
                  📦 พิมพ์เฉพาะใบปะหน้า (หน้า 2)
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-receipt-only"
                  onClick={() => handlePrint('receipt')}
                  title="พิมพ์เฉพาะใบเสร็จรับเงิน (หน้า 1)"
                >
                  📄 พิมพ์เฉพาะใบเสร็จ (หน้า 1)
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-print-all"
                onClick={() => handlePrint('receipt')}
                title="พิมพ์ใบเสร็จรับเงิน A4"
              >
                🖨️ พิมพ์ใบเสร็จ A4
              </button>
            )}
          </div>
          <button type="button" className="btn btn-secondary btn-close" onClick={onClose}>
            ✕ ปิด
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

export default Receipt;
