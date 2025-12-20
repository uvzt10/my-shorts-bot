try {
    const fileLink = await ctx.telegram.getFileLink(video.file_id);
    const originalPath = await downloadVideo(fileLink.href, raw_${video.file_id});
    const processedPath = path.join(__dirname, 'temp', processed_${video.file_id}.mp4);

    await convertToShorts(originalPath, processedPath);

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '☁️ رفع للدرايف...');
    const folderId = await getOrCreateFolder(STORAGE_FOLDER_NAME);
    const metadataString = JSON.stringify(sessionData);
    
    await drive.files.create({
      resource: {
        name: READY_${Date.now()}.mp4,
        parents: [folderId],
        description: metadataString
      },
      media: { mimeType: 'video/mp4', body: fs.createReadStream(processedPath) },
      fields: 'id'
    });

    fs.unlinkSync(originalPath);
    fs.unlinkSync(processedPath);

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '✅ تم التخزين بنجاح!');
  } catch (error) {
    console.error(error);
    try { if(fs.existsSync(originalPath)) fs.unlinkSync(originalPath); } catch(e){}
    try { if(fs.existsSync(processedPath)) fs.unlinkSync(processedPath); } catch(e){}
    ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, ❌ فشل.);
  }
});

// دوال مساعدة
async function checkIfUploadedToday(dateString) {
  const logsFolderId = await getOrCreateFolder(LOGS_FOLDER_NAME);
  const res = await drive.files.list({
    q: '${logsFolderId}' in parents and name = 'LOG_${dateString}.txt' and trashed = false
  });
  return res.data.files.length > 0;
}

async function createLogFile(dateString) {
  const logsFolderId = await getOrCreateFolder(LOGS_FOLDER_NAME);
  await drive.files.create({
    resource: { name: LOG_${dateString}.txt, parents: [logsFolderId] },
    media: { mimeType: 'text/plain', body: 'Done.' }
  });
}

async function getOrCreateFolder(folderName) {
  const res = await drive.files.list({
    q: mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false
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
  const videoPath = path.join(tempDir, ${fileName}.mp4);
  const response = await axios({ method: 'GET', url: url, responseType: 'stream' });
  const writer = fs.createWriteStream(videoPath);
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(videoPath));
    writer.on('error', reject);
  });
}

app.use(express.json());
app.post(/webhook/${process.env.TELEGRAM_BOT_TOKEN}, (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

// صفحة بسيطة لإبقاء البوت حياً (تزورها Cron Job)
app.get('/', (req, res) => res.send('Bot is Awake & Running Internally ⚡️'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(✅ Server running on port ${PORT});
  try {
    const webhookUrl = ${process.env.WEBHOOK_URL}/webhook/${process.env.TELEGRAM_BOT_TOKEN};
    await bot.telegram.setWebhook(webhookUrl);
    console.log(✅ Webhook set to: ${webhookUrl});
  } catch (err) {
    console.error('❌ Failed to set webhook:', err);
  }
});
