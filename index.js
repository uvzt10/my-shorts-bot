require('dotenv').config();

// =========================================================
// 💀 PROJECT: PHANTOM UPLOADER (Smart Metadata Edition) 💀
// Features: JSON Metadata Injection + Auto-Delete + Smart List
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

// --- 1. التجهيز القتالي للشبكة ---
const httpsAgent = new (require('https').Agent)({ keepAlive: true, timeout: 600000 });
bot.telegram.options.agent = httpsAgent;
google.options({ agent: httpsAgent });

// --- 2. تنظيف المخلفات ---
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
try { fs.readdirSync(tempDir).forEach(f => fs.unlinkSync(path.join(tempDir, f))); } catch(e){}

// --- 3. اتصال جوجل ---
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.REDIRECT_URI
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

oauth2Client.on('tokens', (tokens) => {
  if (tokens.refresh_token) console.log('🔄 Token Updated.');
  oauth2Client.setCredentials(tokens);
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

const userSessions = new Map();
const STORAGE_FOLDER = 'Smart_Shorts_Vault'; // الخزنة الذكية

// ========================================================
// ⚡ المحرك الهجين (The Hybrid Engine)
// ========================================================
function processVideoSmartly(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    // المحاولة 1: النسخ المباشر (سرعة الضوء)
    const copyCmd = `"${ffmpegPath}" -y -i "${inputPath}" -t 59 -c copy -map 0 "${outputPath}"`;
    exec(copyCmd, (error) => {
      if (!error) resolve(outputPath);
      else {
        // المحاولة 2: الضغط السريع (لإصلاح المشاكل)
        const encodeCmd = `"${ffmpegPath}" -y -i "${inputPath}" -t 59 -c:v libx264 -preset ultrafast -crf 28 -c:a aac "${outputPath}"`;
        exec(encodeCmd, (err) => {
          if (err) reject(err); else resolve(outputPath);
        });
      }
    });
  });
}

// ========================================================
// 🎮 مركز التحكم (The Brain)
// ========================================================

bot.start((ctx) => ctx.reply('🧠 **نظام النشر الذكي**\n\n1️⃣ أرسل التفاصيل (العنوان...)\n2️⃣ أرسل الفيديو\n3️⃣ /list (لعرض العناوين)\n4️⃣ /Sher (نشر + حذف)'));

// --- 1. استقبال البيانات وحفظها في الذاكرة المؤقتة ---
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
    ctx.reply(`💾 **تم حفظ البيانات:** "${title}"\n🎥 أرسل الفيديو الآن لدمجه مع هذه البيانات.`);
  } else {
    ctx.reply('⚠️ التنسيق:\nالعنوان: اسم الفيديو\nالوصف: ...\n#هاشتاغات');
  }
});

// --- 2. معالجة الفيديو + حقن البيانات (The Injection) ---
bot.on('video', async (ctx) => {
  const userId = ctx.from.id;
  const session = userSessions.get(userId);

  if (!session) return ctx.reply('⚠️ أرسل العنوان والتفاصيل أولاً!');
  if (ctx.message.video.file_size > 50 * 1024 * 1024) return ctx.reply('❌ الفيديو كبير جداً (Max 50MB).');

  let msg = await ctx.reply('⚡ جاري المعالجة وحقن البيانات...');
  
  const uniqueId = `${Date.now()}_${userId}`;
  const inputPath = path.join(tempDir, `in_${uniqueId}.mp4`);
  const outputPath = path.join(tempDir, `out_${uniqueId}.mp4`);

  try {
    const link = await ctx.telegram.getFileLink(ctx.message.video.file_id);
    await downloadVideo(link.href, inputPath);
    
    // المعالجة
    await processVideoSmartly(inputPath, outputPath);

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '☁️ تخزين في الكبسولة السحابية...');
    const folderId = await getOrCreateFolder(STORAGE_FOLDER);
    
    // 🔥🔥 السحر هنا: تخزين البيانات داخل وصف الملف 🔥🔥
    const metadataCapsule = JSON.stringify(session);

    await drive.files.create({
        resource: { 
            name: `SMART_VIDEO_${uniqueId}.mp4`, 
            parents: [folderId], 
            description: metadataCapsule // <--- هنا يتم حفظ العنوان والوصف داخل الملف
        },
        media: { mimeType: 'video/mp4', body: fs.createReadStream(outputPath) }
    });

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `✅ **تم التخزين بنجاح!**\nالعنوان المحفوظ: ${session.title}\nاستخدم /list للتأكد.`);
  
  } catch (e) {
    console.error(e);
    ctx.reply(`❌ خطأ: ${e.message}`);
  } finally {
    try { fs.unlinkSync(inputPath); fs.unlinkSync(outputPath); } catch(e){}
  }
});

