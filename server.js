// modules/shared/attendance-management.js
// スタッフ・管理者共通の出勤記録管理モジュール（完全版・休憩データ統合対応）

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { modalManager } from '../shared/modal-manager.js';

export class SharedAttendanceManagement {
  constructor(app, parentModule) {
    this.app = app;
    this.parent = parentModule;
    this.container = null;
    this.currentRecords = [];
    this.userRole = app.currentUser.role; // 'staff' or 'admin'
    this.currentCommentData = null;
  }

  async init(containerElement) {
    this.container = document.createElement('div');
    this.container.id = 'attendanceManagementSection';
    this.container.className = 'shared-attendance-section';
    this.container.style.display = 'none';
    
    containerElement.appendChild(this.container);
    this.render();
    this.setupEventListeners();
  }

  render() {
    // 管理者のみ編集ボタンを表示するためのクラス
    const isAdminClass = this.userRole === 'admin' ? 'is-admin' : 'is-staff';
    
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
              <input type="date" class="form-control" id="searchDate" 
                     value="${new Date().toISOString().split('T')[0]}">
            </div>
            ${this.userRole === 'admin' ? `
              <div class="col-md-3">
                <label for="searchRole" class="form-label">権限</label>
                <select class="form-control" id="searchRole">
                  <option value="">全て</option>
                  <option value="user">利用者</option>
                  <option value="staff">スタッフ</option>
                </select>
              </div>
            ` : ''}
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
          <div id="searchSummary" class="mb-3" style="display: none;"></div>
          
          <!-- 出勤記録一覧 -->
          <div id="attendanceRecordsList">
            <div class="text-center p-4">
              <p class="text-muted">検索条件を設定して「検索」ボタンを押してください</p>
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
            <div class="modal-body" id="dailyReportDetailContent"></div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                <i class="fas fa-times"></i> 閉じる
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- コメントモーダル -->
      <div class="modal fade" id="commentModal" tabindex="-1">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header bg-info text-white">
              <h5 class="modal-title" id="commentModalTitle">
                <i class="fas fa-comment-plus"></i> 日報にコメント記入
              </h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body" id="commentModalContent"></div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                <i class="fas fa-times"></i> キャンセル
              </button>
              <button type="button" class="btn btn-primary" id="saveCommentBtn">
                <i class="fas fa-save"></i> 保存
              </button>
            </div>
          </div>
        </div>
      </div>

      ${this.userRole === 'admin' ? this.renderAdminModals() : ''}
    `;
  }

  renderAdminModals() {
    return `
      <!-- 出勤記録編集モーダル（管理者のみ） -->
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

                <!-- 休憩時間編集（管理者のみ） -->
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
    `;
  }

  setupEventListeners() {
    // 検索・更新ボタン
    const searchBtn = this.container.querySelector('#searchAttendanceBtn');
    const refreshBtn = this.container.querySelector('#refreshAttendanceBtn');
    
    searchBtn?.addEventListener('click', () => this.searchAttendanceRecords());
    refreshBtn?.addEventListener('click', () => this.refresh());

    // コメント保存
    const saveCommentBtn = this.container.querySelector('#saveCommentBtn');
    saveCommentBtn?.addEventListener('click', () => this.saveComment());

    // 管理者のみの機能
    if (this.userRole === 'admin') {
      const editStatusSelect = this.container.querySelector('#editStatus');
      editStatusSelect?.addEventListener('change', () => this.toggleAbsenceTypeField());

      const saveEditBtn = this.container.querySelector('#saveAttendanceEditBtn');
      saveEditBtn?.addEventListener('click', () => this.saveAttendanceEdit());
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
        this.showReportDetail(userId, userName, date);
      }
      
      // コメントボタン
      if (e.target.closest('.btn-comment')) {
        const btn = e.target.closest('.btn-comment');
        const userId = btn.getAttribute('data-user-id');
        const userName = btn.getAttribute('data-user-name');
        this.openCommentModal(userId, userName);
      }
      
      // 編集ボタン（管理者のみ）
      if (this.userRole === 'admin' && e.target.closest('.btn-edit-attendance')) {
        const btn = e.target.closest('.btn-edit-attendance');
        this.editAttendance(btn.dataset);
      }
    });
  }

  async show() {
    this.container.style.display = 'block';
    await this.loadData();
    this.registerModals();
  }

  hide() {
    this.container.style.display = 'none';
  }

  registerModals() {
    try {
      modalManager.register('dailyReportDetailModal');
      modalManager.register('commentModal');
      if (this.userRole === 'admin') {
        modalManager.register('attendanceEditModal');
      }
    } catch (error) {
      console.error('モーダル登録エラー:', error);
    }
  }

  async loadData() {
    await this.loadUsersForSearch();
    await this.searchAttendanceRecords();
  }

  async loadUsersForSearch() {
    try {
      // 権限に応じてAPIを使い分け
      const endpoint = this.userRole === 'admin' ? 
        API_ENDPOINTS.ADMIN.USERS : 
        API_ENDPOINTS.STAFF.USERS_LIST;
        
      const response = await this.parent.callApi(endpoint);
      const userSelect = this.container.querySelector('#searchUser');
      
      if (userSelect && response.users) {
        let html = '<option value="">全て</option>';
        response.users.forEach(user => {
          const roleDisplay = this.parent.getRoleDisplayName ? 
            this.parent.getRoleDisplayName(user.role) : user.role;
          html += `<option value="${user.id}">${user.name} (${roleDisplay})</option>`;
        });
        userSelect.innerHTML = html;
      }
    } catch (error) {
      console.error('ユーザー読み込みエラー:', error);
    }
  }

  async searchAttendanceRecords() {
    try {
      const searchDate = this.container.querySelector('#searchDate').value;
      const searchUser = this.container.querySelector('#searchUser').value;
      
      const params = new URLSearchParams({ date: searchDate });
      
      // 管理者の場合のみ権限フィルター
      if (this.userRole === 'admin') {
        const searchRole = this.container.querySelector('#searchRole');
        if (searchRole && searchRole.value) {
          params.append('role', searchRole.value);
        }
      }
      
      if (searchUser) params.append('userId', searchUser);

      // 権限に応じてAPIを使い分け
      const endpoint = this.userRole === 'admin' ? 
        API_ENDPOINTS.ADMIN.ATTENDANCE_SEARCH : 
        API_ENDPOINTS.STAFF.ATTENDANCE_SEARCH;
        
      const response = await this.parent.callApi(`${endpoint}?${params}`);
      let records = response.records || [];
      
      // データが取得できない場合、全ユーザーの今日の状況を取得
      if (records.length === 0 && !searchUser && searchDate === new Date().toISOString().split('T')[0]) {
        // 管理者の場合
        if (this.userRole === 'admin') {
          const statusResponse = await this.parent.callApi(API_ENDPOINTS.ADMIN.STATUS_TODAY);
          if (statusResponse.users) {
            records = statusResponse.users.map(user => ({
              id: user.a_id || null,
              user_id: user.id, 
              user_name: user.name,
              user_role: user.role,
              service_type: user.service_type,
              date: searchDate,
              clock_in: user.clock_in || null,
              clock_out: user.clock_out || null,
              status: user.status || 'normal',
              report_id: user.report_id || null,
              comment_id: user.comment || null,
              break_start: null,
              break_end: null,
              break_duration: null
            }));
          }
        }
        // スタッフの場合
        else if (this.userRole === 'staff') {
          const usersResponse = await this.parent.callApi(API_ENDPOINTS.STAFF.USERS);
          if (usersResponse.users) {
            records = usersResponse.users.map(user => ({
              id: user.a_id || null,
              user_id: user.id,
              user_name: user.name,
              user_role: user.role,
              service_type: user.service_type,
              date: searchDate,
              clock_in: user.clock_in || null,
              clock_out: user.clock_out || null,
              status: user.status || 'normal',
              report_id: user.report_id || null,
              comment_id: user.comment_id || null,
              break_start: null,
              break_end: null,
              break_duration: null
            }));
          }
        }
      }
      
      // レスポンスに既に休憩データが含まれているかチェック
      this.currentRecords = records.map(record => {
        // レスポンスから直接break情報を取得
        if (record.break_start || record.break_end || record.break_duration) {
          record.break = {
            start: record.break_start,
            end: record.break_end,
            duration: record.break_duration || (record.break_start && record.break_end ? 60 : null)
          };
        }
        return record;
      });
      
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
                <strong class="text-warning">${summary.reportPending}</strong><br>
                <small>日報未提出</small>
              </div>
              <div class="col-3">
                <strong class="text-danger">${summary.commentPending}</strong><br>
                <small>コメント未記入</small>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    summaryContainer.style.display = 'block';
  }

  calculateRecordsSummary(records) {
    let working = 0, finished = 0, reportPending = 0, commentPending = 0;
    
    records.forEach(record => {
      if (record.clock_in) {
        if (record.clock_out) {
          finished++;
          if (record.user_role === 'user' && !record.report_id) {
            reportPending++;
          }
        } else {
          working++;
        }
      }
      
      if (record.user_role === 'user' && record.report_id && !record.comment_id) {
        commentPending++;
      }
    });
    
    return { working, finished, reportPending, commentPending };
  }

  updateRecordsList(records) {
    const recordsList = this.container.querySelector('#attendanceRecordsList');
    
    if (!records || records.length === 0) {
      recordsList.innerHTML = '<p class="text-muted text-center">検索条件に該当する記録がありません</p>';
      return;
    }

    recordsList.innerHTML = this.generateAttendanceRecordsList(records);
  }

  generateAttendanceRecordsList(records) {
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
              <th>勤務時間</th>
              <th>日報・コメント</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
    `;

    records.forEach(record => {
      try {
        const roleClass = this.getRoleColor(record.user_role);
        const workDuration = this.calculateWorkDuration(record);
        
        // 休憩時間表示
        let breakTimeDisplay = '-';
        if (record.break && record.break.start) {
          if (record.break.end) {
            breakTimeDisplay = `
              <div class="text-info fw-bold">${record.break.start}〜${record.break.end}</div>
              <small class="text-muted">(${record.break.duration || 60}分)</small>
            `;
          } else {
            breakTimeDisplay = `
              <div class="text-warning fw-bold">${record.break.start}〜</div>
              <small class="text-warning">(進行中)</small>
            `;
          }
        } else if (record.breakRecord && record.breakRecord.start_time) {
          if (record.breakRecord.end_time) {
            breakTimeDisplay = `
              <div class="text-info fw-bold">${record.breakRecord.start_time}〜${record.breakRecord.end_time}</div>
              <small class="text-muted">(${record.breakRecord.duration || 60}分)</small>
            `;
          } else {
            breakTimeDisplay = `
              <div class="text-warning fw-bold">${record.breakRecord.start_time}〜</div>
              <small class="text-warning">(進行中)</small>
            `;
          }
        }

        // 日報・コメント状況
        let reportCommentStatus = '';
        if (record.user_role === 'user') {
          if (record.report_id) {
            reportCommentStatus = '<span class="badge bg-success me-1">日報</span>';
            if (record.comment_id) {
              reportCommentStatus += '<span class="badge bg-info">コメント済み</span>';
            } else {
              reportCommentStatus += '<span class="badge bg-warning">コメント未記入</span>';
            }
          } else if (record.clock_out) {
            reportCommentStatus = '<span class="badge bg-danger">日報未提出</span>';
          }
        } else {
          reportCommentStatus = '<span class="text-muted">-</span>';
        }

        // 操作ボタン（権限による制御）
        const actionButtons = this.generateActionButtons(record);

        html += `
          <tr>
            <td><strong>${record.user_name || 'Unknown'}</strong></td>
            <td><span class="badge bg-${roleClass}">${this.getRoleDisplayName(record.user_role)}</span></td>
            <td>${record.clock_in || '-'}</td>
            <td>${breakTimeDisplay}</td>
            <td>${record.clock_out || '-'}</td>
            <td>${workDuration ? workDuration + '時間' : '-'}</td>
            <td>${reportCommentStatus}</td>
            <td>${actionButtons}</td>
          </tr>
        `;
      } catch (error) {
        console.error('レコード生成エラー:', error, record);
        // エラーが発生した場合でも表示を続ける
        html += `
          <tr>
            <td colspan="8" class="text-danger">
              <i class="fas fa-exclamation-triangle"></i> 
              データ表示エラー: ${record.user_name || 'Unknown'}
            </td>
          </tr>
        `;
      }
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    return html;
  }

  generateActionButtons(record) {
    let buttons = '';
    
    // 利用者の日報がある場合
    if (record.user_role === 'user' && record.report_id) {
      buttons += `
        <button class="btn btn-sm btn-outline-primary btn-show-report" 
                data-user-id="${record.user_id}"
                data-user-name="${record.user_name}"
                data-date="${record.date}"
                title="日報詳細">
          <i class="fas fa-file-alt"></i>
        </button>
      `;
      
      // コメント機能（スタッフ・管理者共通）
      buttons += `
        <button class="btn btn-sm btn-outline-info btn-comment" 
                data-user-id="${record.user_id}"
                data-user-name="${record.user_name}"
                ${!record.report_id ? 'disabled' : ''}
                title="コメント">
          <i class="fas fa-comment"></i>
        </button>
      `;
    }
    
    // 編集機能（管理者のみ）
    if (this.userRole === 'admin') {
      buttons += `
        <button class="btn btn-sm btn-outline-warning btn-edit-attendance" 
                data-user-id="${record.user_id}"
                data-user-name="${record.user_name}"
                data-user-role="${record.user_role}"
                data-record-id="${record.id || ''}"
                data-date="${record.date}"
                data-clock-in="${record.clock_in || ''}"
                data-clock-out="${record.clock_out || ''}"
                data-status="${record.status || 'normal'}"
                data-break-start="${record.break ? record.break.start || '' : ''}"
                data-break-end="${record.break ? record.break.end || '' : ''}"
                title="編集">
          <i class="fas fa-edit"></i>
        </button>
      `;
    }
    
    return buttons ? `<div class="btn-group" role="group">${buttons}</div>` : '-';
  }

  getRoleColor(role) {
    const colors = {
      'user': 'primary',
      'staff': 'success', 
      'admin': 'danger'
    };
    return colors[role] || 'secondary';
  }

  getRoleDisplayName(role) {
    if (this.parent.getRoleDisplayName) {
      return this.parent.getRoleDisplayName(role);
    }
    
    const names = {
      'user': '利用者',
      'staff': 'スタッフ',
      'admin': '管理者'
    };
    return names[role] || role;
  }

  calculateWorkDuration(record) {
    if (!record.clock_in || !record.clock_out) return null;
    
    try {
      const start = new Date(`1970-01-01 ${record.clock_in}`);
      const end = new Date(`1970-01-01 ${record.clock_out}`);
      const durationMs = end - start;
      const hours = durationMs / (1000 * 60 * 60);
      
      // 休憩時間の計算（実際の休憩記録に基づく）
      let breakMinutes = 0;
      
      // スタッフ・管理者の場合
      if (record.user_role === 'staff' || record.user_role === 'admin') {
        // 実際に休憩を取った場合のみ（break_startとbreak_endの両方が存在する場合）
        if (record.break_start && record.break_end) {
          breakMinutes = 60; // 固定60分
        }
        // break_startのみある場合（休憩中）は計算しない
      }
      // 利用者の場合（在宅・通所問わず）
      else if (record.user_role === 'user') {
        // breakRecordが存在し、実際に休憩を取った場合のみ
        if (record.breakRecord && record.breakRecord.start_time && record.breakRecord.end_time) {
          breakMinutes = record.breakRecord.duration || 60;
        }
        // 古いデータ用：breakフィールドを確認
        else if (record.break && record.break.start && record.break.end) {
          breakMinutes = record.break.duration || 60;
        }
        // 休憩中（end_timeがない）または休憩を取っていない場合は差し引かない
      }
      
      const netHours = hours - (breakMinutes / 60);
      
      // 計算結果が負にならないようにする
      return netHours > 0 ? netHours.toFixed(1) : hours.toFixed(1);
    } catch (error) {
      console.error('勤務時間計算エラー:', error);
      return null;
    }
  }

  async showReportDetail(userId, userName, date) {
    try {
      const response = await this.parent.callApi(API_ENDPOINTS.STAFF.REPORT(userId, date));
      
      if (!response.report) {
        this.parent.showNotification('この日の日報はありません', 'info');
        return;
      }

      const title = this.container.querySelector('#dailyReportDetailTitle');
      const content = this.container.querySelector('#dailyReportDetailContent');
      
      const formattedDate = new Date(date).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
      });
      
      title.innerHTML = `<i class="fas fa-file-alt"></i> ${userName}さんの日報詳細 - ${formattedDate}`;
      content.innerHTML = this.generateDailyReportDetailContent(response);

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

      const modalContent = this.generateCommentModalContent(response);
      
      const title = this.container.querySelector('#commentModalTitle');
      const content = this.container.querySelector('#commentModalContent');
      
      title.innerHTML = `<i class="fas fa-comment-plus"></i> ${userName}さんの日報にコメント記入`;
      content.innerHTML = modalContent;

      // 文字数カウント
      const textarea = this.container.querySelector('#commentText');
      const charCount = this.container.querySelector('#commentCharCount');
      if (textarea && charCount) {
        textarea.addEventListener('input', () => {
          charCount.textContent = textarea.value.length;
        });
      }

      this.currentCommentData = { userId, userName };
      modalManager.show('commentModal');

    } catch (error) {
      console.error('コメントモーダル表示エラー:', error);
      this.parent.showNotification('エラーが発生しました', 'danger');
    }
  }

