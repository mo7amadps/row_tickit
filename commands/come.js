const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('come')
    .setDescription('استدعاء شخص إلى التذكرة')
    .addUserOption(opt =>
      opt.setName('user').setDescription('المستخدم المراد استدعاؤه').setRequired(true)),

  async execute(interaction, client) {
    const ticket = client.openTickets.get(interaction.channelId);
    if (!ticket) {
      return interaction.reply({ content: '❌ هذا الشانل ليس تذكرة!', ephemeral: true });
    }

    const settings = client.ticketSettings.get(ticket.ticketNum) || {};
    if (settings.ownership === 'no') {
      return interaction.reply({ content: '❌ خاصية الاستدعاء معطلة في هذه التذكرة.', ephemeral: true });
    }

    const targetUser = interaction.options.getUser('user');
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) return interaction.reply({ content: '❌ المستخدم غير موجود.', ephemeral: true });

    await interaction.channel.permissionOverwrites.edit(member.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });

    await interaction.reply({
      content: `✅ تم استدعاء ${member} إلى التذكرة.`,
    });
  }
};
