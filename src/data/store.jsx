import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo } from 'react';
import { supabase } from './supabaseClient';

// ======================================
// Actions
// ======================================
export const ACTIONS = {
  SET_PRODUCTS: 'SET_PRODUCTS',
  ADD_PRODUCT: 'ADD_PRODUCT',
  UPDATE_PRODUCT: 'UPDATE_PRODUCT',
  DELETE_PRODUCT: 'DELETE_PRODUCT',
  UPDATE_STOCK: 'UPDATE_STOCK',
  ADD_SALE: 'ADD_SALE',
  SET_SALES: 'SET_SALES',
  UPDATE_STORE_INFO: 'UPDATE_STORE_INFO',
  ADD_PROMOTION: 'ADD_PROMOTION',
  UPDATE_PROMOTION: 'UPDATE_PROMOTION',
  DELETE_PROMOTION: 'DELETE_PROMOTION',
  SET_PROMOTIONS: 'SET_PROMOTIONS',
  SET_CATEGORIES: 'SET_CATEGORIES',
  ADD_CATEGORY: 'ADD_CATEGORY',
  UPDATE_CATEGORY: 'UPDATE_CATEGORY',
  DELETE_CATEGORY: 'DELETE_CATEGORY',
  LOGIN_USER: 'LOGIN_USER',
  LOGOUT_USER: 'LOGOUT_USER',
  ADD_CUSTOMER: 'ADD_CUSTOMER',
  UPDATE_CUSTOMER: 'UPDATE_CUSTOMER',
  DELETE_CUSTOMER: 'DELETE_CUSTOMER',
  SET_CUSTOMERS: 'SET_CUSTOMERS',
  ADD_USER: 'ADD_USER',
  UPDATE_USER: 'UPDATE_USER',
  DELETE_USER: 'DELETE_USER',
  SET_USERS: 'SET_USERS',
};

const STORAGE_KEY = 'pos_store_state';

// ======================================
// Load initial state (Blank Skeleton State + Persisted Session)
// ======================================
function loadInitialState() {
  let currentUser = null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      currentUser = parsed.currentUser || null;
    }
  } catch (err) {
    console.warn('ไม่สามารถโหลดข้อมูลเซสชันผู้ใช้ได้:', err);
  }

  return {
    products: [],
    sales: [],
    promotions: [],
    storeInfo: {
      name: 'ห้างหุ้นส่วนจำกัด หัวเหรียญ อีสาน HUALIAN ESAN LTD.,PART.',
      address: 'สำนักงานใหญ่ : 841/7 หมู่ 5 ต.หนองจะบก อ.เมืองนครราชสีมา จ.นครราชสีมา 30000',
      phone: '044-002716 , 084-1844310 (บัญชี) แฟ็ก. 044-248869',
      taxId: '0303547004494',
      taxRate: 7,
    },
    categories: [],
    branches: [{ id: 'main', name: 'สำนักงานใหญ่ (นครราชสีมา)' }],
    customers: [],
    currentUser,
    users: [],
  };
}

