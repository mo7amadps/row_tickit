const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { createGiveawayModal } = require('../utils/giveawayHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('بدء قيف أواي جديد')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.showModal(createGiveawayModal());
  },
};
