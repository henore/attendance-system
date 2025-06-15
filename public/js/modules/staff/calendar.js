// modules/staff/calendar.js
// スタッフの出勤カレンダー機能（簡易版）

import { formatDate, getDaysInMonth } from '../../utils/date-time.js';

export class StaffCalendar {
  constructor(apiCall, showNotification) {
    this.apiCall = apiCall;
    this.showNotification = showNotification;
    this.currentDate = new Date();
    this.attendanceCache = new Map();
  }

  /**
   * カレンダーをレンダリング
   */
  render() {
    return `
      <div class="calendar-container">
        <div class="calendar-header">
          <button class="calendar-nav-btn" id="prevMonthStaffCalendar">
            <i class="fas fa-chevron-left"></i>
          </button>
          <h6 class="calendar-title" id="calendarTitleStaffCalendar">${formatDate(this.currentDate, {
            year: 'numeric',
            month: 'long'
          })}</h6>
          <button class="calendar-nav-btn" id="nextMonthStaffCalendar">
            <i class="fas fa-chevron-right"></i>
          </button>
        </div>
        <div class="calendar-grid" id="calendarGridStaffCalendar">
          <!-- カレンダーの日付がここに表示される -->
        </div>
      </div>
    `;
  }

  /**
   * 初期化
   */
  init() {
    this.setupEventListeners();
    this.updateCalendar();
  }

  /**
   * イベントリスナーを設定
   */
  setupEventListeners() {
    const prevBtn = document.getElementById('prevMonthStaffCalendar');
    const nextBtn = document.getElementById('nextMonthStaffCalendar');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        this.updateCalendar();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        this.updateCalendar();
      });
    }
  }

  /**
   * カレンダーを更新
   */
  async updateCalendar() {
    const titleElement = document.getElementById('calendarTitleStaffCalendar');
    const gridElement = document.getElementById('calendarGridStaffCalendar');

    if (!gridElement) return;

    if (titleElement) {
      titleElement.textContent = formatDate(this.currentDate, {
        year: 'numeric',
        month: 'long'
      });
    }

    gridElement.innerHTML = await this.generateCalendarGrid();
  }

  /**
   * カレンダーグリッドを生成
   */
  async generateCalendarGrid() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const today = new Date();
    
    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    let html = '';

    // 曜日ヘッダー
    const dayHeaders = ['日', '月', '火', '水', '木', '金', '土'];
    dayHeaders.forEach(day => {
      html += `<div class="calendar-day-header">${day}</div>`;
    });

    // 日付セル
    const current = new Date(startDate);
    for (let i = 0; i < 42; i++) {
      const isCurrentMonth = current.getMonth() === month;
      const isToday = current.toDateString() === today.toDateString();
      
      let classes = ['calendar-day'];
      if (!isCurrentMonth) classes.push('other-month');
      if (isToday) classes.push('today');

      html += `
        <div class="${classes.join(' ')}">
          <div class="calendar-day-number">${current.getDate()}</div>
        </div>
      `;

      current.setDate(current.getDate() + 1);
    }

    return html;
  }

  /**
   * リフレッシュ
   */
  async refresh() {
    this.attendanceCache.clear();
    await this.updateCalendar();
  }
}