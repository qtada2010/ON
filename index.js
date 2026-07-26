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

    // 3. جدول صلاحيات الأوامر والبريفكس والأسماء المخصصة
    await pool.query(`
      CREATE TABLE IF NOT EXISTS permissions (
        key VARCHAR(50) PRIMARY KEY,
        prefix VARCHAR(10) DEFAULT '!',
        all_commands_role_id VARCHAR(100) DEFAULT '',
        tax_role_id VARCHAR(100) DEFAULT '',
        come_role_id VARCHAR(100) DEFAULT '',
        say_role_id VARCHAR(100) DEFAULT '',
        clear_role_id VARCHAR(100) DEFAULT '',
        lock_role_id VARCHAR(100) DEFAULT '',
        unlock_role_id VARCHAR(100) DEFAULT '',
        suggest_role_id VARCHAR(100) DEFAULT '',
        close_permission VARCHAR(50) DEFAULT 'both',
        delete_permission VARCHAR(50) DEFAULT 'high_admin',
        save_permission VARCHAR(50) DEFAULT 'both',
        cmd_clear VARCHAR(50) DEFAULT 'مسح',
        cmd_lock VARCHAR(50) DEFAULT 'قفل',
        cmd_unlock VARCHAR(50) DEFAULT 'فتح',
        cmd_suggest VARCHAR(50) DEFAULT 'اقتراحات'
      );
    `);

    await pool.query(`
      ALTER TABLE permissions ADD COLUMN IF NOT EXISTS prefix VARCHAR(10) DEFAULT '!';
      ALTER TABLE permissions ADD COLUMN IF NOT EXISTS clear_role_id VARCHAR(100) DEFAULT '';
      ALTER TABLE permissions ADD COLUMN IF NOT EXISTS lock_role_id VARCHAR(100) DEFAULT '';
      ALTER TABLE permissions ADD COLUMN IF NOT EXISTS unlock_role_id VARCHAR(100) DEFAULT '';
      ALTER TABLE permissions ADD COLUMN IF NOT EXISTS suggest_role_id VARCHAR(100) DEFAULT '';
      ALTER TABLE permissions ADD COLUMN IF NOT EXISTS cmd_clear VARCHAR(50) DEFAULT 'مسح';
      ALTER TABLE permissions ADD COLUMN IF NOT EXISTS cmd_lock VARCHAR(50) DEFAULT 'قفل';
      ALTER TABLE permissions ADD COLUMN IF NOT EXISTS cmd_unlock VARCHAR(50) DEFAULT 'فتح';
      ALTER TABLE permissions ADD COLUMN IF NOT EXISTS cmd_suggest VARCHAR(50) DEFAULT 'اقتراحات';
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

    // 6. جدول إعدادات روم الاقتراحات
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(50) PRIMARY KEY,
        suggest_channel_id VARCHAR(100)
      );
    `);

    console.log('🐘 تم تحديث قواعد البيانات وإضافة الجداول الجديدة بنجاح!');
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
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions
  ]
});

const ADMIN_PREFIX = '$';
let ownerLogChannelId = null;

// ==========================================
// 3. خادم الويب ولوحة التحكم الشاملة (Express)
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

// الصفحة الرئيسية
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
          <a href="/admin-commands">الصلاحيات والبريفكس 🛡️</a>
          <a href="/stats">الإحصائيات 📊</a>
        </div>
        <a href="/logout" style="color:#ef4444; font-weight:bold; text-decoration:none;">تسجيل الخروج 🚪</a>
      </nav>
      <div class="container">
        <h1>🎮 لوحة التحكم الإدارية المطلقة</h1>
        <p style="text-align:center; color:#94a3b8;">تحكم كامل في التذاكر، التقديمات، البريفكس، أسماء الأوامر والصلاحيات.</p>
        <div style="text-align:center; margin-top: 30px;">
          <a href="/panel" class="btn">🛠️ إدارة لوحات التذاكر</a>
          <a href="/apply-setup" class="btn" style="background:#eab308; color:#000;">📝 نظام تقديم الإدارة</a>
          <a href="/admin-commands" class="btn" style="background:#8b5cf6;">🛡️ تعديل البريفكس والصلاحيات والأوامر</a>
          <a href="/stats" class="btn" style="background:#059669;">📊 الإحصائيات</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// ==========================================
