// modules/admin/attendance-management.js
// 管理者出勤管理機能（モーダル修正版）

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { modalManager } from '../shared/modal-manager.js';  // インポート確認

export default class AdminAttendanceManagement {
    constructor(app, parentModule) {
        this.app = app;
        this.parent = parentModule;
        this.container = null;
        this.currentRecords = [];
    }

    async init(containerElement) {
        this.container = document.createElement('div');
        this.container.id = 'attendanceManagementSection';
        this.container.className = 'admin-section';
        this.container.style.display = 'none';
        
        containerElement.appendChild(this.container);
        this.render();
        this.setupEventListeners();
    }

    render() {
        this.container.innerHTML = `
            <div class="custom-card">
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
                            <input type="date" class="form-control" id="searchDate" 
                                   value="${new Date().toISOString().split('T')[0]}">
                        </div>
                        <div class="col-md-3">
                            <label for="searchRole" class="form-label">権限</label>
                            <select class="form-control" id="searchRole">
                                <option value="">全て</option>
                                <option value="user">利用者</option>
                                <option value="staff">スタッフ</option>
                            </select>
                        </div>
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
                    
                    <!-- 検索結果サマリー -->
                    <div id="searchSummary" class="mb-3" style="display: none;">
                        <!-- 検索結果の統計情報 -->
                    </div>
                    
                    <!-- 出勤記録一覧 -->
                    <div id="attendanceRecordsList">
                        <div class="text-center p-4">
                            <p class="text-muted">検索条件を設定して「検索」ボタンを押してください</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 出勤記録編集モーダル -->
            <div class="modal fade" id="attendanceEditModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-warning text-dark">
                            <h5 class="modal-title">
                                <i class="fas fa-edit"></i> 出勤記録編集
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
                                    <label for="editReason" class="form-label">変更理由</label>
                                    <textarea class="form-control" id="editReason" rows="3" 
                                              placeholder="変更理由を入力してください..." required></textarea>
                                </div>
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

            <!-- 日報詳細表示モーダル -->
            <div class="modal fade" id="dailyReportDetailModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white">
                            <h5 class="modal-title" id="dailyReportDetailTitle">
                                <i class="fas fa-file-alt"></i> 日報詳細
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" id="dailyReportDetailContent">
                            <!-- 日報詳細がここに表示される -->
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                <i class="fas fa-times"></i> 閉じる
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 管理者用コメントモーダル -->
            <div class="modal fade" id="adminCommentModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-info text-white">
                            <h5 class="modal-title" id="adminCommentModalTitle">
                                <i class="fas fa-comment-plus"></i> 日報にコメント記入
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" id="adminCommentModalContent">
                            <!-- 動的にコンテンツが挿入される -->
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                <i class="fas fa-times"></i> キャンセル
                            </button>
                            <button type="button" class="btn btn-primary" id="saveAdminCommentBtn">
                                <i class="fas fa-save"></i> 保存
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
        
        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.searchAttendanceRecords());
        }
        
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refresh());
        }

        // 出勤記録編集フォーム
        const editStatusSelect = this.container.querySelector('#editStatus');
        if (editStatusSelect) {
            editStatusSelect.addEventListener('change', () => this.toggleAbsenceTypeField());
        }

        const saveEditBtn = this.container.querySelector('#saveAttendanceEditBtn');
        if (saveEditBtn) {
            saveEditBtn.addEventListener('click', () => this.saveAttendanceEdit());
        }

        // コメント保存ボタン
        const saveCommentBtn = this.container.querySelector('#saveAdminCommentBtn');
        if (saveCommentBtn) {
            saveCommentBtn.addEventListener('click', () => this.saveAdminComment());
        }

        // 日付変更時の自動検索
        const dateInput = this.container.querySelector('#searchDate');
        if (dateInput) {
            dateInput.addEventListener('change', () => {
                if (this.currentRecords.length > 0) {
                    this.searchAttendanceRecords();
                }
            });
        }

        // イベント委譲で動的ボタンを処理
        this.container.addEventListener('click', (e) => {
            // 日報詳細ボタン
            if (e.target.closest('.btn-show-report')) {
                const btn = e.target.closest('.btn-show-report');
                const userId = btn.getAttribute('data-user-id');
                const userName = btn.getAttribute('data-user-name');
                const date = btn.getAttribute('data-date');
                this.showReportDetail(userId, userName, date);
            }
            
            // コメントボタン
            if (e.target.closest('.btn-admin-comment')) {
                const btn = e.target.closest('.btn-admin-comment');
                if (!btn.disabled) {
                    const userId = btn.getAttribute('data-user-id');
                    const userName = btn.getAttribute('data-user-name');
                    this.openCommentModal(userId, userName);
                }
            }
            
            // 編集ボタン
            if (e.target.closest('.btn-edit-attendance')) {
                const btn = e.target.closest('.btn-edit-attendance');
                const userId = btn.getAttribute('data-user-id');
                const userName = btn.getAttribute('data-user-name');
                const userRole = btn.getAttribute('data-user-role');
                const recordId = btn.getAttribute('data-record-id');
                const date = btn.getAttribute('data-date');
                const clockIn = btn.getAttribute('data-clock-in');
                const clockOut = btn.getAttribute('data-clock-out');
                const status = btn.getAttribute('data-status');
                this.editAttendance(userId, userName, userRole, recordId, date, clockIn, clockOut, status);
            }
        });
    }

    async show() {
        this.container.style.display = 'block';
        await this.loadData();
        // モーダルを登録
        this.registerModals();
    }

    hide() {
        this.container.style.display = 'none';
    }

    registerModals() {
        // モーダルマネージャーに登録（エラーハンドリング追加）
        try {
            modalManager.register('attendanceEditModal');
            modalManager.register('dailyReportDetailModal');
            modalManager.register('adminCommentModal');
        } catch (error) {
            console.error('モーダル登録エラー:', error);
        }
    }

    async refresh() {
        if (this.currentRecords.length > 0) {
            await this.searchAttendanceRecords();
        } else {
            await this.loadData();
        }
        this.parent.showNotification('出勤記録を更新しました', 'info');
    }

    async loadData() {
        await this.loadUsersForSearch();
        // 初期表示時は今日の記録を自動検索
        await this.searchAttendanceRecords();
    }

    async loadUsersForSearch() {
        try {
            const response = await this.parent.callApi(API_ENDPOINTS.ADMIN.USERS);
            const userSelect = this.container.querySelector('#searchUser');
            
            if (userSelect) {
                userSelect.innerHTML = '<option value="">全て</option>';
                response.users.forEach(user => {
                    const roleDisplay = this.parent.getRoleDisplayName(user.role);
                    userSelect.innerHTML += `<option value="${user.id}">${user.name} (${roleDisplay})</option>`;
                });
            }
        } catch (error) {
            console.error('ユーザー読み込みエラー:', error);
        }
    }

    /**
 * 出勤記録を検索（修正版 - 休憩データ取得修正）
 */
    async searchAttendanceRecords() {
    try {
        const searchDate = this.container.querySelector('#searchDate').value;
        const searchRole = this.container.querySelector('#searchRole').value;
        const searchUser = this.container.querySelector('#searchUser').value;

        const params = new URLSearchParams({ date: searchDate });
        if (searchRole) params.append('role', searchRole);
        if (searchUser) params.append('userId', searchUser);

        const response = await this.parent.callApi(`${API_ENDPOINTS.ADMIN.ATTENDANCE_SEARCH}?${params}`);
        let records = response.records || [];
        
        // 各記録に休憩データを追加で取得
        if (records.length > 0) {
        records = await Promise.all(records.map(async (record) => {
            try {
            // 利用者の休憩データのみ取得（スタッフは除外）
            if (record.user_role === 'user') {
                const breakResponse = await this.parent.callApi(`/api/admin/user/${record.user_id}/break/status/${record.date}`);
                return {
                ...record,
                breakRecord: breakResponse.breakRecord || null
                };
            }
            // スタッフの場合は、recordに含まれるbreak_start/break_endを使用
            return record;
            } catch (error) {
            console.warn(`休憩データ取得エラー (${record.user_name}):`, error);
            return record;
            }
        }));
        }
        
        this.currentRecords = records;
        
        this.updateSearchSummary(this.currentRecords, searchDate);
        this.updateRecordsList(this.currentRecords);
        
    } catch (error) {
        console.error('出勤記録検索エラー:', error);
        this.showRecordsError('出勤記録の検索に失敗しました');
    }
    }

    updateSearchSummary(records, searchDate) {
        const summaryContainer = this.container.querySelector('#searchSummary');
        const formattedDate = new Date(searchDate).toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });

        const summary = this.calculateRecordsSummary(records);
        
        summaryContainer.innerHTML = `
            <div class="alert alert-info">
                <div class="row">
                    <div class="col-md-6">
                        <h6><i class="fas fa-calendar-day"></i> ${formattedDate}</h6>
                        <p class="mb-0">検索結果: ${records.length}件</p>
                    </div>
                    <div class="col-md-6">
                        <div class="row text-center">
                            <div class="col-3">
                                <strong class="text-success">${summary.working}</strong><br>
                                <small>出勤中</small>
                            </div>
                            <div class="col-3">
                                <strong class="text-info">${summary.finished}</strong><br>
                                <small>退勤済み</small>
                            </div>
                            <div class="col-3">
                                <strong class="text-warning">${summary.late}</strong><br>
                                <small>遅刻</small>
                            </div>
                            <div class="col-3">
                                <strong class="text-danger">${summary.absence}</strong><br>
                                <small>欠勤</small>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        summaryContainer.style.display = 'block';
    }

