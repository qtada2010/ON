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
  AttachmentBuilder,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');
const express = require('express');

// ==========================================
// 1. إنشاء العميل (Client) أولاً لمنع ReferenceError
// ==========================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const PREFIX = '!';
const panelsDatabase = new Map();
const statsDatabase = { totalTickets: 0, adminsClaimCount: {} };
let ownerLogChannelId = null;

// ==========================================
// 2. خادم الويب ولوحة التحكم (Dashboard)
// ==========================================
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>لوحة التحكم بالتذاكر</title>
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
        <h1>لوحة تحكم التذاكر 🎫</h1>
        <p style="text-align:center; color: #94a3b8;">يمكنك التحكم الكامل وتعديل اللوحات ومتابعة النظام من هنا.</p>
        <div style="text-align:center; margin-top: 30px;">
          <a href="/panel" class="btn">إنشاء / تعديل اللوحات 🛠️</a>
          <a href="/stats" class="btn" style="background:#059669;">الإحصائيات 📊</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

app.get('/panel', (req, res) => {
  let panelsListHTML = '';
  panelsDatabase.forEach((p, id) => {
    panelsListHTML += `
      <div style="background:#0f172a; padding:15px; border-radius:8px; margin-bottom:15px; border:1px solid #334155;">
        <h3>📌 المعرف: ${id} - ${p.title}</h3>
        <p>روم اللوحة: ${p.channelId} | رتبة الإدارة: ${p.adminRoleId}</p>
        <a href="/edit-panel/${id}" style="color:#38bdf8; font-weight:bold;">✏️ تعديل هذه اللوحة</a>
      </div>
    `;
  });

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>إدارة اللوحات</title>
      <style>
        body { font-family: sans-serif; background: #0f172a; color: #f8fafc; margin:0; padding:0; }
        nav { background: #1e293b; padding: 15px 30px; display: flex; gap: 20px; border-bottom: 1px solid #334155; }
        nav a { color: #38bdf8; text-decoration: none; font-weight: bold; }
        .container { max-width: 800px; margin: 40px auto; background: #1e293b; padding: 30px; border-radius: 12px; }
        h1, h2 { color: #38bdf8; }
        label { display: block; margin-top: 10px; font-weight: bold; }
        input, textarea { width: 100%; padding: 8px; margin-top: 5px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; }
        button { margin-top: 20px; width: 100%; padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }
      </style>
    </head>
    <body>
      <nav>
        <a href="/">الرئيسية 🏠</a>
        <a href="/stats">الإحصائيات 📊</a>
        <a href="/panel">إدارة اللوحات ⚙️</a>
      </nav>
      <div class="container">
        <h1>➕ إنشاء لوحة جديدة</h1>
        <form action="/save-panel" method="POST">
          <label>معرف اللوحة الفريد (Panel ID):</label>
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

          <button type="submit">حفظ وإرسال اللوحة للسيرفر 🚀</button>
        </form>

        <hr style="margin: 30px 0; border-color: #334155;">
        <h2>📋 اللوحات الحالية (إمكانية التعديل):</h2>
        ${panelsListHTML || '<p>لا توجد لوحات منشأة بعد.</p>'}
      </div>
    </body>
    </html>
  `);
});

app.get('/edit-panel/:id', (req, res) => {
  const panel = panelsDatabase.get(req.params.id);
  if (!panel) return res.send('اللوحة غير موجودة');

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>تعديل اللوحة ${panel.panelId}</title>
      <style>
        body { font-family: sans-serif; background: #0f172a; color: #f8fafc; margin:20px; }
        .container { max-width: 800px; margin: auto; background: #1e293b; padding: 30px; border-radius: 12px; }
        h1 { color: #38bdf8; }
        label { display: block; margin-top: 10px; }
        input, textarea { width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; }
        button { margin-top: 20px; width: 100%; padding: 10px; background: #eab308; color: black; font-weight: bold; border: none; border-radius: 6px; cursor: pointer; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>✏️ تعديل اللوحة: ${panel.panelId}</h1>
        <form action="/save-panel" method="POST">
          <input type="hidden" name="panelId" value="${panel.panelId}">

          <label>آيدي روم اللوحة:</label>
          <input type="text" name="channelId" value="${panel.channelId}" required>

          <label>آيدي كاتيجوري التذاكر:</label>
          <input type="text" name="categoryId" value="${panel.categoryId}" required>

          <label>آيدي رتبة الإدارة العادية:</label>
          <input type="text" name="adminRoleId" value="${panel.adminRoleId}" required>

          <label>آيدي رتبة الإدارة العليا:</label>
          <input type="text" name="highAdminRoleId" value="${panel.highAdminRoleId}" required>

          <label>آيدي روم اللوق:</label>
          <input type="text" name="logChannelId" value="${panel.logChannelId}" required>

          <label>عنوان اللوحة:</label>
          <input type="text" name="title" value="${panel.title}" required>

          <label>وصف اللوحة:</label>
          <textarea name="description" rows="2" required>${panel.description}</textarea>

          <label>رسالة الترحيب بالتكت:</label>
          <textarea name="welcomeMessage" rows="2" required>${panel.welcomeMessage}</textarea>

          <button type="submit">حفظ التحديثات بإعادة الإرسال 🔄</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

app.post('/save-panel', async (req, res) => {
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
      return res.send('<h2>✅ تم حفظ اللوحة وإرسالها/تحديثها بالسيرفر بنجاح!</h2><a href="/panel">العودة للوحة التحكم</a>');
    }
  } catch (err) {
    sendLogError('خطأ أثناء حفظ/تحديث اللوحة:', err);
    return res.status(500).send('<h2>❌ خطأ في الإرسال! تأكد من صحة الآيديهات.</h2><a href="/panel">العودة</a>');
  }
});

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
      <title>الإحصائيات</title>
      <style>
        body { font-family: sans-serif; background: #0f172a; color: #f8fafc; margin:0; padding:0; }
        nav { background: #1e293b; padding: 15px 30px; display: flex; gap: 20px; border-bottom: 1px solid #334155; }
        nav a { color: #38bdf8; text-decoration: none; font-weight: bold; }
        .container { max-width: 800px; margin: 40px auto; background: #1e293b; padding: 30px; border-radius: 12px; }
        h1, h2 { color: #38bdf8; }
      </style>
    </head>
    <body>
      <nav>
        <a href="/">الرئيسية 🏠</a>
        <a href="/stats">الإحصائيات 📊</a>
        <a href="/panel">إدارة اللوحات ⚙️</a>
      </nav>
      <div class="container">
        <h1>📊 إحصائيات التذاكر الإجمالية</h1>
        <h2>إجمالي التذاكر: ${statsDatabase.totalTickets}</h2>
        <h2>استلامات الإدارة:</h2>
        <ul>${adminStatsHTML || 'لا توجد بيانات استلام بعد.'}</ul>
      </div>
    </body>
    </html>
  `);
});

app.listen(process.env.PORT || 3000, () => console.log('🌐 خادم الويب يعمل بنجاح!'));

// ==========================================
// 3. الدوال والأوامر الأساسية للبوت
// ==========================================

async function sendLogError(title, error) {
  console.error(title, error);
  if (ownerLogChannelId) {
    try {
      const channel = await client.channels.fetch(ownerLogChannelId);
      if (channel) {
        const errEmbed = new EmbedBuilder()
          .setTitle(`⚠️ تنبيه خطأ في البوت`)
          .addFields(
            { name: 'الوصف:', value: `${title}` },
            { name: 'التفاصيل:', value: `\`\`\`js\n${error.message || error}\n\`\`\`` }
          )
          .setColor(0xef4444)
          .setTimestamp();
        await channel.send({ embeds: [errEmbed] });
      }
    } catch (e) {
      console.error('تعذر إرسال اللوق لروم المالك:', e);
    }
  }
}

client.once('ready', async () => {
  console.log(`🤖 تم تسجيل الدخول بنجاح باسم: ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder().setName('claim').setDescription('استلام التذكرة الحالية'),
    new SlashCommandBuilder().setName('unclaim').setDescription('إلغاء استلام التذكرة'),
    new SlashCommandBuilder().setName('close').setDescription('إغلاق التذكرة الحالية'),
    new SlashCommandBuilder().setName('delete').setDescription('حذف التذكرة الحالية'),
    new SlashCommandBuilder().setName('save').setDescription('حفظ ترانسكريبت التذكرة في روم اللوق'),
    new SlashCommandBuilder().setName('logowner').setDescription('تحديد روم لوق أخطاء البوت للمالك').addChannelOption(o => o.setName('channel').setDescription('القناة').setRequired(true))
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ تم تسجيل أوامر السلاش (/) بنجاح!');
  } catch (e) {
    sendLogError('خطأ أثناء تسجيل أوامر السلاش:', e);
  }
});

async function getTicketInfo(channel) {
  if (!channel.topic) return null;
  try { return JSON.parse(channel.topic); } catch (e) { return null; }
}

async function saveTranscript(channel, config, user, ticketData) {
  const messages = await channel.messages.fetch({ limit: 100 });
  let transcriptText = `--- سجل التكت: ${channel.name} ---\n\n`;

  messages.reverse().forEach(m => {
    transcriptText += `[${m.createdAt.toLocaleString()}] ${m.author.tag}: ${m.content}\n`;
  });

  const buffer = Buffer.from(transcriptText, 'utf-8');
  const attachment = new AttachmentBuilder(buffer, { name: `${channel.name}-transcript.txt` });

  const logChannel = channel.guild.channels.cache.get(config.logChannelId);
  if (logChannel) {
    const logEmbed = new EmbedBuilder()
      .setTitle('📜 سجل الترانسكريبت للتذكرة')
      .addFields(
        { name: 'التكت:', value: channel.name, inline: true },
        { name: 'صاحب التكت:', value: `<@${ticketData.ownerId}>`, inline: true },
        { name: 'تم الحفظ بواسطة:', value: `${user}`, inline: true }
      )
      .setColor(0x0284c7)
      .setTimestamp();

    await logChannel.send({ embeds: [logEmbed], files: [attachment] });
    return true;
  }
  return false;
}

// --------------------------------------------------
// معالجة أوامر البريفكس (!)
// --------------------------------------------------
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  if (message.content.startsWith(`${PREFIX}logowner`)) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ هذا الأمر يتطلب صلاحيات **Administrator**!');
    }

    const channel = message.mentions.channels.first() || message.channel;
    ownerLogChannelId = channel.id;
    return message.reply(`✅ تم تحديد ${channel} كقناة لوق الأخطاء الخاصة بمالك البوت بنجاح!`);
  }

  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  const ticketData = await getTicketInfo(message.channel);
  if (!ticketData) return;

  const config = panelsDatabase.get(ticketData.panelId);
  if (!config) return;

  const isAdmin = message.member.roles.cache.has(config.adminRoleId);
  const isHighAdmin = message.member.roles.cache.has(config.highAdminRoleId);
  const isOwner = message.author.id === ticketData.ownerId;

  if (command === 'claim') {
    if (!isAdmin && !isHighAdmin) return message.reply('❌ مخصص للإدارة فقط!');
    if (ticketData.claimedBy) return message.reply(`❌ التذكرة مستلمة بالفعل من: <@${ticketData.claimedBy}>`);

    ticketData.claimedBy = message.author.id;
    await message.channel.setTopic(JSON.stringify(ticketData));
    await message.channel.permissionOverwrites.edit(config.adminRoleId, { SendMessages: false });
    await message.channel.permissionOverwrites.edit(message.author.id, { SendMessages: true, ViewChannel: true });

    statsDatabase.adminsClaimCount[message.author.id] = (statsDatabase.adminsClaimCount[message.author.id] || 0) + 1;
    return message.reply(`🛠️ تم استلام التذكرة بواسطة ${message.author}`);
  }

  if (command === 'unclaim') {
    if (!isHighAdmin && !isOwner) return message.reply('❌ مخصص **للإدارة العليا** أو **صاحب التكت** فقط!');
    if (!ticketData.claimedBy) return message.reply('❌ التذكرة غير مستلمة أساساً!');

    ticketData.claimedBy = null;
    await message.channel.setTopic(JSON.stringify(ticketData));
    await message.channel.permissionOverwrites.edit(config.adminRoleId, { SendMessages: true });
    return message.reply(`🔄 تم إلغاء استلام التذكرة بواسطة: ${message.author}`);
  }

  if (command === 'close') {
    if (!isAdmin && !isHighAdmin && !isOwner) return message.reply('❌ لا تمتلك صلاحية الإغلاق!');
    await message.channel.permissionOverwrites.edit(ticketData.ownerId, { ViewChannel: false });

    const closedEmbed = new EmbedBuilder().setTitle('🔒 تم إغلاق التذكرة').setColor(0xef4444);
    const closedRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_reopen').setLabel('إعادة فتح').setEmoji('🔓').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ticket_save_log').setLabel('حفظ الترانسكريبت').setEmoji('📜').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket_delete').setLabel('حذف التكت').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
    );
    return message.channel.send({ embeds: [closedEmbed], components: [closedRow] });
  }

  if (command === 'save') {
    const success = await saveTranscript(message.channel, config, message.author, ticketData);
    if (success) return message.reply('✅ تم حفظ الترانسكريبت بنجاح إلى قناة اللوق!');
    return message.reply('❌ تعذر العثور على قناة اللوق المحددة في الإعدادات.');
  }

  if (command === 'delete') {
    if (!isHighAdmin) return message.reply('❌ مخصص للإدارة العليا فقط!');
    await message.reply('🗑️ جاري حذف التذكرة...');
    setTimeout(() => message.channel.delete().catch(() => {}), 3000);
  }
});

// --------------------------------------------------
// التفاعل مع الأزرار وأوامر السلاش (/)
// --------------------------------------------------
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'logowner') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ يتطلب صلاحية Administrator!', ephemeral: true });
        }
        const ch = interaction.options.getChannel('channel');
        ownerLogChannelId = ch.id;
        return interaction.reply({ content: `✅ تم ضبط قناة اللوق إلى: ${ch}`, ephemeral: true });
      }

      const ticketData = await getTicketInfo(interaction.channel);
      if (!ticketData) return interaction.reply({ content: '❌ هذا الأمر يشتغل داخل التذاكر فقط!', ephemeral: true });

      const config = panelsDatabase.get(ticketData.panelId);
      if (!config) return interaction.reply({ content: '❌ إعدادات اللوحة غير متوفرة!', ephemeral: true });

      const isAdmin = interaction.member.roles.cache.has(config.adminRoleId);
      const isHighAdmin = interaction.member.roles.cache.has(config.highAdminRoleId);
      const isOwner = interaction.user.id === ticketData.ownerId;

      if (interaction.commandName === 'claim') {
        if (!isAdmin && !isHighAdmin) return interaction.reply({ content: '❌ مخصص للإدارة فقط!', ephemeral: true });
        if (ticketData.claimedBy) return interaction.reply({ content: `❌ التذكرة مستلمة بالفعل!`, ephemeral: true });

        ticketData.claimedBy = interaction.user.id;
        await interaction.channel.setTopic(JSON.stringify(ticketData));
        await interaction.channel.permissionOverwrites.edit(config.adminRoleId, { SendMessages: false });
        await interaction.channel.permissionOverwrites.edit(interaction.user.id, { SendMessages: true, ViewChannel: true });

        return interaction.reply({ content: `🛠️ تم استلام التذكرة بواسطة ${interaction.user}` });
      }

      if (interaction.commandName === 'unclaim') {
        if (!isHighAdmin && !isOwner) return interaction.reply({ content: '❌ مخصص للإدارة العليا أو صاحب التكت!', ephemeral: true });
        if (!ticketData.claimedBy) return interaction.reply({ content: '❌ التذكرة غير مستلمة أساساً!', ephemeral: true });

        ticketData.claimedBy = null;
        await interaction.channel.setTopic(JSON.stringify(ticketData));
        await interaction.channel.permissionOverwrites.edit(config.adminRoleId, { SendMessages: true });
        return interaction.reply({ content: `🔄 تم إلغاء استلام التذكرة بواسطة: ${interaction.user}` });
      }

      if (interaction.commandName === 'close') {
        if (!isAdmin && !isHighAdmin && !isOwner) return interaction.reply({ content: '❌ لا تمتلك الصلاحية!', ephemeral: true });
        await interaction.channel.permissionOverwrites.edit(ticketData.ownerId, { ViewChannel: false });

        const closedEmbed = new EmbedBuilder().setTitle('🔒 تم إغلاق التذكرة').setColor(0xef4444);
        const closedRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_reopen').setLabel('إعادة فتح').setEmoji('🔓').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('ticket_save_log').setLabel('حفظ الترانسكريبت').setEmoji('📜').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('ticket_delete').setLabel('حذف التكت').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
        );
        return interaction.reply({ embeds: [closedEmbed], components: [closedRow] });
      }

      if (interaction.commandName === 'save') {
        await interaction.deferReply();
        const success = await saveTranscript(interaction.channel, config, interaction.user, ticketData);
        if (success) return interaction.editReply({ content: '✅ تم حفظ الترانسكريبت بنجاح إلى قناة اللوق!' });
        return interaction.editReply({ content: '❌ تعذر العثور على قناة اللوق المحددة في الإعدادات.' });
      }

      if (interaction.commandName === 'delete') {
        if (!isHighAdmin) return interaction.reply({ content: '❌ مخصص للإدارة العليا فقط!', ephemeral: true });
        await interaction.reply({ content: '🗑️ جاري الحذف خلال 3 ثوانٍ...' });
        setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith('open_ticket_')) {
      await interaction.deferReply({ ephemeral: true });

      const panelId = interaction.customId.replace('open_ticket_', '');
      const config = panelsDatabase.get(panelId);
      if (!config) return interaction.editReply({ content: '❌ لم يتم العثور على اللوحة!' });

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
      await ticketChannel.setTopic(JSON.stringify({ ownerId: interaction.user.id, panelId: panelId, claimedBy: null }));

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

      return interaction.editReply({ content: `✅ تم إنشاء التذكرة بنجاح: ${ticketChannel}` });
    }

    if (!interaction.guild || !interaction.channel.topic) return;
    const ticketData = await getTicketInfo(interaction.channel);
    if (!ticketData) return;

    const config = panelsDatabase.get(ticketData.panelId);
    if (!config) return;

    const isAdmin = interaction.member.roles.cache.has(config.adminRoleId);
    const isHighAdmin = interaction.member.roles.cache.has(config.highAdminRoleId);
    const isOwner = interaction.user.id === ticketData.ownerId;

    if (interaction.isButton() && interaction.customId === 'ticket_claim') {
      if (!isAdmin && !isHighAdmin) return interaction.reply({ content: '❌ مخصص للإدارة فقط!', ephemeral: true });
      if (ticketData.claimedBy) return interaction.reply({ content: `❌ التذكرة مستلمة بالفعل!`, ephemeral: true });

      ticketData.claimedBy = interaction.user.id;
      await interaction.channel.setTopic(JSON.stringify(ticketData));

      await interaction.channel.permissionOverwrites.edit(config.adminRoleId, { SendMessages: false });
      await interaction.channel.permissionOverwrites.edit(interaction.user.id, { SendMessages: true, ViewChannel: true });

      statsDatabase.adminsClaimCount[interaction.user.id] = (statsDatabase.adminsClaimCount[interaction.user.id] || 0) + 1;
      return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`🛠️ تم استلام التذكرة بواسطة ${interaction.user}`).setColor(0x22c55e)] });
    }

    if (interaction.isButton() && interaction.customId === 'ticket_unclaim') {
      if (!isHighAdmin && !isOwner) return interaction.reply({ content: '❌ مخصص للإدارة العليا أو صاحب التكت!', ephemeral: true });
      if (!ticketData.claimedBy) return interaction.reply({ content: '❌ التذكرة غير مستلمة أساساً!', ephemeral: true });

      ticketData.claimedBy = null;
      await interaction.channel.setTopic(JSON.stringify(ticketData));
      await interaction.channel.permissionOverwrites.edit(config.adminRoleId, { SendMessages: true });

      return interaction.reply({ embeds: [new EmbedBuilder().setDescription(`🔄 تم إلغاء استلام التذكرة بواسطة: ${interaction.user}`).setColor(0xeab308)] });
    }

    if (interaction.isButton() && interaction.customId === 'ticket_close_req') {
      if (!isAdmin && !isHighAdmin && !isOwner) return interaction.reply({ content: '❌ لا تمتلك صلاحية الإغلاق!', ephemeral: true });

      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_confirm_close').setLabel('تأكيد الإغلاق').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ticket_cancel_close').setLabel('إلغاء').setStyle(ButtonStyle.Secondary)
      );
      return interaction.reply({ content: '⚠️ هل أنت متأكد من رغبتك في إغلاق هذه التذكرة؟', components: [confirmRow] });
    }

    if (interaction.isButton() && interaction.customId === 'ticket_cancel_close') {
      return interaction.message.delete().catch(() => {});
    }

    // إصلاح استجابة إغلاق التكت الفورية لمنع خطأ Response Timeout
    if (interaction.isButton() && interaction.customId === 'ticket_confirm_close') {
      await interaction.deferUpdate(); // تأكيد الاستجابة فوراً
      await interaction.channel.permissionOverwrites.edit(ticketData.ownerId, { ViewChannel: false });

      const closedEmbed = new EmbedBuilder().setTitle('🔒 تم إغلاق التذكرة').setColor(0xef4444);
      const closedRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_reopen').setLabel('إعادة فتح').setEmoji('🔓').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ticket_save_log').setLabel('حفظ الترانسكريبت').setEmoji('📜').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_delete').setLabel('حذف التكت').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
      );

      await interaction.editReply({ content: '✅ تم إغلاق التذكرة بنجاح.', components: [] });
      return interaction.channel.send({ embeds: [closedEmbed], components: [closedRow] });
    }

    if (interaction.isButton() && interaction.customId === 'ticket_save_log') {
      await interaction.deferReply();
      const success = await saveTranscript(interaction.channel, config, interaction.user, ticketData);
      if (success) return interaction.editReply({ content: '✅ تم حفظ سجل المحادثة (الترانسكريبت) إلى قناة اللوق المحددة!' });
      return interaction.editReply({ content: '❌ تعذر العثور على قناة اللوق المحددة في الإعدادات.' });
    }

    if (interaction.isButton() && interaction.customId === 'ticket_reopen') {
      await interaction.channel.permissionOverwrites.edit(ticketData.ownerId, { ViewChannel: true });
      return interaction.reply({ content: `🔓 تم إعادة فتح التذكرة بواسطة ${interaction.user}` });
    }

    if (interaction.isButton() && interaction.customId === 'ticket_delete') {
      if (!isHighAdmin && !isAdmin) return interaction.reply({ content: '❌ لا تمتلك صلاحية الحذف!', ephemeral: true });
      await interaction.reply({ content: '🗑️ سيتم حذف التذكرة خلال 3 ثوانٍ...' });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
    }

  } catch (err) {
    sendLogError('خطأ غير متوقع أثناء معالجة التفاعل:', err);
  }
});

client.login(process.env.DISCORD_TOKEN);
