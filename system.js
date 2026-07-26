module.exports = function(client, PREFIX = '!') {

  client.on('messageCreate', async (message) => {
    // تجاهل الرسائل القادمة من البوتات أو خارج السيرفر أو التي لا تبدأ بالبادئة
    if (message.author.bot || !message.guild || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // أمر التجربة (!تست)
    if (command === 'تست' || command === 'test') {
      return message.reply('⚡ البوت شغال زي الفل والأمور تمام يا غالي!');
    }

  });

  console.log('✅ تم تحميل ملف system.js بنجاح!');
};
