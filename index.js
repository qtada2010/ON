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

    await pool.query(`
      ALTER TABLE panels ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'buttons';
      ALTER TABLE panels ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) DEFAULT 'embed';
      ALTER TABLE panels ADD COLUMN IF NOT EXISTS image_url TEXT;
      ALTER TABLE panels ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT '#0284c7';
      ALTER TABLE panels ADD COLUMN IF NOT EXISTS last_message_id VARCHAR(100);
    `);

    // 2. جدول الخيارات/الأزرار للوحات (محدث ليشمل رتبة خاصة وكاتيجوري خاص لكل خيار)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS panel_options (
        id SERIAL PRIMARY KEY,
        panel_id VARCHAR(100) REFERENCES panels(panel_id) ON DELETE CASCADE,
        option_id VARCHAR(100),
        label TEXT,
        description TEXT,
        emoji TEXT,
        welcome_message TEXT,
        button_style VARCHAR(20) DEFAULT 'Primary',
        custom_admin_role_id VARCHAR(100),
        custom_category_id VARCHAR(100)
      );
    `);

    await pool.query(`
      ALTER TABLE panel_options ADD COLUMN IF NOT EXISTS button_style VARCHAR(20) DEFAULT 'Primary';
      ALTER TABLE panel_options ADD COLUMN IF NOT EXISTS custom_admin_role_id VARCHAR(100);
      ALTER TABLE panel_options ADD COLUMN IF NOT EXISTS custom_category_id VARCHAR(100);
    `);

    // 3. جدول صلاحيات الأوامر والأزرار
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

    console.log('🐘 تم تحديث الجداول ودعم الرتب والكاتيجوري المخصص للأزرار بنجاح!');
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
        <h2>🔒 لوحة التحكم الشاملة (التذاكر المتقدمة)</h2>
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
          <a href="/admin-commands">صلاحيات الأوامر 🛡️</a>
          <a href="/stats">الإحصائيات 📊</a>
        </div>
        <a href="/logout" style="color:#ef4444; font-weight:bold; text-decoration:none;">تسجيل الخروج 🚪</a>
      </nav>
      <div class="container">
        <h1>🎮 لوحة التحكم الإدارية المطلقة</h1>
        <p style="text-align:center; color:#94a3b8;">التحكم بكافة أقسام التذاكر مع رتب وكاتيجوري مخصص لكل زر أو خيار على حدة.</p>
        <div style="text-align:center; margin-top: 30px;">
          <a href="/panel" class="btn">🛠️ إدارة لوحات التذاكر</a>
          <a href="/apply-setup" class="btn" style="background:#eab308; color:#000;">📝 إعداد نظام تقديم الإدارة</a>
          <a href="/admin-commands" class="btn" style="background:#8b5cf6;">🛡️ ضبط صلاحيات الأوامر والأزرار</a>
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
            الخيارات: <strong>${optionsCount}</strong> | روم اللوحة: ${p.channel_id}
          </p>
        </div>
        <div>
          <a href="/edit-panel/${p.panel_id}" style="background:#0284c7; color:white; padding:8px 15px; border-radius:5px; text-decoration:none; font-weight:bold; margin-left:5px;">✏️ تعديل الخيارات</a>
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
        <h1>➕ إنشاء / تعديل لوحة تذاكر رئيسية</h1>
        <form action="/create-panel" method="POST">
          <label>معرف اللوحة الفريد (Panel ID بدون مسافات):</label>
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
              <label>لون الإيمبد (Hex Color):</label>
              <input type="color" name="color" value="#0284c7" style="height:40px;">
            </div>
            <div style="flex:2;">
              <label>رابط الصورة المرفقة (اختياري URL):</label>
              <input type="url" name="imageUrl" placeholder="https://i.imgur.com/example.png">
            </div>
          </div>

          <div style="display:flex; gap:15px;">
            <div style="flex:1;">
              <label>آيدي روم اللوحة (مكان ظهور الأزرار):</label>
              <input type="text" name="channelId" required>
            </div>
            <div style="flex:1;">
              <label>آيدي الكاتيجوري الافتراضي:</label>
              <input type="text" name="categoryId" required>
            </div>
          </div>

          <div style="display:flex; gap:15px;">
            <div style="flex:1;">
              <label>آيدي رتبة الإدارة العامة:</label>
              <input type="text" name="adminRoleId" required>
            </div>
            <div style="flex:1;">
              <label>آيدي رتبة الإدارة العليا:</label>
              <input type="text" name="highAdminRoleId" required>
            </div>
          </div>

          <label>آيدي روم السجل (Log Channel):</label>
          <input type="text" name="logChannelId" required>

          <label>عنوان اللوحة:</label>
          <input type="text" name="title" value="تكت الدعم الفني والوساطة 🤝" required>

          <label>وصف اللوحة:</label>
          <textarea name="description" rows="2" required>اختر القسم المناسب لفتح تذكرة مباشرة.</textarea>

          <button type="submit">حفظ اللوحة والانتقال لإضافة الأزرار والأقسام ➡️</button>
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

// صفحة تعديل اللوحة وإضافة الأزرار/الخيارات مع الرتب والكاتيجوري المخصص
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
        <p style="margin:5px 0; color:#38bdf8; font-size:13px;">
          🛡️ رتبة الإدارة الخاصة: <strong>${opt.custom_admin_role_id || 'تستخدم رتبة اللوحة العامة'}</strong><br>
          📁 آيدي الكاتيجوري المخصص: <strong>${opt.custom_category_id || 'يستخدم الكاتيجوري العام للوحة'}</strong>
        </p>
        <p style="margin:5px 0; color:#cbd5e1; font-size:13px;">رسالة الترحيب: ${opt.welcome_message}</p>
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
        <h1>⚙️ تخصيص الأزرار والأقسام للوحة: ${panel.title}</h1>

        <h2>➕ إضافة زر / خيار جديد (مع تحديد رتبة وكاتيجوري خاصين بهذا القسم):</h2>
        <form action="/add-option" method="POST" style="background:#0f172a; padding:20px; border-radius:8px; border:1px solid #334155;">
          <input type="hidden" name="panelId" value="${panel.panel_id}">

          <div style="display:flex; gap:15px;">
            <div style="flex:2;">
              <label>اسم الزر / الخيار (Label):</label>
              <input type="text" name="label" placeholder="مثال: قسم الوساطة المالية" required>
            </div>
            <div style="flex:1;">
              <label>لون الزر:</label>
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
              <label>الوصف (يظهر تحت الخيار بالقائمة المنسدلة):</label>
              <input type="text" name="description" placeholder="وساطة آمنة ومضمونة">
            </div>
            <div style="flex:1;">
              <label>الإيموجي (اختياري):</label>
              <input type="text" name="emoji" placeholder="🤝">
            </div>
          </div>

          <div style="display:flex; gap:15px; margin-top:10px;">
            <div style="flex:1;">
              <label style="color:#38bdf8;">🛡️ آيدي رتبة الإدارة الخاصة بهذا القسم:</label>
              <input type="text" name="customAdminRoleId" placeholder="اتركه فارغاً لاستخدام رتبة اللوحة العامة">
            </div>
            <div style="flex:1;">
              <label style="color:#38bdf8;">📁 آيدي الكاتيجوري الخاص بهذا القسم:</label>
              <input type="text" name="customCategoryId" placeholder="اتركه فارغاً لاستخدام كاتيجوري اللوحة العامة">
            </div>
          </div>

          <label>رسالة الترحيب التي تظهر فور فتح هذا التكت:</label>
          <textarea name="welcomeMessage" rows="2" required>أهلاً بك في قسم الوساطة! انتظر رد إداريين الوساطة فقط.</textarea>

          <button type="submit" class="btn-add">➕ إضافة الزر/الخيار مع الصلاحيات المخصصة</button>
        </form>

        <hr style="margin: 30px 0; border-color: #334155;">
        <h2>📋 الخيارات والأزرار الحالية (${optionsRes.rows.length}):</h2>
        ${optionsHTML || '<p>لا توجد خيارات مضافة بعد.</p>'}

        ${optionsRes.rows.length > 0 ? `
          <div style="display:flex; justify-content:space-between; margin-top:20px;">
            <form action="/publish-panel" method="POST" style="width:48%;">
              <input type="hidden" name="panelId" value="${panel.panel_id}">
              <input type="hidden" name="mode" value="update">
              <button type="submit" class="btn-update">🔄 تحديث اللوحة القديمة بالديسكورد</button>
            </form>

            <form action="/publish-panel" method="POST" style="width:48%;">
              <input type="hidden" name="panelId" value="${panel.panel_id}">
              <input type="hidden" name="mode" value="new">
              <button type="submit" class="btn-send">🚀 إرسال لوحة جديدة بروم الديسكورد</button>
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
    INSERT INTO panel_options (panel_id, option_id, label, description, emoji, welcome_message, button_style, custom_admin_role_id, custom_category_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [
    d.panelId, 
    optionId, 
    d.label.trim(), 
    d.description ? d.description.trim() : '', 
    d.emoji ? d.emoji.trim() : '', 
    d.welcomeMessage, 
    d.buttonStyle,
    d.customAdminRoleId ? d.customAdminRoleId.trim() : null,
    d.customCategoryId ? d.customCategoryId.trim() : null
  ]);

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
    return res.send('❌ يجب إضافة خيار واحد على الأقل قبل النشر!');
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
      } catch (e) {}
    }

    if (!sentMessage) {
      sentMessage = await channel.send(messagePayload);
      await pool.query('UPDATE panels SET last_message_id = $1 WHERE panel_id = $2', [sentMessage.id, panel.panel_id]);
    }

    res.send('<h2>✅ تم نشر/تحديث اللوحة بنجاح بالديسكورد!</h2><a href="/panel">العودة</a>');
  } catch (err) {
    res.send(`❌ حدث خطأ: ${err.message}`);
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
        button { margin-top: 20px; padding: 12px; background: #eab308; color: #000; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; font-size: 15px; }
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
        <h1>📝 إعداد نظام التقديم للإدارة</h1>
        <form action="/save-apply-setup" method="POST">
          <label>عنوان بنر التقديم:</label>
          <input type="text" name="title" value="${appData.title || 'تقديم على الإدارة 🎖️'}" required>

          <label>وصف البنر:</label>
          <textarea name="description" rows="3" required>${appData.description || 'اضغط على الزر بالأسفل لفتح نموذج التقديم.'}</textarea>

          <label>رابط صورة البنر (اختياري URL):</label>
          <input type="url" name="imageUrl" value="${appData.image_url || ''}">

          <div style="display:flex; gap:15px;">
            <div style="flex:1;">
              <label>آيدي روم إرسال البنر:</label>
              <input type="text" name="submitChannelId" value="${appData.submit_channel_id || ''}" required>
            </div>
            <div style="flex:1;">
              <label>آيدي روم مراجعة التقديمات:</label>
              <input type="text" name="reviewChannelId" value="${appData.review_channel_id || ''}" required>
            </div>
          </div>

          <div style="display:flex; gap:15px;">
            <div style="flex:1;">
              <label>آيدي روم نتائج القبول:</label>
              <input type="text" name="resultsChannelId" value="${appData.results_channel_id || ''}" required>
            </div>
            <div style="flex:1;">
              <label>آيدي رتبة الإدارة العليا (المسؤولة عن القبول):</label>
              <input type="text" name="highAdminRoleId" value="${appData.high_admin_role_id || ''}" required>
            </div>
          </div>

          <label>آيدي الرتبة التي تُعطى للعضو تلقائياً عند القبول:</label>
          <input type="text" name="acceptedRoleId" value="${appData.accepted_role_id || ''}" required>

          <hr style="margin:25px 0; border-color:#334155;">
          <h2>❓ أسئلة نموذج التقديم:</h2>
          <label>السؤال الاول:</label>
          <input type="text" name="q1" value="${appData.q1 || 'اسمك وعمرك؟'}" required>
          <label>السؤال الثاني:</label>
          <input type="text" name="q2" value="${appData.q2 || 'لماذا تريد الانضمام للإدارة؟'}" required>
          <label>السؤال الثالث:</label>
          <input type="text" name="q3" value="${appData.q3 || 'كم عدد ساعات تفاعلك اليومي؟'}" required>
          <label>السؤال الرابع:</label>
          <input type="text" name="q4" value="${appData.q4 || 'هل لديك خبرة سابقة؟'}" required>
          <label>السؤال الخامس (اختياري):</label>
          <input type="text" name="q5" value="${appData.q5 || ''}">

          <button type="submit" style="background:#10b981; color:#fff;">💾 حفظ الإعدادات ونشر بنر التقديم</button>
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
  `, [d.title, d.description, d.imageUrl ? d.imageUrl.trim() : null, d.submitChannelId.trim(), d.reviewChannelId.trim(), d.resultsChannelId.trim(), d.highAdminRoleId.trim(), d.acceptedRoleId.trim(), d.q1, d.q2, d.q3, d.q4, d.q5]);

  try {
    const channel = await client.channels.fetch(d.submitChannelId.trim());
    if (channel) {
      const embed = new EmbedBuilder().setTitle(d.title).setDescription(d.description).setColor(0xeab308);
      if (d.imageUrl) embed.setImage(d.imageUrl.trim());
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('start_apply_form').setLabel('تقديم على الإدارة').setStyle(ButtonStyle.Success).setEmoji('📝')
      );
      const sentMsg = await channel.send({ embeds: [embed], components: [row] });
      await pool.query('UPDATE apply_setup SET last_message_id = $1 WHERE id = $2', [sentMsg.id, 'main_apply']);
    }
  } catch (e) {}

  res.send('<h2>✅ تم حفظ ونشر بنر التقديم بنجاح!</h2><a href="/apply-setup">العودة</a>');
});

// ==========================================
// صلاحيات الأوامر
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
        <h1>🛡️ ضبط صلاحيات أزرار وأوامر البوت</h1>
        <form action="/save-admin-commands" method="POST">
          <h2>📌 صلاحيات التكت الافتراضية:</h2>
          <div style="display:flex; gap:15px;">
            <div style="flex:1;">
              <label>زر إغلاق التكت (Close):</label>
              <select name="closePermission">
                <option value="both" ${perms.close_permission === 'both' ? 'selected' : ''}>صاحب التكت والإدارة</option>
                <option value="admin_only" ${perms.close_permission === 'admin_only' ? 'selected' : ''}>الإدارة فقط</option>
              </select>
            </div>
            <div style="flex:1;">
              <label>زر حذف التكت (Delete):</label>
              <select name="deletePermission">
                <option value="high_admin" ${perms.delete_permission === 'high_admin' ? 'selected' : ''}>الإدارة العليا فقط</option>
                <option value="all_admin" ${perms.delete_permission === 'all_admin' ? 'selected' : ''}>جميع الإدارة</option>
              </select>
            </div>
          </div>

          <label>زر حفظ الترانسكريبت (Transcript):</label>
          <select name="savePermission">
            <option value="both" ${perms.save_permission === 'both' ? 'selected' : ''}>صاحب التكت والإدارة</option>
            <option value="admin_only" ${perms.save_permission === 'admin_only' ? 'selected' : ''}>الإدارة فقط</option>
          </select>

          <hr style="margin:25px 0; border-color:#334155;">
          <h2>📌 رتب أوامر البوت المساعدة:</h2>
          <label>رتبة استخدام كافة الأوامر:</label>
          <input type="text" name="allCommandsRoleId" value="${perms.all_commands_role_id || ''}">
          <label>رتبة حاسبة الضريبة (!tax):</label>
          <input type="text" name="taxRoleId" value="${perms.tax_role_id || ''}">
          <label>رتبة أمر الاستدعاء (!come):</label>
          <input type="text" name="comeRoleId" value="${perms.come_role_id || ''}">
          <label>رتبة أمر التحدث (!say):</label>
          <input type="text" name="sayRoleId" value="${perms.say_role_id || ''}">

          <button type="submit">💾 حفظ الصلاحيات</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

app.post('/save-admin-commands', requireAuth, async (req, res) => {
  const { allCommandsRoleId, taxRoleId, comeRoleId, sayRoleId, closePermission, deletePermission, savePermission } = req.body;
  await pool.query(`
    INSERT INTO permissions (key, all_commands_role_id, tax_role_id, come_role_id, say_role_id, close_permission, delete_permission, save_permission)
    VALUES ('main_permissions', $1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (key) DO UPDATE SET
      all_commands_role_id = EXCLUDED.all_commands_role_id,
      tax_role_id = EXCLUDED.tax_role_id,
      come_role_id = EXCLUDED.come_role_id,
      say_role_id = EXCLUDED.say_role_id,
      close_permission = EXCLUDED.close_permission,
      delete_permission = EXCLUDED.delete_permission,
      save_permission = EXCLUDED.save_permission;
  `, [allCommandsRoleId.trim(), taxRoleId.trim(), comeRoleId.trim(), sayRoleId.trim(), closePermission, deletePermission, savePermission]);

  res.send('<h2>✅ تم حفظ الصلاحيات بنجاح!</h2><a href="/admin-commands">العودة</a>');
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
        <h1>📊 إحصائيات التذاكر</h1>
        <h2>إجمالي التذاكر المفتوحة منذ البداية: <span style="color:#10b981;">${totalTickets} تذكرة</span></h2>
      </div>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 خادم الويب يعمل بنجاح على البورت: ${PORT}`);
});

