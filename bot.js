const TelegramBot = require('node-telegram-bot-api');
const ytdlp = require('yt-dlp-exec');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

// Your Telegram Bot token
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// To store user language preferences
const userLanguages = {};

// Define language options
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
    help: "Help",
    contact: "Contact",
    start: "ጀምር",
    language: "ቋንቋ",
    invalidUrl: "❌ የዩቲዩብ LINK ብቻ ነው ማስኬድ የምችለው። እባክሽ/ህ ትክክለኛ LINK ላኪ/ክ።",
    downloading: "🎧 በጣም ጥሩ! ኦዲዮውን DOWNLOAD እየተደረገ ነው። ይህ ትንሽ ጊዜ ሊወስድ ይችላል (ከ3 - 5 ደቂቃ አካባቢ ጠብቅ/ቂ)⏳",
    sendAudioError: "❌ እባክዎ ቆይተው እንደገና ይሞክሩ።",
    downloadError: "❌ የድምጽ ፋይሉን በመላክ ላይ ችግር ነበር።",
  },
  // Add the fourth language
  fr: {
    startMessage: "Envoyez-moi un lien YouTube▶️ pour le convertir en audio! 🎶",
    help: "Aide",
    contact: "Contact",
    start: "Démarrer",
    language: "Langue",
    invalidUrl: "❌ Je ne peux traiter que les liens YouTube. Veuillez envoyer un lien valide.",
    downloading: "🎧 Super! Je suis en train de traiter l'audio pour vous. Cela peut prendre un moment (environ 3 à 5 minutes)⏳",
    sendAudioError: "Erreur lors de l'envoi de l'audio. Veuillez réessayer.",
    downloadError: "Erreur lors du téléchargement de l'audio. La vidéo peut être non prise en charge ou il y a eu un problème de réseau.",
  }
};

// Language selection buttons
const languageKeyboard = {
  inline_keyboard: [
    [{ text: 'English', callback_data: 'set_language_en' }, { text: 'አማርኛ', callback_data: 'set_language_am' }, { text: 'Français', callback_data: 'set_language_fr' }],
  ],
};

// Main menu buttons (localized)
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

// Start command to choose language
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  // Prompt user to select language only if they haven't done so already
  if (!userLanguages[chatId]) {
    bot.sendMessage(chatId, "Please select your language🚀 / እባክዎን ቋንቋዎን ይምረጡ🎶", {
      reply_markup: languageKeyboard,
    });
  }
});

// Handle language selection (callback queries)
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const selectedLang = query.data.split('_')[2]; // Extract 'en', 'am', or 'fr' from callback_data

  // Save user language preference
  userLanguages[chatId] = selectedLang;

  // Send a message in the chosen language and show the menu
  bot.sendMessage(chatId, languages[selectedLang].startMessage, getMenuKeyboard(selectedLang));
});

// Handle YouTube URL and main menu interactions
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Get the user's preferred language, default to English if not set
  const userLang = userLanguages[chatId];

  // Handle the /start command
  if (text === '/start') {
    if (!userLang) {
      // If user hasn't selected a language yet, don't send anything
      return;
    }
    return; // Prevent further processing
  }

  // If the user hasn't selected a language yet
  if (!userLang) {
    return; // Exit without sending any message
  }

  // Handle Help, Contact, Start, and Language buttons
  if (text === languages[userLang].help) {
    bot.sendMessage(chatId, "Send a YouTube link to convert it to an audio file.");
    return;
  } else if (text === languages[userLang].contact) {
    bot.sendMessage(chatId, "DM  💬 @eliashabibhamid for inquiries 📩");
    return;
  } else if (text === languages[userLang].start) {
    bot.sendMessage(chatId, languages[userLang].startMessage);
    return;
  } else if (text === languages[userLang].language) {
    // Show language options again
    bot.sendMessage(chatId, "Please select your language🚀 / እባክዎን ቋንቋዎን ይምረጡ🎶", {
      reply_markup: languageKeyboard,
    });
    return;
  }

  // Validate YouTube URL using simple string checks
  if (!text.startsWith('/') && !text.includes('youtube.com') && !text.includes('youtu.be')) {
    bot.sendMessage(chatId, languages[userLang].invalidUrl);
    return;
  }

  bot.sendMessage(chatId, languages[userLang].downloading);

  // Use yt-dlp to download the audio and get metadata (like title, thumbnail)
  const downloadPath = path.join(__dirname, 'downloads');
  const audioFilePath = path.join(downloadPath, `${Date.now()}.mp3`);
  const thumbnailPath = path.join(downloadPath, `${Date.now()}_thumbnail.jpg`);

  // Create the downloads directory if it doesn't exist
  if (!fs.existsSync(downloadPath)) {
    fs.mkdirSync(downloadPath);
  }

  // First, get video info to extract the title and thumbnail
  ytdlp(text, {
    dumpSingleJson: true,
    noWarnings: true,
    noCheckCertificate: true,
    noCallHome: true,
    skipDownload: true,
  })
    .then(async (info) => {
      const videoTitle = info.title || 'Unknown Title'; // Get the title of the video
      const thumbnailUrl = info.thumbnail; // Get the thumbnail URL

      // Download the thumbnail image
      try {
        const response = await axios({
          url: thumbnailUrl,
          responseType: 'stream',
        });
        response.data.pipe(fs.createWriteStream(thumbnailPath));
        await new Promise((resolve) => response.data.on('end', resolve)); // Wait for download to finish
      } catch (error) {
        console.error('Error downloading thumbnail:', error);
      }

      // Now, download the audio
      return ytdlp(text, {
        extractAudio: true,
        audioFormat: 'mp3',
        output: audioFilePath,
        ffmpegLocation: require('ffmpeg-static'), // Path to ffmpeg
      })
        .then(() => {
          // After downloading, check if the file was created
          if (!fs.existsSync(audioFilePath)) {
            throw new Error('Audio file was not created.');
          }

          // Send the audio file with title, custom caption, and thumbnail
          const caption = `${videoTitle}\n🎵 @SIMAyoutube_bot`; // Add title and custom caption with emoji

          bot.sendAudio(chatId, audioFilePath, {
            caption: caption,
            title: videoTitle, // Telegram will display this as the title of the audio
            thumb: thumbnailPath, // Attach the thumbnail image
          })
            .then(() => {
              // Once sent, schedule the file for deletion
              setTimeout(() => {
                // Delete the audio file
                fs.unlink(audioFilePath, (err) => {
                  if (err) console.error(`Error deleting file: ${audioFilePath}`, err);
                  else console.log(`File deleted: ${audioFilePath}`);
                });
                // Delete the thumbnail file
                fs.unlink(thumbnailPath, (err) => {
                  if (err) console.error(`Error deleting thumbnail: ${thumbnailPath}`, err);
                  else console.log(`Thumbnail deleted: ${thumbnailPath}`);
                });
              }, 300000); // Delete the file after 5 minutes
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
