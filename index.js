require('dotenv').config();

// TelegramToYouTube Agent - Complete Backend Implementation
// استخدام Node.js + Express + Telegraf + Google APIs

const express = require('express');
const { Telegraf } = require('telegraf');
const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// ====================
// التكوينات الأساسية
// ====================

const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// OAuth2 Client للتعامل مع Google APIs
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// تعيين الـ credentials (يجب الحصول عليها أولاً عبر OAuth flow)
oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

// ====================
// حالة الوكيل
// ====================

const userSessions = new Map();

// ====================
// معالجات Telegram Bot
// ====================

bot.start((ctx) => {
  ctx.reply(
    '🎬 *مرحبًا بك في وكيل رفع الفيديوهات (Shorts Only)!*\n\n' +
    'أرسل لي فيديو (يفضل طولي) مع المعلومات التالية:\n' +
    '📌 *العنوان* (Title)\n' +
    '📝 *الوصف* (Description)\n' +
    '🏷️ *الهاشتاغات* (Hashtags)\n\n' +
    '*مثال:*\n' +
    '```\n' +
    'العنوان: نحت الطين انمي\n' +
    'الوصف: فيديو سريع لنحت شخصية انمي\n' +
    'الهاشتاغات: #نحت #انمي #فن\n' +
    '```\n\n' +
    'ثم أرسل الفيديو وسأقوم برفعه كـ Short تلقائيًا! ✨',
    { parse_mode: 'Markdown' }
  );
});

// استقبال الرسائل النصية (المعلومات)
bot.on('text', (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;

  // تحليل المعلومات من النص
  const titleMatch = text.match(/العنوان:\s*(.+)/i) || text.match(/title:\s*(.+)/i);
  const descMatch = text.match(/الوصف:\s*(.+)/i) || text.match(/description:\s*(.+)/i);
  const hashtagsMatch = text.match(/الهاشتاغات:\s*(.+)/i) || text.match(/hashtags:\s*(.+)/i);

  if (titleMatch || descMatch || hashtagsMatch) {
    const sessionData = {
      title: titleMatch ? titleMatch[1].trim() : null,
      description: descMatch ? descMatch[1].trim() : null,
      hashtags: hashtagsMatch ? hashtagsMatch[1].trim() : null,
      timestamp: Date.now()
    };

    userSessions.set(userId, sessionData);
    
    ctx.reply(
      '✅ تم حفظ المعلومات!\n\n' +
      `📌 العنوان: ${sessionData.title || 'غير محدد'}\n` +
      `📝 الوصف: ${sessionData.description || 'غير محدد'}\n` +
      `🏷️ الهاشتاغات: ${sessionData.hashtags || 'غير محدد'}\n\n` +
      '🎥 الآن أرسل الفيديو لبدء الرفع التلقائي!'
    );
  } else {
    ctx.reply('⚠️ الرجاء إرسال المعلومات بالتنسيق الصحيح. استخدم /start لمشاهدة المثال.');
  }
});

// استقبال الفيديوهات
bot.on('video', async (ctx) => {
  const userId = ctx.from.id;
  const sessionData = userSessions.get(userId);

  if (!sessionData) {
    return ctx.reply('⚠️ الرجاء إرسال المعلومات أولاً (العنوان، الوصف، الهاشتاغات) قبل إرسال الفيديو.');
  }

  const video = ctx.message.video;
  
  // رسالة معالجة
  const processingMsg = await ctx.reply('⏳ جاري معالجة الفيديو...');

  try {
    // 1. تحميل الفيديو من Telegram
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      null,
      '📥 جاري تحميل الفيديو من Telegram...'
    );
    
    const fileLink = await ctx.telegram.getFileLink(video.file_id);
    const videoPath = await downloadVideo(fileLink.href, video.file_id);

    // 2. رفع الفيديو على Google Drive مؤقتًا
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      null,
      '☁️ جاري رفع الفيديو على Google Drive...'
    );
    
    const driveFileId = await uploadToDrive(videoPath, sessionData.title);

    // 3. رفع الفيديو على YouTube
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      null,
      '🎬 جاري رفع الفيديو على YouTube (Shorts)...'
    );
    
    const youtubeUrl = await uploadToYouTube(videoPath, sessionData);

    // 4. حذف الفيديو من Drive
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      null,
      '🗑️ جاري حذف الفيديو المؤقت...'
    );
    
    await deleteFromDrive(driveFileId);

    // 5. حذف الملف المحلي
    fs.unlinkSync(videoPath);

    // 6. إرسال رسالة النجاح
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      null,
      '✅ *تم رفع الـ Short بنجاح!*\n\n' +
      `🎬 رابط الفيديو: ${youtubeUrl}\n\n` +
      `📌 العنوان: ${sessionData.title}\n` +
      `📝 الوصف: ${sessionData.description}\n` +
      `🏷️ الهاشتاغات: ${sessionData.hashtags}`,
      { parse_mode: 'Markdown' }
    );

    // حذف البيانات من الذاكرة
    userSessions.delete(userId);

  } catch (error) {
    console.error('خطأ في معالجة الفيديو:', error);
    
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      null,
      `❌ حدث خطأ أثناء معالجة الفيديو:\n${error.message}\n\nالرجاء المحاولة مرة أخرى.`
    );
  }
});

