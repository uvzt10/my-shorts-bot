require('dotenv').config();

// =========================================================
// 💎 PROJECT: OLD STRUCTURE + INFERNAL QUALITY (CRF 18) 💎
// =========================================================

const express = require('express');
const { Telegraf } = require('telegraf');
const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const { exec } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// ❌ تم حذف سطر الـ Agent لأنه يسبب تعليق البوت في Render ❌

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

// تجديد التوكن
oauth2Client.on('tokens', (tokens) => {
  if (tokens.refresh_token) console.log('🔄 Token Refreshed.');
  oauth2Client.setCredentials(tokens);
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

const userSessions = new Map();
const STORAGE_FOLDER_NAME = 'Random_Shorts_Storage'; 
const LOGS_FOLDER_NAME = 'Daily_Upload_Logs'; 

// تنظيف التمب عند التشغيل
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
try { fs.readdirSync(tempDir).forEach(f => fs.unlinkSync(path.join(tempDir, f))); } catch(e){}

// ====================
// 1. المنبه الداخلي
// ====================
setInterval(async () => {
  const nowNY = moment().tz("America/New_York");
  const currentHour = nowNY.hour(); 
  
  if (currentHour === 18) {
    console.log('🔄 Internal Clock: 6 PM NY. Checking...');
    const todayDate = nowNY.format('YYYY-MM-DD');
    const isUploaded = await checkIfUploadedToday(todayDate);
    
    if (!isUploaded) {
      console.log('🚀 Starting Auto-Upload...');
      await triggerUpload(todayDate);
    } else {
      console.log('✅ Already uploaded today.');
    }
  }
}, 60000); 

// ====================
// 2. دالة النشر
// ====================
async function triggerUpload(todayDate, manualChatId = null) {
  try {
    const folderId = await getOrCreateFolder(STORAGE_FOLDER_NAME);
    const listRes = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
      fields: 'files(id, name, description)',
      pageSize: 100
    });

    if (!listRes.data.files.length) {
      if (manualChatId) bot.telegram.sendMessage(manualChatId, '⚠️ الخزنة فارغة!');
      return;
    }

    const randomFile = listRes.data.files[Math.floor(Math.random() * listRes.data.files.length)];
    
    let metadata = { userId: null, title: 'Short', description: '', hashtags: '' };
    try { metadata = JSON.parse(randomFile.description); } catch(e) {}

    let finalTitle = metadata.title || randomFile.name;
    if (!finalTitle.toLowerCase().includes('#shorts')) finalTitle += ' #shorts';
    const staticDesc = "Satisfying video #shorts #asmr #cutting";
    let fullDescription = `${finalTitle}\n\n${metadata.description}\n\n${staticDesc}`.trim();

    console.log(`🎬 Uploading: ${finalTitle}`);

    const driveStream = await drive.files.get({ fileId: randomFile.id, alt: 'media' }, { responseType: 'stream' });

    const youtubeRes = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title: finalTitle,
          description: fullDescription,
          categoryId: '24',
          tags: ["shorts", "satisfying", "asmr"]
        },
        status: { privacyStatus: 'public', selfDeclaredMadeForKids: false }
      },
      media: { body: driveStream.data }
    });

    await drive.files.delete({ fileId: randomFile.id });
    
    if (!manualChatId) {
        await createLogFile(todayDate);
    }

    const videoUrl = `https://youtube.com/shorts/${youtubeRes.data.id}`;
    const notifyUser = manualChatId || metadata.userId;

    if (notifyUser) {
      try {
        await bot.telegram.sendMessage(
          notifyUser, 
          `🚀 **تم النشر بجودة خرافية!**\n\n` +
          `🎬 **العنوان:** ${finalTitle}\n` +
          `🔗 **الرابط:** ${videoUrl}`,
          { parse_mode: 'Markdown' }
        );
      } catch (err) { console.error('Notify Error:', err.message); }
    }

    console.log('🎉 Published Successfully!');

  } catch (error) {
    console.error('Upload Error:', error);
    if (manualChatId) bot.telegram.sendMessage(manualChatId, `❌ خطأ: ${error.message}`);
  }
}

// ====================
// 3. دوال المعالجة (الجودة الجهنمية 🔥)
// ====================
function convertToShorts(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    console.log('🔥 Starting FFmpeg (INFERNAL QUALITY)...');
    
    // التعديل هنا: CRF 18 (جودة خرافية) + 8M Bitrate + Veryfast Preset
    const command = `"${ffmpegPath}" -y -i "${inputPath}" -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" -t 59 -c:v libx264 -preset veryfast -crf 18 -maxrate 8M -bufsize 16M -c:a aac -b:a 192k -ar 48000 "${outputPath}"`;
    
    exec(command, { maxBuffer: 1024 * 1024 * 60 }, (error, stdout, stderr) => {
      if (error) { 
          console.error('FFmpeg Error:', stderr);
          reject(error); 
      } else { 
          resolve(outputPath); 
      }
    });
  });
}

