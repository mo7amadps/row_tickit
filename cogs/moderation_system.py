import asyncio

import discord
from discord import app_commands
from discord.ext import commands

from utils.storage import Storage
from utils.checks import has_role, can_target, bot_missing_permissions
from utils.embeds import branded_embed


class WarningSelect(discord.ui.Select):
    def __init__(self, cog: "ModerationSystem", ctx: commands.Context, target: discord.Member, warnings: list):
        self.cog = cog
        self.ctx = ctx
        self.target = target
        options = []
        for i, w in enumerate(warnings, start=1):
            reason = w["reason"] if len(w["reason"]) <= 90 else w["reason"][:87] + "..."
            options.append(discord.SelectOption(label=f"تحذير #{i}", description=reason, value=w["id"]))
        super().__init__(placeholder="اختر التحذير يلي بدك تشيله", options=options, min_values=1, max_values=1)

    async def callback(self, interaction: discord.Interaction):
        if interaction.user.id != self.ctx.author.id:
            await interaction.response.send_message("هاد الأمر مو إلك.", ephemeral=True)
            return

        warning_id = self.values[0]
        removed = await Storage.remove_warning(self.ctx.guild.id, self.target.id, warning_id)
        if not removed:
            await interaction.response.edit_message(content="❌ ما لقيت هاد التحذير، ممكن كان انشال قبل هيك.", embed=None, view=None)
            return

        await interaction.response.edit_message(
            content=f"✅ تم شيل التحذير عن {self.target.mention}", embed=None, view=None
        )
        await self.cog.send_log(self.ctx.guild, "moderation", {
            "العملية": "🧹 شيل تحذير",
            "بواسطة": self.ctx.author.mention,
            "الهدف": self.target.mention,
        })


class WarningRemoveView(discord.ui.View):
    def __init__(self, cog: "ModerationSystem", ctx: commands.Context, target: discord.Member, warnings: list):
        super().__init__(timeout=60)
        self.add_item(WarningSelect(cog, ctx, target, warnings))