// ====================
// دوال مساعدة
// ====================

// تحميل الفيديو من Telegram
async function downloadVideo(url, fileId) {
  const videoPath = path.join(__dirname, 'temp', `${fileId}.mp4`);
  
  if (!fs.existsSync(path.join(__dirname, 'temp'))) {
    fs.mkdirSync(path.join(__dirname, 'temp'));
  }

  const response = await axios({
    method: 'GET',
    url: url,
    responseType: 'stream'
  });

  const writer = fs.createWriteStream(videoPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(videoPath));
    writer.on('error', reject);
  });
}

// رفع الفيديو على Google Drive
async function uploadToDrive(filePath, title) {
  const fileMetadata = {
    name: `${title || 'video'}_${Date.now()}.mp4`,
    mimeType: 'video/mp4'
  };

  const media = {
    mimeType: 'video/mp4',
    body: fs.createReadStream(filePath)
  };

  const response = await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id'
  });

  return response.data.id;
}

// رفع الفيديو على YouTube (معدلة للـ Shorts)
async function uploadToYouTube(filePath, metadata) {
  const { title, description, hashtags } = metadata;
  
  // 1. تجهيز العنوان: إضافة #Shorts إذا لم يكن موجوداً
  let finalTitle = title || 'New Short';
  if (!finalTitle.toLowerCase().includes('#shorts')) {
    finalTitle = `${finalTitle} #Shorts`;
  }

  // 2. تجهيز الوصف: دمج الوصف مع الهاشتاغات وإضافة #Shorts
  let fullDescription = `${description || ''}\n\n${hashtags || ''}`.trim();
  if (!fullDescription.toLowerCase().includes('#shorts')) {
    fullDescription = `${fullDescription} #Shorts`;
  }

  const response = await youtube.videos.insert({
    part: 'snippet,status',
    requestBody: {
      snippet: {
        title: finalTitle, 
        description: fullDescription,
        categoryId: '22', // People & Blogs
        // إضافة تاغات لإجبار يوتيوب على تصنيفه كـ Short
        tags: ["Shorts", "YouTubeShorts", "Vertical", "MobileVideo"] 
      },
      status: {
        privacyStatus: 'public', 
        selfDeclaredMadeForKids: false // مهم جداً للوصول للجمهور العام
      }
    },
    media: {
      body: fs.createReadStream(filePath)
    }
  });

  const videoId = response.data.id;
  // إرجاع رابط الشورتس المختصر
  return `https://www.youtube.com/shorts/${videoId}`;
}

// حذف الفيديو من Google Drive
async function deleteFromDrive(fileId) {
  await drive.files.delete({
    fileId: fileId
  });
}

// ====================
// تشغيل الخادم
// ====================

// Webhook endpoint for Telegram
app.use(express.json());
app.post(`/webhook/${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

// Health check
app.get('/', (req, res) => {
  res.send('TelegramToYouTube Agent is running! 🚀');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  
  // تعيين webhook للبوت
  const webhookUrl = `${process.env.WEBHOOK_URL}/webhook/${process.env.TELEGRAM_BOT_TOKEN}`;
  bot.telegram.setWebhook(webhookUrl);
  console.log(`✅ Webhook set to: ${webhookUrl}`);
});

// التعامل مع الأخطاء
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('❌ حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.');
});