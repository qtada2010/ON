client.once('ready', async () => {
  console.log(`تم تسجيل الدخول بنجاح باسم: ${client.user.tag}`);

  // 🔍 معرفة الحساب المربوط به البوت
  try {
    const app = await client.application.fetch();
    console.log(`👑 البوت مملوك للحساب: ${app.owner.tag || app.owner.name} (ID: ${app.owner.id})`);
  } catch (err) {
    console.error('لم نتمكن من جلب بيانات المالك:', err);
  }
});
