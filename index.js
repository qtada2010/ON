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

    // 5. جدول نظام تقديم الإدارة (تحديث إضافة رتبة القبول)
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

    console.log('🐘 تم تحديث الجداول وإضافة خيار رتبة القبول بنجاح!');
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

('/login', (req, res) => {
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
        <h2>🔒 لوحة التحكم الشاملة (125K+)</h2>
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

('/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'auth_pass=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  res.redirect('/login');
});

// الصفحة الرئيسية
('/', requireAuth, (req, res) => {
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
        <h1>🎮 لوحة التحكم الإدارية المطلقة (السيرفرات الضخمة)</h1>
        <p style="text-align:center; color:#94a3b8;">تحكم شامل بكافة خيارات التذاكر، إعداد التقديمات للإدارة وإعطاء الرتب تلقائياً.</p>
        <div style="text-align:center; margin-top: 30px;">
          <a href="/panel" class="btn">🛠️ إدارة لوحات التذاكر</a>
          <a href="/apply-setup" class="btn" style="background:#eab308; color:#000;">📝 إعداد نظام تقديم الإدارة</a>
          <a href="/admin-commands" class="btn" style="background:#8b5cf6;">🛡️ ضبط صلاحيات الأوامر للأزرار</a>
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
('/panel', requireAuth, async (req, res) => {
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
            الشكل: <strong>${p.message_type === 'plain' ? 'رسالة عادية' : 'إيمبد'}</strong> | 
            الخيارات: <strong>${optionsCount}</strong> | الروم: ${p.channel_id}
          </p>
        </div>
        <div>
          <a href="/edit-panel/${p.panel_id}" style="background:#0284c7; color:white; padding:8px 15px; border-radius:5px; text-decoration:none; font-weight:bold; margin-left:5px;">✏️ تعديل</a>
          <a href="/delete-panel/${p.panel_id}" onclick="return confirm('هل أنت متأكد من حذف هذه اللوحة بالكام؟')" style="background:#ef4444; color:white; padding:8px 15px; border-radius:5px; text-decoration:none; font-weight:bold;">🗑️ حذف</a>
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
        <h1>➕ إنشاء / إضافة لوحة جديدة</h1>
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
              <label>لون الإيموجي/الإيمبد (Hex Color):</label>
              <input type="color" name="color" value="#0284c7" style="height:40px;">
            </div>
            <div style="flex:2;">
              <label>رابط الصورة المرفقة مع اللوحة (اختياري URL):</label>
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

          <label>آيدي روم اللوق (سجل التذاكر والترانسكريبت):</label>
          <input type="text" name="logChannelId" required>

          <label>عنوان اللوحة:</label>
          <input type="text" name="title" value="تكت الدعم الفني والوساطة 🤝" required>

          <label>وصف اللوحة:</label>
          <textarea name="description" rows="2" required>اختر القسم المناسب من الأسفل لفتح تذكرة مباشرة مع طاقم الإدارة.</textarea>

          <button type="submit">حفظ اللوحة والانتقال لإضافة الأزرار/الخيارات ➡️</button>
        </form>

        <hr style="margin: 30px 0; border-color: #334155;">
        <h2>📋 اللوحات المسجلة بداخل النظام:</h2>
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
  if (!panel) return res.send('❌ اللوحة غير موجودة');

  const optionsRes = await pool.query('SELECT * FROM panel_options WHERE panel_id = $1 ORDER BY id ASC', [panel.panel_id]);
  let optionsHTML = '';

  optionsRes.rows.forEach((opt, index) => {
    optionsHTML += `
      <div style="background:#0f172a; padding:20px; border-radius:8px; margin-bottom:20px; border:1px solid #334155;">
        <form action="/update-option-secure/${opt.id}" method="POST">
          <input type="hidden" name="panelId" value="${panel.panel_id}">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span style="color:#eab308; font-weight:bold;">⚙️ تعديل الزر / الخيار #${index + 1}</span>
            <a href="/delete-option-secure/${opt.id}/${panel.panel_id}" onclick="return confirm('هل أنت متأكد من حذف هذا الزر؟')" style="color:#ef4444; font-weight:bold; text-decoration:none;">🗑️ حذف الزر</a>
          </div>

          <div style="display:flex; gap:15px;">
            <div style="flex:2;">
              <label style="font-size:13px; color:#94a3b8;">اسم الزر (Label):</label>
              <input type="text" name="label" value="${opt.label || ''}" required style="width:100%; padding:8px; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:4px;">
            </div>
            <div style="flex:1;">
              <label style="font-size:13px; color:#94a3b8;">لون الزر:</label>
              <select name="buttonStyle" style="width:100%; padding:8px; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:4px;">
                <option value="Primary" ${opt.button_style === 'Primary' ? 'selected' : ''}>أزرق (Primary)</option>
                <option value="Secondary" ${opt.button_style === 'Secondary' ? 'selected' : ''}>رمادي (Secondary)</option>
                <option value="Success" ${opt.button_style === 'Success' ? 'selected' : ''}>أخضر (Success)</option>
                <option value="Danger" ${opt.button_style === 'Danger' ? 'selected' : ''}>أحمر (Danger)</option>
              </select>
            </div>
          </div>

          <div style="display:flex; gap:15px; margin-top:10px;">
            <div style="flex:2;">
              <label style="font-size:13px; color:#94a3b8;">الوصف الفرعي:</label>
              <input type="text" name="description" value="${opt.description || ''}" style="width:100%; padding:8px; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:4px;">
            </div>
            <div style="flex:1;">
              <label style="font-size:13px; color:#94a3b8;">الإيموجي:</label>
              <input type="text" name="emoji" value="${opt.emoji || ''}" style="width:100%; padding:8px; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:4px;">
            </div>
          </div>

          <label style="font-size:13px; color:#94a3b8; margin-top:10px;">رسالة الترحيب الخاصة بداخل التكت:</label>
          <textarea name="welcomeMessage" rows="2" style="width:100%; padding:8px; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:4px;" required>${opt.welcome_message || ''}</textarea>

          <button type="submit" style="background:#3b82f6; color:white; padding:8px 15px; border:none; border-radius:5px; margin-top:10px; font-weight:bold; cursor:pointer;">💾 حفظ التعديلات على هذا الزر</button>
        </form>
      </div>
    `;
  });

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head><meta charset="UTF-8"><title>تعديل اللوحة الشامل ${panel.panel_id}</title></head>
    <body style="font-family:sans-serif; background:#0f172a; color:#f8fafc; margin:0; padding:30px;">
      <div style="max-width:900px; margin:auto; background:#1e293b; padding:30px; border-radius:12px; border:1px solid #334155;">
        <a href="/panel" style="color:#38bdf8; text-decoration:none;">⬅ العودة لإدارة اللوحات</a>
        <h1 style="color:#38bdf8;">⚙️ التعديل الشامل للبانل: ${panel.title}</h1>

        <form action="/update-panel-main-secure" method="POST" style="background:#0f172a; padding:20px; border-radius:8px; border:1px solid #334155; margin-bottom:25px;">
          <input type="hidden" name="panelId" value="${panel.panel_id}">
          <h3 style="color:#38bdf8; margin-top:0;">📌 محتوى البانل الأساسي:</h3>
          
          <div style="display:flex; gap:15px; margin-bottom:15px;">
            <div style="flex:3;">
              <label style="color:#cbd5e1; font-weight:bold;">عنوان اللوحة:</label>
              <input type="text" name="title" value="${panel.title || ''}" required style="width:100%; padding:8px; margin-top:5px; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:4px;">
            </div>
            <div style="flex:1;">
              <label style="color:#cbd5e1; font-weight:bold;">لون الإيمبد:</label>
              <input type="color" name="color" value="${panel.color || '#0284c7'}" style="width:100%; height:38px; margin-top:5px; background:#1e293b; border:1px solid #334155; border-radius:4px; cursor:pointer;">
            </div>
          </div>

          <label style="color:#cbd5e1; font-weight:bold;">وصف اللوحة:</label>
          <textarea name="description" rows="4" required style="width:100%; padding:8px; margin:5px 0 15px 0; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:4px;">${panel.description || ''}</textarea>

          <label style="color:#cbd5e1; font-weight:bold;">رابط الصورة (Image/Banner URL):</label>
          <input type="url" name="imageUrl" value="${panel.image_url || ''}" placeholder="https://example.com/image.png" style="width:100%; padding:8px; margin:5px 0 15px 0; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:4px;">

          <button type="submit" style="background:#8b5cf6; color:white; padding:10px; border:none; border-radius:6px; font-weight:bold; width:100%; cursor:pointer;">💾 حفظ التعديلات الأساسية للبانل</button>
        </form>

        <hr style="border-color:#334155; margin:25px 0;">
        <h2 style="color:#38bdf8;">📋 الأزرار الحالية:</h2>
        ${optionsHTML || '<p>لا توجد أزرار مضافة بعد.</p>'}
      </div>
    </body>
    </html>
  `);
});

// دوال الحفظ والتحديث في قاعدة البيانات
app.post('/update-panel-main-secure', requireAuth, async (req, res) => {
  const { panelId, title, description, color, imageUrl } = req.body;
  await pool.query(`
    UPDATE panels 
    SET title = $1, description = $2, color = $3, image_url = $4 
    WHERE panel_id = $5
  `, [title, description, color, imageUrl ? imageUrl.trim() : null, panelId]);
  res.redirect(`/edit-panel/${panelId}`);
});

app.post('/update-option-secure/:id', requireAuth, async (req, res) => {
  const { panelId, label, description, emoji, welcomeMessage, buttonStyle } = req.body;
  await pool.query(`
    UPDATE panel_options 
    SET label = $1, description = $2, emoji = $3, welcome_message = $4, button_style = $5 
    WHERE id = $6
  `, [label.trim(), description || '', emoji || '', welcomeMessage, buttonStyle, req.params.id]);
  res.redirect(`/edit-panel/${panelId}`);
});

app.get('/delete-option-secure/:id/:panelId', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM panel_options WHERE id = $1', [req.params.id]);
  res.redirect(`/edit-panel/${req.params.panelId}`);
});






  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head><meta charset="UTF-8"><title>تعديل اللوحة الشامل ${panel.panel_id}</title></head>
    <body style="font-family:sans-serif; background:#0f172a; color:#f8fafc; margin:0; padding:30px;">
      <div style="max-width:900px; margin:auto; background:#1e293b; padding:30px; border-radius:12px; border:1px solid #334155;">
        <a href="/panel" style="color:#38bdf8; text-decoration:none;">⬅ العودة لإدارة اللوحات</a>
        <h1 style="color:#38bdf8;">⚙️ التعديل الشامل للبانل: ${panel.title}</h1>

        <form action="/update-panel-main-secure" method="POST" style="background:#0f172a; padding:20px; border-radius:8px; border:1px solid #334155; margin-bottom:25px;">
          <input type="hidden" name="panelId" value="${panel.panel_id}">
          <h3 style="color:#38bdf8; margin-top:0;">📌 محتوى البانل الأساسي (اللون، الصورة، النص):</h3>
          
          <div style="display:flex; gap:15px; margin-bottom:15px;">
            <div style="flex:3;">
              <label style="color:#cbd5e1; font-weight:bold;">عنوان اللوحة:</label>
              <input type="text" name="title" value="${panel.title || ''}" required style="width:100%; padding:8px; margin-top:5px; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:4px;">
            </div>
            <div style="flex:1;">
              <label style="color:#cbd5e1; font-weight:bold;">لون الإيمبد:</label>
              <input type="color" name="color" value="${panel.color || '#0284c7'}" style="width:100%; height:38px; margin-top:5px; background:#1e293b; border:1px solid #334155; border-radius:4px; cursor:pointer;">
            </div>
          </div>

          <label style="color:#cbd5e1; font-weight:bold;">وصف اللوحة (محتوى الرسالة):</label>
          <textarea name="description" rows="4" required style="width:100%; padding:8px; margin:5px 0 15px 0; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:4px;">${panel.description || ''}</textarea>

          <label style="color:#cbd5e1; font-weight:bold;">رابط الصورة (Image/Banner URL - يظهر بجانب البانل):</label>
          <input type="url" name="imageUrl" value="${panel.image_url || ''}" placeholder="https://example.com/image.png" style="width:100%; padding:8px; margin:5px 0 15px 0; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:4px;">

          <button type="submit" style="background:#8b5cf6; color:white; padding:10px; border:none; border-radius:6px; font-weight:bold; width:100%; cursor:pointer;">💾 حفظ التعديلات الأساسية للبانل</button>
        </form>

        <hr style="border-color:#334155; margin:25px 0;">
        <h2 style="color:#38bdf8;">📋 الأزرار الحالية:</h2>
        ${optionsHTML || '<p>لا توجد أزرار مضافة بعد.</p>'}
      </div>
    </body>
    </html>
  `);
});

// دوال معالجة وحفظ البيانات في قاعدة البيانات (تضاف أسفل الكود السابق مباشرة في index.js)
app.post('/update-panel-main-secure', requireAuth, async (req, res) => {
  const { panelId, title, description, color, imageUrl } = req.body;
  await pool.query(`
    UPDATE panels 
    SET title = $1, description = $2, color = $3, image_url = $4 
    WHERE panel_id = $5
  `, [title, description, color, imageUrl ? imageUrl.trim() : null, panelId]);
  res.redirect(`/edit-panel/${panelId}`);
});

app.post('/update-option-secure/:id', requireAuth, async (req, res) => {
  const { panelId, label, description, emoji, welcomeMessage, buttonStyle } = req.body;
  await pool.query(`
    UPDATE panel_options 
    SET label = $1, description = $2, emoji = $3, welcome_message = $4, button_style = $5 
    WHERE id = $6
  `, [label.trim(), description || '', emoji || '', welcomeMessage, buttonStyle, req.params.id]);
  res.redirect(`/edit-panel/${panelId}`);
});

app.get('/delete-option-secure/:id/:panelId', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM panel_options WHERE id = $1', [req.params.id]);
  res.redirect(`/edit-panel/${req.params.panelId}`);
});
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head><meta charset="UTF-8"><title>تعديل اللوحة الشامل ${panel.panel_id}</title></head>
    <body style="font-family:sans-serif; background:#0f172a; color:#f8fafc; margin:0; padding:30px;">
      <div style="max-width:900px; margin:auto; background:#1e293b; padding:30px; border-radius:12px; border:1px solid #334155;">
        <a href="/panel" style="color:#38bdf8; text-decoration:none;">⬅ العودة لإدارة اللوحات</a>
        <h1 style="color:#38bdf8;">⚙️ التعديل الشامل للبانل: ${panel.title}</h1>

        <form action="/update-panel-main-secure" method="POST" style="background:#0f172a; padding:20px; border-radius:8px; border:1px solid #334155; margin-bottom:25px;">
          <input type="hidden" name="panelId" value="${panel.panel_id}">
          <h3 style="color:#38bdf8; margin-top:0;">📌 محتوى البانل الأساسي (اللون، الصورة، النص):</h3>
          
          <div style="display:flex; gap:15px; margin-bottom:15px;">
            <div style="flex:3;">
              <label style="color:#cbd5e1; font-weight:bold;">عنوان اللوحة:</label>
              <input type="text" name="title" value="${panel.title || ''}" required style="width:100%; padding:8px; margin-top:5px; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:4px;">
            </div>
            <div style="flex:1;">
              <label style="color:#cbd5e1; font-weight:bold;">لون الإيمبد:</label>
              <input type="color" name="color" value="${panel.color || '#0284c7'}" style="width:100%; height:38px; margin-top:5px; background:#1e293b; border:1px solid #334155; border-radius:4px; cursor:pointer;">
            </div>
          </div>

          <label style="color:#cbd5e1; font-weight:bold;">وصف اللوحة (محتوى الرسالة):</label>
          <textarea name="description" rows="4" required style="width:100%; padding:8px; margin:5px 0 15px 0; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:4px;">${panel.description || ''}</textarea>

          <label style="color:#cbd5e1; font-weight:bold;">رابط الصورة (Image/Banner URL - يظهر بجانب البانل):</label>
          <input type="url" name="imageUrl" value="${panel.image_url || ''}" placeholder="https://example.com/image.png" style="width:100%; padding:8px; margin:5px 0 15px 0; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:4px;">

          <button type="submit" style="background:#8b5cf6; color:white; padding:10px; border:none; border-radius:6px; font-weight:bold; width:100%; cursor:pointer;">💾 حفظ التعديلات الأساسية للبانل</button>
        </form>

        <hr style="border-color:#334155; margin:25px 0;">
        <h2 style="color:#38bdf8;">📋 الأزرار الحالية:</h2>
        ${optionsHTML || '<p>لا توجد أزرار مضافة بعد.</p>'}
      </div>
    </body>
    </html>
  `);
});

// دوال معالجة وحفظ البيانات في قاعدة البيانات (تضاف أسفل الكود السابق مباشرة في index.js)
app.post('/update-panel-main-secure', requireAuth, async (req, res) => {
  const { panelId, title, description, color, imageUrl } = req.body;
  await pool.query(`
    UPDATE panels 
    SET title = $1, description = $2, color = $3, image_url = $4 
    WHERE panel_id = $5
  `, [title, description, color, imageUrl ? imageUrl.trim() : null, panelId]);
  res.redirect(`/edit-panel/${panelId}`);
});

app.post('/update-option-secure/:id', requireAuth, async (req, res) => {
  const { panelId, label, description, emoji, welcomeMessage, buttonStyle } = req.body;
  await pool.query(`
    UPDATE panel_options 
    SET label = $1, description = $2, emoji = $3, welcome_message = $4, button_style = $5 
    WHERE id = $6
  `, [label.trim(), description || '', emoji || '', welcomeMessage, buttonStyle, req.params.id]);
  res.redirect(`/edit-panel/${panelId}`);
});

app.get('/delete-option-secure/:id/:panelId', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM panel_options WHERE id = $1', [req.params.id]);
  res.redirect(`/edit-panel/${req.params.panelId}`);
});
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head><meta charset="UTF-8"><title>تعديل اللوحة ${panel.panel_id}</title></head>
    <body style="font-family:sans-serif; background:#0f172a; color:#f8fafc; margin:0; padding:30px;">
      <div style="max-width:900px; margin:auto; background:#1e293b; padding:30px; border-radius:12px; border:1px solid #334155;">
        <a href="/panel" style="color:#38bdf8; text-decoration:none;">⬅ العودة لإدارة اللوحات</a>
        <h1 style="color:#38bdf8;">⚙️ تعديل اللوحة والأزرار: ${panel.title}</h1>

        <form action="/update-panel-main-secure" method="POST" style="background:#0f172a; padding:20px; border-radius:8px; border:1px solid #334155; margin-bottom:25px;">
          <input type="hidden" name="panelId" value="${panel.panel_id}">
          <h3 style="color:#38bdf8; margin-top:0;">📌 محتوى اللوحة الرئيسي:</h3>
          
          <label style="color:#cbd5e1; font-weight:bold;">عنوان اللوحة:</label>
          <input type="text" name="title" value="${panel.title || ''}" required style="width:100%; padding:8px; margin:5px 0 15px 0; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:4px;">

          <label style="color:#cbd5e1; font-weight:bold;">وصف اللوحة:</label>
          <textarea name="description" rows="3" required style="width:100%; padding:8px; margin:5px 0 15px 0; background:#1e293b; color:#fff; border:1px solid #334155; border-radius:4px;">${panel.description || ''}</textarea>

          <button type="submit" style="background:#8b5cf6; color:white; padding:10px; border:none; border-radius:6px; font-weight:bold; width:100%; cursor:pointer;">💾 حفظ محتوى البانل الرئيسي</button>
        </form>

        <hr style="border-color:#334155; margin:25px 0;">
        <h2 style="color:#38bdf8;">📋 الأزرار الحالية:</h2>
        ${optionsHTML || '<p>لا توجد أزرار مضافة بعد.</p>'}
      </div>
    </body>
    </html>
  `);
});