  generateCommentModalContent(data) {
    const { user, attendance, report, comment } = data;
    
    return `
      <!-- 日報内容表示（読み取り専用） -->
      <div class="report-summary mb-4">
        <h6><i class="fas fa-file-alt"></i> ${user.name}さんの日報内容</h6>
        
        <div class="mb-3">
          <label class="past-form-label"><i class="fas fa-tasks"></i> 作業内容</label>
          <div class="text-content">${report.work_content || ''}</div>
        </div>

        <div class="mb-3">
          <label class="past-form-label"><i class="fas fa-lightbulb"></i> 振り返り・感想</label>
          <div class="text-content">${report.reflection || ''}</div>
        </div>
      </div>

      <hr>

      <!-- スタッフコメント記入欄 -->
      <div class="staff-comment-section">
        <h6><i class="fas fa-comment-plus"></i> スタッフコメント</h6>
        
        <div class="mb-3">
          <textarea class="form-control" id="commentText" rows="4" 
                    placeholder="利用者への返信、アドバイス、気づいた点などを記入してください..."
                    maxlength="500">${comment ? comment.comment : ''}</textarea>
          <div class="comment-char-count">
            <small class="text-muted">
              <span id="commentCharCount">${comment ? comment.comment.length : 0}</span>/500文字
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

  async saveComment() {
    try {
      const textarea = this.container.querySelector('#commentText');
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

      modalManager.hide('commentModal');
      await this.searchAttendanceRecords();

    } catch (error) {
      console.error('コメント保存エラー:', error);
      this.parent.showNotification(error.message || 'コメントの保存に失敗しました', 'danger');
    }
  }

  // 管理者のみのメソッド
  toggleAbsenceTypeField() {
    if (this.userRole !== 'admin') return;
    
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
    if (this.userRole !== 'admin') return;

    // フォーム要素に値設定（休憩時間追加）
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
    if (this.userRole !== 'admin') return;

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

      if (!reason.trim()) {
        this.parent.showNotification('変更理由を入力してください', 'warning');
        return;
      }

      const requestData = {
        recordId: recordId,
        newClockIn: clockIn,
        newClockOut: clockOut,
        newBreakStart: breakStart,
        newBreakEnd: breakEnd,
        status: finalStatus,
        reason: reason
      };

      await this.parent.callApi(API_ENDPOINTS.ADMIN.ATTENDANCE_CORRECT, {
        method: 'POST',
        body: JSON.stringify(requestData)
      });

      this.parent.showNotification('出勤記録を更新しました', 'success');
      
      modalManager.hide('attendanceEditModal');
      await this.searchAttendanceRecords();
      
    } catch (error) {
      console.error('出勤記録更新エラー:', error);
      this.parent.showNotification(error.message || '出勤記録の更新に失敗しました', 'danger');
    }
  }

  async refresh() {
    await this.searchAttendanceRecords();
    this.parent.showNotification('出勤記録を更新しました', 'info');
  }

  showRecordsError(message) {
    const recordsList = this.container.querySelector('#attendanceRecordsList');
    recordsList.innerHTML = `
      <div class="alert alert-danger">
        <i class="fas fa-exclamation-triangle"></i> ${message}
      </div>
    `;
  }

  getAppetiteLabel(value) {
    const labels = { 'good': 'あり', 'none': 'なし' };
    return labels[value] || value;
  }

  getInterviewRequestLabel(value) {
    const labels = { 'consultation': '相談がある', 'interview': '面談希望' };
    return labels[value] || value;
  }

  destroy() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}

export default SharedAttendanceManagement;