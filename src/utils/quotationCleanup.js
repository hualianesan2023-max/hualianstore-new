/**
 * quotationCleanup.js
 * จัดการตรวจสอบและลบใบเสนอราคา (ทั้งเครื่องจักรและอะไหล่) ที่ไม่มีการทำอะไรต่อเกิน 1 เดือน (30 วัน)
 * โดยอัตโนมัติ เพื่อป้องกันฐานข้อมูลทำงานหนัก
 */

import { supabase } from '../data/supabaseClient';

const CLEANUP_THROTTLE_MS = 30 * 60 * 1000; // ทำงานอัตโนมัติทุกๆ 30 นาที (ไม่รบกวนเน็ตเวิร์กเกินไป)
const STORAGE_KEY_LAST_CLEANUP = 'pos_quotation_last_cleanup_timestamp';

/**
 * คำนวณว่าใบเสนอราคานี้เกิน 30 วัน (1 เดือน) หรือไม่
 * @param {string} dateVal - วันที่ในใบเสนอราคา เช่น '2026-10-15'
 * @param {string} createdAtVal - วันที่สร้างในระบบ เช่น '2026-10-15T...'
 * @param {number} maxAgeDays - จำนวนวันสูงสุด (ค่าเริ่มต้น 30 วัน)
 * @returns {boolean}
 */
export function isQuotationExpired(dateVal, createdAtVal, maxAgeDays = 30) {
  const now = new Date();
  let d = null;
  if (dateVal) {
    const parts = String(dateVal).split('T')[0].split('-');
    if (parts.length === 3) {
      let year = parseInt(parts[0], 10);
      if (year > 2500) year -= 543; // เผื่อปี พ.ศ.
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      d = new Date(year, month, day);
    } else {
      d = new Date(dateVal);
    }
  }
  if ((!d || isNaN(d.getTime())) && createdAtVal) {
    d = new Date(createdAtVal);
  }
  if (!d || isNaN(d.getTime())) return false;

  const diffMs = now.getTime() - d.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays > maxAgeDays;
}

/**
 * คำนวณจำนวนวันที่เหลือจนกว่าจะหมดอายุ (30 วัน)
 * @returns {number} จำนวนวันที่เหลือ (ติดลบคือหมดอายุแล้ว)
 */
export function getDaysRemaining(dateVal, createdAtVal, maxAgeDays = 30) {
  const now = new Date();
  let d = null;
  if (dateVal) {
    const parts = String(dateVal).split('T')[0].split('-');
    if (parts.length === 3) {
      let year = parseInt(parts[0], 10);
      if (year > 2500) year -= 543;
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      d = new Date(year, month, day);
    } else {
      d = new Date(dateVal);
    }
  }
  if ((!d || isNaN(d.getTime())) && createdAtVal) {
    d = new Date(createdAtVal);
  }
  if (!d || isNaN(d.getTime())) return maxAgeDays;

  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, maxAgeDays - diffDays);
}

/**
 * ฟังก์ชันหลักในการตรวจสอบและลบใบเสนอราคาที่หมดอายุ (> 30 วัน / 1 เดือน)
 * ครอบคลุมทั้งเครื่องจักร (quotations) และอะไหล่ (quotations_part)
 * @param {Object} options
 * @param {number} options.maxAgeDays - จำนวนวัน (ค่าเริ่มต้น 30 วัน)
 * @param {boolean} options.force - บังคับให้ตรวจสอบทันทีโดยไม่สนรอบเวลา
 * @returns {Promise<{success: boolean, deletedMachineCount: number, deletedPartCount: number, totalDeleted: number}>}
 */
