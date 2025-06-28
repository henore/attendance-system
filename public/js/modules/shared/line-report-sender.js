// public/js/modules/shared/line-report-sender.js
// 日報完了時のLINE送信機能（ローカルテスト版）

import { API_ENDPOINTS } from '../../constants/api-endpoints.js';

export class LineReportSender {
  constructor(app) {
    this.app = app;
    this.isEnabled = true; // ローカルテストでは常に有効
    this.defaultLineId = 'henore_kobo'; // あなたのLINE ID
    this.testMode = false; // テストモード（実際のLINE送信はしない）
    this.init();
  }

  async init() {
    console.log('[LINE送信] 初期化完了 - テストモード:', this.testMode);
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
        testMode: this.testMode
      });
      
      // 1. 画像生成（Canvas API使用）
      const imageBlob = await this.generateReportImageCanvas(reportData, userData, commentData);
      
      if (this.testMode) {
        // テストモード：画像をダウンロードとして保存
        await this.saveImageAsDownload(imageBlob, userData.name, reportData.date);
        
        // LINE送信のシミュレーション
        this.simulateLineSend(userData.name, reportData.date);
        
        this.app.showNotification(
          `日報画像を生成しました。ダウンロードフォルダを確認してください。`, 
          'success'
        );
      } else {
        // 実際のLINE送信（後で実装）
        await this.sendToLine(imageBlob, userData.name, reportData.date);
      }

    } catch (error) {
      console.error('[LINE送信] エラー:', error);
      this.app.showNotification('日報画像の生成に失敗しました', 'danger');
    }
  }

  /**
   * Canvas APIを使用したクライアントサイド画像生成
   * @param {Object} reportData 
   * @param {Object} userData 
   * @param {Object} commentData 
   * @returns {Promise<Blob>}
   */
  async generateReportImageCanvas(reportData, userData, commentData) {
    return new Promise((resolve) => {
      console.log('[画像生成] 開始');
      
      // 非表示のCanvasを作成
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 1400; // 縦長にして十分なスペースを確保
      const ctx = canvas.getContext('2d');

      // 日本語フォントの設定（システムフォントを使用）
      const fontFamily = '"Hiragino Kaku Gothic Pro", "ヒラギノ角ゴ Pro W3", "メイリオ", Meiryo, "MS Pゴシック", sans-serif';

      // 背景のグラデーション
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, '#667eea');
      gradient.addColorStop(1, '#764ba2');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 白い背景のカード
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.1)';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetY = 10;
      this.roundRect(ctx, 40, 40, canvas.width - 80, canvas.height - 80, 15);
      ctx.fill();
      
      // 影をリセット
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      let y = 100; // 開始位置

      // タイトル部分
      ctx.fillStyle = '#333333';
      ctx.font = `bold 32px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillText(`📋 ${userData.name}さんの日報`, canvas.width / 2, y);

      y += 50;
      ctx.font = `20px ${fontFamily}`;
      ctx.fillStyle = '#666666';
      const formattedDate = this.formatDateJapanese(reportData.date);
      ctx.fillText(formattedDate, canvas.width / 2, y);

      // 区切り線
      y += 40;
      ctx.strokeStyle = '#667eea';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(80, y);
      ctx.lineTo(canvas.width - 80, y);
      ctx.stroke();

      y += 50;

      // 出勤情報セクション
      ctx.textAlign = 'left';
      ctx.fillStyle = '#333333';
      ctx.font = `bold 24px ${fontFamily}`;
      ctx.fillText('🕘 出退勤時間', 80, y);

      y += 40;
      
      // 出勤・退勤時間のボックス
      const timeBoxY = y;
      const boxWidth = 150;
      const boxHeight = 80;
      const spacing = 200;

      // 出勤時間ボックス
      ctx.fillStyle = '#f0f8ff';
      this.roundRect(ctx, 80, timeBoxY, boxWidth, boxHeight, 10);
      ctx.fill();
      ctx.strokeStyle = '#4a90e2';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#666666';
      ctx.font = `16px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillText('出勤時間', 80 + boxWidth/2, timeBoxY + 25);
      
      ctx.fillStyle = '#333333';
      ctx.font = `bold 20px ${fontFamily}`;
      ctx.fillText(reportData.attendance?.clock_in || '-', 80 + boxWidth/2, timeBoxY + 55);

      // 退勤時間ボックス
      ctx.fillStyle = '#f0f8ff';
      this.roundRect(ctx, 80 + spacing, timeBoxY, boxWidth, boxHeight, 10);
      ctx.fill();
      ctx.strokeStyle = '#4a90e2';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#666666';
      ctx.font = `16px ${fontFamily}`;
      ctx.fillText('退勤時間', 80 + spacing + boxWidth/2, timeBoxY + 25);
      
      ctx.fillStyle = '#333333';
      ctx.font = `bold 20px ${fontFamily}`;
      ctx.fillText(reportData.attendance?.clock_out || '-', 80 + spacing + boxWidth/2, timeBoxY + 55);

      y += boxHeight + 60;

      // 作業内容セクション
      ctx.textAlign = 'left';
      ctx.fillStyle = '#333333';
      ctx.font = `bold 22px ${fontFamily}`;
      ctx.fillText('📝 作業内容', 80, y);

      y += 35;
      ctx.fillStyle = '#555555';
      ctx.font = `18px ${fontFamily}`;
      y = this.drawMultilineText(ctx, reportData.work_content || '記載なし', 80, y, canvas.width - 160, 25);

      y += 30;

      // 施設外就労先（ある場合）
      if (reportData.external_work_location) {
        ctx.fillStyle = '#333333';
        ctx.font = `bold 22px ${fontFamily}`;
        ctx.fillText('🏢 施設外就労先', 80, y);

        y += 35;
        ctx.fillStyle = '#0066cc';
        ctx.font = `18px ${fontFamily}`;
        ctx.fillText(reportData.external_work_location, 80, y);
        
        y += 40;
      }

      // 健康状態セクション
      ctx.fillStyle = '#333333';
      ctx.font = `bold 22px ${fontFamily}`;
      ctx.fillText('💪 健康状態', 80, y);

      y += 45;

      // 健康状態の項目を横並びで表示
      const healthItems = [
        { label: '体温', value: `${reportData.temperature}℃`, icon: '🌡️' },
        { label: '食欲', value: this.formatAppetite(reportData.appetite), icon: '🍽️' },
        { label: '睡眠', value: this.formatSleepQuality(reportData.sleep_quality), icon: '😴' }
      ];

      const itemWidth = 180;
      let xPos = 80;

      healthItems.forEach((item, index) => {
        // 項目ボックス
        ctx.fillStyle = '#f8f9ff';
        this.roundRect(ctx, xPos, y, itemWidth, 70, 8);
        ctx.fill();
        ctx.strokeStyle = '#e0e6ff';
        ctx.lineWidth = 1;
        ctx.stroke();

        // アイコンとラベル
        ctx.fillStyle = '#666666';
        ctx.font = `14px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.fillText(`${item.icon} ${item.label}`, xPos + itemWidth/2, y + 25);
        
        // 値
        ctx.fillStyle = '#333333';
        ctx.font = `bold 16px ${fontFamily}`;
        ctx.fillText(item.value, xPos + itemWidth/2, y + 50);

        xPos += itemWidth + 20;
      });

      y += 90;

      // 振り返りセクション
      ctx.textAlign = 'left';
      ctx.fillStyle = '#333333';
      ctx.font = `bold 22px ${fontFamily}`;
      ctx.fillText('💭 振り返り・感想', 80, y);

      y += 35;
      ctx.fillStyle = '#555555';
      ctx.font = `18px ${fontFamily}`;
      y = this.drawMultilineText(ctx, reportData.reflection || '記載なし', 80, y, canvas.width - 160, 25);

      y += 40;

      // スタッフコメントセクション
      if (commentData && commentData.comment) {
        // 背景色を変更してコメントセクションを目立たせる
        ctx.fillStyle = 'rgba(102, 126, 234, 0.1)';
        const commentHeight = 120;
        this.roundRect(ctx, 60, y - 20, canvas.width - 120, commentHeight, 12);
        ctx.fill();

        ctx.fillStyle = '#667eea';
        ctx.font = `bold 22px ${fontFamily}`;
        ctx.fillText('💬 スタッフからのコメント', 80, y);

        y += 35;
        ctx.fillStyle = '#333333';
        ctx.font = `18px ${fontFamily}`;
        y = this.drawMultilineText(ctx, commentData.comment, 80, y, canvas.width - 160, 25);

        y += 35;
        ctx.fillStyle = '#666666';
        ctx.font = `14px ${fontFamily}`;
        ctx.fillText(`記入者: ${commentData.staff_name}`, 80, y);
      }

      // Blobに変換
      canvas.toBlob((blob) => {
        console.log('[画像生成] 完了 - サイズ:', blob.size, 'bytes');
        resolve(blob);
      }, 'image/png', 0.9);
    });
  }

  /**
   * 角丸矩形を描画
   */
  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  /**
   * 複数行テキストの描画
   */
  drawMultilineText(ctx, text, x, y, maxWidth, lineHeight) {
    if (!text) return y;
    
    const chars = text.split('');
    let line = '';
    let currentY = y;
    let lineCount = 0;
    const maxLines = 4; // 最大行数

    for (let i = 0; i < chars.length && lineCount < maxLines; i++) {
      const testLine = line + chars[i];
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && i > 0) {
        ctx.fillText(line, x, currentY);
        line = chars[i];
        currentY += lineHeight;
        lineCount++;
      } else {
        line = testLine;
      }
    }
    
    if (lineCount < maxLines && line) {
      ctx.fillText(line, x, currentY);
      currentY += lineHeight;
    } else if (lineCount >= maxLines && chars.length > line.length) {
      // 切り捨てられた場合は「...」を追加
      ctx.fillText(line + '...', x, currentY);
      currentY += lineHeight;
    }
    
    return currentY;
  }

  /**
   * 画像をダウンロードとして保存（テスト用）
   */
  async saveImageAsDownload(blob, userName, date) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `日報_${userName}_${date}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log(`[画像保存] ダウンロード完了: 日報_${userName}_${date}.png`);
  }

  /**
   * LINE送信のシミュレーション（テスト用）
   */
  simulateLineSend(userName, date) {
    console.log('\n=== LINE送信シミュレーション ===');
    console.log(`📱 送信先: ${this.defaultLineId}`);
    console.log(`👤 ユーザー: ${userName}さん`);
    console.log(`📅 日付: ${date}`);
    console.log(`📋 内容: 日報が完了しました`);
    console.log('🖼️ 画像: 日報詳細画像が添付されました');
    console.log('==============================\n');
  }

   /**
   * 実際のLINE送信
   */
  async sendToLine(imageBlob, userName, date) {
    try {
      console.log('[LINE送信] 実際の送信処理開始');
      
      // 1. まず画像をサーバーに生成してもらう
      const imageResponse = await this.app.apiCall(API_ENDPOINTS.LINE.GENERATE_IMAGE, {
        method: 'POST',
        body: JSON.stringify({
          reportData: this.currentReportData,
          userData: this.currentUserData,
          commentData: this.currentCommentData,
          date: date  // dateパラメータを追加
        })
      });
      
      if (!imageResponse.success) {
        throw new Error('画像生成に失敗しました');
      }
      
      console.log('[LINE送信] 画像生成完了:', imageResponse.imageId);
      
      // 2. LINEに送信
      const sendResponse = await this.app.apiCall(API_ENDPOINTS.LINE.SEND_REPORT, {
        method: 'POST',
        body: JSON.stringify({
          imageId: imageResponse.imageId,  // imageIdを使用
          userName: userName,
          date: date,
          lineUserId: this.defaultLineId
        })
      });
      
      if (!sendResponse.success) {
        throw new Error(sendResponse.message || 'LINE送信に失敗しました');
      }
      
      console.log('[LINE送信] 送信完了');
      this.app.showNotification('日報をLINEに送信しました', 'success');
      
    } catch (error) {
      console.error('[LINE送信] エラー:', error);
      throw error;
    }
  }

  /**
   * 日付を日本語形式でフォーマット
   */
  formatDateJapanese(dateString) {
    const date = new Date(dateString);
    const options = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    };
    return date.toLocaleDateString('ja-JP', options);
  }

  /**
   * 食欲の表示形式
   */
  formatAppetite(appetite) {
    const labels = { 
      'good': 'あり', 
      'none': 'なし',
      'normal': '普通',
      'poor': '不振'
    };
    return labels[appetite] || appetite || '-';
  }

  /**
   * 睡眠状態の表示形式
   */
  formatSleepQuality(quality) {
    const labels = { 
      'good': '良好', 
      'poor': '不良', 
      'bad': '悪い',
      'normal': '普通'
    };
    return labels[quality] || quality || '-';
  }

  /**
   * テストモードの切り替え
   */
  setTestMode(enabled) {
    this.testMode = enabled;
    console.log(`[LINE送信] テストモード: ${enabled ? 'ON' : 'OFF'}`);
  }

  /**
   * クリーンアップ
   */
  destroy() {
    console.log('[LINE送信] クリーンアップ完了');
  }
}