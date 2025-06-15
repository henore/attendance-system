// utils/date-time.js
// 日時関連のユーティリティ関数

/**
 * 現在の日付を YYYY-MM-DD 形式で取得
 * @returns {string}
 */
export const getCurrentDate = () => {
  return new Date().toISOString().split('T')[0];
};

/**
 * 現在の時刻を HH:MM 形式で取得
 * @returns {string}
 */
export const getCurrentTime = () => {
  return new Date().toTimeString().split(' ')[0].substring(0, 5);
};

/**
 * 日付を日本語形式でフォーマット
 * @param {string|Date} date 
 * @param {Object} options 
 * @returns {string}
 */
export const formatDate = (date, options = {}) => {
  const defaultOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  };
  return new Date(date).toLocaleDateString('ja-JP', { ...defaultOptions, ...options });
};

/**
 * 時刻を分に変換
 * @param {string} timeStr HH:MM形式
 * @returns {number}
 */
export const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * 分を時刻に変換
 * @param {number} minutes 
 * @returns {string} HH:MM形式
 */
export const minutesToTime = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

/**
 * 勤務時間を計算（時間単位）
 * @param {string} clockIn 
 * @param {string} clockOut 
 * @param {number} breakMinutes 休憩時間（分）
 * @returns {number|null}
 */
export const calculateWorkHours = (clockIn, clockOut, breakMinutes = 0) => {
  if (!clockIn || !clockOut) return null;
  
  try {
    const start = new Date(`1970-01-01 ${clockIn}`);
    const end = new Date(`1970-01-01 ${clockOut}`);
    const durationMs = end - start;
    const hours = durationMs / (1000 * 60 * 60);
    const netHours = hours - (breakMinutes / 60);
    
    return netHours > 0 ? netHours : 0;
  } catch (error) {
    console.error('勤務時間計算エラー:', error);
    return null;
  }
};

/**
 * 休憩時間を計算（分単位）
 * @param {string} startTime 
 * @param {string} endTime 
 * @returns {number}
 */
export const calculateBreakDuration = (startTime, endTime) => {
  if (!startTime || !endTime) return 0;
  
  try {
    const start = new Date(`1970-01-01 ${startTime}`);
    const end = new Date(`1970-01-01 ${endTime}`);
    const durationMs = end - start;
    return Math.round(durationMs / (1000 * 60));
  } catch (error) {
    console.error('休憩時間計算エラー:', error);
    return 0;
  }
};

/**
 * 時刻を15分単位に調整
 * @param {string} time HH:MM形式
 * @param {string} type 'in' or 'out'
 * @returns {string}
 */
export const adjustTime = (time, type) => {
  const [h, m] = time.split(':').map(Number);
  
  if (type === 'in') {
    // 8:46以前は9:00に
    if (h < 9 || (h === 8 && m <= 46)) {
      return '09:00';
    }
  } else {
    // 15:30以降は15:45に
    if (h > 15 || (h === 15 && m >= 30)) {
      return '15:45';
    }
  }
  
  // 15分単位で切り上げ
  const totalMinutes = h * 60 + m;
  const rounded = Math.ceil(totalMinutes / 15) * 15;
  return minutesToTime(rounded);
};

/**
 * 月の日数を取得
 * @param {number} year 
 * @param {number} month 1-12
 * @returns {number}
 */
export const getDaysInMonth = (year, month) => {
  return new Date(year, month, 0).getDate();
};

/**
 * 日付の差分を日数で取得
 * @param {Date|string} date1 
 * @param {Date|string} date2 
 * @returns {number}
 */
export const getDaysDifference = (date1, date2) => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2 - d1);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};