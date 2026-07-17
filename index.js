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

// ================= [ إعدادات لوحة الدعم الفني ] =================
// تأكد أن هذه الـ IDs حقيقية ومنسوخة من سيرفرك بدقة (أرقام فقط)
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
    client.ws.shards.forEach(shard => shard.send({ op: 6, d: { token: process.env.DISCORD_TOKEN, session_id: null, seq: 0 } }));
  } catch (err) {
    console.log('لم يتم العثور على جلسات قديمة لتصفيتها.');
  }

  // تسجيل أمر السلاش في السيرفر تلقائياً
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
  // تجاهل أي تفاعل قديم معلّق قبل تشغيل السيرفر الحالي
  if (interaction.createdAt.getTime() < BOOT_TIME) return;

  // 1. تشغيل أمر السلاش لإنشاء اللوحة الرئيسية (زر واحد فقط للدعم)
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'setup-tickets') {
      await interaction.deferReply({ ephemeral: true });

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

      await interaction.channel.send({ embeds: [embed], components: [row] });
      await interaction.editReply({ content: 'تم إرسال لوحة التذاكر بنجاح!' });
    }
    return;
  }

  // 2. معالجة الضغط على الزر
  if (interaction.isButton()) {
    const customId = interaction.customId;

    // زر إغلاق التذكرة
    if (customId === 'close_ticket') {
      await interaction.reply('سيتم إغلاق التذكرة وحذف الروم خلال 3 ثوانٍ...');
      setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
      return;
    }

    // زر فتح التذكرة
    if (customId === 'ticket_support') {
      await interaction.deferReply({ ephemeral: true });

      const guild = interaction.guild;
      const member = interaction.member;

      try {
        // إنشاء الروم وتحديد الصلاحيات الحصرية فوراً
        const ticketChannel = await guild.channels.create({
          name: `ticket-${member.user.username}`,
          type: ChannelType.GuildText,
          parent: TICKET_CONFIG.categoryId,
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
              id: TICKET_CONFIG.supportRoleId,
              allow: [
                PermissionFlagsBits.ViewChannel, 
                PermissionFlagsBits.SendMessages, 
                PermissionFlagsBits.ReadMessageHistory
              ], // السماح لطاقم الدعم الفني
            }
          ]
        });

        // رسالة الترحيب والتحكم بالتذكرة
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

        // إرسال اللوق لروم السجلات
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
        await interaction.editReply({ content: 'حدث خطأ أثناء إنشاء التذكرة. تأكد من صلاحيات البوت ورتبته في السيرفر.', ephemeral: true });
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
