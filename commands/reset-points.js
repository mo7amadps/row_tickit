const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reset-points')
    .setDescription('إعادة تعيين نقاط عضو إلى 0')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(opt =>
      opt.setName('user').setDescription('العضو المراد إعادة تعيين نقاطه').setRequired(true)),

  async execute(interaction, client) {
    const target = interaction.options.getUser('user');
    client.invitePoints.set(target.id, 0);
    await interaction.reply({ content: `✅ تم إعادة تعيين نقاط <@${target.id}> إلى 0.`, ephemeral: true });
  }
};
