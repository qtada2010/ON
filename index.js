const { 
  Client, 
  GatewayIntentBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder, 
  ChannelType, 
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder
} = require('discord.js');
const express = require('express');
const path = require('path');

// ==========================================
// 1. خادم الويب والموقع الإلكتروني (Dashboard)
// ==========================================
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// قاعدة بيانات محلية في الذاكرة لتخزين إعدادات اللوحات
const panelsDatabase = new Map();

// واجهة لوحة التحكم البسيطة
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>لوحة التحكم بالتذاكر</title>

      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f172a; color: #f8fafc; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; background: #1e293b; padding: 30px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
        h1, h2 { color: #38bdf8; text-align: center; }
        label { display: block; margin-top: 15px; font-weight: bold; color: #cbd5e1; }
        input, textarea, select { width: 100%; padding: 10px; margin-top: 5px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; }
        button { margin-top: 25px; width: 100%; padding: 12px; background: #0284c7; color: white; border: none; border-radius: 6px; font-size: 16px; font-weight: bold; cursor: pointer; transition: 0.3s; }
        button:hover { background: #0369a1; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🛠️ إنشاء وتعديل لوحة تذاكر جديدة</h1>
        <form action="/create-panel" method="POST">
          <label>معرف اللوحة (Panel ID الفريد):</label>
          <input type="text" name="panelId" placeholder="support_panel_1" required>

          <label>آيدي روم اللوحة (Channel ID):</label>
          <input type="text" name="channelId" placeholder="123456789012345678" required>

          <label>آيدي كاتيجوري التذاكر (Category ID):</label>
          <input type="text" name="categoryId" placeholder="123456789012345678" required>

          <label>آيدي رتبة الإدارة العادية:</label>
          <input type="text" name="adminRoleId" placeholder="123456789012345678" required>

          <label>آيدي رتبة الإدارة العليا:</label>
          <input type="text" name="highAdminRoleId" placeholder="123456789012345678" required>

          <label>آيدي روم اللوق (Log Channel ID):</label>
          <input type="text" name="logChannelId" placeholder="123456789012345678" required>

          <hr style="margin-top:25px; border-color:#334155;">

          <label>عنوان لوحة التذاكر:</label>
          <input type="text" name="title" value="مركز الدعم الفني 🎫" required>

          <label>وصف لوحة التذاكر:</label>
          <textarea name="description" rows="3" required>اضغط على الزر أدناه لفتح تذكرة دعم جديدة وسيتم خدمتك فوراً.</textarea>

          <label>رسالة الترحيب داخل التكت:</label>
          <textarea name="welcomeMessage" rows="3" required>مرحباً بك! يرجى توضيح مشكلتك أو استفسارك وسيتم الرد عليك من قبل فريق الدعم.</textarea>

          <button type="submit">إرسال اللوحة للسيرفر 🚀</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

// استقبال البيانات من الموقع وإرسال اللوحة إلى السيرفر
app.post('/create-panel', async (req, res) => {
  const data = req.body;
  panelsDatabase.set(data.panelId, data);

  try {
    const channel = await client.channels.fetch(data.channelId);
    if (channel) {
      const embed = new EmbedBuilder()
        .setTitle(data.title)
        .setDescription(data.description)
        .setColor(0x0284c7)
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`open_ticket_${data.panelId}`)
          .setLabel('فتح تذكرة')
          .setEmoji('🎫')
          .setStyle(ButtonStyle.Primary)
      );

      await channel.send({ embeds: [embed], components: [row] });
      return res.send('<h2>✅ تم إرسال اللوحة بنجاح إلى القناة المحددة!</h2><a href="/">العودة للوحة التحكم</a>');
    }
  } catch (err) {
    console.error(err);
    return res.status(500).send('<h2>❌ حدث خطأ، تأكد من صحة الآيديهات المضافة!</h2><a href="/">العودة للوحة التحكم</a>');
  }
});

app.listen(process.env.PORT || 3000, () => console.log('🌐 خادم لوحة التحكم يعمل بنجاح!'));

// ==========================================
// 2. إعداد وإدارة بوت الديسكورد
// ==========================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log(`🤖 تم تسجيل الدخول بنجاح باسم: ${client.user.tag}`);
});

