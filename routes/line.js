// backend/routes/line.js
// LINE Messaging API統合

const express = require('express');
const puppeteer = require('puppeteer');
const { MessagingApiClient } = require('@line/bot-sdk');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');

const router = express.Router();
const upload = multer({ dest: 'temp/' });

// LINE Bot設定
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const client = new MessagingApiClient(lineConfig);

/**
 * LINE送信機能の状態確認
 */
router.get('/status', (req, res) => {
  const enabled = !!(process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_CHANNEL_SECRET);
  res.json({ enabled });
});

/**
 * 日報画像生成
 */
router.post('/generate-report-image', async (req, res) => {
  try {
    const { reportData, userData, commentData, date } = req.body;
    
    // HTMLテンプレートを生成
    const html = generateReportHTML(reportData, userData, commentData, date);
    
    // Puppeteerで画像生成
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 1200, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    const imageBuffer = await page.screenshot({
      type: 'png',
      fullPage: true,
      clip: { x: 0, y: 0, width: 800, height: 1200 }
    });
    
    await browser.close();
    
    // 一時ファイルとして保存
    const imageId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const imagePath = path.join('temp', `${imageId}.png`);
    await fs.writeFile(imagePath, imageBuffer);
    
    res.json({ 
      success: true, 
      imageId,
      message: '画像生成完了'
    });
    
  } catch (error) {
    console.error('画像生成エラー:', error);
    res.status(500).json({ 
      success: false, 
      message: '画像生成に失敗しました' 
    });
  }
});

/**
 * LINE送信
 */
router.post('/send-report', async (req, res) => {
  try {
    const { imageId, userName, date, lineUserId } = req.body;
    
    // デフォルトの送信先（環境変数で設定）
    const targetUserId = lineUserId || process.env.DEFAULT_LINE_USER_ID;
    
    if (!targetUserId) {
      throw new Error('送信先LINEユーザーIDが設定されていません');
    }
    
    // 画像ファイルを読み込み
    const imagePath = path.join('temp', `${imageId}.png`);
    const imageBuffer = await fs.readFile(imagePath);
    
    // 画像をLINEにアップロード
    const imageUrl = await uploadImageToLine(imageBuffer);
    
    // メッセージを送信
    const message = {
      type: 'image',
      originalContentUrl: imageUrl,
      previewImageUrl: imageUrl
    };
    
    await client.pushMessage(targetUserId, [
      {
        type: 'text',
        text: `📋 ${userName}さんの日報が完了しました\n📅 ${date}`
      },
      message
    ]);
    
    // 一時ファイルを削除
    await fs.unlink(imagePath);
    
    res.json({ 
      success: true, 
      message: 'LINE送信完了' 
    });
    
  } catch (error) {
    console.error('LINE送信エラー:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'LINE送信に失敗しました' 
    });
  }
});

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
      <title>日報</title>
      <style>
        body {
          font-family: 'Helvetica Neue', Arial, sans-serif;
          margin: 0;
          padding: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
        }
        .report-container {
          background: white;
          border-radius: 15px;
          padding: 30px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          max-width: 750px;
          margin: 0 auto;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 3px solid #667eea;
          padding-bottom: 20px;
        }
        .title {
          font-size: 28px;
          font-weight: bold;
          color: #333;
          margin-bottom: 10px;
        }
        .date {
          font-size: 18px;
          color: #666;
        }
        .attendance-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 30px;
          padding: 20px;
          background: #f8f9ff;
          border-radius: 10px;
        }
        .time-item {
          text-align: center;
          padding: 15px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }
        .time-label {
          font-size: 14px;
          color: #666;
          margin-bottom: 5px;
        }
        .time-value {
          font-size: 24px;
          font-weight: bold;
          color: #333;
        }
        .section {
          margin-bottom: 25px;
          padding: 20px;
          border-left: 4px solid #667eea;
          background: #fafbff;
          border-radius: 0 8px 8px 0;
        }
        .section-title {
          font-size: 18px;
          font-weight: bold;
          color: #333;
          margin-bottom: 15px;
          display: flex;
          align-items: center;
        }
        .section-content {
          font-size: 16px;
          line-height: 1.6;
          color: #555;
        }
        .health-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 15px;
          margin-top: 15px;
        }
        .health-item {
          background: white;
          padding: 15px;
          border-radius: 8px;
          text-align: center;
          box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }
        .health-label {
          font-size: 12px;
          color: #666;
          margin-bottom: 5px;
        }
        .health-value {
          font-size: 16px;
          font-weight: bold;
          color: #333;
        }
        .comment-section {
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
          padding: 25px;
          border-radius: 10px;
          margin-top: 30px;
        }
        .comment-title {
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 15px;
          display: flex;
          align-items: center;
        }
        .comment-content {
          font-size: 16px;
          line-height: 1.6;
          background: rgba(255,255,255,0.1);
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 10px;
        }
        .comment-author {
          font-size: 14px;
          opacity: 0.9;
          text-align: right;
        }
        .icon {
          margin-right: 8px;
        }
      </style>
    </head>
    <body>
      <div class="report-container">
        <div class="header">
          <div class="title">📋 ${userData.name}さんの日報</div>
          <div class="date">${formatDate(date)}</div>
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
          <div class="section-content">${reportData.work_content || '-'}</div>
        </div>
        
        ${reportData.external_work_location ? `
          <div class="section">
            <div class="section-title">
              <span class="icon">🏢</span>施設外就労先
            </div>
            <div class="section-content">${reportData.external_work_location}</div>
          </div>
        ` : ''}
        
        <div class="section">
          <div class="section-title">
            <span class="icon">💪</span>健康状態
          </div>
          <div class="health-grid">
            <div class="health-item">
              <div class="health-label">体温</div>
              <div class="health-value">${reportData.temperature}℃</div>
            </div>
            <div class="health-item">
              <div class="health-label">食欲</div>
              <div class="health-value">${formatAppetite(reportData.appetite)}</div>
            </div>
            <div class="health-item">
              <div class="health-label">睡眠</div>
              <div class="health-value">${formatSleepQuality(reportData.sleep_quality)}</div>
            </div>
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">
            <span class="icon">💭</span>振り返り・感想
          </div>
          <div class="section-content">${reportData.reflection || '-'}</div>
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

/**
 * 画像をLINEにアップロード
 */
async function uploadImageToLine(imageBuffer) {
  // 実際のLINE API実装では、画像を一時的にアクセス可能なURLに配置する必要があります
  // 例: AWS S3、Google Cloud Storage、または自サーバーの公開ディレクトリ
  
  // 簡易実装例（本番では適切なファイルストレージサービスを使用）
  const fileName = `report_${Date.now()}.png`;
  const publicPath = path.join('public', 'temp', fileName);
  await fs.writeFile(publicPath, imageBuffer);
  
  // 公開URLを返す
  return `${process.env.BASE_URL}/temp/${fileName}`;
}

// ヘルパー関数
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });
}

function formatAppetite(appetite) {
  const labels = { 'good': 'あり', 'none': 'なし' };
  return labels[appetite] || appetite;
}

function formatSleepQuality(quality) {
  const labels = { 'good': '良好', 'poor': '不良', 'bad': '悪い' };
  return labels[quality] || quality;
}

module.exports = router;