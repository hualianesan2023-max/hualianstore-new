// ====================================================================
// Google Apps Script (Code.gs) for HUALIAN Sealing Machine POS Backend
// เชื่อมต่อโดยตรงกับฐานข้อมูล Supabase ผ่าน REST API (UrlFetchApp)
// ====================================================================

// 1. ระบุค่าการเชื่อมต่อ API ของ Supabase ของคุณที่นี่ (หาได้จาก Settings -> API บน Supabase)
var SUPABASE_URL = "https://your-project-id.supabase.co"; 
var SUPABASE_KEY = "your-anon-or-service-role-key"; 

// 2. ฟังก์ชันช่วยประมวลผลข้อมูล JSON Response
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// 3. ฟังก์ชันสำหรับส่งคำขอไปยัง Supabase REST API (UrlFetchApp)
function supabaseRequest(path, method, payload) {
  var url = SUPABASE_URL + "/rest/v1/" + path;
  
  var headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": "Bearer " + SUPABASE_KEY,
    "Content-Type": "application/json",
    "Prefer": "return=representation" // บังคับให้ส่งข้อมูลผลลัพธ์กลับมาหลังเพิ่ม/แก้ไข
  };
  
  var options = {
    "method": method || "GET",
    "headers": headers,
    "muteHttpExceptions": true
  };
  
  if (payload) {
    options.payload = JSON.stringify(payload);
  }
  
  var res = UrlFetchApp.fetch(url, options);
  var code = res.getResponseCode();
  var text = res.getContentText();
  
  if (code >= 400) {
    throw new Error("Supabase API Error (" + code + "): " + text);
  }
  
  try {
    return JSON.parse(text);
  } catch(e) {
    return text;
  }
}

// 4. ฟังก์ชันหลักสำหรับรับคำร้องขอ GET (รองรับโหลดหน้าเว็บและดึง API)
function doGet(e) {
  try {
    var path = e.pathInfo || "";
    
    // ตรวจสอบเอนด์พอยต์ GET /api/init หรือ init
    if (path.indexOf("api/init") !== -1 || path === "init") {
      return handleInit();
    }
    
    // ถ้าไม่ใช่ API ให้เสิร์ฟหน้าเว็บ Frontend (index.html)
    var template = HtmlService.createTemplateFromFile("index");
    template.webAppUrl = ScriptApp.getService().getUrl();
    return template.evaluate()
      .setTitle("ระบบจัดการหน้าร้าน HUALIAN POS")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
      
  } catch (err) {
    return jsonResponse({ error: err.toString() });
  }
}

// 5. ฟังก์ชันหลักสำหรับรับคำร้องขอ POST, PUT, DELETE (สวมรอยผ่าน POST ด้วย _method)
function doPost(e) {
  try {
    var path = e.pathInfo || "";
    var method = "POST";
    
    // ดึง _method จาก Query parameter หรือจาก Body (เพื่อสวมรอย PUT / DELETE)
    if (e.parameter && e.parameter._method) {
      method = e.parameter._method.toUpperCase();
    }
    
    var body = {};
    if (e.postData && e.postData.contents) {
      try {
        body = JSON.parse(e.postData.contents);
        if (body._method) {
          method = body._method.toUpperCase();
        }
      } catch(ex) {
        // ข้อมูลประเภทอื่น หรือ JSON เสีย
      }
    }
    
    var pathParts = path.split("/"); // e.g. ["api", "products", "DY-001"]
    var resource = pathParts[1] || ""; // e.g. "products"
    var id = pathParts[2] || null; // e.g. "DY-001"
    
    // เส้นทางเราเตอร์ (Router Routing)
    if (resource === "products") {
      if (method === "POST") return handleCreateProduct(body);
      if (method === "PUT" && id) return handleUpdateProduct(id, body);
      if (method === "DELETE" && id) return handleDeleteProduct(id);
    }
    else if (resource === "sales") {
      if (method === "POST") return handleCheckoutSale(body);
    }
    else if (resource === "customers") {
      if (method === "POST") return handleCreateCustomer(body);
      if (method === "PUT" && id) return handleUpdateCustomer(id, body);
      if (method === "DELETE" && id) return handleDeleteCustomer(id);
    }
    else if (resource === "users") {
      if (method === "POST") return handleCreateUser(body);
      if (method === "PUT" && id) return handleUpdateUser(id, body);
      if (method === "DELETE" && id) return handleDeleteUser(id);
    }
    else if (resource === "promotions") {
      if (method === "POST") return handleCreatePromotion(body);
      if (method === "PUT" && id) return handleUpdatePromotion(id, body);
      if (method === "DELETE" && id) return handleDeletePromotion(id);
    }
    else if (resource === "store-info") {
      if (method === "PUT") return handleUpdateStoreInfo(body);
    }
    
    return jsonResponse({ error: "Endpoint or Method not matched", path: path, method: method });
  } catch (err) {
    return jsonResponse({ error: err.toString() });
  }
}

