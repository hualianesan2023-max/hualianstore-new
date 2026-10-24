import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend
} from 'recharts';
import { useStore } from '../data/store';
import { supabase } from '../data/supabaseClient';
import Receipt from '../components/Receipt';
import { getPartImageUrl } from '../utils/localImageProvider';
import { showAlert } from '../utils/alerts';
import './PartsHistory.css';

// ── Thai Date & Currency Formatters ──
const formatCurrency = (val) => {
  return Number(val || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatThaiDateTime = (isoStr) => {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return String(isoStr);
  return d.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatThaiDateOnly = (isoStr) => {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return String(isoStr);
  return d.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

// ── Recharts Custom Tooltip for Daily/Monthly/Yearly Summary ──
const SummaryChartTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  const marginPercent = data.revenue > 0 ? ((data.profit / data.revenue) * 100).toFixed(1) : '0.0';

  return (
    <div
      style={{
        background: '#0f172a',
        border: '1.5px solid #3b82f6',
        borderRadius: '10px',
        padding: '12px 16px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.6)',
        color: '#f8fafc',
        fontSize: '13px',
        minWidth: '220px',
      }}
    >
      <div style={{ fontWeight: '700', fontSize: '13.5px', marginBottom: '8px', color: '#38bdf8', borderBottom: '1px solid #1e293b', paddingBottom: '4px' }}>
        📅 {data.label}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ color: '#94a3b8' }}>ยอดขายรวม:</span>
        <span style={{ color: '#60a5fa', fontWeight: '700' }}>฿{formatCurrency(data.revenue)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ color: '#94a3b8' }}>ต้นทุนรวม:</span>
        <span style={{ color: '#f97316', fontWeight: '600' }}>฿{formatCurrency(data.cost)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ color: '#94a3b8' }}>กำไรขั้นต้น:</span>
        <span style={{ color: '#34d399', fontWeight: '700' }}>฿{formatCurrency(data.profit)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', borderTop: '1px solid #1e293b', paddingTop: '4px' }}>
        <span style={{ color: '#94a3b8' }}>อัตรากำไร (Margin):</span>
        <span style={{ color: '#a78bfa', fontWeight: '600' }}>{marginPercent}%</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
        <span>ขายได้ {Number(data.unitsSold || 0).toLocaleString()} ชิ้น</span>
        <span>{data.invoiceCount || 0} บิล</span>
      </div>
    </div>
  );
};

const ITEMS_PER_PAGE = 15;

