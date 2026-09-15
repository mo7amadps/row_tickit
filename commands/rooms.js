const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rooms')
    .setDescription('ضبط روم الجوائز وروم الدعوات (الانفايت)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(opt =>
      opt.setName('prize-room')
        .setDescription('الروم اللي تنزل فيه رسائل الفوز بالجوائز (عجلة الحظ)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText))
    .addChannelOption(opt =>
      opt.setName('invite-room')
        .setDescription('الروم اللي تنزل فيه رسائل تسجيل الدعوات (الانفايت)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)),

  async execute(interaction, client) {
    const guildId = interaction.guild.id;
    const existing = client.roomsSettings.get(guildId) || {};

    const prizeRoom = interaction.options.getChannel('prize-room');
    const inviteRoom = interaction.options.getChannel('invite-room');

    const updated = { ...existing };
    if (prizeRoom) updated.prizeRoomId = prizeRoom.id;
    if (inviteRoom) updated.inviteRoomId = inviteRoom.id;

    if (prizeRoom || inviteRoom) {
      client.roomsSettings.set(guildId, updated);
    }

    const lines = [];
    lines.push(`🏆 روم الجوائز: ${updated.prizeRoomId ? `<#${updated.prizeRoomId}>` : 'غير محدد'}`);
    lines.push(`📨 روم الدعوات (الانفايت): ${updated.inviteRoomId ? `<#${updated.inviteRoomId}>` : 'غير محدد'}`);

    await interaction.reply({
      embeds: [{
        title: '⚙️ إعدادات الرومات',
        description: lines.join('\n') + '\n\n💾 هذي الإعدادات محفوظة وما تنمسح لو البوت طفا أو انعمل له ريستارت.',
        color: 0x5865F2,
      }],
      ephemeral: true
    });
  }
};
