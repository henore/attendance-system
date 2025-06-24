// utils/date-time.js
// 日本時間（JST）に統一した日時関連のユーティリティ関数
// CommonJS形式で全てのサーバーサイドコードから利用可能

/**
 * JSTの現在日時を取得
 * @returns {Date} JST日時のDateオブジェクト
 */
const getJSTNow = () => {
  const now = new Date();
  // UTCからJSTへの変換（+9時間）
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  const jstTime = new Date(utcTime + (9 * 60 * 60 * 1000));
  return jstTime;
};

/**
 * JSTの現在日付を YYYY-MM-DD 形式で取得
 * @returns {string}
 */
const getCurrentDate = () => {
  const jst = getJSTNow();
  const year = jst.getFullYear();
  const month = String(jst.getMonth() + 1).padStart(2, '0');
  const day = String(jst.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * JSTの現在時刻を HH:MM 形式で取得
 * @returns {string}
 */
const getCurrentTime = () => {
  const jst = getJSTNow();
  const hours = String(jst.getHours()).padStart(2, '0');
  const minutes = String(jst.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

/**
 * 日付を日本語形式でフォーマット
 * @param {string|Date} date 
 * @param {Object} options 
 * @returns {string}
 */
const formatDate = (date, options = {}) => {
  const defaultOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  };
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString('ja-JP', { ...defaultOptions, ...options });
};

/**
 * 時刻を分に変換
 * @param {string} timeStr HH:MM形式
 * @returns {number}
 */
const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * 分を時刻に変換
 * @param {number} minutes 
 * @returns {string} HH:MM形式
 */
const minutesToTime = (minutes) => {
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
const calculateWorkHours = (clockIn, clockOut, breakMinutes = 0) => {
  if (!clockIn || !clockOut) return null;
  
  try {
    const startMinutes = timeToMinutes(clockIn);
    const endMinutes = timeToMinutes(clockOut);
    let durationMinutes = endMinutes - startMinutes;
    
    // 日をまたぐ場合の処理
    if (durationMinutes < 0) {
      durationMinutes += 24 * 60;
    }
    
    const netMinutes = durationMinutes - breakMinutes;
    const hours = netMinutes / 60;
    
    return hours > 0 ? hours : 0;
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
const calculateBreakDuration = (startTime, endTime) => {
  if (!startTime || !endTime) return 0;
  
  try {
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    let duration = endMinutes - startMinutes;
    
    // 日をまたぐ場合の処理
    if (duration < 0) {
      duration += 24 * 60;
    }
    
    return duration;
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
const adjustTime = (time, type) => {
  const [h, m] = time.split(':').map(Number);
  
  if (type === 'in') {
    if (h < 9 || (h === 8 && m <= 46)) return '09:00';
  } else {
    if (h > 15 || (h === 15 && m >= 30)) return '15:45';
  }
  
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
const getDaysInMonth = (year, month) => {
  return new Date(year, month, 0).getDate();
};

/**
 * 日付の差分を日数で取得
 * @param {Date|string} date1 
 * @param {Date|string} date2 
 * @returns {number}
 */
const getDaysDifference = (date1, date2) => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2 - d1);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * 日付文字列をJST Dateオブジェクトに変換
 * @param {string} dateStr YYYY-MM-DD形式
 * @param {string} timeStr HH:MM形式（オプション）
 * @returns {Date}
 */
const parseJSTDate = (dateStr, timeStr = '00:00') => {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  
  // JSTでDateオブジェクトを作成
  const jstDate = new Date(year, month - 1, day, hours, minutes, 0);
  return jstDate;
};

/**
 * 日付をフォーマット（シンプル版）
 * @param {Date|string} date 
 * @param {string} format 'date' | 'time' | 'datetime'
 * @returns {string}
 */
const formatDateTime = (date, format = 'datetime') => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const jst = new Date(dateObj.getTime() + (9 * 60 * 60 * 1000));
  
  const year = jst.getFullYear();
  const month = String(jst.getMonth() + 1).padStart(2, '0');
  const day = String(jst.getDate()).padStart(2, '0');
  const hours = String(jst.getHours()).padStart(2, '0');
  const minutes = String(jst.getMinutes()).padStart(2, '0');
  
  switch (format) {
    case 'date':
      return `${year}-${month}-${day}`;
    case 'time':
      return `${hours}:${minutes}`;
    case 'datetime':
    default:
      return `${year}-${month}-${day} ${hours}:${minutes}`;
  }
};

/**
 * 申し送り用の日本時間フォーマット
 * @returns {string} YYYY/MM/DD HH:MM形式
 */
const getHandoverDateTime = () => {
  const jst = getJSTNow();
  const year = jst.getFullYear();
  const month = String(jst.getMonth() + 1).padStart(2, '0');
  const day = String(jst.getDate()).padStart(2, '0');
  const hours = String(jst.getHours()).padStart(2, '0');
  const minutes = String(jst.getMinutes()).padStart(2, '0');
  
  return `${year}/${month}/${day} ${hours}:${minutes}`;
};

// CommonJS形式でエクスポート
module.exports = {
  getJSTNow,
  getCurrentDate,
  getCurrentTime,
  formatDate,
  timeToMinutes,
  minutesToTime,
  calculateWorkHours,
  calculateBreakDuration,
  adjustTime,
  getDaysInMonth,
  getDaysDifference,
  parseJSTDate,
  formatDateTime,
  getHandoverDateTime
};