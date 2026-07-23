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

// ==========================================
// 1. خادم الويب والموقع الإلكتروني المتطور
// ==========================================
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// قواعد بيانات محلية في الذاكرة
const panelsDatabase = new Map();
const statsDatabase = {
  totalTickets: 0,
  adminsClaimCount: {} // { "admin_id": count }
};

// الصفحة الرئيسية بالموقع
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>لوحة تحكم التذاكر المتقدمة</title>
      <style>
        body { font-family: sans-serif; background: #0f172a; color: #f8fafc; margin:0; padding:0; }
        nav { background: #1e293b; padding: 15px 30px; display: flex; gap: 20px; border-bottom: 1px solid #334155; }
        nav a { color: #38bdf8; text-decoration: none; font-weight: bold; }
        .container { max-width: 900px; margin: 40px auto; background: #1e293b; padding: 30px; border-radius: 12px; }
        h1 { color: #38bdf8; text-align: center; }
        .btn { display: inline-block; padding: 10px 20px; background: #0284c7; color: white; border-radius: 6px; text-decoration: none; font-weight: bold; margin-top: 15px; }
      </style>
    </head>
    <body>
      <nav>
        <a href="/">الرئيسية 🏠</a>
        <a href="/stats">الإحصائيات 📊</a>
        <a href="/panel">إدارة اللوحات ⚙️</a>
      </nav>
      <div class="container">
        <h1>مرحباً بك في نظام التذاكر الاحترافي 🎫</h1>
        <p style="text-align:center; font-size: 18px; color: #94a3b8;">يمكنك التحكم باللوحات ومعاينة إحصائيات الإدارة والتذاكر بكل سهولة من هنا.</p>
        <div style="text-align:center; margin-top: 30px;">
          <a href="/panel" class="btn">إنشاء لوحة تذاكر جديدة 🚀</a>
          <a href="/stats" class="btn" style="background:#059669;">عرض الإحصائيات 📊</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// صفحة الإحصائيات
app.get('/stats', (req, res) => {
  let adminStatsHTML = '';
  for (const [adminId, count] of Object.entries(statsDatabase.adminsClaimCount)) {
    adminStatsHTML += `<li>👤 الإداري (<@${adminId}> - ID: ${adminId}): <b>${count} تذكرة</b></li>`;
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>إحصائيات التذاكر</title>
      <style>
        body { font-family: sans-serif; background: #0f172a; color: #f8fafc; margin:0; padding:0; }
        nav { background: #1e293b; padding: 15px 30px; display: flex; gap: 20px; border-bottom: 1px solid #334155; }
        nav a { color: #38bdf8; text-decoration: none; font-weight: bold; }
        .container { max-width: 900px; margin: 40px auto; background: #1e293b; padding: 30px; border-radius: 12px; }
        h1, h2 { color: #38bdf8; }
        .card { background: #0f172a; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #334155; }
      </style>
    </head>
    <body>
      <nav>
        <a href="/">الرئيسية 🏠</a>
        <a href="/stats">الإحصائيات 📊</a>
        <a href="/panel">إدارة اللوحات ⚙️</a>
      </nav>
      <div class="container">
        <h1>📊 إحصائيات النظام</h1>
        <div class="card">
          <h2>إجمالي التذاكر المفتوحة: ${statsDatabase.totalTickets}</h2>
        </div>
        <div class="card">
          <h2>أداء الإداريين في استلام التذاكر:</h2>
          <ul>${adminStatsHTML || 'لا توجد إحصائيات استلام بعد.'}</ul>
        </div>
      </div>
    </body>
    </html>
  `);
});

// صفحة إنشاء اللوحة
app.get('/panel', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>إعداد اللوحة</title>
      <style>
        body { font-family: sans-serif; background: #0f172a; color: #f8fafc; margin:0; padding:0; }
        nav { background: #1e293b; padding: 15px 30px; display: flex; gap: 20px; border-bottom: 1px solid #334155; }
        nav a { color: #38bdf8; text-decoration: none; font-weight: bold; }
        .container { max-width: 800px; margin: 40px auto; background: #1e293b; padding: 30px; border-radius: 12px; }
        h1 { color: #38bdf8; text-align: center; }
        label { display: block; margin-top: 15px; font-weight: bold; }
        input, textarea { width: 100%; padding: 10px; margin-top: 5px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; }
        button { margin-top: 25px; width: 100%; padding: 12px; background: #0284c7; color: white; border: none; border-radius: 6px; font-size: 16px; font-weight: bold; cursor: pointer; }
      </style>
    </head>
    <body>
      <nav>
        <a href="/">الرئيسية 🏠</a>
        <a href="/stats">الإحصائيات 📊</a>
        <a href="/panel">إدارة اللوحات ⚙️</a>
      </nav>
      <div class="container">
        <h1>🛠️ إنشاء لوحة تذاكر</h1>
        <form action="/create-panel" method="POST">
          <label>معرف اللوحة (Panel ID):</label>
          <input type="text" name="panelId" placeholder="support_1" required>

          <label>آيدي روم اللوحة:</label>
          <input type="text" name="channelId" required>

          <label>آيدي كاتيجوري التذاكر:</label>
          <input type="text" name="categoryId" required>

          <label>آيدي رتبة الإدارة العادية:</label>
          <input type="text" name="adminRoleId" required>

          <label>آيدي رتبة الإدارة العليا:</label>
          <input type="text" name="highAdminRoleId" required>

          <label>آيدي روم اللوق:</label>
          <input type="text" name="logChannelId" required>

          <label>عنوان اللوحة:</label>
          <input type="text" name="title" value="مركز الدعم الفني 🎫" required>

          <label>وصف اللوحة:</label>
          <textarea name="description" rows="2" required>اضغط على الزر أدناه لفتح تذكرة جديدة.</textarea>

          <label>رسالة الترحيب بالتكت:</label>
          <textarea name="welcomeMessage" rows="2" required>مرحباً بك! يرجى توضيح استفسارك وسيقوم فريق الدعم برفقك.</textarea>

          <button type="submit">إرسال اللوحة للسيرفر 🚀</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

// معالجة إنشاء اللوحة
app.post('/create-panel', async (req, res) => {
  const data = req.body;
  panelsDatabase.set(data.panelId, data);

  try {
    const channel = await client.channels.fetch(data.channelId);
    if (channel) {
      const embed = new EmbedBuilder()
        .setTitle(data.title)
        .setDescription(data.description)
        .setColor(0x0284c7);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`open_ticket_${data.panelId}`)
          .setLabel('فتح تذكرة')
          .setEmoji('🎫')
          .setStyle(ButtonStyle.Primary)
      );

      await channel.send({ embeds: [embed], components: [row] });
      return res.send('<h2>✅ تم إرسال اللوحة بنجاح!</h2><a href="/panel">العودة</a>');
    }
  } catch (err) {
    return res.status(500).send('<h2>❌ خطأ في الإرسال!</h2><a href="/panel">العودة</a>');
  }
});

app.listen(process.env.PORT || 3000, () => console.log('🌐 خادم الويب يعمل بنجاح!'));

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

const PREFIX = '!';

client.once('ready', () => {
  console.log(`🤖 البوت يعمل باسم: ${client.user.tag}`);
});

// --------------------------------------------------
// أجهزة المساعدة للتذاكر
// --------------------------------------------------
async function getTicketInfo(channel) {
  if (!channel.topic) return null;
  try {
    return JSON.parse(channel.topic);
  } catch (e) {
    return null;
  }
}

// --------------------------------------------------
// التعامل مع أوامر الشات البريفكس (!)
// --------------------------------------------------
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (!message.content.startsWith(PREFIX)) return;

  const ticketData = await getTicketInfo(message.channel);
  if (!ticketData) return; // ليس روم تكت

  const config = panelsDatabase.get(ticketData.panelId);
  if (!config) return;

  const isAdmin = message.member.roles.cache.has(config.adminRoleId);
  const isHighAdmin = message.member.roles.cache.has(config.highAdminRoleId);

  // أمر !claim
  if (command === 'claim') {
    if (!isAdmin && !isHighAdmin) return message.reply('❌ مخصص للإدارة فقط!');
    if (ticketData.claimedBy) return message.reply(`❌ التذكرة مستلمة بالفعل بواسطة: <@${ticketData.claimedBy}>`);

    ticketData.claimedBy = message.author.id;
    await message.channel.setTopic(JSON.stringify(ticketData));

    // تحديث صلاحيات الرتبة العادية للإدارة (منعهم من الكتابة وتترك المستلم والعليا فقط)
    await message.channel.permissionOverwrites.edit(config.adminRoleId, { SendMessages: false });
    await message.channel.permissionOverwrites.edit(message.author.id, { SendMessages: true, ViewChannel: true });

    statsDatabase.adminsClaimCount[message.author.id] = (statsDatabase.adminsClaimCount[message.author.id] || 0) + 1;

    return message.reply(`🛠️ تم استلام التذكرة بواسطة ${message.author}`);
  }

  // أمر !unclaim
  if (command === 'unclaim') {
    if (!isHighAdmin) return message.reply('❌ مخصص للإدارة العليا فقط!');
    if (!ticketData.claimedBy) return message.reply('❌ التذكرة غير مستلمة أساساً!');

    ticketData.claimedBy = null;
    await message.channel.setTopic(JSON.stringify(ticketData));

    // إعادة صلاحيات الكتابة للإدارة العادية
    await message.channel.permissionOverwrites.edit(config.adminRoleId, { SendMessages: true });

    return message.reply(`🔄 تم إلغاء استلام التذكرة بواسطة الإدارة العليا: ${message.author}`);
  }

  // أمر !close
  if (command === 'close') {
    if (!isAdmin && !isHighAdmin) return message.reply('❌ لا تمتلك صلاحية الإغلاق!');
    await message.channel.permissionOverwrites.edit(ticketData.ownerId, { ViewChannel: false });

    const closedEmbed = new EmbedBuilder().setTitle('🔒 تم إغلاق التذكرة').setColor(0xef4444);
    const closedRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_reopen').setLabel('إعادة فتح').setEmoji('🔓').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ticket_delete').setLabel('حذف التكت').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
    );

    return message.channel.send({ embeds: [closedEmbed], components: [closedRow] });
  }

  // أمر !delete
  if (command === 'delete') {
    if (!isHighAdmin) return message.reply('❌ مخصص للإدارة العليا فقط!');
    await message.reply('🗑️ جاري حذف التذكرة...');
    setTimeout(() => message.channel.delete().catch(() => {}), 3000);
  }

  // أمر !add
  if (command === 'add') {
    const user = message.mentions.users.first() || await client.users.fetch(args[0]).catch(() => null);
    if (!user) return message.reply('❌ يرجى منشن الشخص أو كتابة الـ ID الخاص به.');

    await message.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true });
    return message.reply(`✅ تم إضافة ${user} للتذكرة.`);
  }

  // أمر !remove
  if (command === 'remove') {
    const user = message.mentions.users.first() || await client.users.fetch(args[0]).catch(() => null);
    if (!user) return message.reply('❌ يرجى منشن الشخص أو كتابة الـ ID الخاص به.');

    await message.channel.permissionOverwrites.delete(user.id).catch(() => {});
    return message.reply(`⛔ تم إزالة ${user} من التذكرة.`);
  }
});

// --------------------------------------------------
// التفاعل مع أزرار التذاكر
// --------------------------------------------------
client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton() && interaction.customId.startsWith('open_ticket_')) {
    await interaction.deferReply({ ephemeral: true });

    const panelId = interaction.customId.replace('open_ticket_', '');
    const config = panelsDatabase.get(panelId);
    if (!config) return interaction.editReply({ content: '❌ لم يتم العثور على اللوحة!' });

    try {
      const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: config.categoryId,
        permissionOverwrites: [
          { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
          { id: config.adminRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
          { id: config.highAdminRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
        ]
      });

      statsDatabase.totalTickets += 1;

      await ticketChannel.setTopic(JSON.stringify({
        ownerId: interaction.user.id,
        panelId: panelId,
        claimedBy: null
      }));

      const welcomeEmbed = new EmbedBuilder()
        .setTitle(`تذكرة دعم فني جديدة`)
        .setDescription(`${config.welcomeMessage}\n\n👤 **صاحب التذكرة:** ${interaction.user}`)
        .setColor(0x0284c7);

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
      await interaction.editReply({ content: '❌ حدث خطأ أثناء إنشاء التذكرة.' });
    }
  }

  if (!interaction.guild || !interaction.channel.topic) return;

  const ticketData = await getTicketInfo(interaction.channel);
  if (!ticketData) return;

  const config = panelsDatabase.get(ticketData.panelId);
  if (!config) return;

  const isAdmin = interaction.member.roles.cache.has(config.adminRoleId);
  const isHighAdmin = interaction.member.roles.cache.has(config.highAdminRoleId);

  // زر استلام (Claim)
  if (interaction.isButton() && interaction.customId === 'ticket_claim') {
    if (!isAdmin && !isHighAdmin) return interaction.reply({ content: '❌ مخصص للإدارة فقط!', ephemeral: true });
    if (ticketData.claimedBy) return interaction.reply({ content: `❌ التذكرة مستلمة بالفعل بواسطة: <@${ticketData.claimedBy}>`, ephemeral: true });

    ticketData.claimedBy = interaction.user.id;
    await interaction.channel.setTopic(JSON.stringify(ticketData));

    // منع باقي الإدارة من الكتابة
    await interaction.channel.permissionOverwrites.edit(config.adminRoleId, { SendMessages: false });
    await interaction.channel.permissionOverwrites.edit(interaction.user.id, { SendMessages: true, ViewChannel: true });

    statsDatabase.adminsClaimCount[interaction.user.id] = (statsDatabase.adminsClaimCount[interaction.user.id] || 0) + 1;

    await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`🛠️ تم استلام التذكرة بواسطة ${interaction.user}`).setColor(0x22c55e)] });
  }

  // زر إلغاء الاستلام (Unclaim)
  if (interaction.isButton() && interaction.customId === 'ticket_unclaim') {
    if (!isHighAdmin) return interaction.reply({ content: '❌ إلغاء الاستلام مخصص للإدارة العليا فقط!', ephemeral: true });
    if (!ticketData.claimedBy) return interaction.reply({ content: '❌ التذكرة غير مستلمة أساساً!', ephemeral: true });

    ticketData.claimedBy = null;
    await interaction.channel.setTopic(JSON.stringify(ticketData));

    // السماح للإدارة بالكتابة مجدداً
    await interaction.channel.permissionOverwrites.edit(config.adminRoleId, { SendMessages: true });

    await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`🔄 تم إلغاء استلام التذكرة بواسطة الإدارة العليا: ${interaction.user}`).setColor(0xeab308)] });
  }

  // طلب وتأكيد الإغلاق
  if (interaction.isButton() && interaction.customId === 'ticket_close_req') {
    if (!isAdmin && !isHighAdmin) return interaction.reply({ content: '❌ لا تمتلك صلاحية الإغلاق!', ephemeral: true });

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
    await interaction.channel.permissionOverwrites.edit(ticketData.ownerId, { ViewChannel: false });

    const closedEmbed = new EmbedBuilder().setTitle('🔒 تم إغلاق التذكرة').setColor(0xef4444);
    const closedRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_reopen').setLabel('إعادة فتح').setEmoji('🔓').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ticket_delete').setLabel('حذف التكت').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
    );

    await interaction.channel.send({ embeds: [closedEmbed], components: [closedRow] });
  }

  // إعادة الفتح والحذف
  if (interaction.isButton() && interaction.customId === 'ticket_reopen') {
    await interaction.channel.permissionOverwrites.edit(ticketData.ownerId, { ViewChannel: true });
    await interaction.reply({ content: `🔓 تم إعادة فتح التذكرة بواسطة ${interaction.user}` });
  }

  if (interaction.isButton() && interaction.customId === 'ticket_delete') {
    if (!isHighAdmin && !isAdmin) return interaction.reply({ content: '❌ لا تمتلك صلاحية الحذف!', ephemeral: true });
    await interaction.reply({ content: '🗑️ سيتم حذف التذكرة خلال 3 ثوانٍ...' });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
  }

  // إضافة/طرد الأشخاص عبر المودال
  if (interaction.isButton() && interaction.customId === 'ticket_add_member') {
    const modal = new ModalBuilder().setCustomId('modal_add_member').setTitle('إضافة شخص للتذكرة');
    const input = new TextInputBuilder().setCustomId('user_id').setLabel('آيدي العضو').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  }

  if (interaction.isButton() && interaction.customId === 'ticket_remove_member') {
    const modal = new ModalBuilder().setCustomId('modal_remove_member').setTitle('طرد شخص من التذكرة');
    const input = new TextInputBuilder().setCustomId('user_id').setLabel('آيدي العضو').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'modal_add_member') {
    const userId = interaction.fields.getTextInputValue('user_id');
    await interaction.channel.permissionOverwrites.edit(userId, { ViewChannel: true, SendMessages: true });
    await interaction.reply({ content: `✅ تم إضافة العضو <@${userId}> إلى التذكرة.` });
  }

  if (interaction.isModalSubmit() && interaction.customId === 'modal_remove_member') {
    const userId = interaction.fields.getTextInputValue('user_id');
    await interaction.channel.permissionOverwrites.delete(userId).catch(() => {});
    await interaction.reply({ content: `⛔ تم إزالة العضو <@${userId}> من التذكرة.` });
  }
});

client.login(process.env.DISCORD_TOKEN);