// دوال حفظ التعديلات في قاعدة البيانات (تضاف أسفل هذا الكود مباشرة)
app.post('/update-panel-main-secure', requireAuth, async (req, res) => {
  const { panelId, title, description } = req.body;
  await pool.query('UPDATE panels SET title = $1, description = $2 WHERE panel_id = $3', [title, description, panelId]);
  res.redirect(`/edit-panel/${panelId}`);
});

app.post('/update-option-secure/:id', requireAuth, async (req, res) => {
  const { panelId, label, description, emoji, welcomeMessage, buttonStyle } = req.body;
  await pool.query(`
    UPDATE panel_options 
    SET label = $1, description = $2, emoji = $3, welcome_message = $4, button_style = $5 
    WHERE id = $6
  `, [label.trim(), description || '', emoji || '', welcomeMessage, buttonStyle, req.params.id]);
  res.redirect(`/edit-panel/${panelId}`);
});

app.get('/delete-option-secure/:id/:panelId', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM panel_options WHERE id = $1', [req.params.id]);
  res.redirect(`/edit-panel/${req.params.panelId}`);
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

    res.send('<h2>✅ تم نشر/تحديث اللوحة بنجاح بداخل السيرفر!</h2><a href="/panel">العودة للوحة التحكم</a>');
  } catch (err) {
    console.error('خطأ أثناء نشر اللوحة:', err);
    res.send(`❌ حدث خطأ أثناء الإرسال: ${err.message}`);
  }
});

