require('dotenv').config();

// =========================================================
// ⚡ PROTOCOL: ZERO-LATENCY (The "Stream Copy" Hack) ⚡
// Quality: 100% (Lossless) | Speed: Instant
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

// --- إعدادات الشبكة القتالية ---
const httpsAgent = new (require('https').Agent)({ keepAlive: true, timeout: 600000 });
bot.telegram.options.agent = httpsAgent;
google.options({ agent: httpsAgent });

// --- تنظيف الذخيرة ---
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
try { fs.readdirSync(tempDir).forEach(f => fs.unlinkSync(path.join(tempDir, f))); } catch(e){}

// --- إعدادات جوجل ---
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.REDIRECT_URI
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
oauth2Client.on('tokens', (tokens) => { if(tokens.refresh_token) oauth2Client.setCredentials(tokens); });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

const userSessions = new Map();
const STORAGE_FOLDER = 'ZeroLatency_Storage';
const LOGS_FOLDER = 'ZeroLatency_Logs';

// ========================================================
// 1. الثغرة: القص والنسخ بدون إعادة تشفير (The Hack) 🏴‍☠️
// ========================================================

function processVideoSmartly(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    console.log('⚡⚙️ Activating Stream Copy (Zero-CPU Mode)...');
    
    // الثغرة هنا: -c copy
    // هذا الأمر يقول لـ FFmpeg: "لا تلمس الفيديو، فقط انقله كما هو وقصه عند 59 ثانية"
    // النتيجة: جودة أصلية + سرعة البرق
    const command = `"${ffmpegPath}" -y -i "${inputPath}" -t 59 -c copy -map 0 "${outputPath}"`;
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.log('⚠️ Stream Copy failed (Codec issue?), switching to Fast Re-encode fallback...');
        // خطة ب: إذا فشل النسخ المباشر (نادر جداً)، نستخدم أسرع ضغط ممكن
        const fallback = `"${ffmpegPath}" -y -i "${inputPath}" -t 59 -c:v libx264 -preset ultrafast -crf 28 "${outputPath}"`;
        exec(fallback, (err) => {
            if(err) reject(err);
            else resolve(outputPath);
        });
      } else {
        resolve(outputPath);
      }
    });
  });
}

// ========================================================
// 2. المجدول العصبي (Neural Scheduler) 🧠
// ========================================================

setInterval(async () => {
  const nowNY = moment().tz("America/New_York");
  // النشر بين 12 ظهراً و 6 مساءً بتوقيت نيويورك (أفضل وقت للمشاهدات الأمريكية)
  if (nowNY.hour() >= 12 && nowNY.hour() <= 18) {
      // فحص كل 15 دقيقة
      if (nowNY.minute() % 15 === 0) {
          const todayDate = nowNY.format('YYYY-MM-DD');
          const isUploaded = await checkIfUploadedToday(todayDate);
          
          // عشوائية ذكية: احتمالية 50% للنشر في أي ربع ساعة
          if (!isUploaded && Math.random() > 0.5) {
              console.log('🚀🔥 Zero-Latency Auto-Upload Initiated...');
              triggerUploadWithRetry(todayDate);
          }
      }
  }
}, 60000); // فحص الدقيقة

// ========================================================
// 3. نظام الرفع الذكي (Smart Upload) 📡
// ========================================================

async function triggerUploadWithRetry(todayDate, manualChatId = null, attempts = 1) {
    try {
        await executeUpload(todayDate, manualChatId);
    } catch (error) {
        if (attempts <= 2) {
            console.log(`⚠️ Retry ${attempts}/2...`);
            setTimeout(() => triggerUploadWithRetry(todayDate, manualChatId, attempts + 1), 60000);
        } else if (manualChatId) {
            bot.telegram.sendMessage(manualChatId, `❌ فشل نهائي: ${error.message}`);
        }
    }
}

async function executeUpload(todayDate, manualChatId) {
    if (!manualChatId && await checkIfUploadedToday(todayDate)) return;

    const folderId = await getOrCreateFolder(STORAGE_FOLDER);
    const listRes = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
      pageSize: 100
    });

    if (!listRes.data.files.length) throw new Error('Empty Storage');

    const randomFile = listRes.data.files[Math.floor(Math.random() * listRes.data.files.length)];
    let metadata = { title: 'Viral Short', description: '', hashtags: '' };
    try { metadata = JSON.parse(randomFile.description); } catch(e) {}

    // تحسين العنوان تلقائياً (SEO Hack)
    let finalTitle = metadata.title;
    if (!finalTitle.includes('#')) finalTitle += ' #shorts';

    // وصف ذكي مليء بالكلمات المفتاحية
    const smartDesc = `${finalTitle}\n\n${metadata.description}\n\n${metadata.hashtags}\n\nSubscribe for more satisfying content! #asmr #satisfying #viral #usa #trending`;

    if(manualChatId) bot.telegram.sendMessage(manualChatId, `🚀 جاري الرفع: ${finalTitle}`);

    const driveStream = await drive.files.get({ fileId: randomFile.id, alt: 'media' }, { responseType: 'stream' });

    const youtubeRes = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title: finalTitle.substring(0, 99),
          description: smartDesc.substring(0, 4900),
          categoryId: '24',
          tags: ["shorts", "satisfying", "asmr", "viral", "usa"]
        },
        status: { privacyStatus: 'public', selfDeclaredMadeForKids: false }
      },
      media: { body: driveStream.data }
    });

    // حذف فوري لتوفير مساحة الدرايف
    drive.files.delete({ fileId: randomFile.id }).catch(()=>{});
    if (!manualChatId) await createLogFile(todayDate);

    if (manualChatId || metadata.userId) {
        const uid = manualChatId || metadata.userId;
        bot.telegram.sendMessage(uid, `✅🔥 **تم!**\n🔗 https://youtube.com/shorts/${youtubeRes.data.id}`);
    }
}

