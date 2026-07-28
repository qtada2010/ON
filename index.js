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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS stats (
        key VARCHAR(50) PRIMARY KEY,
        total_tickets INT DEFAULT 0
      );
    `);

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

    console.log('🐘 تم تحديث الجداول بنجاح!');
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

app.get('/panel', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM panels');
  let panelsListHTML = '';
  for (const p of result.rows) {
    const optionsRes = await pool.query('SELECT COUNT(*) FROM panel_options WHERE panel_id = $1', [p.panel_id]);
    panelsListHTML += `
      <div style="background:#0f172a; padding:15px; border-radius:8px; margin-bottom:15px; border:1px solid #334155; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h3 style="margin:0; color:#38bdf8;">📌 المعرف: ${p.panel_id} - ${p.title}</h3>
        </div>
        <div>
          <a href="/edit-panel/${p.panel_id}" style="background:#0284c7; color:white; padding:8px 15px; border-radius:5px; text-decoration:none; font-weight:bold; margin-left:5px;">✏️ تعديل</a>
          <a href="/delete-panel/${p.panel_id}" style="background:#ef4444; color:white; padding:8px 15px; border-radius:5px; text-decoration:none; font-weight:bold;">🗑️ حذف</a>
        </div>
      </div>
    `;
  }
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head><meta charset="UTF-8"><title>إدارة اللوحات</title>
    <style>body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin:0; padding:0; } nav { background: #1e293b; padding: 15px 30px; display: flex; justify-content: space-between; border-bottom: 1px solid #334155; } nav .links a { color: #38bdf8; text-decoration: none; font-weight: bold; margin-left: 20px; } .container { max-width: 900px; margin: 40px auto; background: #1e293b; padding: 30px; border-radius: 12px; border: 1px solid #334155; } h1, h2 { color: #38bdf8; } label { display: block; margin-top: 12px; font-weight: bold; color:#cbd5e1; } input, select, textarea { width: 100%; padding: 10px; margin-top: 5px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; } button { margin-top: 20px; width: 100%; padding: 12px; background: #0284c7; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }</style>
    </head>
    <body>
      <nav><div class="links"><a href="/">الرئيسية 🏠</a><a href="/panel">إدارة التذاكر ⚙️</a><a href="/apply-setup">تقديم الإدارة 📝</a><a href="/admin-commands">صلاحيات الأوامر 🛡️</a><a href="/stats">الإحصائيات 📊</a></div><a href="/logout" style="color:#ef4444; font-weight:bold; text-decoration:none;">تسجيل الخروج 🚪</a></nav>
      <div class="container">
        <h1>➕ إنشاء / إضافة لوحة جديدة</h1>
        <form action="/create-panel" method="POST">
          <label>معرف اللوحة الفريد (Panel ID):</label><input type="text" name="panelId" required>
          <label>نوع التفاعل:</label><select name="type"><option value="buttons">أزرار</option><option value="select">قائمة منسدلة</option></select>
          <label>نوع الرسالة:</label><select name="messageType"><option value="embed">إيمبد</option><option value="plain">عادية</option></select>
          <label>آيدي روم اللوحة:</label><input type="text" name="channelId" required>
          <label>آيدي كاتيجوري التذاكر:</label><input type="text" name="categoryId" required>
          <label>آيدي رتبة الإدارة العادية:</label><input type="text" name="adminRoleId" required>
          <label>آيدي رتبة الإدارة العليا:</label><input type="text" name="highAdminRoleId" required>
          <label>آيدي روم اللوق:</label><input type="text" name="logChannelId" required>
          <label>عنوان اللوحة:</label><input type="text" name="title" value="تكت الدعم الفني" required>
          <label>وصف اللوحة:</label><textarea name="description" rows="2" required>اختر القسم المناسب من الأسفل لفتح تذكرة.</textarea>
          <button type="submit">حفظ وانتقال للأزرار ➡️</button>
        </form>
        <hr style="margin: 30px 0; border-color: #334155;">
        <h2>📋 اللوحات المسجلة:</h2>
        ${panelsListHTML || '<p>لا توجد لوحات.</p>'}
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
      channel_id = EXCLUDED.channel_id, category_id = EXCLUDED.category_id,
      admin_role_id = EXCLUDED.admin_role_id, high_admin_role_id = EXCLUDED.high_admin_role_id,
      log_channel_id = EXCLUDED.log_channel_id, title = EXCLUDED.title, description = EXCLUDED.description,
      type = EXCLUDED.type, message_type = EXCLUDED.message_type, image_url = EXCLUDED.image_url, color = EXCLUDED.color;
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
        <span style="color:#eab308; font-weight:bold;">#${index + 1} الخيار: ${opt.label}</span>
        <a href="/delete-option/${opt.id}/${panel.panel_id}" style="color:#ef4444; float:left; text-decoration:none;">🗑️ حذف</a>
      </div>
    `;
  });
  res.send(`
    <!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تعديل اللوحة</title>
    <style>body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin:0; padding:0; } nav { background: #1e293b; padding: 15px 30px; display: flex; justify-content: space-between; border-bottom: 1px solid #334155; } nav .links a { color: #38bdf8; text-decoration: none; font-weight: bold; margin-left: 20px; } .container { max-width: 900px; margin: 40px auto; background: #1e293b; padding: 30px; border-radius: 12px; border: 1px solid #334155; } h1, h2 { color: #38bdf8; } label { display: block; margin-top: 10px; font-weight: bold; color:#cbd5e1; } input, select, textarea { width: 100%; padding: 10px; margin-top: 5px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; }</style>
    </head>
    <body>
      <nav><div class="links"><a href="/">الرئيسية 🏠</a><a href="/panel">إدارة التذاكر ⚙️</a><a href="/apply-setup">تقديم الإدارة 📝</a><a href="/admin-commands">صلاحيات الأوامر 🛡️</a><a href="/stats">الإحصائيات 📊</a></div><a href="/logout" style="color:#ef4444; font-weight:bold; text-decoration:none;">تسجيل الخروج 🚪</a></nav>
      <div class="container">
        <h1>⚙️ التحكم في اللوحة: ${panel.title}</h1>
        <h2>➕ إضافة خيار جديد:</h2>
        <form action="/add-option" method="POST" style="background:#0f172a; padding:20px; border-radius:8px; border:1px solid #334155;">
          <input type="hidden" name="panelId" value="${panel.panel_id}">
          <label>اسم الزر:</label><input type="text" name="label" required>
          <label>لون الزر:</label><select name="buttonStyle"><option value="Primary">أزرق</option><option value="Secondary">رمادي</option><option value="Success">أخضر</option><option value="Danger">أحمر</option></select>
          <label>الوصف:</label><input type="text" name="description">
          <label>الإيموجي:</label><input type="text" name="emoji">
          <label>رسالة الترحيب بالتكت:</label><textarea name="welcomeMessage" rows="2" required>أهلاً بك!</textarea>
          <button type="submit" style="background:#10b981; color:#fff; border:none; padding:10px; width:100%; border-radius:5px; margin-top:10px;">إضافة</button>
        </form>
        <hr style="margin:30px 0; border-color:#334155;">
        <h2>الخيارات الحالية:</h2>
        ${optionsHTML || '<p>لا توجد خيارات.</p>'}
        ${optionsRes.rows.length > 0 ? `
          <form action="/publish-panel" method="POST" style="margin-top:20px;">
            <input type="hidden" name="panelId" value="${panel.panel_id}">
            <button type="submit" style="background:#0284c7; color:#fff; padding:12px; border:none; width:100%; border-radius:6px; font-weight:bold;">🚀 إرسال / تحديث اللوحة بالديسكورد</button>
          </form>
        ` : ''}
      </div>
    </body></html>
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
  const { panelId } = req.body;
  const pRes = await pool.query('SELECT * FROM panels WHERE panel_id = $1', [panelId]);
  const panel = pRes.rows[0];
  const optionsRes = await pool.query('SELECT * FROM panel_options WHERE panel_id = $1 ORDER BY id ASC', [panelId]);
  if (!panel || optionsRes.rows.length === 0) return res.send('❌ أضف خياراً واحداً على الأقل!');

  try {
    const channel = await client.channels.fetch(panel.channel_id);
    if (!channel) return res.send('❌ تعذر الوصول لروم اللوحة بالديسكورد!');

    const components = [];
    if (panel.type === 'select') {
      const selectMenu = new StringSelectMenuBuilder().setCustomId(`ticket_select_${panel.panel_id}`).setPlaceholder('اختر القسم المطلوب...');
      optionsRes.rows.forEach(opt => {
        const optionBuilder = new StringSelectMenuOptionBuilder().setLabel(opt.label).setValue(opt.option_id);
        if (opt.description) optionBuilder.setDescription(opt.description);
        if (opt.emoji) { try { optionBuilder.setEmoji(opt.emoji); } catch(e){} }
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
        if (opt.emoji) { try { btn.setEmoji(opt.emoji); } catch(e){} }
        currentRow.addComponents(btn);
      });
      components.push(currentRow);
    }

    let payload = panel.message_type === 'embed' ? { embeds: [new EmbedBuilder().setTitle(panel.title).setDescription(panel.description).setColor(panel.color || '#0284c7')], components } : { content: `**${panel.title}**\n\n${panel.description}`, components };
    const sentMessage = await channel.send(payload);
    await pool.query('UPDATE panels SET last_message_id = $1 WHERE panel_id = $2', [sentMessage.id, panel.panel_id]);

    res.send('<h2>✅ تم نشر اللوحة بنجاح!</h2><a href="/panel">العودة</a>');
  } catch (err) {
    res.send(`❌ خطأ: ${err.message}`);
  }
});

app.get('/apply-setup', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM apply_setup WHERE id = $1', ['main_apply']);
  const appData = result.rows[0] || {};
  res.send(`
    <!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تقديم الإدارة</title>
    <style>body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin:0; padding:0; } nav { background: #1e293b; padding: 15px 30px; display: flex; justify-content: space-between; border-bottom: 1px solid #334155; } nav .links a { color: #38bdf8; text-decoration: none; font-weight: bold; margin-left: 20px; } .container { max-width: 900px; margin: 40px auto; background: #1e293b; padding: 30px; border-radius: 12px; border: 1px solid #334155; } h1, h2 { color: #eab308; } label { display: block; margin-top: 12px; font-weight: bold; color:#cbd5e1; } input, textarea { width: 100%; padding: 10px; margin-top: 5px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; }</style>
    </head>
    <body>
      <nav><div class="links"><a href="/">الرئيسية 🏠</a><a href="/panel">إدارة التذاكر ⚙️</a><a href="/apply-setup">تقديم الإدارة 📝</a><a href="/admin-commands">صلاحيات الأوامر 🛡️</a><a href="/stats">الإحصائيات 📊</a></div><a href="/logout" style="color:#ef4444; font-weight:bold; text-decoration:none;">تسجيل الخروج 🚪</a></nav>
      <div class="container">
        <h1>📝 إعداد نموذج تقديم الإدارة</h1>
        <form action="/save-apply-setup" method="POST">
          <label>آيدي روم استقبال التقديم:</label><input type="text" name="submitChannelId" value="${appData.submit_channel_id || ''}" required>
          <label>آيدي روم مراجعة الإدارة:</label><input type="text" name="reviewChannelId" value="${appData.review_channel_id || ''}" required>
          <label>آيدي روم نتائج التقديم:</label><input type="text" name="resultsChannelId" value="${appData.results_channel_id || ''}" required>
          <label>آيدي رتبة الإدارة العليا (للمراجعة والقبول):</label><input type="text" name="highAdminRoleId" value="${appData.high_admin_role_id || ''}" required>
          <label>آيدي رتبة المقبول (التي تُعطى تلقائياً عند الضغط قبول):</label><input type="text" name="acceptedRoleId" value="${appData.accepted_role_id || ''}" required>
          <label>عنوان البنر:</label><input type="text" name="title" value="${appData.title || 'تقديم الإدارة'}" required>
          <label>الوصف:</label><textarea name="description" rows="2" required>${appData.description || 'اضغط على الزر أدناه للتقديم.'}</textarea>
          <label>السؤال الأول:</label><input type="text" name="q1" value="${appData.q1 || 'اسمك وعمرك؟'}" required>
          <label>السؤال الثاني:</label><input type="text" name="q2" value="${appData.q2 || 'خبرتك؟'}" required>
          <label>السؤال الثالث:</label><input type="text" name="q3" value="${appData.q3 || 'لماذا تريد الانضمام؟'}" required>
          <label>السؤال الرابع:</label><input type="text" name="q4" value="${appData.q4 || 'كم تتفاعل يومياً؟'}" required>
          <button type="submit" style="margin-top:20px; background:#eab308; color:#000; padding:12px; border:none; width:100%; border-radius:6px; font-weight:bold;">💾 حفظ ونشر بالديسكورد</button>
        </form>
      </div>
    </body></html>
  `);
});

app.post('/save-apply-setup', requireAuth, async (req, res) => {
  const d = req.body;
  await pool.query(`
    INSERT INTO apply_setup (id, title, description, submit_channel_id, review_channel_id, results_channel_id, high_admin_role_id, accepted_role_id, q1, q2, q3, q4)
    VALUES ('main_apply', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title, description = EXCLUDED.description,
      submit_channel_id = EXCLUDED.submit_channel_id, review_channel_id = EXCLUDED.review_channel_id,
      results_channel_id = EXCLUDED.results_channel_id, high_admin_role_id = EXCLUDED.high_admin_role_id,
      accepted_role_id = EXCLUDED.accepted_role_id, q1 = EXCLUDED.q1, q2 = EXCLUDED.q2, q3 = EXCLUDED.q3, q4 = EXCLUDED.q4;
  `, [d.title, d.description, d.submitChannelId.trim(), d.reviewChannelId.trim(), d.resultsChannelId.trim(), d.highAdminRoleId.trim(), d.acceptedRoleId.trim(), d.q1, d.q2, d.q3, d.q4]);

  try {
    const ch = await client.channels.fetch(d.submitChannelId.trim());
    if (ch) {
      const embed = new EmbedBuilder().setTitle(d.title).setDescription(d.description).setColor('#eab308');
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('start_apply_form').setLabel('تقديم على الإدارة 📝').setStyle(ButtonStyle.Success));
      const msg = await ch.send({ embeds: [embed], components: [row] });
      await pool.query('UPDATE apply_setup SET last_message_id = $1 WHERE id = $2', [msg.id, 'main_apply']);
    }
  } catch(e) {}

  res.send('<h2>✅ تم حفظ الإعدادات ونشر بنر التقديم!</h2><a href="/apply-setup">العودة</a>');
});

app.get('/admin-commands', requireAuth, async (req, res) => {
  const pRes = await pool.query('SELECT * FROM permissions WHERE key = $1', ['main_perms']);
  const perms = pRes.rows[0] || {};
  res.send(`
    <!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>صلاحيات الأوامر</title>
    <style>body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin:0; padding:0; } nav { background: #1e293b; padding: 15px 30px; display: flex; justify-content: space-between; border-bottom: 1px solid #334155; } nav .links a { color: #38bdf8; text-decoration: none; font-weight: bold; margin-left: 20px; } .container { max-width: 850px; margin: 40px auto; background: #1e293b; padding: 30px; border-radius: 12px; border: 1px solid #334155; } h1, h2 { color: #38bdf8; } label { display: block; margin-top: 15px; font-weight: bold; color:#cbd5e1; } input, select { width: 100%; padding: 10px; margin-top: 5px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; }</style>
    </head>
    <body>
      <nav><div class="links"><a href="/">الرئيسية 🏠</a><a href="/panel">إدارة التذاكر ⚙️</a><a href="/apply-setup">تقديم الإدارة 📝</a><a href="/admin-commands">صلاحيات الأوامر 🛡️</a><a href="/stats">الإحصائيات 📊</a></div><a href="/logout" style="color:#ef4444; font-weight:bold; text-decoration:none;">تسجيل الخروج 🚪</a></nav>
      <div class="container">
        <h1>🛡️ ضبط صلاحيات الأوامر والأزرار</h1>
        <form action="/save-admin-commands" method="POST">
          <label>إغلاق التكت:</label>
          <select name="closePermission">
            <option value="both" ${perms.close_permission === 'both' ? 'selected' : ''}>صاحب التكت والإدارة</option>
            <option value="admin_only" ${perms.close_permission === 'admin_only' ? 'selected' : ''}>الإدارة فقط</option>
          </select>
          <label>حذف التكت:</label>
          <select name="deletePermission">
            <option value="high_admin" ${perms.delete_permission === 'high_admin' ? 'selected' : ''}>الإدارة العليا فقط</option>
            <option value="all_admin" ${perms.delete_permission === 'all_admin' ? 'selected' : ''}>جميع الإدارة</option>
          </select>
          <label>حفظ الترانسكريبت:</label>
          <select name="savePermission">
            <option value="both" ${perms.save_permission === 'both' ? 'selected' : ''}>الإدارة العليا والعادية</option>
            <option value="admin_only" ${perms.save_permission === 'admin_only' ? 'selected' : ''}>الإدارة العليا فقط</option>
          </select>
          <button type="submit" style="margin-top:25px; width:100%; padding:12px; background:#0284c7; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">💾 حفظ الصلاحيات</button>
        </form>
      </div>
    </body></html>
  `);
});

app.post('/save-admin-commands', requireAuth, async (req, res) => {
  const { closePermission, deletePermission, savePermission } = req.body;
  await pool.query(`
    INSERT INTO permissions (key, close_permission, delete_permission, save_permission)
    VALUES ('main_perms', $1, $2, $3)
    ON CONFLICT (key) DO UPDATE SET
      close_permission = EXCLUDED.close_permission,
      delete_permission = EXCLUDED.delete_permission,
      save_permission = EXCLUDED.save_permission;
  `, [closePermission, deletePermission, savePermission]);
  res.send('<h2>✅ تم الحفظ بنجاح!</h2><a href="/admin-commands">العودة</a>');
});

app.get('/stats', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT total_tickets FROM stats WHERE key = $1', ['main_stats']);
  const totalTickets = result.rows[0] ? result.rows[0].total_tickets : 0;
  res.send(`
    <!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>الإحصائيات</title>
    <style>body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin:0; padding:0; } nav { background: #1e293b; padding: 15px 30px; display: flex; justify-content: space-between; border-bottom: 1px solid #334155; } nav .links a { color: #38bdf8; text-decoration: none; font-weight: bold; margin-left: 20px; } .container { max-width: 800px; margin: 40px auto; background: #1e293b; padding: 30px; border-radius: 12px; border: 1px solid #334155; } h1, h2 { color: #38bdf8; }</style>
    </head>
    <body>
      <nav><div class="links"><a href="/">الرئيسية 🏠</a><a href="/panel">إدارة التذاكر ⚙️</a><a href="/apply-setup">تقديم الإدارة 📝</a><a href="/admin-commands">صلاحيات الأوامر 🛡️</a><a href="/stats">الإحصائيات 📊</a></div><a href="/logout" style="color:#ef4444; font-weight:bold; text-decoration:none;">تسجيل الخروج 🚪</a></nav>
      <div class="container">
        <h1>📊 الإحصائيات</h1>
        <h2>إجمالي التذاكر المفتوحة: <span style="color:#10b981;">${totalTickets}</span></h2>
      </div>
    </body></html>
  `);
});

app.listen(process.env.PORT || 3000, () => console.log('🌐 خادم لوحة التحكم يعمل بنجاح!'));

// ==========================================
// 4. أوامر البوت ومعالجة التذاكر والأزرار
// ==========================================
client.on('ready', async () => {
  console.log(`🤖 Bot is ready as ${client.user.tag}`);
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: [new SlashCommandBuilder().setName('help').setDescription('عرض قائمة المساعدة')] }
    );
  } catch (e) {}
});

// دوال مساعدة للتذاكر
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
      .setTitle('📁 سجل ترانسكريبت تذكرة')
      .addFields(
        { name: '👤 صاحب التذكرة:', value: `<@${ticketData.ownerId}>`, inline: true },
        { name: '🔒 بواسطة:', value: `${user}`, inline: true },
        { name: '📌 اسم التذكرة:', value: `${channel.name}`, inline: false }
      )
      .setColor('#38bdf8')
      .setTimestamp();

    await logChannel.send({ embeds: [embed], files: [attachment] });
    return true;
  } catch (err) {
    return false;
  }
}

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // نظام إضافة وإزالة الأعضاء من التذكرة
  if (command === 'اضافة' || command === 'add') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('❌ ليس لديك صلاحية.');
    const targetMember = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null);
    if (!targetMember) return message.reply('❌ يرجى منشن الشخص!');
    await message.channel.permissionOverwrites.edit(targetMember.id, { ViewChannel: true, SendMessages: true });
    return message.reply(`✅ تم إضافة ${targetMember} إلى التذكرة.`);
  }

  if (command === 'remove') {
    const isAdmin = message.member.permissions.has(PermissionFlagsBits.ManageChannels);
    if (!isAdmin) return message.reply('❌ مخصص للإدارة فقط!');
    const targetMember = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null);
    if (!targetMember) return message.reply('❌ يرجى منشن الشخص!');
    await message.channel.permissionOverwrites.edit(targetMember.id, { ViewChannel: false, SendMessages: false });
    return message.reply(`🚫 تم إزالة ${targetMember} من التذكرة.`);
  }
});

// التعامل مع التفاعلات والأزرار
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'help') {
      return interaction.reply({ content: '✅ بوت التذاكر يعمل بكفاءة عالية.', ephemeral: true });
    }

    // 1. التقديم للإدارة (Modal Submit)
    if (interaction.isButton() && interaction.customId === 'start_apply_form') {
      const appRes = await pool.query('SELECT * FROM apply_setup WHERE id = $1', ['main_apply']);
      const appData = appRes.rows[0];
      if (!appData) return interaction.reply({ content: '❌ الإعدادات غير متوفرة.', ephemeral: true });

      const modal = new ModalBuilder().setCustomId('submit_apply_modal').setTitle('نموذج التقديم للإدارة');
      if (appData.q1) modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q1').setLabel(appData.q1.substring(0, 45)).setStyle(TextInputStyle.Short).setRequired(true)));
      if (appData.q2) modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q2').setLabel(appData.q2.substring(0, 45)).setStyle(TextInputStyle.Short).setRequired(true)));
      if (appData.q3) modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q3').setLabel(appData.q3.substring(0, 45)).setStyle(TextInputStyle.Short).setRequired(true)));
      if (appData.q4) modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q4').setLabel(appData.q4.substring(0, 45)).setStyle(TextInputStyle.Short).setRequired(true)));

      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'submit_apply_modal') {
      await interaction.deferReply({ ephemeral: true });
      const appRes = await pool.query('SELECT * FROM apply_setup WHERE id = $1', ['main_apply']);
      const appData = appRes.rows[0];
      if (!appData) return interaction.editReply({ content: '❌ خطأ بالبيانات.' });

      const q1Val = interaction.fields.getTextInputValue('q1');
      const q2Val = interaction.fields.getTextInputValue('q2');
      const q3Val = interaction.fields.getTextInputValue('q3');
      const q4Val = interaction.fields.getTextInputValue('q4');

      const reviewChannel = await interaction.guild.channels.fetch(appData.review_channel_id).catch(() => null);
      if (!reviewChannel) return interaction.editReply({ content: '❌ تعذر العثور على روم مراجعة التقديم.' });

      const reviewEmbed = new EmbedBuilder()
        .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
        .setTitle('📝 تقديم إداري جديد')
        .addFields(
          { name: `1. ${appData.q1}`, value: q1Val },
          { name: `2. ${appData.q2}`, value: q2Val },
          { name: `3. ${appData.q3}`, value: q3Val },
          { name: `4. ${appData.q4}`, value: q4Val }
        )
        .setColor('#eab308')
        .setTimestamp();

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`apply_accept_${interaction.user.id}`).setLabel('قبول').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId(`apply_reject_${interaction.user.id}`).setLabel('رفض').setStyle(ButtonStyle.Danger).setEmoji('❌')
      );

      await reviewChannel.send({ embeds: [reviewEmbed], components: [actionRow] });
      return interaction.editReply({ content: '✅ تم إرسال تقديمك بنجاح للإدارة!' });
    }

    // أزرار قبول/رفض التقديم للإدارة وإعطاء الرتبة التلقائية
    if (interaction.isButton() && (interaction.customId.startsWith('apply_accept_') || interaction.customId.startsWith('apply_reject_'))) {
      const appRes = await pool.query('SELECT * FROM apply_setup WHERE id = $1', ['main_apply']);
      const appData = appRes.rows[0];
      if (!appData) return interaction.reply({ content: '❌ بيانات التقديم غير موجودة.', ephemeral: true });

      const member = interaction.member;
      const isHighAdmin = member.roles.cache.has(appData.high_admin_role_id) || member.permissions.has(PermissionFlagsBits.Administrator);
      if (!isHighAdmin) return interaction.reply({ content: '❌ هذا الزر مخصص للإدارة العليا فقط!', ephemeral: true });

      const targetUserId = interaction.customId.split('_')[2];
      const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
      const isAccept = interaction.customId.startsWith('apply_accept_');

      if (isAccept && targetMember && appData.accepted_role_id) {
        await targetMember.roles.add(appData.accepted_role_id).catch(() => {});
      }

      const resultsChannel = await interaction.guild.channels.fetch(appData.results_channel_id).catch(() => null);
      if (resultsChannel) {
        await resultsChannel.send({ content: isAccept ? `✅ مبروك <@${targetUserId}> تم قبولك في الإدارة!` : `❌ نأسف <@${targetUserId}> تم رفض تقديمك.` }).catch(() => {});
      }

      await interaction.update({ content: `${interaction.user} قام بـ **${isAccept ? 'قبول' : 'رفض'}** التقديم.`, components: [] });
      return;
    }

    // 2. إنشاء التذاكر عبر الأزرار أو القوائم المنسدلة
    let option = null;
    let config = null;

    if (interaction.isButton() && interaction.customId.startsWith('ticket_btn_')) {
      const optionId = interaction.customId.replace('ticket_btn_', '');
      const optRes = await pool.query('SELECT * FROM panel_options WHERE option_id = $1', [optionId]);
      option = optRes.rows[0];
      if (option) {
        const panelRes = await pool.query('SELECT * FROM panels WHERE panel_id = $1', [option.panel_id]);
        config = panelRes.rows[0];
      }
    } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('ticket_select_')) {
      const optionId = interaction.values[0];
      const optRes = await pool.query('SELECT * FROM panel_options WHERE option_id = $1', [optionId]);
      option = optRes.rows[0];
      if (option) {
        const panelRes = await pool.query('SELECT * FROM panels WHERE panel_id = $1', [option.panel_id]);
        config = panelRes.rows[0];
      }
    }

    if (option && config) {
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
        .setTitle(`🎫 ${option.label}`)
        .setDescription(option.welcome_message || `أهلاً بك ${interaction.user}، تم فتح التذكرة بنجاح.`)
        .setColor(config.color || '#0284c7')
        .setTimestamp();

      // **المطلوب بدقة:** عند فتح التذكرة يظهر زر إغلاق التذكرة وزر استلام التذكرة فقط!
      const initialRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_close_req').setLabel('إغلاق التذكرة').setEmoji('🔒').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ticket_claim_btn').setLabel('استلام التذكرة').setEmoji('📌').setStyle(ButtonStyle.Primary)
      );

      await ticketChannel.send({ content: `${interaction.user} | <@&${config.admin_role_id}>`, embeds: [welcomeEmbed], components: [initialRow] });
      return interaction.editReply({ content: `✅ تم إنشاء التذكرة بنجاح: ${ticketChannel}` });
    }

    // 3. أزرار التحكم داخل التذكرة (استلام، إغلاق، فتح، ترانسكريبت، حذف)
    if (interaction.isButton() && [
      'ticket_claim_btn', 'ticket_unclaim_btn', 'ticket_close_req', 
      'ticket_unlock', 'ticket_save_log', 'ticket_delete'
    ].includes(interaction.customId)) {

      let topicData = {};
      try { topicData = JSON.parse(interaction.channel.topic || '{}'); } catch(e){}
      const ownerId = topicData.ownerId;
      const panelId = topicData.panelId;

      let config = null;
      if (panelId) {
        const cRes = await pool.query('SELECT * FROM panels WHERE panel_id = $1', [panelId]);
        config = cRes.rows[0];
      }
      if (!config) {
        const cRes2 = await pool.query('SELECT * FROM panels LIMIT 1');
        config = cRes2.rows[0];
      }
      if (!config) return interaction.reply({ content: '❌ خطأ في العثور على إعدادات التذاكر.', ephemeral: true });

      const member = interaction.member;
      const isAdmin = member.roles.cache.has(config.admin_role_id) || member.permissions.has(PermissionFlagsBits.ManageChannels);
      const isHighAdmin = member.roles.cache.has(config.high_admin_role_id) || member.permissions.has(PermissionFlagsBits.Administrator);

      const permsRes = await pool.query('SELECT * FROM permissions WHERE key = $1', ['main_perms']);
      const perms = permsRes.rows[0] || {};

      // أ. زر استلام التذكرة
      if (interaction.customId === 'ticket_claim_btn') {
        if (!isAdmin && !isHighAdmin) return interaction.reply({ content: '❌ مخصص للإدارة فقط!', ephemeral: true });

        await interaction.channel.permissionOverwrites.edit(config.admin_role_id, { SendMessages: false }).catch(() => {});
        if (ownerId) await interaction.channel.permissionOverwrites.edit(ownerId, { SendMessages: true }).catch(() => {});

        const claimedRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_close_req').setLabel('إغلاق التذكرة').setEmoji('🔒').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('ticket_unclaim_btn').setLabel('إلغاء الاستلام').setEmoji('↩️').setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({ content: `📌 **تم استلام التذكرة بواسطة:** ${interaction.user}\nتم قفل التحدث لبقية الإداريين مؤقتاً.`, components: [claimedRow] });
        return;
      }

      // ب. زر إلغاء الاستلام
      if (interaction.customId === 'ticket_unclaim_btn') {
        if (!isAdmin && !isHighAdmin) return interaction.reply({ content: '❌ مخصص للإدارة فقط!', ephemeral: true });

        await interaction.channel.permissionOverwrites.edit(config.admin_role_id, { SendMessages: true }).catch(() => {});

        const unclaimedRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_close_req').setLabel('إغلاق التذكرة').setEmoji('🔒').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('ticket_claim_btn').setLabel('استلام التذكرة').setEmoji('📌').setStyle(ButtonStyle.Primary)
        );

        await interaction.update({ content: `🔄 **تم إلغاء الاستلام بواسطة:** ${interaction.user}\nيمكن لجميع الإداريين الكتابة بالتذكرة الآن.`, components: [unclaimedRow] });
        return;
      }

      // ج. زر طلب إغلاق التذكرة (يظهر خيارات التحكم الإضافية هنا حصراً)
      if (interaction.customId === 'ticket_close_req') {
        const closeAllowed = perms.close_permission === 'admin_only' ? (isAdmin || isHighAdmin) : (isAdmin || isHighAdmin || interaction.user.id === ownerId);
        if (!closeAllowed) return interaction.reply({ content: '❌ لا تمتلك صلاحية إغلاق التذكرة!', ephemeral: true });

        const controlRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_unlock').setLabel('فتح التذكرة').setEmoji('🔓').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('ticket_save_log').setLabel('حفظ الترانسكريبت').setEmoji('📁').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('ticket_delete').setLabel('حذف التذكرة').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
        );

        await interaction.update({
          content: `🔒 **تم طلب إغلاق التذكرة بواسطة:** ${interaction.user}`,
          components: [controlRow]
        });

        if (ownerId) {
          await interaction.channel.permissionOverwrites.edit(ownerId, { SendMessages: false }).catch(() => {});
        }
        return;
      }

      // د. زر إعادة فتح التذكرة
      if (interaction.customId === 'ticket_unlock') {
        if (!isAdmin && !isHighAdmin) return interaction.reply({ content: '❌ للإدارة فقط!', ephemeral: true });

        if (ownerId) {
          await interaction.channel.permissionOverwrites.edit(ownerId, { SendMessages: true }).catch(() => {});
        }

        const reopenRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_close_req').setLabel('إغلاق التذكرة').setEmoji('🔒').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('ticket_claim_btn').setLabel('استلام التذكرة').setEmoji('📌').setStyle(ButtonStyle.Primary)
        );

        await interaction.update({ content: `🔓 **تم إعادة فتح التذكرة بواسطة:** ${interaction.user}`, components: [reopenRow] });
        return;
      }

      // هـ. زر حفظ الترانسكريبت
      if (interaction.customId === 'ticket_save_log') {
        const saveAllowed = perms.save_permission === 'admin_only' ? isHighAdmin : (isAdmin || isHighAdmin);
        if (!saveAllowed) return interaction.reply({ content: '❌ لا تمتلك صلاحية حفظ الترانسكريبت!', ephemeral: true });

        await interaction.deferReply({ ephemeral: true });
        const success = await saveTranscript(interaction.channel, config, interaction.user, { ownerId });
        if (success) return interaction.editReply({ content: '✅ تم حفظ الترانسكريبت وإرساله إلى روم اللوق بنجاح!' });
        return interaction.editReply({ content: '❌ تعذر العثور على روم اللوق أو إنشاء الملف.' });
      }

      // و. زر حذف التذكرة
      if (interaction.customId === 'ticket_delete') {
        const deleteAllowed = perms.delete_permission === 'all_admin' ? (isAdmin || isHighAdmin) : isHighAdmin;
        if (!deleteAllowed) return interaction.reply({ content: '❌ لا تمتلك صلاحية حذف التذكرة (مخصص للإدارة العليا)!', ephemeral: true });

        await interaction.reply({ content: '🗑️ سيتم حذف التذكرة خلال 3 ثوانٍ...' });
        setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
        return;
      }
    }

  } catch (err) {
    console.error('Error handling interaction:', err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ حدث خطأ أثناء تنفيذ الأوامر.', ephemeral: true }).catch(() => {});
    }
  }
});

// ==========================================
// 5. تشغيل البوت
// ==========================================
client.login(process.env.DISCORD_TOKEN);