// ==========================================
// 4. نظام تقديم الإدارة (إعداد الرتب التلقائية)
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
        <h1>📝 التحكم بصفحة ولوحة تقديم الإدارة</h1>
        <form action="/save-apply-setup" method="POST">

          <h2>⚙️ إعدادات الرومات والصلاحيات والرتب:</h2>
          <div style="display:flex; gap:15px;">
            <div style="flex:1;">
              <label>روم إرسال بنر التقديم (للأعضاء):</label>
              <input type="text" name="submitChannelId" value="${appData.submit_channel_id || ''}" required>
            </div>
            <div style="flex:1;">
              <label>روم وصول الطلبات (للإدارة):</label>
              <input type="text" name="reviewChannelId" value="${appData.review_channel_id || ''}" required>
            </div>
          </div>

          <div style="display:flex; gap:15px;">
            <div style="flex:1;">
              <label>روم إرسال النتائج (قبول/رفض):</label>
              <input type="text" name="resultsChannelId" value="${appData.results_channel_id || ''}" required>
            </div>
            <div style="flex:1;">
              <label>آيدي رتبة الإدارة العليا (صلاحية القبول/الرفض):</label>
              <input type="text" name="highAdminRoleId" value="${appData.high_admin_role_id || ''}" required>
            </div>
          </div>

          <label style="color:#10b981;">🎖️ آيدي الرتبة التي يحصل عليها المتقدم تلقائياً عند القبول (اختياري):</label>
          <input type="text" name="acceptedRoleId" value="${appData.accepted_role_id || ''}" placeholder="آيدي رتبة الإدارة الجدد">

          <hr style="margin: 25px 0; border-color: #334155;">
          <h2>🖼️ رسالة التقديم (التي تظهر بفروم التقديم):</h2>
          <label>عنوان رسالة التقديم:</label>
          <input type="text" name="title" value="${appData.title || 'تقديم الإدارة الرسمية 👑'}" required>

          <label>الوصف:</label>
          <textarea name="description" rows="2" required>${appData.description || 'اضغط على الزر بأسفل الرسالة للبدء بتعبئة نموذج التقديم للإدارة.'}</textarea>

          <label>رابط الصورة المرفقة (URL):</label>
          <input type="url" name="imageUrl" value="${appData.image_url || ''}">

          <hr style="margin: 25px 0; border-color: #334155;">
          <h2>❓ أسئلة التقديم (الأسئلة التي تظهر للعضو):</h2>
          <label>السؤال الأول:</label>
          <input type="text" name="q1" value="${appData.q1 || 'هل رح تحط اشعار؟'}" required>

          <label>السؤال الثاني:</label>
          <input type="text" name="q2" value="${appData.q2 || 'هل رح تحط رابط سيرفر بوصف حقك؟'}" required>

          <label>السؤال الثالث:</label>
          <input type="text" name="q3" value="${appData.q3 || 'هل انت إداري بسيرفر ثاني؟'}" required>

          <label>السؤال الرابع:</label>
          <input type="text" name="q4" value="${appData.q4 || 'هل عندك شغل يشغلك عن السيرفر؟'}" required>

          <label>السؤال الخامس (اختياري):</label>
          <input type="text" name="q5" value="${appData.q5 || ''}">

          <button type="submit" style="background:#10b981; color:#fff;">💾 حفظ الإعدادات ونشر بنر التقديم بالديسكورد</button>
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
      const applyEmbed = new EmbedBuilder()
        .setTitle(d.title)
        .setDescription(d.description)
        .setColor(0xeab308);

      if (d.imageUrl && d.imageUrl.trim() !== '') {
        applyEmbed.setImage(d.imageUrl.trim());
      }

      const applyRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('start_apply_form')
          .setLabel('تقديم إدارة 📝')
          .setStyle(ButtonStyle.Primary)
      );

      const sentMsg = await submitChannel.send({ embeds: [applyEmbed], components: [applyRow] });
      await pool.query('UPDATE apply_setup SET last_message_id = $1 WHERE id = $2', [sentMsg.id, 'main_apply']);
    }
  } catch (err) {
    console.error('خطأ أثناء نشر لوحة التقديم:', err);
  }

  res.send('<h2>✅ تم حفظ الإعدادات ونشر بنر التقديم بالديسكورد بنجاح!</h2><a href="/apply-setup">العودة</a>');
});