// ====================================================================
// ROUTE HANDLERS (จัดการข้อมูล)
// ====================================================================

function handleInit() {
  var products = supabaseRequest("products?select=*", "GET");
  var categories = supabaseRequest("categories?select=*", "GET");
  var customers = supabaseRequest("customers?select=*", "GET");
  var promotions = supabaseRequest("promotions?select=*", "GET");
  var users = supabaseRequest("users?select=*", "GET");
  var storeInfoList = supabaseRequest("store_info?id=eq.main&select=*", "GET");
  var sales = supabaseRequest("sales?select=*&order=date.desc&limit=200", "GET");
  var saleItems = supabaseRequest("sale_items?select=*", "GET");
  
  // จัดข้อมูลสินค้าให้ตรงกับฟอร์แมตหน้าบ้าน (Db snake_case -> React camelCase)
  var mappedProducts = products.map(function(row) {
    var stockOffice = row.stock_office || 0;
    var stockKookkai = row.stock_kookkai || 0;
    var stockBig = row.stock_big || 0;
    return {
      id: row.id,
      barcode: row.barcode || row.id,
      name: row.name,
      category: row.category_id,
      costPrice: Number(row.cost_price || 0),
      branchPrice: Number(row.branch_price || 0),
      sellPrice: Number(row.sell_price || 0),
      stockOffice: stockOffice,
      stockKookkai: stockKookkai,
      stockBig: stockBig,
      stock: stockOffice + stockKookkai + stockBig,
      minStock: row.min_stock || 10,
      image: row.image || '📦',
      unit: row.unit || 'เครื่อง',
      isPopular: Boolean(row.is_popular)
    };
  });

  // จัดข้อมูลลูกค้า
  var mappedCustomers = customers.map(function(row) {
    return {
      id: row.id,
      name: row.name,
      phone: row.phone || '-',
      address: row.address || '-',
      taxId: row.tax_id || '-'
    };
  });

  // จัดข้อมูลคูปอง
  var mappedPromotions = promotions.map(function(row) {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      type: row.type,
      value: Number(row.value || 0),
      minPurchase: Number(row.min_purchase || 0),
      active: Boolean(row.active)
    };
  });

  var storeInfo = storeInfoList[0] ? {
    name: storeInfoList[0].name,
    address: storeInfoList[0].address,
    phone: storeInfoList[0].phone,
    taxId: storeInfoList[0].tax_id,
    taxRate: Number(storeInfoList[0].tax_rate || 7)
  } : {};

  // จัดหมวดรายการไอเทมบิลขาย
  var itemsBySaleId = {};
  saleItems.forEach(function(item) {
    if (!itemsBySaleId[item.sale_id]) itemsBySaleId[item.sale_id] = [];
    itemsBySaleId[item.sale_id].push({
      id: item.product_id,
      productId: item.product_id,
      name: item.product_name,
      sellPrice: Number(item.sell_price || 0),
      costPrice: Number(item.cost_price || 0),
      quantity: Number(item.quantity || 0),
      selectedLocation: item.selected_location
    });
  });

  var mappedSales = sales.map(function(sale) {
    return {
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
      applyVat: Boolean(sale.apply_vat),
      isVatInclusive: Boolean(sale.is_vat_inclusive),
      items: itemsBySaleId[sale.id] || []
    };
  });

  return jsonResponse({
    products: mappedProducts,
    categories: categories,
    customers: mappedCustomers,
    promotions: mappedPromotions,
    users: users,
    storeInfo: storeInfo,
    sales: mappedSales
  });
}

