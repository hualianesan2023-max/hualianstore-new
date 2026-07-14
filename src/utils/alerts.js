import Swal from 'sweetalert2';

// Create a custom styled SweetAlert instance
const SwalCustom = Swal.mixin({
  customClass: {
    popup: 'swal2-custom-popup',
    title: 'swal2-custom-title',
    htmlContainer: 'swal2-custom-html',
    confirmButton: 'swal2-custom-confirm-btn',
    cancelButton: 'swal2-custom-cancel-btn'
  },
  buttonsStyling: false
});

/**
 * Show a success notification popup
 */
export const showSuccess = (title, text = '') => {
  return SwalCustom.fire({
    title,
    text,
    icon: 'success',
    confirmButtonText: 'ตกลง'
  });
};

/**
 * Show an error warning popup
 */
export const showError = (title, text = '') => {
  return SwalCustom.fire({
    title,
    text,
    icon: 'error',
    confirmButtonText: 'ตกลง'
  });
};

/**
 * Show an informational warning popup
 */
export const showAlert = (title, text = '', icon = 'warning') => {
  return SwalCustom.fire({
    title,
    text,
    icon: icon,
    confirmButtonText: 'ตกลง'
  });
};

/**
 * Show a confirmation popup (Are you sure?)
 * Returns a promise that resolves to true if user confirms, false otherwise.
 */
export const showConfirm = async (
  title = 'คุณแน่ใจหรือไม่?', 
  text = 'การดำเนินการนี้ไม่สามารถย้อนกลับได้!', 
  confirmText = 'ใช่, ดำเนินการ', 
  cancelText = 'ยกเลิก'
) => {
  const result = await SwalCustom.fire({
    title,
    text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText
  });
  return result.isConfirmed;
};
