require('dotenv').config();

// TelegramToYouTube Agent - Shorts Scheduler Edition
// استخدام Node.js + Express + Telegraf + Google APIs + Moment Timezone

const express = require('express');
const { Telegraf } = require('telegraf');
const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone'); // مكتبة التوقيت الجديدة

// ====================
// التكوينات الأساسية
// ====================

const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

const userSessions = new Map();

// ====================
// معالجات Telegram Bot
// ====================

bot.start((ctx) => {
  ctx.reply(
    '🗽 *مرحبًا بك في بوت الشورتس المجدول!* 🗽\n\n' +
    'أي فيديو ترسله الآن سيتم رفعه فوراً، ولكن *سيُجدول للنشر* تلقائياً في:\n' +
    '🕕 *الساعة 6:00 مساءً (توقيت نيويورك)*\n\n' +
    'أرسل المعلومات أولاً:\n' +
    '📌 *العنوان*\n📝 *الوصف*\n🏷️ *الهاشتاغات*',
    { parse_mode: 'Markdown' }
  );
});

bot.on('text', (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;

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
    ctx.reply('✅ تم حفظ المعلومات! أرسل الفيديو الآن لجدولته.');
  } else {
    ctx.reply('⚠️ الرجاء إرسال المعلومات أولاً (العنوان، الوصف، الهاشتاغات).');
  }
});

bot.on('video', async (ctx) => {
  const userId = ctx.from.id;
  const sessionData = userSessions.get(userId);

  if (!sessionData) {
    return ctx.reply('⚠️ أرسل المعلومات أولاً.');
  }

  const video = ctx.message.video;
  const processingMsg = await ctx.reply('⏳ جاري المعالجة والجدولة...');

  try {
    // 1. تحميل
    const fileLink = await ctx.telegram.getFileLink(video.file_id);
    const videoPath = await downloadVideo(fileLink.href, video.file_id);

    // 2. رفع لليوتيوب مع الجدولة
    await ctx.telegram.editMessageText(ctx.chat.id, processingMsg.message_id, null, '📅 جاري الرفع والجدولة على YouTube...');
    
    // نستدعي دالة الرفع ونحصل على النتيجة
    const result = await uploadToYouTube(videoPath, sessionData);

    // 3. تنظيف
    fs.unlinkSync(videoPath);

    // 4. الرد النهائي
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      null,
      '✅ *تمت الجدولة بنجاح!* 🗽\n\n' +
      `🕒 *وقت النشر:* ${result.publishTime} (NY Time)\n` +
      `🔗 *الرابط:* ${result.url}\n\n` +
      'سيكون الفيديو "خاص" (Private) حتى يحين موعد النشر، ثم يتحول لـ "عام" (Public) تلقائياً.',
      { parse_mode: 'Markdown' }
    );

    userSessions.delete(userId);

  } catch (error) {
    console.error(error);
    await ctx.telegram.editMessageText(ctx.chat.id, processingMsg.message_id, null, `❌ خطأ: ${error.message}`);
  }
});

// ====================
// الدوال المساعدة
// ====================

async function downloadVideo(url, fileId) {
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
  const videoPath = path.join(tempDir, `${fileId}.mp4`);
  
  const response = await axios({ method: 'GET', url: url, responseType: 'stream' });
  const writer = fs.createWriteStream(videoPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(videoPath));
    writer.on('error', reject);
  });
}

// الدالة المعدلة: رفع + جدولة + إجبار شورت
async function uploadToYouTube(filePath, metadata) {
  const { title, description, hashtags } = metadata;

  // --- منطق الجدولة (6 مساءً بتوقيت نيويورك) ---
  // نحصل على الوقت الحالي في نيويورك
  let scheduledTime = moment().tz("America/New_York");
  
  // إذا كانت الساعة الآن في نيويورك قد تجاوزت 6 مساءً (18:00)
  // نجدول الفيديو لليوم التالي، وإلا نجدوله لليوم
  if (scheduledTime.hour() >= 18) {
    scheduledTime.add(1, 'days');
  }
  
  // ضبط الوقت بدقة على 18:00:00
  scheduledTime.set({ hour: 18, minute: 0, second: 0 });
  
  // تحويل الوقت للصيغة التي يفهمها يوتيوب (ISO 8601)
  const publishAtISO = scheduledTime.format();
  const readableTime = scheduledTime.format('YYYY-MM-DD h:mm A');

  // --- منطق الشورتس ---
  let finalTitle = title || 'New Short';
  if (!finalTitle.toLowerCase().includes('#shorts')) finalTitle += ' #Shorts';
  
  let fullDescription = `${description || ''}\n\n${hashtags || ''}`.trim();
  if (!fullDescription.toLowerCase().includes('#shorts')) fullDescription += ' #Shorts';

  const response = await youtube.videos.insert({
    part: 'snippet,status',
    requestBody: {
      snippet: {
        title: finalTitle,
        description: fullDescription,
        categoryId: '22',
        tags: ["Shorts", "YouTubeShorts", "Vertical"]
      },
      status: {
        // شرط أساسي للجدولة: الفيديو يجب أن يرفع كـ Private أولاً
        privacyStatus: 'private', 
        publishAt: publishAtISO, // هنا نضع وقت النشر المستقبلي
        selfDeclaredMadeForKids: false
      }
    },
    media: {
      body: fs.createReadStream(filePath)
    }
  });

  return {
    url: `https://www.youtube.com/shorts/${response.data.id}`,
    publishTime: readableTime
  };
}

// ====================
// الخادم (مصحح)
// ====================

app.use(express.json());

// استقبال التحديثات من تليجرام
app.post(`/webhook/${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

app.get('/', (req, res) => res.send('Bot is running with NYC Scheduler! 🗽'));

const PORT = process.env.PORT || 3000;

// تشغيل السيرفر + ربط الويب هوك تلقائياً
app.listen(PORT, async () => {
  console.log(`✅ Server running on port ${PORT}`);
  
  // هذه هي الخطوة التي كانت ناقصة:
  try {
    const webhookUrl = `${process.env.WEBHOOK_URL}/webhook/${process.env.TELEGRAM_BOT_TOKEN}`;
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`✅ Webhook set to: ${webhookUrl}`);
  } catch (err) {
    console.error('❌ Failed to set webhook:', err);
  }
});