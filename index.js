const { 
  Client, 
  GatewayIntentBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder, 
  ChannelType, 
  PermissionFlagsBits,
  AttachmentBuilder,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');
const express = require('express');
const session = require('express-session');

// ==========================================
// 1. إنشاء العميل (Client)
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
const statsDatabase = { totalTickets: 0 };
let ownerLogChannelId = null;

// ==========================================
// 2. خادم الويب ولوحة التحكم مع كلمة المرور
// ==========================================
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// إعداد الجلسات (Session) للحفاظ على تسجيل الدخول
app.use(session({
  secret: 'qtada_ticket_secret_key_123',
  resave: false,
  saveUninitialized: true
}));

const DASHBOARD_PASSWORD = 'QTADA@2010'; // كلمة المرور المطلوبة

// وسيط التحقق من كلمة المرور (Middleware)
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  res.redirect('/login');
}

// صفحة تسجيل الدخول
app.get('/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>تسجيل الدخول - لوحة التحكم</title>
      <style>
        body { font-family: sans-serif; background: #0f172a; color: #f8fafc; display:flex; justify-content:center; align-items:center; height:100vh; margin:0; }
        .login-card { background: #1e293b; padding: 40px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); width: 100%; max-width: 400px; text-align: center; }
        h2 { color: #38bdf8; margin-bottom: 20px; }
        input[type="password"] { width: 100%; padding: 12px; margin: 10px 0; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; }
        button { width: 100%; padding: 12px; background: #0284c7; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }
        button:hover { background: #0369a1; }
        .error { color: #ef4444; margin-top: 10px; }
      </style>
    </head>
    <body>
      <div class="login-card">
        <h2>🔒 تسجيل الدخول للوحة التحكم</h2>
        <form action="/login" method="POST">
          <input type="password" name="password" placeholder="أدخل كلمة المرور" required>
          <button type="submit">دخول 🚀</button>
        </form>
        ${req.query.error ? '<p class="error">❌ كلمة المرور غير صحيحة!</p>' : ''}
      </div>
    </body>
    </html>
  `);
});

// معالجة تسجيل الدخول
app.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === DASHBOARD_PASSWORD) {
    req.session.authenticated = true;
    res.redirect('/');
  } else {
    res.redirect('/login?error=1');
  }
});

// تسجيل الخروج
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// الرئيسية (محمية)
app.get('/', requireAuth, (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>لوحة التحكم بالتذاكر</title>
      <style>
        body { font-family: sans-serif; background: #0f172a; color: #f8fafc; margin:0; padding:0; }
        nav { background: #1e293b; padding: 15px 30px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; }
        nav .links a { color: #38bdf8; text-decoration: none; font-weight: bold; margin-left: 20px; }
        .container { max-width: 900px; margin: 40px auto; background: #1e293b; padding: 30px; border-radius: 12px; }
        h1 { color: #38bdf8; text-align: center; }
        .btn { display: inline-block; padding: 10px 20px; background: #0284c7; color: white; border-radius: 6px; text-decoration: none; font-weight: bold; margin-top: 15px; }
        .logout { color: #ef4444; text-decoration: none; font-weight: bold; }
      </style>
    </head>
    <body>
      <nav>
        <div class="links">
          <a href="/">الرئيسية 🏠</a>
          <a href="/stats">الإحصائيات 📊</a>
          <a href="/panel">إدارة اللوحات ⚙️</a>
        </div>
        <a href="/logout" class="logout">تسجيل الخروج 🚪</a>
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

// صفحة اللوحات (محمية)
app.get('/panel', requireAuth, (req, res) => {
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
        nav { background: #1e293b; padding: 15px 30px; display: flex; justify-content: space-between; border-bottom: 1px solid #334155; }
        nav .links a { color: #38bdf8; text-decoration: none; font-weight: bold; margin-left: 20px; }
        .container { max-width: 800px; margin: 40px auto; background: #1e293b; padding: 30px; border-radius: 12px; }
        h1, h2 { color: #38bdf8; }
        label { display: block; margin-top: 10px; font-weight: bold; }
        input, textarea { width: 100%; padding: 8px; margin-top: 5px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; }
        button { margin-top: 20px; width: 100%; padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }
      </style>
    </head>
    <body>
      <nav>
        <div class="links">
          <a href="/">الرئيسية 🏠</a>
          <a href="/stats">الإحصائيات 📊</a>
          <a href="/panel">إدارة اللوحات ⚙️</a>
        </div>
        <a href="/logout" style="color:#ef4444; text-decoration:none; font-weight:bold;">تسجيل الخروج 🚪</a>
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
        <h2>📋 اللوحات الحالية:</h2>
        ${panelsListHTML || '<p>لا توجد لوحات منشأة بعد.</p>'}
      </div>
    </body>
    </html>
  `);
});

// صفحة تعديل اللوحة (محمية)
app.get('/edit-panel/:id', requireAuth, (req, res) => {
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

// حفظ اللوحة (محمية)
app.post('/save-panel', requireAuth, async (req, res) => {
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

// صفحة الإحصائيات (محمية)
app.get('/stats', requireAuth, (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>الإحصائيات</title>
      <style>
        body { font-family: sans-serif; background: #0f172a; color: #f8fafc; margin:0; padding:0; }
        nav { background: #1e293b; padding: 15px 30px; display: flex; justify-content: space-between; border-bottom: 1px solid #334155; }
        nav .links a { color: #38bdf8; text-decoration: none; font-weight: bold; margin-left: 20px; }
        .container { max-width: 800px; margin: 40px auto; background: #1e293b; padding: 30px; border-radius: 12px; }
        h1, h2 { color: #38bdf8; }
      </style>
    </head>
    <body>
      <nav>
        <div class="links">
          <a href="/">الرئيسية 🏠</a>
          <a href="/stats">الإحصائيات 📊</a>
          <a href="/panel">إدارة اللوحات ⚙️</a>
        </div>
        <a href="/logout" style="color:#ef4444; text-decoration:none; font-weight:bold;">تسجيل الخروج 🚪</a>
      </nav>
      <div class="container">
        <h1>📊 إحصائيات التذاكر الإجمالية</h1>
        <h2>إجمالي التذاكر التي تم فتحها: ${statsDatabase.totalTickets}</h2>
      </div>
    </body>
    </html>
  `);
});

app.listen(process.env.PORT || 3000, () => console.log('🌐 خادم الويب يعمل بنجاح!'));

// ==========================================
// 3. البوت وأوامر الديسكورد
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

  // تسجيل أوامر السلاش (تم إزالة claim/unclaim)
  const commands = [
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
      await ticketChannel.setTopic(JSON.stringify({ ownerId: interaction.user.id, panelId: panelId }));

      const welcomeEmbed = new EmbedBuilder()
        .setTitle(`تذكرة دعم فني جديدة`)
        .setDescription(`${config.welcomeMessage}\n\n👤 **صاحب التذكرة:** ${interaction.user}`)
        .setColor(0x0284c7);

      // أزرار التكت بعد إلغاء الاستلام وإلغاء الاستلام
      const buttonsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_close_req').setLabel('إغلاق التذكرة').setEmoji('🔒').setStyle(ButtonStyle.Danger)
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

    if (interaction.isButton() && interaction.customId === 'ticket_confirm_close') {
      await interaction.deferUpdate();
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
