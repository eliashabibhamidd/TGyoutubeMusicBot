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

const languageKeyboard = {
  inline_keyboard: [
    [{ text: 'English', callback_data: 'set_language_en' }, { text: 'አማርኛ', callback_data: 'set_language_am' }],
  ],
};

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
  const chatType = msg.chat.type;

  if (chatType === 'group' || chatType === 'supergroup') {
    return; // Ignore /start on group chats
  }

  if (!userLanguages[chatId]) {
    bot.sendMessage(chatId, "Please select your language🚀 / እባክዎን ቋንቋዎን ይምረጡ🎶", {
      reply_markup: languageKeyboard,
    });
  } else {
    const userLang = userLanguages[chatId];
    bot.sendMessage(chatId, languages[userLang].startMessage, getMenuKeyboard(userLang));
  }
});

let botId = null;  

bot.getMe().then((botInfo) => {
  botId = botInfo.id;  
  console.log(`Bot started! Bot ID: ${botId}`);
}).catch((err) => {
  console.error('Failed:', err);
});

bot.on('my_chat_member', (msg) => {
  const chatId = msg.chat.id;
  const newChatMember = msg.new_chat_member;

  if (newChatMember.user.id === botId && newChatMember.status === 'member') {
    console.log('Bot is now a member of the group:', chatId);

    const userLang = userLanguages[chatId] || 'en'; 
    const welcomeMessage = userLang === 'en'
      ? "👋 Hello! Send me a YouTube music video link, and I'll convert it to audio for you! To send, use: \n /get [YouTube link]. 🎶"
      : "👋 ሰላም! የዩቲዩብ ሙዚቃ LINK ይላኩኝ እና ኦዲዮ ፋይል ልላክልዎት እችላለሁ! ለመላክ \n /get [የዩቲዩብ ሊንክ] ይጠቀሙ። 🎶";

    bot.sendMessage(chatId, welcomeMessage);
  } else {
    console.log('Bot was not added:', newChatMember);
  }
});


bot.onText(/\/get (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const text = match[1];

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
});


bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const chatType = msg.chat.type;
  const text = msg.text;
  const userLang = userLanguages[chatId];

  if (chatType === 'group' || chatType === 'supergroup') {
    return; // Ignore direct messages in groups
  }

  if (text && (text.includes('youtube.com') || text.includes('youtu.be'))) {
    bot.sendMessage(chatId, languages[userLang || 'en'].downloading);
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
          bot.sendMessage(chatId, languages[userLang || 'en'].sendAudioError);
        });
      });
    })
    .catch((err) => {
      console.error('Error fetching video info or downloading audio:', err);
      bot.sendMessage(chatId, languages[userLang || 'en'].downloadError);
    });
  }
});


bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  if (data.startsWith('set_language_')) {
    const lang = data.split('_')[2];
    userLanguages[chatId] = lang;

    bot.sendMessage(chatId, `Language set to ${lang === 'en' ? 'English' : 'አማርኛ'}.`, getMenuKeyboard(lang));
  }
});