// ======================================
// Reducer (Local UI State Mutator)
// ======================================
function storeReducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_PRODUCTS:
      return { ...state, products: action.payload };

    case ACTIONS.ADD_PRODUCT:
      return { ...state, products: [...state.products, action.payload] };

    case ACTIONS.UPDATE_PRODUCT:
      return {
        ...state,
        products: state.products.map((p) =>
          p.id === action.payload.id ? { ...p, ...action.payload } : p
        ),
      };

    case ACTIONS.DELETE_PRODUCT:
      return {
        ...state,
        products: state.products.filter((p) => p.id !== action.payload),
      };

    case ACTIONS.SET_SALES:
      return { ...state, sales: action.payload };

    case ACTIONS.ADD_SALE:
      return { ...state, sales: [action.payload, ...state.sales] };

    case ACTIONS.UPDATE_STORE_INFO:
      return { ...state, storeInfo: { ...state.storeInfo, ...action.payload } };

    case ACTIONS.SET_PROMOTIONS:
      return { ...state, promotions: action.payload };

    case ACTIONS.ADD_PROMOTION:
      return { ...state, promotions: [...state.promotions, action.payload] };

    case ACTIONS.UPDATE_PROMOTION:
      return {
        ...state,
        promotions: state.promotions.map((p) =>
          p.id === action.payload.id ? { ...p, ...action.payload } : p
        ),
      };

    case ACTIONS.DELETE_PROMOTION:
      return {
        ...state,
        promotions: state.promotions.filter((p) => p.id !== action.payload),
      };

    case ACTIONS.SET_CATEGORIES:
      return { ...state, categories: action.payload };

    case ACTIONS.ADD_CATEGORY:
      return { ...state, categories: [...state.categories, action.payload] };

    case ACTIONS.LOGIN_USER:
      return { ...state, currentUser: action.payload };

    case ACTIONS.LOGOUT_USER:
      return { ...state, currentUser: null };

    case ACTIONS.SET_CUSTOMERS:
      return { ...state, customers: action.payload };

    case ACTIONS.ADD_CUSTOMER:
      return { ...state, customers: [...state.customers, action.payload] };

    case ACTIONS.UPDATE_CUSTOMER:
      return {
        ...state,
        customers: state.customers.map((c) =>
          c.id === action.payload.id ? { ...c, ...action.payload } : c
        ),
      };

    case ACTIONS.DELETE_CUSTOMER:
      return {
        ...state,
        customers: state.customers.filter((c) => c.id !== action.payload),
      };

    case ACTIONS.SET_USERS:
      return { ...state, users: action.payload };

    case ACTIONS.ADD_USER:
      return { ...state, users: [...state.users, action.payload] };

    case ACTIONS.UPDATE_USER:
      return {
        ...state,
        users: state.users.map((u) =>
          u.id === action.payload.id ? { ...u, ...action.payload } : u
        ),
      };

    case ACTIONS.DELETE_USER:
      return {
        ...state,
        users: state.users.filter((u) => u.id !== action.payload),
      };

    default:
      return state;
  }
}

// ======================================
// Context
// ======================================
const StoreContext = createContext(null);

// ======================================
// Unified API Fetcher (Supports Local Express, Vercel, Netlify, or Google Apps Script)
// ======================================
const API_BASE_URL = window.GOOGLE_SCRIPT_URL || import.meta.env.VITE_API_BASE_URL || '';

async function fetchApi(subpath, method = 'GET', payload = null) {
  const isGoogleAppsScript = API_BASE_URL.indexOf('script.google.com') !== -1;
  // If no base URL is defined, default to relative '/api/...' path
  let url = API_BASE_URL ? `${API_BASE_URL}/${subpath}` : `/${subpath}`;
  let fetchOptions = { method: 'GET' };

  if (method !== 'GET') {
    if (isGoogleAppsScript) {
      // Google Apps Script doesn't support PUT/DELETE or CORS preflight OPTIONS requests.
      // We route it to POST, use 'text/plain' Content-Type to make it a "simple request",
      // and append a `_method` parameter in the URL.
      url = `${url}?_method=${method}`;
      fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: payload ? JSON.stringify(payload) : ''
      };
    } else {
      // Standard Express/Node.js Serverless route
      fetchOptions = {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: payload ? JSON.stringify(payload) : ''
      };
    }
  }

  return fetch(url, fetchOptions);
}

