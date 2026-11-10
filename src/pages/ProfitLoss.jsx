import React, { useState, useMemo, useEffect } from 'react';
import { useStore, ACTIONS } from '../data/store';
import Swal from 'sweetalert2';
import './POS.css';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import './ProfitLoss.css';
import Receipt from '../components/Receipt';
import { showAlert, showConfirm } from '../utils/alerts';
import { DEFAULT_PART_UNIT, PART_UNITS } from '../utils/partUnits';
import {
  getInboundHistory,
  fetchInboundHistoryFromSupabase,
  updateInboundRecord,
  deleteInboundRecord,
  printInboundVoucher,
} from '../components/ReceiveStockModal';

// ─── Custom Tooltip for Chart ───────────────────────────────────────
const ProfitTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="custom-tooltip">
      <div className="tooltip-label">{label}</div>
      <div className="tooltip-row">
        <span className="tooltip-row-label">ยอดขาย:</span>
        <span className="tooltip-row-value blue">฿{Number(payload[0].value).toLocaleString()}</span>
      </div>
      <div className="tooltip-row">
        <span className="tooltip-row-label">ต้นทุน:</span>
        <span className="tooltip-row-value orange">฿{Number(payload[1].value).toLocaleString()}</span>
      </div>
      <div className="tooltip-row border-top">
        <span className="tooltip-row-label">กำไร:</span>
        <span className={`tooltip-row-value ${payload[2].value >= 0 ? 'green' : 'red'}`}>
          ฿{Number(payload[2].value).toLocaleString()}
        </span>
      </div>
    </div>
  );
};

