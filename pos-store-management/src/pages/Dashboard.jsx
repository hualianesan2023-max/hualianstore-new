import React, { useState, useMemo } from 'react';
import { useStore } from '../data/store';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import './Dashboard.css';

// ─── Color Palette ──────────────────────────────────────────────────
const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6'];
const BAR_COLORS = ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5'];

// ─── Custom Tooltip: Sales Area Chart ───────────────────────────────
const SalesTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="custom-tooltip">
      <div className="tooltip-label">{label}</div>
      <div className="tooltip-value green">
        ฿{Number(payload[0].value).toLocaleString()}
      </div>
    </div>
  );
};

// ─── Custom Tooltip: Top Products Bar Chart ─────────────────────────
const ProductTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="custom-tooltip">
      <div className="tooltip-label">{data.name}</div>
      <div className="tooltip-row">
        <span className="tooltip-row-label">จำนวนขาย</span>
        <span className="tooltip-row-value">{data.quantity} ชิ้น</span>
      </div>
      <div className="tooltip-row">
        <span className="tooltip-row-label">รายได้</span>
        <span className="tooltip-row-value" style={{ color: '#10b981' }}>
          ฿{data.revenue.toLocaleString()}
        </span>
      </div>
    </div>
  );
};

// ─── Custom Tooltip: Pie Chart ──────────────────────────────────────
const CategoryTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="custom-tooltip">
      <div className="tooltip-label">{data.name}</div>
      <div className="tooltip-row">
        <span className="tooltip-row-label">ยอดขาย</span>
        <span className="tooltip-row-value" style={{ color: '#6366f1' }}>
          ฿{data.value.toLocaleString()}
        </span>
      </div>
      <div className="tooltip-row">
        <span className="tooltip-row-label">สัดส่วน</span>
        <span className="tooltip-row-value">{data.percent}%</span>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════
