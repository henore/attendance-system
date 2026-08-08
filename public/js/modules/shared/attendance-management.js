// modules/shared/attendance-management.js
// スタッフ・管理者共通の出勤記録管理モジュール（リファクタリング版）

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { modalManager } from '../shared/modal-manager.js';
import { getCurrentDate } from '../../utils/date-time.js';
import { AttendanceTable } from './components/attendance-table.js';
import { ReportDetailModal } from './modals/report-detail-modal.js';
import { LineReportSender } from './line-report-sender.js';
import { AttendanceEditHandler } from './attendance-edit-handler.js';

export class SharedAttendanceManagement {
  constructor(app, parentModule) {
    this.app = app;
    this.parent = parentModule;
    this.container = null;
    this.currentRecords = [];
    this.userRole = app.currentUser.role; // 'staff' or 'admin'

    // 新しいコンポーネント
    this.attendanceTable = new AttendanceTable(parentModule);
    this.reportDetailModal = new ReportDetailModal(app, parentModule);
    this.lineSender = new LineReportSender(app);

    // 出勤記録編集ハンドラ
    if (this.userRole === 'admin' || this.userRole === 'staff') {
      this.editHandler = new AttendanceEditHandler({
        userRole: this.userRole,
        idPrefix: 'edit',
        modalId: 'attendanceEditModal',
        notify: (msg, type) => this.parent.showNotification(msg, type),
        confirm: (opts) => this.parent.showConfirm(opts),
        callApi: (endpoint, opts) => this.parent.callApi(endpoint, opts),
        onSaved: () => this.searchAttendanceRecords(),
        context: 'attendance'
      });
    }

    // 出勤者、出勤予定者のみ表示フラグ
    this.showOnlyWorking = true; // デフォルトで出勤者のみ表示
  }

  async init(containerElement) {
    this.container = document.createElement('div');
    this.container.id = 'attendanceManagementSection';
    this.container.className = 'shared-attendance-section';
    this.container.style.display = 'none';
    
    containerElement.appendChild(this.container);
    this.render();
    this.setupEventListeners();
    
    // 日報詳細モーダルを初期化
    this.reportDetailModal.init(containerElement);
  }

  render() {
  const isAdminClass = this.userRole === 'admin' ? 'is-admin' : 'is-staff';
  const today = getCurrentDate();
  
  this.container.innerHTML = `
    <div class="custom-card ${isAdminClass}">
      <div class="custom-card-header">
        <h5><i class="fas fa-clock"></i> 出勤記録管理</h5>
        <button class="btn btn-outline-light btn-sm" id="refreshAttendanceBtn">
          <i class="fas fa-sync"></i> 更新
        </button>
      </div>
      <div class="card-body">
        <!-- 検索フィルター -->
        <div class="row mb-4">
          <div class="col-md-3">
            <label for="searchDate" class="form-label">検索日付</label>
            <input type="date" class="form-control" id="searchDate" value="${today}">
          </div>
          <!-- 権限フィルター：admin画面とstaff画面で異なる設定 -->
          ${this.userRole === 'admin' ? `
            <div class="col-md-3">
              <label for="searchRole" class="form-label">権限</label>
              <select class="form-control" id="searchRole">
                <option value="">全て</option>
                <option value="user">利用者のみ</option>
                <option value="user_commute">利用者のみ（通所）</option>
                <option value="user_home">利用者のみ（在宅）</option>
                <option value="staff">スタッフのみ</option>
                <option value="admin">管理者のみ</option>
              </select>
            </div>
          ` : `
            <div class="col-md-3">
              <label for="searchRole" class="form-label">権限</label>
              <select class="form-control" id="searchRole">
                <option value="">全て</option>
                <option value="user" selected>利用者</option>
                <option value="user_commute">利用者のみ（通所）</option>
                <option value="user_home">利用者のみ（在宅）</option>
                <option value="staff">スタッフ</option>
              </select>
            </div>
          `}
          <div class="col-md-3">
            <label for="searchUser" class="form-label">ユーザー</label>
            <select class="form-control" id="searchUser">
              <option value="">全て</option>
            </select>
          </div>
          <div class="col-md-3 d-flex align-items-end">
            <button class="btn btn-primary w-100" id="searchAttendanceBtn">
              <i class="fas fa-search"></i> 検索
            </button>
          </div>
        </div>
        
        <!-- 表示フィルター -->
        <div class="row mb-3">
          <div class="col-md-6">
            <div class="form-check form-switch">
              <input class="form-check-input" type="checkbox" id="showOnlyWorkingSwitch" checked>
              <label class="form-check-label" for="showOnlyWorkingSwitch">
                出勤者、出勤予定者のみ表示
              </label>
            </div>
            <small class="text-muted">
              ${this.userRole === 'admin' 
                ? '利用者とスタッフの出勤状況を管理します' 
                : '利用者の出勤状況に特化した表示です'}
            </small>
          </div>
          <div class="col-md-6 text-end">
            <div id="searchSummary" class="text-muted">
              <!-- 検索結果サマリー -->
            </div>
          </div>
        </div>
        
        <!-- 出勤記録一覧 -->
        <div id="attendanceRecordsList">
          <div class="text-center p-4">
            <p class="text-muted">検索条件を設定して「検索」ボタンを押してください</p>
          </div>
        </div>
      </div>
    </div>

    ${this.editHandler ? this.editHandler.renderModalHTML() : ''}
  `;

  // デフォルト値を明示的に設定
  this.showOnlyWorking = true;
}

