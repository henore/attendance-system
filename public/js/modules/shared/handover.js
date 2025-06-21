// modules/shared/handover.js
// 共通の申し送り機能

export default class SharedHandover {
    constructor(app, parentModule) {
        this.app = app;
        this.parent = parentModule;
        this.container = null;
        this.currentContent = '';
        this.lastUpdateInfo = null;
    }

    async init(containerElement) {
        this.container = document.createElement('div');
        this.container.id = 'handoverSection';
        this.container.className = 'admin-section';
        this.container.style.display = 'none';
        
        containerElement.appendChild(this.container);
        this.render();
        this.setupEventListeners();
    }

    // render メソッドを修正
render() {
    this.container.innerHTML = `
        <div class="custom-card">
            <div class="custom-card-header">
                <h5><i class="fas fa-exchange-alt"></i> 申し送り事項</h5>
                <div class="btn-group">
                    <button class="btn btn-outline-light btn-sm" id="refreshHandoverBtn">
                        <i class="fas fa-sync"></i> 更新
                    </button>
                    <button class="btn btn-outline-danger btn-sm" id="deleteHandoverBtn">
                        <i class="fas fa-trash"></i> 削除
                    </button>
                </div>
            </div>
            <div class="card-body">
                <div class="mb-3">
                    <label for="handoverContent" class="form-label">
                        <i class="fas fa-info-circle"></i> 申し送り事項
                    </label>
                    <textarea class="form-control" id="handoverContent" rows="12" 
                              placeholder="申し送り事項を入力してください..."></textarea>
                </div>
                <div class="d-flex justify-content-between align-items-center">
                    <small class="text-muted" id="handoverUpdateInfo">
                        <i class="fas fa-clock"></i> 最終更新: 未設定
                    </small>
                    <button class="btn btn-primary" id="updateHandoverBtn">
                        <i class="fas fa-save"></i> 申し送り更新
                    </button>
                </div>
            </div>
        </div>
    `;
}

// setupEventListeners メソッドを修正
setupEventListeners() {
    const updateBtn = this.container.querySelector('#updateHandoverBtn');
    const refreshBtn = this.container.querySelector('#refreshHandoverBtn');
    const deleteBtn = this.container.querySelector('#deleteHandoverBtn');
    
    if (updateBtn) {
        updateBtn.addEventListener('click', () => this.updateHandover());
    }
    
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => this.refreshHandover());
    }
    
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => this.deleteHandover());
    }
}

    async show() {
        this.container.style.display = 'block';
        await this.loadData();
    }

    hide() {
        this.container.style.display = 'none';
    }

    async refresh() {
        await this.loadData();
        this.app.showNotification('申し送り事項を更新しました', 'info');
    }

    async loadData() {
    try {
        const response = await this.app.apiCall('/api/handover', {
            method: 'GET'
        });
        
        if (response && response.success) {
            const handoverData = response.handover || {};
            this.currentContent = handoverData.content || '';
            this.lastUpdateInfo = {
                updatedAt: handoverData.created_at,
                updatedBy: handoverData.updated_by
            };
            
            this.updateUI();
        }
    } catch (error) {
        console.error('申し送り事項読み込みエラー:', error);
        this.parent.showNotification('申し送り事項の読み込みに失敗しました', 'danger');
    }
   }

    updateUI() {
        const textarea = this.container.querySelector('#handoverContent');
        const updateInfo = this.container.querySelector('#handoverUpdateInfo');
        
        if (textarea) {
            textarea.value = this.currentContent;
        }
        
        if (updateInfo) {
            updateInfo.innerHTML = this.getUpdateInfoHTML();
        }
    }

    getUpdateInfoHTML() {
    if (!this.lastUpdateInfo || !this.lastUpdateInfo.updatedAt) {
        return '<i class="fas fa-clock"></i> 最終更新: 未設定';
    }
    
    const updateDate = new Date(this.lastUpdateInfo.updatedAt).toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    return `<i class="fas fa-clock"></i> 最終更新: ${updateDate}`;
    }
    
    // 削除メソッドを追加
    async deleteHandover() {
        if (!confirm('申し送り事項を削除しますか？')) {
            return;
        }
        
        try {
            const response = await this.app.apiCall('/api/handover', {
                method: 'DELETE'
            });
            
            if (response && response.success) {
                await this.loadData();
                this.parent.showNotification('申し送り事項を削除しました', 'success');
            }
        } catch (error) {
            console.error('申し送り削除エラー:', error);
            this.parent.showNotification(error.message || '申し送り事項の削除に失敗しました', 'danger');
        }
    }
    // updateHandover メソッドを修正
    async updateHandover() {
        const textarea = this.container.querySelector('#handoverContent');
        const content = textarea ? textarea.value.trim() : '';
        
        if (!content) {
            this.parent.showNotification('申し送り事項を入力してください', 'warning');
            return;
        }
        
        try {
            const response = await this.app.apiCall('/api/handover', {
                method: 'POST',
                body: JSON.stringify({ content })
            });
            
            if (response && response.success) {
                await this.loadData();
                this.parent.showNotification('申し送り事項を更新しました', 'success');
            }
        } catch (error) {
            console.error('申し送り更新エラー:', error);
            if (error.message && error.message.includes('5分')) {
                this.parent.showNotification(error.message, 'warning');
            } else {
                this.parent.showNotification('申し送り事項の更新に失敗しました', 'danger');
            }
        }
    }

    async refreshHandover() {
        await this.loadData();
        this.app.showNotification('申し送り事項を更新しました', 'info');
    }

    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}