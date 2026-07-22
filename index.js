const { 
  Client, 
  GatewayIntentBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder, 
  ChannelType, 
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('البوت يعمل!'));
app.listen(process.env.PORT || 3000);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', async () => {
  console.log(`تم تسجيل الدخول بنجاح باسم: ${client.user.tag}`);

  // 🔍 معرفة الحساب المربوط به البوت
  try {
    const application = await client.application.fetch();
    if (application.owner.tag) {
      console.log(`👑 البوت مملوك للحساب: ${application.owner.tag} (ID: ${application.owner.id})`);
    } else {
      console.log(`👑 البوت مملوك للفريق/الحساب: ${application.owner.name} (ID: ${application.owner.id})`);
    }
  } catch (err) {
    console.error('تعذر جلب بيانات المالك:', err);
  }
});

client.login(process.env.DISCORD_TOKEN);
