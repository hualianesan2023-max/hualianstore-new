import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../data/store';
import Receipt from '../components/Receipt';
import './POS.css';

// ===== Generate unique sale ID =====
const generateSaleId = (existingSales = []) => {
  const now = new Date();
  const beYear = now.getFullYear() + 543;
  const yearStr = String(beYear).slice(-2); // e.g. "69"
  const monthStr = String(now.getMonth() + 1).padStart(2, '0'); // e.g. "06"
  const prefix = `IV${yearStr}${monthStr}-`; // e.g. "IV6906-"

  // Find all sales with ID matching the prefix
  const salesInMonth = (existingSales || [])
    .filter(sale => sale.id && sale.id.startsWith(prefix));

  let maxNum = 0;
  salesInMonth.forEach(sale => {
    const numPart = sale.id.slice(prefix.length);
    const parsed = parseInt(numPart, 10);
    if (!isNaN(parsed) && parsed > maxNum) {
      maxNum = parsed;
    }
  });

  const nextNum = maxNum + 1;
  const runningStr = String(nextNum).padStart(3, '0'); // e.g. "001"
  return `${prefix}${runningStr}`;
};

// ===== Toast Component =====
const Toast = ({ message, type, show }) => (
  <div className={`pos-toast ${type} ${show ? 'show' : ''}`}>
    {message}
  </div>
);

