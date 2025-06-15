// modules/staff/attendance-book.js
// スタッフの出勤簿機能ハンドラー

import { formatDate, getDaysInMonth } from '../../utils/date-time.js';
import { modalManager } from '../shared/modal-manager.js';

export class StaffAttendanceBook {
  constructor(apiCall, showNotification) {
    this.apiCall = apiCall;
    this.showNotification = showNotification;
    this.currentDate = new Date();
    this.attendanceCache = new Map();
  }

  /**
   * 出勤簿セクションをレンダリング
   */
  render() {
    return `
      <div class="custom-card">
        <div class="custom-card-header">
          <h5><i class="fas fa-calendar-check"></i> 出勤簿</h5>
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
    
    console.log('📅 スタッフ出勤簿カレンダー表示完了');
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

    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refresh());
    }
  }

  /**
   * カレンダーを更新
   */
  async updateCalendar() {
    const titleElement = document.getElementById('calendarTitleStaff');
    const gridElement = document.getElementById('calendarGridStaff');

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

    let html = '';

    // 曜日ヘッダー
    const dayHeaders = ['日', '月', '火', '水', '木', '金', '土'];
    dayHeaders.forEach(day => {
      html += `<div class="calendar-day-header">${day}</div>`;
    });

    // 日付セル
    const current = new Date(startDate);
    for (let i = 0; i < 42; i++) { // 6週間分
      const isCurrentMonth = current.getMonth() === month;
      const isToday = current.toDateString() === today.toDateString();
      const dateStr = current.toISOString().split('T')[0];
      const attendanceData = this.getAttendanceData(dateStr);
      
      let classes = ['calendar-day'];
      if (!isCurrentMonth) classes.push('other-month');
      if (isToday) classes.push('today');
      
      // 出勤状況による色分け
      if (attendanceData) {
        if (attendanceData.clock_out) {
          classes.push('has-work'); // 正常勤務完了（緑）
        } else if (attendanceData.clock_in) {
          classes.push('has-comment'); // 出勤中または未退勤（黄）
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
   */
  generateWorkIndicators(attendanceData) {
    if (!attendanceData || !attendanceData.clock_in) return '';

    let html = '<div class="calendar-day-indicators">';
    
    // 出勤マーク
    html += '<span class="calendar-indicator indicator-work" title="出勤記録あり"></span>';
    
    // 休憩マーク
    if (attendanceData.break_time > 0) {
      html += '<span class="calendar-indicator indicator-break" title="休憩記録あり" style="background: #17a2b8;"></span>';
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
   * 出勤キャッシュを読み込み
   */
  async loadAttendanceCache() {
    // 現在月の出勤データを取得
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month + 1);
    
    // キャッシュクリア
    this.attendanceCache.clear();
    
    // 各日付のデータを取得（実際のAPIに依存）
    // ここでは仮実装として、現在のスタッフの出勤記録を想定
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      try {
        // 実際のAPIエンドポイントがある場合はここで呼び出し
        // const attendance = await this.apiCall(`/api/staff/attendance/${dateStr}`);
        // this.attendanceCache.set(dateStr, attendance);
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
      this.showAttendanceDetail(dateStr, attendanceData);
    } else {
      this.showNotification('この日の出勤記録はありません', 'info');
    }
  }

  /**
   * 出勤詳細を表示
   */
  showAttendanceDetail(dateStr, attendanceData) {
    const formattedDate = formatDate(dateStr, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });

    const content = this.generateAttendanceDetailContent(attendanceData);

    modalManager.create({
      id: 'staffAttendanceDetailModal',
      title: `<i class="fas fa-calendar-check"></i> ${formattedDate}の出勤記録`,
      content: content,
      size: 'modal-lg',
      headerClass: 'bg-primary text-white',
      saveButton: false
    });

    modalManager.show('staffAttendanceDetailModal');
  }

  /**
   * 出勤詳細コンテンツを生成
   */
  generateAttendanceDetailContent(attendanceData) {
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
}