export async function cleanupExpiredQuotations({ maxAgeDays = 30, force = false } = {}) {
  try {
    const lastCleanupStr = localStorage.getItem(STORAGE_KEY_LAST_CLEANUP);
    const now = Date.now();
    if (!force && lastCleanupStr) {
      const lastCleanup = parseInt(lastCleanupStr, 10);
      if (!isNaN(lastCleanup) && now - lastCleanup < CLEANUP_THROTTLE_MS) {
        // ยังไม่ถึงรอบตรวจสอบอัตโนมัติ
        return { success: true, throttled: true, totalDeleted: 0, deletedMachineCount: 0, deletedPartCount: 0 };
      }
    }

    let deletedMachineCount = 0;
    let deletedPartCount = 0;
    const deletedMachineIds = [];
    const deletedPartIds = [];

    // ─────────────────────────────────────────────────────────────
    // 1. ตรวจสอบใบเสนอราคาเครื่องจักร (quotations & quotation_items)
    // ─────────────────────────────────────────────────────────────
    try {
      const { data: mData, error: mErr } = await supabase
        .from('quotations')
        .select('id, date, created_at, customer_name')
        .range(0, 9999);

      if (!mErr && mData && mData.length > 0) {
        const expiredM = mData.filter((q) => isQuotationExpired(q.date, q.created_at, maxAgeDays));
        if (expiredM.length > 0) {
          const mIds = expiredM.map((q) => q.id);
          // ลบรายการย่อยก่อนเพื่อป้องกันปัญหา Foreign Key
          await supabase.from('quotation_items').delete().in('quotation_id', mIds);
          // ลบใบเสนอราคาหลัก
          const { error: delErr } = await supabase.from('quotations').delete().in('id', mIds);
          if (!delErr) {
            deletedMachineCount = mIds.length;
            deletedMachineIds.push(...mIds);
            console.info(`[AutoCleanup] ลบใบเสนอราคาเครื่องจักรที่เกิน 1 เดือน: ${mIds.join(', ')}`);
          } else {
            console.warn('[AutoCleanup] เกิดข้อผิดพลาดในการลบใบเสนอราคาเครื่องจักร:', delErr);
          }
        }
      }
    } catch (err) {
      console.warn('[AutoCleanup] Error checking machine quotations:', err);
    }

    // ─────────────────────────────────────────────────────────────
    // 2. ตรวจสอบใบเสนอราคาอะไหล่ (quotations_part & quotation_items_part)
    // ─────────────────────────────────────────────────────────────
    try {
      const { data: pData, error: pErr } = await supabase
        .from('quotations_part')
        .select('id, date, created_at, customer_name')
        .range(0, 9999);

      if (!pErr && pData && pData.length > 0) {
        const expiredP = pData.filter((q) => isQuotationExpired(q.date, q.created_at, maxAgeDays));
        if (expiredP.length > 0) {
          const pIds = expiredP.map((q) => q.id);
          // ลบรายการย่อยอะไหล่ก่อน
          await supabase.from('quotation_items_part').delete().in('quotation_id', pIds);
          // ลบใบเสนอราคาอะไหล่หลัก
          const { error: delErr } = await supabase.from('quotations_part').delete().in('id', pIds);
          if (!delErr) {
            deletedPartCount = pIds.length;
            deletedPartIds.push(...pIds);
            console.info(`[AutoCleanup] ลบใบเสนอราคาอะไหล่ที่เกิน 1 เดือน: ${pIds.join(', ')}`);
          } else {
            console.warn('[AutoCleanup] เกิดข้อผิดพลาดในการลบใบเสนอราคาอะไหล่:', delErr);
          }
        }
      }
    } catch (err) {
      console.warn('[AutoCleanup] Error checking parts quotations:', err);
    }

    // อัปเดตเวลาที่รันล่าสุด
    localStorage.setItem(STORAGE_KEY_LAST_CLEANUP, String(now));

    const totalDeleted = deletedMachineCount + deletedPartCount;
    return {
      success: true,
      throttled: false,
      totalDeleted,
      deletedMachineCount,
      deletedPartCount,
      deletedMachineIds,
      deletedPartIds,
    };
  } catch (globalErr) {
    console.error('[AutoCleanup] Global cleanup error:', globalErr);
    return { success: false, error: globalErr.message, totalDeleted: 0 };
  }
}
