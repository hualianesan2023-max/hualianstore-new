import React, { useState, useMemo } from 'react';
import { useStore } from '../data/store';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import './ProfitLoss.css';
import Receipt from '../components/Receipt';

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
  const { state, getTodaySales, getSalesByDateRange } = useStore();
  const [filterType, setFilterType] = useState('30days');
  const [customDates, setCustomDates] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });

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
      // Custom date range
      return getSalesByDateRange(customDates.start, customDates.end);
    }
  }, [filterType, customDates, state.sales, getTodaySales, getSalesByDateRange]);

  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSaleForReprint, setSelectedSaleForReprint] = useState(null);

  // Reset page when filter changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [filterType, customDates]);

  // ─── Searched and Paginated Sales ──────────────────────────────────
  const searchedSales = useMemo(() => {
    if (!searchQuery.trim()) return filteredSales;
    const query = searchQuery.toLowerCase().trim();
    return filteredSales.filter(sale => {
      const billId = sale.id ? sale.id.toLowerCase() : '';
      const customerName = sale.customer && sale.customer.name ? sale.customer.name.toLowerCase() : '';
      const customerPhone = sale.customer && sale.customer.phone ? sale.customer.phone.toLowerCase() : '';
      const employee = sale.employee ? sale.employee.toLowerCase() : '';
      return billId.includes(query) || 
             customerName.includes(query) || 
             customerPhone.includes(query) || 
             employee.includes(query);
    });
  }, [filteredSales, searchQuery]);

  const itemsPerPage = 20;
  const totalPages = Math.ceil(searchedSales.length / itemsPerPage) || 1;
  const activePage = Math.min(currentPage, totalPages);

  const paginatedSales = useMemo(() => {
    const startIndex = (activePage - 1) * itemsPerPage;
    return searchedSales.slice(startIndex, startIndex + itemsPerPage);
  }, [searchedSales, activePage]);

  // ─── Calculations ──────────────────────────────────────────────────
  const { revenue, cost, profit, profitMargin } = useMemo(() => {
    let revSum = 0;
    let costSum = 0;

    filteredSales.forEach((sale) => {
      revSum += sale.total;
      
      // Calculate cost
      let saleCost = 0;
      sale.items.forEach((item) => {
        // If item contains costPrice directly, use it, else lookup from products
        const costPrice = item.costPrice ?? state.products.find(p => p.id === item.productId)?.costPrice ?? 0;
        saleCost += costPrice * item.quantity;
      });

      // Deduct promo discount proportionally if any
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
      if (duration > 90) duration = 90; // Limit chart density
    }

    // Initialize daily buckets
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
      const key = sale.date.split('T')[0];
      if (daysMap[key]) {
        // Calculate cost
        let saleCost = 0;
        sale.items.forEach((item) => {
          const costPrice = item.costPrice ?? state.products.find(p => p.id === item.productId)?.costPrice ?? 0;
          saleCost += costPrice * item.quantity;
        });

        // Deduct promo discount proportionally if any
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

  // ─── Format date helpers ───────────────────────────────────────────
  const formatDateTime = (isoStr) => {
    const d = new Date(isoStr);
    const datePart = d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short' });
    const timePart = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  };

  const getSaleProfitInfo = (sale) => {
    let saleCost = 0;
    sale.items.forEach((item) => {
      const costPrice = item.costPrice ?? state.products.find(p => p.id === item.productId)?.costPrice ?? 0;
      saleCost += costPrice * item.quantity;
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
    const headers = ['เลขที่บิล', 'วันที่ - เวลา', 'ลูกค้า', 'คนขาย', 'ยอดขาย (บาท)', 'ต้นทุนสินค้า (บาท)', 'กำไรสุทธิ (บาท)', 'อัตรากำไร (%)'];
    const rows = searchedSales.map(sale => {
      const profitInfo = getSaleProfitInfo(sale);
      const customerName = sale.customer ? sale.customer.name : 'ลูกค้าทั่วไป';
      return [
        sale.id,
        formatDateTime(sale.date),
        customerName,
        sale.employee || 'หน้าร้าน',
        sale.total,
        profitInfo.cost,
        profitInfo.profit,
        `${profitInfo.margin}%`
      ];
    });

    const csvContent = "\uFEFF" + [headers, ...rows]
      .map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `รายงานการขาย_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToPDF = () => {
    const printWindow = window.open('', '_blank');
    const tableRows = searchedSales.map(sale => {
      const profitInfo = getSaleProfitInfo(sale);
      const customerName = sale.customer ? `${sale.customer.name} (📞 ${sale.customer.phone})` : 'ลูกค้าทั่วไป';
      return `
        <tr>
          <td style="font-weight: bold; border-bottom: 1px solid #ddd; padding: 8px;">${sale.id}</td>
          <td style="border-bottom: 1px solid #ddd; padding: 8px;">${formatDateTime(sale.date)}</td>
          <td style="border-bottom: 1px solid #ddd; padding: 8px;">${customerName}</td>
          <td style="border-bottom: 1px solid #ddd; padding: 8px;">${sale.employee || 'หน้าร้าน'}</td>
          <td style="text-align: right; border-bottom: 1px solid #ddd; padding: 8px;">฿${sale.total.toLocaleString()}</td>
          <td style="text-align: right; border-bottom: 1px solid #ddd; padding: 8px;">฿${profitInfo.cost.toLocaleString()}</td>
          <td style="text-align: right; font-weight: bold; color: ${profitInfo.profit >= 0 ? '#10b981' : '#ef4444'}; border-bottom: 1px solid #ddd; padding: 8px;">฿${profitInfo.profit.toLocaleString()}</td>
          <td style="text-align: center; border-bottom: 1px solid #ddd; padding: 8px;">${profitInfo.margin}%</td>
        </tr>
      `;
    }).join('');

    const html = `
      <html>
        <head>
          <title>รายงานสรุปการขายและกำไร - HUALIAN STORE</title>
          <style>
            body {
              font-family: 'Noto Sans Thai', 'Segoe UI', Tahoma, sans-serif;
              color: #333;
              margin: 40px;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #333;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .company-title {
              font-size: 24px;
              font-weight: bold;
            }
            .report-title {
              font-size: 20px;
              color: #555;
            }
            .kpi-container {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 15px;
              margin-bottom: 30px;
            }
            .kpi-card {
              border: 1px solid #ccc;
              border-radius: 8px;
              padding: 15px;
              text-align: center;
              background: #f9f9f9;
            }
            .kpi-value {
              font-size: 18px;
              font-weight: bold;
              margin-top: 5px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 30px;
            }
            th {
              background: #f2f2f2;
              border-bottom: 2px solid #ddd;
              padding: 10px;
              text-align: left;
              font-size: 14px;
            }
            td {
              font-size: 13px;
            }
            .footer {
              margin-top: 50px;
              text-align: right;
              font-size: 12px;
              color: #777;
            }
            @media print {
              body { margin: 20px; }
              button { display: none; }
            }
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
            <div class="kpi-card">
              <div>ยอดขายรวม</div>
              <div class="kpi-value">฿${revenue.toLocaleString()}</div>
            </div>
            <div class="kpi-card">
              <div>ต้นทุนสินค้า</div>
              <div class="kpi-value">฿${cost.toLocaleString()}</div>
            </div>
            <div class="kpi-card">
              <div>กำไรขั้นต้น</div>
              <div class="kpi-value" style="color: ${profit >= 0 ? '#10b981' : '#ef4444'};">฿${profit.toLocaleString()}</div>
            </div>
            <div class="kpi-card">
              <div>อัตรากำไร</div>
              <div class="kpi-value">${profitMargin}%</div>
            </div>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
            <thead>
              <tr>
                <th style="background: #f2f2f2; border-bottom: 2px solid #ddd; padding: 10px; text-align: left; font-size: 14px; width: 100px;">เลขที่บิล</th>
                <th style="background: #f2f2f2; border-bottom: 2px solid #ddd; padding: 10px; text-align: left; font-size: 14px; width: 130px;">วันที่ - เวลา</th>
                <th style="background: #f2f2f2; border-bottom: 2px solid #ddd; padding: 10px; text-align: left; font-size: 14px;">ลูกค้า</th>
                <th style="background: #f2f2f2; border-bottom: 2px solid #ddd; padding: 10px; text-align: left; font-size: 14px;">คนขาย</th>
                <th style="background: #f2f2f2; border-bottom: 2px solid #ddd; padding: 10px; text-align: right; font-size: 14px;">ยอดขาย</th>
                <th style="background: #f2f2f2; border-bottom: 2px solid #ddd; padding: 10px; text-align: right; font-size: 14px;">ต้นทุน</th>
                <th style="background: #f2f2f2; border-bottom: 2px solid #ddd; padding: 10px; text-align: right; font-size: 14px;">กำไรสุทธิ</th>
                <th style="background: #f2f2f2; border-bottom: 2px solid #ddd; padding: 10px; text-align: center; font-size: 14px; width: 90px;">อัตรากำไร</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>

          <div class="footer">
            พิมพ์โดยพนักงาน HUALIAN STORE • หน้า 1 จาก 1
          </div>

          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="page-container">
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
      <div className="card chart-card" style={{ marginBottom: 'var(--space-lg)' }}>
        <h3 className="card-title" style={{ marginBottom: 'var(--space-md)' }}>📊 แผนภูมิวิเคราะห์ยอดขาย ต้นทุน และกำไร</h3>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#64748B" fontSize={12} tickLine={false} />
              <YAxis stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `฿${v}`} />
              <Tooltip content={<ProfitTooltip />} />
              <Legend verticalAlign="top" height={36} />
              <Bar name="ยอดขาย" dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar name="ต้นทุน" dataKey="cost" fill="#f97316" radius={[4, 4, 0, 0]} />
              <Bar name="กำไรสุทธิ" dataKey="profit" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty-state">
            <span className="empty-state-icon">📊</span>
            <p className="empty-state-title">ไม่มีข้อมูลสถิติ</p>
          </div>
        )}
      </div>

      {/* Transaction Details */}
      <div className="card no-padding overflow-hidden" style={{ marginBottom: 'var(--space-xl)' }}>
        <div className="flex justify-between items-center flex-wrap" style={{ padding: 'var(--space-lg) var(--space-lg) var(--space-md)', gap: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <h3 className="card-title" style={{ margin: 0 }}>📋 บันทึกกำไร-ขาดทุนรายธุรกรรม</h3>
          <div className="search-group" style={{ position: 'relative', width: '300px' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}>🔍</span>
            <input
              type="text"
              className="input"
              placeholder="ค้นหาเลขที่บิล / ลูกค้า / คนขาย..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              style={{ 
                paddingLeft: '36px', 
                height: '38px', 
                margin: 0, 
                width: '100%', 
                background: '#1a1b26', 
                border: '1.5px solid #2e303a', 
                color: '#fff',
                borderRadius: '8px'
              }}
            />
          </div>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ width: '130px' }}>เลขที่บิล</th>
                <th style={{ width: '150px' }}>วันที่ - เวลา</th>
                <th>ข้อมูลลูกค้า</th>
                <th>คนขาย</th>
                <th style={{ textAlign: 'right' }}>ยอดขาย (฿)</th>
                <th style={{ textAlign: 'right' }}>ต้นทุนสินค้า (฿)</th>
                <th style={{ textAlign: 'right' }}>กำไรสุทธิ (฿)</th>
                <th style={{ textAlign: 'center', width: '120px' }}>อัตรากำไร (%)</th>
                <th style={{ textAlign: 'center', width: '100px' }}>การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {paginatedSales.length > 0 ? (
                paginatedSales.map((sale) => {
                  const profitInfo = getSaleProfitInfo(sale);
                  return (
                    <tr key={sale.id}>
                      <td className="font-bold">{sale.id}</td>
                      <td>{formatDateTime(sale.date)}</td>
                      <td>
                        {sale.customer ? (
                          <div className="flex flex-col">
                            <span className="font-medium">{sale.customer.name}</span>
                            <span className="text-xs text-muted">📞 {sale.customer.phone}</span>
                          </div>
                        ) : (
                          <span className="text-secondary">👤 ลูกค้าทั่วไป</span>
                        )}
                      </td>
                      <td>
                        <span style={{ fontWeight: '500', color: '#e2e8f0' }}>
                          {sale.employee || 'หน้าร้าน'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '500' }}>
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
                        <span className={`badge ${profitInfo.profit >= 0 ? 'badge-success' : 'badge-danger'}`}>
                          {profitInfo.margin}%
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setSelectedSaleForReprint(sale)}
                          style={{
                            padding: '4px 8px',
                            fontSize: '11.5px',
                            height: 'auto',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'rgba(59, 130, 246, 0.15)',
                            borderColor: 'rgba(59, 130, 246, 0.3)',
                            color: '#60a5fa'
                          }}
                        >
                          🖨️ พิมพ์บิล
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
                    <div className="empty-state">
                      <span className="empty-state-icon">🧾</span>
                      <p className="empty-state-title">ไม่มีบันทึกธุรกรรม</p>
                      <p className="empty-state-text">ยังไม่มีประวัติการขายสินค้าในช่วงเวลาที่เลือก</p>
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
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                style={{ height: '32px', padding: '0 12px', fontSize: '12.5px', background: activePage === 1 ? 'transparent' : 'rgba(255,255,255,0.05)' }}
              >
                ย้อนกลับ
              </button>
              <button
                className="btn btn-secondary"
                disabled={activePage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                style={{ height: '32px', padding: '0 12px', fontSize: '12.5px', background: activePage === totalPages ? 'transparent' : 'rgba(255,255,255,0.05)' }}
              >
                ถัดไป
              </button>
            </div>
          </div>
        )}
      </div>

      {/* A4 Receipt Reprint Modal */}
      {selectedSaleForReprint && (
        <Receipt
          sale={selectedSaleForReprint}
          onClose={() => setSelectedSaleForReprint(null)}
        />
      )}
    </div>
  );
};

export default ProfitLoss;


