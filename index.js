require('dotenv').config();

// TelegramToYouTube - Random Daily Picker
// الميزة: يخزن كل شيء، وعند الساعة 6 نيويورك يختار فيديو عشوائي وينشره

const express = require('express');
const { Telegraf } = require('telegraf');
const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');

// ====================
// الإعدادات
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
const STORAGE_FOLDER_NAME = 'Random_Shorts_Storage'; // مجلد التخزين
const LOGS_FOLDER_NAME = 'Daily_Upload_Logs'; // سجلات لمنع التكرار اليومي

// ====================
// 1. قسم التخزين (يعمل 24 ساعة)
// ====================

bot.start((ctx) => {
  ctx.reply(
    '🎲 *نظام النشر العشوائي*\n\n' +
    'أرسل فيديوهاتك في أي وقت لتخزينها في Google Drive.\n' +
    'الساعة 6 مساءً (بتوقيت نيويورك)، سأختار *فيديو واحد عشوائياً* وأنشرة.\n\n' +
    '📝 أرسل العنوان والوصف أولاً، ثم الفيديو.',
    { parse_mode: 'Markdown' }
  );
});

// استقبال المعلومات
bot.on('text', (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;

  const titleMatch = text.match(/العنوان:\s*(.+)/i) || text.match(/title:\s*(.+)/i);
  const descMatch = text.match(/الوصف:\s*(.+)/i) || text.match(/description:\s*(.+)/i);
  const hashtagsMatch = text.match(/الهاشتاغات:\s*(.+)/i) || text.match(/hashtags:\s*(.+)/i);

  if (titleMatch || descMatch || hashtagsMatch) {
    const sessionData = {
      title: titleMatch ? titleMatch[1].trim() : 'Random Short',
      description: descMatch ? descMatch[1].trim() : '',
      hashtags: hashtagsMatch ? hashtagsMatch[1].trim() : ''
    };
    userSessions.set(userId, sessionData);
    ctx.reply('✅ تم حفظ البيانات! أرسل الفيديو الآن لإضافته للخزنة 📥');
  } else {
    ctx.reply('⚠️ أرسل المعلومات أولاً (العنوان، الوصف...).');
  }
});

// استقبال الفيديو وتخزينه
bot.on('video', async (ctx) => {
  const userId = ctx.from.id;
  let sessionData = userSessions.get(userId);
  if (!sessionData) sessionData = { title: 'Random Short', description: '', hashtags: '#Shorts' };

  const video = ctx.message.video;
  const msg = await ctx.reply('☁️ جاري التخزين في الخزنة السحابية...');

  try {
    const fileLink = await ctx.telegram.getFileLink(video.file_id);
    const localPath = await downloadVideo(fileLink.href, video.file_id);
    const folderId = await getOrCreateFolder(STORAGE_FOLDER_NAME);

    // تخزين المعلومات داخل وصف الملف في Drive
    const metadataString = JSON.stringify(sessionData);
    
    await drive.files.create({
      resource: {
        name: `STORED_${Date.now()}.mp4`,
        parents: [folderId],
        description: metadataString // حفظنا العنوان والوصف هنا
      },
      media: { mimeType: 'video/mp4', body: fs.createReadStream(localPath) },
      fields: 'id'
    });

    fs.unlinkSync(localPath); // حذف محلي
    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '✅ تم تأمين الفيديو في الخزنة! سيتم اختياره عشوائياً في المستقبل.');
    
  } catch (error) {
    console.error(error);
    ctx.reply('❌ فشل التخزين');
  }
});

// ====================
// 2. المحرك الزمني (يفحصه الـ Cron Job كل 5 دقائق)
// ====================

