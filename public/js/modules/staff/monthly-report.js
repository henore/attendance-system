// modules/staff/monthly-report.js
// スタッフの月別出勤簿機能ハンドラー

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { formatServiceType, formatWorkHours } from '../../utils/formatter.js';
import { calculateWorkHours, getDaysInMonth } from '../../utils/date-time.js';

export class StaffMonthlyReport {
  constructor(apiCall, showNotification, showDailyReportDetail) {
    this.apiCall = apiCall;
    this.showNotification = showNotification;
    this.showDailyReportDetail = showDailyReportDetail;
    
    this.selectedYear = new Date().getFullYear();
    this.selectedMonth = new Date().getMonth() + 1;
    this.selectedUserId = null;
  }

  /**
   * 月別出勤簿セクションをレンダリング
   */
  render() {
    return `
      <div class="custom-card">
        <div class="custom-card-header">
          <h5><i class="fas fa-calendar-alt"></i> 月別出勤簿</h5>
          <button class="btn btn-outline-light btn-sm" id="printMonthlyAttendanceBtn">
            <i class="fas fa-print"></i> 印刷
          </button>
        </div>
        <div class="card-body">
          <!-- 選択フィルター -->
          <div class="row mb-4">
            <div class="col-md-3">
              <label for="monthlyYearSelect" class="form-label">年</label>
              <select class="form-control" id="monthlyYearSelect">
                <!-- 年のオプションが動的に生成される -->
              </select>
            </div>
            <div class="col-md-3">
              <label for="monthlyMonthSelect" class="form-label">月</label>
              <select class="form-control" id="monthlyMonthSelect">
                <!-- 月のオプションが動的に生成される -->
              </select>
            </div>
            <div class="col-md-4">
              <label for="monthlyUserSelect" class="form-label">利用者</label>
              <select class="form-control" id="monthlyUserSelect">
                <option value="">利用者を選択してください</option>
                <!-- 利用者のオプションが動的に生成される -->
              </select>
            </div>
            <div class="col-md-2 d-flex align-items-end">
              <button class="btn btn-primary w-100" id="showMonthlyAttendanceBtn">
                <i class="fas fa-search"></i> 表示
              </button>
            </div>
          </div>
          
          <!-- 月別出勤記録表示エリア -->
          <div id="monthlyAttendanceDisplay">
            <!-- 月別出勤記録がここに表示される -->
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 初期化
   */
  init() {
    const showBtn = document.getElementById('showMonthlyAttendanceBtn');
    const printBtn = document.getElementById('printMonthlyAttendanceBtn');
    
    if (showBtn) {
      showBtn.addEventListener('click', () => this.showMonthlyAttendance());
    }
    
    if (printBtn) {
      printBtn.addEventListener('click', () => window.print());
    }
  }

  /**
   * 初期データを読み込み
   */
  async loadInitialData() {
    this.generateYearOptions();
    this.generateMonthOptions();
    await this.loadUsersForMonthlyAttendance();
  }

  /**
   * 年の選択肢を生成
   */
  generateYearOptions() {
    const yearSelect = document.getElementById('monthlyYearSelect');
    if (!yearSelect) return;
    
    const currentYear = new Date().getFullYear();
    let html = '';
    
    for (let year = currentYear - 2; year <= currentYear + 1; year++) {
      const selected = year === this.selectedYear ? 'selected' : '';
      html += `<option value="${year}" ${selected}>${year}年</option>`;
    }
    
    yearSelect.innerHTML = html;
  }

  /**
   * 月の選択肢を生成
   */
  generateMonthOptions() {
    const monthSelect = document.getElementById('monthlyMonthSelect');
    if (!monthSelect) return;
    
    let html = '';
    
    for (let month = 1; month <= 12; month++) {
      const selected = month === this.selectedMonth ? 'selected' : '';
      html += `<option value="${month}" ${selected}>${month}月</option>`;
    }
    
    monthSelect.innerHTML = html;
  }

  /**
   * 利用者の選択肢を読み込み
   */
  async loadUsersForMonthlyAttendance() {
    try {
      const response = await this.apiCall(API_ENDPOINTS.STAFF.USERS_LIST);
      const userSelect = document.getElementById('monthlyUserSelect');
      
      if (userSelect && response.users) {
        let html = '<option value="">利用者を選択してください</option>';
        
        // 利用者のみ表示（roleチェックは不要、APIが既に利用者のみ返す）
        response.users.forEach(user => {
          const serviceDisplay = user.service_type ? ` (${formatServiceType(user.service_type)})` : '';
          html += `<option value="${user.id}">${user.name}${serviceDisplay}</option>`;
        });
        
        userSelect.innerHTML = html;
        
        if (this.selectedUserId) {
          userSelect.value = this.selectedUserId;
        }
      }
    } catch (error) {
      console.error('利用者読み込みエラー:', error);
    }
  }

  /**
   * 月別出勤簿を表示
   */
  async showMonthlyAttendance() {
    const yearSelect = document.getElementById('monthlyYearSelect');
    const monthSelect = document.getElementById('monthlyMonthSelect');
    const userSelect = document.getElementById('monthlyUserSelect');
    const displayContainer = document.getElementById('monthlyAttendanceDisplay');
    
    if (!yearSelect || !monthSelect || !userSelect || !displayContainer) return;
    
    const year = parseInt(yearSelect.value);
    const month = parseInt(monthSelect.value);
    const userId = userSelect.value;
    
    if (!userId) {
      this.showNotification('利用者を選択してください', 'warning');
      return;
    }
    
    // 選択値を保存
    this.selectedYear = year;
    this.selectedMonth = month;
    this.selectedUserId = userId;
    
    try {
      // 月次出勤データを取得
      const monthPadded = String(month).padStart(2, '0');
      const url = API_ENDPOINTS.STAFF.MONTHLY_ATTENDANCE(year, monthPadded, userId);
      
      const response = await this.apiCall(url);
      
      if (!response || !response.user) {
        this.showNotification('利用者が見つかりません', 'danger');
        return;
      }
      
      // 月次出勤記録を生成
      displayContainer.innerHTML = this.generateMonthlyAttendanceReport(year, month, response.user, response.records || []);
      
      // 日報詳細ボタンのイベントリスナー設定
      this.setupReportDetailHandlers();
      
    } catch (error) {
      console.error('[月別出勤簿] エラー詳細:', error);
      this.showNotification('月次出勤記録の取得に失敗しました', 'danger');
    }
  }

  /**
   * 月次出勤記録レポートを生成
   */
  generateMonthlyAttendanceReport(year, month, user, records) {
    const monthName = `${year}年${month}月`;
    const daysInMonth = getDaysInMonth(year, month);
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    
    // 記録を日付でインデックス化
    const recordMap = {};
    records.forEach(record => {
      const date = new Date(record.date);
      const day = date.getDate();
      recordMap[day] = record;
    });
    
    let html = `
      <div class="monthly-attendance-report">
        <h5 class="mb-3">
          <i class="fas fa-user"></i> ${user.name}さんの${monthName}出勤記録
          <small class="text-muted ms-2">
            ${formatServiceType(user.service_type)}
          </small>
        </h5>
          <div class="table-responsive">
            <table class="table table-bordered table-striped">
                <thead class="table-primary">
                    <tr>
                        <th width="8%">日付</th>
                        <th width="8%">曜日</th>
                        <th width="10%">勤務場所</th>
                        <th width="10%">出勤時間</th>
                        <th width="10%">退勤時間</th>
                        <th width="10%">休憩時間</th>
                        <th width="10%">実働時間</th>
                        <th width="18%">備考</th>
                        <th width="16%">操作</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    let totalWorkDays = 0;
    let totalWorkHours = 0;
    
    // 1日から月末まで表示
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dayOfWeek = date.getDay();
      const dayName = dayNames[dayOfWeek];
      const record = recordMap[day];
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      let rowClass = '';
      if (dayOfWeek === 0) rowClass = 'table-danger'; // 日曜日
      else if (dayOfWeek === 6) rowClass = 'table-info'; // 土曜日
      
      if (record && record.clock_in) {
        totalWorkDays++;
        
        // 休憩時間の表示
        let breakTimeDisplay = '-';
        let breakDuration = 0;
        
        if (record.break_start) {
          breakDuration = 1; // 60分固定
          if (record.break_end) {
            breakTimeDisplay = `${record.break_start}〜${record.break_end}`;
          } else {
            breakTimeDisplay = `${record.break_start}〜(60分)`;
          }
        }
        
        // 実働時間の計算
        const grossWorkHours = calculateWorkHours(record.clock_in, record.clock_out, 0);
        const netWorkHours = grossWorkHours ? grossWorkHours - breakDuration : 0;
        
        if (netWorkHours > 0) totalWorkHours += netWorkHours;
        
        const serviceDisplay = user.service_type ? 
          formatServiceType(user.service_type) : '-';
        
        html += `
          <tr class="${rowClass}">
            <td class="text-center">${day}日</td>
            <td class="text-center">${dayName}</td>
            <td class="text-center">${serviceDisplay}</td>
            <td class="text-center">${record.clock_in}</td>
            <td class="text-center">${record.clock_out || '未退勤'}</td>
            <td class="text-center small">${breakTimeDisplay}</td>
            <td class="text-center">${formatWorkHours(netWorkHours)}</td>
            <td class="small">
              ${record.report_id ? '<span class="badge bg-success">日報提出済み</span>' : ''}
              ${record.comment ? '<span class="badge bg-info">コメントあり</span>' : ''}
            </td>
                <td class="text-center">
                    ${record.report_id ? `
                        <button class="btn btn-sm btn-outline-primary btn-show-report" 
                                data-user-id="${user.id}" 
                                data-user-name="${user.name}" 
                                data-date="${dateStr}">
                            <i class="fas fa-file-alt"></i> 日報
                        </button>
                    ` : '-'}
                </td>
          </tr>
        `;
      } else {
        html += `
          <tr class="${rowClass}">
            <td class="text-center">${day}日</td>
            <td class="text-center">${dayName}</td>
            <td class="text-center">-</td>
            <td class="text-center">-</td>
            <td class="text-center">-</td>
            <td class="text-center">-</td>
            <td class="text-center">-</td>
            <td class="small text-muted">未出勤</td>
            <td class="text-center">-</td>
          </tr>
        `;
      }
    }
    
