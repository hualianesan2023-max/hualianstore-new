import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../data/supabaseClient';
import { showAlert } from '../utils/alerts';
import './MonthlyLicenseLock.css';

// Start enforcing monthly unlock on 1 November 2569 BE (2026-11-01 CE)
const LICENSE_START_YM = '2026-11';
const LOCAL_STORAGE_KEY = 'pos_license_unlocked_month';
const DB_LICENSE_ROW_ID = 'license_status';

// Returns current year-month in CE format "YYYY-MM" (normalizing BE years if OS clock is in BE)
export function getCurrentYearMonth(now = new Date()) {
  let year = now.getFullYear();
  if (year >= 2400) {
    year -= 543;
  }
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// Verify unlock code without exposing the raw code string in UI or plain constants
function verifyUnlockCode(input) {
  const cleaned = String(input || '').trim();
  if (cleaned.length !== 8) return false;
  // Target char codes for the 8-digit unlock code
  const expected = [53, 51, 49, 51, 48, 48, 49, 55];
  for (let i = 0; i < 8; i++) {
    if (cleaned.charCodeAt(i) !== expected[i]) return false;
  }
  return true;
}

const MonthlyLicenseLock = () => {
  const [currentYm, setCurrentYm] = useState(() => getCurrentYearMonth());
  const [unlockedYm, setUnlockedYm] = useState(() => {
    try {
      return localStorage.getItem(LOCAL_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [isCheckingCloud, setIsCheckingCloud] = useState(true);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef(null);

  // Fetch shared unlock status from Supabase so unlocking on 1 machine unlocks all 7-8 machines
  const fetchCloudLicenseStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('store_info')
        .select('id, name')
        .eq('id', DB_LICENSE_ROW_ID)
        .maybeSingle();

      if (!error && data && data.name) {
        const cloudYm = String(data.name).trim();
        setUnlockedYm((prev) => {
          const best = cloudYm > prev ? cloudYm : prev;
          try {
            if (best) localStorage.setItem(LOCAL_STORAGE_KEY, best);
          } catch {
            // ignore storage errors
          }
          return best;
        });
      }
    } catch {
      // Offline fallback uses localStorage
    } finally {
      setIsCheckingCloud(false);
    }
  }, []);

  useEffect(() => {
    fetchCloudLicenseStatus();

    // Periodically check the clock every 30s so crossing midnight into a new month locks immediately
    const timer = setInterval(() => {
      const nowYm = getCurrentYearMonth();
      setCurrentYm((prev) => (prev !== nowYm ? nowYm : prev));
    }, 30000);

    // Realtime subscription so when 1 machine enters the code, all other machines unlock immediately
    const channel = supabase
      .channel('monthly_license_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'store_info', filter: `id=eq.${DB_LICENSE_ROW_ID}` },
        (payload) => {
          const newYm = payload.new?.name ? String(payload.new.name).trim() : '';
          if (newYm) {
            setUnlockedYm(newYm);
            setShowCodeInput(false);
            setCodeInput('');
            setErrorMsg('');
            try {
              localStorage.setItem(LOCAL_STORAGE_KEY, newYm);
            } catch {
              // ignore
            }
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [fetchCloudLicenseStatus]);

  useEffect(() => {
    if (showCodeInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showCodeInput]);

  // Determine whether the system is currently locked:
  // Active starting 1 November 2569 (2026-11). Locked if unlockedYm < currentYm.
  const isLocked = currentYm >= LICENSE_START_YM && unlockedYm !== currentYm && !isCheckingCloud;

  if (!isLocked) {
    return null;
  }

  const handleUnlockSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!verifyUnlockCode(codeInput)) {
      setErrorMsg('รหัสปลดล็อกไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    const targetYm = getCurrentYearMonth();

    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, targetYm);
    } catch {
      // ignore
    }

    try {
      await supabase.from('store_info').upsert({
        id: DB_LICENSE_ROW_ID,
        name: targetYm,
        address: 'MONTHLY_LICENSE',
        phone: new Date().toISOString(),
        tax_id: 'ACTIVE',
        tax_rate: 0,
      });
    } catch {
      // Even if offline, local machine unlocks via state & localStorage
    }

    setUnlockedYm(targetYm);
    setCodeInput('');
    setShowCodeInput(false);
    setIsSubmitting(false);

    showAlert(
      'ปลดล็อกโปรแกรมสำเร็จ',
      'ระบบได้รับการต่ออายุสำหรับเดือนนี้เรียบร้อยแล้ว สามารถใช้งานได้ตามปกติ',
      'success'
    );
  };

  return (
    <div className="license-lock-overlay" role="dialog" aria-modal="true">
      <div className="license-lock-modal">
        <div className="license-lock-icon-wrap">🔒</div>
        <h2 className="license-lock-title">แจ้งเตือนการต่ออายุรายเดือน</h2>
        <div className="license-lock-message">
          โปรแกรมของคุณหมดอายุ โปรดติดต่อ
          <span className="license-lock-contact-highlight">
            นายโชคชัย วรรณวงศ์ (เอ็กเซล)
          </span>
        </div>

        {!showCodeInput ? (
          <button
            type="button"
            className="license-open-input-btn"
            onClick={() => {
              setShowCodeInput(true);
              setErrorMsg('');
            }}
          >
            🔑 กรอกรหัสปลดล็อก
          </button>
        ) : (
          <form className="license-form" onSubmit={handleUnlockSubmit}>
            <div className="license-input-wrap">
              <input
                ref={inputRef}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                className="license-code-input"
                placeholder="กรอกรหัสปลดล็อกเพื่อใช้งานต่อ"
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
              />
            </div>
            {errorMsg && <div className="license-error-text">{errorMsg}</div>}
            <div className="license-form-actions">
              <button
                type="submit"
                className="license-submit-btn"
                disabled={isSubmitting}
              >
                {isSubmitting ? '⏳ กำลังตรวจสอบ...' : '✅ ยืนยันรหัสปลดล็อก'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default MonthlyLicenseLock;
