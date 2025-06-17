// modules/user/calendar.js
// 利用者の出勤履歴カレンダー

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { formatDate, getDaysInMonth } from '../../utils/date-time.js';
import { modalManager } from '../shared/modal-manager.js';

export class UserAttendanceCalendar {
  constructor(apiCall, showNotification) {
    this.apiCall = apiCall;
    this.showNotification = showNotification;
    this.currentDate = new Date();
    this.attendanceCache = new Map();
  }

  /**
   * カレンダーをレンダリング
   * @param {HTMLElement} container 
   */
  async render(container) {
    if (!container) return;

    container.innerHTML = this.generateCalendarHTML();
    this.setupEventListeners();
    await this.updateCalendar();
  }

  /**
   * カレンダーHTMLを生成
   * @returns {string}
   */
  generateCalendarHTML() {
    return `
      <div class="calendar-container">
        <div class="calendar-header">
          <button class="calendar-nav-btn" id="prevMonthUser">
            <i class="fas fa-chevron-left"></i>
          </button>
          <h6 class="calendar-title" id="calendarTitleUser">${formatDate(this.currentDate, {
            year: 'numeric',
            month: 'long'
          })}</h6>
          <button class="calendar-nav-btn" id="nextMonthUser">
            <i class="fas fa-chevron-right"></i>
          </button>
        </div>
        <div class="calendar-grid" id="calendarGridUser">
          <!-- カレンダーの日付がここに表示される -->
        </div>
      </div>
    `;
  }

  /**
   * イベントリスナーを設定
   */
  setupEventListeners() {
    const prevBtn = document.getElementById('prevMonthUser');
    const nextBtn = document.getElementById('nextMonthUser');

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
    const titleElement = document.getElementById('calendarTitleUser');
    const gridElement = document.getElementById('calendarGridUser');

    if (!gridElement) return;

    if (titleElement) {
      titleElement.textContent = formatDate(this.currentDate, {
        year: 'numeric',
        month: 'long'
      });
    }

    // カレンダーグリッド更新
    gridElement.innerHTML = await this.generateCalendarGrid();
    this.setupDateClickHandlers();
  }

  /**
   * カレンダーグリッドを生成
   * @returns {Promise<string>}
   */
  async generateCalendarGrid() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const today = new Date();
    
    // 月の最初の日と最後の日
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // カレンダーの開始日（前月の日曜日から）
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    // 月内のすべての日付のデータを事前に取得
    const monthDataPromises = [];
    const current = new Date(startDate);
    for (let i = 0; i < 42; i++) {
      if (current.getMonth() === month) {
        const dateStr = current.toISOString().split('T')[0];
        monthDataPromises.push(this.getAttendanceData(dateStr));
      }
      current.setDate(current.getDate() + 1);
    }
    await Promise.all(monthDataPromises);

    let html = '';

    // 曜日ヘッダー
    const dayHeaders = ['日', '月', '火', '水', '木', '金', '土'];
    dayHeaders.forEach(day => {
      html += `<div class="calendar-day-header">${day}</div>`;
    });

    // 日付セル
    current.setTime(startDate.getTime());
    for (let i = 0; i < 42; i++) { // 6週間分
      const isCurrentMonth = current.getMonth() === month;
      const isToday = current.toDateString() === today.toDateString();
      const dateStr = current.toISOString().split('T')[0];
      const dayOfWeek = current.getDay();
      const attendanceData = this.attendanceCache.get(dateStr);
      
      let classes = ['calendar-day'];
      if (!isCurrentMonth) classes.push('other-month');
      if (isToday) classes.push('today');
      
      // 土日の色分け
      if (dayOfWeek === 0) classes.push('sunday');
      if (dayOfWeek === 6) classes.push('saturday');
      
      // 出勤状況による色分け
      if (attendanceData) {
        if (attendanceData.hasReport) {
          classes.push('has-work'); // 日報提出済み（緑）
        } else if (attendanceData.hasAttendance) {
          classes.push('has-comment'); // 出勤のみ（黄）
        }
      }

      html += `
        <div class="${classes.join(' ')}" data-date="${dateStr}">
          <div class="calendar-day-number">${current.getDate()}</div>
          ${this.generateWorkIndicators(attendanceData)}
        </div>
      `;

      current.setDate(current.getDate() + 1);
    }

