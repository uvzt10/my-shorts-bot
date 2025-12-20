require('dotenv').config();

// =========================================================
// 💀 DOOMSDAY FINAL: Stable High Quality (No Crash) 💀
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

// لا يوجد Agent لتجنب مشاكل الاتصال

const STORAGE_FOLDER_NAME = 'Random_Shorts_Storage'; 
const LOGS_FOLDER_NAME = 'Daily_Upload_Logs'; 

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

oauth2Client.on('tokens', (tokens) => {
  if (tokens.refresh_token) console.log('🔄 Token Refreshed.');
  oauth2Client.setCredentials(tokens);
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
const userSessions = new Map();

// ====================
// 1. المنبه الداخلي
// ====================
setInterval(async () => {
  const nowNY = moment().tz("America/New_York");
  if (nowNY.hour() === 18) {
    const todayDate = nowNY.format('YYYY-MM-DD');
    const isUploaded = await checkIfUploadedToday(todayDate);
    if (!isUploaded) {
      console.log('🚀 Auto-Upload Started...');
      await triggerUpload(todayDate);
    }
  }
}, 60000); 

// ====================
// 2. معالجة الفيديو (جودة عالية مستقرة)
// ====================
function processVideoSmartly(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    console.log('🌟 Encoding High Quality (Stable)...');
    
    // التعديل لضمان عدم انهيار السيرفر المجاني:
    // CRF 23: جودة ممتازة جداً لليوتيوب (بدلاً من 18 التي تقتل السيرفر)
    // Preset Superfast: سرعة معقولة وجودة جيدة
    // Bufsize محدود: لمنع امتلاء الذاكرة
    
    const encodeCmd = `"${ffmpegPath}" -y -i "${inputPath}" -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" -t 59 -c:v libx264 -preset superfast -crf 23 -maxrate 5M -bufsize 10M -c:a aac -b:a 128k -ar 44100 "${outputPath}"`;

    exec(encodeCmd, (err) => {
      if (err) {
          console.error('Encoding Error:', err);
          reject(err); 
      } else { 
          resolve(outputPath); 
      }
    });
  });
}

// ====================
// 3. دالة النشر
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
    if (randomFile.description) { 
        try { metadata = JSON.parse(randomFile.description); } catch(e) {} 
    }

    let finalTitle = metadata.title || randomFile.name.replace('.mp4', '');
    if (!finalTitle.includes('#')) finalTitle += ' #shorts';
    if (finalTitle.length > 100) finalTitle = finalTitle.substring(0, 90) + ' #shorts';

    if (manualChatId) bot.telegram.sendMessage(manualChatId, `📡 رفع: ${finalTitle}`);

    const stream = await drive.files.get({ fileId: randomFile.id, alt: 'media' }, { responseType: 'stream' });

    const ytRes = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title: finalTitle,
          description: `${finalTitle}\n\n${metadata.description}\n\n#shorts #viral`,
          categoryId: '24',
          tags: ["shorts"]
        },
        status: { privacyStatus: 'public' }
      },
      media: { body: stream.data }
    });

    if (ytRes.data.id) {
        await drive.files.delete({ fileId: randomFile.id });
        if (!manualChatId) await createLogFile(todayDate);
        
        const msg = `✅ تم النشر!\nhttps://youtube.com/shorts/${ytRes.data.id}`;
        if (manualChatId) bot.telegram.sendMessage(manualChatId, msg);
        else if (metadata.userId) bot.telegram.sendMessage(metadata.userId, msg);
    }

  } catch (error) {
    if (manualChatId) bot.telegram.sendMessage(manualChatId, `❌ خطأ: ${error.message}`);
  }
}

// ====================
// 4. الأوامر
// ====================

bot.start((ctx) => ctx.reply('✅ **البوت يعمل باستقرار!**\n\n1. أرسل العنوان\n2. أرسل الفيديو\n3. /list\n4. /Sher'));