// ======================================
// Provider (API Connection Manager)
// ======================================
export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(storeReducer, null, loadInitialState);

  // Load and refresh all database data
  const refreshData = useCallback(async () => {
    try {
      // 1. Fetch products
      const { data: dbProducts, error: prodErr } = await supabase
        .from('products')
        .select('*')
        .order('id', { ascending: true });
      if (prodErr) throw prodErr;

      // 2. Fetch categories
      const { data: dbCategories, error: catErr } = await supabase
        .from('categories')
        .select('*')
        .order('name', { ascending: true });
      if (catErr) throw catErr;

      // 3. Fetch customers
      const { data: dbCustomers, error: custErr } = await supabase
        .from('customers')
        .select('*')
        .order('id', { ascending: true });
      if (custErr) throw custErr;

      // 4. Fetch promotions
      const { data: dbPromotions, error: promoErr } = await supabase
        .from('promotions')
        .select('*')
        .order('id', { ascending: true });
      if (promoErr) throw promoErr;

      // 5. Fetch store_info
      const { data: dbStoreInfo, error: storeErr } = await supabase
        .from('store_info')
        .select('*')
        .eq('id', 'main')
        .maybeSingle();
      if (storeErr) throw storeErr;

      // 6. Fetch sales
      const { data: dbSales, error: salesErr } = await supabase
        .from('sales')
        .select('*')
        .order('date', { ascending: false })
        .limit(500);
      if (salesErr) throw salesErr;

      // 7. Fetch sale_items
      const { data: dbSaleItems, error: itemsErr } = await supabase
        .from('sale_items')
        .select('*');
      if (itemsErr) throw itemsErr;

      // Map products (Snake Case -> Camel Case)
      const mappedProducts = (dbProducts || []).map(row => ({
        id: row.id,
        barcode: row.barcode,
        name: row.name,
        category: row.category_id,
        costPrice: Number(row.cost_price || 0),
        branchPrice: Number(row.branch_price || 0),
        sellPrice: Number(row.sell_price || 0),
        stockOffice: Number(row.stock_office || 0),
        stockKookkai: Number(row.stock_kookkai || 0),
        stockBig: Number(row.stock_big || 0),
        stock: Number(row.stock_office || 0) + Number(row.stock_kookkai || 0) + Number(row.stock_big || 0),
        minStock: Number(row.min_stock || 10),
        image: row.image || '📦',
        unit: row.unit || 'เครื่อง',
        isPopular: !!row.is_popular
      }));

      // Map customers
      const mappedCustomers = (dbCustomers || []).map(row => ({
        id: row.id,
        name: row.name,
        phone: row.phone || '-',
        address: row.address || '-',
        taxId: row.tax_id || '-'
      }));

      // Map promotions
      const mappedPromotions = (dbPromotions || []).map(row => ({
        id: row.id,
        code: row.code,
        name: row.name,
        type: row.type,
        value: Number(row.value || 0),
        minPurchase: Number(row.min_purchase || 0),
        active: !!row.active
      }));

      // Group items by sale_id
      const itemsBySaleId = (dbSaleItems || []).reduce((acc, item) => {
        if (!acc[item.sale_id]) acc[item.sale_id] = [];
        acc[item.sale_id].push({
          id: item.product_id,
          productId: item.product_id,
          name: item.product_name,
          sellPrice: Number(item.sell_price || 0),
          costPrice: Number(item.cost_price || 0),
          quantity: Number(item.quantity || 0),
          selectedLocation: item.selected_location
        });
        return acc;
      }, {});

      // Map sales
      const mappedSales = (dbSales || []).map(sale => ({
        id: sale.id,
        date: sale.date,
        customer: sale.customer_id ? {
          id: sale.customer_id,
          name: sale.customer_name,
          phone: sale.customer_phone,
          address: sale.customer_address,
          taxId: sale.customer_tax_id
        } : {
          name: sale.customer_name,
          phone: sale.customer_phone,
          address: sale.customer_address,
          taxId: sale.customer_tax_id
        },
        employee: sale.salesperson,
        paymentMethod: sale.payment_method,
        discountCode: sale.discount_code,
        discountAmount: Number(sale.discount_amount || 0),
        subtotal: Number(sale.subtotal || 0),
        tax: Number(sale.tax || 0),
        shippingCost: Number(sale.shipping_cost || 0),
        total: Number(sale.total || 0),
        cashReceived: Number(sale.cash_received || 0),
        change: Number(sale.change || 0),
        applyVat: !!sale.apply_vat,
        isVatInclusive: !!sale.is_vat_inclusive,
        items: itemsBySaleId[sale.id] || []
      }));

      // Map storeInfo
      const mappedStoreInfo = dbStoreInfo ? {
        name: dbStoreInfo.name,
        address: dbStoreInfo.address,
        phone: dbStoreInfo.phone,
        taxId: dbStoreInfo.tax_id,
        taxRate: Number(dbStoreInfo.tax_rate || 7)
      } : {};

      // Dispatch results to local state store
      dispatch({ type: ACTIONS.SET_PRODUCTS, payload: mappedProducts });
      dispatch({ type: ACTIONS.SET_CATEGORIES, payload: dbCategories || [] });
      dispatch({ type: ACTIONS.SET_CUSTOMERS, payload: mappedCustomers });
      dispatch({ type: ACTIONS.SET_PROMOTIONS, payload: mappedPromotions });
      dispatch({ type: ACTIONS.UPDATE_STORE_INFO, payload: mappedStoreInfo });
      dispatch({ type: ACTIONS.SET_SALES, payload: mappedSales });

    } catch (err) {
      console.error('Failed to sync data directly with Supabase database:', err.message);
    }
  }, []);

  // Sync session authentication state to local storage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ currentUser: state.currentUser }));
    } catch (err) {
      console.warn('ไม่สามารถบันทึกเซสชันลง localStorage ได้:', err);
    }
  }, [state.currentUser]);

  // Load all initial database records on mount
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // ─── ASYNC ACTION MIDDLEWARE (Intercepts dispatch and updates database) ───
  const asyncDispatch = useCallback(async (action) => {
    try {
      let success = true;

      if (action.type === ACTIONS.ADD_PRODUCT) {
        const p = action.payload;
        const { error } = await supabase.from('products').insert({
          id: p.id,
          barcode: p.barcode || p.id,
          name: p.name,
          category_id: p.category,
          cost_price: Number(p.costPrice || 0),
          branch_price: Number(p.branchPrice || p.sellPrice || 0),
          sell_price: Number(p.sellPrice || 0),
          stock_office: Number(p.stockOffice || 0),
          stock_kookkai: Number(p.stockKookkai || 0),
          stock_big: Number(p.stockBig || 0),
          min_stock: Number(p.minStock || 10),
          image: p.image || '📦',
          unit: p.unit || 'เครื่อง',
          is_popular: !!p.isPopular
        });
        success = !error;
        if (error) console.error('Add product error:', error);
      } 
      else if (action.type === ACTIONS.UPDATE_PRODUCT) {
        const p = action.payload;
        const { error } = await supabase.from('products').update({
          barcode: p.barcode || p.id,
          name: p.name,
          category_id: p.category,
          cost_price: Number(p.costPrice || 0),
          branch_price: Number(p.branchPrice || p.sellPrice || 0),
          sell_price: Number(p.sellPrice || 0),
          stock_office: Number(p.stockOffice || 0),
          stock_kookkai: Number(p.stockKookkai || 0),
          stock_big: Number(p.stockBig || 0),
          min_stock: Number(p.minStock || 10),
          image: p.image || '📦',
          unit: p.unit || 'เครื่อง',
          is_popular: !!p.isPopular
        }).eq('id', p.id);
        success = !error;
        if (error) console.error('Update product error:', error);
      } 
      else if (action.type === ACTIONS.DELETE_PRODUCT) {
        const { error } = await supabase.from('products').delete().eq('id', action.payload);
        success = !error;
        if (error) console.error('Delete product error:', error);
      } 
      else if (action.type === ACTIONS.ADD_SALE) {
        const s = action.payload;
        const customerId = s.customer?.id || null;
        const customerName = s.customer?.name || 'ลูกค้าทั่วไป';
        const customerPhone = s.customer?.phone || '-';
        const customerAddress = s.customer?.address || '-';
        const customerTaxId = s.customer?.taxId || '-';

        // 1. Insert into sales
        const { error: saleErr } = await supabase.from('sales').insert({
          id: s.id,
          date: s.date || new Date().toISOString(),
          customer_id: customerId,
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_address: customerAddress,
          customer_tax_id: customerTaxId,
          salesperson: s.employee || 'หน้าร้าน',
          payment_method: s.paymentMethod,
          discount_code: s.discountCode || null,
          discount_amount: Number(s.discountAmount || 0),
          subtotal: Number(s.subtotal),
          tax: Number(s.tax || 0),
          shipping_cost: Number(s.shippingCost || 0),
          total: Number(s.total),
          cash_received: Number(s.cashReceived || 0),
          change: Number(s.change || 0),
          apply_vat: !!s.applyVat,
          is_vat_inclusive: !!s.isVatInclusive
        });

        if (saleErr) {
          console.error('Insert sale error:', saleErr);
          success = false;
        } else {
          // 2. Loop items
          for (const item of s.items) {
            // Fetch product to check stock
            const { data: product, error: getProdErr } = await supabase
              .from('products')
              .select('*')
              .eq('id', item.productId)
              .single();

            if (getProdErr || !product) {
              console.error('Fetch product error:', getProdErr);
              success = false;
              break;
            }

            const loc = item.selectedLocation;
            const qty = Number(item.quantity);

            // Determine stock column to update
            let updateFields = {};
            if (loc === 'โกดังกุ๊กไก่') {
              updateFields = { stock_kookkai: Math.max(0, (product.stock_kookkai || 0) - qty) };
            } else if (loc === 'ออฟฟิศ') {
              updateFields = { stock_office: Math.max(0, (product.stock_office || 0) - qty) };
            } else {
              updateFields = { stock_big: Math.max(0, (product.stock_big || 0) - qty) };
            }

            // Update stock
            const { error: updateStockErr } = await supabase
              .from('products')
              .update(updateFields)
              .eq('id', item.productId);

            if (updateStockErr) {
              console.error('Update stock error:', updateStockErr);
              success = false;
              break;
            }

            // Insert sale item
            const { error: itemErr } = await supabase.from('sale_items').insert({
              sale_id: s.id,
              product_id: item.productId,
              product_name: item.name,
              quantity: qty,
              cost_price: Number(item.costPrice || 0),
              sell_price: Number(item.sellPrice || 0),
              selected_location: loc
            });

            if (itemErr) {
              console.error('Insert sale item error:', itemErr);
              success = false;
              break;
            }
          }
        }
      } 
      else if (action.type === ACTIONS.ADD_CUSTOMER) {
        const c = action.payload;
        const { error } = await supabase.from('customers').insert({
          id: c.id,
          name: c.name,
          phone: c.phone || '',
          address: c.address || '',
          tax_id: c.taxId || ''
        });
        success = !error;
        if (error) console.error('Add customer error:', error);
      } 
      else if (action.type === ACTIONS.UPDATE_CUSTOMER) {
        const c = action.payload;
        const { error } = await supabase.from('customers').update({
          name: c.name,
          phone: c.phone || '',
          address: c.address || '',
          tax_id: c.taxId || ''
        }).eq('id', c.id);
        success = !error;
        if (error) console.error('Update customer error:', error);
      } 
      else if (action.type === ACTIONS.DELETE_CUSTOMER) {
        const { error } = await supabase.from('customers').delete().eq('id', action.payload);
        success = !error;
        if (error) console.error('Delete customer error:', error);
      } 
      else if (action.type === ACTIONS.ADD_USER) {
        const u = action.payload;
        const { error } = await supabase.from('users').insert({
          id: u.id,
          username: u.username,
          password: u.password,
          name: u.name,
          role: u.role,
          avatar: u.avatar || '👤'
        });
        success = !error;
        if (error) console.error('Add user error:', error);
      } 
      else if (action.type === ACTIONS.UPDATE_USER) {
        const u = action.payload;
        const { error } = await supabase.from('users').update({
          username: u.username,
          password: u.password,
          name: u.name,
          role: u.role,
          avatar: u.avatar || '👤'
        }).eq('id', u.id);
        success = !error;
        if (error) console.error('Update user error:', error);
      } 
      else if (action.type === ACTIONS.DELETE_USER) {
        const { error } = await supabase.from('users').delete().eq('id', action.payload);
        success = !error;
        if (error) console.error('Delete user error:', error);
      } 
      else if (action.type === ACTIONS.ADD_PROMOTION) {
        const p = action.payload;
        const { error } = await supabase.from('promotions').insert({
          id: p.id,
          code: p.code,
          name: p.name,
          type: p.type,
          value: Number(p.value),
          min_purchase: Number(p.minPurchase || 0),
          active: !!p.active
        });
        success = !error;
        if (error) console.error('Add promotion error:', error);
      } 
      else if (action.type === ACTIONS.UPDATE_PROMOTION) {
        const p = action.payload;
        const { error } = await supabase.from('promotions').update({
          code: p.code,
          name: p.name,
          type: p.type,
          value: Number(p.value),
          min_purchase: Number(p.minPurchase || 0),
          active: !!p.active
        }).eq('id', p.id);
        success = !error;
        if (error) console.error('Update promotion error:', error);
      } 
      else if (action.type === ACTIONS.DELETE_PROMOTION) {
        const { error } = await supabase.from('promotions').delete().eq('id', action.payload);
        success = !error;
        if (error) console.error('Delete promotion error:', error);
      } 
      else if (action.type === ACTIONS.UPDATE_STORE_INFO) {
        const s = action.payload;
        const { error } = await supabase.from('store_info').update({
          name: s.name,
          address: s.address,
          phone: s.phone,
          tax_id: s.taxId,
          tax_rate: Number(s.taxRate || 7)
        }).eq('id', 'main');
        success = !error;
        if (error) console.error('Update store info error:', error);
      }

      // If the write to Supabase was successful, refresh client data from database
      if (success) {
        await refreshData();
      }

      // Execute local UI states directly (e.g. login/logout)
      if (action.type === ACTIONS.LOGIN_USER || action.type === ACTIONS.LOGOUT_USER) {
        dispatch(action);
      }
    } catch (err) {
      console.error('Database error executing dispatch action:', action.type, err.message);
    }
  }, [refreshData]);

  // ─── Helpers ───
  const getProductById = useCallback((id) => state.products.find((p) => p.id === id) || null, [state.products]);
  const getProductByBarcode = useCallback((barcode) => state.products.find((p) => p.barcode === barcode) || null, [state.products]);
  const getLowStockProducts = useCallback(() => state.products.filter((p) => p.stock <= p.minStock && p.stock > 0), [state.products]);
  const getOutOfStockProducts = useCallback(() => state.products.filter((p) => p.stock === 0), [state.products]);
  const getTodaySales = useCallback(() => {
    const today = new Date().toDateString();
    return state.sales.filter((s) => new Date(s.date).toDateString() === today);
  }, [state.sales]);

  const getSalesByDateRange = useCallback((start, end) => {
    const s = new Date(start); s.setHours(0,0,0,0);
    const e = new Date(end); e.setHours(23,59,59,999);
    return state.sales.filter((sale) => {
      const d = new Date(sale.date);
      return d >= s && d <= e;
    });
  }, [state.sales]);

  const getSalesSummary = useCallback((days = 30) => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const salesInRange = state.sales.filter((s) => new Date(s.date) >= startDate);
    const totalRevenue = salesInRange.reduce((sum, s) => sum + s.total, 0);
    const byPaymentMethod = salesInRange.reduce((acc, sale) => {
      acc[sale.paymentMethod] = (acc[sale.paymentMethod] || 0) + sale.total;
      return acc;
    }, {});
    return { totalRevenue, byPaymentMethod };
  }, [state.sales]);

  const getTopSellingProducts = useCallback((salesList, limit = 5) => {
    const map = {};
    const list = salesList || state.sales;
    list.forEach((sale) => {
      sale.items.forEach((item) => {
        if (!map[item.productId]) {
          map[item.productId] = { name: item.name, quantity: 0, revenue: 0 };
        }
        map[item.productId].quantity += item.quantity;
        map[item.productId].revenue += (item.total || item.subtotal || (item.sellPrice * item.quantity));
      });
    });
    return Object.entries(map)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, limit);
  }, [state.sales]);

  const getSlowSellingProducts = useCallback((salesList, limit = 5) => {
    const map = {};
    const list = salesList || state.sales;
    state.products.forEach((p) => {
      map[p.id] = { name: p.name, quantity: 0, revenue: 0 };
    });
    list.forEach((sale) => {
      sale.items.forEach((item) => {
        if (map[item.productId]) {
          map[item.productId].quantity += item.quantity;
          map[item.productId].revenue += (item.total || item.subtotal || (item.sellPrice * item.quantity));
        }
      });
    });
    return Object.entries(map)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, limit);
  }, [state.products, state.sales]);

  const getActivePromotions = useCallback(() => state.promotions.filter((p) => p.active), [state.promotions]);
  
  const validatePromoCode = useCallback((code, subtotal) => {
    const promo = state.promotions.find((p) => p.code.toUpperCase() === code.toUpperCase() && p.active);
    if (!promo) return { valid: false, message: 'รหัสไม่ถูกต้อง' };
    if (subtotal < promo.minPurchase) return { valid: false, message: 'ยอดไม่ถึงขั้นต่ำ' };
    const discount = promo.type === 'percent' ? Math.round((subtotal * promo.value) / 100) : promo.value;
    return { valid: true, promo, discount: Math.min(discount, subtotal) };
  }, [state.promotions]);

  const resetToDefaults = useCallback(async () => {
    console.warn("Reset to default is disabled on database mode.");
  }, []);

  const contextValue = useMemo(
    () => ({
      state,
      dispatch: asyncDispatch, // Inject asyncDispatch middleware
      getProductById,
      getProductByBarcode,
      getLowStockProducts,
      getOutOfStockProducts,
      getTodaySales,
      getSalesByDateRange,
      getSalesSummary,
      getTopSellingProducts,
      getSlowSellingProducts,
      getActivePromotions,
      validatePromoCode,
      resetToDefaults,
    }),
    [
      state,
      asyncDispatch,
      getProductById,
      getProductByBarcode,
      getLowStockProducts,
      getOutOfStockProducts,
      getTodaySales,
      getSalesByDateRange,
      getSalesSummary,
      getTopSellingProducts,
      getSlowSellingProducts,
      getActivePromotions,
      validatePromoCode,
      resetToDefaults,
    ]
  );

  return (
    <StoreContext.Provider value={contextValue}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore ต้องใช้ภายใน StoreProvider เท่านั้น');
  }
  return context;
}

export default StoreContext;