function handleCreateProduct(p) {
  var payload = {
    id: p.id,
    barcode: p.barcode || p.id,
    name: p.name,
    category_id: p.category,
    cost_price: p.costPrice || 0,
    branch_price: p.branchPrice || p.sellPrice || 0,
    sell_price: p.sellPrice || 0,
    stock_office: p.stockOffice || 0,
    stock_kookkai: p.stockKookkai || 0,
    stock_big: p.stockBig || 0,
    min_stock: p.minStock || 10,
    image: p.image || '📦',
    unit: p.unit || 'เครื่อง',
    is_popular: p.isPopular || false
  };
  supabaseRequest("products", "POST", payload);
  return jsonResponse({ success: true, message: "Product created" });
}

function handleUpdateProduct(id, p) {
  var payload = {
    barcode: p.barcode || p.id,
    name: p.name,
    category_id: p.category,
    cost_price: p.costPrice || 0,
    branch_price: p.branchPrice || p.sellPrice || 0,
    sell_price: p.sellPrice || 0,
    stock_office: p.stockOffice || 0,
    stock_kookkai: p.stockKookkai || 0,
    stock_big: p.stockBig || 0,
    min_stock: p.minStock || 10,
    image: p.image || '📦',
    unit: p.unit || 'เครื่อง',
    is_popular: p.isPopular || false
  };
  supabaseRequest("products?id=eq." + encodeURIComponent(id), "PATCH", payload);
  return jsonResponse({ success: true, message: "Product updated" });
}

function handleDeleteProduct(id) {
  supabaseRequest("products?id=eq." + encodeURIComponent(id), "DELETE");
  return jsonResponse({ success: true, message: "Product deleted" });
}

function handleCheckoutSale(s) {
  var customerId = s.customer ? s.customer.id : null;
  var customerName = s.customer ? (s.customer.name || 'ลูกค้าทั่วไป') : 'ลูกค้าทั่วไป';
  var customerPhone = s.customer ? (s.customer.phone || '-') : '-';
  var customerAddress = s.customer ? (s.customer.address || '-') : '-';
  var customerTaxId = s.customer ? (s.customer.taxId || '-') : '-';
  
  // 1. เพิ่มข้อมูลการขาย (Sale Header)
  var salePayload = {
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
    discount_amount: s.discountAmount || 0,
    subtotal: s.subtotal,
    tax: s.tax || 0,
    shipping_cost: s.shippingCost || 0,
    total: s.total,
    cash_received: s.cashReceived || 0,
    change: s.change || 0,
    apply_vat: Boolean(s.applyVat),
    is_vat_inclusive: Boolean(s.isVatInclusive)
  };
  
  supabaseRequest("sales", "POST", salePayload);
  
  // 2. ดำเนินการอัปเดตสต็อกสินค้าทีละชิ้น และบันทึกรายการไอเทม
  s.items.forEach(function(item) {
    // ดึงข้อมูลจำนวนสินค้าคงเหลือปัจจุบัน
    var pList = supabaseRequest("products?id=eq." + encodeURIComponent(item.productId) + "&select=stock_office,stock_kookkai,stock_big", "GET");
    if (!pList || pList.length === 0) {
      throw new Error("Product not found: " + item.productId);
    }
    var product = pList[0];
    var stockOffice = product.stock_office || 0;
    var stockKookkai = product.stock_kookkai || 0;
    var stockBig = product.stock_big || 0;
    
    var loc = item.selectedLocation;
    var qty = Number(item.quantity);
    var updatePayload = {};
    
    if (loc === 'โกดังกุ๊กไก่') {
      if (stockKookkai < qty) throw new Error("สินค้าคงคลังกุ๊กไก่ไม่พอสำหรับ: " + item.name);
      updatePayload.stock_kookkai = stockKookkai - qty;
    } else if (loc === 'ออฟฟิศ') {
      if (stockOffice < qty) throw new Error("สินค้าคงคลังออฟฟิศไม่พอสำหรับ: " + item.name);
      updatePayload.stock_office = stockOffice - qty;
    } else { // โกดังใหญ่
      if (stockBig < qty) throw new Error("สินค้าคงคลังโกดังใหญ่ไม่พอสำหรับ: " + item.name);
      updatePayload.stock_big = stockBig - qty;
    }
    
    // อัปเดตยอดคงเหลือคลังสินค้า
    supabaseRequest("products?id=eq." + encodeURIComponent(item.productId), "PATCH", updatePayload);
    
    // บันทึกรายการย่อยของบิล
    var itemPayload = {
      sale_id: s.id,
      product_id: item.productId,
      product_name: item.name,
      quantity: qty,
      cost_price: item.costPrice || 0,
      sell_price: item.sellPrice || 0,
      selected_location: loc
    };
    supabaseRequest("sale_items", "POST", itemPayload);
  });
  
  return jsonResponse({ success: true, saleId: s.id });
}