// --- 3. الأمر /list (قراءة الكبسولات) ---
bot.command('list', async (ctx) => {
  const msg = await ctx.reply('🔍 جاري فك تشفير الكبسولات...');
  try {
    const folderId = await getOrCreateFolder(STORAGE_FOLDER);
    
    // نطلب الحقل 'description' خصيصاً لأنه يحتوي على الكنز
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
      pageSize: 20,
      fields: 'files(id, name, description)' 
    });

    const files = res.data.files;
    if (!files.length) return ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '📦 الخزنة فارغة.');

    let text = `📦 **الفيديوهات الجاهزة (${files.length}):**\n\n`;
    
    files.forEach((f, i) => {
        let title = "عنوان مجهول";
        try {
            // فك تشفير البيانات المحقونة
            const meta = JSON.parse(f.description);
            if (meta && meta.title) title = meta.title;
        } catch(e) {
            title = f.name; // في حال لم يكن هناك وصف، نستخدم اسم الملف
        }
        text += `🎬 ${i+1}. **${title}**\n`;
    });

    ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, text, { parse_mode: 'Markdown' });
  } catch (e) {
    console.error(e);
    ctx.reply('❌ خطأ في القراءة.');
  }
});

// --- 4. الأمر /Sher (نشر + حذف) ---
bot.command('Sher', async (ctx) => {
  const msg = await ctx.reply('🚀 **جاري النشر...**');
  try {
    const folderId = await getOrCreateFolder(STORAGE_FOLDER);
    const listRes = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
      pageSize: 100,
      fields: 'files(id, name, description)'
    });

    if (!listRes.data.files.length) return ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '⚠️ الخزنة فارغة!');

    // اختيار عشوائي
    const file = listRes.data.files[Math.floor(Math.random() * listRes.data.files.length)];
    
    // استخراج البيانات
    let meta = { title: 'Short Video', description: '', hashtags: '#shorts' };
    try { meta = JSON.parse(file.description); } catch(e){}

    // تجهيز العنوان والوصف
    let finalTitle = meta.title;
    if (!finalTitle.includes('#')) finalTitle += ' #shorts';
    const fullDesc = `${finalTitle}\n\n${meta.description}\n\n${meta.hashtags}\n\nSubscribe! #viral`;

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `📡 رفع: **${finalTitle}**...`);

    // الرفع لليوتيوب
    const stream = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'stream' });
    const ytRes = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title: finalTitle.substring(0, 99),
          description: fullDesc.substring(0, 4900),
          categoryId: '24',
          tags: ["shorts", "viral", "asmr"]
        },
        status: { privacyStatus: 'public', selfDeclaredMadeForKids: false }
      },
      media: { body: stream.data }
    });

    // 🔥🔥🔥 الحذف النهائي (الميزة المطلوبة) 🔥🔥🔥
    await drive.files.delete({ fileId: file.id });
    console.log(`🗑️ Deleted file ${file.id} from Drive.`);

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `✅🔥 **تم النشر والحذف من الخزنة!**\n\n🔗 [شاهد الفيديو](${`https://youtube.com/shorts/${ytRes.data.id}`})`, { parse_mode: 'Markdown' });

  } catch (e) {
    console.error(e);
    ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, `❌ فشل: ${e.message}`);
  }
});

// ========================================================
// 🔧 الأدوات المساعدة
// ========================================================

let folderCache = {};
async function getOrCreateFolder(name) {
  if (folderCache[name]) return folderCache[name];
  const res = await drive.files.list({ q: `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false` });
  const id = res.data.files.length ? res.data.files[0].id : (await drive.files.create({ resource: { name, mimeType: 'application/vnd.google-apps.folder' } })).data.id;
  folderCache[name] = id;
  return id;
}

async function downloadVideo(url, dest) {
  const writer = fs.createWriteStream(dest);
  const response = await axios({ method: 'GET', url, responseType: 'stream' });
  response.data.pipe(writer);
  return new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });
}

app.use(express.json());
app.post(`/webhook/${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => { bot.handleUpdate(req.body); res.sendStatus(200); });
app.get('/', (req, res) => res.send('🧠 Smart Metadata Bot is Active.'));

process.on('uncaughtException', (err) => console.log('🛡️ Error Caught:', err.message));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 SYSTEM READY on PORT ${PORT}`);
  if(process.env.WEBHOOK_URL) await bot.telegram.setWebhook(`${process.env.WEBHOOK_URL}/webhook/${process.env.TELEGRAM_BOT_TOKEN}`);
});
