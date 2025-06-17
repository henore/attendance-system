// modules/admin/dashboard.js
// 管理者ダッシュボード機能

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';

export default class AdminDashboard {
    constructor(app, parentModule) {
        this.app = app;
        this.parent = parentModule;
        this.container = null;
        this.updateInterval = null;
    }

    async init(containerElement) {
        this.container = document.createElement('div');
        this.container.id = 'dashboardSection';
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
                    <h5><i class="fas fa-users"></i> 全体出勤状況</h5>
                    <button class="btn btn-outline-light btn-sm" id="refreshDashboardBtn">
                        <i class="fas fa-sync"></i> 更新
                    </button>
                </div>
                <div class="card-body">
                    <!-- 出勤状況サマリー -->
                    <div class="row mb-4" id="attendanceSummary">
                        <!-- 統計情報がここに表示される -->
                    </div>
                    
                    <!-- 全体出勤状況一覧 -->
                    <div id="allUserStatusList">
                        <div class="text-center p-4">
                            <div class="spinner-border" role="status">
                                <span class="visually-hidden">読み込み中...</span>
                            </div>
                            <p class="mt-2 text-muted">出勤状況を読み込み中...</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- コメント未記入利用者の警告 -->
            <div id="uncommentedUsersAlert" class="alert alert-warning mt-3" style="display: none;">
                <h6><i class="fas fa-exclamation-triangle"></i> コメント未記入の利用者</h6>
                <div id="uncommentedUsersList"></div>
            </div>
        `;
    }

    setupEventListeners() {
        const refreshBtn = this.container.querySelector('#refreshDashboardBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refresh());
        }

        // イベント委譲でコメントボタンとその他のボタンを処理
        this.container.addEventListener('click', (e) => {
            // コメントボタン
            if (e.target.closest('.btn-admin-comment')) {
                const btn = e.target.closest('.btn-admin-comment');
                if (!btn.disabled) {
                    const userId = btn.getAttribute('data-user-id');
                    const userName = btn.getAttribute('data-user-name');
                    this.openCommentModal(userId, userName);
                }
            }
            
            // 日報詳細ボタン
            if (e.target.closest('.btn-show-report')) {
                const btn = e.target.closest('.btn-show-report');
                const userId = btn.getAttribute('data-user-id');
                const userName = btn.getAttribute('data-user-name');
                const date = btn.getAttribute('data-date');
                this.showReportDetail(userId, userName, date);
            }
            
            // 編集ボタン
            if (e.target.closest('.btn-edit-attendance')) {
                const btn = e.target.closest('.btn-edit-attendance');
                const userId = btn.getAttribute('data-user-id');
                const userName = btn.getAttribute('data-user-name');
                const userRole = btn.getAttribute('data-user-role');
                this.editAttendance(userId, userName, userRole);
            }
        });
    }

    async show() {
        this.container.style.display = 'block';
        await this.loadData();
        this.startAutoUpdate();
    }

    hide() {
        this.container.style.display = 'none';
        this.stopAutoUpdate();
    }

    async refresh() {
        await this.loadData();
        this.parent.showNotification('ダッシュボードを更新しました', 'info');
    }

    async loadData() {
        try {
            const response = await this.parent.callApi(API_ENDPOINTS.ADMIN.STATUS_TODAY);
            
            // 管理者以外のユーザーのみフィルタリング
            const nonAdminUsers = response.users.filter(user => user.role !== 'admin');
            
            // サマリー情報を更新
            this.updateSummary(nonAdminUsers);
            
            // ユーザー状況リストを更新
            this.updateUserStatusList(nonAdminUsers);
            
            // コメント未記入利用者の警告を更新
            this.updateUncommentedUsersAlert(nonAdminUsers);
            
        } catch (error) {
            console.error('ダッシュボードデータ読み込みエラー:', error);
            this.showError('ダッシュボードデータの読み込みに失敗しました');
        }
    }

    updateSummary(users) {
        const summary = this.calculateSummary(users);
        const summaryContainer = this.container.querySelector('#attendanceSummary');
        
        summaryContainer.innerHTML = `
            <div class="col-lg-3 col-md-6 mb-3">
                <div class="card bg-primary text-white">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="flex-grow-1">
                                <h6 class="card-title mb-0">出勤中</h6>
                                <h3 class="mb-0">${summary.working}</h3>
                            </div>
                            <div class="ms-3">
                                <i class="fas fa-play-circle fa-2x opacity-75"></i>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-lg-3 col-md-6 mb-3">
                <div class="card bg-info text-white">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="flex-grow-1">
                                <h6 class="card-title mb-0">退勤済み</h6>
                                <h3 class="mb-0">${summary.finished}</h3>
                            </div>
                            <div class="ms-3">
                                <i class="fas fa-check-circle fa-2x opacity-75"></i>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-lg-3 col-md-6 mb-3">
                <div class="card bg-success text-white">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="flex-grow-1">
                                <h6 class="card-title mb-0">日報提出済み</h6>
                                <h3 class="mb-0">${summary.reportSubmitted}</h3>
                            </div>
                            <div class="ms-3">
                                <i class="fas fa-file-check fa-2x opacity-75"></i>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-lg-3 col-md-6 mb-3">
                <div class="card bg-warning text-dark">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="flex-grow-1">
                                <h6 class="card-title mb-0">コメント未記入</h6>
                                <h3 class="mb-0">${summary.uncommmented}</h3>
                            </div>
                            <div class="ms-3">
                                <i class="fas fa-comment-exclamation fa-2x opacity-75"></i>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    calculateSummary(users) {
        let working = 0;
        let finished = 0;
        let reportSubmitted = 0;
        let uncommmented = 0;

        users.forEach(user => {
            if (user.clock_in) {
                if (user.clock_out) {
                    finished++;
                } else {
                    working++;
                }
            }

            if (user.role === 'user') {
                if (user.report_id) {
                    reportSubmitted++;
                    if (!user.comment) {
                        uncommmented++;
                    }
                }
            }
        });

        return { working, finished, reportSubmitted, uncommmented };
    }

    updateUserStatusList(users) {
        const listContainer = this.container.querySelector('#allUserStatusList');
        
        if (!users || users.length === 0) {
            listContainer.innerHTML = '<p class="text-muted text-center">ユーザーデータがありません</p>';
            return;
        }

        let html = '';
        users.forEach(user => {
            const userData = this.getUserData(user);
            html += this.generateUserStatusRow(userData);
        });
        
        listContainer.innerHTML = html;
    }

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
        
        return {
            id: user.id,
            name: user.name,
            role: user.role,
            serviceType: user.service_type,
            status: status,
            statusClass: statusClass,
            statusIcon: statusIcon,
            clockIn: user.clock_in,
            clockOut: user.clock_out,
            hasReport: !!user.report_id,
            hasComment: !!user.comment,
            workDuration: this.parent.calculateWorkDuration({ clock_in: user.clock_in, clock_out: user.clock_out }) ? 
                `${this.parent.calculateWorkDuration({ clock_in: user.clock_in, clock_out: user.clock_out })}時間` : null
        };
    }

