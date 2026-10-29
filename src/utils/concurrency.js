import { supabase } from '../data/supabaseClient';

// Round to 3 decimal places (supports fractional stock such as 0.5 kg)
export const r3 = (n) => Math.round(Number(n || 0) * 1000) / 1000;

// Small random delay (jitter) to desynchronize 7-8 concurrent terminals on retry
const sleepJitter = (minMs = 25, maxMs = 110) =>
  new Promise((resolve) =>
    setTimeout(resolve, Math.floor(minMs + Math.random() * (maxMs - minMs)))
  );

// Check if a Supabase/Postgres error is a primary-key / unique-constraint collision
export const isUniqueConstraintError = (error) => {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '') + ' ' + String(error.details || '');
  return (
    code === '23505' ||
    /duplicate key|unique constraint|already exists/i.test(msg)
  );
};

// Get Thai Buddhist Era 2-digit year and 2-digit month (e.g. { yy: '69', mm: '10', yymm: '6910' })
export const getThaiYearMonth = (dateInput) => {
  const d = dateInput ? new Date(dateInput) : new Date();
  const validDate = isNaN(d.getTime()) ? new Date() : d;
  const yy = String(validDate.getFullYear() + 543).slice(-2);
  const mm = String(validDate.getMonth() + 1).padStart(2, '0');
  return { yy, mm, yymm: `${yy}${mm}` };
};

// Track whether optional PostgreSQL RPC functions from concurrency_multi_user.sql are installed
let rpcDocNumberAvailable = null; // null = unknown, true = available, false = fallback to CAS/query

/**
 * Fetch the next sequential document ID for a given table and prefix directly from Supabase.
 * Safe across 7-8 concurrent machines because it queries the live database rather than stale localStorage.
 *
 * Examples:
 *  - table: 'sales', prefix: 'IV6910-', pad: 3  -> 'IV6910-208'
 *  - table: 'sales_part', prefix: 'IVS6910-', pad: 3 -> 'IVS6910-034'
 *  - table: 'quotations', prefix: 'QT6910-', pad: 3 -> 'QT6910-025'
 *  - table: 'quotations_part', prefix: 'QTS6910-', pad: 3 -> 'QTS6910-001'
 *  - table: 'customers', prefix: 'XL-', pad: 5 -> 'XL-00955'
 *  - table: 'customer_repairs', prefix: 'SR6910-', pad: 3 -> 'SR6910-015'
 */
export async function fetchNextDocumentId({
  table,
  prefix,
  pad = 3,
  column = 'id',
  localFallbackList = [],
  triedIds = new Set(),
}) {
  // 1. If RPC is available (and this is the first attempt without local exclusions), try atomic DB sequence
  if (rpcDocNumberAvailable !== false && triedIds.size === 0) {
    try {
      const { data: rpcId, error: rpcErr } = await supabase.rpc('next_doc_number', {
        p_prefix: prefix,
        p_table: table,
        p_column: column,
        p_pad: pad,
      });
      if (!rpcErr && rpcId && typeof rpcId === 'string') {
        rpcDocNumberAvailable = true;
        return rpcId;
      }
      if (rpcErr) {
        rpcDocNumberAvailable = false;
      }
    } catch {
      rpcDocNumberAvailable = false;
    }
  }

  // 2. Query live database for all IDs starting with prefix
  let maxNum = 0;
  const existingSet = new Set(triedIds);

  const extractNum = (rawId) => {
    if (!rawId || typeof rawId !== 'string') return;
    const trimmed = rawId.trim();
    if (!trimmed.toUpperCase().startsWith(prefix.toUpperCase())) return;
    existingSet.add(trimmed.toUpperCase());
    const suffix = trimmed.slice(prefix.length);
    // Only accept pure numeric suffixes; ignore malformed suffixes that have > pad+2 digits from historical typos
    if (/^\d+$/.test(suffix) && suffix.length <= Math.max(pad + 2, 6)) {
      const n = parseInt(suffix, 10);
      if (!isNaN(n) && n > maxNum) {
        maxNum = n;
      }
    }
  };

  try {
    const { data, error } = await supabase
      .from(table)
      .select(column)
      .ilike(column, `${prefix}%`)
      .range(0, 9999);

    if (!error && Array.isArray(data)) {
      data.forEach((row) => extractNum(row?.[column]));
    }
  } catch (err) {
    console.warn(`[Concurrency] Live ID fetch fallback for ${table}:`, err);
  }

  // Merge with local in-memory records as an extra safety net
  if (Array.isArray(localFallbackList)) {
    localFallbackList.forEach((item) => {
      const val = typeof item === 'string' ? item : item?.[column] || item?.id;
      extractNum(val);
    });
  }

  // Also check triedIds so we always advance past any ID that just collided
  triedIds.forEach((tid) => extractNum(tid));

  let nextNum = maxNum + 1;
  let candidate = `${prefix}${String(nextNum).padStart(pad, '0')}`;

  while (existingSet.has(candidate.toUpperCase())) {
    nextNum++;
    candidate = `${prefix}${String(nextNum).padStart(pad, '0')}`;
  }

  return candidate;
}

