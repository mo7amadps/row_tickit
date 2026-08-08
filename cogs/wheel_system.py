"""
نظام عجلة الحظ + نقاط الدعوات (مدموج من البوت التاني - JS - وتم تحويله لنفس أسلوب هاد البوت).

الفكرة:
- كل ما حد يدعو عضو جديد فعلي (حساب مو جديد/وهمي، وما دخل السيرفر قبل هيك) بياخذ نقطة.
- بالنقاط بيقدر يلف عجلة الحظ (عادية = نقطة وحدة، سوبر = نقطتين) وياخذ جايزة عشوائية.
- /set-up-rooms بيحدد وين ينشر سجل الدعوات ووين ينشر إعلان الجوائز.
"""

import random

import discord
from discord import app_commands
from discord.ext import commands

from utils.storage import Storage
from utils.embeds import branded_embed

# أقل عمر مسموح للحساب حتى يُحسب لصاحب الدعوة (أسبوعين ونص)
MIN_ACCOUNT_AGE_DAYS = 17.5

PRIZES = {
    "normal": [
        ("200k", 50),
        ("500k", 20),
        ("750k", 1),
        ("1M", 0.1),
        ("10M", 0.00001),
    ],
    "super": [
        ("200k", 50),
        ("300k", 30),
        ("400k", 7),
        ("10M", 0.01),
        ("8M", 0.00001),
        ("5M", 0.00001),
        ("2M", 0.00001),
        ("1M", 0.000000001),
    ],
}


def get_random_prize(kind: str) -> str:
    items = PRIZES[kind]
    total = sum(chance for _, chance in items)
    roll = random.random() * total
    cumulative = 0.0
    for prize, chance in items:
        cumulative += chance
        if roll <= cumulative:
            return prize
    return items[-1][0]


