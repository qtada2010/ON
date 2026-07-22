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

// خادم ويب مخصص لـ Render
const app = express();
app.get('/', (req, res) => res.send('بوت تجربة إنشاء القنوات يعمل!'));
app.listen(process.env.PORT || 3000, () => console.log('خادم الويب جاهز ومستعد'));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// إرسال اللوحة البسيطة
async function sendTestPanel(channel) {
  const embed = new EmbedBuilder()
    .setTitle('تجربة إنشاء قناة 🧪')
    .setDescription('اضغط على الزر أدناه لتجربة إنشاء قناة نصية مجردة بدون أي صلاحيات أو إعدادات:')
    .setColor(0x00FF00);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('create_simple_channel')
      .setLabel('إنشاء قناة تجريبية')
      .setStyle(ButtonStyle.Success)
  );

  await channel.send({ embeds: [embed], components: [row] });
}

// تسجيل أمر السلاش /setup-test
const commands = [
  new SlashCommandBuilder()
    .setName('setup-test')
    .setDescription('إرسال زر تجربة إنشاء القناة')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(command => command.toJSON());

client.once('ready', async () => {
  console.log(`تم تسجيل الدخول بنجاح باسم: ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands },
    );
    console.log('تم تسجيل أمر السلاش بنجاح!');
  } catch (error) {
    console.error('خطأ في تسجيل الأمر:', error);
  }
});

// الاستماع لأمر !tk
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  if (message.content.trim() === '!tk') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ هذا الأمر للإدارة فقط.');
    }
    await sendTestPanel(message.channel);
    if (message.deletable) await message.delete().catch(() => {});
  }
});

// التعامل مع الأزرار وأمر السلاش
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup-test') {
    await interaction.deferReply({ ephemeral: true });
    await sendTestPanel(interaction.channel);
    await interaction.editReply({ content: 'تم إرسال اللوحة التجريبية!' });
    return;
  }

  if (interaction.isButton() && interaction.customId === 'create_simple_channel') {
    await interaction.deferReply({ ephemeral: true });

    try {
      // أبسط أمر لإنشاء قناة نصية بدون أي إعدادات إضافية نهائياً
      const newChannel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText
      });

      await newChannel.send(`مرحباً ${interaction.user}، تم إنشاء هذه القناة التجريبية بنجاح!`);
      await interaction.editReply({ content: `✅ تم إنشاء القناة المجردة بنجاح: ${newChannel}`, ephemeral: true });

    } catch (error) {
      console.error('خطأ أثناء إنشاء القناة:', error);
      await interaction.editReply({ content: '❌ حدث خطأ أثناء محاولة إنشاء القناة.', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
