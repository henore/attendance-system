// modules/staff/attendance-book.js
// スタッフの出勤簿機能ハンドラー（修正版）

import { formatDate, getDaysInMonth } from '../../utils/date-time.js';
import { modalManager } from '../shared/modal-manager.js';
import { isJapaneseHoliday, preloadHolidays } from '../../utils/holidays.js';

export class StaffAttendanceBook {
  constructor(apiCall, showNotification) {
    this.apiCall = apiCall;
    this.showNotification = showNotification;
    this.currentDate = new Date();
    this.attendanceCache = new Map();
    this.currentModalId = null; // 現在のモーダルIDを追跡
  }

  /**
   * 出勤簿セクションをレンダリング
   */
  render() {
    return `
      <div class="custom-card">
        <div class="custom-card-header">
          <h5><i class="fas fa-calendar-check"></i> スタッフ出勤簿</h5>
          <button class="btn btn-outline-light btn-sm" id="refreshAttendanceBookBtn">
            <i class="fas fa-sync"></i> 更新
          </button>
        </div>
        <div class="card-body">
          <div id="attendanceCalendarContainer">
            <!-- 出勤簿カレンダーがここに表示される -->
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 出勤簿を読み込み
   */
  async load() {
    const container = document.getElementById('attendanceCalendarContainer');
    if (!container) return;
    
    // 出勤データキャッシュを読み込み
    await this.loadAttendanceCache();
    
    // カレンダーHTML挿入
    container.innerHTML = this.generateCalendarHTML();
    
    // イベントリスナー設定
    this.setupEventListeners();
    
    // カレンダー更新
    await this.updateCalendar();
    
  }

  /**
   * カレンダーHTMLを生成
   */
  generateCalendarHTML() {
    return `
      <div class="calendar-container">
        <div class="calendar-header">
          <button class="calendar-nav-btn" id="prevMonthStaff">
            <i class="fas fa-chevron-left"></i>
          </button>
          <h6 class="calendar-title" id="calendarTitleStaff">${formatDate(this.currentDate, {
            year: 'numeric',
            month: 'long'
          })}</h6>
          <button class="calendar-nav-btn" id="nextMonthStaff">
            <i class="fas fa-chevron-right"></i>
          </button>
        </div>
        <div class="calendar-grid" id="calendarGridStaff">
          <!-- カレンダーの日付がここに表示される -->
        </div>
      </div>
    `;
  }

  /**
   * イベントリスナーを設定
   */
  setupEventListeners() {
    const prevBtn = document.getElementById('prevMonthStaff');
    const nextBtn = document.getElementById('nextMonthStaff');
    const refreshBtn = document.getElementById('refreshAttendanceBookBtn');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        const newDate = new Date(this.currentDate);
        newDate.setMonth(newDate.getMonth() - 1);
        
        // 1年間制限チェック
        if (this.isWithinOneYear(newDate)) {
          this.currentDate = newDate;
          this.updateCalendar();
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const newDate = new Date(this.currentDate);
        newDate.setMonth(newDate.getMonth() + 1);
        
        // 1年間制限チェック
        if (this.isWithinOneYear(newDate)) {
          this.currentDate = newDate;
          this.updateCalendar();
        }
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refresh());
    }
  }

  /**
   * 1年間の範囲内かチェック
   * @param {Date} date 
   * @returns {boolean}
   */
  isWithinOneYear(date) {
    const now = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(now.getFullYear() - 1);
    
    return date >= oneYearAgo && date <= now;
  }

  /**
   * カレンダーを更新
   */
  async updateCalendar() {
    const titleElement = document.getElementById('calendarTitleStaff');
    const gridElement = document.getElementById('calendarGridStaff');

    if (!gridElement) return;

    // 祝日データを事前読み込み
    try {
      await preloadHolidays();
    } catch (error) {
      console.warn('祝日データ取得失敗:', error);
    }

    if (titleElement) {
      titleElement.textContent = formatDate(this.currentDate, {
        year: 'numeric',
        month: 'long'
      });
    }

    // キャッシュをクリアして再読み込み
    await this.loadAttendanceCache();
    
    // カレンダーグリッド更新
    gridElement.innerHTML = await this.generateCalendarGrid();
    this.setupDateClickHandlers();
  }

  /**
   * カレンダーグリッドを生成（修正版）
   */
  async generateCalendarGrid() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const today = new Date();
    today.setHours(0, 0, 0, 0); // 時刻をリセット
    
    // 月の最初の日と最後の日
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // カレンダーの開始日（前月の日曜日から）
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    let html = '';

    // 曜日ヘッダー
    const dayHeaders = ['日', '月', '火', '水', '木', '金', '土'];
    dayHeaders.forEach((day, index) => {
      let headerClass = 'calendar-day-header';
      if (index === 0) headerClass += ' sunday-header';
      if (index === 6) headerClass += ' saturday-header';
      html += `<div class="${headerClass}">${day}</div>`;
    });

    // 日付セル
    const current = new Date(startDate);
    for (let i = 0; i < 42; i++) { // 6週間分
      const isCurrentMonth = current.getMonth() === month;
      const currentDateReset = new Date(current);
      currentDateReset.setHours(0, 0, 0, 0);
      const isToday = currentDateReset.getTime() === today.getTime();
      const dateStr = this.formatDateString(current);
      const dayOfWeek = current.getDay();
      const attendanceData = this.getAttendanceData(dateStr);
      
      let classes = ['calendar-day'];
      if (!isCurrentMonth) classes.push('other-month');
      if (isToday) classes.push('today');
      
      // 土日・祝日の色分け
      if (dayOfWeek === 0 || isJapaneseHoliday(current)) classes.push('sunday');
      if (dayOfWeek === 6) classes.push('saturday');
      
      // 出勤状況による色分け
      if (attendanceData && isCurrentMonth) {
        if (attendanceData.clock_out) {
          classes.push('has-work'); // 正常勤務完了（緑）
        } else if (attendanceData.clock_in) {
          classes.push('has-attendance'); // 出勤中または未退勤（黄）
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
   * 日付を文字列にフォーマット（タイムゾーン対応）
   * @param {Date} date 
   * @returns {string}
   */
  formatDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 作業インジケーターを生成
   */
  generateWorkIndicators(attendanceData) {
    if (!attendanceData || !attendanceData.clock_in) return '';

    let html = '<div class="calendar-day-indicators">';
    
    // 出勤マーク
    html += '<span class="calendar-indicator indicator-work" title="出勤記録あり"></span>';
    
    // 休憩マーク
    if (attendanceData.break_time > 0) {
      html += '<span class="calendar-indicator indicator-break" title="休憩記録あり"></span>';
    }
    
    html += '</div>';

    return html;
  }

  /**
   * 出勤データを取得
   */
  getAttendanceData(dateStr) {
    return this.attendanceCache.get(dateStr) || null;
  }

  /**
   * 出勤キャッシュを読み込み（修正版）
   */
  async loadAttendanceCache() {
    // 現在月の出勤データを取得
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month + 1);
    
    // キャッシュクリア
    this.attendanceCache.clear();
    
    // 各日付のデータを取得
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = this.formatDateString(date);
      
      try {
        // スタッフ自身の出勤記録を取得
        const attendance = await this.apiCall(`/api/staff/attendance/${dateStr}`);
        if (attendance.attendance) {
          // 休憩記録も取得
          const breakData = await this.apiCall(`/api/user/break/status/${dateStr}`);
          const attendanceData = {
            ...attendance.attendance,
            break_time: breakData.breakRecord ? 60 : 0
          };
          this.attendanceCache.set(dateStr, attendanceData);
        }
      } catch (error) {
        console.error(`出勤データ取得エラー (${dateStr}):`, error);
      }
    }
  }

  /**
   * 日付クリックハンドラーを設定
   */
  setupDateClickHandlers() {
    const dayElements = document.querySelectorAll('#calendarGridStaff .calendar-day:not(.other-month)');
    dayElements.forEach(dayElement => {
      dayElement.addEventListener('click', () => {
        const dateStr = dayElement.getAttribute('data-date');
        this.onDateClick(dateStr);
      });
    });
  }

  /**
   * 日付クリック時の処理
   */
  async onDateClick(dateStr) {
    const attendanceData = this.getAttendanceData(dateStr);

    if (attendanceData && attendanceData.clock_in) {
      // スタッフ日報も取得
      await this.showAttendanceDetail(dateStr, attendanceData);
    } else {
      this.showNotification('この日の出勤記録はありません', 'info');
    }
  }

  /**
   * 出勤詳細を表示（修正版）
   */
  async showAttendanceDetail(dateStr, attendanceData) {
    try {
      // スタッフ日報を取得
      const reportResponse = await this.apiCall(`/api/staff/daily-report/${dateStr}`);
      const dailyReport = reportResponse.report;

      // 既存のモーダルがあれば破棄
      if (this.currentModalId) {
        modalManager.destroy(this.currentModalId);
      }

      const formattedDate = formatDate(dateStr, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
      });

      const content = this.generateAttendanceDetailContent(attendanceData, dailyReport);

      // 日付を含む一意のモーダルIDを生成
      const modalId = `staffAttendanceDetailModal_${dateStr.replace(/-/g, '_')}`;
      this.currentModalId = modalId;

      modalManager.create({
        id: modalId,
        title: `<i class="fas fa-calendar-check"></i> ${formattedDate}の出勤記録`,
        content: content,
        size: 'modal-lg',
        headerClass: 'bg-primary text-white',
        saveButton: false
      });

      modalManager.show(modalId);
    } catch (error) {
      console.error('出勤詳細取得エラー:', error);
      this.showNotification('出勤詳細の取得に失敗しました', 'danger');
    }
  }

  /**
   * 出勤詳細コンテンツを生成
   */
  generateAttendanceDetailContent(attendanceData, dailyReport) {
    let html = '<div class="staff-attendance-detail">';

    // 基本的な出勤情報
    html += `
      <div class="row mb-3">
        <div class="col-6">
          <div class="detail-section">
            <h6><i class="fas fa-clock text-success"></i> 出勤時間</h6>
            <div class="detail-value h4 text-success">${attendanceData.clock_in}</div>
          </div>
        </div>
        <div class="col-6">
          <div class="detail-section">
            <h6><i class="fas fa-clock text-info"></i> 退勤時間</h6>
            <div class="detail-value h4 ${attendanceData.clock_out ? 'text-info' : 'text-muted'}">${attendanceData.clock_out || '未退勤'}</div>
          </div>
        </div>
      </div>
    `;

    // 勤務時間計算
    if (attendanceData.clock_out) {
      const workDuration = this.calculateWorkDuration(attendanceData.clock_in, attendanceData.clock_out);
      html += `
        <div class="row mb-3">
          <div class="col-12">
            <div class="detail-section bg-light">
              <h6><i class="fas fa-stopwatch text-primary"></i> 勤務時間</h6>
              <div class="detail-value h4 text-primary">${workDuration}</div>
            </div>
          </div>
        </div>
      `;
    }

    // 休憩記録
    if (attendanceData.break_time > 0) {
      html += `
        <div class="detail-section">
          <h6><i class="fas fa-coffee text-warning"></i> 休憩記録</h6>
          <p>休憩時間: ${attendanceData.break_time}分</p>
        </div>
      `;
    }

    // 中抜け記録
    if (attendanceData.nakanuke_minutes > 0) {
      html += `
        <div class="detail-section">
          <h6><i class="fas fa-door-open text-secondary"></i> 中抜け記録</h6>
          <p>中抜け時間: ${attendanceData.nakanuke_minutes}分</p>
        </div>
      `;
    }

    // スタッフ日報
    if (dailyReport) {
      html += `
        <hr>
        <div class="staff-daily-report mt-3">
          <h6><i class="fas fa-file-alt text-primary"></i> スタッフ日報</h6>

          <div class="report-section mb-3">
            <label class="form-label fw-bold">業務報告</label>
            <div class="report-content">${dailyReport.work_report || '-'}</div>
          </div>

          ${dailyReport.communication ? `
            <div class="report-section">
              <label class="form-label fw-bold">連絡事項</label>
              <div class="report-content">${dailyReport.communication}</div>
            </div>
          ` : ''}
        </div>

        <style>
          .report-content {
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 4px;
            padding: 10px;
            white-space: pre-wrap;
          }
        </style>
      `;
    } else if (attendanceData.clock_out) {
      html += `
        <hr>
        <div class="alert alert-warning">
          <i class="fas fa-exclamation-triangle"></i> この日の日報は未提出です
        </div>
      `;
    }

    html += '</div>';
    return html;
  }

  /**
   * 勤務時間を計算
   */
  calculateWorkDuration(clockIn, clockOut) {
    try {
      const startTime = new Date(`1970-01-01 ${clockIn}`);
      const endTime = new Date(`1970-01-01 ${clockOut}`);
      const durationMs = endTime - startTime;
      const hours = durationMs / (1000 * 60 * 60);
      
      if (hours > 0) {
        return `${hours.toFixed(1)}時間`;
      }
    } catch (error) {
      console.error('勤務時間計算エラー:', error);
    }
    
    return '計算不可';
  }

  /**
   * カレンダーをリフレッシュ
   */
  async refresh() {
    await this.loadAttendanceCache();
    await this.updateCalendar();
    this.showNotification('出勤簿を更新しました', 'info');
  }

  /**
   * 月間サマリーを取得
   */
  getMonthSummary() {
    let workDays = 0;
    let totalHours = 0;
    
    this.attendanceCache.forEach((attendance) => {
      if (attendance.clock_in) {
        workDays++;
        if (attendance.clock_out) {
          const hours = this.calculateWorkHours(attendance.clock_in, attendance.clock_out);
          if (hours) totalHours += hours;
        }
      }
    });
    
    return {
      workDays,
      totalHours,
      averageHours: workDays > 0 ? (totalHours / workDays).toFixed(1) : 0
    };
  }

  /**
   * 勤務時間を計算（数値）
   */
  calculateWorkHours(clockIn, clockOut) {
    try {
      const startTime = new Date(`1970-01-01 ${clockIn}`);
      const endTime = new Date(`1970-01-01 ${clockOut}`);
      const durationMs = endTime - startTime;
      return durationMs / (1000 * 60 * 60);
    } catch (error) {
      return 0;
    }
  }

  /**
   * クリーンアップ
   */
  destroy() {
    // 既存のモーダルがあれば破棄
    if (this.currentModalId) {
      modalManager.destroy(this.currentModalId);
      this.currentModalId = null;
    }
  }
}