    return html;
  }

  /**
   * 作業インジケーターを生成
   * @param {Object} attendanceData 
   * @returns {string}
   */
  generateWorkIndicators(attendanceData) {
    if (!attendanceData || !attendanceData.hasAttendance) return '';

    let html = '<div class="calendar-day-indicators">';
    
    // 出勤マーク
    html += '<span class="calendar-indicator indicator-work" title="出勤記録あり"></span>';
    
    // 日報マーク
    if (attendanceData.hasReport) {
      html += '<span class="calendar-indicator indicator-report" title="日報提出済み" style="background: #28a745;"></span>';
    }
    
    // コメントマーク
    if (attendanceData.hasComment) {
      html += '<span class="calendar-indicator indicator-comment" title="スタッフコメントあり" style="background: #007bff;"></span>';
    }
    
    html += '</div>';

    return html;
  }

  /**
   * 出勤データを取得
   * @param {string} dateStr 
   * @returns {Object|null}
   */
  async getAttendanceData(dateStr) {
    // キャッシュから取得
    if (this.attendanceCache.has(dateStr)) {
      return this.attendanceCache.get(dateStr);
    }

    try {
      const response = await this.apiCall(API_ENDPOINTS.USER.REPORT_BY_DATE(dateStr));
      const data = {
        hasAttendance: !!(response.attendance && response.attendance.clock_in),
        hasReport: !!response.report,
        hasComment: !!response.staffComment,
        attendance: response.attendance,
        report: response.report,
        staffComment: response.staffComment
      };
      this.attendanceCache.set(dateStr, data);
      return data;
    } catch (error) {
      console.error('出勤データ取得エラー:', error);
      return null;
    }
  }

  /**
   * 日付クリックハンドラーを設定
   */
  setupDateClickHandlers() {
    const dayElements = document.querySelectorAll('#calendarGridUser .calendar-day:not(.other-month)');
    dayElements.forEach(dayElement => {
      dayElement.addEventListener('click', () => {
        const dateStr = dayElement.getAttribute('data-date');
        this.onDateClick(dateStr);
      });
    });
  }

  /**
   * 日付クリック時の処理
   * @param {string} dateStr 
   */
  async onDateClick(dateStr) {
    try {
      const cachedData = this.attendanceCache.get(dateStr);
      
      if (cachedData && (cachedData.hasAttendance || cachedData.hasReport)) {
        this.showAttendanceDetail(dateStr, cachedData);
      } else {
        // キャッシュにない場合は再取得
        const response = await this.apiCall(API_ENDPOINTS.USER.REPORT_BY_DATE(dateStr));
        if (response.attendance || response.report) {
          const data = {
            attendance: response.attendance,
            report: response.report,
            staffComment: response.staffComment
          };
          this.showAttendanceDetail(dateStr, data);
        } else {
          this.showNotification('この日の記録はありません', 'info');
        }
      }
    } catch (error) {
      console.error('記録取得エラー:', error);
    }
  }

  /**
   * 出勤詳細を表示
   * @param {string} dateStr 
   * @param {Object} data 
   */
  showAttendanceDetail(dateStr, data) {
    const formattedDate = formatDate(dateStr, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });

    // 日報ハンドラーのインスタンスを作成（表示生成のため）
    const { UserReportHandler } = require('./report.js');
    const reportHandler = new UserReportHandler(this.apiCall, this.showNotification);
    const content = reportHandler.generatePastRecordDisplay(data);

    modalManager.create({
      id: 'userAttendanceDetailModal',
      title: `<i class="fas fa-calendar-check"></i> ${formattedDate}の記録`,
      content: content,
      size: 'modal-lg',
      headerClass: 'bg-primary text-white',
      saveButton: false
    });

    modalManager.show('userAttendanceDetailModal');
  }

  /**
   * カレンダーをリフレッシュ
   */
  async refresh() {
    // キャッシュをクリア
    this.attendanceCache.clear();
    
    // カレンダー更新
    await this.updateCalendar();
  }

  /**
   * 特定月のサマリーを取得
   * @returns {Object}
   */
  async getMonthSummary() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month + 1);
    
    let workDays = 0;
    let reportDays = 0;
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const data = await this.getAttendanceData(dateStr);
      
      if (data) {
        if (data.hasAttendance) workDays++;
        if (data.hasReport) reportDays++;
      }
    }
    
    return {
      workDays,
      reportDays,
      totalDays: daysInMonth
    };
  }
}

// カレンダーインジケーター用のCSS（必要に応じて）
const calendarStyles = `
.calendar-day-indicators {
  position: absolute;
  bottom: 2px;
  right: 2px;
  display: flex;
  gap: 2px;
}

.calendar-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}

.indicator-work {
  background: #6c757d;
}

.indicator-report {
  background: #28a745;
}

.indicator-comment {
  background: #007bff;
}
`;