// إدارة اللوحات والتذاكر
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
            الخيارات: <strong>${optionsCount}</strong> | الروم: ${p.channel_id}
          </p>
        </div>
        <div>
          <a href="/edit-panel/${p.panel_id}" style="background:#0284c7; color:white; padding:8px 15px; border-radius:5px; text-decoration:none; font-weight:bold; margin-left:5px;">✏️ تعديل</a>
          <a href="/delete-panel/${p.panel_id}" onclick="return confirm('هل أنت متأكد من الحذف؟')" style="background:#ef4444; color:white; padding:8px 15px; border-radius:5px; text-decoration:none; font-weight:bold;">🗑️ حذف</a>
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
          <a href="/admin-commands">الصلاحيات والبريفكس 🛡️</a>
          <a href="/stats">الإحصائيات 📊</a>
        </div>
        <a href="/logout" style="color:#ef4444; font-weight:bold; text-decoration:none;">تسجيل الخروج 🚪</a>
      </nav>
      <div class="container">
        <h1>➕ إنشاء لوحة تذاكر جديدة</h1>
        <form action="/create-panel" method="POST">
          <label>معرف اللوحة الفريد (Panel ID):</label>
          <input type="text" name="panelId" placeholder="main_support" required>

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
              <label>لون الإيمبد (Hex Color):</label>
              <input type="color" name="color" value="#0284c7" style="height:40px;">
            </div>
            <div style="flex:2;">
              <label>رابط الصورة المرفقة (URL):</label>
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

          <label>آيدي روم اللوق (السجل والترانسكريبت):</label>
          <input type="text" name="logChannelId" required>

          <label>عنوان اللوحة:</label>
          <input type="text" name="title" value="تكت الدعم الفني والوساطة 🤝" required>

          <label>وصف اللوحة:</label>
          <textarea name="description" rows="2" required>اختر القسم المناسب من الأسفل لفتح تذكرة.</textarea>

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
          <span style="color:#eab308; font-weight:bold;">#${index + 1} الخيار: ${opt.label}</span>
          <a href="/delete-option/${opt.id}/${panel.panel_id}" style="color:#ef4444; font-weight:bold; text-decoration:none;">🗑️ حذف</a>
        </div>
        <p style="margin:5px 0; color:#94a3b8; font-size:14px;">الوصف: ${opt.description || 'بدون'} | الإيموجي: ${opt.emoji || 'بدون'} | لون الزر: <strong>${opt.button_style}</strong></p>
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
        h1, h2 { color: #38bdf8; }
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
          <a href="/admin-commands">الصلاحيات والبريفكس 🛡️</a>
          <a href="/stats">الإحصائيات 📊</a>
        </div>
        <a href="/logout" style="color:#ef4444; font-weight:bold; text-decoration:none;">تسجيل الخروج 🚪</a>
      </nav>
      <div class="container">
        <h1>⚙️ التحكم باللوحة: ${panel.title}</h1>

        <h2>➕ إضافة زر / خيار جديد:</h2>
        <form action="/add-option" method="POST" style="background:#0f172a; padding:20px; border-radius:8px; border:1px solid #334155;">
          <input type="hidden" name="panelId" value="${panel.panel_id}">

          <div style="display:flex; gap:15px;">
            <div style="flex:2;">
              <label>اسم الخيار / الزر:</label>
              <input type="text" name="label" placeholder="مثال: طلب وساطة" required>
            </div>
            <div style="flex:1;">
              <label>لون الزر:</label>
              <select name="buttonStyle">
                <option value="Primary">أزرق</option>
                <option value="Secondary">رمادي</option>
                <option value="Success">أخضر</option>
                <option value="Danger">أحمر</option>
              </select>
            </div>
          </div>

          <div style="display:flex; gap:15px;">
            <div style="flex:2;">
              <label>الوصف الفرعي (للقائمة المنسدلة):</label>
              <input type="text" name="description" placeholder="وساطة سريعة">
            </div>
            <div style="flex:1;">
              <label>الإيموجي:</label>
              <input type="text" name="emoji" placeholder="🤝">
            </div>
          </div>

          <label>رسالة الترحيب بداخل التكت:</label>
          <textarea name="welcomeMessage" rows="2" required>أهلاً بك! تم فتح التذكرة بنجاح.</textarea>

          <button type="submit" class="btn-add">➕ إضافة الخيار</button>
        </form>

        <hr style="margin: 30px 0; border-color: #334155;">
        <h2>📋 الخيارات الحالية (${optionsRes.rows.length}):</h2>
        ${optionsHTML || '<p>لا يوجد خيارات مضافة بعد.</p>'}

        ${optionsRes.rows.length > 0 ? `
          <div style="display:flex; justify-content:space-between; margin-top:20px;">
            <form action="/publish-panel" method="POST" style="width:48%;">
              <input type="hidden" name="panelId" value="${panel.panel_id}">
              <input type="hidden" name="mode" value="update">
              <button type="submit" class="btn-update">🔄 تحديث الرسالة بالديسكورد</button>
            </form>

            <form action="/publish-panel" method="POST" style="width:48%;">
              <input type="hidden" name="panelId" value="${panel.panel_id}">
              <input type="hidden" name="mode" value="new">
              <button type="submit" class="btn-send">🚀 إرسال رسالة جديدة</button>
            </form>
          </div>
        ` : ''}
      </div>
    </body>
    </html>
  `);
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

  if (!panel || optionsRes.rows.length === 0) return res.send('❌ أضف خياراً واحداً على الأقل قبل النشر!');

  try {
    const channel = await client.channels.fetch(panel.channel_id);
    if (!channel) return res.send('❌ تعذر الوصول للقناة!');

    const components = [];

    if (panel.type === 'select') {
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`ticket_select_${panel.panel_id}`)
        .setPlaceholder('اختر القسم المطلوب من هنا... 🔽');

      optionsRes.rows.forEach(opt => {
        const optionBuilder = new StringSelectMenuOptionBuilder().setLabel(opt.label).setValue(opt.option_id);
        if (opt.description) optionBuilder.setDescription(opt.description);
        if (opt.emoji) { try { optionBuilder.setEmoji(opt.emoji); } catch (e) {} }
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

        const btn = new ButtonBuilder().setCustomId(`ticket_btn_${opt.option_id}`).setLabel(opt.label).setStyle(style);
        if (opt.emoji) { try { btn.setEmoji(opt.emoji); } catch (e) {} }
        currentRow.addComponents(btn);
      });
      components.push(currentRow);
    }

    let messagePayload = {};
    if (panel.message_type === 'embed') {
      const embed = new EmbedBuilder().setTitle(panel.title).setDescription(panel.description).setColor(panel.color || '#0284c7');
      if (panel.image_url) embed.setImage(panel.image_url);
      messagePayload = { embeds: [embed], components: components };
    } else {
      let contentText = `**${panel.title}**\n\n${panel.description}`;
      if (panel.image_url) contentText += `\n${panel.image_url}`;
      messagePayload = { content: contentText, components: components };
    }

    let sentMessage;
    if (mode === 'update' && panel.last_message_id) {
      try {
        const oldMsg = await channel.messages.fetch(panel.last_message_id);
        if (oldMsg) sentMessage = await oldMsg.edit(messagePayload);
      } catch (e) {}
    }

    if (!sentMessage) {
      sentMessage = await channel.send(messagePayload);
      await pool.query('UPDATE panels SET last_message_id = $1 WHERE panel_id = $2', [sentMessage.id, panel.panel_id]);
    }

    res.send('<h2>✅ تم نشر/تحديث اللوحة بنجاح!</h2><a href="/panel">العودة للوحة التحكم</a>');
  } catch (err) {
    res.send(`❌ حدث خطأ أثناء الإرسال: ${err.message}`);
  }
});

// ==========================================
// 4. نظام تقديم الإدارة
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
        h1, h2 { color: #eab308; }
        label { display: block; margin-top: 12px; font-weight: bold; color:#cbd5e1; }
        input, textarea { width: 100%; padding: 10px; margin-top: 5px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; }
        button { margin-top: 20px; padding: 12px; background: #10b981; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; font-size: 15px; }
      </style>
    </head>
    <body>
      <nav>
        <div class="links">
          <a href="/">الرئيسية 🏠</a>
          <a href="/panel">إدارة التذاكر ⚙️</a>
          <a href="/apply-setup">تقديم الإدارة 📝</a>
          <a href="/admin-commands">الصلاحيات والبريفكس 🛡️</a>
          <a href="/stats">الإحصائيات 📊</a>
        </div>
        <a href="/logout" style="color:#ef4444; font-weight:bold; text-decoration:none;">تسجيل الخروج 🚪</a>
      </nav>
      <div class="container">
        <h1>📝 إعدادات لوحة تقديم الإدارة والرتب</h1>
        <form action="/save-apply-setup" method="POST">

          <h2>⚙️ إعداد القنوات والصلاحيات:</h2>
          <div style="display:flex; gap:15px;">
            <div style="flex:1;">
              <label>روم إرسال بنر التقديم:</label>
              <input type="text" name="submitChannelId" value="${appData.submit_channel_id || ''}" required>
            </div>
            <div style="flex:1;">
              <label>روم مراجعة التقديمات:</label>
              <input type="text" name="reviewChannelId" value="${appData.review_channel_id || ''}" required>
            </div>
          </div>

          <div style="display:flex; gap:15px;">
            <div style="flex:1;">
              <label>روم النتائج (قبول/رفض):</label>
              <input type="text" name="resultsChannelId" value="${appData.results_channel_id || ''}" required>
            </div>
            <div style="flex:1;">
              <label>آيدي رتبة الإدارة العليا (للقبول):</label>
              <input type="text" name="highAdminRoleId" value="${appData.high_admin_role_id || ''}" required>
            </div>
          </div>

          <label style="color:#10b981;">🎖️ آيدي الرتبة التي تُعطى تلقائياً عند القبول:</label>
          <input type="text" name="acceptedRoleId" value="${appData.accepted_role_id || ''}" placeholder="آيدي رتبة المقبولين">

          <hr style="margin: 25px 0; border-color: #334155;">
          <h2>🖼️ نص الرسالة والأسئلة:</h2>
          <label>عنوان رسالة التقديم:</label>
          <input type="text" name="title" value="${appData.title || 'تقديم الإدارة الرسمية 👑'}" required>

          <label>الوصف:</label>
          <textarea name="description" rows="2" required>${appData.description || 'اضغط على الزر بأسفل الرسالة للتقديم.'}</textarea>

          <label>رابط الصورة (URL):</label>
          <input type="url" name="imageUrl" value="${appData.image_url || ''}">

          <label>السؤال الأول:</label>
          <input type="text" name="q1" value="${appData.q1 || 'هل رح تحط اشعار؟'}" required>

          <label>السؤال الثاني:</label>
          <input type="text" name="q2" value="${appData.q2 || 'هل رح تحط رابط السيرفر بالبايو؟'}" required>

          <label>السؤال الثالث:</label>
          <input type="text" name="q3" value="${appData.q3 || 'هل انت إداري بسيرفر ثاني؟'}" required>

          <label>السؤال الرابع:</label>
          <input type="text" name="q4" value="${appData.q4 || 'هل عندك شغل يشغلك؟'}" required>

          <label>السؤال الخامس (اختياري):</label>
          <input type="text" name="q5" value="${appData.q5 || ''}">

          <button type="submit">💾 حفظ الإعدادات ونشر البنر</button>
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
      q1 = EXCLUDED.q1,
      q2 = EXCLUDED.q2,
      q3 = EXCLUDED.q3,
      q4 = EXCLUDED.q4,
      q5 = EXCLUDED.q5;
  `, [d.title, d.description, d.imageUrl ? d.imageUrl.trim() : '', d.submitChannelId.trim(), d.reviewChannelId.trim(), d.resultsChannelId.trim(), d.highAdminRoleId.trim(), d.acceptedRoleId ? d.acceptedRoleId.trim() : '', d.q1, d.q2, d.q3, d.q4, d.q5]);

  try {
    const submitChannel = await client.channels.fetch(d.submitChannelId.trim());
    if (submitChannel) {
      const applyEmbed = new EmbedBuilder().setTitle(d.title).setDescription(d.description).setColor(0xeab308);
      if (d.imageUrl) applyEmbed.setImage(d.imageUrl.trim());

      const applyRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('start_apply_form').setLabel('تقديم إدارة 📝').setStyle(ButtonStyle.Primary)
      );

      const sentMsg = await submitChannel.send({ embeds: [applyEmbed], components: [applyRow] });
      await pool.query('UPDATE apply_setup SET last_message_id = $1 WHERE id = $2', [sentMsg.id, 'main_apply']);
    }
  } catch (err) {}

  res.send('<h2>✅ تم حفظ الإعدادات ونشر بنر التقديم!</h2><a href="/apply-setup">العودة</a>');
});