// ===== POS Component =====
const POS = () => {
  const { state, dispatch } = useStore();
  const { products = [], categories = [], promotions = [], storeInfo = {}, customers = [] } = state || {};
  const storeName = storeInfo.name || 'ร้านค้า';
  const taxRate = (storeInfo.taxRate || 7) / 100;

  // Convert promotions array to a promoCodes lookup map
  const promoCodes = React.useMemo(() => {
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

  // === State ===
  const [cart, setCart] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ทั้งหมด');
  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [discountMessage, setDiscountMessage] = useState({ text: '', type: '' });
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [justAddedId, setJustAddedId] = useState(null);
  const [toast, setToast] = useState({ message: '', type: 'success', show: false });
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerType, setCustomerType] = useState('general'); // 'general' or 'receipt'
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [generalCustomerName, setGeneralCustomerName] = useState('');
  const [generalCustomerPhone, setGeneralCustomerPhone] = useState('');
  const [generalCustomerAddress, setGeneralCustomerAddress] = useState('');
  const [showGeneralCustomerFields, setShowGeneralCustomerFields] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [shippingCost, setShippingCost] = useState('0');
  const [applyVat, setApplyVat] = useState(true);
  const [selectedSalesperson, setSelectedSalesperson] = useState('หน้าร้าน');
  const [globalPriceType, setGlobalPriceType] = useState('sell');

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, searchQuery]);

  const handleGlobalPriceTypeChange = (newType) => {
    setGlobalPriceType(newType);
    setCart((prevCart) =>
      prevCart.map((item) => {
        const product = normalisedProducts.find((p) => p.id === item.productId) || {};
        return {
          ...item,
          priceType: newType,
          sellPrice: newType === 'branch' ? (item.branchPrice || product.branchPrice || product.sellPrice) : (product.sellPrice || item.sellPrice),
        };
      })
    );
  };


  const matchingCustomers = React.useMemo(() => {
    const q = customerSearchQuery.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q)) ||
      (c.id && c.id.toLowerCase().includes(q))
    );
  }, [customers, customerSearchQuery]);

  const searchRef = useRef(null);

  // === Auto-focus search input ===
  useEffect(() => {
    if (searchRef.current) {
      searchRef.current.focus();
    }
  }, []);

  // === Toast helper ===
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, show: true });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 2500);
  }, []);

  // === Normalise all products globally for lookup stability ===
  const normalisedProducts = React.useMemo(() => {
    return products.map((p) => {
      const stockOffice = Number(p.stockOffice ?? (p.location === 'ออฟฟิศ' ? (p.stock ?? 0) : 0));
      const stockKookkai = Number(p.stockKookkai ?? (p.location === 'โกดังกุ๊กไก่' ? (p.stock ?? 0) : 0));
      const stockBig = Number(p.stockBig ?? (p.location === 'โกดังใหญ่' || !p.location ? (p.stock ?? 0) : 0));
      const totalStock = stockOffice + stockKookkai + stockBig;
      return {
        ...p,
        stockOffice,
        stockKookkai,
        stockBig,
        stock: totalStock,
      };
    });
  }, [products]);

  // === Filter and normalise products ===
  const filteredProducts = React.useMemo(() => {
    return normalisedProducts.filter((product) => {
      const matchesCategory =
        selectedCategory === 'ทั้งหมด' || product.category === selectedCategory;
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        product.barcode.includes(query) ||
        product.id.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [normalisedProducts, selectedCategory, searchQuery]);

  const paginatedProducts = React.useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage) || 1;

  // === Handle search with barcode auto-add ===
  const handleSearch = (e) => {
    const value = e.target.value;
    setSearchQuery(value);

    // Auto-add if exact barcode match
    if (value.trim().length >= 8) {
      const barcodeMatch = normalisedProducts.find(
        (p) => p.barcode === value.trim()
      );
      if (barcodeMatch) {
        addToCart(barcodeMatch);
        setSearchQuery('');
        showToast(`✅ สแกน: ${barcodeMatch.name} เพิ่มแล้ว`, 'success');
      }
    }
  };

  // === Add to cart ===
  const addToCart = useCallback(
    (product) => {
      if (product.stock <= 0) {
        showToast(`❌ ${product.name} สินค้าหมด`, 'error');
        return;
      }

      // Determine default warehouse location with stock
      let defaultLoc = 'โกดังใหญ่';
      let maxStock = 0;
      if (product.stockBig > 0) {
        defaultLoc = 'โกดังใหญ่';
        maxStock = product.stockBig;
      } else if (product.stockKookkai > 0) {
        defaultLoc = 'โกดังกุ๊กไก่';
        maxStock = product.stockKookkai;
      } else if (product.stockOffice > 0) {
        defaultLoc = 'ออฟฟิศ';
        maxStock = product.stockOffice;
      } else {
        defaultLoc = 'โกดังใหญ่';
        maxStock = product.stockBig || 0;
      }

      const cartItemId = `${product.id}-${defaultLoc}`;

      setCart((prevCart) => {
        const existing = prevCart.find((item) => item.id === cartItemId);
        if (existing) {
          if (existing.quantity >= maxStock) {
            showToast(`⚠️ คลัง${defaultLoc} สต็อกไม่เพียงพอ (คงเหลือ ${maxStock} ชิ้น)`, 'error');
            return prevCart;
          }
          return prevCart.map((item) =>
            item.id === cartItemId
              ? { ...item, quantity: item.quantity + 1 }
              : item
          );
        }
        return [
          ...prevCart,
          {
            id: cartItemId,
            productId: product.id,
            name: product.name,
            sellPrice: globalPriceType === 'branch' ? (product.branchPrice || product.sellPrice) : product.sellPrice,
            branchPrice: product.branchPrice || product.sellPrice,
            costPrice: product.costPrice,
            image: product.image,
            quantity: 1,
            barcode: product.barcode,
            selectedLocation: defaultLoc,
            priceType: globalPriceType,
          },
        ];
      });

      // Pulse animation
      setJustAddedId(product.id);
      setTimeout(() => setJustAddedId(null), 500);
    },
    [normalisedProducts, showToast, globalPriceType]
  );

  // === Update quantity ===
  const updateQuantity = useCallback(
    (cartItemId, delta) => {
      setCart((prevCart) => {
        return prevCart
          .map((item) => {
            if (item.id !== cartItemId) return item;
            const newQty = item.quantity + delta;
            const product = normalisedProducts.find((p) => p.id === item.productId);
            if (!product) return item;

            // Get stock limit for the chosen warehouse location
            let maxStock = 0;
            const loc = item.selectedLocation;
            if (loc === 'โกดังใหญ่') maxStock = product.stockBig;
            else if (loc === 'โกดังกุ๊กไก่') maxStock = product.stockKookkai;
            else if (loc === 'ออฟฟิศ') maxStock = product.stockOffice;

            if (newQty > maxStock) {
              showToast(`⚠️ คลัง${loc} สต็อกคงเหลือ: ${maxStock} ชิ้น`, 'error');
              return item;
            }
            return { ...item, quantity: newQty };
          })
          .filter((item) => item.quantity > 0);
      });
    },
    [normalisedProducts, showToast]
  );

  // === Change warehouse for a cart item ===
  const handleWarehouseChange = useCallback(
    (cartItemId, newLocation) => {
      setCart((prevCart) => {
        const item = prevCart.find((i) => i.id === cartItemId);
        if (!item) return prevCart;

        const product = normalisedProducts.find((p) => p.id === item.productId);
        if (!product) return prevCart;

        // Check stock limit in the new warehouse
        let maxStock = 0;
        if (newLocation === 'โกดังใหญ่') maxStock = product.stockBig;
        else if (newLocation === 'โกดังกุ๊กไก่') maxStock = product.stockKookkai;
        else if (newLocation === 'ออฟฟิศ') maxStock = product.stockOffice;

        if (item.quantity > maxStock) {
          showToast(`❌ คลัง${newLocation} มีสต็อกไม่เพียงพอ (คงเหลือ ${maxStock} ชิ้น)`, 'error');
          return prevCart;
        }

        const newCartItemId = `${item.productId}-${newLocation}`;
        
        // If a cart item with the target location already exists (other than the current item itself),
        // merge them together.
        const existingItem = prevCart.find((i) => i.id === newCartItemId);
        if (existingItem && existingItem.id !== cartItemId) {
          const mergedQty = existingItem.quantity + item.quantity;
          if (mergedQty > maxStock) {
            showToast(`❌ ไม่สามารถรวมคลังได้เนื่องจากจำนวนรวม (${mergedQty} ชิ้น) เกินสต็อกคลัง${newLocation} (${maxStock} ชิ้น)`, 'error');
            return prevCart;
          }
          
          showToast(`💼 ยุบรวมสินค้าคลัง${newLocation} เข้าด้วยกัน`, 'success');
          return prevCart
            .map((i) => {
              if (i.id === newCartItemId) {
                return { ...i, quantity: mergedQty };
              }
              return i;
            })
            .filter((i) => i.id !== cartItemId);
        }

        // Otherwise, just update the location and the cart item id
        return prevCart.map((i) => {
          if (i.id === cartItemId) {
            return {
              ...i,
              id: newCartItemId,
              selectedLocation: newLocation,
            };
          }
          return i;
        });
      });
    },
    [normalisedProducts, showToast]
  );

  // === Remove from cart ===
  const removeFromCart = useCallback((productId) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== productId));
  }, []);

  // === Clear cart ===
  const clearCart = useCallback(() => {
    setCart([]);
    setAppliedDiscount(null);
    setDiscountCode('');
    setDiscountMessage({ text: '', type: '' });
    setCashReceived('');
    setSelectedCustomer(null);
    setCustomerType('general');
    setCustomerSearchQuery('');
    setGeneralCustomerName('');
    setGeneralCustomerPhone('');
    setGeneralCustomerAddress('');
    setShowGeneralCustomerFields(false);
    setShippingCost('0');
    setApplyVat(true);
    setGlobalPriceType('sell');
  }, []);

  // === Apply discount ===
  const applyDiscount = useCallback(() => {
    const code = discountCode.trim().toUpperCase();
    if (!code) {
      setDiscountMessage({ text: '⚠️ กรุณาใส่โค้ดส่วนลด', type: 'error' });
      return;
    }

    const promo = promoCodes[code];
    if (!promo) {
      setDiscountMessage({ text: '❌ โค้ดส่วนลดไม่ถูกต้อง', type: 'error' });
      setAppliedDiscount(null);
      return;
    }

    setAppliedDiscount({ code, ...promo });
    setDiscountMessage({
      text: `✅ ใช้โค้ดสำเร็จ: ${promo.description}`,
      type: 'success',
    });
    showToast(`🎉 ใช้โค้ด ${code} สำเร็จ — ${promo.description}`, 'success');
  }, [discountCode, promoCodes, showToast]);

  // === Calculate totals ===
  const isVatInclusive = customerType === 'general';
  const catalogSubtotal = cart.reduce(
    (sum, item) => sum + item.sellPrice * item.quantity,
    0
  );

  const discountAmount = appliedDiscount
    ? appliedDiscount.type === 'percent'
      ? Math.round((catalogSubtotal * appliedDiscount.value) / 100)
      : Math.min(appliedDiscount.value, catalogSubtotal)
    : 0;

  const afterDiscountCatalog = catalogSubtotal - discountAmount;
  const shippingNum = parseFloat(shippingCost) || 0;

  let subtotal, tax, total;

  if (applyVat) {
    if (isVatInclusive) {
      // VAT Inclusive (Vat ใน)
      total = Math.round((afterDiscountCatalog + shippingNum) * 100) / 100;
      subtotal = Math.round((total / 1.07) * 100) / 100;
      tax = Math.round((total - subtotal) * 100) / 100;
    } else {
      // VAT Exclusive (Vat นอก)
      subtotal = afterDiscountCatalog;
      tax = Math.round(subtotal * taxRate * 100) / 100;
      total = Math.round((subtotal + tax + shippingNum) * 100) / 100;
    }
  } else {
    // No VAT
    subtotal = afterDiscountCatalog;
    tax = 0;
    total = Math.round((subtotal + shippingNum) * 100) / 100;
  }

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cashReceivedNum = parseFloat(cashReceived) || 0;
  const change = cashReceivedNum - total;

  // === Handle Checkout ===
  const handleCheckout = useCallback(() => {
    if (cart.length === 0) {
      showToast('❌ ตะกร้าว่างเปล่า', 'error');
      return;
    }

    if (paymentMethod === 'cash' && cashReceivedNum < total) {
      showToast('❌ จำนวนเงินที่รับไม่เพียงพอ', 'error');
      return;
    }

    // Create sale record
    const saleId = generateSaleId(state?.sales);
    const saleRecord = {
      id: saleId,
      date: new Date().toISOString(),
      items: cart.map((item) => ({
        id: item.productId,
        productId: item.productId,
        name: item.name,
        sellPrice: item.sellPrice,
        costPrice: item.costPrice,
        image: item.image,
        quantity: item.quantity,
        barcode: item.barcode,
        selectedLocation: item.selectedLocation,
      })),
      subtotal,
      discountCode: appliedDiscount?.code || null,
      discountAmount,
      tax,
      shippingCost: shippingNum,
      applyVat,
      isVatInclusive,
      total,
      paymentMethod,
      cashReceived: paymentMethod === 'cash' ? cashReceivedNum : total,
      change: paymentMethod === 'cash' ? Math.max(0, change) : 0,
      storeName,
      customer: customerType === 'general'
        ? {
            name: generalCustomerName.trim() || 'ลูกค้าทั่วไป',
            phone: generalCustomerPhone.trim() || '-',
            address: generalCustomerAddress.trim() || '-',
            taxId: '-'
          }
        : selectedCustomer,
      employee: selectedSalesperson,
    };

    // Dispatch sale
    dispatch({ type: 'ADD_SALE', payload: saleRecord });

    // Show receipt
    setLastSale(saleRecord);
    setShowReceipt(true);

    // Reset cart state
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
    setSelectedSalesperson('หน้าร้าน');
    setGlobalPriceType('sell');

    showToast(`✅ ขายสำเร็จ — ${saleId}`, 'success');
  }, [
    cart,
    paymentMethod,
    cashReceivedNum,
    total,
    subtotal,
    discountAmount,
    tax,
    isVatInclusive,
    appliedDiscount,
    change,
    storeName,
    dispatch,
    showToast,
    selectedCustomer,
    selectedSalesperson,
    state?.currentUser?.name,
    customerType,
    generalCustomerName,
    generalCustomerPhone,
    generalCustomerAddress,
  ]);

  // === Quick cash amounts ===
  const quickCashAmounts = [20, 50, 100, 500, 1000];

  return (
    <div className="pos-container">
      {/* ====== Left Panel — Products ====== */}
      <div className="pos-products">
        {/* Top Header Row: Search + Salesperson Select */}
        <div className="pos-top-row">
          <div className="pos-search">
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={handleSearch}
              placeholder="ค้นหาสินค้า หรือ สแกนบาร์โค้ด..."
            />
          </div>
          <div className="pos-salesperson-select">
            <select
              value={selectedSalesperson}
              onChange={(e) => setSelectedSalesperson(e.target.value)}
            >
              <option value="หน้าร้าน">🏪 หน้าร้าน (Default)</option>
              <option value="Shopee">🛍️ Shopee</option>
              <option value="Tiktok">🎵 Tiktok</option>
              <option value="เพจ">📱 เพจ</option>
              <option value="สายฝน(ฝน)">👩‍💼 สายฝน(ฝน)</option>
              <option value="สุบิน(ต๋อง)">👨‍💼 สุบิน(ต๋อง)</option>
              <option value="ชฎาพร(แก้ม)">👩‍💼 ชฎาพร(แก้ม)</option>
              <option value="โชคชัย(เอ็ก)">👨‍💼 โชคชัย(เอ็ก)</option>
              <option value="เกียรติชัย (พี่เกียรติ)">👨‍💼 เกียรติชัย (พี่เกียรติ)</option>
              <option value="พรหมโชติ(แซมมี่)">👩‍💼 พรหมโชติ(แซมมี่)</option>
            </select>
          </div>
        </div>

        {/* Category Dropdown */}
        <div className="pos-categories-dropdown" style={{ marginBottom: '16px' }}>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{
              width: '100%',
              padding: '14px 16px',
              background: '#1a1b26',
              border: '2px solid #2e303a',
              borderRadius: '14px',
              color: '#f3f4f6',
              fontSize: '15px',
              outline: 'none',
              cursor: 'pointer',
              boxSizing: 'border-box'
            }}
          >
            <option value="ทั้งหมด">📦 เลือกประเภทเครื่องจักรทั้งหมด</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.icon} {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Products List (Vertical Row Layout) */}
        <div className="pos-list">
          {paginatedProducts.length > 0 ? (
            paginatedProducts.map((product) => (
              <div
                key={product.id}
                className={`pos-product-row ${
                  product.stock <= 0 ? 'out-of-stock' : ''
                } ${justAddedId === product.id ? 'just-added' : ''}`}
                onClick={() => addToCart(product)}
              >
                <span className="product-emoji">{product.image}</span>
                <div className="product-info-wrapper">
                  <span className="product-name">{product.name}</span>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '3px', flexWrap: 'wrap' }}>
                    <span className="product-barcode">{product.barcode || '—'}</span>
                    <span style={{ fontSize: '11px', color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                      💼 ออฟฟิศ: <strong style={{ color: product.stockOffice > 0 ? '#f1f5f9' : '#64748b' }}>{product.stockOffice}</strong>
                    </span>
                    <span style={{ fontSize: '11px', color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                      🐓 กุ๊กไก่: <strong style={{ color: product.stockKookkai > 0 ? '#f1f5f9' : '#64748b' }}>{product.stockKookkai}</strong>
                    </span>
                    <span style={{ fontSize: '11px', color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                      🏢 ใหญ่: <strong style={{ color: product.stockBig > 0 ? '#f1f5f9' : '#64748b' }}>{product.stockBig}</strong>
                    </span>
                  </div>
                </div>
                <div className="product-price-wrapper">
                  <span className="product-price">
                    ฿{product.sellPrice.toLocaleString()}
                  </span>
                  <span style={{ fontSize: '11px', color: '#818cf8', fontWeight: '600', marginTop: '2px' }}>
                    สาขา: ฿{product.branchPrice?.toLocaleString() || product.sellPrice?.toLocaleString()}
                  </span>
                  <span
                    className={`product-stock ${
                      product.stock <= 10 && product.stock > 0
                        ? 'low-stock'
                        : ''
                    }`}
                    style={{ marginTop: '2px' }}
                  >
                    {product.stock <= 0
                      ? 'สินค้าหมด'
                      : `คงเหลือ: ${product.stock}`}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="pos-no-results">
              <span className="no-result-icon">🔍</span>
              <span className="no-result-text">
                ไม่พบสินค้าที่ค้นหา
              </span>
            </div>
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="pos-pagination" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '16px',
            padding: '12px 16px',
            background: '#1a1b26',
            border: '2px solid #2e303a',
            borderRadius: '14px',
            boxSizing: 'border-box'
          }}>
            <button
              className="btn"
              disabled={currentPage === 1}
              onClick={() => {
                setCurrentPage(prev => Math.max(prev - 1, 1));
                // Scroll to top of POS list on page change
                const posList = document.querySelector('.pos-list');
                if (posList) posList.scrollTop = 0;
              }}
              style={{
                padding: '8px 16px',
                background: currentPage === 1 ? '#1f2937' : '#4f46e5',
                color: currentPage === 1 ? '#9ca3af' : '#ffffff',
                border: 'none',
                borderRadius: '8px',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                outline: 'none'
              }}
            >
              ⬅️ ย้อนกลับ
            </button>
            <span style={{ color: '#f3f4f6', fontSize: '13px', fontWeight: '600', textAlign: 'center' }}>
              หน้า {currentPage} / {totalPages} (ทั้งหมด {filteredProducts.length} รายการ)
            </span>
            <button
              className="btn"
              disabled={currentPage === totalPages}
              onClick={() => {
                setCurrentPage(prev => Math.min(prev + 1, totalPages));
                // Scroll to top of POS list on page change
                const posList = document.querySelector('.pos-list');
                if (posList) posList.scrollTop = 0;
              }}
              style={{
                padding: '8px 16px',
                background: currentPage === totalPages ? '#1f2937' : '#4f46e5',
                color: currentPage === totalPages ? '#9ca3af' : '#ffffff',
                border: 'none',
                borderRadius: '8px',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                outline: 'none'
              }}
            >
              ถัดไป ➡️
            </button>
          </div>
        )}
      </div>

      {/* ====== Right Panel — Cart ====== */}
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
                border: '1.5px solid ' + (globalPriceType === 'branch' ? '#818cf8' : '#2e303a'),
                background: globalPriceType === 'branch' ? 'rgba(129, 140, 248, 0.15)' : '#0f1017',
                color: globalPriceType === 'branch' ? '#a5b4fc' : '#9ca3af',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
                outline: 'none'
              }}
            >
              ราคาสาขา
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
              const product = normalisedProducts.find((p) => p.id === item.productId) || {};
              const stockOffice = Number(product.stockOffice || 0);
              const stockKookkai = Number(product.stockKookkai || 0);
              const stockBig = Number(product.stockBig || 0);

              return (
                <div key={item.id} className="cart-item">
                  {/* Top Item Row */}
                  <div className="cart-item-row">
                    <span className="cart-item-emoji">{item.image}</span>
                    <div className="cart-item-info">
                      <div className="cart-item-name">{item.name}</div>
                      <div className="cart-item-price" style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                        <div>
                          ฿{(applyVat && isVatInclusive ? item.sellPrice / 1.07 : item.sellPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / ชิ้น
                        </div>
                        {/* Price Type Selector */}
                        <div style={{ marginTop: '1px' }} onClick={(e) => e.stopPropagation()}>
                          <select
                            value={item.priceType || 'sell'}
                            onChange={(e) => {
                              const newType = e.target.value;
                              setCart(prev => prev.map(i => i.id === item.id ? {
                                ...i,
                                priceType: newType,
                                sellPrice: newType === 'branch' ? i.branchPrice : product.sellPrice
                              } : i));
                            }}
                            style={{
                              background: '#0f1017',
                              border: '1px solid #2e303a',
                              borderRadius: '6px',
                              color: '#a5b4fc',
                              fontSize: '11px',
                              padding: '2px 6px',
                              outline: 'none',
                              cursor: 'pointer'
                            }}
                          >
                            <option value="sell">ราคาปกติ (฿{product.sellPrice?.toLocaleString()})</option>
                            <option value="branch">ราคาสาขา (฿{product.branchPrice?.toLocaleString()})</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="cart-item-controls">
                      <button onClick={() => updateQuantity(item.id, -1)}>
                        −
                      </button>
                      <span className="qty">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, 1)}>
                        +
                      </button>
                    </div>
                    <div className="cart-item-total">
                      ฿{(applyVat && isVatInclusive ? (item.sellPrice * item.quantity) / 1.07 : item.sellPrice * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <button
                      className="cart-item-remove"
                      onClick={() => removeFromCart(item.id)}
                      title="ลบสินค้า"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Bottom Warehouse Selector Row */}
                  <div className="cart-item-warehouse-row">
                    <span>
                      📍 หักสต็อกคลัง:
                    </span>
                    <select
                      value={item.selectedLocation}
                      onChange={(e) => handleWarehouseChange(item.id, e.target.value)}
                    >
                      <option value="โกดังใหญ่" disabled={stockBig <= 0 && item.selectedLocation !== 'โกดังใหญ่'}>
                        🏢 โกดังใหญ่ (คงเหลือ: {stockBig})
                      </option>
                      <option value="โกดังกุ๊กไก่" disabled={stockKookkai <= 0 && item.selectedLocation !== 'โกดังกุ๊กไก่'}>
                        🐓 กุ๊กไก่ (คงเหลือ: {stockKookkai})
                      </option>
                      <option value="ออฟฟิศ" disabled={stockOffice <= 0 && item.selectedLocation !== 'ออฟฟิศ'}>
                        💼 ออฟฟิศ (คงเหลือ: {stockOffice})
                      </option>
                    </select>
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
            padding: '12px 16px',
            borderBottom: '1px solid #1e1f2b',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            {/* Segmented Control */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setCustomerType('general');
                  setSelectedCustomer(null);
                  setCustomerSearchQuery('');
                  setApplyVat(true);
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
                disabled={cart.length === 0}
              >
                👤 ลูกค้าทั่วไป
              </button>
              <button
                type="button"
                onClick={() => {
                  setCustomerType('receipt');
                  setApplyVat(true);
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
                disabled={cart.length === 0}
              >
                📄 ลูกค้าออกใบเสร็จ
              </button>
            </div>

            {/* General Customer Custom Info Inputs Toggle */}
            {customerType === 'general' && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                marginTop: '4px',
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
                  disabled={cart.length === 0}
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
                    gap: '6px',
                    padding: '10px',
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
                        padding: '7px 10px',
                        background: '#1a1b26',
                        border: '1px solid #2e303a',
                        borderRadius: '6px',
                        color: '#f3f4f6',
                        fontSize: '12.5px',
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
                      setSelectedCustomer(null); // Clear selection if typing continues
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
                  disabled={cart.length === 0}
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
              onKeyDown={(e) => e.key === 'Enter' && applyDiscount()}
              placeholder="🏷️ ใส่โค้ดส่วนลด"
              className={appliedDiscount ? 'discount-applied' : ''}
              disabled={cart.length === 0}
            />
            <button
              onClick={applyDiscount}
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

          {/* Shipping and VAT settings */}
          <div className="cart-shipping-vat" style={{
            display: 'flex',
            gap: '12px',
            padding: '12px 16px',
            borderBottom: '1px solid #1e1f2b',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap'
          }}>
            {/* Shipping Cost Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1', minWidth: '150px' }}>
              <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: '500', whiteSpace: 'nowrap' }}>🚚 ค่าจัดส่ง:</span>
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
                disabled={cart.length === 0}
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
                disabled={cart.length === 0}
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
            {applyVat && (
              <div className="cart-summary-row tax">
                <span>ภาษีมูลค่าเพิ่ม (7%)</span>
                <span>
                  ฿{tax.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
            {shippingNum > 0 && (
              <div className="cart-summary-row" style={{ color: '#e5e7eb' }}>
                <span>ค่าจัดส่ง</span>
                <span>
                  ฿{shippingNum.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
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
                <button onClick={() => setCashReceived(String(Math.ceil(total / 100) * 100))}>
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
              (paymentMethod === 'cash' && cashReceivedNum < total && cashReceivedNum > 0)
            }
          >
            ✅ ชำระเงิน — ฿
            {total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
          </button>
        </div>
      </div>

      {/* Receipt Modal */}
      {showReceipt && (
        <Receipt sale={lastSale} onClose={() => setShowReceipt(false)} />
      )}

      {/* Toast */}
      <Toast
        message={toast.message}
        type={toast.type}
        show={toast.show}
      />
    </div>
  );
};

export default POS;
