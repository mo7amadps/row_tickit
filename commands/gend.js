const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { endGiveaway } = require('../utils/giveawayHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gend')
    .setDescription('إنهاء قيف أواي يدوياً')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addStringOption(opt =>
      opt.setName('message_id').setDescription('آيدي رسالة القيف أواي').setRequired(true)
    ),

  async execute(interaction, client) {
    const messageId = interaction.options.getString('message_id').trim();
    if (!client.giveaways.has(messageId)) {
      return interaction.reply({
        content: '❌ ما لقيت قيف أواي بهذا الآيدي.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.reply({
      content: '✅ جاري إنهاء القيف أواي...',
      flags: MessageFlags.Ephemeral,
    });
    await endGiveaway(client, messageId);
  },
};
