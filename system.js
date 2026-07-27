const { 
  EmbedBuilder, 
  PermissionFlagsBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder, 
  StringSelectMenuOptionBuilder 
} = require('discord.js');

// مصفوفات لحفظ أرقام/آيديهات القنوات في الذاكرة
let suggestionsChannelIds = new Set(); // دعم أكثر من روم للاقتراحات
let taxChannelIds = new Set();        // دعم رومات حاسبة الضريبة

// دالة تحويل الاختصارات مثل (1m, 1k, 1b) إلى أرقام
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

module.exports = function(client, PREFIX = '!') {

  // =================================================================
  // 🟢 [بداية أمر: أزرار استلام وإلغاء استلام التذكرة (!claim-panel)]
  // =================================================================
  client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    if (message.content.startsWith(PREFIX)) {
      const args = message.content.slice(PREFIX.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();

      // أمر لإرسال أزرار الاستلام داخل التكت عند الحاجة
      if (command === 'claim-panel' || command === 'استلام') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
          return message.reply('❌ ليس لديك صلاحية لاستخدام هذا الأمر.');
        }

        const claimEmbed = new EmbedBuilder()
          .setTitle('📌 التحكم في استلام التذكرة')
          .setDescription('يمكن للإدارة استخدام الأزرار أدناه لاستلام التذكرة أو إلغاء استلامها:')
          .setColor('#3b82f6')
          .setFooter({ text: 'نظام الاستلام والتذكرة' });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('ticket_claim_btn')
            .setLabel('استلام التذكرة')
            .setEmoji('📌')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('ticket_unclaim_btn')
            .setLabel('إلغاء الاستلام')
            .setEmoji('🔄')
            .setStyle(ButtonStyle.Secondary)
        );

        return message.channel.send({ embeds: [claimEmbed], components: [row] });
      }
    }
  });

  // معالجة الضغط على أزرار الاستلام وإلغاء الاستلام
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'ticket_claim_btn') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ content: '❌ لا تمتلك صلاحية لاستلام التذكرة!', ephemeral: true });
      }

      const channel = interaction.channel;

      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: false
      });

      await channel.permissionOverwrites.edit(interaction.user.id, {
        SendMessages: true
      });

      const claimedEmbed = new EmbedBuilder()
        .setDescription(`📌 **تم استلام التذكرة بواسطة:** ${interaction.user}\nلا يمكن لأحد الكتابة في هذه التذكرة الآن سوى الإداري المستلم والعلياء.`)
        .setColor('#22c55e');

      return interaction.reply({ embeds: [claimedEmbed] });
    }

    if (interaction.customId === 'ticket_unclaim_btn') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ content: '❌ لا تمتلك صلاحية لإلغاء استلام التذكرة!', ephemeral: true });
      }

      const channel = interaction.channel;

      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: true
      });

      await channel.permissionOverwrites.delete(interaction.user.id).catch(() => {});

      const unclaimedEmbed = new EmbedBuilder()
        .setDescription(`🔄 **تم إلغاء استلام التذكرة بواسطة:** ${interaction.user}\nيمكن لجميع أفراد الإدارة الكتابة بداخلها الآن.`)
        .setColor('#eab308');

      return interaction.reply({ embeds: [unclaimedEmbed] });
    }
  });
  // =================================================================
  // 🔴 [نهاية أمر: أزرار استلام وإلغاء استلام التذكرة (!claim-panel)]
  // =================================================================


  client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // =================================================================
    // 🟢 [بداية أمر: إضافة عضو/رول لمشاهدة الروم (!اضافة)]
    // =================================================================
    if (message.content.startsWith(PREFIX)) {
      const args = message.content.slice(PREFIX.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();

      if (command === 'اضافة' || command === 'add') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
          return message.reply('❌ ليس لديك صلاحية إدارة القنوات لاستخدام هذا الأمر.');
        }

        const targetMember = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
        const targetRole = message.mentions.roles.first() || message.guild.roles.cache.get(args[0]);

        if (targetMember) {
          await message.channel.permissionOverwrites.edit(targetMember.id, { ViewChannel: true });
          return message.reply(`👁️ تم منح **${targetMember.user.tag}** صلاحية رؤية الروم بنجاح!`);
        } else if (targetRole) {
          await message.channel.permissionOverwrites.edit(targetRole.id, { ViewChannel: true });
          return message.reply(`👁️ تم منح رول **${targetRole.name}** صلاحية رؤية الروم بنجاح!`);
        } else {
          return message.reply('⚠️ يرجى منشن عضو/رول أو كتابة الآيدي الخاص به: `!اضافة @user` أو `!اضافة @role`');
        }
      }
    }
    // =================================================================
    // 🔴 [نهاية أمر: إضافة عضو/رول لمشاهدة الروم (!اضافة)]
    // =================================================================


    // =================================================================
    // 🟢 [بداية أمر: إعطاء صلاحية الكتابة لعضو/رول (!كتابة)]
    // =================================================================
    if (message.content.startsWith(PREFIX)) {
      const args = message.content.slice(PREFIX.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();

      if (command === 'كتابة' || command === 'write') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
          return message.reply('❌ ليس لديك صلاحية إدارة القنوات لاستخدام هذا الأمر.');
        }

        const targetMember = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
        const targetRole = message.mentions.roles.first() || message.guild.roles.cache.get(args[0]);

        if (targetMember) {
          await message.channel.permissionOverwrites.edit(targetMember.id, { SendMessages: true });
          return message.reply(`✍️ تم منح **${targetMember.user.tag}** صلاحية الكتابة بالروم بنجاح!`);
        } else if (targetRole) {
          await message.channel.permissionOverwrites.edit(targetRole.id, { SendMessages: true });
          return message.reply(`✍️ تم منح رول **${targetRole.name}** صلاحية الكتابة بالروم بنجاح!`);
        } else {
          return message.reply('⚠️ يرجى منشن عضو/رول أو كتابة الآيدي الخاص به: `!كتابة @user` أو `!كتابة @role`');
        }
      }
    }
    // =================================================================
    // 🔴 [نهاية أمر: إعطاء صلاحية الكتابة لعضو/رول (!كتابة)]
    // =================================================================


    // =================================================================
    // 🟢 [بداية أمر: حاسبة ضريبة بروبوت التلقائية (!ضريبة / !tax)]
    // =================================================================
    if (message.content.startsWith(PREFIX)) {
      const args = message.content.slice(PREFIX.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();

      if (command === 'ضريبة' || command === 'tax-channel') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels) && !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return message.reply('❌ ليس لديك صلاحية لتحديد رومات الضريبة.');
        }

        const targetChannel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]) || message.channel;

        if (taxChannelIds.has(targetChannel.id)) {
          taxChannelIds.delete(targetChannel.id);
          return message.reply(`🗑️ تم إزالة ${targetChannel} من قائمة رومات حاسبة الضريبة.`);
        } else {
          taxChannelIds.add(targetChannel.id);
          return message.reply(`✅ تم إضافة ${targetChannel} كروم رسمي لحاسبة ضريبة بروبوت!`);
        }
      }
    }

    if (taxChannelIds.has(message.channel.id)) {
      const amount = parseAmount(message.content);

      if (amount && amount > 0) {
        const tax = Math.floor(amount * (20 / 19) + 1);
        const taxOnly = tax - amount;

        const taxEmbed = new EmbedBuilder()
          .setTitle('💰 حاسبة ضريبة ProBot')
          .setColor('#22c55e')
          .addFields(
            { name: '💵 المبلغ المطلوب:', value: `\`${amount.toLocaleString()}\``, inline: true },
            { name: '💳 المبلغ مع الضريبة (الكامل):', value: `\`${tax.toLocaleString()}\``, inline: true },
            { name: '📊 مقدار الضريبة (5%):', value: `\`${taxOnly.toLocaleString()}\``, inline: false }
          )
          .setFooter({ text: '💡 يمكنك كتابة اختصارات مثل: 1k, 5m, 1b' })
          .setTimestamp();

        await message.reply({ embeds: [taxEmbed] });
      }
    }
    // =================================================================
    // 🔴 [نهاية أمر: حاسبة ضريبة بروبوت التلقائية (!ضريبة / !tax)]
    // =================================================================


    // =================================================================
    // 🟢 [بداية أمر: الاقتراحات المطور - متعدد الرومات (!اقتراحات)]
    // =================================================================
    if (message.content.startsWith(PREFIX)) {
      const args = message.content.slice(PREFIX.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();

      if (command === 'اقتراحات' || command === 'set-suggestions') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels) && !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return message.reply('❌ ليس لديك صلاحية لتحديد رومات الاقتراحات.');
        }

        const targetChannel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]) || message.channel;

        if (suggestionsChannelIds.has(targetChannel.id)) {
          suggestionsChannelIds.delete(targetChannel.id);
          return message.reply(`🗑️ تم إزالة ${targetChannel} من قائمة رومات الاقتراحات.`);
        } else {
          suggestionsChannelIds.add(targetChannel.id);
          return message.reply(`✅ تم إضافة ${targetChannel} كروم رسمي للاقتراحات بنجاح!`);
        }
      }
    }

    if (suggestionsChannelIds.has(message.channel.id)) {
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
    // =================================================================
    // 🔴 [نهاية أمر: الاقتراحات المطور - متعدد الرومات (!اقتراحات)]
    // =================================================================


    if (!message.content.startsWith(PREFIX)) return;
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();


    // =================================================================
    // 🟢 [بداية أمر: الحظر وفك الحظر (!ban / !unban)]
    // =================================================================
    if (command === 'ban') {
      if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) 
        return message.reply('❌ ليس لديك صلاحية حظر الأعضاء.');
      const target = message.mentions.members.first();
      const reason = args.slice(1).join(' ') || 'بدون سبب';
      if (!target) return message.reply('⚠️ يرجى تحديد العضو: `!ban @user reason`');
      if (!target.bannable) return message.reply('❌ لا يمكنني حظر هذا العضو.');

      await target.ban({ reason });
      message.channel.send(`✅ تم حظر **${target.user.tag}** | السبب: ${reason}`);
    }

    if (command === 'unban') {
      if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return;
      const userId = args[0];
      if (!userId) return message.reply('⚠️ ضع آيدي الحساب: `!unban ID`');
      try {
        await message.guild.members.unban(userId);
        message.channel.send(`✅ تم فك الحظر عن الحساب: **${userId}**`);
      } catch {
        message.reply('❌ لم يتم العثور على حظر بهذا الآيدي.');
      }
    }
    // =================================================================
    // 🔴 [نهاية أمر: الحظر وفك الحظر (!ban / !unban)]
    // =================================================================


    // =================================================================
    // 🟢 [بداية أمر: التايم أوت وفكه (!time / !untime)]
    // =================================================================
    if (command === 'time' || command === 'timeout') {
      if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return;
      const target = message.mentions.members.first();
      const minutes = parseInt(args[0]);
      if (!target || isNaN(minutes)) return message.reply('⚠️ الاستخدام الصحيح: `!time 10 @user` أو `!time @user 10`');
      await target.timeout(minutes * 60 * 1000);
      message.channel.send(`⏰ تم إعطاء تايم أوت لـ **${target.user.tag}** لمدة ${minutes} دقيقة.`);
    }

    if (command === 'untime') {
      if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return;
      const target = message.mentions.members.first();
      if (!target) return message.reply('⚠️ يرجى تحديد العضو.');
      await target.timeout(null);
      message.channel.send(`✅ تم إزالة التايم أوت عن **${target.user.tag}**`);
    }
    // =================================================================
    // 🔴 [نهاية أمر: التايم أوت وفكه (!time / !untime)]
    // =================================================================


    // =================================================================
    // 🟢 [بداية أمر: قفل وفتح الروم (!lock / !unlock)]
    // =================================================================
    if (command === 'lock') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return;
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
      message.channel.send('🔒 تم إغلاق الروم بنجاح.');
    }

    if (command === 'unlock') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return;
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
      message.channel.send('🔓 تم فتح الروم بنجاح.');
    }
    // =================================================================
    // 🔴 [نهاية أمر: قفل وفتح الروم (!lock / !unlock)]
    // =================================================================


    // =================================================================
    // 🟢 [بداية أمر: إخفاء وإظهار الروم (!hide / !show)]
    // =================================================================
    if (command === 'hide') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return;
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: false });
      message.channel.send('🙈 تم إخفاء الروم عن الجميع.');
    }

    if (command === 'show') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return;
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: true });
      message.channel.send('👁️ تم إظهار الروم للجميع.');
    }
    // =================================================================
    // 🔴 [نهاية أمر: إخفاء وإظهار الروم (!hide / !show)]
    // =================================================================


    // =================================================================
    // 🟢 [بداية أمر: مسح الرسائل (!مسح / !clear)]
    // =================================================================
    if (command === 'مسح' || command === 'clear') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
      const amount = parseInt(args[0]);
      if (isNaN(amount) || amount < 1 || amount > 100) return message.reply('⚠️ اختر عدداً من 1 إلى 100.');
      await message.channel.bulkDelete(amount, true);
      const msg = await message.channel.send(`🧹 تم مسح **${amount}** رسالة بنجاح.`);
      setTimeout(() => msg.delete().catch(() => {}), 3000);
    }
    // =================================================================
    // 🔴 [نهاية أمر: مسح الرسائل (!مسح / !clear)]
    // =================================================================
        // =================================================================
    // 🟢 [بداية أمر: إعطاء رتبة (!رول)]
    // =================================================================
    if (command === 'رول') {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
        return message.reply('❌ ليس لديك صلاحية استخدام هذا الأمر.');

      const target = message.mentions.members.first();
      if (!target)
        return message.reply('⚠️ يرجى منشن العضو.');

      const role =
        message.mentions.roles.first() ||
        message.guild.roles.cache.get(args[1]) ||
        message.guild.roles.cache.find(r => r.name === args.slice(1).join(' '));

      if (!role)
        return message.reply('⚠️ لم يتم العثور على الرتبة.');

      if (!role.editable)
        return message.reply('❌ لا أستطيع إعطاء هذه الرتبة.');

      await target.roles.add(role);
      message.channel.send(`✅ تم إعطاء رتبة **${role.name}** إلى **${target.user.tag}**`);
    }
    // =================================================================
    // 🔴 [نهاية أمر: إعطاء رتبة (!رول)]
    // =================================================================

    // =================================================================
    // 🟢 [بداية أمر: تغيير اسم الروم (!rename)]
    // =================================================================
    if (command === 'rename') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return;
      const newName = args.join('-');
      if (!newName) return message.reply('⚠️ اكتب الاسم الجديد للروم.');
      await message.channel.setName(newName);
      message.channel.send(`🏷️ تم تغيير اسم الروم إلى: **${newName}**`);
    }
    // =================================================================
    // 🔴 [نهاية أمر: تغيير اسم الروم (!rename)]
    // =================================================================

  });


  // =================================================================
  // 🟢 [بداية تفاعلات أزرار الاقتراحات]
  // =================================================================
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
  // 🔴 [نهاية تفاعلات أزرار الاقتراحات]
  // =================================================================


  // =================================================================
  // 🟢 [بداية أمر المساعدة والقائمة المنسدلة ($help)]
  // =================================================================
  function getCommandDetails(cmdKey) {
    const details = {
      'cmd_help': {
        title: '❓ أمر المساعدة ($help)',
        description: 'عرض القائمة الرئيسية للأوامر ورابط لوحة التحكم.',
        usage: '`$help`',
        permissions: 'متاح للجميع'
      },
      'cmd_add': {
        title: '👁️ أمر إعطاء رؤية الروم (!اضافة)',
        description: 'إعطاء عضو أو رول صلاحية رؤية ومشاهدة القناة الحالية.',
        usage: '`!اضافة @user` أو `!اضافة @role`',
        permissions: 'إدارة القنوات (Manage Channels)'
      },
      'cmd_write': {
        title: '✍️ أمر إعطاء صلاحية الكتابة (!كتابة)',
        description: 'إعطاء عضو أو رول صلاحية الكتابة والدردشة في القناة الحالية.',
        usage: '`!كتابة @user` أو `!كتابة @role`',
        permissions: 'إدارة القنوات (Manage Channels)'
      },
      'cmd_claim': {
        title: '📌 أمر لوحة استلام التذكرة (!استلام)',
        description: 'إرسال لوحة تحتوي على أزرار الاستلام وإلغاء الاستلام للتذكرة لمنع بقية الإداريين من الكتابة.',
        usage: '`!استلام` أو `!claim-panel`',
        permissions: 'إدارة الرسائل (Manage Messages)'
      },
      'cmd_tax': {
        title: '💰 أمر حاسبة الضريبة (!ضريبة)',
        description: 'تحديد/إلغاء روم لحاسبة ضريبة بروبوت. عند كتابة أي مبلغ مثل 1m أو 500k يقوم البوت بحساب المبلغ مع الضريبة تلقائياً.',
        usage: '`!ضريبة` أو `!ضريبة #الروم`',
        permissions: 'إدارة القنوات (Manage Channels)'
      },
      'cmd_suggestions': {
        title: '💡 أمر تحديد الاقتراحات (!اقتراحات)',
        description: 'تحديد/إلغاء رومات رسمية للاقتراحات (يدعم أكثر من روم). يتم تحويل أي رسالة بداخلها إلى إيمبد مع أزرار تصويت.',
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
        usage: '`!time 10 @user`\n`!untime @user`',
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

  client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    if (message.content === '$help' || message.content === '!help') {
      const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';

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
          new StringSelectMenuOptionBuilder().setLabel('أمر إضافة مشاهدة (!اضافة)').setValue('cmd_add').setDescription('منح رؤية الروم لعضو أو رول').setEmoji('👁️'),
          new StringSelectMenuOptionBuilder().setLabel('أمر إعطاء الكتابة (!كتابة)').setValue('cmd_write').setDescription('منح الكتابة بالروم لعضو أو رول').setEmoji('✍️'),
          new StringSelectMenuOptionBuilder().setLabel('أمر استلام التكت (!استلام)').setValue('cmd_claim').setDescription('أزرار استلام وإلغاء استلام التكّت').setEmoji('📌'),
          new StringSelectMenuOptionBuilder().setLabel('أمر الضريبة التلقائي (!ضريبة)').setValue('cmd_tax').setDescription('حاسبة ضريبة بروبوت تلقائياً').setEmoji('💰'),
          new StringSelectMenuOptionBuilder().setLabel('أمر الاقتراحات (!اقتراحات)').setValue('cmd_suggestions').setDescription('ضبط رومات الاقتراحات التلقائية').setEmoji('💡'),
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
  // 🔴 [نهاية أمر المساعدة والقائمة المنسدلة ($help)]
  // =================================================================
  console.log('⚡ تم تحميل جميع الأوامر المحدثة بنجاح!');
};
