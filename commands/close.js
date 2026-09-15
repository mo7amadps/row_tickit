const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('إغلاق التذكرة الحالية'),

  async execute(interaction, client) {
    const ticket = client.openTickets.get(interaction.channelId);
    if (!ticket) {
      return interaction.reply({ content: '❌ هذا الشانل ليس تذكرة!', ephemeral: true });
    }

    const settings = client.ticketSettings.get(ticket.ticketNum) || {};

    await interaction.reply({ content: '🔒 جاري إغلاق التذكرة...' });

    // Move to close category if set
    if (settings.close_category) {
      try {
        await interaction.channel.setParent(settings.close_category, { lockPermissions: false });
      } catch (e) { console.error(e); }
    }

    // Remove user access
    try {
      await interaction.channel.permissionOverwrites.edit(ticket.userId, {
        ViewChannel: false,
        SendMessages: false,
      });
    } catch (e) { console.error(e); }

    // Log if set
    if (settings.ticket_logs) {
      const logsChannel = interaction.guild.channels.cache.get(settings.ticket_logs);
      if (logsChannel) {
        await logsChannel.send({
          embeds: [{
            title: '🔒 تذكرة مغلقة',
            description: `**التذكرة:** ${interaction.channel.name}\n**أُغلقت بواسطة:** ${interaction.user.tag}`,
            color: 0xED4245,
            timestamp: new Date(),
          }]
        });
      }
    }

    // Send to tqeem room if set
    if (settings.tqeem_room) {
      const tqeemChannel = interaction.guild.channels.cache.get(settings.tqeem_room);
      if (tqeemChannel) {
        const user = await interaction.guild.members.fetch(ticket.userId).catch(() => null);
        if (user) {
          await tqeemChannel.send({
            content: `${user}`,
            embeds: [{
              title: '⭐ تقييم الدعم',
              description: 'كيف كانت تجربتك معنا؟ قيّم الدعم من 1 إلى 5',
              color: 0xFEE75C,
            }]
          });
        }
      }
    }

    client.openTickets.delete(interaction.channelId);

    setTimeout(async () => {
      try { await interaction.channel.delete(); } catch (e) { }
    }, 5000);
  }
};
