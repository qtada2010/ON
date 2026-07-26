const { 
  EmbedBuilder, 
  PermissionFlagsBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder, 
  StringSelectMenuOptionBuilder 
} = require('discord.js');

// متغير لحفظ آيدي روم الاقتراحات في الذاكرة
let suggestionsChannelId = null;

module.exports = function(client, PREFIX = '!') {

  // =================================================================
  // 🟢 [بداية قسم 1: نظام الاقتراحات التلقائي]
  // =================================================================
  client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // أ) أمر تحديد روم الاقتراحات (!اقتراحات)
    if (message.content.startsWith(PREFIX)) {
      const args = message.content.slice(PREFIX.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();

      if (command === 'اقتراحات' || command === 'set-suggestions') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels) && !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return message.reply('❌ ليس لديك صلاحية لتحديد روم الاقتراحات.');
        }

        const targetChannel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]) || message.channel;
        suggestionsChannelId = targetChannel.id;

        return message.reply(`✅ تم تحديد ${targetChannel} كروم رسمي للاقتراحات بنجاح!`);
      }
    }

    // ب) تحويل الرسائل في روم الاقتراحات إلى إيمبد مع أزرار تصويت
    if (suggestionsChannelId && message.channel.id === suggestionsChannelId) {
      await message.delete().catch(() => {});

      const suggestionEmbed = new EmbedBuilder()
        .setAuthor({ name: `اقتراح بواسطة: ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
        .setDescription(message.content)
        .setColor('#eab308')
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: '💡 شارك برأيك حول هذا الاقتراح عبر الأزرار بالأسفل' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('suggest_yes').setLabel('0').setEmoji('👍').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('suggest_no').setLabel('0').setEmoji('👎').setStyle(ButtonStyle.Danger)
      );

      await message.channel.send({ embeds: [suggestionEmbed], components: [row] });
    }
  });

  // تفاعل أزرار التصويت على الاقتراحات
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId !== 'suggest_yes' && interaction.customId !== 'suggest_no') return;

    const message = interaction.message;
    const components = message.components[0].components;

    let yesBtn = ButtonBuilder.from(components[0]);
    let noBtn = ButtonBuilder.from(components[1]);

    let yesCount = parseInt(yesBtn.data.label) || 0;
    let noCount = parseInt(noBtn.data.label) || 0;

    if (interaction.customId === 'suggest_yes') yesCount += 1;
    if (interaction.customId === 'suggest_no') noCount += 1;

    yesBtn.setLabel(`${yesCount}`);
    noBtn.setLabel(`${noCount}`);

    const newRow = new ActionRowBuilder().addComponents(yesBtn, noBtn);
    await interaction.update({ components: [newRow] });
  });
  // =================================================================
  // 🔴 [نهاية قسم 1: نظام الاقتراحات التلقائي]
  // =================================================================


  // =================================================================
  // 🟢 [بداية قسم 2: أمر المساعدة $help والقائمة المنسدلة]
  // =================================================================
  
  // دالة تُعيد معلومات تفصيلية عن كل أمر
  function getCommandDetails(cmdKey) {
    const details = {
      'cmd_help': {
        title: '❓ أمر المساعدة ($help)',
        description: 'عرض القائمة الرئيسية للأوامر ورابط لوحة التحكم.',
        usage: '`$help`',
        permissions: 'متاح للجميع'
      },
      'cmd_suggestions': {
        title: '💡 أمر تحديد الاقتراحات (!اقتراحات)',
        description: 'تحديد روم رسمي للاقتراحات. يتم تحويل أي رسالة بداخل الروم تلقائياً إلى إيمبد مع أزرار تصويت (👍 / 👎).',
        usage: '`!اقتراحات` أو `!اقتراحات #الروم`',
        permissions: 'إدارة القنوات (Manage Channels)'
      },
      'cmd_ban': {
        title: '🔨 أمر الحظر (!ban / !unban)',
        description: 'حظر عضو من السيرفر بشكل دائم أو فك الحظر بواسطة آيدي الحساب.',
        usage: '`!ban @user [السبب]`\n`!unban [User_ID]`',
        permissions: 'حظر الأعضاء (Ban Members)'
      },
      'cmd_timeout': {
        title: '⏰ أمر التايم أوت (!time / !untime)',
        description: 'كتم العضو مؤقتاً بالدقائق عن الكتابة والصوت أو إزالة التايم أوت عنه.',
        usage: '`!time @user [المدّة بالدقائق]`\n`!untime @user`',
        permissions: 'إدارة الأعضاء (Moderate Members)'
      },
      'cmd_lock': {
        title: '🔒 أمر إغلاق وفتح الروم (!lock / !unlock)',
        description: 'قفل القناة النصية لمنع الأعضاء من الكتابة أو إعادة فتحها.',
        usage: '`!lock` / `!unlock`',
        permissions: 'إدارة القنوات (Manage Channels)'
      },
      'cmd_hide': {
        title: '🙈 أمر إخفاء وإظهار الروم (!hide / !show)',
        description: 'إخفاء الروم عن باقي الأعضاء بالكامل أو إعادة إظهاره.',
        usage: '`!hide` / `!show`',
        permissions: 'إدارة القنوات (Manage Channels)'
      },
      'cmd_clear': {
        title: '🧹 أمر مسح الرسائل (!مسح / !clear)',
        description: 'مسح كمية محددة من الرسائل في الروم بحد أقصى 100 رسالة دفعة واحدة.',
        usage: '`!مسح [العدد]`',
        permissions: 'إدارة الرسائل (Manage Messages)'
      },
      'cmd_rename': {
        title: '🏷️ أمر تغيير اسم الروم (!rename)',
        description: 'تغيير اسم القناة النصية الحالية بشكل سريع.',
        usage: '`!rename [الاسم_الجديد]`',
        permissions: 'إدارة القنوات (Manage Channels)'
      }
    };

    return details[cmdKey] || null;
  }

  // الاستماع لأمر $help
  client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    if (message.content === '$help' || message.content === '!help') {
      const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:3000'; // رابط لوحة التحكم

      const helpEmbed = new EmbedBuilder()
        .setTitle('📚 قائمة الأوامر ولوحة التحكم')
        .setDescription(`أهلاً بك **${message.author.username}** في نظام المساعدة الشامل!\n\n🌐 **رابط لوحة التحكم:** [اضغط هنا للدخول للوحة التحكم](${dashboardUrl})\n\n👇 اختر الأمر الذي تريد معرفة تفاصيله وشرحه المباشر من القائمة المنسدلة بأسفل:`)
        .setColor('#0284c7')
        .setThumbnail(client.user.displayAvatarURL())
        .setFooter({ text: 'حقوق البوت محفوظة لـ قتادة ©️ 2026', iconURL: message.guild.iconURL({ dynamic: true }) })
        .setTimestamp();

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('help_select_command')
        .setPlaceholder('🔍 اختر الأمر لعرض شرحه التفصيلي...')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('أمر المساعدة ($help)').setValue('cmd_help').setDescription('شرح أمر المساعدة والرابط').setEmoji('❓'),
          new StringSelectMenuOptionBuilder().setLabel('أمر الاقتراحات (!اقتراحات)').setValue('cmd_suggestions').setDescription('شرح ضبط روم الاقتراحات التلقائي').setEmoji('💡'),
          new StringSelectMenuOptionBuilder().setLabel('أمر الباند والفك (!ban / !unban)').setValue('cmd_ban').setDescription('شرح حظر وفك حظر الأعضاء').setEmoji('🔨'),
          new StringSelectMenuOptionBuilder().setLabel('أمر التايم أوت (!time / !untime)').setValue('cmd_timeout').setDescription('شرح الكتم المؤقت وفكه').setEmoji('⏰'),
          new StringSelectMenuOptionBuilder().setLabel('أمر قفل وفتح الروم (!lock / !unlock)').setValue('cmd_lock').setDescription('شرح التحكم في قفل القنوات').setEmoji('🔒'),
          new StringSelectMenuOptionBuilder().setLabel('أمر إخفاء وإظهار الروم (!hide / !show)').setValue('cmd_hide').setDescription('شرح إخفاء الروم عن الجميع').setEmoji('🙈'),
          new StringSelectMenuOptionBuilder().setLabel('أمر مسح الرسائل (!مسح)').setValue('cmd_clear').setDescription('شرح تنظيف الرسائل بالروم').setEmoji('🧹'),
          new StringSelectMenuOptionBuilder().setLabel('أمر تغيير اسم الروم (!rename)').setValue('cmd_rename').setDescription('شرح تغيير اسم القناة النصية').setEmoji('🏷️')
        );

      const row = new ActionRowBuilder().addComponents(selectMenu);

      return message.reply({ embeds: [helpEmbed], components: [row] });
    }
  });

  // التفاعل مع اختيار القائمة المنسدلة في $help
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isStringSelectMenu() || interaction.customId !== 'help_select_command') return;

    const selectedKey = interaction.values[0];
    const cmdInfo = getCommandDetails(selectedKey);

    if (!cmdInfo) {
      return interaction.reply({ content: '❌ تعذر العثور على معلومات هذا الأمر.', ephemeral: true });
    }

    const detailEmbed = new EmbedBuilder()
      .setTitle(cmdInfo.title)
      .setDescription(cmdInfo.description)
      .addFields(
        { name: '📝 طريقة الاستخدام:', value: cmdInfo.usage, inline: false },
        { name: '🛡️ الصلاحيات المطلوبة:', value: cmdInfo.permissions, inline: false }
      )
      .setColor('#10b981')
      .setFooter({ text: 'حقوق البوت محفوظة لـ قتادة ©️ 2026' })
      .setTimestamp();

    return interaction.reply({ embeds: [detailEmbed], ephemeral: true });
  });

  // =================================================================
  // 🔴 [نهاية قسم 2: أمر المساعدة $help والقائمة المنسدلة]
  // =================================================================

  console.log('⚡ تم تحميل ملف system.js بنجاح وتفعيل القوائم والأوامر الجديدة!');
};
