// سكريبت للحصول على Google Refresh Token
// قم بتشغيله مرة واحدة فقط للحصول على الـ Refresh Token

const { google } = require('googleapis');
const express = require('express');
const open = require('open').default

require('dotenv').config();

const app = express();
const PORT = 3000;

// تكوين OAuth2 Client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `http://localhost:${PORT}/oauth2callback`
);

// Scopes المطلوبة
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/drive.file'
];

// توليد URL للموافقة
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent' // للحصول على refresh token في كل مرة
});

console.log('\n🔐 خطوات الحصول على Refresh Token:\n');
console.log('1. سيتم فتح المتصفح تلقائيًا');
console.log('2. سجّل الدخول بحساب Google الخاص بك');
console.log('3. امنح الصلاحيات المطلوبة');
console.log('4. سيتم إعادة توجيهك وستحصل على الـ Refresh Token\n');

// Callback route
app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;

  try {
    // الحصول على الـ tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // عرض النتيجة
    res.send(`
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>نجح التفويض!</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
          }
          .container {
            background: white;
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 600px;
            text-align: center;
          }
          h1 { color: #28a745; margin-bottom: 20px; }
          .token-box {
            background: #f8f9fa;
            border: 2px solid #28a745;
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            word-break: break-all;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            direction: ltr;
            text-align: left;
          }
          .label {
            font-weight: bold;
            color: #495057;
            margin-bottom: 10px;
          }
          .warning {
            background: #fff3cd;
            border: 1px solid #ffc107;
            border-radius: 5px;
            padding: 15px;
            margin-top: 20px;
            color: #856404;
          }
          button {
            background: #667eea;
            color: white;
            border: none;
            padding: 12px 30px;
            border-radius: 25px;
            cursor: pointer;
            font-size: 16px;
            margin-top: 15px;
          }
          button:hover { background: #5568d3; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✅ نجح التفويض!</h1>
          <p>تم الحصول على الـ Refresh Token بنجاح. انسخه وضعه في ملف .env</p>
          
          <div class="label">🔑 Refresh Token:</div>
          <div class="token-box" id="refresh-token">${tokens.refresh_token || 'لم يتم الحصول عليه - استخدم prompt: consent'}</div>
          
          <button onclick="copyToken()">📋 نسخ Token</button>
          
          <div class="warning">
            ⚠️ <strong>مهم جداً:</strong> احتفظ بهذا الـ Token في مكان آمن ولا تشاركه مع أحد!
          </div>
          
          <p style="margin-top: 20px; color: #6c757d;">
            يمكنك الآن إغلاق هذه النافذة والعودة إلى Terminal
          </p>
        </div>
        
        <script>
          function copyToken() {
            const token = document.getElementById('refresh-token').textContent;
            navigator.clipboard.writeText(token).then(() => {
              alert('✅ تم نسخ Token بنجاح!');
            });
          }
        </script>
      </body>
      </html>
    `);

    // طباعة النتيجة في Console
    console.log('\n✅ نجح التفويض!\n');
    console.log('📋 انسخ هذا الـ Refresh Token وضعه في ملف .env:\n');
    console.log('GOOGLE_REFRESH_TOKEN=' + tokens.refresh_token);
    console.log('\n⚠️  احتفظ بهذا الـ Token في مكان آمن!\n');

    // إيقاف الخادم بعد 30 ثانية
    setTimeout(() => {
      console.log('🔒 إغلاق الخادم...');
      process.exit(0);
    }, 30000);

  } catch (error) {
    console.error('❌ خطأ في الحصول على الـ tokens:', error);
    res.status(500).send('حدث خطأ. تحقق من Console للتفاصيل.');
  }
});

// بدء الخادم وفتح المتصفح
app.listen(PORT, () => {
  console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
  console.log('🌐 فتح المتصفح...\n');
  
  // فتح المتصفح تلقائياً
  setTimeout(() => {
    open(authUrl).catch(() => {
      console.log('⚠️  لم يتم فتح المتصفح تلقائياً. افتح هذا الرابط يدوياً:\n');
      console.log(authUrl + '\n');
    });
  }, 1000);
});