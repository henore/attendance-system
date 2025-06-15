// modules/admin/audit-log.js
// 管理者監査ログ機能

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';

export default class AdminAuditLog {
    constructor(app, parentModule) {
        this.app = app;
        this.parent = parentModule;
        this.container = null;
        this.currentLogs = [];
        this.currentPage = 1;
        this.logsPerPage = 50;
        this.totalLogs = 0;
    }

    async init(containerElement) {
        this.container = document.createElement('div');
        this.container.id = 'auditLogSection';
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
                    <h5><i class="fas fa-clipboard-list"></i> 監査ログ</h5>
                    <div class="btn-group">
                        <button class="btn btn-outline-light btn-sm" id="exportLogBtn">
                            <i class="fas fa-download"></i> エクスポート
                        </button>
                        <button class="btn btn-outline-light btn-sm" id="refreshAuditLogBtn">
                            <i class="fas fa-sync"></i> 更新
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <!-- フィルター・検索 -->
                    <div class="row mb-4">
                        <div class="col-md-3">
                            <label for="logDateFilter" class="form-label">日付フィルター</label>
                            <select class="form-control" id="logDateFilter">
                                <option value="">全期間</option>
                                <option value="today">今日</option>
                                <option value="yesterday">昨日</option>
                                <option value="week">過去1週間</option>
                                <option value="month">過去1ヶ月</option>
                                <option value="custom">期間指定</option>
                            </select>
                        </div>
                        <div class="col-md-3" id="customDateRange" style="display: none;">
                            <label for="logStartDate" class="form-label">開始日</label>
                            <input type="date" class="form-control" id="logStartDate">
                        </div>
                        <div class="col-md-3" id="customDateRangeEnd" style="display: none;">
                            <label for="logEndDate" class="form-label">終了日</label>
                            <input type="date" class="form-control" id="logEndDate">
                        </div>
                        <div class="col-md-3">
                            <label for="actionTypeFilter" class="form-label">アクション種別</label>
                            <select class="form-control" id="actionTypeFilter">
                                <option value="">全てのアクション</option>
                                <option value="account_create">アカウント作成</option>
                                <option value="attendance_correction">出勤記録訂正</option>
                                <option value="user_deactivation">ユーザー無効化</option>
                                <option value="monthly_attendance_view">月次出勤簿閲覧</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label for="adminFilter" class="form-label">実行者</label>
                            <select class="form-control" id="adminFilter">
                                <option value="">全ての管理者</option>
                                <!-- 管理者一覧が動的に追加される -->
                            </select>
                        </div>
                    </div>

                    <!-- 検索ボタン -->
                    <div class="row mb-4">
                        <div class="col-md-6">
                            <button class="btn btn-primary" id="searchLogsBtn">
                                <i class="fas fa-search"></i> 検索
                            </button>
                            <button class="btn btn-outline-secondary ms-2" id="clearFiltersBtn">
                                <i class="fas fa-times"></i> フィルタークリア
                            </button>
                        </div>
                        <div class="col-md-6 text-end">
                            <div class="d-flex align-items-center justify-content-end">
                                <label for="logsPerPageSelect" class="form-label me-2 mb-0">表示件数:</label>
                                <select class="form-control form-control-sm" id="logsPerPageSelect" style="width: auto;">
                                    <option value="25">25件</option>
                                    <option value="50" selected>50件</option>
                                    <option value="100">100件</option>
                                    <option value="200">200件</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- 検索結果サマリー -->
                    <div id="logsSummary" class="mb-3" style="display: none;">
                        <!-- 検索結果の統計情報 -->
                    </div>

                    <!-- 監査ログ一覧 -->
                    <div id="auditLogList">
                        <div class="text-center p-4">
                            <p class="text-muted">監査ログを読み込み中...</p>
                        </div>
                    </div>

                    <!-- ページネーション -->
                    <div id="logsPagination" class="mt-4" style="display: none;">
                        <!-- ページネーションが動的に生成される -->
                    </div>
                </div>
            </div>

            <!-- ログ詳細モーダル -->
            <div class="modal fade" id="logDetailModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-info text-white">
                            <h5 class="modal-title">
                                <i class="fas fa-clipboard-list"></i> 監査ログ詳細
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" id="logDetailContent">
                            <!-- ログ詳細がここに表示される -->
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                <i class="fas fa-times"></i> 閉じる
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        // 日付フィルター変更時の期間指定表示切り替え
        const dateFilter = this.container.querySelector('#logDateFilter');
        if (dateFilter) {
            dateFilter.addEventListener('change', () => this.toggleCustomDateRange());
        }

        // 検索・更新ボタン
        const searchBtn = this.container.querySelector('#searchLogsBtn');
        const refreshBtn = this.container.querySelector('#refreshAuditLogBtn');
        const clearBtn = this.container.querySelector('#clearFiltersBtn');
        
        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.searchLogs());
        }
        
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refresh());
        }
        
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearFilters());
        }

        // 表示件数変更
        const perPageSelect = this.container.querySelector('#logsPerPageSelect');
        if (perPageSelect) {
            perPageSelect.addEventListener('change', () => {
                this.logsPerPage = parseInt(perPageSelect.value);
                this.currentPage = 1;
                this.searchLogs();
            });
        }

        // エクスポートボタン
        const exportBtn = this.container.querySelector('#exportLogBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportLogs());
        }

        // イベント委譲で動的ボタンを処理
        this.container.addEventListener('click', (e) => {
            // ログ詳細ボタン
            if (e.target.closest('.btn-log-detail')) {
                const btn = e.target.closest('.btn-log-detail');
                const logId = btn.getAttribute('data-log-id');
                this.showLogDetail(logId);
            }
            
            // ページネーションボタン
            if (e.target.closest('.page-link')) {
                const btn = e.target.closest('.page-link');
                const page = btn.getAttribute('data-page');
                if (page && !btn.parentElement.classList.contains('disabled')) {
                    this.currentPage = parseInt(page);
                    this.searchLogs();
                }
            }
        });
    }

    async show() {
        this.container.style.display = 'block';
        await this.loadData();
    }

    hide() {
        this.container.style.display = 'none';
    }

    async refresh() {
        await this.searchLogs();
        this.parent.showNotification('監査ログを更新しました', 'info');
    }

    async loadData() {
        await this.loadAdminUsers();
        await this.searchLogs();
    }

    async loadAdminUsers() {
        try {
            const response = await this.parent.callApi(API_ENDPOINTS.ADMIN.USERS + '?role=admin');
            const adminFilter = this.container.querySelector('#adminFilter');
            
            if (adminFilter && response.users) {
                let html = '<option value="">全ての管理者</option>';
                response.users.forEach(admin => {
                    html += `<option value="${admin.id}">${admin.name}</option>`;
                });
                adminFilter.innerHTML = html;
            }
        } catch (error) {
            console.error('管理者一覧読み込みエラー:', error);
        }
    }

    toggleCustomDateRange() {
        const dateFilter = this.container.querySelector('#logDateFilter');
        const customRange = this.container.querySelector('#customDateRange');
        const customRangeEnd = this.container.querySelector('#customDateRangeEnd');
        
        if (dateFilter.value === 'custom') {
            customRange.style.display = 'block';
            customRangeEnd.style.display = 'block';
        } else {
            customRange.style.display = 'none';
            customRangeEnd.style.display = 'none';
        }
    }

    clearFilters() {
        // フィルターをリセット
        this.container.querySelector('#logDateFilter').value = '';
        this.container.querySelector('#actionTypeFilter').value = '';
        this.container.querySelector('#adminFilter').value = '';
        this.container.querySelector('#logStartDate').value = '';
        this.container.querySelector('#logEndDate').value = '';
        
        this.toggleCustomDateRange();
        this.currentPage = 1;
        
        // 全ログを表示
        this.searchLogs();
    }

    async searchLogs() {
        try {
            const filters = this.getSearchFilters();
            const offset = (this.currentPage - 1) * this.logsPerPage;
            
            // クエリパラメータを構築
            const params = new URLSearchParams({
                limit: this.logsPerPage.toString(),
                offset: offset.toString()
            });

            // フィルターを追加
            Object.keys(filters).forEach(key => {
                if (filters[key]) {
                    params.append(key, filters[key]);
                }
            });

            const response = await this.parent.callApi(`${API_ENDPOINTS.ADMIN.AUDIT_LOG}?${params}`);
            
            this.currentLogs = response.logs || [];
            this.totalLogs = response.total || this.currentLogs.length;
            
            this.updateLogsList();
            this.updateSummary();
            this.updatePagination();
            
        } catch (error) {
            console.error('監査ログ検索エラー:', error);
            this.showLogsError('監査ログの取得に失敗しました');
        }
    }

    getSearchFilters() {
        const filters = {};
        
        // 日付フィルター
        const dateFilter = this.container.querySelector('#logDateFilter').value;
        if (dateFilter && dateFilter !== '') {
            switch (dateFilter) {
                case 'today':
                    filters.startDate = new Date().toISOString().split('T')[0];
                    filters.endDate = new Date().toISOString().split('T')[0];
                    break;
                case 'yesterday':
                    const yesterday = new Date();
                    yesterday.setDate(yesterday.getDate() - 1);
                    filters.startDate = yesterday.toISOString().split('T')[0];
                    filters.endDate = yesterday.toISOString().split('T')[0];
                    break;
                case 'week':
                    const weekAgo = new Date();
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    filters.startDate = weekAgo.toISOString().split('T')[0];
                    break;
                case 'month':
                    const monthAgo = new Date();
                    monthAgo.setMonth(monthAgo.getMonth() - 1);
                    filters.startDate = monthAgo.toISOString().split('T')[0];
                    break;
                case 'custom':
                    const startDate = this.container.querySelector('#logStartDate').value;
                    const endDate = this.container.querySelector('#logEndDate').value;
                    if (startDate) filters.startDate = startDate;
                    if (endDate) filters.endDate = endDate;
                    break;
            }
        }
        
        // アクション種別フィルター
        const actionType = this.container.querySelector('#actionTypeFilter').value;
        if (actionType) filters.actionType = actionType;
        
        // 管理者フィルター
        const adminId = this.container.querySelector('#adminFilter').value;
        if (adminId) filters.adminId = adminId;
        
        return filters;
    }

    updateLogsList() {
        const logsList = this.container.querySelector('#auditLogList');
        
        if (!this.currentLogs || this.currentLogs.length === 0) {
            logsList.innerHTML = '<p class="text-muted text-center">検索条件に該当するログがありません</p>';
            return;
        }

        logsList.innerHTML = this.generateAuditLogsList();
    }

    generateAuditLogsList() {
        let html = `
            <div class="table-responsive">
                <table class="table table-hover table-sm">
                    <thead class="table-light">
                        <tr>
                            <th width="15%">日時</th>
                            <th width="10%">管理者</th>
                            <th width="15%">アクション</th>
                            <th width="15%">対象</th>
                            <th width="30%">詳細</th>
                            <th width="10%">IP</th>
                            <th width="5%">操作</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        this.currentLogs.forEach(log => {
            const actionType = this.getActionTypeDisplayName(log.action_type);
            const timestamp = new Date(log.created_at).toLocaleString('ja-JP');
            const targetInfo = this.getTargetInfo(log);
            const details = this.getLogDetails(log);
            
            html += `
                <tr>
                    <td><small>${timestamp}</small></td>
                    <td>
                        <strong>${log.admin_name}</strong>
                        <br><small class="text-muted">${log.admin_id}</small>
                    </td>
                    <td>
                        <span class="badge ${this.getActionTypeBadgeClass(log.action_type)}">
                            ${actionType}
                        </span>
                    </td>
                    <td><small>${targetInfo}</small></td>
                    <td><small>${details}</small></td>
                    <td><small class="text-muted">${log.ip_address || '-'}</small></td>
                    <td>
                        <button class="btn btn-sm btn-outline-info btn-log-detail" 
                                data-log-id="${log.id}"
                                title="詳細表示">
                            <i class="fas fa-eye"></i>
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

        return html;
    }

    getActionTypeDisplayName(actionType) {
        const actionTypes = {
            'account_create': 'アカウント作成',
            'attendance_correction': '出勤記録訂正',
            'user_deactivation': 'ユーザー無効化',
            'monthly_attendance_view': '月次出勤簿閲覧',
            'login': 'ログイン',
            'logout': 'ログアウト'
        };
        return actionTypes[actionType] || actionType;
    }

    getActionTypeBadgeClass(actionType) {
        const badgeClasses = {
            'account_create': 'bg-success',
            'attendance_correction': 'bg-warning text-dark',
            'user_deactivation': 'bg-danger',
            'monthly_attendance_view': 'bg-info',
            'login': 'bg-primary',
            'logout': 'bg-secondary'
        };
        return badgeClasses[actionType] || 'bg-light text-dark';
    }

    getTargetInfo(log) {
        if (log.target_type && log.target_id) {
            return `${log.target_type} (ID: ${log.target_id})`;
        }
        return log.target_type || '-';
    }

    getLogDetails(log) {
        let details = [];
        
        if (log.reason) {
            details.push(`理由: ${log.reason}`);
        }
        
        if (log.old_value || log.new_value) {
            try {
                const oldValue = log.old_value ? JSON.parse(log.old_value) : null;
                const newValue = log.new_value ? JSON.parse(log.new_value) : null;
                
                if (oldValue || newValue) {
                    if (log.action_type === 'attendance_correction') {
                        details.push('出勤記録を変更');
                    } else if (log.action_type === 'account_create') {
                        if (newValue && newValue.username) {
                            details.push(`ユーザー: ${newValue.username}`);
                        }
                    }
                }
            } catch (e) {
                // JSON解析エラーは無視
            }
        }
        
        return details.length > 0 ? details.join(', ') : '-';
    }

    updateSummary() {
        const summaryContainer = this.container.querySelector('#logsSummary');
        
        const summary = this.calculateLogsSummary();
        
        summaryContainer.innerHTML = `
            <div class="alert alert-info">
                <div class="row">
                    <div class="col-md-6">
                        <h6><i class="fas fa-clipboard-list"></i> 監査ログ検索結果</h6>
                        <p class="mb-0">総件数: ${this.totalLogs}件 | 表示中: ${this.currentLogs.length}件</p>
                    </div>
                    <div class="col-md-6">
                        <div class="row text-center">
                            <div class="col-3">
                                <strong class="text-success">${summary.creates}</strong><br>
                                <small>作成</small>
                            </div>
                            <div class="col-3">
                                <strong class="text-warning">${summary.corrections}</strong><br>
                                <small>訂正</small>
                            </div>
                            <div class="col-3">
                                <strong class="text-danger">${summary.deletions}</strong><br>
                                <small>削除</small>
                            </div>
                            <div class="col-3">
                                <strong class="text-info">${summary.views}</strong><br>
                                <small>閲覧</small>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        summaryContainer.style.display = 'block';
    }

    calculateLogsSummary() {
        let creates = 0, corrections = 0, deletions = 0, views = 0;
        
        this.currentLogs.forEach(log => {
            switch (log.action_type) {
                case 'account_create':
                    creates++;
                    break;
                case 'attendance_correction':
                    corrections++;
                    break;
                case 'user_deactivation':
                    deletions++;
                    break;
                case 'monthly_attendance_view':
                    views++;
                    break;
            }
        });
        
        return { creates, corrections, deletions, views };
    }

    updatePagination() {
        const paginationContainer = this.container.querySelector('#logsPagination');
        
        if (this.totalLogs <= this.logsPerPage) {
            paginationContainer.style.display = 'none';
            return;
        }
        
        const totalPages = Math.ceil(this.totalLogs / this.logsPerPage);
        let html = '<nav><ul class="pagination justify-content-center">';
        
        // 前へボタン
        html += `
            <li class="page-item ${this.currentPage === 1 ? 'disabled' : ''}">
                <a class="page-link" href="#" data-page="${this.currentPage - 1}">
                    <i class="fas fa-chevron-left"></i> 前へ
                </a>
            </li>
        `;
        
        // ページ番号
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(totalPages, this.currentPage + 2);
        
        if (startPage > 1) {
            html += `<li class="page-item"><a class="page-link" href="#" data-page="1">1</a></li>`;
            if (startPage > 2) {
                html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
        }
        
        for (let i = startPage; i <= endPage; i++) {
            html += `
                <li class="page-item ${i === this.currentPage ? 'active' : ''}">
                    <a class="page-link" href="#" data-page="${i}">${i}</a>
                </li>
            `;
        }
        
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
            html += `<li class="page-item"><a class="page-link" href="#" data-page="${totalPages}">${totalPages}</a></li>`;
        }
        
        // 次へボタン
        html += `
            <li class="page-item ${this.currentPage === totalPages ? 'disabled' : ''}">
                <a class="page-link" href="#" data-page="${this.currentPage + 1}">
                    次へ <i class="fas fa-chevron-right"></i>
                </a>
            </li>
        `;
        
        html += '</ul></nav>';
        
        paginationContainer.innerHTML = html;
        paginationContainer.style.display = 'block';
    }

    async showLogDetail(logId) {
        try {
            const log = this.currentLogs.find(l => l.id == logId);
            if (!log) {
                this.parent.showNotification('ログ詳細が見つかりません', 'warning');
                return;
            }

            const content = this.container.querySelector('#logDetailContent');
            content.innerHTML = this.generateLogDetailContent(log);

            // モーダル表示
            const modal = new bootstrap.Modal(this.container.querySelector('#logDetailModal'));
            modal.show();

        } catch (error) {
            console.error('ログ詳細表示エラー:', error);
            this.parent.showNotification('ログ詳細の取得に失敗しました', 'danger');
        }
    }

    generateLogDetailContent(log) {
        const timestamp = new Date(log.created_at).toLocaleString('ja-JP');
        
        let oldValueDisplay = '-';
        let newValueDisplay = '-';
        
        try {
            if (log.old_value) {
                const oldValue = JSON.parse(log.old_value);
                oldValueDisplay = `<pre class="bg-light p-2">${JSON.stringify(oldValue, null, 2)}</pre>`;
            }
            if (log.new_value) {
                const newValue = JSON.parse(log.new_value);
                newValueDisplay = `<pre class="bg-light p-2">${JSON.stringify(newValue, null, 2)}</pre>`;
            }
        } catch (e) {
            if (log.old_value) oldValueDisplay = log.old_value;
            if (log.new_value) newValueDisplay = log.new_value;
        }

        return `
            <div class="row mb-3">
                <div class="col-md-6">
                    <h6><i class="fas fa-info-circle"></i> 基本情報</h6>
                    <table class="table table-borderless table-sm">
                        <tr>
                            <th width="100">日時:</th>
                            <td>${timestamp}</td>
                        </tr>
                        <tr>
                            <th>管理者:</th>
                            <td><strong>${log.admin_name}</strong> (ID: ${log.admin_id})</td>
                        </tr>
                        <tr>
                            <th>アクション:</th>
                            <td>
                                <span class="badge ${this.getActionTypeBadgeClass(log.action_type)}">
                                    ${this.getActionTypeDisplayName(log.action_type)}
                                </span>
                            </td>
                        </tr>
                        <tr>
                            <th>対象タイプ:</th>
                            <td>${log.target_type || '-'}</td>
                        </tr>
                        <tr>
                            <th>対象ID:</th>
                            <td>${log.target_id || '-'}</td>
                        </tr>
                        <tr>
                            <th>IPアドレス:</th>
                            <td><code>${log.ip_address || '-'}</code></td>
                        </tr>
                    </table>
                </div>
                <div class="col-md-6">
                    <h6><i class="fas fa-comment"></i> 理由・詳細</h6>
                    <div class="bg-light p-3 rounded">
                        ${log.reason || '理由の記載なし'}
                    </div>
                </div>
            </div>

            ${(log.old_value || log.new_value) ? `
                <hr>
                <div class="row">
                    <div class="col-md-6">
                        <h6><i class="fas fa-history"></i> 変更前の値</h6>
                        ${oldValueDisplay}
                    </div>
                    <div class="col-md-6">
                        <h6><i class="fas fa-edit"></i> 変更後の値</h6>
                        ${newValueDisplay}
                    </div>
                </div>
            ` : ''}
        `;
    }

    exportLogs() {
        if (!this.currentLogs || this.currentLogs.length === 0) {
            this.parent.showNotification('エクスポートするログがありません', 'warning');
            return;
        }
        
        // CSV形式でエクスポート
        let csv = 'ID,日時,管理者名,管理者ID,アクション,対象タイプ,対象ID,理由,IPアドレス\n';
        
        this.currentLogs.forEach(log => {
            const row = [
                log.id,
                `"${new Date(log.created_at).toLocaleString('ja-JP')}"`,
                `"${log.admin_name}"`,
                log.admin_id,
                `"${this.getActionTypeDisplayName(log.action_type)}"`,
                `"${log.target_type || ''}"`,
                log.target_id || '',
                `"${(log.reason || '').replace(/"/g, '""')}"`,
                log.ip_address || ''
            ];
            csv += row.join(',') + '\n';
        });
        
        // ダウンロード
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `audit_log_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        this.parent.showNotification('監査ログをCSV形式でエクスポートしました', 'success');
    }

    showLogsError(message) {
        const logsList = this.container.querySelector('#auditLogList');
        logsList.innerHTML = `
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