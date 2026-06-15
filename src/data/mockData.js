// ======================================
// Mock Data - HUALIAN Sealing Machine POS System
// ======================================

// --- หมวดหมู่สินค้า (28 หมวดหมู่พร้อมรหัสย่อ prefix) ---
export const categories = [
  { id: 'sealer', name: 'เครื่องซีลสายพาน', icon: '📠', prefix: 'DY' },
  { id: 'date_printer', name: 'เครื่องพิมพ์วันที่', icon: '🖨️', prefix: 'PR' },
  { id: 'hand_sealer', name: 'เครื่องซีลมือกด', icon: '🎛️', prefix: 'FS' },
  { id: 'foot_sealer', name: 'เครื่องซีลเท้าเหยียบ', icon: '👣', prefix: 'FT' },
  { id: 'film_cutter', name: 'เครื่องตัดฟิล์ม', icon: '✂️', prefix: 'FC' },
  { id: 'wrapping_machine', name: 'เครื่องห่อ', icon: '📦', prefix: 'WR' },
  { id: 'liquid_filling', name: 'เครื่องหยอดของเหลว', icon: '💧', prefix: 'LF' },
  { id: 'laminator', name: 'เครื่องเคลือบบัตร', icon: '🪪', prefix: 'LA' },
  { id: 'shrink_tunnel', name: 'เครื่องอบฟิล์มหด', icon: '♨️', prefix: 'ST' },
  { id: 'multi_pack', name: 'เครื่องแพ็คโหล', icon: '🥫', prefix: 'MP' },
  { id: 'label_shrink', name: 'เครื่องอบลาเบล', icon: '🏷️', prefix: 'LT' },
  { id: 'steam_tunnel', name: 'ตู้อบไอน้ำ', icon: '💨', prefix: 'SD' },
  { id: 'vacuum_sealer', name: 'เครื่องซีลสูญญากาศ', icon: '🌀', prefix: 'VC' },
  { id: 'bottle_capping', name: 'เครื่องปิดฝาขวด & สูญญากาศ', icon: '🍾', prefix: 'BC' },
  { id: 'foil_sealer', name: 'เครื่องปิดฝาฟอยล์', icon: '💿', prefix: 'IF' },
  { id: 'conveyor', name: 'สายพานลำเลียง', icon: '🚛', prefix: 'CV' },
  { id: 'sack_sewer', name: 'เครื่องจักรเย็บกระสอบ', icon: '🧵', prefix: 'SM' },
  { id: 'can_seamer', name: 'เครื่องปิดฝากระป๋อง', icon: '🥫', prefix: 'CS' },
  { id: 'capping_machine', name: 'เครื่องขันฝา', icon: '🔩', prefix: 'CP' },
  { id: 'weighing_scale', name: 'เครื่องชั่งน้ำหนัก', icon: '⚖️', prefix: 'WS' },
  { id: 'granule_packer', name: 'เครื่อง แบบเม็ด', icon: '💊', prefix: 'TB' },
  { id: 'packaging_machine', name: 'เครื่องบรรจุ', icon: '🛍️', prefix: 'PK' },
  { id: 'plastic_capping', name: 'เครื่องขันฝาพลาสติก', icon: '🥤', prefix: 'PC' },
  { id: 'labeling_machine', name: 'เครื่องติดฉลาก', icon: '🏷️', prefix: 'LM' },
  { id: 'screen_pack', name: 'เครื่องสกรีนแพค', icon: '🎨', prefix: 'SP' },
  { id: 'sticker_labeler', name: 'เครื่องติดสติกเกอร์', icon: '🏷️', prefix: 'SL' },
  { id: 'bubble_wrap', name: 'เครื่องทำบับเบิ้ลกันกระแทก', icon: '🫧', prefix: 'BB' },
  { id: 'strapping_machine', name: 'เครื่องรัดกล่อง', icon: '📦', prefix: 'SR' },
];

