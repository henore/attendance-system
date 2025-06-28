// routes/line.js
// LINE Messaging API統合（エラー修正版）

const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const router = express.Router();

// LINE SDK の初期化（シンプル版）
let lineClient = null;
let lineSDKInfo = 'SDK未初期化';

// LINE設定
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

// SDK初期化関数
function initializeLineSDK() {
  try {
    // @line/bot-sdk v7.x系の場合
    const line = require('@line/bot-sdk');
    lineClient = new line.Client(lineConfig);
    lineSDKInfo = 'Client (v7.x)';
    console.log('✅ LINE Client (v7.x) 初期化完了');
  } catch (error) {
    try {
      // @line/bot-sdk v8.x系の場合
      const { MessagingApiClient } = require('@line/bot-sdk');
      lineClient = new MessagingApiClient({
        channelAccessToken: lineConfig.channelAccessToken
      });
      lineSDKInfo = 'MessagingApiClient (v8.x)';
      console.log('✅ LINE MessagingApiClient (v8.x) 初期化完了');
    } catch (innerError) {
      console.error('❌ LINE SDK初期化失敗:', innerError.message);
      lineSDKInfo = `エラー: ${innerError.message}`;
    }
  }
}

// 初期化実行
initializeLineSDK();

// 必要なディレクトリを作成
async function ensureDirectories() {
  const dirs = ['temp', 'public/temp'];
  for (const dir of dirs) {
    const fullPath = path.join(__dirname, '..', dir);
    try {
      await fs.mkdir(fullPath, { recursive: true });
      console.log(`📁 ディレクトリ作成/確認: ${fullPath}`);
    } catch (error) {
      console.error(`ディレクトリ作成エラー ${dir}:`, error.message);
    }
  }
}

// 起動時にディレクトリを作成
ensureDirectories();

/**
 * LINE送信機能の状態確認
 */
router.get('/status', (req, res) => {
  const enabled = !!(lineClient && process.env.LINE_CHANNEL_ACCESS_TOKEN);
  res.json({ 
    enabled,
    configured: !!process.env.LINE_CHANNEL_ACCESS_TOKEN,
    clientReady: !!lineClient,
    sdkInfo: lineSDKInfo,
    envCheck: {
      hasToken: !!process.env.LINE_CHANNEL_ACCESS_TOKEN,
      tokenLength: process.env.LINE_CHANNEL_ACCESS_TOKEN?.length || 0,
      hasSecret: !!process.env.LINE_CHANNEL_SECRET,
      defaultUserId: process.env.DEFAULT_LINE_USER_ID || 'not set'
    }
  });
});

/**
 * 日報画像生成
 */