// إدارة الصلاحيات المتقدمة
app.get('/admin-commands', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM permissions WHERE key = $1', ['main_permissions']);
  const perms = result.rows[0] || {};

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>إدارة الصلاحيات</title>
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
        <h1>🛡️ ضبط صلاحيات أزرار التحكم بالأوامر</h1>
        <form action="/save-admin-commands" method="POST">
          
          <h2>📌 صلاحيات أزرار التكت:</h2>
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
                <option value="all_admin" ${perms.delete_permission === 'all_admin' ? 'selected' : ''}>جميع طاقم الإدارة</option>
              </select>
            </div>
            <div style="flex:1;">
              <label>زر حفظ الترانسكريبت (Save):</label>
              <select name="savePermission">
                <option value="both" ${perms.save_permission === 'both' ? 'selected' : ''}>صاحب التكت والإدارة</option>
                <option value="admin_only" ${perms.save_permission === 'admin_only' ? 'selected' : ''}>الإدارة فقط</option>
              </select>
            </div>
          </div>

          <hr style="margin:25px 0; border-color:#334155;">
          <h2>⭐ صلاحيات الأوامر الإدارية ($):</h2>

          <label>آيدي رتبة الإدارة العامة:</label>
          <input type="text" name="allCommandsRoleId" value="${perms.all_commands_role_id || ''}">

          <label>آيدي الرتبة المسموح لها بأمر $tax:</label>
          <input type="text" name="taxRoleId" value="${perms.tax_role_id || ''}">

          <label>آيدي الرتبة المسموح لها بأمر $come:</label>
          <input type="text" name="comeRoleId" value="${perms.come_role_id || ''}">

          <label>آيدي الرتبة المسموح لها بأمر $say:</label>
          <input type="text" name="sayRoleId" value="${perms.say_role_id || ''}">

          <button type="submit">حفظ وتحديث كافة الصلاحيات 💾</button>
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

  res.send('<h2>✅ تم حفظ الصلاحيات المحدثة بنجاح!</h2><a href="/admin-commands">العودة</a>');
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
        <h1>📊 إحصائيات التذاكر للسيرفر (125K)</h1>
        <h2>إجمالي التذاكر المفتوحة بالتاريخ: <span style="color:#10b981;">${totalTickets}</span></h2>
      </div>
    </body>
    </html>
  `);
});

app.listen(process.env.PORT || 3000, () => console.log('🌐 خادم لوحة التحكم يعمل بنجاح!'));

// ==========================================
// 5. معالجة أحداث ديسكورد والإنشاء والتفاعل
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
    } catch (e) {}
  }
}

client.once('ready', async () => {
  console.log(`🤖 تم تسجيل الدخول بأسـم: ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder().setName('help').setDescription('عرض قائمة جميع الأوامر وشرحها مع رابط اللوحة'),
    new SlashCommandBuilder().setName('tax').setDescription('حساب ضريبة برو بوت').addIntegerOption(o => o.setName('amount').setDescription('المبلغ').setRequired(true)),
    new SlashCommandBuilder().setName('come').setDescription('استدعاء عضو للروم عبر الخاص').addUserOption(o => o.setName('user').setDescription('العضو المراد استدعاؤه').setRequired(true)),
    new SlashCommandBuilder().setName('say').setDescription('إرسال رسالة باسم البوت').addStringOption(o => o.setName('message').setDescription('الرسالة').setRequired(true)),
    new SlashCommandBuilder().setName('close').setDescription('إغلاق التذكرة الحالية'),
    new SlashCommandBuilder().setName('delete').setDescription('حذف التذكرة الحالية'),
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
    sendLogError('خطأ أثناء تسجيل الأوامر:', e);
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
      .setDescription('تحميل الملف المرفق أدناه وفتحه بداخل المتصفح يمنحك التكت الكامل بأسلوب الديسكورد الرسمي.')
      .addFields(
        { name: 'التكت:', value: channel.name, inline: true },
        { name: 'صاحب التكت:', value: `<@${ticketData.ownerId}>`, inline: true },
        { name: 'تم الحفظ بواسطة:', value: `${user}`, inline: true }
      )
      .setColor(0x0284c7)
      .setTimestamp();

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
    .setDescription(`أهلاً بك! يمكنك استخدام الأوامر بالبريفكس أو أوامر السلاش (/).\n\n🌐 **لوحة تحكم البوت:** [اضغط هنا للوصول للوحة التحكم](${dashboardUrl})`)
    .addFields(
      { 
        name: '⚙️ الأوامر الإدارية العامة:', 
        value: 
          `• **\`$tax <المبلغ>\` | \`/tax\`**\n` +
          `• **\`$come <@العضو>\` | \`/come\`**\n` +
          `• **\`$say <الرسالة>\` | \`/say\`**\n`
      },
      { 
        name: '🎫 أوامر إدارة التذاكر:', 
        value: 
          `• **\`!close\` | \`/close\`**\n` +
          `• **\`!save\` | \`/save\`**\n` +
          `• **\`!delete\` | \`/delete\`**\n` +
          `• **\`!add <@العضو>\` | \`/add\`**\n` +
          `• **\`!remove <@العضو>\` | \`/remove\`**\n`
      }
    )
    .setColor(0x0284c7)
    .setFooter({ text: 'تمت البرمجة بواسطة المبرمج: قتادة (Qtada)' });
}

