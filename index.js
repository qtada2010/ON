const { 
  Client, 
  GatewayIntentBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder, 
  ChannelType, 
  PermissionFlagsBits 
} = require('discord.js');
const express = require('express');

// خادم ويب صغير لتجنب إغلاق البوت من قبل الاستضافة
const app = express();
app.get('/', (req, res) => res.send('بوت التذاكر يعمل بنشاط وبدون توقف!'));
app.listen(process.env.PORT || 3000, () => console.log('خادم الويب جاهز ومستعد'));

// إعداد البوت والـ Intents المطلوبة
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ================= [ إعدادات لوحات التذاكر ] =================
// تأكد من وضع الـ IDs الحقيقية الخاصة بسيرفرك هنا
const TICKET_CONFIGS = {
  support: {
    label: "دعم فني",
    emoji: "🛠️",
    style: ButtonStyle.Primary, // لون أزرق
    categoryId: "1524792058278187018",
    supportRoleId: "1353008060955885658",
    logChannelId: "1497981884980789348",
    embedTitle: "تذكرة دعم فني جديدة",
    embedColor: 0x3498db, // أزرق
    image: "https://media.discordapp.net/attachments/1355903779073167619/1502427418839744663/423_20250417230604.png?ex=6a595212&is=6a580092&hm=27d86e58c927956d56356ef483a7055c0d8049b9e6582f5d8d2e73fc190061cf&=&format=webp&quality=lossless&width=1860&height=718" // رابط الصورة داخل التذكرة
  },
};
client.once('ready', () => {
  console.log(`تم تسجيل الدخول بنجاح باسم: ${client.user.tag}`);
});

// أمر إنشاء لوحة التحكم بالتذاكر (اكتب !setup-tickets في السيرفر)
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  if (message.content === '!setup-tickets') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('عذراً، هذا الأمر مخصص لـ إدارة السيرفر فقط!');
    }

    const embed = new EmbedBuilder()
      .setTitle('مركز المساعدة والتذاكر 🎫')
      .setDescription('مرحباً بك! لفتح تذكرة جديدة، يرجى اختيار القسم المناسب لطلبك من الأزرار الموضحة في الأسفل:')
      .setColor(0x5865F2)
      .setImage('https://i.imgur.com/example_main_panel.png');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_support')
        .setLabel(TICKET_CONFIGS.support.label)
        .setEmoji(TICKET_CONFIGS.support.emoji)
        .setStyle(TICKET_CONFIGS.support.style),
      new ButtonBuilder()
        .setCustomId('ticket_complaint')
        .setLabel(TICKET_CONFIGS.complaint.label)
        .setEmoji(TICKET_CONFIGS.complaint.emoji)
        .setStyle(TICKET_CONFIGS.complaint.style),
      new ButtonBuilder()
        .setCustomId('ticket_middleman')
        .setLabel(TICKET_CONFIGS.middleman.label)
        .setEmoji(TICKET_CONFIGS.middleman.emoji)
        .setStyle(TICKET_CONFIGS.middleman.style)
    );

    await message.channel.send({ embeds: [embed], components: [row] });
    message.delete().catch(() => {});
  }
});

// معالجة الضغط على الأزرار
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const customId = interaction.customId;
  let type = '';

  if (customId === 'ticket_support') type = 'support';
  else if (customId === 'ticket_complaint') type = 'complaint';
  else if (customId === 'ticket_middleman') type = 'middleman';
  else if (customId === 'close_ticket') {
    await interaction.reply('سيتم إغلاق التذكرة وحذف الروم خلال 3 ثوانٍ...');
    setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
    return;
  }

  if (type) {
    await interaction.deferReply({ ephemeral: true });

    const config = TICKET_CONFIGS[type];
    const guild = interaction.guild;
    const member = interaction.member;

    try {
      // تعديل هنا: إنشاء الروم معتمداً بالكامل على صلاحيات الكاتيجوري لتجنب حظر بوت الحماية
      const ticketChannel = await guild.channels.create({
        name: `${type}-${member.user.username}`,
        type: ChannelType.GuildText,
        parent: config.categoryId
      });

      // تعديل إضافي: إعطاء العضو صلاحية رؤية تذكرته بشكل منفصل بعد إنشائها دون لمس الرتب الأساسية دفعة واحدة
      await ticketChannel.permissionOverwrites.create(member.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      });

      // رسالة الترحيب المخصصة داخل التذكرة
      const ticketEmbed = new EmbedBuilder()
        .setTitle(config.embedTitle)
        .setDescription(`مرحباً بك ${member}، لقد قمت بفتح تذكرة في قسم **${config.label}**.\nيرجى كتابة طلبك أو استفسارك هنا، وسيقوم فريق العمل بالرد عليك في أقرب وقت ممكن.`)
        .setColor(config.embedColor)
        .setThumbnail(config.image)
        .setTimestamp();

      const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('إغلاق التذكرة')
          .setEmoji('🔒')
          .setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({ 
        content: `${member} | <@&${config.supportRoleId}>`, 
        embeds: [ticketEmbed], 
        components: [closeButton] 
      });

      // إرسال السجل (Log) إلى الروم المحدد للقسم
      const logChannel = guild.channels.cache.get(config.logChannelId);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle('🎫 تذكرة جديدة')
          .addFields(
            { name: 'العضو المبادر:', value: `${member.user.tag} (${member.id})`, inline: true },
            { name: 'قسم التذكرة:', value: config.label, inline: true },
            { name: 'روم التذكرة:', value: `${ticketChannel}`, inline: true }
          )
          .setColor(config.embedColor)
          .setTimestamp();
        logChannel.send({ embeds: [logEmbed] });
      }

      await interaction.editReply({ content: `تم إنشاء تذكرتك بنجاح في الروم: ${ticketChannel}`, ephemeral: true });

    } catch (error) {
      console.error(error);
      await interaction.editReply({ content: 'حدث خطأ أثناء إنشاء التذكرة. تأكد من إعدادات الكاتيجوري وصلاحيات البوت.', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