class ModerationSystem(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    async def send_log(self, guild: discord.Guild, section: str, fields: dict):
        conf = await Storage.get_guild(guild.id)
        channel_id = conf[section].get("log_channel_id")
        if not channel_id:
            return
        channel = guild.get_channel(channel_id)
        if not channel:
            return
        embed = branded_embed(title="📋 سجل", color=discord.Color.blue(), timestamp=discord.utils.utcnow())
        for name, value in fields.items():
            embed.add_field(name=name, value=str(value), inline=False)
        try:
            await channel.send(embed=embed)
        except discord.Forbidden:
            pass

    async def _check_permission(self, ctx: commands.Context) -> bool:
        conf = await Storage.get_guild(ctx.guild.id)
        m = conf["moderation"]
        if not m["allowed_role_id"]:
            await ctx.reply("❌ النظام ما تم إعداده لسا. استخدم `/set-up-moderation` أول.")
            return False
        if not has_role(ctx.author, m["allowed_role_id"]) and ctx.author.id != ctx.guild.owner_id:
            await ctx.reply("❌ ما معك صلاحية تستخدم هاد الأمر.")
            return False
        return True

    # ---------------- /set-up-moderation ----------------
    # سيت اب واحد مشترك لأربع أوامر: $نك / $تحذير / $شيل / $rar
    # (أمر $ان إله سيت اب خاص فيه أصلاً وهو /set-up-time، ما لمسناه)

    @app_commands.command(name="set-up-moderation", description="إعداد نظام النك/التحذير/شيل التحذير/rar")
    @app_commands.describe(
        allowed_role="مين مسموحله يستخدم $نك و $تحذير و $شيل و $rar",
        log_channel="قناة اللوق",
    )
    @app_commands.guild_only()
    @app_commands.checks.has_permissions(administrator=True)
    async def set_up_moderation(
        self, interaction: discord.Interaction, allowed_role: discord.Role, log_channel: discord.TextChannel
    ):
        await Storage.update_guild(interaction.guild.id, "moderation", {
            "allowed_role_id": allowed_role.id,
            "log_channel_id": log_channel.id,
        })
        embed = branded_embed(title="✅ تم إعداد نظام المودريشن", color=discord.Color.green())
        embed.add_field(name="مين مسموح", value=allowed_role.mention)
        embed.add_field(name="قناة اللوق", value=log_channel.mention)
        embed.add_field(
            name="بيشمل",
            value="`$نك` / `$تحذير` / `$شيل` / `$rar`",
            inline=False,
        )
        await interaction.response.send_message(embed=embed, ephemeral=True)

    @set_up_moderation.error
    async def set_up_moderation_error(self, interaction: discord.Interaction, error):
        if isinstance(error, app_commands.MissingPermissions):
            await interaction.response.send_message("❌ لازم تكون أدمن حتى تستخدم هاد الأمر.", ephemeral=True)

    # ---------------- $نك ----------------

    @commands.command(name="نك")
    @commands.guild_only()
    @commands.cooldown(1, 3, commands.BucketType.user)
    async def nick_cmd(self, ctx: commands.Context, member: discord.Member = None, *, nickname: str = None):
        if member is None:
            await ctx.reply("استخدم الأمر هيك: `$نك @شخص الاسم_الجديد`")
            return
        if not await self._check_permission(ctx):
            return

        ok, msg = can_target(ctx.author, member)
        if not ok:
            await ctx.reply(f"❌ {msg}")
            return

        if nickname is not None and len(nickname) > 32:
            await ctx.reply("❌ الاسم طويل كتير، أقصى شي 32 حرف.")
            return

        missing = bot_missing_permissions(ctx.guild, "manage_nicknames")
        if missing:
            await ctx.reply(f"❌ البوت ما معه صلاحية كافية: {', '.join(missing)}")
            return

        try:
            await member.edit(nick=nickname, reason=f"تغيير نك بواسطة {ctx.author}")
        except discord.Forbidden:
            await ctx.reply("❌ ما قدرت أغيّر الاسم، تأكد إنه رتبة البوت أعلى من رتبته.")
            return

        result = nickname if nickname else "(تم رجّع الاسم الأصلي)"
        await ctx.reply(f"✅ تم تغيير اسم {member.mention} داخل السيرفر إلى: {result}")

        await self.send_log(ctx.guild, "moderation", {
            "العملية": "📝 تغيير نك",
            "بواسطة": ctx.author.mention,
            "الهدف": member.mention,
            "الاسم الجديد": result,
        })

    @nick_cmd.error
    async def nick_cmd_error(self, ctx: commands.Context, error):
        if isinstance(error, commands.CommandOnCooldown):
            await ctx.reply(f"⏳ استنى {error.retry_after:.0f} ثانية.")
        elif isinstance(error, commands.MemberNotFound):
            await ctx.reply("❌ ما لقيت هاد الشخص، تأكد من المنشن.")

    # ---------------- $تحذير ----------------

    @commands.command(name="تحذير")
    @commands.guild_only()
    @commands.cooldown(1, 3, commands.BucketType.user)
    async def warn_cmd(self, ctx: commands.Context, member: discord.Member = None):
        if member is None:
            await ctx.reply("استخدم الأمر هيك: `$تحذير @شخص`")
            return
        if not await self._check_permission(ctx):
            return

        ok, msg = can_target(ctx.author, member)
        if not ok:
            await ctx.reply(f"❌ {msg}")
            return

        await ctx.reply(f"✍️ طيب، اكتب سبب تحذير {member.mention} برسالة جديدة (عندك 90 ثانية).")

        def check(m: discord.Message):
            return m.author.id == ctx.author.id and m.channel.id == ctx.channel.id

        try:
            reason_msg = await self.bot.wait_for("message", check=check, timeout=90)
        except asyncio.TimeoutError:
            await ctx.reply("⌛ خلصت المهلة، أعد الأمر من جديد.")
            return

        reason = reason_msg.content.strip()
        if not reason:
            await ctx.reply("❌ لازم تكتب سبب فعلي (نص).")
            return

        await Storage.add_warning(ctx.guild.id, member.id, reason, ctx.author.id)

        try:
            dm_embed = branded_embed(title="⚠️ استلمت تحذير", color=discord.Color.orange())
            dm_embed.add_field(name="السبب", value=reason, inline=False)
            await member.send(embed=dm_embed)
        except discord.Forbidden:
            pass

        await ctx.reply(f"✅ تم تحذير {member.mention}\nالسبب: {reason}")

        await self.send_log(ctx.guild, "moderation", {
            "العملية": "⚠️ تحذير",
            "بواسطة": ctx.author.mention,
            "الهدف": member.mention,
            "السبب": reason,
        })

    @warn_cmd.error
    async def warn_cmd_error(self, ctx: commands.Context, error):
        if isinstance(error, commands.CommandOnCooldown):
            await ctx.reply(f"⏳ استنى {error.retry_after:.0f} ثانية.")
        elif isinstance(error, commands.MemberNotFound):
            await ctx.reply("❌ ما لقيت هاد الشخص، تأكد من المنشن.")

    # ---------------- $شيل ----------------

    @commands.command(name="شيل")
    @commands.guild_only()
    async def unwarn_cmd(self, ctx: commands.Context, member: discord.Member = None):
        if member is None:
            await ctx.reply("استخدم الأمر هيك: `$شيل @شخص`")
            return
        if not await self._check_permission(ctx):
            return

        warnings = await Storage.get_warnings(ctx.guild.id, member.id)
        if not warnings:
            await ctx.reply(f"ℹ️ هاد الشخص لا يمتلك تحذيرات.")
            return

        embed = branded_embed(
            title="🧹 شيل تحذير",
            description=f"الشخص: {member.mention}\nعنده {len(warnings)} تحذير. اختر وحدة تحت 👇",
            color=discord.Color.orange(),
        )
        for i, w in enumerate(warnings, start=1):
            embed.add_field(name=f"تحذير #{i}", value=w["reason"][:200], inline=False)

        await ctx.reply(embed=embed, view=WarningRemoveView(self, ctx, member, warnings))

    @unwarn_cmd.error
    async def unwarn_cmd_error(self, ctx: commands.Context, error):
        if isinstance(error, commands.MemberNotFound):
            await ctx.reply("❌ ما لقيت هاد الشخص، تأكد من المنشن.")

    # ---------------- $rar (شيل كل الرتب) ----------------

    @commands.command(name="rar")
    @commands.guild_only()
    @commands.cooldown(1, 2, commands.BucketType.user)
    async def rar_cmd(self, ctx: commands.Context, member: discord.Member = None):
        if member is None:
            await ctx.reply("استخدم الأمر هيك: `$rar @شخص`")
            return
        if not await self._check_permission(ctx):
            return

        ok, msg = can_target(ctx.author, member)
        if not ok:
            await ctx.reply(f"❌ {msg}")
            return

        missing = bot_missing_permissions(ctx.guild, "manage_roles")
        if missing:
            await ctx.reply(f"❌ البوت ما معه صلاحية كافية: {', '.join(missing)}")
            return

        bot_top_position = ctx.guild.me.top_role.position
        # نحسب مرة وحدة بس الرتب يلي فعلاً منقدر نشيلها (تحت رتبة البوت وغير مُدارة)
        # ونعمل نداء وحيد لـ edit(roles=...) بدل ما نلف على كل رتبة لحالها - هاد يلي بيخليها سريعة جداً
        keep_roles = [r for r in member.roles if r.managed or r.position >= bot_top_position]

        if len(keep_roles) == len(member.roles):
            await ctx.reply("ℹ️ هاد الشخص ما عنده أي رتب فيني أشيلها.")
            return

        try:
            await member.edit(roles=keep_roles, reason=f"شيل كل الرتب بواسطة {ctx.author}")
        except discord.Forbidden:
            await ctx.reply("❌ ما قدرت أشيل الرتب، تأكد إنه رتبة البوت أعلى من رتب الشخص.")
            return

        await ctx.reply(f"✅ تم شيل كل رتب {member.mention}")

        await self.send_log(ctx.guild, "moderation", {
            "العملية": "🗑️ شيل كل الرتب (rar)",
            "بواسطة": ctx.author.mention,
            "الهدف": member.mention,
        })

    @rar_cmd.error
    async def rar_cmd_error(self, ctx: commands.Context, error):
        if isinstance(error, commands.CommandOnCooldown):
            await ctx.reply(f"⏳ استنى {error.retry_after:.0f} ثانية.")
        elif isinstance(error, commands.MemberNotFound):
            await ctx.reply("❌ ما لقيت هاد الشخص، تأكد من المنشن.")


async def setup(bot: commands.Bot):
    await bot.add_cog(ModerationSystem(bot))
