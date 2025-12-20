require('dotenv').config();

// =========================================================
// 💀 PROJECT: DOOMSDAY V5 (Clean Connection Edition) 💀
// =========================================================

const express = require('express');
const { Telegraf } = require('telegraf');
const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const app = express();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// ❌❌❌ تم حذف httpsAgent لأنه سبب التعليق في Render ❌❌❌
// Google Options: Default

// --- تنظيف ---
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
try { fs.readdirSync(tempDir).forEach(f => fs.unlinkSync(path.join(tempDir, f))); } catch(e){}

// --- اتصال جوجل ---
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.REDIRECT_URI
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

// تحديث التوكن (مع لوج للتأكد)
oauth2Client.on('tokens', (tokens) => {
  if (tokens.refresh_token) console.log('🔄 Token Refreshed.');
  oauth2Client.setCredentials(tokens);
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

const userSessions = new Map();
const STORAGE_FOLDER = 'Shorts_Vault_Final'; 

// ========================================================
// ⚡ المعالجة
// ========================================================
function processVideoSmartly(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    // محاولة النسخ المباشر
    const copyCmd = `"${ffmpegPath}" -y -i "${inputPath}" -t 59 -c copy -map 0 "${outputPath}"`;
    exec(copyCmd, (error) => {
      if (!error) resolve(outputPath);
      else {
        // محاولة الضغط السريع
        const encodeCmd = `"${ffmpegPath}" -y -i "${inputPath}" -t 59 -c:v libx264 -preset ultrafast -crf 28 -c:a aac "${outputPath}"`;
        exec(encodeCmd, (err) => {
          if (err) reject(err); else resolve(outputPath);
        });
      }
    });
  });
}

// ========================================================
// 🎮 الأوامر
// ========================================================

bot.start((ctx) => ctx.reply('✅ **البوت يعمل بدون تعقيدات.**\n\nجرب الآن: /list'));

// استقبال البيانات
bot.on('text', (ctx) => {
  if(ctx.message.text.startsWith('/')) return;
  const lines = ctx.message.text.split('\n');
  let title = lines[0].replace('العنوان:', '').trim();
  let desc = '', tags = '';
  
  if (title) {
    userSessions.set(ctx.from.id, { userId: ctx.from.id, title, description: desc, hashtags: tags });
    ctx.reply(`💾 تم حفظ العنوان: ${title}\nأرسل الفيديو.`);
  }
});

// استقبال الفيديو
bot.on('video', async (ctx) => {
  const userId = ctx.from.id;
  const session = userSessions.get(userId);
  if (!session) return ctx.reply('⚠️ أرسل العنوان أولاً!');
  
  const msg = await ctx.reply('⚡ جاري العمل...');
  const uniqueId = `${Date.now()}_${userId}`;
  const inputPath = path.join(tempDir, `in_${uniqueId}.mp4`);
  const outputPath = path.join(tempDir, `out_${uniqueId}.mp4`);

  try {
    const link = await ctx.telegram.getFileLink(ctx.message.video.file_id);
    await downloadVideo(link.href, inputPath);
    await processVideoSmartly(inputPath, outputPath);

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '☁️ رفع للدرايف...');
    const folderId = await getOrCreateFolder(STORAGE_FOLDER);
    
    // وصف بسيط بصيغة JSON
    const metadata = JSON.stringify({ title: session.title });

    await drive.files.create({
        resource: { name: `VID_${uniqueId}.mp4`, parents: [folderId], description: metadata },
        media: { mimeType: 'video/mp4', body: fs.createReadStream(outputPath) }
    });

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `✅ **تم.**\nجرب /list`);
  } catch (e) {
    ctx.reply(`❌ خطأ: ${e.message}`);
  } finally {
    try { fs.unlinkSync(inputPath); fs.unlinkSync(outputPath); } catch(e){}
  }
});

// 🔥🔥🔥 أمر LIST المصحح (بدون انتظار طويل) 🔥🔥🔥
bot.command('list', async (ctx) => {
  // رد فوري بدون await للتأكد أن البوت يسمع
  ctx.reply('🔍 لحظة...').then(async (statusMsg) => {
    try {
      const folderId = await getOrCreateFolder(STORAGE_FOLDER);
      
      const res = await drive.files.list({
        q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
        pageSize: 20,
        fields: 'files(id, name, description)'
      });

      const files = res.data.files;
      if (!files || !files.length) {
          return ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, '📦 الخزنة فارغة.');
      }

      let text = `📦 **الموجود (${files.length}):**\n\n`;
      files.forEach((f, i) => {
          let title = f.name;
          if (f.description && f.description.startsWith('{')) {
              try { title = JSON.parse(f.description).title; } catch(e){}
          }
          text += `🔹 ${i+1}. ${title}\n`;
      });

      await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, text);
    } catch (e) {
      console.error(e);
      ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, `❌ خطأ في جوجل: ${e.message}`);
    }
  });
});

// 🔥🔥🔥 أمر SHER (بدون تعقيد) 🔥🔥🔥
bot.command('Sher', async (ctx) => {
  ctx.reply('🚀 بدء النشر...').then(async (statusMsg) => {
    try {
      const folderId = await getOrCreateFolder(STORAGE_FOLDER);
      const listRes = await drive.files.list({
        q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
        pageSize: 50,
        fields: 'files(id, name, description)'
      });

      if (!listRes.data.files.length) return ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, '⚠️ ماكو فيديوهات.');

      const file = listRes.data.files[Math.floor(Math.random() * listRes.data.files.length)];
      let title = file.name.replace('.mp4', '');
      if (file.description && file.description.startsWith('{')) {
          try { title = JSON.parse(file.description).title; } catch(e){}
      }
      
      let finalTitle = `${title} #shorts`;
      if (finalTitle.length > 99) finalTitle = finalTitle.substring(0, 90) + ' #shorts';

      await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, `📡 رفع: ${finalTitle}`);

      const stream = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'stream' });
      const ytRes = await youtube.videos.insert({
        part: 'snippet,status',
        requestBody: {
          snippet: { title: finalTitle, description: `${finalTitle}\n\n#viral`, categoryId: '24' },
          status: { privacyStatus: 'public' }
        },
        media: { body: stream.data }
      });

      if (ytRes.data.id) {
          await drive.files.delete({ fileId: file.id });
          await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, `✅ تم النشر والحذف!\nhttps://youtube.com/shorts/${ytRes.data.id}`);
      }

    } catch (e) {
      console.error(e);
      ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, `❌ فشل: ${e.message}`);
    }
  });
});

// --- أدوات ---
async function getOrCreateFolder(name) {
  // بحث مباشر بدون كاش لتجنب الأخطاء
  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`,
    fields: 'files(id)'
  });
  if (res.data.files.length > 0) return res.data.files[0].id;
  const folder = await drive.files.create({
    resource: { name, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id'
  });
  return folder.data.id;
}

async function downloadVideo(url, dest) {
  const writer = fs.createWriteStream(dest);
  const response = await axios({ method: 'GET', url, responseType: 'stream' });
  response.data.pipe(writer);
  return new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });
}

app.use(express.json());
app.post(`/webhook/${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => { bot.handleUpdate(req.body); res.sendStatus(200); });
app.get('/', (req, res) => res.send('Bot Active'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Ready on port ${PORT}`);
  if(process.env.WEBHOOK_URL) await bot.telegram.setWebhook(`${process.env.WEBHOOK_URL}/webhook/${process.env.TELEGRAM_BOT_TOKEN}`);
});