// --- สินค้าเครื่องซีล HUALIAN ---
export const initialProducts = [
  { id: 'DY-001', barcode: 'DY-001', name: 'FR-900S เครื่องซีลสายพาน แนวนอน', category: 'sealer', costPrice: 3800, sellPrice: 4900, branchPrice: 4700, stock: 15, minStock: 3, image: '📠', unit: 'เครื่อง', isPopular: true, stockBig: 10, stockKookkai: 3, stockOffice: 2 },
  { id: 'DY-002', barcode: 'DY-002', name: 'FR-900V เครื่องซีลสายพาน แนวตั้ง', category: 'sealer', costPrice: 4200, sellPrice: 5500, branchPrice: 5300, stock: 10, minStock: 2, image: '📠', unit: 'เครื่อง', isPopular: true, stockBig: 6, stockKookkai: 2, stockOffice: 2 },
  { id: 'DY-003', barcode: 'DY-003', name: 'FRD-1000W เครื่องซีลสายพานเติมไนโตรเจน', category: 'sealer', costPrice: 7500, sellPrice: 9900, branchPrice: 9500, stock: 5, minStock: 1, image: '📠', unit: 'เครื่อง', isPopular: false, stockBig: 3, stockKookkai: 1, stockOffice: 1 },
  { id: 'DY-004', barcode: 'DY-004', name: 'SF-150W เครื่องซีลสายพานต่อเนื่อง สเตนเลส', category: 'sealer', costPrice: 4800, sellPrice: 6200, branchPrice: 5900, stock: 8, minStock: 2, image: '📠', unit: 'เครื่อง', isPopular: true, stockBig: 5, stockKookkai: 2, stockOffice: 1 },
  { id: 'DY-005', barcode: 'DY-005', name: 'FS-300 เครื่องซีลถุงมือกด 12 นิ้ว (เหล็กหล่อ)', category: 'sealer', costPrice: 650, sellPrice: 950, branchPrice: 900, stock: 30, minStock: 5, image: '🎛️', unit: 'เครื่อง', isPopular: true, stockBig: 20, stockKookkai: 5, stockOffice: 5 },
  { id: 'DY-006', barcode: 'DY-006', name: 'PFS-200 เครื่องซีลถุงมือกด 8 นิ้ว (พลาสติก)', category: 'sealer', costPrice: 350, sellPrice: 590, branchPrice: 550, stock: 40, minStock: 5, image: '🎛️', unit: 'เครื่อง', isPopular: false, stockBig: 25, stockKookkai: 10, stockOffice: 5 },
];

// --- โปรโมชั่น ---
export const promotions = [
  { id: 'p1', code: 'HUA10', name: 'ส่วนลดลูกค้าใหม่ 10%', type: 'percent', value: 10, active: true, minPurchase: 1000 },
  { id: 'p2', code: 'HUASAVE', name: 'ลดทันที 500 บาท', type: 'fixed', value: 500, active: true, minPurchase: 5000 },
  { id: 'p3', code: 'EXHIBITION', name: 'งานแสดงสินค้า ลด 15%', type: 'percent', value: 15, active: false, minPurchase: 10000 },
  { id: 'p4', code: 'MEMBER100', name: 'ส่วนลดสมาชิก 100 บาท', type: 'fixed', value: 100, active: true, minPurchase: 2000 },
];

// --- ข้อมูลร้านค้า ---
export const storeInfo = {
  name: 'ห้างหุ้นส่วนจำกัด หัวเหรียญ อีสาน HUALIAN ESAN LTD.,PART.',
  address: 'สำนักงานใหญ่ : 841/7 หมู่ 5 ต.หนองจะบก อ.เมืองนครราชสีมา จ.นครราชสีมา 30000',
  phone: '044-002716, 084-1844310 (บัญชี) แฟ็ก. 044-248869',
  taxId: '0303547004494',
  taxRate: 7,
  branches: [
    { id: 'main', name: 'สำนักงานใหญ่ (นครราชสีมา)' },
  ],
};