  setupEventListeners() {
  // 検索・更新ボタン
  const searchBtn = this.container.querySelector('#searchAttendanceBtn');
  const refreshBtn = this.container.querySelector('#refreshAttendanceBtn');
  const showOnlyWorkingSwitch = this.container.querySelector('#showOnlyWorkingSwitch');
  
  searchBtn?.addEventListener('click', () => {
    this.searchAttendanceRecords();
  });
  
  refreshBtn?.addEventListener('click', () => {
    this.refresh();
  });
  
  showOnlyWorkingSwitch?.addEventListener('change', (e) => {
    this.showOnlyWorking = e.target.checked;
    this.updateRecordsList(this.currentRecords);
  });

  // 権限フィルター変更時のユーザーリスト更新
  const roleSelect = this.container.querySelector('#searchRole');
  roleSelect?.addEventListener('change', () => {
    this.updateUserSelectOptions();
  });

  // 編集機能（管理者・スタッフ共通）
  if (this.editHandler) {
    this.editHandler.setupEventListeners();
  }

  // 日付変更時の自動検索
  const dateInput = this.container.querySelector('#searchDate');
  dateInput?.addEventListener('change', () => {
    if (this.currentRecords.length > 0) {
      this.searchAttendanceRecords();
    }
  });

  // イベント委譲で動的ボタンを処理
  this.container.addEventListener('click', (e) => {
    // 日報詳細ボタン
    if (e.target.closest('.btn-show-report')) {
      const btn = e.target.closest('.btn-show-report');
      const userId = btn.getAttribute('data-user-id');
      const userName = btn.getAttribute('data-user-name');
      const date = btn.getAttribute('data-date');
      this.reportDetailModal.show(userId, userName, date);
    }

    // スタッフ日報詳細ボタン（adminのみ）
    if (e.target.closest('.btn-show-staff-report')) {
      const btn = e.target.closest('.btn-show-staff-report');
      const userId = btn.getAttribute('data-user-id');
      const userName = btn.getAttribute('data-user-name');
      const date = btn.getAttribute('data-date');
      this.showStaffReportModal(userId, userName, date);
    }

    // 編集ボタン（管理者・スタッフ）
    if (this.editHandler && e.target.closest('.btn-edit-attendance')) {
      const btn = e.target.closest('.btn-edit-attendance');
      this.editHandler.editAttendance(btn.dataset);
    }
  });
}

// 権限フィルターに応じてユーザーリストを更新
async updateUserSelectOptions() {
  const roleSelect = this.container.querySelector('#searchRole');
  const userSelect = this.container.querySelector('#searchUser');
  const selectedRole = roleSelect.value;
  
  try {
    const endpoint = this.userRole === 'admin' ? 
      API_ENDPOINTS.ADMIN.USERS : 
      API_ENDPOINTS.STAFF.USERS;
      
    const response = await this.parent.callApi(endpoint);
    
    if (userSelect && response.users) {
      let html = '<option value="">全て</option>';
      
      const activeUsers = response.users.filter(user => user.is_active === 1);
      const filteredUsers = selectedRole
        ? activeUsers.filter(user => user.role === selectedRole)
        : activeUsers;
      
      filteredUsers.forEach(user => {
        const roleDisplay = this.parent.getRoleDisplayName(user.role);
        html += `<option value="${user.id}">${user.name} (${roleDisplay})</option>`;
      });
      
      userSelect.innerHTML = html;
    }
  } catch (error) {
    console.error('ユーザーリスト更新エラー:', error);
  }
}