// دالة فتح التذكرة
async function handleTicketCreation(interaction, optionId) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const optRes = await pool.query('SELECT * FROM panel_options WHERE option_id = $1', [optionId]);
    const option = optRes.rows[0];
    if (!option) return interaction.editReply({ content: '❌ هذا الخيار غير مسجل في قاعدة البيانات!' });

    const panelRes = await pool.query('SELECT * FROM panels WHERE panel_id = $1', [option.panel_id]);
    const config = panelRes.rows[0];

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
      .setTitle(`تذكرة دعم جديدة | ${option.label}`)
      .setDescription(`${option.welcome_message}\n\n👤 **صاحب التذكرة:** ${interaction.user}`)
      .setColor(config.color || 0x0284c7);

    const buttonsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_close_req').setLabel('إغلاق التذكرة').setEmoji('🔒').setStyle(ButtonStyle.Danger)
    );

    await ticketChannel.send({ 
      content: `${interaction.user} | <@&${config.admin_role_id}> | <@&${config.high_admin_role_id}>`, 
      embeds: [welcomeEmbed], 
      components: [buttonsRow] 
    });

    return interaction.editReply({ content: `✅ تم إنشاء التذكرة بنجاح: ${ticketChannel}` });
  } catch (err) {
    console.error('خطأ أثناء فتح التذكرة:', err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: '❌ حدث خطأ أثناء إنشاء التذكرة.' });
    }
  }
}

