const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('come')
    .setDescription('استدعاء شخص إلى التذكرة')
    .addUserOption(opt =>
      opt.setName('user').setDescription('المستخدم المراد استدعاؤه').setRequired(true)),

  async execute(interaction, client) {
    const ticket = client.openTickets.get(interaction.channelId);
    if (!ticket) {
      return interaction.reply({ content: '❌ هذا الشانل ليس تذكرة!', flags: MessageFlags.Ephemeral });
    }

    const settings = client.ticketSettings.get(ticket.ticketNum) || {};
    if (settings.ownership === 'no') {
      return interaction.reply({ content: '❌ خاصية الاستدعاء معطلة في هذه التذكرة.', flags: MessageFlags.Ephemeral });
    }

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const hasAdmin = settings.admin && member?.roles.cache.has(settings.admin);
    const isClaimer = ticket.claimedBy === interaction.user.id;
    const isOwner = interaction.guild.ownerId === interaction.user.id;
    if (!hasAdmin && !isClaimer && !isOwner) {
      return interaction.reply({
        content: '❌ بس مستلم التذكرة أو الإداريين يقدرون يستدعوا أعضاء.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetUser = interaction.options.getUser('user');
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) return interaction.reply({ content: '❌ المستخدم غير موجود.', flags: MessageFlags.Ephemeral });

    await interaction.channel.permissionOverwrites.edit(targetMember.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });

    await interaction.reply({
      content: `✅ تم استدعاء ${targetMember} إلى التذكرة.`,
    });
  }
};
