const { EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// متغير لحفظ آيدي روم الاقتراحات المؤقت (في الذاكرة)
let suggestionsChannelId = null;

module.exports = function(client, PREFIX = '!') {

  // 1. الاستماع للرسائل (للأوامر ولتحويل الاقتراحات)
  client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // ==========================================
    // أ) تحديد روم الاقتراحات (!اقتراحات)
    // ==========================================
    if (message.content.startsWith(PREFIX)) {
      const args = message.content.slice(PREFIX.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();

      if (command === 'اقتراحات' || command === 'set-suggestions') {
        // التحقق من الصلاحيات (إدارة القنوات أو أدمن)
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels) && !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return message.reply('❌ ليس لديك صلاحية لتحديد روم الاقتراحات.');
        }

        // تحديد الروم المذكور أو الروم الحالي
        const targetChannel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]) || message.channel;

        suggestionsChannelId = targetChannel.id;

        return message.reply(`✅ تم تحديد ${targetChannel} كروم رسمي للاقتراحات بنجاح!`);
      }
    }

    // ==========================================
    // ب) تحويل أي رسالة في روم الاقتراحات إلى إيمبد
    // ==========================================
    if (suggestionsChannelId && message.channel.id === suggestionsChannelId) {
      // حذف رسالة العضو الأصلية
      await message.delete().catch(() => {});

      // إنشاء تصميم الإيمبد للاقتراح
      const suggestionEmbed = new EmbedBuilder()
        .setAuthor({ name: `اقتراح بواسطة: ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
        .setDescription(message.content)
        .setColor('#eab308') // لون أصفر أنيق
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: '💡 شارك برأيك حول هذا الاقتراح من خلال الأزرار بأسفل' })
        .setTimestamp();

      // أزرار التفاعل (موافق / غير موافق)
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('suggest_yes')
          .setLabel('0')
          .setEmoji('👍')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('suggest_no')
          .setLabel('0')
          .setEmoji('👎')
          .setStyle(ButtonStyle.Danger)
      );

      await message.channel.send({ embeds: [suggestionEmbed], components: [row] });
    }
  });

  // ==========================================
  // 2. التحكم بأزرار التصويت والتفاعل على الاقتراح
  // ==========================================
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId !== 'suggest_yes' && interaction.customId !== 'suggest_no') return;

    const message = interaction.message;
    const components = message.components[0].components;

    let yesBtn = ButtonBuilder.from(components[0]);
    let noBtn = ButtonBuilder.from(components[1]);

    let yesCount = parseInt(yesBtn.data.label) || 0;
    let noCount = parseInt(noBtn.data.label) || 0;

    if (interaction.customId === 'suggest_yes') {
      yesCount += 1;
    } else if (interaction.customId === 'suggest_no') {
      noCount += 1;
    }

    yesBtn.setLabel(`${yesCount}`);
    noBtn.setLabel(`${noCount}`);

    const newRow = new ActionRowBuilder().addComponents(yesBtn, noBtn);

    await interaction.update({ components: [newRow] });
  });

  console.log('💡 تم تحميل نظام الاقتراحات بداخل system.js بنجاح!');
};