// LIST
bot.command('list', async (ctx) => {
  ctx.reply('🔍 لحظة...').then(async (m) => {
    try {
      const folderId = await getOrCreateFolder(STORAGE_FOLDER_NAME);
      const res = await drive.files.list({
        q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
        pageSize: 50,
        fields: 'files(id, name, description)'
      });

      const files = res.data.files;
      if (!files || !files.length) return ctx.telegram.editMessageText(ctx.chat.id, m.message_id, null, '📦 فارغة.');
      
      let msg = `📦 **الموجود (${files.length}):**\n\n`;
      files.forEach((f, i) => {
          let t = f.name;
          if (f.description) { try { t = JSON.parse(f.description).title; } catch(e){} }
          msg += `${i+1}. ${t}\n`;
      });
      
      await ctx.telegram.editMessageText(ctx.chat.id, m.message_id, null, msg);
    } catch (e) {
      ctx.telegram.editMessageText(ctx.chat.id, m.message_id, null, `❌ خطأ: ${e.message}`);
    }
  });
});

bot.command('Sher', async (ctx) => {
  ctx.reply('🚀 بدأت...').then(() => {
      triggerUpload(moment().format('YYYY-MM-DD'), ctx.chat.id);
  });
});

bot.on('text', (ctx) => {
  if (ctx.message.text.startsWith('/')) return;
  const lines = ctx.message.text.split('\n');
  const title = lines[0].replace('العنوان:', '').trim();
  if (title) {
    userSessions.set(ctx.from.id, { userId: ctx.from.id, title, description: '', hashtags: '' });
    ctx.reply(`📝 تم حفظ: ${title}\nأرسل الفيديو.`);
  }
});

bot.on('video', async (ctx) => {
  const userId = ctx.from.id;
  const session = userSessions.get(userId);
  if (!session) return ctx.reply('⚠️ العنوان أولاً.');

  const msg = await ctx.reply('🔥 معالجة (جودة عالية مستقرة)...');
  const uniqueId = `${Date.now()}_${userId}`;
  const inputPath = path.join(tempDir, `in_${uniqueId}.mp4`);
  const outputPath = path.join(tempDir, `out_${uniqueId}.mp4`);

  try {
    const link = await ctx.telegram.getFileLink(ctx.message.video.file_id);
    await downloadVideo(link.href, inputPath);
    await processVideoSmartly(inputPath, outputPath);

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '☁️ رفع للدرايف...');
    const folderId = await getOrCreateFolder(STORAGE_FOLDER_NAME);
    
    await drive.files.create({
      resource: {
        name: `VID_${uniqueId}.mp4`,
        parents: [folderId],
        description: JSON.stringify(session)
      },
      media: { mimeType: 'video/mp4', body: fs.createReadStream(outputPath) }
    });

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '✅ تم التخزين!');
  } catch (e) {
    ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ فشل: ${e.message}`);
  } finally {
    try { fs.unlinkSync(inputPath); fs.unlinkSync(outputPath); } catch(e){}
  }
});

// أدوات
async function checkIfUploadedToday(date) {
  const fid = await getOrCreateFolder(LOGS_FOLDER_NAME);
  const res = await drive.files.list({ q: `'${fid}' in parents and name = 'LOG_${date}.txt' and trashed = false` });
  return res.data.files.length > 0;
}

async function createLogFile(date) {
  const fid = await getOrCreateFolder(LOGS_FOLDER_NAME);
  await drive.files.create({ resource: { name: `LOG_${date}.txt`, parents: [fid] }, media: { mimeType: 'text/plain', body: 'Done' } });
}

async function getOrCreateFolder(name) {
  const res = await drive.files.list({ q: `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false` });
  if (res.data.files.length > 0) return res.data.files[0].id;
  const folder = await drive.files.create({ resource: { name, mimeType: 'application/vnd.google-apps.folder' } });
  return folder.data.id;
}

async function downloadVideo(url, dest) {
  const writer = fs.createWriteStream(dest);
  const response = await axios({ method: 'GET', url, responseType: 'stream' });
  response.data.pipe(writer);
  return new Promise((r, j) => { writer.on('finish', r); writer.on('error', j); });
}

app.use(express.json());
app.post(`/webhook/${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => { bot.handleUpdate(req.body); res.sendStatus(200); });
app.get('/', (req, res) => res.send('Bot Active'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`✅ Server running on port ${PORT}`);
  if(process.env.WEBHOOK_URL) await bot.telegram.setWebhook(`${process.env.WEBHOOK_URL}/webhook/${process.env.TELEGRAM_BOT_TOKEN}`);
});