// ==========================================
// 5. ربط أحداث ديسكورد (Discord Events)
// ==========================================
client.once('ready', async () => {
  console.log(`🤖 Bot is online as ${client.user.tag}!`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const commands = [new SlashCommandBuilder().setName('help').toJSON()];

  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ تم تسجيل أوامر السلاش (/) بنجاح!');
  } catch (e) {}
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
      .addFields(
        { name: 'التكت:', value: channel.name, inline: true },
        { name: 'صاحب التكت:', value: `<@${ticketData.ownerId}>`, inline: true },
        { name: 'بواسطة:', value: `${user}`, inline: true }
      )
      .setColor(0x0284c7)
      .setTimestamp();

    await logChannel.send({ embeds: [logEmbed], files: [attachment] });
    return true;
  } catch (err) {
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

// دالة فتح التذكرة مع سحب الرتبة والكاتيجوري المخصص (إن وجد)
async function handleTicketCreation(interaction, optionId) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const optRes = await pool.query('SELECT * FROM panel_options WHERE option_id = $1', [optionId]);
    const option = optRes.rows[0];
    if (!option) return interaction.editReply({ content: '❌ هذا الخيار غير موجود.' });

    const panelRes = await pool.query('SELECT * FROM panels WHERE panel_id = $1', [option.panel_id]);
    const config = panelRes.rows[0];
    if (!config) return;

    // تحديد الرتبة الخاصة أو استخدام الرتبة العامة
    const targetAdminRoleId = option.custom_admin_role_id || config.admin_role_id;
    // تحديد الكاتيجوري الخاص أو استخدام الكاتيجوري العام
    const targetCategoryId = option.custom_category_id || config.category_id;

    const ticketChannel = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.username}`,
      type: ChannelType.GuildText,
      parent: targetCategoryId,
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: targetAdminRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: config.high_admin_role_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
      ]
    });

    await pool.query(`
      INSERT INTO stats (key, total_tickets) VALUES ('main_stats', 1)
      ON CONFLICT (key) DO UPDATE SET total_tickets = stats.total_tickets + 1;
    `);

    await ticketChannel.setTopic(JSON.stringify({ ownerId: interaction.user.id, panelId: config.panel_id, optionId: option.option_id }));

    const welcomeEmbed = new EmbedBuilder()
      .setTitle(`تذكرة قسم: ${option.label}`)
      .setDescription(`${option.welcome_message}\n\n👤 **صاحب التذكرة:** ${interaction.user}`)
      .setColor(config.color || 0x0284c7);

    const buttonsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_close_req').setLabel('إغلاق التذكرة').setEmoji('🔒').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket_save_log').setLabel('حفظ الترانسكريبت').setEmoji('📜').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticket_delete').setLabel('حذف التكت').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
    );

    await ticketChannel.send({
      content: `${interaction.user} | <@&${targetAdminRoleId}> | <@&${config.high_admin_role_id}>`,
      embeds: [welcomeEmbed],
      components: [buttonsRow]
    });

    return interaction.editReply({ content: `✅ تم فتح التذكرة بنجاح: ${ticketChannel}` });
  } catch (err) {
    console.error(err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: '❌ حدث خطأ أثناء إنشاء التذكرة.' });
    }
  }
}

// معالجة الرسائل والأوامر
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  if (message.content.startsWith(ADMIN_PREFIX)) {
    const args = message.content.slice(ADMIN_PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const permRes = await pool.query('SELECT * FROM permissions WHERE key = $1', ['main_permissions']);
    const perms = permRes.rows[0] || {};

    if (command === 'tax') {
      const allowed = await hasAdminCommandPermission(message.member, perms.tax_role_id);
      if (!allowed && perms.tax_role_id) return message.reply('❌ لا تمتلك صلاحية أمر الضريبة!');
      const amount = parseAmount(args[0]);
      if (!amount) return message.reply('❌ يرجى كتابة المبلغ بشكل صحيح! (مثال: `$tax 1000`)');
      const tax = Math.floor(amount * 20 / 19 + 1);
      return message.reply(`🧮 المبلغ مع الضريبة: \`${tax}\``);
    }
  }

  if (!message.content.startsWith(PREFIX)) return;
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  const ticketData = await getTicketInfo(message.channel);
  if (!ticketData) return;

  const panelRes = await pool.query('SELECT * FROM panels WHERE panel_id = $1', [ticketData.panelId]);
  const config = panelRes.rows[0];
  if (!config) return;

  // جلب خيار التذكرة لتحديد رتبته الخاصة إن وجدت
  const optRes = await pool.query('SELECT * FROM panel_options WHERE option_id = $1', [ticketData.optionId]);
  const option = optRes.rows[0] || {};
  const currentAdminRole = option.custom_admin_role_id || config.admin_role_id;

  const permRes = await pool.query('SELECT * FROM permissions WHERE key = $1', ['main_permissions']);
  const perms = permRes.rows[0] || {};

  const isAdmin = message.member.roles.cache.has(currentAdminRole);
  const isHighAdmin = message.member.roles.cache.has(config.high_admin_role_id);
  const isOwner = message.author.id === ticketData.ownerId;

  if (command === 'close') {
    const closeAllowed = perms.close_permission === 'admin_only' ? (isAdmin || isHighAdmin) : (isAdmin || isHighAdmin || isOwner);
    if (!closeAllowed) return message.reply('❌ لا تمتلك صلاحية إغلاق التذكرة!');

    await message.channel.permissionOverwrites.edit(ticketData.ownerId, { ViewChannel: false });
    const closedEmbed = new EmbedBuilder().setTitle('🔒 تم إغلاق التذكرة').setColor(0xef4444);
    const closedRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_reopen').setLabel('إعادة فتح').setStyle(ButtonStyle.Success).setEmoji('🔓'),
      new ButtonBuilder().setCustomId('ticket_save_log').setLabel('حفظ الترانسكريبت').setStyle(ButtonStyle.Secondary).setEmoji('📜'),
      new ButtonBuilder().setCustomId('ticket_delete').setLabel('حذف').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
    );
    await message.channel.send({ embeds: [closedEmbed], components: [closedRow] });
    return;
  }

  if (command === 'add') {
    if (!isAdmin && !isHighAdmin) return message.reply('❌ مخصص لإدارة القسم فقط!');
    const targetMember = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null);
    if (!targetMember) return message.reply('❌ يرجى منشن الشخص!');
    await message.channel.permissionOverwrites.edit(targetMember.id, { ViewChannel: true, SendMessages: true });
    return message.reply(`✅ تم إضافة ${targetMember}.`);
  }

  if (command === 'remove') {
    if (!isAdmin && !isHighAdmin) return message.reply('❌ مخصص لإدارة القسم فقط!');
    const targetMember = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null);
    if (!targetMember) return message.reply('❌ يرجى منشن الشخص!');
    await message.channel.permissionOverwrites.edit(targetMember.id, { ViewChannel: false, SendMessages: false });
    return message.reply(`🚫 تم إزالة ${targetMember}.`);
  }
});