const PartsHistory = () => {
  const { state } = useStore();
  const [parts, setParts] = useState([]);
  const [dbSales, setDbSales] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Tab state: 'invoices' | 'movement' | 'summary' | 'reports'
  const [activeTab, setActiveTab] = useState('invoices');

  // Summary Tab State (สรุปยอดขาย รายวัน / รายเดือน / รายปี - เฉพาะค่าอะไหล่)
  const [summaryPeriod, setSummaryPeriod] = useState('daily'); // 'daily' | 'monthly' | 'yearly'
  const [summaryYearFilter, setSummaryYearFilter] = useState('all');
  const [summaryMonthFilter, setSummaryMonthFilter] = useState('all');

  // Selected part for Tab 2 (Movement history)
  const searchContainerRef = useRef(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedPartId, setSelectedPartId] = useState('');
  const [partSearchQuery, setPartSearchQuery] = useState('');

  // Click outside to close part suggestions dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all'); // all, today, 7days, thisMonth, custom
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [salespersonFilter, setSalespersonFilter] = useState('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Receipt modal state
  const [selectedSaleForReceipt, setSelectedSaleForReceipt] = useState(null);

  // ── Fetch Data from Supabase ──
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Parts
      const { data: partsData, error: partsErr } = await supabase
        .from('parts')
        .select('*')
        .order('part_code', { ascending: true });
      if (partsErr) throw partsErr;
      setParts(partsData || []);

      // 2. Fetch Sales from sales_part
      const { data: salesData, error: salesErr } = await supabase
        .from('sales_part')
        .select('*')
        .order('date', { ascending: false });
      if (salesErr) throw salesErr;

      // 3. Fetch Sale Items from sale_items_part
      const { data: itemsData, error: itemsErr } = await supabase
        .from('sale_items_part')
        .select('*');
      if (itemsErr) throw itemsErr;

      // Map sale items grouped by sale_id
      const itemsMap = (itemsData || []).reduce((acc, it) => {
        if (!acc[it.sale_id]) acc[it.sale_id] = [];
        acc[it.sale_id].push({
          id: it.product_id,
          productId: it.product_id,
          name: it.product_name,
          quantity: Number(it.quantity || 0),
          sellPrice: Number(it.sell_price || 0),
          costPrice: Number(it.cost_price || 0),
          selectedLocation: it.selected_location || '—',
        });
        return acc;
      }, {});

      // Construct sales array with attached items (100% parts sales only)
      const combinedSales = (salesData || []).map((s) => ({
        id: s.id,
        date: s.date,
        customer: {
          name: s.customer_name || 'ลูกค้าทั่วไป',
          phone: s.customer_phone || '-',
          address: s.customer_address || '-',
          taxId: s.customer_tax_id || '-',
        },
        employee: s.salesperson || 'หน้าร้าน',
        paymentMethod: s.payment_method || 'cash',
        discountCode: s.discount_code,
        discountAmount: Number(s.discount_amount || 0),
        subtotal: Number(s.subtotal || 0),
        tax: Number(s.tax || 0),
        shippingCost: Number(s.shipping_cost || 0),
        total: Number(s.total || 0),
        cashReceived: Number(s.cash_received || 0),
        change: Number(s.change || 0),
        applyVat: Boolean(s.apply_vat),
        isVatInclusive: Boolean(s.is_vat_inclusive),
        items: itemsMap[s.id] || [],
      }));

      const mergedList = combinedSales.sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      );

      setDbSales(mergedList);

      // Auto-select first part if none selected
      if (partsData && partsData.length > 0 && !selectedPartId) {
        setSelectedPartId(String(partsData[0].id));
      }
    } catch (err) {
      console.error('Error loading parts history:', err);
      if (err?.code !== 'PGRST205') {
        showAlert('ข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลประวัติการขายได้', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  }, [selectedPartId]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('parts_history_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sales_part' },
        () => {
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sale_items_part' },
        () => {
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parts' },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  // ── Identify Parts Sales (Exclusively Spare Parts) ──
  const partsCodeSet = useMemo(() => {
    const set = new Set();
    parts.forEach((p) => {
      if (p.part_code) set.add(p.part_code.toLowerCase().trim());
    });
    return set;
  }, [parts]);

  const partsIdSet = useMemo(() => {
    const set = new Set();
    parts.forEach((p) => {
      if (p.id) set.add(String(p.id).toLowerCase().trim());
    });
    return set;
  }, [parts]);

  const partsNameSet = useMemo(() => {
    const set = new Set();
    parts.forEach((p) => {
      if (p.name) set.add(p.name.toLowerCase().trim());
    });
    return set;
  }, [parts]);

  // Exact helper to verify if an item is a spare part (never a machine)
  const isPartItem = useCallback(
    (item) => {
      if (!item) return false;
      if (item.partId || item.isPart) return true;
      const code = String(item.productId || item.id || '').toLowerCase().trim();
      if (code && (partsCodeSet.has(code) || partsIdSet.has(code))) return true;
      const name = String(item.name || item.product_name || '').toLowerCase().trim();
      if (name && partsNameSet.has(name)) return true;
      return false;
    },
    [partsCodeSet, partsIdSet, partsNameSet]
  );

  // Helper to compute revenue, cost, units strictly for spare parts items
  const getPartsSaleMetrics = useCallback(
    (sale) => {
      let rev = 0;
      let cost = 0;
      let units = 0;
      const isPurePartsSale = Boolean(sale.id && sale.id.startsWith('IVS'));

      (sale.items || []).forEach((it) => {
        const isPart = isPurePartsSale || isPartItem(it);
        if (isPart) {
          const q = Number(it.quantity || 0);
          const sp = Number(it.sellPrice ?? it.sell_price ?? 0);
          const cp = Number(it.costPrice ?? it.cost_price ?? 0);
          rev += q * sp;
          cost += q * cp;
          units += q;
        }
      });

      const profit = Math.max(0, rev - cost);
      return { rev, cost, units, profit };
    },
    [isPartItem]
  );

  const allPartsSales = useMemo(() => {
    return dbSales.filter((sale) => {
      if (sale.id && sale.id.startsWith('IVS')) return true;
      if (Array.isArray(sale.items)) {
        return sale.items.some(isPartItem);
      }
      return false;
    });
  }, [dbSales, isPartItem]);

  // ── Date Filtering Helper ──
  const isDateInFilter = useCallback(
    (isoDate) => {
      if (dateFilter === 'all') return true;
      if (!isoDate) return false;
      const d = new Date(isoDate);
      const now = new Date();

      if (dateFilter === 'today') {
        return (
          d.getDate() === now.getDate() &&
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear()
        );
      }

      if (dateFilter === '7days') {
        const past7 = new Date();
        past7.setDate(now.getDate() - 7);
        return d >= past7 && d <= now;
      }

      if (dateFilter === 'thisMonth') {
        return (
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear()
        );
      }

      if (dateFilter === 'thisYear') {
        return d.getFullYear() === now.getFullYear();
      }

      if (dateFilter === 'custom') {
        if (customStart && d < new Date(customStart)) return false;
        if (customEnd) {
          const end = new Date(customEnd);
          end.setHours(23, 59, 59, 999);
          if (d > end) return false;
        }
        return true;
      }

      return true;
    },
    [dateFilter, customStart, customEnd]
  );

  // ── Filtered Invoices (Tab 1) ──
  const filteredInvoices = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return allPartsSales.filter((sale) => {
      if (!isDateInFilter(sale.date)) return false;

      if (salespersonFilter !== 'all') {
        const emp = (sale.employee || '').toLowerCase();
        if (emp !== salespersonFilter.toLowerCase()) return false;
      }

      if (!q) return true;

      const idMatch = (sale.id || '').toLowerCase().includes(q);
      const custMatch =
        (sale.customer?.name || '').toLowerCase().includes(q) ||
        (sale.customer?.phone || '').includes(q) ||
        (sale.customer?.address || '').toLowerCase().includes(q);
      const itemMatch = (sale.items || []).some((it) =>
        (it.name || '').toLowerCase().includes(q)
      );

      return idMatch || custMatch || itemMatch;
    });
  }, [allPartsSales, isDateInFilter, salespersonFilter, searchQuery]);

  // Pagination for Invoices
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, dateFilter, customStart, customEnd, salespersonFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / ITEMS_PER_PAGE));
  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredInvoices.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredInvoices, currentPage]);

  // ── Overall KPI Calculations (Strictly Spare Parts Only) ──
  const kpiStats = useMemo(() => {
    let totalRevenue = 0;
    let totalUnitsSold = 0;
    let totalCost = 0;
    let invoiceCount = 0;

    allPartsSales.forEach((sale) => {
      const { rev, cost, units } = getPartsSaleMetrics(sale);
      if (units > 0) {
        totalRevenue += rev;
        totalCost += cost;
        totalUnitsSold += units;
        invoiceCount += 1;
      }
    });

    const estimatedProfit = Math.max(0, totalRevenue - totalCost);
    const activePartsCount = parts.length;
    const totalInventoryValue = parts.reduce(
      (sum, p) => sum + Number(p.quantity || 0) * Number(p.cost_price || 0),
      0
    );

    return {
      totalRevenue,
      totalUnitsSold,
      invoiceCount,
      estimatedProfit,
      activePartsCount,
      totalInventoryValue,
    };
  }, [allPartsSales, parts, getPartsSaleMetrics]);

  // ── Available Years in Parts Sales ──
  const availableYears = useMemo(() => {
    const set = new Set();
    const curYear = new Date().getFullYear();
    set.add(curYear);
    allPartsSales.forEach((s) => {
      if (s.date) {
        const y = new Date(s.date).getFullYear();
        if (!isNaN(y)) set.add(y);
      }
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [allPartsSales]);

  // ── Filtered Parts Sales for Summary (Strictly Spare Parts Only) ──
  const summarySales = useMemo(() => {
    return allPartsSales.filter((sale) => {
      if (!sale.date) return false;
      const d = new Date(sale.date);
      if (isNaN(d.getTime())) return false;

      if (summaryYearFilter !== 'all') {
        if (d.getFullYear() !== Number(summaryYearFilter)) return false;
      }

      if (summaryPeriod === 'daily' && summaryMonthFilter !== 'all') {
        if (d.getMonth() + 1 !== Number(summaryMonthFilter)) return false;
      }

      return true;
    });
  }, [allPartsSales, summaryYearFilter, summaryPeriod, summaryMonthFilter]);

  // ── Daily Summary Data (Strictly Spare Parts Only) ──
  const dailySummaryData = useMemo(() => {
    const map = new Map();

    summarySales.forEach((sale) => {
      const d = new Date(sale.date);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${day}`;

      const { rev, cost, units, profit } = getPartsSaleMetrics(sale);
      if (units === 0 && rev === 0) return;

      if (!map.has(key)) {
        const thaiLabel = d.toLocaleDateString('th-TH', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
        const shortLabel = d.toLocaleDateString('th-TH', {
          day: 'numeric',
          month: 'short',
        });
        map.set(key, {
          key,
          rawDate: d,
          label: thaiLabel,
          shortLabel,
          invoiceCount: 0,
          unitsSold: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
        });
      }

      const entry = map.get(key);
      entry.invoiceCount += 1;
      entry.unitsSold += units;
      entry.revenue += rev;
      entry.cost += cost;
      entry.profit += profit;
    });

    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [summarySales, getPartsSaleMetrics]);

  // ── Monthly Summary Data (Strictly Spare Parts Only) ──
  const monthlySummaryData = useMemo(() => {
    const map = new Map();

    summarySales.forEach((sale) => {
      const d = new Date(sale.date);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const key = `${y}-${m}`;

      const { rev, cost, units, profit } = getPartsSaleMetrics(sale);
      if (units === 0 && rev === 0) return;

      if (!map.has(key)) {
        const thaiLabel = d.toLocaleDateString('th-TH', {
          month: 'long',
          year: 'numeric',
        });
        const shortLabel = d.toLocaleDateString('th-TH', {
          month: 'short',
          year: '2-digit',
        });
        map.set(key, {
          key,
          rawDate: d,
          label: thaiLabel,
          shortLabel,
          year: y,
          month: d.getMonth() + 1,
          invoiceCount: 0,
          unitsSold: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
        });
      }

      const entry = map.get(key);
      entry.invoiceCount += 1;
      entry.unitsSold += units;
      entry.revenue += rev;
      entry.cost += cost;
      entry.profit += profit;
    });

    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [summarySales, getPartsSaleMetrics]);

  // ── Yearly Summary Data (Strictly Spare Parts Only) ──
  const yearlySummaryData = useMemo(() => {
    const map = new Map();

    summarySales.forEach((sale) => {
      const d = new Date(sale.date);
      const y = d.getFullYear();
      const key = String(y);

      const { rev, cost, units, profit } = getPartsSaleMetrics(sale);
      if (units === 0 && rev === 0) return;

      if (!map.has(key)) {
        const thaiYear = y + 543;
        const thaiLabel = `ปี พ.ศ. ${thaiYear} (${y})`;
        const shortLabel = `พ.ศ. ${thaiYear}`;
        map.set(key, {
          key,
          rawDate: d,
          label: thaiLabel,
          shortLabel,
          year: y,
          invoiceCount: 0,
          unitsSold: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
        });
      }

      const entry = map.get(key);
      entry.invoiceCount += 1;
      entry.unitsSold += units;
      entry.revenue += rev;
      entry.cost += cost;
      entry.profit += profit;
    });

    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [summarySales, getPartsSaleMetrics]);

  // Active summary list based on period mode
  const activeSummaryList = useMemo(() => {
    if (summaryPeriod === 'daily') return dailySummaryData;
    if (summaryPeriod === 'monthly') return monthlySummaryData;
    return yearlySummaryData;
  }, [summaryPeriod, dailySummaryData, monthlySummaryData, yearlySummaryData]);

  // Summary Totals
  const summaryTotals = useMemo(() => {
    const totals = activeSummaryList.reduce(
      (acc, item) => {
        acc.invoiceCount += item.invoiceCount;
        acc.unitsSold += item.unitsSold;
        acc.revenue += item.revenue;
        acc.cost += item.cost;
        acc.profit += item.profit;
        return acc;
      },
      { invoiceCount: 0, unitsSold: 0, revenue: 0, cost: 0, profit: 0 }
    );
    const avgMargin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;
    const avgPerInvoice = totals.invoiceCount > 0 ? totals.revenue / totals.invoiceCount : 0;
    return { ...totals, avgMargin, avgPerInvoice };
  }, [activeSummaryList]);

  // Visual Chart Data (chronological order)
  const chartData = useMemo(() => {
    if (summaryPeriod === 'daily') {
      return [...dailySummaryData].slice(0, 30).reverse();
    }
    if (summaryPeriod === 'monthly') {
      return [...monthlySummaryData].slice(0, 12).reverse();
    }
    return [...yearlySummaryData].slice(0, 5).reverse();
  }, [summaryPeriod, dailySummaryData, monthlySummaryData, yearlySummaryData]);

  // Jump to Invoices Tab from Summary
  const handleViewDayInvoices = (dateKey) => {
    setDateFilter('custom');
    setCustomStart(dateKey);
    setCustomEnd(dateKey);
    setActiveTab('invoices');
  };

  const handleViewMonthInvoices = (year, month) => {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    setDateFilter('custom');
    setCustomStart(startDate);
    setCustomEnd(endDate);
    setActiveTab('invoices');
  };

  // Export Summary Table to CSV
  const handleExportSummaryCSV = () => {
    const periodLabel =
      summaryPeriod === 'daily'
        ? 'รายวัน'
        : summaryPeriod === 'monthly'
        ? 'รายเดือน'
        : 'รายปี';
    const periodHeader =
      summaryPeriod === 'daily'
        ? 'วันที่'
        : summaryPeriod === 'monthly'
        ? 'เดือน/ปี'
        : 'ปี พ.ศ.';

    const headers = [
      periodHeader,
      'จำนวนบิลขายอะไหล่ (บิล)',
      'จำนวนชิ้นอะไหล่ที่ขาย (ชิ้น)',
      'ยอดขายอะไหล่รวม (บาท)',
      'ต้นทุนอะไหล่รวม (บาท)',
      'กำไรขั้นต้นอะไหล่ (บาท)',
      'อัตรากำไร (%)',
      'ยอดเฉลี่ยต่อบิล (บาท)',
    ];

    const rows = activeSummaryList.map((row) => {
      const margin = row.revenue > 0 ? ((row.profit / row.revenue) * 100).toFixed(1) : '0.0';
      const avg = row.invoiceCount > 0 ? (row.revenue / row.invoiceCount).toFixed(2) : '0.00';
      return [
        row.label,
        row.invoiceCount,
        row.unitsSold,
        row.revenue.toFixed(2),
        row.cost.toFixed(2),
        row.profit.toFixed(2),
        `${margin}%`,
        avg,
      ];
    });

    // Summary total row
    rows.push([
      'รวมทั้งหมดเฉพาะค่าอะไหล่',
      summaryTotals.invoiceCount,
      summaryTotals.unitsSold,
      summaryTotals.revenue.toFixed(2),
      summaryTotals.cost.toFixed(2),
      summaryTotals.profit.toFixed(2),
      `${summaryTotals.avgMargin.toFixed(1)}%`,
      summaryTotals.avgPerInvoice.toFixed(2),
    ]);

    const csvContent =
      '\uFEFF' +
      [headers, ...rows]
        .map((e) => e.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `สรุปยอดขายอะไหล่_${periodLabel}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showAlert('สำเร็จ', `ส่งออกรายงานสรุปยอดขายอะไหล่${periodLabel}เรียบร้อยแล้ว`, 'success');
  };

  // ── Selected Part Data for Tab 2 (Movement History) ──
  const selectedPart = useMemo(() => {
    return parts.find((p) => String(p.id) === String(selectedPartId)) || parts[0] || null;
  }, [parts, selectedPartId]);

  // Filter all sales history specifically for the selected part
  const selectedPartMovement = useMemo(() => {
    if (!selectedPart) return [];
    const targetCode = String(selectedPart.part_code || '').toLowerCase().trim();
    const targetName = String(selectedPart.name || '').toLowerCase().trim();
    const targetId = selectedPart.id;

    const list = [];
    allPartsSales.forEach((sale) => {
      (sale.items || []).forEach((it) => {
        const itCode = String(it.productId || it.id || '').toLowerCase().trim();
        const itName = String(it.name || '').toLowerCase().trim();
        const isMatch =
          it.partId === targetId ||
          itCode === targetCode ||
          itName.includes(targetCode) ||
          (targetName && itName.includes(targetName));

        if (isMatch) {
          const qty = Number(it.quantity || 0);
          const sellPrice = Number(it.sellPrice || 0);
          const costPrice = Number(it.costPrice || selectedPart.cost_price || 0);
          const lineTotal = qty * sellPrice;
          const profit = lineTotal - qty * costPrice;

          list.push({
            saleId: sale.id,
            date: sale.date,
            customer: sale.customer || { name: 'ลูกค้าทั่วไป', phone: '-' },
            employee: sale.employee || 'หน้าร้าน',
            paymentMethod: sale.paymentMethod || 'cash',
            quantity: qty,
            sellPrice,
            costPrice,
            lineTotal,
            profit,
            location: it.selectedLocation || selectedPart.location || '—',
            fullSale: sale,
          });
        }
      });
    });

    return list.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [selectedPart, allPartsSales]);

  // Summaries for the selected part
  const selectedPartStats = useMemo(() => {
    const totalSold = selectedPartMovement.reduce((sum, m) => sum + m.quantity, 0);
    const totalRevenue = selectedPartMovement.reduce((sum, m) => sum + m.lineTotal, 0);
    const totalProfit = selectedPartMovement.reduce((sum, m) => sum + m.profit, 0);
    const orderCount = selectedPartMovement.length;
    return { totalSold, totalRevenue, totalProfit, orderCount };
  }, [selectedPartMovement]);

  // Search filtered parts list for the part picker (ค้นหาจาก ไอดี/รหัส และ ชื่อ)
  const filteredPartsForPicker = useMemo(() => {
    const q = partSearchQuery.toLowerCase().trim();
    if (!q) return [];
    return parts.filter((p) => {
      const code = String(p.part_code || '').toLowerCase();
      const name = String(p.name || '').toLowerCase();
      const id = String(p.id || '').toLowerCase();
      return code.includes(q) || name.includes(q) || id === q;
    });
  }, [parts, partSearchQuery]);

  const handleSelectPart = (p) => {
    if (!p) return;
    setSelectedPartId(String(p.id));
    setPartSearchQuery(p.part_code || '');
    setShowSuggestions(false);
  };

  const handlePartSearchChange = (val) => {
    setPartSearchQuery(val);
    setShowSuggestions(true);

    const q = val.trim().toLowerCase();
    if (q) {
      // Auto-select if exact code matches
      const exact = parts.find(
        (p) => String(p.part_code || '').trim().toLowerCase() === q
      );
      if (exact) {
        setSelectedPartId(String(exact.id));
      }
    }
  };

  // ── Top 10 Selling Spare Parts (Tab 4 - Strictly Spare Parts Only) ──
  const topSellingParts = useMemo(() => {
    const map = new Map();
    allPartsSales.forEach((sale) => {
      const isPurePartsSale = Boolean(sale.id && sale.id.startsWith('IVS'));
      (sale.items || []).forEach((it) => {
        const isPart = isPurePartsSale || isPartItem(it);
        if (!isPart) return; // Exclude non-part items (machines)

        const code = String(it.productId || it.id || '').trim();
        const name = it.name || code;
        const key = code || name;
        const qty = Number(it.quantity || 0);
        const revenue = qty * Number(it.sellPrice ?? it.sell_price ?? 0);
        const cost = qty * Number(it.costPrice ?? it.cost_price ?? 0);

        if (!map.has(key)) {
          const matchingPart = parts.find(
            (p) => p.part_code === code || p.name === name || (it.name && it.name.includes(p.part_code))
          );
          map.set(key, {
            code,
            name: matchingPart ? matchingPart.name : name,
            part: matchingPart,
            totalQuantity: 0,
            totalRevenue: 0,
            totalProfit: 0,
          });
        }

        const curr = map.get(key);
        curr.totalQuantity += qty;
        curr.totalRevenue += revenue;
        curr.totalProfit += revenue - cost;
      });
    });

    return Array.from(map.values())
      .filter((item) => Boolean(item.part))
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 10);
  }, [allPartsSales, parts, isPartItem]);

  // ── Low Stock Parts (Tab 3) ──
  const lowStockParts = useMemo(() => {
    return parts
      .filter((p) => Number(p.quantity || 0) <= 5)
      .sort((a, b) => Number(a.quantity || 0) - Number(b.quantity || 0));
  }, [parts]);

  // ── CSV Export Functionality ──
  const handleExportCSV = useCallback(() => {
    if (allPartsSales.length === 0) {
      showAlert('ไม่มีข้อมูล', 'ไม่มีประวัติการขายสำหรับส่งออกรายงาน', 'warning');
      return;
    }

    const headers = [
      'วันที่ขาย',
      'เลขที่บิล',
      'ชื่อลูกค้า',
      'เบอร์โทร',
      'ที่อยู่ลูกค้า',
      'รหัสอะไหล่',
      'ชื่ออะไหล่',
      'จำนวนที่ขาย',
      'ราคาขายต่อชิ้น',
      'ยอดรวม (บาท)',
      'ต้นทุน (บาท)',
      'กำไร (บาท)',
      'พนักงานขาย',
      'วิธีชำระเงิน',
    ];

    const rows = [];
    allPartsSales.forEach((sale) => {
      const isPurePartsSale = Boolean(sale.id && sale.id.startsWith('IVS'));
      (sale.items || []).forEach((it) => {
        const isPart = isPurePartsSale || isPartItem(it);
        if (!isPart) return;

        const qty = Number(it.quantity || 0);
        const sellPrice = Number(it.sellPrice ?? it.sell_price ?? 0);
        const costPrice = Number(it.costPrice ?? it.cost_price ?? 0);
        const lineTotal = qty * sellPrice;
        const profit = lineTotal - qty * costPrice;

        rows.push([
          formatThaiDateTime(sale.date),
          sale.id || '—',
          `"${(sale.customer?.name || 'ลูกค้าทั่วไป').replace(/"/g, '""')}"`,
          `"${(sale.customer?.phone || '-').replace(/"/g, '""')}"`,
          `"${(sale.customer?.address || '-').replace(/"/g, '""')}"`,
          `"${(it.productId || it.id || '-').replace(/"/g, '""')}"`,
          `"${(it.name || '-').replace(/"/g, '""')}"`,
          qty,
          sellPrice,
          lineTotal,
          costPrice,
          profit,
          `"${(sale.employee || 'หน้าร้าน').replace(/"/g, '""')}"`,
          sale.paymentMethod === 'cash' ? 'เงินสด' : 'โอนเงิน/QR',
        ]);
      });
    });

    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `รายงานประวัติการขายอะไหล่_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [allPartsSales]);

  return (
    <div className="ph-page">
      {/* ── Page Header ── */}
      <div className="ph-header">
        <div className="ph-header-left">
          <h1>
            <span>🔩</span> ประวัติการขายและรายงานอะไหล่
          </h1>
          <p>
            ตรวจสอบประวัติการขายอะไหล่ ตรวจสอบลูกค้า ไทม์ไลน์วันที่ขาย และวันที่รับเข้าสู่ระบบ
          </p>
        </div>
        <div className="ph-header-actions">
          <button
            type="button"
            className="ph-btn-export"
            onClick={handleExportCSV}
            title="ดาวน์โหลดรายงานเป็นไฟล์ Excel / CSV"
          >
            📥 ส่งออกรายงาน CSV
          </button>
          <button
            type="button"
            onClick={fetchData}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#cbd5e1',
              padding: '8px 12px',
              fontSize: '13px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            🔄 รีเฟรชข้อมูล
          </button>
        </div>
      </div>

      {/* ── KPI Stat Cards ── */}
      <div className="ph-stats-grid">
        <div className="ph-stat-card revenue">
          <div className="ph-stat-icon">💰</div>
          <div className="ph-stat-info">
            <span className="ph-stat-value">฿{formatCurrency(kpiStats.totalRevenue)}</span>
            <span className="ph-stat-label">ยอดขายอะไหล่รวม</span>
          </div>
        </div>

        <div className="ph-stat-card quantity">
          <div className="ph-stat-icon">📦</div>
          <div className="ph-stat-info">
            <span className="ph-stat-value">{kpiStats.totalUnitsSold.toLocaleString()} ชิ้น</span>
            <span className="ph-stat-label">จำนวนที่ขายได้ทั้งหมด</span>
          </div>
        </div>

        <div className="ph-stat-card invoices">
          <div className="ph-stat-icon">🧾</div>
          <div className="ph-stat-info">
            <span className="ph-stat-value">{kpiStats.invoiceCount} บิล</span>
            <span className="ph-stat-label">จำนวนบิลขายอะไหล่</span>
          </div>
        </div>

        <div className="ph-stat-card profit">
          <div className="ph-stat-icon">📈</div>
          <div className="ph-stat-info">
            <span className="ph-stat-value">฿{formatCurrency(kpiStats.estimatedProfit)}</span>
            <span className="ph-stat-label">กำไรขั้นต้นสะสม</span>
          </div>
        </div>

        <div className="ph-stat-card stock">
          <div className="ph-stat-icon">🔩</div>
          <div className="ph-stat-info">
            <span className="ph-stat-value">{kpiStats.activePartsCount} รายการ</span>
            <span className="ph-stat-label">อะไหล่ในระบบ (มูลค่า ฿{formatCurrency(kpiStats.totalInventoryValue)})</span>
          </div>
        </div>
      </div>

      {/* ── Tab Navigation ── */}
      <div className="ph-tabs">
        <button
          type="button"
          className={`ph-tab-btn ${activeTab === 'invoices' ? 'active' : ''}`}
          onClick={() => setActiveTab('invoices')}
        >
          🧾 บิลขายอะไหล่ทั้งหมด ({allPartsSales.length})
        </button>
        <button
          type="button"
          className={`ph-tab-btn ${activeTab === 'movement' ? 'active' : ''}`}
          onClick={() => setActiveTab('movement')}
        >
          🔍 ประวัติตามรายอะไหล่ (ตรวจวันขาย/รับเข้า)
        </button>
        <button
          type="button"
          className={`ph-tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          📅 สรุปยอดขาย (รายวัน/เดือน/ปี)
        </button>
        <button
          type="button"
          className={`ph-tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveTab('reports')}
        >
          🏆 อันดับขายดี & แจ้งเตือนสต็อก
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 1: ALL INVOICES (ขายไปให้ใคร, วันที่เท่าไร, ใบเสร็จ)
          ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'invoices' && (
        <>
          {/* Toolbar Filters */}
          <div className="ph-toolbar">
            <div className="ph-search-box">
              <span style={{ marginRight: '8px', opacity: 0.6 }}>🔍</span>
              <input
                type="text"
                placeholder="ค้นหาเลขบิล, ชื่อลูกค้า, เบอร์โทร, ชื่ออะไหล่..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                >
                  ✕
                </button>
              )}
            </div>

            <div className="ph-filter-group">
              {/* Date Filter */}
              <select
                className="ph-select"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              >
                <option value="all">📅 ช่วงเวลา: ทั้งหมด</option>
                <option value="today">วันนี้</option>
                <option value="7days">7 วันล่าสุด</option>
                <option value="thisMonth">เดือนนี้</option>
                <option value="thisYear">ปีนี้</option>
                <option value="custom">กำหนดช่วงวันที่เอง...</option>
              </select>

              {dateFilter === 'custom' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="date"
                    className="ph-date-input"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                  />
                  <span style={{ color: '#94a3b8' }}>-</span>
                  <input
                    type="date"
                    className="ph-date-input"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                  />
                </div>
              )}

              {/* Salesperson Filter */}
              <select
                className="ph-select"
                value={salespersonFilter}
                onChange={(e) => setSalespersonFilter(e.target.value)}
              >
                <option value="all">👤 พนักงาน: ทั้งหมด</option>
                <option value="หน้าร้าน">หน้าร้าน</option>
                <option value="เพจ">เพจ</option>
                <option value="แอดมิน">แอดมิน</option>
                <option value="ช่าง">ช่าง / บริการ</option>
                <option value="เซลส์">เซลส์</option>
              </select>
            </div>
          </div>

          {/* Invoices Table */}
          <div className="ph-table-container">
            {isLoading ? (
              <div className="ph-empty-state">
                <div className="ph-empty-icon">⏳</div>
                <div className="ph-empty-text">กำลังโหลดประวัติการขายอะไหล่...</div>
              </div>
            ) : paginatedInvoices.length > 0 ? (
              <table className="ph-table">
                <thead>
                  <tr>
                    <th>วันที่ / เวลา</th>
                    <th>เลขที่บิล</th>
                    <th>ขายให้ใคร (ข้อมูลลูกค้า)</th>
                    <th>รายการอะไหล่ในบิล</th>
                    <th>ผู้ขาย</th>
                    <th>ชำระเงิน</th>
                    <th style={{ textAlign: 'right' }}>ยอดสุทธิ</th>
                    <th style={{ textAlign: 'center' }}>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedInvoices.map((sale) => {
                    const isPurePartsSale = Boolean(sale.id && sale.id.startsWith('IVS'));
                    const partsOnlyItems = isPurePartsSale
                      ? (sale.items || [])
                      : (sale.items || []).filter(isPartItem);
                    const partsSaleMetrics = getPartsSaleMetrics(sale);

                    return (
                      <tr key={sale.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: '600' }}>{formatThaiDateOnly(sale.date)}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                            {new Date(sale.date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                          </div>
                        </td>

                        <td>
                          <span className="ph-badge sale-id">{sale.id}</span>
                        </td>

                        <td>
                          <div style={{ fontWeight: '600', color: '#f1f5f9' }}>
                            {sale.customer?.name || 'ลูกค้าทั่วไป'}
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>
                            {sale.customer?.phone && sale.customer.phone !== '-' && (
                              <span>📞 {sale.customer.phone} </span>
                            )}
                            {sale.customer?.address && sale.customer.address !== '-' && (
                              <span title={sale.customer.address}>📍 {sale.customer.address.slice(0, 32)}...</span>
                            )}
                          </div>
                        </td>

                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            {partsOnlyItems.map((it, idx) => (
                              <div key={idx} style={{ fontSize: '12px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <span style={{ color: '#38bdf8' }}>•</span>
                                <span style={{ color: '#cbd5e1' }}>{it.name}</span>
                                <span style={{ color: '#f59e0b', fontWeight: '600' }}>x{it.quantity}</span>
                                <span style={{ color: '#94a3b8', fontSize: '11px' }}>
                                  (฿{formatCurrency(it.sellPrice ?? it.sell_price)})
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>

                        <td>
                          <span className="ph-badge employee">👤 {sale.employee || 'หน้าร้าน'}</span>
                        </td>

                        <td>
                          <span className={`ph-badge ${sale.paymentMethod === 'cash' ? 'cash' : 'qr'}`}>
                            {sale.paymentMethod === 'cash' ? '💵 เงินสด' : '📱 QR Code'}
                          </span>
                        </td>

                        <td style={{ textAlign: 'right', fontWeight: '700', color: '#10b981', fontSize: '14px' }}>
                          ฿{formatCurrency(partsSaleMetrics.rev)}
                        </td>

                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="ph-btn-view-receipt"
                            onClick={() => setSelectedSaleForReceipt(sale)}
                            title="ดูและพิมพ์ใบเสร็จ"
                          >
                            🧾 ใบเสร็จ
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="ph-empty-state">
                <div className="ph-empty-icon">🔍</div>
                <div className="ph-empty-text">ไม่พบรายการประวัติการขายที่ค้นหา</div>
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="ph-pagination">
                <span>
                  แสดง {(currentPage - 1) * ITEMS_PER_PAGE + 1} -{' '}
                  {Math.min(currentPage * ITEMS_PER_PAGE, filteredInvoices.length)} จาก{' '}
                  {filteredInvoices.length} รายการ
                </span>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button
                    className="ph-pagination-btn"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                  >
                    ⏮️
                  </button>
                  <button
                    className="ph-pagination-btn"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    ◀️
                  </button>
                  <span style={{ padding: '0 8px', fontWeight: '600', color: '#f1f5f9' }}>
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    className="ph-pagination-btn"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    ▶️
                  </button>
                  <button
                    className="ph-pagination-btn"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                  >
                    ⏭️
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 2: INDIVIDUAL PART MOVEMENT & DATES (ตรวจขายวันไหน/รับเข้าเมื่อไร)
          ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'movement' && (
        <div>
          {/* Part Search Autocomplete Bar (พิมพ์ค้นหาจาก ไอดี หรือ ชื่อ) */}
          <div className="ph-part-search-bar" ref={searchContainerRef}>
            <div className="ph-part-search-header">
              <div className="ph-part-search-title">
                <span>🔍</span>
                <span>พิมพ์ค้นหาอะไหล่ (จากรหัส ID หรือ ชื่ออะไหล่):</span>
              </div>
              {selectedPart && (
                <div className="ph-part-current-badge">
                  <span>กำลังดู:</span>
                  <b style={{ color: '#38bdf8' }}>[{selectedPart.part_code}]</b>
                  <span style={{ maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedPart.name}
                  </span>
                  <span style={{ color: selectedPart.quantity > 0 ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                    (คงเหลือ {selectedPart.quantity || 0} ชิ้น)
                  </span>
                </div>
              )}
            </div>

            <div className="ph-part-search-input-wrap">
              <span className="ph-part-search-icon">🔎</span>
              <input
                type="text"
                className="ph-part-search-input"
                placeholder="พิมพ์รหัสอะไหล่ ID หรือชื่ออะไหล่เพื่อค้นหา... (เช่น HL-000025, ชุดยึดแกน)"
                value={partSearchQuery}
                onChange={(e) => handlePartSearchChange(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (filteredPartsForPicker.length > 0) {
                      handleSelectPart(filteredPartsForPicker[0]);
                    }
                  } else if (e.key === 'Escape') {
                    setShowSuggestions(false);
                  }
                }}
              />
              {partSearchQuery && (
                <button
                  type="button"
                  className="ph-part-clear-btn"
                  onClick={() => {
                    setPartSearchQuery('');
                    setShowSuggestions(false);
                  }}
                  title="ล้างคำค้นหา"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Live Autocomplete Dropdown List */}
            {showSuggestions && (
              <div className="ph-suggestions-dropdown">
                {partSearchQuery.trim() ? (
                  filteredPartsForPicker.length > 0 ? (
                    <>
                      <div className="ph-suggestions-header">
                        พบอะไหล่ที่ตรงกัน {filteredPartsForPicker.length} รายการ (กด Enter เพื่อเลือก หรือคลิกที่รายการ):
                      </div>
                      <div className="ph-suggestions-list">
                        {filteredPartsForPicker.slice(0, 30).map((p) => {
                          const isCurrent = String(p.id) === String(selectedPart?.id);
                          const qty = Number(p.quantity || 0);
                          return (
                            <div
                              key={p.id}
                              className={`ph-suggestion-item ${isCurrent ? 'selected' : ''}`}
                              onClick={() => handleSelectPart(p)}
                            >
                              <div className="ph-suggestion-left">
                                <span className="ph-suggestion-code">[{p.part_code}]</span>
                                <span className="ph-suggestion-name">{p.name}</span>
                              </div>
                              <div className="ph-suggestion-right">
                                <span className="ph-suggestion-cat">{p.category || '—'}</span>
                                <span
                                  className={`ph-suggestion-stock ${
                                    qty > 5 ? 'in-stock' : qty > 0 ? 'low-stock' : 'out-stock'
                                  }`}
                                >
                                  คงเหลือ: {qty} ชิ้น
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {filteredPartsForPicker.length > 30 && (
                        <div className="ph-suggestions-footer">
                          แสดง 30 รายการแรกจากทั้งหมด {filteredPartsForPicker.length} รายการ (พิมพ์ให้เจาะจงขึ้นเพื่อค้นหา)
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="ph-suggestions-empty">
                      <span>❌</span> ไม่พบอะไหล่ที่ตรงกับ "{partSearchQuery}" (ลองค้นหาด้วยรหัสอะไหล่ ID หรือชื่ออะไหล่)
                    </div>
                  )
                ) : (
                  <div className="ph-suggestions-list">
                    <div className="ph-suggestions-header">
                      💡 พิมพ์รหัสอะไหล่ (เช่น HL-000025) หรือชื่ออะไหล่เพื่อค้นหา หรือคลิกเลือกจากอะไหล่แนะนำ:
                    </div>
                    {parts.slice(0, 8).map((p) => {
                      const isCurrent = String(p.id) === String(selectedPart?.id);
                      const qty = Number(p.quantity || 0);
                      return (
                        <div
                          key={p.id}
                          className={`ph-suggestion-item ${isCurrent ? 'selected' : ''}`}
                          onClick={() => handleSelectPart(p)}
                        >
                          <div className="ph-suggestion-left">
                            <span className="ph-suggestion-code">[{p.part_code}]</span>
                            <span className="ph-suggestion-name">{p.name}</span>
                          </div>
                          <div className="ph-suggestion-right">
                            <span className="ph-suggestion-cat">{p.category || '—'}</span>
                            <span
                              className={`ph-suggestion-stock ${
                                qty > 5 ? 'in-stock' : qty > 0 ? 'low-stock' : 'out-stock'
                              }`}
                            >
                              คงเหลือ: {qty} ชิ้น
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Selected Part Detail Card */}
          {selectedPart ? (
            <>
              <div className="ph-part-detail-card">
                {/* Part Image */}
                <div className="ph-part-img-box">
                  {(() => {
                    const pImg = getPartImageUrl(selectedPart);
                    return pImg ? (
                      <img
                        src={pImg}
                        alt={selectedPart.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: '2rem' }}>🔩</span>
                    );
                  })()}
                </div>

                {/* Part Meta */}
                <div className="ph-part-meta">
                  <h3>
                    <span style={{ color: '#38bdf8' }}>[{selectedPart.part_code}]</span> {selectedPart.name}
                  </h3>
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap', fontSize: '13px', color: '#94a3b8' }}>
                    <span>หมวดหมู่: <b style={{ color: '#cbd5e1' }}>{selectedPart.category || '—'}</b></span>
                    <span>ชนิด: <b style={{ color: '#cbd5e1' }}>{selectedPart.type || '—'}</b></span>
                    <span>📍 ที่เก็บ: <b style={{ color: '#a78bfa' }}>{selectedPart.location || '—'}</b></span>
                    <span>สต็อกคงเหลือ: <b style={{ color: selectedPart.quantity > 0 ? '#10b981' : '#ef4444', fontSize: '14px' }}>{selectedPart.quantity || 0} ชิ้น</b></span>
                  </div>
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginTop: '6px', fontSize: '12.5px', color: '#94a3b8' }}>
                    <span>ราคาทุน: ฿{formatCurrency(selectedPart.cost_price)}</span>
                    <span>ราคาขายปกติ: ฿{formatCurrency(selectedPart.sell_price)}</span>
                    <span>ราคาสาขา/ตัวแทน: ฿{formatCurrency(selectedPart.dealer_price)}</span>
                  </div>
                </div>

                {/* Stock In & Update Dates Box */}
                <div className="ph-part-dates-box">
                  <div style={{ fontWeight: '700', fontSize: '12.5px', color: '#e2e8f0', marginBottom: '4px' }}>
                    📅 วันที่รับเข้าและประวัติคลัง:
                  </div>
                  <div className="ph-date-row">
                    <span>วันที่รับเข้าครั้งแรก:</span>
                    <span style={{ color: '#22c55e' }}>{formatThaiDateTime(selectedPart.created_at)}</span>
                  </div>
                  <div className="ph-date-row">
                    <span>ปรับสต็อกล่าสุด:</span>
                    <span>{formatThaiDateTime(selectedPart.updated_at)}</span>
                  </div>
                  <div className="ph-date-row" style={{ marginTop: '2px', paddingTop: '4px', borderTop: '1px solid #1e293b' }}>
                    <span>สถานะสต็อก:</span>
                    <span style={{ color: selectedPart.quantity > 5 ? '#10b981' : selectedPart.quantity > 0 ? '#f59e0b' : '#ef4444' }}>
                      {selectedPart.quantity > 5 ? '🟢 มีของพร้อมขาย' : selectedPart.quantity > 0 ? '🟡 สินค้าใกล้หมด' : '🔴 สินค้าหมด'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Movement Summary KPIs for this part */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>ขายไปแล้วทั้งหมด</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#38bdf8' }}>
                    {selectedPartStats.totalSold} ชิ้น
                  </div>
                </div>
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>ยอดขายสะสม</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#10b981' }}>
                    ฿{formatCurrency(selectedPartStats.totalRevenue)}
                  </div>
                </div>
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>กำไรสะสม</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#f59e0b' }}>
                    ฿{formatCurrency(selectedPartStats.totalProfit)}
                  </div>
                </div>
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>จำนวนครั้งที่ขาย (บิล)</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#a78bfa' }}>
                    {selectedPartStats.orderCount} ครั้ง
                  </div>
                </div>
              </div>

              {/* Movement Timeline Table */}
              <div className="ph-table-container">
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #334155', fontWeight: '700', fontSize: '14px', color: '#f1f5f9' }}>
                  ⏱️ ไทม์ไลน์ประวัติการขายของอะไหล่ชิ้นนี้ (ขายวันที่เท่าไรบ้าง & ขายให้ใคร)
                </div>

                {selectedPartMovement.length > 0 ? (
                  <table className="ph-table">
                    <thead>
                      <tr>
                        <th>วันที่ / เวลาที่ขาย</th>
                        <th>เลขที่บิล</th>
                        <th>ขายให้ใคร (ลูกค้า)</th>
                        <th>เบอร์โทร</th>
                        <th style={{ textAlign: 'center' }}>จำนวนที่ขาย</th>
                        <th style={{ textAlign: 'right' }}>ราคาขาย/ชิ้น</th>
                        <th style={{ textAlign: 'right' }}>ยอดรวม</th>
                        <th style={{ textAlign: 'right' }}>กำไร</th>
                        <th>ผู้ขาย</th>
                        <th style={{ textAlign: 'center' }}>ใบเสร็จ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPartMovement.map((m, idx) => (
                        <tr key={idx}>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: '600' }}>{formatThaiDateOnly(m.date)}</div>
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                              {new Date(m.date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                            </div>
                          </td>

                          <td>
                            <span className="ph-badge sale-id">{m.saleId}</span>
                          </td>

                          <td>
                            <span style={{ fontWeight: '600', color: '#f1f5f9' }}>
                              {m.customer?.name || 'ลูกค้าทั่วไป'}
                            </span>
                          </td>

                          <td style={{ color: '#94a3b8' }}>
                            {m.customer?.phone || '—'}
                          </td>

                          <td style={{ textAlign: 'center', fontWeight: '700', color: '#38bdf8' }}>
                            {m.quantity} ชิ้น
                          </td>

                          <td style={{ textAlign: 'right' }}>
                            ฿{formatCurrency(m.sellPrice)}
                          </td>

                          <td style={{ textAlign: 'right', fontWeight: '700', color: '#10b981' }}>
                            ฿{formatCurrency(m.lineTotal)}
                          </td>

                          <td style={{ textAlign: 'right', color: m.profit >= 0 ? '#34d399' : '#f87171' }}>
                            ฿{formatCurrency(m.profit)}
                          </td>

                          <td>
                            <span className="ph-badge employee">👤 {m.employee}</span>
                          </td>

                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="ph-btn-view-receipt"
                              onClick={() => setSelectedSaleForReceipt(m.fullSale)}
                              title="ดูใบเสร็จ"
                            >
                              🧾
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="ph-empty-state">
                    <div className="ph-empty-icon">📦</div>
                    <div className="ph-empty-text">ยังไม่มีประวัติการขายสำหรับอะไหล่ชิ้นนี้</div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="ph-empty-state">
              <div className="ph-empty-icon">🔩</div>
              <div className="ph-empty-text">กรุณาเลือกอะไหล่ที่ต้องการดูประวัติ</div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 3: SALES SUMMARY (สรุปยอดขาย รายวัน / รายเดือน / รายปี)
          ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'summary' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Summary Control Toolbar */}
          <div className="ph-summary-toolbar">
            {/* Period Switcher Pills */}
            <div className="ph-period-switcher">
              <button
                type="button"
                className={`ph-period-btn ${summaryPeriod === 'daily' ? 'active' : ''}`}
                onClick={() => setSummaryPeriod('daily')}
              >
                📅 สรุปรายวัน
              </button>
              <button
                type="button"
                className={`ph-period-btn ${summaryPeriod === 'monthly' ? 'active' : ''}`}
                onClick={() => setSummaryPeriod('monthly')}
              >
                📆 สรุปรายเดือน
              </button>
              <button
                type="button"
                className={`ph-period-btn ${summaryPeriod === 'yearly' ? 'active' : ''}`}
                onClick={() => setSummaryPeriod('yearly')}
              >
                🏛️ สรุปรายปี
              </button>
            </div>

            {/* Scope & Year/Month Filters */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {/* Badge: Spare Parts Only */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid #38bdf8',
                  borderRadius: '8px',
                  padding: '6px 14px',
                  fontSize: '12.5px',
                  fontWeight: '600',
                  color: '#38bdf8'
                }}
              >
                <span>🔩</span>
                <span>สรุปเฉพาะยอดขายอะไหล่เท่านั้น</span>
              </div>

              {/* Year Filter */}
              <select
                className="ph-select"
                value={summaryYearFilter}
                onChange={(e) => setSummaryYearFilter(e.target.value)}
              >
                <option value="all">📅 ปี: ทั้งหมด</option>
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    ปี พ.ศ. {yr + 543} ({yr})
                  </option>
                ))}
              </select>

              {/* Month Filter (for Daily view) */}
              {summaryPeriod === 'daily' && (
                <select
                  className="ph-select"
                  value={summaryMonthFilter}
                  onChange={(e) => setSummaryMonthFilter(e.target.value)}
                >
                  <option value="all">📆 เดือน: ทั้งหมด</option>
                  <option value="1">มกราคม</option>
                  <option value="2">กุมภาพันธ์</option>
                  <option value="3">มีนาคม</option>
                  <option value="4">เมษายน</option>
                  <option value="5">พฤษภาคม</option>
                  <option value="6">มิถุนายน</option>
                  <option value="7">กรกฎาคม</option>
                  <option value="8">สิงหาคม</option>
                  <option value="9">กันยายน</option>
                  <option value="10">ตุลาคม</option>
                  <option value="11">พฤศจิกายน</option>
                  <option value="12">ธันวาคม</option>
                </select>
              )}

              {/* Export CSV Button */}
              <button
                type="button"
                className="ph-btn-export"
                onClick={handleExportSummaryCSV}
                title="ดาวน์โหลดข้อมูลสรุปตารางนี้เป็นไฟล์ CSV"
              >
                📥 ส่งออก CSV
              </button>
            </div>
          </div>

          {/* 4 Summary Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>💰</div>
              <div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                  ยอดขายอะไหล่รวม ({summaryPeriod === 'daily' ? 'รายวัน' : summaryPeriod === 'monthly' ? 'รายเดือน' : 'รายปี'})
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#60a5fa' }}>
                  ฿{formatCurrency(summaryTotals.revenue)}
                </div>
              </div>
            </div>

            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>📈</div>
              <div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                  กำไรขั้นต้นอะไหล่ (Margin {summaryTotals.avgMargin.toFixed(1)}%)
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#34d399' }}>
                  ฿{formatCurrency(summaryTotals.profit)}
                </div>
              </div>
            </div>

            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>📦</div>
              <div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>จำนวนชิ้นอะไหล่ที่ขายทั้งหมด</div>
                <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#fbbf24' }}>
                  {summaryTotals.unitsSold.toLocaleString()} ชิ้น
                </div>
              </div>
            </div>

            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'rgba(168, 85, 247, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>🧾</div>
              <div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                  จำนวนบิลขายอะไหล่ (เฉลี่ย ฿{formatCurrency(summaryTotals.avgPerInvoice)}/บิล)
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#c084fc' }}>
                  {summaryTotals.invoiceCount.toLocaleString()} บิล
                </div>
              </div>
            </div>
          </div>

          {/* Visual Chart Card */}
          <div className="ph-chart-card">
            <div className="ph-chart-title">
              <span>📊</span>
              <span>
                กราฟเปรียบเทียบยอดขายและกำไร (
                {summaryPeriod === 'daily'
                  ? '30 วันล่าสุด'
                  : summaryPeriod === 'monthly'
                  ? '12 เดือนล่าสุด'
                  : 'รายปีสะสม'}
                )
              </span>
            </div>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="shortLabel" stroke="#94a3b8" fontSize={12} tickLine={false} />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `฿${Number(v).toLocaleString()}`}
                  />
                  <RechartsTooltip content={<SummaryChartTooltip />} />
                  <Legend verticalAlign="top" height={36} />
                  <Bar name="ยอดขายอะไหล่ (Revenue)" dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar name="กำไรขั้นต้นอะไหล่ (Profit)" dataKey="profit" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="ph-empty-state">
                <div className="ph-empty-icon">📊</div>
                <div className="ph-empty-text">ไม่มีข้อมูลยอดขายอะไหล่สำหรับแสดงกราฟในช่วงที่เลือก</div>
              </div>
            )}
          </div>

          {/* Detailed Summary Data Table */}
          <div className="ph-table-container">
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid #334155',
                fontWeight: '700',
                fontSize: '14px',
                color: '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📋</span>
                <span>
                  ตารางแจกแจงยอดขายอะไหล่
                  {summaryPeriod === 'daily' ? 'รายวัน' : summaryPeriod === 'monthly' ? 'รายเดือน' : 'รายปี'} (
                  {activeSummaryList.length} รายการ)
                </span>
              </div>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                * คลิกปุ่ม "🔍 ดูบิล" เพื่อเปิดดูรายการบิลในวันหรือเดือนนั้นๆ
              </span>
            </div>

            {activeSummaryList.length > 0 ? (
              <table className="ph-table">
                <thead>
                  <tr>
                    <th>
                      {summaryPeriod === 'daily'
                        ? '📅 วันที่'
                        : summaryPeriod === 'monthly'
                        ? '📆 เดือน/ปี'
                        : '🏛️ ปี พ.ศ.'}
                    </th>
                    <th style={{ textAlign: 'center' }}>จำนวนบิล</th>
                    <th style={{ textAlign: 'center' }}>จำนวนชิ้น</th>
                    <th style={{ textAlign: 'right' }}>ยอดขายอะไหล่</th>
                    <th style={{ textAlign: 'right' }}>ต้นทุนอะไหล่</th>
                    <th style={{ textAlign: 'right' }}>กำไรขั้นต้น</th>
                    <th style={{ textAlign: 'center' }}>อัตรากำไร</th>
                    <th style={{ textAlign: 'right' }}>เฉลี่ย/บิล</th>
                    <th style={{ textAlign: 'center' }}>เปิดดูบิล</th>
                  </tr>
                </thead>
                <tbody>
                  {activeSummaryList.map((row) => {
                    const margin = row.revenue > 0 ? ((row.profit / row.revenue) * 100).toFixed(1) : '0.0';
                    const avg = row.invoiceCount > 0 ? row.revenue / row.invoiceCount : 0;
                    return (
                      <tr key={row.key}>
                        <td style={{ fontWeight: '600', color: '#f8fafc' }}>
                          {row.label}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="ph-badge" style={{ background: '#1e293b', color: '#c084fc', border: '1px solid #475569' }}>
                            {row.invoiceCount} บิล
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: '700', color: '#38bdf8' }}>
                          {row.unitsSold.toLocaleString()} ชิ้น
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: '700', color: '#60a5fa' }}>
                          ฿{formatCurrency(row.revenue)}
                        </td>
                        <td style={{ textAlign: 'right', color: '#94a3b8' }}>
                          ฿{formatCurrency(row.cost)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: '700', color: '#10b981' }}>
                          ฿{formatCurrency(row.profit)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            className="ph-badge"
                            style={{
                              background: Number(margin) > 20 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                              color: Number(margin) > 20 ? '#10b981' : '#f59e0b',
                              border: `1px solid ${Number(margin) > 20 ? '#10b981' : '#f59e0b'}`
                            }}
                          >
                            {margin}%
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', color: '#cbd5e1' }}>
                          ฿{formatCurrency(avg)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {summaryPeriod === 'daily' && (
                            <button
                              type="button"
                              className="ph-btn-view-receipt"
                              onClick={() => handleViewDayInvoices(row.key)}
                              title="เปิดดูบิลทั้งหมดในวันนี้"
                            >
                              🔍 ดูบิล ({row.invoiceCount})
                            </button>
                          )}
                          {summaryPeriod === 'monthly' && (
                            <button
                              type="button"
                              className="ph-btn-view-receipt"
                              onClick={() => handleViewMonthInvoices(row.year, row.month)}
                              title="เปิดดูบิลทั้งหมดในเดือนนี้"
                            >
                              🔍 ดูบิล ({row.invoiceCount})
                            </button>
                          )}
                          {summaryPeriod === 'yearly' && (
                            <button
                              type="button"
                              className="ph-btn-view-receipt"
                              onClick={() => {
                                setDateFilter('all');
                                setSummaryYearFilter(String(row.year));
                                setSummaryPeriod('monthly');
                              }}
                              title="ดูรายละเอียดรายเดือนของปีนี้"
                            >
                              🔍 ดูรายเดือน
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#0f172a', fontWeight: '800', borderTop: '2px solid #3b82f6', color: '#f8fafc' }}>
                    <td style={{ color: '#38bdf8' }}>รวมทั้งหมดเฉพาะค่าอะไหล่ ({activeSummaryList.length} แถว)</td>
                    <td style={{ textAlign: 'center', color: '#c084fc' }}>{summaryTotals.invoiceCount} บิล</td>
                    <td style={{ textAlign: 'center', color: '#38bdf8' }}>{summaryTotals.unitsSold.toLocaleString()} ชิ้น</td>
                    <td style={{ textAlign: 'right', color: '#60a5fa' }}>฿{formatCurrency(summaryTotals.revenue)}</td>
                    <td style={{ textAlign: 'right', color: '#94a3b8' }}>฿{formatCurrency(summaryTotals.cost)}</td>
                    <td style={{ textAlign: 'right', color: '#10b981' }}>฿{formatCurrency(summaryTotals.profit)}</td>
                    <td style={{ textAlign: 'center', color: '#10b981' }}>{summaryTotals.avgMargin.toFixed(1)}%</td>
                    <td style={{ textAlign: 'right', color: '#f8fafc' }}>฿{formatCurrency(summaryTotals.avgPerInvoice)}</td>
                    <td style={{ textAlign: 'center' }}>—</td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <div className="ph-empty-state">
                <div className="ph-empty-icon">📅</div>
                <div className="ph-empty-text">ไม่มีข้อมูลยอดขายในช่วงเวลาที่เลือก</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 4: REPORTS & ANALYTICS (10 อันดับขายดี, สต็อกเตือน, รายงานสรุป)
          ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'reports' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Top 10 Best Sellers */}
          <div className="ph-table-container">
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #334155', fontWeight: '700', fontSize: '14px', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🏆</span> 10 อันดับอะไหล่ที่ขายดีที่สุด (Best Selling Spare Parts)
            </div>
            {topSellingParts.length > 0 ? (
              <table className="ph-table">
                <thead>
                  <tr>
                    <th style={{ width: '60px', textAlign: 'center' }}>อันดับ</th>
                    <th>รหัสอะไหล่</th>
                    <th>ชื่ออะไหล่</th>
                    <th style={{ textAlign: 'center' }}>จำนวนที่ขายได้</th>
                    <th style={{ textAlign: 'right' }}>ยอดขายรวม</th>
                    <th style={{ textAlign: 'right' }}>กำไรโดยประมาณ</th>
                    <th style={{ textAlign: 'center' }}>สต็อกคงเหลือ</th>
                    <th style={{ textAlign: 'center' }}>ตรวจสอบ</th>
                  </tr>
                </thead>
                <tbody>
                  {topSellingParts.map((item, idx) => {
                    const isTop3 = idx < 3;
                    return (
                      <tr key={idx}>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              width: '24px',
                              height: '24px',
                              lineHeight: '24px',
                              borderRadius: '50%',
                              background: idx === 0 ? '#f59e0b' : idx === 1 ? '#94a3b8' : idx === 2 ? '#b45309' : '#334155',
                              color: '#fff',
                              fontWeight: 'bold',
                              fontSize: '12px'
                            }}
                          >
                            {idx + 1}
                          </span>
                        </td>

                        <td>
                          <span className="ph-badge sale-id">{item.code || '—'}</span>
                        </td>

                        <td style={{ fontWeight: '600', color: isTop3 ? '#f8fafc' : '#cbd5e1' }}>
                          {item.name}
                        </td>

                        <td style={{ textAlign: 'center', fontWeight: '700', color: '#38bdf8', fontSize: '14px' }}>
                          {item.totalQuantity} ชิ้น
                        </td>

                        <td style={{ textAlign: 'right', fontWeight: '700', color: '#10b981' }}>
                          ฿{formatCurrency(item.totalRevenue)}
                        </td>

                        <td style={{ textAlign: 'right', color: '#f59e0b' }}>
                          ฿{formatCurrency(item.totalProfit)}
                        </td>

                        <td style={{ textAlign: 'center' }}>
                          <span
                            style={{
                              fontWeight: '600',
                              color: item.part?.quantity > 5 ? '#10b981' : item.part?.quantity > 0 ? '#f59e0b' : '#ef4444'
                            }}
                          >
                            {item.part ? `${item.part.quantity} ชิ้น` : '—'}
                          </span>
                        </td>

                        <td style={{ textAlign: 'center' }}>
                          {item.part && (
                            <button
                              type="button"
                              className="ph-btn-view-receipt"
                              onClick={() => {
                                setSelectedPartId(String(item.part.id));
                                setPartSearchQuery(item.part.part_code || '');
                                setShowSuggestions(false);
                                setActiveTab('movement');
                              }}
                              title="ดูไทม์ไลน์การขายอะไหล่นี้"
                            >
                              🔍 ตรวจสอบ
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="ph-empty-state">
                <div className="ph-empty-icon">📊</div>
                <div className="ph-empty-text">ยังไม่มีข้อมูลการขายอะไหล่สำหรับจัดอันดับ</div>
              </div>
            )}
          </div>

          {/* Low Stock & Out of Stock Warning Table */}
          <div className="ph-table-container">
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #334155', fontWeight: '700', fontSize: '14px', color: '#f87171', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⚠️</span> รายการอะไหล่สต็อกใกล้หมด / หมดแล้ว (ต้องสั่งซื้อรับเข้าเพิ่ม)
            </div>
            {lowStockParts.length > 0 ? (
              <table className="ph-table">
                <thead>
                  <tr>
                    <th>รหัสอะไหล่</th>
                    <th>ชื่ออะไหล่</th>
                    <th>หมวดหมู่</th>
                    <th>ที่เก็บ (Location)</th>
                    <th>ราคาทุน</th>
                    <th>ราคาขาย</th>
                    <th style={{ textAlign: 'center' }}>คงเหลือ</th>
                    <th>สถานะ</th>
                    <th>รับเข้าครั้งแรก</th>
                    <th>อัปเดตล่าสุด</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockParts.map((p) => {
                    const isOut = Number(p.quantity || 0) <= 0;
                    return (
                      <tr key={p.id}>
                        <td>
                          <span className="ph-badge sale-id">{p.part_code}</span>
                        </td>
                        <td style={{ fontWeight: '600', color: '#f1f5f9' }}>{p.name}</td>
                        <td style={{ color: '#94a3b8' }}>{p.category || '—'}</td>
                        <td style={{ color: '#a78bfa' }}>📍 {p.location || '—'}</td>
                        <td>฿{formatCurrency(p.cost_price)}</td>
                        <td>฿{formatCurrency(p.sell_price)}</td>
                        <td style={{ textAlign: 'center', fontWeight: '700', color: isOut ? '#ef4444' : '#f59e0b', fontSize: '14px' }}>
                          {p.quantity || 0} ชิ้น
                        </td>
                        <td>
                          <span
                            className="ph-badge"
                            style={{
                              background: isOut ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                              color: isOut ? '#ef4444' : '#f59e0b',
                              border: `1px solid ${isOut ? '#ef4444' : '#f59e0b'}`
                            }}
                          >
                            {isOut ? '❌ สินค้าหมด' : '⚠️ ใกล้หมด'}
                          </span>
                        </td>
                        <td style={{ fontSize: '12px', color: '#94a3b8' }}>{formatThaiDateOnly(p.created_at)}</td>
                        <td style={{ fontSize: '12px', color: '#94a3b8' }}>{formatThaiDateOnly(p.updated_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="ph-empty-state">
                <div className="ph-empty-icon">✅</div>
                <div className="ph-empty-text">สต็อกอะไหล่ทุกรายการมีปริมาณเพียงพอ ไม่พบสินค้าใกล้หมด</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Receipt View & Print Modal ── */}
      {selectedSaleForReceipt && (
        <Receipt
          sale={selectedSaleForReceipt}
          onClose={() => setSelectedSaleForReceipt(null)}
        />
      )}
    </div>
  );
};

export default PartsHistory;