// --------------------------------------------------
// معالجة أوامر الرسائل
// --------------------------------------------------
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const dashboardUrl = process.env.RENDER_EXTERNAL_URL || 'https://your-app.onrender.com';



  if (message.content.startsWith(ADMIN_PREFIX)) {
    const args = message.content.slice(ADMIN_PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const result = await pool.query('SELECT * FROM permissions WHERE key = $1', ['main_permissions']);
    const perms = result.rows[0] || {};

    if (command === 'tax') {
      const allowed = await hasAdminCommandPermission(message.member, perms.tax_role_id);
      if (!allowed) return message.reply('❌ لا تمتلك صلاحية استخدام أمر الضريبة!');

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
      const allowed = await hasAdminCommandPermission(message.member, perms.come_role_id);
      if (!allowed) return message.reply('❌ لا تمتلك صلاحية أمر الاستدعاء!');

      const targetMember = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null);
      if (!targetMember) return message.reply('❌ يرجى منشن الشخص أو وضع الآيدي!');

      try {
        const comeEmbed = new EmbedBuilder()
          .setTitle('🔔 لديك استدعاء في السيرفر!')
          .setDescription(`تم استدعاؤك بواسطة الإداري: **${message.author.tag}**\n\n📌 **الروم:** ${message.channel}\n🔗 [اضغط هنا للذهاب للروم](${message.url})`)
          .setColor(0xeab308);

        await targetMember.send({ embeds: [comeEmbed] });
        return message.reply(`✅ تم إرسال إشعار استدعاء بالخاص لـ ${targetMember}.`);
      } catch (err) {
        return message.reply('❌ تعذر إرسال رسالة بالخاص للشخص.');
      }
    }

    if (command === 'say') {
      const allowed = await hasAdminCommandPermission(message.member, perms.say_role_id);
      if (!allowed) return message.reply('❌ لا تمتلك صلاحية استخدام أمر التحدث!');

      const textToSay = args.join(' ');
      if (!textToSay) return message.reply('❌ يرجى كتابة الرسالة!');

      await message.delete().catch(() => {});
      return message.channel.send(textToSay);
    }
  }

  if (message.content.startsWith(`${PREFIX}logowner`)) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ يتطلب Administrator!');
    const channel = message.mentions.channels.first() || message.channel;
    ownerLogChannelId = channel.id;
    return message.reply(`✅ تم تحديد ${channel} كقناة لوق الأخطاء.`);
  }

  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  const ticketData = await getTicketInfo(message.channel);
  if (!ticketData) return;

  const panelRes = await pool.query('SELECT * FROM panels WHERE panel_id = $1', [ticketData.panelId]);
  const config = panelRes.rows[0];
  if (!config) return;

  const permRes = await pool.query('SELECT * FROM permissions WHERE key = $1', ['main_permissions']);
  const perms = permRes.rows[0] || {};

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

  if (command === 'save') {
    const saveAllowed = perms.save_permission === 'admin_only' ? (isAdmin || isHighAdmin) : (isAdmin || isHighAdmin || isOwner);
    if (!saveAllowed) return message.reply('❌ لا تمتلك صلاحية حفظ الترانسكريبت!');

    const success = await saveTranscript(message.channel, config, message.author, ticketData);
    if (success) return message.reply('✅ تم إنشاء ملف الترانسكريبت وإرساله إلى روم اللوق!');
    return message.reply('❌ تعذر العثور على قناة اللوق.');
  }

  if (command === 'delete') {
    const deleteAllowed = perms.delete_permission === 'all_admin' ? (isAdmin || isHighAdmin) : isHighAdmin;
    if (!deleteAllowed) return message.reply('❌ لا تمتلك صلاحية حذف التذكرة!');

    await message.reply('🗑️ جاري حذف التذكرة...');
    setTimeout(() => message.channel.delete().catch(() => {}), 3000);
  }

  if (command === 'add') {
    if (!isAdmin && !isHighAdmin) return message.reply('❌ مخصص للإدارة فقط!');
    const targetMember = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null);
    if (!targetMember) return message.reply('❌ يرجى منشن الشخص!');

    await message.channel.permissionOverwrites.edit(targetMember.id, { ViewChannel: true, SendMessages: true });
    return message.reply(`✅ تم إضافة ${targetMember} إلى التذكرة.`);
  }

  if (command === 'remove') {
    if (!isAdmin && !isHighAdmin) return message.reply('❌ مخصص للإدارة فقط!');
    const targetMember = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null);
    if (!targetMember) return message.reply('❌ يرجى منشن الشخص!');

    await message.channel.permissionOverwrites.edit(targetMember.id, { ViewChannel: false, SendMessages: false });
    return message.reply(`🚫 تم إزالة ${targetMember} من التذكرة.`);
  }
});

