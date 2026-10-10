const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { closeTicket } = require('../utils/ticketHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('إغلاق التذكرة الحالية'),

  async execute(interaction, client) {
    const ticket = client.openTickets.get(interaction.channelId);
    if (!ticket) {
      return interaction.reply({ content: '❌ هذا الشانل ليس تذكرة!', flags: MessageFlags.Ephemeral });
    }

    const settings = client.ticketSettings.get(ticket.ticketNum) || {};
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const hasAdmin = settings.admin && member?.roles.cache.has(settings.admin);
    const isClaimer = ticket.claimedBy === interaction.user.id;
    const isOwner = interaction.guild.ownerId === interaction.user.id;
    if (!hasAdmin && !isClaimer && !isOwner) {
      return interaction.reply({
        content: '❌ بس مستلم التذكرة أو الإداري يقدر يسكرها!',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.reply({ content: '🔒 جاري إغلاق التذكرة...' });
    await closeTicket(interaction, client, ticket, settings, 0);
  }
};