app.get('/cron-check', async (req, res) => {
  const nowNY = moment().tz("America/New_York");
  const currentHour = nowNY.hour(); // الساعة 18 = 6 مساءً
  const todayDate = nowNY.format('YYYY-MM-DD');

  console.log(`⏰ Time Check: ${nowNY.format('h:mm A')} NY`);

  // الشرط 1: هل الساعة 6 مساءً؟
  if (currentHour !== 18) {
    return res.send(`💤 Not time yet. (Current: ${currentHour}:00)`);
  }

  // الشرط 2: هل نشرنا اليوم؟
  const uploadedToday = await checkIfUploadedToday(todayDate);
  if (uploadedToday) {
    return res.send(`✅ Already published today (${todayDate}). See you tomorrow!`);
  }

  // الشرط 3: وقت النشر! لنختار فيديو عشوائي
  console.log('🎲 It is 6 PM! Picking a random video...');
  
  try {
    const folderId = await getOrCreateFolder(STORAGE_FOLDER_NAME);
    
    // جلب قائمة كل الفيديوهات
    const listRes = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
      fields: 'files(id, name, description)',
      pageSize: 100 // يمكن زيادته إذا كان لديك فيديوهات أكثر
    });

    const files = listRes.data.files;

    if (!files || files.length === 0) {
      return res.send('⚠️ Storage is empty! No videos to pick.');
    }

    // === 🎲 السحر هنا: اختيار عشوائي ===
    const randomIndex = Math.floor(Math.random() * files.length);
    const randomFile = files[randomIndex];
    
    console.log(`🎯 Randomly selected: ${randomFile.name}`);

    // استخراج البيانات
    let metadata = { title: 'Random Short', description: '', hashtags: '' };
    if (randomFile.description) {
      try { metadata = JSON.parse(randomFile.description); } catch(e) {}
    }

    // تجهيز النصوص
    let finalTitle = metadata.title;
    if (!finalTitle.toLowerCase().includes('#shorts')) finalTitle += ' #Shorts';
    let fullDescription = `${metadata.description}\n\n${metadata.hashtags}`.trim();
    if (!fullDescription.toLowerCase().includes('#shorts')) fullDescription += ' #Shorts';

    // تحميل ورفع
    const driveStream = await drive.files.get({ fileId: randomFile.id, alt: 'media' }, { responseType: 'stream' });

    await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title: finalTitle,
          description: fullDescription,
          categoryId: '22',
          tags: ["Shorts", "Vertical"]
        },
        status: {
          privacyStatus: 'public', // نشر علني مباشر
          selfDeclaredMadeForKids: false
        }
      },
      media: { body: driveStream.data }
    });

    // التنظيف: حذف الفيديو + تسجيل اليوم
    await drive.files.delete({ fileId: randomFile.id });
    await createLogFile(todayDate); 

    res.send(`🎉 SUCCESS! Published random video: ${finalTitle}`);

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).send('Error during random upload');
  }
});

// ====================
// دوال مساعدة
// ====================

async function checkIfUploadedToday(dateString) {
  const logsFolderId = await getOrCreateFolder(LOGS_FOLDER_NAME);
  const fileName = `LOG_${dateString}.txt`;
  const res = await drive.files.list({
    q: `'${logsFolderId}' in parents and name = '${fileName}' and trashed = false`,
    fields: 'files(id)'
  });
  return res.data.files.length > 0;
}

async function createLogFile(dateString) {
  const logsFolderId = await getOrCreateFolder(LOGS_FOLDER_NAME);
  const fileName = `LOG_${dateString}.txt`;
  await drive.files.create({
    resource: { name: fileName, parents: [logsFolderId] },
    media: { mimeType: 'text/plain', body: 'Done.' },
    fields: 'id'
  });
}

async function getOrCreateFolder(folderName) {
  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`,
    fields: 'files(id)'
  });
  if (res.data.files.length > 0) return res.data.files[0].id;
  const folder = await drive.files.create({
    resource: { name: folderName, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id'
  });
  return folder.data.id;
}

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

// ====================
// الخادم
// ====================

app.use(express.json());
app.post(`/webhook/${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});
app.get('/', (req, res) => res.send('Random Storage Bot is Alive 🎲'));

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