    calculateRecordsSummary(records) {
        let working = 0, finished = 0, late = 0, absence = 0;
        
        records.forEach(record => {
            if (record.clock_in) {
                if (record.clock_out) {
                    finished++;
                } else {
                    working++;
                }
            }
            
            if (record.status === 'late') late++;
            if (record.status === 'absence' || record.status === 'paid_leave') absence++;
        });
        
        return { working, finished, late, absence };
    }

    updateRecordsList(records) {
        const recordsList = this.container.querySelector('#attendanceRecordsList');
        
        if (!records || records.length === 0) {
            recordsList.innerHTML = '<p class="text-muted text-center">検索条件に該当する記録がありません</p>';
            return;
        }

        recordsList.innerHTML = this.generateAttendanceRecordsList(records);
    }

/**
 * 出勤記録リストを生成（修正版 - 休憩時間表示修正）
 */
async searchAttendanceRecords() {
  try {
    const searchDate = this.container.querySelector('#searchDate').value;
    const searchRole = this.container.querySelector('#searchRole').value;
    const searchUser = this.container.querySelector('#searchUser').value;

    const params = new URLSearchParams({ date: searchDate });
    if (searchRole) params.append('role', searchRole);
    if (searchUser) params.append('userId', searchUser);

    const response = await this.parent.callApi(`${API_ENDPOINTS.ADMIN.ATTENDANCE_SEARCH}?${params}`);
    let records = response.records || [];
    
    // 各記録に休憩データを追加で取得
    if (records.length > 0) {
      records = await Promise.all(records.map(async (record) => {
        try {
          // 休憩データを取得
          const breakResponse = await this.parent.callApi(API_ENDPOINTS.USER.BREAK_STATUS(record.date).replace('/user/', `/admin/user/${record.user_id}/`));
          return {
            ...record,
            breakRecord: breakResponse.breakRecord || null
          };
        } catch (error) {
          console.warn(`休憩データ取得エラー (${record.user_name}):`, error);
          return { ...record, breakRecord: null };
        }
      }));
    }
    
    this.currentRecords = records;
    
    this.updateSearchSummary(this.currentRecords, searchDate);
    this.updateRecordsList(this.currentRecords);
    
  } catch (error) {
    console.error('出勤記録検索エラー:', error);
    this.showRecordsError('出勤記録の検索に失敗しました');
  }
}

/**
 * 出勤記録リストを生成（修正版 - 休憩時間表示修正）
 */
    generateAttendanceRecordsList(records) {
    if (!records || records.length === 0) {
        return '<p class="text-muted text-center">検索条件に該当する記録がありません</p>';
    }

    let html = `
        <div class="table-responsive">
        <table class="table table-hover">
            <thead class="table-light">
            <tr>
                <th>ユーザー</th>
                <th>権限</th>
                <th>出勤時間</th>
                <th>休憩時間</th>
                <th>退勤時間</th>
                <th>ステータス</th>
                <th>勤務時間</th>
                <th>日報・コメント</th>
                <th>操作</th>
            </tr>
            </thead>
            <tbody>
    `;

    
    records.forEach(record => {
        const roleClass = this.parent.getRoleColor(record.user_role);
        const workDuration = this.parent.calculateWorkDuration(record) ? 
        `${this.parent.calculateWorkDuration(record)}時間` : null;
        const statusBadge = this.parent.getStatusBadge(record.status);

        // 休憩時間の表示（修正版 - スタッフ/利用者で処理を分岐）
        let breakTimeDisplay = '-';
        
        // 利用者の場合
        if (record.user_role === 'user' && record.breakRecord && record.breakRecord.start_time) {
          if (record.breakRecord.end_time) {
            breakTimeDisplay = `
              <div class="break-time-display">
                <div class="fw-bold text-info">${record.breakRecord.start_time}〜${record.breakRecord.end_time}</div>
                <small class="text-muted">(${record.breakRecord.duration || 60}分)</small>
              </div>
            `;
          } else {
            breakTimeDisplay = `
              <div class="break-time-display">
                <div class="fw-bold text-warning">${record.breakRecord.start_time}〜</div>
                <small class="text-warning">(進行中)</small>
              </div>
            `;
          }
        }
        // スタッフの場合
        else if ((record.user_role === 'staff' || record.user_role === 'admin') && record.break_start) {
          if (record.break_end) {
            breakTimeDisplay = `
              <div class="break-time-display">
                <div class="fw-bold text-info">${record.break_start}〜${record.break_end}</div>
                <small class="text-muted">(60分)</small>
              </div>
            `;
          } else {
            breakTimeDisplay = `
              <div class="break-time-display">
                <div class="fw-bold text-warning">${record.break_start}〜</div>
                <small class="text-warning">(進行中)</small>
              </div>
            `;
          }
        }

        // 日報・コメント状況
        let reportCommentStatus = '';
        if (record.user_role === 'user') {
        if (record.report_id) {
            reportCommentStatus = '<span class="badge bg-success me-1"><i class="fas fa-file-check"></i> 日報</span>';
            if (record.comment_id) {
            reportCommentStatus += '<span class="badge bg-info"><i class="fas fa-comment-check"></i> コメント済み</span>';
            } else {
            reportCommentStatus += '<span class="badge bg-warning"><i class="fas fa-comment-exclamation"></i> コメント未記入</span>';
            }
        } else {
            reportCommentStatus = '<span class="badge bg-secondary"><i class="fas fa-file-times"></i> 日報未提出</span>';
        }
        } else {
        reportCommentStatus = '<span class="text-muted">-</span>';
        }

        html += `
        <tr>
            <td>
            <strong>${record.user_name}</strong>
            </td>
            <td><span class="badge bg-${roleClass}">${this.parent.getRoleDisplayName(record.user_role)}</span></td>
            <td>
            <div class="fw-bold ${record.clock_in ? 'text-success' : 'text-muted'}">${record.clock_in || '-'}</div>
            </td>
            <td>${breakTimeDisplay}</td>
            <td>
            <div class="fw-bold ${record.clock_out ? 'text-info' : 'text-muted'}">${record.clock_out || '-'}</div>
            </td>
            <td>${statusBadge}</td>
            <td>
            <div class="fw-bold ${workDuration ? 'text-primary' : 'text-muted'}">${workDuration || '-'}</div>
            </td>
            <td>${reportCommentStatus}</td>
            <td>
            <div class="btn-group" role="group">
                ${record.user_role === 'user' && record.report_id ? `
                <button class="btn btn-sm btn-outline-primary btn-show-report" 
                        data-user-id="${record.user_id}"
                        data-user-name="${record.user_name}"
                        data-date="${record.date}"
                        title="日報詳細">
                    <i class="fas fa-file-alt"></i>
                </button>
                <button class="btn btn-sm btn-outline-info btn-admin-comment" 
                        data-user-id="${record.user_id}"
                        data-user-name="${record.user_name}"
                        title="コメント">
                    <i class="fas fa-comment"></i>
                </button>
                ` : ''}
                <button class="btn btn-sm btn-outline-warning btn-edit-attendance" 
                        data-user-id="${record.user_id}"
                        data-user-name="${record.user_name}"
                        data-user-role="${record.user_role}"
                        data-record-id="${record.id || ''}"
                        data-date="${record.date}"
                        data-clock-in="${record.clock_in || ''}"
                        data-clock-out="${record.clock_out || ''}"
                        data-status="${record.status || 'normal'}"
                        title="編集">
                <i class="fas fa-edit"></i>
                </button>
            </div>
            </td>
        </tr>
        `;
    });

    html += `
            </tbody>
        </table>
        </div>
    `;

    return html;
    }