// ==========================================
// 5. إدارة الصلاحيات والبريفكس وأسماء الأوامر
// ==========================================
app.get('/admin-commands', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM permissions WHERE key = $1', ['main_permissions']);
  const perms = result.rows[0] || {};

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>الصلاحيات والبريفكس والأوامر</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin:0; padding:0; }
        nav { background: #1e293b; padding: 15px 30px; display: flex; justify-content: space-between; border-bottom: 1px solid #334155; }
        nav .links a { color: #38bdf8; text-decoration: none; font-weight: bold; margin-left: 20px; }
        .container { max-width: 900px; margin: 40px auto; background: #1e293b; padding: 30px; border-radius: 12px; border: 1px solid #334155; }
        h1, h2 { color: #38bdf8; }
        label { display: block; margin-top: 12px; font-weight: bold; color:#cbd5e1; }
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
          <a href="/admin-commands">الصلاحيات والبريفكس 🛡️</a>
          <a href="/stats">الإحصائيات 📊</a>
        </div>
        <a href="/logout" style="color:#ef4444; font-weight:bold; text-decoration:none;">تسجيل الخروج 🚪</a>
      </nav>
      <div class="container">
        <h1>🛡️ ضبط البريفكس وأسماء الأوامر والصلاحيات</h1>
        <form action="/save-admin-commands" method="POST">
          
          <label style="color:#eab308; font-size:18px;">⚡ بادئة الأوامر (Prefix):</label>
          <input type="text" name="prefix" value="${perms.prefix || '!'}" required style="font-size:18px; font-weight:bold;">

          <hr style="margin:25px 0; border-color:#334155;">
          <h2>🔄 تغيير أسماء الأوامر واختصاراتها:</h2>

          <div style="display:flex; gap:15px;">
            <div style="flex:1;">
              <label>اسم أمر المسح:</label>
              <input type="text" name="cmdClear" value="${perms.cmd_clear || 'مسح'}" required>
            </div>
            <div style="flex:1;">
              <label>آيدي الرتبة المسموح لها:</label>
              <input type="text" name="clearRoleId" value="${perms.clear_role_id || ''}" placeholder="اتركه فارغاً للصلاحيات الرسمية">
            </div>
          </div>

          <div style="display:flex; gap:15px;">
            <div style="flex:1;">
              <label>اسم أمر القفل:</label>
              <input type="text" name="cmdLock" value="${perms.cmd_lock || 'قفل'}" required>
            </div>
            <div style="flex:1;">
              <label>آيدي الرتبة المسموح لها:</label>
              <input type="text" name="lockRoleId" value="${perms.lock_role_id || ''}">
            </div>
          </div>

          <div style="display:flex; gap:15px;">
            <div style="flex:1;">
              <label>اسم أمر الفتح:</label>
              <input type="text" name="cmdUnlock" value="${perms.cmd_unlock || 'فتح'}" required>
            </div>
            <div style="flex:1;">
              <label>آيدي الرتبة المسموح لها:</label>
              <input type="text" name="unlockRoleId" value="${perms.unlock_role_id || ''}">
            </div>
          </div>

          <div style="display:flex; gap:15px;">
            <div style="flex:1;">
              <label>اسم أمر ضبط الاقتراحات:</label>
              <input type="text" name="cmdSuggest" value="${perms.cmd_suggest || 'اقتراحات'}" required>
            </div>
            <div style="flex:1;">
              <label>آيدي الرتبة المسموح لها:</label>
              <input type="text" name="suggestRoleId" value="${perms.suggest_role_id || ''}">
            </div>
          </div>

          <hr style="margin:25px 0; border-color:#334155;">
          <h2>⭐ رتب الأوامر الإدارية الأخرى ($):</h2>
          <label>آيدي رتبة الإدارة العامة (لكافة الأوامر):</label>
          <input type="text" name="allCommandsRoleId" value="${perms.all_commands_role_id || ''}">

          <div style="display:flex; gap:15px;">
            <div style="flex:1;">
              <label>آيدي رتبة أمر الضريبة ($tax):</label>
              <input type="text" name="taxRoleId" value="${perms.tax_role_id || ''}">
            </div>
            <div style="flex:1;">
              <label>آيدي رتبة أمر الاستدعاء ($come):</label>
              <input type="text" name="comeRoleId" value="${perms.come_role_id || ''}">
            </div>
            <div style="flex:1;">
              <label>آيدي رتبة أمر التحدث ($say):</label>
              <input type="text" name="sayRoleId" value="${perms.say_role_id || ''}">
            </div>
          </div>

          <button type="submit">حفظ وتحديث كل الخيارات 💾</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

app.post('/save-admin-commands', requireAuth, async (req, res) => {
  const d = req.body;
  await pool.query(`
    INSERT INTO permissions (
      key, prefix, all_commands_role_id, tax_role_id, come_role_id, say_role_id, 
      clear_role_id, lock_role_id, unlock_role_id, suggest_role_id,
      cmd_clear, cmd_lock, cmd_unlock, cmd_suggest
    )
    VALUES ('main_permissions', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT (key) DO UPDATE SET
      prefix = EXCLUDED.prefix,
      all_commands_role_id = EXCLUDED.all_commands_role_id,
      tax_role_id = EXCLUDED.tax_role_id,
      come_role_id = EXCLUDED.come_role_id,
      say_role_id = EXCLUDED.say_role_id,
      clear_role_id = EXCLUDED.clear_role_id,
      lock_role_id = EXCLUDED.lock_role_id,
      unlock_role_id = EXCLUDED.unlock_role_id,
      suggest_role_id = EXCLUDED.suggest_role_id,
      cmd_clear = EXCLUDED.cmd_clear,
      cmd_lock = EXCLUDED.cmd_lock,
      cmd_unlock = EXCLUDED.cmd_unlock,
      cmd_suggest = EXCLUDED.cmd_suggest;
  `, [
    d.prefix.trim(), d.allCommandsRoleId.trim(), d.taxRoleId.trim(), d.comeRoleId.trim(), d.sayRoleId.trim(),
    d.clearRoleId.trim(), d.lockRoleId.trim(), d.unlockRoleId.trim(), d.suggestRoleId.trim(),
    d.cmdClear.trim(), d.cmdLock.trim(), d.cmdUnlock.trim(), d.cmdSuggest.trim()
  ]);

  res.send('<h2>✅ تم حفظ التعديلات والبريفكس المحدث بنجاح!</h2><a href="/admin-commands">العودة</a>');
});

// الإحصائيات
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
        h1 { color: #38bdf8; }
      </style>
    </head>
    <body>
      <nav>
        <div class="links">
          <a href="/">الرئيسية 🏠</a>
          <a href="/panel">إدارة التذاكر ⚙️</a>
          <a href="/apply-setup">تقديم الإدارة 📝</a>
          <a href="/admin-commands">الصلاحيات والبريفكس 🛡️</a>
          <a href="/stats">الإحصائيات 📊</a>
        </div>
        <a href="/logout" style="color:#ef4444; font-weight:bold; text-decoration:none;">تسجيل الخروج 🚪</a>
      </nav>
      <div class="container">
        <h1>📊 إحصائيات النظام</h1>
        <h2>إجمالي التذاكر المفتوحة بالتاريخ: <span style="color:#10b981;">${totalTickets}</span></h2>
      </div>
    </body>
    </html>
  `);
});

app.listen(process.env.PORT || 3000, () => console.log('🌐 خادم لوحة التحكم يعمل بنجاح!'));

// ==========================================
// 6. أحداث ديسكورد ومعالجة الرسائل
// ==========================================

async function sendLogError(title, error) {
  console.error(title, error);
  if (ownerLogChannelId) {
    try {
      const channel = await client.channels.fetch(ownerLogChannelId);
      if (channel) {
        const errEmbed = new EmbedBuilder()
          .setTitle(`⚠️ تنبيه خطأ في البوت`)
          .addFields({ name: 'الوصف:', value: `${title}` }, { name: 'التفاصيل:', value: `\`\`\`js\n${error.message || error}\n\`\`\`` })
          .setColor(0xef4444);
        await channel.send({ embeds: [errEmbed] });
      }
    } catch (e) {}
  }
}

