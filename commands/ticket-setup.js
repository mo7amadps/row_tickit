const { SlashCommandBuilder, ChannelType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-setup')
    .setDescription('ضبط اعدادات تذكرة')
    .addIntegerOption(opt =>
      opt.setName('ticket').setDescription('اختر رقم التذكرة').setRequired(true)
        .addChoices(
          { name: 'ticket 1', value: 1 },
          { name: 'ticket 2', value: 2 },
          { name: 'ticket 3', value: 3 },
          { name: 'ticket 4', value: 4 },
          { name: 'ticket 5', value: 5 },
        ))
    .addStringOption(opt =>
      opt.setName('name').setDescription('اسم التذكرة').setRequired(false))
    .addChannelOption(opt =>
      opt.setName('category').setDescription('الكاتيقوري اللي تنفتح فيها التذكرة').setRequired(false)
        .addChannelTypes(ChannelType.GuildCategory))
    .addRoleOption(opt =>
      opt.setName('role').setDescription('الرول اللي يشوف التذكرة').setRequired(false))
    .addRoleOption(opt =>
      opt.setName('admin').setDescription('رول الادمن').setRequired(false))
    .addStringOption(opt =>
      opt.setName('ownership').setDescription('هل صاحب السيرفر يُستدعى داخل التذكرة؟').setRequired(false)
        .addChoices(
          { name: 'نعم', value: 'yes' },
          { name: 'لا', value: 'no' },
        ))
    .addStringOption(opt =>
      opt.setName('reason').setDescription('هل يطلب سبب عند فتح التذكرة؟').setRequired(false)
        .addChoices(
          { name: 'نعم', value: 'yes' },
          { name: 'لا', value: 'no' },
        ))
    .addStringOption(opt =>
      opt.setName('username-number').setDescription('إظهار اسم ورقم المستخدم في التذكرة').setRequired(false)
        .addChoices(
          { name: 'نعم', value: 'yes' },
          { name: 'لا', value: 'no' },
        ))
    .addStringOption(opt =>
      opt.setName('welcome-msg').setDescription('رسالة الترحيب داخل التذكرة').setRequired(false))
    .addStringOption(opt =>
      opt.setName('welcome-image').setDescription('رابط صورة الترحيب').setRequired(false))
    .addStringOption(opt =>
      opt.setName('mentions').setDescription('منشن لما تنفتح التذكرة (مثال: @here أو ID الرول)').setRequired(false))
    .addStringOption(opt =>
      opt.setName('line').setDescription('رسالة منشن رتب تجي تحت الترحيب').setRequired(false))
    .addChannelOption(opt =>
      opt.setName('ticket-logs').setDescription('روم اللوقز').setRequired(false)
        .addChannelTypes(ChannelType.GuildText))
    .addChannelOption(opt =>
      opt.setName('close-category').setDescription('الكاتيقوري اللي تنتقل إليها التذكرة بعد الإغلاق').setRequired(false)
        .addChannelTypes(ChannelType.GuildCategory))
    .addChannelOption(opt =>
      opt.setName('tqeem-room').setDescription('روم التقييم').setRequired(false)
        .addChannelTypes(ChannelType.GuildText)),

  async execute(interaction, client) {
    const ticketNum = interaction.options.getInteger('ticket');
    const existing = client.ticketSettings.get(ticketNum) || {};

    const updates = {};
    const fields = [
      'name', 'ownership', 'reason', 'username-number',
      'welcome-msg', 'welcome-image', 'mentions', 'line'
    ];
    const channelFields = ['category', 'ticket-logs', 'close-category', 'tqeem-room'];
    const roleFields = ['role', 'admin'];

    for (const f of fields) {
      const val = interaction.options.getString(f);
      if (val !== null) updates[f.replace('-', '_')] = val;
    }
    for (const f of channelFields) {
      const val = interaction.options.getChannel(f);
      if (val !== null) updates[f.replace(/-/g, '_')] = val.id;
    }
    for (const f of roleFields) {
      const val = interaction.options.getRole(f);
      if (val !== null) updates[f] = val.id;
    }

    const newSettings = { ...existing, ...updates };
    client.ticketSettings.set(ticketNum, newSettings);

    const lines = [];
    if (newSettings.name) lines.push(`📝 الاسم: **${newSettings.name}**`);
    if (newSettings.category) lines.push(`📁 الكاتيقوري: <#${newSettings.category}>`);
    if (newSettings.role) lines.push(`👤 الرول: <@&${newSettings.role}>`);
    if (newSettings.admin) lines.push(`🛡️ الادمن: <@&${newSettings.admin}>`);
    if (newSettings.ownership) lines.push(`👑 استدعاء صاحب السيرفر: **${newSettings.ownership === 'yes' ? 'نعم' : 'لا'}**`);
    if (newSettings.reason) lines.push(`❓ طلب السبب: **${newSettings.reason === 'yes' ? 'نعم' : 'لا'}**`);
    if (newSettings.username_number) lines.push(`🔢 إظهار الاسم والرقم: **${newSettings.username_number === 'yes' ? 'نعم' : 'لا'}**`);
    if (newSettings.welcome_msg) lines.push(`💬 رسالة الترحيب: **${newSettings.welcome_msg}**`);
    if (newSettings.welcome_image) lines.push(`🖼️ صورة الترحيب: موجودة`);
    if (newSettings.mentions) lines.push(`📢 منشن: **${newSettings.mentions}**`);
    if (newSettings.line) lines.push(`➖ الـ Line: **${newSettings.line}**`);
    if (newSettings.ticket_logs) lines.push(`📋 لوقز: <#${newSettings.ticket_logs}>`);
    if (newSettings.close_category) lines.push(`🔒 كاتيقوري الإغلاق: <#${newSettings.close_category}>`);
    if (newSettings.tqeem_room) lines.push(`⭐ روم التقييم: <#${newSettings.tqeem_room}>`);

    await interaction.reply({
      embeds: [{
        title: `✅ تم ضبط التذكرة رقم ${ticketNum}`,
        description: lines.length ? lines.join('\n') : 'لم يتم تغيير أي إعداد',
        color: 0x5865F2,
      }],
      ephemeral: true
    });
  }
};