// ====================
// 4. أوامر البوت
// ====================

bot.start((ctx) => ctx.reply('🏭 *البوت المتكامل (جودة 4K)*\nيعمل تلقائياً الساعة 6م (NY).'));

bot.command('list', async (ctx) => {
  const msg = await ctx.reply('🔍 جاري الفحص...');
  try {
    const folderId = await getOrCreateFolder(STORAGE_FOLDER_NAME);
    const listRes = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
      pageSize: 50
    });
    const files = listRes.data.files;
    if (files.length === 0) return ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '📦 الخزنة فارغة.');
    
    let message = `📦 *المحفوظات (${files.length}):*\n\n`;
    files.forEach((file, index) => {
        let title = file.name;
        try { title = JSON.parse(file.description).title; } catch(e){}
        message += `${index + 1}. 🎬 ${title}\n`;
    });
    if (message.length > 4000) message = message.substring(0, 4000);
    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, message);
  } catch (error) {
    ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '❌ خطأ.');
  }
});

bot.command('Sher', async (ctx) => {
  ctx.reply('🚨 جاري النشر الفوري...');
  await triggerUpload(moment().format('YYYY-MM-DD'), ctx.chat.id);
});

bot.on('text', (ctx) => {
  if (ctx.message.text.startsWith('/')) return;
  const text = ctx.message.text;
  const userId = ctx.from.id;

  const titleMatch = text.match(/العنوان:\s*(.+)/i) || text.match(/title:\s*(.+)/i);
  const descMatch = text.match(/الوصف:\s*(.+)/i) || text.match(/description:\s*(.+)/i);
  const hashtagsMatch = text.match(/الهاشتاغات:\s*(.+)/i) || text.match(/hashtags:\s*(.+)/i);

  if (titleMatch || descMatch || hashtagsMatch) {
    const sessionData = {
      userId: userId,
      title: titleMatch ? titleMatch[1].trim() : 'Satisfying Video',
      description: descMatch ? descMatch[1].trim() : '',
      hashtags: hashtagsMatch ? hashtagsMatch[1].trim() : '' 
    };
    userSessions.set(userId, sessionData);
    ctx.reply('✅ تم حفظ البيانات! أرسل الفيديو 📥');
  } else {
    ctx.reply('⚠️ أرسل المعلومات أولاً.');
  }
});

bot.on('video', async (ctx) => {
  const userId = ctx.from.id;
  let sessionData = userSessions.get(userId);
  if (!sessionData) sessionData = { userId: userId, title: 'Satisfying Video', description: '', hashtags: '' };

  const video = ctx.message.video;
  // منع الملفات الكبيرة جداً لكي لا ينفجر السيرفر مع الجودة العالية
  if (video.file_size > 48 * 1024 * 1024) return ctx.reply('❌ الفيديو كبير جداً (Max 48MB).');

  const msg = await ctx.reply('⏳ جاري المعالجة (INFERNAL QUALITY)...');

  try {
    const fileLink = await ctx.telegram.getFileLink(video.file_id);
    const originalPath = await downloadVideo(fileLink.href, `raw_${video.file_id}`);
    const processedPath = path.join(__dirname, 'temp', `processed_${video.file_id}.mp4`);

    await convertToShorts(originalPath, processedPath);

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '☁️ رفع للدرايف...');
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

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '✅ تم التخزين بجودة خرافية!');
  } catch (error) {
    console.error(error);
    try { if(fs.existsSync(originalPath)) fs.unlinkSync(originalPath); } catch(e){}
    try { if(fs.existsSync(processedPath)) fs.unlinkSync(processedPath); } catch(e){}
    ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ فشل: ${error.message}`);
  }
});

// دوال مساعدة
async function checkIfUploadedToday(dateString) {
  const logsFolderId = await getOrCreateFolder(LOGS_FOLDER_NAME);
  const res = await drive.files.list({
    q: `'${logsFolderId}' in parents and name = 'LOG_${dateString}.txt' and trashed = false`
  });
  return res.data.files.length > 0;
}

async function createLogFile(dateString) {
  const logsFolderId = await getOrCreateFolder(LOGS_FOLDER_NAME);
  await drive.files.create({
    resource: { name: `LOG_${dateString}.txt`, parents: [logsFolderId] },
    media: { mimeType: 'text/plain', body: 'Done.' }
  });
}

async function getOrCreateFolder(folderName) {
  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`
  });
  if (res.data.files.length > 0) return res.data.files[0].id;
  const folder = await drive.files.create({
    resource: { name: folderName, mimeType: 'application/vnd.google-apps.folder' }
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

app.use(express.json());
app.post(`/webhook/${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

app.get('/', (req, res) => res.send('Bot is Awake & Running ⚡'));

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
