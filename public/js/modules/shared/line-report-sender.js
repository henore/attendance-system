// public/js/modules/shared/line-report-sender.js
// 日報完了時のLINE送信機能（リファクタ版）

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';

export class LineReportSender {
  constructor(app) {
    this.app = app;
    this.isEnabled = true;
    this.init();
  }

  async init() {
    // LINE機能の有効性を確認
    try {
      const statusResponse = await this.app.apiCall(API_ENDPOINTS.LINE.STATUS);
      this.isEnabled = statusResponse.enabled;
      console.log('[LINE送信] 初期化完了 - 機能有効:', this.isEnabled);
    } catch (error) {
      console.warn('[LINE送信] 初期化エラー:', error);
      this.isEnabled = false;
    }
  }

  /**
   * 日報完了時の自動送信
   * @param {Object} reportData - 日報データ
   * @param {Object} userData - ユーザーデータ
   * @param {Object} commentData - スタッフコメントデータ
   */
  async sendReportCompletion(reportData, userData, commentData) {
    if (!this.isEnabled) {
      console.log('[LINE送信] 機能が無効です');
      return;
    }

    try {
      console.log('[LINE送信] 開始:', {
        userName: userData.name,
        date: reportData.date,
        hasComment: !!commentData?.comment
      });

      // サーバーサイドで画像生成とLINE送信を実行
      const response = await this.sendToLineServer(reportData, userData, commentData);
      
      if (response.success) {
        console.log('[LINE送信] 完了');
        this.app.showNotification('日報をLINEに送信しました', 'success');
      } else {
        throw new Error(response.message || 'LINE送信に失敗しました');
      }

    } catch (error) {
      console.error('[LINE送信] エラー:', error);
      this.app.showNotification('LINE送信に失敗しました: ' + error.message, 'danger');
    }
  }

 /**
   * サーバーサイドでの画像生成とLINE送信
   */
  async sendToLineServer(reportData, userData, commentData) {
  try {
    // データの検証とログ出力
    console.log('[LINE送信] データ確認:', {
      hasReportData: !!reportData,
      hasUserData: !!userData,
      hasCommentData: !!commentData,
      userName: userData?.name,
      date: reportData?.date
    });
    
    // 1. まず画像を生成
    const imageResponse = await this.app.apiCall(API_ENDPOINTS.LINE.GENERATE_IMAGE, {
      method: 'POST',
      body: JSON.stringify({
        reportData: reportData || {},
        userData: userData || {},
        commentData: commentData || null,
        date: reportData?.date || new Date().toISOString().split('T')[0]
      })
    });
    
    if (!imageResponse.success) {
      // 画像生成エラーの詳細化
      const errorMsg = imageResponse.message || '画像生成に失敗しました';
      const link = document.createElement('a');
      link.href = imageResponse.imageUrl;
      link.download = 'daylyreport.jpg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (errorMsg.includes('Puppeteer')) {
        throw new Error('画像生成エンジンエラー: ブラウザの起動に失敗しました');
      } else if (errorMsg.includes('sharp')) {
        throw new Error('画像処理エラー: 画像の変換に失敗しました');
      } else if (errorMsg.includes('必須データ')) {
        throw new Error('データエラー: 必要な情報が不足しています');
      } else {
        throw new Error(`画像生成エラー: ${errorMsg}`);
      }
    }
//    
    // 2. LINEに送信
    const sendResponse = await this.app.apiCall(API_ENDPOINTS.LINE.SEND_REPORT, {
      method: 'POST',
      body: JSON.stringify({
        imageId: imageResponse.imageId,
        userName: userData?.name || '利用者',
        date: reportData?.date || new Date().toISOString().split('T')[0]
      })
    });
    
    return sendResponse;
    
  } catch (error) {
    console.error('[サーバー送信] エラー詳細:', {
      message: error.message,
      response: error.response,
      stack: error.stack
    });
    
    // ユーザーフレンドリーなエラーメッセージ
    if (error.message.includes('画像')) {
      this.app.showNotification(
        '画像の生成に失敗しました。システム管理者にお問い合わせください。', 
        'danger'
      );
    } else if (error.message.includes('LINE')) {
      this.app.showNotification(
        'LINEへの送信に失敗しました。しばらく待ってから再度お試しください。', 
        'danger'
      );
    }
    
    throw error;
  }
}

  /**
   * テスト送信
   */
  async sendTestMessage() {
    if (!this.isEnabled) {
      this.app.showNotification('LINE機能が無効です', 'warning');
      return;
    }

    try {
      const response = await this.app.apiCall(API_ENDPOINTS.LINE.TEST_SEND, {
        method: 'POST'
      });
      
      if (response.success) {
        this.app.showNotification('テストメッセージを送信しました', 'success');
      } else {
        throw new Error(response.message);
      }
    } catch (error) {
      console.error('[テスト送信] エラー:', error);
      this.app.showNotification('テスト送信に失敗しました: ' + error.message, 'danger');
    }
  }

  /**
   * LINE機能の状態確認
   */
  async getStatus() {
    try {
      const response = await this.app.apiCall(API_ENDPOINTS.LINE.STATUS);
      return response;
    } catch (error) {
      console.error('[状態確認] エラー:', error);
      return { enabled: false, error: error.message };
    }
  }

  /**
   * クリーンアップ
   */
  destroy() {
    console.log('[LINE送信] クリーンアップ完了');
  }
}