  async show() {
    this.container.style.display = 'block';
    await this.loadData();
    this.registerModals();
 
    // 初期表示を遅延実行（DOM要素が確実に存在することを保証）
  setTimeout(() => {
    this.searchAttendanceRecords();
  }, 100);
}

  hide() {
    this.container.style.display = 'none';
  }

  registerModals() {
    try {
      if (this.editHandler) {
        this.editHandler.registerModal();
      }
    } catch (error) {
      console.error('モーダル登録エラー:', error);
    }
  }

async loadData() {
  try {
    
    await this.loadUsersForSearch();
    
    // admin・staff共に初期検索を実行
    // 遅延実行でDOM要素の準備を待つ
    setTimeout(() => {
      this.searchAttendanceRecords();
    }, 200);
    
  } catch (error) {
    console.error('[ERROR] データロードエラー:', error);
    this.parent.showNotification('データの読み込みに失敗しました', 'danger');
  }
}



 async loadUsersForSearch() {
  try {
    
    const endpoint = this.userRole === 'admin' ? 
      API_ENDPOINTS.ADMIN.USERS : 
      API_ENDPOINTS.STAFF.USERS;
      
    
    const response = await this.parent.callApi(endpoint);
    
    
    const userSelect = this.container.querySelector('#searchUser');
    
    if (userSelect && response.users) {
      let html = '<option value="">全て</option>';
      
      // 退職者(is_active=2)と管理者(admin画面のみ)を除外
      const filteredUsers = response.users.filter(user => {
        if (user.is_active === 2) return false;
        if (this.userRole === 'admin' && user.role === 'admin') return false;
        return true;
      });
      
      // 利用者、スタッフの順で表示
      const sortedUsers = filteredUsers.sort((a, b) => {
        const roleOrder = { 'user': 1, 'staff': 2 };
        const aOrder = roleOrder[a.role] || 3;
        const bOrder = roleOrder[b.role] || 3;
        
        if (aOrder !== bOrder) {
          return aOrder - bOrder;
        }
        // 同じ権限内では名前順
        return a.name.localeCompare(b.name);
      });
      
      sortedUsers.forEach(user => {
        const roleDisplay = this.parent.getRoleDisplayName(user.role);
        html += `<option value="${user.id}">${user.name} (${roleDisplay})</option>`;
      });
      
      userSelect.innerHTML = html;
    }
  } catch (error) {
    console.error('[ERROR] ユーザー読み込みエラー:', error);
    this.parent.showNotification('ユーザーリストの読み込みに失敗しました', 'warning');
  }
}

async searchAttendanceRecords() {
  try {
    const searchDate = this.container.querySelector('#searchDate').value;
    const searchUser = this.container.querySelector('#searchUser').value;
    const searchRole = this.container.querySelector('#searchRole');
    
    const params = new URLSearchParams({ date: searchDate });
    
    // スタッフ画面と管理者画面で異なる制御
    const roleValue = searchRole ? searchRole.value : '';
    if (roleValue === 'user_commute') {
      params.append('role', 'user');
      params.append('serviceType', 'commute');
    } else if (roleValue === 'user_home') {
      params.append('role', 'user');
      params.append('serviceType', 'home');
    } else if (this.userRole === 'staff') {
      if (roleValue) {
        params.append('role', roleValue);
      } else {
        params.append('role', 'user');
      }
    } else if (this.userRole === 'admin') {
      if (roleValue) {
        params.append('role', roleValue);
      }
    }
    
    if (searchUser) {
      params.append('userId', searchUser);
    }

    const endpoint = this.userRole === 'admin' ? 
      API_ENDPOINTS.ADMIN.ATTENDANCE_SEARCH : 
      API_ENDPOINTS.STAFF.ATTENDANCE_SEARCH;
    
    
    const response = await this.app.apiCall(`${endpoint}?${params}`);
    
    
    // recordsプロパティの確認
    if (!response.records) {
      console.error('[ERROR] APIレスポンスにrecordsプロパティがありません:', response);
      this.showRecordsError('APIレスポンス形式が正しくありません');
      return;
    }
    
    let records = response.records || [];
  
    // スタッフ画面では利用者のみにフィルタリング（追加の安全策）
    if (this.userRole === 'staff') {
      records = records.filter(record => record.user_role === 'user');
    }
    
    if (records.length > 0) {
    }
    
    // 休憩データの整形（統一処理）
    this.currentRecords = records.map(record => {
      // 利用者の休憩データマッピング
      if (record.user_role === 'user') {
        // break_recordsテーブルからのデータ
        if (record.br_start) {
          record.break_start_time = record.br_start;
          record.break_end_time = record.br_end;
          record.break_duration = record.br_duration;
        }
        // breakRecordオブジェクトからのデータ
        else if (record.breakRecord) {
          record.break_start_time = record.breakRecord.start_time;
          record.break_end_time = record.breakRecord.end_time;
          record.break_duration = record.breakRecord.duration;
        }
      }
      
      return record;
    });
    
    this.updateSearchSummary(this.currentRecords, searchDate);
    this.updateRecordsList(this.currentRecords);
    
  } catch (error) {
    console.error('[ERROR] 出勤記録検索エラー:', error);
    this.showRecordsError('出勤記録の検索に失敗しました: ' + error.message);
  }
}

