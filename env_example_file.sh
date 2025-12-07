# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

# Google OAuth2 Configuration
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
REDIRECT_URI=http://localhost:3000/oauth2callback
GOOGLE_REFRESH_TOKEN=your_refresh_token_here

# Server Configuration
PORT=3000
WEBHOOK_URL=https://your-domain.com

# ===============================
# خطوات الحصول على المتغيرات:
# ===============================

# 1. TELEGRAM_BOT_TOKEN:
#    - افتح @BotFather في Telegram
#    - أرسل /newbot
#    - اتبع التعليمات واحصل على Token

# 2. Google Cloud Console Setup:
#    - اذهب إلى: https://console.cloud.google.com
#    - أنشئ مشروع جديد
#    - فعّل YouTube Data API v3
#    - فعّل Google Drive API
#    - أنشئ OAuth 2.0 Client ID
#    - أضف Redirect URI: http://localhost:3000/oauth2callback
#    - احصل على Client ID & Client Secret

# 3. GOOGLE_REFRESH_TOKEN:
#    - استخدم OAuth Playground: https://developers.google.com/oauthplayground
#    - أو استخدم السكريبت المرفق (get-refresh-token.js)

# 4. WEBHOOK_URL:
#    - استخدم ngrok للتطوير المحلي: ngrok http 3000
#    - أو استضف على: Vercel, Railway, Heroku, DigitalOcean