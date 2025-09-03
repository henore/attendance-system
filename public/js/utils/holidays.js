// public/js/utils/holidays.js
// 日本の祝日判定ユーティリティ

import JapaneseHolidays from 'japanese-holidays';

/**
 * 指定された日付が祝日かどうかをチェック
 * @param {Date|string} date - 日付オブジェクトまたは'YYYY-MM-DD'形式の文字列
 * @returns {boolean} 祝日の場合true
 */
export function isJapaneseHoliday(date) {
  try {
    if (typeof date === 'string') {
      // 'YYYY-MM-DD'形式の文字列をDateオブジェクトに変換
      date = new Date(date + 'T00:00:00');
    }
    
    if (!(date instanceof Date) || isNaN(date)) {
      return false;
    }
    
    return JapaneseHolidays.isHoliday(date);
  } catch (error) {
    console.error('祝日判定エラー:', error);
    return false;
  }
}

/**
 * 指定された日付の祝日名を取得
 * @param {Date|string} date - 日付オブジェクトまたは'YYYY-MM-DD'形式の文字列
 * @returns {string|null} 祝日名または null
 */
export function getJapaneseHolidayName(date) {
  try {
    if (typeof date === 'string') {
      date = new Date(date + 'T00:00:00');
    }
    
    if (!(date instanceof Date) || isNaN(date)) {
      return null;
    }
    
    const holiday = JapaneseHolidays.getHoliday(date);
    return holiday ? holiday.name : null;
  } catch (error) {
    console.error('祝日名取得エラー:', error);
    return null;
  }
}

/**
 * 指定された年月の祝日一覧を取得
 * @param {number} year - 年
 * @param {number} month - 月（1-12）
 * @returns {Array} 祝日の配列 [{date: Date, name: string}]
 */
export function getHolidaysInMonth(year, month) {
  try {
    const holidays = [];
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(year, month - 1, day);
      const holiday = JapaneseHolidays.getHoliday(date);
      
      if (holiday) {
        holidays.push({
          date: date,
          name: holiday.name,
          day: day
        });
      }
    }
    
    return holidays;
  } catch (error) {
    console.error('月内祝日取得エラー:', error);
    return [];
  }
}