client.once('ready', async () => {
  console.log(`🤖 تم تسجيل الدخول بأسـم: ${client.user.tag}`);
});

async function getTicketInfo(channel) {
  if (!channel.topic) return null;
  try { return JSON.parse(channel.topic); } catch (e) { return null; }
}

async function hasCustomPermission(member, roleId, defaultPerm) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const result = await pool.query('SELECT * FROM permissions WHERE key = $1', ['main_permissions']);
  const perms = result.rows[0] || {};
  if (perms.all_commands_role_id && member.roles.cache.has(perms.all_commands_role_id)) return true;
  if (roleId && member.roles.cache.has(roleId)) return true;
  if (!roleId && defaultPerm && member.permissions.has(defaultPerm)) return true;
  return false;
}

// --------------------------------------------------
// حدث استقبال الرسائل والتحكم بالأوامر + الاقتراحات
// --------------------------------------------------
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  // جلب إعدادات الصلاحيات والبريفكس
  const permRes = await pool.query('SELECT * FROM permissions WHERE key = $1', ['main_permissions']);
  const perms = permRes.rows[0] || {};
  const currentPrefix = perms.prefix || '!';

  // 1. نظام الاقتراحات التلقائي
  const settingsRes = await pool.query('SELECT suggest_channel_id FROM settings WHERE key = $1', ['main_settings']);
  const suggestChannelId = settingsRes.rows[0] ? settingsRes.rows[0].suggest_channel_id : null;

  if (suggestChannelId && message.channel.id === suggestChannelId) {
    const suggestContent = message.content;
    const attachments = message.attachments;

    await message.delete().catch(() => {});

    const suggestEmbed = new EmbedBuilder()
      .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
      .setTitle('💡 اقتراح جديد:')
      .setDescription(suggestContent)
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
      .setColor(0x38bdf8)
      .setTimestamp();

    if (attachments.size > 0) {
      const image = attachments.first();
      suggestEmbed.setImage(image.url);
    }

    const suggestMsg = await message.channel.send({ embeds: [suggestEmbed] });
    await suggestMsg.react('👍');
    await suggestMsg.react('👎');
    return;
  }

  // 2. أوامر الإدارة ($)
  if (message.content.startsWith(ADMIN_PREFIX)) {
    const args = message.content.slice(ADMIN_PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'tax') {
      const allowed = await hasCustomPermission(message.member, perms.tax_role_id, PermissionFlagsBits.Administrator);
      if (!allowed) return message.reply('❌ لا تمتلك صلاحية أمر الضريبة!');

      const amount = parseInt(args[0]);
      if (isNaN(amount) || amount < 1) return message.reply('❌ يرجى كتابة مبلغ صحيح!');

      const netAmount = Math.floor(amount * 0.95);
      const grossAmount = Math.ceil(amount * (20 / 19));

      const taxEmbed = new EmbedBuilder()
        .setTitle('💰 حاسبة ضريبة ProBot')
        .addFields(
          { name: 'المبلغ الأصلي:', value: `\`${amount.toLocaleString()}\``, inline: true },
          { name: 'المبلغ الصافي:', value: `\`${netAmount.toLocaleString()}\``, inline: true },
          { name: 'المبلغ الواجب تحويله:', value: `\`${grossAmount.toLocaleString()}\``, inline: false }
        )
        .setColor(0x059669);

      return message.channel.send({ embeds: [taxEmbed] });
    }

    if (command === 'come') {
      const allowed = await hasCustomPermission(message.member, perms.come_role_id, PermissionFlagsBits.Administrator);
      if (!allowed) return message.reply('❌ لا تمتلك صلاحية الاستدعاء!');

      const targetMember = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null);
      if (!targetMember) return message.reply('❌ يرجى منشن الشخص!');

      try {
        const comeEmbed = new EmbedBuilder()
          .setTitle('🔔 لديك استدعاء في السيرفر!')
          .setDescription(`تم استدعاؤك بواسطة: **${message.author.tag}**\n\n📌 **الروم:** ${message.channel}\n🔗 [اضغط هنا للذهاب للروم](${message.url})`)
          .setColor(0xeab308);

        await targetMember.send({ embeds: [comeEmbed] });
        return message.reply(`✅ تم إرسال إشعار استدعاء بالخاص لـ ${targetMember}.`);
      } catch (err) {
        return message.reply('❌ تعذر إرسال رسالة بالخاص للشخص.');
      }
    }

    if (command === 'say') {
      const allowed = await hasCustomPermission(message.member, perms.say_role_id, PermissionFlagsBits.Administrator);
      if (!allowed) return message.reply('❌ لا تمتلك صلاحية التحدث!');

      const textToSay = args.join(' ');
      if (!textToSay) return message.reply('❌ يرجى كتابة الرسالة!');

      await message.delete().catch(() => {});
      return message.channel.send(textToSay);
    }
  }

  // 3. التحقق من البريفكس المخصص الديناميكي
  if (!message.content.startsWith(currentPrefix)) return;

  const args = message.content.slice(currentPrefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  const cmdClearName = (perms.cmd_clear || 'مسح').toLowerCase();
  const cmdLockName = (perms.cmd_lock || 'قفل').toLowerCase();
  const cmdUnlockName = (perms.cmd_unlock || 'فتح').toLowerCase();
  const cmdSuggestName = (perms.cmd_suggest || 'اقتراحات').toLowerCase();

  // أمر ضبط روم الاقتراحات
  if (command === cmdSuggestName) {
    const allowed = await hasCustomPermission(message.member, perms.suggest_role_id, PermissionFlagsBits.ManageChannels);
    if (!allowed) return message.reply('❌ لا تمتلك صلاحية ضبط روم الاقتراحات!');

    const targetChannel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]);
    if (!targetChannel) return message.reply(`❌ يرجى كتابة الروم بشكل صحيح: \`${currentPrefix}${perms.cmd_suggest || 'اقتراحات'} #الروم\``);

    await pool.query(`
      INSERT INTO settings (key, suggest_channel_id) VALUES ('main_settings', $1)
      ON CONFLICT (key) DO UPDATE SET suggest_channel_id = EXCLUDED.suggest_channel_id;
    `, [targetChannel.id]);

    return message.reply(`✅ تم تحديد ${targetChannel} كقناة رسمية لتلقي الاقتراحات وتحويلها تلقائياً!`);
  }

  // أمر مسح الرسائل (بحد أقصى 500)
  if (command === cmdClearName) {
    const allowed = await hasCustomPermission(message.member, perms.clear_role_id, PermissionFlagsBits.ManageMessages);
    if (!allowed) return message.reply('❌ لا تمتلك صلاحية استخدام أمر المسح!');

    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1 || amount > 500) {
      return message.reply('❌ يرجى تحديد عدد رسائل بين **1** و **500**!');
    }

    await message.delete().catch(() => {});

    let deletedTotal = 0;
    let remaining = amount;

    try {
      while (remaining > 0) {
        const deleteSize = remaining > 100 ? 100 : remaining;
        const deleted = await message.channel.bulkDelete(deleteSize, true);
        if (deleted.size === 0) break;
        deletedTotal += deleted.size;
        remaining -= deleteSize;
      }

      const confirmMsg = await message.channel.send(`✅ تم مسح **${deletedTotal}** رسالة بنجاح!`);
      setTimeout(() => confirmMsg.delete().catch(() => {}), 4000);
    } catch (err) {
      message.channel.send('⚠️ تم مسح بعض الرسائل، ولكن الرسائل الأقدم من 14 يوماً لا يمكن مسحها تلقائياً.');
    }
    return;
  }

  // أمر قفل الروم
  if (command === cmdLockName) {
    const allowed = await hasCustomPermission(message.member, perms.lock_role_id, PermissionFlagsBits.ManageChannels);
    if (!allowed) return message.reply('❌ لا تمتلك صلاحية قفل القناة!');

    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });

    const lockEmbed = new EmbedBuilder()
      .setTitle('🔒 تم قفل القناة')
      .setDescription(`تم قفل الكتابة عن الأعضاء العامة بواسطة: ${message.author}`)
      .setColor(0xef4444);

    return message.channel.send({ embeds: [lockEmbed] });
  }

  // أمر فتح الروم
  if (command === cmdUnlockName) {
    const allowed = await hasCustomPermission(message.member, perms.unlock_role_id, PermissionFlagsBits.ManageChannels);
    if (!allowed) return message.reply('❌ لا تمتلك صلاحية فتح القناة!');

    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });

    const unlockEmbed = new EmbedBuilder()
      .setTitle('🔓 تم فتح القناة')
      .setDescription(`تم فتح القناة بواسطة: ${message.author}`)
      .setColor(0x10b981);

    return message.channel.send({ embeds: [unlockEmbed] });
  }

  // أجهزة وأوامر التذاكر الداخليّة
  const ticketData = await getTicketInfo(message.channel);
  if (!ticketData) return;

  const panelRes = await pool.query('SELECT * FROM panels WHERE panel_id = $1', [ticketData.panelId]);
  const config = panelRes.rows[0];
  if (!config) return;

  const isAdmin = message.member.roles.cache.has(config.admin_role_id);
  const isHighAdmin = message.member.roles.cache.has(config.high_admin_role_id);
  const isOwner = message.author.id === ticketData.ownerId;

  if (command === 'close') {
    const closeAllowed = perms.close_permission === 'admin_only' ? (isAdmin || isHighAdmin) : (isAdmin || isHighAdmin || isOwner);
    if (!closeAllowed) return message.reply('❌ لا تمتلك صلاحية إغلاق التذكرة!');

    await message.channel.permissionOverwrites.edit(ticketData.ownerId, { ViewChannel: false });

    const closedEmbed = new EmbedBuilder().setTitle('🔒 تم إغلاق التذكرة').setColor(0xef4444);
    const closedRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_reopen').setLabel('إعادة فتح').setEmoji('🔓').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ticket_save_log').setLabel('حفظ الترانسكريبت').setEmoji('📜').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket_delete').setLabel('حذف التكت').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
    );

    return message.channel.send({ embeds: [closedEmbed], components: [closedRow] });
  }
});