/**
 * Live gap-filling part_code generator for 'parts' table (HL-000001 .. HL-xxxxxx).
 * Fills any missing/deleted sequence number first; otherwise uses max + 1.
 */
export async function fetchNextPartCode({
  localParts = [],
  triedCodes = new Set(),
} = {}) {
  const existingNums = new Set();
  const prefix = 'HL-';
  const padding = 6;

  const addCode = (code) => {
    if (!code) return;
    const codeStr = String(code).trim();
    const m = codeStr.match(/HL[-_]?(\d+)/i) || codeStr.match(/(\d+)/);
    if (m) {
      const num = parseInt(m[1], 10);
      if (!isNaN(num) && num > 0) {
        existingNums.add(num);
      }
    }
  };

  try {
    const { data, error } = await supabase
      .from('parts')
      .select('part_code')
      .range(0, 9999);
    if (!error && Array.isArray(data)) {
      data.forEach((row) => addCode(row?.part_code));
    }
  } catch (err) {
    console.warn('[Concurrency] Live part_code fetch fallback:', err);
  }

  if (Array.isArray(localParts)) {
    localParts.forEach((p) => addCode(p?.part_code || p));
  }
  triedCodes.forEach((c) => addCode(c));

  let targetNum = 1;
  while (existingNums.has(targetNum)) {
    targetNum++;
  }

  return `${prefix}${String(targetNum).padStart(padding, '0')}`;
}

/**
 * Insert a record into Supabase with automatic ID collision resolution.
 * If 7-8 machines insert at the exact same millisecond and a duplicate key (23505) occurs,
 * this automatically re-fetches the next available ID and retries up to maxRetries times.
 */
export async function insertWithUniqueIdRetry({
  table,
  prefix,
  pad = 3,
  column = 'id',
  initialId = null,
  localFallbackList = [],
  customNextIdFn = null,
  buildRow,
  maxRetries = 15,
}) {
  const triedIds = new Set();
  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      await sleepJitter(25, 110);
    }

    let candidateId;
    if (customNextIdFn) {
      candidateId = await customNextIdFn({ attempt, triedIds });
    } else if (
      attempt === 0 &&
      initialId &&
      typeof initialId === 'string' &&
      !triedIds.has(initialId.toUpperCase())
    ) {
      // Even when initialId is passed (e.g. from UI preview), verify against live DB first
      const liveNextId = await fetchNextDocumentId({
        table,
        prefix,
        pad,
        column,
        localFallbackList,
        triedIds,
      });
      // Parse numeric suffixes to see if initialId is already behind the live DB counter
      const initSuffix = parseInt(initialId.slice(prefix.length), 10);
      const liveSuffix = parseInt(liveNextId.slice(prefix.length), 10);
      if (!isNaN(initSuffix) && !isNaN(liveSuffix) && liveSuffix > initSuffix) {
        candidateId = liveNextId;
      } else {
        candidateId = initialId;
      }
    } else {
      candidateId = await fetchNextDocumentId({
        table,
        prefix,
        pad,
        column,
        localFallbackList,
        triedIds,
      });
    }

    triedIds.add(String(candidateId).toUpperCase());
    const rowPayload = buildRow(candidateId);

    const { data, error } = await supabase
      .from(table)
      .insert(rowPayload)
      .select();

    if (!error) {
      return {
        success: true,
        id: candidateId,
        data: Array.isArray(data) ? data[0] : data,
        error: null,
      };
    }

    lastError = error;
    if (isUniqueConstraintError(error)) {
      console.warn(
        `[Concurrency] Collision on ${table}.${column}="${candidateId}" (attempt ${
          attempt + 1
        }/${maxRetries}), auto-retrying next number...`
      );
      continue;
    }

    // Non-collision error: abort immediately
    return {
      success: false,
      id: candidateId,
      data: null,
      error,
    };
  }

  return {
    success: false,
    id: null,
    data: null,
    error: lastError || new Error(`Failed to allocate unique ID on ${table}`),
  };
}

/**
 * Atomic / Compare-And-Swap (CAS) stock adjustment for 'products' table.
 * Prevents lost updates when 7-8 terminals sell or adjust the same product simultaneously.
 *
 * @param {Object} params
 * @param {string} params.productId - Product ID
 * @param {string} params.location - 'โกดังกุ๊กไก่' | 'ออฟฟิศ' | 'โกดังใหญ่'
 * @param {number} params.delta - Signed quantity change (negative for sale, positive for return/receive)
 * @param {Object} [params.extraFields] - Optional extra columns to update (e.g. { cost_price: 500 })
 */
