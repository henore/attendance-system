// public/js/utils/holidays.js
// 日本の祝日判定ユーティリティ（内閣府API版）

// 祝日データキャッシュ
let holidaysCache = null;
let cacheExpiry = null;

/**
 * 内閣府APIから祝日データを取得
 * @returns {Promise<Object>} 祝日データオブジェクト
 */
async function fetchJapaneseHolidays() {
  // キャッシュが有効な場合は使用（1日間）
  const now = Date.now();
  if (holidaysCache && cacheExpiry && now < cacheExpiry) {
    return holidaysCache;
  }

  try {
    const response = await fetch('https://holidays-jp.github.io/api/v1/date.json');
    if (!response.ok) {
      throw new Error(`祝日API取得エラー: ${response.status}`);
    }
    
    const data = await response.json();
    
    // キャッシュを更新（1日間有効）
    holidaysCache = data;
    cacheExpiry = now + (24 * 60 * 60 * 1000);
    
    console.log('✅ 祝日データを取得しました');
    return data;
  } catch (error) {
    console.error('祝日API取得エラー:', error);
    throw error;
  }
}

/**
 * 指定された日付が祝日かどうかをチェック
 * @param {Date|string} date - 日付オブジェクトまたは'YYYY-MM-DD'形式の文字列
 * @returns {boolean} 祝日の場合true（同期版・キャッシュのみ）
 */
export function isJapaneseHoliday(date) {
  if (!holidaysCache) return false;
  
  try {
    let dateStr;
    
    if (typeof date === 'string') {
      dateStr = date;
    } else if (date instanceof Date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      dateStr = `${year}-${month}-${day}`;
    } else {
      return false;
    }
    
    return holidaysCache.hasOwnProperty(dateStr);
  } catch (error) {
    return false;
  }
}

/**
 * 指定された日付の祝日名を取得
 * @param {Date|string} date - 日付オブジェクトまたは'YYYY-MM-DD'形式の文字列
 * @returns {string|null} 祝日名または null
 */
export function getJapaneseHolidayName(date) {
  if (!holidaysCache) return null;
  
  try {
    let dateStr;
    
    if (typeof date === 'string') {
      dateStr = date;
    } else if (date instanceof Date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      dateStr = `${year}-${month}-${day}`;
    } else {
      return null;
    }
    
    return holidaysCache[dateStr] || null;
  } catch (error) {
    return null;
  }
}

/**
 * 祝日データを事前読み込み（カレンダー表示前に呼び出し）
 * @returns {Promise<void>}
 */
export async function preloadHolidays() {
  await fetchJapaneseHolidays();
}

/**
 * 指定された年月の祝日一覧を取得
 * @param {number} year - 年
 * @param {number} month - 月（1-12）
 * @returns {Array} 祝日の配列（キャッシュのみ使用）
 */
export function getHolidaysInMonth(year, month) {
  if (!holidaysCache) return [];
  
  try {
    const monthStr = String(month).padStart(2, '0');
    const result = [];
    
    Object.entries(holidaysCache).forEach(([dateStr, name]) => {
      const [holidayYear, holidayMonth] = dateStr.split('-');
      
      if (parseInt(holidayYear) === year && holidayMonth === monthStr) {
        const day = parseInt(dateStr.split('-')[2]);
        result.push({
          date: dateStr,
          name: name,
          day: day
        });
      }
    });
    
    return result.sort((a, b) => a.day - b.day);
  } catch (error) {
    return [];
  }
}