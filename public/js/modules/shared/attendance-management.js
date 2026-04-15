// modules/shared/attendance-management.js
// スタッフ・管理者共通の出勤記録管理モジュール（リファクタリング版）

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { modalManager } from '../shared/modal-manager.js';
import { getCurrentDate, formatDate } from '../../utils/date-time.js';
import { AttendanceTable } from './components/attendance-table.js';
import { ReportDetailModal } from './modals/report-detail-modal.js';
import { LineReportSender } from './line-report-sender.js';

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
                <option value="">利用者・スタッフ</option>
                <option value="user">利用者のみ</option>
                <option value="staff">スタッフのみ</option>
              </select>
            </div>
          ` : `
            <div class="col-md-3">
              <label for="searchRole" class="form-label">権限</label>
              <select class="form-control" id="searchRole">
                <option value="">全て</option>
                <option value="user" selected>利用者</option>
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

    ${(this.userRole === 'admin' || this.userRole === 'staff') ? this.renderEditModals() : ''}
  `;
  
  // デフォルト値を明示的に設定
  this.showOnlyWorking = true;
}

  renderEditModals() {
    return `
      <!-- 出勤記録編集モーダル -->
      <div class="modal fade" id="attendanceEditModal" tabindex="-1">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header bg-warning text-dark">
              <h5 class="modal-title">
                <i class="fas fa-edit"></i> 出勤記録編集
                ${this.userRole === 'staff' ? '<small class="ms-2">（承認後に反映）</small>' : ''}
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <form id="attendanceEditForm">
                <input type="hidden" id="editRecordId">
                <input type="hidden" id="editUserId">
                <input type="hidden" id="editUserRole">
                
                <div class="row mb-3">
                  <div class="col-6">
                    <label for="editUserName" class="form-label">ユーザー</label>
                    <input type="text" class="form-control" id="editUserName" readonly>
                  </div>
                  <div class="col-6">
                    <label for="editDate" class="form-label">日付</label>
                    <input type="date" class="form-control" id="editDate" readonly>
                  </div>
                </div>
                
                <div class="row mb-3">
                  <div class="col-6">
                    <label for="editClockIn" class="form-label">出勤時間</label>
                    <input type="time" class="form-control" id="editClockIn">
                  </div>
                  <div class="col-6">
                    <label for="editClockOut" class="form-label">退勤時間</label>
                    <input type="time" class="form-control" id="editClockOut">
                  </div>
                </div>

                <div class="row mb-3">
                  <div class="col-6">
                    <label for="editBreakStart" class="form-label">休憩開始時間</label>
                    <input type="time" class="form-control" id="editBreakStart">
                  </div>
                  <div class="col-6">
                    <label for="editBreakEnd" class="form-label">休憩終了時間</label>
                    <input type="time" class="form-control" id="editBreakEnd">
                  </div>
                </div>

                <div class="row mb-3">
                  <div class="col-6">
                    <label for="editStatus" class="form-label">ステータス</label>
                    <select class="form-control" id="editStatus">
                      <option value="normal">正常</option>
                      <option value="late">遅刻</option>
                      <option value="early">早退</option>
                      <option value="absence">欠勤</option>
                      <option value="paid_leave">有給欠勤</option>
                    </select>
                  </div>
                  <div class="col-6" id="absenceTypeGroup" style="display: none;">
                    <label class="form-label">欠勤種別（スタッフのみ）</label>
                    <div class="btn-group w-100" role="group">
                      <input type="radio" class="btn-check" name="absenceType" id="normalAbsence" value="absence">
                      <label class="btn btn-outline-secondary" for="normalAbsence">通常欠勤</label>
                      
                      <input type="radio" class="btn-check" name="absenceType" id="paidLeave" value="paid_leave">
                      <label class="btn btn-outline-primary" for="paidLeave">有給欠勤</label>
                    </div>
                  </div>
                </div>

                <div class="mb-3">
                  <label for="editReason" class="form-label">変更理由${this.userRole === 'staff' ? ' <span class="text-danger">*</span>' : '（任意）'}</label>
                  <textarea class="form-control" id="editReason" rows="3"
                            placeholder="変更理由を入力してください..."${this.userRole === 'staff' ? ' required' : ''}></textarea>
                </div>

                <!-- 削除セクション（管理者のみ） -->
                ${this.userRole === 'admin' ? `
                <div class="border-top pt-3 mt-3" id="deleteAttendanceSection" style="display: none;">
                  <div class="alert alert-danger">
                    <h6 class="alert-heading"><i class="fas fa-exclamation-triangle"></i> 危険な操作</h6>
                    <p class="mb-2">この出勤記録を完全に削除します。この操作は取り消せません。</p>
                    <button type="button" class="btn btn-danger btn-sm" id="deleteAttendanceBtn">
                      <i class="fas fa-trash"></i> この出勤記録を削除する
                    </button>
                  </div>
                </div>
                ` : ''}

                <!-- 削除要望セクション（スタッフのみ） -->
                ${this.userRole === 'staff' ? `
                <div class="border-top pt-3 mt-3" id="deleteRequestSection" style="display: none;">
                  <div class="alert alert-warning">
                    <h6 class="alert-heading"><i class="fas fa-trash-alt"></i> 記録削除要望</h6>
                    <p class="mb-2">この出勤記録の削除を管理者に要望します。承認後に削除されます。</p>
                    <div class="mb-2">
                      <textarea class="form-control" id="deleteRequestReason" rows="2"
                                placeholder="削除理由を入力してください..." required></textarea>
                    </div>
                    <button type="button" class="btn btn-danger btn-sm" id="deleteRequestBtn">
                      <i class="fas fa-paper-plane"></i> 削除要望を送信
                    </button>
                  </div>
                </div>
                ` : ''}
              </form>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                <i class="fas fa-times"></i> キャンセル
              </button>
              <button type="button" class="btn btn-warning" id="saveAttendanceEditBtn">
                <i class="fas fa-save"></i> 変更保存
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
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
  if (this.userRole === 'admin' || this.userRole === 'staff') {
    const editStatusSelect = this.container.querySelector('#editStatus');
    editStatusSelect?.addEventListener('change', () => this.toggleAbsenceTypeField());

    const saveEditBtn = this.container.querySelector('#saveAttendanceEditBtn');
    saveEditBtn?.addEventListener('click', () => this.saveAttendanceEdit());

    // 削除は管理者のみ
    if (this.userRole === 'admin') {
      const deleteBtn = this.container.querySelector('#deleteAttendanceBtn');
      deleteBtn?.addEventListener('click', () => this.deleteAttendance());
    }

    // 削除要望はスタッフのみ
    if (this.userRole === 'staff') {
      const deleteRequestBtn = this.container.querySelector('#deleteRequestBtn');
      deleteRequestBtn?.addEventListener('click', () => this.requestDeleteAttendance());
    }
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
    if ((this.userRole === 'admin' || this.userRole === 'staff') && e.target.closest('.btn-edit-attendance')) {
      const btn = e.target.closest('.btn-edit-attendance');
      this.editAttendance(btn.dataset);
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
      
      const filteredUsers = selectedRole 
        ? response.users.filter(user => user.role === selectedRole)
        : response.users;
      
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
      if (this.userRole === 'admin' || this.userRole === 'staff') {
        modalManager.register('attendanceEditModal');
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
      
      // admin画面では管理者を除外
      const filteredUsers = this.userRole === 'admin' 
        ? response.users.filter(user => user.role !== 'admin')
        : response.users;
      
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
    if (this.userRole === 'staff') {
      // スタッフ画面：利用者のみ表示（デフォルト）
      if (searchRole && searchRole.value) {
        params.append('role', searchRole.value);
      } else {
        // 何も選択されていない場合は利用者のみ
        params.append('role', 'user');
      }
    } else if (this.userRole === 'admin') {
      // 管理者画面：adminロールを除外
      if (searchRole && searchRole.value) {
        // 特定の権限が選択されている場合
        params.append('role', searchRole.value);
      } else {
        // 「利用者・スタッフ」が選択されている場合はadminを除外
        params.append('excludeAdmin', 'true');
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

  // 編集関連メソッド
  toggleAbsenceTypeField() {
    if (this.userRole !== 'admin' && this.userRole !== 'staff') return;
    
    const statusSelect = this.container.querySelector('#editStatus');
    const absenceTypeGroup = this.container.querySelector('#absenceTypeGroup');
    const userRole = this.container.querySelector('#editUserRole').value;
    
    if (userRole === 'staff' && (statusSelect.value === 'absence' || statusSelect.value === 'paid_leave')) {
      absenceTypeGroup.style.display = 'block';
      if (statusSelect.value === 'absence') {
        this.container.querySelector('#normalAbsence').checked = true;
      } else if (statusSelect.value === 'paid_leave') {
        this.container.querySelector('#paidLeave').checked = true;
      }
    } else {
      absenceTypeGroup.style.display = 'none';
    }
  }

  async editAttendance(data) {
    if (this.userRole !== 'admin' && this.userRole !== 'staff') return;

    // フォーム要素に値設定
    this.container.querySelector('#editRecordId').value = data.recordId || '';
    this.container.querySelector('#editUserId').value = data.userId;
    this.container.querySelector('#editUserRole').value = data.userRole;
    this.container.querySelector('#editUserName').value = data.userName;
    this.container.querySelector('#editDate').value = data.date;
    this.container.querySelector('#editClockIn').value = data.clockIn || '';
    this.container.querySelector('#editClockOut').value = data.clockOut || '';
    this.container.querySelector('#editBreakStart').value = data.breakStart || '';
    this.container.querySelector('#editBreakEnd').value = data.breakEnd || '';
    this.container.querySelector('#editStatus').value = data.status || 'normal';
    this.container.querySelector('#editReason').value = '';

    // 削除セクションの表示制御（管理者のみ）
    const deleteSection = this.container.querySelector('#deleteAttendanceSection');
    if (deleteSection) {
      deleteSection.style.display = (this.userRole === 'admin' && data.recordId) ? 'block' : 'none';
    }

    // 削除要望セクションの表示制御（スタッフのみ、既存記録がある場合）
    const deleteRequestSection = this.container.querySelector('#deleteRequestSection');
    if (deleteRequestSection) {
      deleteRequestSection.style.display = (this.userRole === 'staff' && data.recordId) ? 'block' : 'none';
      const reasonField = this.container.querySelector('#deleteRequestReason');
      if (reasonField) reasonField.value = '';
    }

    // スタッフの場合のみ欠勤種別表示
    const absenceTypeGroup = this.container.querySelector('#absenceTypeGroup');
    if (data.userRole === 'staff') {
      absenceTypeGroup.style.display = 'block';
      this.toggleAbsenceTypeField();
    } else {
      absenceTypeGroup.style.display = 'none';
    }

    modalManager.show('attendanceEditModal');
  }

  async saveAttendanceEdit() {
    if (this.userRole !== 'admin' && this.userRole !== 'staff') return;

    try {
      const recordId = this.container.querySelector('#editRecordId').value;
      const clockIn = this.container.querySelector('#editClockIn').value;
      const clockOut = this.container.querySelector('#editClockOut').value;
      const breakStart = this.container.querySelector('#editBreakStart').value;
      const breakEnd = this.container.querySelector('#editBreakEnd').value;
      const status = this.container.querySelector('#editStatus').value;
      const reason = this.container.querySelector('#editReason').value;
      const userRole = this.container.querySelector('#editUserRole').value;

      // 欠勤種別の確認（スタッフの場合）
      let finalStatus = status;
      if (userRole === 'staff') {
        const selectedAbsenceType = this.container.querySelector('input[name="absenceType"]:checked');
        if (selectedAbsenceType) {
          finalStatus = selectedAbsenceType.value;
        }
      }

      // staffは理由必須、adminは任意
      if (this.userRole === 'staff' && !reason.trim()) {
        this.parent.showNotification('変更理由を入力してください', 'warning');
        return;
      }

      const requestData = {
        recordId: recordId,
        userId: this.container.querySelector('#editUserId').value,
        date: this.container.querySelector('#editDate').value,
        newClockIn: clockIn,
        newClockOut: clockOut,
        newBreakStart: breakStart,
        newBreakEnd: breakEnd,
        status: finalStatus,
        reason: reason
      };

      // 権限に応じてAPIエンドポイントを切り替え
      const endpoint = this.userRole === 'admin'
        ? API_ENDPOINTS.ADMIN.ATTENDANCE_CORRECT
        : API_ENDPOINTS.STAFF.ATTENDANCE_CORRECT;

      await this.parent.callApi(endpoint, {
        method: 'POST',
        body: JSON.stringify(requestData)
      });

      const message = this.userRole === 'staff'
        ? '訂正申請を送信しました（管理者の承認後に反映されます）'
        : '出勤記録を更新しました';
      this.parent.showNotification(message, 'success');
      
      modalManager.hide('attendanceEditModal');
      await this.searchAttendanceRecords();
      
    } catch (error) {
      console.error('出勤記録更新エラー:', error);
      this.parent.showNotification(error.message || '出勤記録の更新に失敗しました', 'danger');
    }
  }

  async deleteAttendance() {
    if (this.userRole !== 'admin') return;

    try {
      const recordId = this.container.querySelector('#editRecordId').value;
      const userName = this.container.querySelector('#editUserName').value;
      const date = this.container.querySelector('#editDate').value;

      if (!recordId) {
        this.parent.showNotification('削除する記録が選択されていません', 'warning');
        return;
      }

      // 確認ダイアログ
      const confirmed = await this.parent.showConfirm({
        title: '出勤記録の削除確認',
        message: `${userName}さんの${date}の出勤記録を完全に削除します。\n\nこの操作は取り消せません。本当に削除しますか？`,
        confirmText: '削除する',
        confirmClass: 'btn-danger',
        cancelText: 'キャンセル'
      });

      if (!confirmed) return;

      // 削除API呼び出し
      const response = await this.parent.callApi(
        `/api/admin/attendance/${recordId}`,
        {
          method: 'DELETE',
          body: JSON.stringify({})
        }
      );

      // 成功メッセージ
      this.parent.showNotification(response.message, 'success');

      // モーダルを閉じる
      modalManager.hide('attendanceEditModal');

      // リスト更新
      await this.searchAttendanceRecords();

    } catch (error) {
      console.error('出勤記録削除エラー:', error);
      this.parent.showNotification(
        error.message || '出勤記録の削除に失敗しました',
        'danger'
      );
    }
  }

  async requestDeleteAttendance() {
    if (this.userRole !== 'staff') return;

    try {
      const recordId = this.container.querySelector('#editRecordId').value;
      const reason = this.container.querySelector('#deleteRequestReason').value;

      if (!recordId) {
        this.parent.showNotification('削除する記録が選択されていません', 'warning');
        return;
      }

      if (!reason || !reason.trim()) {
        this.parent.showNotification('削除理由を入力してください', 'warning');
        return;
      }

      await this.parent.callApi('/api/staff/attendance/delete-request', {
        method: 'POST',
        body: JSON.stringify({ recordId, reason: reason.trim() })
      });

      this.parent.showNotification('削除要望を送信しました（管理者の承認待ち）', 'success');
      modalManager.hide('attendanceEditModal');
      await this.searchAttendanceRecords();

    } catch (error) {
      console.error('削除要望エラー:', error);
      this.parent.showNotification(
        error.message || '削除要望の送信に失敗しました',
        'danger'
      );
    }
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
  async showStaffReportModal(userId, userName, date) {
    try {
      const response = await this.app.apiCall(`/api/staff/daily-report/${date}?staffId=${userId}`);

      if (!response.report) {
        this.parent.showNotification('日報が見つかりません', 'warning');
        return;
      }

      const report = response.report;
      const attendance = response.attendance;

      // 休憩時間表示の計算
      let breakTimeDisplay = '-';
      if (attendance && attendance.break_start) {
        breakTimeDisplay = attendance.break_end ?
          `${attendance.break_start}〜${attendance.break_end} (60分)` :
          `${attendance.break_start}〜 (進行中)`;
      }

      // モーダルHTML生成
      const modalHTML = `
        <div class="modal fade" id="staffReportDetailModal" tabindex="-1">
          <div class="modal-dialog modal-lg">
            <div class="modal-content">
              <div class="modal-header bg-info text-white">
                <h5 class="modal-title">
                  <i class="fas fa-file-alt"></i> スタッフ日報詳細
                </h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body" id="staffReportModalBody">
                <!-- 基本情報 -->
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

                <!-- 出勤情報 -->
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
                  <div class="col-4">
                    <div class="detail-section border rounded p-3 bg-light">
                      <h6 class="text-muted mb-2">
                        <i class="fas fa-coffee text-warning"></i> 休憩時間
                      </h6>
                      <div class="detail-value small mb-0">
                        ${breakTimeDisplay}
                      </div>
                    </div>
                  </div>
                  <div class="col-4">
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

                <!-- 日報内容 -->
                <div class="mb-3">
                  <label class="form-label fw-bold">
                    <i class="fas fa-tasks"></i> 本日の業務報告
                  </label>
                  <div class="border rounded p-3 bg-light" style="white-space: pre-wrap; min-height: 100px;">
                    ${report.work_report || ''}
                  </div>
                </div>

                ${report.communication ? `
                  <div class="mb-3">
                    <label class="form-label fw-bold">
                      <i class="fas fa-comment-dots"></i> 連絡事項
                    </label>
                    <div class="border rounded p-3 bg-light" style="white-space: pre-wrap;">
                      ${report.communication}
                    </div>
                  </div>
                ` : ''}

                <div class="mb-3 mt-4">
                  <small class="text-muted">
                    <i class="fas fa-clock"></i> 提出日時: ${new Date(report.created_at).toLocaleString('ja-JP')}
                  </small>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-success" id="downloadStaffReportImageBtn">
                  <i class="fas fa-download"></i> 画像として保存
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
              downloadBtn.innerHTML = '<i class="fas fa-download"></i> 画像として保存';
            }, 2000);

          } catch (error) {
            console.error('画像保存エラー:', error);
            this.parent.showNotification('画像の保存に失敗しました', 'danger');
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = '<i class="fas fa-download"></i> 画像として保存';
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