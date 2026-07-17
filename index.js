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

// 1. تشغيل خادم ويب للاستضافة لمنع Render من النوم
const app = express();
app.get('/', (req, res) => res.send('بوت التذاكر المطور يعمل بنشاط وبدون توقف!'));
app.listen(process.env.PORT || 3000, () => console.log('خادم الويب جاهز ومستعد'));

// 2. إعداد البوت والـ Intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// متغير لتخزين وقت تشغيل البوت الحالي لتجاهل أي تفاعلات قديمة جداً أو معلقة
const BOOT_TIME = Date.now();

// ================= [ إعدادات لوحات التذاكر ] =================
// تنبيه هام: يجب استبدال الكلمات المكتوبة بـ IDs حقيقية (أرقام فقط) لكي لا يتعطل البوت!
const TICKET_CONFIGS = {
  support: {
    label: "دعم فني",
    emoji: "🛠️",
    style: ButtonStyle.Primary,
    categoryId: "1524792058278187018", 
    supportRoleId: "1353008060955885658", 
    logChannelId: "1391189899235037224", 
    embedTitle: "تذكرة دعم فني جديدة",
    embedColor: 0x3498db,
    image: "https://media.discordapp.net/attachments/1355903779073167619/1502427418839744663/423_20250417230604.png?ex=6a5b4c52&is=6a59fad2&hm=2bdfcd33727e669cfdbfc752c22b8a7e9e778deb43db944446160ce4b12ea1ea&=&format=webp&quality=lossless&width=1860&height=718"
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
  
  // خطوة طرد وإيقاف أي جلسة قديمة شغالة بنفس التوكن فوراً
  try {
    console.log('جاري فحص وطرد أي نسخة قديمة للبوت...');
    // إعادة تعيين الجلسة لتجبر سيرفرات ديسكورد على قطع اتصال النسخة القديمة
    client.ws.shards.forEach(shard => shard.send({ op: 6, d: { token: process.env.DISCORD_TOKEN, session_id: null, seq: 0 } }));
  } catch (err) {
    console.log('لم يتم العثور على جلسات قديمة لتصفيتها.');
  }

  // تسجيل أمر السلاش في كافة سيرفرات البوت تلقائياً
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('جاري تحديث أوامر البوت (Slash Commands)...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands },
    );
    console.log('تم تسجيل أوامر البوت بنجاح ويمكن استخدامها الآن!');
  } catch (error) {
    console.error('حدث خطأ أثناء تسجيل الأوامر:', error);
  }
});

// معالجة الأوامر والتفاعلات
client.on('interactionCreate', async (interaction) => {
  // آلية الأمان: تجاهل أي تفاعل تم إنشاؤه قبل تشغيل هذا السيرفر الحالي للوقاية من تداخل الأوامر القديمة المعلقة
  if (interaction.createdAt.getTime() < BOOT_TIME) return;

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

      // تحقق لضمان استبدال النصوص الافتراضية بـ IDs صحيحة
      if (config.categoryId.includes("ضع_هنا") || config.supportRoleId.includes("ضع_هنا")) {
        return interaction.editReply({ content: '❌ خطأ: لم يتم ضبط الـ IDs الخاصة بهذا القسم في ملف البرمجة حتى الآن.', ephemeral: true });
      }

      try {
        // إنشاء الروم وتحديد الصلاحيات الحصرية فوراً لمنع الأعضاء الآخرين من رؤيته
        const ticketChannel = await guild.channels.create({
          name: `${type}-${member.user.username}`,
          type: ChannelType.GuildText,
          parent: config.categoryId,
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionFlagsBits.ViewChannel], // إخفاء الروم عن الجميع
            },
            {
              id: member.id,
              allow: [
                PermissionFlagsBits.ViewChannel, 
                PermissionFlagsBits.SendMessages, 
                PermissionFlagsBits.ReadMessageHistory
              ], // السماح لصاحب التذكرة بالكامل
            },
            {
              id: config.supportRoleId,
              allow: [
                PermissionFlagsBits.ViewChannel, 
                PermissionFlagsBits.SendMessages, 
                PermissionFlagsBits.ReadMessageHistory
              ], // السماح لطاقم الدعم الفني المخصص
            }
          ]
        });

        // رسالة الترحيب والتحكم بالتذكرة
        const ticketEmbed = new EmbedBuilder()
          .setTitle(config.embedTitle)
          .setDescription(`مرحباً بك ${member}، لقد قمت بفتح تذكرة في قسم **${config.label}**.\nيرجى كتابة طلبك أو استفسارك هنا، وسيقوم فريق العمل بالرد عليك قريباً.`)
          .setColor(config.embedColor)
          .setTimestamp();
          
        if (config.image && !config.image.includes("example")) {
          ticketEmbed.setThumbnail(config.image);
        }

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

        // إرسال اللوق لروم السجلات
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
          logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }

        await interaction.editReply({ content: `تم إنشاء تذكرتك بنجاح في الروم: ${ticketChannel}`, ephemeral: true });

      } catch (error) {
        console.error("خطأ أثناء إنشاء التذكرة:", error);
        await interaction.editReply({ content: 'حدث خطأ أثناء إنشاء التذكرة. تأكد من أن صلاحية رتبة البوت أعلى من رتبة الدعم الفني، وصلاحياته تسمح بإنشاء القنوات (Manage Channels).', ephemeral: true });
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
