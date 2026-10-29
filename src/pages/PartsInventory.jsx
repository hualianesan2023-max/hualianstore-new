import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../data/supabaseClient';
import { showAlert, showConfirm } from '../utils/alerts';
import { getPartImageUrl, LocalImageToolbar } from '../utils/localImageProvider';
import { fetchNextPartCode, insertWithUniqueIdRetry } from '../utils/concurrency';
import './PartsInventory.css';

// ── Image Compressor ─────────────────────────────────────────
const compressImage = (file, maxPx = 500, quality = 0.78) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width: w, height: h } = img;
        if (w > h) { if (w > maxPx) { h = Math.round(h * maxPx / w); w = maxPx; } }
        else { if (h > maxPx) { w = Math.round(w * maxPx / h); h = maxPx; } }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// ── Constants ────────────────────────────────────────────────
const PART_CATEGORIES = [
  'อะไหล่ซีล', 'อะไหล่มอเตอร์', 'อะไหล่สายพาน', 'อะไหล่ไฟฟ้า',
  'ฮีตเตอร์/ลวดความร้อน', 'อะไหล่ใบมีด', 'แผงวงจร/PCB',
  'แบริ่ง/ลูกปืน', 'ปั๊ม/วาล์ว', 'ตลับเมตร/สกรู', 'อะไหล่อื่นๆ',
];

const EMPTY_FORM = {
  part_code: '', name: '', category: '', type: '',
  quantity: '', location: '',
  cost_price: '', dealer_price: '', sell_price: '',
  image_data: null, image_name: '',
};

const fmtNum = (n) =>
  new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0 }).format(n || 0);