// --------------------------------------------------
// 7. معالجة أحداث النماذج وأزرار التقديم والتذاكر
// --------------------------------------------------
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isButton() && interaction.customId === 'start_apply_form') {
      const result = await pool.query('SELECT * FROM apply_setup WHERE id = $1', ['main_apply']);
      const appData = result.rows[0];
      if (!appData) return interaction.reply({ content: '❌ لم يتم إعداد التقديم بعد!', ephemeral: true });

      const modal = new ModalBuilder().setCustomId('submit_apply_modal').setTitle('نموذج التقديم للإدارة');

      const inputs = [];
      if (appData.q1) inputs.push(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q1').setLabel(appData.q1.substring(0, 45)).setStyle(TextInputStyle.Short).setRequired(true)));
      if (appData.q2) inputs.push(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q2').setLabel(appData.q2.substring(0, 45)).setStyle(TextInputStyle.Short).setRequired(true)));
      if (appData.q3) inputs.push(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q3').setLabel(appData.q3.substring(0, 45)).setStyle(TextInputStyle.Short).setRequired(true)));
      if (appData.q4) inputs.push(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q4').setLabel(appData.q4.substring(0, 45)).setStyle(TextInputStyle.Short).setRequired(true)));
      if (appData.q5) inputs.push(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q5').setLabel(appData.q5.substring(0, 45)).setStyle(TextInputStyle.Short).setRequired(false)));

      modal.addComponents(inputs);
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'submit_apply_modal') {
      await interaction.deferReply({ ephemeral: true });

      const result = await pool.query('SELECT * FROM apply_setup WHERE id = $1', ['main_apply']);
      const appData = result.rows[0];

      const reviewChannel = await interaction.guild.channels.fetch(appData.review_channel_id).catch(() => null);
      if (!reviewChannel) return interaction.editReply({ content: '❌ تعذر الوصول لروم مراجعة التقديمات!' });

      let descText = `👤 **صاحب التقديم:** ${interaction.user} (\`${interaction.user.id}\`)\n\n`;

      if (appData.q1) descText += `**السؤال الأول : ${appData.q1}**\n\`\`\`${interaction.fields.getTextInputValue('q1')}\`\`\`\n`;
      if (appData.q2) descText += `**السؤال الثاني : ${appData.q2}**\n\`\`\`${interaction.fields.getTextInputValue('q2')}\`\`\`\n`;
      if (appData.q3) descText += `**السؤال الثالث : ${appData.q3}**\n\`\`\`${interaction.fields.getTextInputValue('q3')}\`\`\`\n`;
      if (appData.q4) descText += `**السؤال الرابع : ${appData.q4}**\n\`\`\`${interaction.fields.getTextInputValue('q4')}\`\`\`\n`;
      if (appData.q5 && appData.q5.trim() !== '') descText += `**السؤال الخامس : ${appData.q5}**\n\`\`\`${interaction.fields.getTextInputValue('q5')}\`\`\`\n`;

      const reviewEmbed = new EmbedBuilder()
        .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
        .setDescription(descText)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .setColor(0xeab308)
        .setTimestamp();

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`apply_accept_${interaction.user.id}`).setLabel('قبول').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId(`apply_reject_${interaction.user.id}`).setLabel('رفض').setStyle(ButtonStyle.Danger).setEmoji('❌')
      );

      await reviewChannel.send({ embeds: [reviewEmbed], components: [actionRow] });
      return interaction.editReply({ content: '✅ تم إرسال تقديمك بنجاح!' });
    }

    if (interaction.isButton() && (interaction.customId.startsWith('apply_accept_') || interaction.customId.startsWith('apply_reject_'))) {
      const result = await pool.query('SELECT * FROM apply_setup WHERE id = $1', ['main_apply']);
      const appData = result.rows[0];

      if (!interaction.member.roles.cache.has(appData.high_admin_role_id) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ مخصص للإدارة العليا فقط!', ephemeral: true });
      }

      const isAccept = interaction.customId.startsWith('apply_accept_');
      const targetUserId = interaction.customId.split('_').pop();

      await interaction.deferUpdate();

      const resultsChannel = await interaction.guild.channels.fetch(appData.results_channel_id).catch(() => null);
      const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);

      if (isAccept && targetMember && appData.accepted_role_id) {
        await targetMember.roles.add(appData.accepted_role_id).catch(() => {});
      }

      const resultEmbed = new EmbedBuilder()
        .setThumbnail(targetMember ? targetMember.user.displayAvatarURL() : interaction.guild.iconURL())
        .setTitle(isAccept ? `تم قبول تقديم ${interaction.guild.name}` : `تم رفض تقديم ${interaction.guild.name}`)
        .addFields(
          { name: 'صاحب التقديم :', value: targetMember ? `${targetMember}` : `<@${targetUserId}>`, inline: false },
          { name: 'الإداري :', value: `${interaction.user}`, inline: false }
        )
        .setColor(isAccept ? 0x10b981 : 0xef4444)
        .setTimestamp();

      if (resultsChannel) await resultsChannel.send({ embeds: [resultEmbed] });

      const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
      disabledRow.components.forEach(c => c.setDisabled(true));
      await interaction.message.edit({ components: [disabledRow] });
    }

  } catch (err) {
    sendLogError('خطأ غير متوقع:', err);
  }
});

client.login(process.env.DISCORD_TOKEN);