const ProfitLoss = () => {
  const { state, dispatch, refreshSales, getTodaySales, getSalesByDateRange } = useStore();

  // ─── Main Report Switcher Tab: 'sales' | 'inbound' ───
  const [activeReportTab, setActiveReportTab] = useState('sales');

  // ─── Sales Date Filters ───
  const [filterType, setFilterType] = useState('30days');
  const [customDates, setCustomDates] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });

  // Always sync latest bills from Supabase when opening Reports so bills from all terminals appear immediately
  useEffect(() => {
    if (refreshSales) {
      refreshSales();
    }
  }, [refreshSales]);

  // ─── Filtered Sales ────────────────────────────────────────────────
  const filteredSales = useMemo(() => {
    if (filterType === 'today') {
      return getTodaySales();
    } else if (filterType === '7days') {
      const start = new Date();
      start.setDate(start.getDate() - 6);
      return getSalesByDateRange(start.toISOString(), new Date().toISOString());
    } else if (filterType === '30days') {
      const start = new Date();
      start.setDate(start.getDate() - 29);
      return getSalesByDateRange(start.toISOString(), new Date().toISOString());
    } else {
      return getSalesByDateRange(customDates.start, customDates.end);
    }
  }, [filterType, customDates, state.sales, getTodaySales, getSalesByDateRange]);

  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSaleForReprint, setSelectedSaleForReprint] = useState(null);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filterType, customDates]);

  // ─── Searched and Paginated Sales ──────────────────────────────────
  const searchedSales = useMemo(() => {
    if (!searchQuery.trim()) return filteredSales;
    const query = searchQuery.toLowerCase().trim();
    return filteredSales.filter((sale) => {
      const billId = sale.id ? sale.id.toLowerCase() : '';
      const customerName = sale.customer && sale.customer.name ? sale.customer.name.toLowerCase() : '';
      const customerPhone = sale.customer && sale.customer.phone ? sale.customer.phone.toLowerCase() : '';
      const employee = sale.employee ? sale.employee.toLowerCase() : '';

      const itemsMatch = (sale.items || []).some((item) => {
        const itemName = (item.name || '').toLowerCase();
        const itemId = (item.productId || item.id || '').toLowerCase();
        const catalogProduct = state.products.find((p) => p.id === item.productId || p.id === item.id);
        const catalogName = (catalogProduct?.name || '').toLowerCase();
        const barcode = (catalogProduct?.barcode || item.barcode || '').toLowerCase();
        const model = (catalogProduct?.model || '').toLowerCase();
        return (
          itemName.includes(query) ||
          itemId.includes(query) ||
          catalogName.includes(query) ||
          barcode.includes(query) ||
          model.includes(query)
        );
      });

      return (
        billId.includes(query) ||
        customerName.includes(query) ||
        customerPhone.includes(query) ||
        employee.includes(query) ||
        itemsMatch
      );
    });
  }, [filteredSales, searchQuery, state.products]);

  const itemsPerPage = 20;
  const totalPages = Math.ceil(searchedSales.length / itemsPerPage) || 1;
  const activePage = Math.min(currentPage, totalPages);

  const paginatedSales = useMemo(() => {
    const startIndex = (activePage - 1) * itemsPerPage;
    return searchedSales.slice(startIndex, startIndex + itemsPerPage);
  }, [searchedSales, activePage]);

  // ─── Calculations for Sales ────────────────────────────────────────
  const { revenue, cost, profit, profitMargin } = useMemo(() => {
    let revSum = 0;
    let costSum = 0;

    filteredSales.forEach((sale) => {
      revSum += sale.total;
      let saleCost = 0;
      (sale.items || []).forEach((item) => {
        const costPrice = item.costPrice ?? state.products.find((p) => p.id === item.productId)?.costPrice ?? 0;
        saleCost += costPrice * (item.quantity || 1);
      });
      const discountRatio = sale.subtotal > 0 ? (sale.discountAmount ?? sale.discount ?? 0) / sale.subtotal : 0;
      const finalCost = saleCost * (1 - discountRatio);
      costSum += finalCost;
    });

    const netProfit = revSum - costSum;
    const margin = revSum > 0 ? (netProfit / revSum) * 100 : 0;

    return {
      revenue: Math.round(revSum),
      cost: Math.round(costSum),
      profit: Math.round(netProfit),
      profitMargin: margin.toFixed(2),
    };
  }, [filteredSales, state.products]);

  // ─── Daily Aggregation for Chart ────────────────────────────────────
  const chartData = useMemo(() => {
    const daysMap = {};
    const now = new Date();
    let duration = 30;

    if (filterType === 'today') {
      duration = 1;
    } else if (filterType === '7days') {
      duration = 7;
    } else if (filterType === '30days') {
      duration = 30;
    } else {
      const start = new Date(customDates.start);
      const end = new Date(customDates.end);
      duration = Math.ceil((end - start) / (24 * 60 * 60 * 1000)) + 1;
      if (duration > 90) duration = 90;
    }

    for (let i = duration - 1; i >= 0; i--) {
      const d = new Date();
      if (filterType === 'custom') {
        d.setTime(new Date(customDates.end).getTime() - i * 24 * 60 * 60 * 1000);
      } else {
        d.setDate(now.getDate() - i);
      }
      const key = d.toISOString().split('T')[0];
      const label = `${d.getDate()}/${d.getMonth() + 1}`;
      daysMap[key] = { date: label, revenue: 0, cost: 0, profit: 0 };
    }

    filteredSales.forEach((sale) => {
      const key = (sale.date || '').split('T')[0];
      if (daysMap[key]) {
        let saleCost = 0;
        (sale.items || []).forEach((item) => {
          const costPrice = item.costPrice ?? state.products.find((p) => p.id === item.productId)?.costPrice ?? 0;
          saleCost += costPrice * (item.quantity || 1);
        });
        const discountRatio = sale.subtotal > 0 ? (sale.discountAmount ?? sale.discount ?? 0) / sale.subtotal : 0;
        const finalCost = saleCost * (1 - discountRatio);
        daysMap[key].revenue += sale.total;
        daysMap[key].cost += finalCost;
      }
    });

    return Object.values(daysMap).map((d) => ({
      date: d.date,
      revenue: Math.round(d.revenue),
      cost: Math.round(d.cost),
      profit: Math.round(d.revenue - d.cost),
    }));
  }, [filteredSales, filterType, customDates, state.products]);

  const formatDateTime = (isoStr) => {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    const datePart = d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short' });
    const timePart = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  };

  const getSaleProfitInfo = (sale) => {
    let saleCost = 0;
    (sale.items || []).forEach((item) => {
      const costPrice = item.costPrice ?? state.products.find((p) => p.id === item.productId)?.costPrice ?? 0;
      saleCost += costPrice * (item.quantity || 1);
    });

    const discountRatio = sale.subtotal > 0 ? (sale.discountAmount ?? sale.discount ?? 0) / sale.subtotal : 0;
    const finalCost = Math.round(saleCost * (1 - discountRatio));
    const profitVal = Math.round(sale.total - finalCost);
    const marginPercent = sale.total > 0 ? ((profitVal / sale.total) * 100).toFixed(1) : '0.0';

    return {
      cost: finalCost,
      profit: profitVal,
      margin: marginPercent,
    };
  };

  const exportToExcel = () => {
    const headers = ['เลขที่บิล', 'วันที่ - เวลา', 'ลูกค้า', 'รายการเครื่อง / สินค้า', 'คนขาย', 'ยอดขาย (บาท)', 'ต้นทุนสินค้า (บาท)', 'กำไรสุทธิ (บาท)', 'อัตรากำไร (%)'];
    const rows = searchedSales.map((sale) => {
      const profitInfo = getSaleProfitInfo(sale);
      const customerName = sale.customer ? sale.customer.name : 'ลูกค้าทั่วไป';
      const itemsStr = (sale.items || []).map((it) => {
        const name = it.name || state.products.find((p) => p.id === it.productId || p.id === it.id)?.name || it.productId || 'สินค้า';
        return `${name} (x${it.quantity || 1})`;
      }).join('; ');

      return [
        sale.id,
        formatDateTime(sale.date),
        customerName,
        itemsStr,
        sale.employee || 'หน้าร้าน',
        sale.total,
        profitInfo.cost,
        profitInfo.profit,
        `${profitInfo.margin}%`,
      ];
    });

    const csvContent = "\uFEFF" + [headers, ...rows]
      .map((e) => e.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `รายงานการขาย_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToPDF = () => {
    const printWindow = window.open('', '_blank');
    const tableRows = searchedSales.map((sale) => {
      const profitInfo = getSaleProfitInfo(sale);
      const customerName = sale.customer ? sale.customer.name : 'ลูกค้าทั่วไป';
      const itemsStr = (sale.items || []).map((it) => {
        const name = it.name || state.products.find((p) => p.id === it.productId || p.id === it.id)?.name || it.productId || 'สินค้า';
        return `<div>• ${name} (x${it.quantity || 1})</div>`;
      }).join('');

      return `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; font-family: monospace; font-weight: bold;">${sale.id}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${formatDateTime(sale.date)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${customerName}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${itemsStr}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${sale.employee || 'หน้าร้าน'}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">฿${sale.total.toLocaleString()}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">฿${profitInfo.cost.toLocaleString()}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right; color: ${profitInfo.profit >= 0 ? '#10b981' : '#ef4444'}; font-weight: bold;">฿${profitInfo.profit.toLocaleString()}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${profitInfo.margin}%</td>
        </tr>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>รายงานสรุปการขายและกำไร - HUALIAN STORE</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; }
            body { font-family: 'Noto Sans Thai', sans-serif; color: #333; margin: 0; padding: 20px; font-size: 13px; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
            .company-title { font-size: 24px; font-weight: bold; }
            .report-title { font-size: 20px; color: #555; }
            .kpi-container { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; }
            .kpi-card { border: 1px solid #ccc; border-radius: 8px; padding: 15px; text-align: center; background: #f9f9f9; }
            .kpi-value { font-size: 18px; font-weight: bold; margin-top: 5px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th { background: #f2f2f2; border-bottom: 2px solid #ddd; padding: 10px; text-align: left; font-size: 13px; }
            td { font-size: 13px; }
            .footer { margin-top: 50px; text-align: right; font-size: 12px; color: #777; }
            @media print { body { margin: 20px; } button { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="company-title">ระบบจัดการ HUALIAN STORE</div>
              <div style="font-size: 12px; color: #666; margin-top: 5px;">วันที่พิมพ์รายงาน: ${new Date().toLocaleDateString('th-TH')} ${new Date().toLocaleTimeString('th-TH')}</div>
            </div>
            <div class="report-title">รายงานสรุปการขายและกำไร</div>
          </div>
          <div style="margin-bottom: 20px; font-size: 14px;">
            <strong>ช่วงเวลา:</strong> ${filterType === 'today' ? 'วันนี้' : filterType === '7days' ? '7 วันที่ผ่านมา' : filterType === '30days' ? '30 วันที่ผ่านมา' : `ตั้งแต่ ${customDates.start} ถึง ${customDates.end}`}
          </div>
          <div class="kpi-container">
            <div class="kpi-card"><div>ยอดขายรวม</div><div class="kpi-value">฿${revenue.toLocaleString()}</div></div>
            <div class="kpi-card"><div>ต้นทุนสินค้า</div><div class="kpi-value">฿${cost.toLocaleString()}</div></div>
            <div class="kpi-card"><div>กำไรขั้นต้น</div><div class="kpi-value" style="color: ${profit >= 0 ? '#10b981' : '#ef4444'};">฿${profit.toLocaleString()}</div></div>
            <div class="kpi-card"><div>อัตรากำไร</div><div class="kpi-value">${profitMargin}%</div></div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 95px;">เลขที่บิล</th>
                <th style="width: 110px;">วันที่ - เวลา</th>
                <th style="min-width: 120px;">ลูกค้า</th>
                <th style="min-width: 170px;">รายการเครื่อง / สินค้า</th>
                <th style="text-align: center; width: 80px;">คนขาย</th>
                <th style="text-align: right; width: 95px;">ยอดขาย</th>
                <th style="text-align: right; width: 95px;">ต้นทุน</th>
                <th style="text-align: right; width: 95px;">กำไรสุทธิ</th>
                <th style="text-align: center; width: 80px;">อัตรากำไร</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
          <div class="footer">พิมพ์โดยพนักงาน HUALIAN STORE • หน้า 1 จาก 1</div>
          <script>window.focus(); setTimeout(() => { window.print(); }, 250);</script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
  };

  // ─── Edit Receipt (PIN 45500 protected) ────────────────────────────
  const [editingSale, setEditingSale] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const computeSaleTotals = (items, discountNum, shippingNum, applyVat, isVatInclusive) => {
    const catalogSubtotal = (items || []).reduce(
      (sum, it) => sum + (Number(it.sellPrice || 0) * Number(it.quantity || 0)),
      0
    );
    const discountAmount = Math.max(0, Number(discountNum || 0));
    const afterDiscount = Math.max(0, catalogSubtotal - discountAmount);
    const extraFees = Math.max(0, Number(shippingNum || 0));
    const taxRate = 0.07;

    let subtotal, tax, total;
    if (applyVat) {
      if (isVatInclusive) {
        total = Math.round((afterDiscount + extraFees) * 100) / 100;
        subtotal = Math.round((total / (1 + taxRate)) * 100) / 100;
        tax = Math.round((total - subtotal) * 100) / 100;
      } else {
        subtotal = afterDiscount;
        const taxBase = subtotal + extraFees;
        tax = Math.round(taxBase * taxRate * 100) / 100;
        total = Math.round((subtotal + tax + extraFees) * 100) / 100;
      }
    } else {
      subtotal = afterDiscount;
      tax = 0;
      total = Math.round((subtotal + extraFees) * 100) / 100;
    }

    return { subtotal, tax, total, catalogSubtotal };
  };

  const handleOpenEditSale = async (sale) => {
    const { value: pin } = await Swal.fire({
      title: '🔐 รหัสความปลอดภัย',
      text: `กรุณาใส่รหัสผ่านเพื่อแก้ไขใบเสร็จ ${sale.id}`,
      input: 'password',
      inputPlaceholder: '*****',
      inputAttributes: {
        maxlength: '10',
        autocomplete: 'new-password',
        style: 'text-align: center; letter-spacing: 8px; font-size: 22px;',
      },
      showCancelButton: true,
      confirmButtonText: 'ยืนยัน',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#4f46e5',
      cancelButtonColor: '#4b5563',
      background: '#1a1b26',
      color: '#f3f4f6',
    });
    if (pin === undefined) return;
    if (pin !== '45500') {
      Swal.fire({
        icon: 'error',
        title: 'รหัสผ่านไม่ถูกต้อง',
        text: 'ไม่สามารถแก้ไขใบเสร็จได้',
        confirmButtonColor: '#ef4444',
        background: '#1a1b26',
        color: '#f3f4f6',
      });
      return;
    }

    const initialApplyVat = sale.applyVat !== undefined ? Boolean(sale.applyVat) : Number(sale.tax || 0) > 0;
    const initialIsVatInclusive = sale.isVatInclusive !== undefined ? Boolean(sale.isVatInclusive) : true;

    const initialItems = (sale.items || []).map((it, idx) => ({
      tempId: `item-${idx}-${Date.now()}`,
      id: it.id || it.productId || '',
      productId: it.productId || it.id || '',
      name: it.name || it.productName || '',
      unit: it.unit || DEFAULT_PART_UNIT,
      quantity: Number(it.quantity || 1),
      sellPrice: Number(it.sellPrice ?? it.price ?? 0),
      costPrice: Number(it.costPrice ?? 0),
      selectedLocation: it.selectedLocation || 'หน้าร้าน',
    }));

    if (initialItems.length === 0) {
      initialItems.push({
        tempId: `item-0-${Date.now()}`,
        id: '',
        productId: '',
        name: 'รายการสินค้า',
        unit: DEFAULT_PART_UNIT,
        quantity: 1,
        sellPrice: Number(sale.subtotal || sale.total || 0),
        costPrice: 0,
        selectedLocation: 'หน้าร้าน',
      });
    }

    const computed = computeSaleTotals(
      initialItems,
      sale.discountAmount || 0,
      sale.shippingCost || 0,
      initialApplyVat,
      initialIsVatInclusive
    );

    setEditForm({
      id: sale.id,
      customerName: sale.customer?.name || 'ลูกค้าทั่วไป',
      customerPhone: sale.customer?.phone === '-' ? '' : (sale.customer?.phone || ''),
      customerAddress: sale.customer?.address === '-' ? '' : (sale.customer?.address || ''),
      customerTaxId: sale.customer?.taxId === '-' ? '' : (sale.customer?.taxId || ''),
      employee: sale.employee || 'หน้าร้าน',
      paymentMethod: sale.paymentMethod || 'cash',
      shippingCost: sale.shippingCost || 0,
      discountAmount: sale.discountAmount || 0,
      applyVat: initialApplyVat,
      isVatInclusive: initialIsVatInclusive,
      items: initialItems,
      subtotal: computed.subtotal,
      tax: computed.tax,
      total: computed.total,
    });
    setEditingSale(sale);
  };

  const handleItemChange = (idx, field, value) => {
    setEditForm((prev) => {
      if (!prev) return prev;
      const updatedItems = [...prev.items];
      const itemToUpdate = { ...updatedItems[idx] };

      if (field === 'quantity' || field === 'sellPrice') {
        itemToUpdate[field] = value === '' ? '' : value;
      } else {
        itemToUpdate[field] = value;
      }
      updatedItems[idx] = itemToUpdate;

      const computed = computeSaleTotals(
        updatedItems,
        prev.discountAmount,
        prev.shippingCost,
        prev.applyVat,
        prev.isVatInclusive
      );

      return {
        ...prev,
        items: updatedItems,
        subtotal: computed.subtotal,
        tax: computed.tax,
        total: computed.total,
      };
    });
  };

  const handleAddItem = () => {
    setEditForm((prev) => {
      if (!prev) return prev;
      const newItem = {
        tempId: `new-${Date.now()}-${Math.random()}`,
        id: '',
        productId: '',
        name: '',
        unit: DEFAULT_PART_UNIT,
        quantity: 1,
        sellPrice: 0,
        costPrice: 0,
        selectedLocation: 'หน้าร้าน',
      };
      const updatedItems = [...prev.items, newItem];
      const computed = computeSaleTotals(
        updatedItems,
        prev.discountAmount,
        prev.shippingCost,
        prev.applyVat,
        prev.isVatInclusive
      );
      return {
        ...prev,
        items: updatedItems,
        subtotal: computed.subtotal,
        tax: computed.tax,
        total: computed.total,
      };
    });
  };

  const handleDeleteItem = (idx) => {
    setEditForm((prev) => {
      if (!prev || prev.items.length <= 1) return prev;
      const updatedItems = prev.items.filter((_, i) => i !== idx);
      const computed = computeSaleTotals(
        updatedItems,
        prev.discountAmount,
        prev.shippingCost,
        prev.applyVat,
        prev.isVatInclusive
      );
      return {
        ...prev,
        items: updatedItems,
        subtotal: computed.subtotal,
        tax: computed.tax,
        total: computed.total,
      };
    });
  };

  const handleDiscountChange = (val) => {
    setEditForm((prev) => {
      if (!prev) return prev;
      const discountNum = val === '' ? 0 : Number(val);
      const computed = computeSaleTotals(
        prev.items,
        discountNum,
        prev.shippingCost,
        prev.applyVat,
        prev.isVatInclusive
      );
      return {
        ...prev,
        discountAmount: val,
        subtotal: computed.subtotal,
        tax: computed.tax,
        total: computed.total,
      };
    });
  };

  const handleShippingChange = (val) => {
    setEditForm((prev) => {
      if (!prev) return prev;
      const shippingNum = val === '' ? 0 : Number(val);
      const computed = computeSaleTotals(
        prev.items,
        prev.discountAmount,
        shippingNum,
        prev.applyVat,
        prev.isVatInclusive
      );
      return {
        ...prev,
        shippingCost: val,
        subtotal: computed.subtotal,
        tax: computed.tax,
        total: computed.total,
      };
    });
  };

  const handleSaveEditSale = async (e) => {
    e.preventDefault();
    if (!editForm || !editingSale || isSavingEdit) return;

    const invalidItem = editForm.items.find((it) => !String(it.name || '').trim());
    if (invalidItem) {
      Swal.fire({
        icon: 'warning',
        title: 'ข้อมูลไม่ครบถ้วน',
        text: 'กรุณากรอกชื่อสินค้าให้ครบทุกรายการ',
        confirmButtonColor: '#f59e0b',
        background: '#1a1b26',
        color: '#f3f4f6',
      });
      return;
    }

    setIsSavingEdit(true);

    const computed = computeSaleTotals(
      editForm.items,
      editForm.discountAmount,
      editForm.shippingCost,
      editForm.applyVat,
      editForm.isVatInclusive
    );

    const updatedSale = {
      ...editingSale,
      customer: {
        ...editingSale.customer,
        name: editForm.customerName.trim() || 'ลูกค้าทั่วไป',
        phone: editForm.customerPhone.trim() || '-',
        address: editForm.customerAddress.trim() || '-',
        taxId: editForm.customerTaxId.trim() || '-',
      },
      employee: editForm.employee,
      paymentMethod: editForm.paymentMethod,
      shippingCost: Number(editForm.shippingCost || 0),
      discountAmount: Number(editForm.discountAmount || 0),
      subtotal: Number(computed.subtotal),
      tax: Number(computed.tax),
      total: Number(computed.total),
      items: editForm.items.map((it) => ({
        ...it,
        name: it.name.trim(),
        quantity: Number(it.quantity || 1),
        unit: it.unit || DEFAULT_PART_UNIT,
        sellPrice: Number(it.sellPrice || 0),
        costPrice: Number(it.costPrice || 0),
      })),
    };

    try {
      const ok = await dispatch({ type: ACTIONS.UPDATE_SALE, payload: updatedSale });
      if (ok === false) return;
      setEditingSale(null);
      setEditForm(null);
      if (refreshSales) refreshSales();
      Swal.fire({
        icon: 'success',
        title: 'บันทึกการแก้ไขแล้ว',
        text: `อัปเดตข้อมูลและรายการสินค้าในใบเสร็จ ${updatedSale.id} สำเร็จ (สต๊อกสินค้าคงเดิม)`,
        confirmButtonColor: '#10b981',
        confirmButtonText: 'ตกลง',
        background: '#1a1b26',
        color: '#f3f4f6',
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  // ─── Inbound Report States & Handlers ──────────────────────────────
  const [inboundHistory, setInboundHistory] = useState(() => getInboundHistory());
  const [inboundSearch, setInboundSearch] = useState('');
  const [inboundLocationFilter, setInboundLocationFilter] = useState('all');
  const [inboundPeriod, setInboundPeriod] = useState('30days'); // 'today' | '7days' | '30days' | 'all' | 'custom'
  const [inboundCustomDates, setInboundCustomDates] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });
  const [inboundCurrentPage, setInboundCurrentPage] = useState(1);
  const inboundItemsPerPage = 15;

  const [editingInbound, setEditingInbound] = useState(null);
  const [editInboundForm, setEditInboundForm] = useState(null);
  const [isSavingInboundEdit, setIsSavingInboundEdit] = useState(false);

  // Sync inbound records on mount, tab change, and events
  useEffect(() => {
    // Initial fetch from Supabase Cloud
    fetchInboundHistoryFromSupabase();

    const handleInboundSync = () => {
      setInboundHistory(getInboundHistory());
    };
    window.addEventListener('hualian_inbound_updated', handleInboundSync);
    window.addEventListener('storage', handleInboundSync);
    return () => {
      window.removeEventListener('hualian_inbound_updated', handleInboundSync);
      window.removeEventListener('storage', handleInboundSync);
    };
  }, []);

  // Fetch latest cloud records when switching to inbound tab
  useEffect(() => {
    if (activeReportTab === 'inbound') {
      fetchInboundHistoryFromSupabase();
    }
  }, [activeReportTab]);

  // Filtered Inbound Records
  const filteredInboundRecords = useMemo(() => {
    const now = new Date();
    let startCutoff = null;
    let endCutoff = null;

    if (inboundPeriod === 'today') {
      startCutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (inboundPeriod === '7days') {
      startCutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    } else if (inboundPeriod === '30days') {
      startCutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    } else if (inboundPeriod === 'custom') {
      startCutoff = new Date(inboundCustomDates.start + 'T00:00:00');
      endCutoff = new Date(inboundCustomDates.end + 'T23:59:59');
    }

    return (inboundHistory || []).filter((rec) => {
      if (!rec) return false;
      const recDate = new Date(rec.date);

      if (startCutoff && recDate < startCutoff) return false;
      if (endCutoff && recDate > endCutoff) return false;

      if (inboundLocationFilter !== 'all') {
        const hasLoc = (rec.items || []).some((it) => it.location === inboundLocationFilter);
        if (!hasLoc) return false;
      }

      if (inboundSearch.trim()) {
        const q = inboundSearch.toLowerCase().trim();
        const matchId = String(rec.id || '').toLowerCase().includes(q);
        const matchSupplier = String(rec.supplier || '').toLowerCase().includes(q);
        const matchReceiver = String(rec.receiver || '').toLowerCase().includes(q);
        const matchRef = String(rec.refDocNo || '').toLowerCase().includes(q);
        const matchNotes = String(rec.notes || '').toLowerCase().includes(q);
        const matchItem = (rec.items || []).some(
          (it) =>
            String(it.name || '').toLowerCase().includes(q) ||
            String(it.barcode || it.productId || '').toLowerCase().includes(q) ||
            String(it.serialNo || '').toLowerCase().includes(q)
        );
        if (!matchId && !matchSupplier && !matchReceiver && !matchRef && !matchNotes && !matchItem) {
          return false;
        }
      }

      return true;
    });
  }, [inboundHistory, inboundPeriod, inboundCustomDates, inboundLocationFilter, inboundSearch]);

  // Inbound KPI Stats
  const inboundStats = useMemo(() => {
    let totalUnits = 0;
    let totalCost = 0;
    const warehouseUnits = { 'โกดังใหญ่': 0, 'โกดังกุ๊กไก่': 0, 'ออฟฟิศ': 0 };

    filteredInboundRecords.forEach((rec) => {
      (rec.items || []).forEach((it) => {
        const q = Number(it.quantity || 0);
        totalUnits += q;
        totalCost += Number(it.totalCost || (q * Number(it.costPrice || 0)));
        if (warehouseUnits[it.location] !== undefined) {
          warehouseUnits[it.location] += q;
        } else {
          warehouseUnits['โกดังใหญ่'] += q;
        }
      });
    });

    return {
      voucherCount: filteredInboundRecords.length,
      totalUnits,
      totalCost,
      warehouseUnits,
    };
  }, [filteredInboundRecords]);

  // Inbound Pagination
  const totalInboundPages = Math.ceil(filteredInboundRecords.length / inboundItemsPerPage) || 1;
  const paginatedInbounds = useMemo(() => {
    const start = (inboundCurrentPage - 1) * inboundItemsPerPage;
    return filteredInboundRecords.slice(start, start + inboundItemsPerPage);
  }, [filteredInboundRecords, inboundCurrentPage]);

  // Export Inbound Excel (CSV)
  const exportInboundExcel = () => {
    const headers = [
      'เลขที่ใบรับเข้า',
      'วันที่ - เวลา',
      'ผู้จัดจำหน่าย / แหล่งที่มา',
      'เอกสารอ้างอิง/PO',
      'รายการเครื่องจักร',
      'รหัสสินค้า/บาร์โค้ด',
      'จำนวนเครื่อง',
      'หน่วย',
      'ราคาทุน/หน่วย (บาท)',
      'มูลค่ารวม (บาท)',
      'คลังจัดเก็บ',
      'Serial No',
      'ผู้ตรวจรับ',
      'หมายเหตุ',
    ];
    const rows = [];
    filteredInboundRecords.forEach((rec) => {
      (rec.items || []).forEach((it) => {
        rows.push([
          rec.id,
          new Date(rec.date).toLocaleDateString('th-TH') + ' ' + new Date(rec.date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
          rec.supplier || '-',
          rec.refDocNo || '-',
          it.name,
          it.barcode || it.productId || '-',
          it.quantity,
          it.unit || 'เครื่อง',
          it.costPrice || 0,
          it.totalCost || ((it.quantity || 0) * (it.costPrice || 0)),
          it.location || 'โกดังใหญ่',
          it.serialNo || '-',
          rec.receiver || '-',
          it.note || rec.notes || '-',
        ]);
      });
    });

    const csvContent = "\uFEFF" + [headers, ...rows]
      .map((e) => e.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `รายงานการรับเข้าเครื่อง_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Open Edit Inbound Modal
  const handleOpenEditInbound = (record) => {
    if (!record) return;
    setEditingInbound(record);
    const dateFormatted = record.date
      ? new Date(record.date).toISOString().slice(0, 16)
      : new Date().toISOString().slice(0, 16);

    setEditInboundForm({
      id: record.id,
      date: dateFormatted,
      supplier: record.supplier || 'โรงงานผู้ผลิต HUALIAN (จีน)',
      refDocNo: record.refDocNo === '-' ? '' : (record.refDocNo || ''),
      receiver: record.receiver || (state.currentUser?.name || 'ผู้ดูแลระบบ'),
      notes: record.notes || '',
      items: (record.items || []).map((it, idx) => ({
        tempId: `inb-${idx}-${Date.now()}`,
        productId: it.productId || it.barcode || '',
        barcode: it.barcode || it.productId || '',
        name: it.name || '',
        category: it.category || 'sealer',
        location: it.location || 'โกดังใหญ่',
        quantity: Number(it.quantity || 1),
        unit: it.unit || 'เครื่อง',
        costPrice: Number(it.costPrice || 0),
        totalCost: Number(it.totalCost || (Number(it.costPrice || 0) * Number(it.quantity || 1))),
        serialNo: it.serialNo || '',
        note: it.note || '',
        origProductId: it.productId || it.barcode || '',
        origLocation: it.location || 'โกดังใหญ่',
        origQuantity: Number(it.quantity || 1),
      })),
    });
  };

  const handleInboundItemChange = (idx, field, value) => {
    setEditInboundForm((prev) => {
      if (!prev) return prev;
      const updatedItems = [...prev.items];
      const item = { ...updatedItems[idx] };

      if (field === 'quantity' || field === 'costPrice') {
        item[field] = value === '' ? '' : value;
        const q = Number(field === 'quantity' ? value : item.quantity) || 0;
        const c = Number(field === 'costPrice' ? value : item.costPrice) || 0;
        item.totalCost = q * c;
      } else {
        item[field] = value;
      }

      updatedItems[idx] = item;
      return { ...prev, items: updatedItems };
    });
  };

  const handleAddInboundItem = () => {
    setEditInboundForm((prev) => {
      if (!prev) return prev;
      const defaultProd = state.products?.[0];
      const newItem = {
        tempId: `inb-new-${Date.now()}-${Math.random()}`,
        productId: defaultProd?.id || '',
        barcode: defaultProd?.barcode || defaultProd?.id || '',
        name: defaultProd?.name || '',
        category: defaultProd?.category || 'sealer',
        location: 'โกดังใหญ่',
        quantity: 1,
        unit: defaultProd?.unit || 'เครื่อง',
        costPrice: Number(defaultProd?.costPrice ?? defaultProd?.cost ?? 0),
        totalCost: Number(defaultProd?.costPrice ?? defaultProd?.cost ?? 0),
        serialNo: '',
        note: '',
        origProductId: null,
        origLocation: null,
        origQuantity: 0,
      };
      return { ...prev, items: [...prev.items, newItem] };
    });
  };

  const handleDeleteInboundItem = (idx) => {
    setEditInboundForm((prev) => {
      if (!prev || prev.items.length <= 1) return prev;
      return { ...prev, items: prev.items.filter((_, i) => i !== idx) };
    });
  };

  const handleSaveEditInbound = async (e) => {
    e.preventDefault();
    if (!editInboundForm || !editingInbound || isSavingInboundEdit) return;

    const invalidItem = editInboundForm.items.find(
      (it) => !String(it.name || '').trim() || Number(it.quantity || 0) <= 0
    );
    if (invalidItem) {
      Swal.fire({
        icon: 'warning',
        title: 'ข้อมูลไม่ครบถ้วน',
        text: 'กรุณากรอกชื่อเครื่องจักรและจำนวนรับเข้า (มากกว่า 0) ให้ครบทุกรายการ',
        confirmButtonColor: '#f59e0b',
        background: '#1a1b26',
        color: '#f3f4f6',
      });
      return;
    }

    setIsSavingInboundEdit(true);

    try {
      // 1. Automatic inventory stock adjustment
      const originalItems = editingInbound.items || [];
      const currentItems = editInboundForm.items || [];

      // Check items removed from voucher -> deduct stock
      for (const orig of originalItems) {
        const stillExists = currentItems.some(
          (curr) => (curr.origProductId && curr.origProductId === orig.productId) ||
                    (curr.productId && curr.productId === orig.productId)
        );
        if (!stillExists) {
          await dispatch({
            type: 'SET_STOCK',
            payload: {
              id: orig.productId,
              delta: -Number(orig.quantity || 0),
              location: orig.location || 'โกดังใหญ่',
            },
          });
        }
      }

      // Check updated and newly added items
      for (const curr of currentItems) {
        const prodId = curr.productId || curr.barcode;
        const newQty = Number(curr.quantity || 0);
        const newLoc = curr.location || 'โกดังใหญ่';

        if (curr.origProductId) {
          const oldQty = Number(curr.origQuantity || 0);
          const oldLoc = curr.origLocation || 'โกดังใหญ่';

          if (oldLoc === newLoc) {
            const delta = newQty - oldQty;
            if (delta !== 0) {
              await dispatch({
                type: 'SET_STOCK',
                payload: {
                  id: prodId,
                  delta,
                  location: newLoc,
                  extraFields: Number(curr.costPrice) > 0 ? { cost_price: Number(curr.costPrice) } : {},
                },
              });
            }
          } else {
            // Location changed
            await dispatch({
              type: 'SET_STOCK',
              payload: {
                id: prodId,
                delta: -oldQty,
                location: oldLoc,
              },
            });
            await dispatch({
              type: 'SET_STOCK',
              payload: {
                id: prodId,
                delta: newQty,
                location: newLoc,
                extraFields: Number(curr.costPrice) > 0 ? { cost_price: Number(curr.costPrice) } : {},
              },
            });
          }
        } else {
          // Newly added item
          await dispatch({
            type: 'SET_STOCK',
            payload: {
              id: prodId,
              delta: newQty,
              location: newLoc,
              extraFields: Number(curr.costPrice) > 0 ? { cost_price: Number(curr.costPrice) } : {},
            },
          });
        }
      }

      // 2. Build updated voucher record
      const totalUnits = currentItems.reduce((s, it) => s + Number(it.quantity || 0), 0);
      const totalCostValue = currentItems.reduce((s, it) => s + (Number(it.quantity || 0) * Number(it.costPrice || 0)), 0);

      const updatedRecord = {
        ...editingInbound,
        id: editInboundForm.id,
        date: new Date(editInboundForm.date).toISOString(),
        displayDate: editInboundForm.date.replace('T', ' '),
        supplier: editInboundForm.supplier.trim() || 'โรงงานนำเข้า HUALIAN',
        refDocNo: editInboundForm.refDocNo.trim() || '-',
        receiver: editInboundForm.receiver.trim() || 'ผู้ดูแลระบบ',
        notes: editInboundForm.notes.trim(),
        totalItems: currentItems.length,
        totalUnits,
        totalCostValue,
        items: currentItems.map((it) => ({
          productId: it.productId,
          barcode: it.barcode || it.productId,
          name: it.name.trim(),
          category: it.category || 'sealer',
          unit: it.unit || 'เครื่อง',
          location: it.location,
          quantity: Number(it.quantity || 1),
          costPrice: Number(it.costPrice || 0),
          totalCost: Number(it.quantity || 1) * Number(it.costPrice || 0),
          serialNo: it.serialNo || '',
          note: it.note || '',
        })),
        updatedAt: new Date().toISOString(),
      };

      updateInboundRecord(updatedRecord);
      setInboundHistory(getInboundHistory());
      setEditingInbound(null);
      setEditInboundForm(null);

      Swal.fire({
        icon: 'success',
        title: 'บันทึกการแก้ไขเรียบร้อย!',
        text: `อัปเดตรายละเอียดใบรับเข้า ${updatedRecord.id} และปรับปรุงยอดสต๊อกเรียบร้อยแล้ว`,
        confirmButtonColor: '#10b981',
        confirmButtonText: 'ตกลง',
        background: '#1a1b26',
        color: '#f3f4f6',
      });
    } catch (err) {
      console.error('Error updating inbound record:', err);
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาดในการบันทึก',
        text: err.message || 'ไม่สามารถอัปเดตข้อมูลได้',
        confirmButtonColor: '#ef4444',
        background: '#1a1b26',
        color: '#f3f4f6',
      });
    } finally {
      setIsSavingInboundEdit(false);
    }
  };

  const handleDeleteInbound = async (record) => {
    if (!record) return;
    const { isConfirmed } = await Swal.fire({
      title: `ลบใบรับเข้า ${record.id}?`,
      html: `
        <div style="font-size: 13.5px; text-align: left; line-height: 1.6; color: #cbd5e1;">
          <p>คุณต้องการลบประวัติการรับเข้าเลขที่ <b>${record.id}</b> ใช่หรือไม่?</p>
          <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); padding: 10px; border-radius: 8px; color: #fca5a5; font-size: 12.5px;">
            ⚠️ <b>คำเตือน:</b> ระบบจะทำการหักสต๊อกสินค้าที่เคยรับเข้าในใบนี้ออก (${record.totalUnits} เครื่อง) จากคลังสินค้าโดยอัตโนมัติ
          </div>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ยืนยันลบและหักสต๊อก',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#4b5563',
      background: '#1a1b26',
      color: '#f3f4f6',
    });

    if (!isConfirmed) return;

    try {
      for (const it of record.items || []) {
        await dispatch({
          type: 'SET_STOCK',
          payload: {
            id: it.productId,
            delta: -Number(it.quantity || 0),
            location: it.location || 'โกดังใหญ่',
          },
        });
      }

      deleteInboundRecord(record.id);
      setInboundHistory(getInboundHistory());

      Swal.fire({
        icon: 'success',
        title: 'ลบใบรับเข้าเรียบร้อย',
        text: `ลบใบรับเข้า ${record.id} และหักสต๊อกสินค้าเรียบร้อยแล้ว`,
        confirmButtonColor: '#10b981',
        background: '#1a1b26',
        color: '#f3f4f6',
      });
    } catch (err) {
      console.error('Error deleting inbound record:', err);
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: err.message || 'ไม่สามารถลบข้อมูลได้',
        confirmButtonColor: '#ef4444',
        background: '#1a1b26',
        color: '#f3f4f6',
      });
    }
  };

  return (
    <div className="page-container">
      {/* ── Main Report Switcher Tabs ── */}
      <div className="report-tabs-bar">
        <button
          type="button"
          className={`report-tab-btn ${activeReportTab === 'sales' ? 'active' : ''}`}
          onClick={() => setActiveReportTab('sales')}
        >
          📊 รายงานการขาย
        </button>
        <button
          type="button"
          className={`report-tab-btn ${activeReportTab === 'inbound' ? 'active' : ''}`}
          onClick={() => setActiveReportTab('inbound')}
        >
          📥 รายงานการรับเข้าเครื่อง <span className="report-tab-badge">{inboundHistory.length}</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* ── TAB 1: รายงานการขาย (SALES & PROFIT/LOSS REPORT) ── */}
      {/* ======================================================== */}
      {activeReportTab === 'sales' && (
        <>
          {/* Header */}
          <div className="page-header flex justify-between items-center" style={{ marginBottom: 'var(--space-lg)', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h1 className="page-title">📊 รายงาน</h1>
              <p className="page-subtitle">วิเคราะห์รายได้ ต้นทุน และกำไรจากการขายเครื่องซีลและอะไหล่ HUALIAN</p>
            </div>
            
            <div className="flex items-center gap-md flex-wrap">
              {/* Export Buttons */}
              <div className="flex gap-xs">
                <button className="btn btn-secondary" onClick={exportToExcel} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '40px', padding: '0 16px', background: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)', color: '#10b981' }}>
                  📥 ส่งออก Excel
                </button>
                <button className="btn btn-secondary" onClick={exportToPDF} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '40px', padding: '0 16px', background: 'rgba(99, 102, 241, 0.15)', borderColor: 'rgba(99, 102, 241, 0.3)', color: '#a5b4fc' }}>
                  📄 ส่งออก PDF
                </button>
              </div>

              {/* Filters */}
              <div className="date-filters flex items-center gap-sm" style={{ margin: 0 }}>
                <button className={filterType === 'today' ? 'active' : ''} onClick={() => setFilterType('today')}>วันนี้</button>
                <button className={filterType === '7days' ? 'active' : ''} onClick={() => setFilterType('7days')}>7 วันที่ผ่านมา</button>
                <button className={filterType === '30days' ? 'active' : ''} onClick={() => setFilterType('30days')}>30 วันที่ผ่านมา</button>
                <button className={filterType === 'custom' ? 'active' : ''} onClick={() => setFilterType('custom')}>กำหนดเอง</button>
              </div>
            </div>
          </div>

          {/* Custom Date Form */}
          {filterType === 'custom' && (
            <div className="card" style={{ marginBottom: 'var(--space-md)', padding: 'var(--space-sm)' }}>
              <div className="flex gap-md items-center justify-start flex-wrap">
                <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                  <label style={{ whiteSpace: 'nowrap' }}>เริ่มวันที่:</label>
                  <input
                    type="date"
                    className="input"
                    value={customDates.start}
                    onChange={(e) => setCustomDates({ ...customDates, start: e.target.value })}
                  />
                </div>
                <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                  <label style={{ whiteSpace: 'nowrap' }}>ถึงวันที่:</label>
                  <input
                    type="date"
                    className="input"
                    value={customDates.end}
                    onChange={(e) => setCustomDates({ ...customDates, end: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* KPI Stats */}
          <div className="kpi-grid">
            <div className="card kpi-card profit-card-sales">
              <div className="kpi-icon">💰</div>
              <div className="kpi-value">฿{revenue.toLocaleString()}</div>
              <div className="kpi-label">ยอดขายรวม (Revenue)</div>
            </div>
            <div className="card kpi-card profit-card-cost">
              <div className="kpi-icon">🧱</div>
              <div className="kpi-value">฿{cost.toLocaleString()}</div>
              <div className="kpi-label">ต้นทุนสินค้า (COGS)</div>
            </div>
            <div className={`card kpi-card profit-card-net ${profit >= 0 ? 'net-positive' : 'net-negative'}`}>
              <div className="kpi-icon">{profit >= 0 ? '📈' : '📉'}</div>
              <div className="kpi-value">฿{profit.toLocaleString()}</div>
              <div className="kpi-label">กำไรขั้นต้น (Gross Profit)</div>
            </div>
            <div className="card kpi-card profit-card-margin">
              <div className="kpi-icon">⚖️</div>
              <div className="kpi-value">{profitMargin}%</div>
              <div className="kpi-label">อัตรากำไร (Profit Margin)</div>
            </div>
          </div>

          {/* Chart Section */}
          <div className="card" style={{ marginTop: 'var(--space-md)' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: 'var(--space-md)' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>
                📊 แผนภูมิวิเคราะห์ยอดขาย ต้นทุน และกำไร
              </h3>
            </div>
            <div style={{ width: '100%', height: 350 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                  <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} tickLine={false} />
                  <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} tickFormatter={(val) => `฿${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`} />
                  <Tooltip content={<ProfitTooltip />} />
                  <Legend />
                  <Bar dataKey="revenue" name="ยอดขาย" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cost" name="ต้นทุน" fill="#f97316" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="profit" name="กำไรสุทธิ" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Sales Transactions Table */}
          <div className="card" style={{ marginTop: 'var(--space-md)' }}>
            <div className="flex justify-between items-center flex-wrap gap-md" style={{ marginBottom: 'var(--space-md)' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>
                  🧾 บันทึกกำไร-ขาดทุนรายธุรกรรม
                </h3>
              </div>
              <div style={{ position: 'relative', width: '300px', maxWidth: '100%' }}>
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>🔍</span>
                <input
                  type="text"
                  placeholder="ค้นหาเลขที่บิล / ลูกค้า / รายการเครื่อง / คนขาย..."
                  className="input"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{ paddingLeft: '32px', height: '36px', fontSize: '13px' }}
                />
              </div>
            </div>

            <div className="profit-table-wrapper">
              <table className="profit-table">
                <thead>
                  <tr>
                    <th style={{ width: '125px' }}>เลขที่บิล</th>
                    <th style={{ width: '125px' }}>วันที่ - เวลา</th>
                    <th style={{ minWidth: '150px' }}>ข้อมูลลูกค้า</th>
                    <th style={{ minWidth: '220px' }}>รายการเครื่อง / สินค้า</th>
                    <th style={{ width: '90px', textAlign: 'center' }}>คนขาย</th>
                    <th style={{ textAlign: 'right', width: '115px' }}>ยอดขาย (฿)</th>
                    <th style={{ textAlign: 'right', width: '115px' }}>ต้นทุนสินค้า (฿)</th>
                    <th style={{ textAlign: 'right', width: '115px' }}>กำไรสุทธิ (฿)</th>
                    <th style={{ textAlign: 'center', width: '95px' }}>อัตรากำไร</th>
                    <th style={{ textAlign: 'center', width: '120px' }}>การจัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedSales.length > 0 ? (
                    paginatedSales.map((sale) => {
                      const profitInfo = getSaleProfitInfo(sale);
                      return (
                        <tr key={sale.id}>
                          <td className="font-bold" style={{ color: '#60a5fa', whiteSpace: 'nowrap' }}>
                            {sale.id}
                          </td>
                          <td style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: '13px' }}>
                            {formatDateTime(sale.date)}
                          </td>
                          <td>
                            {sale.customer ? (
                              <div className="flex flex-col" style={{ gap: '2px' }}>
                                <span className="font-medium" style={{ color: '#f8fafc', fontSize: '13px' }}>
                                  {sale.customer.name}
                                </span>
                                {sale.customer.phone && (
                                  <span className="text-xs text-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <span>📞</span> {sale.customer.phone}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-secondary" style={{ fontSize: '13px' }}>👤 ลูกค้าทั่วไป</span>
                            )}
                          </td>
                          <td>
                            {sale.items && sale.items.length > 0 ? (
                              <div className="profit-machine-list">
                                {sale.items.map((it, idx) => {
                                  const prodName = it.name || state.products.find((p) => p.id === (it.productId || it.id))?.name || it.productId || 'สินค้า';
                                  const qty = it.quantity || 1;
                                  return (
                                    <div key={idx} className="profit-machine-item">
                                      <span className="profit-machine-bullet">•</span>
                                      <span className="profit-machine-name" title={prodName}>
                                        {prodName}
                                      </span>
                                      <span className="profit-machine-qty">
                                        x{qty}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <span style={{ color: '#64748b', fontSize: '12px', fontStyle: 'italic' }}>- ไม่มีรายการ -</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="seller-badge">
                              {sale.employee || 'หน้าร้าน'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: '600', color: '#f8fafc' }}>
                            {sale.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                            {profitInfo.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold', color: profitInfo.profit >= 0 ? '#10b981' : '#ef4444' }}>
                            {profitInfo.profit >= 0 ? '+' : ''}
                            {profitInfo.profit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`badge ${profitInfo.profit >= 0 ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '11px', padding: '3px 8px' }}>
                              {profitInfo.margin}%
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', gap: '4px' }}>
                              <button
                                type="button"
                                className="rcm-btn-edit"
                                onClick={() => handleOpenEditSale(sale)}
                                title="แก้ไขข้อมูลและรายการใบเสร็จนี้"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', padding: '3px 7px' }}
                              >
                                ✏️ แก้ไข
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setSelectedSaleForReprint(sale)}
                                title="พิมพ์บิล / ใบเสร็จรับเงิน"
                                style={{
                                  padding: '3px 7px',
                                  fontSize: '11px',
                                  height: 'auto',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  background: 'rgba(59, 130, 246, 0.15)',
                                  borderColor: 'rgba(59, 130, 246, 0.3)',
                                  color: '#60a5fa',
                                  borderRadius: '6px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                🖨️
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="10" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
                        <div className="empty-state">
                          <span className="empty-state-icon">🧾</span>
                          <p className="empty-state-title">ไม่มีบันทึกธุรกรรม</p>
                          <p className="empty-state-text">
                            {searchQuery ? 'ไม่พบข้อมูลที่ตรงกับคำค้นหา' : 'ยังไม่มีประวัติการขายสินค้าในช่วงเวลาที่เลือก'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex justify-between items-center" style={{ padding: 'var(--space-md) var(--space-lg)', borderTop: '1px solid rgba(255,255,255,0.05)', gap: '16px', background: 'rgba(0,0,0,0.1)' }}>
                <span className="text-sm text-secondary" style={{ color: '#94a3b8' }}>
                  แสดง {Math.min(searchedSales.length, (activePage - 1) * itemsPerPage + 1)} - {Math.min(searchedSales.length, activePage * itemsPerPage)} จากทั้งหมด {searchedSales.length} รายการ
                </span>
                <div className="flex gap-xs">
                  <button
                    className="btn btn-secondary"
                    disabled={activePage === 1}
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    style={{ height: '32px', padding: '0 12px', fontSize: '12.5px', background: activePage === 1 ? 'transparent' : 'rgba(255,255,255,0.05)' }}
                  >
                    ย้อนกลับ
                  </button>
                  <button
                    className="btn btn-secondary"
                    disabled={activePage === totalPages}
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    style={{ height: '32px', padding: '0 12px', fontSize: '12.5px', background: activePage === totalPages ? 'transparent' : 'rgba(255,255,255,0.05)' }}
                  >
                    ถัดไป
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ======================================================== */}
      {/* ── TAB 2: รายงานการรับเข้าเครื่อง (MACHINE INBOUND REPORT) ── */}
      {/* ======================================================== */}
      {activeReportTab === 'inbound' && (
        <>
          {/* Inbound Header */}
          <div className="page-header flex justify-between items-center" style={{ marginBottom: 'var(--space-lg)', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h2 className="page-title" style={{ fontSize: '22px' }}>📥 รายงานการรับเข้าเครื่องจักร</h2>
              <p className="page-subtitle">ตรวจสอบประวัติการรับเข้าเครื่องจักร ตรวจสอบจำนวน ต้นทุน คลังจัดเก็บ และแก้ไขรายละเอียดการรับเข้า</p>
            </div>

            <div className="flex items-center gap-md flex-wrap">
              <div className="flex gap-xs">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={exportInboundExcel}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '40px', padding: '0 16px', background: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)', color: '#10b981' }}
                >
                  📥 ส่งออก Excel
                </button>
              </div>

              {/* Warehouse Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>คลัง:</span>
                <select
                  value={inboundLocationFilter}
                  onChange={(e) => {
                    setInboundLocationFilter(e.target.value);
                    setInboundCurrentPage(1);
                  }}
                  style={{
                    background: '#161824',
                    border: '1px solid #282c3f',
                    color: '#f8fafc',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  <option value="all">🏢 คลังทั้งหมด</option>
                  <option value="โกดังใหญ่">📦 โกดังใหญ่</option>
                  <option value="โกดังกุ๊กไก่">🏭 โกดังกุ๊กไก่</option>
                  <option value="ออฟฟิศ">🏬 ออฟฟิศ</option>
                </select>
              </div>

              {/* Inbound Date Filters */}
              <div className="date-filters flex items-center gap-sm" style={{ margin: 0 }}>
                <button className={inboundPeriod === 'today' ? 'active' : ''} onClick={() => { setInboundPeriod('today'); setInboundCurrentPage(1); }}>วันนี้</button>
                <button className={inboundPeriod === '7days' ? 'active' : ''} onClick={() => { setInboundPeriod('7days'); setInboundCurrentPage(1); }}>7 วันที่ผ่านมา</button>
                <button className={inboundPeriod === '30days' ? 'active' : ''} onClick={() => { setInboundPeriod('30days'); setInboundCurrentPage(1); }}>30 วันที่ผ่านมา</button>
                <button className={inboundPeriod === 'all' ? 'active' : ''} onClick={() => { setInboundPeriod('all'); setInboundCurrentPage(1); }}>ทั้งหมด</button>
                <button className={inboundPeriod === 'custom' ? 'active' : ''} onClick={() => { setInboundPeriod('custom'); setInboundCurrentPage(1); }}>กำหนดเอง</button>
              </div>
            </div>
          </div>

          {/* Custom Date Form for Inbound */}
          {inboundPeriod === 'custom' && (
            <div className="card" style={{ marginBottom: 'var(--space-md)', padding: 'var(--space-sm)' }}>
              <div className="flex gap-md items-center justify-start flex-wrap">
                <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                  <label style={{ whiteSpace: 'nowrap' }}>เริ่มวันที่:</label>
                  <input
                    type="date"
                    className="input"
                    value={inboundCustomDates.start}
                    onChange={(e) => {
                      setInboundCustomDates({ ...inboundCustomDates, start: e.target.value });
                      setInboundCurrentPage(1);
                    }}
                  />
                </div>
                <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                  <label style={{ whiteSpace: 'nowrap' }}>ถึงวันที่:</label>
                  <input
                    type="date"
                    className="input"
                    value={inboundCustomDates.end}
                    onChange={(e) => {
                      setInboundCustomDates({ ...inboundCustomDates, end: e.target.value });
                      setInboundCurrentPage(1);
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Inbound KPI Grid */}
          <div className="kpi-grid">
            <div className="card kpi-card profit-card-sales">
              <div className="kpi-icon">🧾</div>
              <div className="kpi-value">{inboundStats.voucherCount.toLocaleString()} ใบ</div>
              <div className="kpi-label">จำนวนใบรับเข้า (Vouchers)</div>
            </div>
            <div className="card kpi-card profit-card-cost">
              <div className="kpi-icon">📦</div>
              <div className="kpi-value">{inboundStats.totalUnits.toLocaleString()} เครื่อง</div>
              <div className="kpi-label">จำนวนเครื่องรับเข้ารวม</div>
            </div>
            <div className="card kpi-card profit-card-net net-positive">
              <div className="kpi-icon">💵</div>
              <div className="kpi-value">฿{inboundStats.totalCost.toLocaleString()}</div>
              <div className="kpi-label">มูลค่ารับเข้ารวม (Total Cost)</div>
            </div>
            <div className="card kpi-card profit-card-margin">
              <div className="kpi-icon">🏢</div>
              <div className="kpi-value" style={{ fontSize: '14px', display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: '#60a5fa' }}>ใหญ่: {inboundStats.warehouseUnits['โกดังใหญ่']}</span>
                <span style={{ color: '#fbbf24' }}>กุ๊กไก่: {inboundStats.warehouseUnits['โกดังกุ๊กไก่']}</span>
                <span style={{ color: '#c084fc' }}>ออฟฟิศ: {inboundStats.warehouseUnits['ออฟฟิศ']}</span>
              </div>
              <div className="kpi-label">แยกตามคลังจัดเก็บ (เครื่อง)</div>
            </div>
          </div>

          {/* Inbound Records Table Card */}
          <div className="card" style={{ marginTop: 'var(--space-md)' }}>
            <div className="flex justify-between items-center flex-wrap gap-md" style={{ marginBottom: 'var(--space-md)' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📋 บันทึกประวัติการรับเข้าเครื่องจักร
                  <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: '400' }}>
                    ({filteredInboundRecords.length} รายการ)
                  </span>
                </h3>
              </div>

              {/* Inbound Search */}
              <div style={{ position: 'relative', width: '340px', maxWidth: '100%' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}>🔍</span>
                <input
                  type="text"
                  placeholder="ค้นหาเลขที่ใบรับ, ชื่อเครื่อง, รหัสบาร์โค้ด, ผู้จัดจำหน่าย..."
                  value={inboundSearch}
                  onChange={(e) => {
                    setInboundSearch(e.target.value);
                    setInboundCurrentPage(1);
                  }}
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
            </div>

            {filteredInboundRecords.length > 0 ? (
              <div className="profit-table-wrapper">
                <table className="profit-table">
                  <thead>
                    <tr>
                      <th style={{ width: '110px' }}>เลขที่ใบรับเข้า</th>
                      <th style={{ width: '130px' }}>วันที่ - เวลา</th>
                      <th style={{ width: '170px' }}>ผู้จัดจำหน่าย / PO</th>
                      <th>รายการเครื่องจักรที่รับเข้า</th>
                      <th style={{ width: '90px', textAlign: 'center' }}>รวมจำนวน</th>
                      <th style={{ width: '110px', textAlign: 'right' }}>มูลค่ารวม (฿)</th>
                      <th style={{ width: '100px', textAlign: 'center' }}>ผู้ตรวจรับ</th>
                      <th style={{ width: '150px', textAlign: 'center' }}>การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedInbounds.map((rec) => (
                      <tr key={rec.id}>
                        <td style={{ fontWeight: '700', color: '#38bdf8', fontFamily: 'monospace', fontSize: '13.5px' }}>
                          {rec.id}
                        </td>
                        <td style={{ fontSize: '12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                          {new Date(rec.date).toLocaleDateString('th-TH')} {new Date(rec.date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td>
                          <div style={{ fontWeight: '500', color: '#f1f5f9' }}>{rec.supplier || '—'}</div>
                          {rec.refDocNo && rec.refDocNo !== '-' && (
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>PO: {rec.refDocNo}</div>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12.5px' }}>
                            {(rec.items || []).map((it, idx) => (
                              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ color: '#10b981' }}>•</span>
                                <span style={{ color: '#e2e8f0', fontWeight: '500' }}>{it.name}</span>
                                <span style={{ color: '#38bdf8', fontSize: '11.5px', fontWeight: 'bold' }}>
                                  (+{it.quantity} {it.unit || 'เครื่อง'})
                                </span>
                                <span className={it.location === 'โกดังกุ๊กไก่' ? 'badge-loc-kookkai' : it.location === 'ออฟฟิศ' ? 'badge-loc-office' : 'badge-loc-big'}>
                                  {it.location || 'โกดังใหญ่'}
                                </span>
                                {it.serialNo && (
                                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>S/N: {it.serialNo}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: '700', color: '#10b981', fontSize: '14px' }}>
                          {rec.totalUnits} เครื่อง
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: '600', color: '#f1f5f9' }}>
                          ฿{Number(rec.totalCostValue || 0).toLocaleString()}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="seller-badge">{rec.receiver || '—'}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: '4px' }}>
                            <button
                              type="button"
                              className="rcm-btn-edit"
                              onClick={() => handleOpenEditInbound(rec)}
                              title="แก้ไขรายละเอียดใบรับเข้าสินค้านี้"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px' }}
                            >
                              ✏️ แก้ไข
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => printInboundVoucher(rec)}
                              title="พิมพ์ใบรับเข้าสินค้า (A4)"
                              style={{ padding: '4px 8px', fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              🖨️
                            </button>
                            <button
                              type="button"
                              className="rcm-btn-delete"
                              onClick={() => handleDeleteInbound(rec)}
                              title="ลบใบรับเข้านี้"
                              style={{ padding: '4px 8px', fontSize: '11.5px' }}
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                <span style={{ fontSize: '36px', display: 'block', marginBottom: '8px' }}>🧾</span>
                <p style={{ margin: 0, fontSize: '14px', color: '#cbd5e1' }}>ไม่พบประวัติการรับเข้าเครื่องตามเงื่อนไขที่เลือก</p>
                <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  สามารถบันทึกรับเครื่องเข้าคลังได้ที่เมนู <b style={{ color: '#38bdf8' }}>"สินค้า" &gt; "รับเครื่องเข้าคลัง"</b>
                </p>
              </div>
            )}

            {/* Inbound Pagination */}
            {totalInboundPages > 1 && (
              <div className="flex justify-between items-center" style={{ marginTop: 'var(--space-md)', padding: '0 4px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                  หน้า <b>{inboundCurrentPage}</b> จาก <b>{totalInboundPages}</b> (ทั้งหมด {filteredInboundRecords.length} ใบรับเข้า)
                </div>
                <div className="flex gap-xs">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={inboundCurrentPage === 1}
                    onClick={() => setInboundCurrentPage((p) => Math.max(1, p - 1))}
                    style={{ height: '32px', padding: '0 12px', fontSize: '12.5px' }}
                  >
                    ก่อนหน้า
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={inboundCurrentPage === totalInboundPages}
                    onClick={() => setInboundCurrentPage((p) => Math.min(totalInboundPages, p + 1))}
                    style={{ height: '32px', padding: '0 12px', fontSize: '12.5px' }}
                  >
                    ถัดไป
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* A4 Receipt Reprint Modal */}
      {selectedSaleForReprint && (
        <Receipt
          sale={selectedSaleForReprint}
          onClose={() => setSelectedSaleForReprint(null)}
        />
      )}

      {/* Edit Receipt Modal */}
      {editingSale && editForm && (
        <div className="rcm-edit-overlay" onClick={() => setEditingSale(null)}>
          <div className="rcm-edit-box" onClick={(e) => e.stopPropagation()}>
            <div className="rcm-modal-header">
              <div>
                <h3 className="rcm-modal-title">✏️ แก้ไขข้อมูลใบเสร็จ {editForm.id}</h3>
                <p className="rcm-modal-subtitle">* การแก้ไขนี้จะไม่มีผลต่อสต๊อกสินค้า (สต๊อกสินค้าคงเดิม)</p>
              </div>
              <button className="rcm-modal-close" onClick={() => setEditingSale(null)}>✕</button>
            </div>

            <form onSubmit={handleSaveEditSale} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div className="rcm-edit-body">
                <div className="rcm-form-row">
                  <div className="rcm-form-group">
                    <label>เลขที่บิล</label>
                    <input type="text" value={editForm.id} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
                  </div>
                  <div className="rcm-form-group">
                    <label>ผู้ขาย</label>
                    <select
                      value={editForm.employee}
                      onChange={(e) => setEditForm({ ...editForm, employee: e.target.value })}
                    >
                      {!['หน้าร้าน','สาขา','ออฟฟิศ','Shopee','Tiktok','เพจ','สายฝน(ฝน)','สุบิน(ต๋อง)','ชฎาพร(แก้ม)','โชคชัย(เอ็ก)','เกียรติชัย (พี่เกียรติ)','พรหมโชติ(แซมมี่)','เพอเฟ็ค'].includes(editForm.employee) && (
                        <option value={editForm.employee}>{editForm.employee}</option>
                      )}
                      <option value="หน้าร้าน">🏪 หน้าร้าน</option>
                      <option value="สาขา">🏢 สาขา</option>
                      <option value="ออฟฟิศ">🏢 ออฟฟิศ</option>
                      <option value="Shopee">🛍️ Shopee</option>
                      <option value="Tiktok">🎵 Tiktok</option>
                      <option value="เพจ">📱 เพจ</option>
                      <option value="สายฝน(ฝน)">👩 สายฝน</option>
                      <option value="สุบิน(ต๋อง)">👨 สุบิน</option>
                      <option value="ชฎาพร(แก้ม)">👩 ชฎาพร</option>
                      <option value="โชคชัย(เอ็ก)">👨 โชคชัย</option>
                      <option value="เกียรติชัย (พี่เกียรติ)">👨 เกียรติชัย</option>
                      <option value="พรหมโชติ(แซมมี่)">👩 พรหมโชติ</option>
                      <option value="เพอเฟ็ค">👤 เพอเฟ็ค</option>
                    </select>
                  </div>
                </div>

                <div className="rcm-form-row">
                  <div className="rcm-form-group">
                    <label>ชื่อลูกค้า / บริษัท</label>
                    <input
                      type="text"
                      value={editForm.customerName}
                      onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })}
                    />
                  </div>
                  <div className="rcm-form-group">
                    <label>เบอร์โทรศัพท์</label>
                    <input
                      type="text"
                      value={editForm.customerPhone}
                      onChange={(e) => setEditForm({ ...editForm, customerPhone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="rcm-form-group">
                  <label>ที่อยู่ลูกค้า</label>
                  <textarea
                    rows="2"
                    value={editForm.customerAddress}
                    onChange={(e) => setEditForm({ ...editForm, customerAddress: e.target.value })}
                  />
                </div>

                <div className="rcm-form-row">
                  <div className="rcm-form-group">
                    <label>เลขประจำตัวผู้เสียภาษี (Tax ID)</label>
                    <input
                      type="text"
                      value={editForm.customerTaxId}
                      onChange={(e) => setEditForm({ ...editForm, customerTaxId: e.target.value })}
                    />
                  </div>
                  <div className="rcm-form-group">
                    <label>วิธีชำระเงิน</label>
                    <select
                      value={editForm.paymentMethod}
                      onChange={(e) => setEditForm({ ...editForm, paymentMethod: e.target.value })}
                    >
                      <option value="cash">💵 เงินสด</option>
                      <option value="transfer">💳 เงินโอน</option>
                      <option value="qr">📱 สแกน QR Code</option>
                    </select>
                  </div>
                </div>

                {/* ── Items & Price List Section ── */}
                <div style={{ marginTop: '4px', borderTop: '1px solid #1e2235', paddingTop: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <label style={{ fontSize: '13.5px', fontWeight: '700', color: '#38bdf8' }}>
                      📦 รายการสินค้าในบิล ({editForm.items?.length || 0} รายการ)
                    </label>
                    <button
                      type="button"
                      onClick={handleAddItem}
                      style={{
                        background: 'rgba(56, 189, 248, 0.15)',
                        border: '1px solid #0284c7',
                        color: '#38bdf8',
                        borderRadius: '8px',
                        padding: '6px 14px',
                        fontSize: '12.5px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      ➕ เพิ่มรายการ
                    </button>
                  </div>

                  <div style={{ background: '#0d101e', borderRadius: '12px', border: '1px solid #1f253d', overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto', maxHeight: '240px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                        <thead>
                          <tr style={{ background: '#161a2e', color: '#94a3b8', borderBottom: '1px solid #232942', textAlign: 'left', position: 'sticky', top: 0, zIndex: 2 }}>
                            <th style={{ padding: '8px 10px', width: '38%' }}>ชื่อรายการ</th>
                            <th style={{ padding: '8px 8px', width: '16%' }}>หน่วย</th>
                            <th style={{ padding: '8px 8px', width: '13%', textAlign: 'center' }}>จำนวน</th>
                            <th style={{ padding: '8px 8px', width: '16%', textAlign: 'right' }}>ราคา/หน่วย (฿)</th>
                            <th style={{ padding: '8px 8px', width: '17%', textAlign: 'right' }}>รวม (฿)</th>
                            <th style={{ padding: '8px 6px', width: '32px', textAlign: 'center' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {editForm.items?.map((item, idx) => (
                            <tr key={item.tempId || idx} style={{ borderBottom: '1px solid #181d33' }}>
                              <td style={{ padding: '6px 8px' }}>
                                <input
                                  type="text"
                                  value={item.name}
                                  onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                                  placeholder="ชื่อรายการสินค้า"
                                  style={{
                                    width: '100%',
                                    background: '#15192c',
                                    border: '1px solid #2a314d',
                                    borderRadius: '6px',
                                    padding: '6px 8px',
                                    color: '#f8fafc',
                                    fontSize: '12px',
                                  }}
                                />
                              </td>
                              <td style={{ padding: '6px 6px' }}>
                                <input
                                  type="text"
                                  list="pl-units-list"
                                  value={item.unit || DEFAULT_PART_UNIT}
                                  onChange={(e) => handleItemChange(idx, 'unit', e.target.value)}
                                  placeholder="หน่วย"
                                  style={{
                                    width: '100%',
                                    background: '#15192c',
                                    border: '1px solid #2a314d',
                                    borderRadius: '6px',
                                    padding: '6px 6px',
                                    color: '#f8fafc',
                                    fontSize: '12px',
                                    textAlign: 'center',
                                  }}
                                />
                              </td>
                              <td style={{ padding: '6px 6px' }}>
                                <input
                                  type="number"
                                  min="0.01"
                                  step="any"
                                  value={item.quantity}
                                  onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                                  style={{
                                    width: '100%',
                                    background: '#15192c',
                                    border: '1px solid #2a314d',
                                    borderRadius: '6px',
                                    padding: '6px 6px',
                                    color: '#f8fafc',
                                    fontSize: '12px',
                                    textAlign: 'center',
                                  }}
                                />
                              </td>
                              <td style={{ padding: '6px 6px' }}>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={item.sellPrice}
                                  onChange={(e) => handleItemChange(idx, 'sellPrice', e.target.value)}
                                  style={{
                                    width: '100%',
                                    background: '#15192c',
                                    border: '1px solid #2a314d',
                                    borderRadius: '6px',
                                    padding: '6px 6px',
                                    color: '#34d399',
                                    fontWeight: '600',
                                    fontSize: '12px',
                                    textAlign: 'right',
                                  }}
                                />
                              </td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '700', color: '#f8fafc', whiteSpace: 'nowrap' }}>
                                ฿{(Number(item.quantity || 0) * Number(item.sellPrice || 0)).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td style={{ padding: '6px 6px', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItem(idx)}
                                  disabled={editForm.items?.length <= 1}
                                  title={editForm.items?.length <= 1 ? "ต้องมีอย่างน้อย 1 รายการ" : "ลบรายการนี้"}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: editForm.items?.length <= 1 ? '#475569' : '#ef4444',
                                    cursor: editForm.items?.length <= 1 ? 'not-allowed' : 'pointer',
                                    fontSize: '15px',
                                    padding: '2px 4px',
                                  }}
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <datalist id="pl-units-list">
                    {PART_UNITS.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </div>

                <div className="rcm-form-row">
                  <div className="rcm-form-group">
                    <label>ค่าจัดส่ง (บาท)</label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.shippingCost}
                      onChange={(e) => handleShippingChange(e.target.value)}
                    />
                  </div>
                  <div className="rcm-form-group">
                    <label>ส่วนลด (บาท)</label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.discountAmount}
                      onChange={(e) => handleDiscountChange(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ background: '#0d101e', padding: '14px 18px', borderRadius: '12px', fontSize: '13px', color: '#94a3b8', border: '1px solid #1f253d' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span>ยอดรวมสินค้า (ก่อนหักส่วนลด):</span>
                    <span style={{ color: '#f8fafc', fontWeight: '600' }}>
                      ฿{(editForm.items || []).reduce((s, it) => s + (Number(it.sellPrice || 0) * Number(it.quantity || 0)), 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {Number(editForm.discountAmount || 0) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: '#f87171' }}>
                      <span>หักส่วนลด:</span>
                      <span>-฿{Number(editForm.discountAmount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {Number(editForm.shippingCost || 0) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: '#38bdf8' }}>
                      <span>ค่าจัดส่ง:</span>
                      <span>+฿{Number(editForm.shippingCost).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {editForm.applyVat && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span>ภาษี VAT (7%):</span>
                      <span style={{ color: '#f8fafc' }}>฿{Number(editForm.tax || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#10b981', fontSize: '16px', borderTop: '1px solid #1e293b', paddingTop: '8px', marginTop: '4px' }}>
                    <span>ยอดสุทธิรวม:</span>
                    <span>฿{Number(editForm.total || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              <div className="rcm-edit-footer">
                <button
                  type="button"
                  style={{ padding: '10px 18px', background: '#1e2235', border: '1px solid #2d334d', borderRadius: '10px', color: '#94a3b8', cursor: 'pointer', fontWeight: '600' }}
                  onClick={() => setEditingSale(null)}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: '10px', color: '#ffffff', cursor: 'pointer', fontWeight: '600', opacity: isSavingEdit ? 0.6 : 1 }}
                >
                  {isSavingEdit ? '⏳ กำลังบันทึก...' : '💾 บันทึกการแก้ไข'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Inbound Voucher Modal ("สามารถแก้ไขได้ทุกอย่างในรายละเอียด") ── */}
      {editingInbound && editInboundForm && (
        <div className="rcm-edit-overlay" onClick={() => setEditingInbound(null)}>
          <div className="rcm-edit-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '940px' }}>
            <div className="rcm-modal-header">
              <div>
                <h3 className="rcm-modal-title">✏️ แก้ไขใบรับเครื่องเข้าระบบ {editInboundForm.id}</h3>
                <p className="rcm-modal-subtitle">* แก้ไขรายละเอียดได้ทุกรายการ ระบบจะคำนวณส่วนต่างและอัปเดตสต๊อกสินค้าให้อัตโนมัติ</p>
              </div>
              <button className="rcm-modal-close" onClick={() => setEditingInbound(null)}>✕</button>
            </div>

            <form onSubmit={handleSaveEditInbound} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div className="rcm-edit-body">
                {/* Meta Row 1 */}
                <div className="rcm-form-row">
                  <div className="rcm-form-group">
                    <label>เลขที่ใบรับเข้า</label>
                    <input type="text" value={editInboundForm.id} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
                  </div>
                  <div className="rcm-form-group">
                    <label>วันที่ - เวลา รับเข้า *</label>
                    <input
                      type="datetime-local"
                      value={editInboundForm.date}
                      onChange={(e) => setEditInboundForm({ ...editInboundForm, date: e.target.value })}
                      required
                    />
                  </div>
                </div>

                {/* Meta Row 2 */}
                <div className="rcm-form-row">
                  <div className="rcm-form-group">
                    <label>ผู้จัดจำหน่าย / แหล่งที่มา</label>
                    <input
                      type="text"
                      value={editInboundForm.supplier}
                      onChange={(e) => setEditInboundForm({ ...editInboundForm, supplier: e.target.value })}
                      placeholder="เช่น โรงงานผู้ผลิต HUALIAN (จีน)"
                    />
                  </div>
                  <div className="rcm-form-group">
                    <label>เลขที่เอกสารอ้างอิง / PO / Lot</label>
                    <input
                      type="text"
                      value={editInboundForm.refDocNo}
                      onChange={(e) => setEditInboundForm({ ...editInboundForm, refDocNo: e.target.value })}
                      placeholder="เช่น PO-2026-001"
                    />
                  </div>
                </div>

                {/* Meta Row 3 */}
                <div className="rcm-form-row">
                  <div className="rcm-form-group">
                    <label>ผู้ตรวจรับสินค้า</label>
                    <input
                      type="text"
                      value={editInboundForm.receiver}
                      onChange={(e) => setEditInboundForm({ ...editInboundForm, receiver: e.target.value })}
                      placeholder="เช่น ผู้ดูแลระบบ / ชื่อพนักงาน"
                    />
                  </div>
                  <div className="rcm-form-group">
                    <label>หมายเหตุใบรับเข้า</label>
                    <input
                      type="text"
                      value={editInboundForm.notes}
                      onChange={(e) => setEditInboundForm({ ...editInboundForm, notes: e.target.value })}
                      placeholder="หมายเหตุเพิ่มเติม..."
                    />
                  </div>
                </div>

                {/* ── Editable Machine Items Table ── */}
                <div style={{ marginTop: '8px', borderTop: '1px solid #1e2235', paddingTop: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <label style={{ fontSize: '13.5px', fontWeight: '700', color: '#38bdf8' }}>
                      📦 รายการเครื่องจักรในใบรับเข้า ({editInboundForm.items?.length || 0} รายการ)
                    </label>
                    <button
                      type="button"
                      onClick={handleAddInboundItem}
                      style={{
                        background: 'rgba(56, 189, 248, 0.15)',
                        border: '1px solid #0284c7',
                        color: '#38bdf8',
                        borderRadius: '8px',
                        padding: '6px 14px',
                        fontSize: '12.5px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      ➕ เพิ่มรายการเครื่อง
                    </button>
                  </div>

                  <div style={{ background: '#0d101e', borderRadius: '12px', border: '1px solid #1f253d', overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto', maxHeight: '280px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: '#161a2e', color: '#94a3b8', borderBottom: '1px solid #232942', textAlign: 'left', position: 'sticky', top: 0, zIndex: 2 }}>
                            <th style={{ padding: '8px 10px', width: '32%' }}>เครื่องจักร / สินค้า</th>
                            <th style={{ padding: '8px 6px', width: '14%' }}>คลังจัดเก็บ</th>
                            <th style={{ padding: '8px 6px', width: '10%', textAlign: 'center' }}>จำนวน</th>
                            <th style={{ padding: '8px 6px', width: '11%' }}>หน่วย</th>
                            <th style={{ padding: '8px 6px', width: '14%', textAlign: 'right' }}>ราคาทุน (฿)</th>
                            <th style={{ padding: '8px 8px', width: '15%', textAlign: 'right' }}>รวมมูลค่า (฿)</th>
                            <th style={{ padding: '8px 4px', width: '28px', textAlign: 'center' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {editInboundForm.items?.map((it, idx) => (
                            <tr key={it.tempId || idx} style={{ borderBottom: '1px solid #181d33' }}>
                              <td style={{ padding: '6px 8px' }}>
                                <input
                                  type="text"
                                  value={it.name}
                                  onChange={(e) => handleInboundItemChange(idx, 'name', e.target.value)}
                                  placeholder="ชื่อเครื่องจักร"
                                  list="inbound-product-catalog"
                                  style={{
                                    width: '100%',
                                    background: '#15192c',
                                    border: '1px solid #2a314d',
                                    borderRadius: '6px',
                                    padding: '6px 8px',
                                    color: '#f8fafc',
                                    fontSize: '12px',
                                  }}
                                />
                                <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                  <input
                                    type="text"
                                    value={it.barcode || it.productId}
                                    onChange={(e) => handleInboundItemChange(idx, 'barcode', e.target.value)}
                                    placeholder="รหัส/บาร์โค้ด"
                                    style={{
                                      width: '50%',
                                      background: '#0e1122',
                                      border: '1px solid #1f253d',
                                      borderRadius: '4px',
                                      padding: '3px 6px',
                                      color: '#94a3b8',
                                      fontSize: '11px',
                                    }}
                                  />
                                  <input
                                    type="text"
                                    value={it.serialNo}
                                    onChange={(e) => handleInboundItemChange(idx, 'serialNo', e.target.value)}
                                    placeholder="Serial No (ถ้ามี)"
                                    style={{
                                      width: '50%',
                                      background: '#0e1122',
                                      border: '1px solid #1f253d',
                                      borderRadius: '4px',
                                      padding: '3px 6px',
                                      color: '#94a3b8',
                                      fontSize: '11px',
                                    }}
                                  />
                                </div>
                              </td>
                              <td style={{ padding: '6px 6px' }}>
                                <select
                                  value={it.location}
                                  onChange={(e) => handleInboundItemChange(idx, 'location', e.target.value)}
                                  style={{
                                    width: '100%',
                                    background: '#15192c',
                                    border: '1px solid #2a314d',
                                    borderRadius: '6px',
                                    padding: '6px 6px',
                                    color: '#f8fafc',
                                    fontSize: '11.5px',
                                  }}
                                >
                                  <option value="โกดังใหญ่">โกดังใหญ่</option>
                                  <option value="โกดังกุ๊กไก่">โกดังกุ๊กไก่</option>
                                  <option value="ออฟฟิศ">ออฟฟิศ</option>
                                </select>
                              </td>
                              <td style={{ padding: '6px 6px' }}>
                                <input
                                  type="number"
                                  min="0.01"
                                  step="any"
                                  value={it.quantity}
                                  onChange={(e) => handleInboundItemChange(idx, 'quantity', e.target.value)}
                                  style={{
                                    width: '100%',
                                    background: '#15192c',
                                    border: '1px solid #2a314d',
                                    borderRadius: '6px',
                                    padding: '6px 6px',
                                    color: '#10b981',
                                    fontWeight: '700',
                                    fontSize: '12px',
                                    textAlign: 'center',
                                  }}
                                />
                              </td>
                              <td style={{ padding: '6px 6px' }}>
                                <input
                                  type="text"
                                  value={it.unit || 'เครื่อง'}
                                  onChange={(e) => handleInboundItemChange(idx, 'unit', e.target.value)}
                                  list="inbound-units-list"
                                  style={{
                                    width: '100%',
                                    background: '#15192c',
                                    border: '1px solid #2a314d',
                                    borderRadius: '6px',
                                    padding: '6px 6px',
                                    color: '#f8fafc',
                                    fontSize: '11.5px',
                                    textAlign: 'center',
                                  }}
                                />
                              </td>
                              <td style={{ padding: '6px 6px' }}>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={it.costPrice}
                                  onChange={(e) => handleInboundItemChange(idx, 'costPrice', e.target.value)}
                                  style={{
                                    width: '100%',
                                    background: '#15192c',
                                    border: '1px solid #2a314d',
                                    borderRadius: '6px',
                                    padding: '6px 6px',
                                    color: '#f8fafc',
                                    fontSize: '12px',
                                    textAlign: 'right',
                                  }}
                                />
                              </td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '700', color: '#38bdf8', whiteSpace: 'nowrap' }}>
                                ฿{(Number(it.quantity || 0) * Number(it.costPrice || 0)).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteInboundItem(idx)}
                                  disabled={editInboundForm.items?.length <= 1}
                                  title={editInboundForm.items?.length <= 1 ? "ต้องมีอย่างน้อย 1 รายการ" : "ลบรายการนี้"}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: editInboundForm.items?.length <= 1 ? '#475569' : '#ef4444',
                                    cursor: editInboundForm.items?.length <= 1 ? 'not-allowed' : 'pointer',
                                    fontSize: '14px',
                                    padding: '2px 4px',
                                  }}
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <datalist id="inbound-product-catalog">
                    {(state.products || []).map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.barcode || p.id} ({p.unit || 'เครื่อง'})
                      </option>
                    ))}
                  </datalist>
                  <datalist id="inbound-units-list">
                    <option value="เครื่อง" />
                    <option value="ชุด" />
                    <option value="ตัว" />
                    <option value="ชิ้น" />
                    <option value="กล่อง" />
                    <option value="ม้วน" />
                  </datalist>
                </div>

                {/* Inbound Edit Summary Box */}
                <div style={{ background: '#0d101e', padding: '14px 18px', borderRadius: '12px', fontSize: '13px', color: '#94a3b8', border: '1px solid #1f253d', marginTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span>รวมจำนวนรายการเครื่อง:</span>
                    <span style={{ color: '#f8fafc', fontWeight: '600' }}>
                      {editInboundForm.items?.length || 0} รายการ
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span>รวมจำนวนเครื่องทั้งสิ้น:</span>
                    <span style={{ color: '#10b981', fontWeight: '700', fontSize: '14.5px' }}>
                      {(editInboundForm.items || []).reduce((s, it) => s + Number(it.quantity || 0), 0).toLocaleString()} เครื่อง
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#38bdf8', fontSize: '15px', borderTop: '1px solid #1e293b', paddingTop: '8px', marginTop: '4px' }}>
                    <span>รวมมูลค่ารับเข้าทั้งสิ้น:</span>
                    <span>
                      ฿{(editInboundForm.items || []).reduce((s, it) => s + (Number(it.quantity || 0) * Number(it.costPrice || 0)), 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rcm-edit-footer">
                <button
                  type="button"
                  style={{ padding: '10px 18px', background: '#1e2235', border: '1px solid #2d334d', borderRadius: '10px', color: '#94a3b8', cursor: 'pointer', fontWeight: '600' }}
                  onClick={() => setEditingInbound(null)}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSavingInboundEdit}
                  style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: '10px', color: '#ffffff', cursor: 'pointer', fontWeight: '600', opacity: isSavingInboundEdit ? 0.6 : 1 }}
                >
                  {isSavingInboundEdit ? '⏳ กำลังบันทึก...' : '💾 บันทึกการแก้ไขและปรับปรุงสต๊อก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfitLoss;
