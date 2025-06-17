// modules/staff/dashboard.js
// スタッフのダッシュボード機能ハンドラー

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { formatRoleName, formatServiceType, formatWorkHours } from '../../utils/formatter.js';
import { calculateWorkHours } from '../../utils/date-time.js';

export class StaffDashboard {
  constructor(apiCall, showNotification, openCommentModal) {
    this.apiCall = apiCall;
    this.showNotification = showNotification;
    this.openCommentModal = openCommentModal;
    this.updateInterval = null;
  }

  /**
   * ダッシュボードをレンダリング
   */
  render() {
    return `
      <div class="custom-card">
        <div class="custom-card-header">
          <h5><i class="fas fa-users"></i> 利用者出勤状況</h5>
          <button class="btn btn-outline-light btn-sm" id="refreshDashboardBtn">
            <i class="fas fa-sync"></i> 更新
          </button>
        </div>
        <div class="card-body">
          <div id="userStatusList">
            <!-- 利用者の出勤状況一覧がここに表示される -->
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 初期化
   */
  init() {
    const refreshBtn = document.getElementById('refreshDashboardBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refresh());
    }
  }

    /**
     * データを読み込み
     */
    async loadData() {
        try {
            const response = await this.apiCall(API_ENDPOINTS.STAFF.USERS);
            const userStatusContainer = document.getElementById('userStatusList');
            
            if (userStatusContainer && response.users) {
                userStatusContainer.innerHTML = this.generateUserStatusList(response.users);
                this.setupEventHandlers();
            }
        } catch (error) {
            console.error('ダッシュボードデータ読み込みエラー:', error);
            this.showError('ダッシュボードデータの読み込みに失敗しました');
        }
    }

    /**
     * エラー表示
     */
    showError(message) {
        const userStatusContainer = document.getElementById('userStatusList');
        if (userStatusContainer) {
            userStatusContainer.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle"></i> ${message}
                </div>
            `;
        }
    }

  /**
   * 利用者状態リストを生成
   */
  generateUserStatusList(users) {
    if (!users || users.length === 0) {
      return '<p class="text-muted text-center">利用者データがありません</p>';
    }

    let html = '';
    users.forEach(user => {
      const userData = this.getUserData(user);
      html += this.generateUserStatusRow(userData);
    });
    
    return html;
  }

  /**
   * ユーザーデータを整形
   */
  getUserData(user) {
    let status = '未出勤';
    let statusClass = 'bg-secondary';
    let statusIcon = 'fa-minus-circle';
    
    if (user.clock_in) {
      if (user.clock_out) {
        status = '退勤済み';
        statusClass = 'bg-info';
        statusIcon = 'fa-check-circle';
      } else {
        status = '出勤中';
        statusClass = 'bg-success';
        statusIcon = 'fa-play-circle';
      }
    }
    
    const workHours = calculateWorkHours(user.clock_in, user.clock_out, 0);
    
    return {
      id: user.id,
      name: user.name,
      serviceType: user.service_type,
      status: status,
      statusClass: statusClass,
      statusIcon: statusIcon,
      clockIn: user.clock_in,
      clockOut: user.clock_out,
      hasReport: !!user.report_id,
      hasComment: !!user.comment_id,
      workDuration: workHours ? formatWorkHours(workHours) : null
    };
  }

  /**
   * ユーザー状態行を生成
   */
  generateUserStatusRow(userData) {
    const reportBadge = userData.hasReport 
      ? '<span class="badge bg-success"><i class="fas fa-file-check"></i> 提出済み</span>'
      : '<span class="badge bg-warning"><i class="fas fa-file-times"></i> 未提出</span>';
    
    const workDurationText = userData.workDuration 
      ? `<br><small class="text-muted">勤務時間: ${userData.workDuration}</small>`
      : '';
      
    const serviceTypeText = userData.serviceType 
      ? `<small class="text-muted"> (${formatServiceType(userData.serviceType)})</small>`
      : '';

    let commentBadge = '';
    let commentBtnText = '';
    let commentBtnClass = '';
    let rowClass = '';
    
    if (userData.hasReport) {
      if (userData.hasComment) {
        commentBadge = '<span class="badge bg-info ms-2"><i class="fas fa-comment-check"></i> コメント済み</span>';
        commentBtnText = 'コメント編集';
        commentBtnClass = 'btn-outline-info';
      } else {
        commentBadge = '<span class="badge bg-danger ms-2"><i class="fas fa-comment-exclamation"></i> コメント未記入</span>';
        commentBtnText = 'コメント記入';
        commentBtnClass = 'btn-outline-primary';
        rowClass = 'border-warning';
      }
    }
    
    return `
      <div class="user-status-row mb-3 p-3 border rounded ${rowClass}">
        <div class="row align-items-center">
          <div class="col-md-3">
            <div class="d-flex align-items-center">
              <span class="badge ${userData.statusClass} me-2">
                <i class="fas ${userData.statusIcon}"></i>
              </span>
              <div>
                <h6 class="mb-0">${userData.name}</h6>
                <small class="text-muted">${userData.status}${serviceTypeText}</small>
              </div>
            </div>
          </div>
          <div class="col-md-2 text-center">
            <div class="time-display">
              <i class="fas fa-clock text-success"></i>
              <div class="fw-bold">${userData.clockIn || '-'}</div>
              <small class="text-muted">出勤</small>
            </div>
          </div>
          <div class="col-md-2 text-center">
            <div class="time-display">
              <i class="fas fa-clock text-info"></i>
              <div class="fw-bold">${userData.clockOut || '-'}</div>
              <small class="text-muted">退勤</small>
            </div>
          </div>
          <div class="col-md-3 text-center">
            ${reportBadge}
            ${commentBadge}
            ${workDurationText}
          </div>
          <div class="col-md-2 text-end">
            <button class="btn ${commentBtnClass} btn-sm btn-staff-comment" 
                    data-user-id="${userData.id}"
                    data-user-name="${userData.name}"
                    ${!userData.hasReport ? 'disabled title="日報提出後にコメント可能"' : ''}>
              <i class="fas fa-comment"></i> ${commentBtnText}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * イベントハンドラーを設定
   */
  setupEventHandlers() {
    document.querySelectorAll('.btn-staff-comment').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const userId = e.target.closest('button').getAttribute('data-user-id');
        const userName = e.target.closest('button').getAttribute('data-user-name');
        if (!e.target.closest('button').disabled) {
          this.openCommentModal(userId, userName);
        }
      });
    });
  }

  /**
   * ダッシュボードを更新
   */
  async refresh() {
    await this.loadData();
    this.showNotification('ダッシュボードを更新しました', 'info');
  }

  /**
   * 自動更新を開始
   */
  startAutoUpdate() {
    this.stopAutoUpdate();
    
    // 10分間隔でダッシュボード更新
    this.updateInterval = setInterval(async () => {
      const dashboardSection = document.getElementById('dashboardSection');
      if (dashboardSection && dashboardSection.style.display !== 'none') {
        await this.loadData();
        console.log('📊 ダッシュボード自動更新実行');
      }
    }, 10 * 60 * 1000); // 10分
    
    console.log('📊 ダッシュボード自動更新開始（10分間隔）');
  }

  /**
   * 自動更新を停止
   */
  stopAutoUpdate() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * 利用者状態サマリーを取得
   */
  async getUserStatusSummary() {
    try {
      const response = await this.apiCall(API_ENDPOINTS.STAFF.USERS);
      const users = response.users || [];
      
      const summary = {
        total: users.length,
        working: users.filter(u => u.clock_in && !u.clock_out).length,
        completed: users.filter(u => u.clock_in && u.clock_out).length,
        notArrived: users.filter(u => !u.clock_in).length,
        reportSubmitted: users.filter(u => u.report_id).length,
        uncommented: users.filter(u => u.report_id && !u.comment_id).length
      };
      
      return summary;
    } catch (error) {
      console.error('利用者状態サマリー取得エラー:', error);
      return null;
    }
  }
}