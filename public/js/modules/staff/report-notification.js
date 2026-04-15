// modules/staff/report-notification.js
// スタッフの日報提出通知機能（日本時間対応版）

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';
import { modalManager } from '../shared/modal-manager.js';
import { formatDateTime } from '../../utils/date-time.js';

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
   */
  startMonitoring() {
    // 5分ごとに新しい日報をチェック
    this.checkInterval = setInterval(() => {
      this.checkForNewReports();
    }, 5 * 60 * 1000); // 5分
    
    // 初回チェック
    this.checkForNewReports();
    
  }

  /**
   * 監視を停止
   */
  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
  
  /**
   * 新しい日報をチェック
   */
  async checkForNewReports() {
    try {
      const response = await this.apiCall(API_ENDPOINTS.STAFF.USERS);
      const currentReports = new Set();
      const newReports = [];
      const uncommentedReports = [];
      
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
                reportId: user.report_id,
                submittedAt: formatDateTime(new Date()) // 日本時間
              });
            }
          }
        }
      });
      
      // 新しい日報がある場合は通知
      if (newReports.length > 0) {
        this.showReportNotification(newReports);
      }
      
      // 通知バッジを更新（未コメント数で表示）
      this.updateNotificationBadge(uncommentedReports.length);
      
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
    this.pendingNotifications = [...this.pendingNotifications, ...newReports];
  }

  /**
   * 通知モーダルを表示
   */
  showNotificationModal(newReports) {
    let content = `
      <div class="alert alert-warning">
        <i class="fas fa-bell"></i> <strong>新しい日報が提出されました</strong>
      </div>
      <ul class="list-unstyled mb-3">
    `;
    
    newReports.forEach(report => {
      content += `
        <li class="mb-2">
          <i class="fas fa-user text-primary"></i> 
          <strong>${report.userName}</strong>さんが日報を提出しました
          <small class="text-muted d-block ms-4">
            <i class="fas fa-clock"></i> ${report.submittedAt}
          </small>
        </li>
      `;
    });
    
    content += `
      </ul>
      <p class="text-info mb-0">
        <i class="fas fa-comment"></i> 
        利用者出勤状況画面でコメントを記入してください
      </p>
    `;

    const modalId = modalManager.create({
      id: 'reportNotificationModal',
      title: '<i class="fas fa-bell"></i> 日報提出通知',
      content: content,
      size: 'modal-md',
      headerClass: 'bg-warning text-dark',
      saveButton: true,
      saveButtonText: 'コメント記入画面へ',
      saveButtonClass: 'btn-primary',
      onSave: () => this.goToAttendanceManagement()
    });

    modalManager.show(modalId);
  }

  /**
   * 通知音を再生
   */
  playNotificationSound() {
    try {
      // 簡単な通知音（ビープ音）
      if (!this.notificationSound) {
        // AudioContextを使用した簡単な通知音
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
      }
    } catch (error) {
      console.warn('通知音の再生に失敗:', error);
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
      
      const notification = new Notification(title, {
        body: body,
        icon: '/favicon.ico',
        tag: 'report-notification',
        requireInteraction: true,
        timestamp: Date.now()
      });

      // 通知クリック時の処理
      notification.onclick = () => {
        window.focus();
        this.goToAttendanceManagement();
        notification.close();
      };
    }
  }

  /**
   * 通知から利用者出勤状況画面へ遷移
   */
  goToAttendanceManagement() {
    // モーダルを閉じる
    modalManager.hide('reportNotificationModal');
    
    // 利用者出勤状況画面に切り替え
    this.switchToSection('attendanceManagementSection');
    
    // メニューボタンのアクティブ状態を更新
    document.querySelectorAll('.staff-menu-btn').forEach(b => b.classList.remove('active'));
    const attendanceBtn = document.querySelector('[data-target="attendanceManagementSection"]');
    if (attendanceBtn) {
      attendanceBtn.classList.add('active');
    }
    
    // 処理済み通知をクリア
    this.pendingNotifications = [];
    this.updateNotificationBadge(0);
  }

  /**
   * 通知バッジを更新
   */
  updateNotificationBadge(count = null) {
    const badge = document.getElementById('notificationBadge');
    
    if (count === null) {
      count = this.getPendingNotificationCount();
    }
    
    if (badge) {
      if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'inline-block';
        badge.className = 'notification-badge animate__animated animate__pulse';
      } else {
        badge.style.display = 'none';
        badge.className = 'notification-badge';
      }
    }
  }

  /**
   * 未確認の通知数を取得
   */
  getPendingNotificationCount() {
    return this.pendingNotifications.length;
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
        uncommented: users.filter(u => u.report_id && !u.comment_id).length,
        timestamp: formatDateTime(new Date()) // 日本時間
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
      this.startMonitoring();
    } else {
      this.stopMonitoring();
    }
  }

  /**
   * コメント記入完了時の処理
   */
  onCommentCompleted(userId) {
    // 該当する通知を削除
    this.pendingNotifications = this.pendingNotifications.filter(
      notification => notification.userId !== userId
    );
    
    // バッジを更新
    this.updateNotificationBadge();
  }

  /**
   * 通知履歴を取得（日本時間で保存）
   */
  getNotificationHistory() {
    return this.pendingNotifications.map(notification => ({
      ...notification,
      timestamp: formatDateTime(new Date())
    }));
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