// Dashboard Component
// ═══════════════════════════════════════════════════════════════════════
const Dashboard = () => {
  const { state, getTodaySales, getSalesByDateRange, getTopSellingProducts, getSlowSellingProducts } = useStore();
  const [dateRange, setDateRange] = useState('30days');

  // ─── Filtered Sales by Date Range ───────────────────────────────────
  const filteredSales = useMemo(() => {
    const now = new Date();
    if (dateRange === 'today') {
      return getTodaySales();
    }
    const daysBack = dateRange === '7days' ? 7 : 30;
    const start = new Date(now);
    start.setDate(start.getDate() - (daysBack - 1));
    return getSalesByDateRange(start.toISOString(), now.toISOString());
  }, [dateRange, state.sales, getTodaySales, getSalesByDateRange]);

  // ─── KPI Computations ──────────────────────────────────────────────
  const { totalSales, totalBills, avgPerBill, totalItemsSold } = useMemo(() => {
    const totalSales = filteredSales.reduce((sum, s) => sum + s.total, 0);
    const totalBills = filteredSales.length;
    const avgPerBill = totalBills > 0 ? Math.round(totalSales / totalBills) : 0;
    const totalItemsSold = filteredSales.reduce(
      (sum, s) => sum + s.items.reduce((iSum, item) => iSum + item.quantity, 0), 0
    );
    return { totalSales, totalBills, avgPerBill, totalItemsSold };
  }, [filteredSales]);

  // ─── Sales Chart Data (daily aggregation) ──────────────────────────
  const salesChartData = useMemo(() => {
    const now = new Date();
    let days;
    if (dateRange === 'today') {
      // Show hourly data for today
      const todaySales = filteredSales;
      const hourly = {};
      for (let h = 8; h <= 22; h++) {
        const label = `${String(h).padStart(2, '0')}:00`;
        hourly[label] = 0;
      }
      todaySales.forEach((s) => {
        const h = new Date(s.date).getHours();
        const label = `${String(h).padStart(2, '0')}:00`;
        if (hourly[label] !== undefined) {
          hourly[label] += s.total;
        }
      });
      return Object.entries(hourly).map(([date, total]) => ({ date, total: Math.round(total) }));
    }

    days = dateRange === '7days' ? 7 : 30;
    const dailyMap = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const label = `${d.getDate()}/${d.getMonth() + 1}`;
      dailyMap[key] = { date: label, total: 0 };
    }
    filteredSales.forEach((s) => {
      const key = s.date.split('T')[0];
      if (dailyMap[key]) {
        dailyMap[key].total += s.total;
      }
    });
    return Object.values(dailyMap).map((d) => ({ ...d, total: Math.round(d.total) }));
  }, [filteredSales, dateRange]);

  // ─── Top Products ─────────────────────────────────────────────────
  const topProducts = useMemo(
    () => getTopSellingProducts(filteredSales, 5),
    [filteredSales, getTopSellingProducts]
  );

  // ─── Slow-Selling Products ────────────────────────────────────────
  const slowProducts = useMemo(
    () => getSlowSellingProducts(filteredSales, 5),
    [filteredSales, getSlowSellingProducts]
  );

  // ─── Category Breakdown ───────────────────────────────────────────
  const categoryData = useMemo(() => {
    const catMap = {};
    filteredSales.forEach((sale) => {
      sale.items.forEach((item) => {
        const product = state.products.find((p) => p.id === item.productId);
        const cat = product?.category || 'อื่นๆ';
        catMap[cat] = (catMap[cat] || 0) + item.subtotal;
      });
    });
    const total = Object.values(catMap).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(catMap)
      .map(([name, value]) => ({
        name,
        value: Math.round(value),
        percent: Math.round((value / total) * 100),
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredSales, state.products]);

  // ─── Recent Transactions ──────────────────────────────────────────
  const recentTransactions = useMemo(
    () => filteredSales.slice(0, 10),
    [filteredSales]
  );

  // ─── Helpers ──────────────────────────────────────────────────────
  const formatTime = (isoStr) => {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (isoStr) => {
    const d = new Date(isoStr);
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  };

  // ═════════════════════════════════════════════════════════════════════
  // Render
  // ═════════════════════════════════════════════════════════════════════
  return (
    <div className="page-container">
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">📊 แดชบอร์ด</h1>
          <p className="page-subtitle">ภาพรวมยอดขายและผลประกอบการ</p>
        </div>
        <div className="date-filters">
          <button
            className={dateRange === 'today' ? 'active' : ''}
            onClick={() => setDateRange('today')}
          >
            วันนี้
          </button>
          <button
            className={dateRange === '7days' ? 'active' : ''}
            onClick={() => setDateRange('7days')}
          >
            7 วัน
          </button>
          <button
            className={dateRange === '30days' ? 'active' : ''}
            onClick={() => setDateRange('30days')}
          >
            30 วัน
          </button>
        </div>
      </div>

      {/* ─── KPI Cards ──────────────────────────────────────────────── */}
      <div className="kpi-grid" key={dateRange}>
        <div className="card kpi-card">
          <div className="kpi-icon">💰</div>
          <div className="kpi-value">฿{totalSales.toLocaleString()}</div>
          <div className="kpi-label">ยอดขายรวม</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-icon">🧾</div>
          <div className="kpi-value">{totalBills.toLocaleString()}</div>
          <div className="kpi-label">จำนวนบิล</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-icon">📊</div>
          <div className="kpi-value">฿{avgPerBill.toLocaleString()}</div>
          <div className="kpi-label">เฉลี่ยต่อบิล</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-icon">📦</div>
          <div className="kpi-value">{totalItemsSold.toLocaleString()}</div>
          <div className="kpi-label">สินค้าที่ขายได้</div>
        </div>
      </div>

      {/* ─── Charts Row 1: Sales Trend + Top Products ───────────────── */}
      <div className="charts-grid">
        {/* Sales Trend — Area Chart */}
        <div className="card chart-card">
          <h3>📈 แนวโน้มยอดขาย</h3>
          {salesChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={salesChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="date"
                  stroke="#64748B"
                  fontSize={12}
                  tickLine={false}
                  axisLine={{ stroke: '#334155' }}
                />
                <YAxis
                  stroke="#64748B"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<SalesTooltip />} />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#10B981"
                  fill="url(#salesGradient)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, stroke: '#10B981', strokeWidth: 2, fill: '#0f172a' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">📉</div>
              <div className="empty-state-text">ไม่มีข้อมูลยอดขาย</div>
            </div>
          )}
        </div>

        {/* Top Products — Horizontal Bar Chart */}
        <div className="card chart-card">
          <h3>🏆 สินค้าขายดี Top 5</h3>
          {topProducts.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={topProducts}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis
                  type="number"
                  stroke="#64748B"
                  fontSize={12}
                  tickLine={false}
                  axisLine={{ stroke: '#334155' }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="#64748B"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  width={110}
                />
                <Tooltip content={<ProductTooltip />} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
                <Bar dataKey="quantity" radius={[0, 6, 6, 0]} barSize={28}>
                  {topProducts.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">📦</div>
              <div className="empty-state-text">ไม่มีข้อมูลสินค้า</div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Charts Row 2: Category Pie + Recent Transactions ───────── */}
      <div className="charts-grid">
        {/* Category Breakdown — Pie Chart */}
        <div className="card chart-card">
          <h3>📊 ยอดขายตามหมวดหมู่</h3>
          {categoryData.length > 0 ? (
            <div className="pie-chart-wrapper">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={110}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CategoryTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pie-legend">
                {categoryData.map((entry, i) => (
                  <div key={entry.name} className="pie-legend-item">
                    <span
                      className="pie-legend-dot"
                      style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    <span className="pie-legend-name">{entry.name}</span>
                    <span className="pie-legend-value">฿{entry.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">📊</div>
              <div className="empty-state-text">ไม่มีข้อมูล</div>
            </div>
          )}
        </div>

        {/* Recent Transactions */}
        <div className="card">
          <h3>🕐 ธุรกรรมล่าสุด</h3>
          {recentTransactions.length > 0 ? (
            <div className="transactions-table-wrapper">
              <table className="transactions-table">
                <thead>
                  <tr>
                    <th>เวลา</th>
                    <th>รายการ</th>
                    <th>ยอด</th>
                    <th>ชำระ</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="time-cell">
                        {formatDate(tx.date)} {formatTime(tx.date)}
                      </td>
                      <td>{tx.items.length} รายการ</td>
                      <td className="amount">฿{tx.total.toLocaleString()}</td>
                      <td>
                        <span className={`payment-badge ${tx.paymentMethod}`}>
                          {tx.paymentMethod === 'cash' ? '💵 เงินสด' : '📱 โอน'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">🕐</div>
              <div className="empty-state-text">ยังไม่มีธุรกรรม</div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Bottom Row: Slow-Selling Products ──────────────────────── */}
      <div className="charts-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div className="card">
          <h3>⚠️ สินค้าขายช้า</h3>
          {slowProducts.length > 0 ? (
            <div className="slow-products-list">
              {slowProducts.map((product) => (
                <div key={product.id} className="slow-product-item">
                  <span className="slow-product-name">{product.name}</span>
                  <span className="slow-product-qty">
                    ขายได้ {product.quantity} ชิ้น · ฿{product.revenue.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">✅</div>
              <div className="empty-state-text">ไม่มีสินค้าขายช้า</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
