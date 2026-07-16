const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

// تشغيل خادم ويب بسيط للاستضافة
const app = express();
app.get('/', (req, res) => res.send('البوت يعمل بنشاط!'));
app.listen(process.env.PORT || 3000, () => console.log('خادم الويب جاهز'));

// إعداد البوت
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log(`تم تشغيل البوت باسم: ${client.user.tag}`);
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;
  if (message.content === 'مرحبا') {
    message.reply('أهلاً بك يا صديقي!');
  }
});

// تشغيل البوت عبر المتغير البيئي (حماية للتوكن)
client.login(process.env.DISCORD_TOKEN);