  updateSearchSummary(records, searchDate) {
  const summaryContainer = this.container.querySelector('#searchSummary');
  
  const total = records.length;
  const working = records.filter(r => r.clock_in && !r.clock_out).length;
  const finished = records.filter(r => r.clock_in && r.clock_out).length;
  const notWorking = records.filter(r => !r.clock_in).length;
  
  // admin画面では利用者とスタッフの内訳を表示
  if (this.userRole === 'admin') {
    const users = records.filter(r => r.user_role === 'user').length;
    const staff = records.filter(r => r.user_role === 'staff').length;
    
    summaryContainer.innerHTML = `
      <small>
        <strong>検索結果: ${total}件</strong><br>
        出勤中: ${working}件 | 退勤済: ${finished}件 | 未出勤: ${notWorking}件<br>
        <span class="text-info">利用者: ${users}件 | スタッフ: ${staff}件</span>
      </small>
    `;
  } else {
    summaryContainer.innerHTML = `
      <small>
        検索結果: ${total}件 
        (出勤中: ${working}件, 退勤済: ${finished}件, 未出勤: ${notWorking}件)
      </small>
    `;
  }
}

  updateRecordsList(records) {
    const recordsList = this.container.querySelector('#attendanceRecordsList');
    
    if (!records || records.length === 0) {
      recordsList.innerHTML = '<p class="text-muted text-center">検索条件に該当する記録がありません</p>';
      return;
    }
    // AttendanceTableコンポーネントを使用
    recordsList.innerHTML = this.attendanceTable.generateTable(records, {
      showOnlyWorking: this.showOnlyWorking,
      showDate: false,
      showOperations: true,
      context: 'attendance',
      showFooter: true
    });
  }

  showRecordsError(message) {
    const recordsList = this.container.querySelector('#attendanceRecordsList');
    recordsList.innerHTML = `
      <div class="alert alert-danger">
        <i class="fas fa-exclamation-triangle"></i> ${message}
      </div>
    `;
  }


  async refresh() {
    await this.searchAttendanceRecords();
    this.parent.showNotification('出勤記録を更新しました', 'info');
  }

  // コメント保存時のコールバック
  onCommentSaved() {
    // 画面を更新
    this.searchAttendanceRecords();
  }

  /**
   * スタッフ日報詳細モーダルを表示
   */
  /**
   * work_reportからユーザー別記録をパース
   */
  parseWorkReport(workReport) {
    if (!workReport) return null;
    try {
      const parsed = JSON.parse(workReport);
      if (parsed && parsed.entries && Array.isArray(parsed.entries)) {
        return { freeText: parsed.free_text || '', entries: parsed.entries };
      }
      if (Array.isArray(parsed)) {
        return { freeText: '', entries: parsed };
      }
    } catch { /* 旧形式 */ }
    return null;
  }

