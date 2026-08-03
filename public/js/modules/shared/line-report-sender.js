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
        const errorMsg = imageResponse.message || 'PDF生成に失敗しました';
        console.error('[PDF生成] エラー:', errorMsg);

        if (errorMsg.includes('必須データ')) {
          throw new Error('データエラー: 必要な情報が不足しています');
        } else {
          throw new Error(`PDF生成エラー: ${errorMsg}`);
        }
      }

      const safeUserName = userData.name.replace(/[\\/:*?"<>|]/g, '_');
      const safeDate = (reportData?.date || new Date().toISOString().split('T')[0]).replace(/[:]/g, '-');

      if (imageResponse.imageUrl) {
        const downloadName = `${safeUserName}_${safeDate}.pdf`;
        const downloadUrl = `${imageResponse.imageUrl}?name=${encodeURIComponent(downloadName)}`;

        const link = document.createElement('a');
        link.href = downloadUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        this.app.showNotification('日報PDFを保存しました', 'success');
      } else {
        throw new Error('PDFのURLが返されませんでした');
      }

      return imageResponse;
    
    } catch (error) {
      console.error('[PDF生成] エラー:', error);

      if (error.message.includes('404')) {
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
   * スタッフ日報完了時の画像生成
   * @param {Object} staffReportData - スタッフ日報データ
   * @param {Object} userData - ユーザー（スタッフ）データ
   */
  async sendStaffReportCompletion(staffReportData, userData) {
    try {

      // スタッフ日報用の画像を生成
      const imageResponse = await this.app.apiCall('/api/line/generate-staff-report-image', {
        method: 'POST',
        body: JSON.stringify({
          staffReportData: staffReportData || {},
          userData: userData || {},
          date: staffReportData?.date || new Date().toISOString().split('T')[0]
        })
      });


      if (!imageResponse.success) {
        const errorMsg = imageResponse.message || 'スタッフ日報PDF生成に失敗しました';
        console.error('[スタッフ日報PDF生成] エラー:', errorMsg);
        throw new Error(`PDF生成エラー: ${errorMsg}`);
      }

      const safeUserName = userData.name.replace(/[\\/:*?"<>|]/g, '_');
      const safeDate = (staffReportData?.date || new Date().toISOString().split('T')[0]).replace(/[:]/g, '-');

      if (imageResponse.imageUrl) {
        const downloadName = `staff_${safeUserName}_${safeDate}.pdf`;
        const downloadUrl = `${imageResponse.imageUrl}?name=${encodeURIComponent(downloadName)}`;

        const link = document.createElement('a');
        link.href = downloadUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        this.app.showNotification('スタッフ日報PDFを保存しました', 'success');
      } else {
        throw new Error('PDFのURLが返されませんでした');
      }

      return imageResponse;

    } catch (error) {
      console.error('[スタッフ日報PDF生成] エラー:', error);

      this.app.showNotification(
        `エラー: ${error.message}`,
        'danger'
      );

      throw error;
    }
  }

  /**
   * クリーンアップ
   */
  destroy() {
  }
}