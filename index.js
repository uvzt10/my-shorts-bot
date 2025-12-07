require('dotenv').config();

// TelegramToYouTube Agent - Queue System Edition
// السيناريو: خزن 50 فيديو -> منبه خارجي يسحب واحد يومياً -> رفعه وحذفه

const express = require('express');
const { Telegraf } = require('telegraf');
const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ====================
// التكوينات الأساسية
// ====================

const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const SECRET_KEY = 'my_secret_upload_key'; // مفتاح أمان لمنع الغرباء من تفعيل الرفع

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
const FOLDER_NAME = 'YouTube_Shorts_Queue'; // اسم المجلد في درايف

// ====================
// معالجات Telegram Bot (مرحلة التخزين)
// ====================

bot.start((ctx) => {
  ctx.reply(
    '📦 *نظام مخزن الشورتس الذكي*\n\n' +
    'أي فيديو ترسله الآن سيتم حفظه في *طابور الانتظار* في Google Drive.\n' +
    'لن يتم نشره فوراً، بل سينتظر "المنبه" اليومي (الساعة 6 مساءً) ليسحب فيديو واحد وينشره.\n\n' +
    '1️⃣ أرسل التفاصيل (العنوان، الوصف...)\n' +
    '2️⃣ أرسل الفيديو (أو 50 فيديو!)\n' +
    'وسيتم تخزينهم بانتظار دورهم.',
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
      title: titleMatch ? titleMatch[1].trim() : 'New Short',
      description: descMatch ? descMatch[1].trim() : '',
      hashtags: hashtagsMatch ? hashtagsMatch[1].trim() : ''
    };
    userSessions.set(userId, sessionData);
    ctx.reply('✅ تم حفظ البيانات! أرسل الفيديو (أو الفيديوهات) الآن لإضافتها للطابور.');
  } else {
    ctx.reply('⚠️ الرجاء إرسال المعلومات أولاً.');
  }
});

bot.on('video', async (ctx) => {
  const userId = ctx.from.id;
  let sessionData = userSessions.get(userId);

  // إذا لم يرسل معلومات، نستخدم معلومات افتراضية
  if (!sessionData) {
    sessionData = { title: 'Daily Short', description: '', hashtags: '#Shorts' };
  }

  const video = ctx.message.video;
  const processingMsg = await ctx.reply('⏳ جاري إضافة الفيديو للمخزن...');

  try {
    // 1. تحميل الفيديو
    const fileLink = await ctx.telegram.getFileLink(video.file_id);
    const localPath = await downloadVideo(fileLink.href, video.file_id);

    // 2. التأكد من وجود المجلد
    const folderId = await getOrCreateFolder();

    // 3. رفع الفيديو للدرايف مع تخزين المعلومات داخله (Metadata)
    // نخزن العنوان والوصف داخل حقل "description" الخاص بملف الدرايف نفسه
    const metadataString = JSON.stringify(sessionData);
    
    await drive.files.create({
      resource: {
        name: `PENDING_${sessionData.title}_${Date.now()}.mp4`,
        parents: [folderId],
        description: metadataString // السحر هنا: البيانات محفوظة داخل الملف
      },
      media: {
        mimeType: 'video/mp4',
        body: fs.createReadStream(localPath)
      },
      fields: 'id'
    });

    // 4. تنظيف
    fs.unlinkSync(localPath);

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      null,
      '📦 *تم التخزين في الطابور!* \n' +
      'سيبقى هذا الفيديو في Drive حتى يحين موعد النشر التلقائي.\n' +
      'يمكنك إرسال فيديو آخر الآن بنفس المعلومات أو معلومات جديدة.'
    );

  } catch (error) {
    console.error(error);
    ctx.reply(`❌ خطأ: ${error.message}`);
  }
});

// ====================
// نقطة الاتصال للمنبه (Trigger Endpoint)
// ====================

// هذا الرابط الذي سيضربه موقع cron-job.org
app.get('/trigger-daily-upload', async (req, res) => {
  // تحقق بسيط للأمان
  if (req.query.key !== SECRET_KEY) {
    return res.status(403).send('Unauthorized');
  }

  console.log('⏰ Trigger received! Checking queue...');

  try {
    const folderId = await getOrCreateFolder();
    
    // 1. البحث عن أقدم فيديو في الطابور
    const listRes = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
      orderBy: 'createdTime', // الأقدم أولاً (FIFO)
      pageSize: 1,
      fields: 'files(id, name, description)'
    });

    if (listRes.data.files.length === 0) {
      console.log('Queue is empty.');
      return res.send('Queue is empty. Nothing to upload.');
    }

    const file = listRes.data.files[0];
    console.log(`Found file: ${file.name}`);

    // 2. استرجاع البيانات (العنوان والوصف) من وصف الملف
    let metadata = { title: 'Auto Short', description: '', hashtags: '#Shorts' };
    try {
      if (file.description) {
        metadata = JSON.parse(file.description);
      }
    } catch (e) {
      console.log('No metadata found, using defaults.');
    }

    // 3. تحميل من درايف (كـ Stream) ورفعه لليوتيوب
    const driveStream = await drive.files.get(
        { fileId: file.id, alt: 'media' },
        { responseType: 'stream' }
      );
    
    // تجهيز النصوص
    let finalTitle = metadata.title;
    if (!finalTitle.toLowerCase().includes('#shorts')) finalTitle += ' #Shorts';
    let fullDescription = `${metadata.description}\n\n${metadata.hashtags}`.trim();
    if (!fullDescription.toLowerCase().includes('#shorts')) fullDescription += ' #Shorts';

    const youtubeRes = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title: finalTitle,
          description: fullDescription,
          categoryId: '22',
          tags: ["Shorts", "Vertical", "AutoUpload"]
        },
        status: {
          privacyStatus: 'public', // نشر فوري (لأن المنبه سيضرب في الوقت المناسب)
          selfDeclaredMadeForKids: false
        }
      },
      media: { body: driveStream.data }
    });

    // 4. حذف الملف من درايف (حتى لا يعاد نشره غداً)
    await drive.files.delete({ fileId: file.id });
    console.log('Video uploaded and deleted from Drive.');

    res.send(`Successfully uploaded: ${finalTitle} and removed from queue.`);

  } catch (error) {
    console.error('Daily Upload Error:', error);
    res.status(500).send(error.message);
  }
});

// ====================
// دوال مساعدة
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

async function getOrCreateFolder() {
  // البحث عن المجلد
  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive'
  });

  if (res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  // إنشاء المجلد إذا لم يكن موجوداً
  const fileMetadata = {
    name: FOLDER_NAME,
    mimeType: 'application/vnd.google-apps.folder'
  };
  const folder = await drive.files.create({
    resource: fileMetadata,
    fields: 'id'
  });
  return folder.data.id;
}

// ====================
// الخادم
// ====================

app.use(express.json());

// Webhook Telegram
app.post(`/webhook/${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

app.get('/', (req, res) => res.send('Queue Storage Bot is Ready 📦'));

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`✅ Server running on port ${PORT}`);
  try {
    const webhookUrl = `${process.env.WEBHOOK_URL}/webhook/${process.env.TELEGRAM_BOT_TOKEN}`;
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`✅ Webhook set to: ${webhookUrl}`);
  } catch (err) {
    console.error('❌ Failed to set webhook:', err);
  }
});
