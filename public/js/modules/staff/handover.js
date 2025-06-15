// modules/staff/handover.js
// スタッフの申し送り機能ハンドラー

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { MESSAGES } from '../../constants/labels.js';

export class StaffHandoverHandler {
  constructor(apiCall, showNotification) {
    this.apiCall = apiCall;
    this.showNotification = showNotification;
    this.currentContent = '';
    this.lastUpdateInfo = null;
  }

  /**
   * 申し送りセクションをレンダリング
   */
  render() {
    return `
      <div class="custom-card">
        <div class="custom-card-header">
          <h5><i class="fas fa-exchange-alt"></i> 申し送り事項</h5>
          <button class="btn btn-outline-light btn-sm" id="refreshHandoverBtn">
            <i class="fas fa-sync"></i> 更新
          </button>
        </div>
        <div class="card-body">
          <div class="mb-3">
            <label for="handoverContent" class="form-label">
              <i class="fas fa-info-circle"></i> 申し送り事項
            </label>
            <textarea class="form-control" id="handoverContent" rows="9" 
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

  /**
   * クイック申し送りセクションをレンダリング（出退勤画面用）
   */
  renderQuick() {
    return `
      <div class="custom-card">
        <div class="custom-card-header">
          <h6><i class="fas fa-exchange-alt"></i> 申し送り事項</h6>
          <button class="btn btn-outline-light btn-sm" id="quickRefreshHandoverBtn">
            <i class="fas fa-sync"></i> 更新
          </button>
        </div>
        <div class="card-body">
          <div class="mb-3">
            <textarea class="form-control" id="quickHandoverContent" rows="9" 
                      placeholder="申し送り事項を入力してください..."></textarea>
          </div>
          <div class="d-flex justify-content-between align-items-center">
            <small class="text-muted" id="quickHandoverUpdateInfo">
              <i class="fas fa-clock"></i> 最終更新: 未設定
            </small>
            <div>
              <button class="btn btn-outline-secondary btn-sm me-2" data-target="handoverSection" id="editHandoverDetailBtn">
                <i class="fas fa-edit"></i> 詳細編集
              </button>
              <button class="btn btn-primary btn-sm" id="quickUpdateHandoverBtn">
                <i class="fas fa-save"></i> 更新
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 初期化
   */
  init() {
    // 通常版のイベントリスナー
    const updateBtn = document.getElementById('updateHandoverBtn');
    const refreshBtn = document.getElementById('refreshHandoverBtn');
    
    if (updateBtn) {
      updateBtn.addEventListener('click', () => this.updateHandover());
    }
    
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refreshHandover());
    }
    
    // クイック版のイベントリスナー
    const quickUpdateBtn = document.getElementById('quickUpdateHandoverBtn');
    const quickRefreshBtn = document.getElementById('quickRefreshHandoverBtn');
    
    if (quickUpdateBtn) {
      quickUpdateBtn.addEventListener('click', () => this.updateHandoverQuick());
    }
    
