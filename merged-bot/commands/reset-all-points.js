const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reset-all-points')
    .setDescription('إعادة تعيين نقاط جميع الأعضاء إلى 0')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    for (const key of client.invitePoints.keys()) {
      client.invitePoints.set(key, 0);
    }
    await interaction.reply({ content: '✅ تم إعادة تعيين نقاط جميع الأعضاء إلى 0.', ephemeral: true });
  }
};
