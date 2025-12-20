require('dotenv').config();

// =========================================================
// 💎 PROJECT: DOOMSDAY V6 (High Quality Edition) 💎
// 🌟 Features: CRF 23 Quality + Smart Encoding + Auto-Delete
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

// --- تنظيف الملفات المؤقتة ---
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
try { fs.readdirSync(tempDir).forEach(f => fs.unlinkSync(path.join(tempDir, f))); } catch(e){}

// --- إعدادات جوجل ---
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.REDIRECT_URI
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

oauth2Client.on('tokens', (tokens) => {
  if (tokens.refresh_token) console.log('🔄 Token Refreshed.');
  oauth2Client.setCredentials(tokens);
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

const userSessions = new Map();
const STORAGE_FOLDER = 'HQ_Shorts_Vault'; // خزنة الجودة العالية

// ========================================================
// 🌟 محرك الجودة العالية (HQ Engine)
// ========================================================
function processVideoHighQuality(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    // الإعدادات الجديدة:
    // -preset superfast: توازن ممتاز بين السرعة والجودة (أفضل من ultrafast بمراحل)
    // -crf 23: الجودة القياسية العالية (كلما قل الرقم زادت الجودة، 23 هو الأفضل لليوتيوب)
    // -vf scale...: يضمن أن الفيديو 1080x1920 بدقة عالية مع ملء الفراغات بالأسود (بدون مط)
    
    console.log('🌟 Encoding in High Quality (CRF 23)...');
    
    const command = `"${ffmpegPath}" -y -i "${inputPath}" -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" -t 59 -c:v libx264 -preset superfast -crf 23 -maxrate 6M -bufsize 12M -c:a aac -b:a 192k -ar 44100 "${outputPath}"`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('Encoding Error:', stderr); // طباعة الخطأ إذا حدث
        reject(error);
      } else {
        console.log('✅ HQ Encoding Done.');
        resolve(outputPath);
      }
    });
  });
}

// ========================================================
// 🎮 الأوامر
// ========================================================

bot.start((ctx) => ctx.reply('💎 **نظام الجودة العالية جاهز**\n\n1️⃣ أرسل العنوان\n2️⃣ أرسل الفيديو\n3️⃣ /list\n4️⃣ /Sher'));

// استقبال النص
bot.on('text', (ctx) => {
  if(ctx.message.text.startsWith('/')) return;
  const lines = ctx.message.text.split('\n');
  let title = lines[0].replace('العنوان:', '').trim();
  
  if (title) {
    userSessions.set(ctx.from.id, { userId: ctx.from.id, title, description: '', hashtags: '' });
    ctx.reply(`📝 تم حفظ العنوان: **${title}**\n🎥 أرسل الفيديو الآن (سيتم معالجته بجودة عالية).`);
  }
});

// استقبال الفيديو
bot.on('video', async (ctx) => {
  const userId = ctx.from.id;
  const session = userSessions.get(userId);
  if (!session) return ctx.reply('⚠️ أرسل العنوان أولاً!');

  // تنبيه الحجم (ريندر يفصل إذا الفيديو ضخم جداً)
  if (ctx.message.video.file_size > 45 * 1024 * 1024) return ctx.reply('❌ الفيديو أكبر من 45MB. حاول تقليل الحجم قليلاً.');

  const msg = await ctx.reply('🌟 جاري المعالجة بجودة عالية (قد يستغرق دقيقة)...');
  
  const uniqueId = `${Date.now()}_${userId}`;
  const inputPath = path.join(tempDir, `in_${uniqueId}.mp4`);
  const outputPath = path.join(tempDir, `out_${uniqueId}.mp4`);

  try {
    const link = await ctx.telegram.getFileLink(ctx.message.video.file_id);
    await downloadVideo(link.href, inputPath);
    
    // استخدام محرك الجودة العالية
    await processVideoHighQuality(inputPath, outputPath);

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '☁️ جاري الرفع للخزنة...');
    const folderId = await getOrCreateFolder(STORAGE_FOLDER);
    
    const metadata = JSON.stringify({ title: session.title });

    await drive.files.create({
        resource: { 
            name: `HQ_${uniqueId}.mp4`, 
            parents: [folderId], 
            description: metadata 
        },
        media: { mimeType: 'video/mp4', body: fs.createReadStream(outputPath) }
    });

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `✅ **تم التخزين بجودة عالية!**\nالعنوان: ${session.title}\nتأكد: /list`);
  
  } catch (e) {
    console.error(e);
    ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ فشل: ${e.message}`);
  } finally {
    try { fs.unlinkSync(inputPath); fs.unlinkSync(outputPath); } catch(e){}
  }
});

// أمر LIST
bot.command('list', async (ctx) => {
  ctx.reply('🔍 جاري الفحص...').then(async (statusMsg) => {
    try {
      const folderId = await getOrCreateFolder(STORAGE_FOLDER);
      const res = await drive.files.list({
        q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
        pageSize: 20,
        fields: 'files(id, name, description)'
      });

      const files = res.data.files;
      if (!files || !files.length) return ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, '📦 الخزنة فارغة.');

      let text = `📦 **محتوى الخزنة (${files.length}):**\n\n`;
      files.forEach((f, i) => {
          let title = f.name;
          if (f.description && f.description.startsWith('{')) {
              try { title = JSON.parse(f.description).title; } catch(e){}
          }
          text += `✨ ${i+1}. ${title}\n`;
      });

      await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, text);
    } catch (e) {
      ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, `❌ خطأ: ${e.message}`);
    }
  });
});

// أمر SHER (نشر + حذف)
bot.command('Sher', async (ctx) => {
  ctx.reply('🚀 بدء النشر...').then(async (statusMsg) => {
    try {
      const folderId = await getOrCreateFolder(STORAGE_FOLDER);
      const listRes = await drive.files.list({
        q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
        pageSize: 50,
        fields: 'files(id, name, description)'
      });

      if (!listRes.data.files.length) return ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, '⚠️ لا يوجد فيديوهات.');

      const file = listRes.data.files[Math.floor(Math.random() * listRes.data.files.length)];
      
      let title = file.name.replace('.mp4','');
      if (file.description && file.description.startsWith('{')) {
          try { title = JSON.parse(file.description).title; } catch(e){}
      }

      let finalTitle = `${title} #shorts`;
      if (finalTitle.length > 99) finalTitle = finalTitle.substring(0, 90) + ' #shorts';

      await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, `📡 رفع: **${finalTitle}**`);

      const stream = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'stream' });
      const ytRes = await youtube.videos.insert({
        part: 'snippet,status',
        requestBody: {
          snippet: { 
              title: finalTitle, 
              description: `${finalTitle}\n\n#viral #shorts #trending`, 
              categoryId: '24' 
          },
          status: { privacyStatus: 'public', selfDeclaredMadeForKids: false }
        },
        media: { body: stream.data }
      });

      if (ytRes.data.id) {
          await drive.files.delete({ fileId: file.id });
          await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, `✅🔥 **تم النشر!**\nhttps://youtube.com/shorts/${ytRes.data.id}`);
      }

    } catch (e) {
      console.error(e);
      ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, `❌ فشل: ${e.message}`);
    }
  });
});

// --- أدوات ---
async function getOrCreateFolder(name) {
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
app.get('/', (req, res) => res.send('HQ Bot Active'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Ready on port ${PORT}`);
  if(process.env.WEBHOOK_URL) await bot.telegram.setWebhook(`${process.env.WEBHOOK_URL}/webhook/${process.env.TELEGRAM_BOT_TOKEN}`);
});
