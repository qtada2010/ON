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
const { Pool } = require('pg');
const discordTranscripts = require('discord-html-transcripts');

// ==========================================
// 1. الاتصال بقاعدة البيانات PostgreSQL
// ==========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

// إنشاء الجداول تلقائياً إذا لم تكن موجودة
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS panels (
        panel_id VARCHAR(100) PRIMARY KEY,
        channel_id VARCHAR(100),
        category_id VARCHAR(100),
        admin_role_id VARCHAR(100),
        high_admin_role_id VARCHAR(100),
        log_channel_id VARCHAR(100),
        title TEXT,
        description TEXT,
        welcome_message TEXT
      );

      CREATE TABLE IF NOT EXISTS permissions (
        key VARCHAR(50) PRIMARY KEY,
        all_commands_role_id VARCHAR(100) DEFAULT '',
        tax_role_id VARCHAR(100) DEFAULT '',
        come_role_id VARCHAR(100) DEFAULT '',
        say_role_id VARCHAR(100) DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS stats (
        key VARCHAR(50) PRIMARY KEY,
        total_tickets INT DEFAULT 0
      );
    `);
    console.log('🐘 تم الاتصال بقاعدة بيانات PostgreSQL وتجهيز الجداول بنجاح!');
  } catch (err) {
    console.error('❌ خطأ في إعداد قاعدة البيانات PostgreSQL:', err);
  }
}
initDatabase();

// ==========================================
// 2. إنشاء عميل ديسكورد (Discord Client)
// ==========================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const PREFIX = '!';
const ADMIN_PREFIX = '$';
let ownerLogChannelId = null;

// ==========================================
// 3. خادم الويب ولوحة التحكم (Express)
// ==========================================
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'QTADA@2010';

function requireAuth(req, res, next) {
  const authHeader = req.headers.cookie || '';
  if (authHeader.includes(`auth_pass=${DASHBOARD_PASSWORD}`)) {
    return next();
  }
  res.redirect('/login');
}

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

app.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === DASHBOARD_PASSWORD) {
    res.setHeader('Set-Cookie', `auth_pass=${DASHBOARD_PASSWORD}; Path=/; HttpOnly`);
    res.redirect('/');
  } else {
    res.redirect('/login?error=1');
  }
});

app.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'auth_pass=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  res.redirect('/login');
});

app.get('/', requireAuth, (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>لوحة التحكم</title>
      <style>
        body { font-family: sans-serif; background: #0f172a; color: #f8fafc; margin:0; padding:0; }
        nav { background: #1e293b; padding: 15px 30px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; }
        nav .links a { color: #38bdf8; text-decoration: none; font-weight: bold; margin-left: 20px; }
        .container { max-width: 900px; margin: 40px auto; background: #1e293b; padding: 30px; border-radius: 12px; }
        h1 { color: #38bdf8; text-align: center; }
        .btn { display: inline-block; padding: 10px 20px; background: #0284c7; color: white; border-radius: 6px; text-decoration: none; font-weight: bold; margin: 5px; }
        .logout { color: #ef4444; text-decoration: none; font-weight: bold; }
      </style>
    </head>
    <body>
      <nav>
        <div class="links">
          <a href="/">الرئيسية 🏠</a>
          <a href="/panel">إدارة اللوحات ⚙️</a>
          <a href="/admin-commands">صلاحيات الأوامر 🛡️</a>
          <a href="/stats">الإحصائيات 📊</a>
        </div>
        <a href="/logout" class="logout">تسجيل الخروج 🚪</a>
      </nav>
      <div class="container">
        <h1>لوحة تحكم البوت الشاملة 🎫</h1>
        <p style="text-align:center; color: #94a3b8;">جميع البيانات تُحفظ بشكل دائم في PostgreSQL على Render.</p>
        <div style="text-align:center; margin-top: 30px;">
          <a href="/panel" class="btn">إدارة لوحات التذاكر 🛠️</a>
          <a href="/admin-commands" class="btn" style="background:#8b5cf6;">صلاحيات الأوامر الإدارية 🛡️</a>
          <a href="/stats" class="btn" style="background:#059669;">الإحصائيات 📊</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

app.get('/admin-commands', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM permissions WHERE key = $1', ['main_permissions']);
  const perms = result.rows[0] || {};

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>إدارة صلاحيات الأوامر</title>
      <style>
        body { font-family: sans-serif; background: #0f172a; color: #f8fafc; margin:0; padding:0; }
        nav { background: #1e293b; padding: 15px 30px; display: flex; justify-content: space-between; border-bottom: 1px solid #334155; }
        nav .links a { color: #38bdf8; text-decoration: none; font-weight: bold; margin-left: 20px; }
        .container { max-width: 800px; margin: 40px auto; background: #1e293b; padding: 30px; border-radius: 12px; }
        h1 { color: #38bdf8; }
        label { display: block; margin-top: 15px; font-weight: bold; }
        input { width: 100%; padding: 10px; margin-top: 5px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; }
        button { margin-top: 25px; width: 100%; padding: 12px; background: #0284c7; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }
      </style>
    </head>
    <body>
      <nav>
        <div class="links">
          <a href="/">الرئيسية 🏠</a>
          <a href="/panel">إدارة اللوحات ⚙️</a>
          <a href="/admin-commands">صلاحيات الأوامر 🛡️</a>
          <a href="/stats">الإحصائيات 📊</a>
        </div>
        <a href="/logout" style="color:#ef4444; text-decoration:none; font-weight:bold;">تسجيل الخروج 🚪</a>
      </nav>
      <div class="container">
        <h1>🛡️ التحكم في صلاحيات الأوامر الإدارية ($)</h1>
        <form action="/save-admin-commands" method="POST">
          <label>⭐ آيدي رتبة الإدارة العامة (تستطيع استخدام كل الأوامر):</label>
          <input type="text" name="allCommandsRoleId" value="${perms.all_commands_role_id || ''}" placeholder="أدخل ID الرتبة الشاملة">

          <label>💰 آيدي الرتبة المسموح لها باستخدام امر $tax:</label>
          <input type="text" name="taxRoleId" value="${perms.tax_role_id || ''}" placeholder="أدخل ID الرتبة">

          <label>📢 آيدي الرتبة المسموح لها باستخدام امر $come:</label>
          <input type="text" name="comeRoleId" value="${perms.come_role_id || ''}" placeholder="أدخل ID الرتبة">

          <label>💬 آيدي الرتبة المسموح لها باستخدام امر $say:</label>
          <input type="text" name="sayRoleId" value="${perms.say_role_id || ''}" placeholder="أدخل ID الرتبة">

          <button type="submit">حفظ التغييرات 💾</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

app.post('/save-admin-commands', requireAuth, async (req, res) => {
  const { allCommandsRoleId, taxRoleId, comeRoleId, sayRoleId } = req.body;

  await pool.query(`
    INSERT INTO permissions (key, all_commands_role_id, tax_role_id, come_role_id, say_role_id)
    VALUES ('main_permissions', $1, $2, $3, $4)
    ON CONFLICT (key) DO UPDATE SET
      all_commands_role_id = EXCLUDED.all_commands_role_id,
      tax_role_id = EXCLUDED.tax_role_id,
      come_role_id = EXCLUDED.come_role_id,
      say_role_id = EXCLUDED.say_role_id;
  `, [allCommandsRoleId.trim(), taxRoleId.trim(), comeRoleId.trim(), sayRoleId.trim()]);

  res.send('<h2>✅ تم حفظ الصلاحيات دائماً في PostgreSQL!</h2><a href="/admin-commands">العودة</a>');
});

app.get('/panel', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM panels');
  let panelsListHTML = '';

  result.rows.forEach(p => {
    panelsListHTML += `
      <div style="background:#0f172a; padding:15px; border-radius:8px; margin-bottom:15px; border:1px solid #334155;">
        <h3>📌 المعرف: ${p.panel_id} - ${p.title}</h3>
        <p>روم اللوحة: ${p.channel_id} | رتبة الإدارة: ${p.admin_role_id}</p>
        <a href="/edit-panel/${p.panel_id}" style="color:#38bdf8; font-weight:bold;">✏️ تعديل هذه اللوحة</a>
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
          <a href="/panel">إدارة اللوحات ⚙️</a>
          <a href="/admin-commands">صلاحيات الأوامر 🛡️</a>
          <a href="/stats">الإحصائيات 📊</a>
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

app.get('/edit-panel/:id', async (req, res) => {
  const result = await pool.query('SELECT * FROM panels WHERE panel_id = $1', [req.params.id]);
  const panel = result.rows[0];
  if (!panel) return res.send('اللوحة غير موجودة');

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>تعديل اللوحة ${panel.panel_id}</title>
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
        <h1>✏️ تعديل اللوحة: ${panel.panel_id}</h1>
        <form action="/save-panel" method="POST">
          <input type="hidden" name="panelId" value="${panel.panel_id}">

          <label>آيدي روم اللوحة:</label>
          <input type="text" name="channelId" value="${panel.channel_id}" required>

          <label>آيدي كاتيجوري التذاكر:</label>
          <input type="text" name="categoryId" value="${panel.category_id}" required>

          <label>آيدي رتبة الإدارة العادية:</label>
          <input type="text" name="adminRoleId" value="${panel.admin_role_id}" required>

          <label>آيدي رتبة الإدارة العليا:</label>
          <input type="text" name="highAdminRoleId" value="${panel.high_admin_role_id}" required>

          <label>آيدي روم اللوق:</label>
          <input type="text" name="logChannelId" value="${panel.log_channel_id}" required>

          <label>عنوان اللوحة:</label>
          <input type="text" name="title" value="${panel.title}" required>

          <label>وصف اللوحة:</label>
          <textarea name="description" rows="2" required>${panel.description}</textarea>

          <label>رسالة الترحيب بالتكت:</label>
          <textarea name="welcomeMessage" rows="2" required>${panel.welcome_message}</textarea>

          <button type="submit">حفظ التحديثات بإعادة الإرسال 🔄</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

app.post('/save-panel', requireAuth, async (req, res) => {
  const data = req.body;

  await pool.query(`
    INSERT INTO panels (panel_id, channel_id, category_id, admin_role_id, high_admin_role_id, log_channel_id, title, description, welcome_message)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (panel_id) DO UPDATE SET
      channel_id = EXCLUDED.channel_id,
      category_id = EXCLUDED.category_id,
      admin_role_id = EXCLUDED.admin_role_id,
      high_admin_role_id = EXCLUDED.high_admin_role_id,
      log_channel_id = EXCLUDED.log_channel_id,
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      welcome_message = EXCLUDED.welcome_message;
  `, [data.panelId, data.channelId, data.categoryId, data.adminRoleId, data.highAdminRoleId, data.logChannelId, data.title, data.description, data.welcomeMessage]);

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
      return res.send('<h2>✅ تم حفظ اللوحة في PostgreSQL وإرسالها للسيرفر بنجاح!</h2><a href="/panel">العودة للوحة التحكم</a>');
    }
  } catch (err) {
    sendLogError('خطأ أثناء إرسال اللوحة:', err);
    return res.status(500).send('<h2>❌ تم الحفظ في قاعدة البيانات ولكن تعذر إرسال الرسالة للروم. تأكد من صحة الآيدي!</h2><a href="/panel">العودة</a>');
  }
});

app.get('/stats', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT total_tickets FROM stats WHERE key = $1', ['main_stats']);
  const totalTickets = result.rows[0] ? result.rows[0].total_tickets : 0;

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
          <a href="/panel">إدارة اللوحات ⚙️</a>
          <a href="/admin-commands">صلاحيات الأوامر 🛡️</a>
          <a href="/stats">الإحصائيات 📊</a>
        </div>
        <a href="/logout" style="color:#ef4444; text-decoration:none; font-weight:bold;">تسجيل الخروج 🚪</a>
      </nav>
      <div class="container">
        <h1>📊 إحصائيات التذاكر الإجمالية</h1>
        <h2>إجمالي التذاكر التي تم فتحها: ${totalTickets}</h2>
      </div>
    </body>
    </html>
  `);
});

app.listen(process.env.PORT || 3000, () => console.log('🌐 خادم الويب يعمل بنجاح!'));

// ==========================================
// 4. ديسكورد ومعالجة الأحداث
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
    new SlashCommandBuilder().setName('help').setDescription('عرض قائمة جميع الأوامر وشرحها مع رابط اللوحة'),
    new SlashCommandBuilder().setName('tax').setDescription('حساب ضريبة برو بوت').addIntegerOption(o => o.setName('amount').setDescription('المبلغ').setRequired(true)),
    new SlashCommandBuilder().setName('come').setDescription('استدعاء عضو للروم عبر الخاص').addUserOption(o => o.setName('user').setDescription('العضو المراد استدعاؤه').setRequired(true)),
    new SlashCommandBuilder().setName('say').setDescription('إرسال رسالة باسم البوت').addStringOption(o => o.setName('message').setDescription('الرسالة').setRequired(true)),
    new SlashCommandBuilder().setName('close').setDescription('إغلاق التذكرة الحالية'),
    new SlashCommandBuilder().setName('delete').setDescription('حذف التذكرة الحالية (للإدارة العليا)'),
    new SlashCommandBuilder().setName('save').setDescription('حفظ ترانسكريبت التذكرة تفاعلي (HTML)'),
    new SlashCommandBuilder().setName('add').setDescription('إضافة شخص للتذكرة').addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true)),
    new SlashCommandBuilder().setName('remove').setDescription('إزالة شخص من التذكرة').addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true)),
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
  const logChannel = channel.guild.channels.cache.get(config.log_channel_id);
  if (!logChannel) return false;

  try {
    const attachment = await discordTranscripts.createTranscript(channel, {
      limit: -1,
      returnType: 'attachment',
      filename: `${channel.name}-transcript.html`,
      saveImages: true,
      footerText: 'تمت أرشفة التكت بنجاح',
      poweredBy: false
    });

    const logEmbed = new EmbedBuilder()
      .setTitle('🌐 سجل ترانسكريبت تفاعلي (HTML)')
      .setDescription('اضغط على الملف المرفق أدناه وقم بتنزيله لفتحه في المتصفح لقراءة التكت بتصميم ديسكورد!')
      .addFields(
        { name: 'التكت:', value: channel.name, inline: true },
        { name: 'صاحب التكت:', value: `<@${ticketData.ownerId}>`, inline: true },
        { name: 'تم الحفظ بواسطة:', value: `${user}`, inline: true }
      )
      .setColor(0x0284c7)
      .setTimestamp();

    // إرسال الـ Embed والملف فقط كملف مرفق نقي
    await logChannel.send({ embeds: [logEmbed], files: [attachment] });
    return true;
  } catch (err) {
    sendLogError('خطأ أثناء إنشاء الترانسكريبت التفاعلي:', err);
    return false;
  }
}

async function hasAdminCommandPermission(member, specificRoleId) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const result = await pool.query('SELECT * FROM permissions WHERE key = $1', ['main_permissions']);
  const perms = result.rows[0];
  if (!perms) return false;

  if (perms.all_commands_role_id && member.roles.cache.has(perms.all_commands_role_id)) return true;
  if (specificRoleId && member.roles.cache.has(specificRoleId)) return true;
  return false;
}

function createHelpEmbed(dashboardUrl) {
  return new EmbedBuilder()
    .setTitle('📖 قائمة أوامر البوت والمعلومات الشاملة')
    .setDescription(`أهلاً بك! يمكنك استخدام جميع الأوامر إما عن طريق **البريفكس** أو عن طريق **أوامر السلاش (/)**.\n\n🌐 **لوحة تحكم البوت:** [اضغط هنا للوصول للوحة التحكم](${dashboardUrl})`)
    .addFields(
      { 
        name: '⚙️ الأوامر الإدارية العامة:', 
        value: 
          `• **\`$tax <المبلغ>\` | \`/tax\`**\n └ *الشرح:* يحسب ضريبة ProBot المخصومة والمبلغ المطلوب تحويله للوصول كاملاً.\n` +
          `• **\`$come <@العضو>\` | \`/come\`**\n └ *الشرح:* يرسل إشعار استدعاء مباشر في الخاص للعضو مع رابط القناة الحالية.\n` +
          `• **\`$say <الرسالة>\` | \`/say\`**\n └ *الشرح:* يرسل رسالة نصية باسم البوت في القناة مع حذف رسالة المرسل.`
      },
      { 
        name: '🎫 أوامر إدارة التذاكر (داخل التكت):', 
        value: 
          `• **\`!close\` | \`/close\`**\n └ *الشرح:* يخفي التكت عن صاحبها ويعرض خيارات التحكم بالإغلاق.\n` +
          `• **\`!save\` | \`/save\`**\n └ *الشرح:* يحفظ ترانسكريبت المحادثة بتنسيق موقع تفاعلي (HTML) في روم اللوق.\n` +
          `• **\`!delete\` | \`/delete\`**\n └ *الشرح:* يحذف القناة نهائياً (مخصص للإدارة العليا).\n` +
          `• **\`!add <@العضو>\` | \`/add\`**\n └ *الشرح:* يضيف عضواً جديداً لروم التذكرة.\n` +
          `• **\`!remove <@العضو>\` | \`/remove\`**\n └ *الشرح:* يزيل عضواً من روم التذكرة.\n` +
          `• **\`!logowner #الروم\` | \`/logowner\`**\n └ *الشرح:* يحدد القناة المخصصة لإرسال أخطاء البوت للمالك.`
      }
    )
    .setColor(0x0284c7)
    .setFooter({ text: 'تمت البرمجة بواسطة المبرمج: قتادة (Qtada)' })
    .setTimestamp();
}

