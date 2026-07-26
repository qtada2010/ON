
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = function registerSystemCommands(client, PREFIX = '!') {

  client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // ==========================================
    // 1. أمر معلومات البوت والسيستم (!ping / !botinfo)
    // ==========================================
    if (command === 'ping' || command === 'botinfo') {
      const embed = new EmbedBuilder()
        .setTitle('🤖 حالة نظام البوت | Bot System Status')
        .setColor('#0284c7')
        .addFields(
          { name: '📡 سرعة الاتصال (Ping):', value: `\`${client.ws.ping}ms\``, inline: true },
          { name: '⏱️ مدة التشغيل (Uptime):', value: `\`${Math.floor(client.uptime / 3600000)}h ${Math.floor((client.uptime % 3600000) / 60000)}m\``, inline: true },
          { name: '📊 عدد السيرفرات:', value: `\`${client.guilds.cache.size}\``, inline: true }
        )
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // ==========================================
    // 2. أمر إحصائيات السيرفر (!server / !serverinfo)
    // ==========================================
    if (command === 'server' || command === 'serverinfo') {
      const guild = message.guild;
      const embed = new EmbedBuilder()
        .setTitle(`🏰 معلومات سيرفر: ${guild.name}`)
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .setColor('#10b981')
        .addFields(
          { name: '🆔 آيدي السيرفر:', value: `\`${guild.id}\``, inline: true },
          { name: '👑 مالك السيرفر:', value: `<@${guild.ownerId}>`, inline: true },
          { name: '👥 عدد الأعضاء:', value: `\`${guild.memberCount}\``, inline: true },
          { name: '💬 عدد الرومات النصية:', value: `\`${guild.channels.cache.filter(c => c.type === 0).size}\``, inline: true },
          { name: '🔊 عدد الرومات الصوتية:', value: `\`${guild.channels.cache.filter(c => c.type === 2).size}\``, inline: true },
          { name: '🎨 عدد الرتب (Roles):', value: `\`${guild.roles.cache.size}\``, inline: true }
        )
        .setFooter({ text: `تاريخ إنشاء السيرفر: ${guild.createdAt.toLocaleDateString('ar-EG')}` });

      return message.reply({ embeds: [embed] });
    }

    // ==========================================
    // 3. أمر معلومات العضو (!user / !userinfo)
    // ==========================================
    if (command === 'user' || command === 'userinfo') {
      const member = message.mentions.members.first() || message.member;
      const embed = new EmbedBuilder()
        .setTitle(`👤 معلومات حساب: ${member.user.tag}`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setColor('#8b5cf6')
        .addFields(
          { name: '🆔 الآيدي:', value: `\`${member.id}\``, inline: true },
          { name: '📅 انضمام للديسكورد:', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
          { name: '📥 انضمام للسيرفر:', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
          { name: '🎖️ أعلى رتبة:', value: `${member.roles.highest}`, inline: true }
        );

      return message.reply({ embeds: [embed] });
    }

    // ==========================================
    // 4. أمر إعادة مسح وتطهير الروم بالكامل (!clear-all)
    // ==========================================
    if (command === 'clear-all' || command === 'تصفير') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return message.reply('❌ ليس لديك صلاحية إدارة الرسائل.');
      }

      const fetched = await message.channel.messages.fetch({ limit: 100 });
      await message.channel.bulkDelete(fetched, true).catch(() => {});

      const msg = await message.channel.send('🧹 تم تنظيف الشات وتصفيره بنجاح!');
      setTimeout(() => msg.delete().catch(() => {}), 3000);
    }

    // ==========================================
    // 5. أمر إرسال إعلان/رسالة بفروم منسق (!say-embed)
    // ==========================================
    if (command === 'say-embed' || command === 'اعلان') {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply('❌ هذا الأمر مخصص للإدارة العليا فقط.');
      }

      const text = args.join(' ');
      if (!text) return message.reply('⚠️ يرجى كتابة نص الإعلان بعد الأمر.');

      message.delete().catch(() => {});

      const embed = new EmbedBuilder()
        .setTitle('📢 إعلان إداري هام')
        .setDescription(text)
        .setColor('#f59e0b')
        .setFooter({ text: `تم الإرسال بواسطة: ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
        .setTimestamp();

      message.channel.send({ embeds: [embed] });
    }

  });

  console.log('⚡ تم تحميل أوامر السيستم والنظام من ملف system.js بنجاح!');
};