  /**
   * ユーザー別サービス提供記録のHTML生成（横一列表示）
   */
  generateUserEntriesHTML(data) {
    const { freeText, entries } = data;
    let html = '';

    if (freeText) {
      html += `<div class="border rounded p-2 mb-2 bg-light" style="white-space: pre-wrap;">${freeText}</div>`;
    }

    const filledEntries = entries.filter(e =>
      (e.work_content && e.work_content.trim()) ||
      (e.support_content && e.support_content.trim()) ||
      (e.user_condition && e.user_condition.trim())
    );

    if (filledEntries.length === 0 && !freeText) {
      return '<div class="text-muted small">記録なし</div>';
    }

    filledEntries.forEach(e => {
      const parts = [];
      parts.push(`<span class="fw-bold">${e.user_name || '不明'}</span>`);
      if (e.work_content) parts.push(`<span class="text-muted">作業内容:</span>${e.work_content}`);
      if (e.support_content) parts.push(`<span class="text-muted">支援内容:</span>${e.support_content}`);
      if (e.user_condition) parts.push(`<span class="text-muted">利用者の様子:</span>${e.user_condition}`);
      if (e.attendance_info) parts.push(`<span class="text-muted">勤怠:</span>${e.attendance_info}`);
      html += `<div class="small border-bottom py-1">${parts.join(' ｜ ')}</div>`;
    });

    return html;
  }

