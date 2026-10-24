import React, { useState, useEffect, useCallback } from 'react';

// In-memory cache for Object URLs indexed from user-picked local folder
const indexedFiles = new Map();
let folderName = '';
let serverConnected = false;
let serverStats = {
  connected: false,
  imagesDir: 'D:\\โปรแกรมคลัง\\Mydata\\images',
  imagesCount: 0,
};

const listeners = new Set();
const notifyListeners = () => {
  listeners.forEach((fn) => {
    try { fn(); } catch (e) { console.error(e); }
  });
};

// Check if dev server / backend is serving local images
export async function checkLocalServerStatus() {
  try {
    const res = await fetch('/api/local-images-status', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      serverConnected = Boolean(data.connected);
      serverStats = { ...serverStats, ...data };
      notifyListeners();
      return serverStats;
    }
  } catch (err) {
    // try fallback route
    try {
      const res2 = await fetch('/local-images-status', { cache: 'no-store' });
      if (res2.ok) {
        const data2 = await res2.json();
        serverConnected = Boolean(data2.connected);
        serverStats = { ...serverStats, ...data2 };
        notifyListeners();
        return serverStats;
      }
    } catch (e) {}
  }
  serverConnected = false;
  notifyListeners();
  return serverStats;
}

// Index files from HTML5 FileList (webkitdirectory)
export function indexLocalFiles(fileList, dirName = '') {
  if (!fileList || fileList.length === 0) return 0;
  let added = 0;
  folderName = dirName || 'โฟลเดอร์ในเครื่อง';

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const name = file.name;
    if (!name || name.startsWith('.')) continue;

    // Check image extensions
    if (!/\.(jpg|jpeg|png|webp|bmp|gif)$/i.test(name)) continue;

    const url = URL.createObjectURL(file);
    const lowerName = name.toLowerCase().trim();
    const noExt = lowerName.replace(/\.[^.]+$/, '');
    const cleanAlpha = lowerName.replace(/[^a-z0-9]/g, '');
    const cleanNoExt = noExt.replace(/[^a-z0-9]/g, '');

    // Map variations
    indexedFiles.set(lowerName, url);
    indexedFiles.set(noExt, url);
    indexedFiles.set(cleanAlpha, url);
    indexedFiles.set(cleanNoExt, url);
    added++;
  }

  notifyListeners();
  return added;
}

// Helper to look up part image
export function getPartImageUrl(part) {
  if (!part) return null;
  if (part.image_data) return part.image_data; // Manual base64 upload

  const rawName = String(part.image_name || '').trim();
  const rawCode = String(part.part_code || '').trim();

  // 1. Check in-memory browser-picked folder first
  if (indexedFiles.size > 0) {
    if (rawName && indexedFiles.has(rawName.toLowerCase())) {
      return indexedFiles.get(rawName.toLowerCase());
    }
    const cleanName = rawName.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (cleanName && indexedFiles.has(cleanName)) {
      return indexedFiles.get(cleanName);
    }
    if (rawCode && indexedFiles.has(rawCode.toLowerCase())) {
      return indexedFiles.get(rawCode.toLowerCase());
    }
    const cleanCode = rawCode.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (cleanCode && indexedFiles.has(cleanCode)) {
      return indexedFiles.get(cleanCode);
    }
  }

  // 2. Server route
  if (rawName) {
    return `/local-parts-images/${encodeURIComponent(rawName)}`;
  }
  if (rawCode) {
    return `/local-parts-images/${encodeURIComponent(rawCode)}.jpg`;
  }

  return null;
}

// Helper to look up product / machine image (Disabled: user specified machines do not display images)
export function getProductImageUrl(product) {
  return null;
}

// React Hook
export function useLocalImages() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const handler = () => setTick((t) => t + 1);
    listeners.add(handler);
    // Initial server check
    checkLocalServerStatus();
    return () => listeners.delete(handler);
  }, []);

  const totalIndexed = indexedFiles.size > 0 ? Math.floor(indexedFiles.size / 2) : 0;
  const isConnected = serverConnected || indexedFiles.size > 0;

  return {
    isConnected,
    serverConnected,
    serverStats,
    indexedCount: totalIndexed,
    folderName,
    recheckServer: checkLocalServerStatus,
    indexFiles: indexLocalFiles,
    getPartImageUrl,
    getProductImageUrl,
  };
}

