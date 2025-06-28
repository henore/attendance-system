// backend/routes/line.js
// 本番用LINE Messaging API統合

const express = require('express');
const puppeteer = require('puppeteer');
const { MessagingApiClient } = require('@line/bot-sdk');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const router = express.Router();

// LINE Bot設定
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

// LINE Client初期化（環境変数チェック付き）
let lineClient = null;
if (lineConfig.channelAccessToken && lineConfig.channelSecret) {
  try {
    lineClient = new MessagingApiClient(lineConfig);
    console.log('✅ LINE Messaging API Client初期化完了');
  } catch (error) {
    console.error('❌ LINE Client初期化エラー:', error);
  }
} else {
  console.warn('⚠️ LINE環境変数が設定されていません');
}

/**
 * LINE送信機能の状態確認
 */
router.get('/status', (req, res) => {
  const enabled = !!(lineClient && process.env.LINE_CHANNEL_ACCESS_TOKEN);
  res.json({ 
    enabled,
    configured: !!lineConfig.channelAccessToken,
    clientReady: !!lineClient
  });
});

/**
 * 日報画像生成
 */
router.post('/generate-report-image', async (req, res) => {
  try {
    const { reportData, userData, commentData, date } = req.body;
    
    console.log('[画像生成] 開始:', { 
      userName: userData.name, 
      date, 
      hasComment: !!commentData?.comment 
    });
    
    // HTMLテンプレートを生成
    const html = generateReportHTML(reportData, userData, commentData, date);
    
    // Puppeteerで画像生成
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 1400, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    const imageBuffer = await page.screenshot({
      type: 'png',
      fullPage: true
    });
    
    await browser.close();
    
    // 一時ファイルとして保存
    const imageId = `report_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const tempDir = path.join(__dirname, '../temp');
    
    // tempディレクトリが存在しない場合は作成
    try {
      await fs.access(tempDir);
    } catch {
      await fs.mkdir(tempDir, { recursive: true });
    }
    
    const imagePath = path.join(tempDir, `${imageId}.png`);
    await fs.writeFile(imagePath, imageBuffer);
    
    console.log('[画像生成] 完了:', { imageId, size: imageBuffer.length });
    
    res.json({ 
      success: true, 
      imageId,
      size: imageBuffer.length,
      message: '画像生成完了'
    });
    
  } catch (error) {
    console.error('[画像生成] エラー:', error);
    res.status(500).json({ 
      success: false, 
      message: '画像生成に失敗しました',
      error: error.message 
    });
  }
});

/**
 * LINE送信
 */
router.post('/send-report', async (req, res) => {
  try {
    if (!lineClient) {
      throw new Error('LINE APIが設定されていません');
    }
    
    const { imageId, userName, date, lineUserId } = req.body;
    
    // デフォルトの送信先（henore_kobo）
    const targetUserId = lineUserId || process.env.DEFAULT_LINE_USER_ID || 'henore_kobo';
    
    console.log('[LINE送信] 開始:', { imageId, userName, date, targetUserId });
    
    // 画像ファイルを読み込み
    const imagePath = path.join(__dirname, '../temp', `${imageId}.png`);
    const imageBuffer = await fs.readFile(imagePath);
    
    // 画像をBase64エンコード
    const base64Image = imageBuffer.toString('base64');
    
    // 画像を一時的にWebアクセス可能な場所に配置
    const publicImagePath = await saveImageToPublic(imageBuffer, imageId);
    
    try {
      // メッセージを送信
      await lineClient.pushMessage(targetUserId, [
        {
          type: 'text',
          text: `📋 ${userName}さんの日報が完了しました\n📅 ${formatDateForLine(date)}\n\n✅ スタッフによるコメント記入完了`
        },
        {
          type: 'image',
          originalContentUrl: publicImagePath,
          previewImageUrl: publicImagePath
        }
      ]);
      
      console.log('[LINE送信] 成功:', { targetUserId, userName, date });
      
      // 一時ファイルを削除
      setTimeout(async () => {
        try {
          await fs.unlink(imagePath);
          await deletePublicImage(imageId);
          console.log('[クリーンアップ] 一時ファイル削除完了:', imageId);
        } catch (cleanupError) {
          console.error('[クリーンアップ] エラー:', cleanupError);
        }
      }, 60000); // 1分後に削除
      
      res.json({ 
        success: true, 
        message: 'LINE送信完了',
        targetUserId: targetUserId 
      });
      
    } catch (lineError) {
      console.error('[LINE API] 送信エラー:', lineError);
      
      // LINE APIエラーの詳細分析
      let errorMessage = 'LINE送信に失敗しました';
      if (lineError.message) {
        if (lineError.message.includes('Invalid user')) {
          errorMessage = 'LINE ID（henore_kobo）が見つかりません。Bot友達登録が必要です。';
        } else if (lineError.message.includes('Invalid reply token')) {
          errorMessage = 'LINEトークンが無効です。';
        } else {
          errorMessage += ': ' + lineError.message;
        }
      }
      
      throw new Error(errorMessage);
    }
    
  } catch (error) {
    console.error('[LINE送信] エラー:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'LINE送信に失敗しました' 
    });
  }
});

/**
 * テスト送信（デバッグ用）
 */
router.post('/test-send', async (req, res) => {
  try {
    if (!lineClient) {
      throw new Error('LINE APIが設定されていません');
    }
    
    const targetUserId = req.body.lineUserId || process.env.DEFAULT_LINE_USER_ID || 'henore_kobo';
    
    await lineClient.pushMessage(targetUserId, {
      type: 'text',
      text: `🧪 LINE送信テスト\n⏰ ${new Date().toLocaleString('ja-JP')}\n\n✅ 接続確認完了`
    });
    
    res.json({ 
      success: true, 
      message: 'テスト送信完了',
      targetUserId 
    });
    
  } catch (error) {
    console.error('[テスト送信] エラー:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'テスト送信に失敗しました' 
    });
  }
});

/**
 * 画像を公開ディレクトリに保存
 */
async function saveImageToPublic(imageBuffer, imageId) {
  const publicDir = path.join(__dirname, '../../public/temp');
  
  // ディレクトリが存在しない場合は作成
  try {
    await fs.access(publicDir);
  } catch {
    await fs.mkdir(publicDir, { recursive: true });
  }
  
  const fileName = `${imageId}.png`;
  const filePath = path.join(publicDir, fileName);
  await fs.writeFile(filePath, imageBuffer);
  
  // 公開URLを返す（環境に応じて調整）
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  return `${baseUrl}/temp/${fileName}`;
}

/**
 * 公開画像を削除
 */
async function deletePublicImage(imageId) {
  const publicPath = path.join(__dirname, '../../public/temp', `${imageId}.png`);
  try {
    await fs.unlink(publicPath);
  } catch (error) {
    console.warn('[削除] 公開画像が見つかりません:', imageId);
  }
}

/**
 * 日報HTMLテンプレート生成
 */
function generateReportHTML(reportData, userData, commentData, date) {
  return `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>日報 - ${userData.name}さん</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: 'Hiragino Kaku Gothic Pro', 'ヒラギノ角ゴ Pro W3', 'メイリオ', Meiryo, 'MS Pゴシック', sans-serif;
          line-height: 1.6;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 30px;
          min-height: 100vh;
        }
        .report-container {
          background: white;
          border-radius: 20px;
          padding: 40px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.1);
          max-width: 800px;
          margin: 0 auto;
        }
        .header {
          text-align: center;
          margin-bottom: 40px;
          border-bottom: 4px solid #667eea;
          padding-bottom: 30px;
        }
        .title {
          font-size: 32px;
          font-weight: bold;
          color: #333;
          margin-bottom: 15px;
        }
        .date {
          font-size: 20px;
          color: #666;
          font-weight: 500;
        }
        .attendance-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 30px;
          margin-bottom: 40px;
          padding: 30px;
          background: linear-gradient(135deg, #f8f9ff 0%, #e3f2fd 100%);
          border-radius: 15px;
        }
        .time-item {
          text-align: center;
          padding: 25px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 8px 25px rgba(0,0,0,0.08);
          border: 2px solid #e3f2fd;
        }
        .time-label {
          font-size: 16px;
          color: #666;
          margin-bottom: 10px;
          font-weight: 500;
        }
        .time-value {
          font-size: 28px;
          font-weight: bold;
          color: #333;
        }
        .section {
          margin-bottom: 30px;
          padding: 25px;
          border-left: 6px solid #667eea;
          background: linear-gradient(to right, #fafbff 0%, #f8f9ff 100%);
          border-radius: 0 12px 12px 0;
        }
        .section-title {
          font-size: 20px;
          font-weight: bold;
          color: #333;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
        }
        .section-content {
          font-size: 17px;
          line-height: 1.8;
          color: #555;
          white-space: pre-wrap;
        }
        .health-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          margin-top: 20px;
        }
        .health-item {
          background: white;
          padding: 20px;
          border-radius: 12px;
          text-align: center;
          box-shadow: 0 5px 15px rgba(0,0,0,0.05);
          border: 1px solid #e3f2fd;
        }
        .health-label {
          font-size: 14px;
          color: #666;
          margin-bottom: 8px;
          font-weight: 500;
        }
        .health-value {
          font-size: 18px;
          font-weight: bold;
          color: #333;
        }
        .comment-section {
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
          padding: 35px;
          border-radius: 15px;
          margin-top: 40px;
          box-shadow: 0 10px 30px rgba(102, 126, 234, 0.3);
        }
        .comment-title {
          font-size: 22px;
          font-weight: bold;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
        }
        .comment-content {
          font-size: 17px;
          line-height: 1.8;
          background: rgba(255,255,255,0.15);
          padding: 20px;
          border-radius: 10px;
          margin-bottom: 15px;
          white-space: pre-wrap;
          backdrop-filter: blur(10px);
        }
        .comment-author {
          font-size: 15px;
          opacity: 0.9;
          text-align: right;
          font-weight: 500;
        }
        .icon {
          margin-right: 10px;
          font-size: 1.2em;
        }
        .external-work {
          background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
          color: #1565c0;
          padding: 20px;
          border-radius: 10px;
          border: 2px solid #2196f3;
          font-weight: 600;
        }
      </style>
    </head>
    <body>
      <div class="report-container">
        <div class="header">
          <div class="title">📋 ${userData.name}さんの日報</div>
          <div class="date">${formatDateJapanese(date)}</div>
        </div>
        
        <div class="attendance-section">
          <div class="time-item">
            <div class="time-label">🕘 出勤時間</div>
            <div class="time-value">${reportData.attendance?.clock_in || '-'}</div>
          </div>
          <div class="time-item">
            <div class="time-label">🕕 退勤時間</div>
            <div class="time-value">${reportData.attendance?.clock_out || '-'}</div>
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">
            <span class="icon">📝</span>作業内容
          </div>
          <div class="section-content">${reportData.work_content || '記載なし'}</div>
        </div>
        
        ${reportData.external_work_location ? `
          <div class="section">
            <div class="section-title">
              <span class="icon">🏢</span>施設外就労先
            </div>
            <div class="section-content external-work">${reportData.external_work_location}</div>
          </div>
        ` : ''}
        
        <div class="section">
          <div class="section-title">
            <span class="icon">💪</span>健康状態
          </div>
          <div class="health-grid">
            <div class="health-item">
              <div class="health-label">🌡️ 体温</div>
              <div class="health-value">${reportData.temperature}℃</div>
            </div>
            <div class="health-item">
              <div class="health-label">🍽️ 食欲</div>
              <div class="health-value">${formatAppetite(reportData.appetite)}</div>
            </div>
            <div class="health-item">
              <div class="health-label">😴 睡眠</div>
              <div class="health-value">${formatSleepQuality(reportData.sleep_quality)}</div>
            </div>
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">
            <span class="icon">💭</span>振り返り・感想
          </div>
          <div class="section-content">${reportData.reflection || '記載なし'}</div>
        </div>
        
        ${commentData && commentData.comment ? `
          <div class="comment-section">
            <div class="comment-title">
              <span class="icon">💬</span>スタッフからのコメント
            </div>
            <div class="comment-content">${commentData.comment}</div>
            <div class="comment-author">記入者: ${commentData.staff_name}</div>
          </div>
        ` : ''}
      </div>
    </body>
    </html>
  `;
}

// ヘルパー関数
function formatDateJapanese(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });
}

function formatDateForLine(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  }) + `（${date.toLocaleDateString('ja-JP', { weekday: 'short' })}）`;
}

function formatAppetite(appetite) {
  const labels = { 'good': 'あり', 'none': 'なし', 'normal': '普通', 'poor': '不振' };
  return labels[appetite] || appetite || '-';
}

function formatSleepQuality(quality) {
  const labels = { 'good': '良好', 'poor': '不良', 'bad': '悪い', 'normal': '普通' };
  return labels[quality] || quality || '-';
}

module.exports = router;