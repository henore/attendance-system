// modules/staff/report-notification.js
// スタッフの日報提出通知機能ハンドラー

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { modalManager } from '../shared/modal-manager.js';

export class StaffReportNotification {
  constructor(apiCall, showNotification, switchToSection) {
    this.apiCall = apiCall;
    this.showNotification = showNotification;
    this.switchToSection = switchToSection;
    
    this.checkInterval = null;
    this.lastCheckedReports = new Set();
    this.pendingNotifications = [];
    this.notificationSound = null;
  }

  /**
   * 監視を開始
 
  startMonitoring() {
    // 5分ごとに新しい日報をチェック
    this.checkInterval = setInterval(() => {
      this.checkForNewReports();
    }, 5 * 60 * 1000); // 5分
    
    // 初回チェック
    this.checkForNewReports();
    
    console.log('📋 日報提出監視を開始しました（5分間隔）');
  }

  /**
   * 監視を停止

  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
  */
  /**
   * 新しい日報をチェック
   */
  async checkForNewReports() {
      try {
          const response = await this.apiCall(API_ENDPOINTS.STAFF.USERS);
          const currentReports = new Set();
          const newReports = [];
          const uncommentedReports = [];  // 追加
          
          response.users.forEach(user => {
              if (user.report_id) {
                  currentReports.add(user.report_id);
                  
                  // コメント未記入の日報をチェック
                  if (!user.comment_id) {
                      uncommentedReports.push({
                          userId: user.id,
                          userName: user.name,
                          reportId: user.report_id
                      });
                      
                      // 新規日報の場合
                      if (!this.lastCheckedReports.has(user.report_id)) {
                          newReports.push({
                              userId: user.id,
                              userName: user.name,
                              reportId: user.report_id
                          });
                      }
                  }
              }
          });
          
          // 新しい日報または未コメント日報がある場合は通知
          if (newReports.length > 0 || uncommentedReports.length > 0) {
              this.showReportNotification(newReports, uncommentedReports);
          }
          
          // チェック済みリストを更新
          this.lastCheckedReports = currentReports;
          
      } catch (error) {
          console.error('日報チェックエラー:', error);
      }
  }

  /**
   * 日報提出通知を表示
   */
  showReportNotification(newReports) {
    // 音声アラート
    this.playNotificationSound();
    
    // ブラウザ通知（許可されている場合）
    this.showBrowserNotification(newReports);
    
    // モーダル表示
    this.showNotificationModal(newReports);
    
    // 通知保存（コメント記入へ誘導用）
    this.pendingNotifications = newReports;
  }

  /**
   * 通知モーダルを表示
   */
  showNotificationModal(newReports) {
    let content = '<ul class="list-unstyled">';
    
    newReports.forEach(report => {
      content += `
        <li class="mb-2">
          <i class="fas fa-user"></i> 
          <strong>${report.userName}</strong>さんが日報を提出しました
        </li>
      `;
    });
    
    content += '</ul>';
    content += '<p class="text-warning mb-0"><i class="fas fa-exclamation-triangle"></i> コメントの記入をお願いします</p>';

    const modalId = modalManager.create({
      id: 'reportNotificationModal',
      title: '<i class="fas fa-bell"></i> 新しい日報が提出されました',
      content: content,
      size: 'modal-md',
      headerClass: 'bg-warning text-dark',
      saveButton: true,
      saveButtonText: 'コメントを記入',
      saveButtonClass: 'btn-primary',
      onSave: () => this.goToReportFromNotification()
    });

    modalManager.show(modalId);
  }

  /**
   * 通知音を再生
   */
  playNotificationSound() {
    try {
      // Base64エンコードされた短い通知音
      const soundData = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjiS2Oy9diMFl2+z9N17RwstdWNvuKrc7dVnhkklkqupfkdeUniFlJunqFpOkqOrqJpUTk0';
      
      if (!this.notificationSound) {
        this.notificationSound = new Audio(soundData);
        this.notificationSound.volume = 0.5;
      }
      
      this.notificationSound.play().catch(e => {
        console.warn('通知音の再生に失敗:', e);
      });
    } catch (error) {
      console.error('音声再生エラー:', error);
    }
  }

  /**
   * ブラウザ通知を表示
   */
  async showBrowserNotification(newReports) {
    // 通知権限をチェック
    if (!('Notification' in window)) {
      return;
    }

    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }

    if (Notification.permission === 'granted') {
      const title = '新しい日報が提出されました';
      const body = newReports.map(r => r.userName).join('、') + 'さんが日報を提出しました';
      
      new Notification(title, {
        body: body,
        icon: '/favicon.ico',
        tag: 'report-notification',
        requireInteraction: true
      });
    }
  }

  /**
   * 通知からダッシュボードへ遷移
   */
  goToReportFromNotification() {
    // モーダルを閉じる
    modalManager.hide('reportNotificationModal');
    
    // ダッシュボードに切り替え
    this.switchToSection('dashboardSection');
    
    // メニューボタンのアクティブ状態を更新
    document.querySelectorAll('.staff-menu-btn').forEach(b => b.classList.remove('active'));
    const dashboardBtn = document.querySelector('[data-target="dashboardSection"]');
    if (dashboardBtn) {
      dashboardBtn.classList.add('active');
    }
    
    // 通知をクリア
    this.pendingNotifications = [];
  }

  /**
   * 未確認の通知数を取得
   */
  getPendingNotificationCount() {
    return this.pendingNotifications.length;
  }

  /**
   * 通知バッジを更新
   */
  updateNotificationBadge() {
    const count = this.getPendingNotificationCount();
    const badge = document.getElementById('notificationBadge');
    
    if (badge) {
      if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  /**
   * 日報提出状況のサマリーを取得
   */
  async getReportSubmissionSummary() {
    try {
      const response = await this.apiCall(API_ENDPOINTS.STAFF.USERS);
      const users = response.users || [];
      
      const summary = {
        total: users.length,
        submitted: users.filter(u => u.report_id).length,
        notSubmitted: users.filter(u => u.clock_out && !u.report_id).length,
        commented: users.filter(u => u.report_id && u.comment_id).length,
        uncommented: users.filter(u => u.report_id && !u.comment_id).length
      };
      
      return summary;
    } catch (error) {
      console.error('日報提出状況サマリー取得エラー:', error);
      return null;
    }
  }

  /**
   * 通知設定を保存
   */
  saveNotificationSettings(settings) {
    const defaultSettings = {
      enabled: true,
      sound: true,
      browserNotification: true,
      checkInterval: 5 // 分
    };
    
    this.settings = { ...defaultSettings, ...settings };
    
    // 設定に基づいて監視間隔を更新
    if (this.settings.enabled) {
      this.stopMonitoring();
      this.checkInterval = setInterval(() => {
        this.checkForNewReports();
      }, this.settings.checkInterval * 60 * 1000);
    } else {
      this.stopMonitoring();
    }
  }

  /**
   * 通知履歴を取得
   */
  getNotificationHistory() {
    // 実装では、通知履歴をlocalStorageやメモリに保存
    return [];
  }

  /**
   * クリーンアップ
   */
  destroy() {
    this.stopMonitoring();
    this.lastCheckedReports.clear();
    this.pendingNotifications = [];
  }
}