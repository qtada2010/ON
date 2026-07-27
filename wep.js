const express = require('express');
const router = express.Router();

module.exports = function(pool, client) {

  // ==========================================
  // 1. إنشاء جدول البيانات تلقائياً إذا لم يكن موجوداً
  // ==========================================
  pool.query(`
    CREATE TABLE IF NOT EXISTS sticky_roles (
      user_id VARCHAR(50) PRIMARY KEY,
      role_ids TEXT NOT NULL,
      note TEXT
    );
  `).catch(err => console.error('خطأ في إنشاء جدول الرتب الدائمة:', err));

  // ==========================================
  // 2. صفحة العرض والإضافة والتعديل
  // ==========================================
  router.get('/sticky-roles', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM sticky_roles ORDER BY user_id ASC');
      const rows = result.rows;

      let tableHTML = '';
      rows.forEach(row => {
        tableHTML += `
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #334155;">${row.user_id}</td>
            <td style="padding: 10px; border-bottom: 1px solid #334155; word-break: break-all; color: #38bdf8;">${row.role_ids}</td>
            <td style="padding: 10px; border-bottom: 1px solid #334155;">${row.note || '-'}</td>
            <td style="padding: 10px; border-bottom: 1px solid #334155; text-align: center;">
              <a href="/sticky-roles/delete/${row.user_id}" style="color: #ef4444; text-decoration: none; font-weight: bold;">🗑️ حذف</a>
            </td>
          </tr>
        `;
      });

      res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8">
          <title>نظام إرجاع الرتب التلقائي</title>
          <style>
            body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin:0; padding:0; }
            nav { background: #1e293b; padding: 15px 30px; display: flex; justify-content: space-between; border-bottom: 1px solid #334155; }
            nav .links a { color: #38bdf8; text-decoration: none; font-weight: bold; margin-left: 20px; }
            .container { max-width: 900px; margin: 40px auto; background: #1e293b; padding: 30px; border-radius: 12px; border: 1px solid #334155; }
            h1, h2 { color: #38bdf8; }
            label { display: block; margin-top: 15px; font-weight: bold; color:#cbd5e1; }
            input { width: 100%; padding: 10px; margin-top: 5px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff; box-sizing: border-box; }
            button { margin-top: 20px; padding: 12px; background: #10b981; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; font-size: 15px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; background: #0f172a; border-radius: 8px; overflow: hidden; }
            th { background: #334155; color: #fff; padding: 12px; text-align: right; }
          </style>
        </head>
        <body>
          <nav>
            <div class="links">
              <a href="/">الرئيسية 🏠</a>
              <a href="/panel">إدارة التذاكر ⚙️</a>
              <a href="/sticky-roles">نظام الرتب الدائمة 🛡️</a>
            </div>
            <a href="/logout" style="color:#ef4444; font-weight:bold; text-decoration:none;">تسجيل الخروج 🚪</a>
          </nav>

          <div class="container">
            <h1>🛡️ إدارة الرتب الدائمة (Sticky Roles)</h1>
            <p style="color:#94a3b8;">هذا النظام يعيد إعطاء الرتب المحددة للعضو تلقائياً بمجرد انضمامه للسيرفر بعد الخروج أو الطرد أو الباند.</p>

            <form action="/sticky-roles/save" method="POST" style="background:#0f172a; padding:20px; border-radius:8px; border:1px solid #334155;">
              <label>🆔 آيدي الشخص (User ID):</label>
              <input type="text" name="userId" placeholder="مثال: 123456789012345678" required>

              <label>🎖️ آيديات الرولات (افصل بينها بفاصلة , إن كانت أكثر من رتبة):</label>
              <input type="text" name="roleIds" placeholder="مثال: 111111111,222222222,333333333" required>

              <label>📝 ملاحظة أو اسم العضو (اختياري):</label>
              <input type="text" name="note" placeholder="مثال: رتبة إدارية معاقب بها أو رتبة شخصية">

              <button type="submit">💾 حفظ وإضافة القائمة</button>
            </form>

            <hr style="margin: 30px 0; border-color: #334155;">

            <h2>📋 الأعضاء المضافين حالياً (${rows.length}):</h2>
            ${rows.length > 0 ? `
              <table>
                <thead>
                  <tr>
                    <th>آيدي الشخص</th>
                    <th>آيديات الرتب</th>
                    <th>ملاحظات</th>
                    <th style="text-align: center;">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableHTML}
                </tbody>
              </table>
            ` : '<p style="color:#94a3b8;">لا يوجد أعضاء مضافين في القائمة حالياً.</p>'}
          </div>
        </body>
        </html>
      `);
    } catch (err) {
      console.error(err);
      res.send('❌ حدث خطأ أثناء تحميل الصفحة.');
    }
  });

  // ==========================================
  // 3. حفظ/تحديث البيانات في Database
  // ==========================================
  router.post('/sticky-roles/save', async (req, res) => {
    const { userId, roleIds, note } = req.body;
    if (!userId || !roleIds) return res.send('❌ يرجى إدخال الآيدي والأدوار كاملة!');

    try {
      await pool.query(`
        INSERT INTO sticky_roles (user_id, role_ids, note)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id) DO UPDATE SET
          role_ids = EXCLUDED.role_ids,
          note = EXCLUDED.note;
      `, [userId.trim(), roleIds.trim(), note ? note.trim() : '']);

      res.redirect('/sticky-roles');
    } catch (err) {
      console.error('خطأ في حفظ البيانات:', err);
      res.send('❌ تعذر حفظ البيانات.');
    }
  });

  // ==========================================
  // 4. حذف عضو من القائمة
  // ==========================================
  router.get('/sticky-roles/delete/:userId', async (req, res) => {
    try {
      await pool.query('DELETE FROM sticky_roles WHERE user_id = $1', [req.params.userId]);
      res.redirect('/sticky-roles');
    } catch (err) {
      console.error('خطأ أثناء الحذف:', err);
      res.redirect('/sticky-roles');
    }
  });

  // ==========================================
  // 5.حدث ديسكورد: إعطاء الرتبة فور دخول العضو السيرفر
  // ==========================================
  client.on('guildMemberAdd', async (member) => {
    try {
      const res = await pool.query('SELECT role_ids FROM sticky_roles WHERE user_id = $1', [member.id]);
      if (res.rows.length === 0) return;

      const rolesArray = res.rows[0].role_ids.split(',').map(r => r.trim());

      // إعطاء الرتب المحددة للعضو
      for (const roleId of rolesArray) {
        if (roleId && member.guild.roles.cache.has(roleId)) {
          await member.roles.add(roleId).catch(e => console.error(`تعذر إعطاء الرتبة ${roleId}:`, e));
        }
      }
      console.log(`✅ تم إرجاع الرتب التلقائية للعضو: ${member.user.tag}`);
    } catch (err) {
      console.error('خطأ في الحدث guildMemberAdd:', err);
    }
  });

  return router;
};