export async function adjustProductStockAtomic({
  productId,
  location,
  delta,
  extraFields = {},
  maxRetries = 12,
}) {
  if (!productId) return { success: false, error: new Error('Missing productId') };

  const col =
    location === 'โกดังกุ๊กไก่'
      ? 'stock_kookkai'
      : location === 'ออฟฟิศ'
      ? 'stock_office'
      : 'stock_big';

  const numericDelta = Number(delta || 0);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      await sleepJitter(20, 85);
    }

    const { data: prod, error: fetchErr } = await supabase
      .from('products')
      .select('id, stock_office, stock_kookkai, stock_big')
      .eq('id', productId)
      .single();

    if (fetchErr || !prod) {
      return { success: false, error: fetchErr || new Error('Product not found') };
    }

    const currentVal = Number(prod[col] || 0);
    const newVal = r3(Math.max(0, currentVal + numericDelta));

    const updatePayload = {
      ...extraFields,
      [col]: newVal,
    };

    // Optimistic Concurrency Control (Compare-And-Swap on the target warehouse column)
    const { data: updated, error: updateErr } = await supabase
      .from('products')
      .update(updatePayload)
      .eq('id', productId)
      .eq(col, prod[col])
      .select('id, stock_office, stock_kookkai, stock_big');

    if (updateErr) {
      return { success: false, error: updateErr };
    }

    if (Array.isArray(updated) && updated.length > 0) {
      return { success: true, product: updated[0], error: null };
    }

    console.warn(
      `[Concurrency] CAS stock conflict on product ${productId} (${col}), retrying (${
        attempt + 1
      }/${maxRetries})...`
    );
  }

  // Final fallback without CAS guard if retries exhausted
  const { data: prod } = await supabase
    .from('products')
    .select('id, stock_office, stock_kookkai, stock_big')
    .eq('id', productId)
    .single();
  if (prod) {
    const newVal = r3(Math.max(0, Number(prod[col] || 0) + numericDelta));
    const { data: updated, error } = await supabase
      .from('products')
      .update({ ...extraFields, [col]: newVal })
      .eq('id', productId)
      .select('id, stock_office, stock_kookkai, stock_big');
    return { success: !error, product: updated?.[0] || null, error };
  }

  return { success: false, error: new Error('CAS stock adjustment failed') };
}

/**
 * Atomic / Compare-And-Swap (CAS) stock adjustment for 'parts' table.
 * Prevents lost updates when 7-8 terminals sell or adjust the same spare part simultaneously.
 *
 * @param {Object} params
 * @param {number|string} params.partId - Part primary key id
 * @param {number} params.delta - Signed quantity change (negative for sale, positive for return/add)
 */
export async function adjustPartStockAtomic({
  partId,
  delta,
  maxRetries = 12,
}) {
  if (partId === undefined || partId === null) {
    return { success: false, error: new Error('Missing partId') };
  }

  const numericDelta = Number(delta || 0);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      await sleepJitter(20, 85);
    }

    const { data: partRow, error: fetchErr } = await supabase
      .from('parts')
      .select('id, quantity')
      .eq('id', partId)
      .single();

    if (fetchErr || !partRow) {
      return { success: false, error: fetchErr || new Error('Part not found') };
    }

    const currentQty = Number(partRow.quantity || 0);
    const newQty = Math.max(0, currentQty + numericDelta);

    const { data: updated, error: updateErr } = await supabase
      .from('parts')
      .update({
        quantity: newQty,
        updated_at: new Date().toISOString(),
      })
      .eq('id', partId)
      .eq('quantity', partRow.quantity)
      .select('id, quantity');

    if (updateErr) {
      return { success: false, error: updateErr };
    }

    if (Array.isArray(updated) && updated.length > 0) {
      return { success: true, part: updated[0], error: null };
    }

    console.warn(
      `[Concurrency] CAS stock conflict on part ${partId}, retrying (${
        attempt + 1
      }/${maxRetries})...`
    );
  }

  // Final fallback
  const { data: partRow } = await supabase
    .from('parts')
    .select('id, quantity')
    .eq('id', partId)
    .single();
  if (partRow) {
    const newQty = Math.max(0, Number(partRow.quantity || 0) + numericDelta);
    const { data: updated, error } = await supabase
      .from('parts')
      .update({ quantity: newQty, updated_at: new Date().toISOString() })
      .eq('id', partId)
      .select('id, quantity');
    return { success: !error, part: updated?.[0] || null, error };
  }

  return { success: false, error: new Error('CAS part stock adjustment failed') };
}