// --------------------------------------------------
// معالجة التفاعلات والنماذج (Apply Forms + Tickets)
// --------------------------------------------------
client.on('interactionCreate', async (interaction) => {
  try {
    const dashboardUrl = process.env.RENDER_EXTERNAL_URL || 'https://your-app.onrender.com';

    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'help') return interaction.reply({ embeds: [createHelpEmbed(dashboardUrl)] });
    }

    // 1. فتح نافذة التقديم (Modal)
    if (interaction.isButton() && interaction.customId === 'start_apply_form') {
      const result = await pool.query('SELECT * FROM apply_setup WHERE id = $1', ['main_apply']);
      const appData = result.rows[0];
      if (!appData) return interaction.reply({ content: '❌ لم يتم ضبط إعدادات التقديم بعد من لوحة التحكم!', ephemeral: true });

      const modal = new ModalBuilder()
        .setCustomId('submit_apply_modal')
        .setTitle('نموذج التقديم للإدارة');

      const inputs = [];
      if (appData.q1) inputs.push(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q1').setLabel(appData.q1.substring(0, 45)).setStyle(TextInputStyle.Short).setRequired(true)));
      if (appData.q2) inputs.push(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q2').setLabel(appData.q2.substring(0, 45)).setStyle(TextInputStyle.Short).setRequired(true)));
      if (appData.q3) inputs.push(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q3').setLabel(appData.q3.substring(0, 45)).setStyle(TextInputStyle.Short).setRequired(true)));
      if (appData.q4) inputs.push(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q4').setLabel(appData.q4.substring(0, 45)).setStyle(TextInputStyle.Short).setRequired(true)));
      if (appData.q5) inputs.push(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q5').setLabel(appData.q5.substring(0, 45)).setStyle(TextInputStyle.Short).setRequired(false)));

      modal.addComponents(inputs);
      return interaction.showModal(modal);
    }

    // 2. معالجة إرسال نموذج التقديم
    if (interaction.isModalSubmit() && interaction.customId === 'submit_apply_modal') {
      await interaction.deferReply({ ephemeral: true });

      const result = await pool.query('SELECT * FROM apply_setup WHERE id = $1', ['main_apply']);
      const appData = result.rows[0];

      const reviewChannel = await interaction.guild.channels.fetch(appData.review_channel_id).catch(() => null);
      if (!reviewChannel) return interaction.editReply({ content: '❌ تعذر الوصول لروم مراجعة التقديمات!' });

      const member = interaction.member;
      const joinedServerDays = Math.floor((Date.now() - member.joinedTimestamp) / (1000 * 60 * 60 * 24));
      const joinedDiscordDays = Math.floor((Date.now() - interaction.user.createdTimestamp) / (1000 * 60 * 60 * 24));

      let descText = `👤 **صاحب التقديم:** ${interaction.user} (\`${interaction.user.id}\`)\n\n`;

      if (appData.q1) descText += `**السؤال الأول : ${appData.q1}**\n\`\`\`${interaction.fields.getTextInputValue('q1')}\`\`\`\n`;
      if (appData.q2) descText += `**السؤال الثاني : ${appData.q2}**\n\`\`\`${interaction.fields.getTextInputValue('q2')}\`\`\`\n`;
      if (appData.q3) descText += `**السؤال الثالث : ${appData.q3}**\n\`\`\`${interaction.fields.getTextInputValue('q3')}\`\`\`\n`;
      if (appData.q4) descText += `**السؤال الرابع : ${appData.q4}**\n\`\`\`${interaction.fields.getTextInputValue('q4')}\`\`\`\n`;
      if (appData.q5 && appData.q5.trim() !== '') descText += `**السؤال الخامس : ${appData.q5}**\n\`\`\`${interaction.fields.getTextInputValue('q5')}\`\`\`\n`;

      descText += `\n**انضم للسيرفر منذ :** \`${joinedServerDays} days ago\`\n**انضم للديسكورد منذ :** \`${joinedDiscordDays} days ago\``;

      const reviewEmbed = new EmbedBuilder()
        .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
        .setDescription(descText)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .setColor(0xeab308)
        .setTimestamp();

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`apply_accept_${interaction.user.id}`).setLabel('قبول').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId(`apply_reject_${interaction.user.id}`).setLabel('رفض').setStyle(ButtonStyle.Danger).setEmoji('❌'),
        new ButtonBuilder().setCustomId(`apply_reject_reason_${interaction.user.id}`).setLabel('رفض مع سبب').setStyle(ButtonStyle.Secondary).setEmoji('💡')
      );

      await reviewChannel.send({ embeds: [reviewEmbed], components: [actionRow] });
      return interaction.editReply({ content: '✅ تم إرسال تقديمك بنجاح! سيتم مراجعته من قبل الإدارة العليا.' });
    }

    // 3. أزرار القبول والرفض للتقديم (مع إعطاء الرتبة التلقائية)
    if (interaction.isButton() && (interaction.customId.startsWith('apply_accept_') || interaction.customId.startsWith('apply_reject_'))) {
      const result = await pool.query('SELECT * FROM apply_setup WHERE id = $1', ['main_apply']);
      const appData = result.rows[0];

      if (!interaction.member.roles.cache.has(appData.high_admin_role_id) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ هذا الأمر مخصص للإدارة العليا فقط!', ephemeral: true });
      }

      const isAccept = interaction.customId.startsWith('apply_accept_');
      const isRejectReason = interaction.customId.startsWith('apply_reject_reason_');
      const targetUserId = interaction.customId.split('_').pop();

      // فتح نافذة كتابة سبب الرفض
      if (isRejectReason) {
        const modal = new ModalBuilder()
          .setCustomId(`reject_modal_reason_${targetUserId}`)
          .setTitle('سبب رفض التقديم');

        const reasonInput = new TextInputBuilder()
          .setCustomId('reject_reason')
          .setLabel('سبب الرفض:')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        return interaction.showModal(modal);
      }

      await interaction.deferUpdate();

      const resultsChannel = await interaction.guild.channels.fetch(appData.results_channel_id).catch(() => null);
      const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);

      // إعطاء الرتبة تلقائياً في حال القبول
      if (isAccept && targetMember && appData.accepted_role_id) {
        await targetMember.roles.add(appData.accepted_role_id).catch(err => console.error('تعذر إعطاء الرتبة للمقبول:', err));
      }

      const resultEmbed = new EmbedBuilder()
        .setThumbnail(targetMember ? targetMember.user.displayAvatarURL() : interaction.guild.iconURL())
        .setColor(isAccept ? 0x10b981 : 0xef4444)
        .setTimestamp();

      if (isAccept) {
        resultEmbed.setTitle(`تم قبول تقديم ${interaction.guild.name}`)
          .addFields(
            { name: 'صاحب التقديم :', value: targetMember ? `${targetMember}` : `<@${targetUserId}>`, inline: false },
            { name: 'الإداري :', value: `${interaction.user}`, inline: false }
          );
      } else {
        resultEmbed.setTitle(`تم رفض تقديم ${interaction.guild.name}`)
          .addFields(
            { name: 'صاحب التقديم :', value: targetMember ? `${targetMember}` : `<@${targetUserId}>`, inline: false },
            { name: 'الإداري :', value: `${interaction.user}`, inline: false }
          );
      }

      if (resultsChannel) {
        await resultsChannel.send({ embeds: [resultEmbed] });
      }

      // تعطيل الأزرار بعد اتخاذ القرار
      const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
      disabledRow.components.forEach(c => c.setDisabled(true));
      await interaction.message.edit({ components: [disabledRow] });

      return;
    }

    // 4. معالجة Modal سبب الرفض
    if (interaction.isModalSubmit() && interaction.customId.startsWith('reject_modal_reason_')) {
      await interaction.deferUpdate();

      const targetUserId = interaction.customId.replace('reject_modal_reason_', '');
      const reason = interaction.fields.getTextInputValue('reject_reason');

      const result = await pool.query('SELECT * FROM apply_setup WHERE id = $1', ['main_apply']);
      const appData = result.rows[0];

      const resultsChannel = await interaction.guild.channels.fetch(appData.results_channel_id).catch(() => null);
      const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);

      const resultEmbed = new EmbedBuilder()
        .setThumbnail(targetMember ? targetMember.user.displayAvatarURL() : interaction.guild.iconURL())
        .setTitle(`تم رفض تقديم ${interaction.guild.name}`)
        .addFields(
          { name: 'صاحب التقديم :', value: targetMember ? `${targetMember}` : `<@${targetUserId}>`, inline: false },
          { name: 'الإداري :', value: `${interaction.user}`, inline: false },
          { name: 'السبب :', value: `\`\`\`${reason}\`\`\``, inline: false }
        )
        .setColor(0xef4444)
        .setTimestamp();

      if (resultsChannel) {
        await resultsChannel.send({ embeds: [resultEmbed] });
      }

      const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
      disabledRow.components.forEach(c => c.setDisabled(true));
      await interaction.message.edit({ components: [disabledRow] });

      return;
    }

    // التفاعل مع قائمة خيارات التذاكر
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('ticket_select_')) {
      const selectedOptionId = interaction.values[0];
      return handleTicketCreation(interaction, selectedOptionId);
    }

    if (interaction.isButton() && interaction.customId.startsWith('ticket_btn_')) {
      const optionId = interaction.customId.replace('ticket_btn_', '');
      return handleTicketCreation(interaction, optionId);
    }

    if (!interaction.guild || !interaction.channel.topic) return;
    const ticketData = await getTicketInfo(interaction.channel);
    if (!ticketData) return;

    const panelRes = await pool.query('SELECT * FROM panels WHERE panel_id = $1', [ticketData.panelId]);
    const config = panelRes.rows[0];
    if (!config) return;

    const permRes = await pool.query('SELECT * FROM permissions WHERE key = $1', ['main_permissions']);
    const perms = permRes.rows[0] || {};

    const isAdmin = interaction.member.roles.cache.has(config.admin_role_id);
    const isHighAdmin = interaction.member.roles.cache.has(config.high_admin_role_id);
    const isOwner = interaction.user.id === ticketData.ownerId;

    if (interaction.isButton() && interaction.customId === 'ticket_close_req') {
      const closeAllowed = perms.close_permission === 'admin_only' ? (isAdmin || isHighAdmin) : (isAdmin || isHighAdmin || isOwner);
      if (!closeAllowed) return interaction.reply({ content: '❌ لا تمتلك الصلاحية إغلاق التذكرة!', ephemeral: true });

      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_confirm_close').setLabel('تأكيد الإغلاق').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ticket_cancel_close').setLabel('إلغاء').setStyle(ButtonStyle.Secondary)
      );
      return interaction.reply({ content: '⚠️ هل أنت متأكد من إغلاق التذكرة؟', components: [confirmRow] });
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
      const saveAllowed = perms.save_permission === 'admin_only' ? (isAdmin || isHighAdmin) : (isAdmin || isHighAdmin || isOwner);
      if (!saveAllowed) return interaction.reply({ content: '❌ لا تمتلك صلاحية حفظ الترانسكريبت!', ephemeral: true });

      await interaction.deferReply();
      const success = await saveTranscript(interaction.channel, config, interaction.user, ticketData);
      if (success) return interaction.editReply({ content: '✅ تم إنشاء ملف الترانسكريبت وإرساله إلى روم اللوق!' });
      return interaction.editReply({ content: '❌ تعذر العثور على قناة اللوق.' });
    }

    if (interaction.isButton() && interaction.customId === 'ticket_delete') {
      const deleteAllowed = perms.delete_permission === 'all_admin' ? (isAdmin || isHighAdmin) : isHighAdmin;
      if (!deleteAllowed) return interaction.reply({ content: '❌ لا تمتلك صلاحية حذف التكت!', ephemeral: true });

      await interaction.reply({ content: '🗑️ سيتم حذف التذكرة خلال 3 ثوانٍ...' });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
    }

  } catch (err) {
    sendLogError('خطأ غير متوقع:', err);
  }
});
// 🔗 استدعاء ملف أوامر النظام والإدارة الجديد (system.js)
require('./system.js')(client, '!');

client.login(process.env.DISCORD_TOKEN);