router.post('/generate-report-image', async (req, res) => {
  try {
    const { reportData, userData, commentData, date } = req.body;
    
    console.log('[画像生成] 開始:', { 
      userName: userData?.name, 
      date: date || reportData?.date,
      hasAttendance: !!reportData?.attendance
    });
    
    // HTMLテンプレートを生成
    const html = generateReportHTML(reportData, userData, commentData, date || reportData.date);
    
    // Puppeteerで画像生成（ヘッドレスモードの新しい設定）
    const browser = await puppeteer.launch({
      headless: 'new', // 新しいヘッドレスモード
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--single-process'
      ]
    });
    
    const page = await browser.newPage();
    
    // 日本語フォントの設定
    await page.evaluateOnNewDocument(() => {
      document.documentElement.style.fontFamily = '"Noto Sans JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif';
    });
    
    await page.setViewport({ width: 800, height: 1400, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // レンダリング完了を待つ
    await page.waitForTimeout(1000);
    
    const imageBuffer = await page.screenshot({
      type: 'png',
      fullPage: true,
      encoding: 'binary'
    });
    
    await browser.close();
    
    // 一時ファイルとして保存
    const imageId = `report_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const tempDir = path.join(__dirname, '..', 'temp');
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
      message: '画像生成に失敗しました: ' + error.message
    });
  }
});

/**
 * LINE送信
 */
router.post('/send-report', async (req, res) => {
  try {
    if (!lineClient) {
      throw new Error('LINE APIが初期化されていません。SDKの読み込みに失敗している可能性があります。');
    }
    
    const { imageId, userName, date, lineUserId } = req.body;
    const targetUserId = lineUserId || process.env.DEFAULT_LINE_USER_ID;
    
    if (!targetUserId) {
      throw new Error('送信先LINEユーザーIDが設定されていません');
    }
    
    console.log('[LINE送信] 開始:', { imageId, userName, date, targetUserId: targetUserId.substring(0, 10) + '...' });
    
    // 画像ファイルを読み込み
    const imagePath = path.join(__dirname, '..', 'temp', `${imageId}.png`);
    
    // ファイルの存在確認
    try {
      await fs.access(imagePath);
    } catch (error) {
      throw new Error('画像ファイルが見つかりません: ' + imageId);
    }
    
    const imageBuffer = await fs.readFile(imagePath);
    
    // 画像を公開ディレクトリにコピー
    const publicFileName = `report_${Date.now()}.png`;
    const publicPath = path.join(__dirname, '..', 'public', 'temp', publicFileName);
    await fs.writeFile(publicPath, imageBuffer);
    
    // 公開URLを生成
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const imageUrl = `${baseUrl}/temp/${publicFileName}`;
    
    console.log('[LINE送信] 画像URL:', imageUrl);
    
    // メッセージを送信
    const messages = [
      {
        type: 'text',
        text: `📋 ${userName}さんの日報が完了しました\n📅 ${formatDateSimple(date)}\n\n詳細は添付画像をご確認ください。`
      },
      {
        type: 'image',
        originalContentUrl: imageUrl,
        previewImageUrl: imageUrl
      }
    ];
    
    try {
      if (lineSDKInfo.includes('v8')) {
        // v8.x系の場合
        await lineClient.pushMessage({
          to: targetUserId,
          messages: messages
        });
      } else {
        // v7.x系の場合
        await lineClient.pushMessage(targetUserId, messages);
      }
      
      console.log('[LINE送信] 送信成功');
    } catch (lineError) {
      console.error('[LINE API] エラー:', lineError.response?.data || lineError);
      
      // エラーメッセージの解析
      let errorMessage = 'LINE送信に失敗しました';
      if (lineError.statusCode === 400) {
        if (lineError.response?.data?.message?.includes('Invalid user')) {
          errorMessage = 'LINE ユーザーIDが無効です。Botと友達になっているか確認してください。';
        } else {
          errorMessage = lineError.response?.data?.message || errorMessage;
        }
      } else if (lineError.statusCode === 401) {
        errorMessage = 'LINE認証エラー: アクセストークンを確認してください';
      }
      
      throw new Error(errorMessage);
    }
    
    // 一時ファイルを削除（5分後）
    setTimeout(async () => {
      try {
        await fs.unlink(imagePath);
        await fs.unlink(publicPath);
        console.log('[クリーンアップ] 一時ファイル削除完了');
      } catch (err) {
        console.error('[クリーンアップ] エラー:', err.message);
      }
    }, 5 * 60 * 1000);
    
    res.json({ 
      success: true, 
      message: 'LINE送信完了'
    });
    
  } catch (error) {
    console.error('[LINE送信] エラー:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'LINE送信に失敗しました'
    });
  }
});

/**
 * テスト送信
 */
router.post('/test-send', async (req, res) => {
  try {
    if (!lineClient) {
      throw new Error('LINE APIが初期化されていません');
    }
    
    const targetUserId = req.body.lineUserId || process.env.DEFAULT_LINE_USER_ID;
    
    if (!targetUserId) {
      throw new Error('送信先LINEユーザーIDが設定されていません');
    }
    
    console.log('[テスト送信] 開始:', { targetUserId: targetUserId.substring(0, 10) + '...', sdkInfo: lineSDKInfo });
    
    const message = {
      type: 'text',
      text: [
        '✅ LINE連携テスト送信',
        '',
        'このメッセージが届いていれば、LINE連携は正常に動作しています。',
        '',
        `📅 送信日時: ${new Date().toLocaleString('ja-JP')}`,
        `🔧 SDK情報: ${lineSDKInfo}`,
        `📱 送信先ID: ${targetUserId.substring(0, 10)}...`
      ].join('\n')
    };
    
    try {
      if (lineSDKInfo.includes('v8')) {
        // v8.x系の場合
        await lineClient.pushMessage({
          to: targetUserId,
          messages: [message]
        });
      } else {
        // v7.x系の場合
        await lineClient.pushMessage(targetUserId, message);
      }
      
      console.log('[テスト送信] 送信成功');
      
      res.json({ 
        success: true, 
        message: 'テストメッセージを送信しました',
        sdkInfo: lineSDKInfo
      });
      
    } catch (lineError) {
      console.error('[テスト送信] LINE APIエラー:', lineError.response?.data || lineError);
      throw lineError;
    }
    
  } catch (error) {
    console.error('[テスト送信] エラー:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'テスト送信に失敗しました',
      sdkInfo: lineSDKInfo
    });
  }
});

/**
 * 日報HTMLテンプレート生成
 */
function generateReportHTML(reportData, userData, commentData, date) {
  // 出勤情報の取得
  const clockIn = reportData.clock_in || reportData.attendance?.clock_in || '-';
  const clockOut = reportData.clock_out || reportData.attendance?.clock_out || '-';
  
  return `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>日報</title>
      <style>
        body {
          font-family: "Noto Sans JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif;
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
          white-space: pre-wrap;
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
          white-space: pre-wrap;
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
            <div class="time-value">${clockIn}</div>
          </div>
          <div class="time-item">
            <div class="time-label">🕕 退勤時間</div>
            <div class="time-value">${clockOut}</div>
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
              <div class="health-value">${reportData.temperature || '-'}℃</div>
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

// ヘルパー関数
function formatDate(dateString) {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });
  } catch (error) {
    return dateString;
  }
}

function formatDateSimple(dateString) {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP');
  } catch (error) {
    return dateString;
  }
}

function formatAppetite(appetite) {
  const labels = { 
    'good': 'あり', 
    'normal': '普通',
    'poor': '不振',
    'none': 'なし' 
  };
  return labels[appetite] || appetite || '-';
}

function formatSleepQuality(quality) {
  const labels = { 
    'good': '良好', 
    'normal': '普通',
    'poor': '不良', 
    'bad': '悪い' 
  };
  return labels[quality] || quality || '-';
}

module.exports = router;