// Seeded pseudo-random for deterministic data generation
function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function generateSalesHistory() {
  const rng = seededRandom(42);
  const sales = [];
  const paymentMethods = ['cash', 'qr', 'card'];
  const paymentWeights = [0.45, 0.40, 0.15];

  const popularProducts = initialProducts.filter(p => p.stock > 0 || true);

  const now = new Date();
  const monthCounters = {};

  // Generate 30 days of sales history
  for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
    const saleDate = new Date(now);
    saleDate.setDate(saleDate.getDate() - dayOffset);
    saleDate.setHours(0, 0, 0, 0);

    const dayOfWeek = saleDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const minTx = isWeekend ? 1 : 1;
    const maxTx = isWeekend ? 3 : 2;
    const numTransactions = minTx + Math.floor(rng() * (maxTx - minTx + 1));

    for (let t = 0; t < numTransactions; t++) {
      const hour = 8 + Math.floor(rng() * 10);
      const minute = Math.floor(rng() * 60);
      const txDate = new Date(saleDate);
      txDate.setHours(hour, minute, Math.floor(rng() * 60));

      const numItems = 1 + Math.floor(rng() * 2);
      const usedProductIds = new Set();
      const items = [];

      for (let i = 0; i < numItems; i++) {
        let product;
        let attempts = 0;
        do {
          product = popularProducts[Math.floor(rng() * popularProducts.length)];
          attempts++;
        } while (usedProductIds.has(product.id) && attempts < 20);

        if (usedProductIds.has(product.id)) continue;
        usedProductIds.add(product.id);

        const quantity = 1; // Sealing machines sell in quantities of 1 mostly
        items.push({
          productId: product.id,
          name: product.name,
          quantity,
          price: product.sellPrice,
          costPrice: product.costPrice, // Record cost price
          image: product.image,
          total: product.sellPrice * quantity,
          subtotal: product.sellPrice * quantity,
        });
      }

      if (items.length === 0) continue;

      const subtotal = items.reduce((sum, item) => sum + item.total, 0);

      let discount = 0;
      let discountCode = null;
      if (rng() < 0.20 && subtotal >= 2000) {
        const promoOptions = promotions.filter(p => p.active && subtotal >= p.minPurchase);
        if (promoOptions.length > 0) {
          const promo = promoOptions[Math.floor(rng() * promoOptions.length)];
          discountCode = promo.code;
          if (promo.type === 'percent') {
            discount = Math.round((subtotal * promo.value) / 100);
          } else {
            discount = promo.value;
          }
          discount = Math.min(discount, subtotal);
        }
      }

      const afterDiscount = subtotal - discount;
      const tax = Math.round((afterDiscount * storeInfo.taxRate) / 107);
      const total = afterDiscount;

      const pmRand = rng();
      let pm;
      if (pmRand < paymentWeights[0]) pm = paymentMethods[0];
      else if (pmRand < paymentWeights[0] + paymentWeights[1]) pm = paymentMethods[1];
      else pm = paymentMethods[2];

      let cashReceived = null;
      let change = null;
      if (pm === 'cash') {
        if (total <= 1000) cashReceived = 1000;
        else if (total <= 5000) cashReceived = 5000;
        else cashReceived = Math.ceil(total / 1000) * 1000;

        change = cashReceived - total;
      }

      const beYear = txDate.getFullYear() + 543;
      const yearStr = String(beYear).slice(-2);
      const monthStr = String(txDate.getMonth() + 1).padStart(2, '0');
      const prefix = `IV${yearStr}${monthStr}-`;
      if (!monthCounters[prefix]) {
        monthCounters[prefix] = 0;
      }
      monthCounters[prefix] += 1;
      const runningStr = String(monthCounters[prefix]).padStart(3, '0');
      const saleId = `${prefix}${runningStr}`;

      sales.push({
        id: saleId,
        date: txDate.toISOString(),
        items,
        subtotal,
        discount,
        discountCode,
        tax,
        total,
        paymentMethod: pm,
        cashReceived,
        change,
      });
    }
  }

  return sales;
}

export const salesHistory = generateSalesHistory();