    async editAttendance(userId, userName, userRole, recordId = null, date = null, clockIn = '', clockOut = '', status = 'normal') {
        // フォーム要素に値設定
        this.container.querySelector('#editRecordId').value = recordId || '';
        this.container.querySelector('#editUserId').value = userId;
        this.container.querySelector('#editUserRole').value = userRole;
        this.container.querySelector('#editUserName').value = userName;
        this.container.querySelector('#editDate').value = date || new Date().toISOString().split('T')[0];
        this.container.querySelector('#editClockIn').value = clockIn;
        this.container.querySelector('#editClockOut').value = clockOut;
        this.container.querySelector('#editStatus').value = status;
        this.container.querySelector('#editReason').value = '';

        // スタッフの場合のみ欠勤種別表示
        const absenceTypeGroup = this.container.querySelector('#absenceTypeGroup');
        if (userRole === 'staff') {
            absenceTypeGroup.style.display = 'block';
            this.toggleAbsenceTypeField();
        } else {
            absenceTypeGroup.style.display = 'none';
        }

        // モーダル表示
        modalManager.show('attendanceEditModal');
    }

    toggleAbsenceTypeField() {
        const statusSelect = this.container.querySelector('#editStatus');
        const absenceTypeGroup = this.container.querySelector('#absenceTypeGroup');
        const userRole = this.container.querySelector('#editUserRole').value;
        
        if (userRole === 'staff' && (statusSelect.value === 'absence' || statusSelect.value === 'paid_leave')) {
            // ラジオボタンの選択状態を更新
            if (statusSelect.value === 'absence') {
                this.container.querySelector('#normalAbsence').checked = true;
            } else if (statusSelect.value === 'paid_leave') {
                this.container.querySelector('#paidLeave').checked = true;
            }
        }
    }

