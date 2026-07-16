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

// تشغيل خادم ويب للاستضافة
const app = express();
app.get('/', (req, res) => res.send('بوت التذاكر المطور يعمل بنشاط وبدون توقف!'));
app.listen(process.env.PORT || 3000, () => console.log('خادم الويب جاهز ومستعد'));

// إعداد البوت والـ Intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

// ================= [ إعدادات لوحات التذاكر ] =================
// ضع الـ IDs الخاصة بسيرفرك هنا بدقة داخل علامات التنصيص
const TICKET_CONFIGS = {
  support: {
    label: "دعم فني",
    emoji: "🛠️",
    style: ButtonStyle.Primary,
    categoryId: "1524792058278187018",
    supportRoleId: "1353008060955885658",
    logChannelId: "1497980647904510144",
    embedTitle: "تذكرة دعم فني جديدة",
    embedColor: 0x3498db,
    image: "https://i.imgur.com/example_support.png"
  },
  complaint: {
    label: "تقديم شكوى",
    emoji: "⚠️",
    style: ButtonStyle.Danger,
    categoryId: "ضع_هنا_ايدي_كاتيجوري_الشكاوى",
    supportRoleId: "ضع_هنا_ايدي_رتبة_إدارة_الشكاوى",
    logChannelId: "ضع_هنا_ايدي_روم_لوق_الشكاوى",
    embedTitle: "تذكرة شكوى جديدة",
    embedColor: 0xe74c3c,
    image: "https://i.imgur.com/example_complaint.png"
  },
  middleman: {
    label: "طلب وسيط",
    emoji: "🤝",
    style: ButtonStyle.Success,
    categoryId: "ضع_هنا_ايدي_كاتيجوري_الوساطة",
    supportRoleId: "ضع_هنا_ايدي_رتبة_الوسطاء",
    logChannelId: "ضع_هنا_ايدي_روم_لوق_الوساطة",
    embedTitle: "طلب وساطة جديد",
    embedColor: 0x2ecc71,
    image: "https://i.imgur.com/example_mm.png"
  }
};

// تعريف أمر السلاش لإنشاء لوحة التذاكر
const commands = [
  new SlashCommandBuilder()
    .setName('setup-tickets')
    .setDescription('إرسال لوحة التحكم بالتذاكر في الروم الحالي')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(command => command.toJSON());

client.once('ready', async () => {
  console.log(`تم تسجيل الدخول بنجاح باسم: ${client.user.tag}`);
  
  // تسجيل أمر السلاش في كافة سيرفرات البوت تلقائياً عند التشغيل
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('جاري تحديث أوامر البوت (Slash Commands)...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands },
    );
    console.log('تم تسجيل أوامر البوت بنجاح وي مكن استخدامها الآن!');
  } catch (error) {
    console.error('حدث خطأ أثناء تسجيل الأوامر:', error);
  }
});

// معالجة الأوامر والتفاعلات
client.on('interactionCreate', async (interaction) => {
  // 1. تشغيل أمر السلاش لإنشاء اللوحة الرئيسية
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'setup-tickets') {
      await interaction.deferReply({ ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle('مركز المساعدة والتذاكر 🎫')
        .setDescription('مرحباً بك! لفتح تذكرة جديدة، يرجى اختيار القسم المناسب لطلبك من الأزرار الموضحة في الأسفل:')
        .setColor(0x5865F2);

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

      await interaction.channel.send({ embeds: [embed], components: [row] });
      await interaction.editReply({ content: 'تم إرسال لوحة التذاكر بنجاح!' });
    }
    return;
  }

  // 2. معالجة الضغط على أزرار التذاكر
  if (interaction.isButton()) {
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
        // إنشاء الروم معتمداً على إعدادات الكاتيجوري لتجنب مشاكل بوت الحماية
        const ticketChannel = await guild.channels.create({
          name: `${type}-${member.user.username}`,
          type: ChannelType.GuildText,
          parent: config.categoryId
        });

        // إعطاء العضو الصلاحية المنفردة لرؤية الروم بعد الإنشاء
        await ticketChannel.permissionOverwrites.create(member.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true
        });

        // رسالة الترحيب المخصصة
        const ticketEmbed = new EmbedBuilder()
          .setTitle(config.embedTitle)
          .setDescription(`مرحباً بك ${member}، لقد قمت بفتح تذكرة في قسم **${config.label}**.\nيرجى كتابة طلبك أو استفسارك هنا، وسيقوم فريق العمل بالرد عليك قريباً.`)
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

        // إرسال اللوق
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
        await interaction.editReply({ content: 'حدث خطأ أثناء إنشاء التذكرة. تأكد من إعدادات الـ IDs وصلاحيات البوت.', ephemeral: true });
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