const safeFloat = (v) => {
  if (v === undefined || v === null || v === '') return 0;
  const cleaned = String(v).replace(/[^0-9.-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
};

const safeInt = (v) => {
  if (v === undefined || v === null || v === '') return 0;
  const cleaned = String(v).replace(/[^0-9-]/g, '');
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? 0 : n;
};

// ── Auto-generate Part Code (Fill gaps first, else max + 1) ──
const getNextAvailablePartCode = (partsList = []) => {
  const existingNums = new Set();
  const prefix = 'HL-';
  const padding = 6;

  partsList.forEach((p) => {
    if (!p || !p.part_code) return;
    const codeStr = String(p.part_code).trim();
    const m = codeStr.match(/HL[-_]?(\d+)/i) || codeStr.match(/(\d+)/);
    if (m) {
      const num = parseInt(m[1], 10);
      if (!isNaN(num) && num > 0) {
        existingNums.add(num);
      }
    }
  });

  if (existingNums.size === 0) {
    return `${prefix}${String(1).padStart(padding, '0')}`;
  }

  // Find lowest missing sequence number (e.g. if HL-000005 was deleted, reuse 5)
  let targetNum = 1;
  while (existingNums.has(targetNum)) {
    targetNum++;
  }

  return `${prefix}${String(targetNum).padStart(padding, '0')}`;
};

// ── Component ────────────────────────────────────────────────
const PartsInventory = () => {
  const [parts, setParts]           = useState([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [search, setSearch]         = useState('');
  const [filterCat, setFilterCat]   = useState('');
  const [showModal, setShowModal]   = useState(false);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [editingId, setEditingId]   = useState(null);
  const [isSaving, setIsSaving]     = useState(false);
  const [imgLoading, setImgLoading] = useState(false);
  const [selectedPart, setSelectedPart] = useState(null);
  const formFileRef = useRef(null);

  // ── Excel Import States ──
  const [showImportModal, setShowImportModal] = useState(false);
  const [importRows, setImportRows]           = useState([]);
  const [importFileName, setImportFileName]   = useState('');
  const [isImporting, setIsImporting]         = useState(false);
  const [dragActive, setDragActive]           = useState(false);
  const importFileRef                         = useRef(null);

  // ── Fetch ──
  const fetchParts = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('parts').select('*').order('part_code', { ascending: true }).range(0, 9999);
      if (error) throw error;
      setParts(data || []);
    } catch (err) {
      console.error(err);
      showAlert('ข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลอะไหล่ได้', 'error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchParts();

    const channel = supabase
      .channel('parts_inventory_realtime')
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

  // ── Dynamic Categories & Types from Database ──
  const dbCategories = useMemo(() => {
    const cats = new Set();
    parts.forEach((p) => {
      const val = p.category ? String(p.category).trim() : '';
      if (val) cats.add(val);
    });
    return Array.from(cats).sort((a, b) => a.localeCompare(b, 'th'));
  }, [parts]);

  const dbTypes = useMemo(() => {
    const types = new Set();
    parts.forEach((p) => {
      const val = p.type ? String(p.type).trim() : '';
      if (val) types.add(val);
    });
    return Array.from(types).sort((a, b) => a.localeCompare(b, 'th'));
  }, [parts]);

  // ── Filtered & Pagination (15 items per page) ──
  const ITEMS_PER_PAGE = 15;
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = parts.filter((p) => {
    const q = search.toLowerCase();
    const matchQ = !q || [p.part_code, p.name, p.category, p.type, p.location]
      .some((v) => v?.toLowerCase().includes(q));
    const matchC = !filterCat || p.category === filterCat;
    return matchQ && matchC;
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterCat]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedParts = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // ── Stats ──
  const totalVal = parts.reduce((s, p) => s + (p.cost_price || 0) * (p.quantity || 0), 0);
  const lowCnt   = parts.filter((p) => Number(p.quantity) > 0 && Number(p.quantity) <= 5).length;
  const outCnt   = parts.filter((p) => Number(p.quantity) === 0).length;

  // ── Modal open ──
  const openAdd = async () => {
    const nextCode = getNextAvailablePartCode(parts);
    setForm({ ...EMPTY_FORM, part_code: nextCode });
    setEditingId(null);
    setShowModal(true);

    try {
      const liveCode = await fetchNextPartCode({ localParts: parts });
      setForm((prev) => ({ ...prev, part_code: liveCode }));
    } catch (e) {
      // Fallback already set
    }
  };

  // Keep part_code synced in real-time if another machine adds/deletes a part while modal is open
  useEffect(() => {
    if (showModal && !editingId) {
      const nextCode = getNextAvailablePartCode(parts);
      setForm((prev) => (prev.part_code !== nextCode ? { ...prev, part_code: nextCode } : prev));
    }
  }, [parts, showModal, editingId]);

  const openEdit = (p, e) => {
    e?.stopPropagation();
    setForm({
      part_code: p.part_code || '', name: p.name || '',
      category: p.category || '', type: p.type || '',
      quantity: p.quantity ?? '', location: p.location || '',
      cost_price: p.cost_price ?? '', dealer_price: p.dealer_price ?? '',
      sell_price: p.sell_price ?? '',
      image_data: p.image_data || null, image_name: p.image_name || '',
    });
    setEditingId(p.id);
    setShowModal(true);
  };

  // ── Image upload ──
  const handleImgUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showAlert('ไฟล์ไม่ถูกต้อง', 'กรุณาเลือกไฟล์รูปภาพเท่านั้น', 'warning'); return;
    }
    setImgLoading(true);
    try {
      const compressed = await compressImage(file);
      setForm((p) => ({ ...p, image_data: compressed, image_name: file.name }));
    } catch {
      showAlert('อัพโหลดไม่ได้', 'เกิดข้อผิดพลาดในการประมวลผลรูปภาพ', 'error');
    } finally {
      setImgLoading(false);
      if (formFileRef.current) formFileRef.current.value = '';
    }
  };

  // ── Save Form ──
  const handleSave = async () => {
    if (isSaving) return;
    let finalPartCode = form.part_code.trim();
    if (!finalPartCode && !editingId) {
      finalPartCode = getNextAvailablePartCode(parts);
    }
    if (!finalPartCode) { showAlert('กรุณากรอก', 'รหัสสินค้าห้ามว่าง', 'warning'); return; }
    if (!form.name.trim())      { showAlert('กรุณากรอก', 'ชื่อสินค้าห้ามว่าง', 'warning');  return; }

    setIsSaving(true);
    const buildPayload = (code) => ({
      part_code:    code,
      name:         form.name.trim(),
      category:     form.category.trim(),
      type:         form.type.trim(),
      quantity:     parseInt(form.quantity) || 0,
      location:     form.location.trim(),
      cost_price:   parseFloat(form.cost_price)   || 0,
      dealer_price: parseFloat(form.dealer_price) || 0,
      sell_price:   parseFloat(form.sell_price)   || 0,
      image_data:   form.image_data || null,
      image_name:   form.image_name || null,
      updated_at:   new Date().toISOString(),
    });

    try {
      if (editingId) {
        const payload = buildPayload(finalPartCode);
        const { error } = await supabase.from('parts').update(payload).eq('id', editingId);
        if (error) throw error;
        if (selectedPart?.id === editingId) setSelectedPart({ ...selectedPart, ...payload });
      } else {
        const { error } = await insertWithUniqueIdRetry({
          table: 'parts',
          prefix: 'HL-',
          pad: 6,
          column: 'part_code',
          initialId: finalPartCode,
          localFallbackList: parts,
          customNextIdFn: ({ triedIds }) => fetchNextPartCode({ localParts: parts, triedCodes: triedIds }),
          buildRow: (code) => ({
            ...buildPayload(code),
            created_at: new Date().toISOString(),
          }),
        });
        if (error) throw error;
      }
      await fetchParts();
      setShowModal(false);
    } catch (err) {
      showAlert('บันทึกไม่ได้', err.message || 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Delete ──
  const handleDelete = async (p, e) => {
    e?.stopPropagation();
    const ok = await showConfirm('ลบอะไหล่', `ต้องการลบ "${p.name}" ออกจากระบบหรือไม่?`, 'danger');
    if (!ok) return;
    try {
      const { error } = await supabase.from('parts').delete().eq('id', p.id);
      if (error) throw error;
      if (selectedPart?.id === p.id) setSelectedPart(null);
      await fetchParts();
    } catch {
      showAlert('ลบไม่ได้', 'เกิดข้อผิดพลาดในการลบข้อมูล', 'error');
    }
  };

  const handleRowClick = (p) => setSelectedPart((prev) => prev?.id === p.id ? null : p);

  // ── Excel Download Template ──
  const downloadTemplate = () => {
    const sample = [
      {
        'รหัสสินค้า': 'SP-001',
        'ชื่อสินค้า': 'สายพานเทฟลอน 15x750mm',
        'ประเภท': 'อะไหล่สายพาน',
        'ชนิด': 'เทฟลอนทนความร้อน',
        'จำนวน': 20,
        'ที่อยู่': 'A1-01',
        'ราคาต้นทุน': 35,
        'ราคาตัวแทน': 60,
        'ราคาขาย': 90,
        'pic_h': 'sp001.jpg',
      },
      {
        'รหัสสินค้า': 'SP-002',
        'ชื่อสินค้า': 'ฮีตเตอร์แท่ง 220V 300W',
        'ประเภท': 'ฮีตเตอร์/ลวดความร้อน',
        'ชนิด': 'สเตนเลส 12x100mm',
        'จำนวน': 10,
        'ที่อยู่': 'B2-04',
        'ราคาต้นทุน': 180,
        'ราคาตัวแทน': 280,
        'ราคาขาย': 390,
        'pic_h': 'sp002.jpg',
      },
      {
        'รหัสสินค้า': 'SP-003',
        'ชื่อสินค้า': 'มอเตอร์สายพาน 220V 50W',
        'ประเภท': 'อะไหล่มอเตอร์',
        'ชนิด': 'เกียร์มอเตอร์',
        'จำนวน': 5,
        'ที่อยู่': 'C1-02',
        'ราคาต้นทุน': 850,
        'ราคาตัวแทน': 1200,
        'ราคาขาย': 1500,
        'pic_h': 'sp003.jpg',
      }
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'คลังอะไหล่');
    XLSX.writeFile(wb, 'แบบฟอร์มนำเข้าอะไหล่_template.xlsx');
  };

  // ── Excel Processing ──
  const processExcelFile = (file) => {
    if (!file) return;
    setImportFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheet];
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          showAlert('ไม่พบข้อมูลในไฟล์', 'กรุณาตรวจสอบว่ามีข้อมูลในแผ่นงานแรกของไฟล์ Excel หรือไม่', 'warning');
          return;
        }

        // Helper to extract clean filename from full path like \\PART-HUALIAN\mydata\images\HL-000001.jpg
        const extractCleanFilename = (pathStr) => {
          if (!pathStr) return '';
          const s = String(pathStr).trim();
          const parts = s.split(/[/\\]/);
          return parts[parts.length - 1] || s;
        };

        // Helper to find row value by exact keys first, then loose fallback
        const getRowVal = (rowObj, exactKeys, looseKeys = []) => {
          const rowKeys = Object.keys(rowObj);
          for (const ek of exactKeys) {
            const found = rowKeys.find((k) => k.trim().toLowerCase() === ek.toLowerCase());
            if (found && rowObj[found] !== undefined && rowObj[found] !== null && String(rowObj[found]).trim() !== '') {
              return rowObj[found];
            }
          }
          for (const lk of looseKeys) {
            const found = rowKeys.find((k) => k.trim().toLowerCase().includes(lk.toLowerCase()));
            if (found && rowObj[found] !== undefined && rowObj[found] !== null && String(rowObj[found]).trim() !== '') {
              return rowObj[found];
            }
          }
          return '';
        };

        // Map columns supporting Microsoft Access (idname, name_h, type_h, chanid_h, amount_h, add_h, pic_h, para_h, para_tuwtan, para_sale)
        const mapped = [];
        let autoIndex = 1;

        rawJson.forEach((row) => {
          // 1. รหัสสินค้า (idname)
          let partCode = String(
            getRowVal(row, ['idname', 'id_name', 'part_code', 'code', 'item_code', 'รหัสสินค้า', 'รหัส'], ['idname', 'part_code'])
          ).trim();

          // 2. ชื่อสินค้า (name_h)
          const name = String(
            getRowVal(row, ['name_h', 'part_name', 'item_name', 'name', 'ชื่อสินค้า', 'ชื่อ', 'description'], ['name_h', 'ชื่อ'])
          ).trim();

          // 3. ประเภท (type_h)
          const category = String(
            getRowVal(row, ['type_h', 'category', 'หมวดหมู่', 'ประเภท', 'cat'], ['type_h', 'หมวดหมู่', 'ประเภท'])
          ).trim();

          // 4. ชนิด (chanid_h)
          const type = String(
            getRowVal(row, ['chanid_h', 'chanid', 'ชนิด', 'แบบ', 'spec', 'ขนาด'], ['chanid', 'ชนิด'])
          ).trim();

          // 5. จำนวน (amount_h)
          const quantity = safeInt(
            getRowVal(row, ['amount_h', 'amount', 'qty', 'quantity', 'stock', 'จำนวน', 'สต็อก'], ['amount_h', 'จำนวน'])
          );

          // 6. ที่อยู่ (add_h)
          const location = String(
            getRowVal(row, ['add_h', 'location', 'shelf', 'place', 'ที่อยู่', 'ชั้นวาง'], ['add_h', 'ที่อยู่'])
          ).trim();

          // 7. ราคาต้นทุน (para_h)
          const costPrice = safeFloat(
            getRowVal(row, ['para_h', 'cost_price', 'cost', 'ราคาต้นทุน', 'ต้นทุน', 'ทุน'], ['para_h', 'ต้นทุน'])
          );

          // 8. ราคาตัวแทน (para_tuwtan / para_tuwta)
          const dealerPrice = safeFloat(
            getRowVal(row, ['para_tuwtan', 'para_tuwta', 'para_tuw', 'dealer_price', 'dealer', 'ราคาตัวแทน', 'ตัวแทน', 'ราคาส่ง'], ['para_tuw', 'tuwtan', 'ตัวแทน'])
          );

          // 9. ราคาขาย (para_sale)
          const sellPrice = safeFloat(
            getRowVal(row, ['para_sale', 'sell_price', 'price', 'ราคาขาย', 'ราคา', 'ขาย'], ['para_sale', 'ราคาขาย'])
          );

          // 10. รูปภาพ (pic_h)
          const rawPic = String(
            getRowVal(row, ['pic_h', 'pic', 'image_name', 'image', 'รูปภาพ', 'ภาพ'], ['pic_h', 'รูป'])
          ).trim();
          const imageName = extractCleanFilename(rawPic);

          // Ignore rows where both code and name are completely empty
          if (partCode || name) {
            if (!partCode) {
              partCode = `SP-AUTO-${Date.now().toString().slice(-4)}-${autoIndex++}`;
            }
            mapped.push({
              part_code: partCode,
              name: name || partCode,
              category,
              type,
              quantity,
              location,
              cost_price: costPrice,
              dealer_price: dealerPrice,
              sell_price: sellPrice,
              image_name: imageName,
            });
          }
        });

        if (mapped.length === 0) {
          showAlert('ไม่พบแถวข้อมูล', 'ไม่พบคอลัมน์ที่ตรงกับข้อมูลอะไหล่ กรุณาตรวจสอบหัวตารางไฟล์ Excel', 'warning');
          return;
        }

        setImportRows(mapped);
      } catch (err) {
        console.error(err);
        showAlert('อ่านไฟล์ไม่สำเร็จ', 'ไม่สามารถอ่านข้อมูลจากไฟล์ได้ กรุณาลองใหม่อีกครั้ง', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleExcelDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processExcelFile(e.dataTransfer.files[0]);
    }
  };

  const handleExcelDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  // ── Confirm Excel Import (Deduplicate & Upsert to Supabase) ──
  const handleConfirmImport = async () => {
    if (importRows.length === 0) return;
    setIsImporting(true);

    try {
      const now = new Date().toISOString();
      const dedupMap = new Map();
      let duplicateCount = 0;

      // Deduplicate rows by part_code (PostgreSQL disallows same key twice in one ON CONFLICT statement)
      importRows.forEach((r) => {
        const rawCode = String(r.part_code || '').trim();
        if (!rawCode) return;
        const key = rawCode.toLowerCase();

        if (dedupMap.has(key)) {
          duplicateCount++;
          const existing = dedupMap.get(key);
          // Overwrite with latest row data, keep original casing
          dedupMap.set(key, {
            part_code: existing.part_code,
            name: r.name || existing.name,
            category: r.category || existing.category,
            type: r.type || existing.type,
            quantity: r.quantity !== undefined ? r.quantity : existing.quantity,
            location: r.location || existing.location,
            cost_price: r.cost_price || existing.cost_price,
            dealer_price: r.dealer_price || existing.dealer_price,
            sell_price: r.sell_price || existing.sell_price,
            image_name: r.image_name || existing.image_name,
            updated_at: now,
          });
        } else {
          dedupMap.set(key, {
            part_code: rawCode,
            name: r.name || rawCode,
            category: r.category || '',
            type: r.type || '',
            quantity: r.quantity || 0,
            location: r.location || '',
            cost_price: r.cost_price || 0,
            dealer_price: r.dealer_price || 0,
            sell_price: r.sell_price || 0,
            image_name: r.image_name || null,
            updated_at: now,
          });
        }
      });

      const payload = Array.from(dedupMap.values());

      if (payload.length === 0) {
        showAlert('ไม่มีข้อมูล', 'ไม่พบรายการที่ถูกต้องสำหรับนำเข้า', 'warning');
        setIsImporting(false);
        return;
      }

      // Upsert in batches of 50 unique items
      const batchSize = 50;
      for (let i = 0; i < payload.length; i += batchSize) {
        const batch = payload.slice(i, i + batchSize);
        const { error } = await supabase
          .from('parts')
          .upsert(batch, { onConflict: 'part_code' });
        if (error) {
          console.error('Batch upsert error:', error);
          throw error;
        }
      }

      await fetchParts();
      setShowImportModal(false);
      setImportRows([]);
      setImportFileName('');

      const dupMsg = duplicateCount > 0 ? ` (พบรหัสซ้ำในไฟล์ ${duplicateCount} รายการ ระบบรวมข้อมูลล่าสุดให้)` : '';
      showAlert(
        'นำเข้าข้อมูลสำเร็จ!',
        `อัปเดตและบันทึกข้อมูลอะไหล่จำนวน ${payload.length} รายการลงในฐานข้อมูลเรียบร้อยแล้ว${dupMsg}`,
        'success'
      );
    } catch (err) {
      console.error(err);
      showAlert('นำเข้าข้อมูลไม่สำเร็จ', err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  // ── Render ──
  return (
    <div className="pi-page">

      {/* ══ Header ══ */}
      <div className="pi-header">
        <div>
          <h1 className="pi-title">🔩 คลังอะไหล่</h1>
          <span className="pi-subtitle">{parts.length} รายการในคลัง</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <LocalImageToolbar />
          <button
            className="pi-btn-import"
            onClick={() => {
              setImportRows([]);
              setImportFileName('');
              setShowImportModal(true);
            }}
          >
            📥 นำเข้าไฟล์ Excel
          </button>
          <button className="pi-btn-add" onClick={openAdd}>
            ➕ เพิ่มอะไหล่ใหม่
          </button>
        </div>
      </div>

      {/* ══ Stats ══ */}
      <div className="pi-stats">
        <div className="pi-stat">
          <span className="pi-stat-icon">🔩</span>
          <div className="pi-stat-body">
            <div className="pi-stat-val">{parts.length}</div>
            <div className="pi-stat-lbl">รายการทั้งหมด</div>
          </div>
        </div>
        <div className="pi-stat warn">
          <span className="pi-stat-icon">⚠️</span>
          <div className="pi-stat-body">
            <div className="pi-stat-val">{lowCnt}</div>
            <div className="pi-stat-lbl">สต็อกใกล้หมด (≤5)</div>
          </div>
        </div>
        <div className="pi-stat danger">
          <span className="pi-stat-icon">❌</span>
          <div className="pi-stat-body">
            <div className="pi-stat-val">{outCnt}</div>
            <div className="pi-stat-lbl">สต็อกหมด</div>
          </div>
        </div>
        <div className="pi-stat success">
          <span className="pi-stat-icon">💰</span>
          <div className="pi-stat-body">
            <div className="pi-stat-val">฿{fmtNum(totalVal)}</div>
            <div className="pi-stat-lbl">มูลค่าคลัง (ทุน)</div>
          </div>
        </div>
      </div>

      {/* ══ Toolbar ══ */}
      <div className="pi-toolbar">
        <input
          className="pi-search"
          type="text"
          placeholder="🔍 ค้นหารหัส, ชื่อ, ประเภท, ที่อยู่..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="pi-cat-filter" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          <option value="">ทุกประเภท ({dbCategories.length} หมวด)</option>
          {dbCategories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {(search || filterCat) && (
          <button className="pi-clear-btn" onClick={() => { setSearch(''); setFilterCat(''); }}>
            ✕ ล้าง
          </button>
        )}
      </div>

      {/* ══ Main area ══ */}
      <div className={`pi-main ${selectedPart ? 'with-preview' : ''}`}>

        {/* ── Table ── */}
        <div className="pi-table-wrap">
          {isLoading ? (
            <div className="pi-center">⏳ กำลังโหลดข้อมูล...</div>
          ) : filtered.length === 0 ? (
            <div className="pi-center">
              <div style={{ fontSize: '3rem', marginBottom: 8 }}>🔩</div>
              <p style={{ color: '#94a3b8' }}>
                {parts.length === 0
                  ? 'ยังไม่มีอะไหล่ในคลัง กด "นำเข้าไฟล์ Excel" หรือ "เพิ่มอะไหล่ใหม่" เพื่อเริ่มต้น'
                  : 'ไม่พบรายการที่ค้นหา'}
              </p>
            </div>
          ) : (
            <>
            <table className="pi-table">
              <thead>
                <tr>
                  <th>รหัสสินค้า</th>
                  <th>ชื่อสินค้า</th>
                  <th>ประเภท</th>
                  <th>ชนิด</th>
                  <th className="tc">จำนวน</th>
                  <th>ที่อยู่</th>
                  <th className="tr">ราคาต้นทุน</th>
                  <th className="tr">ราคาตัวแทน</th>
                  <th className="tr">ราคาขาย</th>
                  <th className="tc">pic_h</th>
                  <th className="tc">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {paginatedParts.map((p) => {
                  const isSelected = selectedPart?.id === p.id;
                  const qty = Number(p.quantity);
                  const isOut = qty === 0;
                  const isLow = qty > 0 && qty <= 5;
                  return (
                    <tr
                      key={p.id}
                      className={`pi-row${isSelected ? ' selected' : ''}${isOut ? ' row-out' : isLow ? ' row-low' : ''}`}
                      onClick={() => handleRowClick(p)}
                      title="คลิกเพื่อดูรูปภาพและข้อมูลสรุป"
                    >
                      <td><span className="pi-code">{p.part_code}</span></td>
                      <td className="pi-name-cell">{p.name}</td>
                      <td>{p.category ? <span className="pi-cat">{p.category}</span> : '—'}</td>
                      <td style={{ color: '#cbd5e1', fontSize: '13px' }}>{p.type || '—'}</td>
                      <td className="tc">
                        <span className={`pi-qty ${isOut ? 'out' : isLow ? 'low' : 'ok'}`}>{p.quantity}</span>
                      </td>
                      <td style={{ color: '#93c5fd', fontSize: '13px' }}>{p.location || '—'}</td>
                      <td className="tr pi-price">฿{fmtNum(p.cost_price)}</td>
                      <td className="tr pi-price">฿{fmtNum(p.dealer_price)}</td>
                      <td className="tr pi-price sell">฿{fmtNum(p.sell_price)}</td>
                      <td className="tc">
                        {(() => {
                          const imgUrl = getPartImageUrl(p);
                          if (!imgUrl) return <span className="pi-no-img">ไม่มีรูป</span>;
                          return (
                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                              <img
                                src={imgUrl}
                                alt={p.name}
                                className="pi-thumb"
                                loading="lazy"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  if (e.currentTarget.nextElementSibling) {
                                    e.currentTarget.nextElementSibling.style.display = 'inline-block';
                                  }
                                }}
                              />
                              <span className="pi-no-img" style={{ display: 'none' }}>
                                {p.image_name ? `📁 ${p.image_name}` : 'ไม่มีรูป'}
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="tc" onClick={(e) => e.stopPropagation()}>
                        <div className="pi-actions">
                          <button className="pi-btn-icon edit" title="แก้ไข" onClick={(e) => openEdit(p, e)}>✏️</button>
                          <button className="pi-btn-icon del"  title="ลบ"   onClick={(e) => handleDelete(p, e)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination Controls (15 items per page) */}
            {filtered.length > 0 && (
              <div className="pi-pagination">
                <span className="pi-page-info">
                  แสดง <b>{startIndex + 1} - {Math.min(startIndex + ITEMS_PER_PAGE, filtered.length)}</b> จากทั้งหมด <b>{filtered.length}</b> รายการ (หน้าละ 15 รายการ)
                </span>
                <div className="pi-page-controls">
                  <button
                    className="pi-page-btn"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    title="หน้าแรก"
                  >
                    ⏮️
                  </button>
                  <button
                    className="pi-page-btn"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    title="หน้าก่อนหน้า"
                  >
                    ◀️ ก่อนหน้า
                  </button>
                  <span className="pi-page-current">
                    หน้า {currentPage} / {totalPages}
                  </span>
                  <button
                    className="pi-page-btn"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    title="หน้าถัดไป"
                  >
                    ถัดไป ▶️
                  </button>
                  <button
                    className="pi-page-btn"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    title="หน้าสุดท้าย"
                  >
                    ⏭️
                  </button>
                </div>
              </div>
            )}
            </>
          )}
        </div>

        {/* ── Preview Panel ── */}
        {selectedPart && (
          <div className="pi-preview">
            <div className="pi-preview-head">
              <span>📸 รูปภาพ & รายละเอียด</span>
              <button className="pi-preview-close" onClick={() => setSelectedPart(null)}>✕</button>
            </div>
            <div className="pi-preview-body">
              {(() => {
                const imgUrl = getPartImageUrl(selectedPart);
                return (
                  <div className="pi-preview-img-container" style={{ marginBottom: '14px' }}>
                    {imgUrl && (
                      <img
                        src={imgUrl}
                        alt={selectedPart.name}
                        className="pi-preview-img"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fallback = e.currentTarget.parentElement?.querySelector('.pi-preview-empty');
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    )}
                    <div
                      className="pi-preview-empty"
                      style={{ display: imgUrl ? 'none' : 'flex' }}
                    >
                      <span style={{ fontSize: '3rem' }}>🔩</span>
                      <p style={{ margin: '4px 0', fontSize: '13px' }}>
                        {selectedPart.image_name ? `ไม่พบไฟล์ ${selectedPart.image_name}` : 'ยังไม่มีรูปภาพ'}
                      </p>
                      <span style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
                        (ที่อยู่: D:\โปรแกรมคลัง\Mydata\images)
                      </span>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '4px' }}>
                        <LocalImageToolbar />
                        <button className="pi-btn-sm" onClick={(e) => openEdit(selectedPart, e)}>
                          📷 อัพโหลดรูปใหม่
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
              <div className="pi-preview-info">
                <div className="pi-pi-row"><span>รหัส</span><b>{selectedPart.part_code}</b></div>
                <div className="pi-pi-row"><span>ชื่อ</span><b>{selectedPart.name}</b></div>
                <div className="pi-pi-row"><span>ประเภท</span><b>{selectedPart.category || '—'}</b></div>
                <div className="pi-pi-row"><span>ชนิด</span><b>{selectedPart.type || '—'}</b></div>
                <div className="pi-pi-row"><span>จำนวน</span><b>{selectedPart.quantity} ชิ้น</b></div>
                <div className="pi-pi-row"><span>ที่อยู่</span><b>{selectedPart.location || '—'}</b></div>
                <div className="pi-pi-row"><span>ราคาต้นทุน</span><b>฿{fmtNum(selectedPart.cost_price)}</b></div>
                <div className="pi-pi-row"><span>ราคาตัวแทน</span><b>฿{fmtNum(selectedPart.dealer_price)}</b></div>
                <div className="pi-pi-row"><span>ราคาขาย</span><b className="sell">฿{fmtNum(selectedPart.sell_price)}</b></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══ Add/Edit Modal ══ */}
      {showModal && (
        <div className="pi-overlay" onClick={() => setShowModal(false)}>
          <div className="pi-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pi-modal-head">
              <h2>{editingId ? '✏️ แก้ไขอะไหล่' : '➕ เพิ่มอะไหล่ใหม่'}</h2>
              <button className="pi-modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <div className="pi-modal-body">
              {/* Image upload area */}
              <div className="pi-img-section">
                <div className="pi-img-box" onClick={() => formFileRef.current?.click()} title="คลิกเพื่ออัพโหลดรูป">
                  {form.image_data ? (
                    <img src={form.image_data} alt="preview" />
                  ) : form.image_name ? (
                    <div className="pi-img-ph">
                      <span style={{ fontSize: '2rem' }}>📁</span>
                      <span style={{ fontSize: '11px', color: '#93c5fd' }}>{form.image_name}</span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>คลิกเพื่ออัพโหลดรูปจริง</span>
                    </div>
                  ) : (
                    <div className="pi-img-ph">
                      <span>📷</span>
                      <span>คลิกเพื่ออัพโหลดรูป</span>
                    </div>
                  )}
                  {imgLoading && <div className="pi-img-loading">⏳ กำลังประมวลผล...</div>}
                </div>
                <input ref={formFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImgUpload} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <button className="pi-btn-sm" onClick={() => formFileRef.current?.click()}>
                    📷 {form.image_data ? 'เปลี่ยนรูป' : 'อัพโหลดรูป'}
                  </button>
                  {form.image_data && (
                    <button className="pi-btn-sm ghost" onClick={() => setForm((p) => ({ ...p, image_data: null, image_name: '' }))}>
                      🗑️ ลบรูป
                    </button>
                  )}
                </div>
              </div>

              {/* Fields */}
              <div className="pi-modal-fields">
                <div className="pi-field-2">
                  <div className="pi-field">
                    <label>รหัสสินค้า *</label>
                    <input
                      type="text"
                      value={form.part_code}
                      readOnly
                      className="pi-input-readonly"
                      placeholder="เช่น HL-000001"
                      title="รหัสสินค้ารันอัตโนมัติ ไม่สามารถพิมพ์แก้ไขได้"
                    />
                  </div>
                  <div className="pi-field">
                    <label>ที่อยู่ / ชั้นวาง</label>
                    <input type="text" value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} placeholder="เช่น OO03UP" />
                  </div>
                </div>

                <div className="pi-field">
                  <label>ชื่อสินค้า *</label>
                  <input type="text" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="ชื่ออะไหล่" />
                </div>

                <div className="pi-field-2">
                  <div className="pi-field">
                    <label>ประเภทอะไหล่</label>
                    <input
                      type="text"
                      list="db-categories-options"
                      value={form.category}
                      onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                      placeholder="คลิกเลือกหมวด หรือพิมพ์ใหม่..."
                    />
                    <datalist id="db-categories-options">
                      {dbCategories.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>

                  <div className="pi-field">
                    <label>ชนิด (รุ่นเครื่อง / สเปก)</label>
                    <input
                      type="text"
                      list="db-types-options"
                      value={form.type}
                      onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                      placeholder="คลิกเลือกรุ่น หรือพิมพ์ใหม่..."
                    />
                    <datalist id="db-types-options">
                      {dbTypes.map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div className="pi-field">
                  <label>จำนวน (ชิ้น)</label>
                  <input type="number" min="0" value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} placeholder="0" />
                </div>

                <div className="pi-field-3">
                  <div className="pi-field">
                    <label>ราคาต้นทุน (฿)</label>
                    <input type="number" min="0" step="0.01" value={form.cost_price} onChange={(e) => setForm((p) => ({ ...p, cost_price: e.target.value }))} placeholder="0.00" />
                  </div>
                  <div className="pi-field">
                    <label>ราคาตัวแทน (฿)</label>
                    <input type="number" min="0" step="0.01" value={form.dealer_price} onChange={(e) => setForm((p) => ({ ...p, dealer_price: e.target.value }))} placeholder="0.00" />
                  </div>
                  <div className="pi-field">
                    <label>ราคาขาย (฿)</label>
                    <input type="number" min="0" step="0.01" value={form.sell_price} onChange={(e) => setForm((p) => ({ ...p, sell_price: e.target.value }))} placeholder="0.00" />
                  </div>
                </div>
              </div>
            </div>

            <div className="pi-modal-foot">
              <button className="pi-btn-cancel" onClick={() => setShowModal(false)}>ยกเลิก</button>
              <button className="pi-btn-save" onClick={handleSave} disabled={isSaving}>
                {isSaving ? '⏳ กำลังบันทึก...' : (editingId ? '💾 บันทึกการแก้ไข' : '✅ เพิ่มอะไหล่')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Excel Import Modal ══ */}
      {showImportModal && (
        <div className="pi-overlay" onClick={() => !isImporting && setShowImportModal(false)}>
          <div className="pi-modal pi-import-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pi-modal-head">
              <h2>📥 นำเข้าและอัปเดตข้อมูลอะไหล่จาก Excel</h2>
              <button className="pi-modal-close" onClick={() => !isImporting && setShowImportModal(false)}>✕</button>
            </div>

            <div className="pi-modal-body" style={{ flexDirection: 'column' }}>
              {/* Instructions banner */}
              <div className="pi-import-guide">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px', fontSize: '14px', color: '#f1f5f9' }}>
                      📋 รูปแบบหัวตาราง Excel ที่ระบบรองรับอัตโนมัติ:
                    </h3>
                    <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#94a3b8' }}>
                      ✨ <strong>Microsoft Access:</strong> <code>idname</code>, <code>name_h</code>, <code>type_h</code>, <code>chanid_h</code>, <code>amount_h</code>, <code>add_h</code>, <code>pic_h</code>, <code>para_h</code>, <code>para_tuwtan</code>, <code>para_sale</code>
                    </p>
                    <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                      📌 <strong>ภาษาไทยทั่วไป:</strong> <code>รหัสสินค้า</code>, <code>ชื่อสินค้า</code>, <code>ประเภท</code>, <code>ชนิด</code>, <code>จำนวน</code>, <code>ที่อยู่</code>, <code>ราคาต้นทุน</code>, <code>ราคาตัวแทน</code>, <code>ราคาขาย</code>
                    </p>
                  </div>
                  <button className="pi-btn-sm" onClick={downloadTemplate} title="ดาวน์โหลดไฟล์ตัวอย่าง">
                    📥 ดาวน์โหลดไฟล์ตัวอย่าง (.xlsx)
                  </button>
                </div>
                <div className="pi-import-note">
                  💡 <strong>ระบบอัปเดตอัตโนมัติ (Upsert):</strong> หากรหัสสินค้าตรงกับที่มีอยู่แล้วในฐานข้อมูล ระบบจะอัปเดตข้อมูลให้ทันที หากเป็นรหัสใหม่จะเพิ่มเข้าระบบโดยอัตโนมัติ
                </div>
              </div>

              {/* Upload Drop Zone */}
              <div
                className={`pi-dropzone ${dragActive ? 'active' : ''}`}
                onDragEnter={handleExcelDrag}
                onDragLeave={handleExcelDrag}
                onDragOver={handleExcelDrag}
                onDrop={handleExcelDrop}
                onClick={() => importFileRef.current?.click()}
              >
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files?.[0]) processExcelFile(e.target.files[0]);
                  }}
                />
                <span className="pi-dropzone-icon">📊</span>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 600, color: '#f1f5f9' }}>
                    {importFileName ? `ไฟล์ที่เลือก: ${importFileName}` : 'ลากไฟล์มาวางที่นี่ หรือ คลิกเพื่อเลือกไฟล์ Excel'}
                  </p>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    รองรับไฟล์ .xlsx, .xls, .csv
                  </span>
                </div>
              </div>

              {/* Preview Table of Imported Rows */}
              {importRows.length > 0 && (
                <div className="pi-import-preview-wrap">
                  <div className="pi-import-preview-head">
                    <span style={{ fontWeight: 600, color: '#4ade80' }}>
                      ✓ ตรวจพบข้อมูล {importRows.length} รายการ (แสดงตัวอย่าง 5 แถวแรก):
                    </span>
                    <button
                      className="pi-clear-btn"
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                      onClick={() => { setImportRows([]); setImportFileName(''); }}
                    >
                      ✕ เลือกไฟล์ใหม่
                    </button>
                  </div>
                  <div style={{ overflowX: 'auto', maxHeight: '220px' }}>
                    <table className="pi-table" style={{ fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th>รหัสสินค้า</th>
                          <th>ชื่อสินค้า</th>
                          <th>ประเภท</th>
                          <th>ชนิด</th>
                          <th className="tc">จำนวน</th>
                          <th>ที่อยู่</th>
                          <th className="tr">ทุน</th>
                          <th className="tr">ตัวแทน</th>
                          <th className="tr">ขาย</th>
                          <th>pic_h</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.slice(0, 5).map((r, idx) => (
                          <tr key={idx}>
                            <td><span className="pi-code">{r.part_code}</span></td>
                            <td>{r.name}</td>
                            <td>{r.category || '—'}</td>
                            <td>{r.type || '—'}</td>
                            <td className="tc"><b>{r.quantity}</b></td>
                            <td>{r.location || '—'}</td>
                            <td className="tr">฿{fmtNum(r.cost_price)}</td>
                            <td className="tr">฿{fmtNum(r.dealer_price)}</td>
                            <td className="tr" style={{ color: '#4ade80' }}>฿{fmtNum(r.sell_price)}</td>
                            <td style={{ color: '#94a3b8' }}>{r.image_name || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="pi-modal-foot">
              <button
                className="pi-btn-cancel"
                onClick={() => setShowImportModal(false)}
                disabled={isImporting}
              >
                ยกเลิก
              </button>
              <button
                className="pi-btn-import"
                onClick={handleConfirmImport}
                disabled={isImporting || importRows.length === 0}
                style={{ padding: '10px 24px', fontSize: '14px' }}
              >
                {isImporting ? '⏳ กำลังบันทึกลงฐานข้อมูล...' : `🚀 ยืนยันบันทึก (${importRows.length} รายการ)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PartsInventory;
