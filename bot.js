const TelegramBot = require('node-telegram-bot-api');
const ytdlp = require('yt-dlp-exec');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });
const userLanguages = {};

const languages = {
  en: {
    startMessage: "Send me a YouTube▶️ link to convert it to audio! 🎶",
    help: "Help",
    contact: "Contact",
    start: "Start",
    language: "Language",
    invalidUrl: "❌ I can only process YouTube links. Please send a valid link.",
    downloading: "🎧 Great! I am processing the audio for you. This might take a moment (about 3 - 5 minutes)⏳",
    sendAudioError: "Error sending audio. Please try again.",
    downloadError: "Error downloading audio. The video may be unsupported, or there was a network issue.",
  },
  am: {
    startMessage: "የዩቱብ LINK ይላኩ። 🎶",
    help: "help",
    contact: "contact",
    start: "ጀምር",
    language: "ቋንቋ",
    invalidUrl: "❌ የዩቲዩብ LINK ብቻ ነው ማስኬድ የምችለው። እባክሽ/ህ ትክክለኛ LINK ላኪ/ክ።",
    downloading: "🎧 በጣም ጥሩ! ኦዲዮውን DOWNLOAD እየተደረገ ነው። ይህ ትንሽ ጊዜ ሊወስድ ይችላል (ከ3 - 5 ደቂቃ አካባቢ ጠብቅ/ቂ)⏳",
    sendAudioError: "❌ እባክዎ ቆይተው እንደገና ይሞክሩ።",
    downloadError: "❌ የድምጽ ፋይሉን በመላክ ላይ ችግር ነበር።",
  },
};

// Language buttons
const languageKeyboard = {
  inline_keyboard: [
    [{ text: 'English', callback_data: 'set_language_en' }, { text: 'አማርኛ', callback_data: 'set_language_am' }],
  ],
};

// Localized menu keyboard
const getMenuKeyboard = (lang) => {
  return {
    reply_markup: {
      keyboard: [
        [{ text: languages[lang].help }, { text: languages[lang].contact }, { text: languages[lang].start }, { text: languages[lang].language }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  };
};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  if (!userLanguages[chatId]) {
    bot.sendMessage(chatId, "Please select your language🚀 / እባክዎን ቋንቋዎን ይምረጡ🎶", {
      reply_markup: languageKeyboard,
    });
  } else {
    const userLang = userLanguages[chatId];
    bot.sendMessage(chatId, languages[userLang].startMessage, getMenuKeyboard(userLang));
  }
});

bot.on('my_chat_member', (msg) => {
  const chatId = msg.chat.id;

  // Check if the bot was added to the group (i.e., "new_chat_member" is the bot)
  if (msg.new_chat_member && msg.new_chat_member.user.id === bot.id) {
    if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
      const language = userLanguages[chatId] || 'en'; // Default to English if no language set

      bot.sendMessage(chatId, languages[language].startMessage);
    }
  }
});

bot.onText(/\/get (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const chatType = msg.chat.type;
  const text = match[1];

  if (chatType === 'group' || chatType === 'supergroup') {
    if (!text.includes('youtube.com') && !text.includes('youtu.be')) {
      const userLang = userLanguages[chatId] || 'en';
      bot.sendMessage(chatId, languages[userLang].invalidUrl);
      return;
    }

    const userLang = userLanguages[chatId] || 'en';
    bot.sendMessage(chatId, languages[userLang].downloading);

    const downloadPath = path.join(__dirname, 'downloads');
    const audioFilePath = path.join(downloadPath, `${Date.now()}.mp3`);
    const thumbnailPath = path.join(downloadPath, `${Date.now()}_thumbnail.jpg`);

    if (!fs.existsSync(downloadPath)) {
      fs.mkdirSync(downloadPath);
    }

    ytdlp(text, {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificate: true,
      noCallHome: true,
      skipDownload: true,
    })
    .then(async (info) => {
      const videoTitle = info.title || 'Unknown Title'; 
      const thumbnailUrl = info.thumbnail; 
      try {
        const response = await axios({
          url: thumbnailUrl,
          responseType: 'stream',
        });
        response.data.pipe(fs.createWriteStream(thumbnailPath));
        await new Promise((resolve) => response.data.on('end', resolve)); 
      } catch (error) {
        console.error('Error downloading thumbnail:', error);
      }

      return ytdlp(text, {
        extractAudio: true,
        audioFormat: 'mp3',
        output: audioFilePath,
        ffmpegLocation: require('ffmpeg-static'),
      })
      .then(() => {
        if (!fs.existsSync(audioFilePath)) {
          throw new Error('Audio file was not created.');
        }

        const caption = `${videoTitle}\n🎵 @SIMAyoutube_bot`; 
        bot.sendAudio(chatId, audioFilePath, {
          caption: caption,
          title: videoTitle, 
          thumb: thumbnailPath, 
        })
        .then(() => {
          setTimeout(() => {
            fs.unlink(audioFilePath, (err) => {
              if (err) console.error(`Error deleting file: ${audioFilePath}`, err);
              else console.log(`File deleted: ${audioFilePath}`);
            });

            fs.unlink(thumbnailPath, (err) => {
              if (err) console.error(`Error deleting thumbnail: ${thumbnailPath}`, err);
              else console.log(`Thumbnail deleted: ${thumbnailPath}`);
            });
          }, 300000); 
        })
        .catch((err) => {
          console.error('Error sending audio:', err);
          bot.sendMessage(chatId, languages[userLang].sendAudioError);
        });
      });
    })
    .catch((err) => {
      console.error('Error fetching video info or downloading audio:', err);
      bot.sendMessage(chatId, languages[userLang].downloadError);
    });
  } else {
    const userLang = userLanguages[chatId] || 'en';
    bot.sendMessage(chatId, "❌ The /get command only works in group chats.");
  }
});

bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const selectedLang = query.data.split('_')[2]; 
  userLanguages[chatId] = selectedLang;

  bot.sendMessage(chatId, languages[selectedLang].startMessage, getMenuKeyboard(selectedLang));
});

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userLang = userLanguages[chatId];
  if (!userLang) {
    return; // Don't send any message if language is not set
  }

  if (text === languages[userLang].help) {
    const helpMessage = userLang === 'en'
      ? "<b>Send a YouTube link to convert it to an audio file.</b>\n Like this: https://www.youtube.com&#8203/watch?v=3JZ_D3ELwOQ;"
      : "የዩቱብ LINK ይላኩ ወደ ኦዲዮ ፋይል ለመቀየር \n ምሳሌ: https://www.youtube.com&#8203/watch?v=3JZ_D3ELwOQ;";
    bot.sendMessage(chatId, helpMessage, { parse_mode: 'HTML' });
    return;
  } else if (text === languages[userLang].contact) {
    bot.sendMessage(chatId, userLang === 'en' ? "<b>DM</b> 💬 @eliashabibhamid for inquiries 📩" : "ለጥያቄዎች 💬 @eliashabibhamid  📩");
  } else if (text === languages[userLang].start) {
    bot.sendMessage(chatId, languages[userLang].startMessage, getMenuKeyboard(userLang));
    return;
  } else if (text === languages[userLang].language) {
    bot.sendMessage(chatId, "Please select your language🚀", {
      reply_markup: languageKeyboard,
    });
    return;
  }
});
