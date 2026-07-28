const { 
  Client, 
  GatewayIntentBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  EmbedBuilder, 
  ChannelType, 
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const express = require('express');
const { Pool } = require('pg');
const discordTranscripts = require('discord-html-transcripts');
const systemCommands = require('./system.js');

// ==========================================
// 1. الاتصال بقواعد البيانات وتحديث الهيكل
// ==========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function initDatabase() {
  try {
    // 1. جدول اللوحات الرئيسي للتذاكر
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
        type VARCHAR(20) DEFAULT 'buttons',
        message_type VARCHAR(20) DEFAULT 'embed',
        image_url TEXT,
        color VARCHAR(20) DEFAULT '#0284c7',
        last_message_id VARCHAR(100)
      );
    `);

    await pool.query(`
      ALTER TABLE panels ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'buttons';
      ALTER TABLE panels ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) DEFAULT 'embed';
      ALTER TABLE panels ADD COLUMN IF NOT EXISTS image_url TEXT;
      ALTER TABLE panels ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT '#0284c7';
      ALTER TABLE panels ADD COLUMN IF NOT EXISTS last_message_id VARCHAR(100);
    `);

    // 2. جدول الخيارات/الأزرار للوحات
    await pool.query(`
      CREATE TABLE IF NOT EXISTS panel_options (
        id SERIAL PRIMARY KEY,
        panel_id VARCHAR(100) REFERENCES panels(panel_id) ON DELETE CASCADE,
        option_id VARCHAR(100),
        label TEXT,
        description TEXT,
        emoji TEXT,
        welcome_message TEXT,
        button_style VARCHAR(20) DEFAULT 'Primary'
      );
    `);

    await pool.query(`
      ALTER TABLE panel_options ADD COLUMN IF NOT EXISTS button_style VARCHAR(20) DEFAULT 'Primary';
    `);

    // 3. جدول صلاحيات الأزرار والأوامر
    await pool.query(`
      CREATE TABLE IF NOT EXISTS permissions (
        key VARCHAR(50) PRIMARY KEY,
        all_commands_role_id VARCHAR(100) DEFAULT '',
        tax_role_id VARCHAR(100) DEFAULT '',
        come_role_id VARCHAR(100) DEFAULT '',
        say_role_id VARCHAR(100) DEFAULT '',
        close_permission VARCHAR(50) DEFAULT 'both',
        delete_permission VARCHAR(50) DEFAULT 'high_admin',
        save_permission VARCHAR(50) DEFAULT 'both'
      );
    `);

    await pool.query(`
      ALTER TABLE permissions ADD COLUMN IF NOT EXISTS close_permission VARCHAR(50) DEFAULT 'both';
      ALTER TABLE permissions ADD COLUMN IF NOT EXISTS delete_permission VARCHAR(50) DEFAULT 'high_admin';
      ALTER TABLE permissions ADD COLUMN IF NOT EXISTS save_permission VARCHAR(50) DEFAULT 'both';
    `);

    // 4. جدول الإحصائيات
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stats (
        key VARCHAR(50) PRIMARY KEY,
        total_tickets INT DEFAULT 0
      );
    `);

    // 5. جدول نظام تقديم الإدارة
    await pool.query(`
      CREATE TABLE IF NOT EXISTS apply_setup (
        id VARCHAR(50) PRIMARY KEY,
        title TEXT,
        description TEXT,
        image_url TEXT,
        submit_channel_id VARCHAR(100),
        review_channel_id VARCHAR(100),
        results_channel_id VARCHAR(100),
        high_admin_role_id VARCHAR(100),
        accepted_role_id VARCHAR(100),
        q1 TEXT,
        q2 TEXT,
        q3 TEXT,
        q4 TEXT,
        q5 TEXT,
        last_message_id VARCHAR(100)
      );
    `);

    await pool.query(`
      ALTER TABLE apply_setup ADD COLUMN IF NOT EXISTS accepted_role_id VARCHAR(100);
    `);

    console.log('🐘 تم تحديث الجداول وقاعدة البيانات بنجاح!');
  } catch (err) {
    console.error('❌ خطأ أثناء إعداد قاعدة البيانات:', err);
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

// تفعيل نظام الأوامر الإضافية من system.js
systemCommands(client, PREFIX);

// ==========================================
// 3. دالة إرسال سجل اللوق (Log Sender)
// ==========================================
async function sendLog(guild, title, description, color = 0x38bdf8, fields = []) {
  try {
    if (!ownerLogChannelId) return;
    const channel = await guild.channels.fetch(ownerLogChannelId).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .setTimestamp();

    if (fields.length > 0) embed.addFields(fields);
    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error('خطأ في إرسال اللوق:', e);
  }
}

// ==========================================
// 4. خادم الويب ولوحة التحكم (Express)
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
      <title>تسجيل الدخول - لوحة التحكم الاحترافية</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display:flex; justify-content:center; align-items:center; height:100vh; margin:0; }
        .login-card { background: #1e293b; padding: 40px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); width: 100%; max-width: 400px; text-align: center; border: 1px solid #334155; }
        h2 { color: #38bdf8; margin-bottom: 20px; }
        input[type="password"] { width: 100%; padding: 12px; margin: 10px 0; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; }
        button { width: 100%; padding: 12px; background: #0284c7; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; transition: 0.2s; }
        button:hover { background: #0369a1; }
      </style>
    </head>
    <body>
      <div class="login-card">
        <h2>🔒 لوحة التحكم الشاملة</h2>
        <form action="/login" method="POST">
          <input type="password" name="password" placeholder="أدخل كلمة المرور" required>
          <button type="submit">تسجيل الدخول 🚀</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

app.post('/login', (req, res) => {
  if (req.body.password === DASHBOARD_PASSWORD) {
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

// الصفحة الرئيسية للوحة التحكم
app.get('/', requireAuth, (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>الرئيسية - لوحة التحكم</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin:0; padding:0; }
        nav { background: #1e293b; padding: 15px 30px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; }
        nav .links a { color: #38bdf8; text-decoration: none; font-weight: bold; margin-left: 20px; }
        .container { max-width: 950px; margin: 40px auto; background: #1e293b; padding: 30px; border-radius: 12px; border: 1px solid #334155; }
        h1 { color: #38bdf8; text-align: center; }
        .btn { display: inline-block; padding: 12px 24px; background: #0284c7; color: white; border-radius: 6px; text-decoration: none; font-weight: bold; margin: 5px; }
        .btn:hover { background: #0369a1; }
      </style>
    </head>
    <body>
      <nav>
        <div class="links">
          <a href="/">الرئيسية 🏠</a>
          <a href="/panel">إدارة التذاكر ⚙️</a>
          <a href="/apply-setup">تقديم الإدارة 📝</a>
          <a href="/admin-commands">صلاحيات الأوامر 🛡️</a>
          <a href="/stats">الإحصائيات 📊</a>
        </div>
        <a href="/logout" style="color:#ef4444; font-weight:bold; text-decoration:none;">تسجيل الخروج 🚪</a>
      </nav>
      <div class="container">
        <h1>🎮 لوحة التحكم الإدارية البوت</h1>
        <p style="text-align:center; color:#94a3b8;">تحكم كامل بالتذاكر، ألوان الأزرار، الصور، وصلاحيات الأوامر.</p>
        <div style="text-align:center; margin-top: 30px;">
          <a href="/panel" class="btn">🛠️ إدارة لوحات التذاكر</a>
          <a href="/apply-setup" class="btn" style="background:#eab308; color:#000;">📝 إعداد تقديم الإدارة</a>
          <a href="/admin-commands" class="btn" style="background:#8b5cf6;">🛡️ ضبط صلاحيات الأوامر</a>
          <a href="/stats" class="btn" style="background:#059669;">📊 الإحصائيات الشاملة</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// ==========================================
// إدارة لوحات التذاكر
// ==========================================
app.get('/panel', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM panels');
  let panelsListHTML = '';

  for (const p of result.rows) {
    const optionsRes = await pool.query('SELECT COUNT(*) FROM panel_options WHERE panel_id = $1', [p.panel_id]);
    const optionsCount = optionsRes.rows[0].count;

    panelsListHTML += `
      <div style="background:#0f172a; padding:15px; border-radius:8px; margin-bottom:15px; border:1px solid #334155; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h3 style="margin:0; color:#38bdf8;">📌 المعرف: ${p.panel_id} - ${p.title}</h3>
          <p style="margin:5px 0 0 0; color:#94a3b8; font-size:14px;">
            النوع: <strong>${p.type === 'select' ? 'قائمة منسدلة 📜' : 'أزرار 🔘'}</strong> | 
            اللون: <span style="display:inline-block; width:12px; height:12px; background:${p.color || '#0284c7'}; border-radius:50%;"></span> ${p.color || '#0284c7'} |
            الخيارات: <strong>${optionsCount}</strong>
          </p>
        </div>
        <div>
          <a href="/edit-panel/${p.panel_id}" style="background:#0284c7; color:white; padding:8px 15px; border-radius:5px; text-decoration:none; font-weight:bold; margin-left:5px;">✏️ تعديل</a>
          <a href="/delete-panel/${p.panel_id}" onclick="return confirm('هل أنت متأكد من حذف هذه اللوحة؟')" style="background:#ef4444; color:white; padding:8px 15px; border-radius:5px; text-decoration:none; font-weight:bold;">🗑️ حذف</a>
        </div>
      </div>
    `;
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>إدارة اللوحات</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin:0; padding:0; }
        nav { background: #1e293b; padding: 15px 30px; display: flex; justify-content: space-between; border-bottom: 1px solid #334155; }
        nav .links a { color: #38bdf8; text-decoration: none; font-weight: bold; margin-left: 20px; }
        .container { max-width: 900px; margin: 40px auto; background: #1e293b; padding: 30px; border-radius: 12px; border: 1px solid #334155; }
        h1, h2 { color: #38bdf8; }
        label { display: block; margin-top: 12px; font-weight: bold; color:#cbd5e1; }
        input, select, textarea { width: 100%; padding: 10px; margin-top: 5px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; }
        button { margin-top: 20px; width: 100%; padding: 12px; background: #0284c7; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }
      </style>
    </head>
    <body>
      <nav>
        <div class="links">
          <a href="/">الرئيسية 🏠</a>
          <a href="/panel">إدارة التذاكر ⚙️</a>
          <a href="/apply-setup">تقديم الإدارة 📝</a>
          <a href="/admin-commands">صلاحيات الأوامر 🛡️</a>
          <a href="/stats">الإحصائيات 📊</a>
        </div>
        <a href="/logout" style="color:#ef4444; font-weight:bold; text-decoration:none;">تسجيل الخروج 🚪</a>
      </nav>
      <div class="container">
        <h1>➕ إنشاء / إضافة لوحة تذاكر جديدة</h1>
        <form action="/create-panel" method="POST">
          <label>معرف اللوحة الفريد (Panel ID):</label>
          <input type="text" name="panelId" placeholder="main_support_panel" required>

          <div style="display:flex; gap:15px;">
            <div style="flex:1;">
              <label>نوع التفاعل باللوحة:</label>
              <select name="type">
                <option value="buttons">أزرار تفاعلية (Buttons) 🔘</option>
                <option value="select">قائمة منسدلة (Select Menu) 📜</option>
              </select>
            </div>
            <div style="flex:1;">
              <label>نوع الرسالة:</label>
              <select name="messageType">
                <option value="embed">رسالة إيمبد (Embed) 🎨</option>
                <option value="plain">رسالة نصية عادية 💬</option>
              </select>
            </div>
          </div>

          <div style="display:flex; gap:15px;">
            <div style="flex:1;">
              <label>لون الخط الجانبي للإيمبد (Color):</label>
              <input type="color" name="color" value="#0284c7" style="height:40px;">
            </div>
            <div style="flex:2;">
              <label>رابط الصورة المرفقة مع اللوحة (Image URL):</label>
              <input type="url" name="imageUrl" placeholder="https://i.imgur.com/example.png">
            </div>
          </div>

          <div style="display:flex; gap:15px;">
            <div style="flex:1;">
              <label>آيدي روم اللوحة:</label>
              <input type="text" name="channelId" required>
            </div>
            <div style="flex:1;">
              <label>آيدي كاتيجوري التذاكر:</label>
              <input type="text" name="categoryId" required>
            </div>
          </div>

          <div style="display:flex; gap:15px;">
            <div style="flex:1;">
              <label>آيدي رتبة الإدارة العادية:</label>
              <input type="text" name="adminRoleId" required>
            </div>
            <div style="flex:1;">
              <label>آيدي رتبة الإدارة العليا:</label>
              <input type="text" name="highAdminRoleId" required>
            </div>
          </div>

          <label>آيدي روم اللوق (سجل الترانسكريبت):</label>
          <input type="text" name="logChannelId" required>

          <label>عنوان اللوحة:</label>
          <input type="text" name="title" value="تكت الدعم الفني 🎫" required>

          <label>وصف اللوحة:</label>
          <textarea name="description" rows="2" required>اختر القسم المناسب من الأسفل لفتح تذكرة مباشرة.</textarea>

          <button type="submit">حفظ اللوحة والانتقال لإضافة الأزرار ➡️</button>
        </form>

        <hr style="margin: 30px 0; border-color: #334155;">
        <h2>📋 اللوحات المسجلة:</h2>
        ${panelsListHTML || '<p>لا توجد لوحات منشأة حالياً.</p>'}
      </div>
    </body>
    </html>
  `);
});

app.post('/create-panel', requireAuth, async (req, res) => {
  const d = req.body;
  await pool.query(`
    INSERT INTO panels (panel_id, channel_id, category_id, admin_role_id, high_admin_role_id, log_channel_id, title, description, type, message_type, image_url, color)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (panel_id) DO UPDATE SET
      channel_id = EXCLUDED.channel_id,
      category_id = EXCLUDED.category_id,
      admin_role_id = EXCLUDED.admin_role_id,
      high_admin_role_id = EXCLUDED.high_admin_role_id,
      log_channel_id = EXCLUDED.log_channel_id,
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      type = EXCLUDED.type,
      message_type = EXCLUDED.message_type,
      image_url = EXCLUDED.image_url,
      color = EXCLUDED.color;
  `, [d.panelId.trim(), d.channelId.trim(), d.categoryId.trim(), d.adminRoleId.trim(), d.highAdminRoleId.trim(), d.logChannelId.trim(), d.title, d.description, d.type, d.messageType, d.imageUrl ? d.imageUrl.trim() : null, d.color]);

  res.redirect(`/edit-panel/${d.panelId.trim()}`);
});

app.get('/delete-panel/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM panels WHERE panel_id = $1', [req.params.id]);
  res.redirect('/panel');
});

app.get('/edit-panel/:id', requireAuth, async (req, res) => {
  const pRes = await pool.query('SELECT * FROM panels WHERE panel_id = $1', [req.params.id]);
  const panel = pRes.rows[0];
  if (!panel) return res.send('اللوحة غير موجودة');

  const optionsRes = await pool.query('SELECT * FROM panel_options WHERE panel_id = $1 ORDER BY id ASC', [panel.panel_id]);
  let optionsHTML = '';

  optionsRes.rows.forEach((opt, index) => {
    optionsHTML += `
      <div style="background:#0f172a; padding:15px; border-radius:8px; margin-bottom:15px; border:1px solid #334155;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="color:#eab308; font-weight:bold;">#${index + 1} الزر: ${opt.label}</span>
          <a href="/delete-option/${opt.id}/${panel.panel_id}" style="color:#ef4444; font-weight:bold; text-decoration:none;">🗑️ حذف</a>
        </div>
        <p style="margin:5px 0; color:#94a3b8; font-size:14px;">لون الزر: <strong>${opt.button_style}</strong> | الإيموجي: ${opt.emoji || 'بدون'}</p>
        <p style="margin:5px 0; color:#38bdf8; font-size:13px;">رسالة الترحيب: ${opt.welcome_message}</p>
      </div>
    `;
  });

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>تعديل اللوحة ${panel.panel_id}</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin:0; padding:0; }
        nav { background: #1e293b; padding: 15px 30px; display: flex; justify-content: space-between; border-bottom: 1px solid #334155; }
        nav .links a { color: #38bdf8; text-decoration: none; font-weight: bold; margin-left: 20px; }
        .container { max-width: 900px; margin: 40px auto; background: #1e293b; padding: 30px; border-radius: 12px; border: 1px solid #334155; }
        h1, h2, h3 { color: #38bdf8; }
        label { display: block; margin-top: 10px; font-weight: bold; color:#cbd5e1; }
        input, select, textarea { width: 100%; padding: 10px; margin-top: 5px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; }
        .btn-add { background: #10b981; color: white; padding: 12px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; margin-top: 15px; }
        .btn-send { background: #0284c7; color: white; padding: 15px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; width: 48%; font-size: 15px; }
        .btn-update { background: #f59e0b; color: white; padding: 15px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; width: 48%; font-size: 15px; }
      </style>
    </head>
    <body>
      <nav>
        <div class="links">
          <a href="/">الرئيسية 🏠</a>
          <a href="/panel">إدارة التذاكر ⚙️</a>
          <a href="/apply-setup">تقديم الإدارة 📝</a>
          <a href="/admin-commands">صلاحيات الأوامر 🛡️</a>
          <a href="/stats">الإحصائيات 📊</a>
        </div>
        <a href="/logout" style="color:#ef4444; font-weight:bold; text-decoration:none;">تسجيل الخروج 🚪</a>
      </nav>
      <div class="container">
        <h1>⚙️ تعديل وتخصيص اللوحة: ${panel.title}</h1>

        <form action="/update-panel-settings" method="POST" style="background:#0f172a; padding:20px; border-radius:8px; border:1px solid #334155; margin-bottom: 25px;">
          <input type="hidden" name="panelId" value="${panel.panel_id}">
          
          <label>عنوان اللوحة:</label>
          <input type="text" name="title" value="${panel.title}" required>

          <label>وصف اللوحة:</label>
          <textarea name="description" rows="2" required>${panel.description}</textarea>

          <div style="display:flex; gap:15px;">
            <div style="flex:1;">
              <label>لون الخط الجانبي للإيمبد (Color):</label>
              <input type="color" name="color" value="${panel.color || '#0284c7'}" style="height:40px;">
            </div>
            <div style="flex:2;">
              <label>رابط الصورة المرفقة بالبانل (Image URL):</label>
              <input type="url" name="imageUrl" value="${panel.image_url || ''}" placeholder="https://i.imgur.com/example.png">
            </div>
          </div>

          <button type="submit" style="background:#0284c7; margin-top:15px;">💾 حفظ التعديلات العامة للبانل</button>
        </form>

        <h2>➕ إضافة زر / خيار جديد للوحة:</h2>
        <form action="/add-option" method="POST" style="background:#0f172a; padding:20px; border-radius:8px; border:1px solid #334155;">
          <input type="hidden" name="panelId" value="${panel.panel_id}">

          <div style="display:flex; gap:15px;">
            <div style="flex:2;">
              <label>اسم الزر (Label):</label>
              <input type="text" name="label" placeholder="مثال: قسم الشكاوي" required>
            </div>
            <div style="flex:1;">
              <label>لون الزر (Button Style):</label>
              <select name="buttonStyle">
                <option value="Primary">أزرق (Primary)</option>
                <option value="Secondary">رمادي (Secondary)</option>
                <option value="Success">أخضر (Success)</option>
                <option value="Danger">أحمر (Danger)</option>
              </select>
            </div>
          </div>

          <div style="display:flex; gap:15px;">
            <div style="flex:2;">
              <label>الوصف الفرعي:</label>
              <input type="text" name="description" placeholder="فتح تذكرة للشكاوي">
            </div>
            <div style="flex:1;">
              <label>الإيموجي:</label>
              <input type="text" name="emoji" placeholder="🛡️">
            </div>
          </div>

          <label>رسالة الترحيب داخل التكت عند اختيار هذا الزر:</label>
          <textarea name="welcomeMessage" rows="2" required>أهلاً بك، تم فتح التذكرة بنجاح.</textarea>

          <button type="submit" class="btn-add">➕ إضافة الزر</button>
        </form>

        <hr style="margin: 30px 0; border-color: #334155;">
        <h2>📋 الأزرار الحالية (${optionsRes.rows.length}):</h2>
        ${optionsHTML || '<p>لا توجد أزرار مضافة لهذه اللوحة بعد.</p>'}

        ${optionsRes.rows.length > 0 ? `
          <div style="display:flex; justify-content:space-between; margin-top:20px;">
            <form action="/publish-panel" method="POST" style="width:48%;">
              <input type="hidden" name="panelId" value="${panel.panel_id}">
              <input type="hidden" name="mode" value="update">
              <button type="submit" class="btn-update">🔄 تحديث رسالة البانل بالديسكورد</button>
            </form>

            <form action="/publish-panel" method="POST" style="width:48%;">
              <input type="hidden" name="panelId" value="${panel.panel_id}">
              <input type="hidden" name="mode" value="new">
              <button type="submit" class="btn-send">🚀 إرسال بانل جديد بروم جديد</button>
            </form>
          </div>
        ` : ''}
      </div>
    </body>
    </html>
  `);
});

app.post('/update-panel-settings', requireAuth, async (req, res) => {
  const d = req.body;
  await pool.query(`
    UPDATE panels SET title = $1, description = $2, color = $3, image_url = $4 WHERE panel_id = $5
  `, [d.title, d.description, d.color, d.imageUrl ? d.imageUrl.trim() : null, d.panelId]);
  res.redirect(`/edit-panel/${d.panelId}`);
});

app.post('/add-option', requireAuth, async (req, res) => {
  const d = req.body;
  const optionId = `opt_${Date.now()}`;
  await pool.query(`
    INSERT INTO panel_options (panel_id, option_id, label, description, emoji, welcome_message, button_style)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [d.panelId, optionId, d.label.trim(), d.description ? d.description.trim() : '', d.emoji ? d.emoji.trim() : '', d.welcomeMessage, d.buttonStyle]);

  res.redirect(`/edit-panel/${d.panelId}`);
});

app.get('/delete-option/:optId/:panelId', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM panel_options WHERE id = $1', [req.params.optId]);
  res.redirect(`/edit-panel/${req.params.panelId}`);
});

app.post('/publish-panel', requireAuth, async (req, res) => {
  const { panelId, mode } = req.body;
  const pRes = await pool.query('SELECT * FROM panels WHERE panel_id = $1', [panelId]);
  const panel = pRes.rows[0];
  const optionsRes = await pool.query('SELECT * FROM panel_options WHERE panel_id = $1 ORDER BY id ASC', [panelId]);

  if (!panel || optionsRes.rows.length === 0) {
    return res.send('❌ يجب إضافة خيار واحد على الأقل قبل إرسال أو تحديث اللوحة!');
  }

  try {
    const channel = await client.channels.fetch(panel.channel_id);
    if (!channel) return res.send('❌ تعذر الوصول لروم اللوحة بالديسكورد!');

    const components = [];

    if (panel.type === 'select') {
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`ticket_select_${panel.panel_id}`)
        .setPlaceholder('اختر القسم المطلوب من هنا... 🔽');

      optionsRes.rows.forEach(opt => {
        const optionBuilder = new StringSelectMenuOptionBuilder()
          .setLabel(opt.label)
          .setValue(opt.option_id);

        if (opt.description && opt.description.trim() !== '') {
          optionBuilder.setDescription(opt.description.trim());
        }
        if (opt.emoji && opt.emoji.trim() !== '') {
          try { optionBuilder.setEmoji(opt.emoji.trim()); } catch (e) {}
        }

        selectMenu.addOptions(optionBuilder);
      });

      components.push(new ActionRowBuilder().addComponents(selectMenu));

    } else {
      let currentRow = new ActionRowBuilder();
      optionsRes.rows.forEach((opt, idx) => {
        if (idx > 0 && idx % 5 === 0) {
          components.push(currentRow);
          currentRow = new ActionRowBuilder();
        }

        let style = ButtonStyle.Primary;
        if (opt.button_style === 'Secondary') style = ButtonStyle.Secondary;
        if (opt.button_style === 'Success') style = ButtonStyle.Success;
        if (opt.button_style === 'Danger') style = ButtonStyle.Danger;

        const btn = new ButtonBuilder()
          .setCustomId(`ticket_btn_${opt.option_id}`)
          .setLabel(opt.label)
          .setStyle(style);

        if (opt.emoji && opt.emoji.trim() !== '') {
          try { btn.setEmoji(opt.emoji.trim()); } catch (e) {}
        }

        currentRow.addComponents(btn);
      });
      components.push(currentRow);
    }

    let messagePayload = {};

    if (panel.message_type === 'embed') {
      const embed = new EmbedBuilder()
        .setTitle(panel.title)
        .setDescription(panel.description)
        .setColor(panel.color || '#0284c7');

      if (panel.image_url) {
        embed.setImage(panel.image_url);
      }

      messagePayload = { embeds: [embed], components: components };
    } else {
      let contentText = `**${panel.title}**\n\n${panel.description}`;
      if (panel.image_url) {
        contentText += `\n${panel.image_url}`;
      }
      messagePayload = { content: contentText, components: components };
    }

    let sentMessage;
    if (mode === 'update' && panel.last_message_id) {
      try {
        const oldMsg = await channel.messages.fetch(panel.last_message_id);
        if (oldMsg) {
          sentMessage = await oldMsg.edit(messagePayload);
        }
      } catch (e) {
        console.log('تعذر العثور على الرسالة القديمة، سيتم إرسال جديدة.');
      }
    }

    if (!sentMessage) {
      sentMessage = await channel.send(messagePayload);
      await pool.query('UPDATE panels SET last_message_id = $1 WHERE panel_id = $2', [sentMessage.id, panel.panel_id]);
    }

    res.send('<h2>✅ تم نشر/تحديث اللوحة بنجاح بداخل السيرفر مع الألوان والصور الجديدة!</h2><a href="/panel">العودة لوحة التحكم</a>');
  } catch (err) {
    console.error('خطأ أثناء نشر اللوحة:', err);
    res.send(`❌ حدث خطأ أثناء الإرسال: ${err.message}`);
  }
});

// ==========================================
// 5. نظام تقديم الإدارة
// ==========================================
app.get('/apply-setup', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM apply_setup WHERE id = $1', ['main_apply']);
  const appData = result.rows[0] || {};

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>إعداد تقديم الإدارة</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin:0; padding:0; }
        nav { background: #1e293b; padding: 15px 30px; display: flex; justify-content: space-between; border-bottom: 1px solid #334155; }
        nav .links a { color: #38bdf8; text-decoration: none; font-weight: bold; margin-left: 20px; }
        .container { max-width: 900px; margin: 40px auto; background: #1e293b; padding: 30px; border-radius: 12px; border: 1px solid #334155; }
        h1, h2 { color: #38bdf8; }
        label { display: block; margin-top: 12px; font-weight: bold; color:#cbd5e1; }
        input, select, textarea { width: 100%; padding: 10px; margin-top: 5px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; }
        button { margin-top: 25px; width: 100%; padding: 12px; background: #0284c7; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }
      </style>
    </head>
    <body>
      <nav>
        <div class="links">
          <a href="/">الرئيسية 🏠</a>
          <a href="/panel">إدارة التذاكر ⚙️</a>
          <a href="/apply-setup">تقديم الإدارة 📝</a>
          <a href="/admin-commands">صلاحيات الأوامر 🛡️</a>
          <a href="/stats">الإحصائيات 📊</a>
        </div>
        <a href="/logout" style="color:#ef4444; font-weight:bold; text-decoration:none;">تسجيل الخروج 🚪</a>
      </nav>
      <div class="container">
        <h1>📝 إعداد نموذج تقديم الإدارة</h1>
        <form action="/save-apply-setup" method="POST">
          <label>عنوان بنر التقديم:</label>
          <input type="text" name="title" value="${appData.title || 'تقديم على الإدارة 🎖️'}" required>

          <label>وصف بنر التقديم:</label>
          <textarea name="description" rows="2" required>${appData.description || 'اضغط على الزر أدناه لفتح نموذج التقديم.'}</textarea>

          <label>رابط صورة البنر (Image URL):</label>
          <input type="url" name="imageUrl" value="${appData.image_url || ''}">

          <div style="display:flex; gap:15px;">
            <div style="flex:1;"><label>آيدي روم إرسال البنر:</label><input type="text" name="submitChannelId" value="${appData.submit_channel_id || ''}" required></div>
            <div style="flex:1;"><label>آيدي روم مراجعة التقديمات:</label><input type="text" name="reviewChannelId" value="${appData.review_channel_id || ''}" required></div>
          </div>

          <div style="display:flex; gap:15px;">
            <div style="flex:1;"><label>آيدي روم نتائج القبول/الرفض:</label><input type="text" name="resultsChannelId" value="${appData.results_channel_id || ''}" required></div>
            <div style="flex:1;"><label>آيدي رتبة الإدارة العليا للمراجعة:</label><input type="text" name="highAdminRoleId" value="${appData.high_admin_role_id || ''}" required></div>
          </div>

          <label>آيدي رتبة الإدارة (التي تُعطى تلقائياً عند القبول):</label>
          <input type="text" name="acceptedRoleId" value="${appData.accepted_role_id || ''}" required>

          <hr style="margin: 25px 0; border-color: #334155;">
          <h2>❓ أسئلة التقديم:</h2>
          <label>السؤال الأول:</label><input type="text" name="q1" value="${appData.q1 || 'ما هو اسمك وعمرك؟'}" required>
          <label>السؤال الثاني:</label><input type="text" name="q2" value="${appData.q2 || 'لماذا تريد الانضمام للإدارة؟'}" required>
          <label>السؤال الثالث:</label><input type="text" name="q3" value="${appData.q3 || 'كم تتفاعل يومياً بالسيرفر؟'}" required>
          <label>السؤال الرابع:</label><input type="text" name="q4" value="${appData.q4 || 'هل لديك خبرة سابقة؟'}" required>
          <label>السؤال الخامس (اختياري):</label><input type="text" name="q5" value="${appData.q5 || ''}">

          <button type="submit" style="background:#10b981;">💾 حفظ إعدادات التقديم ونشر البنر بالديسكورد</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

app.post('/save-apply-setup', requireAuth, async (req, res) => {
  const d = req.body;
  await pool.query(`
    INSERT INTO apply_setup (id, title, description, image_url, submit_channel_id, review_channel_id, results_channel_id, high_admin_role_id, accepted_role_id, q1, q2, q3, q4, q5)
    VALUES ('main_apply', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      image_url = EXCLUDED.image_url,
      submit_channel_id = EXCLUDED.submit_channel_id,
      review_channel_id = EXCLUDED.review_channel_id,
      results_channel_id = EXCLUDED.results_channel_id,
      high_admin_role_id = EXCLUDED.high_admin_role_id,
      accepted_role_id = EXCLUDED.accepted_role_id,
      q1 = EXCLUDED.q1, q2 = EXCLUDED.q2, q3 = EXCLUDED.q3, q4 = EXCLUDED.q4, q5 = EXCLUDED.q5;
  `, [d.title, d.description, d.imageUrl ? d.imageUrl.trim() : null, d.submitChannelId.trim(), d.reviewChannelId.trim(), d.resultsChannelId.trim(), d.highAdminRoleId.trim(), d.acceptedRoleId.trim(), d.q1, d.q2, d.q3, d.q4, d.q5]);

  try {
    const channel = await client.channels.fetch(d.submitChannelId.trim());
    if (channel) {
      const applyEmbed = new EmbedBuilder()
        .setTitle(d.title)
        .setDescription(d.description)
        .setColor(0xeab308)
        .setTimestamp();

      if (d.imageUrl) applyEmbed.setImage(d.imageUrl.trim());

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('start_apply_form').setLabel('تقديم على الإدارة').setStyle(ButtonStyle.Success).setEmoji('📝')
      );

      const msg = await channel.send({ embeds: [applyEmbed], components: [row] });
      await pool.query('UPDATE apply_setup SET last_message_id = $1 WHERE id = $2', [msg.id, 'main_apply']);
    }
  } catch (e) {
    console.error('خطأ في نشر بنر التقديم:', e);
  }

  res.send('<h2>✅ تم حفظ ونشر بنر التقديم بنجاح!</h2><a href="/apply-setup">العودة</a>');
});

// ==========================================
// 6. ضبط صلاحيات الأوامر
// ==========================================
app.get('/admin-commands', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM permissions WHERE key = $1', ['main_permissions']);
  const perms = result.rows[0] || {};

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>صلاحيات الأوامر والأزرار</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin:0; padding:0; }
        nav { background: #1e293b; padding: 15px 30px; display: flex; justify-content: space-between; border-bottom: 1px solid #334155; }
        nav .links a { color: #38bdf8; text-decoration: none; font-weight: bold; margin-left: 20px; }
        .container { max-width: 850px; margin: 40px auto; background: #1e293b; padding: 30px; border-radius: 12px; border: 1px solid #334155; }
        h1, h2 { color: #38bdf8; }
        label { display: block; margin-top: 15px; font-weight: bold; color:#cbd5e1; }
        input, select { width: 100%; padding: 10px; margin-top: 5px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; }
        button { margin-top: 25px; width: 100%; padding: 12px; background: #0284c7; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }
      </style>
    </head>
    <body>
      <nav>
        <div class="links">
          <a href="/">الرئيسية 🏠</a>
          <a href="/panel">إدارة التذاكر ⚙️</a>
          <a href="/apply-setup">تقديم الإدارة 📝</a>
          <a href="/admin-commands">صلاحيات الأوامر 🛡️</a>
          <a href="/stats">الإحصائيات 📊</a>
        </div>
        <a href="/logout" style="color:#ef4444; font-weight:bold; text-decoration:none;">تسجيل الخروج 🚪</a>
      </nav>
      <div class="container">
        <h1>🛡️ ضبط صلاحيات أزرار وأوامر التذاكر</h1>
        <form action="/save-admin-commands" method="POST">
          <h2>📌 أزرار التكت:</h2>
          <div style="display:flex; gap:15px;">
            <div style="flex:1;">
              <label>إغلاق التكت (Close):</label>
              <select name="closePermission">
                <option value="both" ${perms.close_permission === 'both' ? 'selected' : ''}>صاحب التكت والإدارة</option>
                <option value="admin_only" ${perms.close_permission === 'admin_only' ? 'selected' : ''}>الإدارة فقط</option>
              </select>
            </div>
            <div style="flex:1;">
              <label>حذف التكت (Delete):</label>
              <select name="deletePermission">
                <option value="high_admin" ${perms.delete_permission === 'high_admin' ? 'selected' : ''}>الإدارة العليا فقط</option>
                <option value="all_admin" ${perms.delete_permission === 'all_admin' ? 'selected' : ''}>جميع الإدارة</option>
              </select>
            </div>
          </div>

          <div style="margin-top:15px;">
            <label>حفظ الترانسكريبت (Save Transcript):</label>
            <select name="savePermission">
              <option value="both" ${perms.save_permission === 'both' ? 'selected' : ''}>صاحب التكت والإدارة</option>
              <option value="admin_only" ${perms.save_permission === 'admin_only' ? 'selected' : ''}>الإدارة فقط</option>
            </select>
          </div>

          <button type="submit">💾 حفظ إعدادات الصلاحيات</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

app.post('/save-admin-commands', requireAuth, async (req, res) => {
  const d = req.body;
  await pool.query(`
    INSERT INTO permissions (key, close_permission, delete_permission, save_permission)
    VALUES ('main_permissions', $1, $2, $3)
    ON CONFLICT (key) DO UPDATE SET
      close_permission = EXCLUDED.close_permission,
      delete_permission = EXCLUDED.delete_permission,
      save_permission = EXCLUDED.save_permission;
  `, [d.closePermission, d.deletePermission, d.savePermission]);

  res.send('<h2>✅ تم حفظ الصلاحيات بنجاح!</h2><a href="/admin-commands">العودة</a>');
});

// ==========================================
// الإحصائيات
// ==========================================
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
        body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin:0; padding:0; }
        nav { background: #1e293b; padding: 15px 30px; display: flex; justify-content: space-between; border-bottom: 1px solid #334155; }
        nav .links a { color: #38bdf8; text-decoration: none; font-weight: bold; margin-left: 20px; }
        .container { max-width: 800px; margin: 40px auto; background: #1e293b; padding: 30px; border-radius: 12px; border: 1px solid #334155; }
        h1, h2 { color: #38bdf8; }
      </style>
    </head>
    <body>
      <nav>
        <div class="links">
          <a href="/">الرئيسية 🏠</a>
          <a href="/panel">إدارة التذاكر ⚙️</a>
          <a href="/apply-setup">تقديم الإدارة 📝</a>
          <a href="/admin-commands">صلاحيات الأوامر 🛡️</a>
          <a href="/stats">الإحصائيات 📊</a>
        </div>
        <a href="/logout" style="color:#ef4444; font-weight:bold; text-decoration:none;">تسجيل الخروج 🚪</a>
      </nav>
      <div class="container">
        <h1>📊 إحصائيات البوت</h1>
        <div style="background:#0f172a; padding:20px; border-radius:8px; text-align:center; border:1px solid #334155;">
          <h3 style="color:#38bdf8; margin:0;">إجمالي التذاكر التي تم فتحها حتى الآن:</h3>
          <p style="font-size:36px; color:#10b981; font-weight:bold; margin:10px 0 0 0;">${totalTickets} 🎫</p>
        </div>
      </div>
    </body>
    </html>
  `);
});

// ==========================================
// 7. تشغيل أحداث الديسكورد وتوكن البوت
// ==========================================
client.on('ready', async () => {
  console.log(`🚀 تم تسجيل الدخول بنجاح باسم ${client.user.tag}`);
});

// دالة حفظ ملف الترانسكريبت
async function saveTranscript(channel, config, user, ticketData) {
  try {
    const logChannel = await channel.guild.channels.fetch(config.log_channel_id).catch(() => null);
    if (!logChannel) return false;

    const attachment = await discordTranscripts.createTranscript(channel, {
      limit: -1,
      returnType: 'attachment',
      filename: `transcript-${channel.name}.html`,
      saveImages: true,
      poweredBy: false
    });

    const embed = new EmbedBuilder()
      .setTitle('📁 سجل تذكرة مغلقة (Transcript)')
      .setDescription(`تم حفظ محادثة التذكرة بواسطة: ${user}`)
      .addFields(
        { name: '👤 صاحب التكت:', value: `<@${ticketData.ownerId}>`, inline: true },
        { name: '📌 اسم القناة:', value: channel.name, inline: true }
      )
      .setColor(0x0284c7)
      .setTimestamp();

    await logChannel.send({ embeds: [embed], files: [attachment] });
    return true;
  } catch (err) {
    console.error('خطأ في حفظ الترانسكريبت:', err);
    return false;
  }
}

// معالجة فتح وإدارة التذاكر عبر الأزرار والقوائم المنسدلة
client.on('interactionCreate', async (interaction) => {
  try {
    // 1. فتح التذكرة عبر الزر المباشر
    if (interaction.isButton() && interaction.customId.startsWith('ticket_btn_')) {
      const optionId = interaction.customId.replace('ticket_btn_', '');
      const optRes = await pool.query('SELECT * FROM panel_options WHERE option_id = $1', [optionId]);
      const option = optRes.rows[0];
      if (!option) return interaction.reply({ content: '❌ هذا الخيار لم يعد متوفراً.', ephemeral: true });

      const panelRes = await pool.query('SELECT * FROM panels WHERE panel_id = $1', [option.panel_id]);
      const config = panelRes.rows[0];

      await interaction.deferReply({ ephemeral: true });

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

      await ticketChannel.setTopic(JSON.stringify({ ownerId: interaction.user.id, panelId: config.panel_id }));

      const welcomeEmbed = new EmbedBuilder()
        .setTitle(`🎫 تذكرة جديدة: ${option.label}`)
        .setDescription(option.welcome_message || 'أهلاً بك، تم فتح التذكرة بنجاح.')
        .setColor(config.color || 0x0284c7)
        .setTimestamp();

      const controlRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_close').setLabel('إغلاق').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('ticket_save_log').setLabel('حفظ الترانسكريبت').setStyle(ButtonStyle.Secondary).setEmoji('💾')
      );

      await ticketChannel.send({ content: `${interaction.user} | <@&${config.admin_role_id}>`, embeds: [welcomeEmbed], components: [controlRow] });
      return interaction.editReply({ content: `✅ تم إنشاء تذكرتك بنجاح: ${ticketChannel}` });
    }

    // 2. فتح التذكرة عبر القائمة المنسدلة (Select Menu)
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('ticket_select_')) {
      const optionId = interaction.values[0];
      const optRes = await pool.query('SELECT * FROM panel_options WHERE option_id = $1', [optionId]);
      const option = optRes.rows[0];
      if (!option) return interaction.reply({ content: '❌ هذا الخيار لم يعد متوفراً.', ephemeral: true });

      const panelRes = await pool.query('SELECT * FROM panels WHERE panel_id = $1', [option.panel_id]);
      const config = panelRes.rows[0];

      await interaction.deferReply({ ephemeral: true });

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

      await ticketChannel.setTopic(JSON.stringify({ ownerId: interaction.user.id, panelId: config.panel_id }));

      const welcomeEmbed = new EmbedBuilder()
        .setTitle(`🎫 تذكرة جديدة: ${option.label}`)
        .setDescription(option.welcome_message || 'أهلاً بك، تم فتح التذكرة بنجاح.')
        .setColor(config.color || 0x0284c7)
        .setTimestamp();

      const controlRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_close').setLabel('إغلاق').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
        new ButtonBuilder().setCustomId('ticket_save_log').setLabel('حفظ الترانسكريبت').setStyle(ButtonStyle.Secondary).setEmoji('💾')
      );

      await ticketChannel.send({ content: `${interaction.user} | <@&${config.admin_role_id}>`, embeds: [welcomeEmbed], components: [controlRow] });
      return interaction.editReply({ content: `✅ تم إنشاء تذكرتك بنجاح: ${ticketChannel}` });
    }

    // 3. أزرار التحكم داخل التكت (إغلاق، حفظ الترانسكريبت، حذف)
    if (interaction.isButton() && ['ticket_close', 'ticket_save_log', 'ticket_delete'].includes(interaction.customId)) {
      const topic = interaction.channel.topic;
      let ticketData = { ownerId: '' };
      let config = { admin_role_id: '', high_admin_role_id: '', log_channel_id: '' };

      try {
        if (topic) ticketData = JSON.parse(topic);
      } catch (e) {}

      const panelRes = await pool.query('SELECT * FROM panels WHERE panel_id = $1', [ticketData.panelId || '']);
      if (panelRes.rows.length > 0) {
        config = panelRes.rows[0];
      }

      const permRes = await pool.query('SELECT * FROM permissions WHERE key = $1', ['main_permissions']);
      const perms = permRes.rows[0] || { close_permission: 'both', delete_permission: 'high_admin', save_permission: 'both' };

      const member = interaction.member;
      const isAdmin = member.roles.cache.has(config.admin_role_id);
      const isHighAdmin = member.roles.cache.has(config.high_admin_role_id) || member.permissions.has(PermissionFlagsBits.Administrator);
      const isOwner = interaction.user.id === ticketData.ownerId;

      if (interaction.customId === 'ticket_close') {
        const closeAllowed = perms.close_permission === 'admin_only' ? (isAdmin || isHighAdmin) : (isOwner || isAdmin || isHighAdmin);
        if (!closeAllowed) return interaction.reply({ content: '❌ لا تمتلك صلاحية إغلاق التكت!', ephemeral: true });

        await interaction.reply({ content: '🔒 جاري إغلاق التذكرة...' });
        setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
      }

      if (interaction.customId === 'ticket_save_log') {
        const saveAllowed = perms.save_permission === 'admin_only' ? (isAdmin || isHighAdmin) : (isOwner || isAdmin || isHighAdmin);
        if (!saveAllowed) return interaction.reply({ content: '❌ لا تمتلك صلاحية حفظ الترانسكريبت!', ephemeral: true });

        await interaction.deferReply();
        const success = await saveTranscript(interaction.channel, config, interaction.user, ticketData);
        if (success) return interaction.editReply({ content: '✅ تم إنشاء ملف الترانسكريبت وإرساله إلى روم اللوق!' });
        return interaction.editReply({ content: '❌ تعذر العثور على قناة اللوق أو حفظ السجل.' });
      }

      if (interaction.customId === 'ticket_delete') {
        const deleteAllowed = perms.delete_permission === 'all_admin' ? (isAdmin || isHighAdmin) : isHighAdmin;
        if (!deleteAllowed) return interaction.reply({ content: '❌ لا تمتلك صلاحية حذف التكت!', ephemeral: true });

        await interaction.reply({ content: '🗑️ سيتم حذف التذكرة خلال 3 ثوانٍ...' });
        setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
      }
    }

    // 4. نظام تقديم الإدارة (Modal / Button)
    if (interaction.isButton() && interaction.customId === 'start_apply_form') {
      const applyRes = await pool.query('SELECT * FROM apply_setup WHERE id = $1', ['main_apply']);
      const appData = applyRes.rows[0];
      if (!appData) return interaction.reply({ content: '❌ نموذج التقديم غير مفعل حالياً.', ephemeral: true });

      const modal = new ModalBuilder()
        .setCustomId('apply_modal_submit')
        .setTitle('نموذج التقديم على الإدارة');

      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q1').setLabel(appData.q1 ? appData.q1.substring(0, 45) : 'السؤال الأول').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q2').setLabel(appData.q2 ? appData.q2.substring(0, 45) : 'السؤال الثاني').setStyle(TextInputStyle.Paragraph).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q3').setLabel(appData.q3 ? appData.q3.substring(0, 45) : 'السؤال الثالث').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q4').setLabel(appData.q4 ? appData.q4.substring(0, 45) : 'السؤال الرابع').setStyle(TextInputStyle.Short).setRequired(true))
      );

      if (appData.q5 && appData.q5.trim() !== '') {
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q5').setLabel(appData.q5.substring(0, 45)).setStyle(TextInputStyle.Short).setRequired(false)));
      }

      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'apply_modal_submit') {
      const applyRes = await pool.query('SELECT * FROM apply_setup WHERE id = $1', ['main_apply']);
      const appData = applyRes.rows[0];
      if (!appData) return interaction.reply({ content: '❌ حدث خطأ، نموذج التقديم غير متوفر.', ephemeral: true });

      const reviewChannel = await interaction.guild.channels.fetch(appData.review_channel_id).catch(() => null);
      if (!reviewChannel) return interaction.reply({ content: '❌ تعذر العثور على روم مراجعة التقديمات.', ephemeral: true });

      const ans1 = interaction.fields.getTextInputValue('q1');
      const ans2 = interaction.fields.getTextInputValue('q2');
      const ans3 = interaction.fields.getTextInputValue('q3');
      const ans4 = interaction.fields.getTextInputValue('q4');
      let ans5 = '';
      try { ans5 = interaction.fields.getTextInputValue('q5'); } catch (e) {}

      const reviewEmbed = new EmbedBuilder()
        .setTitle('📋 تقديم جديد للإدارة')
        .setDescription(`مقدم الطلب: ${interaction.user} (${interaction.user.id})`)
        .addFields(
          { name: `1️⃣ ${appData.q1}`, value: ans1 || 'غير متوفر' },
          { name: `2️⃣ ${appData.q2}`, value: ans2 || 'غير متوفر' },
          { name: `3️⃣ ${appData.q3}`, value: ans3 || 'غير متوفر' },
          { name: `4️⃣ ${appData.q4}`, value: ans4 || 'غير متوفر' }
        )
        .setColor(0xeab308)
        .setTimestamp();

      if (ans5) {
        reviewEmbed.addFields({ name: `5️⃣ ${appData.q5}`, value: ans5 });
      }

      const reviewRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`apply_accept_${interaction.user.id}`).setLabel('قبول').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId(`apply_reject_${interaction.user.id}`).setLabel('رفض').setStyle(ButtonStyle.Danger).setEmoji('❌')
      );

      await reviewChannel.send({ embeds: [reviewEmbed], components: [reviewRow] });
      return interaction.reply({ content: '✅ تم إرسال تقديمك بنجاح للإدارة للمراجعة!', ephemeral: true });
    }

    // 5. قبول أو رفض التقديم
    if (interaction.isButton() && (interaction.customId.startsWith('apply_accept_') || interaction.customId.startsWith('apply_reject_'))) {
      const applyRes = await pool.query('SELECT * FROM apply_setup WHERE id = $1', ['main_apply']);
      const appData = applyRes.rows[0];
      if (!appData) return interaction.reply({ content: '❌ الإعدادات غير موجودة.', ephemeral: true });

      const isHighAdmin = interaction.member.roles.cache.has(appData.high_admin_role_id) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
      if (!isHighAdmin) return interaction.reply({ content: '❌ هذه الصلاحية خاصة بالإدارة العليا فقط!', ephemeral: true });

      const isAccept = interaction.customId.startsWith('apply_accept_');
      const targetUserId = interaction.customId.replace(isAccept ? 'apply_accept_' : 'apply_reject_', '');
      const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);

      if (isAccept && targetMember && appData.accepted_role_id) {
        await targetMember.roles.add(appData.accepted_role_id).catch(() => {});
      }

      const resultsChannel = await interaction.guild.channels.fetch(appData.results_channel_id).catch(() => null);
      if (resultsChannel) {
        const resultEmbed = new EmbedBuilder()
          .setTitle(isAccept ? '🎉 مبارك لك قبولك في الإدارة!' : '❌ نعتذر منك، تم رفض طلبك')
          .setDescription(isAccept ? `تم قبولك بواسطة ${interaction.user}` : `تم رفض الطلب بواسطة ${interaction.user}`)
          .setColor(isAccept ? 0x10b981 : 0xef4444)
          .setTimestamp();
        
        await resultsChannel.send({ content: `<@${targetUserId}>`, embeds: [resultEmbed] }).catch(() => {});
      }

      await interaction.update({ content: `✅ تم ${isAccept ? 'قبول' : 'رفض'} المتقدم بنجاح بواسطة ${interaction.user.tag}`, components: [] });
    }

  } catch (err) {
    console.error('خطأ في معالجة التفاعل:', err);
  }
});

client.login(process.env.DISCORD_TOKEN);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 لوحة التحكم تعمل الآن على البورت ${PORT}`);
});
