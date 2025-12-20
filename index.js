S., [ديسمبر ⁨20⁩، ⁨2025⁩ في ⁨8:12 AM⁩]
require('dotenv').config();

// TelegramToYouTube - The "Perfect" Edition 💎
// المميزات: فحص تلقائي داخلي + إشعارات + قص HD + تخزين درايف

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

// زيادة مهلة الاتصال
bot.telegram.options.agent = new (require('https').Agent)({ keepAlive: true, timeout: 60000 });

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
// 1. المنبه الداخلي (هو يفحص الوقت بنفسه) ⏰
// ====================

// يفحص الوقت كل 60 ثانية تلقائياً
setInterval(async () => {
  const nowNY = moment().tz("America/New_York");
  const currentHour = nowNY.hour(); 
  
  // لكي لا نملأ السجلات، نطبع فقط عندما تكون الساعة قريبة من 18
  if (currentHour === 18) {
    console.log('🔄 Internal Clock: It is 6 PM in NY. Checking upload status...');
    
    const todayDate = nowNY.format('YYYY-MM-DD');
    const isUploaded = await checkIfUploadedToday(todayDate);
    
    if (!isUploaded) {
      console.log('🚀 Starting Auto-Upload Sequence...');
      await triggerUpload(todayDate);
    } else {
      console.log('✅ Already uploaded today.');
    }
  }
}, 60000); // كل دقيقة

// ====================
// 2. دالة النشر الموحدة (للتلقائي واليدوي)
// ====================

async function triggerUpload(todayDate, manualChatId = null) {
  try {
    const folderId = await getOrCreateFolder(STORAGE_FOLDER_NAME);
    const listRes = await drive.files.list({
      q: '${folderId}' in parents and mimeType contains 'video/' and trashed = false,
      fields: 'files(id, name, description)',
      pageSize: 100
    });

    if (!listRes.data.files.length) {
      if (manualChatId) bot.telegram.sendMessage(manualChatId, '⚠️ الخزنة فارغة!');
      console.log('⚠️ Storage empty.');
      return;
    }

    // سحب عشوائي
    const randomFile = listRes.data.files[Math.floor(Math.random() * listRes.data.files.length)];
    
    let metadata = { userId: null, title: 'Short', description: '', hashtags: '' };
    try { metadata = JSON.parse(randomFile.description); } catch(e) {}

    let finalTitle = metadata.title;
    if (!finalTitle.toLowerCase().includes('#shorts')) finalTitle += ' #shorts';
    const staticDesc = "Satisfying video #shorts #asmr #cutting";
    let fullDescription = ${finalTitle}\n\n${metadata.description}\n\n${staticDesc}.trim();

    console.log(🎬 Uploading: ${finalTitle});

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
    
    // تسجيل في السجل اليومي (فقط إذا كان نشراً تلقائياً أو أردنا منعه لبقية اليوم)
    if (!manualChatId) {
        await createLogFile(todayDate);
    }
