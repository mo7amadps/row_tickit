const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mo7_win')
    .setDescription('أمر سري')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption(opt =>
      opt.setName('message_id').setDescription('آيدي رسالة القيف أواي').setRequired(true)
    )
    .addUserOption(opt =>
      opt.setName('user').setDescription('الشخص اللي تبيه يفوز').setRequired(true)
    ),

  async execute(interaction, client) {
    const messageId = interaction.options.getString('message_id').trim();
    const user = interaction.options.getUser('user');

    const g = client.giveaways.get(messageId);
    if (!g) {
      return interaction.reply({
        content: '❌ ما في قيف أواي بهذا الآيدي.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const userId = String(user.id);
    if (!Array.isArray(g.forced_winners)) g.forced_winners = [];
    if (!Array.isArray(g.participants)) g.participants = [];

    if (g.forced_winners.includes(userId)) {
      return interaction.reply({
        content: `⚠️ ${user} مضاف مسبقاً كفائز سري.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (g.forced_winners.length >= g.winners) {
      return interaction.reply({
        content: `❌ وصلت للحد الأقصى (${g.winners} فائزين). ما تقدر تضيف أكثر.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!g.participants.includes(userId)) {
      g.participants.push(userId);
    }
    g.forced_winners.push(userId);
    client.giveaways.set(messageId, g);

    const current = g.forced_winners.length;
    const maxWinners = g.winners;

    await interaction.reply({
      content: [
        `✅ تم تعيين **${user}** كفائز سري.`,
        `الفائزين السريين الحاليين: **${current}/${maxWinners}**`,
        'لما يخلص الوقت راح يفوزوا بشكل طبيعي تمامًا.',
      ].join('\n'),
      flags: MessageFlags.Ephemeral,
    });
  },
};
