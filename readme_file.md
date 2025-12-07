# 🎬 TelegramToYouTube Agent

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)

**وكيل ذكي لرفع الفيديوهات من Telegram إلى YouTube تلقائيًا** 🤖

[التثبيت](#-التثبيت) • [الاستخدام](#-الاستخدام) • [التكوين](#-التكوين) • [التوثيق](#-التوثيق)

</div>

---

## 📖 نظرة عامة

TelegramToYouTube Agent هو وكيل ذكي يقوم بالرفع الآلي للفيديوهات من Telegram إلى YouTube بكل سهولة. فقط أرسل الفيديو مع العنوان والوصف والهاشتاغات، ودع الوكيل يقوم بالباقي!

### ✨ المميزات

- ✅ **رفع تلقائي كامل** - فقط أرسل الفيديو وانتهى الأمر
- 🔄 **معالجة ذكية** - رفع على Drive مؤقتاً ثم حذف تلقائي
- 📊 **تتبع متقدم** - رسائل تقدم مفصلة لكل خطوة
- 🔐 **آمن تماماً** - جميع البيانات محمية ومشفرة
- 🚀 **سريع وموثوق** - معالجة فورية بدون تأخير
- 🌍 **دعم اللغة العربية** - واجهة كاملة بالعربية

### 🎯 كيف يعمل؟

```
📱 إرسال الفيديو     →  ☁️ رفع مؤقت على Drive
                           ↓
💬 رسالة تأكيد        ←  🗑️ حذف من Drive
                           ↑
📺 نشر على YouTube    ←  🎬 رفع على YouTube
```

---

## 🚀 التثبيت السريع

### المتطلبات

- Node.js 18 أو أحدث
- حساب Telegram
- حساب Google (YouTube)
- Google Cloud Project

### التثبيت

```bash
# 1. استنساخ المشروع
git clone https://github.com/yourusername/telegram-youtube-agent.git
cd telegram-youtube-agent

# 2. تثبيت الحزم
npm install

# 3. إعداد المتغيرات البيئية
cp .env.example .env
# املأ البيانات في ملف .env

# 4. الحصول على Refresh Token
node get-refresh-token.js

# 5. تشغيل التطبيق
npm start
```

### التشغيل بـ Docker

```bash
# بناء وتشغيل
docker-compose up -d

# عرض السجلات
docker logs -f telegram-youtube-agent
```

---

## ⚙️ التكوين

### 1. إنشاء Telegram Bot

1. ابحث عن `@BotFather` في Telegram
2. أرسل `/newbot` واتبع التعليمات
3. احصل على Bot Token

### 2. إعداد Google Cloud

#### تفعيل APIs:
- YouTube Data API v3
- Google Drive API

#### إنشاء OAuth Credentials:
1. اذهب إلى [Google Cloud Console](https://console.cloud.google.com)
2. **APIs & Services** → **Credentials**
3. أنشئ OAuth 2.0 Client ID
4. أضف Redirect URI: `http://localhost:3000/oauth2callback`

### 3. ملف `.env`

```env
# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Google OAuth
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
REDIRECT_URI=http://localhost:3000/oauth2callback
GOOGLE_REFRESH_TOKEN=your_refresh_token

# Server
PORT=3000
WEBHOOK_URL=https://your-domain.com
```

---

## 💡 الاستخدام

### 1. ابدأ المحادثة

افتح البوت في Telegram واضغط **Start** أو اكتب:
```
/start
```

### 2. أرسل معلومات الفيديو

```
العنوان: دليل السفر إلى دبي 2024
الوصف: اكتشف أفضل الأماكن السياحية والمطاعم في دبي
الهاشتاغات: #دبي #سياحة #سفر #الإمارات
```

### 3. أرسل الفيديو

أرسل أي فيديو من جهازك

### 4. استلم الرابط

ستحصل على رابط الفيديو على YouTube فور انتهاء الرفع! 🎉

---

## 📂 هيكل المشروع

```
telegram-youtube-agent/
├── index.js                 # الملف الرئيسي
├── get-refresh-token.js     # سكريبت الحصول على Token
├── package.json             # حزم npm
├── .env.example             # مثال للمتغيرات البيئية
├── .env                     # المتغيرات البيئية (لا ترفعه على Git!)
├── Dockerfile               # ملف Docker
├── docker-compose.yml       # ملف Docker Compose
├── .gitignore              # ملفات Git المستثناة
├── README.md               # هذا الملف
└── temp/                   # مجلد الفيديوهات المؤقتة
```

---

## 🔒 الأمان

### نصائح مهمة:

1. ✅ **لا تشارك** ملف `.env` أبداً
2. ✅ **استخدم** HTTPS في Production
3. ✅ **حدد** المستخدمين المصرح لهم فقط
4. ✅ **فعّل** Rate Limiting لمنع الإساءة
5. ✅ **راقب** السجلات بانتظام

### تحديد المستخدمين المصرح لهم:

```javascript
const ALLOWED_USERS = [123456789, 987654321];

bot.use((ctx, next) => {
  if (!ALLOWED_USERS.includes(ctx.from?.id)) {
    return ctx.reply('❌ غير مصرح');
  }
  return next();
});
```

---

## 🐛 استكشاف الأخطاء

### المشكلة: "Webhook is not set"
```bash
# تأكد من تشغيل ngrok
ngrok http 3000

# حدّث WEBHOOK_URL في .env
```

### المشكلة: "Invalid credentials"
```bash
# تحقق من Client ID و Client Secret
# أعد تشغيل get-refresh-token.js
```

### المشكلة: "Quota exceeded"
- حد YouTube اليومي: 10,000 وحدة
- رفع فيديو واحد ≈ 1,600 وحدة
- الحل: اطلب زيادة الحصة

---

## 📊 الحدود والقيود

| الخدمة | الحد الأقصى |
|--------|-------------|
| Telegram | 2 GB للفيديو |
| YouTube | 256 GB / 12 ساعة |
| Google Drive | 5 TB |
| YouTube API | 10,000 وحدة/يوم |

---

## 🚀 النشر (Deployment)

### Railway

```bash
railway login
railway init
railway up
```

### DigitalOcean

```bash
doctl apps create --spec .do/app.yaml
```

### Heroku

```bash
heroku create
git push heroku main
```

---

## 🤝 المساهمة

المساهمات مرحب بها! إذا كان لديك اقتراح:

1. Fork المشروع
2. أنشئ branch جديد (`git checkout -b feature/AmazingFeature`)
3. Commit التغييرات (`git commit -m 'Add AmazingFeature'`)
4. Push إلى Branch (`git push origin feature/AmazingFeature`)
5. افتح Pull Request

---

## 📝 الترخيص

هذا المشروع مرخص تحت [MIT License](LICENSE)

---

## 📞 الدعم

- 📧 البريد الإلكتروني: your-email@example.com
- 🐛 الإبلاغ عن مشكلة: [GitHub Issues](https://github.com/yourusername/telegram-youtube-agent/issues)
- 💬 المجتمع: [Telegram Group](https://t.me/your_group)

---

## 🙏 شكر خاص

- [Telegraf.js](https://telegraf.js.org) - Telegram Bot Framework
- [Google APIs](https://github.com/googleapis/google-api-nodejs-client) - YouTube & Drive APIs
- [Node.js](https://nodejs.org) - JavaScript Runtime

---

## 📈 خارطة الطريق

- [ ] دعم جدولة الفيديوهات
- [ ] معالجة الفيديو (ضغط، watermark)
- [ ] لوحة تحكم ويب
- [ ] إحصائيات وتقارير
- [ ] دعم منصات أخرى (TikTok, Instagram)
- [ ] تكامل مع AI لتحسين العناوين

---

<div align="center">

**صُنع بـ ❤️ باستخدام Node.js & Telegram**

⭐ إذا أعجبك المشروع، لا تنسى النجمة!

[الرئيسية](#-telegramtoyoutube-agent) • [التوثيق](#-التوثيق) • [الإبلاغ عن مشكلة](https://github.com/yourusername/telegram-youtube-agent/issues)

</div>