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
app.get('/', (req, res) => res.send('بوت التذاكر المطور يعمل بنشاط وبدون توقف!'));
app.listen(process.env.PORT || 3000, () => console.log('خادم الويب جاهز ومستعد'));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const BOOT_TIME = Date.now();

const TICKET_CONFIG = {
  label: "دعم فني",
  emoji: "🛠️",
  style: ButtonStyle.Primary,
  categoryId: "1524792058278187018", 
  supportRoleId: "1353008060955885658", 
  logChannelId: "1497980647904510144", 
  embedTitle: "تذكرة دعم فني جديدة",
  embedColor: 0x3498db,
  image: "https://i.imgur.com/example_support.png"
};

async function sendTicketPanel(channel) {
  const embed = new EmbedBuilder()
    .setTitle('مركز المساعدة والتذاكر 🎫')
    .setDescription('مرحباً بك! لفتح تذكرة دعم فني جديدة، يرجى الضغط على الزر في الأسفل وسيتم خدمتك في أقرب وقت:')
    .setColor(0x5865F2);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_support')
      .setLabel(TICKET_CONFIG.label)
      .setEmoji(TICKET_CONFIG.emoji)
      .setStyle(TICKET_CONFIG.style)
  );

  await channel.send({ embeds: [embed], components: [row] });
}

const commands = [
  new SlashCommandBuilder()
    .setName('setup-tickets')
    .setDescription('إرسال لوحة التحكم بالتذاكر في الروم الحالي')
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
  } catch (error) {
    console.error('حدث خطأ أثناء تسجيل الأوامر:', error);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (message.content.trim() === '!tk') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ هذا الأمر مخصص للإدارة فقط.');
    }
    try {
      await sendTicketPanel(message.channel);
      if (message.deletable) await message.delete().catch(() => {});
    } catch (error) {
      console.error(error);
    }
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.createdAt.getTime() < BOOT_TIME) return;

  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'setup-tickets') {
      await interaction.deferReply({ ephemeral: true });
      await sendTicketPanel(interaction.channel);
      await interaction.editReply({ content: 'تم إرسال لوحة التذاكر بنجاح!' });
    }
    return;
  }

  if (interaction.isButton()) {
    const customId = interaction.customId;

    if (customId === 'close_ticket') {
      await interaction.reply('سيتم إغلاق التذكرة وحذف الروم خلال 3 ثوانٍ...');
      setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
      return;
    }

    if (customId === 'ticket_support') {
      await interaction.deferReply({ ephemeral: true });

      const guild = interaction.guild;
      const member = interaction.member;

      try {
        // إنشاء القناة مباشرة داخل الكاتيجوري بدون التلاعب بالصلاحيات تفادياً لبوت الحماية
        const ticketChannel = await guild.channels.create({
          name: `ticket-${member.user.username}`,
          type: ChannelType.GuildText,
          parent: TICKET_CONFIG.categoryId
        });

        // إعطاء صاحب التذكرة الصلاحية فقط دون اللمس بصلاحيات البقية
        await ticketChannel.permissionOverwrites.edit(member.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true
        }).catch(() => {});

        const ticketEmbed = new EmbedBuilder()
          .setTitle(TICKET_CONFIG.embedTitle)
          .setDescription(`مرحباً بك ${member}، لقد قمت بفتح تذكرة في قسم **${TICKET_CONFIG.label}**.\nيرجى كتابة طلبك أو استفسارك هنا، وسيقوم فريق العمل بالرد عليك قريباً.`)
          .setColor(TICKET_CONFIG.embedColor)
          .setTimestamp();

        const closeButton = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('إغلاق التذكرة')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Danger)
        );

        await ticketChannel.send({ 
          content: `${member} | <@&${TICKET_CONFIG.supportRoleId}>`, 
          embeds: [ticketEmbed], 
          components: [closeButton] 
        });

        const logChannel = guild.channels.cache.get(TICKET_CONFIG.logChannelId);
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setTitle('🎫 تذكرة جديدة')
            .addFields(
              { name: 'العضو المبادر:', value: `${member.user.tag} (${member.id})`, inline: true },
              { name: 'قسم التذكرة:', value: TICKET_CONFIG.label, inline: true },
              { name: 'روم التذكرة:', value: `${ticketChannel}`, inline: true }
            )
            .setColor(TICKET_CONFIG.embedColor)
            .setTimestamp();
          logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }

        await interaction.editReply({ content: `تم إنشاء تذكرتك بنجاح في الروم: ${ticketChannel}`, ephemeral: true });

      } catch (error) {
        console.error("خطأ أثناء إنشاء التذكرة:", error);
        await interaction.editReply({ content: 'حدث خطأ أثناء إنشاء التذكرة.', ephemeral: true });
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