    html += `
            </tbody>
            <tfoot class="table-secondary">
              <tr>
                <th colspan="6" class="text-end">月間集計</th>
                <th class="text-center">${formatWorkHours(totalWorkHours)}</th>
                <th colspan="2">出勤日数: ${totalWorkDays}日</th>
              </tr>
            </tfoot>
          </table>
        </div>
        
        <!-- 印刷用スタイル -->
        <style>
          @media print {
            .staff-menu, .custom-card-header, .row.mb-4 { display: none !important; }
            .monthly-attendance-report table { font-size: 12px; }
            .btn { display: none !important; }
          }
        </style>
      </div>
    `;
    
    return html;
  }

  /**
   * 日報詳細ボタンのイベントリスナーを設定
   */
  setupReportDetailHandlers() {
    document.querySelectorAll('.btn-show-report').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const userId = e.target.closest('button').getAttribute('data-user-id');
        const userName = e.target.closest('button').getAttribute('data-user-name');
        const date = e.target.closest('button').getAttribute('data-date');
        
        this.showDailyReportDetail(userId, userName, date);
      });
    });
  }

  /**
   * 月別出勤簿のサマリーを取得
   */
  async getMonthlyAttendanceSummary(year, month) {
    try {
      const response = await this.apiCall(API_ENDPOINTS.STAFF.USERS_LIST);
      const users = response.users || [];
      
      const summaries = [];
      
      for (const user of users) {
        const monthPadded = String(month).padStart(2, '0');
        const attendanceResponse = await this.apiCall(
          API_ENDPOINTS.STAFF.MONTHLY_ATTENDANCE(year, monthPadded, user.id)
        );
        
        const records = attendanceResponse.records || [];
        let workDays = 0;
        let totalHours = 0;
        
        records.forEach(record => {
          if (record.clock_in) {
            workDays++;
            if (record.clock_out) {
              const hours = calculateWorkHours(record.clock_in, record.clock_out, 60);
              if (hours > 0) totalHours += hours;
            }
          }
        });
        
        summaries.push({
          userId: user.id,
          userName: user.name,
          serviceType: user.service_type,
          workDays,
          totalHours
        });
      }
      
      return summaries;
    } catch (error) {
      console.error('月別出勤簿サマリー取得エラー:', error);
      return [];
    }
  }
}