class WheelView(discord.ui.View):
    """أزرار عجلة الحظ - View دائم (persistent) يفضل شغال حتى بعد إعادة تشغيل البوت."""

    def __init__(self, cog: "WheelSystem"):
        super().__init__(timeout=None)
        self.cog = cog

    @discord.ui.button(label="لف العجلة العادية", style=discord.ButtonStyle.primary, custom_id="wheel:normal_spin")
    async def normal_spin(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.cog.handle_spin(interaction, "normal", cost=1)

    @discord.ui.button(label="لف العجلة السوبر", style=discord.ButtonStyle.danger, custom_id="wheel:super_spin")
    async def super_spin(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.cog.handle_spin(interaction, "super", cost=2)


class WheelSystem(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self.invites_cache: dict[int, dict[str, int]] = {}  # {guild_id: {invite_code: uses}}

    async def cog_load(self):
        # نسجل الـ View كـ persistent حتى تشتغل الأزرار حتى بعد ريستارت البوت
        self.bot.add_view(WheelView(self))

    # ---------------- نقاط العجلة ----------------

    async def get_points(self, guild_id: int, user_id: int) -> int:
        conf = await Storage.get_guild(guild_id)
        return conf["wheel"]["points"].get(str(user_id), 0)

    async def set_points(self, guild_id: int, user_id: int, amount: int):
        conf = await Storage.get_guild(guild_id)
        points = dict(conf["wheel"]["points"])
        points[str(user_id)] = max(0, amount)
        await Storage.update_guild(guild_id, "wheel", {"points": points})

    async def add_points(self, guild_id: int, user_id: int, amount: int) -> int:
        current = await self.get_points(guild_id, user_id)
        new_amount = current + amount
        await self.set_points(guild_id, user_id, new_amount)
        return new_amount

    # ---------------- كاش الدعوات ----------------

    @commands.Cog.listener()
    async def on_ready(self):
        for guild in self.bot.guilds:
            await self._cache_invites(guild)

    @commands.Cog.listener()
    async def on_guild_join(self, guild: discord.Guild):
        await self._cache_invites(guild)

    async def _cache_invites(self, guild: discord.Guild):
        try:
            guild_invites = await guild.invites()
        except discord.Forbidden:
            self.invites_cache[guild.id] = {}
            return
        self.invites_cache[guild.id] = {inv.code: inv.uses or 0 for inv in guild_invites}

    # ---------------- تتبع الدعوات عند دخول عضو جديد ----------------

    @commands.Cog.listener()
    async def on_member_join(self, member: discord.Member):
        if member.bot:
            return

        guild = member.guild
        conf = await Storage.get_guild(guild.id)
        wheel_cfg = conf["wheel"]
        invite_room_id = wheel_cfg.get("invite_room_id")
        channel = guild.get_channel(invite_room_id) if invite_room_id else None

        try:
            new_invites = await guild.invites()
        except discord.Forbidden:
            return

        old_cache = self.invites_cache.get(guild.id, {})
        used_invite = None
        for invite in new_invites:
            old_uses = old_cache.get(invite.code, 0)
            if (invite.uses or 0) > old_uses:
                used_invite = invite
                break

        self.invites_cache[guild.id] = {inv.code: inv.uses or 0 for inv in new_invites}

        if not used_invite or not used_invite.inviter:
            return

        inviter = used_invite.inviter
        seen_members = dict(wheel_cfg.get("seen_members", {}))

        # 1) هل العضو سبق ودخل السيرفر من قبل؟ => ما يُحسب
        if str(member.id) in seen_members:
            if channel:
                await channel.send(
                    f"⚠️ <@{inviter.id}> هذا العضو <@{member.id}> سبق دخل السيرفر من قبل، لن تحصل على نقاط."
                )
            return

        # نسجل العضو كـ "شوفناه" فوراً حتى لو ما احتسبنا له نقطة
        seen_members[str(member.id)] = True
        await Storage.update_guild(guild.id, "wheel", {"seen_members": seen_members})

        # 2) هل عمر حساب العضو أقل من أسبوعين ونص؟ (حساب وهمي/جديد) => ما يُحسب
        account_age_days = (discord.utils.utcnow() - member.created_at).total_seconds() / 86400
        if account_age_days < MIN_ACCOUNT_AGE_DAYS:
            if channel:
                await channel.send(
                    f"⚠️ <@{inviter.id}> حساب العضو <@{member.id}> عمره أقل من أسبوعين ونص "
                    f"(حساب جديد/مشتبه به)، لن تحصل على نقاط."
                )
            return

        new_total = await self.add_points(guild.id, inviter.id, 1)
        if channel:
            await channel.send(f"✅ <@{inviter.id}> دعوت <@{member.id}> إلى السيرفر! نقاطك الآن: {new_total} 🔥")

    # ---------------- /set-up-rooms ----------------

    @app_commands.command(name="set-up-rooms", description="تحديد قناة جوائز العجلة وقناة سجل الدعوات")
    @app_commands.describe(
        prize_room="القناة يلي بينشر فيها إعلان جوائز العجلة",
        invite_room="القناة يلي بينشر فيها سجل الدعوات ونقاطها",
    )
    @app_commands.guild_only()
    @app_commands.checks.has_permissions(administrator=True)
    async def set_up_rooms(
        self,
        interaction: discord.Interaction,
        prize_room: discord.TextChannel,
        invite_room: discord.TextChannel,
    ):
        await Storage.update_guild(interaction.guild.id, "wheel", {
            "prize_room_id": prize_room.id,
            "invite_room_id": invite_room.id,
        })
        embed = branded_embed(title="✅ تم إعداد قنوات العجلة والدعوات", color=discord.Color.green())
        embed.add_field(name="🏆 قناة الجوائز", value=prize_room.mention, inline=False)
        embed.add_field(name="📨 قناة الدعوات", value=invite_room.mention, inline=False)
        await interaction.response.send_message(embed=embed, ephemeral=True)

    @set_up_rooms.error
    async def set_up_rooms_error(self, interaction: discord.Interaction, error):
        if isinstance(error, app_commands.MissingPermissions):
            await interaction.response.send_message("❌ لازم تكون أدمن حتى تستخدم هاد الأمر.", ephemeral=True)

    # ---------------- إدارة نقاط العجلة (أدمن) ----------------

    @app_commands.command(name="اضافة-نقاط", description="إضافة نقاط عجلة لعضو")
    @app_commands.describe(member="العضو المراد إضافة نقاط له", amount="عدد النقاط")
    @app_commands.guild_only()
    @app_commands.checks.has_permissions(administrator=True)
    async def add_points_cmd(
        self, interaction: discord.Interaction, member: discord.Member, amount: app_commands.Range[int, 1]
    ):
        new_total = await self.add_points(interaction.guild.id, member.id, amount)
        await interaction.response.send_message(
            f"✅ تم إضافة {amount} نقطة لـ {member.mention}. نقاطه الآن: {new_total}", ephemeral=True
        )

    @add_points_cmd.error
    async def add_points_cmd_error(self, interaction: discord.Interaction, error):
        if isinstance(error, app_commands.MissingPermissions):
            await interaction.response.send_message("❌ لازم تكون أدمن حتى تستخدم هاد الأمر.", ephemeral=True)

    @app_commands.command(name="تصفير-نقاط", description="إعادة تعيين نقاط عجلة عضو إلى صفر")
    @app_commands.describe(member="العضو المراد تصفير نقاطه")
    @app_commands.guild_only()
    @app_commands.checks.has_permissions(administrator=True)
    async def reset_points_cmd(self, interaction: discord.Interaction, member: discord.Member):
        await self.set_points(interaction.guild.id, member.id, 0)
        await interaction.response.send_message(f"✅ تم إعادة تعيين نقاط {member.mention} إلى 0.", ephemeral=True)

    @reset_points_cmd.error
    async def reset_points_cmd_error(self, interaction: discord.Interaction, error):
        if isinstance(error, app_commands.MissingPermissions):
            await interaction.response.send_message("❌ لازم تكون أدمن حتى تستخدم هاد الأمر.", ephemeral=True)

    @app_commands.command(name="تصفير-كل-النقاط", description="إعادة تعيين نقاط عجلة جميع الأعضاء إلى صفر")
    @app_commands.guild_only()
    @app_commands.checks.has_permissions(administrator=True)
    async def reset_all_points_cmd(self, interaction: discord.Interaction):
        conf = await Storage.get_guild(interaction.guild.id)
        points = {uid: 0 for uid in conf["wheel"]["points"]}
        await Storage.update_guild(interaction.guild.id, "wheel", {"points": points})
        await interaction.response.send_message("✅ تم إعادة تعيين نقاط جميع الأعضاء إلى 0.", ephemeral=True)

    @reset_all_points_cmd.error
    async def reset_all_points_cmd_error(self, interaction: discord.Interaction, error):
        if isinstance(error, app_commands.MissingPermissions):
            await interaction.response.send_message("❌ لازم تكون أدمن حتى تستخدم هاد الأمر.", ephemeral=True)

    # ---------------- +points / +spin (نفس أوامر البوت القديم بالنص) ----------------

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        if message.author.bot or message.guild is None:
            return

        if message.content.startswith("+points"):
            member = message.mentions[0] if message.mentions else message.author
            points = await self.get_points(message.guild.id, member.id)
            await message.reply(f"📊 نقاط {member.mention}: {points}")
            return

        if message.content == "+spin":
            await self._send_spin_menu(message.channel, message.author, reply_to=message)

    async def _send_spin_menu(self, channel: discord.abc.Messageable, user: discord.Member, reply_to=None):
        points = await self.get_points(user.guild.id, user.id)
        if points < 1:
            text = "❌ تحتاج على الأقل إلى 1 نقطة دعوة لاستخدام عجلة الحظ العادية!"
            if reply_to:
                await reply_to.reply(text)
            else:
                await channel.send(text)
            return

        embed = branded_embed(
            title="🎉 لعبة عجلة الحظ 🎉",
            description="اختر نوع العجلة التي تريد اللعب بها:",
            color=discord.Color.blue(),
        )
        embed.add_field(name="🎡 عجلة الحظ العادية", value="يتطلب 1 نقطة", inline=False)
        embed.add_field(name="🔥 عجلة الحظ السوبر", value="يتطلب 2 نقاط", inline=False)
        embed.add_field(name="نقاطك الحالية", value=str(points), inline=False)

        if reply_to:
            await reply_to.reply(embed=embed, view=WheelView(self))
        else:
            await channel.send(embed=embed, view=WheelView(self))

    async def handle_spin(self, interaction: discord.Interaction, kind: str, cost: int):
        if interaction.guild is None:
            return

        guild_id = interaction.guild.id
        current_points = await self.get_points(guild_id, interaction.user.id)
        if current_points < cost:
            await interaction.response.send_message("❌ ليس لديك نقاط كافية.", ephemeral=True)
            return

        await self.add_points(guild_id, interaction.user.id, -cost)
        prize = get_random_prize(kind)

        conf = await Storage.get_guild(guild_id)
        prize_room_id = conf["wheel"].get("prize_room_id")
        prize_channel = interaction.guild.get_channel(prize_room_id) if prize_room_id else None

        await interaction.response.send_message(
            f"🎉 مبروك {interaction.user.mention}! لقد فزت بـ **{prize}**! 🏆"
        )
        if prize_channel:
            try:
                await prize_channel.send(f"> 🥳 مبروك {interaction.user.mention}! لقد فزت بـ **{prize}** 🏆")
            except discord.Forbidden:
                pass


async def setup(bot: commands.Bot):
    await bot.add_cog(WheelSystem(bot))
