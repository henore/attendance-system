// routes/line.js
// LINE Messaging API統合（画像要件対応版）

const express = require('express');
const puppeteer = require('puppeteer');
const sharp = require('sharp'); // 画像処理ライブラリ（要インストール）
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const router = express.Router();

// LINE SDK の初期化
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
 * 日報画像生成（LINE API要件対応版）
 */
router.post('/generate-report-image', async (req, res) => {
  let browser = null;
  try {
    const { reportData, userData, commentData, date } = req.body;
    
    console.log('[画像生成] 開始:', { 
      userName: userData?.name, 
      date: date || reportData?.date
    });
    
    // データの正規化
    const normalizedData = normalizeReportData(reportData, userData, commentData, date);
    
    // HTMLテンプレートを生成（正方形レイアウト対応）
    const html = generateSquareLayoutHTML(normalizedData);
    
    // Puppeteerで画像生成
    browser = await puppeteer.launch({
      headless: 'new',
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
    
    // 正方形のビューポート設定
    await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // レンダリング完了を待つ
    const { setTimeout } = require('node:timers/promises');
    await setTimeout(2000);

    // スクリーンショット取得（PNG形式で一旦取得）
    const pngBuffer = await page.screenshot({
      type: 'png',
      fullPage: false, // ビューポートサイズで固定
      encoding: 'binary'
    });
    
    await browser.close();
    browser = null;
    
    // sharpを使用して画像を処理
    const imageId = `report_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const tempDir = path.join(__dirname, '..', 'temp');
    
    // 1024x1024のオリジナル画像（JPEG変換）
    const originalPath = path.join(tempDir, `${imageId}_original.jpg`);
    await sharp(pngBuffer)
      .resize(1024, 1024, { 
        fit: 'cover',
        position: 'top'
      })
      .jpeg({ 
        quality: 60,  // 品質を75%に下げて容量削減
        progressive: true,
        mozjpeg: true
      })
      .toFile(originalPath);
    
    // 240x240のプレビュー画像
    const previewPath = path.join(tempDir, `${imageId}_preview.jpg`);
    await sharp(pngBuffer)
      .resize(240, 240, { 
        fit: 'cover',
        position: 'top'
      })
      .jpeg({ 
        quality: 55  // プレビューも品質調整
      })
      .toFile(previewPath);
    
    // ファイルサイズチェック
    const originalStats = await fs.stat(originalPath);
    const previewStats = await fs.stat(previewPath);
    
    console.log('[画像生成] 完了:', {
      imageId,
      originalSize: `${(originalStats.size / 1024).toFixed(2)}KB`,
      previewSize: `${(previewStats.size / 1024).toFixed(2)}KB`
    });
    
    // 1MB超えの場合は品質を下げて再生成
    if (originalStats.size > 1024 * 1024) {
      console.log('[画像生成] オリジナル画像が1MBを超えたため品質を調整');
      await sharp(pngBuffer)
        .resize(1024, 1024, { fit: 'cover', position: 'top' })
        .jpeg({ quality: 50 })  // さらに品質を下げる
        .toFile(originalPath);
    }
    
    res.json({ 
      success: true, 
      imageId,
      originalSize: originalStats.size,
      previewSize: previewStats.size,
      message: '画像生成完了'
    });
    
  } catch (error) {
    console.error('[画像生成] エラー:', error);
    if (browser) await browser.close();
    
    res.status(500).json({ 
      success: false, 
      message: '画像生成に失敗しました: ' + error.message
    });
  }
});

/**
 * LINE送信（オリジナル・プレビュー画像対応）
 */
router.post('/send-report', async (req, res) => {
  try {
    if (!lineClient) {
      throw new Error('LINE APIが初期化されていません');
    }
    
    const { imageId, userName, date, lineUserId } = req.body;
    const targetUserId = lineUserId || process.env.DEFAULT_LINE_USER_ID;
    
    if (!targetUserId) {
      throw new Error('送信先LINEユーザーIDが設定されていません');
    }
    
    console.log('[LINE送信] 開始:', { imageId, userName, date });
    
    // 画像ファイルの存在確認
    const tempDir = path.join(__dirname, '..', 'temp');
    const originalPath = path.join(tempDir, `${imageId}_original.jpg`);
    const previewPath = path.join(tempDir, `${imageId}_preview.jpg`);
    
    try {
      await fs.access(originalPath);
      await fs.access(previewPath);
    } catch (error) {
      throw new Error('画像ファイルが見つかりません: ' + imageId);
    }
    
    // 画像を公開ディレクトリにコピー
    const timestamp = Date.now();
    const publicOriginalName = `report_${timestamp}_original.jpg`;
    const publicPreviewName = `report_${timestamp}_preview.jpg`;
    
    const publicDir = path.join(__dirname, '..', 'public', 'temp');
    const publicOriginalPath = path.join(publicDir, publicOriginalName);
    const publicPreviewPath = path.join(publicDir, publicPreviewName);
    
    await fs.copyFile(originalPath, publicOriginalPath);
    await fs.copyFile(previewPath, publicPreviewPath);
    
    // 公開URLを生成
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const originalUrl = `${baseUrl}/temp/${publicOriginalName}`;
    const previewUrl = `${baseUrl}/temp/${publicPreviewName}`;
    
    console.log('[LINE送信] 画像URL:', { originalUrl, previewUrl });
    
    // メッセージを送信
    const messages = [
      {
        type: 'text',
        text: `📋 ${userName}さんの日報が完了しました\n📅 ${formatDateJapanese(date)}\n\n詳細は添付画像をご確認ください。`
      },
      {
        type: 'image',
        originalContentUrl: originalUrl,
        previewImageUrl: previewUrl
      }
    ];
    
    try {
      if (lineSDKInfo.includes('v8')) {
        await lineClient.pushMessage({
          to: targetUserId,
          messages: messages
        });
      } else {
        await lineClient.pushMessage(targetUserId, messages);
      }
      
      console.log('[LINE送信] 送信成功');
    } catch (lineError) {
      console.error('[LINE API] エラー:', lineError.response?.data || lineError);
      
      let errorMessage = 'LINE送信に失敗しました';
      if (lineError.statusCode === 400) {
        if (lineError.response?.data?.message?.includes('Invalid user')) {
          errorMessage = 'LINE ユーザーIDが無効です。';
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
        await fs.unlink(originalPath);
        await fs.unlink(previewPath);
        await fs.unlink(publicOriginalPath);
        await fs.unlink(publicPreviewPath);
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
 * 正方形レイアウト用HTMLテンプレート生成（全内容表示版）
 */
function generateSquareLayoutHTML(data) {
  return `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>日報詳細</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: "Noto Sans JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif;
          width: 1024px;
          height: 1024px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        
        .report-container {
          background: white;
          border-radius: 15px;
          padding: 25px;
          width: 960px;
          height: 960px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }
        
        /* スクロールバー非表示 */
        .report-container::-webkit-scrollbar {
          display: none;
        }
        
        .header {
          text-align: center;
          margin-bottom: 15px;
          border-bottom: 2px solid #667eea;
          padding-bottom: 10px;
        }
        
        .title {
          font-size: 24px;
          font-weight: bold;
          color: #333;
          margin-bottom: 3px;
        }
        
        .date {
          font-size: 18px;
          color: #666;
        }
        
        /* コンパクトな出勤情報 */
        .attendance-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
          margin-bottom: 15px;
        }
        
        .detail-section {
          text-align: center;
          padding: 8px 5px;
          background: #f8f9ff;
          border-radius: 6px;
          border-left: 3px solid #667eea;
          font-size: 20px;
        }
        
        .detail-section h6 {
          font-size: 10px;
          color: #666;
          margin: 0 0 3px 0;
        }
        
        .detail-value {
          font-size: 24px;
          font-weight: bold;
        }
        
        .text-success { color: #28a745; }
        .text-info { color: #17a2b8; }
        .text-warning { color: #ffc107; }
        .text-muted { color: #6c757d; }
        
        hr {
          border: none;
          border-top: 1px solid #e9ecef;
          margin: 10px 0;
        }
        
        /* 日報内容 - よりコンパクトに */
        .report-summary h6 {
            font-size: 30px;
          font-weight: bold;
          color: #333;
          margin-bottom: 10px;
        }
        
        .form-section {
          margin-bottom: 8px;
        }
        
        .past-form-label {
          font-size: 14px;
          font-weight: 600;
          color: #495057;
          margin-bottom: 2px;
        }
        
        .past-form-value {
          font-size: 10px;
          color: #333;
          padding: 4px 8px;
          background: #f8f9fa;
          border-radius: 4px;
        }
        
        .text-content {
          font-size: 20px;
          line-height: 1.3;
          color: #333;
          background: #f8f9fa;
          padding: 6px 8px;
          border-radius: 4px;
          white-space: pre-wrap;
        }
        
        /* 作業内容は高さ制限 */
        .work-content {
          max-height: 65px;
          overflow-y: auto;
        }
        
        /* 振り返りは基本2行程度なので制限なし */
        .reflection-content {
          min-height: 30px;
          font-size: 22px;
        }
        
        /* 健康状態 - 2行表示 */
        .health-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          margin-bottom: 8px;
        }
        
        .health-detail-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
          margin-bottom: 8px;
        }
        
        /* スタッフコメント */
        .comment-section {
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
          padding: 12px;
          border-radius: 8px;
          margin-top: auto;
        }
        
        .comment-title {
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 6px;
        }
        
        .comment-content {
          font-size: 22px;
          line-height: 1.3;
          background: rgba(255,255,255,0.1);
          padding: 8px;
          border-radius: 5px;
          margin-bottom: 4px;
          white-space: pre-wrap;
        }
        
        .comment-author {
          font-size: 16px;
          opacity: 0.9;
          text-align: right;
        }
        
        /* 小さめのフォント調整 */
        .form-section.compact {
          margin-bottom: 6px;
        }
        
        .form-section.compact .past-form-value {
          font-size: 26px;
          padding: 3px 6px;
        }
      </style>
    </head>
    <body>
      <div class="report-container">
        <!-- ヘッダー -->
        <div class="header">
          <div class="title">📋 ${data.user.name}さんの日報詳細</div>
          <div class="date">${formatDateJapanese(data.date)}</div>
        </div>
        
        <!-- 出勤情報 -->
        <div class="attendance-row">
          <div class="detail-section">
            <h6>🕘 出勤</h6>
            <div class="detail-value text-success">${data.attendance.clock_in}</div>
          </div>
          <div class="detail-section">
            <h6>☕ 休憩</h6>
            <div class="detail-value text-warning">${data.breakTimeDisplay.split(' ')[0]}</div>
          </div>
          <div class="detail-section">
            <h6>🕕 退勤</h6>
            <div class="detail-value ${data.attendance.clock_out !== '-' ? 'text-info' : 'text-muted'}">
              ${data.attendance.clock_out === '-' ? '未退勤' : data.attendance.clock_out}
            </div>
          </div>
        </div>

        <hr>

        <!-- 日報内容（全表示版） -->
        <div class="report-summary">
          <h6>📝 日報内容</h6>
          
          <!-- 作業内容 -->
          <div class="form-section">
            <label class="past-form-label">📋 作業内容</label>
            <div class="text-content work-content">${data.report.work_content || ''}</div>
          </div>

          ${data.report.external_work_location ? `
            <div class="form-section compact">
              <label class="past-form-label">🏢 施設外就労先</label>
              <div class="past-form-value">${data.report.external_work_location}</div>
            </div>
          ` : ''}

          <!-- 健康状態（1行目） -->
          <div class="health-row">
            <div class="form-section compact">
              <label class="past-form-label">🌡️ 体温</label>
              <div class="past-form-value">${data.report.temperature}℃</div>
            </div>
            <div class="form-section compact">
              <label class="past-form-label">🍽️ 食欲</label>
              <div class="past-form-value">${formatAppetite(data.report.appetite)}</div>
            </div>
            <div class="form-section compact">
              <label class="past-form-label">💊 頓服</label>
              <div class="past-form-value">${data.report.medication_time ? data.report.medication_time + '時' : 'なし'}</div>
            </div>
            <div class="form-section compact">
              <label class="past-form-label">😴 睡眠</label>
              <div class="past-form-value">${calculateSleepHours(data.report.bedtime, data.report.wakeup_time)}</div>
            </div>
          </div>

          <!-- 睡眠情報詳細（2行目） -->
          ${(data.report.bedtime || data.report.wakeup_time || data.report.sleep_quality) ? `
            <div class="health-detail-row">
              <div class="form-section compact">
                <label class="past-form-label">🌙 就寝</label>
                <div class="past-form-value">${data.report.bedtime || '-'}</div>
              </div>
              <div class="form-section compact">
                <label class="past-form-label">☀️ 起床</label>
                <div class="past-form-value">${data.report.wakeup_time || '-'}</div>
              </div>
              <div class="form-section compact">
                <label class="past-form-label">😴 睡眠状態</label>
                <div class="past-form-value">${formatSleepQuality(data.report.sleep_quality)}</div>
              </div>
            </div>
          ` : ''}

          <!-- 振り返り（基本2行程度なので余裕を持たせる） -->
          <div class="form-section">
            <label class="past-form-label">💭 振り返り・感想</label>
            <div class="text-content reflection-content">${data.report.reflection || ''}</div>
          </div>

          ${data.report.interview_request ? `
            <div class="form-section compact">
              <label class="past-form-label">💬 面談希望</label>
              <div class="past-form-value">${formatInterviewRequest(data.report.interview_request)}</div>
            </div>
          ` : ''}
        </div>

        ${data.comment ? `
          <!-- スタッフコメント -->
          <div class="comment-section">
            <div class="comment-title">💬 スタッフからのコメント</div>
            <div class="comment-content">${data.comment.comment}</div>
            <div class="comment-author">記入者: ${data.comment.staff_name}</div>
          </div>
        ` : ''}
      </div>
    </body>
    </html>
  `;
}

// データ正規化とヘルパー関数は既存のものを使用
function normalizeReportData(reportData, userData, commentData, date) {
  // 既存の実装を維持
  const attendance = {
    clock_in: reportData.clock_in || reportData.attendance?.clock_in || '-',
    clock_out: reportData.clock_out || reportData.attendance?.clock_out || '-',
    break_start: reportData.break_start || reportData.attendance?.break_start || null,
    break_end: reportData.break_end || reportData.attendance?.break_end || null
  };

  let breakTimeDisplay = '-';
  if (userData.role === 'user' && userData.service_type !== 'home') {
    if (reportData.breakRecord && reportData.breakRecord.start_time) {
      breakTimeDisplay = reportData.breakRecord.end_time ? 
        `${reportData.breakRecord.start_time}〜${reportData.breakRecord.end_time} (${reportData.breakRecord.duration || 60}分)` : 
        `${reportData.breakRecord.start_time}〜 (進行中)`;
    }
  } else if (userData.role !== 'user' && attendance.break_start) {
    breakTimeDisplay = attendance.break_end ? 
      `${attendance.break_start}〜${attendance.break_end} (60分)` : 
      `${attendance.break_start}〜 (進行中)`;
  }

  return {
    user: userData,
    date: date || reportData.date,
    attendance: attendance,
    breakTimeDisplay: breakTimeDisplay,
    report: {
      work_content: reportData.work_content || '',
      external_work_location: reportData.external_work_location || null,
      temperature: reportData.temperature || '-',
      appetite: reportData.appetite || null,
      sleep_quality: reportData.sleep_quality || null,
      bedtime: reportData.bedtime || null,
      wakeup_time: reportData.wakeup_time || null,
      medication_time: reportData.medication_time || null,
      reflection: reportData.reflection || '',
      interview_request: reportData.interview_request || null
    },
    comment: commentData && commentData.comment ? {
      comment: commentData.comment,
      staff_name: commentData.staff_name,
      created_at: commentData.created_at
    } : null
  };
}

// ヘルパー関数
function formatDateJapanese(dateString) {
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

function formatAppetite(appetite) {
  const labels = { 
    'good': '良好', 
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

function formatInterviewRequest(value) {
  const labels = {
    'required': '必要',
    'not_required': '不要',
    'consultation': '相談がある',
    'interview': '面談希望'
  };
  return labels[value] || value;
}

function calculateSleepHours(bedtime, wakeupTime) {
  if (!bedtime || !wakeupTime) return '-';
  
  try {
    const [bedHours, bedMinutes] = bedtime.split(':').map(Number);
    const [wakeHours, wakeMinutes] = wakeupTime.split(':').map(Number);
    
    const bedTotalMinutes = bedHours * 60 + bedMinutes;
    const wakeTotalMinutes = wakeHours * 60 + wakeMinutes;
    
    let sleepMinutes;
    
    if (wakeTotalMinutes >= bedTotalMinutes) {
      if (bedTotalMinutes > 12 * 60 && wakeTotalMinutes < 12 * 60) {
        sleepMinutes = (24 * 60 - bedTotalMinutes) + wakeTotalMinutes;
      } else {
        sleepMinutes = wakeTotalMinutes - bedTotalMinutes;
      }
    } else {
      sleepMinutes = (24 * 60 - bedTotalMinutes) + wakeTotalMinutes;
    }
    
    const hours = Math.floor(sleepMinutes / 60);
    const minutes = sleepMinutes % 60;
    
    if (hours === 0) {
      return `${minutes}分`;
    } else if (minutes === 0) {
      return `${hours}時間`;
    } else {
      return `${hours}時間${minutes}分`;
    }
    
  } catch (error) {
    console.error('睡眠時間計算エラー:', error);
    return '-';
  }
}

// 既存のテスト送信・Webhook・ボット状態確認は維持
router.post('/test-send', async (req, res) => {
  // 既存の実装を維持
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
        await lineClient.pushMessage({
          to: targetUserId,
          messages: [message]
        });
      } else {
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

router.get('/bot-status', async (req, res) => {
  // 既存の実装を維持
  try {
    let clientStatus = 'not_initialized';
    let clientType = 'unknown';
    
    if (lineClient) {
      clientStatus = 'initialized';
      clientType = lineSDKInfo;
    }
    
    const status = {
      environment: {
        hasAccessToken: !!process.env.LINE_CHANNEL_ACCESS_TOKEN,
        tokenLength: process.env.LINE_CHANNEL_ACCESS_TOKEN?.length || 0,
        hasChannelSecret: !!process.env.LINE_CHANNEL_SECRET,
        defaultUserId: process.env.DEFAULT_LINE_USER_ID || 'not_set',
        baseUrl: process.env.BASE_URL || 'not_set'
      },
      client: {
        status: clientStatus,
        type: clientType,
        ready: !!lineClient
      },
      webhookUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/api/line/webhook`,
      instructions: {
        step1: 'LINE Developersでグループトーク参加を許可',
        step2: 'Webhook URLを設定',
        step3: 'Webhookを有効化',
        step4: 'ボットを個人で友達追加してからグループ招待',
        step5: 'グループで「テスト」と送信してWebhook動作確認'
      },
      troubleshooting: {
        immediateLeave: [
          'グループトーク機能が無効',
          'Webhook URLが間違っている',
          'Webhook応答エラー',
          'ボットが友達追加されていない'
        ],
        solutions: [
          'LINE Developersでグループトーク許可をON',
          'Webhook URLを正確に設定',
          'サーバーが正常に動作しているか確認',
          '先に個人でボットを友達追加'
        ]
      }
    };
    
    res.json(status);
    
  } catch (error) {
    console.error('ボット状況確認エラー:', error);
    res.status(500).json({ 
      error: error.message,
      status: 'error'
    });
  }
});

router.post('/webhook', (req, res) => {
  // 既存の実装を維持
  try {
    console.log('\n🔔 === Webhook受信 ===');
    console.log('受信時刻:', new Date().toLocaleString('ja-JP'));
    console.log('Headers:', req.headers);
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    const events = req.body.events;
    
    if (!events || events.length === 0) {
      console.log('イベントなし - 設定確認用リクエスト');
      return res.status(200).send('OK');
    }
    
    events.forEach((event, index) => {
      console.log(`\n--- イベント ${index + 1} ---`);
      console.log('タイプ:', event.type);
      console.log('送信元:', event.source);
      
      if (event.source.type === 'group') {
        console.log('✅ グループメッセージ受信!');
        console.log('🎯 グループID:', event.source.groupId);
        console.log('👤 ユーザーID:', event.source.userId);
        
        if (event.type === 'message') {
          console.log('💬 メッセージ内容:', event.message.text);
          
          // .envファイル用の設定を出力
          console.log('\n📋 === .env設定用 ===');
          console.log(`DEFAULT_LINE_USER_ID=${event.source.groupId}`);
          console.log('==================\n');
        }
        
        if (event.type === 'join') {
          console.log('🎉 グループ参加イベント!');
        }
      } else if (event.source.type === 'user') {
        console.log('👤 個人メッセージ');
        console.log('ユーザーID:', event.source.userId);
      }
      
      if (event.type === 'message' && event.message.type === 'text') {
        console.log('メッセージ:', event.message.text);
      }
    });
    
    console.log('==================\n');
    
    res.status(200).send('OK');
    
  } catch (error) {
    console.error('❌ Webhook処理エラー:', error);
    res.status(200).send('Error logged');
  }
});

module.exports = router;