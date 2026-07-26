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
        color VARCHAR(20) DEFAULT '#5865F2'
      );
    `);

    // 2. جدول خيارات القائمة المنسدلة للتذاكر
    await pool.query(`
      CREATE TABLE IF NOT EXISTS panel_options (
        id SERIAL PRIMARY KEY,
        panel_id VARCHAR(100) REFERENCES panels(panel_id) ON DELETE CASCADE,
        label VARCHAR(100) NOT NULL,
        value VARCHAR(100) NOT NULL,
        description TEXT,
        emoji VARCHAR(50),
        ticket_title TEXT,
        ticket_description TEXT,
        category_id VARCHAR(100),
        admin_role_id VARCHAR(100),
        high_admin_role_id VARCHAR(100),
        log_channel_id VARCHAR(100)
      );
    `);

    // 3. جدول صلاحيات أزرار التذكرة
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ticket_permissions (
        id VARCHAR(100) PRIMARY KEY,
        claim_permission VARCHAR(50) DEFAULT 'all_admin',
        close_permission VARCHAR(50) DEFAULT 'all_admin',
        delete_permission VARCHAR(50) DEFAULT 'high_admin_only',
        save_permission VARCHAR(50) DEFAULT 'all_admin'
      );
    `);

    // 4. جدول إعدادات التقديم للإدارة
    await pool.query(`
      CREATE TABLE IF NOT EXISTS apply_setup (
        id VARCHAR(100) PRIMARY KEY,
        channel_id VARCHAR(100),
        result_channel_id VARCHAR(100),
        admin_role_id VARCHAR(100),
        q1 TEXT, q2 TEXT, q3 TEXT, q4 TEXT, q5 TEXT
      );
    `);

    console.log('✅ تم إعداد وجاهزية قاعدة البيانات بنجاح!');
  } catch (err) {
    console.error('❌ خطأ أثناء تهيئة قاعدة البيانات:', err);
  }
}

initDatabase();

// ==========================================
// 2. إعداد خادم Express للوحة التحكم
// ==========================================
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// مسار فحص عمل الخادم
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// ==========================================
// 3. إعداد عميل الديسكورد (Discord Client)
// ==========================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

client.once('ready', () => {
  console.log(`🤖 تم تسجيل الدخول بنجاح باسم: ${client.user.tag}`);
});

// ==========================================
// 4. دالة مساعدة لحفظ الترانسكريبت (Transcripts)
// ==========================================
async function saveTranscript(channel, config, user, ticketData) {
  try {
    const logChannelId = ticketData?.log_channel_id || config?.log_channel_id;
    if (!logChannelId) return false;

    const logChannel = channel.guild.channels.cache.get(logChannelId);
    if (!logChannel) return false;

    const attachment = await discordTranscripts.createTranscript(channel, {
      limit: -1,
      returnType: 'attachment',
      filename: `transcript-${channel.name}.html`,
      saveImages: true,
      poweredBy: false
    });

    const embed = new EmbedBuilder()
      .setTitle('📄 سجّل التذكرة (Transcript)')
      .addFields(
        { name: 'اسم القناة:', value: channel.name, inline: true },
        { name: 'بواسطة:', value: `${user}`, inline: true }
      )
      .setColor('#3b82f6')
      .setTimestamp();

    await logChannel.send({ embeds: [embed], files: [attachment] });
    return true;
  } catch (err) {
    console.error('❌ خطأ أثناء حفظ الترانسكريبت:', err);
    return false;
  }
}

