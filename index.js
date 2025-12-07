require('dotenv').config();

// TelegramToYouTube - /Sher Edition
// التعديل: تغيير أمر النشر الطوارئ إلى /Sher

const express = require('express');
const { Telegraf } = require('telegraf');
const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const { exec } = require('child_process');

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
const STORAGE_FOLDER_NAME = 'Random_Shorts_Storage'; 
const LOGS_FOLDER_NAME = 'Daily_Upload_Logs'; 

// ====================
// دوال المعالجة (FFmpeg)
// ====================

function convertToShorts(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    console.log('🎬 Starting FFmpeg conversion...');
    const command = `ffmpeg -y -i "${inputPath}" -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" -t 59 -c:v libx264 -preset veryfast -c:a aac "${outputPath}"`;
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ FFmpeg Error: ${error.message}`);
        reject(error);
      } else {
        resolve(outputPath);
      }
    });
  });
}

// ====================
// أوامر البوت
// ====================

bot.start((ctx) => {
  ctx.reply(
    '🏭 *لوحة التحكم*\n\n' +
    '📥 أرسل الفيديو للتخزين.\n' +
    '📋 اكتب `/list` لعرض الفيديوهات المنتظرة.\n' +
    '🚨 اكتب `/Sher` للنشر الفوري (تجاوز الوقت).\n\n' +
    '👇 أرسل العنوان والوصف أولاً.',
    { parse_mode: 'Markdown' }
  );
});

// 🔥 القائمة (تعرض فقط الموجود في الخزنة) 🔥
bot.command('list', async (ctx) => {
  const msg = await ctx.reply('🔍 جاري فحص قائمة الانتظار...');
  try {
    const folderId = await getOrCreateFolder(STORAGE_FOLDER_NAME);
    const listRes = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
      fields: 'files(id, name, description)',
      pageSize: 50
    });

    const files = listRes.data.files;
    const count = files.length;

    if (count === 0) {
      return ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '📦 **الخزنة فارغة!**\nلا توجد فيديوهات تنتظر النشر.', { parse_mode: 'Markdown' });
    }

    let message = `📦 *قائمة الفيديوهات المحفوظة (${count}):*\n_هذه الفيديوهات لم تنشر بعد_\n\n`;
    
    files.forEach((file, index) => {
      let title = "بدون عنوان";
      if (file.description) {
        try { 
          const meta = JSON.parse(file.description);
          title = meta.title;
        } catch(e) {
            title = file.name;
        }
      }
      message += `${index + 1}. 🎬 ${title}\n`;
    });

    message += `\n⏳ (الفيديوهات المنشورة تم حذفها تلقائياً من القائمة)`;
    if (message.length > 4000) message = message.substring(0, 4000) + '...';

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, message, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error(error);
    ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ خطأ: ${error.message}`);
  }
});

