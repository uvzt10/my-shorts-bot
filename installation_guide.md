# 🚀 دليل التثبيت والتشغيل الكامل - TelegramToYouTube Agent

## 📋 المتطلبات الأساسية

- Node.js (v18 أو أحدث)
- حساب Telegram
- حساب Google (YouTube)
- Google Cloud Project

---

## 🔧 خطوات التثبيت

### 1️⃣ إنشاء المشروع

```bash
# إنشاء مجلد المشروع
mkdir telegram-youtube-agent
cd telegram-youtube-agent

# تهيئة npm
npm init -y

# تثبيت الحزم المطلوبة
npm install express telegraf googleapis axios form-data dotenv
npm install --save-dev nodemon
```

### 2️⃣ إعداد Telegram Bot

1. **افتح Telegram وابحث عن:** `@BotFather`

2. **أنشئ بوت جديد:**
   ```
   /newbot
   ```

3. **اتبع التعليمات:**
   - اسم البوت: `My YouTube Uploader`
   - اسم المستخدم: `my_youtube_uploader_bot` (يجب أن ينتهي بـ bot)

4. **احصل على Token** واحفظه لاحقاً

5. **تفعيل استقبال الملفات:**
   ```
   /setjoingroups
   [اختر البوت]
   Enable
   ```

### 3️⃣ إعداد Google Cloud Project

#### أ. إنشاء المشروع

1. اذهب إلى: [Google Cloud Console](https://console.cloud.google.com)
2. اضغط على **Create Project**
3. اسم المشروع: `telegram-youtube-agent`
4. اضغط **Create**

#### ب. تفعيل APIs المطلوبة

1. من القائمة الجانبية: **APIs & Services** → **Library**

2. ابحث عن وفعّل:
   - **YouTube Data API v3**
   - **Google Drive API**

#### ج. إنشاء OAuth 2.0 Credentials

1. **APIs & Services** → **Credentials**
2. اضغط **+ CREATE CREDENTIALS** → **OAuth client ID**
3. **Application type:** Web application
4. **Name:** `TelegramYouTube Agent`
5. **Authorized redirect URIs:** أضف:
   ```
   http://localhost:3000/oauth2callback
   ```
6. اضغط **CREATE**
7. **احفظ:**
   - Client ID
   - Client Secret

#### د. Configure OAuth Consent Screen

1. **OAuth consent screen** → **External** → **CREATE**
2. املأ المعلومات:
   - App name: `TelegramYouTube Agent`
   - User support email: بريدك
   - Developer contact: بريدك
3. **Scopes:** أضف:
   - `https://www.googleapis.com/auth/youtube.upload`
   - `https://www.googleapis.com/auth/drive.file`
4. **Test users:** أضف بريدك الإلكتروني
5. احفظ

### 4️⃣ إعداد ملفات المشروع

#### أ. إنشاء ملف `.env`

```bash
# انسخ من .env.example
cp .env.example .env
```

**املأ البيانات:**
```env
TELEGRAM_BOT_TOKEN=7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_CLIENT_ID=xxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxx
REDIRECT_URI=http://localhost:3000/oauth2callback
GOOGLE_REFRESH_TOKEN=سنحصل عليه في الخطوة القادمة
PORT=3000
WEBHOOK_URL=https://your-domain.com
```

### 5️⃣ الحصول على Refresh Token

```bash
# ثبّت حزمة إضافية
npm install open

# قم بتشغيل السكريبت
node get-refresh-token.js
```

**ما سيحدث:**
1. ✅ سيفتح المتصفح تلقائياً
2. ✅ سجّل الدخول بحساب Google
3. ✅ اقبل الصلاحيات
4. ✅ ستحصل على الـ Refresh Token
5. ✅ انسخه وضعه في `.env`

---

## 🚀 التشغيل

### التطوير المحلي (باستخدام ngrok)

#### 1. تثبيت ngrok

```bash
# macOS (Homebrew)
brew install ngrok

# Windows (Chocolatey)
choco install ngrok

# أو حمّل من: https://ngrok.com/download
```

#### 2. تشغيل ngrok

```bash
ngrok http 3000
```

**ستحصل على URL مثل:**
```
https://abc123.ngrok.io
```

#### 3. تحديث WEBHOOK_URL

```env
WEBHOOK_URL=https://abc123.ngrok.io
```

#### 4. تشغيل التطبيق

```bash
npm start
```

**أو للتطوير مع إعادة التشغيل التلقائي:**
```bash
npm run dev
```

### التشغيل على الإنترنت (Production)

#### خيار 1: Railway

```bash
# تثبيت Railway CLI
npm i -g @railway/cli

# تسجيل الدخول
railway login

# إنشاء مشروع جديد
railway init

# إضافة المتغيرات
railway variables set TELEGRAM_BOT_TOKEN=xxx
railway variables set GOOGLE_CLIENT_ID=xxx
# ... باقي المتغيرات

# نشر التطبيق
railway up
```

#### خيار 2: Vercel

**تحذير:** Vercel لديه قيود على الملفات الكبيرة. استخدم Railway أو DigitalOcean بدلاً منه.

#### خيار 3: DigitalOcean App Platform

1. اربط مستودع GitHub
2. اختر `Node.js`
3. أضف المتغيرات البيئية
4. انشر

---

## 🧪 اختبار البوت

### 1. ابحث عن البوت في Telegram

ابحث عن اسم المستخدم الذي أنشأته، مثل: `@my_youtube_uploader_bot`

### 2. ابدأ المحادثة

اضغط **Start** أو اكتب:
```
/start
```

### 3. أرسل معلومات الفيديو

```
العنوان: دليل السفر إلى دبي 2024
الوصف: اكتشف أفضل الأماكن السياحية والمطاعم والفنادق في دبي
الهاشتاغات: #دبي #سياحة #سفر #الإمارات
```

### 4. أرسل الفيديو

أرسل أي فيديو من جهازك

### 5. انتظر النتيجة

سترى رسائل التقدم:
- ✅ تم حفظ المعلومات
- 📥 جاري تحميل الفيديو
- ☁️ جاري الرفع على Drive
- 🎬 جاري الرفع على YouTube
- 🗑️ جاري الحذف
- ✅ تم بنجاح! + رابط الفيديو

---

## 🔍 استكشاف الأخطاء

### خطأ: "Webhook is not set"

```bash
# تأكد من تشغيل ngrok
ngrok http 3000

# تأكد من تحديث WEBHOOK_URL في .env
# أعد تشغيل التطبيق
```

### خطأ: "Invalid credentials"

```bash
# تحقق من Client ID و Client Secret في .env
# أعد تشغيل get-refresh-token.js
```

### خطأ: "Quota exceeded"

- **YouTube API** لديها حد يومي من 10,000 وحدة
- رفع فيديو واحد = ~1,600 وحدة
- يمكنك رفع ~6 فيديوهات يومياً

**الحل:** طلب زيادة الحصة من Google Cloud Console

### خطأ: "File too large"

- **Telegram:** حد أقصى 2GB للفيديوهات
- **YouTube:** حد أقصى 256GB (أو 12 ساعة)
- **Google Drive:** حد أقصى 5TB

---

## 📊 المراقبة والسجلات

### عرض السجلات (Logs)

```bash
# محلياً
npm start

# Railway
railway logs

# DigitalOcean
# من لوحة التحكم: Runtime Logs
```

### إضافة Logging محسّن

ثبّت `winston`:
```bash
npm install winston
```

أضف في `index.js`:
```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}
```

---

## 🔐 نصائح الأمان

### 1. حماية المتغيرات البيئية

❌ **لا تفعل أبداً:**
```javascript
const API_KEY = "7123456789:AAHxxxx"; // مباشرة في الكود
```

✅ **افعل دائماً:**
```javascript
const API_KEY = process.env.TELEGRAM_BOT_TOKEN;
```

### 2. إضافة `.gitignore`

```
node_modules/
.env
temp/
*.log
```

### 3. تحديد المستخدمين المسموح لهم

في `index.js`:
```javascript
const ALLOWED_USERS = [123456789, 987654321]; // Telegram User IDs

bot.use((ctx, next) => {
  if (!ALLOWED_USERS.includes(ctx.from?.id)) {
    return ctx.reply('❌ عذراً، لست مصرحاً باستخدام هذا البوت.');
  }
  return next();
});
```

### 4. تفعيل Rate Limiting

```bash
npm install express-rate-limit
```

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 5 // 5 طلبات كحد أقصى
});

