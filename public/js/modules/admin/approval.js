// modules/admin/approval.js
// 管理者用稟議承認モジュール

export default class AdminApproval {
    constructor(app, parentModule) {
        this.app = app;
        this.parentModule = parentModule;
        this.approvals = [];
    }

    async init(container) {
        const section = document.createElement('div');
        section.id = 'approvalManagementSection';
        section.className = 'admin-section mb-4';
        section.style.display = 'none';
        container.appendChild(section);

        this.render();
    }

    render() {
        const section = document.getElementById('approvalManagementSection');
        if (!section) return;

        section.innerHTML = `
            <div class="custom-card">
                <div class="custom-card-header">
                    <h5><i class="fas fa-file-signature"></i> 稟議承認管理</h5>
                </div>
                <div class="card-body">
                    <!-- フィルター -->
                    <div class="row mb-3">
                        <div class="col-md-6">
                            <label for="adminStatusFilter" class="form-label">ステータス</label>
                            <select class="form-select" id="adminStatusFilter">
                                <option value="">すべて</option>
                                <option value="draft">下書き</option>
                                <option value="pending" selected>申請中</option>
                                <option value="approved">承認済み</option>
                                <option value="rejected">却下</option>
                                <option value="completed">完了</option>
                            </select>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">&nbsp;</label>
                            <button class="btn btn-primary w-100" id="refreshApprovalList">
                                <i class="fas fa-sync"></i> 更新
                            </button>
                        </div>
                    </div>

                    <!-- 稟議一覧テーブル -->
                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead>
                                <tr>
                                    <th style="width: 50px;">ID</th>
                                    <th>申請者</th>
                                    <th>タイトル</th>
                                    <th style="width: 100px;">金額</th>
                                    <th style="width: 80px;">緊急度</th>
                                    <th style="width: 100px;">ステータス</th>
                                    <th style="width: 150px;">申請日時</th>
                                    <th style="width: 180px;">操作</th>
                                </tr>
                            </thead>
                            <tbody id="adminApprovalListBody">
                                <tr>
                                    <td colspan="8" class="text-center text-muted">
                                        稟議を読み込んでいます...
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- 詳細モーダル -->
            <div class="modal fade" id="adminApprovalDetailModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">稟議詳細</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" id="adminApprovalDetailBody">
                            <!-- 動的に生成 -->
                        </div>
                        <div class="modal-footer" id="adminApprovalDetailFooter">
                            <!-- 動的に生成 -->
                        </div>
                    </div>
                </div>
            </div>

            <!-- 却下理由モーダル -->
            <div class="modal fade" id="rejectReasonModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">却下理由入力</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <input type="hidden" id="rejectApprovalId">
                            <div class="mb-3">
                                <label for="rejectionReason" class="form-label">却下理由 <span class="text-danger">*</span></label>
                                <textarea class="form-control" id="rejectionReason" rows="4" required></textarea>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">キャンセル</button>
                            <button type="button" class="btn btn-danger" id="confirmRejectBtn">
                                <i class="fas fa-times-circle"></i> 却下
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        // フィルター変更時
        const statusFilter = document.getElementById('adminStatusFilter');
        if (statusFilter) {
            statusFilter.addEventListener('change', () => this.loadApprovalList());
        }

        // 更新ボタン
        const refreshBtn = document.getElementById('refreshApprovalList');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadApprovalList());
        }

        // 却下確定ボタン
        const confirmRejectBtn = document.getElementById('confirmRejectBtn');
        if (confirmRejectBtn) {
            confirmRejectBtn.addEventListener('click', () => this.confirmReject());
        }

        // テーブルボタンのイベント委譲
        document.addEventListener('click', (e) => {
            // 詳細ボタン
            if (e.target.closest('.btn-show-admin-approval-detail')) {
                const btn = e.target.closest('.btn-show-admin-approval-detail');
                const id = parseInt(btn.dataset.id);
                this.viewDetail(id);
            }

            // 承認ボタン
            if (e.target.closest('.btn-approve-approval')) {
                const btn = e.target.closest('.btn-approve-approval');
                const id = parseInt(btn.dataset.id);
                this.approveApproval(id);
            }

            // 却下ボタン
            if (e.target.closest('.btn-reject-approval')) {
                const btn = e.target.closest('.btn-reject-approval');
                const id = parseInt(btn.dataset.id);
                this.showRejectModal(id);
            }

            // 完了ボタン
            if (e.target.closest('.btn-complete-approval')) {
                const btn = e.target.closest('.btn-complete-approval');
                const id = parseInt(btn.dataset.id);
                this.completeApproval(id);
            }

            // 削除ボタン
            if (e.target.closest('.btn-delete-admin-approval')) {
                const btn = e.target.closest('.btn-delete-admin-approval');
                const id = parseInt(btn.dataset.id);
                this.deleteApproval(id);
            }
        });
    }

    async loadApprovalList() {
        const statusFilter = document.getElementById('adminStatusFilter').value;
        const tbody = document.getElementById('adminApprovalListBody');

        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-muted">
                    <div class="spinner-border spinner-border-sm me-2"></div>
                    読み込み中...
                </td>
            </tr>
        `;

        try {
            const params = new URLSearchParams();
            if (statusFilter) {
                params.append('status', statusFilter);
            }

            const response = await this.parentModule.callApi(`/api/staff/approval/list?${params}`);

            if (response.success) {
                this.approvals = response.approvals;
                this.renderApprovalList();
            } else {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="8" class="text-center text-danger">
                            稟議一覧の取得に失敗しました
                        </td>
                    </tr>
                `;
            }
        } catch (error) {
            console.error('稟議一覧取得エラー:', error);
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center text-danger">
                        稟議一覧の取得に失敗しました
                    </td>
                </tr>
            `;
        }
    }

    renderApprovalList() {
        const tbody = document.getElementById('adminApprovalListBody');

        if (this.approvals.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center text-muted">
                        稟議がありません
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.approvals.map(approval => `
            <tr class="${approval.urgency === 'urgent' ? 'table-warning' : ''}">
                <td>${approval.id}</td>
                <td>${this.escapeHtml(approval.staff_name)}</td>
                <td>${this.escapeHtml(approval.title)}</td>
                <td>${approval.amount ? approval.amount.toLocaleString() + '円' : '-'}</td>
                <td>${this.getUrgencyBadge(approval.urgency)}</td>
                <td>${this.getStatusBadge(approval.status)}</td>
                <td>${this.formatDateTime(approval.submitted_at || approval.created_at)}</td>
                <td>
                    <button class="btn btn-sm btn-info mb-1 btn-show-admin-approval-detail" data-id="${approval.id}">
                        <i class="fas fa-eye"></i> 詳細
                    </button>
                    ${approval.status === 'pending' ? `
                        <button class="btn btn-sm btn-success mb-1 btn-approve-approval" data-id="${approval.id}">
                            <i class="fas fa-check-circle"></i> 承認
                        </button>
                        <button class="btn btn-sm btn-danger mb-1 btn-reject-approval" data-id="${approval.id}">
                            <i class="fas fa-times-circle"></i> 却下
                        </button>
                    ` : ''}
                    ${approval.status === 'approved' ? `
                        <button class="btn btn-sm btn-primary mb-1 btn-complete-approval" data-id="${approval.id}">
                            <i class="fas fa-check"></i> 完了
                        </button>
                    ` : ''}
                    <button class="btn btn-sm btn-outline-danger mb-1 btn-delete-admin-approval" data-id="${approval.id}">
                        <i class="fas fa-trash"></i> 削除
                    </button>
                </td>
            </tr>
        `).join('');
    }

    async viewDetail(id) {
        try {
            const response = await this.parentModule.callApi(`/api/staff/approval/${id}`);

            if (response.success) {
                this.showDetailModal(response.approval);
            } else {
                this.parentModule.showNotification(response.error || '詳細の取得に失敗しました', 'danger');
            }
        } catch (error) {
            console.error('詳細取得エラー:', error);
            this.parentModule.showNotification('詳細の取得に失敗しました', 'danger');
        }
    }

    showDetailModal(approval) {
        const modalBody = document.getElementById('adminApprovalDetailBody');
        const modalFooter = document.getElementById('adminApprovalDetailFooter');

        modalBody.innerHTML = `
            <table class="table table-bordered">
                <tr>
                    <th style="width: 150px;">タイトル</th>
                    <td>${this.escapeHtml(approval.title)}</td>
                </tr>
                <tr>
                    <th>内容・目的</th>
                    <td style="white-space: pre-wrap;">${this.escapeHtml(approval.content)}</td>
                </tr>
                <tr>
                    <th>金額</th>
                    <td>${approval.amount ? approval.amount.toLocaleString() + '円' : '-'}</td>
                </tr>
                <tr>
                    <th>緊急度</th>
                    <td>${this.getUrgencyBadge(approval.urgency)}</td>
                </tr>
                <tr>
                    <th>ステータス</th>
                    <td>${this.getStatusBadge(approval.status)}</td>
                </tr>
                <tr>
                    <th>申請者</th>
                    <td>${this.escapeHtml(approval.staff_name)}</td>
                </tr>
                ${approval.admin_name ? `
                    <tr>
                        <th>承認者</th>
                        <td>${this.escapeHtml(approval.admin_name)}</td>
                    </tr>
                ` : ''}
                ${approval.rejection_reason ? `
                    <tr>
                        <th>却下理由</th>
                        <td class="text-danger">${this.escapeHtml(approval.rejection_reason)}</td>
                    </tr>
                ` : ''}
                <tr>
                    <th>作成日時</th>
                    <td>${this.formatDateTime(approval.created_at)}</td>
                </tr>
                ${approval.submitted_at ? `
                    <tr>
                        <th>申請日時</th>
                        <td>${this.formatDateTime(approval.submitted_at)}</td>
                    </tr>
                ` : ''}
                ${approval.reviewed_at ? `
                    <tr>
                        <th>承認/却下日時</th>
                        <td>${this.formatDateTime(approval.reviewed_at)}</td>
                    </tr>
                ` : ''}
            </table>
        `;

        // フッターボタンを動的に生成
        let footerButtons = `<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">閉じる</button>`;

        if (approval.status === 'pending') {
            footerButtons = `
                <button type="button" class="btn btn-success" onclick="window.adminApproval.approveApproval(${approval.id})">
                    <i class="fas fa-check-circle"></i> 承認
                </button>
                <button type="button" class="btn btn-danger" onclick="window.adminApproval.showRejectModal(${approval.id})">
                    <i class="fas fa-times-circle"></i> 却下
                </button>
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">閉じる</button>
            `;
        } else if (approval.status === 'approved') {
            footerButtons = `
                <button type="button" class="btn btn-primary" onclick="window.adminApproval.completeApproval(${approval.id})">
                    <i class="fas fa-check"></i> 完了
                </button>
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">閉じる</button>
            `;
        }

        modalFooter.innerHTML = footerButtons;

        const modal = new bootstrap.Modal(document.getElementById('adminApprovalDetailModal'));
        modal.show();
    }

    async approveApproval(id) {
        if (!confirm('この稟議を承認しますか？')) {
            return;
        }

        try {
            const response = await this.parentModule.callApi(`/api/admin/approval/approve/${id}`, {
                method: 'POST'
            });

            if (response.success) {
                this.parentModule.showNotification(response.message, 'success');

                // モーダルを閉じる
                const modal = bootstrap.Modal.getInstance(document.getElementById('adminApprovalDetailModal'));
                if (modal) {
                    modal.hide();
                }

                // リストを再読み込み
                this.loadApprovalList();
            } else {
                this.parentModule.showNotification(response.error || '承認に失敗しました', 'danger');
            }
        } catch (error) {
            console.error('承認エラー:', error);
            this.parentModule.showNotification('承認に失敗しました', 'danger');
        }
    }

    showRejectModal(id) {
        // 詳細モーダルを閉じる
        const detailModal = bootstrap.Modal.getInstance(document.getElementById('adminApprovalDetailModal'));
        if (detailModal) {
            detailModal.hide();
        }

        // 却下理由モーダルを表示
        document.getElementById('rejectApprovalId').value = id;
        document.getElementById('rejectionReason').value = '';

        const modal = new bootstrap.Modal(document.getElementById('rejectReasonModal'));
        modal.show();
    }

    async confirmReject() {
        const id = document.getElementById('rejectApprovalId').value;
        const reason = document.getElementById('rejectionReason').value;

        if (!reason || reason.trim() === '') {
            this.parentModule.showNotification('却下理由を入力してください', 'warning');
            return;
        }

        try {
            const response = await this.parentModule.callApi(`/api/admin/approval/reject/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: reason.trim() })
            });

            if (response.success) {
                this.parentModule.showNotification(response.message, 'success');

                // モーダルを閉じる
                const modal = bootstrap.Modal.getInstance(document.getElementById('rejectReasonModal'));
                if (modal) {
                    modal.hide();
                }

                // リストを再読み込み
                this.loadApprovalList();
            } else {
                this.parentModule.showNotification(response.error || '却下に失敗しました', 'danger');
            }
        } catch (error) {
            console.error('却下エラー:', error);
            this.parentModule.showNotification('却下に失敗しました', 'danger');
        }
    }

    async completeApproval(id) {
        if (!confirm('この稟議を完了しますか？')) {
            return;
        }

        try {
            const response = await this.parentModule.callApi(`/api/admin/approval/complete/${id}`, {
                method: 'POST'
            });

            if (response.success) {
                this.parentModule.showNotification(response.message, 'success');

                // モーダルを閉じる
                const modal = bootstrap.Modal.getInstance(document.getElementById('adminApprovalDetailModal'));
                if (modal) {
                    modal.hide();
                }

                // リストを再読み込み
                this.loadApprovalList();
            } else {
                this.parentModule.showNotification(response.error || '完了処理に失敗しました', 'danger');
            }
        } catch (error) {
            console.error('完了エラー:', error);
            this.parentModule.showNotification('完了処理に失敗しました', 'danger');
        }
    }

    async deleteApproval(id) {
        if (!confirm('この稟議を削除してもよろしいですか？')) {
            return;
        }

        try {
            const response = await this.parentModule.callApi(`/api/staff/approval/${id}`, {
                method: 'DELETE'
            });

            if (response.success) {
                this.parentModule.showNotification(response.message, 'success');
                this.loadApprovalList();
            } else {
                this.parentModule.showNotification(response.error || '削除に失敗しました', 'danger');
            }
        } catch (error) {
            console.error('削除エラー:', error);
            this.parentModule.showNotification('削除に失敗しました', 'danger');
        }
    }

    getStatusBadge(status) {
        const statusMap = {
            'draft': '<span class="badge bg-secondary">下書き</span>',
            'pending': '<span class="badge bg-warning text-dark">申請中</span>',
            'approved': '<span class="badge bg-success">承認済み</span>',
            'rejected': '<span class="badge bg-danger">却下</span>',
            'completed': '<span class="badge bg-primary">完了</span>'
        };
        return statusMap[status] || status;
    }

    getUrgencyBadge(urgency) {
        const urgencyMap = {
            'normal': '<span class="badge bg-info">通常</span>',
            'urgent': '<span class="badge bg-danger">至急</span>'
        };
        return urgencyMap[urgency] || urgency;
    }

    formatDateTime(dateTimeStr) {
        if (!dateTimeStr) return '-';
        const date = new Date(dateTimeStr);
        return date.toLocaleString('ja-JP');
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async show() {
        const section = document.getElementById('approvalManagementSection');
        if (section) {
            section.style.display = 'block';
        }
        await this.loadApprovalList();
    }

    hide() {
        const section = document.getElementById('approvalManagementSection');
        if (section) {
            section.style.display = 'none';
        }
    }

    destroy() {
        const section = document.getElementById('approvalManagementSection');
        if (section) {
            section.remove();
        }
    }
}
