require('dotenv').config();

// =========================================================
// 💀 THE REVIVED CODE (High Quality Edition) 💎
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

// ❌❌❌ تم حذف سطر الـ Agent لأنه هو سبب المشكلة في Render ❌❌❌

// إعدادات التخزين
const STORAGE_FOLDER_NAME = 'Random_Shorts_Storage'; 
const LOGS_FOLDER_NAME = 'Daily_Upload_Logs'; 

// تنظيف ملفات المؤقتة عند البدء
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
try { fs.readdirSync(tempDir).forEach(f => fs.unlinkSync(path.join(tempDir, f))); } catch(e){}

// --- اتصال جوجل ---
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

// تجديد التوكن تلقائياً
oauth2Client.on('tokens', (tokens) => {
  if (tokens.refresh_token) console.log('🔄 Token Refreshed.');
  oauth2Client.setCredentials(tokens);
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
const userSessions = new Map();

// ====================
// 1. المنبه الداخلي (يحتاج UptimeRobot ليعمل بدقة)
// ====================
setInterval(async () => {
  const nowNY = moment().tz("America/New_York");
  const currentHour = nowNY.hour(); 
  
  // الفحص الساعة 6 مساءً بتوقيت نيويورك
  if (currentHour === 18) {
    console.log('🔄 Checking Auto-Upload Schedule...');
    const todayDate = nowNY.format('YYYY-MM-DD');
    const isUploaded = await checkIfUploadedToday(todayDate);
    
    if (!isUploaded) {
      console.log('🚀 Auto-Upload Started...');
      await triggerUpload(todayDate);
    }
  }
}, 60000); // كل دقيقة

// ====================
// 2. دوال المعالجة (جودة جهنمية 🔥)
// ====================
function processVideoSmartly(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    console.log('🔥 Encoding in HELLFIRE Quality (CRF 18)...');
    
    // التعديل الجوهري هنا:
    // -crf 18: جودة عالية جداً (كلما قل الرقم زادت الجودة).
    // -preset veryfast: أبطأ قليلاً من ultrafast لكنه يحافظ على التفاصيل بشكل أفضل.
    // -maxrate 8M -bufsize 16M: لزيادة معدل البت (Bitrate) وجعل الصورة نقية.
    // -vf scale...: لضمان أبعاد مثالية للموبايل.
    
    const encodeCmd = `"${ffmpegPath}" -y -i "${inputPath}" -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" -t 59 -c:v libx264 -preset veryfast -crf 18 -maxrate 8M -bufsize 16M -c:a aac -b:a 192k -ar 44100 "${outputPath}"`;

    exec(encodeCmd, (err) => {
      if (err) {
        console.error('Encoding Error:', err);
        reject(err);
      } else {
        console.log('✅ HELLFIRE Quality Encoding Done.');
        resolve(outputPath);
      }
    });
  });
}

// ====================
// 3. دالة النشر (المصلحة)
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
    
    // استخراج البيانات بأمان (عشان ما يوقف الكود)
    let metadata = { userId: null, title: 'Short Video', description: '', hashtags: '' };
    if (randomFile.description) {
        try { metadata = JSON.parse(randomFile.description); } catch(e) {}
    }

    let finalTitle = metadata.title || randomFile.name.replace('.mp4', '');
    if (!finalTitle.toLowerCase().includes('#shorts')) finalTitle += ' #shorts';
    if (finalTitle.length > 100) finalTitle = finalTitle.substring(0, 90) + ' #shorts';

    if (manualChatId) bot.telegram.sendMessage(manualChatId, `📡 جاري رفع: ${finalTitle}`);

    const driveStream = await drive.files.get({ fileId: randomFile.id, alt: 'media' }, { responseType: 'stream' });

    const youtubeRes = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title: finalTitle,
          description: `${finalTitle}\n\n${metadata.description}\n\n#shorts`,
          categoryId: '24',
          tags: ["shorts", "viral"]
        },
        status: { privacyStatus: 'public', selfDeclaredMadeForKids: false }
      },
      media: { body: driveStream.data }
    });

    // حذف الملف بعد النجاح
    if (youtubeRes.data.id) {
        await drive.files.delete({ fileId: randomFile.id });
        if (!manualChatId) await createLogFile(todayDate);

        const link = `https://youtube.com/shorts/${youtubeRes.data.id}`;
        if (manualChatId) bot.telegram.sendMessage(manualChatId, `✅ تم النشر والحذف!\n${link}`);
        else if (metadata.userId) bot.telegram.sendMessage(metadata.userId, `✅ نشر تلقائي ناجح!\n${link}`);
    }

  } catch (error) {
    console.error('Upload Error:', error);
    if (manualChatId) bot.telegram.sendMessage(manualChatId, `❌ خطأ: ${error.message}`);
  }
}