// ==========================================
// 5. معالج التفاعلات والأزرار والتذاكر
// ==========================================
client.on('interactionCreate', async (interaction) => {
  try {
    // أ) معالجة التقديم للإدارة (Modal Submit)
    if (interaction.isModalSubmit() && interaction.customId === 'submit_apply_modal') {
      await interaction.deferReply({ ephemeral: true });

      const appRes = await pool.query('SELECT * FROM apply_setup WHERE id = $1', ['main_apply']);
      const appData = appRes.rows[0];

      if (!appData || !appData.result_channel_id) {
        return interaction.editReply({ content: '❌ تعذر العثور على روم نتائج التقديمات!' });
      }

      const resultChannel = interaction.guild.channels.cache.get(appData.result_channel_id);
      if (!resultChannel) {
        return interaction.editReply({ content: '❌ روم نتائج التقديم غير موجود بالسيرفر!' });
      }

      const q1 = interaction.fields.getTextInputValue('q1') || 'بدون إجابة';
      const q2 = appData.q2 ? interaction.fields.getTextInputValue('q2') : null;
      const q3 = appData.q3 ? interaction.fields.getTextInputValue('q3') : null;
      const q4 = appData.q4 ? interaction.fields.getTextInputValue('q4') : null;
      const q5 = appData.q5 ? interaction.fields.getTextInputValue('q5') : null;

      const embed = new EmbedBuilder()
        .setTitle('📥 تقديم جديد على الإدارة')
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .setColor('#eab308')
        .addFields(
          { name: '👤 المتقدم:', value: `${interaction.user} (${interaction.user.tag})`, inline: false },
          { name: `1️⃣ ${appData.q1 || 'السؤال الأول'}`, value: q1, inline: false }
        )
        .setTimestamp();

      if (q2) embed.addFields({ name: `2️⃣ ${appData.q2}`, value: q2, inline: false });
      if (q3) embed.addFields({ name: `3️⃣ ${appData.q3}`, value: q3, inline: false });
      if (q4) embed.addFields({ name: `4️⃣ ${appData.q4}`, value: q4, inline: false });
      if (q5) embed.addFields({ name: `5️⃣ ${appData.q5}`, value: q5, inline: false });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`accept_apply_${interaction.user.id}`).setLabel('قبول').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`reject_apply_${interaction.user.id}`).setLabel('رفض').setStyle(ButtonStyle.Danger)
      );

      await resultChannel.send({ embeds: [embed], components: [row] });
      return interaction.editReply({ content: '✅ تم إرسال طلب التقديم بنجاح! نتمنى لك التوفيق.' });
    }

    // ب) معالجة التفاعل مع أزرار التكت (إغلاق، استلام، حذف، إلخ)
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    // استدعاء صلاحيات الأزرار
    const permRes = await pool.query('SELECT * FROM ticket_permissions WHERE id = $1', ['main_perms']);
    const perms = permRes.rows[0] || {
      claim_permission: 'all_admin',
      close_permission: 'all_admin',
      delete_permission: 'high_admin_only',
      save_permission: 'all_admin'
    };

    const isOwner = interaction.guild.ownerId === interaction.user.id;
    const memberRoles = interaction.member.roles.cache;

    // التحقق من التكت والمعطيات
    let ticketData = null;
    let config = null;

    if (interaction.channel.name.includes('ticket-') || interaction.channel.name.includes('تكت-')) {
      const pRes = await pool.query('SELECT * FROM panels LIMIT 1');
      config = pRes.rows[0];
    }

    const isAdmin = config?.admin_role_id && memberRoles.has(config.admin_role_id);
    const isHighAdmin = config?.high_admin_role_id && memberRoles.has(config.high_admin_role_id);

    // 1. زر إغلاق التذكرة
    if (interaction.isButton() && interaction.customId === 'ticket_close') {
      const closeAllowed = perms.close_permission === 'admin_only' ? (isAdmin || isHighAdmin) : (isAdmin || isHighAdmin || isOwner);
      if (!closeAllowed) return interaction.reply({ content: '❌ لا تمتلك صلاحية إغلاق التذكرة!', ephemeral: true });

      await interaction.reply({ content: '🔒 جاري إغلاق التذكرة...' });
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: false });
      
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_reopen').setLabel('إعادة فتح').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ticket_save_log').setLabel('حفظ اللوق').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_delete').setLabel('حذف التكت').setStyle(ButtonStyle.Danger)
      );

      return interaction.channel.send({ content: '🔒 تم إغلاق التذكرة.', components: [row] });
    }

    // 2. زر إعادة فتح التذكرة
    if (interaction.isButton() && interaction.customId === 'ticket_reopen') {
      await interaction.reply({ content: '🔓 تم إعادة فتح التذكرة بنجاح.', ephemeral: true });
      return interaction.channel.send({ content: `🔓 تم إعادة فتح التذكرة بواسطة ${interaction.user}` });
    }

    // 3. زر حفظ اللوق (Transcript)
    if (interaction.isButton() && interaction.customId === 'ticket_save_log') {
      const saveAllowed = perms.save_permission === 'admin_only' ? (isAdmin || isHighAdmin) : (isAdmin || isHighAdmin || isOwner);
      if (!saveAllowed) return interaction.reply({ content: '❌ لا تمتلك صلاحية حفظ الترانسكريبت!', ephemeral: true });

      await interaction.deferReply();
      const success = await saveTranscript(interaction.channel, config, interaction.user, ticketData);
      if (success) return interaction.editReply({ content: '✅ تم إنشاء ملف الترانسكريبت وإرساله إلى روم اللوق!' });
      return interaction.editReply({ content: '❌ تعذر العثور على قناة اللوق.' });
    }

    // 4. زر حذف التذكرة
    if (interaction.isButton() && interaction.customId === 'ticket_delete') {
      const deleteAllowed = perms.delete_permission === 'all_admin' ? (isAdmin || isHighAdmin) : isHighAdmin;
      if (!deleteAllowed) return interaction.reply({ content: '❌ لا تمتلك صلاحية حذف التكت!', ephemeral: true });

      await interaction.reply({ content: '🗑️ سيتم حذف التذكرة خلال 3 ثوانٍ...' });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
    }

  } catch (err) {
    console.error('❌ خطأ أثناء معالجة التفاعل:', err);
  }
});

// ==========================================
// 6. استدعاء ملف النظام والأوامر الإضافية
// ==========================================
require('./system.js')(client, '!');

// ==========================================
// 7. تشغيل الخادم وتسجيل الدخول
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 خادم لوحة التحكم يعمل الآن على المنفذ: ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN);