app.use(limiter);
```

---

## 📈 تحسينات مستقبلية

### 1. قاعدة بيانات للسجلات

```bash
npm install mongoose
```

حفظ سجل كل فيديو:
- تاريخ الرفع
- المستخدم
- رابط YouTube
- الحالة

### 2. جدولة الفيديوهات

رفع فيديو في وقت محدد بدلاً من الفوري

### 3. معالجة الفيديو

- ضغط الفيديوهات
- إضافة Watermark
- تحرير تلقائي

### 4. إشعارات متقدمة

- إرسال إحصائيات
- تنبيهات عند الأخطاء
- تقارير أسبوعية

---

## 📞 الدعم والمساعدة

### الموارد المفيدة

- [Telegram Bot API Docs](https://core.telegram.org/bots/api)
- [YouTube Data API Docs](https://developers.google.com/youtube/v3)
- [Google Drive API Docs](https://developers.google.com/drive/api/v3)
- [Telegraf.js Docs](https://telegraf.js.org)

### المجتمع

- [Stack Overflow - telegram-bot tag](https://stackoverflow.com/questions/tagged/telegram-bot)
- [Reddit - r/TelegramBots](https://reddit.com/r/TelegramBots)

---

## ✅ Checklist النهائي

- [ ] تم إنشاء Telegram Bot
- [ ] تم تفعيل Google APIs
- [ ] تم إنشاء OAuth Credentials
- [ ] تم الحصول على Refresh Token
- [ ] تم إعداد ملف `.env`
- [ ] تم تشغيل ngrok (للتطوير المحلي)
- [ ] تم تشغيل التطبيق بنجاح
- [ ] تم اختبار رفع فيديو
- [ ] تم التأكد من حذف الفيديو المؤقت
- [ ] تم نشر التطبيق (Production)

---

## 🎉 تهانينا!

الآن لديك وكيل ذكي كامل لرفع الفيديوهات من Telegram إلى YouTube تلقائياً! 🚀

**استمتع بالاستخدام! 🎬**