// ====================
// 4. أوامر البوت
// ====================

bot.start((ctx) => ctx.reply('💎 **نظام الجودة الجهنمية جاهز!**\n\nأرسل العنوان ثم الفيديو.\nالأوامر: /list , /Sher'));

// أمر LIST (المصلح والمحمي من الانهيار)
bot.command('list', async (ctx) => {
  const msg = await ctx.reply('🔍 جاري جلب القائمة...');
  try {
    const folderId = await getOrCreateFolder(STORAGE_FOLDER_NAME);
    const listRes = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
      pageSize: 50,
      fields: 'files(id, name, description)' // مهم جداً
    });

    const files = listRes.data.files;
    if (!files || files.length === 0) return ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '📦 الخزنة فارغة.');
    
    let message = `📦 *المحتوى (${files.length}):*\n\n`;
    files.forEach((file, index) => {
        let title = file.name;
        // محاولة قراءة الاسم المخفي، إذا فشل نستخدم اسم الملف العادي
        if (file.description) {
            try { title = JSON.parse(file.description).title; } catch(e){}
        }
        message += `${index + 1}. 🎬 ${title}\n`;
    });
    
    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, message);
  } catch (error) {
    console.error(error);
    ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ خطأ: ${error.message}`);
  }
});

// أمر Sher (النشر اليدوي)
bot.command('Sher', async (ctx) => {
  ctx.reply('🚨 أمر النشر اليدوي...');
  await triggerUpload(moment().format('YYYY-MM-DD'), ctx.chat.id);
});

// استقبال النصوص
bot.on('text', (ctx) => {
  if (ctx.message.text.startsWith('/')) return;
  const lines = ctx.message.text.split('\n');
  let title = lines[0].replace('العنوان:', '').trim();
  
  if (title) {
    userSessions.set(ctx.from.id, { userId: ctx.from.id, title, description: '', hashtags: '' });
    ctx.reply(`💾 تم حفظ العنوان: ${title}\nأرسل الفيديو الآن.`);
  }
});

// استقبال الفيديو
bot.on('video', async (ctx) => {
  const userId = ctx.from.id;
  const sessionData = userSessions.get(userId);
  if (!sessionData) return ctx.reply('⚠️ أرسل العنوان أولاً.');

  const msg = await ctx.reply('🔥 معالجة بجودة عالية (قد تأخذ وقتاً أطول)...');
  const uniqueId = `${Date.now()}_${userId}`;
  const inputPath = path.join(tempDir, `in_${uniqueId}.mp4`);
  const outputPath = path.join(tempDir, `out_${uniqueId}.mp4`);

  try {
    const fileLink = await ctx.telegram.getFileLink(ctx.message.video.file_id);
    await downloadVideo(fileLink.href, inputPath);
    await processVideoSmartly(inputPath, outputPath);

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '☁️ رفع للدرايف...');
    const folderId = await getOrCreateFolder(STORAGE_FOLDER_NAME);
    const metadataString = JSON.stringify(sessionData);
    
    await drive.files.create({
      resource: {
        name: `VID_${uniqueId}.mp4`,
        parents: [folderId],
        description: metadataString
      },
      media: { mimeType: 'video/mp4', body: fs.createReadStream(outputPath) }
    });

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '✅ تم التخزين بجودة عالية!');
  } catch (error) {
    console.error(error);
    ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ فشل: ${error.message}`);
  } finally {
    try { fs.unlinkSync(inputPath); fs.unlinkSync(outputPath); } catch(e){}
  }
});

// ====================
// دوال مساعدة
// ====================
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

// بحث مباشر بدون كاش لضمان الدقة
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
  const writer = fs.createWriteStream(fileName);
  const response = await axios({ method: 'GET', url: url, responseType: 'stream' });
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(fileName));
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
  if(process.env.WEBHOOK_URL) {
      await bot.telegram.setWebhook(`${process.env.WEBHOOK_URL}/webhook/${process.env.TELEGRAM_BOT_TOKEN}`);
  }
});