  async showStaffReportModal(userId, userName, date) {
    try {
      const response = await this.app.apiCall(`${API_ENDPOINTS.REPORTS.DAILY_REPORT(date)}?staffId=${userId}`);

      if (!response.report) {
        this.parent.showNotification('サービス提供記録が見つかりません', 'warning');
        return;
      }

      const report = response.report;
      const attendance = response.attendance;

      let breakTimeDisplay = '-';
      if (attendance && attendance.break_start) {
        breakTimeDisplay = attendance.break_end ?
          `${attendance.break_start}〜${attendance.break_end} (60分)` :
          `${attendance.break_start}〜 (進行中)`;
      }

      let nakanukeDisplay = '-';
      if (attendance && attendance.nakanuke_minutes > 0) {
        nakanukeDisplay = `${attendance.nakanuke_minutes}分`;
      }

      // work_reportのパース（JSON形式 or 旧テキスト形式）
      const parsedReport = this.parseWorkReport(report.work_report);
      let reportContentHTML;
      if (parsedReport) {
        reportContentHTML = `
          <div class="mb-3">
            <label class="form-label fw-bold">
              <i class="fas fa-tasks"></i> 本日のサービス提供記録及び業務報告
            </label>
            <div class="p-0">${this.generateUserEntriesHTML(parsedReport)}</div>
          </div>`;
      } else {
        reportContentHTML = `
          <div class="mb-3">
            <label class="form-label fw-bold">
              <i class="fas fa-tasks"></i> 本日のサービス提供記録及び業務報告
            </label>
            <div class="border rounded p-3 bg-light" style="white-space: pre-wrap; min-height: 100px;">
              ${report.work_report || ''}
            </div>
          </div>`;
      }

      const modalHTML = `
        <div class="modal fade" id="staffReportDetailModal" tabindex="-1">
          <div class="modal-dialog modal-lg">
            <div class="modal-content">
              <div class="modal-header bg-info text-white">
                <h5 class="modal-title">
                  <i class="fas fa-file-alt"></i> サービス提供記録詳細
                </h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body p-3" id="staffReportModalBody">
                <div class="mb-4">
                  <div class="row">
                    <div class="col-6">
                      <label class="form-label fw-bold text-muted">スタッフ名</label>
                      <p class="h5">${userName}</p>
                    </div>
                    <div class="col-6">
                      <label class="form-label fw-bold text-muted">日付</label>
                      <p class="h5">${date}</p>
                    </div>
                  </div>
                </div>

                <div class="row mb-4">
                  <div class="col-4">
                    <div class="detail-section border rounded p-3 bg-light">
                      <h6 class="text-muted mb-2">
                        <i class="fas fa-clock text-success"></i> 出勤時間
                      </h6>
                      <div class="detail-value h4 text-success mb-0">
                        ${attendance ? (attendance.clock_in || '-') : '-'}
                      </div>
                    </div>
                  </div>
                  <div class="col-3">
                    <div class="detail-section border rounded p-3 bg-light">
                      <h6 class="text-muted mb-2">
                        <i class="fas fa-coffee text-warning"></i> 休憩時間
                      </h6>
                      <div class="detail-value small mb-0">
                        ${breakTimeDisplay}
                      </div>
                    </div>
                  </div>
                  <div class="col-2">
                    <div class="detail-section border rounded p-3 bg-light">
                      <h6 class="text-muted mb-2">
                        <i class="fas fa-door-open text-secondary"></i> 中抜け
                      </h6>
                      <div class="detail-value small mb-0">
                        ${nakanukeDisplay}
                      </div>
                    </div>
                  </div>
                  <div class="col-3">
                    <div class="detail-section border rounded p-3 bg-light">
                      <h6 class="text-muted mb-2">
                        <i class="fas fa-clock text-info"></i> 退勤時間
                      </h6>
                      <div class="detail-value h4 ${attendance && attendance.clock_out ? 'text-info' : 'text-muted'} mb-0">
                        ${attendance ? (attendance.clock_out || '未退勤') : '-'}
                      </div>
                    </div>
                  </div>
                </div>

                <hr>

                ${reportContentHTML}

                ${report.communication ? `
                  <div class="mb-3">
                    <label class="form-label fw-bold">
                      <i class="fas fa-clipboard"></i> 業務報告
                    </label>
                    <div class="border rounded p-3 bg-light" style="white-space: pre-wrap;">
                      ${report.communication}
                    </div>
                  </div>
                ` : ''}

                <div class="mb-3 mt-4">
                  <small class="text-muted">
                    <i class="fas fa-clock"></i> 提出日: ${new Date(report.created_at).toLocaleDateString('ja-JP')}
                  </small>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-success" id="downloadStaffReportImageBtn">
                  <i class="fas fa-file-pdf"></i> PDFとして保存
                </button>
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                  <i class="fas fa-times"></i> 閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      `;

      // 既存のモーダルを削除
      const existingModal = document.getElementById('staffReportDetailModal');
      if (existingModal) {
        existingModal.remove();
      }

      // 新しいモーダルをDOMに追加
      document.body.insertAdjacentHTML('beforeend', modalHTML);

      // モーダルを表示
      const modalElement = document.getElementById('staffReportDetailModal');
      const modal = new bootstrap.Modal(modalElement);
      modal.show();

      // 画像保存ボタンのイベントリスナー
      const downloadBtn = document.getElementById('downloadStaffReportImageBtn');
      if (downloadBtn) {
        downloadBtn.addEventListener('click', async () => {
          try {
            downloadBtn.disabled = true;
            downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中...';

            // スタッフ日報用のデータ構造を作成
            await this.lineSender.sendStaffReportCompletion(
              {
                work_report: report.work_report,
                communication: report.communication,
                date: date,
                attendance: attendance
              },
              {
                name: userName,
                id: userId,
                role: 'staff'
              }
            );

            downloadBtn.innerHTML = '<i class="fas fa-check"></i> 保存完了';
            setTimeout(() => {
              downloadBtn.disabled = false;
              downloadBtn.innerHTML = '<i class="fas fa-file-pdf"></i> PDFとして保存';
            }, 2000);

          } catch (error) {
            console.error('PDF保存エラー:', error);
            this.parent.showNotification('PDFの保存に失敗しました', 'danger');
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = '<i class="fas fa-file-pdf"></i> PDFとして保存';
          }
        });
      }

      // モーダルが閉じられた時にDOMから削除
      modalElement.addEventListener('hidden.bs.modal', () => {
        modalElement.remove();
      });

    } catch (error) {
      console.error('スタッフ日報取得エラー:', error);
      this.parent.showNotification('日報の取得に失敗しました', 'danger');
    }
  }

  destroy() {
    // モーダルのクリーンアップ
    if (this.reportDetailModal) {
      this.reportDetailModal.destroy();
    }

    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}

export default SharedAttendanceManagement;