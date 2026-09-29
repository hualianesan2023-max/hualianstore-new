import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '../data/store';
import { categories as categoryList } from '../data/mockData';
import { showAlert, showConfirm } from '../utils/alerts';
import Swal from 'sweetalert2';
import './ReceiveStockModal.css';

const STORAGE_INBOUND_KEY = 'hualian_inbound_records';

// Load stored inbound history
export const getInboundHistory = () => {
  try {
    const raw = localStorage.getItem(STORAGE_INBOUND_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to load inbound history', e);
    return [];
  }
};

// Save inbound record
export const saveInboundRecord = (record) => {
  try {
    const history = getInboundHistory();
    const updated = [record, ...history];
    localStorage.setItem(STORAGE_INBOUND_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Failed to save inbound record', e);
    return [];
  }
};

// Generate Voucher ID: RC + YYMM + - + 001
export const generateInboundVoucherId = (existingHistory = []) => {
  const now = new Date();
  const yearStr = String(now.getFullYear() + 543).slice(-2);
  const monthStr = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `RC${yearStr}${monthStr}-`;

  let maxSeq = 0;
  existingHistory.forEach((r) => {
    if (r.id && r.id.startsWith(prefix)) {
      const numPart = parseInt(r.id.replace(prefix, ''), 10);
      if (!isNaN(numPart) && numPart > maxSeq) {
        maxSeq = numPart;
      }
    }
  });

  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
};

const ReceiveStockModal = ({ isOpen, onClose, onStockReceived }) => {
  const { state, dispatch } = useStore();
  const searchInputRef = useRef(null);

  // Tabs: 'form' | 'history'
  const [activeTab, setActiveTab] = useState('form');

  // Inbound history
  const [history, setHistory] = useState(() => getInboundHistory());
  const [historySearch, setHistorySearch] = useState('');

  // Voucher Meta
  const [voucherId, setVoucherId] = useState('');
  const [receiveDate, setReceiveDate] = useState(() => {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
  });
  const [supplier, setSupplier] = useState('โรงงานผู้ผลิต HUALIAN (จีน)');
  const [refDocNo, setRefDocNo] = useState('');
  const [receiverName, setReceiverName] = useState(() => state?.currentUser?.name || 'ผู้ดูแลระบบ (Admin)');
  const [voucherNotes, setVoucherNotes] = useState('');

  // Item Entry Mode: 'existing' | 'new'
  const [entryMode, setEntryMode] = useState('existing');

  // Existing product selection
  const [productSearch, setProductSearch] = useState('');
  const [showProductSuggestions, setShowProductSuggestions] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // New Machine Model fields
  const [newModel, setNewModel] = useState({
    name: '',
    barcode: '',
    category: categoryList[0]?.id || 'sealer',
    unit: 'เครื่อง',
    sellPrice: '',
    branchPrice: '',
  });

  // Current Item Details to add
  const [destinationLocation, setDestinationLocation] = useState('โกดังใหญ่');
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemCostPrice, setItemCostPrice] = useState('');
  const [updateMasterCost, setUpdateMasterCost] = useState(true);
  const [itemSerialNo, setItemSerialNo] = useState('');
  const [itemNote, setItemNote] = useState('');

  // Items added into current voucher
  const [inboundItems, setInboundItems] = useState([]);

  // Initialize Voucher ID on open
  useEffect(() => {
    if (isOpen) {
      const h = getInboundHistory();
      setHistory(h);
      setVoucherId(generateInboundVoucherId(h));
      // Preselect first product if any
      if (state.products && state.products.length > 0 && !selectedProduct) {
        handleSelectProduct(state.products[0]);
      }
    }
  }, [isOpen]);

  // Handle selecting a product from existing list
  const handleSelectProduct = (product) => {
    setSelectedProduct(product);
    setProductSearch('');
    setShowProductSuggestions(false);
    setItemCostPrice(product.costPrice ?? product.cost ?? 0);
  };

  // Product suggestions filtered by search
  const productSuggestions = useMemo(() => {
    if (!productSearch.trim()) return state.products.slice(0, 10);
    const q = productSearch.toLowerCase().trim();
    return state.products
      .filter(
        (p) =>
          (p.name || '').toLowerCase().includes(q) ||
          (p.barcode || '').toLowerCase().includes(q) ||
          (p.id || '').toLowerCase().includes(q)
      )
      .slice(0, 15);
  }, [state.products, productSearch]);

  // Current product's stock in target location
  const currentTargetStock = useMemo(() => {
    if (!selectedProduct) return 0;
    if (destinationLocation === 'โกดังกุ๊กไก่') return Number(selectedProduct.stockKookkai || 0);
    if (destinationLocation === 'ออฟฟิศ') return Number(selectedProduct.stockOffice || 0);
    return Number(selectedProduct.stockBig || 0);
  }, [selectedProduct, destinationLocation]);

  // Add current configured item to the voucher list
  const handleAddItemToVoucher = () => {
    const qty = Number(itemQuantity);
    if (!qty || qty <= 0) {
      showAlert('กรุณาระบุจำนวนที่รับเข้าให้ถูกต้อง', '', 'warning');
      return;
    }

    if (entryMode === 'existing') {
      if (!selectedProduct) {
        showAlert('กรุณาเลือกเครื่องจักรหรือสินค้าที่ต้องการรับเข้า', '', 'warning');
        return;
      }

      const cost = Number(itemCostPrice) || Number(selectedProduct.costPrice || 0);
      const prevStock = currentTargetStock;
      const newStock = prevStock + qty;

      const newItem = {
        tempId: 'temp-' + Date.now() + Math.random(),
        productId: selectedProduct.id,
        barcode: selectedProduct.barcode || selectedProduct.id,
        name: selectedProduct.name,
        category: selectedProduct.category,
        unit: selectedProduct.unit || 'เครื่อง',
        image: selectedProduct.image || '📦',
        location: destinationLocation,
        quantity: qty,
        costPrice: cost,
        sellPrice: selectedProduct.sellPrice || 0,
        branchPrice: selectedProduct.branchPrice || selectedProduct.sellPrice || 0,
        totalCost: cost * qty,
        prevStock,
        newStock,
        updateMasterCost,
        serialNo: itemSerialNo.trim(),
        note: itemNote.trim(),
        isNewProduct: false,
        rawProduct: selectedProduct,
      };

      setInboundItems((prev) => [...prev, newItem]);
      setItemQuantity(1);
      setItemSerialNo('');
      setItemNote('');
    } else {
      // New machine model
      if (!newModel.name.trim()) {
        showAlert('กรุณากรอกชื่อเครื่องจักร / สินค้าใหม่', '', 'warning');
        return;
      }

      const cost = Number(itemCostPrice) || 0;
      const sell = Number(newModel.sellPrice) || (cost > 0 ? Math.round(cost * 1.3) : 0);
      const branch = Number(newModel.branchPrice) || sell;
      const barcode = newModel.barcode.trim() || `NEW-${Date.now().toString().slice(-4)}`;

      const newItem = {
        tempId: 'temp-' + Date.now() + Math.random(),
        productId: barcode,
        barcode,
        name: newModel.name.trim(),
        category: newModel.category,
        unit: newModel.unit || 'เครื่อง',
        image: '📦',
        location: destinationLocation,
        quantity: qty,
        costPrice: cost,
        sellPrice: sell,
        branchPrice: branch,
        totalCost: cost * qty,
        prevStock: 0,
        newStock: qty,
        updateMasterCost: true,
        serialNo: itemSerialNo.trim(),
        note: itemNote.trim(),
        isNewProduct: true,
      };

      setInboundItems((prev) => [...prev, newItem]);
      setNewModel({
        name: '',
        barcode: '',
        category: categoryList[0]?.id || 'sealer',
        unit: 'เครื่อง',
        sellPrice: '',
        branchPrice: '',
      });
      setItemQuantity(1);
      setItemSerialNo('');
      setItemNote('');
    }
  };

  // Remove item from voucher list
  const handleRemoveItem = (tempId) => {
    setInboundItems((prev) => prev.filter((it) => it.tempId !== tempId));
  };

  // Voucher Summary Totals
  const voucherSummary = useMemo(() => {
    let items = inboundItems;
    if (items.length === 0 && selectedProduct && itemQuantity > 0) {
      items = [
        {
          quantity: Number(itemQuantity),
          totalCost: (Number(itemCostPrice) || 0) * Number(itemQuantity),
        },
      ];
    }
    const totalUnits = items.reduce((sum, it) => sum + Number(it.quantity || 0), 0);
    const totalCostValue = items.reduce((sum, it) => sum + Number(it.totalCost || 0), 0);
    return {
      itemCount: items.length,
      totalUnits,
      totalCostValue,
    };
  }, [inboundItems, selectedProduct, itemQuantity, itemCostPrice]);

  // Submit and save inbound receipt
  const handleSubmitInbound = async (shouldPrint = false) => {
    let finalItems = [...inboundItems];

    // If items list is empty, but user already chose product and quantity, add it automatically!
    if (finalItems.length === 0) {
      if (entryMode === 'existing') {
        if (!selectedProduct) {
          showAlert('กรุณาเลือกเครื่องจักรหรือเพิ่มรายการรับเข้าก่อนบันทึก', '', 'warning');
          return;
        }
        const qty = Number(itemQuantity);
        if (!qty || qty <= 0) {
          showAlert('กรุณาระบุจำนวนเครื่องที่รับเข้า', '', 'warning');
          return;
        }
        const cost = Number(itemCostPrice) || Number(selectedProduct.costPrice || 0);
        finalItems.push({
          tempId: 'temp-direct',
          productId: selectedProduct.id,
          barcode: selectedProduct.barcode || selectedProduct.id,
          name: selectedProduct.name,
          category: selectedProduct.category,
          unit: selectedProduct.unit || 'เครื่อง',
          image: selectedProduct.image || '📦',
          location: destinationLocation,
          quantity: qty,
          costPrice: cost,
          sellPrice: selectedProduct.sellPrice || 0,
          branchPrice: selectedProduct.branchPrice || selectedProduct.sellPrice || 0,
          totalCost: cost * qty,
          prevStock: currentTargetStock,
          newStock: currentTargetStock + qty,
          updateMasterCost,
          serialNo: itemSerialNo.trim(),
          note: itemNote.trim(),
          isNewProduct: false,
          rawProduct: selectedProduct,
        });
      } else {
        if (!newModel.name.trim()) {
          showAlert('กรุณากรอกชื่อเครื่องจักรใหม่ หรือเลือกเครื่องจักรที่มีในระบบ', '', 'warning');
          return;
        }
        const qty = Number(itemQuantity) || 1;
        const cost = Number(itemCostPrice) || 0;
        const sell = Number(newModel.sellPrice) || (cost > 0 ? Math.round(cost * 1.3) : 0);
        const branch = Number(newModel.branchPrice) || sell;
        const barcode = newModel.barcode.trim() || `NEW-${Date.now().toString().slice(-4)}`;

        finalItems.push({
          tempId: 'temp-direct-new',
          productId: barcode,
          barcode,
          name: newModel.name.trim(),
          category: newModel.category,
          unit: newModel.unit || 'เครื่อง',
          image: '📦',
          location: destinationLocation,
          quantity: qty,
          costPrice: cost,
          sellPrice: sell,
          branchPrice: branch,
          totalCost: cost * qty,
          prevStock: 0,
          newStock: qty,
          updateMasterCost: true,
          serialNo: itemSerialNo.trim(),
          note: itemNote.trim(),
          isNewProduct: true,
        });
      }
    }

    if (finalItems.length === 0) {
      showAlert('ไม่มีรายการเครื่องจักรที่รับเข้า', '', 'warning');
      return;
    }

    const totalQty = finalItems.reduce((sum, it) => sum + it.quantity, 0);
    const confirm = await showConfirm(
      'ยืนยันการรับเครื่องเข้าระบบ?',
      `ใบรับเข้า: ${voucherId}\nจำนวนเครื่องรวม: ${totalQty} เครื่อง (${finalItems.length} รายการ)\nระบบจะทำการอัปเดตสต๊อกสินค้าเข้าคลังทันที`
    );

    if (!confirm) return;

    // 1. Process Stock updates
    finalItems.forEach((it) => {
      if (it.isNewProduct) {
        const newProd = {
          id: it.productId,
          barcode: it.barcode,
          name: it.name,
          category: it.category,
          unit: it.unit,
          costPrice: it.costPrice,
          cost: it.costPrice,
          sellPrice: it.sellPrice,
          price: it.sellPrice,
          branchPrice: it.branchPrice,
          stockOffice: it.location === 'ออฟฟิศ' ? it.quantity : 0,
          stockKookkai: it.location === 'โกดังกุ๊กไก่' ? it.quantity : 0,
          stockBig: it.location === 'โกดังใหญ่' ? it.quantity : 0,
          stock: it.quantity,
          minStock: 10,
          location: it.location,
          image: '📦',
        };
        dispatch({ type: 'ADD_PRODUCT', payload: newProd });
      } else {
        const p = state.products.find((prod) => prod.id === it.productId) || it.rawProduct;
        if (p) {
          const currentOffice = Number(p.stockOffice || 0);
          const currentKookkai = Number(p.stockKookkai || 0);
          const currentBig = Number(p.stockBig || 0);

          let newOffice = currentOffice;
          let newKookkai = currentKookkai;
          let newBig = currentBig;

          if (it.location === 'ออฟฟิศ') newOffice += it.quantity;
          else if (it.location === 'โกดังกุ๊กไก่') newKookkai += it.quantity;
          else newBig += it.quantity;

          const updatedProd = {
            ...p,
            stockOffice: newOffice,
            stockKookkai: newKookkai,
            stockBig: newBig,
            stock: newOffice + newKookkai + newBig,
            costPrice: it.updateMasterCost && it.costPrice > 0 ? it.costPrice : p.costPrice,
            cost: it.updateMasterCost && it.costPrice > 0 ? it.costPrice : p.cost,
          };

          dispatch({ type: 'UPDATE_PRODUCT', payload: updatedProd });
        }
      }
    });

    // 2. Build Voucher Record and Save
    const voucherRecord = {
      id: voucherId,
      date: new Date(receiveDate).toISOString(),
      displayDate: receiveDate.replace('T', ' '),
      supplier: supplier.trim() || 'โรงงานนำเข้า HUALIAN',
      refDocNo: refDocNo.trim() || '-',
      receiver: receiverName.trim() || 'ผู้ดูแลระบบ',
      notes: voucherNotes.trim(),
      totalItems: finalItems.length,
      totalUnits: totalQty,
      totalCostValue: finalItems.reduce((sum, it) => sum + it.totalCost, 0),
      items: finalItems.map((it) => ({
        productId: it.productId,
        barcode: it.barcode,
        name: it.name,
        category: it.category,
        unit: it.unit,
        location: it.location,
        quantity: it.quantity,
        costPrice: it.costPrice,
        totalCost: it.totalCost,
        prevStock: it.prevStock,
        newStock: it.newStock,
        serialNo: it.serialNo,
        note: it.note,
      })),
      createdAt: new Date().toISOString(),
    };

    saveInboundRecord(voucherRecord);
    setHistory(getInboundHistory());

    if (onStockReceived) {
      onStockReceived(voucherRecord);
    }

    Swal.fire({
      icon: 'success',
      title: 'บันทึกรับเครื่องเข้าระบบสำเร็จ!',
      html: `
        <div style="font-size: 14px; text-align: left; background: rgba(0,0,0,0.25); padding: 14px; border-radius: 8px; margin-top: 10px; line-height: 1.6;">
          <div><b>เลขที่ใบรับเข้า:</b> <span style="color:#38bdf8; font-weight:bold;">${voucherId}</span></div>
          <div><b>จำนวนเครื่องรวม:</b> <span style="color:#10b981; font-weight:bold;">${totalQty} เครื่อง (${finalItems.length} รายการ)</span></div>
          <div><b>คลังจัดเก็บ:</b> ${Array.from(new Set(finalItems.map((it) => it.location))).join(', ')}</div>
          <div style="margin-top: 6px; font-size: 12px; color: #94a3b8;">✅ ยอดสต๊อกสินค้าได้รับการอัปเดตเรียบร้อยแล้ว</div>
        </div>
      `,
      confirmButtonText: 'ตกลง',
      confirmButtonColor: '#10b981',
    });

    if (shouldPrint) {
      printInboundVoucher(voucherRecord);
    }

    setInboundItems([]);
    setVoucherId(generateInboundVoucherId(getInboundHistory()));
    onClose();
  };

  // ─── Print Voucher Function ───────────────────────────────────────
  const printInboundVoucher = (record) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const itemsRows = record.items
      .map(
        (it, idx) => `
      <tr>
        <td style="text-align: center; padding: 8px; border-bottom: 1px solid #ddd;">${idx + 1}</td>
        <td style="text-align: center; font-family: monospace; font-weight: bold; padding: 8px; border-bottom: 1px solid #ddd;">${it.barcode || it.productId}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">
          <div style="font-weight: bold;">${it.name}</div>
          ${it.serialNo ? `<div style="font-size: 11px; color: #666;">S/N: ${it.serialNo}</div>` : ''}
          ${it.note ? `<div style="font-size: 11px; color: #888;">หมายเหตุ: ${it.note}</div>` : ''}
        </td>
        <td style="text-align: center; padding: 8px; border-bottom: 1px solid #ddd;">${it.location}</td>
        <td style="text-align: center; font-weight: bold; font-size: 14px; padding: 8px; border-bottom: 1px solid #ddd;">${it.quantity.toLocaleString()}</td>
        <td style="text-align: center; padding: 8px; border-bottom: 1px solid #ddd;">${it.unit || 'เครื่อง'}</td>
        <td style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">฿${Number(it.costPrice || 0).toLocaleString()}</td>
        <td style="text-align: right; font-weight: bold; padding: 8px; border-bottom: 1px solid #ddd;">฿${Number(it.totalCost || 0).toLocaleString()}</td>
      </tr>
    `
      )
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>ใบรับเครื่องเข้าระบบ - ${record.id}</title>
          <style>
            @page { size: A4 portrait; margin: 15mm; }
            body {
              font-family: 'Noto Sans Thai', 'Sarabun', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              color: #222;
              margin: 0;
              padding: 10px;
              font-size: 13px;
              line-height: 1.4;
            }
            .voucher-header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-bottom: 2px solid #2563eb;
              padding-bottom: 12px;
              margin-bottom: 16px;
            }
            .company-name {
              font-size: 20px;
              font-weight: bold;
              color: #1e3a8a;
            }
            .doc-title-badge {
              text-align: right;
            }
            .doc-title {
              font-size: 18px;
              font-weight: bold;
              color: #059669;
            }
            .doc-id {
              font-size: 14px;
              font-family: monospace;
              font-weight: bold;
              color: #333;
            }
            .meta-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 8px 24px;
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              padding: 12px 16px;
              border-radius: 6px;
              margin-bottom: 18px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
            }
            th {
              background: #f1f5f9;
              border-top: 1px solid #cbd5e1;
              border-bottom: 2px solid #94a3b8;
              padding: 10px 8px;
              font-size: 12px;
              text-align: left;
            }
            .summary-box {
              display: flex;
              justify-content: flex-end;
              margin-bottom: 30px;
            }
            .summary-table {
              width: 320px;
              border-collapse: collapse;
            }
            .summary-table td {
              padding: 6px 12px;
              border-bottom: 1px solid #eee;
            }
            .signatures {
              display: grid;
              grid-template-columns: 1fr 1fr 1fr;
              gap: 20px;
              margin-top: 40px;
              text-align: center;
            }
            .sig-line {
              margin-top: 45px;
              border-top: 1px dashed #666;
              padding-top: 6px;
              font-size: 12px;
            }
            @media print {
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="voucher-header">
            <div>
              <div class="company-name">หจก. หัวเหรียญ อีสาน (HUALIAN ESAN)</div>
              <div style="font-size: 12px; color: #555;">841/7 หมู่ 5 ต.หนองจะบก อ.เมือง จ.นครราชสีมา 30000 | โทร. 044-002716, 084-1844310</div>
            </div>
            <div class="doc-title-badge">
              <div class="doc-title">ใบรับเครื่องจักรและสินค้าเข้าระบบ</div>
              <div class="doc-id">เลขที่: ${record.id}</div>
            </div>
          </div>

          <div class="meta-grid">
            <div><strong>วันที่รับเข้า:</strong> ${new Date(record.date).toLocaleDateString('th-TH')} ${new Date(record.date).toLocaleTimeString('th-TH')}</div>
            <div><strong>ผู้ตรวจรับ:</strong> ${record.receiver}</div>
            <div><strong>แหล่งที่มา / ผู้จำหน่าย:</strong> ${record.supplier}</div>
            <div><strong>เลขที่เอกสารอ้างอิง/PO:</strong> ${record.refDocNo || '-'}</div>
            ${record.notes ? `<div style="grid-column: span 2;"><strong>หมายเหตุ:</strong> ${record.notes}</div>` : ''}
          </div>

          <table>
            <thead>
              <tr>
                <th style="text-align: center; width: 40px;">ลำดับ</th>
                <th style="text-align: center; width: 90px;">รหัสเครื่อง</th>
                <th>รายการเครื่องจักร / สินค้า</th>
                <th style="text-align: center; width: 90px;">จัดเก็บที่</th>
                <th style="text-align: center; width: 70px;">จำนวน</th>
                <th style="text-align: center; width: 60px;">หน่วย</th>
                <th style="text-align: right; width: 90px;">ราคาทุน/หน่วย</th>
                <th style="text-align: right; width: 100px;">รวมมูลค่า</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>

          <div class="summary-box">
            <table class="summary-table">
              <tr>
                <td><strong>รวมจำนวนรายการ:</strong></td>
                <td style="text-align: right;">${record.totalItems} รายการ</td>
              </tr>
              <tr>
                <td><strong>รวมจำนวนเครื่องทั้งสิ้น:</strong></td>
                <td style="text-align: right; font-weight: bold; font-size: 15px; color: #059669;">${record.totalUnits} เครื่อง</td>
              </tr>
              <tr>
                <td><strong>รวมมูลค่ารับเข้าทั้งสิ้น:</strong></td>
                <td style="text-align: right; font-weight: bold; font-size: 15px; color: #1e3a8a;">฿${Number(record.totalCostValue || 0).toLocaleString()}</td>
              </tr>
            </table>
          </div>

          <div class="signatures">
            <div>
              <div class="sig-line">ผู้ส่งมอบ / ซัพพลายเออร์</div>
              <div style="font-size: 11px; color: #777; margin-top: 4px;">วันที่ ...../...../..........</div>
            </div>
            <div>
              <div class="sig-line">ผู้ตรวจรับสินค้า (${record.receiver})</div>
              <div style="font-size: 11px; color: #777; margin-top: 4px;">วันที่ ...../...../..........</div>
            </div>
            <div>
              <div class="sig-line">ผู้มีอำนาจอนุมัติ</div>
              <div style="font-size: 11px; color: #777; margin-top: 4px;">วันที่ ...../...../..........</div>
            </div>
          </div>

          <script>
            window.focus();
            setTimeout(() => { window.print(); }, 250);
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  // Filtered History
  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) return history;
    const q = historySearch.toLowerCase().trim();
    return history.filter(
      (r) =>
        r.id.toLowerCase().includes(q) ||
        r.supplier.toLowerCase().includes(q) ||
        (r.refDocNo && r.refDocNo.toLowerCase().includes(q)) ||
        (r.items || []).some((it) => it.name.toLowerCase().includes(q) || (it.barcode && it.barcode.toLowerCase().includes(q)))
    );
  }, [history, historySearch]);

  if (!isOpen) return null;

  return (
    <div className="receive-modal-overlay" onClick={onClose}>
      <div className="receive-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Modal Top Header */}
        <div className="receive-modal-header">
          <div className="receive-header-left">
            <div className="receive-header-icon">📥</div>
            <div className="receive-header-title">
              <h2>แบบฟอร์มรับเครื่องเข้าระบบ</h2>
              <p>บันทึกรับเข้าเครื่องจักร เติมสต๊อกคลังสินค้า และออกใบรับสินค้า</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="receive-header-tabs">
              <button
                type="button"
                className={`receive-tab-btn ${activeTab === 'form' ? 'active' : ''}`}
                onClick={() => setActiveTab('form')}
              >
                <span>📝</span> บันทึกรับเข้าใหม่
              </button>
              <button
                type="button"
                className={`receive-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
                onClick={() => setActiveTab('history')}
              >
                <span>📋</span> ประวัติการรับเข้า ({history.length})
              </button>
            </div>

            <button type="button" className="receive-close-btn" onClick={onClose} title="ปิดหน้าต่าง">
              ✕
            </button>
          </div>
        </div>

        {/* Modal Content - Tab 1: Form (Full Window Balanced Layout) */}
        {activeTab === 'form' && (
          <div className="receive-modal-body-wrapper">
            {/* 1. TOP DOCUMENT META CARD (100% Width) */}
            <div className="receive-meta-grid">
              <div className="receive-field-group">
                <label>เลขที่ใบรับเข้า (Auto)</label>
                <div className="receive-doc-badge">{voucherId}</div>
              </div>

              <div className="receive-field-group">
                <label>วันที่ - เวลาที่รับเข้า *</label>
                <input
                  type="datetime-local"
                  value={receiveDate}
                  onChange={(e) => setReceiveDate(e.target.value)}
                  required
                />
              </div>

              <div className="receive-field-group">
                <label>ผู้จำหน่าย / แหล่งที่มา *</label>
                <input
                  type="text"
                  placeholder="เช่น โรงงานนำเข้า จีน, ซัพพลายเออร์"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                />
              </div>

              <div className="receive-field-group">
                <label>เลขที่เอกสารอ้างอิง / PO / ใบส่งของ</label>
                <input
                  type="text"
                  placeholder="เช่น PO-690901, DO-8842"
                  value={refDocNo}
                  onChange={(e) => setRefDocNo(e.target.value)}
                />
              </div>

              <div className="receive-field-group">
                <label>ผู้ตรวจรับ / ผู้ทำรายการ *</label>
                <input
                  type="text"
                  value={receiverName}
                  onChange={(e) => setReceiverName(e.target.value)}
                />
              </div>

              <div className="receive-field-group">
                <label>หมายเหตุทั่วไปของเอกสาร</label>
                <input
                  type="text"
                  placeholder="เช่น ตรวจนับครบถ้วน สภาพสมบูรณ์ 100%"
                  value={voucherNotes}
                  onChange={(e) => setVoucherNotes(e.target.value)}
                />
              </div>
            </div>

            {/* 2. TWO EQUAL BALANCED PANELS (Left = Form, Right = Table) */}
            <div className="receive-panels-grid">
              {/* ═══ LEFT PANEL: Machine Selection Form ═══ */}
              <div className="receive-panel-card">
                <div className="receive-panel-header">
                  <h3>
                    <span>⚙️</span> เลือกและระบุเครื่องจักรที่รับเข้า
                  </h3>
                  <div className="entry-mode-toggle">
                    <button
                      type="button"
                      className={`entry-mode-btn ${entryMode === 'existing' ? 'active' : ''}`}
                      onClick={() => setEntryMode('existing')}
                    >
                      🔍 เลือกเครื่องในระบบ
                    </button>
                    <button
                      type="button"
                      className={`entry-mode-btn ${entryMode === 'new' ? 'active' : ''}`}
                      onClick={() => setEntryMode('new')}
                    >
                      ➕ เครื่องรุ่นใหม่ (ยังไม่มีในระบบ)
                    </button>
                  </div>
                </div>

                {/* Mode A: Select Existing Product */}
                {entryMode === 'existing' ? (
                  <div className="product-picker-container">
                    <label style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', display: 'block', marginBottom: '5px' }}>
                      ค้นหาและเลือกเครื่องจักร / สินค้า:
                    </label>
                    <div className="product-search-input-wrapper">
                      <span className="product-search-icon">🔍</span>
                      <input
                        ref={searchInputRef}
                        type="text"
                        className="product-search-input"
                        placeholder="พิมพ์ชื่อเครื่อง, รหัสเครื่อง หรือสแกนบาร์โค้ด..."
                        value={productSearch}
                        onChange={(e) => {
                          setProductSearch(e.target.value);
                          setShowProductSuggestions(true);
                        }}
                        onFocus={() => setShowProductSuggestions(true)}
                      />
                      {productSearch && (
                        <button
                          type="button"
                          onClick={() => {
                            setProductSearch('');
                            setShowProductSuggestions(false);
                          }}
                          style={{
                            position: 'absolute',
                            right: '12px',
                            background: 'transparent',
                            border: 'none',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            fontSize: '14px',
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Suggestions dropdown */}
                    {showProductSuggestions && productSuggestions.length > 0 && (
                      <div className="product-suggestions-list">
                        {productSuggestions.map((prod) => (
                          <div
                            key={prod.id}
                            className="product-suggestion-item"
                            onClick={() => handleSelectProduct(prod)}
                          >
                            <div className="suggestion-info">
                              <span className="suggestion-name">{prod.name}</span>
                              <div className="suggestion-meta">
                                <span>รหัส: <b>{prod.barcode || prod.id}</b></span>
                                <span>ทุน: ฿{Number(prod.costPrice ?? prod.cost ?? 0).toLocaleString()}</span>
                              </div>
                            </div>
                            <span className="suggestion-stock-tag">
                              คงเหลือ {prod.stock ?? 0} {prod.unit || 'เครื่อง'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Selected Product Card */}
                    {selectedProduct && (
                      <div className="selected-product-card" style={{ marginTop: '10px' }}>
                        <div className="selected-prod-left">
                          <div className="selected-prod-icon">{selectedProduct.image || '📦'}</div>
                          <div>
                            <div className="selected-prod-title">{selectedProduct.name}</div>
                            <div className="selected-prod-sub">
                              <span>รหัส: <b>{selectedProduct.barcode || selectedProduct.id}</b></span>
                              <span>หมวดหมู่: {categoryList.find((c) => c.id === selectedProduct.category)?.name || selectedProduct.category}</span>
                            </div>
                          </div>
                        </div>

                        {/* Current Location Stock Pills */}
                        <div className="selected-prod-stock-boxes">
                          <div className="stock-mini-box">
                            <span className="lbl">ออฟฟิศ</span>
                            <span className="val">{selectedProduct.stockOffice || 0}</span>
                          </div>
                          <div className="stock-mini-box">
                            <span className="lbl">โกดังกุ๊กไก่</span>
                            <span className="val">{selectedProduct.stockKookkai || 0}</span>
                          </div>
                          <div className="stock-mini-box">
                            <span className="lbl">โกดังใหญ่</span>
                            <span className="val">{selectedProduct.stockBig || 0}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Mode B: Add New Model */
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                    <div className="receive-field-group" style={{ gridColumn: 'span 2' }}>
                      <label>ชื่อเครื่องจักร / สินค้าใหม่ *</label>
                      <input
                        type="text"
                        placeholder="เช่น เครื่องซีลสายพาน รุ่น FR-900W"
                        value={newModel.name}
                        onChange={(e) => setNewModel((p) => ({ ...p, name: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="receive-field-group">
                      <label>รหัส / บาร์โค้ดเครื่อง</label>
                      <input
                        type="text"
                        placeholder="เช่น HL-099"
                        value={newModel.barcode}
                        onChange={(e) => setNewModel((p) => ({ ...p, barcode: e.target.value }))}
                      />
                    </div>
                    <div className="receive-field-group">
                      <label>หมวดหมู่</label>
                      <select
                        value={newModel.category}
                        onChange={(e) => setNewModel((p) => ({ ...p, category: e.target.value }))}
                      >
                        {categoryList.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.icon} {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="receive-field-group">
                      <label>หน่วยนับ</label>
                      <select
                        value={newModel.unit}
                        onChange={(e) => setNewModel((p) => ({ ...p, unit: e.target.value }))}
                      >
                        <option value="เครื่อง">เครื่อง</option>
                        <option value="ชุด">ชุด</option>
                        <option value="ชิ้น">ชิ้น</option>
                        <option value="กล่อง">กล่อง</option>
                      </select>
                    </div>
                    <div className="receive-field-group">
                      <label>ราคาขายปลีกแนะนำ (฿)</label>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={newModel.sellPrice}
                        onChange={(e) => setNewModel((p) => ({ ...p, sellPrice: e.target.value }))}
                      />
                    </div>
                  </div>
                )}

                {/* Destination Warehouse Location */}
                <div>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                    เลือกคลัง/โกดังปลายทางที่จัดเก็บ *:
                  </label>
                  <div className="location-selector-group">
                    <div
                      className={`location-radio-card ${destinationLocation === 'โกดังใหญ่' ? 'active' : ''}`}
                      onClick={() => setDestinationLocation('โกดังใหญ่')}
                    >
                      <span className="location-radio-icon">🏛️</span>
                      <div className="location-radio-text">
                        <span className="loc-title">โกดังใหญ่ (Main)</span>
                        <span className="loc-desc">คลังสินค้าใหญ่ / สำนักงานใหญ่</span>
                      </div>
                    </div>

                    <div
                      className={`location-radio-card ${destinationLocation === 'โกดังกุ๊กไก่' ? 'active' : ''}`}
                      onClick={() => setDestinationLocation('โกดังกุ๊กไก่')}
                    >
                      <span className="location-radio-icon">🏭</span>
                      <div className="location-radio-text">
                        <span className="loc-title">โกดังกุ๊กไก่</span>
                        <span className="loc-desc">คลังสินค้าสำรอง / โกดัง 2</span>
                      </div>
                    </div>

                    <div
                      className={`location-radio-card ${destinationLocation === 'ออฟฟิศ' ? 'active' : ''}`}
                      onClick={() => setDestinationLocation('ออฟฟิศ')}
                    >
                      <span className="location-radio-icon">🏢</span>
                      <div className="location-radio-text">
                        <span className="loc-title">ออฟฟิศ</span>
                        <span className="loc-desc">หน้าร้าน / สต๊อกออฟฟิศ</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Inbound Quantity, Cost, S/N, Note */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', alignItems: 'flex-end' }}>
                  <div className="receive-field-group">
                    <label>จำนวนเครื่องที่รับเข้า *</label>
                    <div className="qty-stepper-wrapper">
                      <button
                        type="button"
                        className="qty-step-btn"
                        onClick={() => setItemQuantity((prev) => Math.max(1, Number(prev || 1) - 1))}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min="1"
                        className="qty-input-box"
                        value={itemQuantity}
                        onChange={(e) => setItemQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      />
                      <button
                        type="button"
                        className="qty-step-btn"
                        onClick={() => setItemQuantity((prev) => Number(prev || 1) + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="receive-field-group">
                    <label>ราคาทุนต่อหน่วย (฿)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={itemCostPrice}
                      onChange={(e) => setItemCostPrice(e.target.value)}
                    />
                  </div>

                  <div className="receive-field-group">
                    <label>หมายเลขเครื่อง (S/N / Lot)</label>
                    <input
                      type="text"
                      placeholder="เช่น SN-6909-0012"
                      value={itemSerialNo}
                      onChange={(e) => setItemSerialNo(e.target.value)}
                    />
                  </div>

                  <div className="receive-field-group">
                    <label>หมายเหตุเฉพาะเครื่อง</label>
                    <input
                      type="text"
                      placeholder="เช่น อุปกรณ์ครบชุด"
                      value={itemNote}
                      onChange={(e) => setItemNote(e.target.value)}
                    />
                  </div>
                </div>

                {/* Stock Live Preview & Add Button */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {entryMode === 'existing' && selectedProduct && (
                    <div className="stock-preview-banner">
                      <span>
                        📍 สต๊อกที่ <b>{destinationLocation}</b>:
                        <span className="preview-badge-orig" style={{ margin: '0 6px' }}>
                          เดิม {currentTargetStock}
                        </span>
                        <span className="preview-arrow">➡️ รับเข้า +{itemQuantity || 0}</span>
                        <span className="preview-badge-new" style={{ marginLeft: '6px' }}>
                          ใหม่ {currentTargetStock + (Number(itemQuantity) || 0)} {selectedProduct.unit || 'เครื่อง'}
                        </span>
                      </span>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginLeft: 'auto' }}>
                    <label style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={updateMasterCost}
                        onChange={(e) => setUpdateMasterCost(e.target.checked)}
                      />
                      อัปเดตราคาทุนในระบบ
                    </label>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleAddItemToVoucher}
                      style={{
                        padding: '9px 18px',
                        background: 'rgba(56, 189, 248, 0.15)',
                        borderColor: 'rgba(56, 189, 248, 0.4)',
                        color: '#38bdf8',
                        fontWeight: '700',
                        fontSize: '13px',
                        borderRadius: '8px',
                      }}
                    >
                      ➕ เพิ่มลงในใบรับเข้า
                    </button>
                  </div>
                </div>
              </div>

              {/* ═══ RIGHT PANEL: Inbound Items Table & Actions (Equal Frame!) ═══ */}
              <div className="receive-panel-card">
                {/* Panel Header */}
                <div className="receive-panel-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>📦</span>
                    <h3 style={{ margin: 0, fontSize: '14.5px', fontWeight: '700', color: '#f8fafc' }}>
                      รายการเครื่องจักรที่รับเข้าในใบนี้
                    </h3>
                    <span
                      style={{
                        background: inboundItems.length > 0 ? '#10b981' : '#334155',
                        color: '#ffffff',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        padding: '2px 8px',
                        borderRadius: '10px',
                      }}
                    >
                      {inboundItems.length} รายการ
                    </span>
                  </div>

                  {inboundItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setInboundItems([])}
                      style={{
                        background: 'transparent',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#ef4444',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                      title="ล้างรายการทั้งหมดในใบรับเข้า"
                    >
                      ✕ ล้างรายการทั้งหมด
                    </button>
                  )}
                </div>

                {/* Items Table Card */}
                {inboundItems.length > 0 ? (
                  <div className="inbound-table-wrapper">
                    <div className="inbound-table-scroll">
                      <table className="inbound-table">
                        <thead>
                          <tr>
                            <th style={{ width: '35px', textAlign: 'center' }}>#</th>
                            <th>เครื่องจักร / สินค้า</th>
                            <th style={{ width: '95px', textAlign: 'center' }}>คลังปลายทาง</th>
                            <th style={{ width: '80px', textAlign: 'center' }}>จำนวน</th>
                            <th style={{ width: '105px', textAlign: 'center' }}>สต๊อกเดิม ➡️ ใหม่</th>
                            <th style={{ width: '85px', textAlign: 'right' }}>ทุน/หน่วย</th>
                            <th style={{ width: '100px', textAlign: 'right' }}>รวมมูลค่า</th>
                            <th style={{ width: '40px', textAlign: 'center' }}>ลบ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inboundItems.map((item, idx) => (
                            <tr key={item.tempId}>
                              <td style={{ textAlign: 'center', color: '#94a3b8' }}>{idx + 1}</td>
                              <td>
                                <div style={{ fontWeight: '600', color: '#f8fafc', fontSize: '13px' }}>
                                  {item.name}
                                </div>
                                <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', gap: '8px', marginTop: '2px' }}>
                                  <span>รหัส: <b style={{ color: '#e2e8f0' }}>{item.barcode}</b></span>
                                  {item.serialNo && <span>S/N: <b style={{ color: '#38bdf8' }}>{item.serialNo}</b></span>}
                                </div>
                                {item.note && (
                                  <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', marginTop: '2px' }}>
                                    หมายเหตุ: {item.note}
                                  </div>
                                )}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span
                                  className={
                                    item.location === 'โกดังใหญ่'
                                      ? 'loc-badge-big'
                                      : item.location === 'โกดังกุ๊กไก่'
                                      ? 'loc-badge-kookkai'
                                      : 'loc-badge-office'
                                }
                                >
                                  {item.location}
                                </span>
                              </td>
                              <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '13.5px', color: '#10b981' }}>
                                +{item.quantity} {item.unit}
                              </td>
                              <td style={{ textAlign: 'center', fontSize: '12px', color: '#cbd5e1' }}>
                                {item.prevStock} ➡️ <b style={{ color: '#10b981' }}>{item.newStock}</b>
                              </td>
                              <td style={{ textAlign: 'right', color: '#cbd5e1' }}>
                                ฿{Number(item.costPrice).toLocaleString()}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#f8fafc' }}>
                                ฿{Number(item.totalCost).toLocaleString()}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(item.tempId)}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#ef4444',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    padding: '4px',
                                  }}
                                  title="ลบรายการนี้"
                                >
                                  🗑️
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  /* Clean Empty state (without green box) */
                  <div className="inbound-empty-panel">
                    <span className="inbound-empty-icon">📦</span>
                    <div style={{ fontWeight: '600', color: '#f1f5f9', fontSize: '14.5px' }}>
                      ยังไม่มีรายการเครื่องในใบรับเข้านี้
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#94a3b8', maxWidth: '340px', lineHeight: '1.5' }}>
                      เลือกเครื่องจักรจากฝั่งซ้าย ระบุจำนวน แล้วกดปุ่ม <b style={{ color: '#38bdf8' }}>"➕ เพิ่มลงในใบรับเข้า"</b>
                    </p>
                  </div>
                )}

                {/* Totals Summary Card */}
                <div className="voucher-summary-card">
                  <div className="summary-metric">
                    <span className="label">รายการรับเข้า</span>
                    <span className="value">{voucherSummary.itemCount} รายการ</span>
                  </div>
                  <div className="summary-metric highlight">
                    <span className="label">จำนวนเครื่องรับเข้ารวม</span>
                    <span className="value">{voucherSummary.totalUnits} เครื่อง</span>
                  </div>
                  <div className="summary-metric">
                    <span className="label">มูลค่ารับเข้าทั้งสิ้น</span>
                    <span className="value" style={{ color: '#38bdf8' }}>
                      ฿{voucherSummary.totalCostValue.toLocaleString()}
                    </span>
                  </div>
                  <div className="summary-metric">
                    <span className="label">สถานะ</span>
                    <span className="value" style={{ color: '#10b981', fontSize: '13.5px' }}>
                      ✅ พร้อมอัปเดตสต๊อก
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="receive-action-buttons-row">
                  <button type="button" className="btn-receive-cancel" onClick={onClose}>
                    ยกเลิก
                  </button>

                  <button
                    type="button"
                    className="btn-receive-print"
                    onClick={() => handleSubmitInbound(true)}
                    title="บันทึกรับเข้าและพิมพ์ใบรับสินค้า A4"
                  >
                    <span>🖨️</span> บันทึกและพิมพ์ใบรับสินค้า
                  </button>

                  <button
                    type="button"
                    className="btn-receive-save"
                    onClick={() => handleSubmitInbound(false)}
                    title="บันทึกข้อมูลและเพิ่มสต๊อกสินค้าทันที"
                  >
                    <span>💾</span> บันทึกรับเครื่องเข้าระบบ
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Content - Tab 2: History (Past Inbound Vouchers) */}
        {activeTab === 'history' && (
          <div className="receive-history-container">
            <div className="history-search-row">
              <div style={{ position: 'relative', width: '340px', maxWidth: '100%' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}>🔍</span>
                <input
                  type="text"
                  placeholder="ค้นหาเลขที่ใบรับ, ชื่อเครื่อง, แหล่งที่มา..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 36px',
                    background: '#121420',
                    border: '1.5px solid #282c3f',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                พบทั้งหมด <b>{filteredHistory.length}</b> ใบรับเข้า
              </div>
            </div>

            {filteredHistory.length > 0 ? (
              <div className="inbound-table-wrapper" style={{ minHeight: '350px' }}>
                <div className="inbound-table-scroll">
                  <table className="inbound-table">
                    <thead>
                      <tr>
                        <th style={{ width: '120px' }}>เลขที่ใบรับเข้า</th>
                        <th style={{ width: '130px' }}>วันที่ - เวลา</th>
                        <th style={{ width: '180px' }}>ผู้จำหน่าย / แหล่งที่มา</th>
                        <th>รายการเครื่องจักรที่รับเข้า</th>
                        <th style={{ width: '90px', textAlign: 'center' }}>รวมจำนวน</th>
                        <th style={{ width: '110px', textAlign: 'right' }}>มูลค่ารวม</th>
                        <th style={{ width: '100px', textAlign: 'center' }}>การจัดการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistory.map((rec) => (
                        <tr key={rec.id}>
                          <td style={{ fontWeight: 'bold', color: '#38bdf8', fontFamily: 'monospace' }}>
                            {rec.id}
                          </td>
                          <td style={{ fontSize: '12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                            {new Date(rec.date).toLocaleDateString('th-TH')} {new Date(rec.date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td>
                            <div style={{ fontWeight: '500', color: '#f1f5f9' }}>{rec.supplier}</div>
                            {rec.refDocNo && rec.refDocNo !== '-' && (
                              <div style={{ fontSize: '11px', color: '#94a3b8' }}>PO: {rec.refDocNo}</div>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '12.5px' }}>
                              {(rec.items || []).map((it, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ color: '#10b981' }}>•</span>
                                  <span style={{ color: '#e2e8f0', fontWeight: '500' }}>{it.name}</span>
                                  <span style={{ color: '#38bdf8', fontSize: '11.5px', fontWeight: 'bold' }}>
                                    (+{it.quantity})
                                  </span>
                                  <span style={{ color: '#64748b', fontSize: '11px' }}>[{it.location}]</span>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#10b981' }}>
                            {rec.totalUnits} เครื่อง
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: '600', color: '#f1f5f9' }}>
                            ฿{Number(rec.totalCostValue || 0).toLocaleString()}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => printInboundVoucher(rec)}
                              style={{
                                padding: '4px 10px',
                                fontSize: '11.5px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: 'rgba(59, 130, 246, 0.15)',
                                borderColor: 'rgba(59, 130, 246, 0.3)',
                                color: '#60a5fa',
                                borderRadius: '6px',
                              }}
                              title="พิมพ์ใบรับเข้าสินค้านี้"
                            >
                              🖨️ พิมพ์
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                <span style={{ fontSize: '36px', display: 'block', marginBottom: '8px' }}>🧾</span>
                <p style={{ margin: 0, fontSize: '14px' }}>ยังไม่มีประวัติการรับเครื่องเข้าระบบ</p>
                <p style={{ margin: '4px 0 0', fontSize: '12px' }}>
                  เมื่อมีการบันทึกรับเครื่องเข้าระบบ ประวัติจะแสดงที่นี่โดยอัตโนมัติ
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReceiveStockModal;