// ========================================================
// 4. واجهة تيليجرام (Command Center) 🎮
// ========================================================

bot.start((ctx) => ctx.reply('⚡ *Zero-Latency Bot*\nأرسل: العنوان: ...\nثم الفيديو.'));

bot.command('force', (ctx) => triggerUploadWithRetry(moment().format('YYYY-MM-DD'), ctx.chat.id));

bot.on('text', (ctx) => {
    if(ctx.message.text.startsWith('/')) return;
    const lines = ctx.message.text.split('\n');
    let title = lines[0].replace('العنوان:', '').trim();
    let desc = lines[1] || '';
    let tags = lines.join(' ').match(/#[a-z0-9_]+/gi) || [];
    
    userSessions.set(ctx.from.id, { 
        userId: ctx.from.id, 
        title: title || 'Amazing Short', 
        description: desc, 
        hashtags: tags.join(' ') 
    });
    ctx.reply('📝 تم الحفظ. أرسل الفيديو!');
});

bot.on('video', async (ctx) => {
    const userId = ctx.from.id;
    const session = userSessions.get(userId) || { userId, title: 'Short', description: '', hashtags: '' };
    
    // فلتر الحجم (ريندر يكره الملفات الكبيرة)
    if (ctx.message.video.file_size > 49 * 1024 * 1024) return ctx.reply('❌ حجم كبير جداً.');

    let msg = await ctx.reply('⚡ جاري سحب الفيديو...');
    const uniqueId = `${Date.now()}_${userId}`;
    const inputPath = path.join(tempDir, `in_${uniqueId}.mp4`);
    const outputPath = path.join(tempDir, `out_${uniqueId}.mp4`);

    try {
        const link = await ctx.telegram.getFileLink(ctx.message.video.file_id);
        await downloadVideo(link.href, inputPath);

        // هنا السحر الحقيقي (النسخ المباشر)
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '⚡🚀 Copying Stream (0% Quality Loss)...');
        await processVideoSmartly(inputPath, outputPath);

        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '☁️ تخزين سحابي فوري...');
        const folderId = await getOrCreateFolder(STORAGE_FOLDER);
        
        await drive.files.create({
            resource: { name: `READY_${uniqueId}.mp4`, parents: [folderId], description: JSON.stringify(session) },
            media: { mimeType: 'video/mp4', body: fs.createReadStream(outputPath) }
        });

        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '✅🔥 تم! الجودة أصلية والسرعة جنونية.');
    } catch (e) {
        console.error(e);
        ctx.reply(`❌ خطأ: ${e.message}`);
    } finally {
        try { fs.unlinkSync(inputPath); fs.unlinkSync(outputPath); } catch(e){}
    }
});

// ========================================================
// 5. المحرك الخلفي (The Backend) 🔧
// ========================================================

async function getOrCreateFolder(name) {
    // كاش بسيط لتسريع الاستجابة
    if(global.folderCache && global.folderCache[name]) return global.folderCache[name];
    const res = await drive.files.list({ q: `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false` });
    const id = res.data.files.length ? res.data.files[0].id : (await drive.files.create({ resource: { name, mimeType: 'application/vnd.google-apps.folder' } })).data.id;
    global.folderCache = { ...global.folderCache, [name]: id };
    return id;
}

async function checkIfUploadedToday(date) {
    const fid = await getOrCreateFolder(LOGS_FOLDER);
    const res = await drive.files.list({ q: `'${fid}' in parents and name='LOG_${date}.txt' and trashed=false` });
    return res.data.files.length > 0;
}

async function createLogFile(date) {
    const fid = await getOrCreateFolder(LOGS_FOLDER);
    await drive.files.create({ resource: { name: `LOG_${date}.txt`, parents: [fid] }, media: { mimeType: 'text/plain', body: 'Done' } });
}

async function downloadVideo(url, dest) {
    const writer = fs.createWriteStream(dest);
    const response = await axios({ method: 'GET', url, responseType: 'stream' });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });
}

app.use(express.json());
app.post(`/webhook/${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => { bot.handleUpdate(req.body); res.sendStatus(200); });
app.get('/', (req, res) => res.send('⚡ ZERO-LATENCY NODE IS ONLINE'));

process.on('uncaughtException', (e) => console.log('⚠️', e.message));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`⚡ GOD MODE Active on Port ${PORT}`);
    if(process.env.WEBHOOK_URL) await bot.telegram.setWebhook(`${process.env.WEBHOOK_URL}/webhook/${process.env.TELEGRAM_BOT_TOKEN}`);
});
