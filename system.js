const { 
  EmbedBuilder, 
  PermissionFlagsBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder, 
  StringSelectMenuOptionBuilder 
} = require('discord.js');

let suggestionsChannelIds = new Set();
let taxChannelIds = new Set();

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

module.exports = function(client, PREFIX = '!', pool) {

  client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // ==========================================
    // أوامر النقاط المضبوطة بدقة (!نقاطي / !نقاط)
    // ==========================================
    if (message.content.startsWith(PREFIX + 'نقاط') || message.content.startsWith(PREFIX + 'points')) {
      const args = message.content.split(/\s+/);
      const subCommand = args[1]; // قد تكون: +, -, أو ذكر شخص (@user)، أو فارغة

      // 1. أمر الاستعلام الشخصي (!نقاطي) أو العام بدون منشن
      if (!subCommand || (message.mentions.users.size === 0 && subCommand !== '+' && subCommand !== '-' && subCommand.toLowerCase() !== 'me')) {
        const targetUser = message.mentions.users.first() || message.author;
        const res = await pool.query('SELECT points FROM admin_points WHERE user_id = $1', [targetUser.id]);
        const points = res.rows[0] ? res.rows[0].points : 0;

        const embed = new EmbedBuilder()
          .setTitle('📊 نظام نقاط الإدارة')
          .setDescription(`الإداري: ${targetUser}\nرصيد النقاط: **${points} نقطة** 🎫`)
          .setColor(0x0284c7)
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      // إذا كان الأمر !نقاطي كتابةً صريحة
      if (subCommand && subCommand.toLowerCase() === 'me') {
        const res = await pool.query('SELECT points FROM admin_points WHERE user_id = $1', [message.author.id]);
        const points = res.rows[0] ? res.rows[0].points : 0;

        const embed = new EmbedBuilder()
          .setTitle('📊 نظام نقاط الإدارة')
          .setDescription(`الإداري: ${message.author}\nرصيد النقاط: **${points} نقطة** 🎫`)
          .setColor(0x0284c7)
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      // 2. أمر تعديل النقاط للإدارة (+ أو -)
      if (subCommand === '+' || subCommand === '-') {
        const isAdm = message.member.permissions.has(PermissionFlagsBits.Administrator) || message.member.roles.cache.size > 1;
        if (!isAdm) {
          return message.reply({ content: '❌ عذراً، أوامر تعديل النقاط مخصصة للإدارة (Admin) فقط!' });
        }

        const targetUser = message.mentions.users.first();
        const amount = parseInt(args[3]);

        if (!targetUser || isNaN(amount)) {
          return message.reply({ content: `❌ الاستخدام الخاطئ للأمر!\nالصيغة الصحيحة:\n\`${PREFIX}نقاط + @الشخص 5\`\n\`${PREFIX}نقاط - @الشخص 3\`` });
        }

        const currentRes = await pool.query('SELECT points FROM admin_points WHERE user_id = $1', [targetUser.id]);
        let currentPoints = currentRes.rows[0] ? currentRes.rows[0].points : 0;

        let newPoints = subCommand === '+' ? currentPoints + amount : Math.max(0, currentPoints - amount);

        await pool.query(`
          INSERT INTO admin_points (user_id, points) VALUES ($1, $2)
          ON CONFLICT (user_id) DO UPDATE SET points = $2;
        `, [targetUser.id, newPoints]);

        return message.reply({ content: `✅ تم ${subCommand === '+' ? 'إضافة' : 'خصم'} **${amount} نقطة** ${subCommand === '+' ? 'إلى' : 'من'} ${targetUser}.\nالرصيد الجديد: **${newPoints} نقطة**.` });
      }

      // 3. الاستعلام عن نقاط شخص بالمنشن (!نقاط @الشخص)
      if (message.mentions.users.size > 0) {
        const targetUser = message.mentions.users.first();
        const res = await pool.query('SELECT points FROM admin_points WHERE user_id = $1', [targetUser.id]);
        const points = res.rows[0] ? res.rows[0].points : 0;

        const embed = new EmbedBuilder()
          .setTitle('📊 نظام نقاط الإدارة')
          .setDescription(`الإداري: ${targetUser}\nرصيد النقاط: **${points} نقطة** 🎫`)
          .setColor(0x0284c7)
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }
    }

    // ==========================================
    // الأوامر القديمة كما هي تماماً دون أي مساس
    // ==========================================

    // أمر الضريبة (!tax)
    if (message.content.startsWith(PREFIX + 'tax')) {
      const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
      const rawInput = args[1];
      const amount = parseAmount(rawInput);

      if (!amount || amount <= 0) {
        return message.reply({ content: '❌ يرجى إدخال مبلغ صحيح للحساب! (مثال: `!tax 1000` أو `!tax 1k` أو `!tax 1m`)' });
      }

      const tax = Math.floor(amount * 20 / 19);
      const taxDiff = tax - amount;
      const profit = Math.floor(tax * 19 / 20);

      const embed = new EmbedBuilder()
        .setTitle('💰 حاسبة الضريبة المتقدمة')
        .addFields(
          { name: '📥 المبلغ الأساسي:', value: `\`${amount.toLocaleString()}\``, inline: true },
          { name: '💸 مبلغ الوسيط/المبلغ مع الضريبة:', value: `\`${tax.toLocaleString()}\``, inline: true },
          { name: '🏛️ مبلغ عمولة البائع (الخصم):', value: `\`${taxDiff.toLocaleString()}\``, inline: true }
        )
        .setColor('#38bdf8')
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // أمر المساعدة ($help)
    if (message.content.startsWith('$help') || message.content.startsWith('!help')) {
      const helpEmbed = new EmbedBuilder()
        .setTitle('📚 لوحة المساعدة وأوامر البوت')
        .setDescription('اختر القسم المطلوب من القائمة أدناه لمعرفة تفاصيل الأوامر وطرق الاستخدام:')
        .setColor('#0284c7')
        .setTimestamp();

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('help_select_command')
        .setPlaceholder('اختر الأمر لعرض التفاصيل... 🔽')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('أمر الضريبة (!tax)').setValue('cmd_tax').setDescription('حساب نسبة ضريبة المتاجر والوسائط').setEmoji('💰'),
          new StringSelectMenuOptionBuilder().setLabel('أمر النقاط (!نقاط)').setValue('cmd_points').setDescription('عرض نقاط الاستلام وتعديلها للإدارة').setEmoji('📊'),
          new StringSelectMenuOptionBuilder().setLabel('أمر تغيير اسم الروم (!rename)').setValue('cmd_rename').setDescription('شرح تغيير اسم القناة النصية').setEmoji('🏷️')
        );

      const row = new ActionRowBuilder().addComponents(selectMenu);
      return message.reply({ embeds: [helpEmbed], components: [row] });
    }
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isStringSelectMenu() || interaction.customId !== 'help_select_command') return;

    const selectedKey = interaction.values[0];
    let title = 'معلومات الأمر';
    let desc = 'تفاصيل الأمر المحدد';
    let usage = '!help';

    if (selectedKey === 'cmd_tax') {
      title = '💰 أمر حساب الضريبة (!tax)';
      desc = 'يحسب لك مبلغ الضريبة مع عمولة الديسكورد والوسيط بدقة فائقة.';
      usage = '!tax 1000 أو !tax 1k أو !tax 1m';
    } else if (selectedKey === 'cmd_points') {
      title = '📊 نظام نقاط الاستلام (!نقاط)';
      desc = 'يُظهر نقاط الإداري عند استلام التذاكر وتعديلها.';
      usage = '!نقاطي | !نقاط @الشخص | !نقاط + @الشخص 5';
    } else if (selectedKey === 'cmd_rename') {
      title = '🏷️ أمر تغيير اسم الروم (!rename)';
      desc = 'مخصص لتغيير اسم القناة الحالية.';
      usage = '!rename [الاسم الجديد]';
    }

    const detailEmbed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(desc)
      .addFields({ name: '📝 طريقة الاستخدام:', value: usage, inline: false })
      .setColor('#10b981')
      .setTimestamp();

    return interaction.reply({ embeds: [detailEmbed], ephemeral: true });
  });
};