    generateUserStatusRow(userData) {
        const roleBadge = `<span class="role-badge bg-${this.parent.getRoleColor(userData.role)}">${this.parent.getRoleDisplayName(userData.role)}</span>`;
        const serviceTypeText = userData.serviceType 
            ? `<span class="service-badge bg-light text-dark">${this.parent.getServiceTypeDisplayName(userData.serviceType)}</span>`
            : '';
        
        const workDurationText = userData.workDuration 
            ? `<br><small class="text-muted">勤務時間: ${userData.workDuration}</small>`
            : '';

        const reportStatus = userData.role === 'user' 
            ? (userData.hasReport 
                ? '<span class="badge bg-success"><i class="fas fa-file-check"></i> 提出済み</span>'
                : '<span class="badge bg-warning"><i class="fas fa-file-times"></i> 未提出</span>')
            : '';

        const commentStatus = userData.role === 'user' && userData.hasReport
            ? (userData.hasComment 
                ? '<span class="badge bg-info ms-2"><i class="fas fa-comment-check"></i> コメント済み</span>'
                : '<span class="badge bg-danger ms-2"><i class="fas fa-comment-exclamation"></i> コメント未記入</span>')
            : '';
        
        // コメント未記入の場合は行をハイライト
        const rowClass = userData.role === 'user' && userData.hasReport && !userData.hasComment ? 'border-warning' : '';
        
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
                                <div>${roleBadge} ${serviceTypeText}</div>
                                <small class="text-muted">${userData.status}</small>
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
                        ${reportStatus}
                        ${commentStatus}
                        ${workDurationText}
                    </div>
                    <div class="col-md-2 text-end">
                        ${userData.role === 'user' ? `
                            <button class="btn btn-outline-primary btn-sm me-1 btn-admin-comment" 
                                    data-user-id="${userData.id}"
                                    data-user-name="${userData.name}"
                                    ${!userData.hasReport ? 'disabled title="日報提出後にコメント可能"' : ''}>
                                <i class="fas fa-comment"></i> コメント
                            </button>
                        ` : ''}
                        <button class="btn btn-outline-warning btn-sm btn-edit-attendance" 
                                data-user-id="${userData.id}"
                                data-user-name="${userData.name}"
                                data-user-role="${userData.role}">
                            <i class="fas fa-edit"></i> 編集
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    updateUncommentedUsersAlert(users) {
        const uncommentedUsers = users.filter(user => 
            user.role === 'user' && user.report_id && !user.comment
        );

        const alertContainer = this.container.querySelector('#uncommentedUsersAlert');
        const listContainer = this.container.querySelector('#uncommentedUsersList');

        if (uncommentedUsers.length > 0) {
            let html = '';
            uncommentedUsers.forEach(user => {
                html += `
                    <span class="badge bg-warning text-dark me-2 mb-1">
                        ${user.name}
                        <button class="btn-close btn-close-white btn-sm ms-1 btn-admin-comment"
                                data-user-id="${user.id}"
                                data-user-name="${user.name}"></button>
                    </span>
                `;
            });
            listContainer.innerHTML = html;
            alertContainer.style.display = 'block';
        } else {
            alertContainer.style.display = 'none';
        }
    }

    async openCommentModal(userId, userName) {
        // 出勤管理モジュールを直接参照
        const attendanceModule = this.parent.subModules.attendanceManagement;
        if (attendanceModule) {
            await attendanceModule.openCommentModal(userId, userName);
        } else {
            console.error('出勤管理モジュールが見つかりません');
            this.parent.showNotification('コメント機能を利用できません', 'danger');
        }
    }

    async showReportDetail(userId, userName, date) {
        // 他のモジュールの機能を利用（委譲）
        if (this.parent.subModules.attendanceManagement) {
            await this.parent.subModules.attendanceManagement.showReportDetail(userId, userName, date);
        }
    }

    async editAttendance(userId, userName, userRole) {
        // 他のモジュールの機能を利用（委譲）
        if (this.parent.subModules.attendanceManagement) {
            await this.parent.subModules.attendanceManagement.editAttendance(userId, userName, userRole);
        }
    }

    showError(message) {
        const listContainer = this.container.querySelector('#allUserStatusList');
        listContainer.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i> ${message}
            </div>
        `;
    }

    startAutoUpdate() {
        this.stopAutoUpdate();
        
        // 10分間隔で自動更新
        this.updateInterval = setInterval(async () => {
            if (this.container.style.display !== 'none') {
                await this.loadData();
                console.log('📊 管理者ダッシュボード自動更新実行');
            }
        }, 10 * 60 * 1000); // 10分
        
        console.log('📊 管理者ダッシュボード自動更新開始（10分間隔）');
    }

    stopAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    destroy() {
        this.stopAutoUpdate();
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}