// Visual status pill & modal component
export function LocalImageToolbar({ onFolderConnected }) {
  const { isConnected, serverConnected, serverStats, indexedCount, folderName, recheckServer, indexFiles } = useLocalImages();
  const [showModal, setShowModal] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [message, setMessage] = useState('');

  const handleManualCheck = async () => {
    setIsChecking(true);
    setMessage('กำลังตรวจสอบการเชื่อมต่อโฟลเดอร์รูปภาพอะไหล่ในเครื่อง...');
    const stats = await checkLocalServerStatus();
    setIsChecking(false);
    if (stats.connected) {
      setMessage(`✅ ตรวจพบรูปภาพอะไหล่ในเครื่องสำเร็จ! (อะไหล่: ${stats.imagesCount} รูป)`);
    } else {
      setMessage('⚠️ ยังไม่พบโฟลเดอร์ภาพที่ D:\\โปรแกรมคลัง\\Mydata\\images คุณสามารถกดปุ่ม "เลือกโฟลเดอร์รูปภาพอะไหล่" ด้านล่างเพื่อเชื่อมต่อได้โดยตรงครับ');
    }
  };

  const handleDirectorySelect = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const count = indexLocalFiles(files, files[0]?.webkitRelativePath?.split('/')[0] || 'โฟลเดอร์ที่เลือก');
      setMessage(`🎉 เชื่อมต่อภาพอะไหล่จากเครื่องเรียบร้อยแล้ว! นำเข้ารูปได้ ${count} ภาพ`);
      if (onFolderConnected) onFolderConnected(count);
    }
  };

  return (
    <>
      <div
        className="local-img-status-bar"
        onClick={() => setShowModal(true)}
        title="คลิกเพื่อจัดการการเชื่อมต่อรูปภาพอะไหล่ในเครื่อง"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 10px',
          borderRadius: '20px',
          fontSize: '12px',
          fontWeight: '500',
          cursor: 'pointer',
          background: isConnected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
          border: `1px solid ${isConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          color: isConnected ? '#34d399' : '#f87171',
          transition: 'all 0.2s ease',
          userSelect: 'none'
        }}
      >
        <span style={{ fontSize: '14px' }}>{isConnected ? '🟢' : '🔴'}</span>
        <span>
          {serverConnected
            ? `รูปภาพอะไหล่: เชื่อมต่อแล้ว (${serverStats.imagesCount || 0} รูป)`
            : indexedCount > 0
            ? `เชื่อมต่อรูปอะไหล่จาก ${folderName} (${indexedCount} รูป)`
            : 'ตรวจหารูปไม่เจอ (คลิกเพื่อเชื่อมต่อ)'}
        </span>
        <span style={{ fontSize: '11px', opacity: 0.8 }}>⚙️</span>
      </div>

      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: '#1e2238',
              border: '1px solid #333a5c',
              borderRadius: '14px',
              padding: '24px',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
              color: '#f1f5f9'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📁 การเชื่อมต่อรูปภาพอะไหล่ในเครื่อง
              </h3>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.6', marginBottom: '16px' }}>
              ระบบสามารถเชื่อมโยงรูปภาพอะไหล่จากเครื่องของคุณโดยตรงตามรหัสอะไหล่หรือชื่อไฟล์รูปภาพ (เช่น <code>HL-000001.jpg</code>)
            </div>

            {/* Current Status Box */}
            <div style={{
              background: '#131627',
              borderRadius: '10px',
              padding: '14px',
              marginBottom: '18px',
              border: '1px solid #282e4a'
            }}>
              <div style={{ fontWeight: '600', marginBottom: '8px', color: '#cbd5e1' }}>
                สถานะการเชื่อมต่อ:
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                <span>{serverStats.imagesCount > 0 || indexedCount > 0 ? '🟢' : '⚪'}</span>
                <span>คลังรูปภาพอะไหล่ (images): <b>{serverStats.imagesCount || indexedCount || 0} รูป</b></span>
                <span style={{ color: '#64748b', fontSize: '11px' }}>({serverStats.imagesDir})</span>
              </div>
            </div>

            {message && (
              <div style={{
                background: message.includes('✅') || message.includes('🎉') ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                border: `1px solid ${message.includes('✅') || message.includes('🎉') ? '#10b981' : '#f87171'}`,
                color: message.includes('✅') || message.includes('🎉') ? '#34d399' : '#fca5a5',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                marginBottom: '16px',
                lineHeight: '1.5'
              }}>
                {message}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Option 1: Re-detect from server */}
              <button
                type="button"
                onClick={handleManualCheck}
                disabled={isChecking}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  background: '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  fontWeight: '600',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                🔄 {isChecking ? 'กำลังตรวจหา...' : 'ตรวจหารูปภาพอะไหล่อัตโนมัติ (D:\\โปรแกรมคลัง\\Mydata\\images)'}
              </button>

              {/* Option 2: Choose folder from browser */}
              <label
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  background: '#252a42',
                  border: '1px dashed #4b5563',
                  color: '#e2e8f0',
                  fontWeight: '500',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  textAlign: 'center'
                }}
              >
                📂 เลือกโฟลเดอร์รูปภาพอะไหล่จากเครื่อง (images)
                <input
                  type="file"
                  webkitdirectory="true"
                  directory="true"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleDirectorySelect}
                />
              </label>
            </div>

            <div style={{ marginTop: '16px', textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  background: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid #475569',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