// معالجة جميع تفاعلات الأزرار والنماذج
client.on('interactionCreate', async (interaction) => {
  
  // --------------------------------------------------
  // A. فتح تذكرة جديدة
  // --------------------------------------------------
  if (interaction.isButton() && interaction.customId.startsWith('open_ticket_')) {
    await interaction.deferReply({ ephemeral: true });

    const panelId = interaction.customId.replace('open_ticket_', '');
    const config = panelsDatabase.get(panelId);

    if (!config) {
      return interaction.editReply({ content: '❌ لم يتم العثور على إعدادات هذه اللوحة!' });
    }

    try {
      const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: config.categoryId,
        permissionOverwrites: [
          { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: config.adminRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: config.highAdminRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
        ]
      });

      // حفظ بيانات التكت في القناة (تخزين بيانات اللوحة كـ Topic)
      await ticketChannel.setTopic(JSON.stringify({
        ownerId: interaction.user.id,
        panelId: panelId,
        claimedBy: null
      }));

      const welcomeEmbed = new EmbedBuilder()
        .setTitle(`تذكرة دعم فني جديدة`)
        .setDescription(`${config.welcomeMessage}\n\n👤 **صاحب التذكرة:** ${interaction.user}`)
        .setColor(0x0284c7)
        .setTimestamp();

      // أزرار التذكرة الأساسية
      const buttonsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_claim').setLabel('استلام').setEmoji('🛠️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ticket_unclaim').setLabel('إلغاء استلام').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_close_req').setLabel('إغلاق').setEmoji('🔒').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ticket_add_member').setLabel('إضافة شخص').setEmoji('➕').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_remove_member').setLabel('طرد شخص').setEmoji('➖').setStyle(ButtonStyle.Secondary)
      );

      await ticketChannel.send({ 
        content: `${interaction.user} | <@&${config.adminRoleId}> | <@&${config.highAdminRoleId}>`, 
        embeds: [welcomeEmbed], 
        components: [buttonsRow] 
      });

      await interaction.editReply({ content: `✅ تم إنشاء تذكرتك بنجاح: ${ticketChannel}` });

    } catch (err) {
      console.error(err);
      await interaction.editReply({ content: '❌ حدث خطأ أثناء إنشاء التذكرة.' });
    }
  }

  // إذا لم يكن التفاعل داخل روم تكت، يتوقف الكود
  if (!interaction.guild || !interaction.channel.topic) return;

  let ticketData;
  try {
    ticketData = JSON.parse(interaction.channel.topic);
  } catch (e) {
    return; // القناة ليست تكت تابعة للبوت
  }

  const config = panelsDatabase.get(ticketData.panelId);
  if (!config) return;

  const isAdmin = interaction.member.roles.cache.has(config.adminRoleId);
  const isHighAdmin = interaction.member.roles.cache.has(config.highAdminRoleId);

  // --------------------------------------------------
  // B. زر استلام التكت (Claim)
  // --------------------------------------------------
  if (interaction.isButton() && interaction.customId === 'ticket_claim') {
    if (!isAdmin && !isHighAdmin) {
      return interaction.reply({ content: '❌ هذه الصلاحية مخصصة للإدارة فقط!', ephemeral: true });
    }

    if (ticketData.claimedBy) {
      return interaction.reply({ content: `❌ التذكرة مستلمة بالفعل بواسطة: <@${ticketData.claimedBy}>`, ephemeral: true });
    }

    ticketData.claimedBy = interaction.user.id;
    await interaction.channel.setTopic(JSON.stringify(ticketData));

    const claimEmbed = new EmbedBuilder()
      .setDescription(`🛠️ تم استلام التذكرة بواسطة ${interaction.user}`)
      .setColor(0x22c55e);

    await interaction.reply({ embeds: [claimEmbed] });
  }

  // --------------------------------------------------
  // C. زر إلغاء الاستلام (Unclaim - للإدارة العليا فقط)
  // --------------------------------------------------
  if (interaction.isButton() && interaction.customId === 'ticket_unclaim') {
    if (!isHighAdmin) {
      return interaction.reply({ content: '❌ إلغاء الاستلام مخصص **للإدارة العليا** فقط!', ephemeral: true });
    }

    if (!ticketData.claimedBy) {
      return interaction.reply({ content: '❌ التذكرة غير مستلمة أساساً!', ephemeral: true });
    }

    ticketData.claimedBy = null;
    await interaction.channel.setTopic(JSON.stringify(ticketData));

    const unclaimEmbed = new EmbedBuilder()
      .setDescription(`🔄 تم إلغاء استلام التذكرة بواسطة الإدارة العليا: ${interaction.user}`)
      .setColor(0xeab308);

    await interaction.reply({ embeds: [unclaimEmbed] });
  }

  // --------------------------------------------------
  // D. طلب الإغلاق وتأكيده
  // --------------------------------------------------
  if (interaction.isButton() && interaction.customId === 'ticket_close_req') {
    if (!isAdmin && !isHighAdmin) {
      return interaction.reply({ content: '❌ لا تمتلك صلاحية إغلاق التذكرة!', ephemeral: true });
    }

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_confirm_close').setLabel('تأكيد الإغلاق').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket_cancel_close').setLabel('إلغاء').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ content: '⚠️ هل أنت أكتد من رغبتك في إغلاق هذه التذكرة؟', components: [confirmRow] });
  }

  if (interaction.isButton() && interaction.customId === 'ticket_cancel_close') {
    await interaction.message.delete().catch(() => {});
  }

  if (interaction.isButton() && interaction.customId === 'ticket_confirm_close') {
    await interaction.deferUpdate();

    // إخفاء رؤية القناة عن صاحب التذكرة
    await interaction.channel.permissionOverwrites.edit(ticketData.ownerId, {
      ViewChannel: false
    });

    const closedEmbed = new EmbedBuilder()
      .setTitle('🔒 تم إغلاق التذكرة')
      .setDescription(`تم إغلاق التذكرة بواسطة ${interaction.user}`)
      .setColor(0xef4444);

    const closedRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_reopen').setLabel('إعادة فتح').setEmoji('🔓').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ticket_save_log').setLabel('حفظ الترانسكريبت').setEmoji('📜').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket_delete').setLabel('حذف التكت').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
    );

    await interaction.channel.send({ embeds: [closedEmbed], components: [closedRow] });
  }

  // --------------------------------------------------
  // E. إعادة فتح التذكرة / حفظ / حذف
  // --------------------------------------------------
  if (interaction.isButton() && interaction.customId === 'ticket_reopen') {
    await interaction.channel.permissionOverwrites.edit(ticketData.ownerId, {
      ViewChannel: true
    });

    await interaction.reply({ content: `🔓 تم إعادة فتح التذكرة بواسطة ${interaction.user}` });
  }

  if (interaction.isButton() && interaction.customId === 'ticket_delete') {
    if (!isHighAdmin && !isAdmin) {
      return interaction.reply({ content: '❌ لا تمتلك صلاحية حذف التذكرة!', ephemeral: true });
    }

    await interaction.reply({ content: '🗑️ سيتم حذف التذكرة خلال 5 ثوانٍ...' });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
  }

  if (interaction.isButton() && interaction.customId === 'ticket_save_log') {
    await interaction.deferReply();

    // جلب الرسائل وحفظ الترانسكريبت
    const messages = await interaction.channel.messages.fetch({ limit: 100 });
    let transcriptText = `--- ترانسكريبت التكت: ${interaction.channel.name} ---\n\n`;

    messages.reverse().forEach(m => {
      transcriptText += `[${m.createdAt.toLocaleString()}] ${m.author.tag}: ${m.content}\n`;
    });

    const buffer = Buffer.from(transcriptText, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: `${interaction.channel.name}-transcript.txt` });

    const logChannel = interaction.guild.channels.cache.get(config.logChannelId);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setTitle('📜 سجل ترانسكريبت تذكرة مغلقة')
        .addFields(
          { name: 'التكت:', value: interaction.channel.name, inline: true },
          { name: 'صاحب التكت:', value: `<@${ticketData.ownerId}>`, inline: true },
          { name: 'حفظ بواسطة:', value: `${interaction.user}`, inline: true }
        )
        .setColor(0x0284c7)
        .setTimestamp();

      await logChannel.send({ embeds: [logEmbed], files: [attachment] });
      await interaction.editReply({ content: '✅ تم حفظ الترانسكريبت وإرساله إلى روم اللوق بنجاح!' });
    } else {
      await interaction.editReply({ content: '❌ تعذر العثور على قناة اللوق المحددة!' });
    }
  }

  // --------------------------------------------------
  // F. إضافة وطرد الأشخاص من التكت (Modals)
  // --------------------------------------------------
  if (interaction.isButton() && interaction.customId === 'ticket_add_member') {
    const modal = new ModalBuilder().setCustomId('modal_add_member').setTitle('إضافة شخص للتذكرة');
    const input = new TextInputBuilder().setCustomId('user_id').setLabel('آيدي العضو (User ID)').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  }

  if (interaction.isButton() && interaction.customId === 'ticket_remove_member') {
    const modal = new ModalBuilder().setCustomId('modal_remove_member').setTitle('طرد شخص من التذكرة');
    const input = new TextInputBuilder().setCustomId('user_id').setLabel('آيدي العضو (User ID)').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'modal_add_member') {
    const userId = interaction.fields.getTextInputValue('user_id');
    await interaction.channel.permissionOverwrites.edit(userId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    }).catch(() => {});

    await interaction.reply({ content: `✅ تم إضافة العضو <@${userId}> إلى التذكرة بنجاح.` });
  }

  if (interaction.isModalSubmit() && interaction.customId === 'modal_remove_member') {
    const userId = interaction.fields.getTextInputValue('user_id');
    await interaction.channel.permissionOverwrites.delete(userId).catch(() => {});

    await interaction.reply({ content: `⛔ تم إزالة العضو <@${userId}> من التذكرة بنجاح.` });
  }
});

client.login(process.env.DISCORD_TOKEN);
