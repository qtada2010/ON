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
const loadSystemCommands = require('./system');

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

    console.log('🐘 تم تحديث الجداول بنجاح!');
  } catch (err) {
    console.error('❌ خطأ في قاعدة البيانات:', err);
  }
}
initDatabase();

// ==========================================
// 2. إعداد ديسكورد
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

// تشغيل نظام الأوامر الإضافية من system.js
loadSystemCommands(client, PREFIX);

// ==========================================
// 3. خادم الويب (Express)
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
      <title>تسجيل الدخول</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display:flex; justify-content:center; align-items:center; height:100vh; margin:0; }
        .login-card { background: #1e293b; padding: 40px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); width: 100%; max-width: 400px; text-align: center; border: 1px solid #334155; }
        h2 { color: #38bdf8; margin-bottom: 20px; }
        input[type="password"] { width: 100%; padding: 12px; margin: 10px 0; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; }
        button { width: 100%; padding: 12px; background: #0284c7; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }
      </style>
    </head>
    <body>
      <div class="login-card">
        <h2>🔒 لوحة التحكم</h2>
        <form action="/login" method="POST">
          <input type="password" name="password" placeholder="أدخل كلمة المرور" required>
          <button type="submit">تسجيل الدخول</button>
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
    res.redirect('/login');
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
      <title>الرئيسية</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin:0; padding:0; }
        nav { background: #1e293b; padding: 15px 30px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; }
        nav .links a { color: #38bdf8; text-decoration: none; font-weight: bold; margin-left: 20px; }
        .container { max-width: 950px; margin: 40px auto; background: #1e293b; padding: 30px; border-radius: 12px; border: 1px solid #334155; text-align: center; }
        h1 { color: #38bdf8; }
        .btn { display: inline-block; padding: 12px 24px; background: #0284c7; color: white; border-radius: 6px; text-decoration: none; font-weight: bold; margin: 5px; }
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
        <h1>🎮 لوحة التحكم الإدارية</h1>
        <p style="color:#94a3b8;">إدارة التذاكر مع رتبة وكاتيجوري مخصص لكل خيار.</p>
        <div style="margin-top: 30px;">
          <a href="/panel" class="btn">🛠️ إدارة لوحات التذاكر</a>
          <a href="/apply-setup" class="btn" style="background:#eab308; color:#000;">📝 تقديم الإدارة</a>
          <a href="/admin-commands" class="btn" style="background:#8b5cf6;">🛡️ الصلاحيات</a>
          <a href="/stats" class="btn" style="background:#059669;">📊 الإحصائيات</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// إدارة اللوحات
app.get('/panel', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM panels');
  let panelsListHTML = '';

  for (const p of result.rows) {
    const optionsRes = await pool.query('SELECT COUNT(*) FROM panel_options WHERE panel_id = $1', [p.panel_id]);
    const optionsCount = optionsRes.rows[0].count;

    panelsListHTML += `
      <div style="background:#0f172a; padding:15px; border-radius:8px; margin-bottom:15px; border:1px solid #334155; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h3 style="margin:0; color:#38bdf8;">📌 ${p.panel_id} - ${p.title}</h3>
          <p style="margin:5px 0 0 0; color:#94a3b8; font-size:14px;">النوع: ${p.type} | الخيارات: ${optionsCount}</p>
        </div>
        <div>
          <a href="/edit-panel/${p.panel_id}" style="background:#0284c7; color:white; padding:8px 15px; border-radius:5px; text-decoration:none; font-weight:bold; margin-left:5px;">✏️ تعديل</a>
          <a href="/delete-panel/${p.panel_id}" onclick="return confirm('حذف اللوحة؟')" style="background:#ef4444; color:white; padding:8px 15px; border-radius:5px; text-decoration:none; font-weight:bold;">🗑️ حذف</a>
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
        <h1 style="color:#38bdf8;">➕ إنشاء لوحة تذاكر</h1>
        <form action="/create-panel" method="POST">
          <label>معرف اللوحة (Panel ID):</label>
          <input type="text" name="panelId" placeholder="support" required>
          <div style="display:flex; gap:15px;">
            <div style="flex:1;">
              <label>النوع:</label>
              <select name="type">
                <option value="buttons">أزرار 🔘</option>
                <option value="select">قائمة منسدلة 📜</option>
              </select>
            </div>
            <div style="flex:1;">
              <label>نوع الرسالة:</label>
              <select name="messageType">
                <option value="embed">إيمبد 🎨</option>
                <option value="plain">عادية 💬</option>
              </select>
            </div>
          </div>
          <div style="display:flex; gap:15px;">
            <div style="flex:1;"><label>آيدي الروم:</label><input type="text" name="channelId" required></div>
            <div style="flex:1;"><label>آيدي الكاتيجوري الافتراضي:</label><input type="text" name="categoryId" required></div>
          </div>
          <div style="display:flex; gap:15px;">
            <div style="flex:1;"><label>آيدي رتبة الإدارة العامة:</label><input type="text" name="adminRoleId" required></div>
            <div style="flex:1;"><label>آيدي رتبة الإدارة العليا:</label><input type="text" name="highAdminRoleId" required></div>
          </div>
          <label>آيدي روم السجل (Log):</label><input type="text" name="logChannelId" required>
          <label>العنوان:</label><input type="text" name="title" value="الدعم الفني" required>
          <label>الوصف:</label><textarea name="description" rows="2" required>اختر القسم المناسب</textarea>
          <button type="submit">حفظ والانتقال لإضافة الأزرار ➡️</button>
        </form>
        <hr style="margin: 30px 0; border-color: #334155;">
        <h2 style="color:#38bdf8;">📋 اللوحات:</h2>
        ${panelsListHTML || '<p>لا توجد لوحات.</p>'}
      </div>
    </body>
    </html>
  `);
});

app.post('/create-panel', requireAuth, async (req, res) => {
  const d = req.body;
  await pool.query(`
    INSERT INTO panels (panel_id, channel_id, category_id, admin_role_id, high_admin_role_id, log_channel_id, title, description, type, message_type)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (panel_id) DO UPDATE SET
      channel_id = EXCLUDED.channel_id, category_id = EXCLUDED.category_id,
      admin_role_id = EXCLUDED.admin_role_id, high_admin_role_id = EXCLUDED.high_admin_role_id,
      log_channel_id = EXCLUDED.log_channel_id, title = EXCLUDED.title,
      description = EXCLUDED.description, type = EXCLUDED.type, message_type = EXCLUDED.message_type;
  `, [d.panelId.trim(), d.channelId.trim(), d.categoryId.trim(), d.adminRoleId.trim(), d.highAdminRoleId.trim(), d.logChannelId.trim(), d.title, d.description, d.type, d.messageType]);

  res.redirect(`/edit-panel/${d.panelId.trim()}`);
});

app.get('/delete-panel/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM panels WHERE panel_id = $1', [req.params.id]);
  res.redirect('/panel');
});

// صفحة التعديل وإضافة الخيارات مع الرتب والكاتيجوري الخاص
app.get('/edit-panel/:id', requireAuth, async (req, res) => {
  const pRes = await pool.query('SELECT * FROM panels WHERE panel_id = $1', [req.params.id]);
  const panel = pRes.rows[0];
  if (!panel) return res.send('غير موجود');

  const optionsRes = await pool.query('SELECT * FROM panel_options WHERE panel_id = $1 ORDER BY id ASC', [panel.panel_id]);
  let optionsHTML = '';

  optionsRes.rows.forEach((opt, index) => {
    optionsHTML += `
      <div style="background:#0f172a; padding:15px; border-radius:8px; margin-bottom:15px; border:1px solid #334155;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="color:#eab308; font-weight:bold;">#${index + 1} ${opt.label}</span>
          <a href="/delete-option/${opt.id}/${panel.panel_id}" style="color:#ef4444; font-weight:bold; text-decoration:none;">🗑️ حذف</a>
        </div>
        <p style="margin:5px 0; color:#38bdf8; font-size:13px;">
          🛡️ رتبة الإدارة الخاصة: <strong>${opt.custom_admin_role_id || 'افتراضية'}</strong><br>
          📁 آيدي الكاتيجوري المخصص: <strong>${opt.custom_category_id || 'افتراضي'}</strong>
        </p>
      </div>
    `;
  });

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>تعديل ${panel.panel_id}</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin:0; padding:0; }
        nav { background: #1e293b; padding: 15px 30px; display: flex; justify-content: space-between; border-bottom: 1px solid #334155; }
        nav .links a { color: #38bdf8; text-decoration: none; font-weight: bold; margin-left: 20px; }
        .container { max-width: 900px; margin: 40px auto; background: #1e293b; padding: 30px; border-radius: 12px; border: 1px solid #334155; }
        label { display: block; margin-top: 10px; font-weight: bold; color:#cbd5e1; }
        input, select, textarea { width: 100%; padding: 10px; margin-top: 5px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; }
        .btn-add { background: #10b981; color: white; padding: 12px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; margin-top: 15px; }
        .btn-send { background: #0284c7; color: white; padding: 15px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; width: 48%; }
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
        <h1 style="color:#38bdf8;">⚙️ تعديل الأزرار: ${panel.title}</h1>
        <form action="/add-option" method="POST" style="background:#0f172a; padding:20px; border-radius:8px; border:1px solid #334155;">
          <input type="hidden" name="panelId" value="${panel.panel_id}">
          <label>اسم الزر / الخيار:</label><input type="text" name="label" required>
          <div style="display:flex; gap:15px;">
            <div style="flex:1;"><label>الوصف:</label><input type="text" name="description"></div>
            <div style="flex:1;"><label>الإيموجي:</label><input type="text" name="emoji"></div>
          </div>
          <div style="display:flex; gap:15px; margin-top:10px;">
            <div style="flex:1;"><label style="color:#38bdf8;">🛡️ آيدي رتبة الإدارة الخاصة:</label><input type="text" name="customAdminRoleId" placeholder="اختياري"></div>
            <div style="flex:1;"><label style="color:#38bdf8;">📁 آيدي الكاتيجوري الخاص:</label><input type="text" name="customCategoryId" placeholder="اختياري"></div>
          </div>
          <label>رسالة الترحيب:</label><textarea name="welcomeMessage" rows="2" required>أهلاً بك!</textarea>
          <button type="submit" class="btn-add">➕ إضافة الزر</button>
        </form>
        <hr style="margin: 30px 0; border-color: #334155;">
        <h2 style="color:#38bdf8;">📋 الخيارات الحالية:</h2>
        ${optionsHTML || '<p>لا توجد خيارات.</p>'}
        ${optionsRes.rows.length > 0 ? `
          <form action="/publish-panel" method="POST" style="margin-top:20px;">
            <input type="hidden" name="panelId" value="${panel.panel_id}">
            <button type="submit" class="btn-send">🚀 نشر اللوحة بالديسكورد</button>
          </form>
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
  `, [d.panelId, optionId, d.label.trim(), d.description ? d.description.trim() : '', d.emoji ? d.emoji.trim() : '', d.welcomeMessage, 'Primary', d.customAdminRoleId ? d.customAdminRoleId.trim() : null, d.customCategoryId ? d.customCategoryId.trim() : null]);

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

  try {
    const channel = await client.channels.fetch(panel.channel_id);
    const components = [];

    if (panel.type === 'select') {
      const selectMenu = new StringSelectMenuBuilder().setCustomId(`ticket_select_${panel.panel_id}`).setPlaceholder('اختر القسم...');
      optionsRes.rows.forEach(opt => {
        const o = new StringSelectMenuOptionBuilder().setLabel(opt.label).setValue(opt.option_id);
        if (opt.description) o.setDescription(opt.description);
        if (opt.emoji) { try { o.setEmoji(opt.emoji); } catch(e){} }
        selectMenu.addOptions(o);
      });
      components.push(new ActionRowBuilder().addComponents(selectMenu));
    } else {
      let row = new ActionRowBuilder();
      optionsRes.rows.forEach((opt, idx) => {
        if (idx > 0 && idx % 5 === 0) { components.push(row); row = new ActionRowBuilder(); }
        const btn = new ButtonBuilder().setCustomId(`ticket_btn_${opt.option_id}`).setLabel(opt.label).setStyle(ButtonStyle.Primary);
        if (opt.emoji) { try { btn.setEmoji(opt.emoji); } catch(e){} }
        row.addComponents(btn);
      });
      components.push(row);
    }

    const embed = new EmbedBuilder().setTitle(panel.title).setDescription(panel.description).setColor(0x0284c7);
    const sentMsg = await channel.send({ embeds: [embed], components });
    await pool.query('UPDATE panels SET last_message_id = $1 WHERE panel_id = $2', [sentMsg.id, panel.panel_id]);

    res.send('<h2>✅ تم النشر بنجاح!</h2><a href="/panel">العودة</a>');
  } catch (err) {
    res.send(`❌ خطأ: ${err.message}`);
  }
});

// تقديم الإدارة
app.get('/apply-setup', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM apply_setup WHERE id = $1', ['main_apply']);
  const appData = result.rows[0] || {};
  res.send(`
    <!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تقديم الإدارة</title>
    <style>body{font-family:system-ui,sans-serif;background:#0f172a;color:#f8fafc;margin:0;padding:0;}nav{background:#1e293b;padding:15px 30px;display:flex;justify-content:space-between;border-bottom:1px solid #334155;}nav .links a{color:#38bdf8;text-decoration:none;font-weight:bold;margin-left:20px;}.container{max-width:900px;margin:40px auto;background:#1e293b;padding:30px;border-radius:12px;border:1px solid #334155;}label{display:block;margin-top:12px;font-weight:bold;color:#cbd5e1;}input,textarea{width:100%;padding:10px;margin-top:5px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#fff;box-sizing:border-box;}button{margin-top:20px;padding:12px;background:#eab308;color:#000;border:none;border-radius:6px;font-weight:bold;cursor:pointer;width:100%;}</style></head>
    <body>
      <nav><div class="links"><a href="/">الرئيسية 🏠</a><a href="/panel">إدارة التذاكر ⚙️</a><a href="/apply-setup">تقديم الإدارة 📝</a><a href="/admin-commands">الصلاحيات 🛡️</a><a href="/stats">الإحصائيات 📊</a></div><a href="/logout" style="color:#ef4444;font-weight:bold;text-decoration:none;">خروج 🚪</a></nav>
      <div class="container">
        <h1 style="color:#eab308;">📝 إعداد التقديم</h1>
        <form action="/save-apply-setup" method="POST">
          <label>العنوان:</label><input type="text" name="title" value="${appData.title || 'تقديم الإدارة'}" required>
          <label>الوصف:</label><textarea name="description" rows="3" required>${appData.description || 'اضغط للتقديم'}</textarea>
          <label>آيدي روم الإرسال:</label><input type="text" name="submitChannelId" value="${appData.submit_channel_id || ''}" required>
          <label>آيدي روم المراجعة:</label><input type="text" name="reviewChannelId" value="${appData.review_channel_id || ''}" required>
          <label>آيدي روم النتائج:</label><input type="text" name="resultsChannelId" value="${appData.results_channel_id || ''}" required>
          <label>آيدي رتبة الإدارة العليا:</label><input type="text" name="highAdminRoleId" value="${appData.high_admin_role_id || ''}" required>
          <label>آيدي الرتبة المقبولة:</label><input type="text" name="acceptedRoleId" value="${appData.accepted_role_id || ''}" required>
          <label>السؤال 1:</label><input type="text" name="q1" value="${appData.q1 || 'اسمك وعمرك؟'}" required>
          <label>السؤال 2:</label><input type="text" name="q2" value="${appData.q2 || 'لماذا تريد الانضمام؟'}" required>
          <label>السؤال 3:</label><input type="text" name="q3" value="${appData.q3 || 'تفاعلك اليومي؟'}" required>
          <label>السؤال 4:</label><input type="text" name="q4" value="${appData.q4 || 'خبرة سابقة؟'}" required>
          <button type="submit">💾 حفظ ونشر</button>
        </form>
      </div></body></html>
  `);
});

app.post('/save-apply-setup', requireAuth, async (req, res) => {
  const d = req.body;
  await pool.query(`
    INSERT INTO apply_setup (id, title, description, submit_channel_id, review_channel_id, results_channel_id, high_admin_role_id, accepted_role_id, q1, q2, q3, q4)
    VALUES ('main_apply', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description, submit_channel_id=EXCLUDED.submit_channel_id, review_channel_id=EXCLUDED.review_channel_id, results_channel_id=EXCLUDED.results_channel_id, high_admin_role_id=EXCLUDED.high_admin_role_id, accepted_role_id=EXCLUDED.accepted_role_id, q1=EXCLUDED.q1, q2=EXCLUDED.q2, q3=EXCLUDED.q3, q4=EXCLUDED.q4;
  `, [d.title, d.description, d.submitChannelId.trim(), d.reviewChannelId.trim(), d.resultsChannelId.trim(), d.highAdminRoleId.trim(), d.acceptedRoleId.trim(), d.q1, d.q2, d.q3, d.q4]);

  try {
    const channel = await client.channels.fetch(d.submitChannelId.trim());
    if (channel) {
      const embed = new EmbedBuilder().setTitle(d.title).setDescription(d.description).setColor(0xeab308);
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('start_apply_form').setLabel('تقديم').setStyle(ButtonStyle.Success).setEmoji('📝'));
      await channel.send({ embeds: [embed], components: [row] });
    }
  } catch(e){}
  res.send('<h2>✅ تم الحفظ!</h2><a href="/apply-setup">العودة</a>');
});

// صلاحيات الأوامر
app.get('/admin-commands', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM permissions WHERE key = $1', ['main_permissions']);
  const perms = result.rows[0] || {};
  res.send(`
    <!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>الصلاحيات</title>
    <style>body{font-family:system-ui,sans-serif;background:#0f172a;color:#f8fafc;margin:0;padding:0;}nav{background:#1e293b;padding:15px 30px;display:flex;justify-content:space-between;border-bottom:1px solid #334155;}nav .links a{color:#38bdf8;text-decoration:none;font-weight:bold;margin-left:20px;}.container{max-width:850px;margin:40px auto;background:#1e293b;padding:30px;border-radius:12px;border:1px solid #334155;}label{display:block;margin-top:15px;font-weight:bold;color:#cbd5e1;}input,select{width:100%;padding:10px;margin-top:5px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#fff;box-sizing:border-box;}button{margin-top:25px;width:100%;padding:12px;background:#0284c7;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;}</style></head>
    <body>
      <nav><div class="links"><a href="/">الرئيسية 🏠</a><a href="/panel">إدارة التذاكر ⚙️</a><a href="/apply-setup">تقديم الإدارة 📝</a><a href="/admin-commands">الصلاحيات 🛡️</a><a href="/stats">الإحصائيات 📊</a></div><a href="/logout" style="color:#ef4444;font-weight:bold;text-decoration:none;">خروج 🚪</a></nav>
      <div class="container">
        <h1 style="color:#38bdf8;">🛡️ الصلاحيات</h1>
        <form action="/save-admin-commands" method="POST">
          <label>زر إغلاق التكت:</label>
          <select name="closePermission"><option value="both" ${perms.close_permission==='both'?'selected':''}>صاحب التكت والإدارة</option><option value="admin_only" ${perms.close_permission==='admin_only'?'selected':''}>الإدارة فقط</option></select>
          <label>زر حذف التكت:</label>
          <select name="deletePermission"><option value="high_admin" ${perms.delete_permission==='high_admin'?'selected':''}>الإدارة العليا</option><option value="all_admin" ${perms.delete_permission==='all_admin'?'selected':''}>كل الإدارة</option></select>
          <label>زر الترانسكريبت:</label>
          <select name="savePermission"><option value="both" ${perms.save_permission==='both'?'selected':''}>صاحب التكت والإدارة</option><option value="admin_only" ${perms.save_permission==='admin_only'?'selected':''}>الإدارة فقط</option></select>
          <button type="submit">💾 حفظ</button>
        </form>
      </div></body></html>
  `);
});

app.post('/save-admin-commands', requireAuth, async (req, res) => {
  const d = req.body;
  await pool.query(`
    INSERT INTO permissions (key, close_permission, delete_permission, save_permission)
    VALUES ('main_permissions', $1, $2, $3)
    ON CONFLICT (key) DO UPDATE SET close_permission=EXCLUDED.close_permission, delete_permission=EXCLUDED.delete_permission, save_permission=EXCLUDED.save_permission;
  `, [d.closePermission, d.deletePermission, d.savePermission]);
  res.send('<h2>✅ تم الحفظ!</h2><a href="/admin-commands">العودة</a>');
});

// الإحصائيات
app.get('/stats', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT total_tickets FROM stats WHERE key = $1', ['main_stats']);
  const total = result.rows[0] ? result.rows[0].total_tickets : 0;
  res.send(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>الإحصائيات</title><style>body{font-family:system-ui,sans-serif;background:#0f172a;color:#f8fafc;margin:0;padding:0;}nav{background:#1e293b;padding:15px 30px;display:flex;justify-content:space-between;border-bottom:1px solid #334155;}nav .links a{color:#38bdf8;text-decoration:none;font-weight:bold;margin-left:20px;}.container{max-width:800px;margin:40px auto;background:#1e293b;padding:30px;border-radius:12px;border:1px solid #334155;}</style></head><body><nav><div class="links"><a href="/">الرئيسية 🏠</a><a href="/panel">إدارة التذاكر ⚙️</a><a href="/apply-setup">تقديم الإدارة 📝</a><a href="/admin-commands">الصلاحيات 🛡️</a><a href="/stats">الإحصائيات 📊</a></div><a href="/logout" style="color:#ef4444;font-weight:bold;text-decoration:none;">خروج 🚪</a></nav><div class="container"><h1 style="color:#38bdf8;">📊 الإحصائيات</h1><h2>إجمالي التذاكر: <span style="color:#10b981;">${total}</span></h2></div></body></html>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 الويب يعمل على البورت ${PORT}`));

// ==========================================
// 4. الأحداث وتذاكر الديسكورد
// ==========================================
client.once('ready', async () => {
  console.log(`🤖 البوت يعمل باسم ${client.user.tag}!`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: [new SlashCommandBuilder().setName('help').toJSON()] });
  } catch(e){}
});

async function getTicketInfo(channel) {
  if (!channel.topic) return null;
  try { return JSON.parse(channel.topic); } catch (e) { return null; }
}

async function saveTranscript(channel, config, user, ticketData) {
  const logChannel = channel.guild.channels.cache.get(config.log_channel_id);
  if (!logChannel) return false;
  try {
    const attachment = await discordTranscripts.createTranscript(channel, { limit: -1, returnType: 'attachment', filename: `${channel.name}.html`, saveImages: true });
    await logChannel.send({ embeds: [new EmbedBuilder().setTitle('ترانسكريبت تذكرة').addFields({name:'التكت', value:channel.name, inline:true}, {name:'بواسطة', value:`${user}`, inline:true}).setColor(0x0284c7)], files: [attachment] });
    return true;
  } catch(e) { return false; }
}

// دالة فتح التذكرة مع سحب الرتبة والكاتيجوري الخاص
async function handleTicketCreation(interaction, optionId) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const optRes = await pool.query('SELECT * FROM panel_options WHERE option_id = $1', [optionId]);
    const option = optRes.rows[0];
    if (!option) return interaction.editReply({ content: '❌ الخيار غير موجود.' });

    const panelRes = await pool.query('SELECT * FROM panels WHERE panel_id = $1', [option.panel_id]);
    const config = panelRes.rows[0];
    if (!config) return;

    const targetAdminRoleId = option.custom_admin_role_id || config.admin_role_id;
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

    await pool.query(`INSERT INTO stats (key, total_tickets) VALUES ('main_stats', 1) ON CONFLICT (key) DO UPDATE SET total_tickets = stats.total_tickets + 1;`);
    await ticketChannel.setTopic(JSON.stringify({ ownerId: interaction.user.id, panelId: config.panel_id, optionId: option.option_id }));

    const welcomeEmbed = new EmbedBuilder().setTitle(`تذكرة: ${option.label}`).setDescription(`${option.welcome_message}\n\n👤 **الصاحب:** ${interaction.user}`).setColor(config.color || 0x0284c7);
    const buttonsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_close_req').setLabel('إغلاق').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
      new ButtonBuilder().setCustomId('ticket_save_log').setLabel('ترانسكريبت').setStyle(ButtonStyle.Secondary).setEmoji('📜'),
      new ButtonBuilder().setCustomId('ticket_delete').setLabel('حذف').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
    );

    await ticketChannel.send({ content: `${interaction.user} | <@&${targetAdminRoleId}>`, embeds: [welcomeEmbed], components: [buttonsRow] });
    return interaction.editReply({ content: `✅ تم فتح التذكرة: ${ticketChannel}` });
  } catch (err) {
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content: '❌ حدث خطأ.' });
  }
}

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isButton() && interaction.customId === 'start_apply_form') {
      const result = await pool.query('SELECT * FROM apply_setup WHERE id = $1', ['main_apply']);
      const appData = result.rows[0];
      const modal = new ModalBuilder().setCustomId('submit_apply_modal').setTitle('التقديم');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q1').setLabel(appData.q1.substring(0,45)).setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q2').setLabel(appData.q2.substring(0,45)).setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q3').setLabel(appData.q3.substring(0,45)).setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q4').setLabel(appData.q4.substring(0,45)).setStyle(TextInputStyle.Short).setRequired(true))
      );
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'submit_apply_modal') {
      await interaction.deferReply({ ephemeral: true });
      const result = await pool.query('SELECT * FROM apply_setup WHERE id = $1', ['main_apply']);
      const appData = result.rows[0];
      const reviewChannel = await interaction.guild.channels.fetch(appData.review_channel_id).catch(() => null);
      if (!reviewChannel) return interaction.editReply({ content: '❌ روم المراجعة غير موجود.' });

      let desc = `👤 **العضو:** ${interaction.user}\n1: ${interaction.fields.getTextInputValue('q1')}\n2: ${interaction.fields.getTextInputValue('q2')}`;
      const reviewEmbed = new EmbedBuilder().setDescription(desc).setColor(0xeab308);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`apply_accept_${interaction.user.id}`).setLabel('قبول').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`apply_reject_${interaction.user.id}`).setLabel('رفض').setStyle(ButtonStyle.Danger)
      );
      await reviewChannel.send({ embeds: [reviewEmbed], components: [row] });
      return interaction.editReply({ content: '✅ تم إرسال التقديم.' });
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
    const optRes = await pool.query('SELECT * FROM panel_options WHERE option_id = $1', [ticketData.optionId]);
    const option = optRes.rows[0] || {};
    const currentAdminRole = option.custom_admin_role_id || config.admin_role_id;

    const isAdmin = interaction.member.roles.cache.has(currentAdminRole);
    const isHighAdmin = interaction.member.roles.cache.has(config.high_admin_role_id);
    const isOwner = interaction.user.id === ticketData.ownerId;

    if (interaction.isButton() && interaction.customId === 'ticket_close_req') {
      await interaction.channel.permissionOverwrites.edit(ticketData.ownerId, { ViewChannel: false });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_reopen').setLabel('فتح').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ticket_delete').setLabel('حذف').setStyle(ButtonStyle.Danger)
      );
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔒 تم الإغلاق').setColor(0xef4444)], components: [row] });
    }

    if (interaction.isButton() && interaction.customId === 'ticket_reopen') {
      if (!isAdmin && !isHighAdmin) return interaction.reply({ content: '❌ للإدارة فقط', ephemeral: true });
      await interaction.channel.permissionOverwrites.edit(ticketData.ownerId, { ViewChannel: true, SendMessages: true });
      return interaction.reply({ content: '🔓 تم إعادة الفتح' });
    }

    if (interaction.isButton() && interaction.customId === 'ticket_save_log') {
      await interaction.deferReply();
      const success = await saveTranscript(interaction.channel, config, interaction.user, ticketData);
      return interaction.editReply({ content: success ? '✅ تم الحفظ' : '❌ تعذر الحفظ' });
    }

    if (interaction.isButton() && interaction.customId === 'ticket_delete') {
      if (!isHighAdmin) return interaction.reply({ content: '❌ للإدارة العليا فقط', ephemeral: true });
      await interaction.reply({ content: '🗑️ جاري الحذف...' });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 2000);
    }
  } catch (err) {}
});

client.login(process.env.DISCORD_TOKEN);
