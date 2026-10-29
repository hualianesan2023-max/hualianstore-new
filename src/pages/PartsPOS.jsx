import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useStore, ACTIONS } from '../data/store';
import { supabase } from '../data/supabaseClient';
import Receipt from '../components/Receipt';
import './POS.css';
import { showAlert, showConfirm } from '../utils/alerts';
import Swal from 'sweetalert2';
import { getPartImageUrl, LocalImageToolbar } from '../utils/localImageProvider';
import {
  insertWithUniqueIdRetry,
  adjustPartStockAtomic,
  getThaiYearMonth,
} from '../utils/concurrency';

const formatCurrency = (amount) => {
  return Number(amount || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

// ===== Generate unique sale ID for Spare Parts (Prefix: IVS) =====
const generatePartsSaleId = (existingSales = []) => {
  const now = new Date();
  const beYear = now.getFullYear() + 543;
  const yearStr = String(beYear).slice(-2); // e.g. "69"
  const monthStr = String(now.getMonth() + 1).padStart(2, '0'); // e.g. "10"
  const prefix = `IVS${yearStr}${monthStr}-`; // e.g. "IVS6910-"

  // Find all sales matching this prefix
  const salesInMonth = (existingSales || [])
    .filter((s) => s && s.id && s.id.startsWith(prefix));

  let maxNum = 0;
  salesInMonth.forEach((sale) => {
    const numPart = sale.id.slice(prefix.length);
    const parsed = parseInt(numPart, 10);
    if (!isNaN(parsed) && parsed > maxNum) {
      maxNum = parsed;
    }
  });

  let nextNum = maxNum + 1;
  let finalId = `${prefix}${String(nextNum).padStart(3, '0')}`;

  let attempt = 0;
  while ((existingSales || []).some((s) => s && s.id === finalId) && attempt < 100) {
    nextNum++;
    finalId = `${prefix}${String(nextNum).padStart(3, '0')}`;
    attempt++;
  }

  return finalId;
};

// ===== Toast Component =====
const Toast = ({ message, type, show }) => (
  <div className={`pos-toast ${type} ${show ? 'show' : ''}`}>
    {message}
  </div>
);

const ITEMS_PER_PAGE = 15;

const PartsPOS = () => {
  const { state, dispatch } = useStore();
  const { promotions = [], storeInfo = {}, customers = [] } = state || {};
  const storeName = storeInfo.name || 'ร้านค้า';
  const taxRate = (storeInfo.taxRate || 7) / 100;

  // Parts state
  const [parts, setParts] = useState([]);
  const [isLoadingParts, setIsLoadingParts] = useState(true);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ทั้งหมด');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSalesperson, setSelectedSalesperson] = useState('หน้าร้าน');
  const [globalPriceType, setGlobalPriceType] = useState('sell'); // 'sell' = ราคาขายปกติ, 'branch' = ราคาสาขา

  // Cart state
  const [cart, setCart] = useState([]);
  const [justAddedId, setJustAddedId] = useState(null);
  const [toast, setToast] = useState({ message: '', type: 'success', show: false });

  // Customer state
  const [customerType, setCustomerType] = useState('general'); // 'general' or 'receipt'
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [generalCustomerName, setGeneralCustomerName] = useState('');
  const [generalCustomerPhone, setGeneralCustomerPhone] = useState('');
  const [generalCustomerAddress, setGeneralCustomerAddress] = useState('');
  const [showGeneralCustomerFields, setShowGeneralCustomerFields] = useState(false);

  // Discount & Payment state
  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [discountMessage, setDiscountMessage] = useState({ text: '', type: '' });
  const [shippingCost, setShippingCost] = useState('0');
  const [installationCost, setInstallationCost] = useState('0');
  const [applyVat, setApplyVat] = useState(false);
  const [isVatInclusive, setIsVatInclusive] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash' or 'qr'
  const [cashReceived, setCashReceived] = useState('');
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // Quick cash amounts
  const quickCashAmounts = [20, 50, 100, 500, 1000];

  // Receipt modal state
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastSale, setLastSale] = useState(null);

  // Toast helper
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, show: true });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 2800);
  }, []);

  // Fetch Parts from Supabase
  const fetchParts = useCallback(async () => {
    setIsLoadingParts(true);
    try {
      const { data, error } = await supabase
        .from('parts')
        .select('*')
        .order('part_code', { ascending: true })
        .range(0, 9999);
      if (error) throw error;
      setParts(data || []);
    } catch (err) {
      console.error('Error fetching parts:', err);
      showToast('ไม่สามารถโหลดรายการอะไหล่ได้', 'error');
    } finally {
      setIsLoadingParts(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchParts();

    const channel = supabase
      .channel('parts_pos_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parts' },
        () => {
          fetchParts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchParts]);

  // Dynamic Categories from parts
  const dbCategories = useMemo(() => {
    const cats = new Set();
    parts.forEach((p) => {
      const val = p.category ? String(p.category).trim() : '';
      if (val) cats.add(val);
    });
    return Array.from(cats).sort((a, b) => a.localeCompare(b, 'th'));
  }, [parts]);

  // Promotions lookup map
  const promoCodes = useMemo(() => {
    return promotions.reduce((acc, promo) => {
      acc[promo.code.toUpperCase()] = {
        type: promo.type,
        value: promo.value,
        description: promo.name,
        minPurchase: promo.minPurchase,
        active: promo.active
      };
      return acc;
    }, {});
  }, [promotions]);

  // Filter parts based on search & category
  const filteredParts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return parts.filter((part) => {
      const matchCat = selectedCategory === 'ทั้งหมด' || (part.category || '').trim() === selectedCategory;
      if (!matchCat) return false;
      if (!q) return true;

      const code = (part.part_code || '').toLowerCase();
      const name = (part.name || '').toLowerCase();
      const cat = (part.category || '').toLowerCase();
      const type = (part.type || '').toLowerCase();
      const loc = (part.location || '').toLowerCase();

      return code.includes(q) || name.includes(q) || cat.includes(q) || type.includes(q) || loc.includes(q);
    });
  }, [parts, searchQuery, selectedCategory]);

  // Reset pagination when search or category changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory]);

  const totalPages = Math.ceil(filteredParts.length / ITEMS_PER_PAGE) || 1;
  const paginatedParts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredParts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredParts, currentPage]);

  // === Add to Cart ===
  const addToCart = useCallback(
    (part) => {
      const maxStock = Number(part.quantity || 0);
      if (maxStock <= 0) {
        showToast(`❌ อะไหล่ "${part.name}" สต็อกหมด`, 'error');
        return;
      }

      setCart((prevCart) => {
        const existing = prevCart.find((item) => item.partId === part.id);
        if (existing) {
          if (existing.quantity >= maxStock) {
            showToast(`⚠️ สต็อกไม่เพียงพอ (คงเหลือ ${maxStock} ชิ้น)`, 'error');
            return prevCart;
          }
          return prevCart.map((item) =>
            item.partId === part.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          );
        }

        const isBranch = globalPriceType === 'branch' || globalPriceType === 'dealer';
        const unitPrice = isBranch
          ? Number(part.dealer_price || part.sell_price || 0)
          : Number(part.sell_price || 0);

        return [
          ...prevCart,
          {
            id: `part-${part.id}`,
            partId: part.id,
            partCode: part.part_code,
            name: part.name,
            location: part.location || '—',
            category: part.category || '—',
            type: part.type || '—',
            unit: 'ชิ้น',
            costPrice: Number(part.cost_price || 0),
            dealerPrice: Number(part.dealer_price || 0),
            normalPrice: Number(part.sell_price || 0),
            sellPrice: unitPrice,
            priceType: isBranch ? 'branch' : 'sell',
            quantity: 1,
            maxStock: maxStock,
            image_name: part.image_name,
            image_data: part.image_data,
          },
        ];
      });

      // Pulse animation
      setJustAddedId(part.id);
      setTimeout(() => setJustAddedId(null), 500);
      showToast(`🛒 เพิ่ม "${part.name}" ลงในตะกร้าแล้ว`);
    },
    [globalPriceType, showToast]
  );

  // === Update Quantity ===
  const updateQuantity = useCallback(
    (cartItemId, delta) => {
      setCart((prevCart) => {
        return prevCart
          .map((item) => {
            if (item.id !== cartItemId) return item;
            const newQty = Math.round((Number(item.quantity) + delta) * 1000) / 1000;
            if (newQty > item.maxStock) {
              showToast(`⚠️ สต็อกคงเหลือสูงสุด: ${item.maxStock} ชิ้น`, 'error');
              return item;
            }
            return { ...item, quantity: newQty };
          })
          .filter((item) => item.quantity > 0);
      });
    },
    [showToast]
  );

  // === Set Exact Quantity ===
  const setQuantity = useCallback(
    (cartItemId, rawValue) => {
      const parsed = Math.round(parseFloat(rawValue) * 1000) / 1000;
      if (!Number.isFinite(parsed) || parsed <= 0) return;
      setCart((prevCart) =>
        prevCart.map((item) => {
          if (item.id !== cartItemId) return item;
          if (parsed > item.maxStock) {
            showToast(`⚠️ สต็อกคงเหลือ: ${item.maxStock} ชิ้น`, 'error');
            return item;
          }
          return { ...item, quantity: parsed };
        })
      );
    },
    [showToast]
  );

  // === Set Custom Item Price ===
  const setItemPrice = useCallback((cartItemId, rawValue) => {
    const parsed = Math.round(parseFloat(rawValue) * 100) / 100;
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setCart((prevCart) =>
      prevCart.map((item) => {
        if (item.id !== cartItemId) return item;
        return {
          ...item,
          sellPrice: parsed,
          isCustomPrice: true,
        };
      })
    );
  }, []);

  // === Change Global Price Type ===
  const handleGlobalPriceTypeChange = useCallback((newType) => {
    setGlobalPriceType(newType);
    setCart((prev) =>
      prev.map((item) => {
        const isBranch = newType === 'branch' || newType === 'dealer';
        return {
          ...item,
          priceType: isBranch ? 'branch' : 'sell',
          sellPrice: isBranch
            ? Number(item.dealerPrice || item.normalPrice || 0)
            : Number(item.normalPrice || 0),
        };
      })
    );
  }, []);

  // === Change Item Price Type ===
  const changeItemPriceType = useCallback((cartItemId, newType) => {
    setCart((prevCart) =>
      prevCart.map((item) => {
        if (item.id !== cartItemId) return item;
        const isBranch = newType === 'branch' || newType === 'dealer';
        const newPrice = isBranch
          ? Number(item.dealerPrice || item.normalPrice || 0)
          : Number(item.normalPrice || 0);
        return {
          ...item,
          priceType: isBranch ? 'branch' : 'sell',
          sellPrice: newPrice,
        };
      })
    );
  }, []);

  // === Remove from Cart ===
  const removeFromCart = useCallback((cartItemId) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== cartItemId));
  }, []);

  // === Clear Cart ===
  const clearCart = useCallback(async () => {
    if (cart.length === 0) return;
    const ok = await showConfirm('ล้างตะกร้า', 'ต้องการล้างรายการทั้งหมดในตะกร้าใช่หรือไม่?', 'warning');
    if (ok) {
      setCart([]);
      setAppliedDiscount(null);
      setDiscountCode('');
      setDiscountMessage({ text: '', type: '' });
      setCashReceived('');
      showToast('ล้างตะกร้าเรียบร้อยแล้ว');
    }
  }, [cart.length, showToast]);

  // === Apply Discount Code ===
  const handleApplyDiscount = useCallback(() => {
    const code = discountCode.trim().toUpperCase();
    if (!code) {
      setDiscountMessage({ text: 'กรุณากรอกโค้ดส่วนลด', type: 'error' });
      return;
    }

    const promo = promoCodes[code];
    if (!promo || !promo.active) {
      setDiscountMessage({ text: '❌ โค้ดส่วนลดไม่ถูกต้องหรือหมดอายุ', type: 'error' });
      setAppliedDiscount(null);
      return;
    }

    const subtotalCalc = cart.reduce((sum, item) => sum + item.sellPrice * item.quantity, 0);
    if (promo.minPurchase && subtotalCalc < promo.minPurchase) {
      setDiscountMessage({
        text: `ยอดซื้อขั้นต่ำ ${promo.minPurchase.toLocaleString()} บาท`,
        type: 'error',
      });
      setAppliedDiscount(null);
      return;
    }

    setAppliedDiscount({ code, ...promo });
    setDiscountMessage({
      text: `✅ ใช้โค้ด "${code}" สำเร็จ! (${promo.description})`,
      type: 'success',
    });
    showToast(`ส่วนลด: ${promo.description}`);
  }, [discountCode, promoCodes, cart, showToast]);

  const handleRemoveDiscount = useCallback(() => {
    setAppliedDiscount(null);
    setDiscountCode('');
    setDiscountMessage({ text: '', type: '' });
    showToast('ยกเลิกส่วนลดแล้ว');
  }, [showToast]);

  // === Customer Search Filter ===
  const matchingCustomers = useMemo(() => {
    const q = customerSearchQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 10);
    return customers.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.id || '').toLowerCase().includes(q) ||
        (c.taxId || '').includes(q)
    ).slice(0, 10);
  }, [customers, customerSearchQuery]);

  // === Price Computations ===
  const catalogSubtotal = cart.reduce((sum, item) => sum + item.sellPrice * item.quantity, 0);

  const discountAmount = appliedDiscount
    ? appliedDiscount.type === 'percent'
      ? Math.round((catalogSubtotal * appliedDiscount.value) / 100)
      : Math.min(appliedDiscount.value, catalogSubtotal)
    : 0;

  const afterDiscountCatalog = Math.max(0, catalogSubtotal - discountAmount);
  const shippingNum = parseFloat(shippingCost) || 0;
  const installationNum = parseFloat(installationCost) || 0;
  const extraFees = shippingNum + installationNum;

  let subtotal, tax, total;

  if (applyVat) {
    if (isVatInclusive) {
      // VAT Inclusive
      total = Math.round((afterDiscountCatalog + extraFees) * 100) / 100;
      subtotal = Math.round((total / (1 + taxRate)) * 100) / 100;
      tax = Math.round((total - subtotal) * 100) / 100;
    } else {
      // VAT Exclusive
      subtotal = afterDiscountCatalog;
      const taxBase = subtotal + extraFees;
      tax = Math.round(taxBase * taxRate * 100) / 100;
      total = Math.round((subtotal + tax + extraFees) * 100) / 100;
    }
  } else {
    subtotal = afterDiscountCatalog;
    tax = 0;
    total = Math.round((subtotal + extraFees) * 100) / 100;
  }

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cashReceivedNum = parseFloat(cashReceived) || 0;
  const change = cashReceivedNum - total;

  // === Checkout Handler ===
  const handleCheckout = useCallback(async () => {
    if (isCheckingOut) return;
    if (cart.length === 0) {
      showToast('❌ ตะกร้าว่างเปล่า', 'error');
      return;
    }

    if (paymentMethod === 'cash' && cashReceivedNum < total) {
      showToast('❌ จำนวนเงินที่รับไม่เพียงพอ', 'error');
      return;
    }

    setIsCheckingOut(true);

    try {
      const nowIso = new Date().toISOString();
      const { yymm } = getThaiYearMonth(nowIso);
      const prefix = `IVS${yymm}-`;

      const customerObj = customerType === 'general'
        ? {
            name: generalCustomerName.trim() || 'ลูกค้าทั่วไป',
            phone: generalCustomerPhone.trim() || '-',
            address: generalCustomerAddress.trim() || '-',
            taxId: '-'
          }
        : (selectedCustomer || { name: 'ลูกค้าทั่วไป', phone: '-', address: '-', taxId: '-' });

      const cashRecvVal = paymentMethod === 'cash' ? cashReceivedNum : total;
      const changeVal = paymentMethod === 'cash' ? Math.max(0, change) : 0;

      // 1. Atomically allocate unique IVS bill number & insert into 'sales_part' (auto-retries on 7-8 terminal collision)
      const {
        success: saleInsOk,
        id: finalSaleId,
        error: saleErr,
      } = await insertWithUniqueIdRetry({
        table: 'sales_part',
        prefix,
        pad: 3,
        column: 'id',
        buildRow: (candidateId) => ({
          id: candidateId,
          date: nowIso,
          customer_name: customerObj.name,
          customer_phone: customerObj.phone,
          customer_address: customerObj.address,
          customer_tax_id: customerObj.taxId,
          salesperson: selectedSalesperson,
          payment_method: paymentMethod,
          discount_code: appliedDiscount?.code || null,
          discount_amount: discountAmount,
          subtotal: subtotal,
          tax: tax,
          shipping_cost: shippingNum,
          total: total,
          cash_received: cashRecvVal,
          change: changeVal,
          apply_vat: applyVat,
          is_vat_inclusive: isVatInclusive,
        }),
      });

      if (!saleInsOk || saleErr) {
        console.error('Failed to insert parts sale:', saleErr);
        throw saleErr || new Error('ไม่สามารถออกเลขที่บิลขายอะไหล่ได้');
      }

      const saleRecord = {
        id: finalSaleId,
        date: nowIso,
        items: cart.map((item) => ({
          id: item.partCode,
          productId: null,
          partId: item.partId,
          name: item.name,
          barcode: item.partCode,
          unit: item.unit || 'ชิ้น',
          sellPrice: item.sellPrice,
          costPrice: item.costPrice,
          quantity: item.quantity,
          selectedLocation: item.location || 'หน้าร้าน',
        })),
        subtotal,
        discountCode: appliedDiscount?.code || null,
        discountAmount,
        tax,
        shippingCost: shippingNum,
        installationCost: installationNum,
        applyVat,
        isVatInclusive,
        total,
        paymentMethod,
        cashReceived: cashRecvVal,
        change: changeVal,
        storeName,
        customer: customerObj,
        employee: selectedSalesperson,
      };

      // 2. Atomically deduct stock in Supabase 'parts' table via Compare-And-Swap (CAS)
      for (const item of cart) {
        const { error: partErr } = await adjustPartStockAtomic({
          partId: item.partId,
          delta: -Number(item.quantity || 0),
        });
        if (partErr) {
          console.error(`Failed to deduct stock for part ${item.partCode}:`, partErr);
        }
      }

      // 3. Insert into Supabase 'sale_items_part'
      const saleItemsPayload = cart.map((item) => ({
        sale_id: finalSaleId,
        product_id: item.partCode || null,
        product_name: `${item.name} [${item.partCode}]`,
        quantity: item.quantity,
        cost_price: item.costPrice,
        sell_price: item.sellPrice,
        selected_location: item.location || 'หน้าร้าน',
      }));

      const { error: itemsErr } = await supabase.from('sale_items_part').insert(saleItemsPayload);
      if (itemsErr) {
        console.error('Failed to insert parts sale items:', itemsErr);
      }

      // 4. Re-fetch parts so stock reflects immediately
      await fetchParts();

      // 5. Show receipt
      setLastSale(saleRecord);
      setShowReceipt(true);

      // 6. Reset form state
      setCart([]);
      setAppliedDiscount(null);
      setDiscountCode('');
      setDiscountMessage({ text: '', type: '' });
      setCashReceived('');
      setPaymentMethod('cash');
      setSelectedCustomer(null);
      setCustomerType('general');
      setCustomerSearchQuery('');
      setGeneralCustomerName('');
      setGeneralCustomerPhone('');
      setGeneralCustomerAddress('');
      setShowGeneralCustomerFields(false);
      setShippingCost('0');
      setInstallationCost('0');

      showToast(`✅ ขายอะไหล่สำเร็จ — ${finalSaleId}`, 'success');
    } catch (err) {
      console.error('Checkout error:', err);
      showAlert('ข้อผิดพลาด', err.message || 'เกิดข้อผิดพลาดในการบันทึกการขาย', 'error');
    } finally {
      setIsCheckingOut(false);
    }
  }, [
    isCheckingOut,
    cart,
    paymentMethod,
    cashReceivedNum,
    total,
    subtotal,
    discountAmount,
    tax,
    shippingNum,
    installationNum,
    applyVat,
    isVatInclusive,
    appliedDiscount,
    change,
    storeName,
    parts,
    state?.sales,
    customerType,
    generalCustomerName,
    generalCustomerPhone,
    generalCustomerAddress,
    selectedCustomer,
    selectedSalesperson,
    dispatch,
    fetchParts,
    showToast
  ]);

  return (
    <div className="pos-container">
      <Toast message={toast.message} type={toast.type} show={toast.show} />

      {/* ═══════════════════════════════════════════════════════════════════
          LEFT PANEL: PARTS CATALOG
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="pos-products">
        {/* Top Controls Row */}
        <div className="pos-top-row">
          {/* Search Bar */}
          <div className="pos-search" style={{ flex: '2', minWidth: '220px' }}>
            <input
              type="text"
              placeholder="🔍 ค้นหาอะไหล่ (รหัส, ชื่อ, ชนิด, ที่อยู่)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="pos-search-clear"
                onClick={() => setSearchQuery('')}
                title="ล้างคำค้นหา"
              >
                ✕
              </button>
            )}
          </div>

          {/* Local Images Status Toolbar */}
          <LocalImageToolbar />
        </div>

        {/* Category Filter Dropdown */}
        <div style={{ marginBottom: '14px' }}>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 16px',
              background: '#1a1b26',
              border: '2px solid #2e303a',
              borderRadius: '12px',
              color: '#f3f4f6',
              fontSize: '14px',
              outline: 'none',
              cursor: 'pointer',
              boxSizing: 'border-box'
            }}
          >
            <option value="ทั้งหมด">🔩 เลือกหมวดหมู่อะไหล่ทั้งหมด ({parts.length} รายการ)</option>
            {dbCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Parts List (Rows) */}
        <div className="pos-list">
          {isLoadingParts ? (
            <div className="pos-no-results">
              <span className="no-result-text">⏳ กำลังโหลดรายการอะไหล่...</span>
            </div>
          ) : paginatedParts.length > 0 ? (
            paginatedParts.map((part) => {
              const qty = Number(part.quantity || 0);
              const isOut = qty <= 0;
              const isLow = qty > 0 && qty <= 5;
              const pImg = getPartImageUrl(part);

              return (
                <div
                  key={part.id}
                  className={`pos-product-row ${isOut ? 'out-of-stock' : ''} ${
                    justAddedId === part.id ? 'just-added' : ''
                  }`}
                  onClick={() => addToCart(part)}
                  title="คลิกเพื่อเพิ่มลงในตะกร้า"
                >
                  {/* Thumbnail Image */}
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '8px',
                      background: '#1a1b26',
                      overflow: 'hidden',
                      border: '1px solid #334155'
                    }}
                  >
                    {pImg ? (
                      <img
                        src={pImg}
                        alt={part.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          if (e.currentTarget.nextElementSibling) {
                            e.currentTarget.nextElementSibling.style.display = 'inline-block';
                          }
                        }}
                      />
                    ) : null}
                    <span
                      style={{
                        fontSize: '1.4rem',
                        display: pImg ? 'none' : 'inline-block'
                      }}
                    >
                      🔩
                    </span>
                  </div>

                  {/* Part Details */}
                  <div className="product-info-wrapper">
                    <span className="product-name">{part.name}</span>
                    <div
                      style={{
                        display: 'flex',
                        gap: '10px',
                        alignItems: 'center',
                        marginTop: '3px',
                        flexWrap: 'wrap'
                      }}
                    >
                      <span className="product-barcode">{part.part_code}</span>
                      {part.category && (
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#93c5fd',
                            background: 'rgba(59, 130, 246, 0.12)',
                            padding: '1px 6px',
                            borderRadius: '4px'
                          }}
                        >
                          {part.category}
                        </span>
                      )}
                      {part.type && (
                        <span style={{ fontSize: '11px', color: '#cbd5e1' }}>
                          ชนิด: {part.type}
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#a78bfa',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '2px'
                        }}
                      >
                        📍 {part.location || '—'}
                      </span>
                    </div>
                  </div>

                  {/* Price Badges & Stock */}
                  <div className="product-price-wrapper">
                    <div className="price-badge-container">
                      <div className="price-badge cost" title="ราคาต้นทุน">
                        <span className="price-label">ทุน</span>
                        <span className="price-val">฿{(part.cost_price || 0).toLocaleString('th-TH')}</span>
                      </div>
                      <div
                        className={`price-badge branch ${(globalPriceType === 'branch' || globalPriceType === 'dealer') ? 'highlight' : ''}`}
                        title="ราคาตัวแทน"
                        style={(globalPriceType === 'branch' || globalPriceType === 'dealer') ? { border: '1px solid #818cf8', background: 'rgba(99, 102, 241, 0.25)' } : {}}
                      >
                        <span className="price-label">ตัวแทน</span>
                        <span className="price-val">฿{(part.dealer_price || 0).toLocaleString('th-TH')}</span>
                      </div>
                      <div
                        className={`price-badge sell ${globalPriceType === 'sell' ? 'highlight' : ''}`}
                        title="ราคาขายปกติ"
                        style={globalPriceType === 'sell' ? { border: '1px solid #34d399', background: 'rgba(16, 185, 129, 0.25)' } : {}}
                      >
                        <span className="price-label">ขาย</span>
                        <span className="price-val">฿{(part.sell_price || 0).toLocaleString('th-TH')}</span>
                      </div>
                    </div>
                    <div className="stock-container">
                      <span className={`product-stock ${isOut ? 'out' : isLow ? 'low-stock' : ''}`}>
                        {isOut ? '❌ หมด' : `คงเหลือ: ${qty}`}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="pos-no-results">
              <span className="no-result-icon">🔍</span>
              <span className="no-result-text">ไม่พบรายการอะไหล่ที่ค้นหา</span>
            </div>
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div
            className="pos-pagination"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '14px',
              padding: '10px 16px',
              background: '#1a1b26',
              borderRadius: '12px',
              border: '1px solid #2e303a'
            }}
          >
            <span style={{ fontSize: '13px', color: '#9ca3af' }}>
              แสดง <b>{(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredParts.length)}</b> จาก <b>{filteredParts.length}</b> รายการ
            </span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                className="pagination-btn"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                title="หน้าแรก"
              >
                ⏮️
              </button>
              <button
                className="pagination-btn"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                title="หน้าก่อนหน้า"
              >
                ◀️
              </button>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#f3f4f6', padding: '0 8px' }}>
                {currentPage} / {totalPages}
              </span>
              <button
                className="pagination-btn"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                title="หน้าถัดไป"
              >
                ▶️
              </button>
              <button
                className="pagination-btn"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                title="หน้าสุดท้าย"
              >
                ⏭️
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          RIGHT PANEL: CART & CHECKOUT
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="pos-cart">
        {/* Cart Header */}
        <div className="pos-cart-header">
          <h3>
            🛒 ตะกร้าสินค้า{' '}
            {cartCount > 0 && (
              <span className="cart-count-badge">{cartCount}</span>
            )}
          </h3>
          {cart.length > 0 && (
            <button className="btn-clear-cart" onClick={clearCart}>
              🗑️ ล้างตะกร้า
            </button>
          )}
        </div>

        {/* Global Price Type Selector Row */}
        <div className="pos-cart-price-selector-row" style={{
          padding: '10px 20px',
          borderBottom: '1.5px solid #2e303a',
          background: '#161722',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}>
          <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '600' }}>🏷️ เลือกประเภทราคาขาย:</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => handleGlobalPriceTypeChange('sell')}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1.5px solid ' + (globalPriceType === 'sell' ? '#818cf8' : '#2e303a'),
                background: globalPriceType === 'sell' ? 'rgba(129, 140, 248, 0.15)' : '#0f1017',
                color: globalPriceType === 'sell' ? '#a5b4fc' : '#9ca3af',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
                outline: 'none'
              }}
            >
              ราคาขายปกติ
            </button>
            <button
              type="button"
              onClick={() => handleGlobalPriceTypeChange('branch')}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1.5px solid ' + ((globalPriceType === 'branch' || globalPriceType === 'dealer') ? '#818cf8' : '#2e303a'),
                background: (globalPriceType === 'branch' || globalPriceType === 'dealer') ? 'rgba(129, 140, 248, 0.15)' : '#0f1017',
                color: (globalPriceType === 'branch' || globalPriceType === 'dealer') ? '#a5b4fc' : '#9ca3af',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
                outline: 'none'
              }}
            >
              ราคาตัวแทน
            </button>
          </div>
        </div>

        {/* Cart Items */}
        <div className="cart-items">
          {cart.length === 0 ? (
            <div className="cart-empty">
              <span className="cart-empty-icon">🛒</span>
              <span className="cart-empty-text">
                ยังไม่มีสินค้าในตะกร้า
              </span>
              <span className="cart-empty-text">
                เลือกสินค้าจากด้านซ้ายเพื่อเพิ่ม
              </span>
            </div>
          ) : (
            cart.map((item) => {
              return (
                <div key={item.id} className="cart-item">
                  {/* Row 1: Full Item Name + Remove Button */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', width: '100%' }}>
                    <div style={{ fontSize: '13.5px', fontWeight: '600', color: '#f3f4f6', lineHeight: '1.4', wordBreak: 'break-word', flex: 1 }}>
                      {item.name}
                    </div>
                    <button
                      className="cart-item-remove"
                      onClick={() => removeFromCart(item.id)}
                      title="ลบอะไหล่นี้"
                      style={{ flexShrink: 0, marginTop: '-2px' }}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Row 2: Price per Unit / Status + Quantity Controls + Line Total / Custom Price Input */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '6px', width: '100%' }}>
                    <div style={{ fontSize: '12px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {item.isCustomPrice ? (
                        <span style={{ fontSize: '11px', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.12)', padding: '1px 5px', borderRadius: '4px' }}>
                          ✎ กำหนดเอง
                        </span>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#6b7280' }}>/ ชิ้น</span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className="cart-item-controls">
                        <button onClick={() => updateQuantity(item.id, -1)}>
                          −
                        </button>
                        <input
                          key={`${item.id}-${item.quantity}`}
                          className="qty"
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0.001"
                          defaultValue={item.quantity}
                          title="พิมพ์จำนวนได้ รองรับทศนิยม เช่น 0.5"
                          onFocus={(e) => e.target.select()}
                          onBlur={(e) => {
                            const typed = e.target.value;
                            e.target.value = item.quantity;
                            if (Number(typed) !== Number(item.quantity)) setQuantity(item.id, typed);
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                          style={{
                            width: '56px', textAlign: 'center', background: 'transparent',
                            border: '1px solid #2d3148', borderRadius: '6px', color: 'inherit',
                            padding: '2px 4px', fontSize: 'inherit', fontWeight: 'inherit', MozAppearance: 'textfield'
                          }}
                        />
                        <button onClick={() => updateQuantity(item.id, 1)}>
                          +
                        </button>
                      </div>

                      {/* Editable Price Box (ตรงตำแหน่งวงสีแดง) */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '85px' }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            background: '#11121c',
                            border: '1.5px solid #10b981',
                            borderRadius: '6px',
                            padding: '2px 6px',
                            gap: '3px',
                            boxShadow: '0 0 6px rgba(16, 185, 129, 0.25)'
                          }}
                          title="กรอกราคาที่จะขายเองได้ (คลิกเพื่อแก้ไข)"
                        >
                          <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 'bold' }}>฿</span>
                          <input
                            key={`${item.id}-${item.sellPrice}`}
                            type="number"
                            inputMode="decimal"
                            step="any"
                            min="0"
                            defaultValue={item.sellPrice}
                            onFocus={(e) => e.target.select()}
                            onBlur={(e) => {
                              const typed = e.target.value;
                              if (typed !== '' && !isNaN(typed)) {
                                const num = parseFloat(typed);
                                if (num >= 0 && num !== item.sellPrice) {
                                  setItemPrice(item.id, num);
                                }
                              } else {
                                e.target.value = item.sellPrice;
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur();
                            }}
                            style={{
                              width: '68px',
                              textAlign: 'right',
                              background: 'transparent',
                              border: 'none',
                              color: '#34d399',
                              fontSize: '13.5px',
                              fontWeight: '700',
                              outline: 'none',
                              padding: '0',
                              MozAppearance: 'textfield'
                            }}
                          />
                        </div>
                        {Number(item.quantity) > 1 && (
                          <span style={{ fontSize: '10.5px', color: '#9ca3af', marginTop: '2px' }}>
                            รวม ฿{((applyVat && isVatInclusive ? (item.sellPrice * item.quantity) / 1.07 : item.sellPrice * item.quantity)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Row 3: Bottom Location Row */}
                  <div className="cart-item-warehouse-row" style={{ marginTop: '6px' }}>
                    <span>
                      📍 ตำแหน่ง: {item.location || '—'}
                    </span>
                    <span style={{ fontSize: '11.5px', color: '#9ca3af' }}>
                      คงเหลือในคลัง: {item.maxStock} ชิ้น
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Cart Bottom Section */}
        <div className="cart-bottom">
          {/* Customer Selection */}
          <div className="cart-customer-section" style={{
            padding: '8px 12px',
            borderBottom: '1px solid #1e1f2b',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}>
            {/* Segmented Control */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setCustomerType('general');
                  setSelectedCustomer(null);
                  setCustomerSearchQuery('');
                }}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '8px',
                  border: '1.5px solid ' + (customerType === 'general' ? '#10B981' : '#2e303a'),
                  background: customerType === 'general' ? 'rgba(16, 185, 129, 0.1)' : '#1a1b26',
                  color: customerType === 'general' ? '#10B981' : '#9ca3af',
                  fontSize: '12.5px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                👤 ลูกค้าทั่วไป
              </button>
              <button
                type="button"
                onClick={() => {
                  setCustomerType('receipt');
                }}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '8px',
                  border: '1.5px solid ' + (customerType === 'receipt' ? '#10B981' : '#2e303a'),
                  background: customerType === 'receipt' ? 'rgba(16, 185, 129, 0.1)' : '#1a1b26',
                  color: customerType === 'receipt' ? '#10B981' : '#9ca3af',
                  fontSize: '12.5px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                📄 ลูกค้าออกใบเสร็จ
              </button>
            </div>

            {/* General Customer Custom Info Inputs Toggle */}
            {customerType === 'general' && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                marginTop: '2px',
              }}>
                <button
                  type="button"
                  onClick={() => setShowGeneralCustomerFields(!showGeneralCustomerFields)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '8px 12px',
                    background: '#1a1b26',
                    border: '1.5px solid #2e303a',
                    borderRadius: '8px',
                    color: '#9ca3af',
                    fontSize: '12.5px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    outline: 'none',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4f46e5'; e.currentTarget.style.color = '#f3f4f6'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2e303a'; e.currentTarget.style.color = '#9ca3af'; }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ✍️ {generalCustomerName || generalCustomerPhone || generalCustomerAddress ? '📝 แก้ไขข้อมูลลูกค้าเพิ่มเติม' : '➕ ระบุข้อมูลลูกค้าทั่วไปเพิ่ม'}
                  </span>
                  <span style={{ fontSize: '10px' }}>{showGeneralCustomerFields ? '▲' : '▼'}</span>
                </button>

                {showGeneralCustomerFields && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    padding: '8px',
                    background: '#13141f',
                    border: '1.5px solid #2e303a',
                    borderRadius: '8px',
                    marginTop: '2px'
                  }}>
                    <input
                      type="text"
                      placeholder="👤 ชื่อลูกค้า"
                      value={generalCustomerName}
                      onChange={(e) => setGeneralCustomerName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '7px 10px',
                        background: '#1a1b26',
                        border: '1px solid #2e303a',
                        borderRadius: '6px',
                        color: '#f3f4f6',
                        fontSize: '12.5px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <input
                      type="text"
                      placeholder="📞 เบอร์โทรศัพท์"
                      value={generalCustomerPhone}
                      onChange={(e) => setGeneralCustomerPhone(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '7px 10px',
                        background: '#1a1b26',
                        border: '1px solid #2e303a',
                        borderRadius: '6px',
                        color: '#f3f4f6',
                        fontSize: '12.5px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <textarea
                      placeholder="📍 ที่อยู่สำหรับออกบิล/จัดส่ง"
                      value={generalCustomerAddress}
                      onChange={(e) => setGeneralCustomerAddress(e.target.value)}
                      rows={2}
                      style={{
                        width: '100%',
                        padding: '5px 8px',
                        background: '#1a1b26',
                        border: '1px solid #2e303a',
                        borderRadius: '6px',
                        color: '#f3f4f6',
                        fontSize: '12px',
                        outline: 'none',
                        resize: 'none',
                        boxSizing: 'border-box',
                        fontFamily: 'inherit'
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Receipt Customer Search Block */}
            {customerType === 'receipt' && (
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="🔍 พิมพ์ค้นหาลูกค้า (ชื่อ, เบอร์โทร, ID)..."
                  value={selectedCustomer ? `${selectedCustomer.name} (${selectedCustomer.phone})` : customerSearchQuery}
                  onChange={(e) => {
                    setCustomerSearchQuery(e.target.value);
                    if (selectedCustomer) {
                      setSelectedCustomer(null);
                    }
                    setShowCustomerDropdown(true);
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onBlur={() => {
                    setTimeout(() => setShowCustomerDropdown(false), 200);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#1a1b26',
                    border: '1.5px solid #2e303a',
                    borderRadius: '8px',
                    color: '#f3f4f6',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />

                {/* Autocomplete Dropdown List */}
                {showCustomerDropdown && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: '#1e1f2b',
                    border: '1.5px solid #2e303a',
                    borderRadius: '8px',
                    marginTop: '4px',
                    maxHeight: '180px',
                    overflowY: 'auto',
                    zIndex: 10,
                    boxShadow: '0 4px 15px rgba(0,0,0,0.5)'
                  }}>
                    {matchingCustomers.length > 0 ? (
                      matchingCustomers.map((c) => (
                        <div
                          key={c.id}
                          onClick={() => {
                            setSelectedCustomer(c);
                            setShowCustomerDropdown(false);
                          }}
                          style={{
                            padding: '10px 12px',
                            borderBottom: '1px solid #2e303a',
                            cursor: 'pointer',
                            fontSize: '12.5px',
                            color: '#e5e7eb',
                            transition: 'background 0.2s'
                          }}
                          onMouseEnter={(e) => e.target.style.background = '#2e303a'}
                          onMouseLeave={(e) => e.target.style.background = 'transparent'}
                        >
                          <div style={{ fontWeight: '600' }}>{c.name}</div>
                          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                            ID: {c.id} | โทร: {c.phone}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: '10px 12px', fontSize: '12.5px', color: '#9ca3af', textAlign: 'center' }}>
                        ไม่พบรายชื่อลูกค้า
                      </div>
                    )}
                  </div>
                )}

                {/* Selected Customer Details */}
                {selectedCustomer && (
                  <div className="selected-customer-details" style={{ marginTop: '8px' }}>
                    <span className="customer-info-tag">📍 ที่อยู่: {selectedCustomer.address}</span>
                    {selectedCustomer.taxId && <span className="customer-info-tag"> | เลขผู้เสียภาษี: {selectedCustomer.taxId}</span>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Discount */}
          <div className="cart-discount">
            <input
              type="text"
              value={discountCode}
              onChange={(e) => setDiscountCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyDiscount()}
              placeholder="🏷️ ใส่โค้ดส่วนลด"
              className={appliedDiscount ? 'discount-applied' : ''}
              disabled={cart.length === 0}
            />
            <button
              onClick={handleApplyDiscount}
              disabled={cart.length === 0 || !discountCode.trim()}
            >
              ใช้โค้ด
            </button>
          </div>
          {discountMessage.text && (
            <div className={`discount-message ${discountMessage.type}`}>
              {discountMessage.text}
            </div>
          )}

          {/* Shipping, Installation and VAT settings */}
          <div className="cart-shipping-vat" style={{
            display: 'flex',
            gap: '8px',
            padding: '8px 12px',
            borderBottom: '1px solid #1e1f2b',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap'
          }}>
            {/* Shipping Cost Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1', minWidth: '130px' }}>
              <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500', whiteSpace: 'nowrap' }}>🚚 ค่าส่ง:</span>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={shippingCost}
                onChange={(e) => setShippingCost(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: '#1a1b26',
                  border: '1.5px solid #2e303a',
                  borderRadius: '8px',
                  color: '#f3f4f6',
                  fontSize: '13px',
                  outline: 'none',
                  textAlign: 'right'
                }}
              />
            </div>

            {/* Installation Cost Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1', minWidth: '130px' }}>
              <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500', whiteSpace: 'nowrap' }}>🔧 ค่าติดตั้ง:</span>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={installationCost}
                onChange={(e) => setInstallationCost(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: '#1a1b26',
                  border: '1.5px solid #2e303a',
                  borderRadius: '8px',
                  color: '#f3f4f6',
                  fontSize: '13px',
                  outline: 'none',
                  textAlign: 'right'
                }}
              />
            </div>

            {/* VAT Checkbox Toggle */}
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              userSelect: 'none',
              fontSize: '13px',
              color: '#9ca3af',
              fontWeight: '500',
              padding: '8px 12px',
              background: applyVat ? 'rgba(99, 102, 241, 0.1)' : '#1a1b26',
              border: '1.5px solid ' + (applyVat ? '#6366f1' : '#2e303a'),
              borderRadius: '8px',
              transition: 'all 0.2s',
              height: '38px',
              boxSizing: 'border-box'
            }}>
              <input
                type="checkbox"
                checked={applyVat}
                onChange={(e) => setApplyVat(e.target.checked)}
                style={{
                  cursor: 'pointer',
                  accentColor: '#6366f1'
                }}
              />
              คิดภาษี (VAT 7%)
            </label>
          </div>

          {/* Summary */}
          <div className="cart-summary">
            <div className="cart-summary-row">
              <span>ยอดรวมสินค้า ({cartCount} ชิ้น)</span>
              <span>
                ฿{subtotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </span>
            </div>
            {discountAmount > 0 && (
              <div className="cart-summary-row discount">
                <span>
                  ส่วนลด{' '}
                  {appliedDiscount?.code && `(${appliedDiscount.code})`}
                </span>
                <span>
                  -฿
                  {discountAmount.toLocaleString('th-TH', {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            )}
            {shippingNum > 0 && (
              <div className="cart-summary-row" style={{ color: '#e5e7eb' }}>
                <span>🚚 ค่าส่ง</span>
                <span>
                  ฿{shippingNum.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
            {installationNum > 0 && (
              <div className="cart-summary-row" style={{ color: '#e5e7eb' }}>
                <span>🔧 ค่าติดตั้ง</span>
                <span>
                  ฿{installationNum.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
            {applyVat && (
              <div className="cart-summary-row tax">
                <span>ภาษีมูลค่าเพิ่ม (7%)</span>
                <span>
                  ฿{tax.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
            <div className="cart-total-row">
              <span className="cart-total-label">ยอดสุทธิ</span>
              <span className="cart-total-amount">
                ฿{total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="payment-methods">
            <button
              className={paymentMethod === 'cash' ? 'active' : ''}
              onClick={() => setPaymentMethod('cash')}
            >
              💵 เงินสด
            </button>
            <button
              className={paymentMethod === 'qr' ? 'active' : ''}
              onClick={() => setPaymentMethod('qr')}
            >
              📱 QR Code
            </button>
          </div>

          {/* Cash Input */}
          {paymentMethod === 'cash' && (
            <>
              <div className="cash-input">
                <input
                  type="number"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  placeholder="จำนวนเงินที่รับ (บาท)"
                  min="0"
                />
                <div
                  className={`cash-change ${
                    change >= 0 ? 'positive' : 'negative'
                  }`}
                >
                  เงินทอน: ฿
                  {cashReceivedNum > 0
                    ? Math.max(0, change).toLocaleString('th-TH', {
                        minimumFractionDigits: 2,
                      })
                    : '0.00'}
                </div>
              </div>
              <div className="quick-cash">
                {quickCashAmounts.map((amount) => (
                  <button
                    key={amount}
                    onClick={() => setCashReceived(String(amount))}
                  >
                    ฿{amount}
                  </button>
                ))}
                <button onClick={() => setCashReceived(String(Math.ceil(total / 100) * 100 || '0'))}>
                  พอดี
                </button>
              </div>
            </>
          )}

          {/* Checkout Button */}
          <button
            className="btn-checkout"
            onClick={handleCheckout}
            disabled={
              cart.length === 0 ||
              (paymentMethod === 'cash' && cashReceivedNum < total && cashReceivedNum > 0) ||
              (paymentMethod === 'cash' && !cashReceivedNum && total > 0) ||
              isCheckingOut
            }
          >
            {isCheckingOut ? '⏳ กำลังบันทึก...' : `✅ ชำระเงิน — ฿${total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`}
          </button>
        </div>
      </div>

      {/* Receipt Modal */}
      {showReceipt && lastSale && (
        <Receipt sale={lastSale} onClose={() => setShowReceipt(false)} />
      )}
    </div>
  );
};

export default PartsPOS;
