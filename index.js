client.once('ready', async () => {
  // جلب معلومات التطبيق لمعرفة المالك
  const application = await client.application.fetch();
  console.log(`👑 البوت مربوط بحساب المالك: ${application.owner.tag} (ID: ${application.owner.id})`);
});