    async saveAttendanceEdit() {
        try {
            const recordId = this.container.querySelector('#editRecordId').value;
            const clockIn = this.container.querySelector('#editClockIn').value;
            const clockOut = this.container.querySelector('#editClockOut').value;
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

            if (!reason.trim()) {
                this.parent.showNotification('変更理由を入力してください', 'warning');
                return;
            }

            const requestData = {
                recordId: recordId,
                newClockIn: clockIn,
                newClockOut: clockOut,
                status: finalStatus,
                reason: reason
            };

            await this.parent.callApi(API_ENDPOINTS.ADMIN.ATTENDANCE_CORRECT, {
                method: 'POST',
                body: JSON.stringify(requestData)
            });

            this.parent.showNotification('出勤記録を更新しました', 'success');
            
            // モーダルを閉じる
            modalManager.hide('attendanceEditModal');
            
            // 記録一覧を更新
            await this.searchAttendanceRecords();
            
        } catch (error) {
            console.error('出勤記録更新エラー:', error);
            this.parent.showNotification(error.message || '出勤記録の更新に失敗しました', 'danger');
        }
    }

        async showReportDetail(userId, userName, date) {
        try {
            const response = await this.parent.callApi(API_ENDPOINTS.STAFF.REPORT(userId, date));
            
            if (!response.report) {
                this.parent.showNotification('この日の日報はありません', 'info');
                return;
            }

            // モーダルタイトル設定
            const formattedDate = new Date(date).toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'long'
            });
            