    if (quickRefreshBtn) {
      quickRefreshBtn.addEventListener('click', () => this.refreshHandoverQuick());
    }
  }

  /**
   * 申し送りデータを読み込み
   */
  async loadData() {
    try {
      const response = await this.apiCall(API_ENDPOINTS.STAFF.HANDOVER);
      
      if (response.handover) {
        this.currentContent = response.handover.content || '';
        this.lastUpdateInfo = {
          updatedAt: response.handover.created_at,
          updatedBy: response.handover.updated_by
        };
        
        this.updateUI();
      }
    } catch (error) {
      console.error('申し送り事項読み込みエラー:', error);
    }
  }

  /**
   * UIを更新
   */
  updateUI() {
    // 通常版の更新
    const textarea = document.getElementById('handoverContent');
    const updateInfo = document.getElementById('handoverUpdateInfo');
    
    if (textarea) {
      textarea.value = this.currentContent;
    }
    
    if (updateInfo) {
      updateInfo.innerHTML = this.getUpdateInfoHTML();
    }
    
    // クイック版の更新
    const quickTextarea = document.getElementById('quickHandoverContent');
    const quickUpdateInfo = document.getElementById('quickHandoverUpdateInfo');
    
    if (quickTextarea) {
      quickTextarea.value = this.currentContent;
    }
    
    if (quickUpdateInfo) {
      quickUpdateInfo.innerHTML = this.getUpdateInfoHTML();
    }
  }

  /**
   * 更新情報HTMLを生成
   */
  getUpdateInfoHTML() {
    if (!this.lastUpdateInfo || !this.lastUpdateInfo.updatedAt) {
      return '<i class="fas fa-clock"></i> 最終更新: 未設定';
    }
    
    const updateDate = new Date(this.lastUpdateInfo.updatedAt).toLocaleString('ja-JP');
    const updatedBy = this.lastUpdateInfo.updatedBy || '';
    
    return `<i class="fas fa-clock"></i> 最終更新: ${updateDate}${updatedBy ? ` (${updatedBy})` : ''}`;
  }

  /**
   * 申し送り事項を更新
   */
  async updateHandover() {
    const textarea = document.getElementById('handoverContent');
    const content = textarea ? textarea.value.trim() : '';
    
    if (!content) {
      this.showNotification('申し送り事項を入力してください', 'warning');
      return;
    }
    
    await this.saveHandover(content);
  }

  /**
   * クイック申し送り事項を更新
   */
  async updateHandoverQuick() {
    const textarea = document.getElementById('quickHandoverContent');
    const content = textarea ? textarea.value.trim() : '';
    
    if (!content) {
      this.showNotification('申し送り事項を入力してください', 'warning');
      return;
    }
    
    await this.saveHandover(content);
  }

  /**
   * 申し送り事項を保存
   */
  async saveHandover(content) {
    try {
      await this.apiCall(API_ENDPOINTS.STAFF.HANDOVER, {
        method: 'POST',
        body: JSON.stringify({ content })
      });
      
      this.currentContent = content;
      await this.loadData(); // 最新の更新情報を取得
      this.showNotification('申し送り事項を更新しました', 'success');
      
    } catch (error) {
      console.error('申し送り更新エラー:', error);
      this.showNotification('申し送り事項の更新に失敗しました', 'danger');
    }
  }

  /**
   * 申し送り事項を更新
   */
  async refreshHandover() {
    await this.loadData();
    this.showNotification('申し送り事項を更新しました', 'info');
  }

  /**
   * クイック申し送り事項を更新
   */
  async refreshHandoverQuick() {
    await this.loadData();
    this.showNotification('申し送り事項を更新しました', 'info');
  }

  /**
   * 申し送り内容のサマリーを取得
   */
  getContentSummary() {
    if (!this.currentContent) return '';
    
    const maxLength = 100;
    if (this.currentContent.length <= maxLength) {
      return this.currentContent;
    }
    
    return this.currentContent.substring(0, maxLength) + '...';
  }

  /**
   * 申し送り内容の行数を取得
   */
  getContentLineCount() {
    if (!this.currentContent) return 0;
    return this.currentContent.split('\n').length;
  }

  /**
   * 申し送り内容をクリア
   */
  clearContent() {
    const textarea = document.getElementById('handoverContent');
    const quickTextarea = document.getElementById('quickHandoverContent');
    
    if (textarea) textarea.value = '';
    if (quickTextarea) quickTextarea.value = '';
    
    this.currentContent = '';
  }

  /**
   * 申し送り内容をエクスポート
   */
  exportContent() {
    const content = this.currentContent || '申し送り事項なし';
    const date = new Date().toLocaleDateString('ja-JP');
    const filename = `申し送り事項_${date.replace(/\//g, '-')}.txt`;
    
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    
    this.showNotification('申し送り事項をエクスポートしました', 'success');
  }
}