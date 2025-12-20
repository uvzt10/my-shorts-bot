require('dotenv').config();

// =========================================================
// 💀 PROJECT: DOOMSDAY V4 (Anti-Silence Edition) 💀
// 🚀 Features: Verbose Logging + Timeout Protection + Force Reply
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

// --- 1. الشبكة ---
const httpsAgent = new (require('https').Agent)({ keepAlive: true, timeout: 60000 });
bot.telegram.options.agent = httpsAgent;
google.options({ agent: httpsAgent });

// --- 2. التنظيف ---
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
try { fs.readdirSync(tempDir).forEach(f => fs.unlinkSync(path.join(tempDir, f))); } catch(e){}

// --- 3. جوجل ---
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.REDIRECT_URI
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

// تحديث التوكن
oauth2Client.on('tokens', (tokens) => {
  if (tokens.refresh_token) console.log('🔄 Token Refreshed.');
  oauth2Client.setCredentials(tokens);
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

const userSessions = new Map();
const STORAGE_FOLDER = 'Smart_Shorts_Vault'; 

// ========================================================
// ⚡ المحرك الهجين
// ========================================================
function processVideoSmartly(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const copyCmd = `"${ffmpegPath}" -y -i "${inputPath}" -t 59 -c copy -map 0 "${outputPath}"`;
    exec(copyCmd, (error) => {
      if (!error) resolve(outputPath);
      else {
        console.log('⚠️ Copy failed, encoding...');
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

bot.start((ctx) => ctx.reply('💀 **DOOMSDAY ONLINE**\n\nأرسل البيانات ثم الفيديو.\nالأوامر: /list , /Sher'));

// استقبال النص
bot.on('text', (ctx) => {
  if(ctx.message.text.startsWith('/')) return;
  const lines = ctx.message.text.split('\n');
  let title = '', desc = '', tags = '';
  lines.forEach(line => {
      if(line.includes('العنوان:')) title = line.split(':')[1].trim();
      else if(line.includes('الوصف:')) desc = line.split(':')[1].trim();
      else if(line.includes('#')) tags += line + ' ';
      else if(!title) title = line;
  });

  if (title) {
    userSessions.set(ctx.from.id, { userId: ctx.from.id, title, description: desc, hashtags: tags });
    ctx.reply(`💾 تم الحفظ: "${title}"\n🎥 أرسل الفيديو.`);
  } else {
    ctx.reply('⚠️ الصيغة:\nالعنوان: ...\nالوصف: ...\n#هاشتاغات');
  }
});

// استقبال الفيديو
bot.on('video', async (ctx) => {
  const userId = ctx.from.id;
  const session = userSessions.get(userId);
  if (!session) return ctx.reply('⚠️ أرسل التفاصيل أولاً!');
  
  let msg = await ctx.reply('⚡ جاري المعالجة...');
  const uniqueId = `${Date.now()}_${userId}`;
  const inputPath = path.join(tempDir, `in_${uniqueId}.mp4`);
  const outputPath = path.join(tempDir, `out_${uniqueId}.mp4`);

  try {
    const link = await ctx.telegram.getFileLink(ctx.message.video.file_id);
    await downloadVideo(link.href, inputPath);
    await processVideoSmartly(inputPath, outputPath);

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '☁️ رفع للدرايف...');
    const folderId = await getOrCreateFolder(STORAGE_FOLDER);
    const metadataCapsule = JSON.stringify(session);

    await drive.files.create({
        resource: { name: `VIDEO_${uniqueId}.mp4`, parents: [folderId], description: metadataCapsule },
        media: { mimeType: 'video/mp4', body: fs.createReadStream(outputPath) }
    });

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `✅ **تم!**\nالعنوان: ${session.title}\nاضغط /list للتأكد.`);
  } catch (e) {
    console.error(e);
    ctx.reply(`❌ خطأ: ${e.message}`);
  } finally {
    try { fs.unlinkSync(inputPath); fs.unlinkSync(outputPath); } catch(e){}
  }
});

// 🔥🔥🔥 أمر LIST (النسخة الثرثارة لكشف الخطأ) 🔥🔥🔥
bot.command('list', async (ctx) => {
  // 1. رد فوري لكسر الصمت
  const msg = await ctx.reply('📡 1. جاري الاتصال بجوجل...'); 
  
  try {
    // 2. البحث عن المجلد
    const folderId = await getOrCreateFolder(STORAGE_FOLDER);
    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `📂 2. المجلد موجود (ID: ${folderId.substr(0, 5)}...)\nجاري جلب الملفات...`);

    // 3. جلب الملفات
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
      pageSize: 20,
      fields: 'files(id, name, description)'
    });

    const files = res.data.files;
    if (!files || !files.length) {
        return ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '📦 الخزنة فارغة تماماً.');
    }

    let text = `📦 **المخزون (${files.length}):**\n\n`;
    files.forEach((f, i) => {
        let displayTitle = f.name;
        if (f.description) {
            try {
                const meta = JSON.parse(f.description);
                if (meta.title) displayTitle = meta.title;
            } catch (e) {}
        }
        text += `🎬 ${i+1}. ${displayTitle}\n`;
    });

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, text);

  } catch (e) {
    console.error(e);
    // طباعة الخطأ للمستخدم لنعرف السبب
    ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ فشل النظام:\n${e.message}`);
  }
});

// 🔥🔥🔥 أمر SHER (النسخة الثرثارة) 🔥🔥🔥
bot.command('Sher', async (ctx) => {
  const msg = await ctx.reply('🚀 1. بدء محرك النشر...');

  try {
    const folderId = await getOrCreateFolder(STORAGE_FOLDER);
    const listRes = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
      pageSize: 100,
      fields: 'files(id, name, description)'
    });

    if (!listRes.data.files.length) return ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '⚠️ الخزنة فارغة!');

    // اختيار الملف
    const file = listRes.data.files[Math.floor(Math.random() * listRes.data.files.length)];
    let meta = { title: file.name.replace('.mp4',''), description: '', hashtags: '#shorts' };
    if (file.description) { try { meta = { ...meta, ...JSON.parse(file.description) }; } catch(e){} }

    let finalTitle = meta.title;
    if (!finalTitle.toLowerCase().includes('#shorts')) finalTitle += ' #shorts';
    if (finalTitle.length > 100) finalTitle = finalTitle.substring(0, 90) + '... #shorts';
    const fullDesc = `${finalTitle}\n\n${meta.description}\n\n${meta.hashtags}\n\nSubscribe!`.substring(0, 4900);

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `📡 2. رفع: **${finalTitle}**...`);

    const stream = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'stream' });
    const ytRes = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: { title: finalTitle, description: fullDesc, categoryId: '24', tags: ["shorts"] },
        status: { privacyStatus: 'public', selfDeclaredMadeForKids: false }
      },
      media: { body: stream.data }
    });

    if (ytRes.data.id) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '🗑️ 3. جاري الحذف من الخزنة...');
        await drive.files.delete({ fileId: file.id });
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `✅🔥 **تم!**\n🔗 https://youtube.com/shorts/${ytRes.data.id}`);
    }

  } catch (e) {
    console.error(e);
    ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ خطأ النشر:\n${e.message}`);
  }
});

// --- أدوات مساعدة ---
// كاش للمجلدات لتسريع الاستجابة (مهم جداً للسرعة)
let folderCache = {};
async function getOrCreateFolder(name) {
  if (folderCache[name]) return folderCache[name];
  
  // البحث عن المجلد
  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`,
    fields: 'files(id, name)'
  });

  if (res.data.files.length > 0) {
    folderCache[name] = res.data.files[0].id;
    return res.data.files[0].id;
  } else {
    // إنشاء المجلد إذا لم يوجد
    const folder = await drive.files.create({
      resource: { name, mimeType: 'application/vnd.google-apps.folder' },
      fields: 'id'
    });
    folderCache[name] = folder.data.id;
    return folder.data.id;
  }
}

async function downloadVideo(url, dest) {
  const writer = fs.createWriteStream(dest);
  const response = await axios({ method: 'GET', url, responseType: 'stream' });
  response.data.pipe(writer);
  return new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });
}

app.use(express.json());
app.post(`/webhook/${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => { bot.handleUpdate(req.body); res.sendStatus(200); });
app.get('/', (req, res) => res.send('DOOMSDAY V4 IS ACTIVE.'));

process.on('uncaughtException', (err) => console.log('Crash Prevented:', err.message));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 SYSTEM READY on PORT ${PORT}`);
  if(process.env.WEBHOOK_URL) await bot.telegram.setWebhook(`${process.env.WEBHOOK_URL}/webhook/${process.env.TELEGRAM_BOT_TOKEN}`);
});