// --------------------------------------------------
// معالجة الرسائل
// --------------------------------------------------
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const dashboardUrl = process.env.RENDER_EXTERNAL_URL || 'https://your-app.onrender.com';

  if (message.content.startsWith(`${ADMIN_PREFIX}help`) || message.content.startsWith(`${PREFIX}help`)) {
    return message.channel.send({ embeds: [createHelpEmbed(dashboardUrl)] });
  }

  if (message.content.startsWith(ADMIN_PREFIX)) {
    const args = message.content.slice(ADMIN_PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const result = await pool.query('SELECT * FROM permissions WHERE key = $1', ['main_permissions']);
    const perms = result.rows[0] || {};

    if (command === 'tax') {
      const allowed = await hasAdminCommandPermission(message.member, perms.tax_role_id);
      if (!allowed) return message.reply('❌ لا تمتلك صلاحية استخدام أمر الضريبة!');

      const amount = parseInt(args[0]);
      if (isNaN(amount) || amount < 1) return message.reply('❌ يرجى كتابة مبلغ صحيح! مثال: `$tax 10000`');

      const netAmount = Math.floor(amount * 0.95);
      const grossAmount = Math.ceil(amount * (20 / 19));

      const taxEmbed = new EmbedBuilder()
        .setTitle('💰 حاسبة ضريبة ProBot')
        .addFields(
          { name: 'المبلغ الأصلي:', value: `\`${amount.toLocaleString()}\``, inline: true },
          { name: 'المبلغ الصافي (بعد الخصم):', value: `\`${netAmount.toLocaleString()}\``, inline: true },
          { name: 'المبلغ الواجب تحويله ليرسل لك المطلوب تماماً:', value: `\`${grossAmount.toLocaleString()}\``, inline: false }
        )
        .setColor(0x059669)
        .setTimestamp();

      return message.channel.send({ embeds: [taxEmbed] });
    }

    if (command === 'come') {
      const allowed = await hasAdminCommandPermission(message.member, perms.come_role_id);
      if (!allowed) return message.reply('❌ لا تمتلك صلاحية استخدام أمر الاستدعاء!');

      const targetMember = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null);
      if (!targetMember) return message.reply('❌ يرجى منشن الشخص أو وضع الآيدي الخاص به!');

      try {
        const comeEmbed = new EmbedBuilder()
          .setTitle('🔔 لديك استدعاء في السيرفر!')
          .setDescription(`تم استدعاؤك بواسطة الإداري: **${message.author.tag}**\n\n📌 **الروم:** ${message.channel}\n🔗 **رابط مباشر:** [اضغط هنا للذهاب للروم](${message.url})`)
          .setColor(0xeab308)
          .setTimestamp();

        await targetMember.send({ embeds: [comeEmbed] });
        return message.reply(`✅ تم إرسال إشعار استدعاء بالخاص لـ ${targetMember}.`);
      } catch (err) {
        return message.reply('❌ تعذر إرسال رسالة بالخاص للشخص (قد تكون رسائله الخاصة مغلقة).');
      }
    }

    if (command === 'say') {
      const allowed = await hasAdminCommandPermission(message.member, perms.say_role_id);
      if (!allowed) return message.reply('❌ لا تمتلك صلاحية استخدام أمر التحدث!');

      const textToSay = args.join(' ');
      if (!textToSay) return message.reply('❌ يرجى كتابة الرسالة التي تريد من البوت قولها!');

      await message.delete().catch(() => {});
      return message.channel.send(textToSay);
    }
  }

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

  const panelRes = await pool.query('SELECT * FROM panels WHERE panel_id = $1', [ticketData.panelId]);
  const config = panelRes.rows[0];
  if (!config) return;

  const isAdmin = message.member.roles.cache.has(config.admin_role_id);
  const isHighAdmin = message.member.roles.cache.has(config.high_admin_role_id);
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
    if (success) return message.reply('✅ تم إنشاء ملف الترانسكريبت المنسق (HTML) وإرساله إلى روم اللوق!');
    return message.reply('❌ تعذر العثور على قناة اللوق المحددة في الإعدادات.');
  }

  if (command === 'delete') {
    if (!isHighAdmin) return message.reply('❌ هذا الأمر مخصص **للإدارة العليا** فقط!');
    await message.reply('🗑️ جاري حذف التذكرة...');
    setTimeout(() => message.channel.delete().catch(() => {}), 3000);
  }

  if (command === 'add') {
    if (!isAdmin && !isHighAdmin) return message.reply('❌ هذا الأمر مخصص للإدارة فقط!');
    const targetMember = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null);
    if (!targetMember) return message.reply('❌ يرجى منشن الشخص أو كتابة آيديه بشكل صحيح!');

    await message.channel.permissionOverwrites.edit(targetMember.id, { ViewChannel: true, SendMessages: true });
    return message.reply(`✅ تم إضافة ${targetMember} إلى التذكرة بنجاح.`);
  }

  if (command === 'remove') {
    if (!isAdmin && !isHighAdmin) return message.reply('❌ هذا الأمر مخصص للإدارة فقط!');
    const targetMember = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null);
    if (!targetMember) return message.reply('❌ يرجى منشن الشخص أو كتابة آيديه بشكل صحيح!');

    await message.channel.permissionOverwrites.edit(targetMember.id, { ViewChannel: false, SendMessages: false });
    return message.reply(`🚫 تم إزالة ${targetMember} من التذكرة بنجاح.`);
  }
});

