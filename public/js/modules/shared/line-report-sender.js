// public/js/modules/shared/line-report-sender.js
// 日報完了時のLINE送信機能（リファクタ版）

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';

export class LineReportSender {
  constructor(app) {
    this.app = app;
  }
  
  /**
   * 日報完了時の自動送信
   * @param {Object} reportData - 日報データ
   * @param {Object} userData - ユーザーデータ
   * @param {Object} commentData - スタッフコメントデータ
   */
  async sendReportCompletion(reportData, userData, commentData) {
    try {
      console.log('[画像生成] 開始:', {
        reportData,
        userData,
        commentData,
        date: reportData?.date || new Date().toISOString().split('T')[0]
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
      
      console.log('[画像生成] レスポンス:', imageResponse);
       
      if (!imageResponse.success) {
        // 画像生成エラーの詳細化
        const errorMsg = imageResponse.message || '画像生成に失敗しました';
        console.error('[画像生成] エラー:', errorMsg);
        
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

      const safeUserName = userData.name.replace(/[\\/:*?"<>|]/g, '_');
      const safeDate = (reportData?.date || new Date().toISOString().split('T')[0]).replace(/[:]/g, '-');

      // 自動ダウンロード処理を追加
      if (imageResponse.imageUrl) {
        console.log('[画像生成] ダウンロード開始:', imageResponse.imageUrl);

        const link = document.createElement('a');
        link.href = imageResponse.imageUrl;
        link.download = `${safeUserName}_${safeDate}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log('[画像生成] ダウンロード完了');

        // ダウンロード完了後、即座にサーバー側の画像キャッシュを削除
        setTimeout(async () => {
          try {
            if (imageResponse.fileName) {
              console.log('[画像削除] キャッシュクリーンアップ開始:', imageResponse.fileName);

              await this.app.apiCall(API_ENDPOINTS.LINE.CLEANUP_IMAGE, {
                method: 'POST',
                body: JSON.stringify({
                  fileName: imageResponse.fileName
                })
              });

              console.log('[画像削除] キャッシュクリーンアップ完了');
            }
          } catch (cleanupError) {
            // クリーンアップエラーはログのみ（ユーザーには通知しない）
            console.error('[画像削除] クリーンアップエラー:', cleanupError);
          }
        }, 1000); // 1秒待ってからクリーンアップ（ダウンロード完了を確実にするため）

        // 成功メッセージ
        this.app.showNotification('日報画像を保存しました', 'success');
      } else {
        throw new Error('画像URLが返されませんでした');
      }

      return imageResponse;
    
    } catch (error) {
      console.error('[画像生成] 完全なエラー:', error);
      
      // ユーザーフレンドリーなエラーメッセージ
      if (error.message.includes('画像')) {
        this.app.showNotification(
          '画像の生成に失敗しました。システム管理者にお問い合わせください。', 
          'danger'
        );
      } else if (error.message.includes('404')) {
        this.app.showNotification(
          'APIエンドポイントが見つかりません。サーバー設定を確認してください。', 
          'danger'
        );
      } else {
        this.app.showNotification(
          `エラー: ${error.message}`, 
          'danger'
        );
      }
      
      throw error;
    }
  }
  
  /**
   * クリーンアップ
   */
  destroy() {
    console.log('[画像DL] クリーンアップ完了');
  }
}