// 🔥 زر الطوارئ الجديد (/Sher) 🔥
bot.command('Sher', async (ctx) => {
  const msg = await ctx.reply('🚨 أمر نشر فوري (/Sher)! جاري السحب العشوائي...');
  try {
    const folderId = await getOrCreateFolder(STORAGE_FOLDER_NAME);
    const listRes = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
      fields: 'files(id, name, description)',
      pageSize: 100
    });

    const files = listRes.data.files;
    if (!files || files.length === 0) {
      return ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '⚠️ الخزنة فارغة!');
    }

    const randomIndex = Math.floor(Math.random() * files.length);
    const randomFile = files[randomIndex];
    
    let metadata = { title: 'Random Short', description: '', hashtags: '' };
    if (randomFile.description) {
      try { metadata = JSON.parse(randomFile.description); } catch(e) {}
    }

    let finalTitle = metadata.title;
    if (!finalTitle.toLowerCase().includes('#shorts')) finalTitle += ' #shorts';
    const staticDescription = "Satisfying cutting / weird objects / anime edits.\n#shorts #satisfying #asmr #cutting #oddly_satisfying";
    let fullDescription = `${finalTitle}\n\n${metadata.description}\n\n${staticDescription}`.trim();
    const staticTags = ["shorts", "satisfying", "asmr", "cutting", "fruits", "relaxing"];

    const driveStream = await drive.files.get({ fileId: randomFile.id, alt: 'media' }, { responseType: 'stream' });

    await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title: finalTitle,
          description: fullDescription,
          categoryId: '24',
          tags: staticTags
        },
        status: { privacyStatus: 'public', selfDeclaredMadeForKids: false }
      },
      media: { body: driveStream.data }
    });

    // الحذف الحتمي
    await drive.files.delete({ fileId: randomFile.id });
    
    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `✅ **تم النشر الفوري!**\n🎬 ${finalTitle}`, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Manual Upload Error:', error);
    ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ فشل: ${error.message}`);
  }
});

// استقبال المعلومات
bot.on('text', (ctx) => {
  // نتجاهل الأوامر حتى لا يعتبرها عناوين
  if (ctx.message.text.startsWith('/')) return;

  const userId = ctx.from.id;
  const text = ctx.message.text;

  const titleMatch = text.match(/العنوان:\s*(.+)/i) || text.match(/title:\s*(.+)/i);
  const descMatch = text.match(/الوصف:\s*(.+)/i) || text.match(/description:\s*(.+)/i);
  const hashtagsMatch = text.match(/الهاشتاغات:\s*(.+)/i) || text.match(/hashtags:\s*(.+)/i);

  if (titleMatch || descMatch || hashtagsMatch) {
    const sessionData = {
      title: titleMatch ? titleMatch[1].trim() : 'Satisfying Video',
      description: descMatch ? descMatch[1].trim() : '',
      hashtags: hashtagsMatch ? hashtagsMatch[1].trim() : '' 
    };
    userSessions.set(userId, sessionData);
    ctx.reply('✅ تم حفظ البيانات! أرسل الفيديو الآن 📥');
  } else {
    ctx.reply('⚠️ أرسل المعلومات أولاً.');
  }
});

// استقبال الفيديو (تخزين ومعالجة)
bot.on('video', async (ctx) => {
  const userId = ctx.from.id;
  let sessionData = userSessions.get(userId);
  if (!sessionData) sessionData = { title: 'Satisfying Cutting Video', description: '', hashtags: '' };

  const video = ctx.message.video;
  const msg = await ctx.reply('⏳ جاري المعالجة (FFmpeg)...');

  try {
    const fileLink = await ctx.telegram.getFileLink(video.file_id);
    const originalPath = await downloadVideo(fileLink.href, `raw_${video.file_id}`);
    const processedPath = path.join(__dirname, 'temp', `processed_${video.file_id}.mp4`);

    await convertToShorts(originalPath, processedPath);

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '☁️ جاري الرفع للخزنة...');
    const folderId = await getOrCreateFolder(STORAGE_FOLDER_NAME);
    const metadataString = JSON.stringify(sessionData);
    
    await drive.files.create({
      resource: {
        name: `READY_${Date.now()}.mp4`,
        parents: [folderId],
        description: metadataString
      },
      media: { mimeType: 'video/mp4', body: fs.createReadStream(processedPath) },
      fields: 'id'
    });

    fs.unlinkSync(originalPath);
    fs.unlinkSync(processedPath);

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '✅ تم الحفظ في قائمة الانتظار!');
    
  } catch (error) {
    console.error(error);
    ctx.reply(`❌ حدث خطأ: ${error.message}`);
  }
});

// ====================
// المحرك الزمني (6 مساءً نيويورك)
// ====================

app.get('/cron-check', async (req, res) => {
  const nowNY = moment().tz("America/New_York");
  const currentHour = nowNY.hour(); 
  const todayDate = nowNY.format('YYYY-MM-DD');

  if (currentHour !== 18) {
    return res.send(`💤 Not time yet. (Current: ${currentHour}:00)`);
  }

  const uploadedToday = await checkIfUploadedToday(todayDate);
  if (uploadedToday) {
    return res.send(`✅ Already published today (${todayDate}).`);
  }
  
  try {
    const folderId = await getOrCreateFolder(STORAGE_FOLDER_NAME);
    const listRes = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
      fields: 'files(id, name, description)',
      pageSize: 100
    });

    const files = listRes.data.files;
    if (!files || files.length === 0) return res.send('⚠️ Storage is empty!');

    const randomIndex = Math.floor(Math.random() * files.length);
    const randomFile = files[randomIndex];
    
    let metadata = { title: 'Random Short', description: '', hashtags: '' };
    if (randomFile.description) {
      try { metadata = JSON.parse(randomFile.description); } catch(e) {}
    }

    let finalTitle = metadata.title;
    if (!finalTitle.toLowerCase().includes('#shorts')) finalTitle += ' #shorts';
    const staticDescription = "Satisfying cutting / weird objects / anime edits.\n#shorts #satisfying #asmr #cutting #oddly_satisfying";
    let fullDescription = `${finalTitle}\n\n${metadata.description}\n\n${staticDescription}`.trim();
    const staticTags = ["shorts", "satisfying", "asmr", "cutting", "fruits", "relaxing"];

    const driveStream = await drive.files.get({ fileId: randomFile.id, alt: 'media' }, { responseType: 'stream' });

    await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title: finalTitle,
          description: fullDescription,
          categoryId: '24',
          tags: staticTags
        },
        status: { privacyStatus: 'public', selfDeclaredMadeForKids: false }
      },
      media: { body: driveStream.data }
    });

    // الحذف الحتمي
    await drive.files.delete({ fileId: randomFile.id });
    await createLogFile(todayDate); 

    res.send(`🎉 SUCCESS! Published: ${finalTitle}`);

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).send('Error during upload');
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

async function downloadVideo(url, fileName) {
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
  const videoPath = path.join(tempDir, `${fileName}.mp4`);
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
app.get('/', (req, res) => res.send('Bot is Alive (/Sher Edition) 🤖'));

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
