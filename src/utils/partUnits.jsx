import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

// รายการหน่วยนับมาตรฐานสำหรับขายอะไหล่ (เรียงตามลำดับในภาพต้นฉบับ)
export const PART_UNITS = [
  'ตัว',
  'งาน',
  'ลิตร',
  'กล่อง',
  'เส้น',
  'เมตร',
  'ม้วน',
  'แท่ง',
  'ใบ',
  'ชุด',
  'ลูก',
];

export const DEFAULT_PART_UNIT = 'ตัว';

const UNIT_MEMORY_KEY = 'pos_part_unit_memory_v1';
const UNIT_MARKER = '||unit:';

export function getRememberedPartUnit(partCode) {
  if (!partCode) return DEFAULT_PART_UNIT;
  try {
    const raw = localStorage.getItem(UNIT_MEMORY_KEY);
    if (!raw) return DEFAULT_PART_UNIT;
    const map = JSON.parse(raw);
    return map[String(partCode).trim().toUpperCase()] || DEFAULT_PART_UNIT;
  } catch {
    return DEFAULT_PART_UNIT;
  }
}

export function rememberPartUnit(partCode, unit) {
  if (!partCode || !unit) return;
  try {
    const raw = localStorage.getItem(UNIT_MEMORY_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[String(partCode).trim().toUpperCase()] = String(unit).trim();
    localStorage.setItem(UNIT_MEMORY_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

/**
 * Encodes location + unit safely into `selected_location` so `sale_items_part`
 * stores the exact unit in Supabase immediately without requiring schema changes.
 */
export function encodePartLocationWithUnit(location, unit) {
  const cleanLoc = String(location || 'หน้าร้าน').split(UNIT_MARKER)[0].trim() || 'หน้าร้าน';
  const cleanUnit = String(unit || DEFAULT_PART_UNIT).trim() || DEFAULT_PART_UNIT;
  return `${cleanLoc}${UNIT_MARKER}${cleanUnit}`;
}

/**
 * Parses `location` and `unit` from a `sale_items_part` row.
 * Supports both dedicated `unit` column (if added later) and `||unit:` encoded in `selected_location`.
 */
export function parsePartItemLocationAndUnit(it, fallbackUnit = DEFAULT_PART_UNIT) {
  const rawLoc = String(it?.selected_location || '');
  if (it?.unit && String(it.unit).trim()) {
    const cleanLoc = rawLoc.includes(UNIT_MARKER) ? rawLoc.split(UNIT_MARKER)[0] : rawLoc;
    return {
      location: cleanLoc || '—',
      unit: String(it.unit).trim(),
    };
  }
  if (rawLoc.includes(UNIT_MARKER)) {
    const [locPart, unitPart] = rawLoc.split(UNIT_MARKER);
    return {
      location: locPart || '—',
      unit: (unitPart || '').trim() || fallbackUnit,
    };
  }
  return {
    location: rawLoc || '—',
    unit: fallbackUnit,
  };
}

/**
 * ComboBox หน่วยนับอะไหล่ (เลือกจากรายการดรอปดาวน์ทั้ง 11 หน่วย หรือพิมพ์เองได้)
 */
export const PartUnitComboBox = ({
  value,
  onChange,
  showLabel = true,
  width = 86,
  compact = false,
}) => {
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 96 });
  const wrapRef = useRef(null);
  const menuRef = useRef(null);

  const updatePosition = () => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const menuHeight = 270;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < menuHeight && rect.top > menuHeight;
    setDropdownPos({
      top: openUpward ? rect.top - menuHeight - 4 : rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 96),
    });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const handleOutside = (e) => {
      if (
        wrapRef.current &&
        !wrapRef.current.contains(e.target) &&
        menuRef.current &&
        !menuRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const handleScrollOrResize = () => updatePosition();

    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [open]);

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
      }}
    >
      {showLabel && (
        <span style={{ fontSize: '11.5px', color: '#9ca3af', whiteSpace: 'nowrap', fontWeight: 600 }}>
          หน่วย
        </span>
      )}
      <div
        ref={wrapRef}
        style={{
          display: 'inline-flex',
          alignItems: 'stretch',
          width: typeof width === 'number' ? `${width}px` : width,
          background: '#11121c',
          border: open ? '1.5px solid #6366f1' : '1px solid #334155',
          borderRadius: '6px',
          overflow: 'hidden',
          height: compact ? '28px' : '30px',
          boxSizing: 'border-box',
        }}
      >
        <input
          type="text"
          value={value ?? DEFAULT_PART_UNIT}
          onChange={(e) => onChange(e.target.value)}
          onClick={() => setOpen(true)}
          onFocus={(e) => {
            e.target.select();
          }}
          onBlur={() => {
            if (!String(value ?? '').trim()) {
              onChange(DEFAULT_PART_UNIT);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'Enter') {
              setOpen(false);
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            } else if (e.key === 'ArrowDown' && !open) {
              setOpen(true);
            }
          }}
          placeholder="หน่วย"
          title="เลือกหน่วยนับจากรายการ หรือพิมพ์กำหนดเอง"
          style={{
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            color: '#f8fafc',
            fontSize: '12.5px',
            fontWeight: 600,
            padding: '0 6px',
            textAlign: 'center',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen((prev) => !prev);
          }}
          title="คลิกเพื่อเลือกหน่วยนับ"
          style={{
            width: '22px',
            border: 'none',
            borderLeft: '1px solid #2e303a',
            background: open ? 'rgba(99, 102, 241, 0.25)' : '#1e293b',
            color: '#cbd5e1',
            fontSize: '10px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            flexShrink: 0,
          }}
        >
          ▾
        </button>
      </div>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: `${dropdownPos.top}px`,
              left: `${dropdownPos.left}px`,
              width: `${dropdownPos.width}px`,
              maxHeight: '268px',
              overflowY: 'auto',
              background: '#1e293b',
              border: '1.5px solid #6366f1',
              borderRadius: '8px',
              boxShadow: '0 12px 28px rgba(0, 0, 0, 0.65)',
              zIndex: 99999,
              padding: '4px 0',
            }}
          >
            {PART_UNITS.map((u) => {
              const isSelected = String(value || '').trim() === u;
              return (
                <div
                  key={u}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(u);
                    setOpen(false);
                  }}
                  style={{
                    padding: '6px 12px',
                    fontSize: '13px',
                    fontWeight: isSelected ? 700 : 500,
                    color: isSelected ? '#38bdf8' : '#f1f5f9',
                    background: isSelected ? 'rgba(56, 189, 248, 0.14)' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span>{u}</span>
                  {isSelected && <span style={{ fontSize: '11px' }}>✓</span>}
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
};
