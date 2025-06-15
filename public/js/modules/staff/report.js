// modules/staff/report.js
// スタッフの日報閲覧機能

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { formatDate } from '../../utils/date-time.js';

export class StaffReportHandler {
  constructor(apiCall, showNotification) {
    this.apiCall = apiCall;
    this.showNotification = showNotification;
  }

  /**
   * 日報一覧を表示
   */
  render() {
    return `
      <div class="custom-card">
        <div class="custom-card-header">
          <h5><i class="fas fa-file-alt"></i> 日報一覧</h5>
          <button class="btn btn-outline-light btn-sm" id="refreshReportsBtn">
            <i class="fas fa-sync"></i> 更新
          </button>
        </div>
        <div class="card-body">
          <div class="row mb-3">
            <div class="col-md-4">
              <label for="reportDateFilter" class="form-label">日付</label>
              <input type="date" class="form-control" id="reportDateFilter" 
                     value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="col-md-4">
              <label for="reportUserFilter" class="form-label">利用者</label>
              <select class="form-control" id="reportUserFilter">
                <option value="">全て</option>
              </select>
            </div>
            <div class="col-md-4 d-flex align-items-end">
              <button class="btn btn-primary w-100" id="searchReportsBtn">
                <i class="fas fa-search"></i> 検索
              </button>
            </div>
          </div>
          
          <div id="reportsList">
            <!-- 日報一覧がここに表示される -->
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 初期化
   */
  init() {
    this.setupEventListeners();
    this.loadUsers();
    this.searchReports();
  }

  /**
   * イベントリスナーを設定
   */
  setupEventListeners() {
    const refreshBtn = document.getElementById('refreshReportsBtn');
    const searchBtn = document.getElementById('searchReportsBtn');
    
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refresh());
    }
    
    if (searchBtn) {
      searchBtn.addEventListener('click', () => this.searchReports());
    }
  }

  /**
   * 利用者一覧を読み込み
   */
  async loadUsers() {
    try {
      const response = await this.apiCall(API_ENDPOINTS.STAFF.USERS_LIST);
      const userSelect = document.getElementById('reportUserFilter');
      
      if (userSelect && response.users) {
        let html = '<option value="">全て</option>';
        response.users.forEach(user => {
          html += `<option value="${user.id}">${user.name}</option>`;
        });
        userSelect.innerHTML = html;
      }
    } catch (error) {
      console.error('利用者一覧読み込みエラー:', error);
    }
  }

  /**
   * 日報を検索
   */
  async searchReports() {
    try {
      const date = document.getElementById('reportDateFilter').value;
      const userId = document.getElementById('reportUserFilter').value;
      
      const response = await this.apiCall(API_ENDPOINTS.STAFF.USERS);
      let reports = response.users.filter(user => user.report_id);
      
      if (userId) {
        reports = reports.filter(user => user.id == userId);
      }
      
      this.updateReportsList(reports, date);
    } catch (error) {
      console.error('日報検索エラー:', error);
      this.showReportsError('日報の検索に失敗しました');
    }
  }

  /**
   * 日報一覧を更新
   */
  updateReportsList(reports, date) {
    const listContainer = document.getElementById('reportsList');
    
    if (!reports || reports.length === 0) {
      listContainer.innerHTML = '<p class="text-muted text-center">該当する日報がありません</p>';
      return;
    }

    let html = `
      <div class="table-responsive">
        <table class="table table-hover">
          <thead class="table-light">
            <tr>
              <th>利用者</th>
              <th>出勤時間</th>
              <th>退勤時間</th>
              <th>コメント状況</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
    `;

    reports.forEach(user => {
      const commentStatus = user.comment_id ? 
        '<span class="badge bg-info">コメント済み</span>' :
        '<span class="badge bg-warning">未記入</span>';

      html += `
        <tr>
          <td><strong>${user.name}</strong></td>
          <td>${user.clock_in || '-'}</td>
          <td>${user.clock_out || '-'}</td>
          <td>${commentStatus}</td>
          <td>
            <button class="btn btn-sm btn-outline-primary btn-view-report" 
                    data-user-id="${user.id}"
                    data-user-name="${user.name}"
                    data-date="${date}">
              <i class="fas fa-eye"></i> 詳細
            </button>
          </td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    listContainer.innerHTML = html;
    this.setupReportActions();
  }

  /**
   * 日報アクションボタンのイベントを設定
   */
  setupReportActions() {
    document.querySelectorAll('.btn-view-report').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const userId = e.target.closest('button').getAttribute('data-user-id');
        const userName = e.target.closest('button').getAttribute('data-user-name');
        const date = e.target.closest('button').getAttribute('data-date');
        this.viewReportDetail(userId, userName, date);
      });
    });
  }

  /**
   * 日報詳細を表示
   */
  async viewReportDetail(userId, userName, date) {
    // この機能は comment.js の showReportDetail メソッドに委譲
    console.log(`日報詳細表示: ${userName} - ${date}`);
  }

  /**
   * エラー表示
   */
  showReportsError(message) {
    const listContainer = document.getElementById('reportsList');
    listContainer.innerHTML = `
      <div class="alert alert-danger">
        <i class="fas fa-exclamation-triangle"></i> ${message}
      </div>
    `;
  }

  /**
   * リフレッシュ
   */
  async refresh() {
    await this.searchReports();
    this.showNotification('日報一覧を更新しました', 'info');
  }
}