// معالجة التفاعلات والأزرار
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'help') {
        return interaction.reply({ content: 'البوت يعمل بنجاح!', ephemeral: true });
      }
    }

    if (interaction.isButton() && interaction.customId === 'start_apply_form') {
      const result = await pool.query('SELECT * FROM apply_setup WHERE id = $1', ['main_apply']);
      const appData = result.rows[0];
      if (!appData) return interaction.reply({ content: '❌ نظام التقديم غير مفعل.', ephemeral: true });

      const modal = new ModalBuilder().setCustomId('submit_apply_modal').setTitle('نموذج التقديم للإدارة');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q1').setLabel(appData.q1.substring(0, 45)).setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q2').setLabel(appData.q2.substring(0, 45)).setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q3').setLabel(appData.q3.substring(0, 45)).setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q4').setLabel(appData.q4.substring(0, 45)).setStyle(TextInputStyle.Short).setRequired(true))
      );
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'submit_apply_modal') {
      await interaction.deferReply({ ephemeral: true });
      const result = await pool.query('SELECT * FROM apply_setup WHERE id = $1', ['main_apply']);
      const appData = result.rows[0];
      const reviewChannel = await interaction.guild.channels.fetch(appData.review_channel_id).catch(() => null);
      if (!reviewChannel) return interaction.editReply({ content: '❌ روم المراجعة غير موجود.' });

      let descText = `👤 **مقدم الطلب:** ${interaction.user}\n\n`;
      descText += `**1. ${appData.q1}**\n\`\`\`${interaction.fields.getTextInputValue('q1')}\`\`\`\n`;
      descText += `**2. ${appData.q2}**\n\`\`\`${interaction.fields.getTextInputValue('q2')}\`\`\`\n`;

      const reviewEmbed = new EmbedBuilder().setDescription(descText).setColor(0xeab308);
      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`apply_accept_${interaction.user.id}`).setLabel('قبول').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`apply_reject_${interaction.user.id}`).setLabel('رفض').setStyle(ButtonStyle.Danger)
      );

      await reviewChannel.send({ embeds: [reviewEmbed], components: [actionRow] });
      return interaction.editReply({ content: '✅ تم إرسال تقديمك بنجاح.' });
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

      const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
      if (isAccept && targetMember && appData.accepted_role_id) {
        await targetMember.roles.add(appData.accepted_role_id).catch(() => {});
      }

      const resultsChannel = await interaction.guild.channels.fetch(appData.results_channel_id).catch(() => null);
      if (resultsChannel) {
        const resEmbed = new EmbedBuilder()
          .setTitle(isAccept ? '🎉 تم قبول التقديم بنجاح' : '❌ تم رفض التقديم')
          .setDescription(`العضو: <@${targetUserId}>\nالإداري: ${interaction.user}`)
          .setColor(isAccept ? 0x10b981 : 0xef4444);
        await resultsChannel.send({ embeds: [resEmbed] });
        if (targetMember) await targetMember.send({ embeds: [resEmbed] }).catch(() => {});
      }

      const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
      disabledRow.components.forEach(c => c.setDisabled(true));
      return interaction.message.edit({ components: [disabledRow] });
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('ticket_select_')) {
      return handleTicketCreation(interaction, interaction.values[0]);
    }

    if (interaction.isButton() && interaction.customId.startsWith('ticket_btn_')) {
      return handleTicketCreation(interaction, interaction.customId.replace('ticket_btn_', ''));
    }

    if (!interaction.guild || !interaction.channel.topic) return;

    const ticketData = await getTicketInfo(interaction.channel);
    if (!ticketData) return;

    const panelRes = await pool.query('SELECT * FROM panels WHERE panel_id = $1', [ticketData.panelId]);
    const config = panelRes.rows[0];
    if (!config) return;

    const optRes = await pool.query('SELECT * FROM panel_options WHERE option_id = $1', [ticketData.optionId]);
    const option = optRes.rows[0] || {};
    const currentAdminRole = option.custom_admin_role_id || config.admin_role_id;

    const permRes = await pool.query('SELECT * FROM permissions WHERE key = $1', ['main_permissions']);
    const perms = permRes.rows[0] || {};

    const isAdmin = interaction.member.roles.cache.has(currentAdminRole);
    const isHighAdmin = interaction.member.roles.cache.has(config.high_admin_role_id);
    const isOwner = interaction.user.id === ticketData.ownerId;

    if (interaction.isButton() && interaction.customId === 'ticket_close_req') {
      const closeAllowed = perms.close_permission === 'admin_only' ? (isAdmin || isHighAdmin) : (isAdmin || isHighAdmin || isOwner);
      if (!closeAllowed) return interaction.reply({ content: '❌ لا تمتلك صلاحية الإغلاق!', ephemeral: true });

      await interaction.channel.permissionOverwrites.edit(ticketData.ownerId, { ViewChannel: false });
      const closedEmbed = new EmbedBuilder().setTitle('🔒 تم إغلاق التذكرة').setColor(0xef4444);
      const closedRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_reopen').setLabel('إعادة فتح').setStyle(ButtonStyle.Success).setEmoji('🔓'),
        new ButtonBuilder().setCustomId('ticket_save_log').setLabel('حفظ الترانسكريبت').setStyle(ButtonStyle.Secondary).setEmoji('📜'),
        new ButtonBuilder().setCustomId('ticket_delete').setLabel('حذف').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
      );
      await interaction.reply({ embeds: [closedEmbed], components: [closedRow] });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'ticket_reopen') {
      if (!isAdmin && !isHighAdmin) return interaction.reply({ content: '❌ مخصص لإدارة القسم فقط!', ephemeral: true });
      await interaction.channel.permissionOverwrites.edit(ticketData.ownerId, { ViewChannel: true, SendMessages: true });
      return interaction.reply({ content: `🔓 تم إعادة فتح التذكرة بواسطة ${interaction.user}` });
    }

    if (interaction.isButton() && interaction.customId === 'ticket_save_log') {
      const saveAllowed = perms.save_permission === 'admin_only' ? (isAdmin || isHighAdmin) : (isAdmin || isHighAdmin || isOwner);
      if (!saveAllowed) return interaction.reply({ content: '❌ لا تمتلك صلاحية الحفظ!', ephemeral: true });
      await interaction.deferReply();
      const success = await saveTranscript(interaction.channel, config, interaction.user, ticketData);
      return interaction.editReply({ content: success ? '✅ تم حفظ الترانسكريبت بنجاح.' : '❌ تعذر الحفظ.' });
    }

    if (interaction.isButton() && interaction.customId === 'ticket_delete') {
      const deleteAllowed = perms.delete_permission === 'all_admin' ? (isAdmin || isHighAdmin) : isHighAdmin;
      if (!deleteAllowed) return interaction.reply({ content: '❌ لا تمتلك صلاحية الحذف!', ephemeral: true });
      await interaction.reply({ content: '🗑️ جاري حذف التذكرة...' });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
    }

  } catch (err) {
    console.error(err);
  }
});

function parseAmount(input) {
  if (!input) return null;
  const str = input.toLowerCase().trim();
  const match = str.match(/^(\d+(?:\.\d+)?)\s*([kmb])?$/);
  if (!match) return null;
  let num = parseFloat(match[1]);
  const unit = match[2];
  if (unit === 'k') num *= 1_000;
  if (unit === 'm') num *= 1_000_000;
  if (unit === 'b') num *= 1_000_000_000;
  return Math.floor(num);
}

client.login(process.env.DISCORD_TOKEN);