function handleCreateCustomer(c) {
  var payload = {
    id: c.id,
    name: c.name,
    phone: c.phone || '',
    address: c.address || '',
    tax_id: c.taxId || ''
  };
  supabaseRequest("customers", "POST", payload);
  return jsonResponse({ success: true });
}

function handleUpdateCustomer(id, c) {
  var payload = {
    name: c.name,
    phone: c.phone || '',
    address: c.address || '',
    tax_id: c.taxId || ''
  };
  supabaseRequest("customers?id=eq." + encodeURIComponent(id), "PATCH", payload);
  return jsonResponse({ success: true });
}

function handleDeleteCustomer(id) {
  supabaseRequest("customers?id=eq." + encodeURIComponent(id), "DELETE");
  return jsonResponse({ success: true });
}

function handleCreateUser(u) {
  var payload = {
    id: u.id,
    username: u.username,
    password: u.password,
    name: u.name,
    role: u.role,
    avatar: u.avatar || '👤'
  };
  supabaseRequest("users", "POST", payload);
  return jsonResponse({ success: true });
}

function handleUpdateUser(id, u) {
  var payload = {
    username: u.username,
    password: u.password,
    name: u.name,
    role: u.role,
    avatar: u.avatar || '👤'
  };
  supabaseRequest("users?id=eq." + encodeURIComponent(id), "PATCH", payload);
  return jsonResponse({ success: true });
}

function handleDeleteUser(id) {
  supabaseRequest("users?id=eq." + encodeURIComponent(id), "DELETE");
  return jsonResponse({ success: true });
}

function handleCreatePromotion(p) {
  var payload = {
    id: p.id,
    code: p.code,
    name: p.name,
    type: p.type,
    value: p.value,
    min_purchase: p.minPurchase || 0,
    active: p.active
  };
  supabaseRequest("promotions", "POST", payload);
  return jsonResponse({ success: true });
}

function handleUpdatePromotion(id, p) {
  var payload = {
    code: p.code,
    name: p.name,
    type: p.type,
    value: p.value,
    min_purchase: p.minPurchase || 0,
    active: p.active
  };
  supabaseRequest("promotions?id=eq." + encodeURIComponent(id), "PATCH", payload);
  return jsonResponse({ success: true });
}

function handleDeletePromotion(id) {
  supabaseRequest("promotions?id=eq." + encodeURIComponent(id), "DELETE");
  return jsonResponse({ success: true });
}

function handleUpdateStoreInfo(s) {
  var payload = {
    name: s.name,
    address: s.address,
    phone: s.phone,
    tax_id: s.taxId,
    tax_rate: s.taxRate || 7
  };
  supabaseRequest("store_info?id=eq.main", "PATCH", payload);
  return jsonResponse({ success: true });
}
