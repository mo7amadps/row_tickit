const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add-points')
    .setDescription('إضافة نقاط لعضو')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(opt =>
      opt.setName('user').setDescription('العضو المراد إضافة نقاط له').setRequired(true))
    .addIntegerOption(opt =>
      opt.setName('amount').setDescription('عدد النقاط المراد إضافتها').setRequired(true).setMinValue(1)),

  async execute(interaction, client) {
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const currentPoints = client.invitePoints.get(target.id) || 0;
    client.invitePoints.set(target.id, currentPoints + amount);
    await interaction.reply({ content: `✅ تم إضافة ${amount} نقطة لـ <@${target.id}>. نقاطه الآن: ${currentPoints + amount}`, ephemeral: true });
  }
};
