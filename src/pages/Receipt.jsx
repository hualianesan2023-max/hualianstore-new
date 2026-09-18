import React, { useRef } from 'react';
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
  const d = new Date(dateStr);
  const day = d.getDate();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear() + 543;
  return `${day}/${month}/${year}`;
};

const formatDateThaiPrepared = (dateStr) => {
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

const Receipt = ({ sale, onClose }) => {
  const { state } = useStore();
  const store = state.storeInfo;
  const receiptRef = useRef(null);
  const containerRef = useRef(null);
  const [scale, setScale] = React.useState(0.6);

  React.useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      const containerHeight = containerRef.current.clientHeight;
      const containerWidth = containerRef.current.clientWidth;
      
      // A4 dimensions in pixels at 96dpi: width=794, height=1123
      const a4Height = 1123;
      const a4Width = 794;
      
      // Calculate scale factors
      const scaleH = (containerHeight - 30) / a4Height; // 30px padding
      const scaleW = (containerWidth - 30) / a4Width;
      
      const newScale = Math.min(scaleH, scaleW, 1);
      setScale(newScale);
    };

    // Run after a brief timeout to allow container to render its actual dimensions
    const timer = setTimeout(updateScale, 50);
    
    window.addEventListener('resize', updateScale);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateScale);
    };
  }, [sale]);

  React.useEffect(() => {
    document.body.classList.add('print-receipt-active');
    return () => {
      document.body.classList.remove('print-receipt-active');
    };
  }, []);

  const handlePrint = () => {
    window.print();
  };

  if (!sale) return null;

  const showPreVat = sale.applyVat && sale.isVatInclusive;

  const baseSubtotal = sale.items.reduce((sum, item) => {
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
  
  // Remaining Balance (ยอดคงเหลือสุทธิ) in reference image is 260,000 when total is 860,000 and paid is 600,000.
  // In POS, if paid amount is less, calculate remaining. If fully paid or greater (change given), remaining is 0.
  const remainingBalance = cashReceived < total && cashReceived > 0 ? total - cashReceived : 0;

  // ── Padded rows for A4 layout ────────────────────────────────
  const minTableRows = 7;
  const paddedItems = [...sale.items];
  while (paddedItems.length < minTableRows) {
    paddedItems.push(null);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="receipt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="receipt-paper-container" ref={containerRef}>
          <div 
            className="receipt-paper" 
            ref={receiptRef}
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'center center',
              flexShrink: 0
            }}
          >
            {/* ─── Company Letterhead (Header) ────────────────────── */}
            <div className="receipt-letterhead">
              <div className="receipt-logo-container">
                <img src={logoImg} alt="HUALIAN Logo" className="receipt-logo-img" />
              </div>
              
              <div className="receipt-company-info">
                <h1 className="company-name">{store.name || 'ห้างหุ้นส่วนจำกัด หัวเหรียญ อีสาน HUALIAN ESAN LTD.,PART.'}</h1>
                <p className="company-address">{store.address || 'สำนักงานใหญ่ : 841/7 หมู่ 5 ต.หนองจะบก อ.เมืองนครราชสีมา จ.นครราชสีมา 30000'}</p>
                <p className="company-contact">
                  เลขประจำตัวผู้เสียภาษี {store.taxId || '0303547004494'} โทร. {store.phone || '044-002716 , 084-1844310 (บัญชี) แฟ็ก. 044-248869'}
                </p>
              </div>
            </div>

            {/* ─── Document Title ───────────────────────────────── */}
            <div className="receipt-title-block">
              <h2 className="title-th">ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อ</h2>
              <h3 className="title-en">Receipt/Abbreviated Tax Invoice</h3>
            </div>

            {/* ─── Customer & Invoice Grid ──────────────────────── */}
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

            {/* ─── Items Table ──────────────────────────────────── */}
            <table className="receipt-items-table">
              <thead>
                <tr>
                  <th style={{ width: '6%' }}>ลำดับ<br/><span className="sub-th">(Item)</span></th>
                  <th style={{ width: '12%' }}>รหัสสินค้า<br/><span className="sub-th">(Article Number)</span></th>
                  <th style={{ width: '39%', textAlign: 'left' }}>รายการ<br/><span className="sub-th">(Article Description)</span></th>
                  <th style={{ width: '8%' }}>จำนวน<br/><span className="sub-th">(Qty)</span></th>
                  <th style={{ width: '7%' }}>หน่วย<br/><span className="sub-th">(Unit)</span></th>
                  <th style={{ width: '13%' }}>ราคา/หน่วย<br/><span className="sub-th">(Price/Unit)</span></th>
                  <th style={{ width: '15%' }}>จำนวนเงิน<br/><span className="sub-th">(Amount)</span></th>
                </tr>
              </thead>
              <tbody>
                {paddedItems.map((item, idx) => {
                  if (item) {
                    const catalogPrice = item.sellPrice ?? item.price ?? 0;
                    const qty = item.quantity ?? 1;
                    const catalogTotal = item.subtotal ?? (catalogPrice * qty);

                    const itemPrice = showPreVat ? (catalogPrice / 1.07) : catalogPrice;
                    const itemTotal = showPreVat ? (catalogTotal / 1.07) : catalogTotal;
                    // Find unit from store products if not saved in item
                    const productUnit = item.unit || state.products.find(p => p.id === item.productId)?.unit || 'เครื่อง';

                    return (
                      <tr key={item.productId || idx}>
                        <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                        <td style={{ textAlign: 'center' }}>{item.productId || '-'}</td>
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

            {/* ─── Bottom Sections Grid ─────────────────────────── */}
            <div className="receipt-bottom-grid">
              {/* Left box: Word amount, payment terms */}
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
                      <input type="checkbox" checked={sale.paymentMethod === 'transfer' || sale.paymentMethod === 'qr'} readOnly />
                      <span className="checkmark"></span>
                      โอน
                    </label>
                    <span className="bank-info-details">
                      ธนาคาร: กสิกรไทย สาขา: มิตรภาพ (นครราชสีมา) <br/>
                      ชื่อบัญชี: หจก.หัวเหรียญ อีสาน &nbsp;&nbsp; เลขที่: 200-2-14611-2
                    </span>
                  </div>
                </div>
              </div>

              {/* Right box: Calculations */}
              <div className="bottom-right-box">
                <div className="calc-row">
                  <span className="calc-label font-bold">ราคาสินค้าทั้งสิ้น</span>
                  <span className="calc-val">{formatCurrency(subtotal)}</span>
                </div>
                <div className="calc-row border-top">
                  <span className="calc-label font-bold">ภาษีมูลค่าเพิ่ม 7 %</span>
                  <span className="calc-val">{tax > 0 ? formatCurrency(tax) : '-'}</span>
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
                    <span className="calc-val text-red font-bold">-{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                <div className="calc-row border-top highlight-paid">
                  <span className="calc-label font-bold">ยอดที่ชำระแล้ว</span>
                  <span className="calc-val text-red font-bold">{formatCurrency(cashReceived > 0 ? cashReceived : total)}</span>
                </div>
                <div className="calc-row border-top highlight-balance">
                  <span className="calc-label font-bold">ยอดคงเหลือสุทธิ</span>
                  <span className="calc-val text-blue font-bold">{formatCurrency(remainingBalance)}</span>
                </div>
              </div>
            </div>

            {/* ─── Footer Notice ────────────────────────────────── */}
            <div className="receipt-footer-notice">
              <p>ได้รับสินค้าตรงตามรายการข้างต้นนี้โดยไม่มีสิ่งใดเสียหาย</p>
              <p className="sub-notice">Received the goods in good order and condition</p>
            </div>

            {/* ─── Signatures Block ─────────────────────────────── */}
            <div className="receipt-signatures-container">
              {/* Signature fields */}
              <div className="signature-column">
                <div className="signature-line-name"></div>
                <div className="signature-line-border"></div>
                <span className="signature-label font-bold">ผู้จัดทำเอกสาร</span>
                <div className="signature-date">วันที่/Date &nbsp;&nbsp;&nbsp;&nbsp;{formatDateThaiPrepared(sale.date)}</div>
              </div>

              <div className="signature-column">
                <div className="signature-line-name"></div>
                <div className="signature-line-border"></div>
                <span className="signature-label font-bold">ผู้รับเงิน</span>
                <div className="signature-date">วันที่/Date &nbsp;&nbsp;&nbsp;&nbsp;............................</div>
              </div>

              <div className="signature-column">
                <div className="signature-line-name"></div>
                <div className="signature-line-border"></div>
                <span className="signature-label font-bold">ผู้จ่ายเงิน</span>
                <div className="signature-date">วันที่/Date &nbsp;&nbsp;&nbsp;&nbsp;............................</div>
              </div>
            </div>

            {/* ─── Print Timestamp Bottom Right ──────────────────── */}
            <div className="receipt-print-timestamp">
              {formatPrintTimestamp()}
            </div>
          </div>
        </div>

        {/* ─── Action Buttons (Screen Preview only) ───────────── */}
        <div className="receipt-actions">
          <button className="btn btn-primary" onClick={handlePrint}>
            🖨️ พิมพ์ใบเสร็จ A4
          </button>
          <button className="btn btn-secondary" onClick={onClose}>
            ✕ ปิด
          </button>
        </div>
      </div>
    </div>
  );
};

export default Receipt;