            const title = this.container.querySelector('#dailyReportDetailTitle');
            const content = this.container.querySelector('#dailyReportDetailContent');
            
            title.innerHTML = `<i class="fas fa-file-alt"></i> ${userName}さんの日報詳細 - ${formattedDate}`;
            content.innerHTML = this.generateDailyReportDetailContent(response);

            // モーダル表示
            modalManager.show('dailyReportDetailModal');

        } catch (error) {
            console.error('日報詳細取得エラー:', error);
            this.parent.showNotification('日報の取得に失敗しました', 'danger');
        }
    }

    generateDailyReportDetailContent(data) {
        const { user, attendance, report, comment } = data;
        
        return `
            <!-- 出勤情報 -->
            <div class="row mb-3">
                <div class="col-6">
                    <div class="detail-section">
                        <h6><i class="fas fa-clock text-success"></i> 出勤時間</h6>
                        <div class="detail-value h4 text-success">${attendance ? attendance.clock_in : '-'}</div>
                    </div>
                </div>
                <div class="col-6">
                    <div class="detail-section">
                        <h6><i class="fas fa-clock text-info"></i> 退勤時間</h6>
                        <div class="detail-value h4 ${attendance && attendance.clock_out ? 'text-info' : 'text-muted'}">${attendance ? (attendance.clock_out || '未退勤') : '-'}</div>
                    </div>
                </div>
            </div>

            <hr>

            <!-- 日報内容 -->
            <div class="report-summary">
                <h6><i class="fas fa-file-alt"></i> 日報内容</h6>
                
                <!-- 作業内容 -->
                <div class="mb-3">
                    <label class="past-form-label"><i class="fas fa-tasks"></i> 作業内容</label>
                    <div class="text-content">${report.work_content || ''}</div>
                </div>

                <!-- 健康状態 -->
                <div class="row mb-3">
                    <div class="col-4">
                        <label class="past-form-label"><i class="fas fa-thermometer-half"></i> 体温</label>
                        <div class="past-form-value">${report.temperature}℃</div>
                    </div>
                    <div class="col-4">
                        <label class="past-form-label"><i class="fas fa-utensils"></i> 食欲</label>
                        <div class="past-form-value">${this.getAppetiteLabel(report.appetite)}</div>
                    </div>
                    <div class="col-4">
                        <label class="past-form-label"><i class="fas fa-pills"></i> 頓服服用</label>
                        <div class="past-form-value">${report.medication_time ? report.medication_time + '時頃' : 'なし'}</div>
                    </div>
                </div>

                <!-- 睡眠情報 -->
                <div class="row mb-3">
                    <div class="col-4">
                        <label class="past-form-label"><i class="fas fa-bed"></i> 就寝時間</label>
                        <div class="past-form-value">${report.bedtime || '-'}</div>
                    </div>
                    <div class="col-4">
                        <label class="past-form-label"><i class="fas fa-sun"></i> 起床時間</label>
                        <div class="past-form-value">${report.wakeup_time || '-'}</div>
                    </div>
                    <div class="col-4">
                        <label class="past-form-label"><i class="fas fa-moon"></i> 睡眠状態</label>
                        <div class="past-form-value">${this.getSleepQualityLabel(report.sleep_quality)}</div>
                    </div>
                </div>

                <!-- 振り返り -->
                <div class="mb-3">
                    <label class="past-form-label"><i class="fas fa-lightbulb"></i> 振り返り・感想</label>
                    <div class="text-content">${report.reflection || ''}</div>
                </div>

                <!-- 面談希望 -->
                ${report.interview_request ? `
                    <div class="mb-3">
                        <label class="past-form-label"><i class="fas fa-comments"></i> 面談希望</label>
                        <div class="past-form-value text-info">${this.getInterviewRequestLabel(report.interview_request)}</div>
                    </div>
                ` : ''}
            </div>

            <!-- スタッフコメント -->
            ${comment && comment.comment ? `
                <hr>
                <div class="staff-comment-display">
                    <h6><i class="fas fa-comment"></i> スタッフコメント</h6>
                    <div class="comment-box bg-light p-3">
                        ${comment.comment}
                    </div>
                    <small class="text-muted">
                        <i class="fas fa-user"></i> 記入者: スタッフ | 
                        <i class="fas fa-clock"></i> 記入日時: ${new Date(comment.created_at).toLocaleString('ja-JP')}
                    </small>
                </div>
            ` : `
                <hr>
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle"></i> スタッフコメントはまだ記入されていません
                </div>
            `}
        `;
    }

    async openCommentModal(userId, userName) {
        const today = new Date().toISOString().split('T')[0];
        
        try {
            const response = await this.parent.callApi(API_ENDPOINTS.STAFF.REPORT(userId, today));
            
            if (!response.report) {
                this.parent.showNotification('この利用者の日報がまだ提出されていません', 'warning');
                return;
            }

            // モーダルの内容を生成
            const modalContent = this.generateAdminCommentModalContent(response);
            
            const title = this.container.querySelector('#adminCommentModalTitle');
            const content = this.container.querySelector('#adminCommentModalContent');
            
            title.innerHTML = `<i class="fas fa-comment-plus"></i> ${userName}さんの日報にコメント記入`;
            content.innerHTML = modalContent;

            // 文字数カウント
            const textarea = this.container.querySelector('#adminCommentText');
            const charCount = this.container.querySelector('#adminCommentCharCount');
            if (textarea && charCount) {
                textarea.addEventListener('input', () => {
                    charCount.textContent = textarea.value.length;
                });
            }

            // データを保存（保存時に使用）
            this.currentCommentData = { userId, userName };

            // モーダル表示
            modalManager.show('adminCommentModal');

        } catch (error) {
            console.error('コメントモーダル表示エラー:', error);
            this.parent.showNotification('エラーが発生しました', 'danger');
        }
    }

    generateAdminCommentModalContent(data) {
        const { user, attendance, report, comment } = data;
        
        return `
            <!-- 日報内容表示（読み取り専用） -->
            <div class="report-summary mb-4">
                <h6><i class="fas fa-file-alt"></i> ${user.name}さんの日報内容</h6>
                
                <!-- 勤務時間表示 -->
                <div class="row mb-3">
                    <div class="col-6">
                        <label class="past-form-label"><i class="fas fa-clock"></i> 出勤時間</label>
                        <div class="past-form-value">${attendance ? attendance.clock_in : '-'}</div>
                    </div>
                    <div class="col-6">
                        <label class="past-form-label"><i class="fas fa-clock"></i> 退勤時間</label>
                        <div class="past-form-value">${attendance ? attendance.clock_out : '-'}</div>
                    </div>
                </div>

                <!-- 作業内容 -->
                <div class="mb-3">
                    <label class="past-form-label"><i class="fas fa-tasks"></i> 作業内容</label>
                    <div class="text-content">${report.work_content || ''}</div>
                </div>

                <!-- 健康状態 -->
                <div class="row mb-3">
                    <div class="col-4">
                        <label class="past-form-label"><i class="fas fa-thermometer-half"></i> 体温</label>
                        <div class="past-form-value">${report.temperature}℃</div>
                    </div>
                    <div class="col-4">
                        <label class="past-form-label"><i class="fas fa-utensils"></i> 食欲</label>
                        <div class="past-form-value">${this.getAppetiteLabel(report.appetite)}</div>
                    </div>
                    <div class="col-4">
                        <label class="past-form-label"><i class="fas fa-pills"></i> 頓服服用</label>
                        <div class="past-form-value">${report.medication_time ? report.medication_time + '時頃' : 'なし'}</div>
                    </div>
                </div>

                <!-- 振り返り -->
                <div class="mb-3">
                    <label class="past-form-label"><i class="fas fa-lightbulb"></i> 振り返り・感想</label>
                    <div class="text-content">${report.reflection || ''}</div>
                </div>

                <!-- 面談希望 -->
                ${report.interview_request ? `
                    <div class="mb-3">
                        <label class="past-form-label"><i class="fas fa-comments"></i> 面談希望</label>
                        <div class="past-form-value text-info">${this.getInterviewRequestLabel(report.interview_request)}</div>
                    </div>
                ` : ''}
            </div>

            <hr>

            <!-- スタッフコメント記入欄 -->
            <div class="staff-comment-section">
                <h6><i class="fas fa-comment-plus"></i> スタッフコメント</h6>
                
                <div class="mb-3">
                    <textarea class="form-control" id="adminCommentText" rows="4" 
                              placeholder="利用者への返信、アドバイス、気づいた点などを記入してください..."
                              maxlength="500">${comment ? comment.comment : ''}</textarea>
                    <div class="comment-char-count">
                        <small class="text-muted">
                            <span id="adminCommentCharCount">${comment ? comment.comment.length : 0}</span>/500文字
                        </small>
                    </div>
                </div>

                ${comment ? `
                    <div class="existing-comment-info">
                        <small class="text-muted">
                            <i class="fas fa-info-circle"></i> 
                            記入日時: ${new Date(comment.created_at).toLocaleString('ja-JP')}
                        </small>
                    </div>
                ` : ''}
            </div>
        `;
    }

    async saveAdminComment() {
        try {
            const textarea = this.container.querySelector('#adminCommentText');
            const comment = textarea ? textarea.value.trim() : '';
            
            if (!comment) {
                this.parent.showNotification('コメントを入力してください', 'warning');
                return;
            }

            if (!this.currentCommentData) {
                this.parent.showNotification('データが正しく設定されていません', 'danger');
                return;
            }

            const today = new Date().toISOString().split('T')[0];
            
            await this.parent.callApi(API_ENDPOINTS.STAFF.COMMENT, {
                method: 'POST',
                body: JSON.stringify({
                    userId: this.currentCommentData.userId,
                    date: today,
                    comment: comment
                })
            });

            this.parent.showNotification(`${this.currentCommentData.userName}さんの日報にコメントを記入しました`, 'success');

            // モーダルを閉じる
            modalManager.hide('adminCommentModal');
            
            // 記録一覧を更新
            await this.searchAttendanceRecords();

        } catch (error) {
            console.error('コメント保存エラー:', error);
            this.parent.showNotification(error.message || 'コメントの保存に失敗しました', 'danger');
        }
    }

    getAppetiteLabel(value) {
        const labels = { 'good': 'あり', 'none': 'なし' };
        return labels[value] || value;
    }

    getSleepQualityLabel(value) {
        const labels = { 'good': '眠れた', 'poor': 'あまり眠れない', 'bad': '眠れない' };
        return labels[value] || value;
    }

    getInterviewRequestLabel(value) {
        const labels = { 'consultation': '相談がある', 'interview': '面談希望' };
        return labels[value] || value;
    }

    showRecordsError(message) {
        const recordsList = this.container.querySelector('#attendanceRecordsList');
        recordsList.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i> ${message}
            </div>
        `;
    }

    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}