// --------------------------------------------------
// معالجة التفاعلات السلاش والأزرار
// --------------------------------------------------
client.on('interactionCreate', async (interaction) => {
  try {
    const dashboardUrl = process.env.RENDER_EXTERNAL_URL || 'https://your-app.onrender.com';

    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'help') {
        return interaction.reply({ embeds: [createHelpEmbed(dashboardUrl)] });
      }

      const result = await pool.query('SELECT * FROM permissions WHERE key = $1', ['main_permissions']);
      const perms = result.rows[0] || {};

      if (interaction.commandName === 'tax') {
        const allowed = await hasAdminCommandPermission(interaction.member, perms.tax_role_id);
        if (!allowed) return interaction.reply({ content: '❌ لا تمتلك صلاحية استخدام أمر الضريبة!', ephemeral: true });

        const amount = interaction.options.getInteger('amount');
        const netAmount = Math.floor(amount * 0.95);
        const grossAmount = Math.ceil(amount * (20 / 19));

        const taxEmbed = new EmbedBuilder()
          .setTitle('💰 حاسبة ضريبة ProBot')
          .addFields(
            { name: 'المبلغ الأصلي:', value: `\`${amount.toLocaleString()}\``, inline: true },
            { name: 'المبلغ الصافي (بعد الخصم):', value: `\`${netAmount.toLocaleString()}\``, inline: true },
            { name: 'المبلغ الواجب تحويله ليرسل لك المطلوب تماماً:', value: `\`${grossAmount.toLocaleString()}\``, inline: false }
          )
          .setColor(0x059669)
          .setTimestamp();

        return interaction.reply({ embeds: [taxEmbed] });
      }

      if (interaction.commandName === 'come') {
        const allowed = await hasAdminCommandPermission(interaction.member, perms.come_role_id);
        if (!allowed) return interaction.reply({ content: '❌ لا تمتلك صلاحية استخدام أمر الاستدعاء!', ephemeral: true });

        const targetUser = interaction.options.getUser('user');
        try {
          const comeEmbed = new EmbedBuilder()
            .setTitle('🔔 لديك استدعاء في السيرفر!')
            .setDescription(`تم استدعاؤك بواسطة الإداري: **${interaction.user.tag}**\n\n📌 **الروم:** ${interaction.channel}\n🔗 **رابط مباشر:** [اضغط هنا للذهاب للروم](https://discord.com/channels/${interaction.guildId}/${interaction.channelId})`)
            .setColor(0xeab308)
            .setTimestamp();

          await targetUser.send({ embeds: [comeEmbed] });
          return interaction.reply({ content: `✅ تم إرسال إشعار استدعاء بالخاص لـ ${targetUser}.` });
        } catch (err) {
          return interaction.reply({ content: '❌ تعذر إرسال رسالة بالخاص للشخص (قد تكون رسائله الخاصة مغلقة).', ephemeral: true });
        }
      }

      if (interaction.commandName === 'say') {
        const allowed = await hasAdminCommandPermission(interaction.member, perms.say_role_id);
        if (!allowed) return interaction.reply({ content: '❌ لا تمتلك صلاحية استخدام أمر التحدث!', ephemeral: true });

        const msg = interaction.options.getString('message');
        await interaction.channel.send(msg);
        return interaction.reply({ content: '✅ تم إرسال الرسالة بنجاح!', ephemeral: true });
      }

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

      const panelRes = await pool.query('SELECT * FROM panels WHERE panel_id = $1', [ticketData.panelId]);
      const config = panelRes.rows[0];
      if (!config) return interaction.reply({ content: '❌ إعدادات اللوحة غير متوفرة!', ephemeral: true });

      const isAdmin = interaction.member.roles.cache.has(config.admin_role_id);
      const isHighAdmin = interaction.member.roles.cache.has(config.high_admin_role_id);
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
        if (success) return interaction.editReply({ content: '✅ تم إنشاء ملف الترانسكريبت المنسق (HTML) وإرساله إلى روم اللوق!' });
        return interaction.editReply({ content: '❌ تعذر العثور على قناة اللوق المحددة في الإعدادات.' });
      }

      if (interaction.commandName === 'delete') {
        if (!isHighAdmin) return interaction.reply({ content: '❌ مخصص للإدارة العليا فقط!', ephemeral: true });
        await interaction.reply({ content: '🗑️ جاري الحذف خلال 3 ثوانٍ...' });
        setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
      }

      if (interaction.commandName === 'add') {
        if (!isAdmin && !isHighAdmin) return interaction.reply({ content: '❌ مخصص للإدارة فقط!', ephemeral: true });
        const targetUser = interaction.options.getUser('user');
        await interaction.channel.permissionOverwrites.edit(targetUser.id, { ViewChannel: true, SendMessages: true });
        return interaction.reply({ content: `✅ تم إضافة ${targetUser} إلى التذكرة بنجاح.` });
      }

      if (interaction.commandName === 'remove') {
        if (!isAdmin && !isHighAdmin) return interaction.reply({ content: '❌ مخصص للإدارة فقط!', ephemeral: true });
        const targetUser = interaction.options.getUser('user');
        await interaction.channel.permissionOverwrites.edit(targetUser.id, { ViewChannel: false, SendMessages: false });
        return interaction.reply({ content: `🚫 تم إزالة ${targetUser} من التذكرة بنجاح.` });
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith('open_ticket_')) {
      await interaction.deferReply({ ephemeral: true });

      const panelId = interaction.customId.replace('open_ticket_', '');
      const panelRes = await pool.query('SELECT * FROM panels WHERE panel_id = $1', [panelId]);
      const config = panelRes.rows[0];
      if (!config) return interaction.editReply({ content: '❌ لم يتم العثور على اللوحة في قاعدة البيانات!' });

      const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: config.category_id,
        permissionOverwrites: [
          { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
          { id: config.admin_role_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
          { id: config.high_admin_role_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
        ]
      });

      await pool.query(`
        INSERT INTO stats (key, total_tickets) VALUES ('main_stats', 1)
        ON CONFLICT (key) DO UPDATE SET total_tickets = stats.total_tickets + 1;
      `);

      await ticketChannel.setTopic(JSON.stringify({ ownerId: interaction.user.id, panelId: panelId }));

      const welcomeEmbed = new EmbedBuilder()
        .setTitle(`تذكرة دعم فني جديدة`)
        .setDescription(`${config.welcome_message}\n\n👤 **صاحب التذكرة:** ${interaction.user}`)
        .setColor(0x0284c7);

      const buttonsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_close_req').setLabel('إغلاق التذكرة').setEmoji('🔒').setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({ 
        content: `${interaction.user} | <@&${config.admin_role_id}> | <@&${config.high_admin_role_id}>`, 
        embeds: [welcomeEmbed], 
        components: [buttonsRow] 
      });

      return interaction.editReply({ content: `✅ تم إنشاء التذكرة بنجاح: ${ticketChannel}` });
    }

    if (!interaction.guild || !interaction.channel.topic) return;
    const ticketData = await getTicketInfo(interaction.channel);
    if (!ticketData) return;

    const panelRes = await pool.query('SELECT * FROM panels WHERE panel_id = $1', [ticketData.panelId]);
    const config = panelRes.rows[0];
    if (!config) return;

    const isAdmin = interaction.member.roles.cache.has(config.admin_role_id);
    const isHighAdmin = interaction.member.roles.cache.has(config.high_admin_role_id);
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
      await interaction.message.delete().catch(() => {});
      await interaction.channel.permissionOverwrites.edit(ticketData.ownerId, { ViewChannel: false });

      const closedEmbed = new EmbedBuilder().setTitle('🔒 تم إغلاق التذكرة').setColor(0xef4444);
      const closedRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_reopen').setLabel('إعادة فتح').setEmoji('🔓').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ticket_save_log').setLabel('حفظ الترانسكريبت').setEmoji('📜').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_delete').setLabel('حذف التكت').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
      );

      return interaction.channel.send({ embeds: [closedEmbed], components: [closedRow] });
    }

    if (interaction.isButton() && interaction.customId === 'ticket_reopen') {
      await interaction.message.delete().catch(() => {});
      await interaction.channel.permissionOverwrites.edit(ticketData.ownerId, { ViewChannel: true });
      return interaction.channel.send({ content: `🔓 تم إعادة فتح التذكرة بواسطة ${interaction.user}` });
    }

    if (interaction.isButton() && interaction.customId === 'ticket_save_log') {
      await interaction.deferReply();
      const success = await saveTranscript(interaction.channel, config, interaction.user, ticketData);
      if (success) return interaction.editReply({ content: '✅ تم إنشاء ملف الترانسكريبت المنسق (HTML) وإرساله إلى روم اللوق!' });
      return interaction.editReply({ content: '❌ تعذر العثور على قناة اللوق المحددة في الإعدادات.' });
    }

    if (interaction.isButton() && interaction.customId === 'ticket_delete') {
      if (!isHighAdmin) return interaction.reply({ content: '❌ عذراً، حذف التذكرة مخصص **للإدارة العليا** فقط!', ephemeral: true });
      await interaction.reply({ content: '🗑️ سيتم حذف التذكرة خلال 3 ثوانٍ...' });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
    }

  } catch (err) {
    sendLogError('خطأ غير متوقع أثناء معالجة التفاعل:', err);
  }
});

client.login(process.env.DISCORD_TOKEN);
