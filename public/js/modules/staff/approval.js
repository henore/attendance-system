// modules/staff/approval.js
// スタッフ用稟議申請モジュール

export default class StaffApproval {
    constructor(app, parentModule) {
        this.app = app;
        this.parentModule = parentModule;
        this.currentApproval = null; // 編集中の稟議
        this.approvals = []; // 稟議一覧
    }

    async init(container) {
        const section = document.createElement('div');
        section.id = 'approvalSection';
        section.className = 'staff-section mb-4';
        section.style.display = 'none';
        container.appendChild(section);

        this.render();
    }

    render() {
        const section = document.getElementById('approvalSection');
        if (!section) return;

        section.innerHTML = `
            <div class="custom-card">
                <div class="custom-card-header">
                    <h5><i class="fas fa-file-signature"></i> 稟議申請</h5>
                </div>
                <div class="card-body">
                    <!-- タブナビゲーション -->
                    <ul class="nav nav-tabs mb-3" role="tablist">
                        <li class="nav-item" role="presentation">
                            <button class="nav-link active" id="approval-form-tab" data-bs-toggle="tab"
                                data-bs-target="#approval-form-pane" type="button" role="tab">
                                <i class="fas fa-edit"></i> 新規申請
                            </button>
                        </li>
                        <li class="nav-item" role="presentation">
                            <button class="nav-link" id="approval-list-tab" data-bs-toggle="tab"
                                data-bs-target="#approval-list-pane" type="button" role="tab">
                                <i class="fas fa-list"></i> 申請一覧
                            </button>
                        </li>
                    </ul>

                    <!-- タブコンテンツ -->
                    <div class="tab-content">
                        <!-- 新規申請フォーム -->
                        <div class="tab-pane fade show active" id="approval-form-pane" role="tabpanel">
                            <form id="approvalForm">
                                <input type="hidden" id="approvalId">

                                <div class="mb-3">
                                    <label for="approvalTitle" class="form-label">タイトル <span class="text-danger">*</span></label>
                                    <input type="text" class="form-control" id="approvalTitle" required>
                                </div>

                                <div class="mb-3">
                                    <label for="approvalContent" class="form-label">内容・目的 <span class="text-danger">*</span></label>
                                    <textarea class="form-control" id="approvalContent" rows="5" required></textarea>
                                </div>

                                <div class="row">
                                    <div class="col-md-6 mb-3">
                                        <label for="approvalAmount" class="form-label">金額（任意）</label>
                                        <div class="input-group">
                                            <input type="number" class="form-control" id="approvalAmount" step="1" min="0">
                                            <span class="input-group-text">円</span>
                                        </div>
                                    </div>

                                    <div class="col-md-6 mb-3">
                                        <label for="approvalUrgency" class="form-label">緊急度 <span class="text-danger">*</span></label>
                                        <select class="form-select" id="approvalUrgency" required>
                                            <option value="normal">通常</option>
                                            <option value="urgent">至急</option>
                                        </select>
                                    </div>
                                </div>

                                <div class="mb-3">
                                    <label for="approvalAttachment" class="form-label">添付ファイル（任意）</label>
                                    <input type="file" class="form-control" id="approvalAttachment">
                                    <small class="text-muted">※添付ファイル機能は後ほど実装されます</small>
                                </div>

                                <div class="d-flex gap-2">
                                    <button type="button" class="btn btn-secondary" id="saveDraftBtn">
                                        <i class="fas fa-save"></i> 下書き保存
                                    </button>
                                    <button type="submit" class="btn btn-primary">
                                        <i class="fas fa-paper-plane"></i> 申請
                                    </button>
                                    <button type="button" class="btn btn-outline-secondary" id="resetFormBtn">
                                        <i class="fas fa-redo"></i> リセット
                                    </button>
                                </div>
                            </form>
                        </div>

                        <!-- 申請一覧 -->
                        <div class="tab-pane fade" id="approval-list-pane" role="tabpanel">
                            <!-- フィルター -->
                            <div class="mb-3">
                                <label for="statusFilter" class="form-label">ステータス</label>
                                <select class="form-select" id="statusFilter">
                                    <option value="">すべて</option>
                                    <option value="draft">下書き</option>
                                    <option value="pending">申請中</option>
                                    <option value="approved">承認済み</option>
                                    <option value="rejected">却下</option>
                                    <option value="completed">完了</option>
                                </select>
                            </div>

                            <!-- 稟議一覧テーブル -->
                            <div class="table-responsive">
                                <table class="table table-hover">
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>タイトル</th>
                                            <th>金額</th>
                                            <th>緊急度</th>
                                            <th>ステータス</th>
                                            <th>申請日時</th>
                                            <th>操作</th>
                                        </tr>
                                    </thead>
                                    <tbody id="approvalListBody">
                                        <tr>
                                            <td colspan="7" class="text-center text-muted">
                                                稟議を読み込んでいます...
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 詳細モーダル -->
            <div class="modal fade" id="approvalDetailModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">稟議詳細</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" id="approvalDetailBody">
                            <!-- 動的に生成 -->
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">閉じる</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        // フォーム送信（申請）
        const form = document.getElementById('approvalForm');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleSubmit();
            });
        }

        // 下書き保存
        const saveDraftBtn = document.getElementById('saveDraftBtn');
        if (saveDraftBtn) {
            saveDraftBtn.addEventListener('click', () => this.handleSaveDraft());
        }

        // フォームリセット
        const resetFormBtn = document.getElementById('resetFormBtn');
        if (resetFormBtn) {
            resetFormBtn.addEventListener('click', () => this.resetForm());
        }

        // ステータスフィルター
        const statusFilter = document.getElementById('statusFilter');
        if (statusFilter) {
            statusFilter.addEventListener('change', () => this.loadApprovalList());
        }

        // タブ切り替え時
        const listTab = document.getElementById('approval-list-tab');
        if (listTab) {
            listTab.addEventListener('shown.bs.tab', () => this.loadApprovalList());
        }
    }

    async handleSaveDraft() {
        const data = this.getFormData();

        if (!data.title || !data.content) {
            this.parentModule.showNotification('タイトルと内容は必須です', 'warning');
            return;
        }

        try {
            const response = await this.parentModule.callApi('/api/staff/approval/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.success) {
                this.parentModule.showNotification(response.message, 'success');
                document.getElementById('approvalId').value = response.id;
            } else {
                this.parentModule.showNotification(response.error || '保存に失敗しました', 'danger');
            }
        } catch (error) {
            console.error('下書き保存エラー:', error);
            this.parentModule.showNotification('下書き保存に失敗しました', 'danger');
        }
    }

    async handleSubmit() {
        const data = this.getFormData();

        try {
            // まず保存
            const saveResponse = await this.parentModule.callApi('/api/staff/approval/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (!saveResponse.success) {
                this.parentModule.showNotification(saveResponse.error || '保存に失敗しました', 'danger');
                return;
            }

            const approvalId = data.id || saveResponse.id;

            // 次に申請
            const submitResponse = await this.parentModule.callApi(`/api/staff/approval/submit/${approvalId}`, {
                method: 'POST'
            });

            if (submitResponse.success) {
                this.parentModule.showNotification(submitResponse.message, 'success');
                this.resetForm();

                // 申請一覧タブに切り替え
                const listTab = document.getElementById('approval-list-tab');
                if (listTab) {
                    new bootstrap.Tab(listTab).show();
                }
            } else {
                this.parentModule.showNotification(submitResponse.error || '申請に失敗しました', 'danger');
            }
        } catch (error) {
            console.error('申請エラー:', error);
            this.parentModule.showNotification('申請に失敗しました', 'danger');
        }
    }

    getFormData() {
        return {
            id: document.getElementById('approvalId').value || null,
            title: document.getElementById('approvalTitle').value,
            content: document.getElementById('approvalContent').value,
            amount: document.getElementById('approvalAmount').value || null,
            urgency: document.getElementById('approvalUrgency').value
        };
    }

    resetForm() {
        document.getElementById('approvalForm').reset();
        document.getElementById('approvalId').value = '';
        this.currentApproval = null;
    }

    async loadApprovalList() {
        const statusFilter = document.getElementById('statusFilter').value;
        const tbody = document.getElementById('approvalListBody');

        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted">
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
                        <td colspan="7" class="text-center text-danger">
                            稟議一覧の取得に失敗しました
                        </td>
                    </tr>
                `;
            }
        } catch (error) {
            console.error('稟議一覧取得エラー:', error);
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-danger">
                        稟議一覧の取得に失敗しました
                    </td>
                </tr>
            `;
        }
    }

    renderApprovalList() {
        const tbody = document.getElementById('approvalListBody');

        if (this.approvals.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-muted">
                        稟議がありません
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.approvals.map(approval => `
            <tr>
                <td>${approval.id}</td>
                <td>${this.escapeHtml(approval.title)}</td>
                <td>${approval.amount ? approval.amount.toLocaleString() + '円' : '-'}</td>
                <td>${this.getUrgencyBadge(approval.urgency)}</td>
                <td>${this.getStatusBadge(approval.status)}</td>
                <td>${this.formatDateTime(approval.submitted_at || approval.created_at)}</td>
                <td>
                    <button class="btn btn-sm btn-info" onclick="window.staffApproval.viewDetail(${approval.id})">
                        <i class="fas fa-eye"></i> 詳細
                    </button>
                    ${approval.status === 'draft' ? `
                        <button class="btn btn-sm btn-primary" onclick="window.staffApproval.editApproval(${approval.id})">
                            <i class="fas fa-edit"></i> 編集
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="window.staffApproval.deleteApproval(${approval.id})">
                            <i class="fas fa-trash"></i> 削除
                        </button>
                    ` : ''}
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
        const modalBody = document.getElementById('approvalDetailBody');

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

        const modal = new bootstrap.Modal(document.getElementById('approvalDetailModal'));
        modal.show();
    }

    async editApproval(id) {
        try {
            const response = await this.parentModule.callApi(`/api/staff/approval/${id}`);

            if (response.success) {
                const approval = response.approval;

                // フォームに値をセット
                document.getElementById('approvalId').value = approval.id;
                document.getElementById('approvalTitle').value = approval.title;
                document.getElementById('approvalContent').value = approval.content;
                document.getElementById('approvalAmount').value = approval.amount || '';
                document.getElementById('approvalUrgency').value = approval.urgency;

                // 新規申請タブに切り替え
                const formTab = document.getElementById('approval-form-tab');
                if (formTab) {
                    new bootstrap.Tab(formTab).show();
                }

                this.parentModule.showNotification('編集モードに切り替えました', 'info');
            } else {
                this.parentModule.showNotification(response.error || '取得に失敗しました', 'danger');
            }
        } catch (error) {
            console.error('編集用データ取得エラー:', error);
            this.parentModule.showNotification('データの取得に失敗しました', 'danger');
        }
    }

    async deleteApproval(id) {
        if (!confirm('この下書きを削除してもよろしいですか？')) {
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
        const section = document.getElementById('approvalSection');
        if (section) {
            section.style.display = 'block';
        }
    }

    hide() {
        const section = document.getElementById('approvalSection');
        if (section) {
            section.style.display = 'none';
        }
    }

    destroy() {
        // クリーンアップ処理
        const section = document.getElementById('approvalSection');
        if (section) {
            section.remove();
        }
    }
}
